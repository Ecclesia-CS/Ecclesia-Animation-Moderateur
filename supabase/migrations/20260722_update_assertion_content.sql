-- =============================================================
-- Chantier 7 / B4 — Fusion des assertions en une formulation combinée
-- Permet au superadmin de réécrire le contenu d'une assertion existante.
-- Utilisé par le flux « Fusionner en formulation combinée » de
-- LLMModerationPanel : on remplace le texte de l'assertion conservée par
-- la formulation qui réunit les deux originales, puis on transfère les
-- votes et on rejette l'autre (via merge_assertion_votes + reject_assertion).
--
-- L'assertion conserve son id, son statut et ses votes déjà posés — seule
-- sa formulation change. C'est volontaire : recréer une assertion perdrait
-- les votes déjà exprimés sur la version conservée.
-- =============================================================

CREATE OR REPLACE FUNCTION update_assertion_content(
  p_password     text,
  p_assertion_id uuid,
  p_content      text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM check_superadmin_password(p_password);

  IF p_content IS NULL OR length(btrim(p_content)) = 0 THEN
    RAISE EXCEPTION 'Le contenu ne peut pas être vide';
  END IF;

  UPDATE assertions
  SET content = btrim(p_content)
  WHERE id = p_assertion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assertion introuvable';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION update_assertion_content(text, uuid, text) TO anon, authenticated;
