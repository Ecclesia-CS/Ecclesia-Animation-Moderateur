-- Migration: ecclesia_experience + fix consensus_score formula
-- Branch: a — 2026-05-31

-- 1. Add ecclesia_experience column to entry_responses
ALTER TABLE entry_responses
  ADD COLUMN IF NOT EXISTS ecclesia_experience text
    CHECK (ecclesia_experience IN ('never', 'once_twice', 'several_times'));

-- 2. Update submit_entry_response to accept the new parameter
CREATE OR REPLACE FUNCTION submit_entry_response(
  p_session_id          uuid,
  p_consent_transcript  boolean,
  p_group_size_pref     text,
  p_moderator_pref      boolean,
  p_openness_to_diff    int,
  p_participation_style text,
  p_ecclesia_experience text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_member_id uuid;
  v_response  entry_responses%ROWTYPE;
BEGIN
  SELECT id INTO v_member_id
  FROM session_members
  WHERE session_id = p_session_id AND user_id = auth.uid()
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Vous n''êtes pas inscrit à cette séance';
  END IF;

  INSERT INTO entry_responses(
    session_id, member_id,
    consent_transcript, group_size_pref, moderator_pref,
    openness_to_diff, participation_style, ecclesia_experience
  ) VALUES (
    p_session_id, v_member_id,
    p_consent_transcript, p_group_size_pref, p_moderator_pref,
    p_openness_to_diff, p_participation_style, p_ecclesia_experience
  )
  ON CONFLICT (session_id, member_id) DO UPDATE SET
    consent_transcript  = EXCLUDED.consent_transcript,
    group_size_pref     = EXCLUDED.group_size_pref,
    moderator_pref      = EXCLUDED.moderator_pref,
    openness_to_diff    = EXCLUDED.openness_to_diff,
    participation_style = EXCLUDED.participation_style,
    ecclesia_experience = EXCLUDED.ecclesia_experience
  RETURNING * INTO v_response;

  RETURN to_jsonb(v_response);
END;
$$;

-- 3. Fix get_vote_results: consensus_score = domination d'un côté × taux de participation
--    Ancienne formule : (1 - |agree-disagree|/(agree+disagree)) × … → élevé quand divisé (= dissensus)
--    Nouvelle formule : |agree-disagree|/(agree+disagree) × (total_votes/member_count) × 100
--    → élevé quand une direction domine fortement ET beaucoup de gens ont voté
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
      -- consensus_score : domination d'un camp × participation
      -- NULL si aucun vote agree/disagree (que des pass ou pas de vote)
      ROUND(
        (ABS(
          COUNT(av.id) FILTER (WHERE av.vote = 'agree') -
          COUNT(av.id) FILTER (WHERE av.vote = 'disagree')
        )::float / NULLIF(
          COUNT(av.id) FILTER (WHERE av.vote = 'agree') +
          COUNT(av.id) FILTER (WHERE av.vote = 'disagree'),
          0
        )) *
        (COUNT(av.id)::float / NULLIF(v_member_count, 0)) * 100
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
