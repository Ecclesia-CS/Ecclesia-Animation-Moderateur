-- ============================================================
-- Superadmin : récupération des tours de parole d'une table
-- + mise à jour de get_table_participants pour exposer participant_id
-- ============================================================

-- ── 1. get_table_speaking_turns_admin ────────────────────────

DROP FUNCTION IF EXISTS get_table_speaking_turns_admin(text, uuid);

CREATE OR REPLACE FUNCTION get_table_speaking_turns_admin(
  p_password text,
  p_table_id uuid
)
RETURNS TABLE (
  id             uuid,
  participant_id uuid,
  started_at     timestamptz,
  ended_at       timestamptz,
  source         text
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM check_superadmin_password(p_password);
  RETURN QUERY
    SELECT st.id, st.participant_id, st.started_at, st.ended_at, st.source::text
    FROM speaking_turns st
    WHERE st.table_id = p_table_id
    ORDER BY st.started_at;
END;
$$;

-- ── 2. get_table_participants — ajout de participant_id ───────

DROP FUNCTION IF EXISTS get_table_participants(text, uuid);

CREATE OR REPLACE FUNCTION get_table_participants(
  p_password text,
  p_table_id uuid
)
RETURNS TABLE (
  participant_id      uuid,
  pseudo              text,
  total_ms            bigint,
  turn_count          bigint,
  is_current_speaker  boolean
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_current_speaker uuid;
BEGIN
  PERFORM check_superadmin_password(p_password);

  SELECT current_speaker_id INTO v_current_speaker
  FROM tables WHERE id = p_table_id;

  RETURN QUERY
  SELECT
    p.id AS participant_id,
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
