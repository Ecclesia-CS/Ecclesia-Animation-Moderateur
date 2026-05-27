-- ============================================================
-- Superadmin : détail d'une table + suppression admin
-- 1. get_table_participants(password, table_id)
--    Retourne les participants avec temps cumulé et nb de tours
-- 2. delete_table_admin(password, table_id)
--    Supprime la table (CASCADE participants, queue, turns)
-- ============================================================

-- ── 1. get_table_participants ─────────────────────────────────

DROP FUNCTION IF EXISTS get_table_participants(text, uuid);

CREATE OR REPLACE FUNCTION get_table_participants(
  p_password text,
  p_table_id uuid
)
RETURNS TABLE (
  pseudo              text,
  total_ms            bigint,
  turn_count          bigint,
  is_current_speaker  boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_speaker uuid;
BEGIN
  PERFORM check_superadmin_password(p_password);

  SELECT current_speaker_id INTO v_current_speaker
  FROM tables WHERE id = p_table_id;

  RETURN QUERY
  SELECT
    p.pseudo,
    COALESCE(
      SUM(
        EXTRACT(EPOCH FROM (st.ended_at - st.started_at)) * 1000
      )::bigint,
      0
    ) AS total_ms,
    COUNT(st.id) AS turn_count,
    (p.id = v_current_speaker) AS is_current_speaker
  FROM participants p
  LEFT JOIN speaking_turns st
    ON st.participant_id = p.id
    AND st.table_id = p_table_id
    AND st.ended_at IS NOT NULL
  WHERE p.table_id = p_table_id
  GROUP BY p.id, p.pseudo, p.created_at
  ORDER BY total_ms DESC, p.created_at;
END;
$$;

-- ── 2. delete_table_admin ─────────────────────────────────────

DROP FUNCTION IF EXISTS delete_table_admin(text, uuid);

CREATE OR REPLACE FUNCTION delete_table_admin(
  p_password text,
  p_table_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM check_superadmin_password(p_password);
  DELETE FROM tables WHERE id = p_table_id;
END;
$$;
