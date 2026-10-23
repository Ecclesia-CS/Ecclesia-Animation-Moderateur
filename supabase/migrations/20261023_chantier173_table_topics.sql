-- Chantier 173 — sujets de table
--
-- `table_topics` : file des sujets à aborder à une table. Alimentée automatiquement par
-- les sujets saisis par les participants dans la file « autre sujet » (add_to_queue,
-- queue_type 'long' + topic_tag, source 'queue') et à la main par le modérateur
-- (source 'manual'). Un seul sujet `current` par table, marqué À LA MAIN. Les sujets
-- `pending` survivent à la sortie du débat (les files, elles, sont vidées).
-- Dédoublonnage insensible à la casse et aux accents (colonne générée `norm`).
-- Aucune policy : tout passe par RPC SECURITY DEFINER. Gardes d'animation via
-- is_table_moderator (jamais created_by) ; côté administration, check_table_admin /
-- check_session_admin (ouverts aux associations), jamais check_superadmin_password seul.

CREATE TABLE public.table_topics (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id   uuid        NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
  texte      text        NOT NULL CHECK (char_length(texte) BETWEEN 1 AND 200),
  rang       integer     NOT NULL DEFAULT 0,
  statut     text        NOT NULL DEFAULT 'pending' CHECK (statut IN ('pending', 'current', 'done')),
  source     text        NOT NULL DEFAULT 'manual'  CHECK (source IN ('manual', 'queue')),
  created_at timestamptz NOT NULL DEFAULT now(),
  norm       text GENERATED ALWAYS AS (
    lower(translate(btrim(texte),
      'àâäáãåçéèêëíìîïñóòôöõúùûüýÿÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ',
      'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY'))
  ) STORED
);

CREATE UNIQUE INDEX table_topics_norm_uniq ON public.table_topics(table_id, norm);
CREATE UNIQUE INDEX table_topics_one_current ON public.table_topics(table_id) WHERE statut = 'current';
CREATE INDEX table_topics_table_idx ON public.table_topics(table_id, rang);

ALTER TABLE public.table_topics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.table_topics FROM anon, authenticated;

