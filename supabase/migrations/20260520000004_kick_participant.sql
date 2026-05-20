-- ============================================================
-- Ecclesia — Exclure un participant
-- Le modérateur peut retirer un participant de la session.
-- Clôt son tour si actif, puis supprime la ligne (cascade queues + turns).
-- ============================================================

CREATE OR REPLACE FUNCTION kick_participant(
  p_session_id     uuid,
  p_participant_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM sessions WHERE id = p_session_id AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  -- Si ce participant parle actuellement, libérer le micro
  IF EXISTS (
    SELECT 1 FROM sessions
    WHERE id = p_session_id AND current_speaker_id = p_participant_id
  ) THEN
    UPDATE sessions
    SET current_speaker_id = NULL, current_turn_started_at = NULL
    WHERE id = p_session_id;

    UPDATE speaking_turns
    SET ended_at = now()
    WHERE session_id = p_session_id
      AND participant_id = p_participant_id
      AND ended_at IS NULL;
  END IF;

  -- Supprimer le participant (cascade → queue_entries + speaking_turns)
  DELETE FROM participants
  WHERE id = p_participant_id AND session_id = p_session_id;
END;
$$;
