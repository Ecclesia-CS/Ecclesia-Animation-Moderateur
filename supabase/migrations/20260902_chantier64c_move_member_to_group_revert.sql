-- =============================================================
-- Chantier 64 (complément 2) — move_member_to_group bascule aussi
--               la table quittée
--
-- DEMANDE DE JULES
-- -----------------
-- « oui, faisons la même chose si c'est le super admin qui l'enlève. »
-- — en réponse au point signalé (pas étendu) par la migration précédente :
-- `move_member_to_group` (glisser-déposer d'un membre vers un autre groupe,
-- onglet Groupes) a le même effet mécanique que `switch_table` — un membre
-- quitte une table pour une autre — mais n'était pas couvert par la
-- bascule arrière.
--
-- CORRECTIF — même garde, même condition que switch_table
-- -----------------------------------------------------------------------
-- Avant de déplacer le membre, `move_member_to_group` capture désormais si
-- ce membre est le modérateur Bloc C (`session_members.is_moderator`) de la
-- table qu'il quitte (résolue via son `table_assignments` courant). Une
-- fois le déplacement effectué, si ces conditions tenaient ET que la table
-- quittée a `leaderless_by_design = true` (convertie depuis une table sans
-- modérateur — colonne posée par 20260902_chantier64b_...), elle repasse
-- `leaderless = true`. Une table `leaderless_by_design = false` (conçue
-- pour avoir un modérateur) ne bascule jamais, quel que soit le membre
-- déplacé — identique à `switch_table`.
--
-- INVENTAIRE DEMANDÉ PAR JULES — tous les chemins qui retirent un membre
-- d'une table, recherchés sur l'ensemble de `supabase/migrations/`
-- -----------------------------------------------------------------------
-- Recherche exhaustive de toute écriture dans `table_assignments` et de
-- tout `DELETE FROM participants` / `DELETE FROM session_members` :
--
--   1. `switch_table` (chantier 48) — participant quitte pour une autre
--      table de son propre chef. DÉJÀ COUVERT (20260902_chantier64b_...).
--   2. `move_member_to_group` (superadmin, glisser-déposer onglet Groupes)
--      — CE FICHIER.
--   3. `set_member_moderator(..., false)` — retrait EN PLACE, le membre ne
--      change pas de table_assignments. Tranché par Jules : ne bascule
--      jamais (chantier 64 initial), confirmé inchangé.
--   4. `kick_participant` — supprime la ligne `participants` (le siège
--      physique), mais NE TOUCHE JAMAIS `table_assignments` : c'est un
--      défaut préexistant, indépendant de ce chantier (la ligne Bloc C du
--      membre exclu reste pointée sur la table dont il vient d'être
--      exclu). Non concerné par la bascule ici : il n'y a pas de table de
--      destination — la personne est exclue, elle ne « part vers une
--      autre table ». Signalé, non traité : à trancher séparément si
--      Jules le souhaite (probablement un nettoyage de
--      `table_assignments` lors d'un kick, indépendant du sujet
--      `leaderless`).
--   5. `assign_table_to_group` — **catégorie différente** : rattache une
--      table PHYSIQUE à un numéro de groupe LOGIQUE pour TOUS ses membres
--      d'un coup (`UPDATE table_assignments SET table_id = ... WHERE
--      table_number = ...`), sans jamais toucher `participants`. Ce n'est
--      pas « un membre part vers une autre table » mais « le groupe change
--      de local physique » — le concept de bascule au départ D'UN membre
--      ne s'applique pas ici. Non modifié.
--   6. `apply_allocation` — recalcul complet (`DELETE` puis réinsertion de
--      tout `table_assignments` de la séance). DÉJÀ COUVERT différemment
--      (chantier 64b) : chaque table touchée par un recalcul se voit
--      reposer `leaderless_by_design` à la valeur du nouveau plan — un
--      recalcul redésigne authentiquement la nature de chaque table, la
--      question de la « bascule au départ » ne s'y pose pas.
--   7. `run_clustering_v1/v2/v3`, `auto_assign_tables` (fonctions de
--      clustering historiques, chantiers antérieurs à l'allocation v2) —
--      confirmées **mortes** : plus appelées par le frontend depuis le
--      chantier 37 (cf. CLAUDE.md, section Phase de vote). Vérifié par
--      lecture qu'aucune ne touche jamais `tables.leaderless` (grep
--      "leaderless" sur les 7 fichiers concernés : zéro résultat) — elles
--      prédatent la colonne. Non modifiées : mortes, hors périmètre, et
--      sans interaction avec le sujet de ce chantier de toute façon.
--   8. Aucune RPC ne supprime jamais de ligne `session_members` (`grep
--      "DELETE FROM session_members"` sur tout `supabase/migrations/` :
--      zéro résultat) — un membre ne peut jamais être retiré d'une séance
--      entièrement, seulement réaffecté (2), auto-relogé (1) ou exclu
--      physiquement d'une table (4).
--
-- Bilan : deux chemins retirent effectivement un membre d'une table pour
-- l'affecter à une AUTRE table du même type d'opération (« il part vers
-- une autre table ») — `switch_table` et `move_member_to_group`. Les deux
-- sont maintenant couverts, avec exactement la même règle.
--
-- 2. RÉTRO-CLASSEMENT — validé par Jules, aucun changement de ce côté
-- -----------------------------------------------------------------------
-- « Ton choix de rétro-classement est validé. » Le backfill
-- `leaderless_by_design = leaderless` posé par 20260902_chantier64b_... est
-- laissé tel quel — ce fichier n'y touche pas. La limite déjà documentée
-- (une table déjà convertie par le chantier 64 initial avant application
-- de ces migrations serait classée à tort comme « conçue modérée », sens
-- sûr car elle ne perd alors jamais son modérateur par surprise) reste
-- valable et n'est pas réévaluée ici.
--
-- 3. HISTORIQUE — aucun changement de risque
-- -----------------------------------------------------------------------
-- Même raisonnement que pour `switch_table` (chantier 64b) : `leaderless`
-- est une simple colonne booléenne sans trigger ni FK associée (toujours
-- zéro `CREATE TRIGGER` sur `tables` dans tout l'historique de
-- migrations). `move_member_to_group` ne touche jamais `participants`,
-- `queue_entries` ni `speaking_turns` — le corps de la fonction, hors
-- l'ajout ci-dessous, est inchangé. Scénario de vérification écrit dans
-- A_VERIFIER.md.
--
-- SIGNATURE INCHANGÉE
-- -----------------------
-- `move_member_to_group(text, uuid, uuid, int) RETURNS void` — `CREATE OR
-- REPLACE` suffit.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 0. Garde-fou Postgres — signature inchangée
-- ─────────────────────────────────────────────────────────────

DO $guard$
DECLARE
  v_want record;
  v_have record;
BEGIN
  FOR v_want IN
    SELECT * FROM (VALUES
      ('move_member_to_group', 'p_password text, p_session_id uuid, p_member_id uuid, p_target_table_number integer', 'void')
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
        RAISE NOTICE 'chantier 64c — DROP public.%(%) RETURNS %  [attendu : (%) RETURNS %]',
          v_want.fname, v_have.args, v_have.res, v_want.args, v_want.res;
        EXECUTE format('DROP FUNCTION public.%I(%s)', v_want.fname, v_have.args);
      END IF;
    END LOOP;
  END LOOP;
END
$guard$;


-- ─────────────────────────────────────────────────────────────
-- 1. move_member_to_group — bascule arrière de la table quittée
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION move_member_to_group(
  p_password             text,
  p_session_id           uuid,
  p_member_id            uuid,
  p_target_table_number  int
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_target_table_id uuid;
  v_old_table_id    uuid;
  v_is_moderator    boolean;
BEGIN
  PERFORM check_superadmin_password(p_password);

  -- Chantier 64 (complément 2) — capturer AVANT le déplacement : ce membre
  -- est-il le modérateur Bloc C (session_members.is_moderator) de la table
  -- qu'il s'apprête à quitter (table_assignments — c'est elle qui porte
  -- l'autorité, cf. is_table_moderator) ? NULL si le membre n'a pas
  -- (encore) de ligne table_assignments — traité comme "pas de table à
  -- faire basculer" par le IS NOT NULL ci-dessous.
  SELECT ta.table_id, sm.is_moderator
  INTO v_old_table_id, v_is_moderator
  FROM session_members sm
  LEFT JOIN table_assignments ta
    ON  ta.session_id = sm.session_id
    AND ta.member_id  = sm.id
  WHERE sm.id         = p_member_id
    AND sm.session_id = p_session_id;

  -- Récupérer le table_id physique du groupe cible (peut être NULL si pas encore rattaché)
  SELECT DISTINCT table_id INTO v_target_table_id
  FROM table_assignments
  WHERE session_id = p_session_id
    AND table_number = p_target_table_number
  LIMIT 1;

  UPDATE table_assignments
  SET table_number = p_target_table_number,
      table_id     = v_target_table_id
  WHERE session_id = p_session_id
    AND member_id  = p_member_id;

  -- Chantier 64 (complément 2) — la table quittée redevient `leaderless`
  -- si ce membre en était le modérateur ET qu'elle avait été convertie
  -- depuis une table sans modérateur. Jamais si elle a été conçue modérée
  -- dès l'origine (`leaderless_by_design = false`) : Jules considère alors
  -- que le modérateur va revenir. `leaderless_by_design` lui-même ne bouge
  -- pas — la table reste reconvertible.
  IF v_is_moderator
     AND v_old_table_id IS NOT NULL
     AND v_old_table_id IS DISTINCT FROM v_target_table_id
  THEN
    UPDATE tables
    SET leaderless = true
    WHERE id = v_old_table_id
      AND leaderless_by_design = true;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION move_member_to_group(text, uuid, uuid, int) TO anon, authenticated;


-- =============================================================
-- REQUÊTES DE VÉRIFICATION (à exécuter après application)
-- =============================================================
--
-- 1. Table convertie, déplacement du modérateur par le superadmin :
--    (remplacer les UUID/numéros par une vraie table `leaderless=true`
--    convertie via set_member_moderator/claim_moderator_status/
--    assign_moderator_to_table, avec ce membre comme modérateur assis)
--    SELECT leaderless, leaderless_by_design FROM tables WHERE id = '<TABLE_ID>'; -- false, true
--    SELECT move_member_to_group('<mdp superadmin>', '<SESSION_ID>', '<MEMBER_ID>', <AUTRE_TABLE_NUMBER>);
--    SELECT leaderless, leaderless_by_design FROM tables WHERE id = '<TABLE_ID>'; -- true, true
--
-- 2. Table conçue modérée, déplacement du modérateur : rien ne change.
--    SELECT leaderless, leaderless_by_design FROM tables WHERE id = '<TABLE_ID>'; -- false, false
--    SELECT move_member_to_group('<mdp superadmin>', '<SESSION_ID>', '<MEMBER_ID>', <AUTRE_TABLE_NUMBER>);
--    SELECT leaderless, leaderless_by_design FROM tables WHERE id = '<TABLE_ID>'; -- toujours false, false
--
-- 3. Déplacement d'un membre ORDINAIRE (pas modérateur) de la table
--    convertie : rien ne change non plus.
--    SELECT move_member_to_group('<mdp superadmin>', '<SESSION_ID>', '<MEMBER_ORDINAIRE_ID>', <AUTRE_TABLE_NUMBER>);
--    SELECT leaderless FROM tables WHERE id = '<TABLE_ID>'; -- reste false
--
-- 4. Historique préservé (aucun DELETE/TRUNCATE) :
--    SELECT count(*) FROM speaking_turns WHERE table_id = '<TABLE_ID>';  -- avant test 1
--    -- ... déclencher le test 1 ...
--    SELECT count(*) FROM speaking_turns WHERE table_id = '<TABLE_ID>';  -- identique
--    SELECT count(*) FROM queue_entries  WHERE table_id = '<TABLE_ID>';  -- inchangé
--
-- =============================================================
-- SQL D'ANNULATION (rollback vers l'état pré-complément 2)
-- =============================================================
--
-- Recopier tel quel le corps de move_member_to_group depuis
-- 20260602_move_member_to_group.sql (signature inchangée) :
--
-- BEGIN;
-- CREATE OR REPLACE FUNCTION move_member_to_group(
--   p_password             text,
--   p_session_id           uuid,
--   p_member_id            uuid,
--   p_target_table_number  int
-- ) RETURNS void
-- LANGUAGE plpgsql SECURITY DEFINER AS $$
-- DECLARE
--   v_target_table_id uuid;
-- BEGIN
--   PERFORM check_superadmin_password(p_password);
--   SELECT DISTINCT table_id INTO v_target_table_id
--   FROM table_assignments
--   WHERE session_id = p_session_id AND table_number = p_target_table_number
--   LIMIT 1;
--   UPDATE table_assignments
--   SET table_number = p_target_table_number, table_id = v_target_table_id
--   WHERE session_id = p_session_id AND member_id = p_member_id;
-- END;
-- $$;
-- COMMIT;
-- =============================================================
