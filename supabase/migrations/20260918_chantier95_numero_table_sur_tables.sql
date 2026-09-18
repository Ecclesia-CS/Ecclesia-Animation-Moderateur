-- Chantier 95 — numéro de table porté par `tables`
--
-- Problème : le numéro de table n'existait que dans `table_assignments`. Une
-- table créée par le superadmin sans personne dessus n'avait donc aucun
-- numéro, n'apparaissait pas dans la vue Groupes, et ne pouvait pas être la
-- cible d'un glisser-déposer (`move_member_to_group` résolvait la table cible
-- par le numéro trouvé dans les affectations).
--
-- Les corps de `apply_allocation`, `move_member_to_group` et
-- `sync_table_assignment` ci-dessous sont repris de `pg_get_functiondef` en
-- base le 2026-09-18 (règle SQL de CLAUDE.md), pas des anciens fichiers de
-- migration.

ALTER TABLE tables ADD COLUMN IF NOT EXISTS table_number int;

COMMENT ON COLUMN tables.table_number IS
  'Chantier 95 — numéro de table au sein de la séance (1-indexé), miroir de table_assignments.table_number. NULL pour une table hors séance.';

-- Rattrapage de l'existant : les tables déjà rattachées héritent du numéro que
-- portent leurs affectations.
UPDATE tables t
SET table_number = ta.table_number
FROM (
  SELECT DISTINCT ON (table_id) table_id, table_number
  FROM table_assignments
  WHERE table_id IS NOT NULL
  ORDER BY table_id, table_number
) ta
WHERE ta.table_id = t.id
  AND t.table_number IS DISTINCT FROM ta.table_number;


-- ── apply_allocation — pose `table_number` sur chaque table utilisée ────────
-- Seuls ajouts par rapport à la définition en base : la colonne `table_number`
-- dans l'UPDATE de réutilisation et dans l'INSERT de création, et sa remise à
-- NULL sur les tables détachées en fin de fonction.
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
      VALUES (v_join_code, auth.uid(), p_session_id, NOT v_moderated, NOT v_moderated, v_num)
      RETURNING id INTO v_table_id;
      v_created := v_created + 1;
    END IF;

    v_used_ids := v_used_ids || v_table_id;

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


-- ── admin_create_session_table — table vide, déjà numérotée ─────────────────
-- Remplace `admin_create_table` pour la création depuis la vue Groupes.
-- `admin_create_table` reste en base, inutilisée par le frontend.
CREATE OR REPLACE FUNCTION public.admin_create_session_table(
  p_password    text,
  p_session_id  uuid,
  p_leaderless  boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_join_code text;
  v_table_id  uuid;
  v_number    int;
BEGIN
  PERFORM check_superadmin_password(p_password);

  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'Séance requise';
  END IF;

  -- Le plus grand numéro déjà pris dans la séance, des deux côtés : les tables
  -- (y compris vides) et les affectations.
  SELECT COALESCE(MAX(n), 0) + 1 INTO v_number
  FROM (
    SELECT table_number AS n FROM tables             WHERE session_id = p_session_id
    UNION ALL
    SELECT table_number AS n FROM table_assignments  WHERE session_id = p_session_id
  ) s;

  LOOP
    v_join_code := upper(encode(gen_random_bytes(3), 'hex'));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM tables WHERE join_code = v_join_code);
  END LOOP;

  INSERT INTO tables (join_code, created_by, session_id, leaderless, leaderless_by_design, table_number)
  VALUES (v_join_code, auth.uid(), p_session_id, p_leaderless, p_leaderless, v_number)
  RETURNING id INTO v_table_id;

  RETURN jsonb_build_object(
    'table_id',     v_table_id,
    'join_code',    v_join_code,
    'table_number', v_number
  );
END;
$function$;


-- ── list_session_tables — expose le numéro ─────────────────────────────────
-- DROP obligatoire : on change le type de retour (ajout de `table_number`),
-- ce que CREATE OR REPLACE refuse.
DROP FUNCTION IF EXISTS public.list_session_tables(text, uuid);

CREATE FUNCTION public.list_session_tables(p_password text, p_session_id uuid)
 RETURNS TABLE(id uuid, join_code text, created_at timestamp with time zone, moderator_pseudo text, participant_count bigint, is_active boolean, questionnaire_forced_at timestamp with time zone, leaderless boolean, table_number int)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
    (t.current_speaker_id IS NOT NULL),
    t.questionnaire_forced_at,
    t.leaderless,
    t.table_number
  FROM tables t
  LEFT JOIN participants p2 ON p2.table_id = t.id
  WHERE t.session_id = p_session_id
  GROUP BY t.id
  ORDER BY t.created_at DESC;
