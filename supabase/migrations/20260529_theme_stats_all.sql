-- Statistiques de thèmes agrégées sur toutes les séances
DROP FUNCTION IF EXISTS get_theme_stats_all(text);

CREATE OR REPLACE FUNCTION get_theme_stats_all(p_password text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_results jsonb;
BEGIN
  PERFORM check_superadmin_password(p_password);

  SELECT jsonb_agg(
    jsonb_build_object('theme', t.theme, 'avg', t.avg, 'count', t.cnt)
    ORDER BY t.avg DESC
  )
  INTO v_results
  FROM (
    SELECT
      kv.key                          AS theme,
      ROUND(AVG(kv.value::numeric), 2) AS avg,
      COUNT(*)::int                   AS cnt
    FROM questionnaire_responses qr,
         jsonb_each_text(qr.theme_ratings) AS kv
    WHERE qr.theme_ratings IS NOT NULL
      AND qr.theme_ratings != '{}'::jsonb
      AND kv.value ~ '^[0-9]+(\.[0-9]+)?$'
    GROUP BY kv.key
  ) t;

  RETURN COALESCE(v_results, '[]'::jsonb);
END;
$$;
