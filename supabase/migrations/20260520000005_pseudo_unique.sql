-- Migration 005 : Pseudo unique par session
-- Avant : UNIQUE (session_id, user_id) — un navigateur = un compte
-- Après : UNIQUE (session_id, pseudo)  — un pseudo = un compte
-- Effet : rejoindre avec le même pseudo récupère l'historique de parole,
--         même depuis un autre appareil ou après avoir vidé le localStorage.

ALTER TABLE participants
  DROP CONSTRAINT IF EXISTS participants_session_id_user_id_key;

ALTER TABLE participants
  ADD CONSTRAINT participants_session_id_pseudo_key UNIQUE (session_id, pseudo);

-- Redéfinit join_session : conflit sur pseudo → transférer user_id au nouvel appelant
CREATE OR REPLACE FUNCTION join_session(
  p_join_code text,
  p_pseudo    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id     uuid;
  v_participant_id uuid;
  v_result         jsonb;
BEGIN
  SELECT id INTO v_session_id FROM sessions WHERE join_code = upper(p_join_code);
  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'Session introuvable';
  END IF;

  INSERT INTO participants (session_id, user_id, pseudo)
  VALUES (v_session_id, auth.uid(), p_pseudo)
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
