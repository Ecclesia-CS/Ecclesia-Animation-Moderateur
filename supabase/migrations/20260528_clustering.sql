-- =============================================================
-- BLOC C3 — phase_changed_at + update set_session_phase
-- =============================================================

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS phase_changed_at timestamptz;

-- ------------------------------------------------------------
-- set_session_phase — maintenant pose phase_changed_at = now()
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_session_phase(
  p_password   text,
  p_session_id uuid,
  p_phase      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash text;
  v_row  sessions%ROWTYPE;
BEGIN
  IF p_phase NOT IN ('draft', 'voting', 'allocating', 'debating', 'questionnaire', 'closed') THEN
    RAISE EXCEPTION 'Phase invalide: %', p_phase;
  END IF;

  SELECT value INTO v_hash FROM app_config WHERE key = 'superadmin_code_hash';
  IF NOT crypt(p_password, v_hash) = v_hash THEN
    RAISE EXCEPTION 'Mot de passe superadmin incorrect';
  END IF;

  UPDATE sessions
  SET phase = p_phase, phase_changed_at = now()
  WHERE id = p_session_id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

-- ------------------------------------------------------------
-- run_clustering_v1 — pose aussi phase_changed_at = now()
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION run_clustering_v1(
  p_password   text,
  p_session_id uuid,
  p_target_size int DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash      text;
  v_members   uuid[];
  v_count     int;
  v_table_count int;
  v_i         int;
  v_table_num int;
BEGIN
  SELECT value INTO v_hash FROM app_config WHERE key = 'superadmin_code_hash';
  IF NOT crypt(p_password, v_hash) = v_hash THEN
    RAISE EXCEPTION 'Mot de passe superadmin incorrect';
  END IF;

  -- Récupérer tous les membres de la séance dans un ordre aléatoire
  SELECT ARRAY(
    SELECT id FROM session_members
    WHERE session_id = p_session_id
    ORDER BY random()
  ) INTO v_members;

  v_count := array_length(v_members, 1);
  IF v_count IS NULL OR v_count = 0 THEN
    RAISE EXCEPTION 'Aucun membre inscrit pour cette séance';
  END IF;

  -- Calculer le nombre de tables
  v_table_count := CEIL(v_count::float / p_target_size);

  -- Supprimer les assignations existantes
  DELETE FROM table_assignments WHERE session_id = p_session_id;

  -- Répartir les membres
  FOR v_i IN 1..v_count LOOP
    v_table_num := ((v_i - 1) % v_table_count) + 1;
    INSERT INTO table_assignments(session_id, member_id, table_number)
    VALUES (p_session_id, v_members[v_i], v_table_num);
  END LOOP;

  -- Passer la séance en phase allocating avec phase_changed_at
  UPDATE sessions
  SET phase = 'allocating', phase_changed_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object('table_count', v_table_count, 'member_count', v_count);
END;
$$;
