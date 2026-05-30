-- =============================================================
-- get_public_results : résumé public des résultats d'une séance clôturée
-- Accessible à tous (aucune auth, aucun mot de passe) mais uniquement
-- si la session est en phase 'closed' ET qu'une analyse 'done' existe.
-- Retourne : k_chosen, groupes (top 3 assertions par repness), consensus.
-- Aucune coordonnée PCA ni member_id exposé — données purement agrégées.
-- =============================================================

CREATE OR REPLACE FUNCTION get_public_results(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_analysis session_analysis%ROWTYPE;
BEGIN
  -- Phase closed obligatoire
  IF NOT EXISTS (
    SELECT 1 FROM sessions
    WHERE id = p_session_id AND phase = 'closed'
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
    'groups', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'group_id', g,
          'top_assertions', (
            SELECT jsonb_agg(row_data ORDER BY (row_data->>'score')::float DESC)
            FROM (
              SELECT jsonb_build_object(
                'content', a.content,
                'score',   (v_analysis.repness -> a.id::text ->> g::text)::float
              ) AS row_data
              FROM assertions a
              WHERE a.session_id = p_session_id
                AND a.status = 'approved'
                AND (v_analysis.repness -> a.id::text ->> g::text) IS NOT NULL
                AND (v_analysis.repness -> a.id::text ->> g::text)::float > 0
              ORDER BY (v_analysis.repness -> a.id::text ->> g::text)::float DESC
              LIMIT 3
            ) sub
          )
        )
      )
      FROM generate_series(0, v_analysis.k_chosen - 1) g
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
    )
  );
END;
$$;
