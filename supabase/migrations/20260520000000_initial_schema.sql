-- ============================================================
-- Ecclesia — Modérateur de débat
-- Initial schema : tables, RLS, helper function, SQL functions
-- ============================================================

-- Extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE app_config (
  key   text PRIMARY KEY,
  value text
);

-- The club organiser replaces the PLACEHOLDER hash via the Supabase
-- dashboard (see README — the real code must never appear in source).
INSERT INTO app_config (key, value)
VALUES ('creation_code_hash', crypt('PLACEHOLDER', gen_salt('bf')));

CREATE TABLE sessions (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  join_code               text        UNIQUE NOT NULL,
  moderator_code_hash     text        NOT NULL,
  created_by              uuid        NOT NULL,
  current_speaker_id      uuid        NULL,
  current_turn_started_at timestamptz NULL,
  created_at              timestamptz DEFAULT now()
);

CREATE TABLE participants (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid        NOT NULL REFERENCES sessions ON DELETE CASCADE,
  user_id    uuid        NOT NULL,
  pseudo     text        NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (session_id, user_id)
);

CREATE TABLE queue_entries (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid        NOT NULL REFERENCES sessions    ON DELETE CASCADE,
  participant_id uuid        NOT NULL REFERENCES participants ON DELETE CASCADE,
  queue_type     text        NOT NULL CHECK (queue_type IN ('long', 'interactive')),
  position       int         NOT NULL,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (session_id, participant_id, queue_type)
);

CREATE TABLE speaking_turns (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid        NOT NULL REFERENCES sessions    ON DELETE CASCADE,
  participant_id uuid        NOT NULL REFERENCES participants ON DELETE CASCADE,
  started_at     timestamptz NOT NULL DEFAULT now(),
  ended_at       timestamptz NULL,
  source         text        NOT NULL CHECK (source IN ('long', 'interactive', 'manual'))
);

-- ============================================================
-- Realtime — subscribe to all four tables
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE participants;
ALTER PUBLICATION supabase_realtime ADD TABLE queue_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE speaking_turns;

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE app_config     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants   ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE speaking_turns ENABLE ROW LEVEL SECURITY;

-- app_config : zero policies → default-deny for every role.
-- Readable only through SECURITY DEFINER functions below.

-- Helper used in SELECT policies to avoid self-referential recursion
-- on the participants table (SECURITY DEFINER bypasses RLS on the
-- inner query, so no infinite loop).
CREATE OR REPLACE FUNCTION is_session_participant(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM participants
    WHERE session_id = p_session_id
      AND user_id    = auth.uid()
  );
$$;

-- ── sessions ──────────────────────────────────────────────────

-- A user sees a session only when they already have a participant row.
CREATE POLICY sessions_select ON sessions
  FOR SELECT
  USING (is_session_participant(id));

-- Only the moderator (created_by = auth.uid()) may update speaker / timer.
CREATE POLICY sessions_update_moderator ON sessions
  FOR UPDATE
  USING     (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- Only the moderator may delete (terminate) their session.
-- ON DELETE CASCADE propagates to participants, queue_entries, speaking_turns.
CREATE POLICY sessions_delete_moderator ON sessions
  FOR DELETE
  USING (auth.uid() = created_by);

-- ── participants ───────────────────────────────────────────────

CREATE POLICY participants_select ON participants
  FOR SELECT
  USING (is_session_participant(session_id));

-- A user may only insert a row for themselves.
CREATE POLICY participants_insert ON participants
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ── queue_entries ──────────────────────────────────────────────

CREATE POLICY queue_entries_select ON queue_entries
  FOR SELECT
  USING (is_session_participant(session_id));

-- A participant inserts their own entry; the moderator inserts any entry.
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
      SELECT 1 FROM sessions
      WHERE id         = queue_entries.session_id
        AND created_by = auth.uid()
    )
  );

-- Only the moderator may reorder / update queue entries.
CREATE POLICY queue_entries_update_moderator ON queue_entries
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE id         = queue_entries.session_id
        AND created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE id         = queue_entries.session_id
        AND created_by = auth.uid()
    )
  );

