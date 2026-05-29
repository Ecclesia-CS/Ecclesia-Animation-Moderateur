-- ============================================================
-- 1. attach_table_to_session — reset questionnaire_forced_at
-- ============================================================
DROP FUNCTION IF EXISTS attach_table_to_session(text, uuid, uuid);
CREATE OR REPLACE FUNCTION attach_table_to_session(
  p_password   text,
  p_table_id   uuid,
  p_session_id uuid
) RETURNS tables
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_table tables;
BEGIN
  PERFORM check_superadmin_password(p_password);

  UPDATE tables
  SET session_id              = p_session_id,
      questionnaire_forced_at = NULL
  WHERE id = p_table_id
  RETURNING * INTO v_table;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table introuvable : %', p_table_id;
  END IF;

  RETURN v_table;
END;
$$;

-- ============================================================
-- 2. detach_table_from_session — reset questionnaire_forced_at
-- ============================================================
DROP FUNCTION IF EXISTS detach_table_from_session(text, uuid);
CREATE OR REPLACE FUNCTION detach_table_from_session(
  p_password text,
  p_table_id uuid
) RETURNS tables
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_table tables;
BEGIN
  PERFORM check_superadmin_password(p_password);

  UPDATE tables
  SET session_id              = NULL,
      questionnaire_forced_at = NULL
  WHERE id = p_table_id
  RETURNING * INTO v_table;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table introuvable : %', p_table_id;
  END IF;

  RETURN v_table;
END;
$$;

-- ============================================================
-- 3. list_session_tables — expose questionnaire_forced_at
-- ============================================================
DROP FUNCTION IF EXISTS list_session_tables(text, uuid);
CREATE OR REPLACE FUNCTION list_session_tables(
  p_password   text,
  p_session_id uuid
)
RETURNS TABLE (
  id                      uuid,
  join_code               text,
  created_at              timestamptz,
  moderator_pseudo        text,
  participant_count       bigint,
  is_active               boolean,
  questionnaire_forced_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM check_superadmin_password(p_password);

  RETURN QUERY
  SELECT
    t.id,
    t.join_code,
    t.created_at,
    (SELECT p.pseudo FROM participants p
     WHERE p.table_id = t.id AND p.user_id = t.created_by
     ORDER BY p.created_at LIMIT 1),
    COUNT(p2.id),
    (t.current_speaker_id IS NOT NULL),
    t.questionnaire_forced_at
  FROM tables t
  LEFT JOIN participants p2 ON p2.table_id = t.id
  WHERE t.session_id = p_session_id
  GROUP BY t.id
  ORDER BY t.created_at DESC;
END;
$$;

-- ============================================================
-- 4. FK tables.session_id : SET NULL → CASCADE
--    Les tables liées à une session sont supprimées avec elle.
-- ============================================================
ALTER TABLE tables DROP CONSTRAINT IF EXISTS tables_session_id_fkey;
ALTER TABLE tables
  ADD CONSTRAINT tables_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
