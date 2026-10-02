-- Chantier 148b — Généralisation du 147 à toutes les séances (accord de Jules
-- du 2026-10-02 : « je veux juste que je le voie dans le superadmin, que je
-- puisse lui enlever la vue modérateur si nécessaire, et qu'il n'y ait qu'un
-- écran modérateur par table »).
--
-- Le 147 avait réglé le cas `debate` : une table de séance n'est jamais
-- « possédée » par l'administrateur qui la crée (`created_by` = uid sentinelle
-- `0000…`). En séance complète, `admin_create_table`, `create_tables_batch`
-- et `apply_allocation` posaient encore `created_by = auth.uid()` de l'admin :
-- un administrateur assis à une table sans modérateur, depuis son propre
-- navigateur, en devenait le modérateur « physique » — écran noir, mais
-- invisible dans l'onglet Groupes (il a une ligne `session_members`, la
-- branche « modérateur physique » de `list_table_assignments_admin` l'écarte)
-- et donc impossible à retirer de là.
--
-- Désormais, pour toute table rattachée à une séance, l'uid « propriétaire »
-- est la sentinelle. S'asseoir à une table ne donne plus rien ; pour animer,
-- l'admin passe par le code comme tout le monde → membre titulaire, visible
-- et retirable dans Groupes (chantier 148). Les tables hors séance gardent
-- l'uid de leur créateur.
--
-- Fonctions réécrites à partir de `pg_get_functiondef` (dev, après 147/148 ;
-- md5 identiques dev = prod le 2026-10-02 pour les cinq dernières). Seule la
-- valeur de `created_by` change.

