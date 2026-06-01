-- =============================================================
-- clustering_v2_nonvoters :
-- Inclut les session_members sans votes dans la répartition v2.
-- Les membres analysés sont distribués hétérogènement (round-robin
-- par group_id). Les non-votants sont distribués aléatoirement
-- sur les mêmes tables. Le nombre de tables est calculé sur le
-- total des membres (votants + non-votants).
-- =============================================================

CREATE OR REPLACE FUNCTION run_clustering_v2(
  p_password    text,
  p_session_id  uuid,
  p_target_size int DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_analysis_id   uuid;
  v_member_count  int;
  v_n_tables      int;
  v_phys_count    int;
  v_grp_num       int;
  v_phys_table    record;
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

  -- Nombre total de membres (votants + non-votants)
  SELECT COUNT(*) INTO v_member_count
  FROM session_members
  WHERE session_id = p_session_id;

  IF v_member_count = 0 THEN
    RAISE EXCEPTION 'Aucun membre inscrit pour cette séance.';
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

  -- Membres analysés : distribution hétérogène round-robin par camp
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

  -- Non-votants : distribution aléatoire sur les mêmes tables
  INSERT INTO table_assignments(session_id, member_id, table_number)
  SELECT
    p_session_id,
    sm.id,
    ((ROW_NUMBER() OVER (ORDER BY random()) - 1) % v_n_tables) + 1
  FROM session_members sm
  WHERE sm.session_id = p_session_id
    AND NOT EXISTS (
      SELECT 1 FROM analysis_members am
      WHERE am.member_id = sm.id
        AND am.analysis_id = v_analysis_id
    );

  -- Auto-assigner les tables physiques (triées par join_code) aux groupes
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
