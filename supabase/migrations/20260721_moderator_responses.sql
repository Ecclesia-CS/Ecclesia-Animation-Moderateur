-- =============================================================
-- Chantier 5 (E4) — Retour des réponses modérateur au superadmin
--
-- get_moderator_responses(password, session_id) : agrège la question
-- d'onboarding `moderator_pref` (« Tiens-tu à être avec un modérateur ? »,
-- D18 / chantier-2) pour le superadmin.
--
-- Renvoie :
--   aggregate : { want_count, dont_want_count, onboarded_count, attending_count }
--               (calculé sur les membres présentiels ayant complété l'onboarding)
--   per_table : [ { table_number, member_count, want_count, no_answer_count,
--                   table_leaderless, join_code } ]
--               (rempli une fois l'allocation faite — sinon tableau vide)
--
-- Lecture seule. SECURITY DEFINER + mot de passe superadmin (bypass RLS
-- owner-only de entry_responses).
-- =============================================================

CREATE OR REPLACE FUNCTION get_moderator_responses(
  p_password   text,
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_aggregate jsonb;
  v_per_table jsonb;
BEGIN
  PERFORM check_superadmin_password(p_password);

  -- Agrégat : membres présentiels ayant complété l'onboarding
  SELECT jsonb_build_object(
    'want_count',      COUNT(*) FILTER (WHERE er.moderator_pref = true),
    'dont_want_count', COUNT(*) FILTER (WHERE er.moderator_pref = false),
    'onboarded_count', COUNT(*),
    'attending_count', (
      SELECT COUNT(*) FROM session_members sm2
      WHERE sm2.session_id = p_session_id
        AND sm2.attending_in_person = true
    )
  ) INTO v_aggregate
  FROM entry_responses er
  JOIN session_members sm
    ON sm.id = er.member_id
   AND sm.attending_in_person = true
  WHERE er.session_id = p_session_id;

  -- Demande de modérateur par table (si allocation faite)
  SELECT jsonb_agg(row_to_json(t) ORDER BY t.table_number) INTO v_per_table
  FROM (
    SELECT
      ta.table_number,
      COUNT(*)                                             AS member_count,
      COUNT(*) FILTER (WHERE er.moderator_pref = true)     AS want_count,
      COUNT(*) FILTER (WHERE er.moderator_pref IS NULL)    AS no_answer_count,
      bool_or(tb.leaderless) FILTER (WHERE tb.id IS NOT NULL) AS table_leaderless,
      MAX(tb.join_code)                                    AS join_code
    FROM table_assignments ta
    LEFT JOIN entry_responses er
      ON er.member_id = ta.member_id
     AND er.session_id = p_session_id
    LEFT JOIN tables tb
      ON tb.id = ta.table_id
    WHERE ta.session_id = p_session_id
    GROUP BY ta.table_number
  ) t;

  RETURN jsonb_build_object(
    'aggregate', COALESCE(v_aggregate, jsonb_build_object(
      'want_count', 0, 'dont_want_count', 0,
      'onboarded_count', 0, 'attending_count', 0
    )),
    'per_table', COALESCE(v_per_table, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_moderator_responses(text, uuid) TO anon, authenticated;
