-- =============================================================
-- Fix 1 : get_my_table_assignment — bypass RLS sur tables
--   La requête directe table_assignments + FK join tables échoue
--   en phase debating car le session_member n'est pas encore
--   participant de la table physique → RLS bloque la lecture
--   du join_code. Cette RPC SECURITY DEFINER contourne ce problème.
-- Fix 2 : exclure les membres "Animateur" (joined_phase='admin')
--   de list_session_members_admin.
-- =============================================================

-- ── 1. get_my_table_assignment ───────────────────────────────────
CREATE OR REPLACE FUNCTION get_my_table_assignment(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id',           ta.id,
    'session_id',   ta.session_id,
    'member_id',    ta.member_id,
    'table_number', ta.table_number,
    'table_id',     ta.table_id,
    'join_code',    t.join_code,
    'created_at',   ta.created_at
  )
  INTO v_result
  FROM table_assignments ta
  LEFT JOIN tables t ON t.id = ta.table_id
  JOIN session_members sm ON sm.id = ta.member_id
  WHERE ta.session_id = p_session_id
    AND sm.user_id = auth.uid()
  LIMIT 1;

  RETURN v_result;
END;
$$;

-- ── 2. list_session_members_admin — filtrer les membres admin ────
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
      AND sm.joined_phase IS DISTINCT FROM 'admin'
  ) r;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
