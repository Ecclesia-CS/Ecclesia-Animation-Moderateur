-- Sans REPLICA IDENTITY FULL, un UPDATE de table_id (seule colonne changée)
-- ne transmet pas session_id ni member_id dans le WAL. Le filtre Realtime
-- `session_id=eq.<id>` ne peut donc jamais matcher → l'événement est ignoré
-- et le participant ne reçoit pas la mise à jour du join_code en temps réel.
ALTER TABLE table_assignments REPLICA IDENTITY FULL;
