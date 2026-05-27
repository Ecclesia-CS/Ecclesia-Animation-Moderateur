-- ── Tables ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.collab_session_users (
  session_id    uuid        NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  pseudo        text        NOT NULL,
  user_id       uuid        NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, pseudo)
);

CREATE TABLE IF NOT EXISTS public.session_sources (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid        NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL,
  pseudo     text        NOT NULL,
  title      text        NOT NULL,
  url        text,
  content    text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── RLS ─────────────────────────────────────────────────────────────

ALTER TABLE public.collab_session_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_sources      ENABLE ROW LEVEL SECURITY;

-- Lecture publique — toute personne authentifiée peut lire
CREATE POLICY "collab_session_users_select" ON public.collab_session_users
  FOR SELECT USING (true);

CREATE POLICY "session_sources_select" ON public.session_sources
  FOR SELECT USING (true);

-- Toutes les écritures passent exclusivement par des fonctions SECURITY DEFINER.
-- Pas de politique INSERT/UPDATE/DELETE directe → bloqué par défaut.

-- ── Realtime ────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.session_sources;

-- ── register_collab_pseudo ──────────────────────────────────────────
-- Upsert le (session_id, pseudo) pour l'utilisateur courant.
-- Si le pseudo existait pour un autre user_id, transfère la propriété
-- (toutes les sources de ce pseudo dans cette séance sont ré-attribuées).

CREATE OR REPLACE FUNCTION public.register_collab_pseudo(
  p_session_id uuid,
  p_pseudo     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.collab_session_users (session_id, pseudo, user_id)
  VALUES (p_session_id, p_pseudo, auth.uid())
  ON CONFLICT (session_id, pseudo) DO UPDATE
    SET user_id = EXCLUDED.user_id;

  -- Transfère les sources existantes vers le nouveau user_id
  UPDATE public.session_sources
  SET user_id = auth.uid()
  WHERE session_id = p_session_id
    AND pseudo     = p_pseudo;
END;
$$;

-- ── add_collab_source ───────────────────────────────────────────────
-- Vérifie que l'appelant est enregistré, insère une source.

CREATE OR REPLACE FUNCTION public.add_collab_source(
  p_session_id uuid,
  p_title      text,
  p_url        text DEFAULT NULL,
  p_content    text DEFAULT NULL
)
RETURNS public.session_sources
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pseudo text;
  v_source public.session_sources;
BEGIN
  SELECT pseudo INTO v_pseudo
  FROM public.collab_session_users
  WHERE session_id = p_session_id AND user_id = auth.uid();

  IF v_pseudo IS NULL THEN
    RAISE EXCEPTION 'Vous devez vous enregistrer avant d''ajouter des sources.';
  END IF;

  INSERT INTO public.session_sources (session_id, user_id, pseudo, title, url, content)
  VALUES (p_session_id, auth.uid(), v_pseudo, p_title, p_url, p_content)
  RETURNING * INTO v_source;

  RETURN v_source;
END;
$$;

-- ── update_collab_source ────────────────────────────────────────────
-- Modifie une source appartenant à l'appelant.

CREATE OR REPLACE FUNCTION public.update_collab_source(
  p_source_id uuid,
  p_title     text,
  p_url       text DEFAULT NULL,
  p_content   text DEFAULT NULL
)
RETURNS public.session_sources
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source public.session_sources;
BEGIN
  UPDATE public.session_sources
  SET
    title      = p_title,
    url        = p_url,
    content    = p_content,
    updated_at = now()
  WHERE id      = p_source_id
    AND user_id = auth.uid()
  RETURNING * INTO v_source;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source introuvable ou non autorisé.';
  END IF;

  RETURN v_source;
END;
$$;

-- ── delete_collab_source ────────────────────────────────────────────
-- Supprime une source appartenant à l'appelant.

CREATE OR REPLACE FUNCTION public.delete_collab_source(
  p_source_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.session_sources
  WHERE id      = p_source_id
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source introuvable ou non autorisé.';
  END IF;
END;
$$;

-- ── list_session_sources ────────────────────────────────────────────
-- Retourne toutes les sources d'une séance, enrichies du join_code
-- de la table à laquelle appartient l'auteur dans cette séance (ou NULL).

CREATE OR REPLACE FUNCTION public.list_session_sources(
  p_session_id uuid
)
RETURNS TABLE (
  id              uuid,
  session_id      uuid,
  user_id         uuid,
  pseudo          text,
  title           text,
  url             text,
  content         text,
  created_at      timestamptz,
  updated_at      timestamptz,
  table_join_code text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    ss.id,
    ss.session_id,
    ss.user_id,
    ss.pseudo,
    ss.title,
    ss.url,
    ss.content,
    ss.created_at,
    ss.updated_at,
    (
      SELECT t.join_code
      FROM public.participants p
      JOIN public.tables t ON t.id = p.table_id
      WHERE p.pseudo      = ss.pseudo
        AND t.session_id  = p_session_id
      LIMIT 1
    ) AS table_join_code
  FROM public.session_sources ss
  WHERE ss.session_id = p_session_id
  ORDER BY ss.pseudo, ss.created_at;
$$;
