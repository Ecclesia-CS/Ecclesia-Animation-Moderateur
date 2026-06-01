-- =============================================================
-- Persistance des noms de groupes Gemini en base
-- Permet aux participants de voir leur nom de groupe dans
-- ResultsMapScreen même quand le localStorage superadmin
-- n'est pas disponible sur leur appareil.
-- =============================================================

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS group_names JSONB DEFAULT '[]'::jsonb;

-- ── RPC superadmin — update_group_names ──────────────────────

CREATE OR REPLACE FUNCTION update_group_names(
  p_password   text,
  p_session_id uuid,
  p_group_names jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash text;
BEGIN
  SELECT value INTO v_hash FROM app_config WHERE key = 'superadmin_code_hash';
  IF NOT crypt(p_password, v_hash) = v_hash THEN
    RAISE EXCEPTION 'Mot de passe superadmin incorrect';
  END IF;

  UPDATE sessions
  SET group_names = p_group_names
  WHERE id = p_session_id;
END;
$$;
