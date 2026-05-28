-- ============================================================
-- Superadmin : comptage des tables par séance (bypass RLS)
-- ============================================================

DROP FUNCTION IF EXISTS get_session_table_counts(text);

CREATE OR REPLACE FUNCTION get_session_table_counts(p_password text)
RETURNS TABLE (session_id uuid, cnt bigint)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM check_superadmin_password(p_password);
  RETURN QUERY
    SELECT t.session_id, COUNT(*)::bigint
    FROM tables t
    WHERE t.session_id IS NOT NULL
    GROUP BY t.session_id;
END;
$$;
