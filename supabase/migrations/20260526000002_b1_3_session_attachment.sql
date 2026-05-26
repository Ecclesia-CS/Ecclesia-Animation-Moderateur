-- ============================================================
-- B1.3 : Rattachement tables ↔ séances
-- - create_table accepte p_session_id uuid DEFAULT NULL
-- - list_session_tables : tables rattachées (SECURITY DEFINER, bypass RLS)
-- - list_available_tables : tables sans séance créées dans les 48h
-- ============================================================

-- ── A. Modifier create_table pour accepter un session_id optionnel ──
-- Drop exact overload (2 args) puis recréer en 3 args avec DEFAULT NULL.

DROP FUNCTION IF EXISTS create_table(text, text);

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

-- ── B. list_session_tables ─────────────────────────────────────────
-- Retourne les tables rattachées à une séance.
-- SECURITY DEFINER pour bypasser le RLS de tables (is_table_participant).

DROP FUNCTION IF EXISTS list_session_tables(text, uuid);

CREATE OR REPLACE FUNCTION list_session_tables(
  p_password   text,
  p_session_id uuid
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
  WHERE t.session_id = p_session_id
  GROUP BY t.id
  ORDER BY t.created_at DESC;
END;
$$;

-- ── C. list_available_tables ───────────────────────────────────────
-- Tables sans séance créées dans les 48h — candidates au rattachement.

DROP FUNCTION IF EXISTS list_available_tables(text);

CREATE OR REPLACE FUNCTION list_available_tables(p_password text)
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
    AND t.created_at > now() - interval '48 hours'
  GROUP BY t.id
  ORDER BY t.created_at DESC;
END;
$$;
