-- Chantier 147 — Débat simple / d'association : le premier arrivant ne devient
-- plus modérateur, et la vue Groupes cesse d'être « vide » pour lui.
--
-- CAUSE (reproduite sur la base dev, séance « Débat test asso ») :
--   `create_session` → `create_session_table_internal` posait
--   `tables.created_by = auth.uid()` = l'uid **de l'administrateur** (superadmin
--   ou association) qui crée la séance. Or `created_by` est lu comme « créateur
--   physique = modérateur » à deux endroits :
--     · `is_table_moderator`, branche (a) : `t.created_by = auth.uid()` ;
--     · `table_has_moderator`, 1er terme : table non leaderless ET un
--       `participants` dont `user_id = created_by`.
--   Dès que l'organisateur ouvrait le lien du débat **depuis son propre
--   navigateur** (même uid anonyme que sa session d'administration — c'est
--   exactement ce que fait quiconque teste son débat), `join_simple_debate`
--   répondait `is_moderator = true` : il devenait modérateur sans désignation,
--   et la table comptait comme « déjà modérée » (le vrai modérateur arrivé
--   ensuite était refusé : « Toutes les tables ont déjà un modérateur »).
--   Dans l'onglet Groupes, ce faux modérateur n'apparaissait nulle part :
--   `session_members.is_moderator = false` pour lui, et la branche « modérateur
--   physique » de `list_table_assignments_admin` l'écarte dès qu'une ligne
--   `session_members` existe pour son uid → « modération de la table vide ».
--
-- CORRECTIF : dans une séance `debate`, aucune table n'est jamais « possédée »
-- par un administrateur. Son `created_by` est l'uid sentinelle
-- 00000000-…-0000 (déjà utilisée par `release_table_moderation` /
-- `set_member_moderator` quand `auth.uid()` est NULL ; aucune clé étrangère sur
-- `tables.created_by`). Seuls les chemins qui attribuent vraiment l'animation
-- (`join_simple_debate` avec code, `claim_table_as_moderator`, …) y posent un
-- uid réel. Les tables des autres types de séance sont inchangées.
--
-- Trois écritures de `created_by` sont concernées, toutes réécrites à partir de
-- leur définition courante en base (pg_get_functiondef, dev, 2026-10-02) :
--   · `create_session_table_internal` (création de la table, `create_session`
--     et ajout depuis l'onglet Groupes) ;
--   · `release_table_moderation` (retrait de l'animation → `created_by` repassait
--     à l'uid de l'administrateur : même défaut au retour d'un modérateur) ;
--   · `set_member_moderator` (retrait du drapeau, idem).
-- Un helper unique `table_owner_uid(session_id)` porte la règle.

-- ── 1. Helper : qui est « propriétaire » d'une table d'une séance ? ─────────
CREATE OR REPLACE FUNCTION public.table_owner_uid(p_session_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM sessions s
                 WHERE s.id = p_session_id AND s.session_type = 'debate')
      THEN '00000000-0000-0000-0000-000000000000'::uuid
    ELSE COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  END;
$function$;

REVOKE ALL ON FUNCTION public.table_owner_uid(uuid) FROM PUBLIC, anon, authenticated;

-- ── 2. create_session_table_internal ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_session_table_internal(p_session_id uuid, p_leaderless boolean)
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
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'Séance requise';
  END IF;

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

  -- Chantier 147 — `table_owner_uid` : sentinelle pour un débat simple (voir
  -- l'en-tête), uid de l'appelant sinon (comportement inchangé).
  INSERT INTO tables (join_code, created_by, session_id, leaderless, leaderless_by_design, table_number)
  VALUES (v_join_code, table_owner_uid(p_session_id), p_session_id, p_leaderless, p_leaderless, v_number)
  RETURNING id INTO v_table_id;

  RETURN jsonb_build_object('table_id', v_table_id, 'join_code', v_join_code, 'table_number', v_number);
END;
$function$;

-- ── 3. release_table_moderation ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.release_table_moderation(p_password text, p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_table              tables%ROWTYPE;
  v_owner              uuid;
  v_old_creator        uuid;
  v_physical           boolean := false;
  v_active_released    boolean := false;
  v_physical_pseudo    text;
  v_physical_member_id uuid;
  v_physical_ensured   boolean := false;
  v_new_code           text;
BEGIN
  PERFORM check_table_admin(p_password, p_table_id);

  SELECT * INTO v_table FROM tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table introuvable';
  END IF;

  -- Chantier 147 — était `COALESCE(auth.uid(), sentinelle)` : en débat simple,
  -- l'administrateur qui retire un modérateur devenait propriétaire de la table
  -- et, assis à sa propre table, modérateur à son tour.
  v_owner := table_owner_uid(v_table.session_id);

  v_old_creator := v_table.created_by;

  IF v_table.active_moderator_member_id IS NOT NULL THEN
    UPDATE tables SET active_moderator_member_id = NULL WHERE id = v_table.id;
    v_active_released := true;
  END IF;

  IF v_table.created_by IS DISTINCT FROM v_owner THEN
    UPDATE tables SET created_by = v_owner WHERE id = v_table.id;
    v_physical := true;
  END IF;

  IF v_physical AND v_table.session_id IS NOT NULL THEN
    SELECT p.pseudo INTO v_physical_pseudo
    FROM participants p
    WHERE p.table_id = v_table.id AND p.user_id = v_old_creator
    LIMIT 1;

    IF v_physical_pseudo IS NOT NULL THEN
      SELECT id INTO v_physical_member_id
      FROM session_members
      WHERE session_id = v_table.session_id
        AND user_id    = v_old_creator;

      IF v_physical_member_id IS NULL THEN
        v_new_code := gen_member_reclaim_code(v_table.session_id);
        BEGIN
          INSERT INTO session_members (
            session_id, user_id, pseudo, joined_phase,
            attending_in_person, is_moderator, reclaim_code_hash
          )
          VALUES (
            v_table.session_id, v_old_creator, v_physical_pseudo, 'debating',
            true, true, crypt(v_new_code, gen_salt('bf'))
          )
          RETURNING id INTO v_physical_member_id;
        EXCEPTION WHEN unique_violation THEN
          v_physical_member_id := NULL;
          v_new_code           := NULL;
        END;

        IF v_physical_member_id IS NOT NULL THEN
          INSERT INTO table_assignments (session_id, member_id, table_number, table_id)
          VALUES (v_table.session_id, v_physical_member_id, v_table.table_number, v_table.id)
          ON CONFLICT (session_id, member_id)
          DO UPDATE SET table_number = EXCLUDED.table_number, table_id = EXCLUDED.table_id;
          v_physical_ensured := true;
        END IF;
      ELSE
        UPDATE session_members
        SET is_moderator = true
        WHERE id = v_physical_member_id
          AND is_moderator = false;
        v_physical_ensured := true;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'released_physical',      v_physical,
    'released_active',        v_active_released,
    'physical_member_ensured', v_physical_ensured,
    'new_reclaim_code',        v_new_code,
    'has_moderator',           table_has_moderator(v_table.id)
  );
END;
$function$;

-- ── 4. set_member_moderator ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_member_moderator(p_password text, p_session_id uuid, p_member_id uuid, p_is_moderator boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_member           session_members%ROWTYPE;
  v_table_num        int;
  v_table_id         uuid;
  v_current_table_id uuid;
BEGIN
  PERFORM check_session_admin(p_password, p_session_id);

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
      -- Chantier 147 — `table_owner_uid` remplace
      -- `COALESCE(auth.uid(), sentinelle)` (identique hors débat simple).
      UPDATE tables
      SET created_by = table_owner_uid(p_session_id)
      WHERE id         = v_current_table_id
        AND created_by = v_member.user_id;

      UPDATE tables
      SET active_moderator_member_id = NULL
      WHERE id = v_current_table_id
        AND active_moderator_member_id = p_member_id;
    END IF;
  END IF;

  RETURN to_jsonb(v_member);
END;
$function$;

-- ── 5. Réparation des tables déjà dans cet état ─────────────────────────────
-- Table de débat simple dont `created_by` désigne un participant qui est un
-- membre NON modérateur de la séance : l'animation n'a jamais été attribuée
-- (toute prise par code pose `session_members.is_moderator = true`), seul
-- l'uid administrateur de création faisait de lui un faux modérateur.
-- Sur dev : 1 table (« Débat test asso »). Sur prod : aucune (aucun débat simple).
UPDATE tables t
SET created_by = '00000000-0000-0000-0000-000000000000'::uuid
FROM sessions s
WHERE s.id = t.session_id
  AND s.session_type = 'debate'
  AND t.active_moderator_member_id IS NULL
  AND t.created_by <> '00000000-0000-0000-0000-000000000000'::uuid
  AND EXISTS (
    SELECT 1 FROM session_members sm
    WHERE sm.session_id = t.session_id
      AND sm.user_id    = t.created_by
      AND sm.is_moderator = false
  );
