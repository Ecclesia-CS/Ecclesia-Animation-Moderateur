-- Notes privées par participant/modérateur
-- Suppression automatique en cascade à la suppression de la table
-- RLS stricte : user_id = auth.uid() uniquement, aucune fonction SECURITY DEFINER

CREATE TABLE private_notes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id   uuid        NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL,
  content    text        NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT private_notes_table_user_unique UNIQUE (table_id, user_id)
);

ALTER TABLE private_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_select" ON private_notes FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "owner_insert" ON private_notes FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner_update" ON private_notes FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "owner_delete" ON private_notes FOR DELETE USING (user_id = auth.uid());
