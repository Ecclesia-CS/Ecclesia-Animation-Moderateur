-- Chantier 134a — trois modes de séance (séance complète / débat simple / sondage).
--
-- 1. sessions.session_type : 'full' (défaut, toutes les séances existantes),
--    'debate' (une table modérée, sans vote), 'poll' (vote distanciel seul,
--    sans table). Posé à la création, jamais modifié ensuite.
-- 2. create_session : nouveau paramètre p_session_type (DEFAULT 'full' — un
--    front qui ne le passe pas garde le comportement actuel). En mode débat,
--    la table unique est créée dans la même transaction.
-- 3. set_session_phase : refuse une phase hors de la séquence du mode.
--    Corps repris de la définition en base au 2026-09-26 (pg_get_functiondef),
--    seule la garde de mode est ajoutée.
-- 4. join_simple_debate : point d'entrée participant d'un débat simple
--    (inscription + place à table, et prise de la modération si le Code
--    Ecclesia est fourni), atomique.
-- 5. list_public_closed_sessions : exclut les débats simples (aucun résultat
--    de vote à consulter).

-- ── 1. Colonne ──────────────────────────────────────────────────────────────
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS session_type text NOT NULL DEFAULT 'full';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_session_type_check') THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_session_type_check CHECK (session_type IN ('full', 'debate', 'poll'));
  END IF;
END $$;

