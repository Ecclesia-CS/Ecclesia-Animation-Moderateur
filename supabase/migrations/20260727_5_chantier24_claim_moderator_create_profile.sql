-- =============================================================
-- Chantier 24 (H4) — claim_moderator_status : créer le profil
-- à la volée si l'appareil n'a pas encore de session_member pour
-- cette séance, au lieu d'exiger une inscription préalable.
--
-- Cas (a) — pas de profil pour auth.uid() sur cette séance :
--   on inscrit directement (comme register_session_member),
--   attending_in_person = true, puis is_moderator = true.
-- Cas (b) — profil déjà existant (a voté / s'est inscrit) :
--   comportement inchangé, on marque juste is_moderator = true.
--
-- Le nombre d'arguments change (2 → 3) : un CREATE OR REPLACE seul créerait
-- une surcharge à côté de l'ancienne fonction à 2 arguments au lieu de la
-- remplacer (Postgres ne réutilise l'entrée existante que si la liste de
-- types d'arguments est strictement identique), rendant tout appel à 2
-- arguments ambigu ("function is not unique"). Même piège que la migration
-- du chantier 22 sur update_session_config — DROP explicite requis avant.
-- =============================================================

DROP FUNCTION IF EXISTS claim_moderator_status(uuid, text);

CREATE OR REPLACE FUNCTION claim_moderator_status(
  p_session_id    uuid,
  p_creation_code text,
  p_pseudo        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_hash   text;
  v_member session_members%ROWTYPE;
  v_phase  text;
BEGIN
  SELECT value INTO v_hash FROM app_config WHERE key = 'creation_code_hash';
  IF v_hash IS NULL OR crypt(p_creation_code, v_hash) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'Code Ecclesia invalide';
  END IF;

  -- Cas (b) : déjà inscrit sur cet appareil pour cette séance → on marque, c'est tout.
  UPDATE session_members
  SET is_moderator = true
  WHERE session_id = p_session_id
    AND user_id = auth.uid()
  RETURNING * INTO v_member;

  IF FOUND THEN
    RETURN to_jsonb(v_member);
  END IF;

  -- Cas (a) : aucun profil — on en crée un, comme une inscription normale.
  IF p_pseudo IS NULL OR btrim(p_pseudo) = '' THEN
    RAISE EXCEPTION 'Nom prénom requis pour se déclarer modérateur';
  END IF;

  SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;
  IF v_phase IS NULL THEN
    RAISE EXCEPTION 'Séance introuvable';
  END IF;
  IF v_phase NOT IN ('pre_voting', 'voting', 'allocating') THEN
    RAISE EXCEPTION 'La séance n''est pas dans une phase permettant l''inscription (phase: %)', v_phase;
  END IF;

  BEGIN
    INSERT INTO session_members(session_id, user_id, pseudo, joined_phase, attending_in_person, is_moderator)
    VALUES (p_session_id, auth.uid(), btrim(p_pseudo), v_phase, true, true)
    RETURNING * INTO v_member;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Ce nom prénom est déjà pris pour cette séance';
  END;

  RETURN to_jsonb(v_member);
END;
$$;

GRANT EXECUTE ON FUNCTION claim_moderator_status(uuid, text, text) TO anon, authenticated;
