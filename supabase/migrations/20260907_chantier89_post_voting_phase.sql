-- Chantier 89 — nouvelle phase 'post_voting', insérée entre 'debating' et
-- 'closed'.
--
-- Jules : « quand on finit le débat, le participant arrive sur la même page
-- que précédemment (résultats + proposition de revoter). S'il ne veut pas
-- revoter, il part. Et quand on est en phase de clôture, on n'a plus accès
-- à ce revote. »
--
-- Avant cette migration, la fin du débat passait directement en 'closed',
-- et l'écran de revote (PostVoteScreen, chantier 69) restait accessible
-- indéfiniment après clôture — jamais coupé. Désormais :
--   debating → post_voting : le superadmin clique "Passer en Post-vote"
--     (déclenche le questionnaire, comme le faisait avant le passage en
--     'closed' — cf. handlePhaseChange, SuperadminScreen.tsx). Le
--     participant voit ses résultats et peut revoter.
--   post_voting → closed : coupe le revote (ResultsMapScreen ne montre plus
--     le bouton "↻ Revoter" que si phase === 'post_voting'). Purge du
--     reclaim_code inchangée : toujours déclenchée sur l'entrée en 'closed'.
--
-- Comparé à la définition courante en base (vérifiée via pg_get_functiondef
-- avant migration, cf. CLAUDE.md § Règle SQL) : set_session_phase n'ajoute
-- que 'post_voting' à la liste blanche des phases, rien d'autre ne change.

ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_phase_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_phase_check
  CHECK (phase IN ('draft','pre_voting','voting','allocating','debating','post_voting','closed'));

CREATE OR REPLACE FUNCTION set_session_phase(
  p_password   text,
  p_session_id uuid,
  p_phase      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
  v_row  sessions%ROWTYPE;
BEGIN
  IF p_phase NOT IN ('draft', 'pre_voting', 'voting', 'allocating', 'debating', 'post_voting', 'closed') THEN
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

  IF p_phase = 'closed' THEN
    UPDATE session_members
    SET reclaim_code = NULL
    WHERE session_id = p_session_id AND reclaim_code IS NOT NULL;
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;
