-- Chantier 44 — "Ajouter une personne sans téléphone" (ModeratorToolsButton, section Table).
--
-- Le modérateur crée une ligne `participants` pour quelqu'un qui n'a pas de
-- téléphone, afin de pouvoir lui donner/retirer la parole comme n'importe
-- qui d'autre. Réutilise volontairement le même schéma de collision que
-- `join_table` — INSERT ... ON CONFLICT (table_id, pseudo) DO UPDATE SET
-- user_id — pour que le comportement soit identique si quelqu'un rejoint
-- ensuite la séance avec le même nom (reprise transparente, cf. CLAUDE.md
-- « join_table : ON CONFLICT → transfère user_id »).
--
-- Ne réutilise PAS `join_table` tel quel : celui-ci appelle
-- `sync_table_assignment(session_id, table_id, auth.uid(), pseudo)`, qui
-- opère par user_id, pas par pseudo. Appelé sous l'identité du MODÉRATEUR
-- (c'est son appareil qui insère cette ligne), il chercherait/créerait la
-- ligne `session_members` du MODÉRATEUR lui-même :
--   - s'il a déjà une ligne session_members (voté, ou modérateur Bloc C) :
--     no-op silencieux sur `table_assignments` (pas de colonne pseudo à
--     corrompre) ;
--   - sinon (modérateur "classique", jamais inscrit au vote de cette
--     séance) : insertion d'une ligne `session_members` fantôme portant le
--     user_id du modérateur mais le pseudo de la personne ajoutée —
--     `attending_in_person=true` en trop, gonfle `get_session_voting_stats`,
--     et cette personne resterait indiscernable d'un membre inscrit alors
--     qu'elle n'a ni voté ni d'entrée d'onboarding.
--
-- Hypothèse posée (non tranchée explicitement par Jules, cf. A_VERIFIER.md) :
-- une personne ajoutée par ce chemin est vue à la table (participants,
-- files, prise de parole) mais ne compte JAMAIS dans les votes ni
-- l'allocation — cohérent avec le fait que `ModeratorToolsButton` n'existe
-- qu'en phase `debating`, donc après que vote et allocation soient déjà
-- clos. Cette fonction n'écrit donc que dans `participants`, jamais dans
-- `session_members`/`table_assignments`/`entry_responses`.
--
-- Persistance : ligne `participants` normale, donc CASCADE comme n'importe
-- quel participant (suppression de la table, exclusion via
-- `kick_participant`) — pas de statut "éphémère" à part, la table
-- `participants` ne connaît que ce cycle de vie.

CREATE OR REPLACE FUNCTION add_offline_participant(
  p_table_id uuid,
  p_pseudo   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_participant_id uuid;
BEGIN
  -- Même garde que kick_participant/grant_floor : seul le modérateur
  -- physique de la table (created_by) peut ajouter quelqu'un.
  IF NOT EXISTS (
    SELECT 1 FROM tables WHERE id = p_table_id AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  IF p_pseudo IS NULL OR btrim(p_pseudo) = '' THEN
    RAISE EXCEPTION 'Pseudo requis';
  END IF;

  INSERT INTO participants (table_id, user_id, pseudo)
  VALUES (p_table_id, auth.uid(), btrim(p_pseudo))
  ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
  RETURNING id INTO v_participant_id;

  RETURN jsonb_build_object('participant_id', v_participant_id);
END;
$$;
