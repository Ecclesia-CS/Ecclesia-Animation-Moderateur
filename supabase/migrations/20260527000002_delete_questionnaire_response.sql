-- Suppression d'une réponse au questionnaire par le superadmin (bypass RLS)
CREATE OR REPLACE FUNCTION delete_questionnaire_response(
  p_password    text,
  p_response_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM check_superadmin_password(p_password);
  DELETE FROM questionnaire_responses WHERE id = p_response_id;
END;
$$;
