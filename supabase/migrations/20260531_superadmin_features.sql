-- =============================================================
-- Superadmin features
-- 1. joined_phase sur session_members + update register_session_member
-- 2. list_session_members_admin
-- 3. admin_submit_assertion
-- 4. admin_create_table
-- =============================================================

-- ── 1. joined_phase sur session_members ─────────────────────────
ALTER TABLE session_members
  ADD COLUMN IF NOT EXISTS joined_phase text;

-- Remplacer register_session_member pour capturer la phase au moment de l'inscription
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

  -- ON CONFLICT user: retourner l'existant (ne pas écraser joined_phase)
  BEGIN
    INSERT INTO session_members(session_id, user_id, pseudo, joined_phase)
    VALUES (p_session_id, auth.uid(), p_pseudo, v_phase)
    ON CONFLICT (session_id, user_id) DO UPDATE SET pseudo = session_members.pseudo
    RETURNING * INTO v_member;
  EXCEPTION WHEN unique_violation THEN
    -- Conflit sur (session_id, pseudo) — le pseudo est déjà pris par quelqu'un d'autre
    RAISE EXCEPTION 'Pseudo déjà pris';
  END;

  RETURN to_jsonb(v_member);
END;
$$;

-- ── 2. list_session_members_admin ────────────────────────────────
CREATE OR REPLACE FUNCTION list_session_members_admin(
  p_password   text,
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM check_superadmin_password(p_password);

  SELECT jsonb_agg(r ORDER BY r.created_at ASC) INTO v_result
  FROM (
    SELECT
      sm.id,
      sm.pseudo,
      sm.created_at,
      sm.joined_phase,
      (er.id IS NOT NULL) AS has_entry_response,
      EXISTS (
        SELECT 1 FROM assertion_votes av
        WHERE av.member_id = sm.id
      ) AS has_voted
    FROM session_members sm
    LEFT JOIN entry_responses er
      ON er.member_id = sm.id AND er.session_id = p_session_id
    WHERE sm.session_id = p_session_id
  ) r;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- ── 3. admin_submit_assertion ────────────────────────────────────
-- Crée une assertion directement approuvée au nom de l'animateur.
-- Upsert d'un session_member "Animateur" pour le user courant.
CREATE OR REPLACE FUNCTION admin_submit_assertion(
  p_password   text,
  p_session_id uuid,
  p_content    text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_member_id uuid;
  v_assertion assertions%ROWTYPE;
BEGIN
  PERFORM check_superadmin_password(p_password);

  -- Récupérer ou créer un membre admin pour cette session
  SELECT id INTO v_member_id
  FROM session_members
  WHERE session_id = p_session_id AND user_id = auth.uid()
  LIMIT 1;

  IF v_member_id IS NULL THEN
    -- Essayer d'insérer avec pseudo 'Animateur'
    BEGIN
      INSERT INTO session_members(session_id, user_id, pseudo, joined_phase)
      VALUES (p_session_id, auth.uid(), 'Animateur', 'admin')
      RETURNING id INTO v_member_id;
    EXCEPTION WHEN unique_violation THEN
      -- Pseudo 'Animateur' déjà pris par quelqu'un d'autre, utiliser un pseudo unique
      INSERT INTO session_members(session_id, user_id, pseudo, joined_phase)
      VALUES (p_session_id, auth.uid(),
        'Animateur-' || upper(encode(gen_random_bytes(2), 'hex')),
        'admin')
      RETURNING id INTO v_member_id;
    END;
  END IF;

  INSERT INTO assertions(session_id, member_id, content, status)
  VALUES (p_session_id, v_member_id, p_content, 'approved')
  RETURNING * INTO v_assertion;

  RETURN to_jsonb(v_assertion);
END;
$$;

-- ── 4. admin_create_table ────────────────────────────────────────
-- Crée une table depuis le panneau superadmin sans code de création.
-- Le modérateur pourra reprendre la main via reclaim_moderator(join_code, creation_code, pseudo).
CREATE OR REPLACE FUNCTION admin_create_table(
  p_password   text,
  p_session_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_join_code text;
  v_table_id  uuid;
BEGIN
  PERFORM check_superadmin_password(p_password);

  -- Générer un join_code unique à 6 caractères hex
  LOOP
    v_join_code := upper(encode(gen_random_bytes(3), 'hex'));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM tables WHERE join_code = v_join_code);
  END LOOP;

  INSERT INTO tables (join_code, created_by, session_id)
  VALUES (v_join_code, auth.uid(), p_session_id)
  RETURNING id INTO v_table_id;

  RETURN jsonb_build_object('table_id', v_table_id, 'join_code', v_join_code);
END;
$$;
