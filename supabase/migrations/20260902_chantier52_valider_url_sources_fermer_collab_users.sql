-- =============================================================
-- Chantier 52 — valider les URL des sources collaboratives et
-- fermer la lecture publique de collab_session_users
--
-- Audit du 2026-08-03 :
--
-- 1. Aucune validation de schéma sur `session_sources.url` (sources
--    collaboratives, écran CollabDocScreen). `add_collab_source` /
--    `update_collab_source` acceptent n'importe quelle chaîne, rendue
--    ensuite cliquable dans un <a href> (CollabDocScreen.tsx et
--    SuperadminScreen.tsx / CollabSourcesList). Un `javascript:` ou
--    `data:` inséré là exécute du script dans le navigateur de quiconque
--    clique — le superadmin qui gère les sources en premier lieu.
--    Correctif à l'écriture : `is_valid_source_url()`, appelé dans les
--    deux fonctions d'écriture, rejette tout schéma autre que http(s).
--    Correctif à l'affichage (couvre aussi les lignes déjà en base,
--    jamais validées à l'écriture) : `isSafeUrl()` côté client
--    (src/lib/utils.ts), qui masque le lien si le schéma n'est pas
--    autorisé — voir CollabDocScreen.tsx et SuperadminScreen.tsx.
--
-- 2. `collab_session_users` a une policy SELECT `USING (true)` —
--    confirmé en base le 2026-09-02, même défaut que celui fermé pour
--    session_members/table_assignments par le chantier 50. Un simple
--    GET /rest/v1/collab_session_users avec la clé anon retourne
--    pseudo + user_id de tous les inscrits aux documents collaboratifs
--    de toutes les séances, sans authentification.
--    Inventaire des lectures directes (2026-09-02) — une seule, déjà
--    filtrée sur l'utilisateur courant, non affectée par la fermeture :
--      CollabDocScreen.tsx:83 — .eq('session_id', ...).eq('user_id', uid)
--    Pas d'abonnement Realtime sur cette table (elle n'est pas dans la
--    publication supabase_realtime — seule session_sources y est).
--    Aucune fonction SECURITY DEFINER existante ne fait de lecture
--    croisée dessus pour le superadmin : pas de RPC de remplacement à
--    écrire ici, contrairement au chantier 50.
--    Correctif : policy restreinte au propriétaire de la ligne.
-- =============================================================

