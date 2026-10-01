-- Chantier 142 — Document collaboratif : l'écriture des sources est protégée
-- par l'identité de séance (session_members), plus par un pseudo libre.
--
-- Avant : register_collab_pseudo(session, pseudo) — taper le nom de quelqu'un
-- suffisait à récupérer toutes ses sources (puis à les modifier/supprimer).
-- Identité parallèle (collab_session_users) sans aucune preuve.
--
-- Après :
--   * une source appartient à un membre de la séance (session_sources.member_id) ;
--   * l'appareil déjà inscrit à la séance écrit directement ;
--   * sinon, reprise d'identité par nom + code de rappel (claim_collab_identity),
--     mêmes garde-fous que confirm_attendance (anti-bruteforce reclaim_attempts,
--     pseudo_key) — sans toucher à attending_in_person ;
--   * la lecture reste ouverte à tous, séance par séance (inchangé).
--
-- Définitions de départ comparées à pg_get_functiondef sur dev ET prod le
-- 2026-09-28 (identiques à un commentaire près). Aucune source en base, ni
-- sur dev ni sur prod, à cette date.

-- ── 1. Rattachement des sources à un membre ─────────────────────────────
ALTER TABLE public.session_sources
  ADD COLUMN IF NOT EXISTS member_id uuid
  REFERENCES public.session_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS session_sources_member_id_idx
  ON public.session_sources (member_id);

-- Reprise de l'existant (vide à ce jour) : par user_id, sinon par nom.
UPDATE public.session_sources s
SET member_id = m.id
FROM public.session_members m
WHERE s.member_id IS NULL
  AND m.session_id = s.session_id
  AND m.user_id = s.user_id;

UPDATE public.session_sources s
SET member_id = m.id
FROM public.session_members m
WHERE s.member_id IS NULL
  AND m.session_id = s.session_id
  AND pseudo_key(m.pseudo) = pseudo_key(s.pseudo);

-- ── 2. Fin de l'identité parallèle ──────────────────────────────────────
DROP FUNCTION IF EXISTS public.register_collab_pseudo(uuid, text);
DROP TABLE IF EXISTS public.collab_session_users;

