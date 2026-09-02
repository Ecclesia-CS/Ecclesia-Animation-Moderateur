-- =============================================================
-- Chantier 49 — Purge des codes de rappel des séances closes
--
-- ⚠️  MIGRATION DESTRUCTIVE — IRRÉVERSIBLE. LIRE AVANT D'APPLIQUER.
--
-- Cette migration efface définitivement `session_members.reclaim_code`
-- (le PIN à 4 chiffres, en clair, permettant de reprendre une inscription
-- pré-vote) pour tous les membres des séances déjà en phase `closed`.
-- Un code effacé ne se retrouve pas : il n'existe à ce jour (2026-09-02)
-- aucune sauvegarde de la base (le chantier sauvegardes,
-- chantier-secu-sauvegardes, n'est pas mergé). Jules a explicitement
-- autorisé de procéder sans sauvegarde préalable.
--
-- Pourquoi maintenant : la lecture publique de `session_members` a été
-- fermée aujourd'hui (chantier 50, migration
-- 20260902_chantier50_close_identity_tables.sql) mais la donnée elle-même
-- restait en base indéfiniment sur toutes les séances passées — la donnée
-- la plus sensible du schéma, combinée au pseudo (nom + prénom réels), un
-- reclaim_code permet de reprendre l'identité de quelqu'un.
--
-- Ce que fait cette migration :
--   1. Purge ponctuelle : reclaim_code → NULL pour tout membre d'une
--      séance déjà `closed` (rattrapage des séances passées).
--   2. Purge automatique à l'avenir : `set_session_phase` efface
--      reclaim_code pour la séance dès qu'elle passe en `closed`, pour ne
--      plus jamais avoir à rejouer une purge ponctuelle.
--
-- ── À FAIRE AVANT D'APPLIQUER CETTE MIGRATION ────────────────────────────
-- Exécuter cette requête de diagnostic séparément (SQL Editor du dashboard
-- ou MCP), et noter le résultat (nombre de lignes concernées, éventuellement
-- une capture d'écran) dans A_VERIFIER.md avant de continuer :
--
--   -- Détail par séance :
--   SELECT s.id, s.title, s.phase, count(sm.*) AS codes_a_purger
--   FROM sessions s
--   JOIN session_members sm ON sm.session_id = s.id
--   WHERE s.phase = 'closed' AND sm.reclaim_code IS NOT NULL
--   GROUP BY s.id, s.title, s.phase
--   ORDER BY s.title;
--
--   -- Total global :
--   SELECT count(*) AS total_codes_a_purger
--   FROM session_members sm
--   JOIN sessions s ON s.id = sm.session_id
--   WHERE s.phase = 'closed' AND sm.reclaim_code IS NOT NULL;
--
-- Cette même requête (le total) est ré-exécutée juste avant la purge dans
-- le bloc DO ci-dessous et son résultat est émis en NOTICE, pour qu'il
-- reste visible dans la sortie du SQL Editor au moment de l'exécution.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. Purge ponctuelle des séances déjà closes ────────────────────────
DO $purge$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM session_members sm
  JOIN sessions s ON s.id = sm.session_id
  WHERE s.phase = 'closed' AND sm.reclaim_code IS NOT NULL;

  RAISE NOTICE 'Chantier 49 — purge ponctuelle : % code(s) de rappel à effacer sur des séances closes.', v_count;

  UPDATE session_members sm
  SET reclaim_code = NULL
  FROM sessions s
  WHERE s.id = sm.session_id
    AND s.phase = 'closed'
    AND sm.reclaim_code IS NOT NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Chantier 49 — purge ponctuelle : % ligne(s) effectivement mises à jour.', v_count;
END;
$purge$;

-- ── 2. Purge automatique à la clôture — set_session_phase ──────────────
-- Même signature que la version chantier 39 (20260901_chantier39_...) :
-- CREATE OR REPLACE suffit, pas de DROP nécessaire.
--
-- Ajout d'un `SET search_path = public, extensions` explicite : la version
-- précédente n'en avait pas et fonctionnait par héritage du search_path par
-- défaut de la session (qui inclut `extensions` chez Supabase). Le projet
-- s'est déjà fait piéger une fois par une fonction SECURITY DEFINER dont le
-- search_path ne couvrait pas `extensions` (crypt() alors introuvable,
-- symptôme trompeur : "mot de passe incorrect") — on fixe donc
-- explicitement le search_path dès qu'on touche à cette fonction, plutôt
-- que de continuer à compter sur l'héritage implicite.
CREATE OR REPLACE FUNCTION set_session_phase(
  p_password   text,
  p_session_id uuid,
  p_phase      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
  v_row  sessions%ROWTYPE;
BEGIN
  IF p_phase NOT IN ('draft', 'pre_voting', 'voting', 'allocating', 'debating', 'closed') THEN
    RAISE EXCEPTION 'Phase invalide: %', p_phase;
  END IF;

  SELECT value INTO v_hash FROM app_config WHERE key = 'superadmin_code_hash';
  IF NOT crypt(p_password, v_hash) = v_hash THEN
    RAISE EXCEPTION 'Mot de passe superadmin incorrect';
  END IF;

  UPDATE sessions
  SET phase = p_phase, phase_changed_at = now()
  WHERE id = p_session_id
  RETURNING * INTO v_row;

  -- Chantier 49 : la séance vient de passer (ou repasser) en `closed` —
  -- son reclaim_code n'a plus aucun usage fonctionnel (confirm_attendance
  -- et reclaim_prevoting_member sont tous deux hors-phase pour une séance
  -- close), autant l'effacer immédiatement plutôt que d'attendre une
  -- purge ponctuelle ultérieure. Sans condition sur l'ancienne phase :
  -- idempotent, no-op si déjà purgé.
  IF p_phase = 'closed' THEN
    UPDATE session_members
    SET reclaim_code = NULL
    WHERE session_id = p_session_id AND reclaim_code IS NOT NULL;
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

-- =============================================================
-- ROLLBACK (fonction uniquement — la purge de données, elle, est
-- irréversible et n'a pas de rollback) :
--
-- CREATE OR REPLACE FUNCTION set_session_phase(
--   p_password text, p_session_id uuid, p_phase text
-- ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
-- DECLARE
--   v_hash text;
--   v_row  sessions%ROWTYPE;
-- BEGIN
--   IF p_phase NOT IN ('draft', 'pre_voting', 'voting', 'allocating', 'debating', 'closed') THEN
--     RAISE EXCEPTION 'Phase invalide: %', p_phase;
--   END IF;
--   SELECT value INTO v_hash FROM app_config WHERE key = 'superadmin_code_hash';
--   IF NOT crypt(p_password, v_hash) = v_hash THEN
--     RAISE EXCEPTION 'Mot de passe superadmin incorrect';
--   END IF;
--   UPDATE sessions SET phase = p_phase, phase_changed_at = now()
--   WHERE id = p_session_id RETURNING * INTO v_row;
--   RETURN to_jsonb(v_row);
-- END;
-- $$;
-- =============================================================

-- =============================================================
-- Requêtes de vérification (session de vérification dédiée) :
--
-- 1. Aucun code de rappel ne subsiste sur une séance close :
--    SELECT count(*) FROM session_members sm
--    JOIN sessions s ON s.id = sm.session_id
--    WHERE s.phase = 'closed' AND sm.reclaim_code IS NOT NULL;
--    -- attendu : 0
--
-- 2. Purge automatique à la clôture — sur une séance de test en phase
--    `debating` avec au moins un membre `reclaim_code IS NOT NULL` :
--    SELECT set_session_phase('<mot de passe superadmin>', '<session_id>', 'closed');
--    SELECT reclaim_code FROM session_members WHERE session_id = '<session_id>';
--    -- attendu : NULL pour toutes les lignes
--
-- 3. Non-régression — reconquête pré-vote toujours fonctionnelle sur une
--    séance encore ouverte (phase `pre_voting`) :
--    SELECT reclaim_prevoting_member('<session_id>', NULL, '<code encore valide>');
--    -- attendu : succès, transfert de user_id (séance non close, code non purgé)
-- =============================================================
