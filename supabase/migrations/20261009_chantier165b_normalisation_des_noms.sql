-- Chantier 165b — comparaison des noms insensible aux espaces multiples.
--
-- Constaté au navigateur : « T165  bruno » (deux espaces au milieu) ne se liait
-- pas à « T165 Bruno ». Le rapprochement par nom (set_my_pairings, trigger de
-- résolution, unicité des noms à venir) comparait `lower(btrim(x))` ; il compare
-- désormais `pairing_norm(x)` = minuscules, bords rognés, espaces internes
-- ramenés à un seul. Les accents ne sont PAS ignorés (« Gaëlle » ≠ « Gaelle »).
--
-- Se rejoue après 20261009_chantier165_*. Comparé à la définition en base
-- (pg_get_functiondef, dev) : seules les comparaisons de nom changent dans
-- set_my_pairings et resolve_pending_pairings.

CREATE OR REPLACE FUNCTION public.pairing_norm(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT regexp_replace(lower(btrim(p_name)), '\s+', ' ', 'g');
$$;

DROP INDEX IF EXISTS public.member_pairings_pending_uq;
DROP INDEX IF EXISTS public.member_pairings_pending_name_idx;
CREATE UNIQUE INDEX member_pairings_pending_uq
  ON public.member_pairings (member_id, public.pairing_norm(target_pseudo)) WHERE target_member_id IS NULL;
CREATE INDEX member_pairings_pending_name_idx
  ON public.member_pairings (session_id, public.pairing_norm(target_pseudo)) WHERE target_member_id IS NULL;

CREATE OR REPLACE FUNCTION public.resolve_pending_pairings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE member_pairings mp
  SET target_member_id = NEW.id
  WHERE mp.session_id = NEW.session_id
    AND mp.target_member_id IS NULL
    AND mp.member_id <> NEW.id
    AND pairing_norm(mp.target_pseudo) = pairing_norm(NEW.pseudo)
    AND NOT EXISTS (
      SELECT 1 FROM member_pairings x
      WHERE x.member_id = mp.member_id AND x.target_member_id = NEW.id
    );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_pending_pairings() FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_my_pairings(p_session_id uuid, p_pseudos text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_phase     text;
  v_me        uuid;
  v_me_pseudo text;
  v_pseudo    text;
  v_target    uuid;
  v_target_ps text;
  v_results   jsonb := '[]'::jsonb;
  v_recip     boolean;
  v_count     int := 0;
  v_seen      text[] := ARRAY[]::text[];
  v_merged    int;
BEGIN
  SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;
  IF v_phase IS NULL OR v_phase <> 'voting' THEN
    RAISE EXCEPTION 'Les binômes ne peuvent être déclarés qu''en phase de vote présentiel';
  END IF;

  SELECT id, pseudo INTO v_me, v_me_pseudo
  FROM session_members
  WHERE session_id = p_session_id AND user_id = auth.uid()
  LIMIT 1;
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Membre de séance introuvable';
  END IF;

  -- Mes choix sont REMPLACÉS : on les efface d'abord, pour que la taille du
  -- groupe soit calculée sans les anciens liens que je suis en train de refaire.
  DELETE FROM member_pairings WHERE member_id = v_me;

  FOREACH v_pseudo IN ARRAY COALESCE(p_pseudos, ARRAY[]::text[]) LOOP
    v_pseudo := btrim(v_pseudo);
    CONTINUE WHEN v_pseudo = '';
    CONTINUE WHEN pairing_norm(v_pseudo) = ANY(v_seen);     -- même nom saisi deux fois
    EXIT WHEN v_count >= 2;
    v_count := v_count + 1;
    v_seen := v_seen || pairing_norm(v_pseudo);

    IF pairing_norm(v_pseudo) = pairing_norm(v_me_pseudo) THEN
      v_results := v_results || jsonb_build_object(
        'pseudo', v_pseudo, 'found', true, 'saved', false, 'reciprocal', false, 'refused', 'self');
      CONTINUE;
    END IF;

    SELECT id, pseudo INTO v_target, v_target_ps
    FROM session_members
    WHERE session_id = p_session_id
      AND pairing_norm(pseudo) = pairing_norm(v_pseudo)
      AND id <> v_me
    LIMIT 1;

    -- Nom qui n'existe pas (encore) : on le garde, il se liera à l'arrivée.
    IF v_target IS NULL THEN
      INSERT INTO member_pairings (session_id, member_id, target_member_id, target_pseudo)
      VALUES (p_session_id, v_me, NULL, v_pseudo)
      ON CONFLICT DO NOTHING;
      v_results := v_results || jsonb_build_object(
        'pseudo', v_pseudo, 'found', false, 'saved', true, 'reciprocal', false, 'refused', NULL);
      CONTINUE;
    END IF;

    -- Trio plein : se rattacher à un groupe qui dépasserait 3 est refusé.
    v_merged := pairing_merged_size(v_me, v_target);
    IF v_merged > 3 THEN
      v_results := v_results || jsonb_build_object(
        'pseudo', v_target_ps, 'found', true, 'saved', false, 'reciprocal', false,
        'refused', CASE WHEN cardinality(pairing_cluster_ids(v_target)) >= 3 THEN 'target_full' ELSE 'too_big' END);
      CONTINUE;
    END IF;

    INSERT INTO member_pairings (session_id, member_id, target_member_id, target_pseudo)
    VALUES (p_session_id, v_me, v_target, v_target_ps)
    ON CONFLICT DO NOTHING;

    SELECT EXISTS (
      SELECT 1 FROM member_pairings WHERE member_id = v_target AND target_member_id = v_me
    ) INTO v_recip;

    v_results := v_results || jsonb_build_object(
      'pseudo', v_target_ps, 'found', true, 'saved', true, 'reciprocal', v_recip, 'refused', NULL);
  END LOOP;

  RETURN jsonb_build_object('results', v_results, 'placed_table_number', NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_pairings(uuid, text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_my_pairings(uuid, text[]) TO authenticated;
