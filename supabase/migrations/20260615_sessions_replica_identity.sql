-- Sans REPLICA IDENTITY FULL, Supabase Realtime ne peut pas enforcer la RLS
-- sur les UPDATE de la table sessions → les changements de phase (draft→voting,
-- allocating→debating) ne sont pas livrés aux subscribers.
-- Note : l'ancien ALTER TABLE sessions REPLICA IDENTITY FULL dans core_functions.sql
-- ciblait l'ancienne table sessions (renommée tables en 20260526000000), pas celle-ci.
ALTER TABLE sessions REPLICA IDENTITY FULL;
