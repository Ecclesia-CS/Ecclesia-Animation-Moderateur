-- =============================================================
-- Chantier B3 — reconnexion avec un pseudo déjà pris en phase pré-vote
--
-- register_session_member échoue avec "Pseudo déjà pris" quand un pseudo
-- pré-vote a déjà été enregistré (perte d'identité locale : User ID
-- instable dans certains navigateurs). PseudoForm n'avait aucun chemin de
-- reconquête (contrairement à VotingEntryForm en phase `voting`, qui
-- retombe automatiquement sur confirm_attendance).
--
-- Nouvelle RPC dédiée plutôt que réutiliser confirm_attendance : celle-ci
-- marque toujours attending_in_person = true, ce qui serait faux pour une
-- reconquête purement à distance en pre_voting (le membre resterait
-- inscrit comme "à distance", cf. `attending_in_person` en pre_voting =
-- false par défaut, doc CLAUDE.md). reclaim_prevoting_member ne touche
-- jamais cette colonne.
--
-- Phase-safe : n'agit que si la séance est encore en `pre_voting`, pour ne
-- jamais interférer avec le chemin de reconquête existant de la phase
-- `voting` (confirm_attendance), qui a une sémantique différente
-- (confirmation de présence physique) et reste inchangé.
-- =============================================================

CREATE OR REPLACE FUNCTION reclaim_prevoting_member(
  p_session_id uuid,
  p_pseudo     text DEFAULT NULL,
  p_code       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_phase         text;
  v_caller        uuid := auth.uid();
  v_caller_member session_members%ROWTYPE;
  v_target        session_members%ROWTYPE;
BEGIN
  SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;
  IF v_phase IS NULL THEN
    RAISE EXCEPTION 'Séance introuvable';
  END IF;
  IF v_phase != 'pre_voting' THEN
    RAISE EXCEPTION 'La reconquête d''un profil pré-vote n''est disponible qu''en phase de vote à distance (phase actuelle : %)', v_phase;
  END IF;

  -- Si l'appelant a déjà un profil sur cette séance, rien à reconquérir —
  -- on le retourne tel quel plutôt que de risquer une violation de la
  -- contrainte UNIQUE(session_id, user_id) sur l'UPDATE ci-dessous.
  SELECT * INTO v_caller_member
  FROM session_members
  WHERE session_id = p_session_id AND user_id = v_caller;

  IF v_caller_member.id IS NOT NULL THEN
    RETURN to_jsonb(v_caller_member);
  END IF;

  IF p_code IS NOT NULL THEN
    SELECT * INTO v_target
    FROM session_members
    WHERE session_id = p_session_id AND reclaim_code = p_code;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Code de rappel invalide';
    END IF;
  ELSIF p_pseudo IS NOT NULL THEN
    SELECT * INTO v_target
    FROM session_members
    WHERE session_id = p_session_id AND pseudo = p_pseudo;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pseudo introuvable pour cette séance';
    END IF;
  ELSE
    RAISE EXCEPTION 'Fournir un pseudo ou un code de rappel';
  END IF;

  -- Ne touche jamais attending_in_person : reste un profil de vote à
  -- distance, contrairement à confirm_attendance (phase voting).
  UPDATE session_members
  SET user_id = v_caller
  WHERE id = v_target.id
  RETURNING * INTO v_target;

  RETURN to_jsonb(v_target);
END;
$$;
