-- =============================================================
-- Chantier 70 — Conserver le vote initial pour mesurer le
-- déplacement des opinions (suite du chantier 69 / postvote)
--
-- Constat (chantier 69) : cast_vote fait un upsert
-- (ON CONFLICT (assertion_id, member_id) DO UPDATE SET vote = ...)
-- qui écrase silencieusement l'ancien vote, sans historique ni
-- horodatage de la modification. Une fois le postvote utilisé pour
-- revoter, la valeur d'avant-débat est perdue — la comparaison que
-- la démarche Ecclesia veut mesurer devient impossible.
--
-- Décision de Jules : « il faut faire une "sauvegarde" de l'ancien
-- vote pour pouvoir le comparer au nouveau vote [...] on pourra
-- relancer l'analyse, et voir comment les positions idéologiques
-- ont bougé après le débat. »
--
-- ── Choix de conception : table d'historique, pas d'élargissement
--    de la contrainte d'unicité sur assertion_votes ─────────────
--
-- Deux familles de solutions étaient possibles :
--   A. Élargir UNIQUE(assertion_id, member_id) sur assertion_votes
--      lui-même (ex. ajouter une colonne "round"/"is_current" à la
--      contrainte), pour garder tout l'historique dans la même table.
--   B. Laisser assertion_votes strictement inchangé (une ligne par
--      paire assertion×membre = le vote COURANT, exactement comme
--      aujourd'hui) et détourner l'ancien vote vers une table
--      d'historique à part, alimentée juste avant chaque écrasement.
--
-- Choix : B. Raison — l'inventaire des lecteurs de assertion_votes
-- (fait avant d'écrire cette migration, cf. rapport de session) est
-- large : get_vote_results, get_vote_counts_admin,
-- get_all_votes_for_analysis, get_session_voting_stats,
-- get_table_opinion_summary, get_public_results, get_vote_results_all,
-- les gardes "has_voted" de list_session_members_admin/
-- get_allocation_inputs, et côté client VoteScreen.tsx/
-- PostVoteScreen.tsx (.select('*').eq('member_id', ...) construisant
-- une Map indexée par assertion_id, une seule ligne attendue par
-- assertion). Aucun de ces lecteurs ne filtre aujourd'hui sur une
-- notion de "version" — ils font tous un COUNT()/LEFT JOIN brut en
-- tenant pour acquis qu'il existe au plus UNE ligne par (assertion,
-- membre). Élargir la contrainte (option A) aurait obligé à retoucher
-- CHACUN de ces lecteurs pour ajouter un filtre "ligne courante
-- seulement", avec le risque, sur un projet où « plusieurs migrations
-- sont appliquées en base sans que leur code soit sur main », d'écraser
-- silencieusement un chantier récent inconnu de cette session. L'option
-- B laisse structure ET comportement de assertion_votes strictement
-- identiques — zéro lecteur existant à modifier, zéro risque de double
-- comptage. Coût : une table de plus, un peu de logique en plus dans
-- cast_vote. Nettement moins risqué ici.
--
-- ── Portée du "pré-clôture" reconstitué ─────────────────────────
-- Le postvote (chantier 69, PostVoteScreen) est le seul chemin de
-- l'app qui peut faire voter quelqu'un une fois la séance 'closed'.
-- On tague donc chaque vote de la phase de séance en vigueur au
-- moment où il a été posé POUR LA PREMIÈRE FOIS (first_cast_phase,
-- nouvelle colonne sur assertion_votes, jamais retouchée par un
-- upsert ultérieur) et chaque écrasement de la phase en vigueur au
-- moment de l'écrasement (phase_at_change, sur la ligne d'historique).
-- Le "vote pré-clôture" d'une paire (assertion, membre) est alors :
--   - absent si son tout premier vote a été posé en phase 'closed'
--     (n'existait pas avant la clôture — un vote né en postvote, via
--     la section "3 · Assertions non vues" par exemple, ne doit
--     JAMAIS être prêté rétroactivement à l'avant-débat) ;
--   - sinon, la valeur du plus ancien écrasement survenu en phase
--     'closed' s'il y en a un (le membre a revoté en postvote — on
--     restitue ce qu'il pensait juste avant) ;
--   - sinon (jamais retouché depuis la clôture), le vote courant —
--     rien n'a changé, "avant" et "après" sont la même valeur.
--
-- ── Fenêtre de contamination — à savoir avant d'exploiter les données
-- Le chantier 69 (écran postvote) est déjà mergé et déployé, et permet
-- déjà de revoter en phase 'closed', SANS aucune historisation avant
-- cette migration. Tout revote ou premier vote fait via l'écran
-- postvote entre le déploiement du chantier 69 et l'application de
-- CETTE migration est irrémédiablement invisible à l'historisation :
-- le backfill ci-dessous (first_cast_phase = 'legacy' pour toutes les
-- lignes déjà en base) suppose qu'aucune n'a été posée/modifiée en
-- 'closed' — c'est vrai pour tout ce qui précède le chantier 69, faux
-- pour une poignée de votes hypothétiques passés entre les deux. Aucune
-- parade possible a posteriori (l'info n'a jamais été capturée) —
-- appliquer cette migration au plus tôt réduit la fenêtre.
--
-- ── Choix fait sans consultation, à valider par Jules ───────────
-- get_latest_analysis, get_results_map et get_public_results
-- choisissent tous « la dernière analyse status='done' » par
-- created_at DESC. Sans garde-fou, lancer une analyse "pré-clôture"
-- (vote_scope='pre_closure') APRÈS une analyse "courante" la rendrait
-- chronologiquement plus récente et donc, silencieusement, celle
-- montrée aux participants sur ResultsMapScreen/PublicResultsScreen —
-- ils verraient un instantané d'avant-débat présenté comme leur
-- résultat final. Jugé absurde : ces trois fonctions gagnent un filtre
-- supplémentaire `AND vote_scope = 'current'` sur leur sélection de
-- "dernière analyse". Comportement inchangé pour toute l'historique
-- existante (vote_scope vaut 'current' par défaut sur les lignes déjà
-- en base) ; seules les nouvelles analyses 'pre_closure' en sont
-- exclues de cette sélection par défaut — elles restent consultables
-- via les deux nouvelles RPC list_session_analyses/get_analysis_by_id,
-- pour un futur écran de comparaison (non conçu ici, cf. rapport).
-- =============================================================


-- ── 1. Table d'historique ────────────────────────────────────
CREATE TABLE assertion_vote_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assertion_id    uuid REFERENCES assertions(id) ON DELETE CASCADE NOT NULL,
  session_id      uuid REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  member_id       uuid REFERENCES session_members(id) ON DELETE CASCADE NOT NULL,
  vote            text NOT NULL CHECK (vote IN ('agree', 'disagree', 'pass')),
  -- created_at de la ligne assertion_votes remplacée (quand CE vote-là avait été posé).
  voted_at        timestamptz NOT NULL,
  -- Quand il a été écrasé par un nouveau vote.
  superseded_at   timestamptz NOT NULL DEFAULT now(),
  -- sessions.phase au moment de l'écrasement. text libre (pas de CHECK), même
  -- convention que session_members.joined_phase — évite un couplage dur avec
  -- l'énumération de sessions.phase, qui a déjà changé une fois (chantier 39).
  phase_at_change text NOT NULL
);

