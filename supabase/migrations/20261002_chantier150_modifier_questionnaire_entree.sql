-- Chantier 150 — modifier son questionnaire d'entrée pendant le vote.
--
-- `submit_entry_response` faisait déjà un « insert ou met à jour » (ON CONFLICT
-- (session_id, member_id) DO UPDATE), sans aucune garde de phase : un client
-- pouvait donc réécrire ses réponses d'onboarding à n'importe quel moment, y
-- compris pendant `allocating`, et fausser le calcul d'allocation (consentement
-- → règle 1, ancienneté → règles 4/5, actif/passif → chantier 91).
--
-- Règle (Jules, 2026-10-02) : la MODIFICATION d'une réponse déjà enregistrée
-- n'est permise qu'en phase `voting`. La PREMIÈRE saisie reste libre dans toutes
-- les phases où l'onboarding existe (chantier 61 : on peut encore s'inscrire
-- pendant `allocating`).
--
-- Corps repris de la définition courante en base (pg_get_functiondef, dev
-- 2026-10-02), seule la garde est ajoutée. Signature inchangée : CREATE OR
-- REPLACE conserve les droits d'exécution existants.

CREATE OR REPLACE FUNCTION public.submit_entry_response(
  p_session_id uuid,
  p_consent_transcript boolean,
  p_participation_style text,
  p_ecclesia_experience boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_member_id uuid;
  v_response  entry_responses%ROWTYPE;
  v_phase     text;
BEGIN
  SELECT id INTO v_member_id
  FROM session_members
  WHERE session_id = p_session_id AND user_id = auth.uid()
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Vous n''êtes pas inscrit à cette séance';
  END IF;

  -- Chantier 150 — garde : réécrire une réponse existante exige la phase voting.
  IF EXISTS (
    SELECT 1 FROM entry_responses
    WHERE session_id = p_session_id AND member_id = v_member_id
  ) THEN
    SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;
    IF v_phase IS DISTINCT FROM 'voting' THEN
      RAISE EXCEPTION 'Le questionnaire d''entrée ne peut plus être modifié : il n''est modifiable que pendant le vote en présentiel.';
    END IF;
  END IF;

  INSERT INTO entry_responses(
    session_id, member_id,
    consent_transcript, participation_style, ecclesia_experience
  ) VALUES (
    p_session_id, v_member_id,
    p_consent_transcript, p_participation_style, COALESCE(p_ecclesia_experience, false)
  )
  ON CONFLICT (session_id, member_id) DO UPDATE SET
    consent_transcript  = EXCLUDED.consent_transcript,
    participation_style = EXCLUDED.participation_style,
    ecclesia_experience = EXCLUDED.ecclesia_experience
  RETURNING * INTO v_response;

  RETURN to_jsonb(v_response);
END;
$function$;
