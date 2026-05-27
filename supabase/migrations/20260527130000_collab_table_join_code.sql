-- Stocke explicitement le table_join_code à la création d'une source collaborative.
-- Corrige le bug où list_session_sources calculait la table de manière non-déterministe
-- via une sous-requête LIMIT 1 sans ORDER BY quand le même pseudo existait dans
-- plusieurs tables de la même séance.

ALTER TABLE public.session_sources
  ADD COLUMN IF NOT EXISTS table_join_code text;

-- Met à jour add_collab_source pour accepter le table_join_code optionnel.
-- Les anciens appels sans ce paramètre continuent de fonctionner (DEFAULT NULL).
CREATE OR REPLACE FUNCTION public.add_collab_source(
  p_session_id      uuid,
  p_title           text,
  p_url             text DEFAULT NULL,
  p_content         text DEFAULT NULL,
  p_table_join_code text DEFAULT NULL
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

  INSERT INTO public.session_sources (session_id, user_id, pseudo, title, url, content, table_join_code)
  VALUES (p_session_id, auth.uid(), v_pseudo, p_title, p_url, p_content, p_table_join_code)
  RETURNING * INTO v_source;

  RETURN v_source;
END;
$$;

-- Met à jour list_session_sources : utilise la colonne stockée en priorité,
-- retombe sur la sous-requête dynamique pour les sources existantes (valeur NULL).
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
    COALESCE(
      ss.table_join_code,
      (
        SELECT t.join_code
        FROM public.participants p
        JOIN public.tables t ON t.id = p.table_id
        WHERE p.pseudo      = ss.pseudo
          AND t.session_id  = p_session_id
        ORDER BY p.created_at
        LIMIT 1
      )
    ) AS table_join_code
  FROM public.session_sources ss
  WHERE ss.session_id = p_session_id
  ORDER BY ss.pseudo, ss.created_at;
$$;
