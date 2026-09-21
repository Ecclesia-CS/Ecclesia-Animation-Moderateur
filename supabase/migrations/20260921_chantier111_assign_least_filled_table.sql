-- =============================================================
-- Chantier 111 — « Assignez-moi une table »
--
-- CONTEXTE (écart C5 de l'audit du 2026-09-20, arbitrage 3 de Jules) :
-- un retardataire en phase `debating`, jamais passé par le vote/l'allocation,
-- doit taper un code à 6 caractères qu'il n'a pas et doit mendier à un
-- voisin. Décision de Jules : lui offrir un bouton « Assignez-moi une
-- table » qui le place sans code, sur la table ANIMÉE la moins remplie
-- (déterministe, égalité -> plus petit table_number).
--
-- VÉRIFIÉ EN BASE AVANT D'ÉCRIRE CE FICHIER (requête jetable, transaction
-- annulée par une exception volontaire — aucune trace laissée) : le chemin
-- `join_table` -> `sync_table_assignment` inscrit DÉJÀ automatiquement en
-- `session_members` + `table_assignments` un retardataire qui rejoint une
-- table par son code, sans jamais être passé par le vote. L'écart C5 décrit
-- par l'audit du 2026-09-20 (« il n'a pas de ligne session_members ») est
-- donc déjà refermé depuis les chantiers 66/67 (2026-09-02/03, antérieurs à
-- l'audit) — ce qui manque réellement, c'est uniquement le bouton qui évite
-- de demander un code à quelqu'un. Cette migration n'ajoute donc qu'UNE
-- fonction neuve, sans toucher à `join_table`/`switch_table`/
-- `sync_table_assignment`.
--
-- Le geste : `assign_least_filled_table(session_id, pseudo)`, appelée sans
-- code de table. Elle :
--   1. inscrit l'appelant en `session_members` s'il n'existe pas encore
--      pour cette séance — avec un VRAI code de rappel (comme
--      `register_session_member`, qui refuse pourtant la phase `debating` :
--      dupliqué ici volontairement, cf. définition courante en base lue
--      avant d'écrire ce fichier, gen_member_reclaim_code + reclaim_code_hash) ;
--   2. choisit la table ANIMÉE (leaderless = false) de la séance dont le
--      moins de `participants` sont physiquement assis, égalité -> plus
--      petit `table_number`, égalité -> join_code (déterministe, §6) ;
--   3. réutilise le nettoyage/pose partagés (`leave_other_session_tables`,
--      `sync_table_assignment`) exactement comme `join_table`/`switch_table`.
--
-- ── Piège Postgres (cf. CLAUDE.md) ───────────────────────────────────
-- Fonction NEUVE, aucune signature existante à comparer. `leave_other_
-- session_tables` et `sync_table_assignment` sont appelées avec leur
-- signature COURANTE EN BASE (2 et 3 arguments, `auth.uid()` implicite —
-- vérifié par pg_get_functiondef avant d'écrire ce fichier ; les fichiers
-- de migration antérieurs à ce jour montrent encore 3/4 arguments, périmés).
-- `crypt()`/`gen_salt()` -> `SET search_path = public, extensions`.
--
-- Vérification de non-collision avant application :
--   SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'assign_least_filled_table';
--   -> attendu : aucune ligne.
-- =============================================================

CREATE OR REPLACE FUNCTION assign_least_filled_table(
  p_session_id uuid,
  p_pseudo     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_phase           text;
  v_pseudo          text := btrim(p_pseudo);
  v_member          session_members%ROWTYPE;
  v_code            text;
  v_table_id        uuid;
  v_participant_id  uuid;
  v_result          jsonb;
BEGIN
  IF v_pseudo = '' THEN
    RAISE EXCEPTION 'Nom prénom requis';
  END IF;

  SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;
  IF v_phase IS NULL THEN
    RAISE EXCEPTION 'Séance introuvable';
  END IF;
  IF v_phase <> 'debating' THEN
    RAISE EXCEPTION 'Cette séance n''est pas en débat.';
  END IF;

  -- Membre déjà inscrit (voté, ou déjà rejoint une table par code) ?
  SELECT * INTO v_member
  FROM session_members
  WHERE session_id = p_session_id AND user_id = auth.uid();

  IF v_member.id IS NULL THEN
    v_code := gen_member_reclaim_code(p_session_id);
    BEGIN
      INSERT INTO session_members (session_id, user_id, pseudo, joined_phase, attending_in_person, reclaim_code_hash)
      VALUES (p_session_id, auth.uid(), v_pseudo, v_phase, true, crypt(v_code, gen_salt('bf')))
      RETURNING * INTO v_member;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Ce nom est déjà utilisé dans cette séance.';
    END;
  END IF;

  -- Table ANIMÉE la moins remplie (occupation réelle = participants
  -- physiquement assis), égalité -> plus petit table_number, puis join_code
  -- pour rester déterministe même si deux tables partagent le même numéro
  -- logique (ne devrait pas arriver, filet de sécurité uniquement).
  SELECT t.id
  INTO v_table_id
  FROM tables t
  LEFT JOIN (
    SELECT table_id, count(*) AS occupied
    FROM participants
    GROUP BY table_id
  ) occ ON occ.table_id = t.id
  WHERE t.session_id = p_session_id
    AND t.leaderless = false
  ORDER BY COALESCE(occ.occupied, 0) ASC, t.table_number ASC NULLS LAST, t.join_code ASC
  LIMIT 1;

  IF v_table_id IS NULL THEN
    RAISE EXCEPTION 'Aucune table animée n''est encore disponible pour cette séance.';
  END IF;

  PERFORM leave_other_session_tables(p_session_id, v_table_id);

  INSERT INTO participants (table_id, user_id, pseudo)
  VALUES (v_table_id, auth.uid(), v_member.pseudo)
  ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
  RETURNING id INTO v_participant_id;

  PERFORM sync_table_assignment(p_session_id, v_table_id, v_member.pseudo);

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

  RETURN v_result || jsonb_build_object('new_reclaim_code', v_code);
END;
$$;

GRANT EXECUTE ON FUNCTION assign_least_filled_table(uuid, text) TO anon, authenticated;

-- =============================================================
-- REQUÊTES DE VÉRIFICATION (à exécuter après application, dans une
-- transaction annulée par une exception volontaire comme la recette de
-- conception ci-dessus — aucune donnée réelle à nettoyer)
-- =============================================================
--
-- DO $$
-- DECLARE
--   v_session_id uuid; v_table_a uuid; v_table_b uuid; v_result jsonb;
-- BEGIN
--   INSERT INTO sessions (title, join_code, phase) VALUES ('QA111', 'QA111X', 'debating') RETURNING id INTO v_session_id;
--   INSERT INTO tables (join_code, created_by, session_id, leaderless, table_number) VALUES ('QATBLA', gen_random_uuid(), v_session_id, false, 1) RETURNING id INTO v_table_a;
--   INSERT INTO tables (join_code, created_by, session_id, leaderless, table_number) VALUES ('QATBLB', gen_random_uuid(), v_session_id, false, 2) RETURNING id INTO v_table_b;
--   -- Un participant déjà assis à la table A (via join_table, un autre faux user) :
--   PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
--   PERFORM join_table('QATBLA', 'Déjà installé');
--   -- Le retardataire qui clique "Assignez-moi une table" doit atterrir sur B (moins remplie) :
--   PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
--   v_result := assign_least_filled_table(v_session_id, 'Retardataire QA');
--   IF (v_result->>'join_code') <> 'QATBLB' THEN
--     RAISE EXCEPTION 'ECHEC: attendu QATBLB, obtenu %', v_result->>'join_code';
--   END IF;
--   RAISE EXCEPTION 'OK — résultat: %', v_result;
-- END $$;
--
-- =============================================================
-- SQL D'ANNULATION
-- =============================================================
-- DROP FUNCTION IF EXISTS assign_least_filled_table(uuid, text);
-- =============================================================
