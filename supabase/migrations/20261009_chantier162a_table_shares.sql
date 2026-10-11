-- Chantier 162a — fil de partage de la table : liens et sources collaboratives.
--
-- Un participant demande à montrer à sa table soit une de SES sources du
-- document collaboratif (kind 'collab_source'), soit un lien collé avec un titre
-- court (kind 'link'). Le modérateur voit la demande AVANT la table et l'accepte
-- ou la refuse ; la source acceptée devient la « carte » de la table
-- (tables.active_share_id), les acceptées précédentes forment le fil.
--
-- Pas de texte libre au-delà d'un titre court : c'est ce qui empêche le fil de
-- devenir un chat. Modèle : chantier 132 (table_votes) — état propagé par le
-- broadcast `tables` / `table_shares` du canal `table:<id>` déjà privé (59) et le
-- polling 5 s ; aucun nouveau topic Realtime, donc aucune branche à ajouter dans
-- can_join_realtime_topic.
--
-- Aucune lecture directe de table_shares : tout passe par les RPC (une demande en
-- attente ne doit être vue que de son auteur et du modérateur).
--
-- Garde-fous côté serveur (le client n'est jamais cru) :
--   * l'appelant est assis à la table ;
--   * la table a un modérateur (pas de partage sans modérateur) ;
--   * en séance, la table est en débat (table_effective_phase = 'debating', 161) ;
--   * lien : titre 1–80 car., URL http(s) obligatoire (is_valid_source_url, 52) ;
--   * source collaborative : appartient à l'appelant, même séance, séance non
--     rattachée à une association (pas de document collaboratif chez elles) ;
--   * au plus 3 demandes en attente par personne et par table.
-- Un modérateur qui partage lui-même n'a personne à qui demander : sa demande
-- est acceptée d'office.
--
-- Définitions de départ vérifiées par pg_get_functiondef sur dev le 2026-10-09
-- (is_table_moderator, is_table_participant, table_has_moderator,
-- is_valid_source_url) : aucune fonction existante n'est réécrite ici.

-- ── 1. Table ────────────────────────────────────────────────────────────
CREATE TABLE public.table_shares (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id      uuid        NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
  session_id    uuid                 REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL DEFAULT auth.uid(),
  author_pseudo text        NOT NULL,
  kind          text        NOT NULL CHECK (kind IN ('collab_source', 'link')),
  title         text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  url           text        CHECK (url IS NULL OR (char_length(url) <= 2000 AND url ~* '^https?://')),
  content       text        CHECK (content IS NULL OR char_length(content) <= 1500),
  source_id     uuid                 REFERENCES public.session_sources(id) ON DELETE SET NULL,
  status        text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'refused')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz,
  CONSTRAINT table_shares_link_needs_url CHECK (kind <> 'link' OR url IS NOT NULL)
);

CREATE INDEX table_shares_table_id_idx   ON public.table_shares (table_id, created_at DESC);
CREATE INDEX table_shares_session_id_idx ON public.table_shares (session_id) WHERE session_id IS NOT NULL;

ALTER TABLE public.table_shares ENABLE ROW LEVEL SECURITY;
-- Volontairement AUCUNE policy : ni lecture ni écriture directe, uniquement les RPC.
REVOKE ALL ON public.table_shares FROM anon, authenticated;

-- Carte affichée à la table : la source acceptée en dernier (NULL = aucune, ou
-- retirée par le modérateur). Piggyback sur `tables`, comme active_vote_id (132).
ALTER TABLE public.tables
  ADD COLUMN active_share_id uuid REFERENCES public.table_shares(id) ON DELETE SET NULL;

GRANT SELECT (active_share_id) ON public.tables TO anon, authenticated;

