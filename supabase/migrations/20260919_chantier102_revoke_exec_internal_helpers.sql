-- Chantier 102 — Sécurité : refermer les helpers SQL internes exposés à anon/authenticated
--
-- Ces six fonctions SECURITY DEFINER ne vérifient aucune autorité sur l'appelant.
-- Elles ne sont appelées que par d'autres fonctions SECURITY DEFINER (OWNER = postgres),
-- jamais depuis src/ (grep exhaustif, zéro occurrence) : leur retirer EXECUTE ne casse
-- aucun chemin nominal, et referme l'éjection/déplacement d'un participant à distance
-- ainsi que le contournement du verrou anti-bruteforce du chantier 93.
--
-- Ne pas étendre cette liste à is_table_participant / is_table_moderator /
-- is_own_session_member / can_join_realtime_topic : ces helpers-là sont évalués
-- dans des expressions de policies RLS avec les droits du rôle appelant, leur
-- retirer EXECUTE viderait silencieusement les lectures de table/file/tours de parole.

-- PostgreSQL accorde EXECUTE à PUBLIC par défaut sur toute fonction créée ; anon et
-- authenticated en héritent implicitement (tout rôle est membre de PUBLIC). Un simple
-- `REVOKE ... FROM anon, authenticated` ne suffit donc pas tant que le grant à PUBLIC
-- tient encore — il faut le retirer explicitement.
revoke execute on function public.leave_other_session_tables(uuid, uuid, uuid) from public;
revoke execute on function public.sync_table_assignment(uuid, uuid, uuid, text) from public;
revoke execute on function public.clear_reclaim_attempts(uuid, text) from public;
revoke execute on function public.record_reclaim_failure(uuid, text) from public;
revoke execute on function public.gen_member_reclaim_code(uuid) from public;
revoke execute on function public.generate_session_join_code() from public;
