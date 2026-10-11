-- Chantier 162b (suite) — la liste des images à purger exige le mot de passe.
--
-- check_session_admin n'est exécutable ni par authenticated ni par service_role
-- (chantiers 102/103) : l'Edge Function ne peut donc pas l'appeler elle-même. Le
-- contrôle du mot de passe (superadmin ou jeton d'association pour SA séance) se
-- fait dans la fonction SQL, qui lève une exception si l'appelant n'est pas
-- l'administrateur de la séance. Remplace purge_share_images_list() sans argument
-- créée par 20261009_chantier162b_table_share_images.sql (aucune surcharge laissée).

DROP FUNCTION IF EXISTS public.purge_share_images_list();

CREATE FUNCTION public.purge_share_images_list(p_password text, p_session_id uuid)
RETURNS TABLE (name text)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, extensions, storage
AS $$
BEGIN
  PERFORM check_session_admin(p_password, p_session_id);

  RETURN QUERY
  SELECT o.name
  FROM storage.objects o
  WHERE o.bucket_id = 'table-shares'
    AND share_image_table_id(o.name) IS NOT NULL
    AND (
      NOT EXISTS (SELECT 1 FROM tables t WHERE t.id = share_image_table_id(o.name))
      OR EXISTS (SELECT 1 FROM tables t
                 JOIN sessions s ON s.id = t.session_id
                 WHERE t.id = share_image_table_id(o.name) AND s.phase = 'closed')
    );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_share_images_list(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_share_images_list(text, uuid) TO service_role;
