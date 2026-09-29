-- Chantier 144 (point 5) — assign_pending_moderators ignorait le modérateur « physique ».
-- create_table (Code Ecclesia) pose created_by = créateur assis mais pas active_moderator_member_id :
-- la table paraissait libre (leaderless = false ET active_moderator_member_id IS NULL) et recevait un
-- second modérateur. On ajoute NOT table_has_moderator(t.id) (couvre physique ET actif) aux deux requêtes.
CREATE OR REPLACE FUNCTION public.assign_pending_moderators(p_password text, p_session_id uuid, p_apply boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_moderator   RECORD;
  v_table_id    uuid;
  v_table_num   int;
  v_used_tables uuid[] := ARRAY[]::uuid[];
  v_placements  jsonb := '[]'::jsonb;
  v_unplaced    jsonb := '[]'::jsonb;
  v_tables_without_moderator jsonb;
BEGIN
  PERFORM check_superadmin_password(p_password);

  IF NOT EXISTS (SELECT 1 FROM sessions WHERE id = p_session_id) THEN
    RAISE EXCEPTION 'Séance introuvable';
  END IF;

  FOR v_moderator IN
    SELECT sm.id, sm.pseudo
    FROM session_members sm
    WHERE sm.session_id  = p_session_id
      AND sm.is_moderator = true
      AND NOT EXISTS (
        SELECT 1 FROM tables t
        WHERE t.session_id = p_session_id
          AND t.active_moderator_member_id = sm.id
      )
    ORDER BY sm.created_at, sm.id
  LOOP
    v_table_id := NULL;
    SELECT t.id, t.table_number INTO v_table_id, v_table_num
    FROM tables t
    WHERE t.session_id = p_session_id
      AND t.leaderless  = false
      AND t.active_moderator_member_id IS NULL
      AND NOT table_has_moderator(t.id)
      AND NOT (t.id = ANY(v_used_tables))
    ORDER BY t.table_number
    LIMIT 1;

    IF v_table_id IS NULL THEN
      v_unplaced := v_unplaced || jsonb_build_object('member_id', v_moderator.id, 'pseudo', v_moderator.pseudo);
      CONTINUE;
    END IF;

    v_used_tables := v_used_tables || v_table_id;
    v_placements  := v_placements || jsonb_build_object(
      'member_id',    v_moderator.id,
      'pseudo',       v_moderator.pseudo,
      'table_number', v_table_num,
      'table_id',     v_table_id
    );

    IF p_apply THEN
      INSERT INTO table_assignments (session_id, member_id, table_number, table_id)
      VALUES (p_session_id, v_moderator.id, v_table_num, v_table_id)
      ON CONFLICT (session_id, member_id) DO UPDATE
        SET table_number = EXCLUDED.table_number,
            table_id     = EXCLUDED.table_id;

      UPDATE tables SET active_moderator_member_id = v_moderator.id WHERE id = v_table_id;
    END IF;
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('table_number', t.table_number) ORDER BY t.table_number), '[]'::jsonb)
    INTO v_tables_without_moderator
  FROM tables t
  WHERE t.session_id = p_session_id
    AND t.leaderless  = false
    AND t.active_moderator_member_id IS NULL
    AND NOT table_has_moderator(t.id)
    AND NOT (t.id = ANY(v_used_tables));

  RETURN jsonb_build_object(
    'placements',               v_placements,
    'unplaced_moderators',      v_unplaced,
    'tables_without_moderator', v_tables_without_moderator
  );
END;
$function$;
