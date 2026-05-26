-- ============================================================
-- Refactor B0 : rename sessions → tables
-- Renomme la table 'sessions' en 'tables' et toutes les colonnes
-- 'session_id' en 'table_id'. Met à jour les contraintes, policies,
-- fonctions SECURITY DEFINER et la publication Realtime.
-- Idempotent : peut être relancé sans erreur.
-- ============================================================

-- ── A. Supprimer les policies (bodies référencent sessions/session_id) ──
-- Note : on drop uniquement sur 'sessions'. DROP POLICY IF EXISTS sur une table inexistante
-- lève quand même 42P01 — donc pas de DROP ... ON tables ici (la table sera renommée en C).

DROP POLICY IF EXISTS sessions_select ON sessions;
DROP POLICY IF EXISTS sessions_update_moderator ON sessions;
DROP POLICY IF EXISTS sessions_delete_moderator ON sessions;

DROP POLICY IF EXISTS participants_select ON participants;
DROP POLICY IF EXISTS participants_insert ON participants;
DROP POLICY IF EXISTS queue_entries_select ON queue_entries;
DROP POLICY IF EXISTS queue_entries_insert ON queue_entries;
DROP POLICY IF EXISTS queue_entries_update_moderator ON queue_entries;
DROP POLICY IF EXISTS queue_entries_delete ON queue_entries;
DROP POLICY IF EXISTS speaking_turns_select ON speaking_turns;
DROP POLICY IF EXISTS speaking_turns_insert_moderator ON speaking_turns;
DROP POLICY IF EXISTS speaking_turns_update_moderator ON speaking_turns;

-- ── B. Supprimer les fonctions à recréer ──

DROP FUNCTION IF EXISTS is_session_participant(uuid);
DROP FUNCTION IF EXISTS is_table_participant(uuid);
DROP FUNCTION IF EXISTS create_session(text, text);
DROP FUNCTION IF EXISTS create_table(text, text);
DROP FUNCTION IF EXISTS join_session(text, text);
DROP FUNCTION IF EXISTS join_table(text, text);
DROP FUNCTION IF EXISTS reclaim_moderator(text, text);
DROP FUNCTION IF EXISTS grant_floor(uuid, uuid, text);
DROP FUNCTION IF EXISTS end_turn(uuid);
DROP FUNCTION IF EXISTS add_to_queue(uuid, uuid, text, int);
DROP FUNCTION IF EXISTS move_queue_entry(uuid, text);
DROP FUNCTION IF EXISTS correct_turn(uuid, timestamptz, timestamptz, uuid);
DROP FUNCTION IF EXISTS end_turn_as_speaker(uuid);
DROP FUNCTION IF EXISTS reorder_queue_entry(uuid, int);
DROP FUNCTION IF EXISTS kick_participant(uuid, uuid);
DROP FUNCTION IF EXISTS end_turn_and_advance(uuid);

-- ── C. Renommer la table sessions → tables ──

DO $$ BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sessions'
  ) THEN
    ALTER TABLE sessions RENAME TO tables;
  END IF;
END $$;

-- ── D. Renommer les colonnes session_id → table_id ──

DO $$ BEGIN
  IF EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'participants' AND column_name = 'session_id'
  ) THEN
    ALTER TABLE participants RENAME COLUMN session_id TO table_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'queue_entries' AND column_name = 'session_id'
  ) THEN
    ALTER TABLE queue_entries RENAME COLUMN session_id TO table_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'speaking_turns' AND column_name = 'session_id'
  ) THEN
    ALTER TABLE speaking_turns RENAME COLUMN session_id TO table_id;
  END IF;
END $$;

-- ── E. Renommer les contraintes ──

-- tables (anciennement sessions)
DO $$ BEGIN
  IF EXISTS (
    SELECT FROM pg_constraint
    WHERE conname = 'sessions_pkey'
      AND conrelid = 'public.tables'::regclass
  ) THEN
    ALTER TABLE tables RENAME CONSTRAINT sessions_pkey TO tables_pkey;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT FROM pg_constraint
    WHERE conname = 'sessions_join_code_key'
      AND conrelid = 'public.tables'::regclass
  ) THEN
    ALTER TABLE tables RENAME CONSTRAINT sessions_join_code_key TO tables_join_code_key;
  END IF;
