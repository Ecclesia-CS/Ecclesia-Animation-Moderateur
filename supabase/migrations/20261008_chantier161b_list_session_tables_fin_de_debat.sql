-- =============================================================
-- Chantier 161b — onglet Tables : avancement du débat par table
--
-- list_session_tables renvoie en plus `debate_ended_at` (161a), pour que
-- l'accordéon Groupes affiche « terminée à HH:MM » et le compteur
-- « N / M tables ont terminé ». Le type de retour change : DROP puis CREATE,
-- ACL refaite à l'identique (anon, authenticated — la garde est
-- check_session_admin, inchangée).
--
-- Comparé à pg_get_functiondef le 2026-10-08 : identique sur dev et prod
-- (md5 d45b8298…). À appliquer sur prod après la 161a.
-- =============================================================

DROP FUNCTION IF EXISTS list_session_tables(text, uuid);

CREATE FUNCTION public.list_session_tables(p_password text, p_session_id uuid)
 RETURNS TABLE(id uuid, join_code text, created_at timestamp with time zone, moderator_pseudo text, participant_count bigint, is_active boolean, questionnaire_forced_at timestamp with time zone, leaderless boolean, table_number integer, debate_ended_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  PERFORM check_session_admin(p_password, p_session_id);

  RETURN QUERY
  SELECT
    t.id,
    t.join_code,
    t.created_at,
    (SELECT p.pseudo FROM participants p
     WHERE p.table_id = t.id AND p.user_id = t.created_by
     ORDER BY p.created_at LIMIT 1),
    COUNT(p2.id),
    (t.current_speaker_id IS NOT NULL),
    t.questionnaire_forced_at,
    t.leaderless,
    t.table_number,
    t.debate_ended_at
  FROM tables t
  LEFT JOIN participants p2 ON p2.table_id = t.id
  WHERE t.session_id = p_session_id
  GROUP BY t.id
  ORDER BY t.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION list_session_tables(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_session_tables(text, uuid) TO anon, authenticated;
