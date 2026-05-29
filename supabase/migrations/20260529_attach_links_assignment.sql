-- =============================================================
-- Mise à jour de attach_table_to_session :
-- Quand on attache une table physique à une séance, on renseigne
-- automatiquement table_assignments.table_id pour le numéro
-- logique correspondant (ordre d'attachement : 1ère table = Table 1, etc.)
-- =============================================================

CREATE OR REPLACE FUNCTION attach_table_to_session(
  p_password   text,
  p_table_id   uuid,
  p_session_id uuid
) RETURNS tables
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_table       tables;
  v_next_number int;
BEGIN
  PERFORM check_superadmin_password(p_password);

  -- Numéro logique = nombre de tables déjà rattachées + 1
  -- (compté AVANT l'UPDATE, donc la table en cours n'est pas encore rattachée)
  SELECT COUNT(*) + 1 INTO v_next_number
  FROM tables
  WHERE session_id = p_session_id;

  -- Rattacher la table physique à la séance
  UPDATE tables
  SET session_id = p_session_id
  WHERE id = p_table_id
  RETURNING * INTO v_table;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table introuvable : %', p_table_id;
  END IF;

  -- Lier cette table physique aux affectations du numéro logique correspondant
  -- (no-op si le clustering n'a pas encore tourné)
  UPDATE table_assignments
  SET table_id = p_table_id
  WHERE session_id = p_session_id
    AND table_number = v_next_number
    AND table_id IS NULL;

  RETURN v_table;
END;
$$;