CREATE INDEX assertion_vote_history_pair_idx
  ON assertion_vote_history(assertion_id, member_id);
CREATE INDEX assertion_vote_history_session_idx
  ON assertion_vote_history(session_id);

ALTER TABLE assertion_vote_history ENABLE ROW LEVEL SECURITY;

-- Même politique que assertion_votes_select_own (20260528_voting_app.sql) :
-- un membre ne voit que sa propre historique. Écriture réservée à cast_vote
-- (SECURITY DEFINER, hors RLS) — aucune policy INSERT/UPDATE/DELETE.
CREATE POLICY "assertion_vote_history_select_own" ON assertion_vote_history
  FOR SELECT USING (
    member_id IN (SELECT id FROM session_members WHERE user_id = auth.uid())
  );


-- ── 2. Colonne first_cast_phase sur assertion_votes ──────────
ALTER TABLE assertion_votes ADD COLUMN first_cast_phase text;

-- Backfill : toutes les lignes déjà en base précèdent le chantier 69
-- (écran postvote) ou, au pire, une fenêtre de quelques votes non
-- traçables (voir note ci-dessus) — 'legacy' documente explicitement
-- que la phase d'origine est inconnue, plutôt que d'en inventer une.
-- Ce qui compte pour le filtre pré-clôture est seulement IS DISTINCT
-- FROM 'closed', que 'legacy' satisfait correctement (ces votes sont
-- traités comme "d'avant la clôture", ce qu'ils sont dans l'immense
-- majorité des cas réels).
UPDATE assertion_votes SET first_cast_phase = 'legacy' WHERE first_cast_phase IS NULL;

