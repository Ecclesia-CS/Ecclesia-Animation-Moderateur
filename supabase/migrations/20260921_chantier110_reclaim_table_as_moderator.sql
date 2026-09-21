-- Chantier 110 — Bouton « Je suis le modérateur de cette table » dans les
-- Outils + filet d'identité
--
-- Constat (audit 87/101, piège D1) : si le jeton anonyme est renouvelé en
-- séance (veille longue, navigateur in-app Messenger, purge Safari ITP),
-- `App.tsx` restaurait la table depuis `localStorage` puis reposait
-- `isModerator = r.created_by === userId` — faux par construction sur toute
-- table issue de l'allocation, où `created_by` est l'uid du SUPERADMIN
-- (anti-pattern nommément interdit par CLAUDE.md, « Ne jamais faire »). La
-- reprise via `session_members` échoue aussi : elle est indexée sur le
-- `user_id`, justement renouvelé. Le modérateur revenait en `ParticipantView`
-- sans aucun moyen de reprendre la main depuis cet écran.
--
-- Décision de Jules (2026-09-20, arbitrage 5) : « oui, il faut un bouton
-- "je suis le modérateur de cette table" dans outils, pour reprendre la main
-- si on a perdu le compte, c'est une très bonne idée, option A. »
--
-- Pourquoi une RPC neuve plutôt que réutiliser `claim_table_as_moderator`
-- (chantier 68/72) : cette dernière est pensée pour quelqu'un HORS de la
-- table (saisie d'un join_code + pseudo depuis EntryScreen/JoinTableForm) et
-- refuse une table qui a déjà un modérateur, sauf si le pseudo saisi
-- correspond à celui du titulaire en place (`table_moderator_is`). Le bouton
-- de ce chantier est accessible UNIQUEMENT depuis l'intérieur d'une table où
-- l'appelant est déjà assis (`ParticipantToolsButton`) — le `join_code` et le
-- pseudo n'ont donc plus de rôle probant : la preuve d'identité, c'est déjà
-- d'être assis là, plus le Code Ecclesia. Tranché explicitement par Jules :
-- « c'est le cœur du chantier » — la reprise doit réussir MÊME quand la
-- table a déjà un modérateur (potentiellement l'appelant lui-même sous une
-- autre identité, ou un tiers à qui l'on passe la main), et ne doit PAS être
-- restreinte au seul cas détectable « identité perdue » (indétectable côté
-- serveur de toute façon).
--
-- Ce que fait `reclaim_table_as_moderator` :
--   1. Vérifie le Code Ecclesia.
--   2. Vérifie que l'appelant est déjà assis à CETTE table précise
--      (`is_table_participant`, chantier 50 — garde serveur, le front ne
--      rend le bouton que depuis l'intérieur d'une table, mais on ne fait
--      jamais confiance au seul front pour une action d'autorité).
--   3. Transfère l'autorité SANS COALESCE, à la différence de TOUS les
--      autres chemins du chantier 106 (apply_allocation, claim_moderator_
--      status, set_member_moderator, assign_moderator_to_table,
--      claim_table_as_moderator) : ceux-là posent l'autorité au premier
--      arrivé et ne délogent jamais personne. Celui-ci EST le mécanisme de
--      délogement volontaire — le premier chemin propre de passation de
--      main en cours de débat (objectif assumé, pas un effet de bord).
--      `tables.created_by` devient l'appelant (branche a d'is_table_
--      moderator) ; `active_moderator_member_id` devient le session_members
--      de l'appelant s'il en a un pour cette séance, NULL sinon — dans les
--      deux cas, l'ancien titulaire (créateur physique et/ou modérateur
--      Bloc C en exercice) perd les DEUX branches d'un coup, sans quoi
--      `is_table_moderator` resterait vraie pour lui via la branche qu'on
--      aurait oublié de couper (retour au problème du chantier 106 : deux
--      écrans modérateur sur la même table). Le drapeau `session_members.
--      is_moderator` de l'ancien titulaire n'est PAS touché (règle
--      chantier 106 : jamais retiré) — il redevient participant, garde son
--      drapeau, perd l'écran ; TableContext le détecte en direct via le
--      canal Realtime `table:<id>` déjà ouvert (UPDATE sur `tables`).
--
-- Signature neuve — pas de `DROP FUNCTION IF EXISTS` nécessaire (nom inédit,
-- vérifié : absent de la base et de tous les fichiers de migration).
-- `SET search_path = public, extensions` posé d'emblée (règle CLAUDE.md,
-- `crypt()` est appelé).

