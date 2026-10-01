-- Chantier 116 — « Changer mon nom » : faire réapparaître son code de rappel.
--
-- Constat qui a changé le périmètre du chantier : depuis le chantier 93
-- (20260918_chantier93_identite_participant.sql), `session_members.reclaim_code`
-- (texte clair) a été remplacé par `reclaim_code_hash` (bcrypt) — vérifié en
-- base (`information_schema.columns`), CLAUDE.md et
-- `docs/reference-modele-donnees.md` n'ont pas été mis à jour sur ce point.
-- Un code haché est par construction irrécupérable : impossible de le
-- « faire réapparaître ». Seule option : en émettre un nouveau, comme le font
-- déjà `regenerate_reclaim_code_admin`/`_moderator`. Corps calqué sur ces deux
-- fonctions (définition courante en base vérifiée avant écriture), simplement
-- ciblé sur l'appelant lui-même (auth.uid()) plutôt que sur un member_id ou un
-- pseudo de table.
CREATE OR REPLACE FUNCTION public.regenerate_reclaim_code_self(
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_member session_members%ROWTYPE;
  v_code   text;
BEGIN
  SELECT * INTO v_member
  FROM session_members
  WHERE session_id = p_session_id
    AND user_id    = auth.uid()
  LIMIT 1;

  IF v_member.id IS NULL THEN
    RAISE EXCEPTION 'Tu n''es pas inscrit à cette séance';
  END IF;

  v_code := gen_member_reclaim_code(v_member.session_id);

  UPDATE session_members
  SET reclaim_code_hash = crypt(v_code, gen_salt('bf'))
  WHERE id = v_member.id;

  DELETE FROM reclaim_attempts
  WHERE session_id = v_member.session_id AND pseudo = v_member.pseudo;

  RETURN jsonb_build_object('pseudo', v_member.pseudo, 'new_reclaim_code', v_code);
END;
$$;

GRANT EXECUTE ON FUNCTION public.regenerate_reclaim_code_self(uuid) TO authenticated, anon;
