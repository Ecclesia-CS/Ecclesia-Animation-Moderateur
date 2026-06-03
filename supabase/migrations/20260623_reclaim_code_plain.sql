-- =============================================================
-- reclaim_code_plain :
-- Remplace reclaim_code_hash (bcrypt, non cherchable) par
-- reclaim_code (texte clair) pour permettre la recherche par code.
-- Le code est un PIN 4 chiffres, sans PII, à durée de vie courte.
-- =============================================================

ALTER TABLE session_members DROP COLUMN IF EXISTS reclaim_code_hash;
ALTER TABLE session_members ADD COLUMN IF NOT EXISTS reclaim_code text;

-- ── register_session_member — stocke le code en clair ─────────

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
  v_phase     text;
  v_member    session_members%ROWTYPE;
  v_attending boolean;
BEGIN
  SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;
  IF v_phase NOT IN ('draft', 'pre_voting', 'voting') THEN
    RAISE EXCEPTION 'La séance n''est pas en phase d''inscription (phase: %)', v_phase;
  END IF;

  v_attending := v_phase != 'pre_voting';

  BEGIN
    INSERT INTO session_members(session_id, user_id, pseudo, joined_phase, attending_in_person, reclaim_code)
    VALUES (p_session_id, auth.uid(), p_pseudo, v_phase, v_attending,
            CASE WHEN v_phase = 'pre_voting' THEN p_reclaim_code ELSE NULL END)
    ON CONFLICT (session_id, user_id) DO UPDATE SET pseudo = session_members.pseudo
    RETURNING * INTO v_member;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Pseudo déjà pris';
  END;

  RETURN to_jsonb(v_member);
END;
$$;

-- ── confirm_attendance — pseudo OU code, l'un suffit ──────────
-- Trois cas :
--   1. Caller a déjà un membre dans la session → marquer attending
--   2. p_code fourni → cherche par reclaim_code = p_code
--   3. p_pseudo fourni → cherche par pseudo

CREATE OR REPLACE FUNCTION confirm_attendance(
  p_session_id uuid,
  p_pseudo     text DEFAULT NULL,
  p_code       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller        uuid := auth.uid();
  v_target        session_members%ROWTYPE;
  v_caller_member session_members%ROWTYPE;
BEGIN
  -- Cas 1 : le caller a déjà un membre dans cette session
  SELECT * INTO v_caller_member
  FROM session_members
  WHERE session_id = p_session_id AND user_id = v_caller;

  IF v_caller_member.id IS NOT NULL THEN
    UPDATE session_members
    SET attending_in_person = true
    WHERE id = v_caller_member.id
    RETURNING * INTO v_caller_member;
    RETURN to_jsonb(v_caller_member);
  END IF;

  -- Cas 2 : recherche par code
  IF p_code IS NOT NULL THEN
    SELECT * INTO v_target
    FROM session_members
    WHERE session_id = p_session_id AND reclaim_code = p_code;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Code de rappel invalide';
    END IF;

    UPDATE session_members
    SET user_id = v_caller, attending_in_person = true
    WHERE id = v_target.id
    RETURNING * INTO v_target;
    RETURN to_jsonb(v_target);
  END IF;

  -- Cas 3 : recherche par pseudo
  IF p_pseudo IS NOT NULL THEN
    SELECT * INTO v_target
    FROM session_members
    WHERE session_id = p_session_id AND pseudo = p_pseudo;

    IF NOT FOUND THEN
      -- Pseudo inconnu → créer un nouveau membre attending
      INSERT INTO session_members(session_id, user_id, pseudo, attending_in_person, joined_phase)
      VALUES (p_session_id, v_caller, p_pseudo, true, 'voting')
      RETURNING * INTO v_target;
      RETURN to_jsonb(v_target);
    END IF;

    -- Pseudo trouvé → reclaim
    UPDATE session_members
    SET user_id = v_caller, attending_in_person = true
    WHERE id = v_target.id
    RETURNING * INTO v_target;
    RETURN to_jsonb(v_target);
  END IF;

  RAISE EXCEPTION 'Fournir un pseudo ou un code de rappel';
END;
$$;
