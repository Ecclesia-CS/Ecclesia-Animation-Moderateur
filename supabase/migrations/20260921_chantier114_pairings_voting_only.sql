-- Chantier 114 — resserre set_my_pairings à la phase voting.
--
-- Le rattachement automatique d'un retardataire à la table d'un binôme
-- réciproque (chantier 92, phases allocating/debating) est retiré : décision
-- de Jules, le geste est plus simple en demandant directement le code de
-- table à la personne visée (nouveau bouton « Changer de table » côté débat,
-- src/components/voting/ChangeTableModal.tsx). Un binôme déclaré une fois les
-- tables créées ne servait de toute façon à rien pour qui était déjà assis
-- (le garde `NOT EXISTS (... table_assignments ...)` bloquait silencieusement
-- tout déplacement) — seul le cas retardataire fonctionnait, et il est
-- couvert autrement maintenant.
--
-- Comparé à la définition en base avant migration (pg_get_functiondef) :
-- seul le corps change (phase acceptée + suppression du bloc de
-- rattachement) ; signature, droits et get_my_pairings/get_session_pairings_admin
-- inchangés.

CREATE OR REPLACE FUNCTION public.set_my_pairings(p_session_id uuid, p_pseudos text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_phase     text;
  v_me        uuid;
  v_pseudo    text;
  v_target    uuid;
  v_results   jsonb := '[]'::jsonb;
  v_recip     boolean;
  v_count     int := 0;
BEGIN
  SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;
  IF v_phase IS NULL OR v_phase <> 'voting' THEN
    RAISE EXCEPTION 'Les binômes ne peuvent être déclarés qu''en phase de vote présentiel';
  END IF;

  SELECT id INTO v_me
  FROM session_members
  WHERE session_id = p_session_id AND user_id = auth.uid()
  LIMIT 1;
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Membre de séance introuvable';
  END IF;

  DELETE FROM member_pairings WHERE member_id = v_me;

  FOREACH v_pseudo IN ARRAY COALESCE(p_pseudos, ARRAY[]::text[]) LOOP
    v_pseudo := btrim(v_pseudo);
    CONTINUE WHEN v_pseudo = '';
    EXIT WHEN v_count >= 2;
    v_count := v_count + 1;

    SELECT id INTO v_target
    FROM session_members
    WHERE session_id = p_session_id
      AND lower(btrim(pseudo)) = lower(v_pseudo)
      AND id <> v_me
    LIMIT 1;

    IF v_target IS NULL THEN
      v_results := v_results || jsonb_build_object('pseudo', v_pseudo, 'found', false, 'reciprocal', false);
      CONTINUE;
    END IF;

    INSERT INTO member_pairings (session_id, member_id, target_member_id)
    VALUES (p_session_id, v_me, v_target)
    ON CONFLICT DO NOTHING;

    SELECT EXISTS (
      SELECT 1 FROM member_pairings WHERE member_id = v_target AND target_member_id = v_me
    ) INTO v_recip;

    v_results := v_results || jsonb_build_object('pseudo', v_pseudo, 'found', true, 'reciprocal', v_recip);
  END LOOP;

  RETURN jsonb_build_object('results', v_results, 'placed_table_number', NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_pairings(uuid, text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_my_pairings(uuid, text[]) TO authenticated;
