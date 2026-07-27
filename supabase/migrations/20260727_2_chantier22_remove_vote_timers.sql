-- =============================================================
-- Chantier 22 / G14 — Suppression des timers de phase
-- Décision (docs/VAGUE3-amendements-allocation.md § « Suppression des
-- notions de durée par phase ») : la gestion des durées de séance est
-- entièrement manuelle par l'organisateur, hors application. Les colonnes
-- vote_timer_minutes / vote_threshold_percent et toute la logique front qui
-- s'appuyait dessus (VoteTimerBadge, alertes timer/seuil superadmin) sont
-- retirées. Les transitions de phase restent manuelles (boutons superadmin).
-- =============================================================

-- ── update_session_config — ne prend plus timer/threshold ──────
-- CREATE OR REPLACE ne remplace pas une fonction dont la signature change de
-- nombre d'arguments (Postgres la traiterait comme une surcharge distincte) :
-- il faut explicitement supprimer l'ancienne version à 5 arguments.
DROP FUNCTION IF EXISTS update_session_config(text, uuid, text, int, int);

CREATE OR REPLACE FUNCTION update_session_config(
  p_password          text,
  p_session_id        uuid,
  p_moderation_policy text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash text;
  v_row  sessions%ROWTYPE;
BEGIN
  SELECT value INTO v_hash FROM app_config WHERE key = 'superadmin_code_hash';
  IF NOT crypt(p_password, v_hash) = v_hash THEN
    RAISE EXCEPTION 'Mot de passe superadmin incorrect';
  END IF;

  IF p_moderation_policy NOT IN ('open', 'closed', 'ai') THEN
    RAISE EXCEPTION 'moderation_policy invalide: %', p_moderation_policy;
  END IF;

  UPDATE sessions
  SET moderation_policy = p_moderation_policy
  WHERE id = p_session_id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

-- ── Suppression des colonnes ────────────────────────────────────
ALTER TABLE sessions DROP COLUMN IF EXISTS vote_timer_minutes;
ALTER TABLE sessions DROP COLUMN IF EXISTS vote_threshold_percent;
