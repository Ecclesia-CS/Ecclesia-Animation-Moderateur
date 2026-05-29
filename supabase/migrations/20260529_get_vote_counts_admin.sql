-- Counts votes for ALL assertions (regardless of status) — admin only
DROP FUNCTION IF EXISTS get_vote_counts_admin(text, uuid);

CREATE OR REPLACE FUNCTION get_vote_counts_admin(p_password text, p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_member_count int;
  v_results      jsonb;
BEGIN
  PERFORM check_superadmin_password(p_password);

  SELECT COUNT(DISTINCT sm.id)
  INTO v_member_count
  FROM session_members sm
  WHERE sm.session_id = p_session_id;

  SELECT jsonb_agg(r)
  INTO v_results
  FROM (
    SELECT
      a.id,
      COUNT(av.id) FILTER (WHERE av.vote = 'agree')    AS agree_count,
      COUNT(av.id) FILTER (WHERE av.vote = 'disagree') AS disagree_count,
      COUNT(av.id) FILTER (WHERE av.vote = 'pass')     AS pass_count,
      COUNT(av.id)                                      AS total_votes,
      ROUND(
        (ABS(
          COUNT(av.id) FILTER (WHERE av.vote = 'agree') -
          COUNT(av.id) FILTER (WHERE av.vote = 'disagree')
        )::numeric / NULLIF(
          COUNT(av.id) FILTER (WHERE av.vote = 'agree') +
          COUNT(av.id) FILTER (WHERE av.vote = 'disagree'),
          0
        )) *
        (COUNT(av.id)::numeric / NULLIF(v_member_count, 0)) * 100
      , 2) AS consensus_score
    FROM assertions a
    LEFT JOIN assertion_votes av ON av.assertion_id = a.id
    WHERE a.session_id = p_session_id
    GROUP BY a.id
  ) r;

  RETURN COALESCE(v_results, '[]'::jsonb);
END;
$$;
