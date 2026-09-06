-- =============================================================
-- Chantier 72 (2/4) — Sans onboarding : « actif » par défaut
--
-- RETOUR BRUT DE JULES
-- ---------------------
-- « J'aimerai que les gens sans onboarding soient traités comme actif
--   plutôt que passif : c'est plus probable l'un que l'autre. »
--
-- CE QUI CHANGE — UNE SEULE LIGNE, UN SEUL CAS
-- =============================================================
-- `get_allocation_inputs` (dernière définition :
-- 20260725_2_allocation_v2.sql, section 3 — jamais redéfinie depuis,
-- vérification faite par le chantier 71 et refaite ici par grep sur
-- l'ensemble de supabase/migrations/) faisait :
--
--   COALESCE(er.participation_style = 'active', false) AS is_active
--
-- avec le commentaire « Sans onboarding : non-actif, non-consentant,
-- nouveau (conservateur, §6) ». Jules renverse ce choix pour le seul
-- `is_active`. Nouvelle expression :
--
--   COALESCE(er.participation_style = 'active', true)  AS is_active
--
-- Sémantique exacte du COALESCE, à ne pas confondre :
--   · ligne `entry_responses` absente  → `er.participation_style` NULL →
--     l'égalité vaut NULL → COALESCE prend le défaut. C'EST LE SEUL CAS
--     QUI CHANGE (false → true).
--   · a répondu 'active'   → l'égalité vaut true  → inchangé (actif).
--   · a répondu 'listener' → l'égalité vaut FALSE (pas NULL) → COALESCE
--     n'intervient pas → inchangé (passif). Quelqu'un qui s'est déclaré
--     auditeur reste auditeur, comme demandé explicitement.
-- La colonne est `NOT NULL` avec un CHECK sur ('listener','active')
-- (20260528_voting_app.sql) : il n'existe pas de troisième valeur ni de
-- NULL en base, la seule source de NULL est le LEFT JOIN sans ligne.
--
-- `consents` et `is_veteran` NE CHANGENT PAS : rien dans la demande ne les
-- concerne, et leurs défauts `false` sont porteurs de sens (on n'enregistre
-- pas quelqu'un qui n'a pas consenti ; on ne compte pas comme « ancien »
-- quelqu'un dont on ignore tout).
--
-- PORTÉE DU CHANGEMENT — RÈGLE 1 DE L'ALLOCATION
-- =============================================================
-- `is_active` alimente la règle 1 de l'allocation v2 (« actifs ≥
-- min(⌈2/5·taille⌉, 4) »), la règle la plus prioritaire de l'ordre
-- lexicographique. Effet attendu : avec l'onboarding désactivé
-- (chantier 71) ou peu rempli, tout le monde comptait auparavant comme
-- passif, la règle 1 était insatisfaisable partout et ne discriminait donc
-- plus rien. Avec ce changement elle est satisfaite partout — l'algorithme
-- se règle alors sur les règles suivantes plutôt que de gaspiller son
-- budget de recherche sur un objectif hors d'atteinte.
--
-- AUTRES LECTEURS DE LA MÊME SUPPOSITION — INVENTAIRE
-- =============================================================
-- Recherche exhaustive sur `participation_style` dans supabase/ et src/ :
--
--  1. `src/lib/allocation.ts`, l. 185 — commentaire de doc du champ
--     `isActive` : « `participation_style === 'active'`. Sans onboarding →
--     false (conservateur, §6). » Le commentaire devient FAUX après cette
--     migration : le défaut est désormais posé côté SQL et vaut `true`.
--     Le code TypeScript, lui, ne fait aucune supposition — il consomme
--     le booléen déjà résolu par `get_allocation_inputs`, il n'y a aucune
--     ligne de logique à changer. ⚠️ CE FICHIER EST HORS PÉRIMÈTRE
--     (piloté par une autre conversation, cf. CLAUDE.md « Ne jamais
--     faire ») : le commentaire n'est PAS corrigé ici. Signalé à Jules
--     dans le compte rendu et dans A_VERIFIER.md.
--
--  2. `run_clustering_v3` (20260721_clustering_v3.sql, l. 81 et 100) —
--     trie les membres par `COALESCE(er.participation_style, 'zzz')`,
--     c'est-à-dire place les membres sans onboarding EN DERNIER du
--     round-robin ('zzz' > 'listener' > 'active'), sans jamais les
--     assimiler à l'un ou à l'autre. Ce n'est donc pas la même supposition,
--     et surtout : cette fonction n'est plus appelée par le frontend
--     (comme run_clustering_v1/v2 — chantier 37, wrappers et ClusteringModal
--     supprimés). NON TOUCHÉE, délibérément : la modifier reviendrait à
--     réanimer un chemin mort.
--
--  3. `get_table_opinion_summary`, `run_clustering_v1/v2` — ne lisent pas
--     `participation_style` du tout (vérifié par grep). Sans objet.
--
-- PIÈGES DU PROJET (CLAUDE.md) — traités
-- =============================================================
--   · Signature `(text, uuid)` et type de retour `jsonb` INCHANGÉS →
--     `CREATE OR REPLACE` suffit, aucune surcharge possible, pas de
--     `DROP FUNCTION` nécessaire.
--   · `SET search_path = public, extensions` ajouté (la fonction n'en
--     avait aucun, alors qu'elle appelle `check_superadmin_password`, qui
--     fait `crypt()` — symptôme classique : « mot de passe incorrect »
--     trompeur).
--   · Corps recopié depuis 20260725_2_allocation_v2.sql, section 3, et
--     modifié sur la seule ligne `is_active`. VÉRIFIER AVANT D'APPLIQUER
--     que la base ne contient pas une version plus récente (cette session
--     n'avait pas d'accès MCP Supabase) :
--       SELECT pg_get_functiondef('get_allocation_inputs(text,uuid)'::regprocedure);
-- =============================================================

CREATE OR REPLACE FUNCTION get_allocation_inputs(
  p_password   text,
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_analysis_id uuid;
  v_members     jsonb;
BEGIN
  PERFORM check_superadmin_password(p_password);

  SELECT id INTO v_analysis_id
  FROM session_analysis
  WHERE session_id = p_session_id
    AND status = 'done'
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at, t.member_id), '[]'::jsonb)
    INTO v_members
  FROM (
    SELECT
      sm.id                                  AS member_id,
      sm.pseudo,
      sm.is_moderator,
      sm.created_at,
      -- Chantier 72 — sans onboarding : ACTIF par défaut (« c'est plus
      -- probable l'un que l'autre », Jules). Un 'listener' explicite reste
      -- passif : l'égalité vaut alors false, pas NULL, le COALESCE
      -- n'intervient pas.
      COALESCE(er.participation_style = 'active', true)  AS is_active,
      -- Inchangés : sans onboarding on ne présume ni le consentement à
      -- l'enregistrement, ni l'ancienneté.
      COALESCE(er.consent_transcript, false)             AS consents,
      COALESCE(er.ecclesia_experience, false)            AS is_veteran,
      am.group_id
    FROM session_members sm
    LEFT JOIN entry_responses er
      ON er.member_id = sm.id
     AND er.session_id = p_session_id
    LEFT JOIN analysis_members am
      ON am.member_id = sm.id
     AND am.analysis_id = v_analysis_id
    WHERE sm.session_id = p_session_id
      AND sm.attending_in_person = true
  ) t;

  RETURN jsonb_build_object(
    'members',            v_members,
    'opinions_available', (v_analysis_id IS NOT NULL),
    'analysis_id',        v_analysis_id
  );
