-- Suppression d'une source collaborative par le superadmin (bypass user_id)
CREATE OR REPLACE FUNCTION public.delete_collab_source_admin(
  p_password  text,
  p_source_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM check_superadmin_password(p_password);

  DELETE FROM public.session_sources WHERE id = p_source_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source introuvable.';
  END IF;
END;
$$;
