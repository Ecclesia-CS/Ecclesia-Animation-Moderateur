-- =============================================================
-- Chantier 118 — Un modérateur « physique » retiré doit devenir un
--                session_member normal, flagué modérateur
--
-- RETOUR DE JULES (2026-09-21), après test du chantier 117
-- -------------------------------------------------------------------
-- « quand je tente de cliquer sur "enlever" ou "libérer la modération de
--   cette table" ce n'est pas possible, il y a marqué "membre introuvable
--   pour cette séance". Je pense que les modérateurs ne sont pas encore
--   traités comme des participants, alors que le but, c'est que quand ils
--   ne tiennent plus la modération d'une table (l'écran modérateur), ils
--   soient comme des participants normaux, avec des codes, des votes, etc,
--   mais juste flagué modérateur pour que le superadmin sache qu'ils sont
--   là s'il a besoin d'eux. C'est dans la continuité de différencier
--   modérateur d'une table, et modérateur flagué qu'on avait déjà fait
--   dans un autre chantier [chantier 106]. »
--
-- AMENDEMENT LU AVANT DE CODER (voir docs/chantiers-a-faire.md, entrée 118)
-- -------------------------------------------------------------------
-- Le chantier 119, mergé sur `main` le même jour, a déjà fait la moitié du
-- travail : `claim_table_as_moderator` appelle désormais
-- `sync_table_assignment` dès la prise de table, ce qui crée (si besoin)
-- une ligne `session_members` + `table_assignments` + un VRAI code de
-- rappel haché pour le modérateur physique — c'est l'« Option B » décrite
-- dans la spec d'origine. Ce qui manquait encore, vérifié par
-- `pg_get_functiondef` en base avant d'écrire ce fichier (constat confirmé,
-- pas supposé) :
--   (a) cette ligne `session_members` n'a jamais `is_moderator = true` —
--       le modérateur physique existe comme participant ordinaire, pas
--       comme « modérateur flagué » ;
--   (b) le message d'erreur que Jules a vu (« membre introuvable pour
--       cette séance ») venait de `set_member_moderator`
--       (`handleRemoveTableModerator`), appelée sur un `member_id = NULL`
--       — comportement du FRONT attendu (voir SuperadminScreen.tsx,
--       chantier 117 : ce bouton n'est jamais câblé sur un modérateur
--       physique, seul « Libérer la modération de cette table »
--       (`release_table_moderation`) l'est). Le vrai problème n'est donc
--       pas ce message, mais ce que `release_table_moderation` fait
--       ENSUITE : elle existait déjà (chantier 72) et libère la table,
--       mais ne pose ni ne garantit aucun flag `is_moderator` — un
--       modérateur physique libéré retombe en participant anonyme, sans
--       aucune trace pour le superadmin (l'inverse de ce que Jules
--       demande) ;
--   (c) les lignes créées par `claim_table_as_moderator` AVANT le merge du
--       119 (aucune ligne `session_members` du tout, cas exact du
--       chantier 117) doivent pouvoir rattraper ce même état à la
--       libération — pas seulement les nouvelles.
--
-- LE GESTE — trois fonctions touchées
-- =============================================================
-- §1 `table_has_moderator` — sa branche (b) ignorait
--    `active_moderator_member_id` (contrairement à `is_table_moderator`,
--    déjà corrigée au chantier 106) : un modérateur qui garde son drapeau
--    après avoir perdu l'animation continuait de faire répondre
--    `table_has_moderator = true` pour sa table, la rendant à jamais non
--    reprenable. Nécessaire pour pouvoir arrêter de retirer le drapeau
--    en §3 sans casser `claim_table_as_moderator` (qui s'appuie sur ce
--    helper, chantier 68/72).
-- §2 `claim_table_as_moderator` — flague `is_moderator = true` sur la
--    ligne `session_members` que `sync_table_assignment` vient de
--    créer/retrouver (chantier 119), et pose `active_moderator_member_id`
--    (COALESCE, comme les 5 autres chemins du chantier 106) : le
--    modérateur physique devient un modérateur « en exercice » au sens
--    du chantier 106 dès sa prise de table, pas seulement un participant.
-- §3 `release_table_moderation` — changement de philosophie assumé,
--    demandé explicitement par Jules : NE PLUS retirer
--    `session_members.is_moderator` (c'était le comportement du
--    chantier 72). À la place :
--      · démet seulement `active_moderator_member_id` (perd l'écran,
--        garde le drapeau — devient un « modérateur en surplus » au sens
--        du chantier 106, visible par le superadmin) ;
--      · libère `created_by` comme avant (branche physique) ;
--      · fait le RATTRAPAGE (c) : si le modérateur physique évincé n'a
--        toujours aucune ligne `session_members` pour cette séance
--        (lignes créées avant le chantier 119), lui en crée une à la
--        volée (`pseudo` repris de sa ligne `participants`, code de
--        rappel neuf et haché, `attending_in_person = true`,
--        `is_moderator = true`) + la ligne `table_assignments`
--        correspondante — c'est l'« Option A » de la spec d'origine,
--        maintenant un simple filet pour les lignes antérieures au 119,
--        plutôt que le mécanisme principal.
-- Le hack d'affichage du chantier 117 (`UNION ALL` dans
-- `list_table_assignments_admin`) N'EST PAS retiré : un modérateur
-- physique déjà en exercice, réclamé avant le merge du chantier 119 et
-- jamais encore libéré, reste orphelin de `session_members` jusqu'à sa
-- prochaine libération — la branche 117 reste nécessaire pour cette
-- fenêtre historique (point (c) ci-dessus n'agit qu'AU MOMENT du retrait).
--
-- VÉRITÉ EN BASE — comparée par pg_get_functiondef avant d'écrire ce
-- fichier (règle SQL du CLAUDE.md) : les trois fonctions ci-dessous sont
-- recopiées depuis leur définition COURANTE EN BASE (post chantier 119,
-- confirmé par une requête sur pg_proc/pg_get_functiondef), pas depuis les
-- fichiers de migration antérieurs.
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- §1. table_has_moderator — branche (b) exige désormais l'exercice réel
--     (active_moderator_member_id), comme is_table_moderator depuis le
--     chantier 106. Signature et type de retour inchangés.
-- ─────────────────────────────────────────────────────────────

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

