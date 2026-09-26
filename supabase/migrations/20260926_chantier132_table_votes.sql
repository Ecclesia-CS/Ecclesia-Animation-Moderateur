-- Chantier 132 — outil "proposer un vote" côté modérateur
--
-- Nouveau mécanisme complet, totalement séparé du système d'assertions/vote du Bloc C
-- (Jules insiste explicitement sur cette séparation, docs/chantiers-a-faire.md § 132) :
-- le modérateur rédige une question à N options, chaque participant répond oui/non
-- sur CHAQUE option indépendamment (pas un choix exclusif), et le modérateur ne voit
-- jamais que des décomptes agrégés — jamais qui a répondu quoi. Cycle de vie : un vote
-- actif → clôturé → le modérateur peut en relancer un autre ensuite (historique conservé).
--
-- Modélisation retenue : `tables.active_vote_id` pointe vers le DERNIER vote créé pour
-- cette table (jamais remis à NULL après clôture) — ça permet de réutiliser tel quel le
-- canal Realtime `table:<table_id>` + le broadcast + le polling 5s déjà en place sur
-- `tables` (cf. `forceQuestionnaire`, CLAUDE.md § Realtime latence), sans ouvrir de
-- nouveau topic ni toucher `can_join_realtime_topic`. Le popup participant lit le champ
-- `status` de la ligne pointée pour savoir s'il doit afficher le formulaire ou le
-- résultat ; créer un nouveau vote change `active_vote_id` et retire donc implicitement
-- l'ancien de la vue, sans action de "dismiss" explicite à modéliser.
--
-- Anonymat : `table_vote_responses` n'a AUCUNE policy SELECT pour un tiers (ni le
-- participant sur les réponses des autres, ni le modérateur sur qui que ce soit) — la
-- seule policy est `user_id = auth.uid()` (lire ses propres réponses, pour afficher un
-- état "déjà répondu"). Tout décompte agrégé passe par une RPC SECURITY DEFINER dédiée
-- (`get_table_vote_results`), qui ne retourne jamais de ligne individuelle — même
-- schéma de principe que `get_vote_results` côté Bloc C.

-- ── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE public.table_votes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id   uuid        NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
  question   text        NOT NULL CHECK (char_length(question) BETWEEN 1 AND 300),
  status     text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_by uuid        NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at  timestamptz
);

CREATE INDEX table_votes_table_id_idx ON public.table_votes(table_id);

CREATE TABLE public.table_vote_options (
  id       uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id  uuid    NOT NULL REFERENCES public.table_votes(id) ON DELETE CASCADE,
  label    text    NOT NULL CHECK (char_length(label) BETWEEN 1 AND 200),
  position integer NOT NULL DEFAULT 0
);

CREATE INDEX table_vote_options_vote_id_idx ON public.table_vote_options(vote_id);

CREATE TABLE public.table_vote_responses (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id  uuid        NOT NULL REFERENCES public.table_vote_options(id) ON DELETE CASCADE,
  vote_id    uuid        NOT NULL REFERENCES public.table_votes(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL DEFAULT auth.uid(),
  answer     boolean     NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (option_id, user_id)
);

CREATE INDEX table_vote_responses_vote_id_idx ON public.table_vote_responses(vote_id);

ALTER TABLE public.tables
  ADD COLUMN active_vote_id uuid REFERENCES public.table_votes(id) ON DELETE SET NULL;

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.table_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY table_votes_select ON public.table_votes
  FOR SELECT USING (is_table_participant(table_id) OR is_table_moderator(table_id));

-- Pas de policy INSERT/UPDATE/DELETE : uniquement via create_table_vote/close_table_vote
-- (SECURITY DEFINER), pour garder le contrôle d'autorité côté modérateur centralisé.

ALTER TABLE public.table_vote_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY table_vote_options_select ON public.table_vote_options
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM table_votes v
      WHERE v.id = vote_id
        AND (is_table_participant(v.table_id) OR is_table_moderator(v.table_id))
    )
  );

ALTER TABLE public.table_vote_responses ENABLE ROW LEVEL SECURITY;

-- Lecture de ses PROPRES réponses uniquement (état "déjà répondu" côté participant) —
-- jamais d'accès aux réponses d'autrui, ni pour un participant ni pour le modérateur.
CREATE POLICY table_vote_responses_select_own ON public.table_vote_responses
  FOR SELECT USING (user_id = auth.uid());

-- Pas de policy INSERT/UPDATE : uniquement via submit_table_vote_response.

