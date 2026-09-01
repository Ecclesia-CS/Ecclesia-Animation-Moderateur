-- ============================================================
-- Chantier 48 — « Je veux rejoindre une autre table »
--
-- Retour de Jules : sur l'écran qui annonce sa table au participant
-- (AllocatingScreen), ajouter la possibilité de rejoindre une AUTRE table
-- que celle assignée, en tapant son code à 6 caractères (même mécanisme
-- que `join_table` — pas de second système de codes).
--
-- Pourquoi une fonction dédiée plutôt que réutiliser `join_table` tel quel :
-- 1. `join_table` ne vérifie jamais que le code appartient à la séance en
--    cours — légitime pour son usage actuel (retardataire, `JoinTableForm`),
--    mais ici on veut un message explicite si le code désigne une table
--    d'une AUTRE séance (cf. retour de Jules).
-- 2. `join_table` ne retire jamais le participant de ses tables précédentes
--    dans la même séance : il se contente d'un upsert sur (table_id, pseudo),
--    donc rejoindre une nouvelle table via un nouveau code INSÈRE une ligne
--    `participants` en plus, sans jamais supprimer l'ancienne. Le même
--    problème avait déjà été identifié et corrigé pour `table_assignments`
--    dans 20260727_6_chantier26_sync_table_assignments.sql (voir son
--    commentaire d'en-tête, scénario 1 : « un participant quitte sa table
--    puis rejoint une AUTRE table ») — mais jamais pour `participants`
--    lui-même. Symptôme concret : `leaveTable()` (bouton Quitter côté
--    participant) ne supprime JAMAIS la ligne `participants` en base, il ne
--    fait que vider le cache local (`tableStore.clear()`, voir
--    `TableContext.tsx`/`App.tsx`) — un participant qui quitte puis change
--    de table via ce nouveau flux se serait donc retrouvé dans les DEUX
--    tables à la fois sans ce correctif.
--
-- Arbitrage produit laissé ouvert par Jules, tranché par défaut faute de
-- réponse : le déplacement est libre, sans limite de place ni restriction
-- aux tables non modérées. Voir A_VERIFIER.md pour le détail et la
-- conséquence assumée (défait potentiellement l'équilibre de l'allocation,
-- src/lib/allocation.ts — non modifié par ce chantier).
-- ============================================================

CREATE OR REPLACE FUNCTION switch_table(
  p_session_id uuid,
  p_join_code  text,
  p_pseudo     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table_id       uuid;
  v_table_session  uuid;
  v_participant_id uuid;
  v_old_table_id   uuid;
  v_result         jsonb;
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'Séance requise.';
  END IF;

  SELECT id, session_id INTO v_table_id, v_table_session
  FROM tables WHERE join_code = upper(p_join_code);

  IF v_table_id IS NULL THEN
    RAISE EXCEPTION 'Aucune table ne correspond à ce code.';
  END IF;

  IF v_table_session IS DISTINCT FROM p_session_id THEN
    RAISE EXCEPTION 'Ce code correspond à une table d''une autre séance.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM participants WHERE table_id = v_table_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Tu es déjà à cette table.';
  END IF;

  -- Retirer proprement le participant de ses éventuelles tables précédentes
  -- dans CETTE séance (normalement une seule, on couvre plusieurs par
  -- sécurité) — même traitement que kick_participant : libère le micro et
  -- clôt le tour en cours avant de supprimer la ligne (cascade queue/turns).
  FOR v_old_table_id IN
    SELECT DISTINCT p.table_id
    FROM participants p
    JOIN tables t ON t.id = p.table_id
    WHERE p.user_id = auth.uid() AND t.session_id = p_session_id
  LOOP
    UPDATE tables
    SET current_speaker_id = NULL, current_turn_started_at = NULL
    WHERE id = v_old_table_id
      AND current_speaker_id IN (
        SELECT id FROM participants WHERE table_id = v_old_table_id AND user_id = auth.uid()
      );

    UPDATE speaking_turns
    SET ended_at = now()
    WHERE table_id = v_old_table_id
      AND participant_id IN (
        SELECT id FROM participants WHERE table_id = v_old_table_id AND user_id = auth.uid()
      )
      AND ended_at IS NULL;

    DELETE FROM participants WHERE table_id = v_old_table_id AND user_id = auth.uid();
  END LOOP;

  INSERT INTO participants (table_id, user_id, pseudo)
  VALUES (v_table_id, auth.uid(), p_pseudo)
  ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
  RETURNING id INTO v_participant_id;

  PERFORM sync_table_assignment(p_session_id, v_table_id, auth.uid(), p_pseudo);

  SELECT jsonb_build_object(
    'id',                      s.id,
    'join_code',               s.join_code,
    'created_by',              s.created_by,
    'current_speaker_id',      s.current_speaker_id,
    'current_turn_started_at', s.current_turn_started_at,
    'created_at',              s.created_at,
    'participant_id',          v_participant_id
  ) INTO v_result
  FROM tables s WHERE s.id = v_table_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION switch_table(uuid, text, text) TO anon, authenticated;
