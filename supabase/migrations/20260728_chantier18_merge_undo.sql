-- =============================================================
-- Chantier 18 / F24 — Annulation d'une fusion d'assertions
--
-- Problème : le bouton « Annuler » du chantier 7 ne faisait que
-- ré-approuver l'assertion rejetée. Il ne restaurait ni le contenu
-- d'origine de l'assertion conservée (perdu dès qu'on applique une
-- « formulation combinée » via update_assertion_content), ni l'état
-- des votes.
--
-- Pourquoi une table d'historique est nécessaire : merge_assertion_votes
-- n'est PAS réversible par calcul. Il écrase des votes existants
-- ('disagree'/'pass' → 'agree') sans mémoriser leur valeur d'avant, et
-- insère des lignes indiscernables d'un vote légitime. Après coup, plus
-- rien en base ne permet de distinguer « ce membre avait déjà voté agree »
-- de « son vote a été basculé par la fusion ». Il faut donc capturer le
-- delta AU MOMENT de la fusion.
--
-- Choix : on enregistre le DELTA (votes basculés + votes insérés), pas un
-- instantané complet des votes. Conséquence importante : les votes posés
-- APRÈS la fusion par d'autres participants (le vote continue pendant que
-- l'animateur modère) ne sont pas écrasés par l'annulation.
--
-- L'historique passe de localStorage (`merge_log_<id>`, propre à un seul
-- navigateur) à la base : une fusion faite sur un poste est annulable
-- depuis n'importe quel autre.
-- =============================================================

-- ── Table d'historique ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS assertion_merges (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          uuid NOT NULL REFERENCES sessions(id)   ON DELETE CASCADE,
  keep_id             uuid NOT NULL REFERENCES assertions(id) ON DELETE CASCADE,
  reject_id           uuid NOT NULL REFERENCES assertions(id) ON DELETE CASCADE,
  -- Contenu de l'assertion conservée avant / après la fusion. Identiques
  -- si la fusion a été appliquée en mode « garder telle quelle ».
  keep_content_before text NOT NULL,
  keep_content_after  text NOT NULL,
  reject_content      text NOT NULL,
  -- Delta de votes appliqué par la fusion (voir en-tête) :
  --   flipped_votes      : [{ "member_id": uuid, "prev_vote": "disagree"|"pass" }]
  --   inserted_member_ids: [uuid, …]
  flipped_votes       jsonb NOT NULL DEFAULT '[]'::jsonb,
  inserted_member_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason              text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  reverted_at         timestamptz
);

CREATE INDEX IF NOT EXISTS assertion_merges_session_idx
  ON assertion_merges (session_id, created_at DESC);

-- Zéro policy : accès exclusivement via les fonctions SECURITY DEFINER
-- ci-dessous, protégées par le mot de passe superadmin (même modèle que
-- app_config).
ALTER TABLE assertion_merges ENABLE ROW LEVEL SECURITY;

-- ── Helper interne : appliquer une fusion ─────────────────────
-- Sans vérification de mot de passe (l'appelant public s'en charge) afin
-- de pouvoir être testé directement en SQL. Révoqué de tous les rôles
-- clients juste après sa définition.

CREATE OR REPLACE FUNCTION _apply_assertion_merge(
  p_keep_id     uuid,
  p_reject_id   uuid,
  p_new_content text DEFAULT NULL,
  p_reason      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_session        uuid;
  v_keep_before    text;
  v_reject_content text;
  v_flipped        jsonb;
  v_inserted       jsonb;
  v_content_after  text;
  v_merge_id       uuid;
BEGIN
  IF p_keep_id = p_reject_id THEN
    RAISE EXCEPTION 'Fusion impossible : les deux assertions sont identiques';
  END IF;

  SELECT session_id, content INTO v_session, v_keep_before
  FROM assertions WHERE id = p_keep_id FOR UPDATE;
  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Assertion conservée introuvable';
  END IF;

  SELECT content INTO v_reject_content
  FROM assertions WHERE id = p_reject_id AND session_id = v_session FOR UPDATE;
  IF v_reject_content IS NULL THEN
    RAISE EXCEPTION 'Assertion à fusionner introuvable (ou rattachée à une autre séance)';
  END IF;

  v_content_after := COALESCE(NULLIF(btrim(p_new_content), ''), v_keep_before);

  -- 1. Capturer le delta AVANT de modifier quoi que ce soit.
  --    a) votes de l'assertion conservée qui vont être basculés en 'agree'
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'member_id', av_keep.member_id,
           'prev_vote', av_keep.vote)), '[]'::jsonb)
    INTO v_flipped
  FROM assertion_votes av_keep
  JOIN assertion_votes av_reject
    ON av_reject.member_id = av_keep.member_id
  WHERE av_keep.assertion_id   = p_keep_id
    AND av_reject.assertion_id = p_reject_id
    AND 'agree' IN (av_keep.vote, av_reject.vote)
    AND av_keep.vote <> 'agree';

  --    b) membres dont le vote va être transféré (ligne créée par la fusion)
  SELECT COALESCE(jsonb_agg(to_jsonb(av.member_id)), '[]'::jsonb)
    INTO v_inserted
  FROM assertion_votes av
  WHERE av.assertion_id = p_reject_id
    AND NOT EXISTS (
      SELECT 1 FROM assertion_votes
      WHERE assertion_id = p_keep_id AND member_id = av.member_id
    );

  INSERT INTO assertion_merges (
    session_id, keep_id, reject_id,
    keep_content_before, keep_content_after, reject_content,
    flipped_votes, inserted_member_ids, reason
  ) VALUES (
    v_session, p_keep_id, p_reject_id,
    v_keep_before, v_content_after, v_reject_content,
    v_flipped, v_inserted, p_reason
  )
  RETURNING id INTO v_merge_id;

  -- 2. Réécriture éventuelle du contenu (mode « formulation combinée »)
  IF v_content_after <> v_keep_before THEN
    UPDATE assertions SET content = v_content_after WHERE id = p_keep_id;
  END IF;

  -- 3. Transfert des votes — logique identique à merge_assertion_votes
  UPDATE assertion_votes av_keep
  SET vote = 'agree'
  FROM assertion_votes av_reject
  WHERE av_reject.assertion_id = p_reject_id
    AND av_reject.member_id    = av_keep.member_id
    AND av_keep.assertion_id   = p_keep_id
    AND 'agree' IN (av_keep.vote, av_reject.vote)
    AND av_keep.vote <> 'agree';

  INSERT INTO assertion_votes (assertion_id, session_id, member_id, vote)
  SELECT p_keep_id, av.session_id, av.member_id, av.vote
  FROM assertion_votes av
  WHERE av.assertion_id = p_reject_id
    AND NOT EXISTS (
      SELECT 1 FROM assertion_votes
      WHERE assertion_id = p_keep_id AND member_id = av.member_id
    );

  -- 4. Rejet de l'assertion fusionnée
  UPDATE assertions SET status = 'rejected' WHERE id = p_reject_id;

  RETURN v_merge_id;
