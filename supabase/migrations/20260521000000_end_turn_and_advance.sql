-- ============================================================
-- Migration 008 : end_turn_and_advance
-- Clôt le tour courant ET accorde la parole au participant suivant
-- en une seule transaction atomique, éliminant le double aller-retour
-- réseau qui existait via : end_turn RPC → broadcast → auto-avancement
-- useEffect → grant_floor RPC.
--
-- Auth : appelable par le modérateur OU le speaker actuel.
-- Retourne jsonb avec le nouvel état session pour une mise à jour
-- locale immédiate côté client (évite le skew de timestamp).
-- ============================================================

CREATE OR REPLACE FUNCTION end_turn_and_advance(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_moderator       boolean;
  v_current_speaker_id uuid;
  v_caller_part_id     uuid;
  v_next               record;
  v_new_speaker_id     uuid        := NULL;
  v_new_started_at     timestamptz := NULL;
  v_removed_entry_id   uuid        := NULL;
BEGIN
  -- ── 1. Résolution de l'appelant ──────────────────────────────
  SELECT
    EXISTS(SELECT 1 FROM sessions WHERE id = p_session_id AND created_by = auth.uid()),
    (SELECT current_speaker_id FROM sessions WHERE id = p_session_id)
  INTO v_is_moderator, v_current_speaker_id;

  -- Identifie le participant de l'appelant (pour vérifier qu'il est bien l'orateur)
  SELECT id INTO v_caller_part_id
  FROM participants
  WHERE session_id = p_session_id AND user_id = auth.uid()
  ORDER BY created_at
  LIMIT 1;

  IF NOT v_is_moderator AND v_caller_part_id IS DISTINCT FROM v_current_speaker_id THEN
    RAISE EXCEPTION 'Not authorized: caller is not the moderator or the current speaker';
  END IF;

  IF v_current_speaker_id IS NULL THEN
    RAISE EXCEPTION 'No active speaker to end';
  END IF;

  -- ── 2. Clôture du tour courant ───────────────────────────────
  UPDATE speaking_turns
  SET ended_at = now()
  WHERE session_id = p_session_id AND ended_at IS NULL;

  -- ── 3. Cherche le suivant (interactive > long, puis position) ─
  SELECT id, participant_id, queue_type
  INTO v_next
  FROM queue_entries
  WHERE session_id = p_session_id
  ORDER BY
    CASE queue_type WHEN 'interactive' THEN 0 ELSE 1 END,
    position
  LIMIT 1;

  -- ── 4. Avance si une file n'est pas vide ─────────────────────
  IF v_next IS NOT NULL THEN
    v_new_speaker_id   := v_next.participant_id;
    v_removed_entry_id := v_next.id;
    v_new_started_at   := now();

    DELETE FROM queue_entries WHERE id = v_next.id;

    INSERT INTO speaking_turns (session_id, participant_id, source)
    VALUES (p_session_id, v_new_speaker_id, v_next.queue_type);

    UPDATE sessions
    SET current_speaker_id      = v_new_speaker_id,
        current_turn_started_at = v_new_started_at
    WHERE id = p_session_id;
  ELSE
    -- Files vides : libère juste le micro
    UPDATE sessions
    SET current_speaker_id = NULL, current_turn_started_at = NULL
    WHERE id = p_session_id;
  END IF;

  -- ── 5. Retourne le nouvel état session ───────────────────────
  RETURN jsonb_build_object(
    'current_speaker_id',      v_new_speaker_id,
    'current_turn_started_at', v_new_started_at,
    'removed_queue_entry_id',  v_removed_entry_id
  );
END;
$$;
