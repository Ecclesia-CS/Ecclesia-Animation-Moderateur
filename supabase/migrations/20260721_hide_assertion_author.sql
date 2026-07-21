-- =============================================================
-- E2 — Masquer qui a soumis quelle assertion (vue superadmin)
-- list_assertions_admin ne renvoie plus member_pseudo (ni member_id,
-- qui permettrait de retrouver le pseudo via list_session_members_admin).
-- =============================================================

CREATE OR REPLACE FUNCTION list_assertions_admin(
  p_password   text,
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM check_superadmin_password(p_password);

  SELECT jsonb_agg(r ORDER BY r.created_at ASC) INTO v_result
  FROM (
    SELECT
      a.id,
      a.session_id,
      a.content,
      a.status,
      a.created_at
    FROM assertions a
    WHERE a.session_id = p_session_id
  ) r;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
