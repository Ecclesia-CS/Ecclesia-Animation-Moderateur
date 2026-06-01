-- ============================================================
-- Tables sans administrateur (leaderless)
-- - Ajoute leaderless boolean à tables
-- - create_table accepte p_leaderless
-- - admin_create_table accepte p_leaderless
-- - claim_floor : prise de parole automatique pour tables leaderless
-- ============================================================

-- 1. Champ leaderless
ALTER TABLE tables ADD COLUMN IF NOT EXISTS leaderless boolean NOT NULL DEFAULT false;

-- 2. create_table — ajoute p_leaderless
DROP FUNCTION IF EXISTS create_table(text, text, uuid);

CREATE OR REPLACE FUNCTION create_table(
  p_pseudo        text,
  p_creation_code text,
  p_session_id    uuid    DEFAULT NULL,
  p_leaderless    boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash           text;
  v_join_code      text;
  v_table_id       uuid;
  v_participant_id uuid;
  v_result         jsonb;
BEGIN
  SELECT value INTO v_hash FROM app_config WHERE key = 'creation_code_hash';
  IF crypt(p_creation_code, v_hash) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'Code de création invalide';
  END IF;

  LOOP
    v_join_code := upper(encode(gen_random_bytes(3), 'hex'));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM tables WHERE join_code = v_join_code);
  END LOOP;

  INSERT INTO tables (join_code, created_by, session_id, leaderless)
  VALUES (v_join_code, auth.uid(), p_session_id, p_leaderless)
  RETURNING id INTO v_table_id;

  INSERT INTO participants (table_id, user_id, pseudo)
  VALUES (v_table_id, auth.uid(), p_pseudo)
  RETURNING id INTO v_participant_id;

  SELECT jsonb_build_object(
    'id',                      s.id,
    'join_code',               s.join_code,
    'created_by',              s.created_by,
    'current_speaker_id',      s.current_speaker_id,
    'current_turn_started_at', s.current_turn_started_at,
    'created_at',              s.created_at,
    'session_id',              s.session_id,
    'leaderless',              s.leaderless,
    'participant_id',          v_participant_id
  ) INTO v_result
  FROM tables s WHERE s.id = v_table_id;

  RETURN v_result;
END;
$$;

-- 3. admin_create_table — ajoute p_leaderless
CREATE OR REPLACE FUNCTION admin_create_table(
  p_password   text,
  p_session_id uuid    DEFAULT NULL,
  p_leaderless boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_join_code text;
  v_table_id  uuid;
BEGIN
  PERFORM check_superadmin_password(p_password);

  LOOP
    v_join_code := upper(encode(gen_random_bytes(3), 'hex'));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM tables WHERE join_code = v_join_code);
  END LOOP;

  INSERT INTO tables (join_code, created_by, session_id, leaderless)
  VALUES (v_join_code, auth.uid(), p_session_id, p_leaderless)
  RETURNING id INTO v_table_id;

  RETURN jsonb_build_object('table_id', v_table_id, 'join_code', v_join_code);
END;
$$;

-- 4. claim_floor : permet au premier en file d'obtenir la parole dans une table leaderless
CREATE OR REPLACE FUNCTION claim_floor(p_table_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table      tables%ROWTYPE;
  v_participant participants%ROWTYPE;
  v_queue      queue_entries%ROWTYPE;
BEGIN
  -- Verrouillage atomique pour éviter les races
  SELECT * INTO v_table FROM tables WHERE id = p_table_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table introuvable';
  END IF;

  IF NOT v_table.leaderless THEN
    RAISE EXCEPTION 'Cette table a un administrateur';
  END IF;

  IF v_table.current_speaker_id IS NOT NULL THEN
    RAISE EXCEPTION 'Quelqu''un parle déjà';
  END IF;

  -- Participant de l'appelant
  SELECT * INTO v_participant
  FROM participants
  WHERE table_id = p_table_id AND user_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pas participant de cette table';
  END IF;

  -- Premier en file (coupe-file prioritaire)
  SELECT * INTO v_queue
  FROM queue_entries
  WHERE table_id = p_table_id
  ORDER BY
    CASE WHEN queue_type = 'interactive' THEN 0 ELSE 1 END,
    position
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'File vide';
  END IF;

  IF v_queue.participant_id <> v_participant.id THEN
    RAISE EXCEPTION 'Pas premier dans la file';
  END IF;

  -- Supprimer de la file
  DELETE FROM queue_entries WHERE id = v_queue.id;

  -- Ouvrir le tour de parole
  INSERT INTO speaking_turns (table_id, participant_id, started_at, source)
  VALUES (p_table_id, v_participant.id, now(), v_queue.queue_type);

  -- Mettre à jour la table
  UPDATE tables
  SET current_speaker_id      = v_participant.id,
      current_turn_started_at = now()
  WHERE id = p_table_id;

  RETURN jsonb_build_object(
    'current_speaker_id',      v_participant.id,
    'current_turn_started_at', now(),
    'removed_queue_entry_id',  v_queue.id
  );
END;
$$;
