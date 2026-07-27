-- =============================================================
-- Chantier 20 (G7) — Vue modérateur : composition idéologique de sa table
-- + assertions représentatives par camp + assertions clivantes/consensuelles
-- AU SEIN de sa table.
--
-- Réf. docs/VAGUE3-amendements-allocation.md, section
-- « Vue modérateur — conscience idéologique ».
--
-- RPC accessible à tout participant de la table (pas de mot de passe —
-- même modèle d'auth que get_results_map : vérifie is_table_participant()),
-- et fonctionne PENDANT le débat (contrairement à get_results_map, qui
-- exige session 'closed' — ici la séance est en phase `debating`).
--
-- ⚠️ Limite connue, documentée dans A_VERIFIER.md : le nom de camp Gemini
-- (sessions.group_names) est indexé par table_number PHYSIQUE. Sous
-- l'allocation v2 (chantier 19), une table physique est volontairement
-- hétérogène (plusieurs camps d'opinion y siègent par construction), donc
-- ce nom ne correspond pas forcément au camp d'opinion pur (group_id
-- k-means) retourné ici. Le nom Gemini n'est donc qu'une décoration
-- best-effort (peut être absent ou non pertinent) — les comptages par
-- camp restent exacts car basés sur analysis_members.group_id, propriété
-- individuelle indépendante de ce nommage.
-- =============================================================

CREATE OR REPLACE FUNCTION get_table_opinion_summary(p_table_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session_id   uuid;
  v_table_number int;
  v_analysis     session_analysis%ROWTYPE;
  v_group_names  jsonb;
  v_camps        jsonb := '[]'::jsonb;
  v_votes        jsonb;
  v_member_count int;
BEGIN
  -- Sécurité : l'appelant doit être participant de cette table (même
  -- helper RLS anti-récursion que le reste de l'app).
  IF NOT is_table_participant(p_table_id) THEN
    RETURN NULL;
  END IF;

  SELECT session_id INTO v_session_id FROM tables WHERE id = p_table_id;
  IF v_session_id IS NULL THEN RETURN NULL; END IF;

  SELECT table_number INTO v_table_number
  FROM table_assignments
  WHERE table_id = p_table_id
  LIMIT 1;

  -- Table non issue de l'allocation (ex. table leaderless créée à la main,
  -- retardataire) : pas de table_assignments, donc pas de données d'opinion.
  IF v_table_number IS NULL THEN
    RETURN jsonb_build_object(
      'session_id',         v_session_id,
      'table_number',       NULL,
      'opinions_available', false,
      'camps',              '[]'::jsonb,
      'votes',              '[]'::jsonb
    );
  END IF;

  SELECT * INTO v_analysis
  FROM session_analysis
  WHERE session_id = v_session_id AND status = 'done'
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT group_names INTO v_group_names FROM sessions WHERE id = v_session_id;

  IF v_analysis.id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'group_id',    camp.group_id,
      'count',       camp.cnt,
      'name',        gn.name,
      'description', gn.description,
      'top_assertions', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object('content', a.content, 'score', rep.score)
          ORDER BY rep.score DESC
        ), '[]'::jsonb)
        FROM (
          SELECT key::uuid AS assertion_id, (value->>(camp.group_id::text))::float AS score
          FROM jsonb_each(v_analysis.repness)
          WHERE value ? camp.group_id::text
          ORDER BY (value->>(camp.group_id::text))::float DESC
          LIMIT 3
        ) rep
        JOIN assertions a ON a.id = rep.assertion_id
      )
    ) ORDER BY camp.group_id), '[]'::jsonb)
    INTO v_camps
    FROM (
      SELECT am.group_id, count(*) AS cnt
      FROM analysis_members am
      JOIN table_assignments ta ON ta.member_id = am.member_id
      WHERE am.analysis_id = v_analysis.id
        AND ta.session_id = v_session_id
        AND ta.table_number = v_table_number
      GROUP BY am.group_id
    ) camp
    LEFT JOIN LATERAL (
      SELECT (elem->>'name') AS name, (elem->>'description') AS description
      FROM jsonb_array_elements(COALESCE(v_group_names, '[]'::jsonb)) elem
      WHERE (elem->>'table_number')::int = camp.group_id + 1
      LIMIT 1
    ) gn ON true;
  END IF;

  SELECT count(*) INTO v_member_count
  FROM table_assignments
  WHERE session_id = v_session_id AND table_number = v_table_number;

  -- Assertions clivantes/consensuelles AU SEIN de cette table : même formule
  -- que get_vote_results (consensus_score = one-sidedness × participation),
  -- mais votes et dénominateur restreints aux membres de cette table.
  SELECT COALESCE(jsonb_agg(r ORDER BY r.consensus_score DESC NULLS LAST), '[]'::jsonb) INTO v_votes
  FROM (
    SELECT
      a.id,
      a.content,
      a.status,
      COUNT(av.id) FILTER (WHERE av.vote = 'agree')    AS agree_count,
      COUNT(av.id) FILTER (WHERE av.vote = 'disagree') AS disagree_count,
      COUNT(av.id) FILTER (WHERE av.vote = 'pass')     AS pass_count,
      COUNT(av.id)                                      AS total_votes,
      ROUND(
        (
          (ABS(
            COUNT(av.id) FILTER (WHERE av.vote = 'agree') -
            COUNT(av.id) FILTER (WHERE av.vote = 'disagree')
          )::float / NULLIF(
            COUNT(av.id) FILTER (WHERE av.vote = 'agree') +
            COUNT(av.id) FILTER (WHERE av.vote = 'disagree'),
            0
          )) *
          (COUNT(av.id)::float / NULLIF(v_member_count, 0)) * 100
        )::numeric
      , 2) AS consensus_score
    FROM assertions a
    LEFT JOIN assertion_votes av
      ON av.assertion_id = a.id
     AND av.member_id IN (
       SELECT member_id FROM table_assignments
       WHERE session_id = v_session_id AND table_number = v_table_number
     )
    WHERE a.session_id = v_session_id AND a.status = 'approved'
    GROUP BY a.id, a.content, a.status
  ) r;

  RETURN jsonb_build_object(
    'session_id',         v_session_id,
    'table_number',       v_table_number,
    'opinions_available', (v_analysis.id IS NOT NULL),
    'camps',              v_camps,
    'votes',              v_votes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_table_opinion_summary(uuid) TO anon, authenticated;
