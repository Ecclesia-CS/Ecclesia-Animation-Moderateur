-- Chantier 105 — reconsigne dans une migration du dépôt la restriction de colonne
-- posée par le chantier 51 (20260902171240_chantier51_hide_assertion_author.sql) sur
-- `assertions`, qui n'existait qu'en base (posée par GRANT, hors fichier de migration
-- reproductible). État vérifié en base le 2026-09-20 avant cette migration :
-- SELECT sur `member_id` n'était PAS accordé à anon/authenticated (la restriction
-- tenait déjà) — mais rien dans le dépôt ne le garantissait pour l'avenir.
--
-- Piste retenue pour « comment le grant a pu être rétabli » (à confirmer avec Jules,
-- entrée ouverte dans A_VERIFIER.md) : ce projet a des privilèges par défaut
-- (`ALTER DEFAULT PRIVILEGES ... IN SCHEMA public`, posés par postgres/supabase_admin
-- à la création du projet) qui accordent TOUS les privilèges — SELECT compris, sur
-- toutes les colonnes — à anon/authenticated sur toute table NOUVELLEMENT CRÉÉE dans
-- `public`. Si `assertions` a un jour été recréée (DROP+CREATE, ou une opération de
-- l'éditeur de table du dashboard Supabase qui reconstruit la table en coulisse pour
-- certains changements de colonne), ce privilège par défaut réapplique un SELECT
-- plein sur toutes les colonnes, effaçant silencieusement la restriction posée par
-- GRANT — sans laisser aucune trace dans l'historique de migrations. Idempotent :
-- rejouable sans effet si l'état est déjà correct.

REVOKE SELECT ON assertions FROM anon, authenticated;
GRANT SELECT (id, session_id, content, status, created_at)
  ON assertions TO anon, authenticated;