ALTER TABLE assertion_votes ALTER COLUMN first_cast_phase SET NOT NULL;


-- ── 3. Colonne vote_scope sur session_analysis ───────────────
-- 'current' (défaut) : votes tels qu'ils sont au moment du calcul —
-- comportement strictement identique à aujourd'hui pour toutes les
-- lignes déjà en base. 'pre_closure' : votes reconstitués juste avant
-- la clôture (nouveau, chantier 70), jamais choisi par défaut.
ALTER TABLE session_analysis ADD COLUMN vote_scope text NOT NULL DEFAULT 'current';


-- ── 4. cast_vote — historise l'ancien vote avant de l'écraser ─
-- Remplace la version de 20260528_voting_app.sql (jamais redéfinie
-- depuis — vérifié sur tout supabase/migrations/ avant d'écrire cette
-- migration). Comportement inchangé pour l'appelant : mêmes vérifications
-- (assertion approuvée, appartenance à la séance), même valeur de retour.
CREATE OR REPLACE FUNCTION cast_vote(
  p_assertion_id uuid,
  p_vote         text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id uuid;
  v_status     text;
  v_phase      text;
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

  SELECT phase INTO v_phase FROM sessions WHERE id = v_session_id;

  -- Chantier 70 — capturer l'ancien vote AVANT l'upsert qui l'écrase,
  -- seulement s'il existe déjà et que la valeur change réellement
  -- (évite une ligne d'historique bruit quand quelqu'un reclique le
  -- même bouton — AssertionCard n'a pas de garde contre le re-clic).
  SELECT * INTO v_old
  FROM assertion_votes
  WHERE assertion_id = p_assertion_id AND member_id = v_member_id;

  IF FOUND AND v_old.vote IS DISTINCT FROM p_vote THEN
    INSERT INTO assertion_vote_history(
      assertion_id, session_id, member_id, vote, voted_at, superseded_at, phase_at_change
    ) VALUES (
      v_old.assertion_id, v_old.session_id, v_old.member_id, v_old.vote,
      v_old.created_at, now(), COALESCE(v_phase, 'unknown')
    );
  END IF;

  -- first_cast_phase n'est posé qu'à l'INSERT initial (absent du SET de
  -- l'upsert) — il ne bouge plus jamais une fois la paire créée, par design.
  INSERT INTO assertion_votes(assertion_id, session_id, member_id, vote, first_cast_phase)
  VALUES (p_assertion_id, v_session_id, v_member_id, p_vote, COALESCE(v_phase, 'unknown'))
  ON CONFLICT (assertion_id, member_id) DO UPDATE SET vote = EXCLUDED.vote
  RETURNING * INTO v_vote_row;

  RETURN to_jsonb(v_vote_row);
END;
$$;


-- ── 5. get_all_votes_for_analysis — nouveau p_vote_scope ─────
-- Remplace la version de 20260622_pre_voting.sql (la plus récente —
-- vérifié sur tout supabase/migrations/). p_vote_scope ajouté en
-- dernier paramètre avec valeur par défaut 'current' : tout appel
-- existant (nommé, comme le fait toujours PostgREST/le client JS)
-- continue de fonctionner à l'identique sans le passer.
--
-- CORRECTION APPLIQUÉE À LA RELECTURE (orchestration, 04/09/2026) —
-- `CREATE OR REPLACE FUNCTION` avec un NOMBRE D'ARGUMENTS DIFFÉRENT ne
-- remplace pas : il crée une SURCHARGE. La base contient aujourd'hui DEUX
-- versions de cette fonction (2 arguments et 3 arguments, vérifié via
-- pg_get_function_identity_arguments) ; en ajouter une troisième à 4
-- arguments avec défauts rend les appels nommés ambigus. On supprime donc
-- explicitement les deux anciennes signatures. La nouvelle version à 4
-- arguments, tous les suivants ayant un défaut, couvre tous les appels
-- existants — y compris la vieille version à 2 arguments, qui ne filtrait
-- rien et ne renvoyait pas `attending_in_person` (le nouveau retour en est
-- un sur-ensemble, aucun appelant ne perd de champ).
DROP FUNCTION IF EXISTS get_all_votes_for_analysis(text, uuid);
DROP FUNCTION IF EXISTS get_all_votes_for_analysis(text, uuid, boolean);

CREATE OR REPLACE FUNCTION get_all_votes_for_analysis(
  p_password       text,
  p_session_id     uuid,
  p_attending_only boolean DEFAULT false,
  p_vote_scope     text    DEFAULT 'current'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM check_superadmin_password(p_password);

  IF p_vote_scope NOT IN ('current', 'pre_closure') THEN
    RAISE EXCEPTION 'p_vote_scope invalide : % (attendu ''current'' ou ''pre_closure'')', p_vote_scope;
  END IF;

  IF p_vote_scope = 'current' THEN
    -- Identique à la version précédente — comportement inchangé.
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
    -- pre_closure — reconstitue la valeur en vigueur juste avant le premier
    -- écrasement survenu en phase 'closed'. Exclut les paires dont le tout
    -- premier vote a été posé en 'closed' (n'existaient pas avant la clôture).
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
        AND vh.phase_at_change = 'closed'
      ORDER BY vh.superseded_at ASC
      LIMIT 1
    ) h ON true
    WHERE av.session_id = p_session_id
      AND a.status = 'approved'
      AND av.first_cast_phase IS DISTINCT FROM 'closed'
      AND (NOT p_attending_only OR sm.attending_in_person = true);
  END IF;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;


-- ── 6. save_analysis — nouveau p_vote_scope ──────────────────
-- Remplace la version de 20260610_opinion_analysis.sql (jamais
-- redéfinie depuis). Paramètre ajouté en dernier avec défaut 'current' :
-- tout appel existant (saveAnalysisResult, analysis.ts) continue de
-- fonctionner sans le passer, et tague 'current' comme avant ce
-- chantier (comportement identique).
--
-- CORRECTION APPLIQUÉE À LA RELECTURE (orchestration, 04/09/2026) — même
-- piège que ci-dessus : passer de 8 à 9 arguments crée une surcharge au
-- lieu de remplacer. On supprime explicitement la signature à 8 arguments ;
-- la nouvelle, dont le 9e argument a un défaut, couvre tous les appels
-- existants à l'identique.
DROP FUNCTION IF EXISTS save_analysis(text, uuid, int, float, jsonb, jsonb, jsonb, jsonb);

CREATE OR REPLACE FUNCTION save_analysis(
  p_password        text,
  p_session_id      uuid,
  p_k_chosen        int,
  p_silhouette      float,
  p_pca_variance    jsonb,
  p_repness         jsonb,
  p_group_consensus jsonb,
  p_members         jsonb,
  p_vote_scope      text DEFAULT 'current'
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_analysis_id uuid;
  v_member      jsonb;
BEGIN
  PERFORM check_superadmin_password(p_password);

  IF p_vote_scope NOT IN ('current', 'pre_closure') THEN
    RAISE EXCEPTION 'p_vote_scope invalide : % (attendu ''current'' ou ''pre_closure'')', p_vote_scope;
  END IF;

  INSERT INTO session_analysis(
    session_id, k_chosen, silhouette_score,
    pca_variance_explained, repness, group_consensus, status, vote_scope
  )
  VALUES (
    p_session_id, p_k_chosen, p_silhouette,
    p_pca_variance, p_repness, p_group_consensus, 'done', p_vote_scope
  )
  RETURNING id INTO v_analysis_id;

  FOR v_member IN SELECT * FROM jsonb_array_elements(p_members) LOOP
    INSERT INTO analysis_members(analysis_id, member_id, pca_x, pca_y, group_id)
    VALUES (
      v_analysis_id,
      (v_member->>'member_id')::uuid,
      (v_member->>'pca_x')::float,
      (v_member->>'pca_y')::float,
      (v_member->>'group_id')::int
    );
  END LOOP;

  RETURN v_analysis_id;
END;
$$;


-- ── 7. Garde-fou "dernière analyse" — current uniquement ─────
-- get_latest_analysis, get_results_map, get_public_results : ajout
-- de `AND vote_scope = 'current'` à leur sélection de la dernière
-- analyse 'done'. Voir note en tête de fichier — sans ça, une analyse
-- 'pre_closure' plus récente qu'une analyse 'current' deviendrait
-- silencieusement celle montrée aux participants. Comportement
-- strictement inchangé pour toutes les analyses déjà en base
-- (vote_scope='current' par défaut).

-- 7a. get_latest_analysis — remplace 20260611_get_latest_analysis.sql
-- (jamais redéfinie depuis).
CREATE OR REPLACE FUNCTION get_latest_analysis(
  p_password   text,
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_analysis session_analysis%ROWTYPE;
  v_members  jsonb;
BEGIN
  PERFORM check_superadmin_password(p_password);

  SELECT * INTO v_analysis
  FROM session_analysis
  WHERE session_id = p_session_id
    AND status = 'done'
    AND vote_scope = 'current'
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'member_id', am.member_id,
    'pca_x',     am.pca_x,
    'pca_y',     am.pca_y,
    'group_id',  am.group_id
  )) INTO v_members
  FROM analysis_members am
  WHERE am.analysis_id = v_analysis.id;

  RETURN jsonb_build_object(
    'id',                     v_analysis.id,
    'k_chosen',               v_analysis.k_chosen,
    'silhouette_score',       v_analysis.silhouette_score,
    'pca_variance_explained', v_analysis.pca_variance_explained,
    'repness',                v_analysis.repness,
    'group_consensus',        v_analysis.group_consensus,
    'created_at',             v_analysis.created_at,
    'vote_scope',             v_analysis.vote_scope,
    'members',                COALESCE(v_members, '[]'::jsonb)
  );
END;
$$;

-- 7b. get_results_map — remplace 20260621_results_map_repness.sql
-- (la plus récente). Reste identique au reste près du filtre ajouté.
CREATE OR REPLACE FUNCTION get_results_map(
  p_session_id uuid,
  p_member_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_analysis session_analysis%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM sessions
    WHERE id = p_session_id AND phase = 'closed'
  ) THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM session_members
    WHERE id = p_member_id AND user_id = auth.uid()
  ) THEN
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
$$;

-- 7c. get_public_results — remplace 20260901_chantier46_public_results_visibility.sql
-- (la plus récente). Reste identique au reste près du filtre ajouté.
CREATE OR REPLACE FUNCTION get_public_results(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_analysis session_analysis%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM sessions
    WHERE id = p_session_id AND phase = 'closed' AND results_public = true
  ) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_analysis
  FROM session_analysis
  WHERE session_id = p_session_id
    AND status = 'done'
    AND vote_scope = 'current'
  ORDER BY created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'k_chosen', v_analysis.k_chosen,
    'points', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'pca_x',    am.pca_x,
        'pca_y',    am.pca_y,
        'group_id', am.group_id
      )), '[]'::jsonb)
      FROM analysis_members am
      WHERE v_analysis.id IS NOT NULL AND am.analysis_id = v_analysis.id
    ),
    'assertions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'content',        r.content,
        'agree_count',    r.agree_count,
        'disagree_count', r.disagree_count,
        'pass_count',     r.pass_count
      ) ORDER BY (r.agree_count + r.disagree_count + r.pass_count) DESC, r.created_at), '[]'::jsonb)
      FROM (
        SELECT
          a.id,
          a.content,
          a.created_at,
          COUNT(av.id) FILTER (WHERE av.vote = 'agree')    AS agree_count,
          COUNT(av.id) FILTER (WHERE av.vote = 'disagree') AS disagree_count,
          COUNT(av.id) FILTER (WHERE av.vote = 'pass')     AS pass_count
        FROM assertions a
        LEFT JOIN assertion_votes av ON av.assertion_id = a.id
        WHERE a.session_id = p_session_id AND a.status = 'approved'
        GROUP BY a.id, a.content, a.created_at
      ) r
    )
  );
