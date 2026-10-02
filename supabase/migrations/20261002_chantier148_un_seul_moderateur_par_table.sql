-- Chantier 148 — Un seul écran modérateur (noir) par table.
--
-- Consigne de Jules (02/10) : « il peut y avoir plusieurs participants qui ont
-- un écran modérateur […] uniquement la personne qui est en tant que
-- modérateur de la table [doit avoir] l'écran modérateur » ; « quand un
-- participant […] prend la modération de sa table avec le code ecclesia […]
-- sur la vue superadmin, dans l'onglet groupe, il n'apparait pas en tant que
-- modo. De plus, quand on recharge la page […] il redevient participant ».
--
-- Causes (constatées sur la base dev le 02/10, une table en `debating` avait
-- deux titulaires distincts) :
--   1. Deux sources d'autorité indépendantes coexistaient sur une même table
--      de séance : `tables.created_by` (« modérateur physique », branche a de
--      `is_table_moderator`) et `tables.active_moderator_member_id` (branche b).
--      `claim_table_as_moderator`, `claim_moderator_status`,
--      `set_member_moderator(true)` posaient l'une sans effacer l'autre
--      (`COALESCE(active_moderator_member_id, …)`) → deux personnes différentes
--      pouvaient être titulaires, chacune avec son écran noir.
--   2. `reclaim_table_as_moderator` (Outils → « Reprendre l'animation de cette
--      table ») posait `created_by` + `active_moderator_member_id` mais jamais
--      `session_members.is_moderator = true` : absent de l'onglet Groupes
--      (la branche « modérateur physique » de `list_table_assignments_admin`
--      l'écarte dès qu'il a une ligne `session_members`), et au rechargement
--      le front (cache `tableStore.isModerator = false`, branche b exigeant
--      `is_moderator`) le repassait participant.
--
-- Règle posée : sur une table rattachée à une séance, le titulaire unique est
-- `active_moderator_member_id` (membre `is_moderator`, assis à cette table).
-- `created_by` ne confère plus l'animation que si AUCUN membre n'est titulaire
-- (`active_moderator_member_id IS NULL`) — repli pour les tables hors séance et
-- les modérateurs physiques sans ligne `session_members`. Les prises de
-- modération par un membre ne posent plus `created_by` sur son uid, et effacent
-- un éventuel modérateur physique assis.
--
-- Retire, de fait, l'« exception confirmée » du 2026-09-02 (CLAUDE.md) : elle
-- était déjà neutralisée par le chantier 106 (branche b exige
-- `active_moderator_member_id`), CLAUDE.md n'avait pas suivi.
--
-- Toutes les fonctions ci-dessous sont réécrites à partir de
-- `pg_get_functiondef` sur la base dev (2026-10-02, après le chantier 147).
-- `CREATE OR REPLACE` conserve les droits d'exécution existants.

-- ── Helper interne : efface le modérateur physique assis d'une table de séance
CREATE OR REPLACE FUNCTION public.clear_seated_physical_moderator(p_table_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  UPDATE tables t
  SET created_by = '00000000-0000-0000-0000-000000000000'::uuid
  WHERE t.id = p_table_id
    AND t.session_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM participants p
      WHERE p.table_id = t.id AND p.user_id = t.created_by
    );
$function$;

REVOKE ALL ON FUNCTION public.clear_seated_physical_moderator(uuid) FROM PUBLIC, anon, authenticated;