END;
$function$;


-- ── move_member_to_group — accepte une table vide comme cible ───────────────
-- Seul changement par rapport à la définition en base : la résolution de
-- `v_target_table_id` regarde d'abord `tables.table_number` (une table vide n'a
-- aucune affectation d'où tirer son id), et retombe sur les affectations.
CREATE OR REPLACE FUNCTION public.move_member_to_group(p_password text, p_session_id uuid, p_member_id uuid, p_target_table_number integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_target_table_id uuid;
  v_old_table_id    uuid;
  v_is_moderator    boolean;
BEGIN
  PERFORM check_superadmin_password(p_password);

  SELECT ta.table_id, sm.is_moderator
  INTO v_old_table_id, v_is_moderator
  FROM session_members sm
  LEFT JOIN table_assignments ta
    ON  ta.session_id = sm.session_id
    AND ta.member_id  = sm.id
  WHERE sm.id         = p_member_id
    AND sm.session_id = p_session_id;

  SELECT id INTO v_target_table_id
  FROM tables
  WHERE session_id   = p_session_id
    AND table_number = p_target_table_number
  LIMIT 1;

  IF v_target_table_id IS NULL THEN
    SELECT DISTINCT table_id INTO v_target_table_id
    FROM table_assignments
    WHERE session_id = p_session_id
      AND table_number = p_target_table_number
    LIMIT 1;
  END IF;

  UPDATE table_assignments
  SET table_number = p_target_table_number,
      table_id     = v_target_table_id
  WHERE session_id = p_session_id
    AND member_id  = p_member_id;

  IF v_is_moderator
     AND v_old_table_id IS NOT NULL
     AND v_old_table_id IS DISTINCT FROM v_target_table_id
  THEN
    UPDATE tables
    SET leaderless = true
    WHERE id = v_old_table_id
      AND leaderless_by_design = true;
  END IF;
END;
$function$;


-- ── sync_table_assignment — respecte le numéro porté par la table ───────────
-- Seul changement par rapport à la définition en base : le numéro de la table
-- rejointe est lu sur `tables.table_number` en priorité. Sans ça, un retardataire
-- qui saisit le code d'une table vide créée par le superadmin lui attribuait un
-- second numéro (MAX + 1), différent de celui affiché dans la vue Groupes.
CREATE OR REPLACE FUNCTION public.sync_table_assignment(p_session_id uuid, p_table_id uuid, p_user_id uuid, p_pseudo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_phase        text;
  v_member_id    uuid;
  v_table_number int;
BEGIN
  IF p_session_id IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;

    SELECT id INTO v_member_id
    FROM session_members
    WHERE session_id = p_session_id AND user_id = p_user_id;

    IF v_member_id IS NULL THEN
      INSERT INTO session_members (session_id, user_id, pseudo, joined_phase, attending_in_person)
      VALUES (p_session_id, p_user_id, p_pseudo, COALESCE(v_phase, 'debating'), true)
      RETURNING id INTO v_member_id;
    END IF;

    SELECT table_number INTO v_table_number
    FROM tables
    WHERE id = p_table_id;

    IF v_table_number IS NULL THEN
      SELECT table_number INTO v_table_number
      FROM table_assignments
      WHERE session_id = p_session_id AND table_id = p_table_id
      LIMIT 1;
    END IF;

    IF v_table_number IS NULL THEN
      SELECT COALESCE(MAX(table_number), 0) + 1 INTO v_table_number
      FROM table_assignments
      WHERE session_id = p_session_id;
    END IF;

    -- La table vient d'être numérotée implicitement : on fige ce numéro sur la
    -- table elle-même, pour que le prochain arrivant retombe sur le même.
    UPDATE tables
    SET table_number = v_table_number
    WHERE id = p_table_id
      AND session_id = p_session_id
      AND table_number IS NULL;

    INSERT INTO table_assignments (session_id, member_id, table_number, table_id)
    VALUES (p_session_id, v_member_id, v_table_number, p_table_id)
    ON CONFLICT (session_id, member_id)
    DO UPDATE SET table_number = EXCLUDED.table_number, table_id = EXCLUDED.table_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_table_assignment: échec pour session=%, user=%, pseudo=%, table=% — %',
      p_session_id, p_user_id, p_pseudo, p_table_id, SQLERRM;
  END;
END;
$function$;
