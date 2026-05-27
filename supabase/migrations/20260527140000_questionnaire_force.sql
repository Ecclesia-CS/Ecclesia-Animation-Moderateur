-- Permet au modérateur (et au superadmin) de forcer l'affichage du questionnaire
-- chez tous les participants connectés à une table / séance.
-- La colonne questionnaire_forced_at sur tables est mise à jour par le modérateur
-- (direct via RLS) ou via la fonction SECURITY DEFINER pour le superadmin
-- (qui agit sur toutes les tables d'une séance).

ALTER TABLE public.tables
  ADD COLUMN IF NOT EXISTS questionnaire_forced_at timestamptz;

-- Permet au superadmin de forcer le questionnaire sur toutes les tables d'une séance
-- en une seule action.
CREATE OR REPLACE FUNCTION public.force_session_questionnaire(
  p_password   text,
  p_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.check_superadmin_password(p_password);
  UPDATE public.tables
  SET questionnaire_forced_at = now()
  WHERE session_id = p_session_id;
END;
$$;