COMMENT ON FUNCTION public.table_has_moderator(uuid) IS
  'Chantier 68, corrigée au chantier 118 — branche (b) exige maintenant '
  'sm.id = t.active_moderator_member_id (comme is_table_moderator depuis '
  'le chantier 106) : un modérateur qui garde son drapeau is_moderator '
  'après avoir perdu l''animation (chantier 118, « modérateur en surplus ») '
  'ne bloque plus la reprise de sa table par claim_table_as_moderator.';

GRANT EXECUTE ON FUNCTION public.table_has_moderator(uuid) TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- §2. claim_table_as_moderator — flague is_moderator=true + pose
--     active_moderator_member_id sur la ligne que sync_table_assignment
--     (chantier 119) vient de créer/retrouver. Corps recopié depuis la
--     définition courante en base (post chantier 119), seul l'ajout en
--     fin de fonction (avant le SELECT du résultat) est nouveau.
--     Signature et type de retour inchangés.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.claim_table_as_moderator(
  p_join_code     text,
  p_creation_code text,
  p_pseudo        text,
  p_session_id    uuid DEFAULT NULL::uuid
)
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
  v_sync           jsonb;
  v_result         jsonb;
BEGIN
  SELECT value INTO v_hash FROM app_config WHERE key = 'creation_code_hash';
  IF v_hash IS NULL OR crypt(p_creation_code, v_hash) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'Code Ecclesia incorrect';
  END IF;

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

  IF table_has_moderator(v_table.id)
     AND NOT table_moderator_is(v_table.id, p_pseudo) THEN
    RAISE EXCEPTION 'Cette table a déjà un modérateur — choisis-en une autre ou contacte le superadmin';
  END IF;

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

  IF v_table.session_id IS NOT NULL THEN
    v_sync := sync_table_assignment(v_table.session_id, v_table.id, btrim(p_pseudo));

    -- Chantier 118 — le modérateur physique devient un modérateur "en
    -- exercice" au sens du chantier 106 : sync_table_assignment vient de
    -- garantir une ligne session_members (créée à l'instant si elle
    -- n'existait pas), on la flague et on en fait le titulaire
    -- d'active_moderator_member_id si personne d'autre ne l'est déjà
    -- (COALESCE — ne déloge jamais un modérateur Bloc C déjà en exercice,
    -- ce qui ne devrait de toute façon jamais arriver ici : le point 5
    -- ci-dessus a déjà refusé toute table ayant un modérateur EN EXERCICE
    -- autre que l'appelant).
    SELECT id INTO v_member_id
    FROM session_members
    WHERE session_id = v_table.session_id
      AND user_id    = auth.uid();

    IF v_member_id IS NOT NULL THEN
      UPDATE session_members
      SET is_moderator = true
      WHERE id = v_member_id
        AND is_moderator = false;

      UPDATE tables
      SET active_moderator_member_id = COALESCE(active_moderator_member_id, v_member_id)
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
    'participant_id',          v_participant_id
  ) INTO v_result
  FROM tables s WHERE s.id = v_table.id;

  RETURN v_result || COALESCE(v_sync, '{}'::jsonb);
END;
$function$;

COMMENT ON FUNCTION public.claim_table_as_moderator(text, text, text, uuid) IS
  'Chantier 68, assouplie au 72, connectée à sync_table_assignment au 119, '
  'flague is_moderator=true au 118 — un modérateur physique devient dès sa '
  'prise de table un modérateur "en exercice" Bloc C complet (session_'
  'members flagué + active_moderator_member_id), pas seulement un '
  'participant avec created_by. Voir 20260921_chantier118_physical_'
  'moderator_becomes_member.sql pour le détail et le rattrapage des '
  'lignes créées avant le chantier 119.';

GRANT EXECUTE ON FUNCTION public.claim_table_as_moderator(text, text, text, uuid) TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- §3. release_table_moderation — ne retire plus is_moderator ; démet
--     seulement active_moderator_member_id (garde le drapeau, perd
--     l'écran — "modérateur en surplus", chantier 106) ; rattrape les
--     modérateurs physiques orphelins de session_members (lignes créées
--     avant le chantier 119).
--
-- Changement de type de retour assumé (les deux champs renommés
-- reflètent le nouveau comportement — released_members comptait des
-- démotions is_moderator=false, qui n'existent plus) : DROP nécessaire
-- avant de recréer avec la même signature d'ENTRÉE mais un jsonb de
-- sortie différent (jsonb reste jsonb, donc CREATE OR REPLACE suffirait
-- en réalité — DROP posé par prudence, cf. règle CLAUDE.md, si une
-- session parallèle avait créé une variante).
-- ─────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.release_table_moderation(text, uuid);

CREATE FUNCTION public.release_table_moderation(
  p_password text,
  p_table_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_table              tables%ROWTYPE;
  v_owner              uuid    := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  v_old_creator        uuid;
  v_physical           boolean := false;
  v_active_released    boolean := false;
  v_physical_pseudo    text;
  v_physical_member_id uuid;
  v_physical_ensured   boolean := false;
  v_new_code           text;
BEGIN
  PERFORM check_superadmin_password(p_password);

  SELECT * INTO v_table FROM tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table introuvable';
  END IF;

  v_old_creator := v_table.created_by;

  -- Chantier 118 — démet SEULEMENT l'exercice (perd l'écran modérateur),
  -- ne retire plus le drapeau is_moderator (demande explicite de Jules :
  -- « qu'ils soient... flagué modérateur »). C'est déjà suffisant pour
  -- que table_has_moderator (corrigée au §1) et is_table_moderator
  -- (chantier 106) répondent false pour tout le monde sur cette table.
  IF v_table.active_moderator_member_id IS NOT NULL THEN
    UPDATE tables SET active_moderator_member_id = NULL WHERE id = v_table.id;
    v_active_released := true;
  END IF;

  -- Branche physique (created_by) — inchangée depuis le chantier 72.
  IF v_table.created_by IS DISTINCT FROM v_owner THEN
    UPDATE tables SET created_by = v_owner WHERE id = v_table.id;
    v_physical := true;
  END IF;

  -- Chantier 118 (rattrapage) — le modérateur physique évincé a-t-il une
  -- ligne session_members pour cette séance ? Depuis le chantier 119 +
  -- le §2 ci-dessus, c'est déjà le cas pour tout nouveau claim ; ce bloc
  -- ne couvre plus que les lignes créées AVANT ce merge (aucune ligne du
  -- tout, cas exact du chantier 117) ou dont le flag n'aurait pas encore
  -- été posé pour une autre raison.
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
          -- Pseudo déjà pris par un autre membre de la séance (cas rare :
          -- collision de nom) — le retrait de la table ne doit pas
          -- échouer pour autant, il reste juste orphelin comme avant ce
          -- chantier. Signalé par physical_member_ensured = false.
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

COMMENT ON FUNCTION public.release_table_moderation(text, uuid) IS
  'Chantier 72, revue au chantier 118 — le superadmin libère la modération '
  'd''une TABLE. Ne retire plus session_members.is_moderator (demande de '
  'Jules : un modérateur retiré reste flagué, "modérateur en surplus" au '
  'sens du chantier 106) ; démet seulement active_moderator_member_id et '
  'created_by. Rattrape les modérateurs physiques orphelins de '
  'session_members créés avant le chantier 119 (leur pose une ligne '
  'flaguée + un code de rappel neuf).';

GRANT EXECUTE ON FUNCTION public.release_table_moderation(text, uuid) TO anon, authenticated;

-- =============================================================
-- REQUÊTES DE VÉRIFICATION (après application)
-- =============================================================
--
-- 0. Signatures, search_path :
--    SELECT p.proname, pg_get_function_identity_arguments(p.oid), p.proconfig
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('table_has_moderator','claim_table_as_moderator','release_table_moderation');
--
-- 1. Nouveau modérateur physique (post chantier 119) : claim_table_as_moderator
--    lui pose is_moderator=true et active_moderator_member_id sur sa table.
--    SELECT claim_table_as_moderator('<JOIN_CODE>', '<code ecclesia>', 'QA Mod118', '<session_id>');
--    SELECT sm.is_moderator, t.active_moderator_member_id = sm.id
--    FROM session_members sm JOIN tables t ON t.id = '<TABLE_ID>'
--    WHERE sm.session_id = '<session_id>' AND sm.pseudo = 'QA Mod118';
--    -- is_moderator = true, active_moderator_member_id = sm.id -> true
--
-- 2. Retrait (release_table_moderation) : le modérateur reste flagué,
--    perd juste l'exercice, et la table redevient reprenable :
--    SELECT release_table_moderation('<mdp>', '<TABLE_ID>');
--    SELECT is_moderator FROM session_members WHERE id = '<MEMBER_ID>';  -- true (inchangé)
--    SELECT active_moderator_member_id FROM tables WHERE id = '<TABLE_ID>'; -- NULL
--    SELECT table_has_moderator('<TABLE_ID>');                              -- false
--    SELECT claim_table_as_moderator('<JOIN_CODE>', '<code ecclesia>', 'Quelqu un d autre', NULL); -- succès
--
-- 3. Rattrapage orphelin pré-119 (aucune ligne session_members pour le
--    créateur physique avant le retrait) :
--    SELECT release_table_moderation('<mdp>', '<TABLE_ID orphelin>');
--    -- -> {"physical_member_ensured": true, "new_reclaim_code": "XXXX", ...}
--    SELECT is_moderator, reclaim_code_hash IS NOT NULL FROM session_members
--    WHERE session_id = '<session_id>' AND user_id = '<ancien created_by>';
--    -- true, true
--
-- 4. Non-régression — table modérée Bloc C classique (assign_moderator_to_table),
--    aucun created_by physique à libérer : released_physical = false,
--    physical_member_ensured = false, released_active dépend de l'état antérieur.
-- =============================================================
-- SQL D'ANNULATION (rollback)
-- =============================================================
-- table_has_moderator, claim_table_as_moderator : recopier les corps
--   "AS $function$ ... $function$" cités en tête de ce fichier (section
--   "VÉRITÉ EN BASE"), qui sont l'état exact avant ce chantier.
-- release_table_moderation :
--   BEGIN;
--   -- recopier depuis 20260906_chantier72_1_reprise_moderation.sql (§2)
--   COMMIT;
-- =============================================================
