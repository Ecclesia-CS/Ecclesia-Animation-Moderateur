-- ============================================================
-- add_to_queue : paramètre position optionnel
-- Permet d'insérer à une position précise (DnD) ou en fin de file (défaut).
-- ============================================================

CREATE OR REPLACE FUNCTION add_to_queue(
  p_session_id     uuid,
  p_participant_id uuid,
  p_queue_type     text,
  p_position       int DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pos int;
BEGIN
  IF auth.uid() != (SELECT user_id FROM participants WHERE id = p_participant_id)
     AND NOT EXISTS (
       SELECT 1 FROM sessions WHERE id = p_session_id AND created_by = auth.uid()
     )
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_position IS NULL THEN
    -- Comportement existant : ajouter en fin de file
    SELECT COALESCE(MAX(position), 0) + 1 INTO v_pos
    FROM queue_entries
    WHERE session_id = p_session_id AND queue_type = p_queue_type;
  ELSE
    -- Insertion à la position demandée : décaler les entrées existantes
    v_pos := p_position;
    UPDATE queue_entries
    SET position = position + 1
    WHERE session_id = p_session_id
      AND queue_type = p_queue_type
      AND position >= p_position;
  END IF;

  INSERT INTO queue_entries (session_id, participant_id, queue_type, position)
  VALUES (p_session_id, p_participant_id, p_queue_type, v_pos)
  ON CONFLICT (session_id, participant_id, queue_type) DO NOTHING;
END;
$$;
