-- Correctif de parité prod, appliqué le 2026-09-30 au merge dev → main.
--
-- La migration 20260928_chantier142 accorde `claim_collab_identity` aux seuls
-- utilisateurs authentifiés (REVOKE … FROM PUBLIC puis GRANT … TO authenticated).
-- Sur prod, les droits par défaut du schéma (chantier 103) donnent en plus un
-- EXECUTE explicite à `anon` à la création de toute fonction, que REVOKE FROM PUBLIC
-- ne retire pas. Sur dev ces droits par défaut n'existent pas, d'où l'écart.
-- Aucun impact fonctionnel (auth.uid() est NULL pour anon : la fonction ne renvoie
-- rien d'exploitable), mais on rétablit l'intention de la migration d'origine.
REVOKE EXECUTE ON FUNCTION public.claim_collab_identity(uuid, text, text) FROM anon;
