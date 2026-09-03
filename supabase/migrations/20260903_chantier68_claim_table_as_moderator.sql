-- =============================================================
-- Chantier 68 — Un modérateur qui arrive en retard choisit sa
--               table par code, sans voler celle d'un autre
--
-- DEMANDE DE JULES
-- -----------------
-- Un modérateur qui arrive après le début du débat doit pouvoir choisir sa
-- table en saisissant son code, à condition que cette table n'ait pas déjà
-- un modérateur.
--
-- FAILLE CONSTATÉE
-- -----------------
-- Le chemin le plus proche aujourd'hui — `JoinTableForm`, case « Je suis
-- modérateur de cette table » → RPC `reclaim_moderator` — ne vérifie RIEN
-- d'autre que le Code Ecclesia : il écrase `tables.created_by`
-- inconditionnellement. Le Code Ecclesia étant partagé entre TOUS les
-- modérateurs (ce n'est pas un secret par table), n'importe qui le
-- connaissant peut donc reprendre la main sur une table qui a déjà un
-- modérateur actif et l'en déposséder silencieusement, en pleine séance.
--
-- CORRECTIF — nouvelle RPC dédiée, `reclaim_moderator` non touchée
-- ------------------------------------------------------------------
-- `claim_table_as_moderator` vérifie, DANS CET ORDRE :
--   1. le Code Ecclesia (`crypt()` contre `app_config.creation_code_hash`,
--      même mécanisme que `claim_moderator_status`/`reclaim_moderator`) ;
--   2. que la table existe pour ce code, et — si l'appelant précise une
--      séance (`p_session_id`) — qu'elle appartient bien à CETTE séance ;
--   3. qu'AUCUN modérateur n'a déjà autorité sur cette table (nouveau
--      helper `table_has_moderator`, voir plus bas).
-- Chaque échec lève une exception au message distinct — un modérateur
-- pressé, devant une salle, doit comprendre en une seconde pourquoi ça ne
-- marche pas.
--
-- `reclaim_moderator` (20260528000001) N'EST PAS MODIFIÉE. Elle reste le
-- seul chemin de VRAIE reprise de main : quelqu'un qui était déjà le
-- modérateur de CETTE table précise (perte de session, changement
-- d'appareil) et revient avec son code de table + le Code Ecclesia. Elle
-- fait confiance à ce couple sans vérifier l'absence d'un AUTRE
-- modérateur — c'est un comportement PRÉEXISTANT à ce chantier, pas
-- introduit ici, et Jules ne demande pas de le durcir : le risque résiduel
-- (quelqu'un connaissant le Code Ecclesia ET le code d'une table qui n'est
-- pas la sienne pourrait encore, via ce chemin-là, s'approprier une table
-- déjà modérée) reste ouvert pour ce chemin précis. Voir « FRONTIÈRE »
-- ci-dessous pour la liste exacte des appelants qui, eux, migrent vers la
-- nouvelle fonction et ferment donc la faille de leur côté.
--
-- « DÉJÀ UN MODÉRATEUR » — nouveau helper `table_has_moderator`
-- ------------------------------------------------------------------
-- S'appuie sur le même modèle d'autorité que `is_table_moderator` (chantier
-- 60), mais répond à une question différente : « est-ce que QUELQU'UN a
-- déjà autorité sur cette table ? » plutôt que « est-ce que L'APPELANT a
-- autorité ? ». `is_table_moderator` est inutilisable tel quel ici : sur un
-- appareil qui n'a jamais touché cette table, `auth.uid()` de l'appelant ne
-- correspond par construction à rien d'existant — le test « est-ce moi »
-- répondrait toujours faux, y compris sur une table qui a pourtant déjà un
-- vrai modérateur assis (un autre que l'appelant).
--
-- `table_has_moderator(p_table_id)` est vrai si :
--   (a) la table n'est PAS `leaderless` ET son créateur (`tables.created_by`)
--       est physiquement assis dessus (`participants.user_id = created_by`)
--       — le cas d'une table créée directement avec un vrai modérateur
--       (`create_table(leaderless=false)`, `reclaim_moderator`,
--       `designate_moderator`) ;
--   (b) OU un membre de la séance marqué `session_members.is_moderator` est
--       affecté à CETTE table précise via `table_assignments` — le cas
--       Bloc C (`claim_moderator_status`, `set_member_moderator`,
--       `assign_moderator_to_table`), cf. `is_table_moderator` (chantier 60)
--       dont la branche (b) est reprise à l'identique.
-- Le test `NOT leaderless` en (a) est INDISPENSABLE : sans lui, une table
-- fraîchement créée `leaderless = true` serait vue à tort comme « déjà
-- modérée », puisque `create_table` assied TOUJOURS son créateur comme
-- participant (`INSERT INTO participants ... VALUES (v_table_id, auth.uid(),
-- p_pseudo)`, y compris pour une « Table sans admin ») — ce créateur n'est
-- pourtant pas un modérateur.
--
-- TABLES LEADERLESS — CIBLABLES PAR CE CHEMIN (choix assumé)
-- ------------------------------------------------------------------
-- Une table `leaderless = true` n'a par construction aucun modérateur :
-- `table_has_moderator` y répond donc `false`, et un modérateur en retard
-- PEUT la cibler par ce chemin — décision cohérente avec le chantier 64
-- (« une table sans modérateur devient une table modérée quand un de ses
-- participants le devient » — même principe, chemin d'entrée différent).
-- Sur succès, `claim_table_as_moderator` pose donc `leaderless = false`
-- (idempotent si déjà `false`), comme `designate_moderator` /
-- `claim_moderator_status` / `set_member_moderator` /
-- `assign_moderator_to_table`. `leaderless_by_design` N'EST PAS touchée —
-- c'est une bascule organique, jamais posée par une conversion (cf.
-- CLAUDE.md, chantier 64).
--
-- FRONTIÈRE — appelants frontend migrés vers la nouvelle fonction
-- ------------------------------------------------------------------
--   · `JoinTableForm` (composant, case "Je suis modérateur de cette
--     table") : c'est LE chemin visé par ce chantier. Utilisé par
--       - `SessionRouterScreen`, état `debating_no_member` — "Arrivé en
--         retard, séance déjà en débat, jamais inscrit au vote" : la
--         séance courante est connue, son `id` est transmis en
--         `p_session_id` → protection complète, y compris le refus sur un
--         code d'une autre séance ;
--       - `JoinTableScreen` (lien `#table/<join_code>` partagé par un ami
--         déjà en débat, D8) : aucune séance n'est connue à cet endroit
--         (on ne dispose que du code de table) → `p_session_id = NULL`,
--         la vérification d'appartenance à une séance précise est sautée,
--         mais la protection « pas de vol d'une table déjà modérée »
--         s'applique quand même.
--   · `EntryScreen` (onglet "Rejoindre ou reprendre une table", même case
--     à cocher) : réimplémentait EXACTEMENT le même appel direct à
--     `reclaim_moderator` en parallèle de `JoinTableForm` (duplication de
--     code préexistante, pas une réutilisation du composant). Migrée par
--     cohérence — sinon la faille resterait grande ouverte sur cet écran
--     alors qu'elle est fermée sur `JoinTableForm`, pour un affichage et un
--     comportement identiques du point de vue de l'utilisateur. Écran
--     d'accueil générique, aucune séance connue non plus → `p_session_id
--     = NULL`.
--   · `TestScreen` (`src/components/TestScreen.tsx`) : appelle aussi
--     `reclaim_moderator` directement, mais ce composant n'est importé
--     nulle part dans `src/` (vérifié par recherche globale) — code mort,
--     hors périmètre, non touché.
--
-- PIÈGES DU PROJET — déjà rencontrés deux fois (cf. CLAUDE.md)
-- ------------------------------------------------------------------
--   · Fonctions entièrement NOUVELLES ici (aucune ne préexiste) : pas de
--     risque de surcharge ambiguë, `CREATE OR REPLACE FUNCTION` direct
--     suffit, pas de garde `DROP FUNCTION` nécessaire.
--   · `SET search_path = public, extensions` posé sur `claim_table_as_moderator`
--     ET `table_has_moderator` : la première appelle `crypt()` (vit dans
--     `extensions`), l'omission se manifeste par un « Code Ecclesia
--     incorrect » trompeur même avec le bon code.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. Helper — `table_has_moderator(p_table_id)`
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.table_has_moderator(p_table_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, extensions
AS $$
  SELECT
    -- (a) table conçue/convertie comme modérée, avec un vrai créateur assis
    (
      NOT COALESCE((SELECT t.leaderless FROM tables t WHERE t.id = p_table_id), true)
      AND EXISTS (
        SELECT 1 FROM tables t
        JOIN participants p ON p.table_id = t.id AND p.user_id = t.created_by
        WHERE t.id = p_table_id
      )
    )
    OR
    -- (b) modérateur Bloc C désigné, assis à cette table précise
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
    );
$$;

COMMENT ON FUNCTION public.table_has_moderator(uuid) IS
  'Chantier 68 — vrai si UNE PERSONNE (peu importe laquelle) a déjà autorité '
  'd''animation sur cette table : créateur physique assis sur une table non '
  'leaderless, OU modérateur Bloc C désigné assis à cette table précise. '
  'Généralisation de is_table_moderator (chantier 60), qui répond pour '
  'L''APPELANT uniquement — inutilisable ici, un nouvel arrivant n''a par '
  'construction aucun historique avec auth.uid() sur cette table.';

GRANT EXECUTE ON FUNCTION public.table_has_moderator(uuid) TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 2. `claim_table_as_moderator` — prise en charge sécurisée par code
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
AS $$
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
  --    l'état à jour (créateur + participant déjà insérés) plutôt que de
  --    passer la vérification "pas de modérateur" en même temps que nous.
  SELECT * INTO v_table
  FROM tables
  WHERE join_code = upper(p_join_code)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table introuvable (code %)', upper(p_join_code);
  END IF;

  -- 3. Séance — seulement si l'appelant en précise une (SessionRouterScreen
  --    la connaît ; JoinTableScreen/EntryScreen n'ont aucune séance en
  --    contexte et passent NULL, cf. en-tête de fichier).
  IF p_session_id IS NOT NULL AND v_table.session_id IS DISTINCT FROM p_session_id THEN
    RAISE EXCEPTION 'Ce code de table n''appartient pas à cette séance';
  END IF;

  -- 4. Déjà un modérateur ?
  IF table_has_moderator(v_table.id) THEN
    RAISE EXCEPTION 'Cette table a déjà un modérateur — choisis-en une autre ou contacte le superadmin';
  END IF;

  -- 5. Pseudo
  IF p_pseudo IS NULL OR btrim(p_pseudo) = '' THEN
    RAISE EXCEPTION 'Le pseudo ne peut pas être vide';
  END IF;

  -- 6. Prise en charge : devient créateur physique + siège comme participant.
  --    Chantier 64 : une table leaderless ciblée par ce chemin devient
  --    modérée (no-op si elle l'était déjà).
  UPDATE tables
  SET created_by = auth.uid(),
      leaderless = false
  WHERE id = v_table.id;

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
$$;

COMMENT ON FUNCTION public.claim_table_as_moderator(text, text, text, uuid) IS
  'Chantier 68 — un modérateur en retard prend en charge une table encore '
  'sans modérateur, en saisissant son code. Refuse : Code Ecclesia invalide, '
  'code d''une autre séance (si p_session_id fourni), ou table ayant déjà un '
  'modérateur (table_has_moderator). Distinct de reclaim_moderator, qui reste '
  'le chemin de VRAIE reprise de main par le modérateur déjà en place sur '
  'cette table précise et n''effectue pas cette vérification.';

GRANT EXECUTE ON FUNCTION public.claim_table_as_moderator(text, text, text, uuid) TO anon, authenticated;


-- =============================================================
-- REQUÊTES DE VÉRIFICATION (à exécuter après application)
-- =============================================================
--
-- 1. Les deux fonctions existent, bon search_path :
--    SELECT p.proname, p.prosecdef, p.proconfig
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('table_has_moderator', 'claim_table_as_moderator');
--    → search_path = {"search_path=public, extensions"} pour les deux.
--
-- 2. Table sans modérateur (Bloc C, formée mais personne assis) → succès :
--    SELECT table_has_moderator('<TABLE_ID>');  -- attendu : false
--    SELECT claim_table_as_moderator('<JOIN_CODE>', '<code ecclesia>', 'Test Retard', '<SESSION_ID>');
--    SELECT leaderless, created_by FROM tables WHERE id = '<TABLE_ID>';
--    -- attendu : leaderless=false, created_by = l'uid de l'appelant
--
-- 3. Table déjà modérée (créateur physique assis) → refus explicite :
--    SELECT claim_table_as_moderator('<JOIN_CODE_DEJA_MODEREE>', '<code ecclesia>', 'Test Vol', '<SESSION_ID>');
--    → exception 'Cette table a déjà un modérateur — ...'
--
-- 4. Table modérée via Bloc C (session_members.is_moderator + table_assignments,
--    même si tables.created_by pointe encore vers le superadmin) → même refus :
--    SELECT table_has_moderator('<TABLE_ID_BLOC_C_ASSIGNEE>');  -- attendu : true
--
-- 5. Code d'une autre séance → refus dédié :
--    SELECT claim_table_as_moderator('<JOIN_CODE_SEANCE_A>', '<code ecclesia>', 'Test', '<SESSION_ID_B>');
--    → exception 'Ce code de table n''appartient pas à cette séance'
--
-- 6. Table leaderless (jamais réclamée) → succès, et devient modérée :
--    SELECT leaderless FROM tables WHERE id = '<TABLE_ID_LEADERLESS>';        -- avant : true
--    SELECT claim_table_as_moderator('<JOIN_CODE_LEADERLESS>', '<code ecclesia>', 'Test', NULL);
--    SELECT leaderless FROM tables WHERE id = '<TABLE_ID_LEADERLESS>';        -- après : false
--
-- 7. reclaim_moderator inchangée — vraie reprise de main toujours permise :
--    SELECT reclaim_moderator('<JOIN_CODE>', '<code ecclesia>', 'Même modérateur, nouvel appareil');
--    → succès, comme avant ce chantier.
--
-- =============================================================
-- SQL D'ANNULATION (rollback)
-- =============================================================
--
-- Aucune fonction préexistante modifiée : le rollback est une simple
-- suppression des deux fonctions créées ici. Penser à d'abord annuler les
-- changements frontend (JoinTableForm/EntryScreen) qui les appellent, sous
-- peine d'erreurs "function does not exist" côté client.
--
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.claim_table_as_moderator(text, text, text, uuid);
-- DROP FUNCTION IF EXISTS public.table_has_moderator(uuid);
-- COMMIT;
-- =============================================================
