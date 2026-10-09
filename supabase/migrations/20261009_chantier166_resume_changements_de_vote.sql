-- =============================================================
-- Chantier 167 (fichier nommé « 166 » : appliqué sur dev sous ce nom avant que
-- le numéro 166 soit pris par un autre chantier — ne pas renommer) —
-- Comparaison avant / après débat : « combien de personnes
-- ont changé d'avis »
--
-- Contexte : le chantier 70 garde l'ancien vote dans assertion_vote_history
-- (cast_vote le copie juste avant d'écraser assertion_votes) et le chantier 79
-- compare deux analyses par camps. Il manquait la mesure directe, lisible avec
-- peu de revoteurs : combien de membres ont changé au moins un vote, quelles
-- transitions (d'accord → pas d'accord…), sur quelles assertions.
--
-- Cette mesure lit l'historique, pas les analyses : elle ne dépend donc pas du
-- moment où l'animateur a lancé son analyse « avant ».
--
-- « Avant » = même définition que get_all_votes_for_analysis(…, 'pre_closure')
-- (version courante en base, chantier 161a) : la valeur du plus ancien
-- écrasement survenu en 'post_voting' ou 'closed' s'il y en a un, sinon le vote
-- courant. Les votes posés pour la première fois en post-vote n'ont pas de
-- « avant » : ils sont comptés à part (new_votes / new_voters).
-- « Après » = assertion_votes.vote (vote courant).
--
-- Deux fonctions : un calcul interne (non appelable depuis l'extérieur,
-- testable sans mot de passe) et son enveloppe d'administration, ouverte
-- via check_session_admin comme get_all_votes_for_analysis.
-- =============================================================

CREATE OR REPLACE FUNCTION public.vote_changes_summary(
  p_session_id     uuid,
  p_attending_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH pairs AS (
    SELECT av.assertion_id,
           av.member_id,
           COALESCE(h.vote, av.vote) AS before_vote,
           av.vote                   AS after_vote
    FROM assertion_votes av
    JOIN assertions a       ON a.id  = av.assertion_id
    JOIN session_members sm ON sm.id = av.member_id
    LEFT JOIN LATERAL (
      SELECT vh.vote
      FROM assertion_vote_history vh
      WHERE vh.assertion_id    = av.assertion_id
        AND vh.member_id       = av.member_id
        AND vh.phase_at_change IN ('post_voting', 'closed')
      ORDER BY vh.superseded_at ASC
      LIMIT 1
    ) h ON true
    WHERE av.session_id = p_session_id
      AND a.status = 'approved'
      AND COALESCE(av.first_cast_phase, '') NOT IN ('post_voting', 'closed')
      AND (NOT p_attending_only OR sm.attending_in_person = true)
  ),
  new_votes AS (
    SELECT av.member_id
    FROM assertion_votes av
    JOIN assertions a       ON a.id  = av.assertion_id
    JOIN session_members sm ON sm.id = av.member_id
    WHERE av.session_id = p_session_id
      AND a.status = 'approved'
      AND COALESCE(av.first_cast_phase, '') IN ('post_voting', 'closed')
      AND (NOT p_attending_only OR sm.attending_in_person = true)
  )
  SELECT jsonb_build_object(
    'members_before',  (SELECT count(DISTINCT member_id) FROM pairs),
    'members_changed', (SELECT count(DISTINCT member_id) FROM pairs WHERE before_vote <> after_vote),
    'pairs_total',     (SELECT count(*) FROM pairs),
    'pairs_changed',   (SELECT count(*) FROM pairs WHERE before_vote <> after_vote),
    'new_votes',       (SELECT count(*) FROM new_votes),
    'new_voters',      (SELECT count(DISTINCT member_id) FROM new_votes),
    'transitions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('from', t.before_vote, 'to', t.after_vote, 'count', t.n)
                       ORDER BY t.n DESC, t.before_vote, t.after_vote)
      FROM (
        SELECT before_vote, after_vote, count(*) AS n
        FROM pairs WHERE before_vote <> after_vote
        GROUP BY before_vote, after_vote
      ) t
    ), '[]'::jsonb),
    'assertions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'assertion_id',    x.assertion_id,
               'changed',         x.changed,
               'before_agree',    x.b_agree,
               'before_disagree', x.b_disagree,
               'before_pass',     x.b_pass,
               'after_agree',     x.a_agree,
               'after_disagree',  x.a_disagree,
               'after_pass',      x.a_pass
             ) ORDER BY x.changed DESC, x.assertion_id)
      FROM (
        SELECT assertion_id,
               count(*) FILTER (WHERE before_vote <> after_vote) AS changed,
               count(*) FILTER (WHERE before_vote = 'agree')     AS b_agree,
               count(*) FILTER (WHERE before_vote = 'disagree')  AS b_disagree,
               count(*) FILTER (WHERE before_vote = 'pass')      AS b_pass,
               count(*) FILTER (WHERE after_vote  = 'agree')     AS a_agree,
               count(*) FILTER (WHERE after_vote  = 'disagree')  AS a_disagree,
               count(*) FILTER (WHERE after_vote  = 'pass')      AS a_pass
        FROM pairs
        GROUP BY assertion_id
        HAVING count(*) FILTER (WHERE before_vote <> after_vote) > 0
      ) x
    ), '[]'::jsonb)
  );
$function$;

REVOKE ALL ON FUNCTION public.vote_changes_summary(uuid, boolean) FROM public, anon, authenticated;


CREATE OR REPLACE FUNCTION public.get_vote_changes_admin(
  p_password       text,
  p_session_id     uuid,
  p_attending_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  PERFORM check_session_admin(p_password, p_session_id);
  RETURN vote_changes_summary(p_session_id, p_attending_only);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_vote_changes_admin(text, uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.get_vote_changes_admin(text, uuid, boolean) TO anon, authenticated;

-- ROLLBACK :
-- DROP FUNCTION IF EXISTS public.get_vote_changes_admin(text, uuid, boolean);
-- DROP FUNCTION IF EXISTS public.vote_changes_summary(uuid, boolean);
