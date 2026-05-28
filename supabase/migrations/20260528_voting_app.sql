-- =============================================================
-- BLOC C — Phase de vote : tables, colonnes, RPC
-- =============================================================

-- ------------------------------------------------------------
-- TABLE session_members
-- ------------------------------------------------------------
CREATE TABLE session_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  user_id     uuid NOT NULL,
  pseudo      text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(session_id, user_id),
  UNIQUE(session_id, pseudo)
);

ALTER TABLE session_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_members_select" ON session_members
  FOR SELECT USING (true);

CREATE POLICY "session_members_insert" ON session_members
  FOR INSERT WITH CHECK (false);

-- ------------------------------------------------------------
-- TABLE entry_responses
-- ------------------------------------------------------------
CREATE TABLE entry_responses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          uuid REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  member_id           uuid REFERENCES session_members(id) ON DELETE CASCADE NOT NULL,
  consent_transcript  boolean NOT NULL DEFAULT false,
  group_size_pref     text NOT NULL DEFAULT 'medium'
                      CHECK (group_size_pref IN ('small', 'medium', 'large')),
  moderator_pref      boolean NOT NULL DEFAULT true,
  openness_to_diff    int NOT NULL DEFAULT 3
                      CHECK (openness_to_diff BETWEEN 1 AND 5),
  participation_style text NOT NULL DEFAULT 'active'
                      CHECK (participation_style IN ('listener', 'active')),
  created_at          timestamptz DEFAULT now(),
  UNIQUE(session_id, member_id)
);

ALTER TABLE entry_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entry_responses_select_own" ON entry_responses
  FOR SELECT USING (member_id IN (
    SELECT id FROM session_members WHERE user_id = auth.uid()
  ));

-- ------------------------------------------------------------
-- TABLE assertions
-- ------------------------------------------------------------
CREATE TABLE assertions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  member_id   uuid REFERENCES session_members(id) ON DELETE CASCADE NOT NULL,
  content     text NOT NULL,
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE assertions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assertions_select_approved" ON assertions
  FOR SELECT USING (status = 'approved');

-- ------------------------------------------------------------
-- TABLE assertion_votes
-- ------------------------------------------------------------
CREATE TABLE assertion_votes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assertion_id uuid REFERENCES assertions(id) ON DELETE CASCADE NOT NULL,
  session_id   uuid REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  member_id    uuid REFERENCES session_members(id) ON DELETE CASCADE NOT NULL,
  vote         text NOT NULL CHECK (vote IN ('agree', 'disagree', 'pass')),
  created_at   timestamptz DEFAULT now(),
  UNIQUE(assertion_id, member_id)
);

ALTER TABLE assertion_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assertion_votes_select_own" ON assertion_votes
  FOR SELECT USING (member_id IN (
    SELECT id FROM session_members WHERE user_id = auth.uid()
  ));

-- ------------------------------------------------------------
-- TABLE table_assignments
-- ------------------------------------------------------------
CREATE TABLE table_assignments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  member_id    uuid REFERENCES session_members(id) ON DELETE CASCADE NOT NULL,
  table_number int NOT NULL,
  table_id     uuid REFERENCES tables(id) ON DELETE SET NULL,
  created_at   timestamptz DEFAULT now(),
  UNIQUE(session_id, member_id)
);

ALTER TABLE table_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "table_assignments_select" ON table_assignments
  FOR SELECT USING (true);

-- ------------------------------------------------------------
-- Nouvelles colonnes sur sessions
-- ------------------------------------------------------------
ALTER TABLE sessions
  ADD COLUMN moderation_policy text NOT NULL DEFAULT 'closed'
    CHECK (moderation_policy IN ('open', 'closed'));

ALTER TABLE sessions ADD COLUMN vote_timer_minutes int;
ALTER TABLE sessions ADD COLUMN vote_threshold_percent int;

-- ------------------------------------------------------------
-- Realtime
-- ------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE
  session_members, assertions, assertion_votes, table_assignments;

-- ============================================================
-- FONCTIONS RPC SECURITY DEFINER
-- ============================================================