-- ── is_table_moderator : branche a (physique) seulement sans titulaire membre
CREATE OR REPLACE FUNCTION public.is_table_moderator(p_table_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT
    EXISTS (
      SELECT 1 FROM tables t
      WHERE t.id         = p_table_id
        AND t.created_by = auth.uid()
        AND (t.session_id IS NULL OR t.active_moderator_member_id IS NULL)
    )
    OR
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
$function$;

-- ── table_has_moderator : même condition sur le premier terme
CREATE OR REPLACE FUNCTION public.table_has_moderator(p_table_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT
    (
      NOT COALESCE((SELECT t.leaderless FROM tables t WHERE t.id = p_table_id), true)
      AND EXISTS (
        SELECT 1 FROM tables t
        JOIN participants p ON p.table_id = t.id AND p.user_id = t.created_by
        WHERE t.id = p_table_id
          AND (t.session_id IS NULL OR t.active_moderator_member_id IS NULL)
      )
    )
    OR
    EXISTS (
      SELECT 1
      FROM tables t
      JOIN session_members sm
        ON  sm.session_id   = t.session_id
        AND sm.is_moderator = true
        AND sm.id            = t.active_moderator_member_id
      JOIN table_assignments ta
        ON  ta.member_id  = sm.id
        AND ta.session_id = t.session_id
      WHERE t.id = p_table_id
        AND t.session_id IS NOT NULL
        AND ta.table_id = t.id
    );
$function$;

-- ── reclaim_table_as_moderator : pose aussi is_moderator, n'utilise plus
--    created_by quand l'appelant est membre de la séance
CREATE OR REPLACE FUNCTION public.reclaim_table_as_moderator(p_table_id uuid, p_creation_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_hash      text;
  v_table     tables%ROWTYPE;
  v_member_id uuid;
BEGIN
  IF NOT check_moderator_code(p_creation_code, (SELECT t.session_id FROM tables t WHERE t.id = p_table_id)) THEN RAISE EXCEPTION 'Code Ecclesia incorrect'; END IF;

  IF NOT is_table_participant(p_table_id) THEN
    RAISE EXCEPTION 'Tu dois être assis à cette table pour en reprendre l''animation';
  END IF;

  SELECT * INTO v_table FROM tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table introuvable';
  END IF;

  IF v_table.session_id IS NOT NULL THEN
    SELECT id INTO v_member_id
    FROM session_members
    WHERE session_id = v_table.session_id
      AND user_id    = auth.uid()
    LIMIT 1;
  END IF;

  IF v_member_id IS NOT NULL THEN
    -- Chantier 148 — titulaire unique = membre de la séance, avec son drapeau
    -- (onglet Groupes, survie au rechargement), assis à cette table.
    UPDATE session_members SET is_moderator = true
    WHERE id = v_member_id AND is_moderator = false;

    PERFORM sync_table_assignment(v_table.session_id, p_table_id,
      (SELECT pseudo FROM session_members WHERE id = v_member_id));

    PERFORM clear_seated_physical_moderator(p_table_id);

    UPDATE tables
    SET leaderless                 = false,
        active_moderator_member_id = v_member_id
    WHERE id = p_table_id;
  ELSE
    UPDATE tables
    SET created_by                  = auth.uid(),
        leaderless                  = false,
        active_moderator_member_id  = NULL
    WHERE id = p_table_id;
  END IF;

  RETURN jsonb_build_object(
    'table_id',                   p_table_id,
    'active_moderator_member_id', v_member_id
  );
END;
$function$;

-- ── claim_table_as_moderator : le membre devient titulaire (pas created_by),
--    sans déloger un titulaire effectif
CREATE OR REPLACE FUNCTION public.claim_table_as_moderator(p_join_code text, p_creation_code text, p_pseudo text, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_hash           text;
  v_table          tables%ROWTYPE;
  v_participant_id uuid;
  v_member_id      uuid;
  v_check          jsonb;
  v_pseudo         text;
  v_sync           jsonb;
  v_result         jsonb;
BEGIN
  IF NOT check_moderator_code(p_creation_code, (SELECT t.session_id FROM tables t WHERE t.join_code = upper(p_join_code))) THEN RAISE EXCEPTION 'Code Ecclesia incorrect'; END IF;

  SELECT * INTO v_table
  FROM tables
  WHERE join_code = upper(p_join_code)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table introuvable (code %)', upper(p_join_code);
  END IF;

  IF p_session_id IS NOT NULL AND v_table.session_id IS DISTINCT FROM p_session_id THEN
    RAISE EXCEPTION 'Ce code de table n''appartient pas à cette séance';
  END IF;

  IF p_pseudo IS NULL OR btrim(p_pseudo) = '' THEN
    RAISE EXCEPTION 'Le pseudo ne peut pas être vide';
  END IF;

  v_check := resolve_table_entry_pseudo(v_table.id, p_pseudo);
  IF coalesce((v_check->>'reconnect_required')::boolean, false) THEN
    RETURN v_check;
  END IF;
  v_pseudo := v_check->>'pseudo';

  IF table_has_moderator(v_table.id)
     AND NOT table_moderator_is(v_table.id, v_pseudo) THEN
    RAISE EXCEPTION 'Cette table a déjà un modérateur — choisis-en une autre ou contacte le superadmin';
  END IF;

  -- Modérateur physique (created_by) uniquement hors séance ; en séance, il
  -- est posé en repli plus bas si l'appelant n'a pas pu être inscrit.
  UPDATE tables
  SET created_by = CASE WHEN session_id IS NULL THEN auth.uid() ELSE created_by END,
      leaderless = false
  WHERE id = v_table.id;

  PERFORM leave_other_session_tables(v_table.session_id, v_table.id);

  INSERT INTO participants (table_id, user_id, pseudo)
  VALUES (v_table.id, auth.uid(), v_pseudo)
  ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
  RETURNING id INTO v_participant_id;

  IF v_table.session_id IS NOT NULL THEN
    v_sync := sync_table_assignment(v_table.session_id, v_table.id, v_pseudo);

    SELECT id INTO v_member_id
    FROM session_members
    WHERE session_id = v_table.session_id
      AND user_id    = auth.uid()
    LIMIT 1;

    IF v_member_id IS NOT NULL THEN
      UPDATE session_members
      SET is_moderator = true
      WHERE id = v_member_id
        AND is_moderator = false;

      IF NOT has_effective_moderator(v_table.id) THEN
        PERFORM clear_seated_physical_moderator(v_table.id);
        UPDATE tables
        SET active_moderator_member_id = v_member_id
        WHERE id = v_table.id;
      END IF;
    ELSE
      UPDATE tables
      SET created_by                 = auth.uid(),
          active_moderator_member_id = NULL
      WHERE id = v_table.id;
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'id',                      s.id,
    'join_code',               s.join_code,
    'created_by',              s.created_by,
    'current_speaker_id',      s.current_speaker_id,
    'current_turn_started_at', s.current_turn_started_at,
    'created_at',              s.created_at,
    'participant_id',          v_participant_id,
    'pseudo',                  v_pseudo
  ) INTO v_result
  FROM tables s WHERE s.id = v_table.id;

  RETURN v_result || COALESCE(v_sync, '{}'::jsonb);
END;
$function$;

-- ── join_simple_debate : le modérateur est le membre, plus created_by
CREATE OR REPLACE FUNCTION public.join_simple_debate(p_session_id uuid, p_pseudo text, p_creation_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_session         sessions%ROWTYPE;
  v_pseudo          text := btrim(coalesce(p_pseudo, ''));
  v_as_moderator    boolean := p_creation_code IS NOT NULL AND btrim(p_creation_code) <> '';
  v_hash            text;
  v_member          session_members%ROWTYPE;
  v_code            text;
  v_table_id        uuid;
  v_participant_id  uuid;
  v_result          jsonb;
BEGIN
  SELECT * INTO v_session FROM sessions WHERE id = p_session_id;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Séance introuvable';
  END IF;
  IF v_session.session_type <> 'debate' THEN
    RAISE EXCEPTION 'Cette séance n''est pas un débat simple.';
  END IF;
  IF v_session.phase <> 'debating' THEN
    RAISE EXCEPTION 'Le débat n''est pas ouvert.';
  END IF;

  IF v_as_moderator THEN
    IF NOT check_moderator_code(p_creation_code, p_session_id) THEN RAISE EXCEPTION 'Code Ecclesia incorrect'; END IF;
  END IF;

  SELECT * INTO v_member
  FROM session_members
  WHERE session_id = p_session_id AND user_id = auth.uid()
  LIMIT 1;

  IF v_member.id IS NULL THEN
    IF v_pseudo = '' THEN
      RAISE EXCEPTION 'Nom prénom requis';
    END IF;
    v_code := gen_member_reclaim_code(p_session_id);
    BEGIN
      INSERT INTO session_members (session_id, user_id, pseudo, joined_phase, attending_in_person, reclaim_code_hash)
      VALUES (p_session_id, auth.uid(), v_pseudo, 'debating', true, crypt(v_code, gen_salt('bf')))
      RETURNING * INTO v_member;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Ce nom est déjà utilisé dans ce débat. Si c''est toi, utilise ton code de rappel.';
    END;
  END IF;

  SELECT ta.table_id INTO v_table_id
  FROM table_assignments ta
  JOIN tables t ON t.id = ta.table_id
  WHERE ta.member_id = v_member.id AND ta.session_id = p_session_id
  LIMIT 1;

  IF v_as_moderator THEN
    IF v_table_id IS NOT NULL
       AND table_has_moderator(v_table_id)
       AND NOT table_moderator_is(v_table_id, v_member.pseudo) THEN
      v_table_id := NULL;
    END IF;
    IF v_table_id IS NULL THEN
      SELECT t.id INTO v_table_id
      FROM tables t
      WHERE t.session_id = p_session_id
        AND NOT table_has_moderator(t.id)
      ORDER BY t.table_number ASC NULLS LAST, t.join_code ASC
      LIMIT 1;
    END IF;
    IF v_table_id IS NULL THEN
      RAISE EXCEPTION 'Toutes les tables ont déjà un modérateur. Rejoins-en une comme participant, puis passe par Outils pour reprendre l''animation.';
    END IF;
  ELSIF v_table_id IS NULL THEN
    SELECT t.id INTO v_table_id
    FROM tables t
    LEFT JOIN (
      SELECT table_id, count(*) AS occupied FROM participants GROUP BY table_id
    ) occ ON occ.table_id = t.id
    WHERE t.session_id = p_session_id
    ORDER BY COALESCE(occ.occupied, 0) ASC, t.table_number ASC NULLS LAST, t.join_code ASC
    LIMIT 1;
    IF v_table_id IS NULL THEN
      RAISE EXCEPTION 'Aucune table n''est disponible pour ce débat.';
    END IF;
  END IF;

  PERFORM leave_other_session_tables(p_session_id, v_table_id);

  INSERT INTO participants (table_id, user_id, pseudo)
  VALUES (v_table_id, auth.uid(), v_member.pseudo)
  ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
  RETURNING id INTO v_participant_id;

  PERFORM sync_table_assignment(p_session_id, v_table_id, v_member.pseudo);

  IF v_as_moderator THEN
    UPDATE session_members SET is_moderator = true
    WHERE id = v_member.id AND is_moderator = false;

    PERFORM clear_seated_physical_moderator(v_table_id);

    UPDATE tables
    SET leaderless                 = false,
        active_moderator_member_id = v_member.id
    WHERE id = v_table_id;
  END IF;

  SELECT jsonb_build_object(
    'id',                      s.id,
    'join_code',               s.join_code,
    'created_by',              s.created_by,
    'current_speaker_id',      s.current_speaker_id,
    'current_turn_started_at', s.current_turn_started_at,
    'created_at',              s.created_at,
    'participant_id',          v_participant_id,
    'is_moderator',            is_table_moderator(s.id),
    'pseudo',                  v_member.pseudo,
    'new_reclaim_code',        v_code
  ) INTO v_result
  FROM tables s WHERE s.id = v_table_id;

  RETURN v_result;
END;
$function$;

-- ── claim_moderator_status : titulaire si la table n'a pas de titulaire
--    effectif (un titulaire périmé ne bloque plus), modérateur physique effacé
CREATE OR REPLACE FUNCTION public.claim_moderator_status(p_session_id uuid, p_creation_code text, p_pseudo text DEFAULT NULL::text, p_reclaim_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
  IF NOT check_moderator_code(p_creation_code, p_session_id) THEN RAISE EXCEPTION 'Code Ecclesia invalide'; END IF;

  SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;
  IF v_phase IS NULL THEN
    RAISE EXCEPTION 'Séance introuvable';
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
    IF NOT has_effective_moderator(v_current_table_id) THEN
      PERFORM clear_seated_physical_moderator(v_current_table_id);
      UPDATE tables
      SET leaderless = false,
          active_moderator_member_id = v_member.id
      WHERE id = v_current_table_id;
    ELSE
      UPDATE tables SET leaderless = false WHERE id = v_current_table_id;
    END IF;
  ELSIF v_current_table_id IS NULL AND v_phase != 'allocating' THEN
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

      IF NOT has_effective_moderator(v_table_id) THEN
        PERFORM clear_seated_physical_moderator(v_table_id);
        UPDATE tables
        SET active_moderator_member_id = v_member.id
        WHERE id = v_table_id;
      END IF;
    END IF;
  END IF;

  IF v_code IS NOT NULL THEN
    RETURN to_jsonb(v_member) || jsonb_build_object('new_reclaim_code', v_code);
  END IF;
  RETURN to_jsonb(v_member);
END;
$function$;

-- ── set_member_moderator : idem en promotion ; en retrait, efface le
--    modérateur physique de cet uid sur TOUTES les tables de la séance
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
      IF NOT has_effective_moderator(v_current_table_id) THEN
        PERFORM clear_seated_physical_moderator(v_current_table_id);
        UPDATE tables
        SET leaderless = false,
            active_moderator_member_id = p_member_id
        WHERE id = v_current_table_id;
      ELSE
        UPDATE tables SET leaderless = false WHERE id = v_current_table_id;
      END IF;
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

        IF NOT has_effective_moderator(v_table_id) THEN
          PERFORM clear_seated_physical_moderator(v_table_id);
          UPDATE tables
          SET active_moderator_member_id = p_member_id
          WHERE id = v_table_id;
        END IF;
      END IF;
    END IF;

  ELSE
    UPDATE tables
    SET created_by = table_owner_uid(p_session_id)
    WHERE session_id = p_session_id
      AND created_by = v_member.user_id;

    UPDATE tables
    SET active_moderator_member_id = NULL
    WHERE session_id = p_session_id
      AND active_moderator_member_id = p_member_id;
  END IF;

  RETURN to_jsonb(v_member);
END;
$function$;

-- ── Réparation des tables existantes (tables de séance avec un modérateur
--    physique assis)
-- a) Physique seul, membre de la séance : il devient le titulaire membre.
WITH phys AS (
  SELECT t.id AS table_id, sm.id AS member_id
  FROM tables t
  JOIN participants p     ON p.table_id = t.id AND p.user_id = t.created_by
  JOIN session_members sm ON sm.session_id = t.session_id AND sm.user_id = t.created_by
  WHERE t.session_id IS NOT NULL
    AND t.leaderless = false
    AND t.active_moderator_member_id IS NULL
)
UPDATE session_members sm SET is_moderator = true
FROM phys WHERE sm.id = phys.member_id AND sm.is_moderator = false;

UPDATE tables t
SET active_moderator_member_id = sm.id
FROM participants p, session_members sm
WHERE p.table_id = t.id AND p.user_id = t.created_by
  AND sm.session_id = t.session_id AND sm.user_id = t.created_by
  AND t.session_id IS NOT NULL
  AND t.leaderless = false
  AND t.active_moderator_member_id IS NULL;

-- b) Titulaire membre = ancien `reclaim` sans drapeau : on pose le drapeau.
UPDATE session_members sm SET is_moderator = true
FROM tables t
WHERE t.active_moderator_member_id = sm.id
  AND sm.user_id = t.created_by
  AND sm.is_moderator = false;

-- c) Tout modérateur physique assis sur une table qui a désormais un titulaire
--    membre est effacé (c'était le second écran noir).
UPDATE tables t
SET created_by = '00000000-0000-0000-0000-000000000000'::uuid
WHERE t.session_id IS NOT NULL
  AND t.active_moderator_member_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM participants p WHERE p.table_id = t.id AND p.user_id = t.created_by);
