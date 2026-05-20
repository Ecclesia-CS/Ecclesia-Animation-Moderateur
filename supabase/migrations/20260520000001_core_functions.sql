-- ============================================================
-- Core functions : grant_floor, end_turn, add_to_queue,
--                  move_queue_entry, correct_turn
-- + REPLICA IDENTITY FULL for proper realtime DELETE filters
-- ============================================================

-- Required for DELETE realtime events to carry non-PK columns
-- (e.g. session_id filter on participants, queue_entries, speaking_turns)
ALTER TABLE sessions       REPLICA IDENTITY FULL;
ALTER TABLE participants   REPLICA IDENTITY FULL;
ALTER TABLE queue_entries  REPLICA IDENTITY FULL;
ALTER TABLE speaking_turns REPLICA IDENTITY FULL;

-- ── grant_floor ────────────────────────────────────────────────
-- Atomically: close current turn, optionally dequeue, open new turn, update session.
CREATE OR REPLACE FUNCTION grant_floor(
  p_session_id     uuid,
  p_participant_id uuid,
  p_source         text   -- 'long' | 'interactive' | 'manual'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM sessions WHERE id = p_session_id AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Close any open turn
  UPDATE speaking_turns
  SET ended_at = now()
  WHERE session_id = p_session_id AND ended_at IS NULL;

  -- Remove from source queue (not for manual)
  IF p_source IN ('long', 'interactive') THEN
    DELETE FROM queue_entries
    WHERE session_id     = p_session_id
      AND participant_id = p_participant_id
      AND queue_type     = p_source;
  END IF;

  -- Open new turn
  INSERT INTO speaking_turns (session_id, participant_id, source)
  VALUES (p_session_id, p_participant_id, p_source);

  -- Update session header
  UPDATE sessions
  SET current_speaker_id      = p_participant_id,
      current_turn_started_at = now()
  WHERE id = p_session_id;
END;
$$;

-- ── end_turn ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION end_turn(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM sessions WHERE id = p_session_id AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE speaking_turns SET ended_at = now()
  WHERE session_id = p_session_id AND ended_at IS NULL;

  UPDATE sessions
  SET current_speaker_id = NULL, current_turn_started_at = NULL
  WHERE id = p_session_id;
END;
$$;

-- ── add_to_queue ───────────────────────────────────────────────
-- Caller must be the target participant OR the session moderator.
CREATE OR REPLACE FUNCTION add_to_queue(
  p_session_id     uuid,
  p_participant_id uuid,
  p_queue_type     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next_pos int;
BEGIN
  IF auth.uid() != (SELECT user_id FROM participants WHERE id = p_participant_id)
     AND NOT EXISTS (
       SELECT 1 FROM sessions WHERE id = p_session_id AND created_by = auth.uid()
     )
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COALESCE(MAX(position), 0) + 1 INTO v_next_pos
  FROM queue_entries
  WHERE session_id = p_session_id AND queue_type = p_queue_type;

  INSERT INTO queue_entries (session_id, participant_id, queue_type, position)
  VALUES (p_session_id, p_participant_id, p_queue_type, v_next_pos)
  ON CONFLICT (session_id, participant_id, queue_type) DO NOTHING;
END;
$$;

-- ── move_queue_entry ───────────────────────────────────────────
-- Swap positions with the adjacent entry in the given direction.
CREATE OR REPLACE FUNCTION move_queue_entry(
  p_entry_id  uuid,
  p_direction text   -- 'up' | 'down'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id uuid;
  v_queue_type text;
  v_pos        int;
  v_adj_id     uuid;
  v_adj_pos    int;
BEGIN
  SELECT session_id, queue_type, position
  INTO   v_session_id, v_queue_type, v_pos
  FROM   queue_entries WHERE id = p_entry_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM sessions WHERE id = v_session_id AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_direction = 'up' THEN
    SELECT id, position INTO v_adj_id, v_adj_pos
    FROM   queue_entries
    WHERE  session_id = v_session_id AND queue_type = v_queue_type AND position < v_pos
    ORDER BY position DESC LIMIT 1;
  ELSE
    SELECT id, position INTO v_adj_id, v_adj_pos
    FROM   queue_entries
    WHERE  session_id = v_session_id AND queue_type = v_queue_type AND position > v_pos
    ORDER BY position ASC LIMIT 1;
  END IF;

  IF v_adj_id IS NULL THEN RETURN; END IF;  -- already at boundary

  -- Swap (no UNIQUE constraint on position, so no temp value needed)
  UPDATE queue_entries SET position = v_adj_pos WHERE id = p_entry_id;
  UPDATE queue_entries SET position = v_pos      WHERE id = v_adj_id;
END;
$$;

-- ── correct_turn ───────────────────────────────────────────────
-- NULL parameter = keep existing value.
CREATE OR REPLACE FUNCTION correct_turn(
  p_turn_id        uuid,
  p_started_at     timestamptz DEFAULT NULL,
  p_ended_at       timestamptz DEFAULT NULL,
  p_participant_id uuid        DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id uuid;
BEGIN
  SELECT session_id INTO v_session_id FROM speaking_turns WHERE id = p_turn_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Turn not found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM sessions WHERE id = v_session_id AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE speaking_turns
  SET started_at     = COALESCE(p_started_at,     started_at),
      ended_at       = COALESCE(p_ended_at,        ended_at),
      participant_id = COALESCE(p_participant_id,  participant_id)
  WHERE id = p_turn_id;
END;
$$;