-- ------------------------------------------------------------
-- register_session_member
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION register_session_member(
  p_session_id uuid,
  p_pseudo     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_phase  text;
  v_member session_members%ROWTYPE;
BEGIN
  SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;
  IF v_phase NOT IN ('draft', 'voting') THEN
    RAISE EXCEPTION 'La séance n''est pas en phase d''inscription (phase: %)', v_phase;
  END IF;

  -- ON CONFLICT user: retourner l'existant
  BEGIN
    INSERT INTO session_members(session_id, user_id, pseudo)
    VALUES (p_session_id, auth.uid(), p_pseudo)
    ON CONFLICT (session_id, user_id) DO UPDATE SET pseudo = session_members.pseudo
    RETURNING * INTO v_member;
  EXCEPTION WHEN unique_violation THEN
    -- Conflit sur (session_id, pseudo) — le pseudo est déjà pris par quelqu'un d'autre
    RAISE EXCEPTION 'Pseudo déjà pris';
  END;

  RETURN to_jsonb(v_member);
END;
$$;

-- ------------------------------------------------------------
-- submit_entry_response
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_entry_response(
  p_session_id          uuid,
  p_consent_transcript  boolean,
  p_group_size_pref     text,
  p_moderator_pref      boolean,
  p_openness_to_diff    int,
  p_participation_style text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_member_id uuid;
  v_response  entry_responses%ROWTYPE;
BEGIN
  SELECT id INTO v_member_id
  FROM session_members
  WHERE session_id = p_session_id AND user_id = auth.uid()
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Vous n''êtes pas inscrit à cette séance';
  END IF;

  INSERT INTO entry_responses(
    session_id, member_id,
    consent_transcript, group_size_pref, moderator_pref,
    openness_to_diff, participation_style
  ) VALUES (
    p_session_id, v_member_id,
    p_consent_transcript, p_group_size_pref, p_moderator_pref,
    p_openness_to_diff, p_participation_style
  )
  ON CONFLICT (session_id, member_id) DO UPDATE SET
    consent_transcript  = EXCLUDED.consent_transcript,
    group_size_pref     = EXCLUDED.group_size_pref,
    moderator_pref      = EXCLUDED.moderator_pref,
    openness_to_diff    = EXCLUDED.openness_to_diff,
    participation_style = EXCLUDED.participation_style
  RETURNING * INTO v_response;

  RETURN to_jsonb(v_response);
END;
$$;

-- ------------------------------------------------------------
-- submit_assertion
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_assertion(
  p_session_id uuid,
  p_content    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_member_id uuid;
  v_policy    text;
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

  SELECT moderation_policy INTO v_policy FROM sessions WHERE id = p_session_id;
  v_status := CASE WHEN v_policy = 'open' THEN 'approved' ELSE 'pending' END;

  INSERT INTO assertions(session_id, member_id, content, status)
  VALUES (p_session_id, v_member_id, p_content, v_status)
  RETURNING * INTO v_assertion;

  RETURN to_jsonb(v_assertion);
END;
$$;

-- ------------------------------------------------------------
-- cast_vote
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION cast_vote(
  p_assertion_id uuid,
  p_vote         text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id uuid;
  v_status     text;
  v_member_id  uuid;
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

  INSERT INTO assertion_votes(assertion_id, session_id, member_id, vote)
  VALUES (p_assertion_id, v_session_id, v_member_id, p_vote)
  ON CONFLICT (assertion_id, member_id) DO UPDATE SET vote = EXCLUDED.vote
  RETURNING * INTO v_vote_row;

  RETURN to_jsonb(v_vote_row);
END;
$$;

-- ------------------------------------------------------------
-- get_vote_results
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_vote_results(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_member_count int;
  v_results      jsonb;
BEGIN
  SELECT COUNT(DISTINCT sm.id) INTO v_member_count
  FROM session_members sm
  WHERE sm.session_id = p_session_id;

  SELECT jsonb_agg(r) INTO v_results
  FROM (
    SELECT
      a.id,
      a.content,
      a.status,
      COUNT(av.id) FILTER (WHERE av.vote = 'agree')     AS agree_count,
      COUNT(av.id) FILTER (WHERE av.vote = 'disagree')  AS disagree_count,
      COUNT(av.id) FILTER (WHERE av.vote = 'pass')      AS pass_count,
      COUNT(av.id)                                       AS total_votes,
      ROUND(
        (1 - ABS(
          COUNT(av.id) FILTER (WHERE av.vote = 'agree') -
          COUNT(av.id) FILTER (WHERE av.vote = 'disagree')
        )::float / NULLIF(
          COUNT(av.id) FILTER (WHERE av.vote = 'agree') +
          COUNT(av.id) FILTER (WHERE av.vote = 'disagree'),
          0
        )) *
        (COUNT(av.id)::float / NULLIF(v_member_count, 0)) * 100
      , 2) AS consensus_score
    FROM assertions a
    LEFT JOIN assertion_votes av ON av.assertion_id = a.id
    WHERE a.session_id = p_session_id AND a.status = 'approved'
    GROUP BY a.id, a.content, a.status
    ORDER BY consensus_score DESC NULLS LAST
  ) r;

  RETURN COALESCE(v_results, '[]'::jsonb);
END;
$$;

-- ------------------------------------------------------------
-- approve_assertion
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION approve_assertion(
  p_password     text,
  p_assertion_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash text;
  v_row  assertions%ROWTYPE;
BEGIN
  SELECT value INTO v_hash FROM app_config WHERE key = 'superadmin_code_hash';
  IF NOT crypt(p_password, v_hash) = v_hash THEN
    RAISE EXCEPTION 'Mot de passe superadmin incorrect';
  END IF;

  UPDATE assertions SET status = 'approved'
  WHERE id = p_assertion_id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

-- ------------------------------------------------------------
-- reject_assertion
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION reject_assertion(
  p_password     text,
  p_assertion_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash text;
  v_row  assertions%ROWTYPE;
BEGIN
  SELECT value INTO v_hash FROM app_config WHERE key = 'superadmin_code_hash';
  IF NOT crypt(p_password, v_hash) = v_hash THEN
    RAISE EXCEPTION 'Mot de passe superadmin incorrect';
  END IF;

  UPDATE assertions SET status = 'rejected'
  WHERE id = p_assertion_id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

-- ------------------------------------------------------------
-- set_session_phase
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_session_phase(
  p_password   text,
  p_session_id uuid,
  p_phase      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash text;
  v_row  sessions%ROWTYPE;
BEGIN
  IF p_phase NOT IN ('draft', 'voting', 'allocating', 'debating', 'questionnaire', 'closed') THEN
    RAISE EXCEPTION 'Phase invalide: %', p_phase;
  END IF;

  SELECT value INTO v_hash FROM app_config WHERE key = 'superadmin_code_hash';
  IF NOT crypt(p_password, v_hash) = v_hash THEN
    RAISE EXCEPTION 'Mot de passe superadmin incorrect';
  END IF;

  UPDATE sessions SET phase = p_phase
  WHERE id = p_session_id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

-- ------------------------------------------------------------
-- run_clustering_v1
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION run_clustering_v1(
  p_password    text,
  p_session_id  uuid,
  p_target_size int DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash         text;
  v_members      uuid[];
  v_count        int;
  v_table_count  int;
  v_i            int;
  v_table_num    int;
BEGIN
  SELECT value INTO v_hash FROM app_config WHERE key = 'superadmin_code_hash';
  IF NOT crypt(p_password, v_hash) = v_hash THEN
    RAISE EXCEPTION 'Mot de passe superadmin incorrect';
  END IF;

  -- Récupérer les membres qui ont rempli entry_response, ordre aléatoire
  SELECT ARRAY(
    SELECT sm.id
    FROM session_members sm
    INNER JOIN entry_responses er ON er.member_id = sm.id
    WHERE sm.session_id = p_session_id
    ORDER BY random()
  ) INTO v_members;

  v_count := array_length(v_members, 1);
  IF v_count IS NULL OR v_count = 0 THEN
    RAISE EXCEPTION 'Aucun membre avec entry_response pour cette séance';
  END IF;

  v_table_count := CEIL(v_count::float / p_target_size);

  -- Supprimer les assignments précédents pour cette séance
  DELETE FROM table_assignments WHERE session_id = p_session_id;

  -- Insérer les assignments
  FOR v_i IN 1..v_count LOOP
    v_table_num := ((v_i - 1) % v_table_count) + 1;
    INSERT INTO table_assignments(session_id, member_id, table_number)
    VALUES (p_session_id, v_members[v_i], v_table_num);
  END LOOP;

  -- Passer la séance en phase allocating
  UPDATE sessions SET phase = 'allocating' WHERE id = p_session_id;

  RETURN jsonb_build_object('table_count', v_table_count, 'member_count', v_count);
END;
$$;