END;
$$;


-- ── 8. Lister/relire les analyses par id (nouveau) ───────────
-- session_analysis est déjà append-only (save_analysis fait un simple
-- INSERT depuis sa création, jamais un UPDATE/upsert) — relancer une
-- analyse n'écrase donc déjà rien. Ce qui manquait : un moyen de lister
-- toutes les analyses d'une séance et d'en relire une précise autre que
-- "la dernière", pour qu'un futur écran de comparaison puisse charger
-- une analyse 'current' et une 'pre_closure' côte à côte.

CREATE OR REPLACE FUNCTION list_session_analyses(
  p_password   text,
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM check_superadmin_password(p_password);

  SELECT jsonb_agg(jsonb_build_object(
    'id',           sa.id,
    'created_at',   sa.created_at,
    'status',       sa.status,
    'k_chosen',     sa.k_chosen,
    'vote_scope',   sa.vote_scope,
    'member_count', (SELECT COUNT(*) FROM analysis_members am WHERE am.analysis_id = sa.id)
  ) ORDER BY sa.created_at DESC) INTO v_result
  FROM session_analysis sa
  WHERE sa.session_id = p_session_id;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION get_analysis_by_id(
  p_password    text,
  p_analysis_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_analysis session_analysis%ROWTYPE;
  v_members  jsonb;
BEGIN
  PERFORM check_superadmin_password(p_password);

  SELECT * INTO v_analysis
  FROM session_analysis
  WHERE id = p_analysis_id AND status = 'done';

  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'member_id', am.member_id,
    'pca_x',     am.pca_x,
    'pca_y',     am.pca_y,
    'group_id',  am.group_id
  )) INTO v_members
  FROM analysis_members am
  WHERE am.analysis_id = v_analysis.id;

  RETURN jsonb_build_object(
    'id',                     v_analysis.id,
    'k_chosen',               v_analysis.k_chosen,
    'silhouette_score',       v_analysis.silhouette_score,
    'pca_variance_explained', v_analysis.pca_variance_explained,
    'repness',                v_analysis.repness,
    'group_consensus',        v_analysis.group_consensus,
    'created_at',             v_analysis.created_at,
    'vote_scope',             v_analysis.vote_scope,
    'members',                COALESCE(v_members, '[]'::jsonb)
  );
