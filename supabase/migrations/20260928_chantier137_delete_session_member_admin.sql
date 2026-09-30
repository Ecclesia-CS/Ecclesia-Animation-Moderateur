-- Chantier 137-D — le superadmin peut supprimer un participant de la base.
--
-- Aucune RPC de suppression de `session_members` n'existait. Celle-ci retire la
-- personne de la séance, à toute phase (y compris `closed`) :
--   • supprimés : inscription (`session_members`), votes (`assertion_votes`,
--     `assertion_vote_history`), lignes d'analyse (`analysis_members`), réponses
--     d'onboarding (`entry_responses`), binômes (`member_pairings`, dans les deux
--     sens), affectation de table (`table_assignments`) — tous en CASCADE —
--     puis, par la fonction elle-même : siège(s) de table (`participants`, avec
--     file d'attente et tours de parole en CASCADE), réponses au questionnaire
--     (`questionnaire_responses`), notes privées, réponses aux votes de table
--     (`table_vote_responses`) ;
--   • CONSERVÉES, auteur détaché : ses assertions proposées (`assertions`) — les
--     votes des autres personnes portent dessus, les supprimer fausserait
--     l'analyse. `assertions.member_id` devient nullable, FK en ON DELETE SET NULL.
--     (Tous les lecteurs de cette colonne sont des jointures internes ou des
--     lectures via RLS sur `status` — vérifié : aucun ne suppose un auteur.)
--   • table animée par la personne : elle repasse `leaderless` (pas d'état
--     incohérent « table modérée sans modérateur ») et `created_by` est rendu à
--     l'appelant, comme `set_member_moderator(…, false)`.
--   • la personne parle en ce moment : la parole est libérée.
--
-- Un participant (`participants`) n'est rattaché à un membre que par
-- `user_id` + table de la séance ; `UNIQUE(session_id, user_id)` sur
-- `session_members` rend ce lien non ambigu à l'intérieur d'une séance.
--
-- Garde du mot de passe : `check_session_admin` (superadmin ou jeton
-- d'association propriétaire de la séance — définition courante en base).

ALTER TABLE public.assertions ALTER COLUMN member_id DROP NOT NULL;

ALTER TABLE public.assertions DROP CONSTRAINT IF EXISTS assertions_member_id_fkey;
ALTER TABLE public.assertions
  ADD CONSTRAINT assertions_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES public.session_members(id) ON DELETE SET NULL;

DROP FUNCTION IF EXISTS public.delete_session_member_admin(text, uuid, uuid);

CREATE FUNCTION public.delete_session_member_admin(
  p_password   text,
  p_session_id uuid,
  p_member_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_member          session_members%ROWTYPE;
  v_table_ids       uuid[];
  v_part_ids        uuid[];
  v_seat_table_ids  uuid[];
  v_mod_tables      uuid[];
  v_n_votes         int;
  v_n_assertions    int;
  v_n_pairings      int;
  v_n_analysis      int;
  v_leaderless      int := 0;
BEGIN
  PERFORM check_session_admin(p_password, p_session_id);

  SELECT * INTO v_member
  FROM session_members
  WHERE id = p_member_id AND session_id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membre introuvable pour cette séance';
  END IF;

  SELECT COALESCE(array_agg(id), '{}') INTO v_table_ids
  FROM tables WHERE session_id = p_session_id;

  SELECT COALESCE(array_agg(id), '{}') INTO v_part_ids
  FROM participants
  WHERE user_id = v_member.user_id AND table_id = ANY(v_table_ids);

  SELECT COALESCE(array_agg(DISTINCT t), '{}') INTO v_seat_table_ids
  FROM (
    SELECT table_id AS t FROM participants WHERE id = ANY(v_part_ids)
    UNION
    SELECT table_id FROM table_assignments
    WHERE member_id = p_member_id AND table_id IS NOT NULL
  ) s;

  -- Tables que la personne animait : animateur enregistré, ou « physique »
  -- (created_by) sur une table où elle est assise. Le superadmin lui-même est
  -- `created_by` de presque toutes les tables : le filtre sur le siège évite de
  -- toucher à celles où la personne supprimée n'est pas.
  SELECT COALESCE(array_agg(id), '{}') INTO v_mod_tables
  FROM tables
  WHERE session_id = p_session_id
    AND (
      active_moderator_member_id = p_member_id
      OR (created_by = v_member.user_id AND id = ANY(v_seat_table_ids))
    );

  -- Compteurs (avant les suppressions) pour le compte rendu.
  SELECT count(*) INTO v_n_votes      FROM assertion_votes  WHERE member_id = p_member_id;
  SELECT count(*) INTO v_n_assertions FROM assertions       WHERE member_id = p_member_id;
  SELECT count(*) INTO v_n_pairings   FROM member_pairings
    WHERE member_id = p_member_id OR target_member_id = p_member_id;
  SELECT count(*) INTO v_n_analysis   FROM analysis_members WHERE member_id = p_member_id;

  -- Parole libérée si la personne parle.
  UPDATE tables
  SET current_speaker_id = NULL, current_turn_started_at = NULL
  WHERE current_speaker_id = ANY(v_part_ids);

  -- Tables animées par la personne → sans animateur, sans état incohérent.
  IF array_length(v_mod_tables, 1) IS NOT NULL THEN
    UPDATE tables
    SET created_by = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    WHERE id = ANY(v_mod_tables) AND created_by = v_member.user_id;

    UPDATE tables
    SET active_moderator_member_id = NULL
    WHERE id = ANY(v_mod_tables) AND active_moderator_member_id = p_member_id;

    UPDATE tables
    SET leaderless = true
    WHERE id = ANY(v_mod_tables) AND leaderless = false;
    GET DIAGNOSTICS v_leaderless = ROW_COUNT;
  END IF;

  -- Ce qui n'est pas relié par clé étrangère au membre.
  DELETE FROM table_vote_responses
  WHERE user_id = v_member.user_id
    AND vote_id IN (SELECT id FROM table_votes WHERE table_id = ANY(v_table_ids));

  DELETE FROM private_notes
  WHERE user_id = v_member.user_id
    AND (session_id = p_session_id OR table_id = ANY(v_table_ids));

  DELETE FROM questionnaire_responses
  WHERE user_id = v_member.user_id
    AND (session_id = p_session_id OR table_id = ANY(v_table_ids));

  DELETE FROM participants WHERE id = ANY(v_part_ids);

  -- CASCADE : votes, historique, analyse, onboarding, binômes, affectation.
  -- SET NULL : assertions (conservées, auteur détaché).
  DELETE FROM session_members WHERE id = p_member_id;

  RETURN jsonb_build_object(
    'pseudo',                 v_member.pseudo,
    'was_moderator',          v_member.is_moderator OR array_length(v_mod_tables, 1) IS NOT NULL,
    'tables_now_leaderless',  v_leaderless,
    'votes_deleted',          v_n_votes,
    'assertions_detached',    v_n_assertions,
    'pairings_dissolved',     v_n_pairings,
    'analysis_rows_removed',  v_n_analysis,
    'seats_removed',          COALESCE(array_length(v_part_ids, 1), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_session_member_admin(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_session_member_admin(text, uuid, uuid) TO anon, authenticated;
