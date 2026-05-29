-- =============================================================
-- move_member_to_group :
-- Déplace un membre d'un groupe logique vers un autre.
-- Met à jour table_number et table_id (cohérence avec le groupe cible).
-- =============================================================

CREATE OR REPLACE FUNCTION move_member_to_group(
  p_password             text,
  p_session_id           uuid,
  p_member_id            uuid,
  p_target_table_number  int
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_target_table_id uuid;
BEGIN
  PERFORM check_superadmin_password(p_password);

  -- Récupérer le table_id physique du groupe cible (peut être NULL si pas encore rattaché)
  SELECT DISTINCT table_id INTO v_target_table_id
  FROM table_assignments
  WHERE session_id = p_session_id
    AND table_number = p_target_table_number
  LIMIT 1;

  UPDATE table_assignments
  SET table_number = p_target_table_number,
      table_id     = v_target_table_id
  WHERE session_id = p_session_id
    AND member_id  = p_member_id;
END;
$$;