-- A participant may remove their own entry; the moderator may remove any.
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
      SELECT 1 FROM sessions
      WHERE id         = queue_entries.session_id
        AND created_by = auth.uid()
    )
  );

-- ── speaking_turns ─────────────────────────────────────────────

CREATE POLICY speaking_turns_select ON speaking_turns
  FOR SELECT
  USING (is_session_participant(session_id));

-- Only the moderator starts a turn.
CREATE POLICY speaking_turns_insert_moderator ON speaking_turns
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE id         = speaking_turns.session_id
        AND created_by = auth.uid()
    )
  );

-- Only the moderator ends a turn (sets ended_at).
CREATE POLICY speaking_turns_update_moderator ON speaking_turns
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE id         = speaking_turns.session_id
        AND created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE id         = speaking_turns.session_id
        AND created_by = auth.uid()
    )
  );

-- ============================================================
-- SQL Functions
-- ============================================================

-- ── create_session ─────────────────────────────────────────────
-- Creates a new session and registers the caller as moderator+participant.
-- Verifies the club creation code; raises an exception on mismatch.
-- Never returns or logs any hash.
CREATE OR REPLACE FUNCTION create_session(
  p_pseudo         text,
  p_creation_code  text,
  p_moderator_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash           text;
  v_join_code      text;
  v_session_id     uuid;
  v_participant_id uuid;
  v_result         jsonb;
BEGIN
  -- Verify club creation code (hash never leaves this function)
  SELECT value INTO v_hash FROM app_config WHERE key = 'creation_code_hash';
  IF crypt(p_creation_code, v_hash) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'Code de création invalide';
  END IF;

  -- Generate a unique 6-character uppercase join code
  LOOP
    v_join_code := upper(encode(gen_random_bytes(3), 'hex'));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM sessions WHERE join_code = v_join_code);
  END LOOP;

  INSERT INTO sessions (join_code, moderator_code_hash, created_by)
  VALUES (v_join_code, crypt(p_moderator_code, gen_salt('bf')), auth.uid())
  RETURNING id INTO v_session_id;

  INSERT INTO participants (session_id, user_id, pseudo)
  VALUES (v_session_id, auth.uid(), p_pseudo)
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

-- ── join_session ───────────────────────────────────────────────
-- Joins an existing session by join_code + pseudo.
-- Idempotent: if the user already has a participant row the pseudo is updated.
-- Needed because SELECT on sessions requires being a participant first,
-- so the lookup must happen inside a SECURITY DEFINER function.
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
  ON CONFLICT (session_id, user_id) DO UPDATE SET pseudo = EXCLUDED.pseudo
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

-- ── reclaim_moderator ──────────────────────────────────────────
-- Transfers moderator ownership to the caller if they know the moderator code.
-- Returns true on success, false on wrong code or unknown join_code.
-- The moderator code hash is never returned or logged.
CREATE OR REPLACE FUNCTION reclaim_moderator(
  p_join_code      text,
  p_moderator_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id          uuid;
  v_moderator_code_hash text;
  v_old_created_by      uuid;
  v_pseudo              text;
BEGIN
  SELECT id, moderator_code_hash, created_by
  INTO   v_session_id, v_moderator_code_hash, v_old_created_by
  FROM   sessions
  WHERE  join_code = upper(p_join_code);

  IF v_session_id IS NULL THEN
    RETURN false;
  END IF;

  -- Verify moderator code (hash never returned)
  IF crypt(p_moderator_code, v_moderator_code_hash) IS DISTINCT FROM v_moderator_code_hash THEN
    RETURN false;
  END IF;

  -- Recover the previous moderator's pseudo before overwriting created_by
  SELECT pseudo INTO v_pseudo
  FROM   participants
  WHERE  session_id = v_session_id
    AND  user_id    = v_old_created_by;

  UPDATE sessions SET created_by = auth.uid() WHERE id = v_session_id;

  -- Register the new owner as a participant (no-op if already present)
  INSERT INTO participants (session_id, user_id, pseudo)
  VALUES (v_session_id, auth.uid(), COALESCE(v_pseudo, 'Modérateur'))
  ON CONFLICT (session_id, user_id) DO NOTHING;

  RETURN true;
END;
$$;
