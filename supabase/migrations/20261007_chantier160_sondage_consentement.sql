-- =============================================================
-- Chantier 160 — sondage : mode « vote par consentement »
--
-- Un sondage a désormais deux modes, choisis à la création et jamais modifiés :
--   · 'camps'   (défaut) — le sondage historique : vote d'accord / pas d'accord /
--                          passer, analyse pol.is, camps d'opinion ;
--   · 'consent'          — vote par consentement : pour chaque option, « d'accord »
--                          ou « pas d'accord », nombre de votes illimité, ne pas
--                          voter = pas d'avis. Résultats = décomptes seuls, aucune
--                          analyse ni camp.
-- Les « options » sont les assertions du sondage : on réutilise `assertions` /
-- `assertion_votes` (jamais la valeur 'pass' en mode consentement) et les règles
-- de proposition des chantiers 124/153, inchangées.
--
-- Réservé au sondage (CHECK) : pour une séance complète ou un débat simple,
-- poll_mode vaut toujours 'camps'.
--
-- Comparé à la définition courante en base (pg_get_functiondef) avant écriture :
--   · create_session  — signature +1 paramètre (p_poll_mode), reste identique
--     sinon (135 : admin_org_scope, 134 : table du débat simple) ;
--   · cast_vote       — identique dev/prod ; ajout du refus de 'pass' en consent ;
--   · get_public_results — identique dev/prod ; l'analyse n'est jamais lue en
--     consent (aucun camp dans les résultats publics).
-- =============================================================

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS poll_mode text NOT NULL DEFAULT 'camps';

ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_poll_mode_check;
ALTER TABLE sessions
  ADD CONSTRAINT sessions_poll_mode_check CHECK (poll_mode IN ('camps', 'consent'));

ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_poll_mode_type_check;
ALTER TABLE sessions
  ADD CONSTRAINT sessions_poll_mode_type_check CHECK (poll_mode = 'camps' OR session_type = 'poll');

-- Sur PROD, anon n'a SELECT que sur une liste de colonnes (chantier 58) : sans ce
-- GRANT, toute lecture directe de la colonne échoue (cas réel du 30/09 avec
-- organization_id : accueil vide sans erreur visible).
GRANT SELECT (poll_mode) ON sessions TO anon, authenticated;

-- ── create_session ───────────────────────────────────────────────
DROP FUNCTION IF EXISTS create_session(text, text, text, timestamptz, text, text, text, boolean, text);

CREATE OR REPLACE FUNCTION create_session(
  p_password           text,
  p_title              text,
  p_description        text        DEFAULT NULL,
  p_scheduled_at       timestamptz DEFAULT NULL,
  p_doc_info_url       text        DEFAULT NULL,
  p_doc_summary_url    text        DEFAULT NULL,
  p_doc_collab_url     text        DEFAULT NULL,
  p_onboarding_enabled boolean     DEFAULT true,
  p_session_type       text        DEFAULT 'full',
  p_poll_mode          text        DEFAULT 'camps'
) RETURNS sessions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_session sessions;
  v_org     uuid := admin_org_scope(p_password);  -- NULL = superadmin
