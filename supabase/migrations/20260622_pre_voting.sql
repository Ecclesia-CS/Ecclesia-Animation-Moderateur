-- =============================================================
-- pre_voting : phase de vote ouverte à tous avant l'événement
-- + confirmation présentielle (attending_in_person)
-- + reclaim de pseudo par code ou par confiance
-- =============================================================

-- ── 1. Phase pre_voting dans sessions ────────────────────────

ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_phase_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_phase_check
  CHECK (phase IN ('draft','pre_voting','voting','allocating','debating','questionnaire','closed'));

-- ── 2. Colonnes session_members ──────────────────────────────

ALTER TABLE session_members
  ADD COLUMN IF NOT EXISTS attending_in_person boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reclaim_code_hash text;

-- ── 3. register_session_member — accepte pre_voting + code ───

CREATE OR REPLACE FUNCTION register_session_member(
  p_session_id   uuid,
  p_pseudo       text,
  p_reclaim_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_phase  text;
  v_member session_members%ROWTYPE;
  v_attending boolean;
  v_code_hash text;
BEGIN
  SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;
  IF v_phase NOT IN ('draft', 'pre_voting', 'voting') THEN
    RAISE EXCEPTION 'La séance n''est pas en phase d''inscription (phase: %)', v_phase;
  END IF;

  -- En pré-vote : attending = false ; en vote ou draft : attending = true
  v_attending := v_phase != 'pre_voting';

  -- Hash du code de rappel s'il est fourni
  IF p_reclaim_code IS NOT NULL AND v_phase = 'pre_voting' THEN
    v_code_hash := crypt(p_reclaim_code, gen_salt('bf'));
  END IF;

  -- ON CONFLICT user : retourner l'existant (ne pas écraser joined_phase)
  BEGIN
    INSERT INTO session_members(session_id, user_id, pseudo, joined_phase, attending_in_person, reclaim_code_hash)
    VALUES (p_session_id, auth.uid(), p_pseudo, v_phase, v_attending, v_code_hash)
    ON CONFLICT (session_id, user_id) DO UPDATE SET pseudo = session_members.pseudo
    RETURNING * INTO v_member;
  EXCEPTION WHEN unique_violation THEN
    -- Conflit sur (session_id, pseudo) — pseudo déjà pris par quelqu'un d'autre
    RAISE EXCEPTION 'Pseudo déjà pris';
  END;

  RETURN to_jsonb(v_member);
END;
$$;

-- ── 4. confirm_attendance ────────────────────────────────────
-- Confirme la présence présentielle d'un membre.
-- Si le pseudo est trouvé → reclaim (transfer user_id) + attending = true.
-- Si le pseudo est inconnu → crée un nouveau membre attending = true.
-- Si le caller a déjà un autre membre → marque ce membre attending.

CREATE OR REPLACE FUNCTION confirm_attendance(
  p_session_id   uuid,
  p_pseudo       text,
  p_reclaim_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller        uuid := auth.uid();
  v_target        session_members%ROWTYPE;
  v_caller_member session_members%ROWTYPE;
BEGIN
  -- Cherche si le caller a déjà un membre dans cette session
  SELECT * INTO v_caller_member
  FROM session_members
  WHERE session_id = p_session_id AND user_id = v_caller;

  -- Cherche le membre existant avec ce pseudo
  SELECT * INTO v_target
  FROM session_members
  WHERE session_id = p_session_id AND pseudo = p_pseudo;

  IF NOT FOUND THEN
    -- Pseudo inconnu
    IF v_caller_member.id IS NOT NULL THEN
      -- Caller déjà inscrit sous un autre pseudo → marque simplement attending
      UPDATE session_members
      SET attending_in_person = true
      WHERE id = v_caller_member.id
      RETURNING * INTO v_caller_member;
      RETURN to_jsonb(v_caller_member);
    ELSE
      -- Nouveau membre en présentiel
      INSERT INTO session_members(session_id, user_id, pseudo, attending_in_person, joined_phase)
      VALUES (p_session_id, v_caller, p_pseudo, true, 'voting')
      RETURNING * INTO v_target;
      RETURN to_jsonb(v_target);
    END IF;
  END IF;

  -- Pseudo trouvé
  IF v_target.user_id = v_caller THEN
    -- Le caller est déjà propriétaire → juste marquer attending
    UPDATE session_members
    SET attending_in_person = true
    WHERE id = v_target.id
    RETURNING * INTO v_target;
    RETURN to_jsonb(v_target);
  END IF;

  -- Pseudo appartient à quelqu'un d'autre
  IF v_caller_member.id IS NOT NULL THEN
    -- Caller a déjà un autre membre → impossible de reclaimer, marquer son membre attending
    UPDATE session_members
    SET attending_in_person = true
    WHERE id = v_caller_member.id
    RETURNING * INTO v_caller_member;
    RETURN to_jsonb(v_caller_member);
  END IF;

  -- Reclaim : transférer user_id vers le caller + attending = true
  UPDATE session_members
  SET user_id = v_caller,
      attending_in_person = true
  WHERE id = v_target.id
  RETURNING * INTO v_target;
  RETURN to_jsonb(v_target);
END;
$$;

-- ── 5. set_session_phase — autoriser pre_voting ───────────────

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
  IF p_phase NOT IN ('draft', 'pre_voting', 'voting', 'allocating', 'debating', 'questionnaire', 'closed') THEN
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

  RETURN to_jsonb(v_row);
END;
$$;

-- ── 6. run_clustering_v1 — filtre attending_in_person ─────────

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
  v_hash        text;
  v_members     uuid[];
  v_count       int;
  v_table_count int;
  v_phys_count  int;
  v_i           int;
  v_table_num   int;
  v_phys_table  record;
  v_grp_num     int;
BEGIN
  SELECT value INTO v_hash FROM app_config WHERE key = 'superadmin_code_hash';
  IF NOT crypt(p_password, v_hash) = v_hash THEN
    RAISE EXCEPTION 'Mot de passe superadmin incorrect';
  END IF;

  -- Uniquement les membres présents en présentiel
  SELECT ARRAY(
    SELECT id FROM session_members
    WHERE session_id = p_session_id
      AND attending_in_person = true
    ORDER BY random()
  ) INTO v_members;

  v_count := array_length(v_members, 1);
  IF v_count IS NULL OR v_count = 0 THEN
    RAISE EXCEPTION 'Aucun membre présent en présentiel pour cette séance';
  END IF;

  v_table_count := CEIL(v_count::float / p_target_size);

  SELECT COUNT(*) INTO v_phys_count FROM tables WHERE session_id = p_session_id;
  IF v_phys_count < v_table_count THEN
    RAISE EXCEPTION 'Pas assez de tables rattachées : % disponible(s), % nécessaire(s) pour % participants avec une taille cible de %',
      v_phys_count, v_table_count, v_count, p_target_size;
  END IF;

  DELETE FROM table_assignments WHERE session_id = p_session_id;

  FOR v_i IN 1..v_count LOOP
    v_table_num := ((v_i - 1) % v_table_count) + 1;
    INSERT INTO table_assignments(session_id, member_id, table_number)
    VALUES (p_session_id, v_members[v_i], v_table_num);
  END LOOP;

  v_grp_num := 1;
  FOR v_phys_table IN
    SELECT id FROM tables
    WHERE session_id = p_session_id
    ORDER BY join_code
  LOOP
    EXIT WHEN v_grp_num > v_table_count;
    UPDATE table_assignments
    SET table_id = v_phys_table.id
    WHERE session_id = p_session_id
      AND table_number = v_grp_num;
    v_grp_num := v_grp_num + 1;
  END LOOP;

  UPDATE sessions
  SET phase = 'allocating', phase_changed_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object('table_count', v_table_count, 'member_count', v_count);
END;
$$;

-- ── 7. run_clustering_v2 — filtre attending_in_person ─────────

CREATE OR REPLACE FUNCTION run_clustering_v2(
  p_password    text,
  p_session_id  uuid,
  p_target_size int DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_analysis_id   uuid;
  v_member_count  int;
  v_n_tables      int;
  v_phys_count    int;
  v_grp_num       int;
  v_phys_table    record;
BEGIN
  PERFORM check_superadmin_password(p_password);

  SELECT id INTO v_analysis_id
  FROM session_analysis
  WHERE session_id = p_session_id
    AND status = 'done'
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lancez d''abord l''analyse des camps avant de déclencher le clustering hétérogène.';
  END IF;

  -- Nombre total de membres présents en présentiel
  SELECT COUNT(*) INTO v_member_count
  FROM session_members
  WHERE session_id = p_session_id
    AND attending_in_person = true;

  IF v_member_count = 0 THEN
    RAISE EXCEPTION 'Aucun membre présent en présentiel pour cette séance.';
  END IF;

  v_n_tables := CEIL(v_member_count::float / p_target_size);

  SELECT COUNT(*) INTO v_phys_count
  FROM tables
  WHERE session_id = p_session_id;

  IF v_phys_count < v_n_tables THEN
    RAISE EXCEPTION 'Pas assez de tables rattachées : % disponible(s), % nécessaire(s) pour % participants avec une taille cible de %',
      v_phys_count, v_n_tables, v_member_count, p_target_size;
  END IF;

  DELETE FROM table_assignments WHERE session_id = p_session_id;

  -- Membres analysés ET présents : distribution hétérogène round-robin par camp
  INSERT INTO table_assignments(session_id, member_id, table_number)
  SELECT
    p_session_id,
    sm.id,
    ((ROW_NUMBER() OVER (ORDER BY am.group_id, random()) - 1) % v_n_tables) + 1
  FROM analysis_members am
  JOIN session_members sm
    ON sm.id = am.member_id
   AND sm.session_id = p_session_id
   AND sm.attending_in_person = true
  WHERE am.analysis_id = v_analysis_id;

  -- Présents sans votes : distribution aléatoire
  INSERT INTO table_assignments(session_id, member_id, table_number)
  SELECT
    p_session_id,
    sm.id,
    ((ROW_NUMBER() OVER (ORDER BY random()) - 1) % v_n_tables) + 1
  FROM session_members sm
  WHERE sm.session_id = p_session_id
    AND sm.attending_in_person = true
    AND NOT EXISTS (
      SELECT 1 FROM analysis_members am
      WHERE am.member_id = sm.id
        AND am.analysis_id = v_analysis_id
    );

  v_grp_num := 1;
  FOR v_phys_table IN
    SELECT id FROM tables
    WHERE session_id = p_session_id
    ORDER BY join_code
  LOOP
    EXIT WHEN v_grp_num > v_n_tables;
    UPDATE table_assignments
    SET table_id = v_phys_table.id
    WHERE session_id = p_session_id
      AND table_number = v_grp_num;
    v_grp_num := v_grp_num + 1;
  END LOOP;

  UPDATE sessions
  SET phase = 'allocating', phase_changed_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object('table_count', v_n_tables, 'member_count', v_member_count);
END;
$$;

-- ── 8. get_all_votes_for_analysis — inclut attending + filtre ─

CREATE OR REPLACE FUNCTION get_all_votes_for_analysis(
  p_password      text,
  p_session_id    uuid,
  p_attending_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM check_superadmin_password(p_password);

  SELECT jsonb_agg(jsonb_build_object(
    'member_id',           av.member_id,
    'assertion_id',        av.assertion_id,
    'vote',                av.vote,
    'attending_in_person', sm.attending_in_person
  )) INTO v_result
  FROM assertion_votes av
  JOIN assertions a  ON a.id  = av.assertion_id
  JOIN session_members sm ON sm.id = av.member_id
  WHERE av.session_id = p_session_id
    AND a.status = 'approved'
    AND (NOT p_attending_only OR sm.attending_in_person = true);

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- ── 9. get_session_voting_stats — ajoute attending/remote ─────

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
  v_attending_count    int;
  v_remote_count       int;
  v_onboarded_count    int;
  v_voter_count        int;
  v_approved_count     int;
  v_total_votes        int;
BEGIN
  SELECT value INTO v_hash FROM app_config WHERE key = 'superadmin_code_hash';
  IF NOT crypt(p_password, v_hash) = v_hash THEN
    RAISE EXCEPTION 'Mot de passe superadmin incorrect';
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE attending_in_person = true),
    COUNT(*) FILTER (WHERE attending_in_person = false)
  INTO v_member_count, v_attending_count, v_remote_count
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
    'member_count',       v_member_count,
    'attending_count',    v_attending_count,
    'remote_count',       v_remote_count,
    'onboarded_count',    v_onboarded_count,
    'voter_count',        v_voter_count,
    'approved_assertion_count', v_approved_count,
    'total_votes',        v_total_votes
  );
END;
$$;
