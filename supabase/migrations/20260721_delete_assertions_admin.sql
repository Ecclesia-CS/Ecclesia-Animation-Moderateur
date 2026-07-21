-- =============================================================
-- E1 — Suppression définitive d'assertions (poubelle superadmin)
-- Permet de vider la corbeille sans conserver les assertions rejetées
-- (suppression unitaire ou groupée), et d'annuler un import CSV
-- quel que soit le statut des assertions importées.
-- =============================================================

CREATE OR REPLACE FUNCTION delete_assertions_admin(
  p_password      text,
  p_session_id    uuid,
  p_assertion_ids uuid[]
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted int;
BEGIN
  PERFORM check_superadmin_password(p_password);

  DELETE FROM assertions
  WHERE session_id = p_session_id
    AND id = ANY(p_assertion_ids);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
