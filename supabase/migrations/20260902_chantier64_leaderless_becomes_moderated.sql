-- =============================================================
-- Chantier 64 — Une table sans modérateur devient une table
--               modérée quand un de ses participants le devient
--
-- DEMANDE DE JULES
-- -----------------
-- « si une table créée sans modérateur, voit un de ses participants qui
-- renonce à participer au début, devenir modérateur, alors il le devient,
-- et c'est indiqué sur les indicateurs du superadmin et ses pages de
-- contrôle. Également, si quelqu'un est assis à une table sans modérateur,
-- et que le superadmin lui donne le flag modérateur, alors au prochain
-- reload, les participants doivent passer dans une table avec modérateur,
-- et le participant se transformer en modérateur. »
--
-- ÉTAT CONSTATÉ AVANT CE CHANTIER
-- --------------------------------
-- Le cas « auto-désignation en cours de débat » (bouton "🎙️ Devenir
-- modérateur" → `designate_moderator`, chantier 3/D2) posait déjà
-- `tables.leaderless = false` — rien à faire de ce côté.
--
-- Le cas « désignation Bloc C » (superadmin ou auto-déclaration via le Code
-- Ecclesia) ne le faisait PAS : `claim_moderator_status`, `set_member_moderator`
-- et `assign_moderator_to_table` posent `session_members.is_moderator = true`
-- et une ligne `table_assignments`, mais ne touchent jamais `tables.leaderless`.
-- Conséquence, avant ce chantier :
--   · le badge superadmin « Sans modérateur » restait affiché sur une table
--     qui a pourtant un modérateur légitime et fonctionnel (chantier 60 :
--     `is_table_moderator` donne déjà l'autorité d'animation à ce membre,
--     indépendamment de `leaderless`) ;
--   · pire, `table.leaderless` restant `true` en base, les AUTRES
--     participants de cette table continuaient d'être routés par le
--     `useEffect` d'auto-claim de `ParticipantView` (« leaderless + personne
--     ne parle + je suis premier → `claim_floor()` ») — un appel qui aurait
--     échoué silencieusement (`claim_floor` refuse `NOT leaderless`) mais
--     qui n'aurait jamais dû être tenté : la table a maintenant un vrai
--     modérateur, l'auto-gestion par file n'a plus lieu d'être.
-- Ce n'est donc pas seulement un problème d'affichage superadmin : c'est un
-- flag `leaderless` resté incohérent avec la réalité de l'animation.
--
-- CORRECTIF — additif, ciblé sur les 3 points d'écriture Bloc C
-- ----------------------------------------------------------------
-- Dans `claim_moderator_status` et `set_member_moderator`, quand
-- `is_moderator` passe à `true` : si le membre a déjà un siège
-- (`table_assignments`) sur une table `leaderless`, on convertit CETTE
-- table en place (`UPDATE tables SET leaderless = false`) — le membre garde
-- son siège, pas de déplacement. Cette vérification est faite AVANT la
-- recherche existante (chantiers 33/37) d'une autre table déjà animée sans
-- modérateur : elle a priorité, parce que Jules décrit explicitement le cas
-- où le membre est DÉJÀ assis à cette table précise.
--
-- Dans `assign_moderator_to_table` (assignation superadmin à un
-- `table_number` précis, glisser-déposer ou saisie de nom) : si la table
-- physique résolue pour ce `table_number` est `leaderless`, elle est
-- convertie dans la même transaction.
--
-- `designate_moderator` (chantier 3/D2) n'est pas touchée : elle gère déjà
-- correctement son propre cas, indépendant de toute séance/Bloc C.
--
-- SIGNATURES INCHANGÉES
-- -----------------------
-- Les 3 fonctions modifiées gardent exactement leur signature et leur type
-- de retour d'origine (`CREATE OR REPLACE` suffit, pas de `DROP FUNCTION`
-- nécessaire) :
--   · set_member_moderator(text, uuid, uuid, boolean)      RETURNS jsonb
--   · claim_moderator_status(uuid, text, text)             RETURNS jsonb
--   · assign_moderator_to_table(text, uuid, int, uuid)     RETURNS void
-- Vérifié par lecture de `20260803_chantier37_set_member_moderator_seat.sql`
-- et `20260801_chantier33_moderator_table_assignment.sql` (dernières
-- définitions en date de ces 3 fonctions).
--
-- INDICATEURS SUPERADMIN — AUCUN CHANGEMENT FRONTEND NÉCESSAIRE
-- -----------------------------------------------------------------
-- L'onglet « Groupes » (`SuperadminScreen.loadGroups`) recalcule déjà
-- `moderated` à partir de `tables.leaderless` fraîchement relu
-- (`listSessionTables`) à chaque appel, et est rafraîchi :
--   · immédiatement après `assignModeratorToTable`/`setMemberModerator`
--     (actions superadmin, `await loadGroups()` en séquence) ;
--   · par le polling de secours 10 s (chantier 50, `loadGroups(true)`),
--     qui couvre le cas où la conversion vient de `claim_moderator_status`
--     (auto-déclaration participant, invisible au superadmin autrement).
-- Donc dès que cette migration est appliquée, le badge « Sans modérateur »
-- disparaît de lui-même pour une table convertie, sans toucher au code React.
--
-- Le tableau « En direct » de la liste des séances (`list_session_tables`,
-- colonne `moderator_pseudo`) reste, lui, imprécis pour toute table Bloc C
-- (allocation v2) : `moderator_pseudo` y est dérivé de
-- `participants.user_id = tables.created_by`, qui ne pointe jamais vers le
-- modérateur assis pour ces tables (voir chantier 60, PÉRIMÈTRE, note sur
-- `list_session_tables`) — `created_by` reste l'uid du superadmin. Ce n'est
-- pas une régression de ce chantier : le défaut existait déjà pour toute
-- table animée par l'allocation, converted-from-leaderless ou non. La vue
-- fiable pour « qui modère cette table » reste l'onglet Groupes.
--
-- POINT TRANCHÉ — retrait du modérateur : pas de bascule arrière automatique
-- -----------------------------------------------------------------------------
-- Question posée par la commande de ce chantier : que devient une table
-- convertie si son modérateur est ensuite retiré (`set_member_moderator`
-- avec `is_moderator=false`, bouton « retirer » de l'onglet Groupes) ?
--
-- Décision : NE PAS repasser `leaderless` à `true` automatiquement. Le
-- retrait laisse la table `leaderless = false`, sans modérateur assis.
-- Deux raisons :
--   1. Cet état (table animée, zéro modérateur) est DÉJÀ un état normal et
--      supporté par l'app — `create_tables_batch` crée des tables vides
--      avec `leaderless` choisi à la création, et les commentaires de
--      `claim_moderator_status`/`set_member_moderator` eux-mêmes décrivent
--      « une table animée déjà formée mais encore sans modérateur assis »
--      comme un cas attendu, pas une anomalie.
--   2. Aucun moyen fiable de distinguer, au moment du retrait, une table
--      convertie par ce chantier d'une table `leaderless=false` dès sa
--      création par `apply_allocation` (aucune colonne ne mémorise
--      l'origine) — un retour automatique à l'auto-gestion changerait donc
--      le comportement de tables qui n'ont jamais été « leaderless »,
--      potentiellement en pleine séance, sans que Jules ne l'ait demandé.
-- Le seul chemin qui repose `leaderless` est un recalcul complet de
-- l'allocation (`apply_allocation`, `leaderless = NOT v_moderated`) — hors
-- périmètre de ce chantier (`src/lib/allocation.ts` non modifié).
--
-- Risque documenté (voir aussi A_VERIFIER.md) : si le retrait a lieu en
-- pleine phase `debating`, la table reste bloquée — plus personne n'a
-- l'autorité d'animation (`is_table_moderator` faux pour tout le monde) ni
-- l'auto-gestion (`leaderless` toujours faux) — jusqu'à ce que le
-- superadmin y réassigne un modérateur. Comportement à surveiller si Jules
-- rencontre ce cas en usage réel ; pas traité en silence.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 0. Garde-fou Postgres — signatures inchangées (pas de DROP requis, mais
--    on vérifie quand même : cf. piège documenté par le chantier 60).
-- ─────────────────────────────────────────────────────────────

DO $guard$
DECLARE
  v_want record;
  v_have record;
BEGIN
  FOR v_want IN
    SELECT * FROM (VALUES
      ('set_member_moderator',      'p_password text, p_session_id uuid, p_member_id uuid, p_is_moderator boolean', 'jsonb'),
      ('claim_moderator_status',    'p_session_id uuid, p_creation_code text, p_pseudo text',                       'jsonb'),
      ('assign_moderator_to_table', 'p_password text, p_session_id uuid, p_table_number integer, p_member_id uuid', 'void')
    ) AS t(fname, args, res)
  LOOP
    FOR v_have IN
      SELECT pg_get_function_identity_arguments(p.oid) AS args,
             pg_get_function_result(p.oid)             AS res
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = v_want.fname
    LOOP
      IF v_have.args IS DISTINCT FROM v_want.args
         OR v_have.res IS DISTINCT FROM v_want.res THEN
        RAISE NOTICE 'chantier 64 — DROP public.%(%) RETURNS %  [attendu : (%) RETURNS %]',
          v_want.fname, v_have.args, v_have.res, v_want.args, v_want.res;
        EXECUTE format('DROP FUNCTION public.%I(%s)', v_want.fname, v_have.args);
      END IF;
    END LOOP;
  END LOOP;
END
$guard$;


-- ─────────────────────────────────────────────────────────────
-- 1. set_member_moderator — convertit la table leaderless du membre
--    (priorité sur la recherche chantier 37)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_member_moderator(
  p_password     text,
  p_session_id   uuid,
  p_member_id    uuid,
  p_is_moderator boolean
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
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
    -- Chantier 64 — déjà assis à une table `leaderless` ? On la convertit
    -- en place plutôt que de chercher une autre table animée sans
    -- modérateur : le membre reste à son siège, sa table devient la sienne
    -- à animer.
    SELECT ta.table_id INTO v_current_table_id
    FROM table_assignments ta
    WHERE ta.session_id = p_session_id
      AND ta.member_id  = p_member_id;

    IF v_current_table_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM tables WHERE id = v_current_table_id AND leaderless = true)
    THEN
      UPDATE tables SET leaderless = false WHERE id = v_current_table_id;
    ELSE
      -- Chantier 37 — table animée déjà formée mais encore sans modérateur
      -- assis → on y place directement ce nouveau modérateur.
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
      END IF;
    END IF;
  END IF;

  RETURN to_jsonb(v_member);
END;
$$;

GRANT EXECUTE ON FUNCTION set_member_moderator(text, uuid, uuid, boolean) TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 2. claim_moderator_status — même conversion, valable pour les deux cas
--    d'entrée (membre déjà inscrit / nouveau profil — un nouveau profil
--    n'a par construction aucun siège, la branche est simplement un no-op)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION claim_moderator_status(
  p_session_id    uuid,
  p_creation_code text,
  p_pseudo        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_hash             text;
  v_member           session_members%ROWTYPE;
  v_phase            text;
  v_table_num        int;
  v_table_id         uuid;
  v_current_table_id uuid;
BEGIN
  SELECT value INTO v_hash FROM app_config WHERE key = 'creation_code_hash';
  IF v_hash IS NULL OR crypt(p_creation_code, v_hash) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'Code Ecclesia invalide';
  END IF;

  -- Cas (b) : déjà inscrit sur cet appareil pour cette séance → on marque, c'est tout.
  UPDATE session_members
  SET is_moderator = true
  WHERE session_id = p_session_id
    AND user_id = auth.uid()
  RETURNING * INTO v_member;

  IF NOT FOUND THEN
    -- Cas (a) : aucun profil — on en crée un, comme une inscription normale.
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

    BEGIN
      INSERT INTO session_members(session_id, user_id, pseudo, joined_phase, attending_in_person, is_moderator)
      VALUES (p_session_id, auth.uid(), btrim(p_pseudo), v_phase, true, true)
      RETURNING * INTO v_member;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Ce nom prénom est déjà pris pour cette séance';
    END;
  END IF;

  -- Chantier 64 — déjà assis à une table `leaderless` ? On la convertit en
  -- place (cas (a) : v_member vient d'être créé, jamais encore assis nulle
  -- part — cette recherche ne trouve simplement rien, no-op).
  SELECT ta.table_id INTO v_current_table_id
  FROM table_assignments ta
  WHERE ta.session_id = p_session_id
    AND ta.member_id  = v_member.id;

  IF v_current_table_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM tables WHERE id = v_current_table_id AND leaderless = true)
  THEN
    UPDATE tables SET leaderless = false WHERE id = v_current_table_id;
  ELSE
    -- Chantier 33 (point 3) : table animée déjà formée mais encore sans
    -- modérateur assis → on y place directement ce nouveau modérateur.
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
    END IF;
  END IF;

  RETURN to_jsonb(v_member);
END;
$$;

GRANT EXECUTE ON FUNCTION claim_moderator_status(uuid, text, text) TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3. assign_moderator_to_table — convertit la table physique ciblée
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

  -- table_id physique de la table cible (peut être NULL si pas encore rattachée) —
  -- même logique que move_member_to_group.
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

  -- Chantier 64 — la table ciblée devient modérée si elle était `leaderless`.
  IF v_table_id IS NOT NULL THEN
    UPDATE tables SET leaderless = false WHERE id = v_table_id AND leaderless = true;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION assign_moderator_to_table(text, uuid, int, uuid) TO anon, authenticated;


-- =============================================================
-- REQUÊTES DE VÉRIFICATION (à exécuter après application)
-- =============================================================
--
-- 1. Signatures inchangées, aucune surcharge résiduelle :
--    SELECT p.proname, count(*)
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('set_member_moderator','claim_moderator_status','assign_moderator_to_table')
--    GROUP BY p.proname HAVING count(*) > 1;
--    → attendu : 0 ligne
--
-- 2. Bascule effective (remplacer les UUID par une vraie séance de test avec
--    une table leaderless rattachée et un membre déjà assis dessus) :
--    SELECT id, leaderless FROM tables WHERE id = '<TABLE_ID>';        -- avant : true
--    SELECT set_member_moderator('<mdp superadmin>', '<SESSION_ID>', '<MEMBER_ID>', true);
--    SELECT id, leaderless FROM tables WHERE id = '<TABLE_ID>';        -- après : false
--    SELECT is_moderator FROM session_members WHERE id = '<MEMBER_ID>'; -- true
--
-- 3. Retrait : pas de bascule arrière (comportement documenté, pas un bug) :
--    SELECT set_member_moderator('<mdp superadmin>', '<SESSION_ID>', '<MEMBER_ID>', false);
--    SELECT id, leaderless FROM tables WHERE id = '<TABLE_ID>';        -- reste : false
--
-- =============================================================
-- SQL D'ANNULATION (rollback vers l'état pré-chantier 64)
-- =============================================================
--
-- Recopier tel quel le corps des 3 fonctions depuis leurs dernières
-- définitions pré-chantier 64 (aucune n'a changé de signature, un simple
-- CREATE OR REPLACE suffit — pas de DROP FUNCTION requis) :
--   · set_member_moderator      → 20260803_chantier37_set_member_moderator_seat.sql
--   · claim_moderator_status    → 20260801_chantier33_moderator_table_assignment.sql
--                                  (section 1, avant la section « 3. assign_moderator_to_table »)
--   · assign_moderator_to_table → 20260801_chantier33_moderator_table_assignment.sql
--                                  (section 3)
--
-- BEGIN;
-- -- ... recopier les 3 CREATE OR REPLACE FUNCTION depuis les fichiers ci-dessus ...
-- COMMIT;
-- =============================================================
