-- Chantier 56 — durcissement SQL ciblé (search_path + app_config/assertion_merges)
-- Seconde barrière indépendante sur les tables à zéro policy (RLS activée sans policy = refus déjà en place).
REVOKE ALL ON app_config       FROM anon, authenticated;
REVOKE ALL ON assertion_merges FROM anon, authenticated;

-- search_path figé sur les fonctions qui manipulent les secrets (crypt() exige public, extensions).
-- Signatures vérifiées en base au préalable (pg_get_function_identity_arguments) — reclaim_moderator a 2 surcharges.
ALTER FUNCTION check_superadmin_password(text) SET search_path = public, extensions;
ALTER FUNCTION create_table(text, text, uuid, boolean) SET search_path = public, extensions;
ALTER FUNCTION reclaim_moderator(text, text) SET search_path = public, extensions;
ALTER FUNCTION reclaim_moderator(text, text, text) SET search_path = public, extensions;
ALTER FUNCTION claim_moderator_status(uuid, text, text, text) SET search_path = public, extensions;
ALTER FUNCTION set_session_results_public(text, uuid, boolean) SET search_path = public, extensions;
-- get_public_results(uuid) a déjà proconfig = 'search_path=public, extensions' en base — rien à faire.
