-- ============================================================
-- Chantier 3 (D2) — Désignation d'un admin en cours de débat
-- Permet à un participant d'une table `leaderless` de devenir
-- animateur de cette table (auto-promotion, sans code Ecclesia).
-- Atomique via FOR UPDATE : la première tentative gagne, les
-- suivantes échouent proprement ("déjà un animateur").
-- ============================================================

CREATE OR REPLACE FUNCTION designate_moderator(p_table_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table tables%ROWTYPE;
BEGIN
  SELECT * INTO v_table FROM tables WHERE id = p_table_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table introuvable';
  END IF;

  IF NOT v_table.leaderless THEN
    RAISE EXCEPTION 'Cette table a déjà un animateur';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM participants WHERE table_id = p_table_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Pas participant de cette table';
  END IF;

  UPDATE tables
  SET leaderless = false,
      created_by = auth.uid()
  WHERE id = p_table_id;
END;
$$;
