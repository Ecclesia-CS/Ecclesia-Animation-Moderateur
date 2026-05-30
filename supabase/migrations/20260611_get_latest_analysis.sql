-- =============================================================
-- get_latest_analysis : RPC de lecture de la dernière analyse
-- Retourne null si aucune analyse 'done' n'existe pour la session.
-- =============================================================

CREATE OR REPLACE FUNCTION get_latest_analysis(
  p_password   text,
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_analysis session_analysis%ROWTYPE;
  v_members  jsonb;
BEGIN
  PERFORM check_superadmin_password(p_password);

  SELECT * INTO v_analysis
  FROM session_analysis
  WHERE session_id = p_session_id
    AND status = 'done'
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'member_id', am.member_id,
    'pca_x',     am.pca_x,
    'pca_y',     am.pca_y,
    'group_id',  am.group_id
  )) INTO v_members
  FROM analysis_members am
  WHERE am.analysis_id = v_analysis.id;

  RETURN jsonb_build_object(
    'id',                     v_analysis.id,
    'k_chosen',               v_analysis.k_chosen,
    'silhouette_score',       v_analysis.silhouette_score,
    'pca_variance_explained', v_analysis.pca_variance_explained,
    'repness',                v_analysis.repness,
    'group_consensus',        v_analysis.group_consensus,
    'created_at',             v_analysis.created_at,
    'members',                COALESCE(v_members, '[]'::jsonb)
  );
END;
$$;
