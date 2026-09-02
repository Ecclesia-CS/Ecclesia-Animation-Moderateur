-- Chantier 39 — suppression de la phase 'questionnaire' de la machine à états.
--
-- Le questionnaire post-débat ne dépend plus d'une phase de séance dédiée :
-- il se déclenche désormais automatiquement (force_session_questionnaire) au
-- moment où le superadmin fait passer la séance de 'debating' à 'closed'
-- (handlePhaseChange, SuperadminScreen.tsx). Les participants qui reviennent
-- après clôture sans avoir répondu se voient proposer le formulaire avant
-- l'écran de résultats (VoteScreen / AllocatingScreen / SessionRouterScreen —
-- gate désormais sur l'absence de ligne dans questionnaire_responses plutôt
-- que sur la phase).
--
-- Séances existantes en phase 'questionnaire' : le forçage du modal a déjà eu
-- lieu pour elles (c'était l'effet de bord du passage manuel en phase
-- questionnaire, cf. ancien handlePhaseChange) ; il ne leur manquait que la
-- clôture. On les fait donc passer directement à 'closed'.

UPDATE sessions
SET phase = 'closed', phase_changed_at = now()
WHERE phase = 'questionnaire';

-- Contrainte phase — retrait de 'questionnaire'
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_phase_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_phase_check
  CHECK (phase IN ('draft','pre_voting','voting','allocating','debating','closed'));

-- set_session_phase — retrait de 'questionnaire' de la liste des phases valides
CREATE OR REPLACE FUNCTION set_session_phase(
  p_password   text,
  p_session_id uuid,
  p_phase      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash text;
  v_row  sessions%ROWTYPE;
BEGIN
  IF p_phase NOT IN ('draft', 'pre_voting', 'voting', 'allocating', 'debating', 'closed') THEN
    RAISE EXCEPTION 'Phase invalide: %', p_phase;
  END IF;

  SELECT value INTO v_hash FROM app_config WHERE key = 'superadmin_code_hash';
  IF NOT crypt(p_password, v_hash) = v_hash THEN
    RAISE EXCEPTION 'Mot de passe superadmin incorrect';
  END IF;

  UPDATE sessions
  SET phase = p_phase, phase_changed_at = now()
  WHERE id = p_session_id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;
