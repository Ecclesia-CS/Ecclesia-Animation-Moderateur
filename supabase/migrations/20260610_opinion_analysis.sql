-- =============================================================
-- Analyse des camps d'opinion — tables et RPC
-- Blocs exécutables séquentiellement, sans DROP de l'existant
-- =============================================================

-- ── 1. Table session_analysis ────────────────────────────────
CREATE TABLE session_analysis (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id             uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  created_at             timestamptz NOT NULL DEFAULT now(),
  k_chosen               int,
  silhouette_score       float,
  pca_variance_explained jsonb,
  repness                jsonb,
  group_consensus        jsonb,
  status                 text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'done', 'error'))
);

-- ── 2. Table analysis_members ────────────────────────────────
CREATE TABLE analysis_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES session_analysis(id) ON DELETE CASCADE,
  member_id   uuid NOT NULL REFERENCES session_members(id) ON DELETE CASCADE,
  pca_x       float NOT NULL,
  pca_y       float NOT NULL,
  group_id    int NOT NULL
);

CREATE INDEX analysis_members_analysis_id_idx ON analysis_members(analysis_id);

-- ── 3. RLS session_analysis ──────────────────────────────────
-- Lecture directe : membres uniquement si la session est 'closed'
-- Écriture : RPC uniquement (INSERT bloqué)
ALTER TABLE session_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_analysis_select_closed_members"
  ON session_analysis FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_analysis.session_id
        AND s.phase = 'closed'
    )
    AND EXISTS (
      SELECT 1 FROM session_members sm
      WHERE sm.session_id = session_analysis.session_id
        AND sm.user_id = auth.uid()
    )
  );

CREATE POLICY "session_analysis_no_insert"
  ON session_analysis FOR INSERT WITH CHECK (false);

-- ── 4. RLS analysis_members ──────────────────────────────────
-- Aucune lecture directe : accès exclusivement via RPC
ALTER TABLE analysis_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analysis_members_no_select"
  ON analysis_members FOR SELECT USING (false);

CREATE POLICY "analysis_members_no_insert"
  ON analysis_members FOR INSERT WITH CHECK (false);

-- ── 5. RPC get_all_votes_for_analysis ────────────────────────
-- Retourne tous les votes (assertions 'approved') d'une session.
-- Contourne la RLS pour le superadmin authentifié par mot de passe.
CREATE OR REPLACE FUNCTION get_all_votes_for_analysis(
  p_password   text,
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM check_superadmin_password(p_password);

  SELECT jsonb_agg(jsonb_build_object(
    'member_id',    av.member_id,
    'assertion_id', av.assertion_id,
    'vote',         av.vote
  )) INTO v_result
  FROM assertion_votes av
  JOIN assertions a ON a.id = av.assertion_id
  WHERE av.session_id = p_session_id
    AND a.status = 'approved';

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- ── 6. RPC save_analysis ─────────────────────────────────────
-- Transaction atomique : insère session_analysis puis les lignes analysis_members.
-- p_members : tableau jsonb [{member_id, pca_x, pca_y, group_id}, ...]
-- Retourne l'uuid de la nouvelle analyse.
CREATE OR REPLACE FUNCTION save_analysis(
  p_password        text,
  p_session_id      uuid,
  p_k_chosen        int,
  p_silhouette      float,
  p_pca_variance    jsonb,
  p_repness         jsonb,
  p_group_consensus jsonb,
  p_members         jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_analysis_id uuid;
  v_member      jsonb;
BEGIN
  PERFORM check_superadmin_password(p_password);

  INSERT INTO session_analysis(
    session_id, k_chosen, silhouette_score,
    pca_variance_explained, repness, group_consensus, status
  )
  VALUES (
    p_session_id, p_k_chosen, p_silhouette,
    p_pca_variance, p_repness, p_group_consensus, 'done'
  )
  RETURNING id INTO v_analysis_id;

  FOR v_member IN SELECT * FROM jsonb_array_elements(p_members) LOOP
    INSERT INTO analysis_members(analysis_id, member_id, pca_x, pca_y, group_id)
    VALUES (
      v_analysis_id,
      (v_member->>'member_id')::uuid,
      (v_member->>'pca_x')::float,
      (v_member->>'pca_y')::float,
      (v_member->>'group_id')::int
    );
  END LOOP;

  RETURN v_analysis_id;
END;
$$;