END $$;

-- participants
DO $$ BEGIN
  IF EXISTS (
    SELECT FROM pg_constraint
    WHERE conname = 'participants_session_id_fkey'
      AND conrelid = 'public.participants'::regclass
  ) THEN
    ALTER TABLE participants RENAME CONSTRAINT participants_session_id_fkey TO participants_table_id_fkey;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT FROM pg_constraint
    WHERE conname = 'participants_session_id_pseudo_key'
      AND conrelid = 'public.participants'::regclass
  ) THEN
    ALTER TABLE participants RENAME CONSTRAINT participants_session_id_pseudo_key TO participants_table_id_pseudo_key;
  END IF;
END $$;

-- queue_entries
DO $$ BEGIN
  IF EXISTS (
    SELECT FROM pg_constraint
    WHERE conname = 'queue_entries_session_id_fkey'
      AND conrelid = 'public.queue_entries'::regclass
  ) THEN
    ALTER TABLE queue_entries RENAME CONSTRAINT queue_entries_session_id_fkey TO queue_entries_table_id_fkey;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT FROM pg_constraint
    WHERE conname = 'queue_entries_session_id_participant_id_queue_type_key'
      AND conrelid = 'public.queue_entries'::regclass
  ) THEN
    ALTER TABLE queue_entries RENAME CONSTRAINT queue_entries_session_id_participant_id_queue_type_key TO queue_entries_table_id_participant_id_queue_type_key;
  END IF;
END $$;

-- speaking_turns
DO $$ BEGIN
  IF EXISTS (
    SELECT FROM pg_constraint
    WHERE conname = 'speaking_turns_session_id_fkey'
      AND conrelid = 'public.speaking_turns'::regclass
  ) THEN
    ALTER TABLE speaking_turns RENAME CONSTRAINT speaking_turns_session_id_fkey TO speaking_turns_table_id_fkey;
  END IF;
END $$;

-- ── F. REPLICA IDENTITY FULL sur la table renommée ──

ALTER TABLE tables REPLICA IDENTITY FULL;

-- ── G. Recréer is_table_participant (helper RLS anti-récursion) ──

CREATE OR REPLACE FUNCTION is_table_participant(p_table_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM participants
    WHERE table_id = p_table_id
      AND user_id  = auth.uid()
  );
$$;

-- ── H. Recréer les policies ──

-- ── tables ──────────────────────────────────────────────────────

CREATE POLICY tables_select ON tables
  FOR SELECT
  USING (is_table_participant(id));

CREATE POLICY tables_update_moderator ON tables
  FOR UPDATE
  USING     (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY tables_delete_moderator ON tables
  FOR DELETE
  USING (auth.uid() = created_by);

-- ── participants ─────────────────────────────────────────────────

CREATE POLICY participants_select ON participants
  FOR SELECT
  USING (is_table_participant(table_id));

CREATE POLICY participants_insert ON participants
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ── queue_entries ────────────────────────────────────────────────

CREATE POLICY queue_entries_select ON queue_entries
  FOR SELECT
  USING (is_table_participant(table_id));

CREATE POLICY queue_entries_insert ON queue_entries
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM participants
      WHERE id      = queue_entries.participant_id
        AND user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM tables
      WHERE id         = queue_entries.table_id
        AND created_by = auth.uid()
    )
  );

CREATE POLICY queue_entries_update_moderator ON queue_entries
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM tables
      WHERE id         = queue_entries.table_id
        AND created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tables
      WHERE id         = queue_entries.table_id
        AND created_by = auth.uid()
    )
  );

CREATE POLICY queue_entries_delete ON queue_entries
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM participants
      WHERE id      = queue_entries.participant_id
        AND user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM tables
      WHERE id         = queue_entries.table_id
        AND created_by = auth.uid()
    )
  );

