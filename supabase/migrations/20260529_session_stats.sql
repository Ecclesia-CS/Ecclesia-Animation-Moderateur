-- ============================================================
-- get_session_member_counts : nb de membres par séance
-- ============================================================
DROP FUNCTION IF EXISTS get_session_member_counts(text);

CREATE OR REPLACE FUNCTION get_session_member_counts(p_password text)
RETURNS TABLE (session_id uuid, cnt bigint)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM check_superadmin_password(p_password);
  RETURN QUERY
    SELECT sm.session_id, COUNT(*)::bigint
    FROM session_members sm
    GROUP BY sm.session_id;
END;
$$;

-- ============================================================
-- get_vote_results_all : assertions approuvées de toutes les
-- séances, avec consensus_score (même formule que get_vote_results)
-- ============================================================
DROP FUNCTION IF EXISTS get_vote_results_all(text);

CREATE OR REPLACE FUNCTION get_vote_results_all(p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_results jsonb;
BEGIN
  PERFORM check_superadmin_password(p_password);

  SELECT jsonb_agg(r ORDER BY r.session_created_at DESC, r.consensus_score DESC NULLS LAST)
  INTO v_results
  FROM (
    SELECT
      a.id,
      a.session_id,
      s.title           AS session_title,
      s.created_at      AS session_created_at,
      a.content,
      a.status,
      COUNT(av.id) FILTER (WHERE av.vote = 'agree')     AS agree_count,
      COUNT(av.id) FILTER (WHERE av.vote = 'disagree')  AS disagree_count,
      COUNT(av.id) FILTER (WHERE av.vote = 'pass')      AS pass_count,
      COUNT(av.id)                                       AS total_votes,
      ROUND(
        (ABS(
          COUNT(av.id) FILTER (WHERE av.vote = 'agree') -
          COUNT(av.id) FILTER (WHERE av.vote = 'disagree')
        )::float / NULLIF(
          COUNT(av.id) FILTER (WHERE av.vote = 'agree') +
          COUNT(av.id) FILTER (WHERE av.vote = 'disagree'),
          0
        )) *
        (COUNT(av.id)::float / NULLIF(
          (SELECT COUNT(*) FROM session_members sm WHERE sm.session_id = a.session_id),
          0
        )) * 100
      , 2) AS consensus_score
    FROM assertions a
    JOIN sessions s ON s.id = a.session_id
    LEFT JOIN assertion_votes av ON av.assertion_id = a.id
    WHERE a.status = 'approved'
    GROUP BY a.id, s.id
  ) r;

  RETURN COALESCE(v_results, '[]'::jsonb);
END;
$$;
