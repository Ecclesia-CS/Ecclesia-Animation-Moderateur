-- Fix : ROUND(double precision, integer) n'existe pas en PostgreSQL.
-- Le résultat du calcul doit être casté en ::numeric avant ROUND(..., 2).
-- Cette erreur faisait planter get_vote_results silencieusement côté client.

CREATE OR REPLACE FUNCTION get_vote_results(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_member_count int;
  v_results      jsonb;
BEGIN
  SELECT COUNT(DISTINCT sm.id) INTO v_member_count
  FROM session_members sm
  WHERE sm.session_id = p_session_id;

  SELECT jsonb_agg(r) INTO v_results
  FROM (
    SELECT
      a.id,
      a.content,
      a.status,
      COUNT(av.id) FILTER (WHERE av.vote = 'agree')     AS agree_count,
      COUNT(av.id) FILTER (WHERE av.vote = 'disagree')  AS disagree_count,
      COUNT(av.id) FILTER (WHERE av.vote = 'pass')      AS pass_count,
      COUNT(av.id)                                       AS total_votes,
      ROUND(
        (
          (ABS(
            COUNT(av.id) FILTER (WHERE av.vote = 'agree') -
            COUNT(av.id) FILTER (WHERE av.vote = 'disagree')
          )::float / NULLIF(
            COUNT(av.id) FILTER (WHERE av.vote = 'agree') +
            COUNT(av.id) FILTER (WHERE av.vote = 'disagree'),
            0
          )) *
          (COUNT(av.id)::float / NULLIF(v_member_count, 0)) * 100
        )::numeric
      , 2) AS consensus_score
    FROM assertions a
    LEFT JOIN assertion_votes av ON av.assertion_id = a.id
    WHERE a.session_id = p_session_id AND a.status = 'approved'
    GROUP BY a.id, a.content, a.status
    ORDER BY consensus_score DESC NULLS LAST
  ) r;

  RETURN COALESCE(v_results, '[]'::jsonb);
END;
$$;