-- ── speaking_turns ───────────────────────────────────────────────

CREATE POLICY speaking_turns_select ON speaking_turns
  FOR SELECT
  USING (is_table_participant(table_id));

CREATE POLICY speaking_turns_insert_moderator ON speaking_turns
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tables
      WHERE id         = speaking_turns.table_id
        AND created_by = auth.uid()
    )
  );

CREATE POLICY speaking_turns_update_moderator ON speaking_turns
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM tables
      WHERE id         = speaking_turns.table_id
        AND created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tables
      WHERE id         = speaking_turns.table_id
        AND created_by = auth.uid()
    )
  );

-- ── I. Recréer les fonctions SECURITY DEFINER ──

-- ── create_table ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_table(
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

  INSERT INTO tables (join_code, created_by)
  VALUES (v_join_code, auth.uid())
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
    'participant_id',          v_participant_id
  ) INTO v_result
  FROM tables s WHERE s.id = v_table_id;

  RETURN v_result;
END;
$$;

-- ── join_table ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION join_table(
  p_join_code text,
  p_pseudo    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table_id       uuid;
  v_participant_id uuid;
  v_result         jsonb;
BEGIN
  SELECT id INTO v_table_id FROM tables WHERE join_code = upper(p_join_code);
  IF v_table_id IS NULL THEN
    RAISE EXCEPTION 'Session introuvable';
  END IF;

  INSERT INTO participants (table_id, user_id, pseudo)
  VALUES (v_table_id, auth.uid(), p_pseudo)
  ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
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
  FROM tables s WHERE s.id = v_table_id;

  RETURN v_result;
END;
$$;

-- ── reclaim_moderator ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION reclaim_moderator(
  p_join_code      text,
  p_moderator_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table_id       uuid;
  v_old_created_by uuid;
  v_creation_hash  text;
  v_pseudo         text;
  v_participant_id uuid;
  v_result         jsonb;
BEGIN
  SELECT id, created_by
  INTO   v_table_id, v_old_created_by
  FROM   tables
  WHERE  join_code = upper(p_join_code);

  IF v_table_id IS NULL THEN
    RAISE EXCEPTION 'Session introuvable (code %)', upper(p_join_code);
  END IF;

  SELECT value INTO v_creation_hash FROM app_config WHERE key = 'creation_code_hash';
  IF crypt(p_moderator_code, v_creation_hash) IS DISTINCT FROM v_creation_hash THEN
    RAISE EXCEPTION 'Code Ecclesia incorrect';
  END IF;

  SELECT pseudo INTO v_pseudo
  FROM   participants
  WHERE  table_id = v_table_id AND user_id = v_old_created_by
  LIMIT  1;

  UPDATE tables SET created_by = auth.uid() WHERE id = v_table_id;

  INSERT INTO participants (table_id, user_id, pseudo)
  VALUES (v_table_id, auth.uid(), COALESCE(v_pseudo, 'Modérateur'))
  ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
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
  FROM tables s WHERE s.id = v_table_id;

  RETURN v_result;
END;
$$;

-- ── grant_floor ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION grant_floor(
  p_table_id       uuid,
  p_participant_id uuid,
  p_source         text   -- 'long' | 'interactive' | 'manual'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tables WHERE id = p_table_id AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE speaking_turns
  SET ended_at = now()
  WHERE table_id = p_table_id AND ended_at IS NULL;

  IF p_source IN ('long', 'interactive') THEN
    DELETE FROM queue_entries
    WHERE table_id       = p_table_id
      AND participant_id = p_participant_id
      AND queue_type     = p_source;
  END IF;

  INSERT INTO speaking_turns (table_id, participant_id, source)
  VALUES (p_table_id, p_participant_id, p_source);

  UPDATE tables
  SET current_speaker_id      = p_participant_id,
      current_turn_started_at = now()
  WHERE id = p_table_id;
END;
$$;

-- ── end_turn ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION end_turn(p_table_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tables WHERE id = p_table_id AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE speaking_turns SET ended_at = now()
  WHERE table_id = p_table_id AND ended_at IS NULL;

  UPDATE tables
  SET current_speaker_id = NULL, current_turn_started_at = NULL
  WHERE id = p_table_id;
END;
$$;

-- ── add_to_queue ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION add_to_queue(
  p_table_id       uuid,
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
       SELECT 1 FROM tables WHERE id = p_table_id AND created_by = auth.uid()
     )
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_position IS NULL THEN
    SELECT COALESCE(MAX(position), 0) + 1 INTO v_pos
    FROM queue_entries
    WHERE table_id = p_table_id AND queue_type = p_queue_type;
  ELSE
    v_pos := p_position;
    UPDATE queue_entries
    SET position = position + 1
    WHERE table_id   = p_table_id
      AND queue_type = p_queue_type
      AND position  >= p_position;
  END IF;

  INSERT INTO queue_entries (table_id, participant_id, queue_type, position)
  VALUES (p_table_id, p_participant_id, p_queue_type, v_pos)
  ON CONFLICT (table_id, participant_id, queue_type) DO NOTHING;
END;
$$;

-- ── move_queue_entry ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION move_queue_entry(
  p_entry_id  uuid,
  p_direction text   -- 'up' | 'down'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table_id   uuid;
  v_queue_type text;
  v_pos        int;
  v_adj_id     uuid;
  v_adj_pos    int;
BEGIN
  SELECT table_id, queue_type, position
  INTO   v_table_id, v_queue_type, v_pos
  FROM   queue_entries WHERE id = p_entry_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM tables WHERE id = v_table_id AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_direction = 'up' THEN
    SELECT id, position INTO v_adj_id, v_adj_pos
    FROM   queue_entries
    WHERE  table_id = v_table_id AND queue_type = v_queue_type AND position < v_pos
    ORDER BY position DESC LIMIT 1;
  ELSE
    SELECT id, position INTO v_adj_id, v_adj_pos
    FROM   queue_entries
    WHERE  table_id = v_table_id AND queue_type = v_queue_type AND position > v_pos
    ORDER BY position ASC LIMIT 1;
  END IF;

  IF v_adj_id IS NULL THEN RETURN; END IF;

  UPDATE queue_entries SET position = v_adj_pos WHERE id = p_entry_id;
  UPDATE queue_entries SET position = v_pos      WHERE id = v_adj_id;
END;
$$;

-- ── correct_turn ─────────────────────────────────────────────────

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
  v_table_id uuid;
BEGIN
  SELECT table_id INTO v_table_id FROM speaking_turns WHERE id = p_turn_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Turn not found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM tables WHERE id = v_table_id AND created_by = auth.uid()
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

-- ── end_turn_as_speaker ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION end_turn_as_speaker(p_table_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_speaker_id uuid;
BEGIN
  SELECT s.current_speaker_id INTO v_speaker_id
  FROM tables s
  JOIN participants p ON p.id = s.current_speaker_id
  WHERE s.id = p_table_id
    AND p.user_id = auth.uid();

  IF v_speaker_id IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM participants
      WHERE table_id = p_table_id AND user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Not a participant of this session';
    ELSE
      RAISE EXCEPTION 'Not the current speaker';
    END IF;
  END IF;

  UPDATE speaking_turns
  SET ended_at = now()
  WHERE table_id = p_table_id AND ended_at IS NULL;

  UPDATE tables
  SET current_speaker_id = NULL, current_turn_started_at = NULL
  WHERE id = p_table_id;
END;
$$;

-- ── reorder_queue_entry ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION reorder_queue_entry(p_entry_id uuid, p_new_position int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table_id   uuid;
  v_queue_type text;
  v_old_pos    int;
  v_max_pos    int;
BEGIN
  SELECT table_id, queue_type, position
  INTO   v_table_id, v_queue_type, v_old_pos
  FROM   queue_entries WHERE id = p_entry_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM tables WHERE id = v_table_id AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COALESCE(MAX(position), 1) INTO v_max_pos
  FROM queue_entries WHERE table_id = v_table_id AND queue_type = v_queue_type;

  p_new_position := GREATEST(1, LEAST(p_new_position, v_max_pos));

  IF p_new_position = v_old_pos THEN RETURN; END IF;

  IF p_new_position < v_old_pos THEN
    UPDATE queue_entries
    SET position = position + 1
    WHERE table_id   = v_table_id
      AND queue_type = v_queue_type
      AND position  >= p_new_position
      AND position   < v_old_pos
      AND id        != p_entry_id;
  ELSE
    UPDATE queue_entries
    SET position = position - 1
    WHERE table_id   = v_table_id
      AND queue_type = v_queue_type
      AND position   > v_old_pos
      AND position  <= p_new_position
      AND id        != p_entry_id;
  END IF;

  UPDATE queue_entries SET position = p_new_position WHERE id = p_entry_id;
END;
$$;

-- ── kick_participant ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION kick_participant(
  p_table_id       uuid,
  p_participant_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tables WHERE id = p_table_id AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  IF EXISTS (
    SELECT 1 FROM tables
    WHERE id = p_table_id AND current_speaker_id = p_participant_id
  ) THEN
    UPDATE tables
    SET current_speaker_id = NULL, current_turn_started_at = NULL
    WHERE id = p_table_id;

    UPDATE speaking_turns
    SET ended_at = now()
    WHERE table_id       = p_table_id
      AND participant_id = p_participant_id
      AND ended_at IS NULL;
  END IF;

  DELETE FROM participants
  WHERE id = p_participant_id AND table_id = p_table_id;
END;
$$;

-- ── end_turn_and_advance ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION end_turn_and_advance(p_table_id uuid)
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
  SELECT
    EXISTS(SELECT 1 FROM tables WHERE id = p_table_id AND created_by = auth.uid()),
    (SELECT current_speaker_id FROM tables WHERE id = p_table_id)
  INTO v_is_moderator, v_current_speaker_id;

  SELECT id INTO v_caller_part_id
  FROM participants
  WHERE table_id = p_table_id AND user_id = auth.uid()
  ORDER BY created_at
  LIMIT 1;

  IF NOT v_is_moderator AND v_caller_part_id IS DISTINCT FROM v_current_speaker_id THEN
    RAISE EXCEPTION 'Not authorized: caller is not the moderator or the current speaker';
  END IF;

  IF v_current_speaker_id IS NULL THEN
    RAISE EXCEPTION 'No active speaker to end';
  END IF;

  UPDATE speaking_turns
  SET ended_at = now()
  WHERE table_id = p_table_id AND ended_at IS NULL;

  SELECT id, participant_id, queue_type
  INTO v_next
  FROM queue_entries
  WHERE table_id = p_table_id
  ORDER BY
    CASE queue_type WHEN 'interactive' THEN 0 ELSE 1 END,
    position
  LIMIT 1;

  IF v_next IS NOT NULL THEN
    v_new_speaker_id   := v_next.participant_id;
    v_removed_entry_id := v_next.id;
    v_new_started_at   := now();

    DELETE FROM queue_entries WHERE id = v_next.id;

    INSERT INTO speaking_turns (table_id, participant_id, source)
    VALUES (p_table_id, v_new_speaker_id, v_next.queue_type);

    UPDATE tables
    SET current_speaker_id      = v_new_speaker_id,
        current_turn_started_at = v_new_started_at
    WHERE id = p_table_id;
  ELSE
    UPDATE tables
    SET current_speaker_id = NULL, current_turn_started_at = NULL
    WHERE id = p_table_id;
  END IF;

  RETURN jsonb_build_object(
    'current_speaker_id',      v_new_speaker_id,
    'current_turn_started_at', v_new_started_at,
    'removed_queue_entry_id',  v_removed_entry_id
  );
END;
$$;

-- ── J. Publication Realtime ──
-- sessions était déjà dans supabase_realtime. Après le RENAME, PostgreSQL suit par OID :
-- la publication référence automatiquement 'tables'. Pas d'ADD TABLE nécessaire.
-- (Ajouter ADD TABLE tables ici causerait "relation already member of publication".)
