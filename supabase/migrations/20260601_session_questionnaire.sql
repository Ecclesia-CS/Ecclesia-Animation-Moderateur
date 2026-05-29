-- =============================================================
-- Index unique pour les réponses questionnaire liées à une
-- séance sans table (participants du flux vote).
-- Réécriture de submit_questionnaire pour gérer p_table_id NULL.
-- =============================================================

CREATE UNIQUE INDEX IF NOT EXISTS questionnaire_responses_user_session_idx
  ON questionnaire_responses (user_id, session_id)
  WHERE session_id IS NOT NULL AND table_id IS NULL;

CREATE OR REPLACE FUNCTION submit_questionnaire(
  p_table_id        uuid     DEFAULT NULL,
  p_session_id      uuid     DEFAULT NULL,
  p_theme_ideas     text     DEFAULT NULL,
  p_theme_ratings   jsonb    DEFAULT '{}',
  p_debate_attended text     DEFAULT NULL,
  p_debate_rating   smallint DEFAULT NULL,
  p_staff_interest  text     DEFAULT NULL,
  p_feedback        text     DEFAULT NULL
)
RETURNS questionnaire_responses
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id     uuid;
  v_result questionnaire_responses;
BEGIN
  -- Trouver une réponse existante pour ce user dans ce contexte
  IF p_table_id IS NOT NULL THEN
    SELECT id INTO v_id FROM questionnaire_responses
    WHERE user_id = auth.uid() AND table_id = p_table_id;
  ELSIF p_session_id IS NOT NULL THEN
    SELECT id INTO v_id FROM questionnaire_responses
    WHERE user_id = auth.uid() AND session_id = p_session_id AND table_id IS NULL;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO questionnaire_responses (
      table_id, session_id, user_id,
      theme_ideas, theme_ratings,
      debate_attended, debate_rating,
      staff_interest, feedback
    )
    VALUES (
      p_table_id, p_session_id, auth.uid(),
      p_theme_ideas, COALESCE(p_theme_ratings, '{}'),
      p_debate_attended, p_debate_rating,
      p_staff_interest, p_feedback
    )
    RETURNING * INTO v_result;
  ELSE
    UPDATE questionnaire_responses SET
      theme_ideas     = p_theme_ideas,
      theme_ratings   = COALESCE(p_theme_ratings, '{}'),
      debate_attended = p_debate_attended,
      debate_rating   = p_debate_rating,
      staff_interest  = p_staff_interest,
      feedback        = p_feedback
    WHERE id = v_id
    RETURNING * INTO v_result;
  END IF;

  RETURN v_result;
END;
$$;
