-- =============================================================
-- Ajout de la politique de modération 'ai'
-- 1. Mise à jour du CHECK constraint sur sessions
-- 2. Correction de update_session_config (validation hardcodée)
-- =============================================================

-- ── 1. CHECK constraint ───────────────────────────────────────
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_moderation_policy_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_moderation_policy_check
  CHECK (moderation_policy IN ('open', 'closed', 'ai'));

-- ── 2. update_session_config — accepte maintenant 'ai' ────────
CREATE OR REPLACE FUNCTION update_session_config(
  p_password               text,
  p_session_id             uuid,
  p_moderation_policy      text,
  p_vote_timer_minutes     int,
  p_vote_threshold_percent int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash text;
  v_row  sessions%ROWTYPE;
BEGIN
  SELECT value INTO v_hash FROM app_config WHERE key = 'superadmin_code_hash';
  IF NOT crypt(p_password, v_hash) = v_hash THEN
    RAISE EXCEPTION 'Mot de passe superadmin incorrect';
  END IF;

  IF p_moderation_policy NOT IN ('open', 'closed', 'ai') THEN
    RAISE EXCEPTION 'moderation_policy invalide: %', p_moderation_policy;
  END IF;

  UPDATE sessions
  SET
    moderation_policy      = p_moderation_policy,
    vote_timer_minutes     = p_vote_timer_minutes,
    vote_threshold_percent = p_vote_threshold_percent
  WHERE id = p_session_id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;