-- ── 3. Identité de l'appareil pour le document ──────────────────────────
CREATE OR REPLACE FUNCTION public.get_collab_identity(p_session_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object('member_id', m.id, 'pseudo', m.pseudo)
  FROM session_members m
  WHERE m.session_id = p_session_id AND m.user_id = auth.uid()
  LIMIT 1;
$function$;

-- Reprise d'identité par nom + code. Ne crée jamais d'inscription.
-- Retours :
--   {member_id, pseudo}          → identité (déjà la sienne, ou reprise réussie)
--   {code_required: true}        → le nom existe, code absent
--   {error: '…'}                 → nom inconnu, code faux, blocage, séance close
CREATE OR REPLACE FUNCTION public.claim_collab_identity(
  p_session_id uuid,
  p_pseudo     text,
  p_code       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_phase   text;
  v_pseudo  text := btrim(coalesce(p_pseudo, ''));
  v_code    text := btrim(coalesce(p_code, ''));
  v_mine    session_members%ROWTYPE;
  v_target  session_members%ROWTYPE;
  v_blocked text;
BEGIN
  SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;
  IF v_phase IS NULL THEN
    RETURN jsonb_build_object('error', 'Séance introuvable.');
  END IF;

  SELECT * INTO v_mine
  FROM session_members
  WHERE session_id = p_session_id AND user_id = auth.uid()
  LIMIT 1;
  IF v_mine.id IS NOT NULL THEN
    RETURN jsonb_build_object('member_id', v_mine.id, 'pseudo', v_mine.pseudo);
  END IF;

  IF v_pseudo = '' THEN
    RETURN jsonb_build_object('error', 'Indique ton nom prénom.');
  END IF;

  SELECT * INTO v_target
  FROM session_members
  WHERE session_id = p_session_id AND pseudo_key(pseudo) = pseudo_key(v_pseudo);

  IF v_target.id IS NULL THEN
    RETURN jsonb_build_object('error',
      'Aucune inscription à ce nom pour cette séance. Inscris-toi d''abord depuis la séance pour ajouter des sources.');
  END IF;

  IF v_phase = 'closed' THEN
    RETURN jsonb_build_object('error',
      'La séance est clôturée : la reconnexion n''est plus possible depuis un autre appareil.');
  END IF;

  IF v_code = '' THEN
    RETURN jsonb_build_object('code_required', true, 'pseudo', v_target.pseudo);
  END IF;

  v_blocked := reclaim_block_reason(p_session_id, v_pseudo);
  IF v_blocked IS NOT NULL THEN
    RETURN jsonb_build_object('error', v_blocked);
  END IF;

  IF v_target.reclaim_code_hash IS NULL
     OR crypt(v_code, v_target.reclaim_code_hash) IS DISTINCT FROM v_target.reclaim_code_hash
  THEN
    PERFORM record_reclaim_failure(p_session_id, v_pseudo);
    RETURN jsonb_build_object('error', 'Code de rappel invalide.');
  END IF;

  PERFORM clear_reclaim_attempts(p_session_id, v_pseudo);

  -- Même transfert que confirm_attendance, sans toucher à attending_in_person :
  -- ouvrir le document depuis un autre appareil ne vaut pas présence.
  UPDATE session_members SET user_id = auth.uid()
  WHERE id = v_target.id
  RETURNING * INTO v_target;

  RETURN jsonb_build_object('member_id', v_target.id, 'pseudo', v_target.pseudo);
END;
$function$;

-- ── 4. Écriture des sources : réservée au membre ────────────────────────
CREATE OR REPLACE FUNCTION public.add_collab_source(p_session_id uuid, p_title text, p_url text DEFAULT NULL::text, p_content text DEFAULT NULL::text, p_table_join_code text DEFAULT NULL::text)
 RETURNS session_sources
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_member public.session_members%ROWTYPE;
  v_url    text := NULLIF(btrim(p_url), '');
  v_source public.session_sources;
BEGIN
  IF NOT public.is_valid_source_url(v_url) THEN
    RAISE EXCEPTION 'Lien invalide : seuls les liens http:// ou https:// sont acceptés.';
  END IF;

  SELECT * INTO v_member
  FROM public.session_members
  WHERE session_id = p_session_id AND user_id = auth.uid()
  LIMIT 1;

  IF v_member.id IS NULL THEN
    RAISE EXCEPTION 'Identifie-toi (nom + code de rappel) avant d''ajouter des sources.';
  END IF;

  INSERT INTO public.session_sources (session_id, user_id, member_id, pseudo, title, url, content, table_join_code)
  VALUES (p_session_id, auth.uid(), v_member.id, v_member.pseudo, p_title, v_url, p_content, p_table_join_code)
  RETURNING * INTO v_source;

  RETURN v_source;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_collab_source(p_source_id uuid, p_title text, p_url text DEFAULT NULL::text, p_content text DEFAULT NULL::text)
 RETURNS session_sources
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_url    text := NULLIF(btrim(p_url), '');
  v_source public.session_sources;
BEGIN
  IF NOT public.is_valid_source_url(v_url) THEN
    RAISE EXCEPTION 'Lien invalide : seuls les liens http:// ou https:// sont acceptés.';
  END IF;

  UPDATE public.session_sources ss
  SET
    title      = p_title,
    url        = v_url,
    content    = p_content,
    user_id    = auth.uid(),
    updated_at = now()
  WHERE ss.id = p_source_id
    AND ss.member_id IN (SELECT m.id FROM public.session_members m WHERE m.user_id = auth.uid())
  RETURNING * INTO v_source;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source introuvable ou non autorisé.';
  END IF;

  RETURN v_source;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_collab_source(p_source_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.session_sources ss
  WHERE ss.id = p_source_id
    AND ss.member_id IN (SELECT m.id FROM public.session_members m WHERE m.user_id = auth.uid());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source introuvable ou non autorisé.';
  END IF;
END;
$function$;

-- ── 5. Lecture : expose member_id (type de retour changé → DROP) ────────
DROP FUNCTION IF EXISTS public.list_session_sources(uuid);
CREATE FUNCTION public.list_session_sources(p_session_id uuid)
 RETURNS TABLE(id uuid, session_id uuid, user_id uuid, member_id uuid, pseudo text, title text, url text, content text, created_at timestamp with time zone, updated_at timestamp with time zone, table_join_code text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    ss.id,
    ss.session_id,
    ss.user_id,
    ss.member_id,
    ss.pseudo,
    ss.title,
    ss.url,
    ss.content,
    ss.created_at,
    ss.updated_at,
    COALESCE(
      ss.table_join_code,
      (
        SELECT t.join_code
        FROM public.participants p
        JOIN public.tables t ON t.id = p.table_id
        WHERE pseudo_key(p.pseudo) = pseudo_key(ss.pseudo)
          AND t.session_id  = p_session_id
        ORDER BY p.created_at
        LIMIT 1
      )
    ) AS table_join_code
  FROM public.session_sources ss
  WHERE ss.session_id = p_session_id
  ORDER BY ss.pseudo, ss.created_at;
$function$;

-- ── 6. Renommage : propagation par membre (et non par appareil) ─────────
-- Seule la ligne « UPDATE session_sources » change par rapport à la
-- définition courante en base (chantier 140b) : WHERE member_id au lieu de
-- user_id, pour suivre les sources après une reprise sur un autre appareil.
CREATE OR REPLACE FUNCTION public.rename_session_member(p_session_id uuid, p_new_pseudo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    WHERE session_id = p_session_id
      AND pseudo_key(pseudo) = pseudo_key(v_new)
      AND id <> v_member.id
  ) THEN
    RETURN jsonb_build_object('error', 'Ce nom est déjà pris dans cette séance.');
  END IF;

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

  UPDATE participants p
  SET pseudo = v_new
  FROM tables t
  WHERE t.id = p.table_id
    AND t.session_id = p_session_id
    AND p.user_id = auth.uid();

  UPDATE session_sources
  SET pseudo = v_new
  WHERE session_id = p_session_id
    AND member_id = v_member.id;

  DELETE FROM reclaim_attempts WHERE session_id = p_session_id AND pseudo = pseudo_key(v_old);

  RETURN to_jsonb(v_member);
END;
$function$;

-- ── 7. Droits ───────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.get_collab_identity(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_collab_identity(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_session_sources(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_collab_identity(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_collab_identity(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_session_sources(uuid) TO anon, authenticated;