-- ── Fonction interne : enregistrer un sujet sans doublon ────────────────────
CREATE OR REPLACE FUNCTION public.insert_table_topic_internal(p_table_id uuid, p_texte text, p_source text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_texte text := left(btrim(p_texte), 200);
  v_id    uuid;
BEGIN
  IF v_texte IS NULL OR v_texte = '' THEN RETURN NULL; END IF;
  INSERT INTO table_topics (table_id, texte, rang, source)
  VALUES (p_table_id, v_texte,
          COALESCE((SELECT MAX(rang) FROM table_topics WHERE table_id = p_table_id), 0) + 1,
          p_source)
  ON CONFLICT (table_id, norm) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.insert_table_topic_internal(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- ── add_to_queue : enregistre le sujet de la file « autre sujet » ───────────
-- Corps repris de pg_get_functiondef sur dev (2026-10-23) + bloc chantier 173.
CREATE OR REPLACE FUNCTION public.add_to_queue(p_table_id uuid, p_participant_id uuid, p_queue_type text, p_position integer DEFAULT NULL::integer, p_topic_tag text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_pos int;
  v_tag text;
BEGIN
  IF auth.uid() IS DISTINCT FROM (SELECT user_id FROM participants WHERE id = p_participant_id)
     AND NOT is_table_moderator(p_table_id)
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_tag := NULLIF(TRIM(p_topic_tag), '');

  IF p_position IS NULL THEN
    SELECT COALESCE(MAX(position), 0) + 1 INTO v_pos
    FROM queue_entries
    WHERE table_id = p_table_id AND queue_type = p_queue_type;
  ELSE
    v_pos := p_position;
    UPDATE queue_entries
    SET position = position + 1
    WHERE table_id   = p_table_id
      AND queue_type = p_queue_type
      AND position  >= p_position;
  END IF;

  INSERT INTO queue_entries (table_id, participant_id, queue_type, position, topic_tag)
  VALUES (p_table_id, p_participant_id, p_queue_type, v_pos, v_tag)
  ON CONFLICT (table_id, participant_id, queue_type) DO NOTHING;

  -- Chantier 173 : le sujet proposé devient un sujet à venir de la table (sans doublon).
  IF p_queue_type = 'long' AND v_tag IS NOT NULL THEN
    PERFORM insert_table_topic_internal(p_table_id, v_tag, 'queue');
  END IF;
END;
$function$;

-- ── RPC modérateur ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_table_topics(p_table_id uuid)
RETURNS SETOF public.table_topics
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT (is_table_participant(p_table_id) OR is_table_moderator(p_table_id)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
    SELECT * FROM table_topics WHERE table_id = p_table_id
    ORDER BY (statut = 'current') DESC, (statut = 'done'), rang, created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_table_topic(p_table_id uuid, p_texte text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT is_table_moderator(p_table_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF NULLIF(btrim(p_texte), '') IS NULL THEN
    RAISE EXCEPTION 'Sujet requis';
  END IF;
  RETURN insert_table_topic_internal(p_table_id, p_texte, 'manual');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_table_topic_status(p_topic_id uuid, p_statut text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_table_id uuid;
BEGIN
  IF p_statut NOT IN ('pending', 'current', 'done') THEN
    RAISE EXCEPTION 'Statut invalide';
  END IF;
  SELECT table_id INTO v_table_id FROM table_topics WHERE id = p_topic_id;
  IF v_table_id IS NULL THEN RAISE EXCEPTION 'Sujet introuvable'; END IF;
  IF NOT is_table_moderator(v_table_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_statut = 'current' THEN
    -- un seul sujet en cours : l'éventuel précédent retourne en attente
    UPDATE table_topics SET statut = 'pending'
    WHERE table_id = v_table_id AND statut = 'current' AND id <> p_topic_id;
  END IF;
  UPDATE table_topics SET statut = p_statut WHERE id = p_topic_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_table_topic(p_topic_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_table_id uuid;
BEGIN
  SELECT table_id INTO v_table_id FROM table_topics WHERE id = p_topic_id;
  IF v_table_id IS NULL THEN RETURN; END IF;
  IF NOT is_table_moderator(v_table_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  DELETE FROM table_topics WHERE id = p_topic_id;
END;
$$;

-- Réordonne : p_ids = identifiants dans le nouvel ordre (ceux absents gardent leur rang relatif après).
CREATE OR REPLACE FUNCTION public.reorder_table_topics(p_table_id uuid, p_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT is_table_moderator(p_table_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE table_topics t
  SET rang = o.ord
  FROM unnest(p_ids) WITH ORDINALITY AS o(id, ord)
  WHERE t.id = o.id AND t.table_id = p_table_id;
END;
$$;

-- ── RPC administration (superadmin et associations) ─────────────────────────
-- Sujets non abordés (pending) de toutes les tables d'une séance.
CREATE OR REPLACE FUNCTION public.list_unaddressed_topics_admin(p_password text, p_session_id uuid)
RETURNS TABLE (id uuid, table_id uuid, table_number integer, texte text, source text, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM check_session_admin(p_password, p_session_id);
  RETURN QUERY
    SELECT tt.id, tt.table_id, t.table_number, tt.texte, tt.source, tt.created_at
    FROM table_topics tt
    JOIN tables t ON t.id = tt.table_id
    WHERE t.session_id = p_session_id AND tt.statut IN ('pending', 'current')
    ORDER BY t.table_number NULLS LAST, tt.rang, tt.created_at;
END;
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'list_table_topics(uuid)', 'add_table_topic(uuid, text)', 'set_table_topic_status(uuid, text)',
    'delete_table_topic(uuid)', 'reorder_table_topics(uuid, uuid[])',
    'list_unaddressed_topics_admin(text, uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon, authenticated', f);
  END LOOP;
END $$;
