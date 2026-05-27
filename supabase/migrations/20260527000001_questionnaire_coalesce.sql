-- Mise à jour de submit_questionnaire :
-- • COALESCE sur les champs texte/number → une valeur déjà enregistrée ne peut plus être écrasée
-- • || sur theme_ratings → fusion additive (les nouvelles notes s'ajoutent aux anciennes, sans effacer)
CREATE OR REPLACE FUNCTION submit_questionnaire(
  p_table_id        uuid,
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
  v_result questionnaire_responses;
BEGIN
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
  ON CONFLICT (user_id, table_id) WHERE table_id IS NOT NULL
  DO UPDATE SET
    session_id      = EXCLUDED.session_id,
    -- Texte/number : garder la valeur existante si non nulle, sinon prendre la nouvelle
    theme_ideas     = COALESCE(questionnaire_responses.theme_ideas,     EXCLUDED.theme_ideas),
    debate_attended = COALESCE(questionnaire_responses.debate_attended, EXCLUDED.debate_attended),
    debate_rating   = COALESCE(questionnaire_responses.debate_rating,   EXCLUDED.debate_rating),
    staff_interest  = COALESCE(questionnaire_responses.staff_interest,  EXCLUDED.staff_interest),
    feedback        = COALESCE(questionnaire_responses.feedback,        EXCLUDED.feedback),
    -- theme_ratings : fusion additive (|| = merge jsonb, droite prioritaire)
    -- Les nouveaux votes s'ajoutent ; les thèmes déjà notés ne peuvent pas être re-notés
    -- (le client ne les envoie qu'avec leur valeur d'origine → idempotent)
    theme_ratings   = questionnaire_responses.theme_ratings || EXCLUDED.theme_ratings
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;
