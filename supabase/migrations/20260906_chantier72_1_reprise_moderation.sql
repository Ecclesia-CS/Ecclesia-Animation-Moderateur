-- =============================================================
-- Chantier 72 (1/4) — Retirer la modération d'une table doit
--                     réellement la rendre reprenable
--
-- RETOUR BRUT DE JULES
-- ---------------------
-- « Quand le superadmin retire quelqu'un de la modération d'une table, et
--   que quelqu'un d'autre tente de se connecter pour prendre la moderation
--   de la table en phase débat (un nouvel arrivant, cliquant sur je suis
--   modérateur, avec le mdp) on lui dit qu'il y a déja un modérateur à
--   cette table. […] Coche "Je suis modérateur de cette table", code
--   A10001, pseudo exactement T33 Mod1, Code Ecclesia → "Reprendre la
--   main". On me dit : il y a déja un modérateur... Alors que je rentre le
--   même nom que le modérateur, avec le bon mdp ! »
--
-- DIAGNOSTIC — DEUX DÉFAUTS INDÉPENDANTS, MÊME MESSAGE D'ERREUR
-- =============================================================
-- Le message « Cette table a déjà un modérateur » vient d'un seul endroit :
-- le point 4 de `claim_table_as_moderator` (chantier 68), qui interroge
-- `table_has_moderator(table_id)`. Ce helper a deux branches :
--   (a) `NOT tables.leaderless` ET `tables.created_by` est physiquement
--       assis à la table (ligne `participants` avec ce `user_id`) ;
--   (b) un membre `session_members.is_moderator = true` est affecté à
--       CETTE table précise via `table_assignments`.
-- Les deux branches sont en cause, chacune pour une raison différente.
--
-- ── DÉFAUT A — le retrait superadmin ne libère que la branche (b) ──
-- Le bouton « Retirer » de l'onglet Tables (`handleRemoveTableModerator`,
-- SuperadminScreen.tsx) appelle `set_member_moderator(..., false)`. Cette
-- fonction (dernière définition : 20260902_chantier64_leaderless_becomes_
-- moderated.sql, section 1) ne fait QUE `UPDATE session_members SET
-- is_moderator = false`. Elle ne touche jamais `tables.created_by` ni la
-- ligne `participants`.
--
-- Conséquence : si le modérateur avait pris la table par
-- `designate_moderator` (bouton « Devenir modérateur », chantier 3/D2) ou
-- par `claim_table_as_moderator` (chantier 68) — les deux posent
-- `created_by = auth.uid()` ET insèrent une ligne `participants` —, la
-- branche (a) reste vraie APRÈS le retrait. La table est encore « pourvue »
-- aux yeux du helper alors que plus personne ne l'anime, et
-- `claim_table_as_moderator` refuse tout le monde, définitivement.
--
-- Aggravant : ces deux chemins ne posent JAMAIS
-- `session_members.is_moderator`. La carte de groupe du superadmin
-- n'affiche le bouton « Retirer » que pour les membres
-- `g.members.filter(m => m.is_moderator)` — un modérateur « physique »
-- n'y apparaît donc même pas. Le superadmin n'a, aujourd'hui, AUCUN
-- levier sur ce cas : ni bouton, ni RPC.
--
-- ── DÉFAUT B — plus aucun chemin de VRAIE reprise de main ──
-- C'est le test exact de Jules : même pseudo (« T33 Mod1 »), bon Code
-- Ecclesia, refusé. `table_has_moderator` répond à la question
-- « QUELQU'UN a-t-il autorité ? » — jamais « est-ce que ce quelqu'un,
-- c'est l'appelant ? ». Le modérateur en place est donc refusé par sa
-- PROPRE présence dès qu'il revient avec un `auth.uid()` différent
-- (autre appareil, autre navigateur, session anonyme perdue — le User ID
-- anonyme est instable, cf. chantier B3).
--
-- Avant le chantier 68, ce cas passait : `JoinTableForm` et `EntryScreen`
-- appelaient `reclaim_moderator`, qui ne vérifie que le Code Ecclesia.
-- Le chantier 68 les a migrés vers `claim_table_as_moderator` pour fermer
-- le vol de table, mais sans laisser de chemin pour la reprise légitime.
-- `reclaim_moderator` existe toujours en base et n'est plus appelée par
-- aucun écran (déjà signalé comme point ouvert dans CLAUDE.md et
-- A_VERIFIER.md, chantier 68).
--
-- ── CAS QUE JULES N'A PAS PU TESTER — « utilisateur déjà existant, le
--    superadmin le rajoute » ──
-- Ce chemin fonctionne, et pour une raison structurelle : il ne passe pas
-- du tout par `claim_table_as_moderator`. Le superadmin utilise
-- `AddModeratorControl` → `assign_moderator_to_table`, qui pose
-- `is_moderator = true` et déplace `table_assignments`, sans jamais
-- interroger `table_has_moderator`. Le modérateur obtient ensuite son
-- autorité par la branche (b) d'`is_table_moderator` (chantier 60), que
-- `TableContext.isModerator` lit via `sessionMemberIsModerator`
-- (chantier 41). Aucune des deux branches en cause n'est sur ce trajet.
-- (Constat lu dans le code — vérification navigateur à faire, entrée
-- dédiée dans A_VERIFIER.md.)
--
-- CORRECTIFS
-- =============================================================
-- §1  `set_member_moderator(..., false)` libère AUSSI l'autorité physique
--     de la table où le membre est assis (branche (a)).
-- §2  Nouvelle RPC `release_table_moderation(password, table_id)` — levier
--     au niveau TABLE, seul moyen d'atteindre un modérateur physique qui
--     n'a aucun flag `is_moderator` (défaut A, cas aggravant).
-- §3  Nouveau helper `table_moderator_is(table_id, pseudo)` +
--     assouplissement de `claim_table_as_moderator` : on ne refuse plus que
--     si le modérateur en place n'est PAS l'appelant (défaut B).
--
-- ARBITRAGE ASSUMÉ ET DOCUMENTÉ (§3) — à relire avant application
-- -------------------------------------------------------------------
-- Reconnaître « c'est moi qui reviens » sur un appareil neuf est impossible
-- par `auth.uid()` (par construction inconnu). Le projet utilise déjà le
-- PSEUDO comme clé d'identité dans exactement ce cas : `join_table` fait
-- `ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id`
-- avec le commentaire « retour autre appareil » (CLAUDE.md). On reprend
-- cette convention.
--
-- Conséquence de sécurité, énoncée franchement : après cette migration,
-- connaître le Code Ecclesia + le code de la table + LE PSEUDO AFFICHÉ du
-- modérateur en place suffit pour lui prendre la table. C'est
--   · strictement PLUS strict que l'état d'avant le chantier 68
--     (`reclaim_moderator` : Code Ecclesia + code de table, sans pseudo) ;
--   · strictement MOINS strict que le chantier 68 (refus absolu), qui a
--     rendu la reprise de main légitime impossible — le bug signalé ici.
-- Le pseudo du modérateur est visible de tous les participants de la table
-- (ParticipantsSidebar) : ce n'est pas un secret, c'est un DISCRIMINANT.
-- Il transforme « n'importe qui muni du Code Ecclesia » en « quelqu'un qui
-- sait précisément qui anime cette table » — sans plus.
--
-- L'alternative plus propre serait un chemin d'UI dédié à la reprise de
-- main (« je suis DÉJÀ le modérateur de cette table ») branché sur
-- `reclaim_moderator`, distinct de la prise en charge d'une table libre.
-- Elle N'A PAS été retenue ici parce qu'elle exige de modifier
-- `src/screens/EntryScreen.tsx` (et `src/components/JoinTableForm.tsx`),
-- explicitement hors périmètre de ce chantier (session parallèle,
-- chantier 73). Le correctif §3 a l'avantage d'être 100 % SQL :
-- `JoinTableForm` et `EntryScreen` transmettent DÉJÀ le pseudo à
-- `claim_table_as_moderator`, aucun changement frontend n'est nécessaire.
-- Si Jules préfère l'alternative, §3 se retire seul (rollback en fin de
-- fichier) sans toucher §1/§2.
--
-- PIÈGES DU PROJET (CLAUDE.md) — traités
-- -------------------------------------------------------------------
--   · `set_member_moderator` : signature ET type de retour INCHANGÉS
--     (text, uuid, uuid, boolean) → jsonb. `CREATE OR REPLACE` suffit,
--     pas de surcharge possible. Corps recopié depuis la définition
--     courante (chantier 64, section 1) et étendu — pas réécrit de mémoire.
--   · `claim_table_as_moderator` : signature ET type de retour INCHANGÉS
--     (text, text, text, uuid) → jsonb. Corps recopié depuis
--     20260903_chantier68_claim_table_as_moderator.sql (dernière
--     définition connue) et étendu au seul point 4.
--   · `release_table_moderation` et `table_moderator_is` sont NEUVES —
--     `DROP FUNCTION IF EXISTS` de la signature exacte posé quand même,
--     au cas où une session parallèle en aurait créé une variante.
--   · `SET search_path = public, extensions` sur tout ce qui touche
--     `crypt()` — omettre `extensions` se manifeste par un « Code Ecclesia
--     incorrect » trompeur. Noter que `set_member_moderator` n'avait
--     AUCUN `SET search_path` jusqu'ici (elle appelle pourtant
--     `check_superadmin_password`, qui fait `crypt()`) : ajouté ici.
--
-- VÉRITÉ EN BASE — À CONTRÔLER AVANT D'APPLIQUER
-- -------------------------------------------------------------------
-- Cette session n'a pas eu d'accès MCP Supabase : les corps recopiés
-- ci-dessous viennent des fichiers de migration, pas de la base. Contrôler
-- que la base ne contient rien de plus récent AVANT d'appliquer :
--   SELECT p.proname, pg_get_functiondef(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('set_member_moderator','claim_table_as_moderator',
--                       'table_has_moderator');
-- Si un corps diffère de ce qui est repris ici, reporter la différence
-- dans ce fichier plutôt que de l'écraser (cf. l'incident chantier 67 qui
-- a failli effacer le chantier 64).
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- §1. set_member_moderator — le retrait libère aussi la branche (a)
--
-- Corps du chantier 64 (section 1) intégralement conservé pour
-- `p_is_moderator = true` (conversion en place d'une table leaderless,
-- puis repli chantier 37). SEULE la branche `false` est nouvelle.
--
-- Ce qui est libéré : `tables.created_by`, remis sur l'appelant (le
-- superadmin — c'est exactement l'état que laisse `apply_allocation` sur
-- une table qu'il crée, cf. CLAUDE.md « Ne jamais faire »). Le superadmin
-- n'étant jamais assis comme `participants`, la branche (a) de
-- `table_has_moderator` redevient fausse et la table est reprenable.
-- Repli sur l'UUID nul si `auth.uid()` est NULL (`created_by` est
-- NOT NULL depuis le schéma initial) — aucun participant ne peut porter
-- cet identifiant, la branche (a) reste donc fausse dans tous les cas.
--
-- La garde `AND created_by = v_member.user_id` est essentielle : on ne
-- libère la table QUE si c'est bien ce membre-là qui la détenait. Retirer
-- le flag d'un membre qui n'était pas le créateur physique ne doit pas
-- déposséder celui qui l'est.
--
-- Ce qui n'est PAS touché, volontairement :
--   · `tables.leaderless` — décision explicite de Jules au chantier 64 :
--     « retirer le modérateur EN PLACE ne change rien, il va revenir ».
--     C'est `created_by` qui bloquait la reprise, pas `leaderless` :
--     `claim_table_as_moderator` cible aussi bien une table modérée
--     libérée qu'une table leaderless.
--   · la ligne `participants` de l'ex-modérateur — il reste assis à la
--     table comme participant ordinaire. Son pseudo reste pris, ce qui
--     est sans effet : `claim_table_as_moderator` insère en
--     `ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id`.
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

  ELSE
    -- ── Chantier 72 (défaut A) — retrait : libérer AUSSI l'autorité
    --    physique, sinon la table reste « pourvue » pour
    --    `table_has_moderator` et plus personne ne peut la reprendre.
    SELECT ta.table_id INTO v_current_table_id
    FROM table_assignments ta
    WHERE ta.session_id = p_session_id
      AND ta.member_id  = p_member_id;

    IF v_current_table_id IS NOT NULL THEN
      UPDATE tables
      SET created_by = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
      WHERE id         = v_current_table_id
        AND created_by = v_member.user_id;
    END IF;
  END IF;

  RETURN to_jsonb(v_member);
