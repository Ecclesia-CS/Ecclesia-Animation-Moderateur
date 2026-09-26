-- =============================================================
-- Correctif environnement dev : policies RLS manquantes sur
-- realtime.messages (Realtime privé, chantier 59)
--
-- Constat : can_join_realtime_topic est identique (pg_get_functiondef
-- comparé) sur dev (mnjqrlrrzrycuconlfqb) et prod (plpjiehqsxxakbuykmkm),
-- realtime.messages a bien RLS activé sur les deux — mais dev n'avait
-- AUCUNE policy dessus (prod en a deux), donc Postgres refusait tout
-- accès par défaut : "Unauthorized: You do not have permissions to read
-- from this Channel topic" sur tous les canaux privés de l'app
-- (table:<id>, vote:<session_id>, session-member:<id>, allocating:<id>,
-- postvote:..., etc.) sur dev.
--
-- Pourquoi le clone du 25/09 les a ratées : ces deux policies vivent
-- dans le schéma `realtime` (table système Supabase), hors du périmètre
-- de l'introspection du schéma `public` qui a servi à cloner dev
-- (CLAUDE.md § Environnements — dev / prod). Elles avaient été posées
-- sur prod par la migration 20260906_chantier59_realtime_canaux_prives.sql,
-- qui ne les a donc jamais rejouées sur dev.
--
-- Additif et sans risque : ajoute une autorisation là où il n'y en avait
-- aucune, copie conforme de prod. Appliqué et vérifié (pg_policies) sur
-- dev le 2026-09-26, dans le cadre du chantier de suivi dev/prod.
-- =============================================================

CREATE POLICY ecclesia_realtime_read ON realtime.messages
  FOR SELECT
  USING (can_join_realtime_topic((select realtime.topic())));

CREATE POLICY ecclesia_realtime_write ON realtime.messages
  FOR INSERT
  WITH CHECK (extension = 'broadcast' AND can_join_realtime_topic((select realtime.topic())));
