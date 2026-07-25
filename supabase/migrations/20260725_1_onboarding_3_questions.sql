-- =============================================================
-- Chantier 19 (G3) — Questionnaire d'onboarding : 6 → 3 questions
-- Spec §8 de docs/chantier-5-allocation-v2-spec.md
--
-- Conservées (elles alimentent l'algorithme d'allocation v2) :
--   · consent_transcript   → règle 2 (table enregistrable)
--   · participation_style  → règle 1 (assez d'actifs)
--   · ecclesia_experience  → règles 4 et 5, reformulée en BINAIRE
--                            « As-tu déjà fait un débat Ecclesia ? »
--
-- Supprimées (plus utilisées par rien) :
--   · moderator_pref    — remplacée par la règle 5
--   · group_size_pref   — inutilisée
--   · openness_to_diff  — inutilisée
--
-- ⚠️ Ordre d'application : cette migration doit passer AVANT
--    20260725_2_allocation_v2.sql (qui lit ecclesia_experience en booléen).
-- =============================================================

-- ─── 1. ecclesia_experience : text ('never'|'once_twice'|'several_times') → boolean ───
-- 'never' → false (nouveau) ; toute autre réponse → true (ancien).
-- NULL (pas de réponse) → false : conservateur, cohérent avec le traitement
-- des membres sans onboarding côté algorithme (§6).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entry_responses'
      AND column_name = 'ecclesia_experience'
      AND data_type <> 'boolean'
  ) THEN
    ALTER TABLE entry_responses ADD COLUMN ecclesia_experience_bool boolean;

    UPDATE entry_responses
    SET ecclesia_experience_bool =
      (ecclesia_experience IS NOT NULL AND ecclesia_experience <> 'never');

    ALTER TABLE entry_responses DROP COLUMN ecclesia_experience;
    ALTER TABLE entry_responses RENAME COLUMN ecclesia_experience_bool TO ecclesia_experience;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entry_responses' AND column_name = 'ecclesia_experience'
  ) THEN
    ALTER TABLE entry_responses ADD COLUMN ecclesia_experience boolean;
  END IF;
END $$;

ALTER TABLE entry_responses ALTER COLUMN ecclesia_experience SET DEFAULT false;

COMMENT ON COLUMN entry_responses.ecclesia_experience IS
  'A déjà participé à un débat Ecclesia (binaire, déclaratif). '
  'true = ancien → règles 4 et 5 de l''allocation v2. NULL traité comme false.';

-- ─── 2. Suppression des trois colonnes caduques ───
-- get_moderator_responses lit moderator_pref : elle est supprimée par
-- 20260725_3_deprecate_chantier5.sql, mais on la retire ici aussi (CASCADE
-- n'est pas nécessaire : une fonction plpgsql n'est pas une dépendance de
-- colonne, elle échouerait seulement à l'exécution).
DROP FUNCTION IF EXISTS get_moderator_responses(text, uuid);

ALTER TABLE entry_responses DROP COLUMN IF EXISTS moderator_pref;
ALTER TABLE entry_responses DROP COLUMN IF EXISTS group_size_pref;
ALTER TABLE entry_responses DROP COLUMN IF EXISTS openness_to_diff;

-- ─── 3. submit_entry_response — nouvelle signature à 3 réponses ───
-- L'ancienne signature (7 paramètres) est supprimée : le frontend est
-- migré dans le même commit, aucun client ne l'appelle plus.
DROP FUNCTION IF EXISTS submit_entry_response(uuid, boolean, text, boolean, int, text);
DROP FUNCTION IF EXISTS submit_entry_response(uuid, boolean, text, boolean, int, text, text);

CREATE OR REPLACE FUNCTION submit_entry_response(
  p_session_id          uuid,
  p_consent_transcript  boolean,
  p_participation_style text,
  p_ecclesia_experience boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_member_id uuid;
  v_response  entry_responses%ROWTYPE;
BEGIN
  SELECT id INTO v_member_id
  FROM session_members
  WHERE session_id = p_session_id AND user_id = auth.uid()
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Vous n''êtes pas inscrit à cette séance';
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
$$;

GRANT EXECUTE ON FUNCTION submit_entry_response(uuid, boolean, text, boolean) TO anon, authenticated;

-- ─── 4. run_clustering_v3 lisait participation_style : inchangé (colonne
--        conservée). v1/v2 ne lisent aucune des colonnes supprimées.
