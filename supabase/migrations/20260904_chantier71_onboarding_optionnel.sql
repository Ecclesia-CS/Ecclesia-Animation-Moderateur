-- =============================================================
-- Chantier 71 — désactiver l'onboarding par séance
--
-- Retour brut de Jules : « Le vote ne doit pas servir de référence.
-- […] mettre un bouton dans la vue superadmin pour activer ou
-- désactiver le onboarding […] je dois juste pouvoir créer une
-- session sans onboarding. » Bloquant pour une séance de vote en
-- présentiel jeudi prochain (onboarding désactivé, on ne va pas plus
-- loin dans le flux que le vote).
--
-- Nouvelle colonne `sessions.onboarding_enabled`, défaut `true` —
-- préserve le comportement actuel de toutes les séances existantes.
-- Consommée côté frontend par VoteScreen.tsx (phase `voting`) :
-- quand `onboarding_enabled = false`, la phase `voting` saute
-- l'onboarding et va directement au vote, exactement comme le fait
-- déjà `pre_voting` aujourd'hui (qui n'a jamais eu d'onboarding et
-- n'est pas concernée par ce flag).
--
-- ── Piège 1 vérifié — RPC de lecture du chantier 58 ─────────────
-- `get_session_by_id`, `get_session_by_join_code`, `list_sessions_admin`
-- (déjà appliquées en base, cf. supabase/migrations/
-- 20260903_chantier58_restrict_session_columns.sql sur la branche non
-- mergée chantier-58-colonnes-sessions — LU intégralement avant
-- d'écrire cette migration, pas repris d'une version antérieure).
-- Les trois sont déclarées `RETURNS sessions` / `RETURNS SETOF sessions`
-- et font `SELECT * FROM sessions` en interne (SECURITY DEFINER,
-- insensible aux privilèges de colonne). Leur type de retour EST le
-- type ligne de la table `sessions` : Postgres l'étend automatiquement
-- à toute colonne ajoutée par ALTER TABLE, sans qu'il soit nécessaire
-- de redéfinir ces trois fonctions ici. Vérifié en lisant leur corps
-- avant d'écrire cette migration, pas supposé.
-- `list_public_closed_sessions`, à l'inverse, déclare une liste de
-- colonnes explicite (`RETURNS TABLE (id, title, description,
-- scheduled_at)`) — hors périmètre ici (résultats publics post-clôture,
-- aucun rapport avec l'onboarding), non touchée.
--
-- ── Piège 2 signalé, PAS traité ici (consigne explicite : ne pas
--    modifier la branche chantier-58-colonnes-sessions) ────────────
-- Cette même branche, non mergée, contient en section 5 de son fichier
-- de migration un `REVOKE SELECT ON sessions` suivi d'un `GRANT SELECT`
-- restreint à (id, title, phase, join_code, scheduled_at, created_at).
-- SI cette restriction est un jour appliquée telle quelle, une lecture
-- directe `select('*')`/`select(colonnes)` sur `sessions` qui inclurait
-- `onboarding_enabled` échouera (colonne hors de la liste accordée) —
-- il faudra alors ajouter `onboarding_enabled` à cette liste de colonnes
-- dans CETTE branche avant de l'appliquer. Non fait ici, signalé pour
-- la session qui mergera/appliquera ce chantier-58.
-- Sans objet pour VoteScreen.tsx aujourd'hui : à la date de ce chantier,
-- aucun écran de src/ n'appelle encore les RPC du chantier 58 (grep
-- exhaustif fait avant d'écrire cette migration) — tous les écrans,
-- VoteScreen.tsx compris, lisent encore `sessions` par
-- `select('*')`/`select(colonnes explicites)` direct, sous le GRANT
-- actuel (non restreint). `onboarding_enabled` leur est donc visible
-- dès cette migration appliquée, sans aucune dépendance au chantier 58.
--
-- ── Piège 3 vérifié — allocation sans entry_responses ───────────
-- `get_allocation_inputs` (supabase/migrations/20260725_2_allocation_v2.sql,
-- jamais redéfinie depuis) fait déjà un LEFT JOIN entry_responses avec
-- des valeurs par défaut conservatrices en cas d'absence de ligne :
--   COALESCE(er.participation_style = 'active', false) AS is_active,
--   COALESCE(er.consent_transcript, false)             AS consents,
--   COALESCE(er.ecclesia_experience, false)            AS is_veteran,
-- commentaire en tête de fonction : « Sans onboarding : non-actif,
-- non-consentant, nouveau (conservateur, §6) ». Un membre sans
-- entry_responses (onboarding désactivé) est donc déjà traité sans
-- planter, exactement comme un membre qui aurait quitté l'onboarding
-- en cours de route avant ce chantier. Rien à changer ici — vérifié en
-- lisant le corps de la fonction, pas supposé. `src/lib/allocation.ts`
-- n'est pas touché (hors périmètre, piloté par une autre conversation).
-- =============================================================

-- ── 1. Colonne ───────────────────────────────────────────────────

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS onboarding_enabled boolean NOT NULL DEFAULT true;

-- ── 2. RPC set_session_onboarding_enabled — toggle superadmin ────
-- Même forme que set_session_results_public (chantier 46,
-- 20260901_chantier46_public_results_visibility.sql) : un toggle
-- dédié plutôt que de faire passer ce champ par update_session_config
-- (réservé à moderation_policy).
CREATE OR REPLACE FUNCTION set_session_onboarding_enabled(
  p_password           text,
  p_session_id         uuid,
  p_onboarding_enabled boolean
) RETURNS sessions
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session sessions;
BEGIN
  PERFORM check_superadmin_password(p_password);

  UPDATE sessions
  SET onboarding_enabled = p_onboarding_enabled
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Séance introuvable';
  END IF;

  RETURN v_session;
END;
$$;

GRANT EXECUTE ON FUNCTION set_session_onboarding_enabled(text, uuid, boolean) TO anon, authenticated;

-- ── 3. create_session — accepte le flag à la création ─────────────
-- Signature actuelle (dernière redéfinition : 20260526000004_session_docs.sql,
-- jamais retouchée depuis, vérifié par grep sur toutes les branches avant
-- d'écrire cette migration) :
--   create_session(text, text, text, timestamptz, text, text, text)
-- DROP explicite de cette signature exacte avant CREATE OR REPLACE —
-- nouveau paramètre ajouté en fin de liste, avec défaut (`true`, même
-- valeur que le défaut de la colonne) pour que tout appel existant qui
-- l'omet continue de créer une séance identique à avant ce chantier.
DROP FUNCTION IF EXISTS create_session(text, text, text, timestamptz, text, text, text);
CREATE OR REPLACE FUNCTION create_session(
  p_password           text,
  p_title              text,
  p_description        text        DEFAULT NULL,
  p_scheduled_at       timestamptz DEFAULT NULL,
  p_doc_info_url       text        DEFAULT NULL,
  p_doc_summary_url    text        DEFAULT NULL,
  p_doc_collab_url     text        DEFAULT NULL,
  p_onboarding_enabled boolean     DEFAULT true
) RETURNS sessions
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session sessions;
BEGIN
  PERFORM check_superadmin_password(p_password);

  INSERT INTO sessions (title, description, scheduled_at, join_code,
                        doc_info_url, doc_summary_url, doc_collab_url,
                        onboarding_enabled)
  VALUES (p_title, p_description, p_scheduled_at, generate_session_join_code(),
          p_doc_info_url, p_doc_summary_url, p_doc_collab_url,
          p_onboarding_enabled)
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;

-- =============================================================
-- ROLLBACK (à exécuter en un bloc si besoin de revenir en arrière) :
--
-- DROP FUNCTION IF EXISTS create_session(text, text, text, timestamptz, text, text, text, boolean);
-- CREATE OR REPLACE FUNCTION create_session(
--   p_password        text,
--   p_title           text,
--   p_description     text        DEFAULT NULL,
--   p_scheduled_at    timestamptz DEFAULT NULL,
--   p_doc_info_url    text        DEFAULT NULL,
--   p_doc_summary_url text        DEFAULT NULL,
--   p_doc_collab_url  text        DEFAULT NULL
-- ) RETURNS sessions
-- LANGUAGE plpgsql SECURITY DEFINER AS $$
-- DECLARE
--   v_session sessions;
-- BEGIN
--   PERFORM check_superadmin_password(p_password);
--   INSERT INTO sessions (title, description, scheduled_at, join_code,
--                         doc_info_url, doc_summary_url, doc_collab_url)
--   VALUES (p_title, p_description, p_scheduled_at, generate_session_join_code(),
--           p_doc_info_url, p_doc_summary_url, p_doc_collab_url)
--   RETURNING * INTO v_session;
--   RETURN v_session;
-- END;
-- $$;
-- DROP FUNCTION IF EXISTS set_session_onboarding_enabled(text, uuid, boolean);
-- ALTER TABLE sessions DROP COLUMN IF EXISTS onboarding_enabled;
-- =============================================================

-- =============================================================
-- Requêtes de vérification (session de vérification dédiée) :
--
-- 1. Colonne posée, défaut correct sur les séances existantes :
--    SELECT id, title, onboarding_enabled FROM sessions ORDER BY created_at DESC LIMIT 5;
--    -- attendu : onboarding_enabled = true pour toutes les séances déjà en base
--
-- 2. Création avec onboarding désactivé :
--    SELECT create_session('<mot de passe superadmin>', 'Test C71', NULL, NULL, NULL, NULL, NULL, false);
--    -- attendu : ligne retournée avec onboarding_enabled = false
--
-- 3. Création sans le paramètre (comportement historique préservé) :
--    SELECT create_session('<mot de passe superadmin>', 'Test C71 défaut');
--    -- attendu : onboarding_enabled = true
--
-- 4. Toggle sur une séance existante :
--    SELECT set_session_onboarding_enabled('<mot de passe superadmin>', '<session_id>', false);
--    SELECT onboarding_enabled FROM sessions WHERE id = '<session_id>';
--    -- attendu : false, puis remettre à true et revérifier
--
-- 5. Mauvais mot de passe refusé :
--    SELECT set_session_onboarding_enabled('mauvais-mot-de-passe', '<session_id>', false);
--    -- attendu : exception 'Mot de passe superadmin incorrect'
--
-- 6. RPC de lecture du chantier 58 (si déjà appliquées et testées séparément) :
--    SELECT get_session_by_id('<session_id>');
--    SELECT * FROM list_sessions_admin('<mot de passe superadmin>');
--    -- attendu : onboarding_enabled présent dans la ligne retournée, sans
--    -- avoir eu besoin de redéfinir ces fonctions dans cette migration.
-- =============================================================
