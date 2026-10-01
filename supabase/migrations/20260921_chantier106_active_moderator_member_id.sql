-- Chantier 106 — Un seul écran modérateur par table (« déclaré » ≠ « en exercice »)
--
-- Constat (audit 87/101, problème A) : `is_table_moderator` accorde l'autorité
-- SQL à *tout* membre `session_members.is_moderator` assis à la table visée.
-- L'allocation assoit sciemment des modérateurs en surplus (chantier 25b) comme
-- participants ordinaires SANS leur retirer le drapeau `is_moderator` — décision
-- de Jules confirmée le 2026-09-20 (arbitrage 2 : « un modo qui n'anime aucune
-- table est un participant : il garde son drapeau, mais perd l'écran »). Deux
-- `ModeratorView` peuvent donc aujourd'hui piloter la même file d'attente et le
-- même chrono : le modérateur en exercice, et n'importe quel surplus assis là.
--
-- Le geste : une colonne `tables.active_moderator_member_id` désigne LE membre
-- dont le drapeau donne l'autorité d'animation sur cette table précise. Posée
-- par le premier chemin qui attribue l'animation (arbitrage 4 : « le modérateur
-- est le premier arrivé, et sinon, le superadmin peut changer les modos de
-- place avec son interface de groupe ») — d'où les COALESCE ci-dessous : un
-- chemin qui attribue l'animation à quelqu'un ne déloge jamais qui que ce soit
-- déjà en exercice. `session_members.is_moderator` ne change pas de sémantique
-- et n'est jamais retiré par ce chantier (demande explicite de Jules : le
-- superadmin doit continuer à voir qui est modérateur « en plus »).
--
-- Les 5 chemins qui attribuent aujourd'hui l'animation, tous mis à jour ici :
-- apply_allocation, claim_moderator_status, set_member_moderator,
-- assign_moderator_to_table, claim_table_as_moderator. Un seul oublié fait
-- réapparaître deux écrans — c'est le risque principal du chantier.
--
-- `is_table_moderator` (chantier 60) : sa branche (b) — modérateur désigné de
-- la séance, assis à cette table — exige maintenant EN PLUS que ce membre soit
-- l'occupant de `active_moderator_member_id`. La branche (a) — créateur
-- physique de la table (`claim_table_as_moderator`) — est inchangée : elle ne
-- pose aucune condition sur `session_members`, ce chantier ne la touche pas.
-- Définition comparée à `pg_get_functiondef` en base avant réécriture (règle
-- SQL du CLAUDE.md) — dernière version en base : chantier 60, jamais redéfinie
-- depuis (vérifié : aucune migration ultérieure ne touche `is_table_moderator`).

