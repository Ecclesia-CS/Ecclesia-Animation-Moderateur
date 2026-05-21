-- Migration 007 : Fix end_turn_as_speaker (régression migration 005)
-- Migration 005 a supprimé UNIQUE(session_id, user_id), permettant plusieurs lignes
-- participants par user_id dans une session. L'ancien SELECT … INTO pouvait récupérer
-- la mauvaise ligne → "Not the current speaker" alors que l'utilisateur parle.
-- Correction : JOIN direct sur current_speaker_id pour trouver l'orateur appartenant
-- à auth.uid(), robuste quel que soit le nombre de lignes participants.

CREATE OR REPLACE FUNCTION end_turn_as_speaker(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_speaker_id uuid;
BEGIN
  SELECT s.current_speaker_id INTO v_speaker_id
  FROM sessions s
  JOIN participants p ON p.id = s.current_speaker_id
  WHERE s.id = p_session_id
    AND p.user_id = auth.uid();

  IF v_speaker_id IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM participants
      WHERE session_id = p_session_id AND user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Not a participant of this session';
    ELSE
      RAISE EXCEPTION 'Not the current speaker';
    END IF;
  END IF;

  UPDATE speaking_turns
  SET ended_at = now()
  WHERE session_id = p_session_id AND ended_at IS NULL;

  UPDATE sessions
  SET current_speaker_id = NULL, current_turn_started_at = NULL
  WHERE id = p_session_id;
END;
$$;