END;
$fn$;

COMMENT ON FUNCTION set_member_moderator(text, uuid, uuid, boolean) IS
  'Chantier 19/25c, étendue 37/64/72 — marque ou démarque un membre comme '
  'modérateur de la séance. Chantier 72 : le RETRAIT libère aussi '
  'tables.created_by quand il pointait sur ce membre, sans quoi la branche '
  '(a) de table_has_moderator restait vraie et la table demeurait '
  'définitivement non reprenable. tables.leaderless n''est pas touché '
  '(décision chantier 64 : le modérateur retiré en place est censé revenir).';

GRANT EXECUTE ON FUNCTION set_member_moderator(text, uuid, uuid, boolean) TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- §2. release_table_moderation — levier au niveau TABLE
--
-- `set_member_moderator` part d'un MEMBRE. Elle est donc aveugle au cas
-- aggravant du défaut A : un modérateur qui a pris la table par
-- `designate_moderator` ou `claim_table_as_moderator` n'a AUCUNE ligne
-- `session_members.is_moderator` — il n'apparaît pas dans la carte de
-- groupe du superadmin, et aucun `member_id` ne permet de le viser.
--
-- Cette RPC part de la TABLE et coupe les deux branches d'un coup :
--   (a) `tables.created_by` → l'appelant (superadmin), comme §1 ;
--   (b) `is_moderator = false` pour tout membre affecté à cette table.
-- `leaderless` reste inchangé, pour la même raison qu'en §1.
--
-- Retourne un compte-rendu ({released_physical, released_members,
-- has_moderator}) pour que l'UI puisse dire ce qui a réellement été
-- libéré, et confirmer que la table est bien redevenue reprenable.
-- ─────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.release_table_moderation(text, uuid);