-- ── 1. Validation des URL de sources — helper ──────────────────
-- NULL / chaîne vide autorisés (pas de lien) ; sinon schéma http(s)
-- obligatoire. Rejette javascript:, data:, vbscript:, et toute chaîne
-- sans schéma explicite (ex. "example.com", "//evil.com").
CREATE OR REPLACE FUNCTION public.is_valid_source_url(p_url text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_url IS NULL
      OR btrim(p_url) = ''
      OR btrim(p_url) ~* '^https?://';
$$;

-- ── 2. add_collab_source — valide p_url avant insertion ────────
-- Signature inchangée depuis 20260527130000_collab_table_join_code.sql
-- (5 arguments, RETURNS public.session_sources) : CREATE OR REPLACE
-- simple, pas de DROP FUNCTION nécessaire. À revérifier avant application
-- via pg_get_function_identity_arguments('add_collab_source'::regproc)
-- si une session parallèle y a touché depuis.
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
  v_url    text := NULLIF(btrim(p_url), '');
  v_source public.session_sources;
BEGIN
  IF NOT public.is_valid_source_url(v_url) THEN
    RAISE EXCEPTION 'Lien invalide : seuls les liens http:// ou https:// sont acceptés.';
  END IF;

  SELECT pseudo INTO v_pseudo
  FROM public.collab_session_users
  WHERE session_id = p_session_id AND user_id = auth.uid();

  IF v_pseudo IS NULL THEN
    RAISE EXCEPTION 'Vous devez vous enregistrer avant d''ajouter des sources.';
  END IF;

  INSERT INTO public.session_sources (session_id, user_id, pseudo, title, url, content, table_join_code)
  VALUES (p_session_id, auth.uid(), v_pseudo, p_title, v_url, p_content, p_table_join_code)
  RETURNING * INTO v_source;

  RETURN v_source;
END;
$$;

-- ── 3. update_collab_source — idem ─────────────────────────────
-- Signature inchangée depuis 20260527000006_collab_sources.sql
-- (4 arguments, RETURNS public.session_sources).
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
  v_url    text := NULLIF(btrim(p_url), '');
  v_source public.session_sources;
BEGIN
  IF NOT public.is_valid_source_url(v_url) THEN
    RAISE EXCEPTION 'Lien invalide : seuls les liens http:// ou https:// sont acceptés.';
  END IF;

  UPDATE public.session_sources
  SET
    title      = p_title,
    url        = v_url,
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

-- ── 4. collab_session_users — self-only ────────────────────────
-- `IF EXISTS` / re-création : la migration est ré-exécutable telle quelle.
DROP POLICY IF EXISTS collab_session_users_select     ON public.collab_session_users;
DROP POLICY IF EXISTS collab_session_users_select_own ON public.collab_session_users;
CREATE POLICY collab_session_users_select_own ON public.collab_session_users
  FOR SELECT USING (user_id = auth.uid());

-- ── 4 bis. Garde-fou : signaler toute policy SELECT permissive résiduelle ──
-- Même précaution que le chantier 50 : les policies PERMISSIVE se cumulent
-- en OR, une seule USING (true) oubliée rouvrirait la table sans le signaler.
DO $chk$
DECLARE
  v_extra text;
BEGIN
  SELECT string_agg(format('%s.%s', tablename, policyname), ', ')
    INTO v_extra
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'collab_session_users'
    AND cmd IN ('SELECT', 'ALL')
    AND permissive = 'PERMISSIVE'
    AND policyname NOT IN ('collab_session_users_select_own');

  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION
      'Chantier 52 : policies SELECT permissives résiduelles sur collab_session_users (%). La lecture publique resterait ouverte — les inspecter avant de rejouer cette migration.',
      v_extra;
  END IF;
END;
$chk$;

-- =============================================================
-- ROLLBACK (à exécuter en un bloc si besoin de revenir en arrière) :
--
-- DROP POLICY IF EXISTS collab_session_users_select_own ON public.collab_session_users;
-- CREATE POLICY collab_session_users_select ON public.collab_session_users FOR SELECT USING (true);
--
-- -- Revenir aux versions sans validation d'URL (avant chantier 52) :
-- CREATE OR REPLACE FUNCTION public.add_collab_source(
--   p_session_id      uuid,
--   p_title           text,
--   p_url             text DEFAULT NULL,
--   p_content         text DEFAULT NULL,
--   p_table_join_code text DEFAULT NULL
-- )
-- RETURNS public.session_sources
-- LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
-- AS $$
-- DECLARE
--   v_pseudo text;
--   v_source public.session_sources;
-- BEGIN
--   SELECT pseudo INTO v_pseudo FROM public.collab_session_users
--   WHERE session_id = p_session_id AND user_id = auth.uid();
--   IF v_pseudo IS NULL THEN
--     RAISE EXCEPTION 'Vous devez vous enregistrer avant d''ajouter des sources.';
--   END IF;
--   INSERT INTO public.session_sources (session_id, user_id, pseudo, title, url, content, table_join_code)
--   VALUES (p_session_id, auth.uid(), v_pseudo, p_title, p_url, p_content, p_table_join_code)
--   RETURNING * INTO v_source;
--   RETURN v_source;
-- END;
-- $$;
--
-- CREATE OR REPLACE FUNCTION public.update_collab_source(
--   p_source_id uuid, p_title text, p_url text DEFAULT NULL, p_content text DEFAULT NULL
-- )
-- RETURNS public.session_sources
-- LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
-- AS $$
-- DECLARE
--   v_source public.session_sources;
-- BEGIN
--   UPDATE public.session_sources
--   SET title = p_title, url = p_url, content = p_content, updated_at = now()
--   WHERE id = p_source_id AND user_id = auth.uid()
--   RETURNING * INTO v_source;
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'Source introuvable ou non autorisé.';
--   END IF;
--   RETURN v_source;
-- END;
-- $$;
--
-- DROP FUNCTION IF EXISTS public.is_valid_source_url(text);
-- =============================================================

-- =============================================================
-- Requêtes de vérification (session de vérification dédiée) :
--
-- 0. AVANT toute chose — inspecter les valeurs déjà en base (le brief de
--    ce chantier demande de signaler, pas de corriger, tout ce qui n'est
--    pas http(s)) :
--    SELECT id, session_id, pseudo, url FROM session_sources
--    WHERE url IS NOT NULL AND btrim(url) <> '' AND NOT is_valid_source_url(url);
--    -- si cette requête retourne des lignes, les signaler à Jules avant
--    -- toute décision de les modifier ou de les supprimer.
--
-- 1. Écriture — URL valide acceptée :
--    SELECT add_collab_source('<session_id>', 'Test', 'https://example.com', NULL, NULL);
--    -- attendu : ligne créée normalement
--
-- 2. Écriture — schéma refusé :
--    SELECT add_collab_source('<session_id>', 'Test', 'javascript:alert(1)', NULL, NULL);
--    -- attendu : exception 'Lien invalide : seuls les liens http:// ou https:// sont acceptés.'
--    (idem avec 'data:text/html,<script>...' et un bare 'example.com')
--
-- 3. Lecture publique de collab_session_users fermée (clé anon, hors navigateur) :
--    GET /rest/v1/collab_session_users?select=pseudo,user_id   -- attendu []
--
-- 4. Lecture self-only toujours fonctionnelle pour un utilisateur enregistré
--    (session Supabase active) :
--    SELECT * FROM collab_session_users WHERE session_id = '<id>';
--    -- attendu : uniquement la ligne où user_id = son propre auth.uid()
--
-- 5. Non-régression CollabDocScreen : enregistrement d'un pseudo, ajout
--    d'une source, affichage — voir A_VERIFIER.md pour le protocole complet.
-- =============================================================
