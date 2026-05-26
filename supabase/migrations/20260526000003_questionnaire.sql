-- Migration 20260526000003 — Table questionnaire_responses + fonction submit_questionnaire

CREATE TABLE questionnaire_responses (
  id               uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id         uuid     REFERENCES tables(id)   ON DELETE SET NULL,
  session_id       uuid     REFERENCES sessions(id) ON DELETE SET NULL,
  user_id          uuid     NOT NULL DEFAULT auth.uid(),
  theme_ideas      text,
  theme_ratings    jsonb    NOT NULL DEFAULT '{}',
  debate_attended  text,
  debate_rating    smallint CHECK (debate_rating BETWEEN 0 AND 5),
  staff_interest   text,
  feedback         text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Un user ne peut répondre qu'une fois par table (upsert possible)
CREATE UNIQUE INDEX questionnaire_responses_user_table_idx
  ON questionnaire_responses (user_id, table_id)
  WHERE table_id IS NOT NULL;

-- RLS : activé, lecture seule de ses propres réponses
ALTER TABLE questionnaire_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY qr_select ON questionnaire_responses
  FOR SELECT USING (user_id = auth.uid());

-- INSERT/UPDATE uniquement via la fonction SECURITY DEFINER ci-dessous

-- ── Fonction submit_questionnaire ─────────────────────────────────────────────
-- Upsert : crée ou met à jour la réponse du user courant pour une table donnée.
-- Retourne la ligne résultante.

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
    theme_ideas     = EXCLUDED.theme_ideas,
    theme_ratings   = EXCLUDED.theme_ratings,
    debate_attended = EXCLUDED.debate_attended,
    debate_rating   = EXCLUDED.debate_rating,
    staff_interest  = EXCLUDED.staff_interest,
    feedback        = EXCLUDED.feedback
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;