END;
$$;


-- =============================================================
-- ROLLBACK
-- =============================================================
-- ATTENTION : le rollback de la section 2 perd l'information
-- first_cast_phase (donc toute reconstitution pre_closure calculée
-- depuis) mais PAS les votes eux-mêmes (assertion_votes.vote intact).
-- Le rollback de la section 1 supprime définitivement l'historique
-- déjà capturé (tous les votes remplacés depuis l'application de
-- cette migration) — ne l'exécuter que si le chantier est abandonné
-- avant qu'aucune donnée réelle d'historique n'ait de valeur.
--
-- DROP FUNCTION IF EXISTS get_analysis_by_id(text, uuid);
-- DROP FUNCTION IF EXISTS list_session_analyses(text, uuid);
--
-- -- 7c/7b/7a : restaurer les définitions sans le filtre vote_scope
-- -- (voir les migrations d'origine citées en commentaire au-dessus de
-- -- chacune : 20260901_chantier46_public_results_visibility.sql,
-- -- 20260621_results_map_repness.sql, 20260611_get_latest_analysis.sql)
-- -- puis reposer les CREATE OR REPLACE FUNCTION correspondants.
--
-- CREATE OR REPLACE FUNCTION save_analysis(
--   p_password text, p_session_id uuid, p_k_chosen int, p_silhouette float,
--   p_pca_variance jsonb, p_repness jsonb, p_group_consensus jsonb, p_members jsonb
-- ) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
-- DECLARE
--   v_analysis_id uuid;
--   v_member jsonb;
-- BEGIN
--   PERFORM check_superadmin_password(p_password);
--   INSERT INTO session_analysis(
--     session_id, k_chosen, silhouette_score,
--     pca_variance_explained, repness, group_consensus, status
--   ) VALUES (
--     p_session_id, p_k_chosen, p_silhouette,
--     p_pca_variance, p_repness, p_group_consensus, 'done'
--   ) RETURNING id INTO v_analysis_id;
--   FOR v_member IN SELECT * FROM jsonb_array_elements(p_members) LOOP
--     INSERT INTO analysis_members(analysis_id, member_id, pca_x, pca_y, group_id)
--     VALUES (v_analysis_id, (v_member->>'member_id')::uuid,
--       (v_member->>'pca_x')::float, (v_member->>'pca_y')::float, (v_member->>'group_id')::int);
--   END LOOP;
--   RETURN v_analysis_id;
-- END; $$;
--
-- CREATE OR REPLACE FUNCTION get_all_votes_for_analysis(
--   p_password text, p_session_id uuid, p_attending_only boolean DEFAULT false
-- ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
-- DECLARE v_result jsonb;
-- BEGIN
--   PERFORM check_superadmin_password(p_password);
--   SELECT jsonb_agg(jsonb_build_object(
--     'member_id', av.member_id, 'assertion_id', av.assertion_id,
--     'vote', av.vote, 'attending_in_person', sm.attending_in_person
--   )) INTO v_result
--   FROM assertion_votes av
--   JOIN assertions a ON a.id = av.assertion_id
--   JOIN session_members sm ON sm.id = av.member_id
--   WHERE av.session_id = p_session_id AND a.status = 'approved'
--     AND (NOT p_attending_only OR sm.attending_in_person = true);
--   RETURN COALESCE(v_result, '[]'::jsonb);
-- END; $$;
--
-- CREATE OR REPLACE FUNCTION cast_vote(p_assertion_id uuid, p_vote text)
-- RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
-- DECLARE
--   v_session_id uuid; v_status text; v_member_id uuid; v_vote_row assertion_votes%ROWTYPE;
-- BEGIN
--   SELECT session_id, status INTO v_session_id, v_status FROM assertions WHERE id = p_assertion_id;
--   IF v_status <> 'approved' THEN RAISE EXCEPTION 'Cette assertion n''est pas approuvée'; END IF;
--   SELECT id INTO v_member_id FROM session_members
--     WHERE session_id = v_session_id AND user_id = auth.uid() LIMIT 1;
--   IF v_member_id IS NULL THEN RAISE EXCEPTION 'Vous n''êtes pas inscrit à cette séance'; END IF;
--   INSERT INTO assertion_votes(assertion_id, session_id, member_id, vote)
--   VALUES (p_assertion_id, v_session_id, v_member_id, p_vote)
--   ON CONFLICT (assertion_id, member_id) DO UPDATE SET vote = EXCLUDED.vote
--   RETURNING * INTO v_vote_row;
--   RETURN to_jsonb(v_vote_row);
-- END; $$;
--
-- ALTER TABLE session_analysis DROP COLUMN IF EXISTS vote_scope;
-- ALTER TABLE assertion_votes DROP COLUMN IF EXISTS first_cast_phase;
-- DROP TABLE IF EXISTS assertion_vote_history;
-- =============================================================
