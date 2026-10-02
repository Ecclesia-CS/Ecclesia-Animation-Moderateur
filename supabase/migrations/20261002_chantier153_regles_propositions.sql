-- =============================================================
-- Chantier 153 — règles de proposition d'assertions, par séance
--
-- Deux réglages, activables en séance (comme assertions_locked, chantier 124) :
--   1. assertions_vote_first      : false par défaut. true → on ne peut proposer
--      une assertion qu'après avoir voté sur TOUTES les assertions approuvées
--      de la séance. (Aucune assertion à voter = autorisé, sinon personne ne
--      pourrait jamais amorcer une séance vide.)
--   2. max_assertions_per_member  : NULL par défaut = illimité. Sinon, nombre
--      maximal de propositions par personne. Abaisser le plafond en cours de
--      séance ne retire rien : une personne qui l'a déjà atteint ou dépassé
--      garde ses propositions, elle n'en peut simplement plus ajouter.
--
-- Réglage ouvert aux associations (check_session_admin, comme
-- set_session_assertions_locked depuis le chantier 135) : mêmes règles que
-- pour le superadmin, sur les séances de l'association uniquement.
--
-- Valable pour tous les types de séance ; sans effet en débat simple (aucune
-- assertion n'y est jamais proposée).
--
-- Définition vivante de submit_assertion vérifiée en base dev
-- (pg_get_functiondef, règle SQL du 07/09) avant réécriture : identique au
-- corps de 20260922_chantier124 — pas de divergence à préserver.
--
-- Droits de colonne : get_session_by_join_code / get_session_by_id sont
-- SECURITY DEFINER (SELECT *), donc le chargement initial n'en dépend pas.
-- Mais sur PROD les droits SELECT de anon/authenticated sur sessions sont
-- accordés colonne par colonne (chantier 58) et assertions_locked (124) n'y
-- figure pas ; les mises à jour poussées par Realtime pourraient donc ne pas
-- porter ces colonnes. On accorde SELECT sur les trois colonnes de règles
-- (non sensibles) — sans effet sur dev, où le droit est déjà table entière.
-- =============================================================

-- ── 1. Colonnes ──────────────────────────────────────────────────

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS assertions_vote_first boolean NOT NULL DEFAULT false;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS max_assertions_per_member integer;

ALTER TABLE sessions
  DROP CONSTRAINT IF EXISTS sessions_max_assertions_per_member_check;
ALTER TABLE sessions
  ADD CONSTRAINT sessions_max_assertions_per_member_check
  CHECK (max_assertions_per_member IS NULL OR max_assertions_per_member >= 1);

GRANT SELECT (assertions_locked, assertions_vote_first, max_assertions_per_member)
  ON sessions TO anon, authenticated;

-- ── 2. RPC set_session_assertion_rules ───────────────────────────
-- Les deux réglages ensemble : l'écran d'administration les envoie d'un bloc
-- (pas de risque d'écraser l'un en changeant l'autre depuis un état périmé :
-- l'appelant renvoie toujours les deux valeurs qu'il affiche).
CREATE OR REPLACE FUNCTION set_session_assertion_rules(
  p_password    text,
  p_session_id  uuid,
  p_vote_first  boolean,
  p_max         integer
) RETURNS sessions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_session sessions;
BEGIN
  PERFORM check_session_admin(p_password, p_session_id);

  IF p_max IS NOT NULL AND p_max < 1 THEN
    RAISE EXCEPTION 'Le plafond de propositions doit être au moins 1 (laisser vide pour illimité)';
  END IF;

  UPDATE sessions
  SET assertions_vote_first = COALESCE(p_vote_first, false),
      max_assertions_per_member = p_max
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Séance introuvable';
  END IF;

  RETURN v_session;
END;
$$;

REVOKE ALL ON FUNCTION set_session_assertion_rules(text, uuid, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_session_assertion_rules(text, uuid, boolean, integer) TO anon, authenticated;

-- ── 3. submit_assertion — applique les deux règles ───────────────
-- À l'identique de la définition courante, plus : plafond par personne,
-- puis « voter d'abord ».
CREATE OR REPLACE FUNCTION submit_assertion(p_session_id uuid, p_content text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_member_id  uuid;
  v_policy     text;
  v_locked     boolean;
  v_vote_first boolean;
  v_max        integer;
  v_status     text;
  v_assertion  assertions%ROWTYPE;
BEGIN
  SELECT id INTO v_member_id
  FROM session_members
  WHERE session_id = p_session_id AND user_id = auth.uid()
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Vous n''êtes pas inscrit à cette séance';
  END IF;

  SELECT moderation_policy, assertions_locked, assertions_vote_first, max_assertions_per_member
  INTO v_policy, v_locked, v_vote_first, v_max
  FROM sessions WHERE id = p_session_id;

  IF v_locked THEN
    RAISE EXCEPTION 'La proposition de nouvelles assertions est désactivée par le superadmin pour cette séance';
  END IF;

  -- Plafond par personne. Toutes les propositions comptent (même rejetées ou
  -- en attente), sinon on contournerait le plafond en se faisant rejeter.
  IF v_max IS NOT NULL AND
     (SELECT count(*) FROM assertions
      WHERE session_id = p_session_id AND member_id = v_member_id) >= v_max THEN
    RAISE EXCEPTION 'Tu as atteint le nombre maximal de propositions pour cette séance';
  END IF;

  -- Voter d'abord : toute assertion approuvée sans vote de ce membre bloque.
  IF v_vote_first AND EXISTS (
    SELECT 1 FROM assertions a
    WHERE a.session_id = p_session_id
      AND a.status = 'approved'
      AND NOT EXISTS (
        SELECT 1 FROM assertion_votes v
        WHERE v.assertion_id = a.id AND v.member_id = v_member_id
      )
  ) THEN
    RAISE EXCEPTION 'Vote d''abord sur toutes les assertions avant d''en proposer une';
  END IF;

  v_status := CASE WHEN v_policy = 'open' THEN 'approved' ELSE 'pending' END;

  INSERT INTO assertions(session_id, member_id, content, status)
  VALUES (p_session_id, v_member_id, p_content, v_status)
  RETURNING * INTO v_assertion;

  RETURN to_jsonb(v_assertion);
END;
$$;

-- =============================================================
-- ROLLBACK (à exécuter en un bloc si besoin de revenir en arrière) :
--
-- CREATE OR REPLACE FUNCTION submit_assertion(p_session_id uuid, p_content text)
-- RETURNS jsonb
-- LANGUAGE plpgsql SECURITY DEFINER AS $$
-- DECLARE
--   v_member_id uuid;
--   v_policy    text;
--   v_locked    boolean;
--   v_status    text;
--   v_assertion assertions%ROWTYPE;
-- BEGIN
--   SELECT id INTO v_member_id FROM session_members
--   WHERE session_id = p_session_id AND user_id = auth.uid() LIMIT 1;
--   IF v_member_id IS NULL THEN
--     RAISE EXCEPTION 'Vous n''êtes pas inscrit à cette séance';
--   END IF;
--   SELECT moderation_policy, assertions_locked INTO v_policy, v_locked
--   FROM sessions WHERE id = p_session_id;
--   IF v_locked THEN
--     RAISE EXCEPTION 'La proposition de nouvelles assertions est désactivée par le superadmin pour cette séance';
--   END IF;
--   v_status := CASE WHEN v_policy = 'open' THEN 'approved' ELSE 'pending' END;
--   INSERT INTO assertions(session_id, member_id, content, status)
--   VALUES (p_session_id, v_member_id, p_content, v_status)
--   RETURNING * INTO v_assertion;
--   RETURN to_jsonb(v_assertion);
-- END;
-- $$;
-- DROP FUNCTION IF EXISTS set_session_assertion_rules(text, uuid, boolean, integer);
-- ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_max_assertions_per_member_check;
-- ALTER TABLE sessions DROP COLUMN IF EXISTS max_assertions_per_member;
-- ALTER TABLE sessions DROP COLUMN IF EXISTS assertions_vote_first;
-- =============================================================
