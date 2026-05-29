-- =============================================================
-- run_clustering_v1 v2 — auto-assigne les tables physiques déjà
-- rattachées à la séance aux groupes logiques dans l'ordre.
-- Le superadmin peut toujours détacher/réassigner ensuite.
-- =============================================================

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
  v_hash        text;
  v_members     uuid[];
  v_count       int;
  v_table_count int;
  v_i           int;
  v_table_num   int;
  v_phys_table  record;
  v_grp_num     int;
BEGIN
  SELECT value INTO v_hash FROM app_config WHERE key = 'superadmin_code_hash';
  IF NOT crypt(p_password, v_hash) = v_hash THEN
    RAISE EXCEPTION 'Mot de passe superadmin incorrect';
  END IF;

  -- Récupérer tous les membres dans un ordre aléatoire
  SELECT ARRAY(
    SELECT id FROM session_members
    WHERE session_id = p_session_id
    ORDER BY random()
  ) INTO v_members;

  v_count := array_length(v_members, 1);
  IF v_count IS NULL OR v_count = 0 THEN
    RAISE EXCEPTION 'Aucun membre inscrit pour cette séance';
  END IF;

  -- Calculer le nombre de groupes
  v_table_count := CEIL(v_count::float / p_target_size);

  -- Supprimer les assignations existantes
  DELETE FROM table_assignments WHERE session_id = p_session_id;

  -- Répartir les membres dans les groupes
  FOR v_i IN 1..v_count LOOP
    v_table_num := ((v_i - 1) % v_table_count) + 1;
    INSERT INTO table_assignments(session_id, member_id, table_number)
    VALUES (p_session_id, v_members[v_i], v_table_num);
  END LOOP;

  -- Auto-assigner les tables physiques rattachées à la séance
  -- (triées par join_code) aux groupes dans l'ordre 1, 2, 3…
  v_grp_num := 1;
  FOR v_phys_table IN
    SELECT id FROM tables
    WHERE session_id = p_session_id
    ORDER BY join_code
  LOOP
    EXIT WHEN v_grp_num > v_table_count;
    UPDATE table_assignments
    SET table_id = v_phys_table.id
    WHERE session_id = p_session_id
      AND table_number = v_grp_num;
    v_grp_num := v_grp_num + 1;
  END LOOP;

  -- Passer la séance en phase allocating
  UPDATE sessions
  SET phase = 'allocating', phase_changed_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object('table_count', v_table_count, 'member_count', v_count);
END;
$$;
