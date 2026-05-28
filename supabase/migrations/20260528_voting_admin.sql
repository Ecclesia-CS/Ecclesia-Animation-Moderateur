-- =============================================================
-- BLOC C2 — RPC admin pour la phase de vote
-- =============================================================

-- ------------------------------------------------------------
-- list_assertions_admin
-- Retourne toutes les assertions d'une séance (pending + approved + rejected)
-- avec le pseudo du membre auteur
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION list_assertions_admin(
  p_password   text,
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash   text;
  v_result jsonb;
BEGIN
  SELECT value INTO v_hash FROM app_config WHERE key = 'superadmin_code_hash';
  IF NOT crypt(p_password, v_hash) = v_hash THEN
    RAISE EXCEPTION 'Mot de passe superadmin incorrect';
  END IF;

  SELECT jsonb_agg(r ORDER BY r.created_at ASC) INTO v_result
  FROM (
    SELECT
      a.id,
      a.session_id,
      a.member_id,
      a.content,
      a.status,
      a.created_at,
      sm.pseudo AS member_pseudo
    FROM assertions a
    JOIN session_members sm ON sm.id = a.member_id
    WHERE a.session_id = p_session_id
  ) r;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- ------------------------------------------------------------
-- get_session_voting_stats
-- Statistiques de participation pour une séance
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_session_voting_stats(
  p_password   text,
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash               text;
  v_member_count       int;
  v_onboarded_count    int;
  v_voter_count        int;
  v_approved_count     int;
  v_total_votes        int;
BEGIN
  SELECT value INTO v_hash FROM app_config WHERE key = 'superadmin_code_hash';
  IF NOT crypt(p_password, v_hash) = v_hash THEN
    RAISE EXCEPTION 'Mot de passe superadmin incorrect';
  END IF;

  SELECT COUNT(*) INTO v_member_count
  FROM session_members WHERE session_id = p_session_id;

  SELECT COUNT(*) INTO v_onboarded_count
  FROM entry_responses WHERE session_id = p_session_id;

  SELECT COUNT(DISTINCT member_id) INTO v_voter_count
  FROM assertion_votes WHERE session_id = p_session_id;

  SELECT COUNT(*) INTO v_approved_count
  FROM assertions WHERE session_id = p_session_id AND status = 'approved';

  SELECT COUNT(*) INTO v_total_votes
  FROM assertion_votes WHERE session_id = p_session_id;

  RETURN jsonb_build_object(
    'member_count',             v_member_count,
    'onboarded_count',          v_onboarded_count,
    'voter_count',              v_voter_count,
    'approved_assertion_count', v_approved_count,
    'total_votes',              v_total_votes
  );
END;
$$;

-- ------------------------------------------------------------
-- update_session_config
-- Met à jour la configuration de vote d'une séance
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_session_config(
  p_password               text,
  p_session_id             uuid,
  p_moderation_policy      text,
  p_vote_timer_minutes     int,
  p_vote_threshold_percent int
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

  IF p_moderation_policy NOT IN ('open', 'closed') THEN
    RAISE EXCEPTION 'moderation_policy invalide: %', p_moderation_policy;
  END IF;

  UPDATE sessions
  SET
    moderation_policy      = p_moderation_policy,
    vote_timer_minutes     = p_vote_timer_minutes,
    vote_threshold_percent = p_vote_threshold_percent
  WHERE id = p_session_id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;
