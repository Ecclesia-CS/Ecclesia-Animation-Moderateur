-- Chantier 92 — Appairage entre participants.
--
-- Un membre cite 1 ou 2 personnes avec qui il veut être. Seuls les liens
-- RÉCIPROQUES sont transmis à l'allocation (décision : réciprocité obligatoire,
-- ce qui rend les chaînes impossibles à construire unilatéralement). Le
-- plafond de 3 par grappe est appliqué côté algorithme (src/lib/allocation.ts).
--
-- N'altère aucune fonction existante : get_allocation_inputs est laissée telle
-- quelle, les liens passent par une RPC admin dédiée.

CREATE TABLE IF NOT EXISTS public.member_pairings (
  session_id       uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  member_id        uuid NOT NULL REFERENCES public.session_members(id) ON DELETE CASCADE,
  target_member_id uuid NOT NULL REFERENCES public.session_members(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, target_member_id),
  CHECK (member_id <> target_member_id)
);

CREATE INDEX IF NOT EXISTS member_pairings_session_idx ON public.member_pairings(session_id);

ALTER TABLE public.member_pairings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_pairings_select_own ON public.member_pairings;
CREATE POLICY member_pairings_select_own ON public.member_pairings
  FOR SELECT USING (is_own_session_member(member_id));
-- Aucune policy d'écriture : tout passe par set_my_pairings.

-- ---------------------------------------------------------------------------
-- set_my_pairings : remplace les choix de l'appelant (0 à 2 pseudos).
-- Retour : [{pseudo, found, reciprocal}] + 'placed_table_number' si un
-- retardataire a été rattaché à la table d'une personne citée.
-- ---------------------------------------------------------------------------
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
  v_placed    int := NULL;
  v_ta        record;
  v_count     int := 0;
BEGIN
  SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;
  IF v_phase IS NULL OR v_phase NOT IN ('voting', 'allocating', 'debating') THEN
    RAISE EXCEPTION 'Les binômes ne peuvent être déclarés qu''en phase présentielle, allocation ou débat';
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

    -- Retardataire : allocation déjà faite, l'appelant n'a pas de table,
    -- la personne citée (réciproque) en a une → on le rattache à celle-ci.
    IF v_recip AND v_placed IS NULL AND v_phase IN ('allocating', 'debating')
       AND NOT EXISTS (SELECT 1 FROM table_assignments WHERE session_id = p_session_id AND member_id = v_me)
    THEN
      SELECT table_number, table_id INTO v_ta
      FROM table_assignments
      WHERE session_id = p_session_id AND member_id = v_target
      LIMIT 1;
      IF FOUND THEN
        INSERT INTO table_assignments (session_id, member_id, table_number, table_id)
        VALUES (p_session_id, v_me, v_ta.table_number, v_ta.table_id)
        ON CONFLICT (session_id, member_id) DO NOTHING;
        v_placed := v_ta.table_number;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('results', v_results, 'placed_table_number', v_placed);
END;
$$;

-- ---------------------------------------------------------------------------
-- get_my_pairings : mes choix actuels, avec leur statut de réciprocité.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_pairings(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_me uuid;
BEGIN
  SELECT id INTO v_me
  FROM session_members
  WHERE session_id = p_session_id AND user_id = auth.uid()
  LIMIT 1;
  IF v_me IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'pseudo', sm.pseudo,
             'reciprocal', EXISTS (
               SELECT 1 FROM member_pairings r
               WHERE r.member_id = mp.target_member_id AND r.target_member_id = v_me)
           ) ORDER BY mp.created_at)
    FROM member_pairings mp
    JOIN session_members sm ON sm.id = mp.target_member_id
    WHERE mp.member_id = v_me
  ), '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- get_session_pairings_admin : liens réciproques de la séance, pour
-- l'allocation et l'onglet Groupes. Chaque paire une seule fois (a < b),
-- avec la date du lien le plus récent (sert au découpage déterministe).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_session_pairings_admin(p_password text, p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM check_superadmin_password(p_password);

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'a', a.member_id, 'b', a.target_member_id,
             'created_at', GREATEST(a.created_at, b.created_at))
           ORDER BY GREATEST(a.created_at, b.created_at), a.member_id)
    FROM member_pairings a
    JOIN member_pairings b
      ON b.member_id = a.target_member_id AND b.target_member_id = a.member_id
    WHERE a.session_id = p_session_id
      AND a.member_id < a.target_member_id
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_pairings(uuid, text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_my_pairings(uuid, text[]) TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_pairings(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_pairings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_pairings_admin(text, uuid) TO anon, authenticated;