BEGIN
  IF p_session_type NOT IN ('full', 'debate', 'poll') THEN
    RAISE EXCEPTION 'Type de séance invalide: %', p_session_type;
  END IF;
  -- Chantier 135 — une association n'a que le débat simple et le sondage.
  IF v_org IS NOT NULL AND p_session_type NOT IN ('debate', 'poll') THEN
    RAISE EXCEPTION 'Type de séance non disponible pour une association';
  END IF;
  -- Chantier 160 — le mode de sondage n'existe que pour un sondage.
  IF p_poll_mode NOT IN ('camps', 'consent') THEN
    RAISE EXCEPTION 'Mode de sondage invalide: %', p_poll_mode;
  END IF;
  IF p_poll_mode = 'consent' AND p_session_type <> 'poll' THEN
    RAISE EXCEPTION 'Le vote par consentement est réservé au sondage';
  END IF;

  INSERT INTO sessions (title, description, scheduled_at, join_code,
                        doc_info_url, doc_summary_url, doc_collab_url,
                        onboarding_enabled, session_type, results_public, organization_id,
                        poll_mode)
  VALUES (p_title, p_description, p_scheduled_at, generate_session_join_code(),
          p_doc_info_url, p_doc_summary_url,
          -- Chantier 135 — pas de document collaboratif pour une association.
          CASE WHEN v_org IS NULL THEN p_doc_collab_url END,
          -- Un débat simple n'a pas de phase de vote : l'onboarding (questionnaire
          -- d'entrée avant le vote) n'a rien à précéder. Une association n'a pas
          -- d'onboarding non plus (questions propres à Ecclesia).
          CASE WHEN p_session_type = 'debate' OR v_org IS NOT NULL THEN false ELSE p_onboarding_enabled END,
          p_session_type,
          -- Sondage Ecclesia : consultable par tous à la clôture (134b). Séance
          -- d'association : jamais publique (arbitrage de Jules, chantier 135).
          p_session_type = 'poll' AND v_org IS NULL,
          v_org,
          p_poll_mode)
  RETURNING * INTO v_session;

  -- Débat simple : une seule table par défaut, animée (pas leaderless) et en
  -- attente de son modérateur.
  IF p_session_type = 'debate' THEN
    PERFORM create_session_table_internal(v_session.id, false);
  END IF;

  RETURN v_session;
END;
$$;

REVOKE ALL ON FUNCTION create_session(text, text, text, timestamptz, text, text, text, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_session(text, text, text, timestamptz, text, text, text, boolean, text, text) TO anon, authenticated;

-- ── cast_vote — pas de « passer » en vote par consentement ──────
CREATE OR REPLACE FUNCTION cast_vote(p_assertion_id uuid, p_vote text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_session_id uuid;
  v_status     text;
  v_phase      text;
  v_poll_mode  text;
  v_member_id  uuid;
  v_old        assertion_votes%ROWTYPE;
  v_vote_row   assertion_votes%ROWTYPE;
BEGIN
  SELECT session_id, status INTO v_session_id, v_status
  FROM assertions WHERE id = p_assertion_id;

  IF v_status <> 'approved' THEN
    RAISE EXCEPTION 'Cette assertion n''est pas approuvée';
  END IF;

  SELECT id INTO v_member_id
  FROM session_members
  WHERE session_id = v_session_id AND user_id = auth.uid()
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Vous n''êtes pas inscrit à cette séance';
  END IF;

  SELECT phase, poll_mode INTO v_phase, v_poll_mode FROM sessions WHERE id = v_session_id;

  -- Chantier 160 — le consentement n'a que deux réponses ; ne pas voter = pas d'avis.
  IF v_poll_mode = 'consent' AND p_vote = 'pass' THEN
    RAISE EXCEPTION 'Ce sondage n''a que deux réponses : d''accord ou pas d''accord';
  END IF;

  SELECT * INTO v_old
  FROM assertion_votes
  WHERE assertion_id = p_assertion_id AND member_id = v_member_id;

  IF FOUND AND v_old.vote IS DISTINCT FROM p_vote THEN
    INSERT INTO assertion_vote_history(
      assertion_id, session_id, member_id, vote, voted_at, superseded_at, phase_at_change
    ) VALUES (
      v_old.assertion_id, v_old.session_id, v_old.member_id, v_old.vote,
      v_old.created_at, now(), COALESCE(v_phase, 'unknown')
    );
  END IF;

  INSERT INTO assertion_votes(assertion_id, session_id, member_id, vote, first_cast_phase)
  VALUES (p_assertion_id, v_session_id, v_member_id, p_vote, COALESCE(v_phase, 'unknown'))
  ON CONFLICT (assertion_id, member_id) DO UPDATE SET vote = EXCLUDED.vote
  RETURNING * INTO v_vote_row;

  RETURN to_jsonb(v_vote_row);
END;
$$;

-- ── get_public_results — jamais de camps en vote par consentement ─
CREATE OR REPLACE FUNCTION get_public_results(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_analysis session_analysis%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM sessions
    WHERE id = p_session_id AND phase = 'closed' AND results_public = true
  ) THEN
    RETURN NULL;
  END IF;

  -- Chantier 160 — en consentement, aucune analyse n'est lue : ni points ni camps.
  SELECT * INTO v_analysis
  FROM session_analysis
  WHERE session_id = p_session_id
    AND status = 'done'
    AND vote_scope = 'current'
    AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = p_session_id AND s.poll_mode = 'consent')
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
$$;

-- ROLLBACK (aucune donnée de consentement ne survit à la suppression de la colonne) :
-- 1. DROP FUNCTION IF EXISTS create_session(text, text, text, timestamptz, text, text, text, boolean, text, text);
--    puis recréer la version à 9 paramètres de 20260926_chantier135_comptes_associations.sql.
-- 2. Recréer cast_vote et get_public_results sans les lignes « poll_mode » (voir leur définition d'avant).
-- 3. ALTER TABLE sessions DROP CONSTRAINT sessions_poll_mode_type_check, DROP CONSTRAINT sessions_poll_mode_check,
--    DROP COLUMN poll_mode;
