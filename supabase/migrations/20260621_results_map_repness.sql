-- =============================================================
-- Enrichissement de get_results_map :
-- ajout de repness, group_consensus et all_assertions
-- pour afficher les assertions caractéristiques par groupe
-- et les points de clivage dans ResultsMapScreen (vue participant).
-- =============================================================

CREATE OR REPLACE FUNCTION get_results_map(
  p_session_id uuid,
  p_member_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_analysis session_analysis%ROWTYPE;
BEGIN
  -- La session doit être closed
  IF NOT EXISTS (
    SELECT 1 FROM sessions
    WHERE id = p_session_id AND phase = 'closed'
  ) THEN
    RETURN NULL;
  END IF;

  -- Sécurité : vérifier que p_member_id appartient bien à auth.uid()
  IF NOT EXISTS (
    SELECT 1 FROM session_members
    WHERE id = p_member_id AND user_id = auth.uid()
  ) THEN
    RETURN NULL;
  END IF;

  -- Dernière analyse done
  SELECT * INTO v_analysis
  FROM session_analysis
  WHERE session_id = p_session_id AND status = 'done'
  ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'k_chosen', v_analysis.k_chosen,
    'points', (
      SELECT jsonb_agg(jsonb_build_object(
        'pca_x',    am.pca_x,
        'pca_y',    am.pca_y,
        'group_id', am.group_id,
        'is_self',  (am.member_id = p_member_id)
      ))
      FROM analysis_members am
      WHERE am.analysis_id = v_analysis.id
    ),
    'consensus', (
      SELECT jsonb_agg(
        jsonb_build_object('content', a.content, 'score', gc.score)
        ORDER BY gc.score DESC
      )
      FROM (
        SELECT key::uuid AS assertion_id, value::float AS score
        FROM jsonb_each_text(v_analysis.group_consensus)
        WHERE value::float > 0.5
      ) gc
      JOIN assertions a ON a.id = gc.assertion_id
    ),
    'repness',         v_analysis.repness,
    'group_consensus', v_analysis.group_consensus,
    'all_assertions', (
      SELECT jsonb_object_agg(a.id::text, a.content)
      FROM assertions a
      WHERE a.session_id = p_session_id
        AND a.status = 'approved'
    )
  );
END;
$$;
