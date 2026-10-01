-- =============================================================
-- Chantier 97 — Vue modérateur : distinguer actif/passif et présence
-- réelle à la table
--
-- Consigne de Jules (2026-09-19), citée mot pour mot, en deux temps :
--   « Dans la vue modérateur, il faut ajouter un indicateur à côté des
--   noms qui sont passifs, pour que le modérateur sache qu'ils ne sont
--   pas censés parler, mais pouvoir leur donner au cas où. »
--   « Il faut vraiment que le modérateur puisse voir qui est « actif » ou
--   « passif » dans les noms de sa table de participant. Et il faut qu'il
--   voie qui est dans sa table, sans attendre qu'ils soient connectés
--   (juste peut être mettre les noms non connectés en gris et/ou en
--   italique, ou une autre manière, pour signaler qu'ils ne sont pas
--   encore là). »
--
-- `entry_responses.participation_style` (chantier 91) porte déjà la
-- distinction actif/passif ; ce chantier ne l'invente pas, il l'expose à
-- un endroit où elle ne l'était pas (vue modérateur, ModeratorView via
-- ParticipantsSidebar).
--
-- Le point dur est la présence "pas encore connectée" : `table_assignments`
-- (qui liste TOUS les membres affectés à cette table, connectés ou non) est
-- en lecture self-only depuis le chantier 50 — un modérateur assis à la
-- table n'a par construction aucune ligne `session_members` à lui (ou une
-- seule, la sienne) et ne peut donc pas lire celles des autres directement.
-- Même piège que `list_table_assignments_admin` : une jointure imbriquée
-- PostgREST ne lèverait aucune erreur, elle renverrait juste une liste vide.
-- D'où cette RPC SECURITY DEFINER, gardée par `is_table_moderator` (pas
-- `is_table_participant` : cette liste expose des pseudos qui n'ont pas
-- encore rejoint physiquement, réservé à l'autorité d'animation, même
-- logique que le chantier 94 pour le temps de parole par camp).
--
-- Ne renvoie ni group_id ni rien qui touche au clustering d'opinion : la
-- vigilance de confidentialité du chantier 94 (un badge ne doit jamais
-- révéler un camp) s'applique ici aussi, mais participation_style n'a
-- aucun rapport avec les camps d'opinion — rien à filtrer de ce côté.
-- =============================================================

CREATE OR REPLACE FUNCTION list_table_members_for_moderator(p_table_id uuid)
RETURNS TABLE (
  member_id           uuid,
  pseudo              text,
  is_moderator        boolean,
  participation_style text,
  connected           boolean
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
BEGIN
  IF NOT is_table_moderator(p_table_id) THEN
    RETURN;
  END IF;

  SELECT t.session_id INTO v_session_id FROM tables t WHERE t.id = p_table_id;
  IF v_session_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    sm.id,
    sm.pseudo,
    sm.is_moderator,
    er.participation_style,
    EXISTS (
      SELECT 1 FROM participants p
      WHERE p.table_id = p_table_id AND p.user_id = sm.user_id
    ) AS connected
  FROM table_assignments ta
  JOIN session_members sm ON sm.id = ta.member_id
  LEFT JOIN entry_responses er
    ON er.member_id = sm.id AND er.session_id = ta.session_id
  WHERE ta.table_id = p_table_id AND ta.session_id = v_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION list_table_members_for_moderator(uuid) TO anon, authenticated;