-- ─────────────────────────────────────────────────────────────
-- 1. Colonne
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.tables
  ADD COLUMN IF NOT EXISTS active_moderator_member_id uuid
    REFERENCES public.session_members(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tables.active_moderator_member_id IS
  'Chantier 106 — le session_members dont is_moderator donne l''autorité '
  'd''animation SQL sur cette table (is_table_moderator, branche b). '
  'Posé par le premier chemin qui attribue l''animation ; jamais écrasé '
  'par un chemin suivant (COALESCE) sauf action explicite du superadmin '
  '(set_member_moderator en retrait). NULL = aucun modérateur de séance '
  'en exercice ici (peut rester leaderless, ou n''avoir qu''un modérateur '
  'physique via claim_table_as_moderator, branche a, non concernée).';

-- ─────────────────────────────────────────────────────────────
-- 2. is_table_moderator — exige active_moderator_member_id en branche (b)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_table_moderator(p_table_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, extensions
AS $$
  SELECT
    -- (a) créateur physique de la table — inchangé
    EXISTS (
      SELECT 1 FROM tables t
      WHERE t.id         = p_table_id
        AND t.created_by = auth.uid()
    )
    OR
    -- (b) modérateur désigné de la séance, assis à CETTE table, ET EN EXERCICE
    -- (chantier 106 : sm.id = t.active_moderator_member_id, en plus des
    -- conditions déjà cumulatives — un modérateur en surplus assis là ne
    -- passe plus cette branche)
    EXISTS (
      SELECT 1
      FROM tables t
      JOIN session_members sm
        ON  sm.session_id   = t.session_id
        AND sm.user_id      = auth.uid()
        AND sm.is_moderator = true
        AND sm.id           = t.active_moderator_member_id
      JOIN table_assignments ta
        ON  ta.member_id  = sm.id
        AND ta.session_id = t.session_id
      WHERE t.id = p_table_id
        AND t.session_id IS NOT NULL
        AND (
          ta.table_id = t.id
          OR (
            ta.table_id IS NULL
            AND EXISTS (
              SELECT 1 FROM table_assignments ta2
              WHERE ta2.session_id   = t.session_id
                AND ta2.table_number = ta.table_number
                AND ta2.table_id     = t.id
            )
          )
        )
    );
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. apply_allocation — pose active_moderator_member_id (1er modérateur
--    listé pour la table), le vide sur les tables non modérées
-- ─────────────────────────────────────────────────────────────

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
      VALUES (v_join_code, auth.uid(), p_session_id, NOT v_moderated, NOT v_moderated, v_num)
      RETURNING id INTO v_table_id;
      v_created := v_created + 1;
    END IF;

    v_used_ids := v_used_ids || v_table_id;

    -- Chantier 106 : « le modérateur est le premier arrivé » — COALESCE ne
    -- délogera jamais un modérateur déjà en exercice sur cette table (ex.
    -- reprise via claim_table_as_moderator, ou recalcul d'allocation après
    -- qu'un modérateur s'est déjà déclaré). Une table non modérée n'a jamais
    -- de modérateur en exercice.
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

-- ─────────────────────────────────────────────────────────────
-- 4. claim_moderator_status — pose active_moderator_member_id (COALESCE)
--    quand la déclaration place effectivement le membre sur une table
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.claim_moderator_status(
  p_session_id   uuid,
  p_creation_code text,
  p_pseudo       text DEFAULT NULL::text,
  p_reclaim_code text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash             text;
  v_member           session_members%ROWTYPE;
  v_phase            text;
  v_attending        boolean;
  v_table_num        int;
  v_table_id         uuid;
  v_current_table_id uuid;
  v_code             text;
BEGIN
  SELECT value INTO v_hash FROM app_config WHERE key = 'creation_code_hash';
  IF v_hash IS NULL OR crypt(p_creation_code, v_hash) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'Code Ecclesia invalide';
  END IF;

  UPDATE session_members
  SET is_moderator = true
  WHERE session_id = p_session_id
    AND user_id = auth.uid()
  RETURNING * INTO v_member;

  IF NOT FOUND THEN
    IF p_pseudo IS NULL OR btrim(p_pseudo) = '' THEN
      RAISE EXCEPTION 'Nom prénom requis pour se déclarer modérateur';
    END IF;

    SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;
    IF v_phase IS NULL THEN
      RAISE EXCEPTION 'Séance introuvable';
    END IF;
    IF v_phase NOT IN ('pre_voting', 'voting', 'allocating', 'debating') THEN
      RAISE EXCEPTION 'La séance n''est pas dans une phase permettant l''inscription (phase: %)', v_phase;
    END IF;

    v_attending := v_phase != 'pre_voting';
    v_code      := gen_member_reclaim_code(p_session_id);

    BEGIN
      INSERT INTO session_members(session_id, user_id, pseudo, joined_phase, attending_in_person, is_moderator, reclaim_code_hash)
      VALUES (p_session_id, auth.uid(), btrim(p_pseudo), v_phase, v_attending, true,
              crypt(v_code, gen_salt('bf')))
      RETURNING * INTO v_member;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Ce nom prénom est déjà pris pour cette séance';
    END;
  END IF;

  SELECT ta.table_id INTO v_current_table_id
  FROM table_assignments ta
  WHERE ta.session_id = p_session_id
    AND ta.member_id  = v_member.id;

  IF v_current_table_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM tables WHERE id = v_current_table_id AND leaderless = true)
  THEN
    -- Chantier 106 : COALESCE — ne déloge jamais un modérateur déjà en
    -- exercice (ne devrait pas arriver sur une table leaderless, mais reste
    -- cohérent avec « le premier arrivé »).
    UPDATE tables
    SET leaderless = false,
        active_moderator_member_id = COALESCE(active_moderator_member_id, v_member.id)
    WHERE id = v_current_table_id;
  ELSE
    SELECT ta.table_number, ta.table_id
    INTO v_table_num, v_table_id
    FROM table_assignments ta
    JOIN tables t ON t.id = ta.table_id
    WHERE ta.session_id = p_session_id
      AND t.leaderless = false
      AND NOT EXISTS (
        SELECT 1
        FROM table_assignments ta2
        JOIN session_members sm2 ON sm2.id = ta2.member_id
        WHERE ta2.session_id = ta.session_id
          AND ta2.table_number = ta.table_number
          AND sm2.is_moderator = true
      )
    ORDER BY ta.table_number
    LIMIT 1;

    IF v_table_num IS NOT NULL THEN
      INSERT INTO table_assignments (session_id, member_id, table_number, table_id)
      VALUES (p_session_id, v_member.id, v_table_num, v_table_id)
      ON CONFLICT (session_id, member_id)
      DO UPDATE SET table_number = EXCLUDED.table_number, table_id = EXCLUDED.table_id;

      UPDATE tables
      SET active_moderator_member_id = COALESCE(active_moderator_member_id, v_member.id)
      WHERE id = v_table_id;
    END IF;
  END IF;

  IF v_code IS NOT NULL THEN
    RETURN to_jsonb(v_member) || jsonb_build_object('new_reclaim_code', v_code);
  END IF;
  RETURN to_jsonb(v_member);
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 5. set_member_moderator — COALESCE à l'octroi ; libère
--    active_moderator_member_id (en plus de created_by) au retrait, si
--    c'était bien ce membre qui était en exercice
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_member_moderator(
  p_password     text,
  p_session_id   uuid,
  p_member_id    uuid,
  p_is_moderator boolean
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_member           session_members%ROWTYPE;
  v_table_num        int;
  v_table_id         uuid;
  v_current_table_id uuid;
BEGIN
  PERFORM check_superadmin_password(p_password);

  UPDATE session_members
  SET is_moderator = p_is_moderator
  WHERE id = p_member_id
    AND session_id = p_session_id
  RETURNING * INTO v_member;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membre introuvable pour cette séance';
  END IF;

  IF p_is_moderator THEN
    SELECT ta.table_id INTO v_current_table_id
    FROM table_assignments ta
    WHERE ta.session_id = p_session_id
      AND ta.member_id  = p_member_id;

    IF v_current_table_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM tables WHERE id = v_current_table_id AND leaderless = true)
    THEN
      UPDATE tables
      SET leaderless = false,
          active_moderator_member_id = COALESCE(active_moderator_member_id, p_member_id)
      WHERE id = v_current_table_id;
    ELSE
      SELECT ta.table_number, ta.table_id
      INTO v_table_num, v_table_id
      FROM table_assignments ta
      JOIN tables t ON t.id = ta.table_id
      WHERE ta.session_id = p_session_id
        AND t.leaderless = false
        AND NOT EXISTS (
          SELECT 1
          FROM table_assignments ta2
          JOIN session_members sm2 ON sm2.id = ta2.member_id
          WHERE ta2.session_id = ta.session_id
            AND ta2.table_number = ta.table_number
            AND sm2.is_moderator = true
        )
      ORDER BY ta.table_number
      LIMIT 1;

      IF v_table_num IS NOT NULL THEN
        INSERT INTO table_assignments (session_id, member_id, table_number, table_id)
        VALUES (p_session_id, p_member_id, v_table_num, v_table_id)
        ON CONFLICT (session_id, member_id)
        DO UPDATE SET table_number = EXCLUDED.table_number, table_id = EXCLUDED.table_id;

        UPDATE tables
        SET active_moderator_member_id = COALESCE(active_moderator_member_id, p_member_id)
        WHERE id = v_table_id;
      END IF;
    END IF;

  ELSE
    SELECT ta.table_id INTO v_current_table_id
    FROM table_assignments ta
    WHERE ta.session_id = p_session_id
      AND ta.member_id  = p_member_id;

    IF v_current_table_id IS NOT NULL THEN
      UPDATE tables
      SET created_by = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
      WHERE id         = v_current_table_id
        AND created_by = v_member.user_id;

      -- Chantier 106 : le membre démis perd l'écran en même temps que
      -- l'autorité SQL — sinon `active_moderator_member_id` pointerait
      -- vers un session_members désormais is_moderator=false, et
      -- `is_table_moderator` refuserait tout le monde sur cette table
      -- jusqu'à la prochaine attribution.
      UPDATE tables
      SET active_moderator_member_id = NULL
      WHERE id = v_current_table_id
        AND active_moderator_member_id = p_member_id;
    END IF;
  END IF;

  RETURN to_jsonb(v_member);
END;
$fn$;

GRANT EXECUTE ON FUNCTION set_member_moderator(text, uuid, uuid, boolean) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 6. assign_moderator_to_table — COALESCE (ne déloge personne déjà en
--    exercice sur la table cible)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION assign_moderator_to_table(
  p_password      text,
  p_session_id    uuid,
  p_table_number  int,
  p_member_id     uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_table_id uuid;
BEGIN
  PERFORM check_superadmin_password(p_password);

  IF NOT EXISTS (
    SELECT 1 FROM session_members WHERE id = p_member_id AND session_id = p_session_id
  ) THEN
    RAISE EXCEPTION 'Ce membre n''appartient pas à cette séance';
  END IF;

  SELECT DISTINCT table_id INTO v_table_id
  FROM table_assignments
  WHERE session_id = p_session_id
    AND table_number = p_table_number
  LIMIT 1;

  UPDATE session_members SET is_moderator = true WHERE id = p_member_id;

  INSERT INTO table_assignments (session_id, member_id, table_number, table_id)
  VALUES (p_session_id, p_member_id, p_table_number, v_table_id)
  ON CONFLICT (session_id, member_id)
  DO UPDATE SET table_number = EXCLUDED.table_number, table_id = EXCLUDED.table_id;

  IF v_table_id IS NOT NULL THEN
    UPDATE tables
    SET leaderless = false,
        active_moderator_member_id = COALESCE(active_moderator_member_id, p_member_id)
    WHERE id = v_table_id AND leaderless = true;

    -- La table pouvait déjà être moderated (leaderless = false, aucune ligne
    -- ci-dessus touchée) sans jamais avoir eu d'active_moderator_member_id
    -- posé (ex. créée directement moderated par apply_allocation sans
    -- modérateur listé) : la même garantie COALESCE s'applique.
    UPDATE tables
    SET active_moderator_member_id = COALESCE(active_moderator_member_id, p_member_id)
    WHERE id = v_table_id AND leaderless = false;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION assign_moderator_to_table(text, uuid, int, uuid) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 7. claim_table_as_moderator — pose active_moderator_member_id si un
--    session_members correspondant existe pour cette séance (sinon reste
--    NULL, la branche (a) d'is_table_moderator suffit déjà à cet appelant)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.claim_table_as_moderator(
  p_join_code     text,
  p_creation_code text,
  p_pseudo        text,
  p_session_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_hash           text;
  v_table          tables%ROWTYPE;
  v_participant_id uuid;
  v_member_id      uuid;
  v_result         jsonb;
BEGIN
  -- 1. Code Ecclesia
  SELECT value INTO v_hash FROM app_config WHERE key = 'creation_code_hash';
  IF v_hash IS NULL OR crypt(p_creation_code, v_hash) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'Code Ecclesia incorrect';
  END IF;

  -- 2. Table — FOR UPDATE
  SELECT * INTO v_table
  FROM tables
  WHERE join_code = upper(p_join_code)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table introuvable (code %)', upper(p_join_code);
  END IF;

  -- 3. Séance
  IF p_session_id IS NOT NULL AND v_table.session_id IS DISTINCT FROM p_session_id THEN
    RAISE EXCEPTION 'Ce code de table n''appartient pas à cette séance';
  END IF;

  -- 4. Pseudo
  IF p_pseudo IS NULL OR btrim(p_pseudo) = '' THEN
    RAISE EXCEPTION 'Le pseudo ne peut pas être vide';
  END IF;

  -- 5. Déjà un modérateur — et si oui, est-ce quelqu'un d'AUTRE ?
  IF table_has_moderator(v_table.id)
     AND NOT table_moderator_is(v_table.id, p_pseudo) THEN
    RAISE EXCEPTION 'Cette table a déjà un modérateur — choisis-en une autre ou contacte le superadmin';
  END IF;

  -- 6. Prise en charge : devient créateur physique + siège comme participant.
  -- Chantier 106 : si l'appelant a une ligne session_members pour cette
  -- séance, elle devient (COALESCE) le modérateur en exercice — sans quoi
  -- il n'y aurait aucun moyen de retrouver, via active_moderator_member_id,
  -- qui anime la table depuis l'onglet Groupes du superadmin. Ne s'applique
  -- que si la table est rattachée à une séance ; une table autonome n'a de
  -- toute façon aucun session_members à référencer, et sa branche (a)
  -- (created_by) suffit déjà à l'authoriser.
  IF v_table.session_id IS NOT NULL THEN
    SELECT id INTO v_member_id
    FROM session_members
    WHERE session_id = v_table.session_id
      AND user_id    = auth.uid();
  END IF;

  UPDATE tables
  SET created_by = auth.uid(),
      leaderless = false,
      active_moderator_member_id = COALESCE(active_moderator_member_id, v_member_id)
  WHERE id = v_table.id;

  PERFORM leave_other_session_tables(v_table.session_id, v_table.id);

  INSERT INTO participants (table_id, user_id, pseudo)
  VALUES (v_table.id, auth.uid(), btrim(p_pseudo))
  ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
  RETURNING id INTO v_participant_id;

  SELECT jsonb_build_object(
    'id',                      s.id,
    'join_code',               s.join_code,
    'created_by',              s.created_by,
    'current_speaker_id',      s.current_speaker_id,
    'current_turn_started_at', s.current_turn_started_at,
    'created_at',              s.created_at,
    'participant_id',          v_participant_id
  ) INTO v_result
  FROM tables s WHERE s.id = v_table.id;

  RETURN v_result;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.claim_table_as_moderator(text, text, text, uuid) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 8. list_table_assignments_admin — expose active_moderator_member_id par
--    ligne, pour que l'onglet Groupes distingue « en exercice » de
--    « en surplus » (chantier 50 : lecture directe de `tables` refusée au
--    superadmin, il n'est membre d'aucune séance — is_table_participant
--    échoue toujours pour lui. Cette RPC SECURITY DEFINER reste le seul
--    chemin, comme pour pseudo/is_moderator).
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.list_table_assignments_admin(p_password text, p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  PERFORM check_superadmin_password(p_password);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'table_number',               ta.table_number,
    'member_id',                  ta.member_id,
    'table_id',                   ta.table_id,
    'pseudo',                     sm.pseudo,
    'is_moderator',               sm.is_moderator,
    'active_moderator_member_id', t.active_moderator_member_id
  ) ORDER BY ta.table_number), '[]'::jsonb) INTO v_rows
  FROM table_assignments ta
  JOIN session_members sm ON sm.id = ta.member_id
  LEFT JOIN tables t ON t.id = ta.table_id
  WHERE ta.session_id = p_session_id;

  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_table_assignments_admin(text, uuid) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Vérification (à exécuter après application) :
--
-- 1. Colonne posée, FK correcte :
--    SELECT column_name, data_type, is_nullable
--    FROM information_schema.columns
--    WHERE table_name = 'tables' AND column_name = 'active_moderator_member_id';
--
-- 2. Deux modérateurs is_moderator=true assis à la même table (un en
--    exercice via active_moderator_member_id, un en surplus) : seul le
--    premier voit is_table_moderator(id) répondre true pour son propre uid.
--
-- 3. Recette navigateur (à consigner dans A_VERIFIER.md) : allouer une
--    séance avec un modérateur en surplus (plus de modérateurs que de
--    tables), vérifier qu'il voit ParticipantView (pas ModeratorView) et
--    que le superadmin le voit distinctement dans l'onglet Groupes.
-- ─────────────────────────────────────────────────────────────
