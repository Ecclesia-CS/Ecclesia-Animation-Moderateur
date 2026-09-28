-- Chantier 135 (suite) — refus explicite d'une action réservée au superadmin.
--
-- Une RPC hors liste blanche appelée avec un jeton d'association valide
-- levait « Mot de passe superadmin incorrect ». Or le front déconnecte sur
-- tout message contenant « mot de passe » : un bouton oublié dans l'interface
-- asso aurait déconnecté l'association au lieu d'afficher une erreur. Message
-- dédié, sans « mot de passe ». Comportement superadmin strictement inchangé.
-- Corps d'origine repris de pg_get_functiondef (dev, 2026-09-26).
CREATE OR REPLACE FUNCTION public.check_superadmin_password(p_password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM app_config WHERE key = 'superadmin_code_hash' AND value = crypt(p_password, value)
  ) THEN
    IF org_from_token(p_password) IS NOT NULL THEN
      RAISE EXCEPTION 'Action réservée à Ecclesia (non disponible pour une association)';
    END IF;
    RAISE EXCEPTION 'Mot de passe superadmin incorrect';
  END IF;
END;
$function$;
