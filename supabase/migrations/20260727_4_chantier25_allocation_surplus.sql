-- =============================================================
-- Chantier 25 — Allocation v2 : tables fantômes après recalcul (H18)
--
-- Symptôme observé par Jules sur la séance VERIF7 : une table
-- supplémentaire « apparaît » plus tard dans le cycle de vie de la
-- séance (visible en phase questionnaire), alors qu'elle ne
-- correspond à aucun groupe de l'allocation courante.
--
-- Cause : `apply_allocation` réutilise les tables déjà rattachées à la
-- séance dans l'ordre de `join_code` et crée celles qui manquent, mais
-- ne fait **rien** des tables excédentaires. Une allocation qui produit
-- 3 tables après un premier essai à 4 laisse donc la 4e table rattachée
-- (`tables.session_id` toujours renseigné). Elle ne porte aucun
-- `table_assignments`, donc n'apparaît pas dans l'onglet « Groupes »
-- (construit depuis `table_assignments`), mais reste listée par
-- `list_session_tables` — d'où la table qui ressurgit ailleurs.
--
-- Correctif : à la fin de l'allocation, détacher les tables rattachées
-- non utilisées **et vides**. Une table où quelqu'un a déjà rejoint
-- (ligne dans `participants`) n'est jamais touchée : on ne coupe pas le
-- sol sous les pieds d'un participant déjà en séance, même si c'est un
-- reliquat. Elle est signalée dans le compte-rendu (`tables_orphaned`).
--
-- `session_id` est ON DELETE SET NULL côté `tables` : détacher revient à
-- remettre la table dans le pool des tables libres (`list_available_tables`),
-- réutilisable par une autre séance. Aucune donnée n'est supprimée.
-- =============================================================

CREATE OR REPLACE FUNCTION apply_allocation(
  p_password   text,
  p_session_id uuid,
  p_tables     jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
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

  -- Tables physiques déjà rattachées, réutilisables (ordre stable).
  SELECT COALESCE(array_agg(id ORDER BY join_code), ARRAY[]::uuid[])
    INTO v_free_ids
  FROM tables
  WHERE session_id = p_session_id;

  DELETE FROM table_assignments WHERE session_id = p_session_id;

  FOR v_entry IN SELECT jsonb_array_elements(p_tables) LOOP
    v_num       := (v_entry->>'table_number')::int;
    v_moderated := COALESCE((v_entry->>'moderated')::boolean, false);

    -- Réutiliser une table existante, sinon en créer une.
    IF v_used < COALESCE(array_length(v_free_ids, 1), 0) THEN
      v_used     := v_used + 1;
      v_table_id := v_free_ids[v_used];
      UPDATE tables SET leaderless = NOT v_moderated WHERE id = v_table_id;
    ELSE
      LOOP
        v_join_code := upper(encode(gen_random_bytes(3), 'hex'));
        EXIT WHEN NOT EXISTS (SELECT 1 FROM tables WHERE join_code = v_join_code);
      END LOOP;
      INSERT INTO tables (join_code, created_by, session_id, leaderless)
      VALUES (v_join_code, auth.uid(), p_session_id, NOT v_moderated)
      RETURNING id INTO v_table_id;
      v_created := v_created + 1;
    END IF;

    v_used_ids := v_used_ids || v_table_id;

    -- Participants + modérateurs de cette table
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

  -- ── H18 : détacher les tables excédentaires et vides ──
  -- Reliquats d'une allocation précédente plus large. On ne touche pas à
  -- celles où quelqu'un a déjà rejoint (`participants`) : on ne coupe pas le
  -- sol sous les pieds d'un participant déjà en séance.
  --
  -- Compté d'abord, modifié ensuite (plutôt qu'une CTE modifiante référencée
  -- en sous-requête scalaire, dont la validité est moins évidente à relire).
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
  SET session_id = NULL
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
    -- Tables reliquats remises dans le pool des tables libres.
    'tables_detached', v_detached,
    -- Tables reliquats conservées car des participants y sont déjà.
    'tables_orphaned', v_orphaned
  );
END;
$$;

GRANT EXECUTE ON FUNCTION apply_allocation(text, uuid, jsonb) TO anon, authenticated;
