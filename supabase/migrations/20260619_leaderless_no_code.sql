-- create_table : pas de vérification du code Ecclesia pour les tables sans animateur
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
  IF NOT p_leaderless THEN
    SELECT value INTO v_hash FROM app_config WHERE key = 'creation_code_hash';
    IF crypt(p_creation_code, v_hash) IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'Code de création invalide';
    END IF;
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
