-- Correctif d'environnement DEV (découvert en préparant le chantier 131, sans rapport
-- avec un chantier fonctionnel précis) — pas de "chantier N" associé, voir A_VERIFIER.md.
--
-- Constat : sur le projet Supabase dev (mnjqrlrrzrycuconlfqb, cloné le 2026-09-25 par
-- introspection de l'état courant de prod), AUCUNE table `public` n'avait de GRANT
-- pour anon/authenticated/service_role — seul `postgres` (propriétaire) en avait.
-- Confirmé par comparaison directe avec prod (plpjiehqsxxakbuykmkm) :
--   - information_schema.role_table_grants : 274 lignes sur prod pour anon/authenticated,
--     0 sur dev.
--   - pg_default_acl (schéma public) : sur prod, `ALTER DEFAULT PRIVILEGES FOR ROLE
--     postgres IN SCHEMA public GRANT ALL ON TABLES/SEQUENCES TO anon, authenticated,
--     service_role` est actif ; sur dev, cette table catalogue est entièrement VIDE.
--
-- Cause probable : le clone du 25/09 a reproduit tables/contraintes/index/policies RLS/
-- fonctions et droits d'EXÉCUTION des fonctions (chantiers 102/103, ceux-ci apparaissent
-- comme des GRANT EXECUTE explicites dans le corps même des migrations rejouées), mais
-- les GRANT au niveau TABLE ne sont jamais écrits dans une migration versionnée sur ce
-- projet — ils proviennent uniquement du bootstrap automatique de Supabase à la création
-- d'un projet (ALTER DEFAULT PRIVILEGES posé une fois, hors de tout fichier de migration).
-- Une introspection qui rejoue le schéma sans repartir de ce bootstrap-là ne peut pas le
-- deviner. Résultat concret : TOUT accès `supabase.from(...)` échouait avec
-- "permission denied for table …" sur dev, RLS ou pas — bloquant, pour n'importe quel
-- chantier, toute vérification navigateur sur cet environnement.
--
-- Correctif : réplique exactement le modèle prod (grants larges + RLS comme vraie porte,
-- cf. CLAUDE.md § Sécurité) — sur les tables/séquences EXISTANTES, et pour toute
-- table/séquence FUTURE créée par une migration ultérieure (ALTER DEFAULT PRIVILEGES).
-- Confirmé par Jules avant application (2026-09-26).

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
