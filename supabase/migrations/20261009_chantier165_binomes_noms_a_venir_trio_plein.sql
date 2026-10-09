-- Chantier 165 — binômes / trios : noms à venir, trio plein, demandes reçues.
--
-- Demande de Jules (2026-10-09) :
--   1. quelqu'un qui m'a cité doit pouvoir me le faire savoir (« déclare-la en
--      retour ») → get_pairing_requests ;
--   2. on peut citer un nom qui n'existe pas (encore) : le choix est GARDÉ et se
--      lie tout seul si quelqu'un s'inscrit avec ce nom → colonne target_pseudo,
--      target_member_id devient nullable, trigger de résolution sur session_members ;
--   3. deux liens qui partagent une personne forment d'office un trio (déjà le cas
--      côté algorithme : union-find de buildClusters) et QUELQU'UN DE PLUS EST REFUSÉ
--      dès la saisie → set_my_pairings vérifie la taille du groupe résultant.
--
-- Comparé à la définition en base (pg_get_functiondef, dev, 2026-10-09) avant
-- réécriture : set_my_pairings (chantier 115, phase voting seule) et
-- get_my_pairings (chantier 92). get_session_pairings_admin est INCHANGÉE : sa
-- jointure sur target_member_id écarte naturellement les lignes « nom à venir ».
--
-- CLUSTER_MAX = 3 est aussi codé dans src/lib/allocation.ts (garde de secours de
-- buildClusters, qui reste en place : une taille > 3 ne peut plus naître d'une
-- saisie mais pourrait naître d'un renommage — voir le trigger ci-dessous).

-- ---------------------------------------------------------------------------
-- 1. Table : une ligne peut viser un nom pas encore inscrit.
-- ---------------------------------------------------------------------------
ALTER TABLE public.member_pairings DROP CONSTRAINT IF EXISTS member_pairings_pkey;
ALTER TABLE public.member_pairings DROP CONSTRAINT IF EXISTS member_pairings_check;

ALTER TABLE public.member_pairings ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.member_pairings ADD CONSTRAINT member_pairings_pkey PRIMARY KEY (id);

ALTER TABLE public.member_pairings ALTER COLUMN target_member_id DROP NOT NULL;

-- Le nom tel que la personne l'a saisi (ou, pour les lignes antérieures, le
-- pseudo de la personne visée).
ALTER TABLE public.member_pairings ADD COLUMN IF NOT EXISTS target_pseudo text;
UPDATE public.member_pairings mp
SET target_pseudo = sm.pseudo
FROM public.session_members sm
WHERE sm.id = mp.target_member_id AND mp.target_pseudo IS NULL;
ALTER TABLE public.member_pairings ALTER COLUMN target_pseudo SET NOT NULL;

ALTER TABLE public.member_pairings
  ADD CONSTRAINT member_pairings_check CHECK (target_member_id IS NULL OR member_id <> target_member_id);

CREATE UNIQUE INDEX IF NOT EXISTS member_pairings_resolved_uq
  ON public.member_pairings (member_id, target_member_id) WHERE target_member_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS member_pairings_pending_uq
  ON public.member_pairings (member_id, lower(btrim(target_pseudo))) WHERE target_member_id IS NULL;
CREATE INDEX IF NOT EXISTS member_pairings_target_idx
  ON public.member_pairings (target_member_id) WHERE target_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS member_pairings_pending_name_idx
  ON public.member_pairings (session_id, lower(btrim(target_pseudo))) WHERE target_member_id IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Un nom à venir se lie tout seul quand quelqu'un s'inscrit (ou se renomme)
