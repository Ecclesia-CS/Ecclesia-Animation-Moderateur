-- =============================================================
-- Chantier 5 (B1) — run_clustering_v3 : allocation tenant compte du
-- questionnaire d'onboarding.
--
-- Identique à run_clustering_v2 (répartition hétérogène round-robin par
-- camp d'opinion `group_id`, présentiels uniquement, non-votants répartis
-- séparément) MAIS ajoute un équilibrage du `participation_style`
-- (listener / active) entre les tables : l'ordre de tri
-- (group_id, participation_style, random()) combiné au round-robin modulo
-- répartit équitablement chaque camp ET chaque style, pour éviter une table
-- entièrement passive ou entièrement active.
--
-- Opt-in : le frontend n'appelle v3 que si le superadmin coche l'option
-- « allocation avancée ». Le chemin par défaut (v1/v2) reste inchangé.
--
-- Précondition : analyse des camps status='done' (comme v2).
-- Note : les membres sans onboarding (participation_style NULL) sont triés
-- en fin de groupe (COALESCE → 'zzz') puis répartis normalement.
-- =============================================================

CREATE OR REPLACE FUNCTION run_clustering_v3(
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

  -- Membres présents en présentiel
  SELECT COUNT(*) INTO v_member_count
  FROM session_members
  WHERE session_id = p_session_id
    AND attending_in_person = true;

  IF v_member_count = 0 THEN
    RAISE EXCEPTION 'Aucun membre présent en présentiel pour cette séance.';
  END IF;

  v_n_tables := CEIL(v_member_count::float / p_target_size);

  SELECT COUNT(*) INTO v_phys_count
  FROM tables
  WHERE session_id = p_session_id;

  IF v_phys_count < v_n_tables THEN
    RAISE EXCEPTION 'Pas assez de tables rattachées : % disponible(s), % nécessaire(s) pour % participants avec une taille cible de %',
      v_phys_count, v_n_tables, v_member_count, p_target_size;
  END IF;

  DELETE FROM table_assignments WHERE session_id = p_session_id;

  -- Analysés ET présents : round-robin par (camp d'opinion, style de participation).
  -- Le modulo sur ce tri réparti chaque camp et chaque style entre les tables.
  INSERT INTO table_assignments(session_id, member_id, table_number)
  SELECT
    p_session_id,
    sm.id,
    ((ROW_NUMBER() OVER (
        ORDER BY am.group_id,
                 COALESCE(er.participation_style, 'zzz'),
                 random()
     ) - 1) % v_n_tables) + 1
  FROM analysis_members am
  JOIN session_members sm
    ON sm.id = am.member_id
   AND sm.session_id = p_session_id
   AND sm.attending_in_person = true
  LEFT JOIN entry_responses er
    ON er.member_id = sm.id
   AND er.session_id = p_session_id
  WHERE am.analysis_id = v_analysis_id;

  -- Présents sans votes : round-robin par style de participation
  INSERT INTO table_assignments(session_id, member_id, table_number)
  SELECT
    p_session_id,
    sm.id,
    ((ROW_NUMBER() OVER (
        ORDER BY COALESCE(er.participation_style, 'zzz'),
                 random()
     ) - 1) % v_n_tables) + 1
  FROM session_members sm
  LEFT JOIN entry_responses er
    ON er.member_id = sm.id
   AND er.session_id = p_session_id
  WHERE sm.session_id = p_session_id
    AND sm.attending_in_person = true
    AND NOT EXISTS (
      SELECT 1 FROM analysis_members am
      WHERE am.member_id = sm.id
        AND am.analysis_id = v_analysis_id
    );

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

GRANT EXECUTE ON FUNCTION run_clustering_v3(text, uuid, int) TO anon, authenticated;
