-- Migration 006 : Correction reclaim_moderator
-- DROP nécessaire car le type de retour change (boolean → jsonb)
-- Migration 005 a changé la contrainte unique participants de (session_id, user_id)
-- vers (session_id, pseudo). reclaim_moderator référençait encore l'ancienne contrainte
-- → PostgreSQL levait une erreur à chaque appel.
-- On en profite pour retourner un jsonb complet (comme join_session) et lever des
-- exceptions avec messages clairs au lieu de retourner false.

DROP FUNCTION IF EXISTS reclaim_moderator(text, text);

CREATE FUNCTION reclaim_moderator(
  p_join_code      text,
  p_moderator_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id     uuid;
  v_old_created_by uuid;
  v_creation_hash  text;
  v_pseudo         text;
  v_participant_id uuid;
  v_result         jsonb;
BEGIN
  SELECT id, created_by
  INTO   v_session_id, v_old_created_by
  FROM   sessions
  WHERE  join_code = upper(p_join_code);

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'Session introuvable (code %)', upper(p_join_code);
  END IF;

  SELECT value INTO v_creation_hash FROM app_config WHERE key = 'creation_code_hash';
  IF crypt(p_moderator_code, v_creation_hash) IS DISTINCT FROM v_creation_hash THEN
    RAISE EXCEPTION 'Code Ecclesia incorrect';
  END IF;

  SELECT pseudo INTO v_pseudo
  FROM   participants
  WHERE  session_id = v_session_id AND user_id = v_old_created_by
  LIMIT  1;

  UPDATE sessions SET created_by = auth.uid() WHERE id = v_session_id;

  INSERT INTO participants (session_id, user_id, pseudo)
  VALUES (v_session_id, auth.uid(), COALESCE(v_pseudo, 'Modérateur'))
  ON CONFLICT (session_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
  RETURNING id INTO v_participant_id;

  SELECT jsonb_build_object(
    'id',                      s.id,
    'join_code',               s.join_code,
    'created_by',              s.created_by,
    'current_speaker_id',      s.current_speaker_id,
    'current_turn_started_at', s.current_turn_started_at,
    'created_at',              s.created_at,
    'participant_id',          v_participant_id
  ) INTO v_result
  FROM sessions s WHERE s.id = v_session_id;

  RETURN v_result;
END;
$$;
