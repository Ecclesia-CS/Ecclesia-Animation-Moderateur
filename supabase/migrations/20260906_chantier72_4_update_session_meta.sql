-- =============================================================
-- Chantier 72 (4/4) — Modifier le titre et la description d'une
--                     séance depuis l'onglet Préparation
--
-- RETOUR BRUT DE JULES
-- ---------------------
-- « Il peut être intéressant, dans vue superadmin onglet préparation, de
--   rendre possible de modifier la description et le titre de la séance. »
--
-- POURQUOI UNE RPC DÉDIÉE
-- =============================================================
-- `create_session` fixe titre et description à la création, et rien ne
-- permet ensuite de les corriger : une faute de frappe dans un titre reste
-- affichée à tous les participants (EntryScreen « Séances en cours »,
-- en-tête de VoteScreen, résultats publics) pour toute la vie de la séance.
--
-- On suit la forme déjà retenue deux fois dans ce projet pour un champ
-- éditable après coup — `update_session_docs` (20260526000004) pour les
-- URLs de documentation, `set_session_onboarding_enabled` (chantier 71)
-- pour le toggle d'onboarding : une RPC SECURITY DEFINER courte, protégée
-- par `check_superadmin_password`, plutôt que d'élargir
-- `update_session_config` (réservée à `moderation_policy`) ou de toucher
-- aux policies RLS de `sessions`.
--
-- CHOIX TRANCHÉS (session headless — hypothèses documentées)
-- =============================================================
--  1. PÉRIMÈTRE : titre + description UNIQUEMENT. `scheduled_at` est
--     affiché juste à côté dans l'en-tête du superadmin et aurait pu être
--     inclus, mais Jules ne le demande pas et son édition soulève une
--     question distincte (fuseau horaire du champ datetime-local). Non
--     inclus ; trivial à ajouter plus tard, en 4ᵉ paramètre optionnel —
--     avec `DROP FUNCTION` explicite de la signature à 3 arguments, cf.
--     le piège de surcharge traité au fichier 3/4 de ce chantier.
--
--  2. TITRE OBLIGATOIRE, DESCRIPTION OPTIONNELLE — aligné sur le schéma :
--     `sessions.title` est NOT NULL, `description` est nullable. Un titre
--     vide ou blanc lève une exception plutôt que d'écrire une chaîne
--     vide ; une description vide est normalisée en NULL (`NULLIF(btrim
--     (...), '')`), pour que l'en-tête du superadmin et les écrans
--     participants retombent proprement sur leur cas « pas de
--     description » au lieu d'afficher un bloc vide.
--
--  3. AUCUNE RESTRICTION DE PHASE. Corriger un titre doit rester possible
--     à tout moment, y compris sur une séance close (les résultats publics
--     affichent ce titre). Ces deux colonnes ne portent aucune logique
--     applicative — contrairement à `phase` ou `join_code`, elles ne sont
--     lues que pour être affichées, et par le prompt Gemini de fusion
--     (`session_title`/`session_description`, LLMModerationPanel), qui lit
--     la valeur courante à chaque appel. Rien à invalider.
--
-- PIÈGES DU PROJET (CLAUDE.md) — traités
-- =============================================================
--   · Fonction ENTIÈREMENT NOUVELLE : aucun risque de surcharge. Le
--     `DROP FUNCTION IF EXISTS` de la signature exacte est quand même
--     posé, au cas où une session parallèle aurait créé une variante.
--   · `RETURNS sessions` (type ligne de la table), comme
--     `update_session_docs` et `set_session_onboarding_enabled` : Postgres
--     l'étend automatiquement à toute colonne ajoutée plus tard par
--     ALTER TABLE, sans redéfinition — cf. le « piège 1 » analysé au
--     chantier 71.
--   · `SET search_path = public, extensions` : la fonction appelle
--     `check_superadmin_password`, qui fait `crypt()`. Omettre
--     `extensions` se manifeste par un « mot de passe superadmin
--     incorrect » trompeur, même avec le bon mot de passe.
-- =============================================================

DROP FUNCTION IF EXISTS public.update_session_meta(text, uuid, text, text);

CREATE FUNCTION public.update_session_meta(
  p_password    text,
  p_session_id  uuid,
  p_title       text,
  p_description text DEFAULT NULL
)
RETURNS sessions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_session sessions;
  v_title   text := btrim(COALESCE(p_title, ''));
BEGIN
  PERFORM check_superadmin_password(p_password);

  IF v_title = '' THEN
    RAISE EXCEPTION 'Le titre de la séance ne peut pas être vide';
  END IF;

  UPDATE sessions
  SET title       = v_title,
      description = NULLIF(btrim(COALESCE(p_description, '')), '')
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Séance introuvable : %', p_session_id;
  END IF;

  RETURN v_session;
END;
$fn$;

COMMENT ON FUNCTION public.update_session_meta(text, uuid, text, text) IS
  'Chantier 72 — édite le titre et la description d''une séance après sa '
  'création (onglet Préparation du superadmin). Titre obligatoire (colonne '
  'NOT NULL) ; description vide normalisée en NULL. Aucune restriction de '
  'phase : ces deux colonnes ne sont qu''affichées, corriger un titre doit '
  'rester possible y compris sur une séance close.';

GRANT EXECUTE ON FUNCTION public.update_session_meta(text, uuid, text, text) TO anon, authenticated;


-- =============================================================
-- REQUÊTES DE VÉRIFICATION (après application)
-- =============================================================
--
-- 1. Signature unique, search_path posé :
--    SELECT pg_get_function_identity_arguments(p.oid), p.proconfig
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'update_session_meta';
--    → 1 ligne, 'text, uuid, text, text', {"search_path=public, extensions"}
--
-- 2. Cas nominal :
--    SELECT title, description FROM sessions WHERE id = '<SESSION_ID>';
--    SELECT update_session_meta('<mdp>', '<SESSION_ID>', 'Nouveau titre', 'Nouvelle description');
--    SELECT title, description FROM sessions WHERE id = '<SESSION_ID>';
--
-- 3. Description vidée → NULL, pas chaîne vide :
--    SELECT update_session_meta('<mdp>', '<SESSION_ID>', 'Titre', '   ');
--    SELECT description IS NULL FROM sessions WHERE id = '<SESSION_ID>';  -- true
--
-- 4. Titre vide refusé :
--    SELECT update_session_meta('<mdp>', '<SESSION_ID>', '  ', NULL);
--    → exception 'Le titre de la séance ne peut pas être vide'
--
-- 5. Mauvais mot de passe refusé (contrôle du search_path : si `extensions`
--    manquait, CE test échouerait AUSSI avec le bon mot de passe) :
--    SELECT update_session_meta('mauvais', '<SESSION_ID>', 'Titre', NULL);
--    → exception 'Mot de passe superadmin incorrect'
--
-- =============================================================
-- SQL D'ANNULATION (rollback)
-- =============================================================
--   DROP FUNCTION IF EXISTS public.update_session_meta(text, uuid, text, text);
--   Penser à retirer d'abord le formulaire d'édition de l'onglet
--   Préparation (SuperadminScreen.tsx), sous peine d'erreur
--   « function does not exist » au clic sur Enregistrer.
-- =============================================================
