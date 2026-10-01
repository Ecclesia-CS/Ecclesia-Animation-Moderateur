-- ════════════════════════════════════════════════════════════════════════════
-- Chantier 93 — Identité du participant (fusionne 55, 81, 82)
--
-- Décisions de Jules (2026-09-16 / 2026-09-18) :
--  · un code de rappel est remis à TOUTE première inscription, quelle que soit
--    la phase (avant : pre_voting seulement, et tiré côté navigateur) ;
--  · la reconnexion exige TOUJOURS le pseudo ET le code — le pseudo seul ne
--    prouve plus rien (c'est le nom+prénom réel, connu de toute la séance) ;
--  · le code est stocké HACHÉ (bcrypt). Il n'est lisible qu'une fois, à sa
--    création. Perdu = régénéré par le superadmin, ou par le modérateur de la
--    table du membre pendant le débat ;
--  · unicité du code à l'intérieur d'une séance ;
--  · 10 échecs sur un même couple (séance, pseudo) → blocage d'une minute ;
--  · le pseudo devient modifiable, et le renommage se propage aux deux copies
--    (participants.pseudo, session_sources.pseudo) ;
--  · après la clôture personne n'a besoin de se reconnecter : la purge du
--    chantier 49 reste, portée sur la nouvelle colonne.
--
-- ⚠️ Les branches « mauvais code » ne RAISE pas : elles renvoient
--    {"error": "..."}. Un RAISE annulerait la transaction, donc le compteur de
--    tentatives avec — le blocage serait inopérant.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Colonne hachée ───────────────────────────────────────────────────────

ALTER TABLE public.session_members
  ADD COLUMN IF NOT EXISTS reclaim_code_hash text;

-- Les membres déjà inscrits gardent leur code : on hache l'existant.
UPDATE public.session_members
SET reclaim_code_hash = extensions.crypt(reclaim_code, extensions.gen_salt('bf'))
WHERE reclaim_code IS NOT NULL
  AND reclaim_code_hash IS NULL;

ALTER TABLE public.session_members DROP COLUMN IF EXISTS reclaim_code;

-- ── 2. Tirage d'un code unique dans la séance ───────────────────────────────

CREATE OR REPLACE FUNCTION public.gen_member_reclaim_code(p_session_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_candidate text;
  v_try       int := 0;
BEGIN
  LOOP
    v_try := v_try + 1;
    v_candidate := lpad((floor(random() * 10000))::int::text, 4, '0');

    IF NOT EXISTS (
      SELECT 1 FROM session_members sm
      WHERE sm.session_id = p_session_id
        AND sm.reclaim_code_hash IS NOT NULL
        AND crypt(v_candidate, sm.reclaim_code_hash) = sm.reclaim_code_hash
    ) THEN
      RETURN v_candidate;
    END IF;

    IF v_try >= 200 THEN
      RAISE EXCEPTION 'Impossible de générer un code de rappel unique pour cette séance';
    END IF;
  END LOOP;
END;
$$;

-- ── 3. Compteur de tentatives (10 échecs → 1 minute de blocage) ─────────────

CREATE TABLE IF NOT EXISTS public.reclaim_attempts (
  session_id   uuid        NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  pseudo       text        NOT NULL,
  fail_count   int         NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz,
  PRIMARY KEY (session_id, pseudo)
);

-- Aucune policy : table lue et écrite uniquement par des SECURITY DEFINER.
ALTER TABLE public.reclaim_attempts ENABLE ROW LEVEL SECURITY;

-- Renvoie NULL si la voie est libre, sinon le message de refus.
CREATE OR REPLACE FUNCTION public.reclaim_block_reason(p_session_id uuid, p_pseudo text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN ra.blocked_until IS NOT NULL AND ra.blocked_until > now()
    THEN 'Trop de tentatives. Réessaie dans '
         || GREATEST(1, ceil(extract(epoch FROM ra.blocked_until - now()))::int)::text
         || ' secondes.'
    ELSE NULL
  END
  FROM reclaim_attempts ra
  WHERE ra.session_id = p_session_id AND ra.pseudo = p_pseudo;
$$;

CREATE OR REPLACE FUNCTION public.record_reclaim_failure(p_session_id uuid, p_pseudo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO reclaim_attempts (session_id, pseudo, fail_count, window_start)
  VALUES (p_session_id, p_pseudo, 1, now())
  ON CONFLICT (session_id, pseudo) DO UPDATE
  SET fail_count = CASE
        WHEN reclaim_attempts.window_start < now() - interval '1 minute' THEN 1
        ELSE reclaim_attempts.fail_count + 1
      END,
      window_start = CASE
        WHEN reclaim_attempts.window_start < now() - interval '1 minute' THEN now()
        ELSE reclaim_attempts.window_start
      END;

  UPDATE reclaim_attempts
  SET blocked_until = now() + interval '1 minute',
      fail_count    = 0,
      window_start  = now()
  WHERE session_id = p_session_id AND pseudo = p_pseudo AND fail_count >= 10;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_reclaim_attempts(p_session_id uuid, p_pseudo text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM reclaim_attempts WHERE session_id = p_session_id AND pseudo = p_pseudo;
$$;

-- ── 4. Inscription : le code est tiré en base, à toutes les phases ──────────
-- Signature inchangée (p_reclaim_code conservé mais IGNORÉ) pour ne pas créer
-- de surcharge ambiguë ; le code tiré revient dans la clé `new_reclaim_code`.

CREATE OR REPLACE FUNCTION public.register_session_member(
  p_session_id  uuid,
  p_pseudo      text,
  p_reclaim_code text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_phase     text;
  v_member    session_members%ROWTYPE;
  v_attending boolean;
  v_code      text;
  v_pseudo    text := btrim(p_pseudo);
BEGIN
  IF v_pseudo = '' THEN
    RAISE EXCEPTION 'Nom prénom requis';
  END IF;

  SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;
  IF v_phase NOT IN ('pre_voting', 'voting', 'allocating') THEN
    RAISE EXCEPTION 'La séance n''est pas en phase d''inscription (phase: %)', v_phase;
  END IF;

  v_attending := v_phase != 'pre_voting';
  v_code      := gen_member_reclaim_code(p_session_id);

  BEGIN
    INSERT INTO session_members(session_id, user_id, pseudo, joined_phase, attending_in_person, reclaim_code_hash)
    VALUES (p_session_id, auth.uid(), v_pseudo, v_phase, v_attending,
            crypt(v_code, gen_salt('bf')))
    RETURNING * INTO v_member;
  EXCEPTION WHEN unique_violation THEN
    -- Soit le pseudo est pris (message attendu par le frontend), soit
    -- l'appelant a déjà une ligne dans cette séance.
    SELECT * INTO v_member
    FROM session_members
    WHERE session_id = p_session_id AND user_id = auth.uid();

    IF v_member.id IS NOT NULL THEN
      RETURN to_jsonb(v_member);
    END IF;
    RAISE EXCEPTION 'Pseudo déjà pris';
  END;

  RETURN to_jsonb(v_member) || jsonb_build_object('new_reclaim_code', v_code);
END;
$$;

-- ── 5. Reconnexion : pseudo ET code, toujours les deux ──────────────────────

CREATE OR REPLACE FUNCTION public.confirm_attendance(
  p_session_id uuid,
  p_pseudo     text DEFAULT NULL::text,
  p_code       text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_phase         text;
  v_caller        uuid := auth.uid();
  v_target        session_members%ROWTYPE;
  v_caller_member session_members%ROWTYPE;
  v_pseudo        text := btrim(coalesce(p_pseudo, ''));
  v_blocked       text;
BEGIN
  SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;
  IF v_phase IS NULL THEN
    RAISE EXCEPTION 'Séance introuvable';
  END IF;
  IF v_phase = 'draft' THEN
    RAISE EXCEPTION 'La séance n''est pas ouverte (phase: %)', v_phase;
  END IF;

  -- Même appareil : identité déjà portée par user_id, aucun code à demander.
  SELECT * INTO v_caller_member
  FROM session_members
  WHERE session_id = p_session_id AND user_id = v_caller;

  IF v_caller_member.id IS NOT NULL THEN
    IF v_phase IN ('voting', 'allocating', 'debating') AND NOT v_caller_member.attending_in_person THEN
      UPDATE session_members
      SET attending_in_person = true
      WHERE id = v_caller_member.id
      RETURNING * INTO v_caller_member;
    END IF;
    RETURN to_jsonb(v_caller_member);
  END IF;

  -- Nouvel appareil : reconquête, pseudo + code obligatoires.
  IF v_phase = 'closed' THEN
    RETURN jsonb_build_object('error', 'La séance est clôturée : la reconnexion n''est plus possible.');
  END IF;
  IF v_pseudo = '' OR p_code IS NULL OR btrim(p_code) = '' THEN
    RETURN jsonb_build_object('error', 'Nom prénom ET code de rappel requis.');
  END IF;

  v_blocked := reclaim_block_reason(p_session_id, v_pseudo);
  IF v_blocked IS NOT NULL THEN
    RETURN jsonb_build_object('error', v_blocked);
  END IF;

  SELECT * INTO v_target
  FROM session_members
  WHERE session_id = p_session_id AND pseudo = v_pseudo;

  IF NOT FOUND THEN
    -- Pseudo libre : inscription neuve (le code saisi est sans objet).
    RETURN jsonb_build_object('error', 'Aucune inscription à ce nom pour cette séance.');
  END IF;

  IF v_target.reclaim_code_hash IS NULL
     OR crypt(btrim(p_code), v_target.reclaim_code_hash) IS DISTINCT FROM v_target.reclaim_code_hash
  THEN
    PERFORM record_reclaim_failure(p_session_id, v_pseudo);
    RETURN jsonb_build_object('error', 'Code de rappel invalide.');
  END IF;

  PERFORM clear_reclaim_attempts(p_session_id, v_pseudo);

  UPDATE session_members
  SET user_id = v_caller,
      attending_in_person = CASE
        WHEN v_phase IN ('voting', 'allocating', 'debating') THEN true
        ELSE attending_in_person
      END
  WHERE id = v_target.id
  RETURNING * INTO v_target;

  RETURN to_jsonb(v_target);
END;
$$;

CREATE OR REPLACE FUNCTION public.reclaim_prevoting_member(
  p_session_id uuid,
  p_pseudo     text DEFAULT NULL::text,
  p_code       text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_phase         text;
  v_caller        uuid := auth.uid();
  v_caller_member session_members%ROWTYPE;
  v_target        session_members%ROWTYPE;
  v_pseudo        text := btrim(coalesce(p_pseudo, ''));
  v_blocked       text;
BEGIN
  SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;
  IF v_phase IS NULL THEN
    RAISE EXCEPTION 'Séance introuvable';
  END IF;
  IF v_phase != 'pre_voting' THEN
    RAISE EXCEPTION 'La reconquête d''un profil pré-vote n''est disponible qu''en phase de vote à distance (phase actuelle : %)', v_phase;
  END IF;

  SELECT * INTO v_caller_member
  FROM session_members
  WHERE session_id = p_session_id AND user_id = v_caller;

  IF v_caller_member.id IS NOT NULL THEN
    RETURN to_jsonb(v_caller_member);
  END IF;

  IF v_pseudo = '' OR p_code IS NULL OR btrim(p_code) = '' THEN
    RETURN jsonb_build_object('error', 'Nom prénom ET code de rappel requis.');
  END IF;

  v_blocked := reclaim_block_reason(p_session_id, v_pseudo);
  IF v_blocked IS NOT NULL THEN
    RETURN jsonb_build_object('error', v_blocked);
  END IF;

  SELECT * INTO v_target
  FROM session_members
  WHERE session_id = p_session_id AND pseudo = v_pseudo;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Aucune inscription à ce nom pour cette séance.');
  END IF;

  IF v_target.reclaim_code_hash IS NULL
     OR crypt(btrim(p_code), v_target.reclaim_code_hash) IS DISTINCT FROM v_target.reclaim_code_hash
  THEN
    PERFORM record_reclaim_failure(p_session_id, v_pseudo);
    RETURN jsonb_build_object('error', 'Code de rappel invalide.');
  END IF;

  PERFORM clear_reclaim_attempts(p_session_id, v_pseudo);

  UPDATE session_members
  SET user_id = v_caller
  WHERE id = v_target.id
  RETURNING * INTO v_target;

  RETURN to_jsonb(v_target);
END;
$$;

-- ── 6. Déclaration modérateur : même tirage de code qu'à l'inscription ──────
-- Corps repris de la définition COURANTE en base (pg_get_functiondef), seule
-- la gestion du code change — cf. règle SQL du projet.

CREATE OR REPLACE FUNCTION public.claim_moderator_status(
  p_session_id   uuid,
  p_creation_code text,
  p_pseudo       text DEFAULT NULL::text,
  p_reclaim_code text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash             text;
  v_member           session_members%ROWTYPE;
  v_phase            text;
  v_attending        boolean;
  v_table_num        int;
  v_table_id         uuid;
  v_current_table_id uuid;
  v_code             text;
BEGIN
  SELECT value INTO v_hash FROM app_config WHERE key = 'creation_code_hash';
  IF v_hash IS NULL OR crypt(p_creation_code, v_hash) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'Code Ecclesia invalide';
  END IF;

  UPDATE session_members
  SET is_moderator = true
  WHERE session_id = p_session_id
    AND user_id = auth.uid()
  RETURNING * INTO v_member;

  IF NOT FOUND THEN
    IF p_pseudo IS NULL OR btrim(p_pseudo) = '' THEN
      RAISE EXCEPTION 'Nom prénom requis pour se déclarer modérateur';
    END IF;

    SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;
    IF v_phase IS NULL THEN
      RAISE EXCEPTION 'Séance introuvable';
    END IF;
    IF v_phase NOT IN ('pre_voting', 'voting', 'allocating', 'debating') THEN
      RAISE EXCEPTION 'La séance n''est pas dans une phase permettant l''inscription (phase: %)', v_phase;
    END IF;

    v_attending := v_phase != 'pre_voting';
    v_code      := gen_member_reclaim_code(p_session_id);

    BEGIN
      INSERT INTO session_members(session_id, user_id, pseudo, joined_phase, attending_in_person, is_moderator, reclaim_code_hash)
      VALUES (p_session_id, auth.uid(), btrim(p_pseudo), v_phase, v_attending, true,
              crypt(v_code, gen_salt('bf')))
      RETURNING * INTO v_member;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Ce nom prénom est déjà pris pour cette séance';
    END;
  END IF;

  SELECT ta.table_id INTO v_current_table_id
  FROM table_assignments ta
  WHERE ta.session_id = p_session_id
    AND ta.member_id  = v_member.id;

  IF v_current_table_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM tables WHERE id = v_current_table_id AND leaderless = true)
  THEN
    UPDATE tables SET leaderless = false WHERE id = v_current_table_id;
  ELSE
    SELECT ta.table_number, ta.table_id
    INTO v_table_num, v_table_id
    FROM table_assignments ta
    JOIN tables t ON t.id = ta.table_id
    WHERE ta.session_id = p_session_id
      AND t.leaderless = false
      AND NOT EXISTS (
        SELECT 1
        FROM table_assignments ta2
        JOIN session_members sm2 ON sm2.id = ta2.member_id
        WHERE ta2.session_id = ta.session_id
          AND ta2.table_number = ta.table_number
          AND sm2.is_moderator = true
      )
    ORDER BY ta.table_number
    LIMIT 1;

    IF v_table_num IS NOT NULL THEN
      INSERT INTO table_assignments (session_id, member_id, table_number, table_id)
      VALUES (p_session_id, v_member.id, v_table_num, v_table_id)
      ON CONFLICT (session_id, member_id)
      DO UPDATE SET table_number = EXCLUDED.table_number, table_id = EXCLUDED.table_id;
    END IF;
  END IF;

  IF v_code IS NOT NULL THEN
    RETURN to_jsonb(v_member) || jsonb_build_object('new_reclaim_code', v_code);
  END IF;
  RETURN to_jsonb(v_member);
END;
$$;

-- ── 7. Renommage, propagé aux deux copies du pseudo ─────────────────────────

CREATE OR REPLACE FUNCTION public.rename_session_member(
  p_session_id uuid,
  p_new_pseudo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member  session_members%ROWTYPE;
  v_new     text := btrim(p_new_pseudo);
  v_old     text;
BEGIN
  IF v_new = '' THEN
    RETURN jsonb_build_object('error', 'Le nom ne peut pas être vide.');
  END IF;

  SELECT * INTO v_member
  FROM session_members
  WHERE session_id = p_session_id AND user_id = auth.uid();

  IF v_member.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Tu n''es pas inscrit à cette séance.');
  END IF;

  v_old := v_member.pseudo;
  IF v_old = v_new THEN
    RETURN to_jsonb(v_member);
  END IF;

  IF EXISTS (
    SELECT 1 FROM session_members
    WHERE session_id = p_session_id AND pseudo = v_new
  ) THEN
    RETURN jsonb_build_object('error', 'Ce nom est déjà pris dans cette séance.');
  END IF;

  -- Interdit pendant un tour de parole ou une place en file d'attente : le nom
  -- changerait sous les yeux du modérateur en plein débat.
  IF EXISTS (
    SELECT 1
    FROM participants p
    JOIN tables t ON t.id = p.table_id
    WHERE t.session_id = p_session_id
      AND p.user_id = auth.uid()
      AND (
        t.current_speaker_id = p.id
        OR EXISTS (SELECT 1 FROM queue_entries qe WHERE qe.participant_id = p.id)
      )
  ) THEN
    RETURN jsonb_build_object(
      'error',
      'Impossible de changer de nom pendant ta prise de parole ou tant que tu es dans la file.'
    );
  END IF;

  UPDATE session_members SET pseudo = v_new WHERE id = v_member.id
  RETURNING * INTO v_member;

  -- Copie n°1 : la ligne participants de la table de débat.
  UPDATE participants p
  SET pseudo = v_new
  FROM tables t
  WHERE t.id = p.table_id
    AND t.session_id = p_session_id
    AND p.user_id = auth.uid();

  -- Copie n°2 : les sources collaboratives déjà déposées.
  UPDATE session_sources
  SET pseudo = v_new
  WHERE session_id = p_session_id
    AND user_id = auth.uid();

  -- Le compteur de tentatives suit le nom.
  DELETE FROM reclaim_attempts WHERE session_id = p_session_id AND pseudo = v_old;

  RETURN to_jsonb(v_member);
END;
$$;

-- ── 8. Régénération du code (capture d'écran perdue) ────────────────────────

CREATE OR REPLACE FUNCTION public.regenerate_reclaim_code_admin(
  p_password  text,
  p_member_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_member session_members%ROWTYPE;
  v_code   text;
BEGIN
  PERFORM check_superadmin_password(p_password);

  SELECT * INTO v_member FROM session_members WHERE id = p_member_id;
  IF v_member.id IS NULL THEN
    RAISE EXCEPTION 'Membre introuvable';
  END IF;

  v_code := gen_member_reclaim_code(v_member.session_id);

  UPDATE session_members
  SET reclaim_code_hash = crypt(v_code, gen_salt('bf'))
  WHERE id = p_member_id;

  DELETE FROM reclaim_attempts
  WHERE session_id = v_member.session_id AND pseudo = v_member.pseudo;

  RETURN jsonb_build_object('pseudo', v_member.pseudo, 'new_reclaim_code', v_code);
END;
$$;

-- Modérateur : uniquement pour un membre assis à SA table (is_table_moderator
-- + appartenance à la table — les deux conditions sont cumulatives). Ciblage
-- par PSEUDO et non par member_id : session_members est en self-only
-- (chantier 50), le modérateur n'a aucun member_id sous la main.
CREATE OR REPLACE FUNCTION public.regenerate_reclaim_code_moderator(
  p_table_id uuid,
  p_pseudo   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_member session_members%ROWTYPE;
  v_code   text;
BEGIN
  IF NOT is_table_moderator(p_table_id) THEN
    RAISE EXCEPTION 'Tu n''animes pas cette table';
  END IF;

  SELECT sm.* INTO v_member
  FROM session_members sm
  JOIN table_assignments ta ON ta.member_id = sm.id
  WHERE ta.table_id = p_table_id
    AND sm.pseudo   = btrim(p_pseudo);

  IF v_member.id IS NULL THEN
    RAISE EXCEPTION 'Ce participant n''est pas inscrit à cette table';
  END IF;

  v_code := gen_member_reclaim_code(v_member.session_id);

  UPDATE session_members
  SET reclaim_code_hash = crypt(v_code, gen_salt('bf'))
  WHERE id = v_member.id;

  DELETE FROM reclaim_attempts
  WHERE session_id = v_member.session_id AND pseudo = v_member.pseudo;

  RETURN jsonb_build_object('pseudo', v_member.pseudo, 'new_reclaim_code', v_code);
END;
$$;

-- ── 9. Purge à la clôture (chantier 49), portée sur la colonne hachée ───────
-- Corps repris de la définition COURANTE en base, seule la colonne change.

CREATE OR REPLACE FUNCTION public.set_session_phase(
  p_password   text,
  p_session_id uuid,
  p_phase      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
  v_row  sessions%ROWTYPE;
BEGIN
  IF p_phase NOT IN ('draft', 'pre_voting', 'voting', 'allocating', 'debating', 'post_voting', 'closed') THEN
    RAISE EXCEPTION 'Phase invalide: %', p_phase;
  END IF;

  SELECT value INTO v_hash FROM app_config WHERE key = 'superadmin_code_hash';
  IF NOT crypt(p_password, v_hash) = v_hash THEN
    RAISE EXCEPTION 'Mot de passe superadmin incorrect';
  END IF;

  UPDATE sessions
  SET phase = p_phase, phase_changed_at = now()
  WHERE id = p_session_id
  RETURNING * INTO v_row;

  IF p_phase = 'closed' THEN
    UPDATE session_members
    SET reclaim_code_hash = NULL
    WHERE session_id = p_session_id AND reclaim_code_hash IS NOT NULL;

    DELETE FROM reclaim_attempts WHERE session_id = p_session_id;
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rename_session_member(uuid, text)                TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_reclaim_code_admin(text, uuid)        TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_reclaim_code_moderator(uuid, text)    TO authenticated, anon;
