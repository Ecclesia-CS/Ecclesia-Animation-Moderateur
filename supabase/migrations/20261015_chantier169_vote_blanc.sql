-- Chantier 169 — vote blanc ("la question est mal formulée") distinct de
-- l'abstention ("pas d'avis").
--
-- Décision : la valeur 'pass' EST l'abstention (aucune donnée réécrite, toutes
-- les RPC de comptage existantes continuent de la lire telle quelle). On ajoute
-- 'blank' pour le vote blanc.
--
-- 1. assertion_votes.vote accepte 'blank'.
-- 2. cast_vote : un sondage en consentement refuse aussi 'blank' (deux réponses).
-- 3. submit_assertion : avoir voté blanc au moins une fois lève UNIQUEMENT la
--    règle « voter sur tout avant de proposer ». Le verrou (assertions_locked)
--    et le plafond (max_assertions_per_member) restent infranchissables.
--
-- Définitions de départ relues dans pg_get_functiondef (dev) le 2026-10-15.

ALTER TABLE public.assertion_votes DROP CONSTRAINT IF EXISTS assertion_votes_vote_check;
ALTER TABLE public.assertion_votes
  ADD CONSTRAINT assertion_votes_vote_check
  CHECK (vote = ANY (ARRAY['agree'::text, 'disagree'::text, 'pass'::text, 'blank'::text]));

CREATE OR REPLACE FUNCTION public.cast_vote(p_assertion_id uuid, p_vote text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_session_id uuid;
  v_status     text;
  v_phase      text;
  v_poll_mode  text;
  v_member_id  uuid;
  v_old        assertion_votes%ROWTYPE;
  v_vote_row   assertion_votes%ROWTYPE;
BEGIN
  SELECT session_id, status INTO v_session_id, v_status
  FROM assertions WHERE id = p_assertion_id;

  IF v_status <> 'approved' THEN
    RAISE EXCEPTION 'Cette assertion n''est pas approuvée';
  END IF;

  SELECT id INTO v_member_id
  FROM session_members
  WHERE session_id = v_session_id AND user_id = auth.uid()
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Vous n''êtes pas inscrit à cette séance';
  END IF;

  SELECT poll_mode INTO v_poll_mode FROM sessions WHERE id = v_session_id;
  v_phase := member_effective_phase(v_member_id);

  IF v_phase IS NULL OR v_phase NOT IN ('pre_voting', 'voting', 'allocating', 'post_voting') THEN
    RAISE EXCEPTION 'Le vote n''est pas ouvert en ce moment';
  END IF;

  IF v_poll_mode = 'consent' AND p_vote IN ('pass', 'blank') THEN
    RAISE EXCEPTION 'Ce sondage n''a que deux réponses : d''accord ou pas d''accord';
  END IF;

  SELECT * INTO v_old
  FROM assertion_votes
  WHERE assertion_id = p_assertion_id AND member_id = v_member_id;

  IF FOUND AND v_old.vote IS DISTINCT FROM p_vote THEN
    INSERT INTO assertion_vote_history(
      assertion_id, session_id, member_id, vote, voted_at, superseded_at, phase_at_change
    ) VALUES (
      v_old.assertion_id, v_old.session_id, v_old.member_id, v_old.vote,
      v_old.created_at, now(), v_phase
    );
  END IF;

  INSERT INTO assertion_votes(assertion_id, session_id, member_id, vote, first_cast_phase)
  VALUES (p_assertion_id, v_session_id, v_member_id, p_vote, v_phase)
  ON CONFLICT (assertion_id, member_id) DO UPDATE SET vote = EXCLUDED.vote
  RETURNING * INTO v_vote_row;

  RETURN to_jsonb(v_vote_row);
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_assertion(p_session_id uuid, p_content text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

  IF v_max IS NOT NULL AND
     (SELECT count(*) FROM assertions
      WHERE session_id = p_session_id AND member_id = v_member_id) >= v_max THEN
    RAISE EXCEPTION 'Tu as atteint le nombre maximal de propositions pour cette séance';
  END IF;

  -- Chantier 169 : un vote blanc (assertion approuvée) lève cette règle-là, et
  -- seulement celle-là.
  IF v_vote_first
     AND NOT EXISTS (
       SELECT 1 FROM assertion_votes v
       JOIN assertions a ON a.id = v.assertion_id
       WHERE v.member_id = v_member_id AND v.vote = 'blank' AND a.status = 'approved'
     )
     AND EXISTS (
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
$function$;
