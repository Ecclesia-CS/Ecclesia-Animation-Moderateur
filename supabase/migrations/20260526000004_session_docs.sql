-- ============================================================
-- Session docs : 3 champs URL optionnels sur la table sessions
-- + fonction update_session_docs pour édition post-création
-- ============================================================

-- ── A. Colonnes ───────────────────────────────────────────────

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS doc_info_url    text,
  ADD COLUMN IF NOT EXISTS doc_summary_url text,
  ADD COLUMN IF NOT EXISTS doc_collab_url  text;

-- ── B. create_session — accepte maintenant les 3 URLs ─────────

DROP FUNCTION IF EXISTS create_session(text, text, text, timestamptz);
CREATE OR REPLACE FUNCTION create_session(
  p_password        text,
  p_title           text,
  p_description     text        DEFAULT NULL,
  p_scheduled_at    timestamptz DEFAULT NULL,
  p_doc_info_url    text        DEFAULT NULL,
  p_doc_summary_url text        DEFAULT NULL,
  p_doc_collab_url  text        DEFAULT NULL
) RETURNS sessions
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session sessions;
BEGIN
  PERFORM check_superadmin_password(p_password);

  INSERT INTO sessions (title, description, scheduled_at, join_code,
                        doc_info_url, doc_summary_url, doc_collab_url)
  VALUES (p_title, p_description, p_scheduled_at, generate_session_join_code(),
          p_doc_info_url, p_doc_summary_url, p_doc_collab_url)
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;

-- ── C. update_session_docs — édite les URLs d'une séance ──────

CREATE OR REPLACE FUNCTION update_session_docs(
  p_password        text,
  p_session_id      uuid,
  p_doc_info_url    text DEFAULT NULL,
  p_doc_summary_url text DEFAULT NULL,
  p_doc_collab_url  text DEFAULT NULL
) RETURNS sessions
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session sessions;
BEGIN
  PERFORM check_superadmin_password(p_password);

  UPDATE sessions
  SET doc_info_url    = p_doc_info_url,
      doc_summary_url = p_doc_summary_url,
      doc_collab_url  = p_doc_collab_url
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Séance introuvable : %', p_session_id;
  END IF;

  RETURN v_session;
END;
$$;
