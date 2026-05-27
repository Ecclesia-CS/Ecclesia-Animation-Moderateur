-- ============================================================
-- Fix : séance obligatoire à la création + filtre configurable
-- 1. create_table lève une exception si p_session_id est NULL
-- 2. list_available_tables accepte p_since timestamptz nullable
--    (DEFAULT = 48h en arrière ; NULL = toutes les tables sans séance)
-- ============================================================

-- ── 1. create_table — validation session obligatoire ─────────

DROP FUNCTION IF EXISTS create_table(text, text, uuid);

CREATE OR REPLACE FUNCTION create_table(
  p_pseudo        text,
  p_creation_code text,
  p_session_id    uuid DEFAULT NULL
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
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'session_required';
  END IF;

  SELECT value INTO v_hash FROM app_config WHERE key = 'creation_code_hash';
  IF crypt(p_creation_code, v_hash) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'Code de création invalide';
  END IF;

  LOOP
    v_join_code := upper(encode(gen_random_bytes(3), 'hex'));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM tables WHERE join_code = v_join_code);
  END LOOP;

  INSERT INTO tables (join_code, created_by, session_id)
  VALUES (v_join_code, auth.uid(), p_session_id)
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
    'participant_id',          v_participant_id
  ) INTO v_result
  FROM tables s WHERE s.id = v_table_id;

  RETURN v_result;
END;
$$;

-- ── 2. list_available_tables — filtre p_since configurable ───

DROP FUNCTION IF EXISTS list_available_tables(text);

CREATE OR REPLACE FUNCTION list_available_tables(
  p_password text,
  p_since    timestamptz DEFAULT now() - interval '48 hours'
)
RETURNS TABLE (
  id                uuid,
  join_code         text,
  created_at        timestamptz,
  moderator_pseudo  text,
  participant_count bigint,
  is_active         boolean
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
    (t.current_speaker_id IS NOT NULL)
  FROM tables t
  LEFT JOIN participants p2 ON p2.table_id = t.id
  WHERE t.session_id IS NULL
    AND (p_since IS NULL OR t.created_at > p_since)
  GROUP BY t.id
  ORDER BY t.created_at DESC;
END;
$$;
