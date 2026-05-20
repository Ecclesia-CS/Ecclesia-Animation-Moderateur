-- ============================================================
-- Ecclesia — Fusion des codes
-- Supprime moderator_code_hash des sessions ; reclaim_moderator
-- vérifie désormais contre app_config.creation_code_hash.
-- Un seul mot de passe de club suffit pour créer ET reprendre.
-- ============================================================

-- 1. Supprimer la colonne moderator_code_hash (plus nécessaire)
ALTER TABLE sessions DROP COLUMN IF EXISTS moderator_code_hash;

-- 2. Recréer create_session sans p_moderator_code
DROP FUNCTION IF EXISTS create_session(text, text, text);

CREATE OR REPLACE FUNCTION create_session(
  p_pseudo        text,
  p_creation_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash           text;
  v_join_code      text;
  v_session_id     uuid;
  v_participant_id uuid;
  v_result         jsonb;
BEGIN
  SELECT value INTO v_hash FROM app_config WHERE key = 'creation_code_hash';
  IF crypt(p_creation_code, v_hash) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'Code de création invalide';
  END IF;

  LOOP
    v_join_code := upper(encode(gen_random_bytes(3), 'hex'));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM sessions WHERE join_code = v_join_code);
  END LOOP;

  INSERT INTO sessions (join_code, created_by)
  VALUES (v_join_code, auth.uid())
  RETURNING id INTO v_session_id;

  INSERT INTO participants (session_id, user_id, pseudo)
  VALUES (v_session_id, auth.uid(), p_pseudo)
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

-- 3. Recréer reclaim_moderator : vérifie contre app_config
CREATE OR REPLACE FUNCTION reclaim_moderator(
  p_join_code      text,
  p_moderator_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id     uuid;
  v_old_created_by uuid;
  v_creation_hash  text;
  v_pseudo         text;
BEGIN
  SELECT id, created_by
  INTO   v_session_id, v_old_created_by
  FROM   sessions
  WHERE  join_code = upper(p_join_code);

  IF v_session_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT value INTO v_creation_hash FROM app_config WHERE key = 'creation_code_hash';
  IF crypt(p_moderator_code, v_creation_hash) IS DISTINCT FROM v_creation_hash THEN
    RETURN false;
  END IF;

  SELECT pseudo INTO v_pseudo
  FROM   participants
  WHERE  session_id = v_session_id
    AND  user_id    = v_old_created_by;

  UPDATE sessions SET created_by = auth.uid() WHERE id = v_session_id;

  INSERT INTO participants (session_id, user_id, pseudo)
  VALUES (v_session_id, auth.uid(), COALESCE(v_pseudo, 'Modérateur'))
  ON CONFLICT (session_id, user_id) DO NOTHING;

  RETURN true;
END;
$$;
