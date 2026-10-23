-- Chantier 173b — le sujet en cours est un simple texte saisi par le modérateur.
-- Une seule ligne `current` par table dans `table_topics` ; texte vide = aucun sujet en cours.
-- Remplace set_table_topic_status('current') côté interface (cette RPC reste en base).
CREATE OR REPLACE FUNCTION public.set_table_current_topic(p_table_id uuid, p_texte text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_texte text := left(NULLIF(btrim(p_texte), ''), 200);
BEGIN
  IF NOT is_table_moderator(p_table_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  -- Le sujet en cours est remplacé ; s'il existait dans la liste des sujets à venir
  -- (même texte, casse/accents ignorés), on le retire pour ne pas le garder en double.
  DELETE FROM table_topics WHERE table_id = p_table_id AND statut = 'current';
  IF v_texte IS NOT NULL THEN
    DELETE FROM table_topics
    WHERE table_id = p_table_id
      AND norm = lower(translate(btrim(v_texte),
        'àâäáãåçéèêëíìîïñóòôöõúùûüýÿÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ',
        'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY'));
    INSERT INTO table_topics (table_id, texte, rang, statut, source)
    VALUES (p_table_id, v_texte, 0, 'current', 'manual');
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_table_current_topic(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_table_current_topic(uuid, text) TO anon, authenticated;