-- Séquence de phases autorisée par mode. Source unique côté SQL — le miroir
-- côté front est phaseSequenceFor() dans src/lib/phaseLabels.ts.
CREATE OR REPLACE FUNCTION session_type_allows_phase(p_session_type text, p_phase text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_session_type
    WHEN 'debate' THEN p_phase IN ('draft', 'debating', 'closed')
    WHEN 'poll'   THEN p_phase IN ('draft', 'pre_voting', 'closed')
    ELSE               p_phase IN ('draft', 'pre_voting', 'voting', 'allocating', 'debating', 'post_voting', 'closed')
  END;
$$;

-- ── 2. create_session ──────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS create_session(text, text, text, timestamptz, text, text, text, boolean);

CREATE FUNCTION create_session(
  p_password           text,
  p_title              text,
  p_description        text        DEFAULT NULL,
  p_scheduled_at       timestamptz DEFAULT NULL,
  p_doc_info_url       text        DEFAULT NULL,
  p_doc_summary_url    text        DEFAULT NULL,
  p_doc_collab_url     text        DEFAULT NULL,
  p_onboarding_enabled boolean     DEFAULT true,
  p_session_type       text        DEFAULT 'full'
)
RETURNS sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_session sessions;
BEGIN
  PERFORM check_superadmin_password(p_password);

  IF p_session_type NOT IN ('full', 'debate', 'poll') THEN
    RAISE EXCEPTION 'Type de séance invalide: %', p_session_type;
  END IF;

  INSERT INTO sessions (title, description, scheduled_at, join_code,
                        doc_info_url, doc_summary_url, doc_collab_url,
                        onboarding_enabled, session_type)
  VALUES (p_title, p_description, p_scheduled_at, generate_session_join_code(),
          p_doc_info_url, p_doc_summary_url, p_doc_collab_url,
          -- Un débat simple n'a pas de phase de vote : l'onboarding (questionnaire
          -- d'entrée avant le vote) n'a rien à précéder.
          CASE WHEN p_session_type = 'debate' THEN false ELSE p_onboarding_enabled END,
          p_session_type)
  RETURNING * INTO v_session;

  -- Débat simple : une seule table par défaut, animée (pas leaderless) et en
  -- attente de son modérateur. Le superadmin peut en ajouter d'autres depuis
  -- l'onglet Tables (admin_create_session_table, chantier 95).
  IF p_session_type = 'debate' THEN
    PERFORM admin_create_session_table(p_password, v_session.id, false);
  END IF;

  RETURN v_session;
END;
$function$;

REVOKE ALL ON FUNCTION create_session(text, text, text, timestamptz, text, text, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_session(text, text, text, timestamptz, text, text, text, boolean, text) TO anon, authenticated;

-- ── 3. set_session_phase ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_session_phase(p_password text, p_session_id uuid, p_phase text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_hash text;
  v_row  sessions%ROWTYPE;
  v_type text;
BEGIN
  IF p_phase NOT IN ('draft', 'pre_voting', 'voting', 'allocating', 'debating', 'post_voting', 'closed') THEN
    RAISE EXCEPTION 'Phase invalide: %', p_phase;
  END IF;

  SELECT value INTO v_hash FROM app_config WHERE key = 'superadmin_code_hash';
  IF NOT crypt(p_password, v_hash) = v_hash THEN
    RAISE EXCEPTION 'Mot de passe superadmin incorrect';
  END IF;

  -- Chantier 134 — chaque mode de séance n'emprunte qu'une partie des phases.
  SELECT session_type INTO v_type FROM sessions WHERE id = p_session_id;
  IF v_type IS NOT NULL AND NOT session_type_allows_phase(v_type, p_phase) THEN
    RAISE EXCEPTION 'Phase % indisponible pour ce type de séance', p_phase;
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
$function$;

-- ── 4. join_simple_debate ──────────────────────────────────────────────────
-- Entrée d'un participant dans un débat simple (phase 'debating').
--   * Inscrit l'appelant en session_members s'il ne l'est pas (code de rappel
--     émis, renvoyé une seule fois dans new_reclaim_code, comme
--     assign_least_filled_table).
--   * Déjà assis à une table de la séance → y retourne (reconnexion).
--   * Sinon : sans Code Ecclesia → table animée la moins remplie ; avec →
--     première table sans modérateur, dont il prend l'animation (drapeau
--     is_moderator + active_moderator_member_id + created_by, comme
--     claim_table_as_moderator). Refus si toutes les tables sont animées :
--     la reprise d'une table déjà tenue passe par Outils → « Je suis le
--     modérateur de cette table » (reclaim_table_as_moderator, chantier 110).
-- Toute erreur lève : la transaction entière est annulée, personne n'est
-- inscrit à moitié.
CREATE OR REPLACE FUNCTION join_simple_debate(
  p_session_id    uuid,
  p_pseudo        text,
  p_creation_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_session         sessions%ROWTYPE;
  v_pseudo          text := btrim(coalesce(p_pseudo, ''));
  v_as_moderator    boolean := p_creation_code IS NOT NULL AND btrim(p_creation_code) <> '';
  v_hash            text;
  v_member          session_members%ROWTYPE;
  v_code            text;
  v_table_id        uuid;
  v_participant_id  uuid;
  v_result          jsonb;
BEGIN
  SELECT * INTO v_session FROM sessions WHERE id = p_session_id;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Séance introuvable';
  END IF;
  IF v_session.session_type <> 'debate' THEN
    RAISE EXCEPTION 'Cette séance n''est pas un débat simple.';
  END IF;
  IF v_session.phase <> 'debating' THEN
    RAISE EXCEPTION 'Le débat n''est pas ouvert.';
  END IF;

  IF v_as_moderator THEN
    SELECT value INTO v_hash FROM app_config WHERE key = 'creation_code_hash';
    IF v_hash IS NULL OR crypt(p_creation_code, v_hash) IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'Code Ecclesia incorrect';
    END IF;
  END IF;

  SELECT * INTO v_member
  FROM session_members
  WHERE session_id = p_session_id AND user_id = auth.uid()
  LIMIT 1;

  IF v_member.id IS NULL THEN
    IF v_pseudo = '' THEN
      RAISE EXCEPTION 'Nom prénom requis';
    END IF;
    v_code := gen_member_reclaim_code(p_session_id);
    BEGIN
      INSERT INTO session_members (session_id, user_id, pseudo, joined_phase, attending_in_person, reclaim_code_hash)
      VALUES (p_session_id, auth.uid(), v_pseudo, 'debating', true, crypt(v_code, gen_salt('bf')))
      RETURNING * INTO v_member;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Ce nom est déjà utilisé dans ce débat. Si c''est toi, utilise ton code de rappel.';
    END;
  END IF;

  -- Reconnexion : déjà assis à une table de la séance.
  SELECT ta.table_id INTO v_table_id
  FROM table_assignments ta
  JOIN tables t ON t.id = ta.table_id
  WHERE ta.member_id = v_member.id AND ta.session_id = p_session_id
  LIMIT 1;

  IF v_as_moderator THEN
    -- Déjà assis à une table sans modérateur (ou qu'il anime) : on la garde.
    IF v_table_id IS NOT NULL
       AND table_has_moderator(v_table_id)
       AND NOT table_moderator_is(v_table_id, v_member.pseudo) THEN
      v_table_id := NULL;
    END IF;
    IF v_table_id IS NULL THEN
      SELECT t.id INTO v_table_id
      FROM tables t
      WHERE t.session_id = p_session_id
        AND NOT table_has_moderator(t.id)
      ORDER BY t.table_number ASC NULLS LAST, t.join_code ASC
      LIMIT 1;
    END IF;
    IF v_table_id IS NULL THEN
      RAISE EXCEPTION 'Toutes les tables ont déjà un modérateur. Rejoins-en une comme participant, puis passe par Outils pour reprendre l''animation.';
    END IF;
  ELSIF v_table_id IS NULL THEN
    SELECT t.id INTO v_table_id
    FROM tables t
    LEFT JOIN (
      SELECT table_id, count(*) AS occupied FROM participants GROUP BY table_id
    ) occ ON occ.table_id = t.id
    WHERE t.session_id = p_session_id
    ORDER BY COALESCE(occ.occupied, 0) ASC, t.table_number ASC NULLS LAST, t.join_code ASC
    LIMIT 1;
    IF v_table_id IS NULL THEN
      RAISE EXCEPTION 'Aucune table n''est disponible pour ce débat.';
    END IF;
  END IF;

  PERFORM leave_other_session_tables(p_session_id, v_table_id);

  INSERT INTO participants (table_id, user_id, pseudo)
  VALUES (v_table_id, auth.uid(), v_member.pseudo)
  ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
  RETURNING id INTO v_participant_id;

  PERFORM sync_table_assignment(p_session_id, v_table_id, v_member.pseudo);

  IF v_as_moderator THEN
    UPDATE session_members SET is_moderator = true
    WHERE id = v_member.id AND is_moderator = false;

    UPDATE tables
    SET created_by                 = auth.uid(),
        leaderless                 = false,
        active_moderator_member_id = v_member.id
    WHERE id = v_table_id;
  END IF;

  SELECT jsonb_build_object(
    'id',                      s.id,
    'join_code',               s.join_code,
    'created_by',              s.created_by,
    'current_speaker_id',      s.current_speaker_id,
    'current_turn_started_at', s.current_turn_started_at,
    'created_at',              s.created_at,
    'participant_id',          v_participant_id,
    'is_moderator',            is_table_moderator(s.id),
    'pseudo',                  v_member.pseudo,
    'new_reclaim_code',        v_code
  ) INTO v_result
  FROM tables s WHERE s.id = v_table_id;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION join_simple_debate(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION join_simple_debate(uuid, text, text) TO anon, authenticated;

-- ── 5. list_public_closed_sessions ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_public_closed_sessions()
 RETURNS TABLE(id uuid, title text, description text, scheduled_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT s.id, s.title, s.description, s.scheduled_at
  FROM sessions s
  WHERE s.phase = 'closed' AND s.results_public = true
    AND s.session_type <> 'debate'
  ORDER BY s.scheduled_at DESC NULLS LAST;
$function$;
