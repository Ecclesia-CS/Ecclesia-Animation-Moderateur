-- =============================================================
-- Chantier 161a — tables désolidarisées de la séance dès le débat (socle serveur)
--
-- Conception : docs/chantier-161-conception.md (arbitrée par Jules le 2026-10-08).
--
-- Une table de séance peut « terminer son débat » avant les autres
-- (`tables.debate_ended_at`). Sa *phase effective* devient alors :
--   · 'post_voting' en séance complète (questionnaire, puis résultats et revote),
--   · 'closed'      en débat simple (questionnaire, puis écran de fin),
-- tant que la séance elle-même est en 'debating'. Dès que la séance passe en
-- post_voting/closed, c'est elle qui l'emporte pour toutes les tables.
-- Associations exclues (fail-closed, règle du chantier 135).
--
-- Contenu :
--   1. colonne tables.debate_ended_at ;
--   2. réalignement des droits UPDATE de dev sur prod (sans effet sur prod) ;
--   3. helpers internes : member_table_id, table_effective_phase,
--      member_effective_phase ;
--   4. RPC end_table_debate / reopen_table_debate (+ variantes _admin) ;
--   5. trigger : on n'entre pas dans une table qui a terminé (sauf ses membres) ;
--   6. cast_vote : garde de phase + phase effective dans l'historique ;
--   7. get_all_votes_for_analysis : 'pre_closure' annule aussi le post-vote
--      (bug existant depuis le chantier 89) ;
--   8. set_session_phase : remise à zéro des fins de table à l'entrée en débat ;
--   9. get_results_map : carte ouverte en post_voting de séance et pour une
--      table terminée ; vérifie que le membre appartient à la séance ;
--  10. get_my_table_assignment : + debate_ended_at, effective_phase ;
--  11. assign_least_filled_table, join_simple_debate : tables terminées exclues ;
--  12. force_session_questionnaire : tables terminées ignorées.
--
-- Comparé à pg_get_functiondef avant écriture, le 2026-10-08 : toutes les
-- fonctions réécrites ici sont identiques sur dev et prod (même md5), sauf
-- cast_vote (chantier 160, dev seulement) → appliquer sur prod APRÈS la
-- migration 20261007_chantier160_sondage_consentement.sql.
-- =============================================================

-- ── 1. Colonne ────────────────────────────────────────────────
ALTER TABLE tables ADD COLUMN IF NOT EXISTS debate_ended_at timestamptz NULL;

-- tables est lue par le front en direct (TableContext) : sur prod le SELECT
-- est accordé au niveau de la table, mais on suit la règle des 154/160.
GRANT SELECT (debate_ended_at) ON tables TO anon, authenticated;

-- ── 2. Droits UPDATE : dev réaligné sur prod ──────────────────
-- Prod n'accorde à anon/authenticated que UPDATE (questionnaire_forced_at)
-- (seule colonne écrite en direct par le front, TableContext.forceQuestionnaire).
-- Dev avait dérivé vers un UPDATE sur toute la table. Sans effet sur prod.
REVOKE UPDATE ON tables FROM anon, authenticated;
GRANT UPDATE (questionnaire_forced_at) ON tables TO anon, authenticated;

-- ── 3. Helpers internes ───────────────────────────────────────