CREATE FUNCTION public.release_table_moderation(
  p_password text,
  p_table_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_table    tables%ROWTYPE;
  v_owner    uuid    := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  v_physical boolean := false;
  v_members  int     := 0;
BEGIN
  PERFORM check_superadmin_password(p_password);

  SELECT * INTO v_table FROM tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table introuvable';
  END IF;

  -- (b) modérateurs Bloc C assis à cette table
  IF v_table.session_id IS NOT NULL THEN
    WITH cleared AS (
      UPDATE session_members sm
      SET is_moderator = false
      WHERE sm.session_id = v_table.session_id
        AND sm.is_moderator = true
        AND EXISTS (
          SELECT 1 FROM table_assignments ta
          WHERE ta.member_id  = sm.id
            AND ta.session_id = v_table.session_id
            AND ta.table_id   = v_table.id
        )
      RETURNING 1
    )
    SELECT count(*) INTO v_members FROM cleared;
  END IF;

  -- (a) créateur physique
  IF v_table.created_by IS DISTINCT FROM v_owner THEN
    UPDATE tables SET created_by = v_owner WHERE id = v_table.id;
    v_physical := true;
  END IF;

  RETURN jsonb_build_object(
    'released_physical', v_physical,
    'released_members',  v_members,
    'has_moderator',     table_has_moderator(v_table.id)
  );
END;
$fn$;

COMMENT ON FUNCTION public.release_table_moderation(text, uuid) IS
  'Chantier 72 — le superadmin libère la modération d''une TABLE : coupe '
  'les deux branches de table_has_moderator (créateur physique + '
  'modérateurs Bloc C assis) pour que claim_table_as_moderator redevienne '
  'possible. Seul levier atteignant un modérateur « physique » '
  '(designate_moderator / claim_table_as_moderator), qui n''a aucun flag '
  'session_members.is_moderator et n''est donc visable par aucun member_id. '
  'tables.leaderless n''est pas touché (décision chantier 64).';

GRANT EXECUTE ON FUNCTION public.release_table_moderation(text, uuid) TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- §3. Reprise de main légitime — table_moderator_is + claim relâché
--
-- Voir « ARBITRAGE ASSUMÉ » en tête de fichier avant de lire ce qui suit.
--
-- `table_moderator_is(table_id, pseudo)` répond : « la personne qui a
-- autorité sur cette table, est-ce l'appelant ? », par les deux seules
-- preuves disponibles à un nouvel arrivant :
--   · même `auth.uid()` que `tables.created_by` (session anonyme intacte,
--     simple rechargement) — c'est exactement la branche (a) d'
--     `is_table_moderator` ;
--   · même PSEUDO que le modérateur en place, physique (a) ou Bloc C (b)
--     — convention d'identité déjà utilisée par `join_table`
--     (« ON CONFLICT → transfère user_id, retour autre appareil »).
-- Comparaison insensible à la casse et aux espaces de bord. Un pseudo vide
-- ne matche jamais (garde explicite, pour qu'un `p_pseudo` vide ou NULL ne
-- puisse pas coïncider avec une ligne dont le pseudo serait vide).
-- ─────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.table_moderator_is(uuid, text);

CREATE FUNCTION public.table_moderator_is(p_table_id uuid, p_pseudo text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, extensions
AS $fn$
  SELECT
    -- même session anonyme que le créateur physique
    EXISTS (
      SELECT 1 FROM tables t
      WHERE t.id = p_table_id
        AND t.created_by = auth.uid()
    )
    OR
    -- (a) créateur physique assis, même pseudo
    EXISTS (
      SELECT 1
      FROM tables t
      JOIN participants p ON p.table_id = t.id AND p.user_id = t.created_by
      WHERE t.id = p_table_id
        AND btrim(COALESCE(p_pseudo, '')) <> ''
        AND lower(btrim(p.pseudo)) = lower(btrim(p_pseudo))
    )
    OR
    -- (b) modérateur Bloc C assis à cette table, même pseudo
    EXISTS (
      SELECT 1
      FROM tables t
      JOIN session_members sm
        ON  sm.session_id   = t.session_id
        AND sm.is_moderator = true
      JOIN table_assignments ta
        ON  ta.member_id  = sm.id
        AND ta.session_id = t.session_id
      WHERE t.id = p_table_id
        AND t.session_id IS NOT NULL
        AND ta.table_id = t.id
        AND btrim(COALESCE(p_pseudo, '')) <> ''
        AND lower(btrim(sm.pseudo)) = lower(btrim(p_pseudo))
    );
$fn$;

COMMENT ON FUNCTION public.table_moderator_is(uuid, text) IS
  'Chantier 72 — « le modérateur en place, est-ce l''appelant ? ». Complète '
  'table_has_moderator (chantier 68), qui répond seulement « y a-t-il '
  'quelqu''un ? » et refusait donc au modérateur en place sa propre reprise '
  'de main depuis un autre appareil (auth.uid() anonyme instable). '
  'Preuves acceptées : même auth.uid() que tables.created_by, ou même '
  'pseudo que le modérateur en place — convention d''identité déjà employée '
  'par join_table pour le « retour autre appareil ».';

GRANT EXECUTE ON FUNCTION public.table_moderator_is(uuid, text) TO anon, authenticated;


-- `claim_table_as_moderator` — corps du chantier 68 recopié à l'identique,
-- SEUL le point 4 change (et le point 5 remonte avant lui, voir plus bas).
-- Signature et type de retour inchangés.
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
  v_result         jsonb;
BEGIN
  -- 1. Code Ecclesia
  SELECT value INTO v_hash FROM app_config WHERE key = 'creation_code_hash';
  IF v_hash IS NULL OR crypt(p_creation_code, v_hash) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'Code Ecclesia incorrect';
  END IF;

  -- 2. Table — FOR UPDATE : verrouille la ligne le temps de la transaction,
  --    pour qu'une tentative concurrente sur la même table attende et relise
  --    l'état à jour plutôt que de passer la vérification en même temps.
  SELECT * INTO v_table
  FROM tables
  WHERE join_code = upper(p_join_code)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table introuvable (code %)', upper(p_join_code);
  END IF;

  -- 3. Séance — seulement si l'appelant en précise une.
  IF p_session_id IS NOT NULL AND v_table.session_id IS DISTINCT FROM p_session_id THEN
    RAISE EXCEPTION 'Ce code de table n''appartient pas à cette séance';
  END IF;

  -- 4. Pseudo — remonté ici par le chantier 72 (c'était le point 5 du
  --    chantier 68) : le pseudo sert désormais à la vérification
  --    d'identité du point 5, il doit donc être validé avant. Aucun autre
  --    message d'erreur ne change d'ordre.
  IF p_pseudo IS NULL OR btrim(p_pseudo) = '' THEN
    RAISE EXCEPTION 'Le pseudo ne peut pas être vide';
  END IF;

  -- 5. Déjà un modérateur — et si oui, est-ce quelqu'un d'AUTRE ?
  --    Chantier 72 (défaut B) : le chantier 68 refusait ici le modérateur
  --    en place lui-même, revenu d'un autre appareil avec un auth.uid()
  --    neuf. On ne refuse plus que la prise de table par un TIERS.
  IF table_has_moderator(v_table.id)
     AND NOT table_moderator_is(v_table.id, p_pseudo) THEN
    RAISE EXCEPTION 'Cette table a déjà un modérateur — choisis-en une autre ou contacte le superadmin';
  END IF;

  -- 6. Prise en charge : devient créateur physique + siège comme participant.
  --    Chantier 64 : une table leaderless ciblée par ce chemin devient
  --    modérée (no-op si elle l'était déjà).
  UPDATE tables
  SET created_by = auth.uid(),
      leaderless = false
  WHERE id = v_table.id;

  -- Chantier 66 — un participant ne doit être présent que dans une table à
  -- la fois au sein d'une même séance. Même appel que join_table/switch_table,
  -- avec v_table.session_id (la séance de la table CIBLÉE) et non
  -- p_session_id, qui peut être NULL depuis JoinTableScreen/EntryScreen.
  PERFORM leave_other_session_tables(v_table.session_id, v_table.id, auth.uid());

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

COMMENT ON FUNCTION public.claim_table_as_moderator(text, text, text, uuid) IS
  'Chantier 68, assoupli au chantier 72 — un modérateur prend en charge une '
  'table par son code. Refuse : Code Ecclesia invalide, code d''une autre '
  'séance (si p_session_id fourni), pseudo vide, ou table déjà modérée PAR '
  'QUELQU''UN D''AUTRE (table_has_moderator ET NOT table_moderator_is). Le '
  'modérateur en place peut donc reprendre la main depuis un nouvel '
  'appareil en resaisissant son pseudo — cas que le chantier 68 refusait à '
  'tort. Voir l''arbitrage documenté en tête de '
  '20260906_chantier72_1_reprise_moderation.sql.';

GRANT EXECUTE ON FUNCTION public.claim_table_as_moderator(text, text, text, uuid) TO anon, authenticated;


-- =============================================================
-- REQUÊTES DE VÉRIFICATION (après application)
-- =============================================================
--
-- 0. Aucune surcharge résiduelle, search_path correct :
--    SELECT p.proname, pg_get_function_identity_arguments(p.oid), p.proconfig
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('set_member_moderator','release_table_moderation',
--                        'table_moderator_is','claim_table_as_moderator');
--    → 1 ligne par nom, proconfig = {"search_path=public, extensions"}.
--
-- 1. DÉFAUT A — retrait d'un modérateur physique par set_member_moderator :
--    -- table modérée dont created_by = le modérateur, lui-même assis
--    SELECT table_has_moderator('<TABLE_ID>');                    -- true
--    SELECT set_member_moderator('<mdp>', '<SESSION_ID>', '<MEMBER_ID>', false);
--    SELECT table_has_moderator('<TABLE_ID>');                    -- false (avant : true)
--    SELECT leaderless FROM tables WHERE id = '<TABLE_ID>';       -- inchangé
--
-- 2. DÉFAUT A aggravé — modérateur physique SANS flag is_moderator
--    (table prise par designate_moderator / claim_table_as_moderator) :
--    SELECT table_has_moderator('<TABLE_ID>');                    -- true
--    SELECT release_table_moderation('<mdp>', '<TABLE_ID>');
--    -- → {"released_physical": true, "released_members": N, "has_moderator": false}
--    SELECT claim_table_as_moderator('<JOIN_CODE>', '<code ecclesia>', 'Nouveau Mod', NULL);
--    -- → succès
--
-- 3. DÉFAUT B — reprise de main par le modérateur en place, autre appareil
--    (exécuter depuis une session anonyme DIFFÉRENTE de celle du modérateur) :
--    SELECT table_has_moderator('<TABLE_ID>');                    -- true
--    SELECT table_moderator_is('<TABLE_ID>', 'T33 Mod1');         -- true
--    SELECT claim_table_as_moderator('A10001', '<code ecclesia>', 'T33 Mod1', NULL);
--    -- → succès (avant chantier 72 : « Cette table a déjà un modérateur »)
--
-- 4. NON-RÉGRESSION — le vol par un TIERS reste refusé :
--    SELECT table_moderator_is('<TABLE_ID>', 'Quelqu un d autre');  -- false
--    SELECT claim_table_as_moderator('A10001', '<code ecclesia>', 'Quelqu un d autre', NULL);
--    -- → exception 'Cette table a déjà un modérateur — ...'
--
-- 5. NON-RÉGRESSION — set_member_moderator(true) inchangée (chantiers 37/64) :
--    -- membre assis sur une table leaderless
--    SELECT set_member_moderator('<mdp>', '<SESSION_ID>', '<MEMBER_ID>', true);
--    SELECT leaderless FROM tables WHERE id = '<TABLE_ID>';       -- false
--
-- 6. NON-RÉGRESSION — le retrait ne casse pas une table qu'un AUTRE anime :
--    -- table dont created_by = modérateur X, on retire le membre Y (assis
--    -- à la même table, is_moderator par erreur)
--    SELECT set_member_moderator('<mdp>', '<SESSION_ID>', '<MEMBER_Y>', false);
--    SELECT created_by FROM tables WHERE id = '<TABLE_ID>';       -- inchangé (= X)
--    -- (garde `AND created_by = v_member.user_id` du §1)
--
-- =============================================================
-- SQL D'ANNULATION (rollback)
-- =============================================================
--
-- §3 seul (si l'arbitrage pseudo est refusé — §1/§2 restent acquis) :
--   Recopier `claim_table_as_moderator` depuis
--   20260903_chantier68_claim_table_as_moderator.sql (CREATE OR REPLACE,
--   signature identique), puis :
--   DROP FUNCTION IF EXISTS public.table_moderator_is(uuid, text);
--   Attention : rétablit le défaut B — plus aucun chemin de reprise de main.
--
-- Tout le fichier :
--   BEGIN;
--   -- set_member_moderator → recopier depuis
--   --   20260902_chantier64_leaderless_becomes_moderated.sql (section 1)
--   -- claim_table_as_moderator → recopier depuis
--   --   20260903_chantier68_claim_table_as_moderator.sql (section 2)
--   DROP FUNCTION IF EXISTS public.release_table_moderation(text, uuid);
--   DROP FUNCTION IF EXISTS public.table_moderator_is(uuid, text);
--   COMMIT;
--   Penser à retirer d'abord le bouton « Libérer la modération » de
--   SuperadminScreen.tsx, sous peine d'erreur « function does not exist ».
-- =============================================================
