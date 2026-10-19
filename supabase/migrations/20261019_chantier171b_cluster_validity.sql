-- =============================================================
-- Chantier 171b — fiabilité des camps enregistrée avec l'analyse
-- =============================================================
-- Le chantier 171 calcule, à chaque analyse, un test « un seul groupe »
-- (permutation des colonnes) et une stabilité par sous-échantillonnage
-- (`AnalysisResult.validity`, src/lib/analysis.ts). Faute de colonne, ce
-- verdict disparaissait au rechargement de l'onglet Analyse et les
-- participants ne le voyaient jamais.
--
-- 1. Colonne `session_analysis.cluster_validity` (jsonb, NULL pour toutes les
--    analyses antérieures et pour celles des RPC héritées run_clustering_v1/v2).
--    Contenu = l'objet ClusterValidity tel quel :
--      { silhouette, nullSilhouette95, pValue, replicates, stabilityAri,
--        stabilityReplicates, verdict: 'nets' | 'fragiles' | 'absents' }
-- 2. save_analysis : 10e paramètre `p_cluster_validity jsonb DEFAULT NULL`.
-- 3. get_latest_analysis / get_analysis_by_id : renvoient `cluster_validity`.
-- 4. get_results_map : renvoie `pca_variance_explained` et `cluster_validity`.
--
-- ⚠️ Règle SQL de CLAUDE.md : ces quatre fonctions ont été réécrites en base
-- par des chantiers dont les fichiers ne reflètent pas le corps courant (le
-- chantier 135 a remplacé le contrôle superadmin par check_session_admin /
-- check_analysis_admin par réécriture textuelle). On ne repart donc d'AUCUN
-- fichier : chaque fonction est relue par pg_get_functiondef et modifiée en
-- place par un remplacement ciblé, qui doit trouver son motif exactement une
-- fois — sinon la migration échoue et rien n'est appliqué (même procédé que
-- la section 8 du chantier 135).
--
-- Changer le nombre d'arguments de save_analysis crée une surcharge au lieu
-- de remplacer (piège du chantier 70) : l'ancienne signature est supprimée
-- après création de la nouvelle, et ses droits d'exécution sont recopiés.
-- =============================================================

-- ── 1. Colonne ───────────────────────────────────────────────
ALTER TABLE public.session_analysis
  ADD COLUMN IF NOT EXISTS cluster_validity jsonb;

COMMENT ON COLUMN public.session_analysis.cluster_validity IS
  'Chantier 171b — fiabilité des camps (test « un seul groupe » + stabilité), objet ClusterValidity de src/lib/analysis.ts. NULL pour les analyses antérieures.';

-- ── Outil : remplacement unique dans une définition ──────────
CREATE OR REPLACE FUNCTION pg_temp.c171b_patch(p_def text, p_fn text, p_pattern text, p_replacement text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM regexp_matches(p_def, p_pattern, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Chantier 171b : % — motif « % » trouvé % fois (attendu : 1), réécriture annulée', p_fn, p_pattern, v_n;
  END IF;
  RETURN regexp_replace(p_def, p_pattern, p_replacement);
END;
$$;

-- ── 2. save_analysis ─────────────────────────────────────────
DO $$
DECLARE
  c_old constant regprocedure :=
    'public.save_analysis(text, uuid, integer, double precision, jsonb, jsonb, jsonb, jsonb, text)'::regprocedure;
  v_def  text := pg_get_functiondef(c_old);
  v_acl  aclitem[];
  r      record;
BEGIN
  SELECT proacl INTO v_acl FROM pg_proc WHERE oid = c_old;

  v_def := pg_temp.c171b_patch(v_def, 'save_analysis (signature)',
    'p_vote_scope text DEFAULT ''current''::text\)',
    'p_vote_scope text DEFAULT ''current''::text, p_cluster_validity jsonb DEFAULT NULL::jsonb)');
  v_def := pg_temp.c171b_patch(v_def, 'save_analysis (colonnes)',
    'status, vote_scope(\s*)\)',
    'status, vote_scope, cluster_validity\1)');
  v_def := pg_temp.c171b_patch(v_def, 'save_analysis (valeurs)',
    '''done'', p_vote_scope(\s*)\)',
    '''done'', p_vote_scope, p_cluster_validity\1)');

  EXECUTE v_def;
  EXECUTE 'DROP FUNCTION ' || c_old::text;

  -- Droits : recopier exactement ceux de l'ancienne signature.
  -- proacl NULL = droits par défaut (EXECUTE à PUBLIC) : rien à retirer.
  IF v_acl IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.save_analysis(text, uuid, integer, double precision, jsonb, jsonb, jsonb, jsonb, text, jsonb) FROM PUBLIC, anon, authenticated';
    FOR r IN
      SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(g.rolname) END AS who
      FROM aclexplode(v_acl) a
      LEFT JOIN pg_roles g ON g.oid = a.grantee
      WHERE a.privilege_type = 'EXECUTE'
    LOOP
      EXECUTE 'GRANT EXECUTE ON FUNCTION public.save_analysis(text, uuid, integer, double precision, jsonb, jsonb, jsonb, jsonb, text, jsonb) TO ' || r.who;
    END LOOP;
  END IF;
END $$;

-- ── 3. get_latest_analysis / get_analysis_by_id ──────────────
-- Même signature : CREATE OR REPLACE conserve les droits.
DO $$
DECLARE
  v_fn  text;
  v_def text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['public.get_latest_analysis(text, uuid)', 'public.get_analysis_by_id(text, uuid)'] LOOP
    v_def := pg_temp.c171b_patch(pg_get_functiondef(v_fn::regprocedure), v_fn,
      '''vote_scope'',(\s*)v_analysis\.vote_scope,',
      '''vote_scope'',\1v_analysis.vote_scope,
    ''cluster_validity'', v_analysis.cluster_validity,');
    EXECUTE v_def;
  END LOOP;
END $$;

-- ── 4. get_results_map ───────────────────────────────────────
-- Variance expliquée (lecture honnête de la carte) et verdict : les écrans
-- participant n'affichent pas de camps quand le verdict est 'absents'.
DO $$
BEGIN
  EXECUTE pg_temp.c171b_patch(pg_get_functiondef('public.get_results_map(uuid, uuid)'::regprocedure),
    'get_results_map',
    '''repness'',(\s*)v_analysis\.repness,',
    '''pca_variance_explained'', v_analysis.pca_variance_explained,
    ''cluster_validity'', v_analysis.cluster_validity,
    ''repness'',\1v_analysis.repness,');
END $$;

-- =============================================================
-- ROLLBACK (manuel, dans cet ordre)
-- =============================================================
-- Retirer les deux clés de get_latest_analysis / get_analysis_by_id /
-- get_results_map par le même procédé (pg_get_functiondef + remplacement),
-- puis recréer save_analysis à 9 arguments (pg_get_functiondef de la version
-- à 10, sans p_cluster_validity), DROP de la version à 10, recopie des droits,
-- et enfin :
-- ALTER TABLE public.session_analysis DROP COLUMN cluster_validity;
