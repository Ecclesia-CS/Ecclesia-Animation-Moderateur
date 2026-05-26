-- Fonction SECURITY DEFINER permettant au superadmin d'exporter toutes les
-- réponses au questionnaire (bypass RLS) pour une séance donnée ou pour toutes.
CREATE OR REPLACE FUNCTION get_questionnaire_responses(
  p_password   text,
  p_session_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id              uuid,
  created_at      timestamptz,
  session_id      uuid,
  session_title   text,
  table_id        uuid,
  table_join_code text,
  debate_attended text,
  debate_rating   smallint,
  theme_ideas     text,
  theme_ratings   jsonb,
  staff_interest  text,
  feedback        text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM check_superadmin_password(p_password);

  RETURN QUERY
  SELECT
    qr.id,
    qr.created_at,
    qr.session_id,
    s.title          AS session_title,
    qr.table_id,
    t.join_code      AS table_join_code,
    qr.debate_attended,
    qr.debate_rating,
    qr.theme_ideas,
    qr.theme_ratings,
    qr.staff_interest,
    qr.feedback
  FROM questionnaire_responses qr
  LEFT JOIN sessions s ON s.id = qr.session_id
  LEFT JOIN tables   t ON t.id = qr.table_id
  WHERE (p_session_id IS NULL OR qr.session_id = p_session_id)
  ORDER BY qr.created_at ASC;
END;
$$;