--    avec exactement ce nom (insensible à la casse et aux espaces de bord).
--    Aucun lien ne naît ici : un lien exige la réciprocité, donc que la
--    personne arrivée cite à son tour — et c'est set_my_pairings qui contrôle
--    alors la taille du groupe.
-- ---------------------------------------------------------------------------
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
    AND lower(btrim(mp.target_pseudo)) = lower(btrim(NEW.pseudo))
    AND NOT EXISTS (
      SELECT 1 FROM member_pairings x
      WHERE x.member_id = mp.member_id AND x.target_member_id = NEW.id
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS session_members_resolve_pairings ON public.session_members;
CREATE TRIGGER session_members_resolve_pairings
  AFTER INSERT OR UPDATE OF pseudo ON public.session_members
  FOR EACH ROW EXECUTE FUNCTION public.resolve_pending_pairings();

REVOKE ALL ON FUNCTION public.resolve_pending_pairings() FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Groupe d'une personne = elle + tous ceux qui lui sont reliés par des
--    liens RÉCIPROQUES (fermeture transitive). Interne : aucun droit client.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pairing_cluster_ids(p_member uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH RECURSIVE c(id) AS (
    SELECT p_member
    UNION
    SELECT a.target_member_id
    FROM member_pairings a
    JOIN c ON a.member_id = c.id
    JOIN member_pairings b
      ON b.member_id = a.target_member_id AND b.target_member_id = a.member_id
    WHERE a.target_member_id IS NOT NULL
  )
  SELECT array_agg(id) FROM c;
$$;

REVOKE ALL ON FUNCTION public.pairing_cluster_ids(uuid) FROM public, anon, authenticated;

-- Taille du groupe obtenu en reliant deux personnes (0 = déjà dans le même groupe,
-- donc aucune croissance). Interne.
CREATE OR REPLACE FUNCTION public.pairing_merged_size(p_a uuid, p_b uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT CASE
    WHEN p_b = ANY(pairing_cluster_ids(p_a)) THEN 0
    ELSE (SELECT count(DISTINCT x) FROM unnest(pairing_cluster_ids(p_a) || pairing_cluster_ids(p_b)) x)::int
  END;
$$;

REVOKE ALL ON FUNCTION public.pairing_merged_size(uuid, uuid) FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. set_my_pairings : garde les noms inconnus, refuse de grossir un trio.
--    Retour : {results:[{pseudo, found, saved, reciprocal, refused}], placed_table_number}
--      found    = un membre porte ce nom aujourd'hui
--      saved    = le choix est enregistré (faux si refusé, ou si c'est mon propre nom)
--      refused  = NULL | 'self' | 'target_full' | 'too_big'
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
    CONTINUE WHEN lower(v_pseudo) = ANY(v_seen);     -- même nom saisi deux fois
    EXIT WHEN v_count >= 2;
    v_count := v_count + 1;
    v_seen := v_seen || lower(v_pseudo);

    IF lower(v_pseudo) = lower(btrim(v_me_pseudo)) THEN
      v_results := v_results || jsonb_build_object(
        'pseudo', v_pseudo, 'found', true, 'saved', false, 'reciprocal', false, 'refused', 'self');
      CONTINUE;
    END IF;

    SELECT id, pseudo INTO v_target, v_target_ps
    FROM session_members
    WHERE session_id = p_session_id
      AND lower(btrim(pseudo)) = lower(v_pseudo)
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

-- ---------------------------------------------------------------------------
-- 5. get_my_pairings : mes choix, y compris les noms à venir.
--    found     = la personne existe dans la séance
--    reciprocal= elle m'a cité aussi
--    blocked   = lien impossible tant que les groupes restent ce qu'ils sont
--                (le trio de l'autre est plein, ou la fusion dépasserait 3)
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
  SELECT id INTO v_me FROM session_members
  WHERE session_id = p_session_id AND user_id = auth.uid() LIMIT 1;
  IF v_me IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'pseudo',     COALESCE(sm.pseudo, mp.target_pseudo),
             'found',      mp.target_member_id IS NOT NULL,
             'reciprocal', mp.target_member_id IS NOT NULL AND EXISTS (
               SELECT 1 FROM member_pairings r
               WHERE r.member_id = mp.target_member_id AND r.target_member_id = v_me),
             'blocked',    mp.target_member_id IS NOT NULL
                           AND pairing_merged_size(v_me, mp.target_member_id) > 3
           ) ORDER BY mp.created_at)
    FROM member_pairings mp
    LEFT JOIN session_members sm ON sm.id = mp.target_member_id
    WHERE mp.member_id = v_me
  ), '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. get_pairing_requests : ceux qui m'ont cité et que je n'ai pas cités en
--    retour, et que je POURRAIS rejoindre (la fusion ne dépasse pas 3).
--    Sert à la notification « cette personne t'a choisi·e, déclare-la en retour ».
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_pairing_requests(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_me    uuid;
  v_phase text;
BEGIN
  SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;
  IF v_phase IS DISTINCT FROM 'voting' THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT id INTO v_me FROM session_members
  WHERE session_id = p_session_id AND user_id = auth.uid() LIMIT 1;
  IF v_me IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'member_id', sm.id,
             'pseudo',    sm.pseudo
           ) ORDER BY mp.created_at)
    FROM member_pairings mp
    JOIN session_members sm ON sm.id = mp.member_id
    WHERE mp.target_member_id = v_me
      AND mp.session_id = p_session_id
      AND NOT EXISTS (
        SELECT 1 FROM member_pairings back
        WHERE back.member_id = v_me AND back.target_member_id = mp.member_id)
      AND pairing_merged_size(v_me, mp.member_id) <= 3
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_pairings(uuid, text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_my_pairings(uuid, text[]) TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_pairings(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_pairings(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_pairing_requests(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_pairing_requests(uuid) TO authenticated;