END;
$$;

REVOKE ALL ON FUNCTION _apply_assertion_merge(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;

-- ── Helper interne : annuler une fusion ───────────────────────

CREATE OR REPLACE FUNCTION _revert_assertion_merge(p_merge_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  m                 assertion_merges%ROWTYPE;
  v_current_content text;
  v_content_restored boolean := false;
  v_removed         integer := 0;
  v_restored        integer := 0;
BEGIN
  SELECT * INTO m FROM assertion_merges WHERE id = p_merge_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fusion introuvable';
  END IF;
  IF m.reverted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cette fusion a déjà été annulée';
  END IF;

  -- 1. Restaurer le contenu d'origine — uniquement s'il n'a pas été
  --    retouché à la main depuis la fusion (sinon on écraserait une
  --    correction volontaire de l'animateur).
  SELECT content INTO v_current_content FROM assertions WHERE id = m.keep_id FOR UPDATE;
  IF v_current_content = m.keep_content_after AND m.keep_content_after <> m.keep_content_before THEN
    UPDATE assertions SET content = m.keep_content_before WHERE id = m.keep_id;
    v_content_restored := true;
  END IF;

  -- 2. Supprimer les votes créés par le transfert. Les votes posés après
  --    la fusion par d'autres membres ne sont pas touchés.
  WITH deleted AS (
    DELETE FROM assertion_votes av
    USING jsonb_array_elements_text(m.inserted_member_ids) AS x(member_id)
    WHERE av.assertion_id = m.keep_id
      AND av.member_id    = x.member_id::uuid
    RETURNING 1
  )
  SELECT count(*) INTO v_removed FROM deleted;

  -- 3. Rendre leur valeur d'origine aux votes basculés en 'agree' — sauf
  --    si le membre a lui-même changé d'avis depuis (vote <> 'agree').
  WITH restored AS (
    UPDATE assertion_votes av
    SET vote = f.value ->> 'prev_vote'
    FROM jsonb_array_elements(m.flipped_votes) AS f(value)
    WHERE av.assertion_id = m.keep_id
      AND av.member_id    = (f.value ->> 'member_id')::uuid
      AND av.vote         = 'agree'
    RETURNING 1
  )
  SELECT count(*) INTO v_restored FROM restored;

  -- 4. Faire réapparaître l'assertion fusionnée
  UPDATE assertions SET status = 'approved' WHERE id = m.reject_id;

  UPDATE assertion_merges SET reverted_at = now() WHERE id = p_merge_id;

  RETURN jsonb_build_object(
    'content_restored', v_content_restored,
    'votes_removed',    v_removed,
    'votes_restored',   v_restored
  );
END;
$$;

REVOKE ALL ON FUNCTION _revert_assertion_merge(uuid) FROM PUBLIC, anon, authenticated;

-- ── RPC publiques (mot de passe superadmin) ───────────────────

CREATE OR REPLACE FUNCTION apply_assertion_merge(
  p_password    text,
  p_keep_id     uuid,
  p_reject_id   uuid,
  p_new_content text DEFAULT NULL,
  p_reason      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM check_superadmin_password(p_password);
  RETURN _apply_assertion_merge(p_keep_id, p_reject_id, p_new_content, p_reason);
END;
$$;

GRANT EXECUTE ON FUNCTION apply_assertion_merge(text, uuid, uuid, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION revert_assertion_merge(
  p_password text,
  p_merge_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM check_superadmin_password(p_password);
  RETURN _revert_assertion_merge(p_merge_id);
END;
$$;

GRANT EXECUTE ON FUNCTION revert_assertion_merge(text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION list_assertion_merges(
  p_password   text,
  p_session_id uuid
)
RETURNS TABLE (
  id                  uuid,
  keep_id             uuid,
  reject_id           uuid,
  keep_content_before text,
  keep_content_after  text,
  reject_content      text,
  reason              text,
  created_at          timestamptz,
  reverted_at         timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM check_superadmin_password(p_password);
  RETURN QUERY
  SELECT m.id, m.keep_id, m.reject_id,
         m.keep_content_before, m.keep_content_after, m.reject_content,
         m.reason, m.created_at, m.reverted_at
  FROM assertion_merges m
  WHERE m.session_id = p_session_id
  ORDER BY m.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION list_assertion_merges(text, uuid) TO anon, authenticated;
