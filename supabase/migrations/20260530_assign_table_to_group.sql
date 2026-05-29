-- =============================================================
-- assign_table_to_group :
-- Rattache une table physique à un numéro de groupe logique.
-- Met à jour table_assignments.table_id pour tous les membres
-- du groupe, et s'assure que la table est attachée à la séance.
-- Passer p_table_id = NULL pour détacher.
-- =============================================================

CREATE OR REPLACE FUNCTION assign_table_to_group(
  p_password     text,
  p_session_id   uuid,
  p_table_number int,
  p_table_id     uuid  -- NULL = désassigner
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM check_superadmin_password(p_password);

  -- Mettre à jour toutes les affectations du numéro logique
  UPDATE table_assignments
  SET table_id = p_table_id
  WHERE session_id = p_session_id
    AND table_number = p_table_number;

  -- Si on assigne (non NULL) : s'assurer que la table est rattachée à la séance
  IF p_table_id IS NOT NULL THEN
    UPDATE tables
    SET session_id = p_session_id
    WHERE id = p_table_id
      AND (session_id IS NULL OR session_id = p_session_id);
  END IF;
END;
$$;