-- ── RPC : create_table_vote ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_table_vote(
  p_table_id uuid,
  p_question text,
  p_options  text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_vote_id  uuid;
  v_question text;
  v_label    text;
  v_pos      integer := 0;
  v_count    integer := 0;
BEGIN
  IF NOT is_table_moderator(p_table_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_question := NULLIF(TRIM(p_question), '');
  IF v_question IS NULL THEN
    RAISE EXCEPTION 'Question requise';
  END IF;

  INSERT INTO table_votes (table_id, question, status, created_by)
  VALUES (p_table_id, v_question, 'active', auth.uid())
  RETURNING id INTO v_vote_id;

  FOREACH v_label IN ARRAY p_options LOOP
    v_label := NULLIF(TRIM(v_label), '');
    IF v_label IS NOT NULL THEN
      INSERT INTO table_vote_options (vote_id, label, position)
      VALUES (v_vote_id, v_label, v_pos);
      v_pos   := v_pos + 1;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  IF v_count < 2 THEN
    RAISE EXCEPTION 'Au moins deux options valides sont requises';
  END IF;

  UPDATE tables SET active_vote_id = v_vote_id WHERE id = p_table_id;

  RETURN v_vote_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_table_vote(uuid, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_table_vote(uuid, text, text[]) TO anon, authenticated;

-- ── RPC : close_table_vote ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.close_table_vote(p_vote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_table_id uuid;
BEGIN
  SELECT table_id INTO v_table_id FROM table_votes WHERE id = p_vote_id;
  IF v_table_id IS NULL THEN
    RAISE EXCEPTION 'Vote introuvable';
  END IF;
  IF NOT is_table_moderator(v_table_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE table_votes
  SET status = 'closed', closed_at = now()
  WHERE id = p_vote_id AND status = 'active';
END;
$$;

REVOKE ALL ON FUNCTION public.close_table_vote(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_table_vote(uuid) TO anon, authenticated;

-- ── RPC : submit_table_vote_response ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_table_vote_response(p_option_id uuid, p_answer boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_vote_id  uuid;
  v_table_id uuid;
  v_status   text;
BEGIN
  SELECT o.vote_id, v.table_id, v.status
  INTO v_vote_id, v_table_id, v_status
  FROM table_vote_options o
  JOIN table_votes v ON v.id = o.vote_id
  WHERE o.id = p_option_id;

  IF v_vote_id IS NULL THEN
    RAISE EXCEPTION 'Option introuvable';
  END IF;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Ce vote est clôturé';
  END IF;
  IF NOT is_table_participant(v_table_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO table_vote_responses (option_id, vote_id, user_id, answer)
  VALUES (p_option_id, v_vote_id, auth.uid(), p_answer)
  ON CONFLICT (option_id, user_id)
  DO UPDATE SET answer = EXCLUDED.answer, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.submit_table_vote_response(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_table_vote_response(uuid, boolean) TO anon, authenticated;

-- ── RPC : get_table_vote_results — décompte agrégé uniquement ─────────────
CREATE OR REPLACE FUNCTION public.get_table_vote_results(p_vote_id uuid)
RETURNS TABLE (
  option_id   uuid,
  label       text,
  "position"  integer,
  yes_count   bigint,
  no_count    bigint,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, extensions
AS $$
DECLARE
  v_table_id uuid;
BEGIN
  SELECT table_id INTO v_table_id FROM table_votes WHERE id = p_vote_id;
  IF v_table_id IS NULL THEN
    RAISE EXCEPTION 'Vote introuvable';
  END IF;
  IF NOT (is_table_participant(v_table_id) OR is_table_moderator(v_table_id)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.label,
    o.position,
    COUNT(r.id) FILTER (WHERE r.answer = true)  AS yes_count,
    COUNT(r.id) FILTER (WHERE r.answer = false) AS no_count,
    COUNT(r.id)                                  AS total_count
  FROM table_vote_options o
  LEFT JOIN table_vote_responses r ON r.option_id = o.id
  WHERE o.vote_id = p_vote_id
  GROUP BY o.id, o.label, o.position
  ORDER BY o.position;
END;
$$;

REVOKE ALL ON FUNCTION public.get_table_vote_results(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_table_vote_results(uuid) TO anon, authenticated;

-- ── RPC : list_table_votes — historique modérateur, résultats inclus ──────
CREATE OR REPLACE FUNCTION public.list_table_votes(p_table_id uuid)
RETURNS TABLE (
  id         uuid,
  question   text,
  status     text,
  created_at timestamptz,
  closed_at  timestamptz,
  options    jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT is_table_moderator(p_table_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    v.id,
    v.question,
    v.status,
    v.created_at,
    v.closed_at,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'option_id', o.id,
            'label',     o.label,
            'position',  o.position,
            'yes_count', (SELECT COUNT(*) FROM table_vote_responses r WHERE r.option_id = o.id AND r.answer = true),
            'no_count',  (SELECT COUNT(*) FROM table_vote_responses r WHERE r.option_id = o.id AND r.answer = false)
          )
          ORDER BY o.position
        )
        FROM table_vote_options o
        WHERE o.vote_id = v.id
      ),
      '[]'::jsonb
    ) AS options
  FROM table_votes v
  WHERE v.table_id = p_table_id
  ORDER BY v.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_table_votes(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_table_votes(uuid) TO anon, authenticated;
