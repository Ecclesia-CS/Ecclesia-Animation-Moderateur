-- =============================================================
-- Chantier 154 — le superadmin choisit quelles séances figurent sur l'accueil
--
-- sessions.visible_on_home : true par défaut (séances existantes et nouvelles).
-- Ne concerne que la liste « Séances en cours » d'EntryScreen. Indépendant de
-- results_public (résultats publics des séances closes). Une séance masquée
-- reste accessible par son lien / QR code.
--
-- Droits de colonne : sur PROD, anon n'a SELECT que sur une liste de colonnes
-- (chantier 58) ; EntryScreen lit visible_on_home en direct → GRANT obligatoire
-- (cas réel du 30/09 avec organization_id : accueil vide sans erreur).
-- =============================================================

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS visible_on_home boolean NOT NULL DEFAULT true;

GRANT SELECT (visible_on_home) ON sessions TO anon, authenticated;

-- Superadmin uniquement (check_superadmin_password : fermé aux associations,
-- dont les séances ne figurent de toute façon jamais sur l'accueil).
CREATE OR REPLACE FUNCTION set_session_visible_on_home(
  p_password        text,
  p_session_id      uuid,
  p_visible_on_home boolean
) RETURNS sessions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_session sessions;
BEGIN
  PERFORM check_superadmin_password(p_password);

  UPDATE sessions
  SET visible_on_home = COALESCE(p_visible_on_home, true)
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Séance introuvable';
  END IF;

  RETURN v_session;
END;
$$;

REVOKE ALL ON FUNCTION set_session_visible_on_home(text, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_session_visible_on_home(text, uuid, boolean) TO anon, authenticated;

-- ROLLBACK :
-- DROP FUNCTION IF EXISTS set_session_visible_on_home(text, uuid, boolean);
-- ALTER TABLE sessions DROP COLUMN IF EXISTS visible_on_home;
