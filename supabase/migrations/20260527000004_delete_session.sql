-- ============================================================
-- delete_session : supprime une séance après vérification du
-- mot de passe superadmin. ON DELETE SET NULL sur tables.session_id
-- détache automatiquement les tables rattachées.
-- ============================================================

DROP FUNCTION IF EXISTS delete_session(text, uuid);

CREATE OR REPLACE FUNCTION delete_session(
  p_password   text,
  p_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM check_superadmin_password(p_password);
  DELETE FROM sessions WHERE id = p_session_id;
END;
$$;