CREATE OR REPLACE FUNCTION public.reclaim_table_as_moderator(
  p_table_id      uuid,
  p_creation_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_hash      text;
  v_table     tables%ROWTYPE;
  v_member_id uuid;
BEGIN
  -- 1. Code Ecclesia
  SELECT value INTO v_hash FROM app_config WHERE key = 'creation_code_hash';
  IF v_hash IS NULL OR crypt(p_creation_code, v_hash) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'Code Ecclesia incorrect';
  END IF;

  -- 2. L'appelant doit déjà être assis à cette table précise — seule preuve
  --    d'identité disponible pour ce chemin (pas de join_code/pseudo saisis).
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
      AND user_id    = auth.uid();
  END IF;

  -- 3. Transfert volontaire, sans COALESCE (voir commentaire en tête de
  --    fichier) : l'ancien titulaire perd les deux branches d'un coup.
  UPDATE tables
  SET created_by                  = auth.uid(),
      leaderless                  = false,
      active_moderator_member_id  = v_member_id
  WHERE id = p_table_id;

  RETURN jsonb_build_object(
    'table_id',                   p_table_id,
    'active_moderator_member_id', v_member_id
  );
END;
$fn$;

COMMENT ON FUNCTION public.reclaim_table_as_moderator(uuid, text) IS
  'Chantier 110 — depuis l''intérieur d''une table (bouton Outils « Je suis '
  'le modérateur de cette table »), transfère l''autorité d''animation à '
  'l''appelant, Code Ecclesia requis, sans condition sur un éventuel '
  'titulaire déjà en place (transfert volontaire assumé, seul chemin de '
  'passation de main du projet). Distinct de claim_table_as_moderator '
  '(chantier 68/72), pensé pour une prise en charge depuis l''EXTÉRIEUR de '
  'la table par join_code + pseudo.';

GRANT EXECUTE ON FUNCTION public.reclaim_table_as_moderator(uuid, text) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Vérification (à exécuter après application, voir aussi A_VERIFIER.md) :
--
-- 1. Signature unique, search_path correct :
--    SELECT p.proname, pg_get_function_identity_arguments(p.oid), p.proconfig
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'reclaim_table_as_moderator';
--
-- 2. Refus si l'appelant n'est pas assis à la table :
--    (depuis une session anonyme n'ayant aucune ligne `participants` sur
--    cette table) SELECT reclaim_table_as_moderator('<TABLE_ID>', '<code>');
--    -- → exception 'Tu dois être assis à cette table...'
--
-- 3. Reprise réussie malgré un modérateur déjà en place (le cœur du
--    chantier) :
--    SELECT is_table_moderator('<TABLE_ID>');            -- false (appelant)
--    SELECT reclaim_table_as_moderator('<TABLE_ID>', '<code ecclesia>');
--    SELECT is_table_moderator('<TABLE_ID>');             -- true (appelant)
--    SELECT created_by, active_moderator_member_id FROM tables
--      WHERE id = '<TABLE_ID>';                            -- appelant / son session_members (ou NULL)
--
-- 4. L'ancien titulaire perd bien les deux branches (à exécuter depuis SA
--    session, ou en relisant is_table_moderator sous son ancien auth.uid()
--    si encore accessible) :
--    SELECT is_table_moderator('<TABLE_ID>');              -- false
-- ─────────────────────────────────────────────────────────────
