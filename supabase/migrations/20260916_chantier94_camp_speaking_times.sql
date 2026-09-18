-- =============================================================
-- Chantier 94 — Vue modérateur : temps de parole cumulé par camp idéologique
--
-- Consigne de Jules (2026-09-16) : afficher au modérateur le temps de parole
-- cumulé par camp (clustering pol.is), avec floutage 5 min pour éviter la
-- désanonymisation d'un camp par l'observation d'une horloge qui bouge en
-- direct. Deux garde-fous complémentaires validés par Jules :
--   - ne rien afficher tant qu'un camp n'a pas au moins 2 personnes À LA TABLE
--     (même seuil et même sous-requête que get_table_opinion_summary,
--     chantier 20) ;
--   - n'afficher un camp qu'après un seuil de temps cumulé, pour éviter que
--     le tout premier tour de parole de la séance désigne son camp sans
--     ambiguïté (un seul tour = un seul locuteur = camp démasqué même avec
--     un floutage 5 min). Seuil retenu, sur confirmation explicite de Jules
--     le 16/09 : 300s (5 min) — aligné sur le floutage plutôt qu'une valeur
--     plus basse, pour la même marge de sécurité des deux côtés.
--
-- Le floutage 5 minutes lui-même n'est PAS géré ici : cette RPC renvoie
-- l'état exact au moment de l'appel (comme get_table_opinion_summary). C'est
-- le client qui ne rappelle cette RPC que toutes les 5 minutes (pattern
-- setInterval de AnalysisPanel.tsx) — aucune donnée plus fraîche n'est
-- exposée entre deux appels.
--
-- Ne jamais exposer la composition individuelle des camps : la RPC ne
-- renvoie que des durées déjà agrégées par group_id, jamais une ligne par
-- participant/membre.
--
-- Auth : is_table_moderator (pas is_table_participant comme le chantier 20)
-- — l'information est plus sensible qu'une simple composition (elle bouge en
-- direct pendant que le modérateur regarde), réservée à l'autorité
-- d'animation de la table.
--
-- Piège group_id / table_number : analysis_members.group_id (camp d'opinion
-- k-means, 0-indexé) n'a aucune correspondance garantie avec
-- table_assignments.table_number (table physique, 1-indexé) — le nom de
-- camp se cherche via group_id + 1 dans sessions.group_names, jamais via le
-- numéro de table (cf. CLAUDE.md, section « Ne jamais faire »).
-- =============================================================

CREATE OR REPLACE FUNCTION get_table_camp_speaking_times(p_table_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id     uuid;
  v_table_number   int;
  v_analysis       session_analysis%ROWTYPE;
  v_group_names    jsonb;
  v_camps          jsonb := '[]'::jsonb;
  v_min_members    constant int := 2;
  v_min_seconds    constant numeric := 300;
BEGIN
  IF NOT is_table_moderator(p_table_id) THEN
    RETURN NULL;
  END IF;

  SELECT session_id INTO v_session_id FROM tables WHERE id = p_table_id;
  IF v_session_id IS NULL THEN RETURN NULL; END IF;

  SELECT table_number INTO v_table_number
  FROM table_assignments
  WHERE table_id = p_table_id
  LIMIT 1;

  IF v_table_number IS NULL THEN
    RETURN jsonb_build_object(
      'session_id',         v_session_id,
      'table_number',       NULL,
      'opinions_available', false,
      'camps',              '[]'::jsonb
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
      'group_id', camp.group_id,
      'name',     gn.name,
      'seconds',  camp.total_seconds
    ) ORDER BY camp.group_id), '[]'::jsonb)
    INTO v_camps
    FROM (
      SELECT
        composition.group_id,
        COALESCE(speaking.total_seconds, 0) AS total_seconds
      FROM (
        -- Composition de la table par camp — même sous-requête que
        -- get_table_opinion_summary (chantier 20) : c'est ELLE qui porte le
        -- garde-fou "2 personnes minimum", indépendamment de qui a
        -- effectivement parlé.
        SELECT am.group_id, count(*) AS member_count
        FROM analysis_members am
        JOIN table_assignments ta ON ta.member_id = am.member_id
        WHERE am.analysis_id = v_analysis.id
          AND ta.session_id = v_session_id
          AND ta.table_number = v_table_number
        GROUP BY am.group_id
        HAVING count(*) >= v_min_members
      ) composition
      LEFT JOIN (
        -- Temps de parole cumulé par camp, à cette table. speaking_turns n'a
        -- pas de lien direct vers group_id : participant_id -> user_id ->
        -- session_members (LIMIT 1, un user_id peut avoir plusieurs lignes
        -- participants) -> table_assignments.member_id -> analysis_members.
        SELECT am.group_id, sum(
          EXTRACT(EPOCH FROM (COALESCE(st.ended_at, now()) - st.started_at))
        ) AS total_seconds
        FROM speaking_turns st
        JOIN participants p ON p.id = st.participant_id
        JOIN LATERAL (
          SELECT sm.id
          FROM session_members sm
          WHERE sm.session_id = v_session_id AND sm.user_id = p.user_id
          LIMIT 1
        ) sm ON true
        JOIN table_assignments ta ON ta.member_id = sm.id AND ta.session_id = v_session_id
        JOIN analysis_members am ON am.member_id = ta.member_id AND am.analysis_id = v_analysis.id
        WHERE st.table_id = p_table_id
        GROUP BY am.group_id
      ) speaking ON speaking.group_id = composition.group_id
      WHERE COALESCE(speaking.total_seconds, 0) >= v_min_seconds
    ) camp
    LEFT JOIN LATERAL (
      SELECT (elem->>'name') AS name
      FROM jsonb_array_elements(COALESCE(v_group_names, '[]'::jsonb)) elem
      WHERE (elem->>'table_number')::int = camp.group_id + 1
      LIMIT 1
    ) gn ON true;
  END IF;

  RETURN jsonb_build_object(
    'session_id',         v_session_id,
    'table_number',       v_table_number,
    'opinions_available', (v_analysis.id IS NOT NULL),
    'camps',              v_camps
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_table_camp_speaking_times(uuid) TO anon, authenticated;
