-- Chantier 134b — mode sondage (sessions.session_type = 'poll').
--
-- 1. get_results_map : la carte des camps s'ouvre aussi PENDANT le vote d'un
--    sondage (phase 'pre_voting'), décision de Jules du 2026-09-26 (« pas de
--    problème de polarisation pendant le vote »). Séance complète inchangée
--    (toujours 'closed' seulement). Corps repris de pg_get_functiondef au
--    2026-09-26 ; seule la garde de phase change, et search_path est figé.
-- 2. create_session : un sondage naît avec results_public = true — Jules veut
--    qu'il rejoigne les séances consultables par tous à la clôture. Le
--    superadmin garde la bascule (set_session_results_public) pour l'en retirer.
--    Même signature que 134a : CREATE OR REPLACE, droits conservés.
--
-- Note : une session de synchronisation dev/prod avait reconstitué ce fichier
-- depuis la base dev (commit 73298a1) avant qu'il ne soit poussé ; SQL
-- identique, cette version d'origine (commentée) le remplace au merge.

-- ── 1. get_results_map ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_results_map(p_session_id uuid, p_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_analysis session_analysis%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM sessions
    WHERE id = p_session_id
      AND (phase = 'closed' OR (session_type = 'poll' AND phase = 'pre_voting'))
  ) THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM session_members
    WHERE id = p_member_id AND user_id = auth.uid()
  ) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_analysis
  FROM session_analysis
  WHERE session_id = p_session_id
    AND status = 'done'
    AND vote_scope = 'current'
  ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'k_chosen', v_analysis.k_chosen,
    'points', (
      SELECT jsonb_agg(jsonb_build_object(
        'pca_x',    am.pca_x,
        'pca_y',    am.pca_y,
        'group_id', am.group_id,
        'is_self',  (am.member_id = p_member_id)
      ))
      FROM analysis_members am
      WHERE am.analysis_id = v_analysis.id
    ),
    'consensus', (
      SELECT jsonb_agg(
        jsonb_build_object('content', a.content, 'score', gc.score)
        ORDER BY gc.score DESC
      )
      FROM (
        SELECT key::uuid AS assertion_id, value::float AS score
        FROM jsonb_each_text(v_analysis.group_consensus)
        WHERE value::float > 0.5
      ) gc
      JOIN assertions a ON a.id = gc.assertion_id
    ),
    'repness',         v_analysis.repness,
    'group_consensus', v_analysis.group_consensus,
    'all_assertions', (
      SELECT jsonb_object_agg(a.id::text, a.content)
      FROM assertions a
      WHERE a.session_id = p_session_id
        AND a.status = 'approved'
    )
  );
END;
$function$;

-- ── 2. create_session ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_session(
  p_password           text,
  p_title              text,
  p_description        text        DEFAULT NULL,
  p_scheduled_at       timestamptz DEFAULT NULL,
  p_doc_info_url       text        DEFAULT NULL,
  p_doc_summary_url    text        DEFAULT NULL,
  p_doc_collab_url     text        DEFAULT NULL,
  p_onboarding_enabled boolean     DEFAULT true,
  p_session_type       text        DEFAULT 'full'
)
RETURNS sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_session sessions;
BEGIN
  PERFORM check_superadmin_password(p_password);

  IF p_session_type NOT IN ('full', 'debate', 'poll') THEN
    RAISE EXCEPTION 'Type de séance invalide: %', p_session_type;
  END IF;

  INSERT INTO sessions (title, description, scheduled_at, join_code,
                        doc_info_url, doc_summary_url, doc_collab_url,
                        onboarding_enabled, session_type, results_public)
  VALUES (p_title, p_description, p_scheduled_at, generate_session_join_code(),
          p_doc_info_url, p_doc_summary_url, p_doc_collab_url,
          -- Un débat simple n'a pas de phase de vote : l'onboarding (questionnaire
          -- d'entrée avant le vote) n'a rien à précéder.
          CASE WHEN p_session_type = 'debate' THEN false ELSE p_onboarding_enabled END,
          p_session_type,
          p_session_type = 'poll')
  RETURNING * INTO v_session;

  -- Débat simple : une seule table par défaut, animée (pas leaderless) et en
  -- attente de son modérateur. Le superadmin peut en ajouter d'autres depuis
  -- l'onglet Tables (admin_create_session_table, chantier 95).
  IF p_session_type = 'debate' THEN
    PERFORM admin_create_session_table(p_password, v_session.id, false);
  END IF;

  RETURN v_session;
END;
$function$;