CREATE OR REPLACE FUNCTION public.table_owner_uid(p_session_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT CASE
    WHEN p_session_id IS NOT NULL
      THEN '00000000-0000-0000-0000-000000000000'::uuid
    ELSE COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_create_table(p_password text, p_session_id uuid DEFAULT NULL::uuid, p_leaderless boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_join_code text;
  v_table_id  uuid;
BEGIN
  PERFORM check_superadmin_password(p_password);

  LOOP
    v_join_code := upper(encode(gen_random_bytes(3), 'hex'));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM tables WHERE join_code = v_join_code);
  END LOOP;

  INSERT INTO tables (join_code, created_by, session_id, leaderless, leaderless_by_design)
  VALUES (v_join_code, table_owner_uid(p_session_id), p_session_id, p_leaderless, p_leaderless)
  RETURNING id INTO v_table_id;

  RETURN jsonb_build_object('table_id', v_table_id, 'join_code', v_join_code);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_tables_batch(p_password text, p_session_id uuid, p_leaderless boolean[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_count     int;
  v_i         int;
  v_join_code text;
  v_table_id  uuid;
  v_out       jsonb := '[]'::jsonb;
BEGIN
  PERFORM check_superadmin_password(p_password);

  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'session_id requis';
  END IF;

  v_count := COALESCE(array_length(p_leaderless, 1), 0);
  IF v_count < 1 THEN
    RAISE EXCEPTION 'Aucune table à créer';
  END IF;
  IF v_count > 60 THEN
    RAISE EXCEPTION 'Trop de tables demandées (%). Maximum 60.', v_count;
  END IF;

  FOR v_i IN 1..v_count LOOP
    LOOP
      v_join_code := upper(encode(gen_random_bytes(3), 'hex'));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM tables WHERE join_code = v_join_code);
    END LOOP;

    INSERT INTO tables (join_code, created_by, session_id, leaderless, leaderless_by_design)
    VALUES (v_join_code, table_owner_uid(p_session_id), p_session_id, COALESCE(p_leaderless[v_i], false), COALESCE(p_leaderless[v_i], false))
    RETURNING id INTO v_table_id;

    v_out := v_out || jsonb_build_object(
      'table_id',   v_table_id,
      'join_code',  v_join_code,
      'leaderless', COALESCE(p_leaderless[v_i], false)
    );
  END LOOP;

  RETURN v_out;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_allocation(p_password text, p_session_id uuid, p_tables jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_count       int;
  v_entry       jsonb;
  v_num         int;
  v_moderated   boolean;
  v_table_id    uuid;
  v_join_code   text;
  v_free_ids    uuid[];
  v_used        int := 0;
  v_created     int := 0;
  v_members     int := 0;
  v_member_id   uuid;
  v_used_ids    uuid[] := ARRAY[]::uuid[];
  v_detached    int := 0;
  v_orphaned    int := 0;
  v_moderator_member_id uuid;
BEGIN
  PERFORM check_superadmin_password(p_password);

  IF p_tables IS NULL OR jsonb_typeof(p_tables) <> 'array' THEN
    RAISE EXCEPTION 'Payload d''allocation invalide';
  END IF;

  v_count := jsonb_array_length(p_tables);
  IF v_count < 1 THEN
    RAISE EXCEPTION 'Aucune table dans le résultat d''allocation';
  END IF;

  SELECT COALESCE(array_agg(id ORDER BY join_code), ARRAY[]::uuid[])
    INTO v_free_ids
  FROM tables
  WHERE session_id = p_session_id;

  DELETE FROM table_assignments WHERE session_id = p_session_id;

  FOR v_entry IN SELECT jsonb_array_elements(p_tables) LOOP
    v_num       := (v_entry->>'table_number')::int;
    v_moderated := COALESCE((v_entry->>'moderated')::boolean, false);
    v_moderator_member_id := NULLIF(v_entry->'moderator_member_ids'->>0, '')::uuid;

    IF v_used < COALESCE(array_length(v_free_ids, 1), 0) THEN
      v_used     := v_used + 1;
      v_table_id := v_free_ids[v_used];
      UPDATE tables
      SET leaderless           = NOT v_moderated,
          leaderless_by_design = NOT v_moderated,
          table_number         = v_num
      WHERE id = v_table_id;
    ELSE
      LOOP
        v_join_code := upper(encode(gen_random_bytes(3), 'hex'));
        EXIT WHEN NOT EXISTS (SELECT 1 FROM tables WHERE join_code = v_join_code);
      END LOOP;
      INSERT INTO tables (join_code, created_by, session_id, leaderless, leaderless_by_design, table_number)
      VALUES (v_join_code, table_owner_uid(p_session_id), p_session_id, NOT v_moderated, NOT v_moderated, v_num)
      RETURNING id INTO v_table_id;
      v_created := v_created + 1;
    END IF;

    v_used_ids := v_used_ids || v_table_id;

    IF v_moderated THEN
      UPDATE tables
      SET active_moderator_member_id = COALESCE(active_moderator_member_id, v_moderator_member_id)
      WHERE id = v_table_id;
    ELSE
      UPDATE tables SET active_moderator_member_id = NULL WHERE id = v_table_id;
    END IF;

    FOR v_member_id IN
      SELECT value::uuid FROM jsonb_array_elements_text(
        COALESCE(v_entry->'member_ids', '[]'::jsonb)
        || COALESCE(v_entry->'moderator_member_ids', '[]'::jsonb)
      ) AS value
    LOOP
      INSERT INTO table_assignments(session_id, member_id, table_number, table_id)
      VALUES (p_session_id, v_member_id, v_num, v_table_id)
      ON CONFLICT (session_id, member_id) DO UPDATE
        SET table_number = EXCLUDED.table_number,
            table_id     = EXCLUDED.table_id;
      v_members := v_members + 1;
    END LOOP;
  END LOOP;

  SELECT
    count(*) FILTER (WHERE NOT has_people),
    count(*) FILTER (WHERE has_people)
  INTO v_detached, v_orphaned
  FROM (
    SELECT EXISTS (SELECT 1 FROM participants p WHERE p.table_id = t.id) AS has_people
    FROM tables t
    WHERE t.session_id = p_session_id
      AND NOT (t.id = ANY (v_used_ids))
  ) s;

  UPDATE tables t
  SET session_id   = NULL,
      table_number = NULL
  WHERE t.session_id = p_session_id
    AND NOT (t.id = ANY (v_used_ids))
    AND NOT EXISTS (SELECT 1 FROM participants p WHERE p.table_id = t.id);

  UPDATE sessions
  SET phase = 'allocating', phase_changed_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'table_count',     v_count,
    'member_count',    v_members,
    'tables_created',  v_created,
    'tables_reused',   v_used,
    'tables_detached', v_detached,
    'tables_orphaned', v_orphaned
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_table_leaderless(p_password text, p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_table tables%ROWTYPE;
  v_owner uuid;
BEGIN
  PERFORM check_table_admin(p_password, p_table_id);

  SELECT * INTO v_table FROM tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table introuvable';
  END IF;

  v_owner := table_owner_uid(v_table.session_id);

  UPDATE tables
  SET leaderless                 = true,
      leaderless_by_design       = true,
      active_moderator_member_id = NULL,
      created_by                 = v_owner
  WHERE id = p_table_id;

  RETURN jsonb_build_object(
    'table_id',      p_table_id,
    'leaderless',    true,
    'has_moderator', table_has_moderator(p_table_id)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_session_member_admin(p_password text, p_session_id uuid, p_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_member          session_members%ROWTYPE;
  v_table_ids       uuid[];
  v_part_ids        uuid[];
  v_seat_table_ids  uuid[];
  v_mod_tables      uuid[];
  v_n_votes         int;
  v_n_assertions    int;
  v_n_pairings      int;
  v_n_analysis      int;
  v_leaderless      int := 0;
BEGIN
  PERFORM check_session_admin(p_password, p_session_id);

  SELECT * INTO v_member
  FROM session_members
  WHERE id = p_member_id AND session_id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membre introuvable pour cette séance';
  END IF;

  SELECT COALESCE(array_agg(id), '{}') INTO v_table_ids
  FROM tables WHERE session_id = p_session_id;

  SELECT COALESCE(array_agg(id), '{}') INTO v_part_ids
  FROM participants
  WHERE user_id = v_member.user_id AND table_id = ANY(v_table_ids);

  SELECT COALESCE(array_agg(DISTINCT t), '{}') INTO v_seat_table_ids
  FROM (
    SELECT table_id AS t FROM participants WHERE id = ANY(v_part_ids)
    UNION
    SELECT table_id FROM table_assignments
    WHERE member_id = p_member_id AND table_id IS NOT NULL
  ) s;

  SELECT COALESCE(array_agg(id), '{}') INTO v_mod_tables
  FROM tables
  WHERE session_id = p_session_id
    AND (
      active_moderator_member_id = p_member_id
      OR (created_by = v_member.user_id AND id = ANY(v_seat_table_ids))
    );

  SELECT count(*) INTO v_n_votes      FROM assertion_votes  WHERE member_id = p_member_id;
  SELECT count(*) INTO v_n_assertions FROM assertions       WHERE member_id = p_member_id;
  SELECT count(*) INTO v_n_pairings   FROM member_pairings
    WHERE member_id = p_member_id OR target_member_id = p_member_id;
  SELECT count(*) INTO v_n_analysis   FROM analysis_members WHERE member_id = p_member_id;

  UPDATE tables
  SET current_speaker_id = NULL, current_turn_started_at = NULL
  WHERE current_speaker_id = ANY(v_part_ids);

  IF array_length(v_mod_tables, 1) IS NOT NULL THEN
    UPDATE tables
    SET created_by = table_owner_uid(p_session_id)
    WHERE id = ANY(v_mod_tables) AND created_by = v_member.user_id;

    UPDATE tables
    SET active_moderator_member_id = NULL
    WHERE id = ANY(v_mod_tables) AND active_moderator_member_id = p_member_id;

    UPDATE tables
    SET leaderless = true
    WHERE id = ANY(v_mod_tables) AND leaderless = false;
    GET DIAGNOSTICS v_leaderless = ROW_COUNT;
  END IF;

  DELETE FROM table_vote_responses
  WHERE user_id = v_member.user_id
    AND vote_id IN (SELECT id FROM table_votes WHERE table_id = ANY(v_table_ids));

  DELETE FROM private_notes
  WHERE user_id = v_member.user_id
    AND (session_id = p_session_id OR table_id = ANY(v_table_ids));

  DELETE FROM questionnaire_responses
  WHERE user_id = v_member.user_id
    AND (session_id = p_session_id OR table_id = ANY(v_table_ids));

  DELETE FROM participants WHERE id = ANY(v_part_ids);

  DELETE FROM session_members WHERE id = p_member_id;

  RETURN jsonb_build_object(
    'pseudo',                 v_member.pseudo,
    'was_moderator',          v_member.is_moderator OR array_length(v_mod_tables, 1) IS NOT NULL,
    'tables_now_leaderless',  v_leaderless,
    'votes_deleted',          v_n_votes,
    'assertions_detached',    v_n_assertions,
    'pairings_dissolved',     v_n_pairings,
    'analysis_rows_removed',  v_n_analysis,
    'seats_removed',          COALESCE(array_length(v_part_ids, 1), 0)
  );
END;
$function$;

-- Réparation : tables de séance dont `created_by` est un uid non assis à la
-- table (l'administrateur créateur) → sentinelle. Sans effet sur les droits
-- (personne d'assis), aligne les données sur la nouvelle règle. Les modérateurs
-- physiques assis ont été traités par la migration 148.
UPDATE tables t
SET created_by = '00000000-0000-0000-0000-000000000000'::uuid
WHERE t.session_id IS NOT NULL
  AND t.created_by <> '00000000-0000-0000-0000-000000000000'::uuid
  AND NOT EXISTS (SELECT 1 FROM participants p WHERE p.table_id = t.id AND p.user_id = t.created_by);
