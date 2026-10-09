-- =============================================================
-- Chantier 161c — retour en débat : effacer aussi le questionnaire forcé
--
-- Trouvé au navigateur sur dev le 2026-10-09 (onglet Tables, séance
-- « QA Vérifs — Complète ») : tables terminées → séance en Post-vote → retour
-- en Débat. La 161a remettait bien `debate_ended_at` à NULL, mais
-- `questionnaire_forced_at` (posé par end_table_debate, et par
-- force_session_questionnaire au passage en Post-vote) restait : revenus à
-- leur table, les participants revoyaient le questionnaire forcé pendant une
-- heure. Le retour Post-vote → Débat avait déjà ce défaut avant le 161.
-- reopen_table_debate, lui, efface déjà les deux colonnes : on aligne.
--
-- Comparé à pg_get_functiondef le 2026-10-09 : la définition dev est celle de
-- la 161a (md5 beeb3be3…). Sur prod, à appliquer juste après la 161a/161b.
-- =============================================================

CREATE OR REPLACE FUNCTION public.set_session_phase(p_password text, p_session_id uuid, p_phase text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_hash      text;
  v_row       sessions%ROWTYPE;
  v_type      text;
  v_old_phase text;
BEGIN
  IF p_phase NOT IN ('draft', 'pre_voting', 'voting', 'allocating', 'debating', 'post_voting', 'closed') THEN
    RAISE EXCEPTION 'Phase invalide: %', p_phase;
  END IF;

  PERFORM check_session_admin(p_password, p_session_id);

  SELECT session_type, phase INTO v_type, v_old_phase FROM sessions WHERE id = p_session_id;
  IF v_type IS NOT NULL AND NOT session_type_allows_phase(v_type, p_phase) THEN
    RAISE EXCEPTION 'Phase % indisponible pour ce type de séance', p_phase;
  END IF;

  UPDATE sessions
  SET phase = p_phase, phase_changed_at = now()
  WHERE id = p_session_id
  RETURNING * INTO v_row;

  -- Chantier 161 — toute (re)entrée en débat remet toutes les tables en débat,
  -- questionnaire forcé compris (161c).
  IF p_phase = 'debating' AND v_old_phase IS DISTINCT FROM 'debating' THEN
    UPDATE tables
    SET debate_ended_at         = NULL,
        questionnaire_forced_at = NULL
    WHERE session_id = p_session_id
      AND (debate_ended_at IS NOT NULL OR questionnaire_forced_at IS NOT NULL);
  END IF;

  IF p_phase = 'closed' THEN
    UPDATE session_members
    SET reclaim_code_hash = NULL
    WHERE session_id = p_session_id AND reclaim_code_hash IS NOT NULL;

    DELETE FROM reclaim_attempts WHERE session_id = p_session_id;
  END IF;

  RETURN to_jsonb(v_row);
END;
$function$;
