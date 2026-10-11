-- Chantier 162b — captures d'écran partagées avec la table (suite du 162a).
--
-- Un participant choisit / colle / glisse une image ; elle est réduite dans son
-- navigateur (≤ 1600 px, WebP ou JPEG, < 1 Mo), envoyée dans un bucket Storage
-- PRIVÉ `table-shares` sous `<table_id>/<share_id>`, puis annoncée par
-- request_table_share(kind='image'). Le modérateur la voit AVANT la table ; une fois
-- acceptée, toute la table la voit.
--
-- Qui lit quoi (politiques de stockage, aucun lien public) :
--   * demande en attente  → son auteur et le modérateur de la table ;
--   * demande acceptée    → toute la table ;
--   * demande refusée     → son auteur seul.
--
-- Effacement : un fichier de Storage ne se supprime pas en SQL (trigger
-- storage.protect_delete). C'est l'Edge Function `purge-share-images` qui les
-- supprime via l'API de stockage, à la clôture de la séance et, en filet de
-- sécurité, pour TOUTES les séances déjà closes. Les deux fonctions ci-dessous
-- (purge_share_images_list / finalize_share_image_purge) ne sont exécutables que
-- par service_role.
--
-- Définitions de départ : request_table_share et list_table_shares comparées à
-- pg_get_functiondef sur dev le 2026-10-09 (= migration 162a). Les deux changent
-- de signature (paramètre / colonne en plus) : DROP de l'ancienne avant création,
-- pour ne laisser aucune surcharge ambiguë.

-- ── 1. Colonnes et contraintes ─────────────────────────────────────────
ALTER TABLE public.table_shares DROP CONSTRAINT table_shares_kind_check;
ALTER TABLE public.table_shares
  ADD CONSTRAINT table_shares_kind_check CHECK (kind IN ('collab_source', 'link', 'image'));

ALTER TABLE public.table_shares
  ADD COLUMN image_path        text,
  ADD COLUMN image_purged_at   timestamptz;

-- Une image a un fichier (image_path) tant qu'elle n'est pas effacée, puis une
-- date d'effacement ; les autres types n'en ont jamais.
ALTER TABLE public.table_shares
  ADD CONSTRAINT table_shares_image_consistency CHECK (
    (kind = 'image'  AND (image_path IS NOT NULL OR image_purged_at IS NOT NULL))
    OR (kind <> 'image' AND image_path IS NULL AND image_purged_at IS NULL)
  );