END;
$fn$;

COMMENT ON FUNCTION get_allocation_inputs(text, uuid) IS
  'Chantier 19, amendée 72 — entrées de l''allocation v2 en un aller-retour. '
  'Chantier 72 : un membre sans ligne entry_responses est désormais compté '
  'ACTIF (is_active = true) et non plus passif ; consents et is_veteran '
  'restent à false par défaut. Un membre ayant répondu ''listener'' reste '
  'passif.';

GRANT EXECUTE ON FUNCTION get_allocation_inputs(text, uuid) TO anon, authenticated;


-- =============================================================
-- REQUÊTES DE VÉRIFICATION (après application)
-- =============================================================
--
-- 1. Signature unique, search_path posé :
--    SELECT pg_get_function_identity_arguments(p.oid), p.proconfig
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'get_allocation_inputs';
--    → 1 ligne, 'text, uuid', {"search_path=public, extensions"}
--
-- 2. Les trois cas de is_active, sur une séance réelle :
--    SELECT m->>'pseudo', m->>'is_active'
--    FROM jsonb_array_elements(
--           (get_allocation_inputs('<mdp>', '<SESSION_ID>'))->'members'
--         ) m;
--    -- croiser avec :
--    SELECT sm.pseudo, er.participation_style
--    FROM session_members sm
--    LEFT JOIN entry_responses er ON er.member_id = sm.id AND er.session_id = sm.session_id
--    WHERE sm.session_id = '<SESSION_ID>' AND sm.attending_in_person;
--    → participation_style NULL     ⇒ is_active true  (CHANGÉ)
--    → participation_style 'active' ⇒ is_active true  (inchangé)
--    → participation_style 'listener' ⇒ is_active false (inchangé — le
--      point à vérifier en priorité, c'est la seule non-régression qui
--      compte ici)
--
-- =============================================================
-- SQL D'ANNULATION (rollback)
-- =============================================================
--   Recopier ce même corps en remplaçant la ligne is_active par
--   `COALESCE(er.participation_style = 'active', false) AS is_active`
--   (ou recopier la fonction depuis 20260725_2_allocation_v2.sql,
--   section 3 — le rollback complet perdrait alors le SET search_path
--   ajouté ici, ce qui est sans conséquence : c'était l'état antérieur).
-- =============================================================
