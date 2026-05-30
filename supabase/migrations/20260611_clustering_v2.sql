-- =============================================================
-- run_clustering_v2 : clustering hétérogène inter-camps d'opinion
-- Précondition : session_analysis status='done' obligatoire.
-- Répartition round-robin par (group_id, random()) → chaque table
-- reçoit un mélange maximal de camps.
-- Même comportement que v1 pour les tables physiques :
-- vérification du nombre + auto-assignation par join_code.
-- =============================================================

CREATE OR REPLACE FUNCTION run_clustering_v2(
  p_password    text,
  p_session_id  uuid,
  p_target_size int DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_analysis_id  uuid;
  v_member_count int;
  v_n_tables     int;
  v_phys_count   int;
  v_grp_num      int;
  v_phys_table   record;
BEGIN
  PERFORM check_superadmin_password(p_password);

  -- Précondition : analyse status='done' obligatoire
  SELECT id INTO v_analysis_id
  FROM session_analysis
  WHERE session_id = p_session_id
    AND status = 'done'
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lancez d''abord l''analyse des camps avant de déclencher le clustering hétérogène.';
  END IF;

  SELECT COUNT(*) INTO v_member_count
  FROM analysis_members
  WHERE analysis_id = v_analysis_id;

  IF v_member_count = 0 THEN
    RAISE EXCEPTION 'L''analyse ne contient aucun membre.';
  END IF;

  v_n_tables := CEIL(v_member_count::float / p_target_size);

  -- Vérifier qu'il y a assez de tables physiques rattachées
  SELECT COUNT(*) INTO v_phys_count
  FROM tables
  WHERE session_id = p_session_id;

  IF v_phys_count < v_n_tables THEN
    RAISE EXCEPTION 'Pas assez de tables rattachées : % disponible(s), % nécessaire(s) pour % participants avec une taille cible de %',
      v_phys_count, v_n_tables, v_member_count, p_target_size;
  END IF;

  DELETE FROM table_assignments WHERE session_id = p_session_id;

  -- Round-robin inter-groupes :
  -- ORDER BY (group_id, random()) → le modulo distribue chaque camp
  -- de façon cyclique sur toutes les tables.
  INSERT INTO table_assignments(session_id, member_id, table_number)
  SELECT
    p_session_id,
    sm.id,
    ((ROW_NUMBER() OVER (ORDER BY am.group_id, random()) - 1) % v_n_tables) + 1
  FROM analysis_members am
  JOIN session_members sm
    ON sm.id = am.member_id
   AND sm.session_id = p_session_id
  WHERE am.analysis_id = v_analysis_id;

  -- Auto-assigner les tables physiques rattachées (triées par join_code)
  v_grp_num := 1;
  FOR v_phys_table IN
    SELECT id FROM tables
    WHERE session_id = p_session_id
    ORDER BY join_code
  LOOP
    EXIT WHEN v_grp_num > v_n_tables;
    UPDATE table_assignments
    SET table_id = v_phys_table.id
    WHERE session_id = p_session_id
      AND table_number = v_grp_num;
    v_grp_num := v_grp_num + 1;
  END LOOP;

  UPDATE sessions
  SET phase = 'allocating', phase_changed_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object('table_count', v_n_tables, 'member_count', v_member_count);
END;
$$;