-- ── 2. Bucket privé ────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('table-shares', 'table-shares', false, 1048576, ARRAY['image/webp', 'image/jpeg'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 3. Helpers d'autorisation du stockage ──────────────────────────────
-- Nom d'objet attendu : <table_id uuid>/<share_id uuid>. NULL si le nom n'a pas
-- cette forme (le CASE évite tout cast d'une chaîne invalide).
CREATE OR REPLACE FUNCTION public.share_image_table_id(p_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN split_part(p_name, '/', 1)::uuid
  END;
$$;

-- Déposer une image : assis à une table qui a un modérateur, débat de la table en
-- cours (comme request_table_share), et pas plus de 8 fichiers par personne et par
-- table (filet contre le dépôt en masse d'orphelins ; la demande, elle, est plafonnée
-- à 3 en attente).
CREATE OR REPLACE FUNCTION public.can_upload_share_image(p_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, extensions, storage
AS $$
DECLARE
  v_tid uuid := share_image_table_id(p_name);
  v_t   tables%ROWTYPE;
BEGIN
  IF v_tid IS NULL OR auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT * INTO v_t FROM tables WHERE id = v_tid;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT (is_table_participant(v_tid) OR is_table_moderator(v_tid)) THEN RETURN false; END IF;
  IF NOT table_has_moderator(v_tid) THEN RETURN false; END IF;
  IF v_t.session_id IS NOT NULL AND table_effective_phase(v_tid) IS DISTINCT FROM 'debating' THEN
    RETURN false;
  END IF;
  IF (SELECT count(*) FROM storage.objects o
      WHERE o.bucket_id = 'table-shares'
        AND o.owner_id = auth.uid()::text
        AND share_image_table_id(o.name) = v_tid) >= 8 THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

-- Lire une image : voir l'en-tête. Passe par la ligne table_shares (jamais par le
-- seul nom de fichier).
CREATE OR REPLACE FUNCTION public.can_read_share_image(p_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, extensions
AS $$
DECLARE
  v_tid uuid := share_image_table_id(p_name);
BEGIN
  IF v_tid IS NULL OR auth.uid() IS NULL THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM table_shares s
    WHERE s.image_path = p_name
      AND (
        s.user_id = auth.uid()
        OR (s.status = 'accepted' AND (is_table_participant(v_tid) OR is_table_moderator(v_tid)))
        OR (s.status = 'pending'  AND is_table_moderator(v_tid))
      )
  );
END;
$$;

-- Supprimer son propre fichier (nettoyage quand l'annonce échoue ou qu'on retire sa
-- demande) : jamais une image déjà montrée à la table.
CREATE OR REPLACE FUNCTION public.can_delete_share_image(p_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, extensions, storage
AS $$
  SELECT share_image_table_id(p_name) IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM storage.objects o
                 WHERE o.bucket_id = 'table-shares' AND o.name = p_name
                   AND o.owner_id = auth.uid()::text)
     AND NOT EXISTS (SELECT 1 FROM table_shares s
                     WHERE s.image_path = p_name AND s.status = 'accepted');
$$;

-- ── 4. Politiques de stockage ──────────────────────────────────────────
CREATE POLICY table_shares_images_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'table-shares' AND public.can_upload_share_image(name));

CREATE POLICY table_shares_images_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'table-shares' AND public.can_read_share_image(name));

CREATE POLICY table_shares_images_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'table-shares' AND public.can_delete_share_image(name));

-- ── 5. request_table_share (+ p_share_id, + kind 'image') ──────────────
DROP FUNCTION IF EXISTS public.request_table_share(uuid, text, text, text, uuid);

CREATE FUNCTION public.request_table_share(
  p_table_id  uuid,
  p_kind      text,
  p_title     text DEFAULT NULL,
  p_url       text DEFAULT NULL,
  p_source_id uuid DEFAULT NULL,
  p_share_id  uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_t       tables%ROWTYPE;
  v_pseudo  text;
  v_title   text;
  v_url     text;
  v_content text;
  v_path    text;
  v_src     session_sources%ROWTYPE;
  v_is_mod  boolean;
  v_id      uuid;
BEGIN
  SELECT * INTO v_t FROM tables WHERE id = p_table_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table introuvable';
  END IF;

  IF NOT (is_table_participant(p_table_id) OR is_table_moderator(p_table_id)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT table_has_moderator(p_table_id) THEN
    RAISE EXCEPTION 'Le partage de sources n''est pas disponible sans modérateur';
  END IF;

  IF v_t.session_id IS NOT NULL AND table_effective_phase(p_table_id) IS DISTINCT FROM 'debating' THEN
    RAISE EXCEPTION 'Le débat de cette table n''est pas en cours';
  END IF;

  SELECT pseudo INTO v_pseudo
  FROM participants
  WHERE table_id = p_table_id AND user_id = auth.uid()
  LIMIT 1;
  IF v_pseudo IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_kind = 'link' THEN
    v_title := btrim(coalesce(p_title, ''));
    IF char_length(v_title) < 1 OR char_length(v_title) > 80 THEN
      RAISE EXCEPTION 'Le titre doit faire entre 1 et 80 caractères';
    END IF;
    v_url := NULLIF(btrim(coalesce(p_url, '')), '');
    IF v_url IS NULL OR NOT is_valid_source_url(v_url) OR char_length(v_url) > 2000 THEN
      RAISE EXCEPTION 'Le lien doit commencer par http:// ou https://';
    END IF;

  ELSIF p_kind = 'image' THEN
    v_title := btrim(coalesce(p_title, ''));
    IF char_length(v_title) < 1 OR char_length(v_title) > 80 THEN
      RAISE EXCEPTION 'Le titre doit faire entre 1 et 80 caractères';
    END IF;
    IF p_share_id IS NULL THEN
      RAISE EXCEPTION 'Image manquante';
    END IF;
    v_path := p_table_id::text || '/' || p_share_id::text;
    -- Le fichier doit déjà être dans le bucket, déposé par l'appelant lui-même.
    IF NOT EXISTS (SELECT 1 FROM storage.objects o
                   WHERE o.bucket_id = 'table-shares' AND o.name = v_path
                     AND o.owner_id = auth.uid()::text) THEN
      RAISE EXCEPTION 'Image manquante';
    END IF;
    IF EXISTS (SELECT 1 FROM table_shares WHERE id = p_share_id) THEN
      RAISE EXCEPTION 'Image déjà annoncée';
    END IF;

  ELSIF p_kind = 'collab_source' THEN
    IF v_t.session_id IS NULL THEN
      RAISE EXCEPTION 'Aucune source collaborative hors séance';
    END IF;
    IF EXISTS (SELECT 1 FROM sessions WHERE id = v_t.session_id AND organization_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Pas de document collaboratif dans cette séance';
    END IF;
    SELECT * INTO v_src FROM session_sources
    WHERE id = p_source_id AND session_id = v_t.session_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Source introuvable';
    END IF;
    IF NOT (
      v_src.user_id = auth.uid()
      OR v_src.member_id IN (
        SELECT m.id FROM session_members m
        WHERE m.session_id = v_t.session_id AND m.user_id = auth.uid()
      )
    ) THEN
      RAISE EXCEPTION 'Cette source n''est pas la vôtre';
    END IF;
    v_title   := left(btrim(v_src.title), 200);
    v_url     := CASE WHEN v_src.url IS NOT NULL AND is_valid_source_url(v_src.url)
                           AND btrim(v_src.url) <> '' AND char_length(btrim(v_src.url)) <= 2000
                      THEN btrim(v_src.url) ELSE NULL END;
    v_content := left(NULLIF(btrim(coalesce(v_src.content, '')), ''), 1500);
    IF v_title = '' THEN
      RAISE EXCEPTION 'Source sans titre';
    END IF;

  ELSE
    RAISE EXCEPTION 'Type de partage inconnu';
  END IF;

  IF (SELECT count(*) FROM table_shares
      WHERE table_id = p_table_id AND user_id = auth.uid() AND status = 'pending') >= 3 THEN
    RAISE EXCEPTION 'Trop de demandes en attente : attendez la réponse du modérateur';
  END IF;

  v_is_mod := is_table_moderator(p_table_id);

  INSERT INTO table_shares
    (id, table_id, session_id, user_id, author_pseudo, kind, title, url, content, source_id,
     image_path, status, decided_at)
  VALUES
    (CASE WHEN p_kind = 'image' THEN p_share_id ELSE gen_random_uuid() END,
     p_table_id, v_t.session_id, auth.uid(), v_pseudo, p_kind, v_title, v_url, v_content,
     CASE WHEN p_kind = 'collab_source' THEN p_source_id END,
     v_path,
     CASE WHEN v_is_mod THEN 'accepted' ELSE 'pending' END,
     CASE WHEN v_is_mod THEN now() END)
  RETURNING id INTO v_id;

  IF v_is_mod THEN
    UPDATE tables SET active_share_id = v_id WHERE id = p_table_id;
  END IF;

  RETURN v_id;
END;
$$;

-- ── 6. list_table_shares (+ image_path, image_purged) ──────────────────
DROP FUNCTION IF EXISTS public.list_table_shares(uuid);

CREATE FUNCTION public.list_table_shares(p_table_id uuid)
RETURNS TABLE (
  id            uuid,
  kind          text,
  title         text,
  url           text,
  content       text,
  status        text,
  author_pseudo text,
  is_mine       boolean,
  is_active     boolean,
  created_at    timestamptz,
  decided_at    timestamptz,
  image_path    text,
  image_purged  boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, extensions
AS $$
DECLARE
  v_is_mod boolean;
BEGIN
  v_is_mod := is_table_moderator(p_table_id);
  IF NOT (v_is_mod OR is_table_participant(p_table_id)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT s.id, s.kind, s.title, s.url, s.content, s.status, s.author_pseudo,
         (s.user_id = auth.uid()) AS is_mine,
         (t.active_share_id = s.id) AS is_active,
         s.created_at, s.decided_at,
         s.image_path,
         (s.image_purged_at IS NOT NULL) AS image_purged
  FROM table_shares s
  JOIN tables t ON t.id = s.table_id
  WHERE s.table_id = p_table_id
    AND (
      s.status = 'accepted'
      OR s.user_id = auth.uid()
      OR (v_is_mod AND s.status = 'pending')
    )
  ORDER BY coalesce(s.decided_at, s.created_at) DESC;
END;
$$;

-- ── 7. Purge (service_role uniquement, appelée par l'Edge Function) ────
-- Fichiers du bucket dont la table appartient à une séance close, ou dont la table
-- n'existe plus (suppression en cascade qui n'efface pas le fichier).
CREATE OR REPLACE FUNCTION public.purge_share_images_list()
RETURNS TABLE (name text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, storage
AS $$
  SELECT o.name
  FROM storage.objects o
  WHERE o.bucket_id = 'table-shares'
    AND share_image_table_id(o.name) IS NOT NULL
    AND (
      NOT EXISTS (SELECT 1 FROM tables t WHERE t.id = share_image_table_id(o.name))
      OR EXISTS (SELECT 1 FROM tables t
                 JOIN sessions s ON s.id = t.session_id
                 WHERE t.id = share_image_table_id(o.name) AND s.phase = 'closed')
    );
$$;

-- Après suppression des fichiers : les lignes des séances closes dont le fichier
-- n'existe plus gardent leur titre, perdent le chemin et reçoivent une date.
CREATE OR REPLACE FUNCTION public.finalize_share_image_purge()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE table_shares s
  SET image_path = NULL, image_purged_at = now()
  WHERE s.image_path IS NOT NULL
    AND EXISTS (SELECT 1 FROM sessions x WHERE x.id = s.session_id AND x.phase = 'closed')
    AND NOT EXISTS (SELECT 1 FROM storage.objects o
                    WHERE o.bucket_id = 'table-shares' AND o.name = s.image_path);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- ── 8. Droits ──────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.request_table_share(uuid, text, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_table_shares(uuid)                                  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_table_share(uuid, text, text, text, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_table_shares(uuid)                                  TO anon, authenticated;

-- Helpers de politiques : exécutés par le moteur de stockage au nom de l'appelant.
REVOKE ALL ON FUNCTION public.share_image_table_id(text)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_upload_share_image(text)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_read_share_image(text)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_delete_share_image(text)   FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.share_image_table_id(text)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_upload_share_image(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_share_image(text)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_delete_share_image(text) TO authenticated;

REVOKE ALL ON FUNCTION public.purge_share_images_list()    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_share_image_purge() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_share_images_list()    TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_share_image_purge() TO service_role;
