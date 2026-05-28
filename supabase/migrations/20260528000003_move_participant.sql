-- ============================================================
-- Superadmin : déplacement d'un participant vers une autre table
-- ============================================================

DROP FUNCTION IF EXISTS move_participant(text, uuid, uuid);

CREATE OR REPLACE FUNCTION move_participant(
  p_password         text,
  p_participant_id   uuid,
  p_target_table_id  uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_current_table_id uuid;
BEGIN
  PERFORM check_superadmin_password(p_password);

  SELECT table_id INTO v_current_table_id
  FROM participants WHERE id = p_participant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'participant not found'; END IF;
  IF v_current_table_id = p_target_table_id THEN RETURN; END IF;

  -- Clôturer le tour en cours si ce participant est l'orateur actif
  UPDATE tables
  SET current_speaker_id = NULL, current_turn_started_at = NULL
  WHERE id = v_current_table_id AND current_speaker_id = p_participant_id;

  UPDATE speaking_turns
  SET ended_at = now()
  WHERE participant_id = p_participant_id AND ended_at IS NULL;

  -- Retirer des files d'attente
  DELETE FROM queue_entries WHERE participant_id = p_participant_id;

  -- Déplacer le participant
  UPDATE participants
  SET table_id = p_target_table_id
  WHERE id = p_participant_id;

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'pseudo_taken';
END;
$$;
