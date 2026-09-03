-- =============================================================
-- Chantier 58 — retirer de la lecture publique les colonnes annexes
-- de `sessions`
--
-- Constat : `sessions` a une policy SELECT `USING (true)` — voulu, c'est
-- ce qui alimente le parcours d'accueil public (liste des séances en
-- cours avec `title` + `join_code`, cf. EntryScreen). Mais comme il n'y a
-- pas de backend, cette même policy laisse aussi n'importe quel porteur
-- de la clé anon lire, pour TOUTE séance (y compris une séance encore en
-- `draft`, ou `closed` avec `results_public = false`) :
--   - `description`        (contenu du débat, pas montré sur l'accueil)
--   - `doc_info_url` / `doc_summary_url` / `doc_collab_url` (liens Google
--     Docs internes)
--   - `group_names`        (noms/description des camps idéologiques
--     détectés par l'analyse PCA — sensible : ça contourne le garde-fou
--     `results_public` qui est censé être LE mécanisme de contrôle de
--     diffusion de l'analyse)
-- Ni l'écran d'accueil ni personne d'autre ne montre ces colonnes à un
-- visiteur non concerné — Jules ne savait pas qu'elles étaient lisibles.
--
-- Choix pour les colonnes restantes (décision prise en écrivant cette
-- migration, cf. inventaire ci-dessous) :
--   - `id`, `title`, `phase`, `join_code` : le parcours d'accueil voulu,
--     ne bouge pas.
--   - `created_at` : aucune lecture directe n'affiche cette colonne, mais
--     `EntryScreen` trie ses 3 requêtes actives avec
--     `.order('created_at', ...)` — PostgREST a besoin du droit SELECT
--     sur la colonne pour évaluer un ORDER BY même si elle n'est pas
--     projetée. La retirer casserait l'accueil. Aucune sensibilité
--     (horodatage de création), donc gardée.
--   - `scheduled_at` : idem question sensibilité (juste une date), mais
--     aucune lecture directe restante n'en a besoin après cette migration
--     (le teaser "Anciennes séances" passe par `list_public_closed_sessions`
--     ci-dessous) — gardée quand même pour rester cohérente avec
--     `created_at` et parce qu'une date de séance n'est pas un secret.
--   - `moderation_policy`, `phase_changed_at`, `results_public` : aucune
--     lecture directe restante n'en a besoin (tout passe par les RPC
--     ci-dessous ou par `list_sessions_admin`) — retirées de la lecture
--     publique directe par simplicité, sans que ce soit un enjeu de
--     confidentialité pour `moderation_policy`/`phase_changed_at`.
--     `results_public` est le nom du garde-fou lui-même : le laisser
--     lisible sans les colonnes qu'il protège n'a pas d'utilité, et
--     `EntryScreen` le utilisait seulement comme filtre WHERE d'une
--     requête désormais remplacée par RPC.
--
-- Inventaire des lectures directes de `sessions` dans src/ (refait le
-- 2026-09-03, l'inventaire du 02/09 datait déjà — plusieurs chantiers
-- mergés le 03/09 en ont changé le compte) : 15 points de lecture.
--   8 en select('*') :
--     TableContext.tsx:154, AllocatingScreen.tsx:155,
--     PublicResultsScreen.tsx:145, SessionRouterScreen.tsx:45,
--     SuperadminScreen.tsx:125, VoteScreen.tsx:154/477/596
--   7 en select(colonnes explicites), dont 3 nomment une colonne retirée
--   ci-dessus et cassaient donc tout autant que les select('*') :
--     ModeratorView.tsx:122, ParticipantView.tsx:95 (doc_info_url/
--       doc_summary_url/doc_collab_url)
--     EntryScreen.tsx:506 (description, "Anciennes séances")
--   Les 4 autres ne touchent que des colonnes restées publiques, donc
--   inchangées par cette migration :
--     CollabDocScreen.tsx:71 (id, title, phase)
--     EntryScreen.tsx:79/93/108 (id, title, phase, join_code / id, title,
--       join_code)
--
-- Fonctions SECURITY DEFINER existantes qui lisent `sessions` en interne
-- (`SELECT ... FROM sessions` ou `sessions%ROWTYPE`) : elles s'exécutent
-- avec les droits du propriétaire de la table et sont insensibles aux
-- privilèges de colonne révoqués ici. Non affectées, listées pour mémoire :
-- create_session, close_session, attach_table_to_session,
-- detach_table_from_session, list_session_tables, list_available_tables,
-- update_session_docs, update_session_config, update_group_names,
-- assign_table_to_group, get_all_votes_for_analysis,
-- get_session_voting_stats, set_session_phase, set_session_results_public,
-- get_public_results, register_session_member, confirm_attendance,
-- reclaim_prevoting_member, run_clustering_v1/v2, get_allocation_inputs,
-- apply_allocation, delete_session, et toutes les autres RPC de
-- lib/sessions.ts / lib/voting.ts qui touchent `sessions`.
--
-- Fenêtre de casse code/migration : AUCUNE dans le sens
-- migration-avant-code — le nouveau code (RPC `get_session_by_id` /
-- `get_session_by_join_code` / `list_sessions_admin` /
-- `list_public_closed_sessions`) fonctionne dès que cette migration est
-- appliquée, avec ou sans le nouveau frontend déployé. Dans le sens
-- code-avant-migration en revanche, le nouveau frontend appelle des RPC
-- qui n'existeront pas encore tant que cette migration n'est pas
-- appliquée — déployer le code seulement après application de cette
-- migration (ou s'assurer que l'orchestration applique la migration en
-- même temps que le déploiement).
-- =============================================================

-- ── 1. RPC de lecture — remplace select('*').eq('id', ...) ─────
-- Public, sans mot de passe : ne fait rien de plus que ce que
-- `select('*').eq('id', p_session_id).maybeSingle()` faisait déjà pour
-- n'importe qui muni de la clé anon — seul le canal change (RPC au lieu
-- d'une lecture directe de colonnes désormais révoquées).
CREATE OR REPLACE FUNCTION get_session_by_id(p_session_id uuid)
RETURNS sessions
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, extensions
AS $$
  SELECT * FROM sessions WHERE id = p_session_id;
$$;

GRANT EXECUTE ON FUNCTION get_session_by_id(uuid) TO anon, authenticated;

-- ── 2. RPC de lecture — remplace select('*').eq('join_code', ...) ──
CREATE OR REPLACE FUNCTION get_session_by_join_code(p_join_code text)
RETURNS sessions
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, extensions
AS $$
  SELECT * FROM sessions WHERE join_code = p_join_code;
$$;

GRANT EXECUTE ON FUNCTION get_session_by_join_code(text) TO anon, authenticated;

-- ── 3. RPC de lecture — remplace le select('*').order('created_at') ──
-- de SuperadminScreen.loadSessions(). Mot de passe requis : c'est
-- l'unique écran qui a besoin de TOUTES les séances (y compris draft),
-- avec TOUTES les colonnes (description/doc urls/group_names inclus,
-- pour l'édition).
CREATE OR REPLACE FUNCTION list_sessions_admin(p_password text)
RETURNS SETOF sessions
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM check_superadmin_password(p_password);

  RETURN QUERY SELECT * FROM sessions ORDER BY created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION list_sessions_admin(text) TO anon, authenticated;

-- ── 4. RPC de lecture — remplace le select ciblé de PastSessionsModal ──
-- (EntryScreen.tsx, "Anciennes séances"). Public, sans mot de passe, mais
-- le WHERE fait exactement ce que le nom de la colonne `results_public`
-- promet : ne renvoie `description` que pour les séances que le
-- superadmin a explicitement rendues publiques.
CREATE OR REPLACE FUNCTION list_public_closed_sessions()
RETURNS TABLE (
  id           uuid,
  title        text,
  description  text,
  scheduled_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, extensions
AS $$
  SELECT s.id, s.title, s.description, s.scheduled_at
  FROM sessions s
  WHERE s.phase = 'closed' AND s.results_public = true
  ORDER BY s.scheduled_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION list_public_closed_sessions() TO anon, authenticated;

-- ── 5. Colonnes publiques — révocation puis re-grant restreint ──
-- REVOKE (table entière) d'abord : les grants par défaut de Supabase sont
-- au niveau table, pas colonne. Il faut les retirer avant de pouvoir
-- accorder un sous-ensemble de colonnes, sinon le GRANT (colonnes)
-- s'ajoute au GRANT (table) déjà en place au lieu de le remplacer.
REVOKE SELECT ON sessions FROM anon, authenticated;
GRANT SELECT (id, title, phase, join_code, scheduled_at, created_at)
  ON sessions TO anon, authenticated;

-- =============================================================
-- ROLLBACK (à exécuter en un bloc si besoin de revenir en arrière) :
--
-- REVOKE SELECT (id, title, phase, join_code, scheduled_at, created_at)
--   ON sessions FROM anon, authenticated;
-- GRANT SELECT ON sessions TO anon, authenticated;
-- DROP FUNCTION IF EXISTS list_public_closed_sessions();
-- DROP FUNCTION IF EXISTS list_sessions_admin(text);
-- DROP FUNCTION IF EXISTS get_session_by_join_code(text);
-- DROP FUNCTION IF EXISTS get_session_by_id(uuid);
-- =============================================================

-- =============================================================
-- Requêtes de vérification (session de vérification dédiée) :
--
-- 1. Colonnes annexes fermées à la lecture directe (clé anon, hors
--    navigateur / sans session) :
--    GET /rest/v1/sessions?select=description                -- attendu 403 / 42501
--    GET /rest/v1/sessions?select=doc_info_url                -- attendu 403 / 42501
--    GET /rest/v1/sessions?select=group_names                 -- attendu 403 / 42501
--    GET /rest/v1/sessions?select=*                           -- attendu 403 / 42501
--
-- 2. Colonnes publiques toujours lisibles :
--    GET /rest/v1/sessions?select=id,title,phase,join_code    -- attendu 200, toutes séances
--
-- 3. RPC publiques fonctionnelles (aucune auth requise) :
--    SELECT get_session_by_id('<session_id>');
--    SELECT get_session_by_join_code('<join_code>');
--    SELECT * FROM list_public_closed_sessions();
--    -- attendu : ligne complète (description/doc urls/group_names inclus)
--
-- 4. RPC admin fonctionnelle / refuse un mauvais mot de passe :
--    SELECT * FROM list_sessions_admin('<mot de passe superadmin>');
--    SELECT * FROM list_sessions_admin('mauvais-mot-de-passe');
--    -- attendu : toutes les séances (draft incluses) / exception
--    -- 'Mot de passe superadmin incorrect'
-- =============================================================
