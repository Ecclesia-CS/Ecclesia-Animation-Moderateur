-- =============================================================
-- Chantier 46 — visibilité publique des résultats post-séance
--
-- Jusqu'ici get_public_results() (migration 20260613_public_results.sql)
-- rendait publique TOUTE séance en phase 'closed', sans distinction —
-- basculer l'historique complet en public d'un coup n'est pas ce qui a été
-- demandé. Ce fichier ajoute un opt-in explicite par séance
-- (sessions.results_public, false par défaut) et durcit get_public_results
-- pour exiger phase='closed' ET results_public=true.
--
-- Étend aussi la charge utile : liste complète des assertions approuvées
-- avec leurs compteurs agree/disagree/pass (au lieu du seul top-3 par
-- repness), et les points du nuage PCA (pca_x, pca_y, group_id) SANS
-- member_id ni aucun identifiant — un point anonyme par participant,
-- même représentation que l'onglet Analyse du superadmin.
-- =============================================================

-- ── 1. Colonne de visibilité ──────────────────────────────────
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS results_public boolean NOT NULL DEFAULT false;

-- ── 2. RPC set_session_results_public — toggle superadmin ─────
CREATE OR REPLACE FUNCTION set_session_results_public(
  p_password       text,
  p_session_id     uuid,
  p_results_public boolean
) RETURNS sessions
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session sessions;
BEGIN
  PERFORM check_superadmin_password(p_password);

  UPDATE sessions
  SET results_public = p_results_public
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Séance introuvable';
  END IF;

  RETURN v_session;
END;
$$;

-- ── 3. get_public_results — durci + enrichi ───────────────────
-- Remplace entièrement la version de 20260613_public_results.sql.
-- Toujours accessible sans auth (anon), aucun mot de passe.
CREATE OR REPLACE FUNCTION get_public_results(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_analysis session_analysis%ROWTYPE;
BEGIN
  -- Phase closed ET visibilité publique explicitement activée par le superadmin
  IF NOT EXISTS (
    SELECT 1 FROM sessions
    WHERE id = p_session_id AND phase = 'closed' AND results_public = true
  ) THEN
    RETURN NULL;
  END IF;

  -- Dernière analyse done, si elle existe (l'opinion analysis est indépendante
  -- de la bascule de visibilité — une séance peut être rendue publique avant
  -- qu'une analyse ait jamais été lancée : k_chosen reste NULL, points = []).
  SELECT * INTO v_analysis
  FROM session_analysis
  WHERE session_id = p_session_id AND status = 'done'
  ORDER BY created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'k_chosen', v_analysis.k_chosen,
    -- Nuage de points anonyme : ni member_id, ni is_self, ni aucun identifiant.
    'points', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'pca_x',    am.pca_x,
        'pca_y',    am.pca_y,
        'group_id', am.group_id
      )), '[]'::jsonb)
      FROM analysis_members am
      WHERE v_analysis.id IS NOT NULL AND am.analysis_id = v_analysis.id
    ),
    -- Toutes les assertions approuvées avec leurs compteurs agrégés —
    -- jamais le détail nominatif d'un vote (assertion_votes n'est jamais
    -- exposée ligne à ligne, uniquement des COUNT() agrégés).
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

-- =============================================================
-- Requêtes de vérification (session de vérification dédiée) :
--
-- 1. Confirmer la colonne et son défaut :
--    SELECT column_name, data_type, column_default FROM information_schema.columns
--    WHERE table_name = 'sessions' AND column_name = 'results_public';
--    -- attendu : boolean, default false
--
-- 2. Confirmer qu'une séance closed NON marquée visible reste opaque :
--    SELECT get_public_results('<id d'une séance phase=closed, results_public=false>');
--    -- attendu : NULL
--
-- 3. Confirmer qu'une séance closed marquée visible expose les bons champs :
--    SELECT set_session_results_public('<mot de passe superadmin>', '<session_id>', true);
--    SELECT get_public_results('<session_id>');
--    -- attendu : jsonb avec clés 'k_chosen', 'points', 'assertions' UNIQUEMENT.
--    -- Inspecter chaque élément de 'points' : doit contenir SEULEMENT
--    --   pca_x, pca_y, group_id — jamais member_id, user_id, pseudo, is_self.
--    -- Inspecter chaque élément de 'assertions' : doit contenir SEULEMENT
--    --   content, agree_count, disagree_count, pass_count — jamais member_id,
--    --   assertion_id, ni le contenu d'un vote individuel.
--
-- 4. Confirmer l'appel anonyme (aucune session Supabase active) :
--    -- Depuis un client anon (curl avec la clé anon, ou signInAnonymously
--    -- côté navigateur) : supabase.rpc('get_public_results', { p_session_id })
--    -- doit répondre sans erreur d'auth.
--
-- 5. Confirmer que set_session_results_public refuse un mauvais mot de passe :
--    SELECT set_session_results_public('mauvais-mot-de-passe', '<session_id>', true);
--    -- attendu : exception 'Mot de passe superadmin incorrect'
-- =============================================================