-- ── 2. request_table_share ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_table_share(
  p_table_id  uuid,
  p_kind      text,
  p_title     text DEFAULT NULL,
  p_url       text DEFAULT NULL,
  p_source_id uuid DEFAULT NULL
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
    (table_id, session_id, user_id, author_pseudo, kind, title, url, content, source_id, status, decided_at)
  VALUES
    (p_table_id, v_t.session_id, auth.uid(), v_pseudo, p_kind, v_title, v_url, v_content,
     CASE WHEN p_kind = 'collab_source' THEN p_source_id END,
     CASE WHEN v_is_mod THEN 'accepted' ELSE 'pending' END,
     CASE WHEN v_is_mod THEN now() END)
  RETURNING id INTO v_id;

  IF v_is_mod THEN
    UPDATE tables SET active_share_id = v_id WHERE id = p_table_id;
  END IF;

  RETURN v_id;
END;
$$;

-- ── 3. decide_table_share ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.decide_table_share(p_share_id uuid, p_accept boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_share table_shares%ROWTYPE;
BEGIN
  SELECT * INTO v_share FROM table_shares WHERE id = p_share_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande introuvable';
  END IF;
  IF NOT is_table_moderator(v_share.table_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF v_share.status <> 'pending' THEN
    RAISE EXCEPTION 'Cette demande a déjà reçu une réponse';
  END IF;

  UPDATE table_shares
  SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'refused' END,
      decided_at = now()
  WHERE id = p_share_id;

  IF p_accept THEN
    UPDATE tables SET active_share_id = p_share_id WHERE id = v_share.table_id;
  END IF;
END;
$$;

-- ── 4. end_table_share — le modérateur retire la carte ─────────────────
CREATE OR REPLACE FUNCTION public.end_table_share(p_table_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT is_table_moderator(p_table_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE tables SET active_share_id = NULL WHERE id = p_table_id;
END;
$$;

-- ── 5. withdraw_table_share — l'auteur retire sa demande en attente ────
CREATE OR REPLACE FUNCTION public.withdraw_table_share(p_share_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  DELETE FROM table_shares
  WHERE id = p_share_id AND user_id = auth.uid() AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande introuvable ou déjà traitée';
  END IF;
END;
$$;

-- ── 6. list_table_shares ───────────────────────────────────────────────
-- Modérateur : demandes en attente + sources acceptées. Participant : sources
-- acceptées + SES demandes (quel que soit leur état). Les refus d'autrui ne
-- sont jamais vus.
CREATE OR REPLACE FUNCTION public.list_table_shares(p_table_id uuid)
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
  decided_at    timestamptz
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
         s.created_at, s.decided_at
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

-- ── 7. list_session_shares — restitution dans le document collaboratif ─
-- Liens et sources montrés pendant les débats, par table. Réservé à l'après-débat
-- (post_voting / closed) pour ne pas souffler à une table ce qu'une autre a vu ;
-- vide pour une séance d'association (pas de document collaboratif).
CREATE OR REPLACE FUNCTION public.list_session_shares(p_session_id uuid)
RETURNS TABLE (
  id            uuid,
  table_id      uuid,
  join_code     text,
  table_number  integer,
  kind          text,
  title         text,
  url           text,
  author_pseudo text,
  decided_at    timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, extensions
AS $$
  SELECT s.id, s.table_id, t.join_code,
         (SELECT ta.table_number FROM table_assignments ta
           WHERE ta.session_id = p_session_id AND ta.table_id = s.table_id LIMIT 1),
         s.kind, s.title, s.url, s.author_pseudo, s.decided_at
  FROM table_shares s
  JOIN tables t   ON t.id = s.table_id
  JOIN sessions x ON x.id = s.session_id
  WHERE s.session_id = p_session_id
    AND s.status = 'accepted'
    AND x.organization_id IS NULL
    AND x.phase IN ('post_voting', 'closed')
  ORDER BY t.created_at, s.decided_at;
$$;

-- ── 8. Droits ──────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.request_table_share(uuid, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decide_table_share(uuid, boolean)                  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.end_table_share(uuid)                              FROM PUBLIC;
REVOKE ALL ON FUNCTION public.withdraw_table_share(uuid)                         FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_table_shares(uuid)                            FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_session_shares(uuid)                          FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.request_table_share(uuid, text, text, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_table_share(uuid, boolean)                  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_table_share(uuid)                              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_table_share(uuid)                         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_table_shares(uuid)                            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_session_shares(uuid)                          TO anon, authenticated;
