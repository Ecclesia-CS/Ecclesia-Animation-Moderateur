-- =============================================================
-- Chantier 124 — verrouiller la proposition d'assertions (superadmin only)
--
-- Demande de Jules : pouvoir interdire à tout le monde, sauf le superadmin,
-- de proposer de nouvelles assertions — activable via un bouton dans le
-- panneau superadmin. Même patron que les chantiers 46 (results_public) et
-- 71 (onboarding_enabled) : colonne booléenne par séance + RPC toggle
-- protégée par mot de passe superadmin.
--
-- Le superadmin n'ayant lui-même aucun chemin pour proposer une assertion
-- (il n'est membre d'aucune séance — voir CLAUDE.md § session_members
-- self-only), « sauf superadmin » se traduit simplement par : lui seul
-- peut activer/désactiver le verrou (via check_superadmin_password), et le
-- verrou bloque tous les appels de submit_assertion (qui passent tous par
-- un session_members, donc jamais par le superadmin).
--
-- Définition vivante de submit_assertion vérifiée en base avant réécriture
-- (pg_get_functiondef, règle SQL du 07/09) : signature (uuid, text) RETURNS
-- jsonb, identique au corps de supabase/migrations/20260528_voting_app.sql
-- à l'exception du type de retour (jsonb au lieu de assertions) — pas de
-- divergence à préserver au-delà de ce que ce fichier réécrit.
-- =============================================================

-- ── 1. Colonne ───────────────────────────────────────────────────

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS assertions_locked boolean NOT NULL DEFAULT false;

-- ── 2. RPC set_session_assertions_locked — toggle superadmin ─────
-- Même forme que set_session_onboarding_enabled (chantier 71).
CREATE OR REPLACE FUNCTION set_session_assertions_locked(
  p_password          text,
  p_session_id        uuid,
  p_assertions_locked boolean
) RETURNS sessions
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session sessions;
BEGIN
  PERFORM check_superadmin_password(p_password);

  UPDATE sessions
  SET assertions_locked = p_assertions_locked
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Séance introuvable';
  END IF;

  RETURN v_session;
END;
$$;

GRANT EXECUTE ON FUNCTION set_session_assertions_locked(text, uuid, boolean) TO anon, authenticated;

-- ── 3. submit_assertion — applique le verrou ──────────────────────
-- Réécrit à l'identique de la définition courante en base, en ajoutant
-- la lecture de assertions_locked et le refus si actif.
CREATE OR REPLACE FUNCTION submit_assertion(p_session_id uuid, p_content text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_member_id uuid;
  v_policy    text;
  v_locked    boolean;
  v_status    text;
  v_assertion assertions%ROWTYPE;
BEGIN
  SELECT id INTO v_member_id
  FROM session_members
  WHERE session_id = p_session_id AND user_id = auth.uid()
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Vous n''êtes pas inscrit à cette séance';
  END IF;

  SELECT moderation_policy, assertions_locked INTO v_policy, v_locked
  FROM sessions WHERE id = p_session_id;

  IF v_locked THEN
    RAISE EXCEPTION 'La proposition de nouvelles assertions est désactivée par le superadmin pour cette séance';
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
--   v_status    text;
--   v_assertion assertions%ROWTYPE;
-- BEGIN
--   SELECT id INTO v_member_id
--   FROM session_members
--   WHERE session_id = p_session_id AND user_id = auth.uid()
--   LIMIT 1;
--   IF v_member_id IS NULL THEN
--     RAISE EXCEPTION 'Vous n''êtes pas inscrit à cette séance';
--   END IF;
--   SELECT moderation_policy INTO v_policy FROM sessions WHERE id = p_session_id;
--   v_status := CASE WHEN v_policy = 'open' THEN 'approved' ELSE 'pending' END;
--   INSERT INTO assertions(session_id, member_id, content, status)
--   VALUES (p_session_id, v_member_id, p_content, v_status)
--   RETURNING * INTO v_assertion;
--   RETURN to_jsonb(v_assertion);
-- END;
-- $$;
-- DROP FUNCTION IF EXISTS set_session_assertions_locked(text, uuid, boolean);
-- ALTER TABLE sessions DROP COLUMN IF EXISTS assertions_locked;
-- =============================================================

-- =============================================================
-- Requêtes de vérification (session de vérification dédiée) :
--
-- 1. Colonne posée, défaut correct sur les séances existantes :
--    SELECT id, title, assertions_locked FROM sessions ORDER BY created_at DESC LIMIT 5;
--    -- attendu : assertions_locked = false pour toutes les séances déjà en base
--
-- 2. Toggle sur une séance existante :
--    SELECT set_session_assertions_locked('<mot de passe superadmin>', '<session_id>', true);
--    SELECT assertions_locked FROM sessions WHERE id = '<session_id>';
--    -- attendu : true
--
-- 3. Un membre inscrit ne peut plus proposer d'assertion une fois verrouillé :
--    -- en tant que ce membre (auth.uid() = son user_id) :
--    SELECT submit_assertion('<session_id>', 'Test verrouillage');
--    -- attendu : exception 'La proposition de nouvelles assertions est désactivée...'
--
-- 4. Déverrouillage restaure le comportement normal :
--    SELECT set_session_assertions_locked('<mot de passe superadmin>', '<session_id>', false);
--    SELECT submit_assertion('<session_id>', 'Test après déverrouillage');
--    -- attendu : assertion créée normalement (statut selon moderation_policy)
--
-- 5. Mauvais mot de passe refusé :
--    SELECT set_session_assertions_locked('mauvais-mot-de-passe', '<session_id>', true);
--    -- attendu : exception 'Mot de passe superadmin incorrect'
-- =============================================================
