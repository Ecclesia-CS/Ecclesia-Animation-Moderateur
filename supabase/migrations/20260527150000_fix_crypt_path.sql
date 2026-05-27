-- Fix: force_session_questionnaire avait SET search_path = public sans extensions,
-- ce qui empêchait crypt() (pgcrypto, schéma extensions) d'être trouvé quand
-- check_superadmin_password héritait du search_path de l'appelante.

CREATE OR REPLACE FUNCTION public.force_session_questionnaire(
  p_password   text,
  p_session_id uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  PERFORM public.check_superadmin_password(p_password);
  UPDATE public.tables
    SET questionnaire_forced_at = now()
  WHERE session_id = p_session_id;
END;
$$;

-- Nouvelle fonction : annule le forçage du questionnaire pour toute la séance
CREATE OR REPLACE FUNCTION public.cancel_session_questionnaire(
  p_password   text,
  p_session_id uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  PERFORM public.check_superadmin_password(p_password);
  UPDATE public.tables
    SET questionnaire_forced_at = NULL
  WHERE session_id = p_session_id;
END;
$$;
