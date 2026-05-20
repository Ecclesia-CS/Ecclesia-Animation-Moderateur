-- ============================================================
-- Participant controls : end_turn_as_speaker, reorder_queue_entry
-- ============================================================

-- ── end_turn_as_speaker ────────────────────────────────────────
-- Allows the current speaker (not just the moderator) to end their own turn.
CREATE OR REPLACE FUNCTION end_turn_as_speaker(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_participant_id uuid;
BEGIN
  -- Resolve the caller's participant record in this session
  SELECT id INTO v_participant_id
  FROM participants
  WHERE session_id = p_session_id AND user_id = auth.uid();

  IF v_participant_id IS NULL THEN
    RAISE EXCEPTION 'Not a participant of this session';
  END IF;

  -- Verify the caller is the current speaker
  IF NOT EXISTS (
    SELECT 1 FROM sessions
    WHERE id = p_session_id AND current_speaker_id = v_participant_id
  ) THEN
    RAISE EXCEPTION 'Not the current speaker';
  END IF;

  UPDATE speaking_turns
  SET ended_at = now()
  WHERE session_id = p_session_id AND ended_at IS NULL;

  UPDATE sessions
  SET current_speaker_id = NULL, current_turn_started_at = NULL
  WHERE id = p_session_id;
END;
$$;

-- ── reorder_queue_entry ────────────────────────────────────────
-- Moves a queue entry to an arbitrary target position, shifting others.
CREATE OR REPLACE FUNCTION reorder_queue_entry(p_entry_id uuid, p_new_position int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id uuid;
  v_queue_type text;
  v_old_pos    int;
  v_max_pos    int;
BEGIN
  SELECT session_id, queue_type, position
  INTO   v_session_id, v_queue_type, v_old_pos
  FROM   queue_entries WHERE id = p_entry_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM sessions WHERE id = v_session_id AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COALESCE(MAX(position), 1) INTO v_max_pos
  FROM queue_entries WHERE session_id = v_session_id AND queue_type = v_queue_type;

  -- Clamp target position
  p_new_position := GREATEST(1, LEAST(p_new_position, v_max_pos));

  IF p_new_position = v_old_pos THEN RETURN; END IF;

  IF p_new_position < v_old_pos THEN
    -- Moving up: shift entries in [new_pos, old_pos-1] down by 1
    UPDATE queue_entries
    SET position = position + 1
    WHERE session_id = v_session_id
      AND queue_type = v_queue_type
      AND position >= p_new_position
      AND position < v_old_pos
      AND id != p_entry_id;
  ELSE
    -- Moving down: shift entries in [old_pos+1, new_pos] up by 1
    UPDATE queue_entries
    SET position = position - 1
    WHERE session_id = v_session_id
      AND queue_type = v_queue_type
      AND position > v_old_pos
      AND position <= p_new_position
      AND id != p_entry_id;
  END IF;

  UPDATE queue_entries SET position = p_new_position WHERE id = p_entry_id;
END;
$$;
