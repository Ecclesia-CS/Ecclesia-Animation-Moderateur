-- =============================================================
-- Chantier 66 — Un participant ne doit être présent que dans une
--               table à la fois
--
-- SYMPTÔME (confirmé en base le 02/09) : deux identités de test restaient
-- listées comme présentes à la table 589D79 alors qu'elles l'avaient
-- quittée. Cause : `join_table` ne fait qu'un upsert sur (table_id, pseudo)
-- — rejoindre une nouvelle table AJOUTE une ligne `participants` sans
-- jamais supprimer l'ancienne dans la même séance.
--
-- Le trou avait déjà été bouché pour `table_assignments` par le chantier 26
-- (`sync_table_assignment`), et pour `participants` lui-même mais
-- UNIQUEMENT dans `switch_table` (chantier 48, enrichi depuis par les
-- chantiers 64b/64c d'une bascule arrière pour les tables
-- `leaderless_by_design`). Jamais dans `join_table`.
--
-- DÉCISION DE JULES (inchangée) : le bouton « Quitter » est purement
-- navigationnel, ne supprime rien. Le nettoyage se fait UNIQUEMENT à
-- l'entrée dans une nouvelle table — donc dans `join_table` comme dans
-- `switch_table`, jamais ailleurs.
--
-- ── 1. Mutualisation : `leave_other_session_tables` ────────────────────
-- `switch_table` fait déjà exactement ce qu'il faut (libère le micro, clôt
-- le tour en cours, supprime la ligne `participants`, puis bascule arrière
-- une table `leaderless_by_design` si celui qui part en était le
-- modérateur Bloc C). Plutôt que dupliquer cette logique dans `join_table`
-- — deux nettoyages qui divergeraient inévitablement au premier chantier
-- qui touche l'un sans l'autre —, elle est extraite dans un helper
-- SECURITY DEFINER commun, appelé par les deux fonctions. Signatures de
-- `join_table` et `switch_table` inchangées.
--
-- Différence assumée avec l'original de `switch_table` : le helper exclut
-- explicitement `p_new_table_id` de la boucle de nettoyage (`p.table_id IS
-- DISTINCT FROM p_new_table_id`), alors que `switch_table` s'appuyait sur
-- sa garde préalable (« Tu es déjà à cette table ») pour ne jamais être
-- appelé avec l'ancienne table = la nouvelle. `join_table`, elle, DOIT
-- accepter de rejoindre la table où l'appelant est déjà (reprise du même
-- code — voir point 2) : sans cette exclusion, reprendre son propre code
-- aurait supprimé sa propre ligne (donc coupé son micro s'il parlait) puis
-- réinséré une ligne neuve avec un nouvel id juste après. Le comportement
-- de `switch_table` (exception explicite si déjà à la table cible) est
-- inchangé — l'exclusion dans le helper y est simplement redondante avec
-- sa garde, jamais contradictoire.
--
-- ── 2. Reprise du même code — non cassée ────────────────────────────────
-- Cas couvert : `App.tsx` (résolution auth anonyme renouvelée — relie le
-- nouvel `auth.uid()` à la même table/pseudo via l'upsert existant),
-- `AllocatingScreen.handleJoin` (premier rejoint après allocation, rien à
-- nettoyer), et plus généralement quiconque retape le code de sa table
-- actuelle. Grâce à l'exclusion ci-dessus, la ligne `participants` de la
-- table cible n'est jamais touchée par le nettoyage — seul l'upsert
-- `ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id` s'applique, comme
-- avant cette migration.
--
-- ── 3. Inventaire des appelants de `join_table` (RPC `join_table`) ─────
-- Recensés par lecture de `src/` avant d'écrire cette migration — aucun ne
-- suppose que `join_table` laisse les anciennes lignes en place :
--   1. `EntryScreen.tsx` (onglet « Rejoindre », mode='join') — rejoint un
--      code tapé à la main, indépendamment de toute séance précise.
--   2. `JoinTableForm.tsx`, monté par `JoinTableScreen.tsx` (lien direct
--      `#table/<code>`), `VoteScreen.tsx` et `SessionRouterScreen.tsx`
--      (retardataire qui rejoint une table après la clôture du vote, sans
--      être jamais passé par l'allocation — cas explicitement cité par le
--      commentaire du chantier 67 dans `sync_table_assignment`).
--   3. `AllocatingScreen.tsx` (`handleJoin`) — bouton « Rejoindre » sur la
--      table ASSIGNÉE, premier rejoint de la séance pour ce participant :
--      la boucle de nettoyage ne trouve rien à faire.
--   4. `App.tsx` — résolution au démarrage quand le participant stocké en
--      local ne correspond plus à l'`auth.uid()` courant (auth anonyme
--      renouvelée) : relie via le même upsert, cas déjà couvert par le
--      point 2 ci-dessus (aucune ligne existante sous le NOUVEL
--      `auth.uid()`, donc rien à nettoyer non plus).
--   5. `TestScreen.tsx` — écran de test/dev, comportement inchangé (upsert
--      simple si aucune autre table dans la séance).
-- Aucun de ces chemins ne passe un `p_session_id` à `join_table` : la
-- séance reste dérivée de la table ciblée, comme avant.
--
-- ── 4. Historique et bascule arrière ─────────────────────────────────
-- `DELETE FROM participants` cascade sur `speaking_turns`/`queue_entries`
-- de CE participant à L'ANCIENNE table (comportement hérité et inchangé de
-- `switch_table`/`kick_participant`, pas introduit ici). La bascule arrière
-- d'une table `leaderless_by_design` (chantier 64b) s'applique désormais
-- aussi quand c'est via `join_table` que le modérateur s'en va — cohérent
-- avec le principe du chantier 64b (« le déclencheur, c'est le déplacement
-- vers une autre table », peu importe la fonction qui l'opère).
--
-- ── 5. Question ouverte, non traitée ici ────────────────────────────────
-- Les lignes fantômes déjà présentes en base (créées par le bug avant ce
-- correctif) ne sont PAS nettoyées par cette migration — opération
-- destructive, pas de sauvegarde active (cf. chantier-secu-sauvegardes,
-- non mergé). Requête de diagnostic (sans suppression) dans A_VERIFIER.md.
--
-- SIGNATURES INCHANGÉES — `join_table(text, text)` et
-- `switch_table(uuid, text, text)` gardent exactement leurs signatures et
-- types de retour d'origine. `CREATE OR REPLACE` suffit, pas de DROP.
-- Vérification avant application :
--   SELECT p.proname, pg_get_function_identity_arguments(p.oid), pg_get_function_result(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname IN ('join_table', 'switch_table');
--   → attendu : join_table(p_join_code text, p_pseudo text) RETURNS jsonb
--              switch_table(p_session_id uuid, p_join_code text, p_pseudo text) RETURNS jsonb
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. Helper commun — nettoyage des appartenances précédentes dans
--    la séance, hors table de destination.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION leave_other_session_tables(
  p_session_id   uuid,
  p_new_table_id uuid,
  p_user_id      uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_table_id        uuid;
  v_is_moderator        boolean;
  v_prev_assigned_table uuid;
BEGIN
  -- Table sans séance (ex. table leaderless créée hors allocation) : pas de
  -- notion de « précédentes tables de la séance », rien à nettoyer.
  IF p_session_id IS NULL THEN
    RETURN;
  END IF;

  -- Capturer AVANT tout déplacement : cet utilisateur est-il le modérateur
  -- Bloc C (session_members.is_moderator) de sa table logique actuelle ?
  -- Résolu via table_assignments — c'est elle qui porte l'autorité
  -- (cf. is_table_moderator), jamais `participants`. NULL si pas encore
  -- inscrit comme session_members (retardataire) — traité comme
  -- « pas modérateur » par le AND plus bas (logique à 3 valeurs).
  SELECT sm.is_moderator, ta.table_id
  INTO v_is_moderator, v_prev_assigned_table
  FROM session_members sm
  LEFT JOIN table_assignments ta
    ON  ta.session_id = sm.session_id
    AND ta.member_id  = sm.id
  WHERE sm.session_id = p_session_id
    AND sm.user_id    = p_user_id;

  -- Retirer proprement l'utilisateur de ses éventuelles tables précédentes
  -- dans CETTE séance (hors table de destination — reprise du même code,
  -- voir point 2 en en-tête) : libère le micro, clôt le tour en cours, puis
  -- supprime la ligne `participants` (cascade queue/turns) — même
  -- traitement que `kick_participant`/`switch_table` d'origine.
  FOR v_old_table_id IN
    SELECT DISTINCT p.table_id
    FROM participants p
    JOIN tables t ON t.id = p.table_id
    WHERE p.user_id = p_user_id
      AND t.session_id = p_session_id
      AND p.table_id IS DISTINCT FROM p_new_table_id
  LOOP
    UPDATE tables
    SET current_speaker_id = NULL, current_turn_started_at = NULL
    WHERE id = v_old_table_id
      AND current_speaker_id IN (
        SELECT id FROM participants WHERE table_id = v_old_table_id AND user_id = p_user_id
      );

    UPDATE speaking_turns
    SET ended_at = now()
    WHERE table_id = v_old_table_id
      AND participant_id IN (
        SELECT id FROM participants WHERE table_id = v_old_table_id AND user_id = p_user_id
      )
      AND ended_at IS NULL;

    DELETE FROM participants WHERE table_id = v_old_table_id AND user_id = p_user_id;
  END LOOP;

  -- Bascule arrière (chantier 64b) : si l'utilisateur quittait, EN TANT QUE
  -- MODÉRATEUR Bloc C, une table conçue sans modérateur
  -- (leaderless_by_design), elle redevient leaderless. Ne change QUE
  -- `leaderless` : `leaderless_by_design` reste `true`, la table peut être
  -- reconvertie puis re-basculée indéfiniment.
  IF v_is_moderator
     AND v_prev_assigned_table IS NOT NULL
     AND v_prev_assigned_table IS DISTINCT FROM p_new_table_id
  THEN
    UPDATE tables
    SET leaderless = true
    WHERE id = v_prev_assigned_table
      AND leaderless_by_design = true;
  END IF;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 2. join_table — nettoie désormais ses appartenances précédentes
--    dans la même séance avant d'insérer la nouvelle.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION join_table(
  p_join_code text,
  p_pseudo    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table_id       uuid;
  v_session_id     uuid;
  v_participant_id uuid;
  v_result         jsonb;
BEGIN
  SELECT id, session_id INTO v_table_id, v_session_id
  FROM tables WHERE join_code = upper(p_join_code);
  IF v_table_id IS NULL THEN
    RAISE EXCEPTION 'Session introuvable';
  END IF;

  PERFORM leave_other_session_tables(v_session_id, v_table_id, auth.uid());

  INSERT INTO participants (table_id, user_id, pseudo)
  VALUES (v_table_id, auth.uid(), p_pseudo)
  ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
  RETURNING id INTO v_participant_id;

  PERFORM sync_table_assignment(v_session_id, v_table_id, auth.uid(), p_pseudo);

  SELECT jsonb_build_object(
    'id',                      s.id,
    'join_code',               s.join_code,
    'created_by',              s.created_by,
    'current_speaker_id',      s.current_speaker_id,
    'current_turn_started_at', s.current_turn_started_at,
    'created_at',              s.created_at,
    'participant_id',          v_participant_id
  ) INTO v_result
  FROM tables s WHERE s.id = v_table_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION join_table(text, text) TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3. switch_table — refactorisée pour appeler le même helper (plus
--    de logique de nettoyage/bascule dupliquée). Comportement
--    observable inchangé : sa garde « Tu es déjà à cette table »
--    empêchait déjà d'être appelée avec l'ancienne table = la
--    nouvelle, donc l'exclusion du helper y est un no-op.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION switch_table(
  p_session_id uuid,
  p_join_code  text,
  p_pseudo     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table_id       uuid;
  v_table_session  uuid;
  v_participant_id uuid;
  v_result         jsonb;
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'Séance requise.';
  END IF;

  SELECT id, session_id INTO v_table_id, v_table_session
  FROM tables WHERE join_code = upper(p_join_code);

  IF v_table_id IS NULL THEN
    RAISE EXCEPTION 'Aucune table ne correspond à ce code.';
  END IF;

  IF v_table_session IS DISTINCT FROM p_session_id THEN
    RAISE EXCEPTION 'Ce code correspond à une table d''une autre séance.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM participants WHERE table_id = v_table_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Tu es déjà à cette table.';
  END IF;

  PERFORM leave_other_session_tables(p_session_id, v_table_id, auth.uid());

  INSERT INTO participants (table_id, user_id, pseudo)
  VALUES (v_table_id, auth.uid(), p_pseudo)
  ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
  RETURNING id INTO v_participant_id;

  PERFORM sync_table_assignment(p_session_id, v_table_id, auth.uid(), p_pseudo);

  SELECT jsonb_build_object(
    'id',                      s.id,
    'join_code',               s.join_code,
    'created_by',              s.created_by,
    'current_speaker_id',      s.current_speaker_id,
    'current_turn_started_at', s.current_turn_started_at,
    'created_at',              s.created_at,
    'participant_id',          v_participant_id
  ) INTO v_result
  FROM tables s WHERE s.id = v_table_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION switch_table(uuid, text, text) TO anon, authenticated;


-- =============================================================
-- REQUÊTES DE VÉRIFICATION (à exécuter après application)
-- =============================================================
--
-- 1. Signatures inchangées :
--    SELECT p.proname, pg_get_function_identity_arguments(p.oid), pg_get_function_result(p.oid)
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname IN ('join_table', 'switch_table', 'leave_other_session_tables');
--
-- 2. Rejoindre une AUTRE table dans la même séance nettoie l'ancienne
--    (remplacer par deux vraies tables de la même séance, un même user_id
--    déjà participant de TABLE_A) :
--    SELECT join_table('<JOIN_CODE_TABLE_B>', '<PSEUDO>');
--    SELECT count(*) FROM participants WHERE table_id = '<TABLE_A_ID>' AND user_id = '<USER_ID>'; -- 0
--    SELECT count(*) FROM participants WHERE table_id = '<TABLE_B_ID>' AND user_id = '<USER_ID>'; -- 1
--
-- 3. Reprendre le code de la table où l'on est déjà ne perd rien :
--    SELECT id FROM participants WHERE table_id = '<TABLE_ID>' AND user_id = '<USER_ID>'; -- capturer l'id
--    SELECT join_table('<MEME_JOIN_CODE>', '<MEME_PSEUDO>');
--    SELECT id FROM participants WHERE table_id = '<TABLE_ID>' AND user_id = '<USER_ID>'; -- id inchangé
--
-- 4. Table sans séance (leaderless standalone) : join_table fonctionne
--    comme avant, aucun nettoyage tenté (p_session_id NULL → early return).
--
-- =============================================================
-- SQL D'ANNULATION (revenir au comportement d'avant le chantier 66)
-- =============================================================
--
-- BEGIN;
--
-- CREATE OR REPLACE FUNCTION join_table(
--   p_join_code text,
--   p_pseudo    text
-- )
-- RETURNS jsonb
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- AS $$
-- DECLARE
--   v_table_id       uuid;
--   v_session_id     uuid;
--   v_participant_id uuid;
--   v_result         jsonb;
-- BEGIN
--   SELECT id, session_id INTO v_table_id, v_session_id
--   FROM tables WHERE join_code = upper(p_join_code);
--   IF v_table_id IS NULL THEN
--     RAISE EXCEPTION 'Session introuvable';
--   END IF;
--
--   INSERT INTO participants (table_id, user_id, pseudo)
--   VALUES (v_table_id, auth.uid(), p_pseudo)
--   ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
--   RETURNING id INTO v_participant_id;
--
--   PERFORM sync_table_assignment(v_session_id, v_table_id, auth.uid(), p_pseudo);
--
--   SELECT jsonb_build_object(
--     'id',                      s.id,
--     'join_code',               s.join_code,
--     'created_by',              s.created_by,
--     'current_speaker_id',      s.current_speaker_id,
--     'current_turn_started_at', s.current_turn_started_at,
--     'created_at',              s.created_at,
--     'participant_id',          v_participant_id
--   ) INTO v_result
--   FROM tables s WHERE s.id = v_table_id;
--
--   RETURN v_result;
-- END;
-- $$;
--
-- -- Recopier switch_table tel quel depuis 20260902_chantier64b_leaderless_origin_and_revert.sql
-- -- (dernière définition pré-chantier-66).
--
-- DROP FUNCTION IF EXISTS leave_other_session_tables(uuid, uuid, uuid);
--
-- COMMIT;
-- =============================================================
