-- Chantier 80 — réserves sécurité sur get_public_results (résultats publics)
-- Jules, 07/09 : « il ne faut pas qu'on puisse remonter aux participants,
-- ou alors, il faut le rendre dur (et l'anonymat et changement de l'ordre
-- des points comme tu l'as écrit est largement suffisant) ».
--
-- Aucun identifiant ni pseudo ne sortait déjà de cette fonction (vérifié
-- contre pg_get_functiondef en base avant d'écrire cette migration).
-- Deux choses manquaient :
--   1. Les points du nuage étaient renvoyés dans l'ordre d'agrégation de
--      jsonb_agg, qui suit l'ordre physique de la table (donc l'ordre
--      d'inscription) faute d'ORDER BY explicite — désordonné ici.
--   2. SET search_path manquant sur une fonction SECURITY DEFINER.
--
-- Explicitement hors périmètre (refusé par Jules) : seuil de k-anonymat,
-- toucher aux compteurs par assertion, couper une séance déjà publique.

CREATE OR REPLACE FUNCTION public.get_public_results(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_analysis session_analysis%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM sessions
    WHERE id = p_session_id AND phase = 'closed' AND results_public = true
  ) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_analysis
  FROM session_analysis
  WHERE session_id = p_session_id
    AND status = 'done'
    AND vote_scope = 'current'
  ORDER BY created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'k_chosen', v_analysis.k_chosen,
    'points', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'pca_x',    am.pca_x,
        'pca_y',    am.pca_y,
        'group_id', am.group_id
      ) ORDER BY random()), '[]'::jsonb)
      FROM analysis_members am
      WHERE v_analysis.id IS NOT NULL AND am.analysis_id = v_analysis.id
    ),
    'assertions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'content',        r.content,
        'agree_count',    r.agree_count,
        'disagree_count', r.disagree_count,
        'pass_count',     r.pass_count
      ) ORDER BY (r.agree_count + r.disagree_count + r.pass_count) DESC, r.created_at), '[]'::jsonb)
      FROM (
        SELECT
          a.id,
          a.content,
          a.created_at,
          COUNT(av.id) FILTER (WHERE av.vote = 'agree')    AS agree_count,
          COUNT(av.id) FILTER (WHERE av.vote = 'disagree') AS disagree_count,
          COUNT(av.id) FILTER (WHERE av.vote = 'pass')     AS pass_count
        FROM assertions a
        LEFT JOIN assertion_votes av ON av.assertion_id = a.id
        WHERE a.session_id = p_session_id AND a.status = 'approved'
        GROUP BY a.id, a.content, a.created_at
      ) r
    )
  );
END;
$function$;