-- Table physique d'un membre. table_assignments.table_id peut être NULL
-- (affectation par numéro) : même résolution que is_table_moderator.
CREATE OR REPLACE FUNCTION member_table_id(p_member_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT COALESCE(
    ta.table_id,
    (SELECT ta2.table_id FROM table_assignments ta2
      WHERE ta2.session_id   = ta.session_id
        AND ta2.table_number = ta.table_number
        AND ta2.table_id IS NOT NULL
      LIMIT 1)
  )
  FROM table_assignments ta
  WHERE ta.member_id = p_member_id
  LIMIT 1;
$$;

-- Miroir SQL de effectiveTablePhase (src/lib/phaseLabels.ts) — les deux
-- doivent rester identiques.
CREATE OR REPLACE FUNCTION table_effective_phase(p_table_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT CASE
    WHEN s.phase = 'debating' AND t.debate_ended_at IS NOT NULL THEN
      CASE WHEN COALESCE(s.session_type, 'full') = 'debate' THEN 'closed' ELSE 'post_voting' END
    ELSE s.phase
  END
  FROM tables t
  JOIN sessions s ON s.id = t.session_id
  WHERE t.id = p_table_id;
$$;

-- Phase effective d'un membre : celle de sa table, sinon celle de la séance.
CREATE OR REPLACE FUNCTION member_effective_phase(p_member_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT COALESCE(table_effective_phase(member_table_id(sm.id)), s.phase)
  FROM session_members sm
  JOIN sessions s ON s.id = sm.session_id
  WHERE sm.id = p_member_id;
$$;

REVOKE ALL ON FUNCTION member_table_id(uuid)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION table_effective_phase(uuid)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION member_effective_phase(uuid) FROM PUBLIC, anon, authenticated;

-- ── 4. Terminer / rouvrir le débat d'une table ────────────────

CREATE OR REPLACE FUNCTION apply_end_table_debate(p_table_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_table   tables%ROWTYPE;
  v_session sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_table FROM tables WHERE id = p_table_id FOR UPDATE;
  IF v_table.id IS NULL THEN
    RAISE EXCEPTION 'Table introuvable';
  END IF;
  SELECT * INTO v_session FROM sessions WHERE id = v_table.session_id;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Cette table n''appartient à aucune séance.';
  END IF;
  IF v_session.organization_id IS NOT NULL
     OR COALESCE(v_session.session_type, 'full') NOT IN ('full', 'debate') THEN
    RAISE EXCEPTION 'Action indisponible pour cette séance.';
  END IF;
  IF v_session.phase <> 'debating' THEN
    RAISE EXCEPTION 'La séance n''est pas en débat.';
  END IF;
  IF v_table.debate_ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'Le débat de cette table est déjà terminé.';
  END IF;

  UPDATE tables
  SET debate_ended_at         = now(),
      questionnaire_forced_at = now()
  WHERE id = p_table_id
  RETURNING * INTO v_table;

  RETURN jsonb_build_object(
    'id',                      v_table.id,
    'debate_ended_at',         v_table.debate_ended_at,
    'questionnaire_forced_at', v_table.questionnaire_forced_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION apply_reopen_table_debate(p_table_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_table tables%ROWTYPE;
  v_phase text;
BEGIN
  SELECT * INTO v_table FROM tables WHERE id = p_table_id FOR UPDATE;
  IF v_table.id IS NULL THEN
    RAISE EXCEPTION 'Table introuvable';
  END IF;
  SELECT phase INTO v_phase FROM sessions WHERE id = v_table.session_id;
  -- Arbitrage de Jules : séance en post-vote ou close → plus aucun retour
  -- en arrière par table.
  IF v_phase IS DISTINCT FROM 'debating' THEN
    RAISE EXCEPTION 'La séance n''est plus en débat : le débat de cette table ne peut plus être rouvert.';
  END IF;
  IF v_table.debate_ended_at IS NULL THEN
    RAISE EXCEPTION 'Le débat de cette table est déjà en cours.';
  END IF;

  UPDATE tables
  SET debate_ended_at         = NULL,
      questionnaire_forced_at = NULL
  WHERE id = p_table_id
  RETURNING * INTO v_table;

  RETURN jsonb_build_object('id', v_table.id, 'debate_ended_at', NULL);
END;
$$;

REVOKE ALL ON FUNCTION apply_end_table_debate(uuid)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION apply_reopen_table_debate(uuid) FROM PUBLIC, anon, authenticated;

-- Côté modérateur : garde serveur is_table_moderator (titulaire unique, 148).
CREATE OR REPLACE FUNCTION end_table_debate(p_table_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF NOT is_table_moderator(p_table_id) THEN
    RAISE EXCEPTION 'Seul le modérateur de cette table peut terminer son débat.';
  END IF;
  RETURN apply_end_table_debate(p_table_id);
END;
$$;

CREATE OR REPLACE FUNCTION reopen_table_debate(p_table_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF NOT is_table_moderator(p_table_id) THEN
    RAISE EXCEPTION 'Seul le modérateur de cette table peut rouvrir son débat.';
  END IF;
  RETURN apply_reopen_table_debate(p_table_id);
END;
$$;

-- Côté administration (onglet Tables) : check_table_admin, puis les mêmes
-- règles — dont le refus des séances d'association.
CREATE OR REPLACE FUNCTION end_table_debate_admin(p_password text, p_table_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  PERFORM check_table_admin(p_password, p_table_id);
  RETURN apply_end_table_debate(p_table_id);
END;
$$;

CREATE OR REPLACE FUNCTION reopen_table_debate_admin(p_password text, p_table_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  PERFORM check_table_admin(p_password, p_table_id);
  RETURN apply_reopen_table_debate(p_table_id);
END;
$$;

REVOKE ALL ON FUNCTION end_table_debate(uuid)                FROM PUBLIC;
REVOKE ALL ON FUNCTION reopen_table_debate(uuid)             FROM PUBLIC;
REVOKE ALL ON FUNCTION end_table_debate_admin(text, uuid)    FROM PUBLIC;
REVOKE ALL ON FUNCTION reopen_table_debate_admin(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION end_table_debate(uuid)                TO anon, authenticated;
GRANT EXECUTE ON FUNCTION reopen_table_debate(uuid)             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION end_table_debate_admin(text, uuid)    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION reopen_table_debate_admin(text, uuid) TO anon, authenticated;

-- ── 5. On n'entre pas dans une table qui a terminé ────────────
-- Un seul point de contrôle pour tous les chemins qui assoient quelqu'un
-- (join_table, switch_table, claim_table_as_moderator, join_simple_debate,
-- assign_least_filled_table, et les suivants). Exception : un membre déjà
-- affecté à cette table (rechargement, modérateur qui revient après
-- réouverture). Les déplacements du superadmin passent par UPDATE et ne
-- sont pas concernés.
CREATE OR REPLACE FUNCTION guard_join_ended_table()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_table tables%ROWTYPE;
BEGIN
  SELECT * INTO v_table FROM tables WHERE id = NEW.table_id;
  IF v_table.debate_ended_at IS NULL OR v_table.session_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF (SELECT phase FROM sessions WHERE id = v_table.session_id) IS DISTINCT FROM 'debating' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM session_members sm
    WHERE sm.session_id = v_table.session_id
      AND sm.user_id    = NEW.user_id
      AND member_table_id(sm.id) = v_table.id
  ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Le débat de cette table est terminé.';
END;
$$;

REVOKE ALL ON FUNCTION guard_join_ended_table() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS participants_guard_ended_table ON participants;
CREATE TRIGGER participants_guard_ended_table
  BEFORE INSERT ON participants
  FOR EACH ROW EXECUTE FUNCTION guard_join_ended_table();

-- ── 6. cast_vote ──────────────────────────────────────────────
-- Garde de phase (accord de Jules du 2026-10-08) : vote admis en pré-vote,
-- vote présentiel, allocation (l'écran dit « tu peux encore voter ») et
-- post-vote — de séance, ou de table terminée. Refusé en brouillon, à une
-- table qui débat, et à la clôture (qui coupe le revote).
-- La phase historisée (first_cast_phase / phase_at_change) est désormais la
-- phase EFFECTIVE du membre : un revote d'une table terminée est tagué
-- 'post_voting' même si la séance est encore en 'debating'.
CREATE OR REPLACE FUNCTION public.cast_vote(p_assertion_id uuid, p_vote text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_session_id uuid;
  v_status     text;
  v_phase      text;
  v_poll_mode  text;
  v_member_id  uuid;
  v_old        assertion_votes%ROWTYPE;
  v_vote_row   assertion_votes%ROWTYPE;
BEGIN
  SELECT session_id, status INTO v_session_id, v_status
  FROM assertions WHERE id = p_assertion_id;

  IF v_status <> 'approved' THEN
    RAISE EXCEPTION 'Cette assertion n''est pas approuvée';
  END IF;

  SELECT id INTO v_member_id
  FROM session_members
  WHERE session_id = v_session_id AND user_id = auth.uid()
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Vous n''êtes pas inscrit à cette séance';
  END IF;

  SELECT poll_mode INTO v_poll_mode FROM sessions WHERE id = v_session_id;
  v_phase := member_effective_phase(v_member_id);

  IF v_phase IS NULL OR v_phase NOT IN ('pre_voting', 'voting', 'allocating', 'post_voting') THEN
    RAISE EXCEPTION 'Le vote n''est pas ouvert en ce moment';
  END IF;

  IF v_poll_mode = 'consent' AND p_vote = 'pass' THEN
    RAISE EXCEPTION 'Ce sondage n''a que deux réponses : d''accord ou pas d''accord';
  END IF;

  SELECT * INTO v_old
  FROM assertion_votes
  WHERE assertion_id = p_assertion_id AND member_id = v_member_id;

  IF FOUND AND v_old.vote IS DISTINCT FROM p_vote THEN
    INSERT INTO assertion_vote_history(
      assertion_id, session_id, member_id, vote, voted_at, superseded_at, phase_at_change
    ) VALUES (
      v_old.assertion_id, v_old.session_id, v_old.member_id, v_old.vote,
      v_old.created_at, now(), v_phase
    );
  END IF;

  INSERT INTO assertion_votes(assertion_id, session_id, member_id, vote, first_cast_phase)
  VALUES (p_assertion_id, v_session_id, v_member_id, p_vote, v_phase)
  ON CONFLICT (assertion_id, member_id) DO UPDATE SET vote = EXCLUDED.vote
  RETURNING * INTO v_vote_row;

  RETURN to_jsonb(v_vote_row);
END;
$function$;

-- ── 7. get_all_votes_for_analysis — 'pre_closure' = avant tout post-vote ──
-- Bug existant depuis le chantier 89 : le revote a lieu en 'post_voting',
-- mais seuls les changements tagués 'closed' étaient annulés. Désormais
-- 'post_voting' ET 'closed' sont annulés (premier changement après débat),
-- et les premiers votes posés dans ces phases sont ignorés.
CREATE OR REPLACE FUNCTION public.get_all_votes_for_analysis(p_password text, p_session_id uuid, p_attending_only boolean DEFAULT false, p_vote_scope text DEFAULT 'current'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM check_session_admin(p_password, p_session_id);

  IF p_vote_scope NOT IN ('current', 'pre_closure') THEN
    RAISE EXCEPTION 'p_vote_scope invalide : % (attendu ''current'' ou ''pre_closure'')', p_vote_scope;
  END IF;

  IF p_vote_scope = 'current' THEN
    SELECT jsonb_agg(jsonb_build_object(
      'member_id',           av.member_id,
      'assertion_id',        av.assertion_id,
      'vote',                av.vote,
      'attending_in_person', sm.attending_in_person
    )) INTO v_result
    FROM assertion_votes av
    JOIN assertions a  ON a.id  = av.assertion_id
    JOIN session_members sm ON sm.id = av.member_id
    WHERE av.session_id = p_session_id
      AND a.status = 'approved'
      AND (NOT p_attending_only OR sm.attending_in_person = true);
  ELSE
    SELECT jsonb_agg(jsonb_build_object(
      'member_id',           av.member_id,
      'assertion_id',        av.assertion_id,
      'vote',                COALESCE(h.vote, av.vote),
      'attending_in_person', sm.attending_in_person
    )) INTO v_result
    FROM assertion_votes av
    JOIN assertions a  ON a.id  = av.assertion_id
    JOIN session_members sm ON sm.id = av.member_id
    LEFT JOIN LATERAL (
      SELECT vh.vote
      FROM assertion_vote_history vh
      WHERE vh.assertion_id = av.assertion_id
        AND vh.member_id    = av.member_id
        AND vh.phase_at_change IN ('post_voting', 'closed')
      ORDER BY vh.superseded_at ASC
      LIMIT 1
    ) h ON true
    WHERE av.session_id = p_session_id
      AND a.status = 'approved'
      AND COALESCE(av.first_cast_phase, '') NOT IN ('post_voting', 'closed')
      AND (NOT p_attending_only OR sm.attending_in_person = true);
  END IF;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

-- ── 8. set_session_phase — remise à zéro à l'entrée en débat ──
-- Toute (re)entrée en 'debating' (ouverture, ou retour arrière depuis
-- post_voting) remet toutes les tables en débat : sans ça, une table
-- terminée avant un retour en allocation le resterait à la réouverture.
CREATE OR REPLACE FUNCTION public.set_session_phase(p_password text, p_session_id uuid, p_phase text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_hash      text;
  v_row       sessions%ROWTYPE;
  v_type      text;
  v_old_phase text;
BEGIN
  IF p_phase NOT IN ('draft', 'pre_voting', 'voting', 'allocating', 'debating', 'post_voting', 'closed') THEN
    RAISE EXCEPTION 'Phase invalide: %', p_phase;
  END IF;

  PERFORM check_session_admin(p_password, p_session_id);

  SELECT session_type, phase INTO v_type, v_old_phase FROM sessions WHERE id = p_session_id;
  IF v_type IS NOT NULL AND NOT session_type_allows_phase(v_type, p_phase) THEN
    RAISE EXCEPTION 'Phase % indisponible pour ce type de séance', p_phase;
  END IF;

  UPDATE sessions
  SET phase = p_phase, phase_changed_at = now()
  WHERE id = p_session_id
  RETURNING * INTO v_row;

  IF p_phase = 'debating' AND v_old_phase IS DISTINCT FROM 'debating' THEN
    UPDATE tables
    SET debate_ended_at = NULL
    WHERE session_id = p_session_id AND debate_ended_at IS NOT NULL;
  END IF;

  IF p_phase = 'closed' THEN
    UPDATE session_members
    SET reclaim_code_hash = NULL
    WHERE session_id = p_session_id AND reclaim_code_hash IS NOT NULL;

    DELETE FROM reclaim_attempts WHERE session_id = p_session_id;
  END IF;

  RETURN to_jsonb(v_row);
END;
$function$;

-- ── 9. get_results_map ────────────────────────────────────────
-- Ouverte en post_voting de séance (arbitrage de Jules) et pour un membre
-- dont la table a terminé. Le membre doit appartenir à CETTE séance (la
-- version précédente ne le vérifiait pas — sans conséquence tant que
-- l'ouverture ne dépendait que de la phase de la séance demandée).
CREATE OR REPLACE FUNCTION public.get_results_map(p_session_id uuid, p_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_analysis session_analysis%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM session_members
    WHERE id = p_member_id AND user_id = auth.uid() AND session_id = p_session_id
  ) THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM sessions
    WHERE id = p_session_id
      AND (phase IN ('closed', 'post_voting') OR (session_type = 'poll' AND phase = 'pre_voting'))
  ) AND COALESCE(member_effective_phase(p_member_id), '') NOT IN ('post_voting', 'closed') THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_analysis
  FROM session_analysis
  WHERE session_id = p_session_id
    AND status = 'done'
    AND vote_scope = 'current'
  ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'k_chosen', v_analysis.k_chosen,
    'points', (
      SELECT jsonb_agg(jsonb_build_object(
        'pca_x',    am.pca_x,
        'pca_y',    am.pca_y,
        'group_id', am.group_id,
        'is_self',  (am.member_id = p_member_id)
      ))
      FROM analysis_members am
      WHERE am.analysis_id = v_analysis.id
    ),
    'consensus', (
      SELECT jsonb_agg(
        jsonb_build_object('content', a.content, 'score', gc.score)
        ORDER BY gc.score DESC
      )
      FROM (
        SELECT key::uuid AS assertion_id, value::float AS score
        FROM jsonb_each_text(v_analysis.group_consensus)
        WHERE value::float > 0.5
      ) gc
      JOIN assertions a ON a.id = gc.assertion_id
    ),
    'repness',         v_analysis.repness,
    'group_consensus', v_analysis.group_consensus,
    'all_assertions', (
      SELECT jsonb_object_agg(a.id::text, a.content)
      FROM assertions a
      WHERE a.session_id = p_session_id
        AND a.status = 'approved'
    )
  );
END;
$function$;

-- ── 10. get_my_table_assignment ───────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_table_assignment(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id',              ta.id,
    'session_id',      ta.session_id,
    'member_id',       ta.member_id,
    'table_number',    ta.table_number,
    'table_id',        ta.table_id,
    'join_code',       t.join_code,
    'created_at',      ta.created_at,
    'debate_ended_at', (SELECT t2.debate_ended_at FROM tables t2 WHERE t2.id = member_table_id(ta.member_id)),
    'effective_phase', member_effective_phase(ta.member_id)
  )
  INTO v_result
  FROM table_assignments ta
  LEFT JOIN tables t ON t.id = ta.table_id
  JOIN session_members sm ON sm.id = ta.member_id
  WHERE ta.session_id = p_session_id
    AND sm.user_id = auth.uid()
  LIMIT 1;

  RETURN v_result;
END;
$function$;

-- ── 11a. assign_least_filled_table — tables terminées exclues ─
CREATE OR REPLACE FUNCTION public.assign_least_filled_table(p_session_id uuid, p_pseudo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_phase           text;
  v_pseudo          text := btrim(p_pseudo);
  v_member          session_members%ROWTYPE;
  v_code            text;
  v_table_id        uuid;
  v_participant_id  uuid;
  v_result          jsonb;
BEGIN
  IF v_pseudo = '' THEN
    RAISE EXCEPTION 'Nom prénom requis';
  END IF;

  SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;
  IF v_phase IS NULL THEN
    RAISE EXCEPTION 'Séance introuvable';
  END IF;
  IF v_phase <> 'debating' THEN
    RAISE EXCEPTION 'Cette séance n''est pas en débat.';
  END IF;

  SELECT * INTO v_member
  FROM session_members
  WHERE session_id = p_session_id AND user_id = auth.uid();

  IF v_member.id IS NULL THEN
    v_code := gen_member_reclaim_code(p_session_id);
    BEGIN
      INSERT INTO session_members (session_id, user_id, pseudo, joined_phase, attending_in_person, reclaim_code_hash)
      VALUES (p_session_id, auth.uid(), v_pseudo, v_phase, true, crypt(v_code, gen_salt('bf')))
      RETURNING * INTO v_member;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Ce nom est déjà utilisé dans cette séance.';
    END;
  END IF;

  SELECT t.id
  INTO v_table_id
  FROM tables t
  LEFT JOIN (
    SELECT table_id, count(*) AS occupied
    FROM participants
    GROUP BY table_id
  ) occ ON occ.table_id = t.id
  WHERE t.session_id = p_session_id
    AND t.leaderless = false
    AND t.debate_ended_at IS NULL
  ORDER BY COALESCE(occ.occupied, 0) ASC, t.table_number ASC NULLS LAST, t.join_code ASC
  LIMIT 1;

  IF v_table_id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM tables t
      WHERE t.session_id = p_session_id AND t.leaderless = false AND t.debate_ended_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Toutes les tables ont terminé leur débat.';
    END IF;
    RAISE EXCEPTION 'Aucune table animée n''est encore disponible pour cette séance.';
  END IF;

  PERFORM leave_other_session_tables(p_session_id, v_table_id);

  INSERT INTO participants (table_id, user_id, pseudo)
  VALUES (v_table_id, auth.uid(), v_member.pseudo)
  ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
  RETURNING id INTO v_participant_id;

  PERFORM sync_table_assignment(p_session_id, v_table_id, v_member.pseudo);

  SELECT jsonb_build_object(
    'id',                      s.id,
    'join_code',               s.join_code,
    'created_by',              s.created_by,
    'current_speaker_id',      s.current_speaker_id,
    'current_turn_started_at', s.current_turn_started_at,
    'created_at',              s.created_at,
    'participant_id',          v_participant_id
  ) INTO v_result
  FROM tables s WHERE s.id = v_table_id;

  RETURN v_result || jsonb_build_object('new_reclaim_code', v_code);
END;
$function$;

-- ── 11b. join_simple_debate — tables terminées exclues ────────
-- Un membre déjà affecté à une table terminée y est renvoyé (il verra
-- l'écran de fin) ; un nouveau venu n'est assis qu'à une table qui débat.
CREATE OR REPLACE FUNCTION public.join_simple_debate(p_session_id uuid, p_pseudo text, p_creation_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_session         sessions%ROWTYPE;
  v_pseudo          text := btrim(coalesce(p_pseudo, ''));
  v_as_moderator    boolean := p_creation_code IS NOT NULL AND btrim(p_creation_code) <> '';
  v_hash            text;
  v_member          session_members%ROWTYPE;
  v_code            text;
  v_table_id        uuid;
  v_participant_id  uuid;
  v_result          jsonb;
BEGIN
  SELECT * INTO v_session FROM sessions WHERE id = p_session_id;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Séance introuvable';
  END IF;
  IF v_session.session_type <> 'debate' THEN
    RAISE EXCEPTION 'Cette séance n''est pas un débat simple.';
  END IF;
  IF v_session.phase <> 'debating' THEN
    RAISE EXCEPTION 'Le débat n''est pas ouvert.';
  END IF;

  IF v_as_moderator THEN
    IF NOT check_moderator_code(p_creation_code, p_session_id) THEN RAISE EXCEPTION 'Code Ecclesia incorrect'; END IF;
  END IF;

  SELECT * INTO v_member
  FROM session_members
  WHERE session_id = p_session_id AND user_id = auth.uid()
  LIMIT 1;

  IF v_member.id IS NULL THEN
    IF v_pseudo = '' THEN
      RAISE EXCEPTION 'Nom prénom requis';
    END IF;
    v_code := gen_member_reclaim_code(p_session_id);
    BEGIN
      INSERT INTO session_members (session_id, user_id, pseudo, joined_phase, attending_in_person, reclaim_code_hash)
      VALUES (p_session_id, auth.uid(), v_pseudo, 'debating', true, crypt(v_code, gen_salt('bf')))
      RETURNING * INTO v_member;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Ce nom est déjà utilisé dans ce débat. Si c''est toi, utilise ton code de rappel.';
    END;
  END IF;

  SELECT ta.table_id INTO v_table_id
  FROM table_assignments ta
  JOIN tables t ON t.id = ta.table_id
  WHERE ta.member_id = v_member.id AND ta.session_id = p_session_id
  LIMIT 1;

  IF v_as_moderator THEN
    IF v_table_id IS NOT NULL
       AND table_has_moderator(v_table_id)
       AND NOT table_moderator_is(v_table_id, v_member.pseudo) THEN
      v_table_id := NULL;
    END IF;
    IF v_table_id IS NULL THEN
      SELECT t.id INTO v_table_id
      FROM tables t
      WHERE t.session_id = p_session_id
        AND t.debate_ended_at IS NULL
        AND NOT table_has_moderator(t.id)
      ORDER BY t.table_number ASC NULLS LAST, t.join_code ASC
      LIMIT 1;
    END IF;
    IF v_table_id IS NULL THEN
      IF NOT EXISTS (SELECT 1 FROM tables t WHERE t.session_id = p_session_id AND t.debate_ended_at IS NULL) THEN
        RAISE EXCEPTION 'Toutes les tables ont terminé leur débat.';
      END IF;
      RAISE EXCEPTION 'Toutes les tables ont déjà un modérateur. Rejoins-en une comme participant, puis passe par Outils pour reprendre l''animation.';
    END IF;
  ELSIF v_table_id IS NULL THEN
    SELECT t.id INTO v_table_id
    FROM tables t
    LEFT JOIN (
      SELECT table_id, count(*) AS occupied FROM participants GROUP BY table_id
    ) occ ON occ.table_id = t.id
    WHERE t.session_id = p_session_id
      AND t.debate_ended_at IS NULL
    ORDER BY COALESCE(occ.occupied, 0) ASC, t.table_number ASC NULLS LAST, t.join_code ASC
    LIMIT 1;
    IF v_table_id IS NULL THEN
      IF EXISTS (SELECT 1 FROM tables t WHERE t.session_id = p_session_id) THEN
        RAISE EXCEPTION 'Toutes les tables ont terminé leur débat.';
      END IF;
      RAISE EXCEPTION 'Aucune table n''est disponible pour ce débat.';
    END IF;
  END IF;

  PERFORM leave_other_session_tables(p_session_id, v_table_id);

  INSERT INTO participants (table_id, user_id, pseudo)
  VALUES (v_table_id, auth.uid(), v_member.pseudo)
  ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
  RETURNING id INTO v_participant_id;

  PERFORM sync_table_assignment(p_session_id, v_table_id, v_member.pseudo);

  IF v_as_moderator THEN
    UPDATE session_members SET is_moderator = true
    WHERE id = v_member.id AND is_moderator = false;

    PERFORM clear_seated_physical_moderator(v_table_id);

    UPDATE tables
    SET leaderless                 = false,
        active_moderator_member_id = v_member.id
    WHERE id = v_table_id;
  END IF;

  SELECT jsonb_build_object(
    'id',                      s.id,
    'join_code',               s.join_code,
    'created_by',              s.created_by,
    'current_speaker_id',      s.current_speaker_id,
    'current_turn_started_at', s.current_turn_started_at,
    'created_at',              s.created_at,
    'participant_id',          v_participant_id,
    'is_moderator',            is_table_moderator(s.id),
    'pseudo',                  v_member.pseudo,
    'new_reclaim_code',        v_code
  ) INTO v_result
  FROM tables s WHERE s.id = v_table_id;

  RETURN v_result;
END;
$function$;

-- ── 12. force_session_questionnaire — tables terminées ignorées ─
-- Leur questionnaire a déjà été forcé à la fin de leur débat ; le reforcer
-- relancerait son expiration d'une heure pour rien.
CREATE OR REPLACE FUNCTION public.force_session_questionnaire(p_password text, p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  PERFORM public.check_superadmin_password(p_password);
  UPDATE public.tables
    SET questionnaire_forced_at = now()
  WHERE session_id = p_session_id
    AND debate_ended_at IS NULL;
END;
$function$;
