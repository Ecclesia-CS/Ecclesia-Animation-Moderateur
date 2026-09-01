-- =============================================================
-- Chantier 37 — bug de réassignation modérateur (accordéon participant)
--
-- Retour de Jules : « Si j'ajoute dans l'accordéon participant un
-- modérateur, cela fonctionne dans l'onglet table uniquement s'il est dans
-- la même table qui est en attente de modérateur. Si le participant est
-- dans une autre table, qui possède déjà un modérateur, il ne devient pas
-- le modérateur de cette table (ok), mais le problème c'est qu'il ne
-- devient pas non plus le modérateur de la table sans modérateur (le bug).
-- A fix. »
--
-- `set_member_moderator` (chantier 19, RPC de la liste des participants —
-- distincte de `assign_moderator_to_table`, chantier 33, qui cible une
-- table précise) ne posait que le flag `is_moderator` sans jamais toucher
-- `table_assignments` : contrairement à `claim_moderator_status`
-- (chantier 33, point 3), elle n'assied jamais le nouveau modérateur sur
-- une table animée encore sans modérateur. D'où le symptôme : ça ne
-- « marche » que par coïncidence, quand le participant se trouve déjà être
-- assis à la bonne table.
--
-- Fix : reprendre telle quelle la logique de placement de
-- `claim_moderator_status` (même requête, même choix arbitraire — la
-- première table animée sans modérateur, dans l'ordre des numéros de
-- table, annoncé par Jules) et l'exécuter aussi depuis
-- `set_member_moderator` quand `p_is_moderator = true`. Comme pour
-- `claim_moderator_status`, `ON CONFLICT ... DO UPDATE` déplace le membre
-- s'il avait déjà un siège ailleurs — assumé, cohérent avec le
-- comportement déjà en production pour l'auto-déclaration.
--
-- Démarquer un modérateur (p_is_moderator = false) reste inchangé : il
-- redevient un participant ordinaire, assis à la même table (cf.
-- commentaire de assign_moderator_to_table, chantier 33 point 3).
-- =============================================================

CREATE OR REPLACE FUNCTION set_member_moderator(
  p_password     text,
  p_session_id   uuid,
  p_member_id    uuid,
  p_is_moderator boolean
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_member    session_members%ROWTYPE;
  v_table_num int;
  v_table_id  uuid;
BEGIN
  PERFORM check_superadmin_password(p_password);

  UPDATE session_members
  SET is_moderator = p_is_moderator
  WHERE id = p_member_id
    AND session_id = p_session_id
  RETURNING * INTO v_member;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membre introuvable pour cette séance';
  END IF;

  -- Même logique que claim_moderator_status (chantier 33 / point 3) : une
  -- table animée déjà formée mais encore sans modérateur assis → on y
  -- place directement ce nouveau modérateur. Sans ça il reste
  -- `is_moderator = true` sans jamais apparaître comme modérateur d'une
  -- table tant que le superadmin ne le déplace pas manuellement.
  IF p_is_moderator THEN
    SELECT ta.table_number, ta.table_id
    INTO v_table_num, v_table_id
    FROM table_assignments ta
    JOIN tables t ON t.id = ta.table_id
    WHERE ta.session_id = p_session_id
      AND t.leaderless = false
      AND NOT EXISTS (
        SELECT 1
        FROM table_assignments ta2
        JOIN session_members sm2 ON sm2.id = ta2.member_id
        WHERE ta2.session_id = ta.session_id
          AND ta2.table_number = ta.table_number
          AND sm2.is_moderator = true
      )
    ORDER BY ta.table_number
    LIMIT 1;

    IF v_table_num IS NOT NULL THEN
      INSERT INTO table_assignments (session_id, member_id, table_number, table_id)
      VALUES (p_session_id, p_member_id, v_table_num, v_table_id)
      ON CONFLICT (session_id, member_id)
      DO UPDATE SET table_number = EXCLUDED.table_number, table_id = EXCLUDED.table_id;
    END IF;
  END IF;

  RETURN to_jsonb(v_member);
END;
$$;

GRANT EXECUTE ON FUNCTION set_member_moderator(text, uuid, uuid, boolean) TO anon, authenticated;
