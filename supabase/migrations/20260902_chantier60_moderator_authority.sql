-- =============================================================
-- Chantier 60 — Découpler l'autorité d'animation de la propriété
--               de la table (`tables.created_by`)
--
-- SYMPTÔME
-- --------
-- Un participant désigné modérateur par l'allocation v2
-- (`session_members.is_moderator = true`) voit bien la vue modérateur
-- depuis le chantier 41, mais aucune de ses actions n'aboutit :
--   · donner / retirer la parole            → « Not authorized »
--   · exclure un participant                → « Non autorisé »
--   · ajouter une personne sans téléphone   → « Non autorisé »
--   · forcer le questionnaire, supprimer la table → échec SILENCIEUX
--     (la policy RLS filtre l'UPDATE/DELETE : zéro ligne touchée, aucune
--     erreur remontée au client).
--
-- CAUSE
-- -----
-- Toutes les gardes d'animation testent `tables.created_by = auth.uid()`.
-- Or `apply_allocation` et `create_tables_batch` insèrent les tables avec
-- `created_by = auth.uid()`, c'est-à-dire l'identifiant anonyme du
-- SUPERADMIN qui déclenche l'allocation — jamais celui du modérateur assis
-- à la table.
--
-- Les seuls modérateurs qui fonctionnent aujourd'hui sont ceux passés par
-- « Créer une table » (`create_table`) ou par « Je suis modérateur de cette
-- table » (`reclaim_moderator`) : les deux seuls chemins qui posent ou
-- transfèrent `created_by`. D'où le fait que le défaut n'ait jamais explosé
-- en séance réelle.
--
-- CORRECTIF — option (ii) retenue : élargir les gardes
-- ----------------------------------------------------
-- Deux options étaient sur la table :
--   (i)  faire poser `created_by` par `apply_allocation` sur le modérateur
--        assis quand il est connu ;
--   (ii) faire accepter aux gardes d'animation, en plus du créateur, tout
--        membre de la séance marqué `is_moderator` ET affecté à cette table.
--
-- (ii) est retenue, et la lecture du code confirme le raisonnement :
--   · `created_by` est une colonne SCALAIRE : (i) ne peut désigner qu'un
--     seul modérateur par table et rend la co-modération impossible ;
--   · un modérateur peut être désigné APRÈS la création des tables — par
--     `claim_moderator_status` (phases `allocating` ET `debating` depuis le
--     chantier 33), `assign_moderator_to_table` (chantier 33) ou
--     `set_member_moderator` (chantier 37, qui assied aussi le membre).
--     (i) obligerait à patcher ces chemins d'écriture, plus la gestion du
--     REMPLACEMENT (retirer `created_by` à l'ancien modérateur) ;
--   · `created_by` est aussi lu comme donnée d'AFFICHAGE :
--     `list_session_tables` / `list_available_tables` joignent
--     `participants p ON p.user_id = t.created_by` pour afficher le pseudo
--     de l'animateur. Le réécrire changerait la sémantique de l'affichage
--     superadmin en plus de celle de l'autorisation ;
--   · (i) laisse une fenêtre non couverte : les tables créées par
--     `create_tables_batch` avant qu'un modérateur ne soit assis.
-- (ii) est purement ADDITIVE : le créateur garde toute son autorité, rien
-- de ce qui marche aujourd'hui ne régresse.
--
-- PÉRIMÈTRE — inventaire complet des gardes `created_by`
-- ------------------------------------------------------
-- Recherche exhaustive (`created_by = auth.uid()` / `auth.uid() = created_by`)
-- sur l'état courant des migrations. Toutes les définitions courantes des
-- fonctions d'animation vivent dans
-- `20260526000000_rename_sessions_to_tables.sql` (aucune redéfinition
-- postérieure), sauf `add_offline_participant`
-- (`20260902_chantier44_add_offline_participant.sql`).
--
-- Fonctions corrigées ici (9) :
--   1. grant_floor             ← cité par le chantier
--   2. end_turn                ← cité par le chantier
--   3. end_turn_and_advance    ← cité par le chantier
--   4. kick_participant        ← cité par le chantier
--   5. add_offline_participant ← cité par le chantier
--   6. add_to_queue            ← TROUVÉ EN PLUS : sans lui le modérateur ne
--                                peut pas mettre quelqu'un d'AUTRE en file
--                                (glisser-déposer participant → file).
--   7. move_queue_entry        ← TROUVÉ EN PLUS : ↑ / ↓ dans la file.
--   8. reorder_queue_entry     ← TROUVÉ EN PLUS : réordonnancement DnD.
--   9. correct_turn            ← TROUVÉ EN PLUS : modale « Corriger un tour ».
--
-- Policies RLS corrigées ici (7) :
--   · tables_update_moderator          ← cité par le chantier. Chemin direct
--                                        depuis le front : `forceQuestionnaire`
--                                        / `cancelForceQuestionnaire`
--                                        (TableContext, UPDATE direct).
--   · tables_delete_moderator          ← TROUVÉ EN PLUS : `endTable()`
--                                        (DELETE direct, échec silencieux).
--   · queue_entries_delete             ← TROUVÉ EN PLUS : `removeFromQueue`
--                                        et `changeQueueType` font un DELETE
--                                        DIRECT (pas de RPC) → un modérateur
--                                        désigné ne peut retirer personne de
--                                        la file, silencieusement.
--   · queue_entries_insert             ← cohérence (écritures via RPC
--                                        SECURITY DEFINER aujourd'hui).
--   · queue_entries_update_moderator   ← cohérence (idem).
--   · speaking_turns_insert_moderator  ← cohérence (idem).
--   · speaking_turns_update_moderator  ← cohérence (idem).
--
-- Occurrences de `created_by` volontairement NON touchées :
--   · `create_table`, `create_tables_batch`, `apply_allocation`,
--     `admin_create_table`, `run_clustering_*` → INSERT (attribution, pas
--     autorisation) ;
--   · `reclaim_moderator` (20260528000001), `designate_moderator`
--     (20260721) → UPDATE d'attribution : chemins de PROMOTION, hors
--     périmètre ;
--   · `list_session_tables` / `list_available_tables` /
--     `get_questionnaire_responses` → `p.user_id = t.created_by` en JOIN
--     d'AFFICHAGE (pseudo de l'animateur), pas une garde ;
--   · `end_turn_as_speaker`, `claim_floor` → gardes fondées sur
--     `participants` / `leaderless`, aucune notion de `created_by`.
--
-- CHOIX ASSUMÉ — tables `leaderless`
-- -----------------------------------
-- Le helper ne fait PAS d'exception pour `tables.leaderless = true`.
-- Raison : `assign_moderator_to_table` et `set_member_moderator` posent
-- `is_moderator = true` + une ligne `table_assignments` sans jamais
-- retourner `tables.leaderless` — exclure les tables leaderless casserait
-- donc une désignation pourtant légitime.
-- Conséquence à confirmer avec Jules (consignée dans A_VERIFIER.md) : un
-- modérateur EN SURPLUS au sens du chantier 25b (redevenu participant
-- ordinaire pour l'algorithme, mais dont `session_members.is_moderator`
-- reste `true` en base) et assis à une table leaderless obtiendrait
-- l'autorité d'animation sur celle-ci. Ce n'est pas une régression
-- introduite ici : depuis le chantier 41,
-- `TableContext.isModerator = physicalModerator || sessionMemberIsModerator`
-- lui affiche DÉJÀ la vue modérateur sur cette table. La présente migration
-- aligne le SQL sur ce que l'interface montre déjà.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 0. Garde-fou Postgres — signatures et types de retour
--
-- `CREATE OR REPLACE FUNCTION` refuse de remplacer une fonction dont le NOM
-- d'un paramètre change, et crée une SURCHARGE ambiguë si le nombre ou le
-- type des arguments change. Le projet s'est déjà fait piéger deux fois.
-- On inspecte donc `pg_get_function_identity_arguments` +
-- `pg_get_function_result` et on DROP toute surcharge qui ne correspond pas
-- exactement à ce qu'on s'apprête à créer.
--
-- Sans risque de perte de droits : aucune de ces fonctions ne porte de
-- GRANT explicite dans l'historique des migrations (elles vivent sur le
-- `EXECUTE TO PUBLIC` posé par défaut à la création), et cette migration
-- repose de toute façon un GRANT explicite après chaque création.
-- ─────────────────────────────────────────────────────────────

DO $guard$
DECLARE
  v_want record;
  v_have record;
BEGIN
  FOR v_want IN
    SELECT * FROM (VALUES
      ('is_table_moderator',      'p_table_id uuid',                                                                'boolean'),
      ('grant_floor',             'p_table_id uuid, p_participant_id uuid, p_source text',                          'void'),
      ('end_turn',                'p_table_id uuid',                                                                'void'),
      ('end_turn_and_advance',    'p_table_id uuid',                                                                'jsonb'),
      ('kick_participant',        'p_table_id uuid, p_participant_id uuid',                                         'void'),
      ('add_offline_participant', 'p_table_id uuid, p_pseudo text',                                                 'jsonb'),
      ('add_to_queue',            'p_table_id uuid, p_participant_id uuid, p_queue_type text, p_position integer',   'void'),
      ('move_queue_entry',        'p_entry_id uuid, p_direction text',                                              'void'),
      ('reorder_queue_entry',     'p_entry_id uuid, p_new_position integer',                                        'void'),
      ('correct_turn',            'p_turn_id uuid, p_started_at timestamp with time zone, p_ended_at timestamp with time zone, p_participant_id uuid', 'void')
    ) AS t(fname, args, res)
  LOOP
    FOR v_have IN
      SELECT pg_get_function_identity_arguments(p.oid) AS args,
             pg_get_function_result(p.oid)             AS res
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = v_want.fname
    LOOP
      IF v_have.args IS DISTINCT FROM v_want.args
         OR v_have.res IS DISTINCT FROM v_want.res THEN
        RAISE NOTICE 'chantier 60 — DROP public.%(%) RETURNS %  [attendu : (%) RETURNS %]',
          v_want.fname, v_have.args, v_have.res, v_want.args, v_want.res;
        EXECUTE format('DROP FUNCTION public.%I(%s)', v_want.fname, v_have.args);
      END IF;
    END LOOP;
  END LOOP;
END
$guard$;


-- ─────────────────────────────────────────────────────────────
-- 1. Helper — `is_table_moderator(p_table_id)`
--
-- Vrai si l'appelant est :
--   (a) le créateur physique de la table (`tables.created_by`) — chemin
--       historique, inchangé : « Créer une table », `reclaim_moderator`,
--       `designate_moderator` ;
--   (b) un membre de la séance de CETTE table, marqué
--       `session_members.is_moderator`, ET affecté à CETTE table précise
--       via `table_assignments`.
--
-- Les deux conditions de (b) sont indispensables et CUMULATIVES — c'est le
-- point de régression majeur du chantier : ne vérifier que `is_moderator`
-- donnerait l'autorité sur TOUTES les tables de la séance ; ne vérifier que
-- `table_assignments` la donnerait à tous les participants de la table.
--
-- `SECURITY DEFINER` : indispensable, comme pour `is_table_participant()`,
-- pour l'anti-récursion — ce helper est utilisé dans les policies RLS de
-- `tables` et lit `tables` ; en SECURITY INVOKER il rappellerait la policy
-- qu'il est en train d'évaluer. `STABLE` : lecture seule, résultat constant
-- dans une même instruction.
--
-- `SET search_path = public, extensions` : une fonction SECURITY DEFINER
-- sans search_path figé est vulnérable au détournement de résolution de
-- noms. `extensions` est inclus par convention projet (pgcrypto y vit ; son
-- omission se manifeste par un « mot de passe incorrect » trompeur dès
-- qu'une fonction de la chaîne appelle `crypt()` — cf.
-- `20260527150000_fix_crypt_path.sql`). Ni ce helper ni les fonctions
-- reprises plus bas n'appellent `crypt()`, mais le chemin reste uniforme
-- pour ne pas rejouer ce piège si une garde y était ajoutée un jour.
--
-- `table_assignments.table_id` peut être NULL : `assign_moderator_to_table`
-- et `move_member_to_group` ne le renseignent que s'il est déjà connu pour
-- ce `table_number`. On rattrape ce cas en résolvant le numéro logique vers
-- la table physique via une autre affectation de la même séance.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_table_moderator(p_table_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, extensions
AS $$
  SELECT
    -- (a) créateur physique de la table
    EXISTS (
      SELECT 1 FROM tables t
      WHERE t.id         = p_table_id
        AND t.created_by = auth.uid()
    )
    OR
    -- (b) modérateur désigné de la séance, assis à CETTE table
    EXISTS (
      SELECT 1
      FROM tables t
      JOIN session_members sm
        ON  sm.session_id   = t.session_id
        AND sm.user_id      = auth.uid()
        AND sm.is_moderator = true
      JOIN table_assignments ta
        ON  ta.member_id  = sm.id
        AND ta.session_id = t.session_id
      WHERE t.id = p_table_id
        AND t.session_id IS NOT NULL
        AND (
          ta.table_id = t.id
          OR (
            ta.table_id IS NULL
            AND EXISTS (
              SELECT 1 FROM table_assignments ta2
              WHERE ta2.session_id   = t.session_id
                AND ta2.table_number = ta.table_number
                AND ta2.table_id     = t.id
            )
          )
        )
    );
$$;

COMMENT ON FUNCTION public.is_table_moderator(uuid) IS
  'Chantier 60 — autorité d''animation sur une table : créateur physique (tables.created_by) '
  'OU membre de la séance marqué session_members.is_moderator ET affecté à cette table précise '
  '(table_assignments). Les deux conditions de la seconde branche sont cumulatives — cf. en-tête '
  'de 20260902_chantier60_moderator_authority.sql.';

GRANT EXECUTE ON FUNCTION public.is_table_moderator(uuid) TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 2. Fonctions d'animation — garde élargie
--    Corps strictement identiques à l'existant : seule la garde change.
-- ─────────────────────────────────────────────────────────────

-- ── grant_floor ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.grant_floor(
  p_table_id       uuid,
  p_participant_id uuid,
  p_source         text   -- 'long' | 'interactive' | 'manual'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT is_table_moderator(p_table_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE speaking_turns
  SET ended_at = now()
  WHERE table_id = p_table_id AND ended_at IS NULL;

  IF p_source IN ('long', 'interactive') THEN
    DELETE FROM queue_entries
    WHERE table_id       = p_table_id
      AND participant_id = p_participant_id
      AND queue_type     = p_source;
  END IF;

  INSERT INTO speaking_turns (table_id, participant_id, source)
  VALUES (p_table_id, p_participant_id, p_source);

  UPDATE tables
  SET current_speaker_id      = p_participant_id,
      current_turn_started_at = now()
  WHERE id = p_table_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_floor(uuid, uuid, text) TO anon, authenticated;

-- ── end_turn ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.end_turn(p_table_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT is_table_moderator(p_table_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE speaking_turns SET ended_at = now()
  WHERE table_id = p_table_id AND ended_at IS NULL;

  UPDATE tables
  SET current_speaker_id = NULL, current_turn_started_at = NULL
  WHERE id = p_table_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.end_turn(uuid) TO anon, authenticated;

-- ── end_turn_and_advance ─────────────────────────────────────
--
-- Garde COMPOSITE : modérateur OU orateur en cours (un participant peut
-- clore SON tour et passer la parole au suivant). Seule la branche
-- « modérateur » change ; la branche « orateur » est inchangée.

CREATE OR REPLACE FUNCTION public.end_turn_and_advance(p_table_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_is_moderator       boolean;
  v_current_speaker_id uuid;
  v_caller_part_id     uuid;
  v_next               record;
  v_new_speaker_id     uuid        := NULL;
  v_new_started_at     timestamptz := NULL;
  v_removed_entry_id   uuid        := NULL;
BEGIN
  SELECT
    is_table_moderator(p_table_id),
    (SELECT current_speaker_id FROM tables WHERE id = p_table_id)
  INTO v_is_moderator, v_current_speaker_id;

  SELECT id INTO v_caller_part_id
  FROM participants
  WHERE table_id = p_table_id AND user_id = auth.uid()
  ORDER BY created_at
  LIMIT 1;

  IF NOT v_is_moderator AND v_caller_part_id IS DISTINCT FROM v_current_speaker_id THEN
    RAISE EXCEPTION 'Not authorized: caller is not the moderator or the current speaker';
  END IF;

  IF v_current_speaker_id IS NULL THEN
    RAISE EXCEPTION 'No active speaker to end';
  END IF;

  UPDATE speaking_turns
  SET ended_at = now()
  WHERE table_id = p_table_id AND ended_at IS NULL;

  SELECT id, participant_id, queue_type
  INTO v_next
  FROM queue_entries
  WHERE table_id = p_table_id
  ORDER BY
    CASE queue_type WHEN 'interactive' THEN 0 ELSE 1 END,
    position
  LIMIT 1;

  IF v_next IS NOT NULL THEN
    v_new_speaker_id   := v_next.participant_id;
    v_removed_entry_id := v_next.id;
    v_new_started_at   := now();

    DELETE FROM queue_entries WHERE id = v_next.id;

    INSERT INTO speaking_turns (table_id, participant_id, source)
    VALUES (p_table_id, v_new_speaker_id, v_next.queue_type);

    UPDATE tables
    SET current_speaker_id      = v_new_speaker_id,
        current_turn_started_at = v_new_started_at
    WHERE id = p_table_id;
  ELSE
    UPDATE tables
    SET current_speaker_id = NULL, current_turn_started_at = NULL
    WHERE id = p_table_id;
  END IF;

  RETURN jsonb_build_object(
    'current_speaker_id',      v_new_speaker_id,
    'current_turn_started_at', v_new_started_at,
    'removed_queue_entry_id',  v_removed_entry_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.end_turn_and_advance(uuid) TO anon, authenticated;

-- ── kick_participant ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.kick_participant(
  p_table_id       uuid,
  p_participant_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT is_table_moderator(p_table_id) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  IF EXISTS (
    SELECT 1 FROM tables
    WHERE id = p_table_id AND current_speaker_id = p_participant_id
  ) THEN
    UPDATE tables
    SET current_speaker_id = NULL, current_turn_started_at = NULL
    WHERE id = p_table_id;

    UPDATE speaking_turns
    SET ended_at = now()
    WHERE table_id       = p_table_id
      AND participant_id = p_participant_id
      AND ended_at IS NULL;
  END IF;

  DELETE FROM participants
  WHERE id = p_participant_id AND table_id = p_table_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kick_participant(uuid, uuid) TO anon, authenticated;

-- ── add_offline_participant (chantier 44) ────────────────────

CREATE OR REPLACE FUNCTION public.add_offline_participant(
  p_table_id uuid,
  p_pseudo   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_participant_id uuid;
BEGIN
  -- Même garde que kick_participant / grant_floor. Chantier 60 : le
  -- créateur de la table OU le modérateur désigné assis à cette table.
  IF NOT is_table_moderator(p_table_id) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  IF p_pseudo IS NULL OR btrim(p_pseudo) = '' THEN
    RAISE EXCEPTION 'Pseudo requis';
  END IF;

  INSERT INTO participants (table_id, user_id, pseudo)
  VALUES (p_table_id, auth.uid(), btrim(p_pseudo))
  ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
  RETURNING id INTO v_participant_id;

  RETURN jsonb_build_object('participant_id', v_participant_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_offline_participant(uuid, text) TO anon, authenticated;

-- ── add_to_queue ─────────────────────────────────────────────
--
-- Garde COMPOSITE : le participant pour lui-même OU le modérateur de la
-- table pour quelqu'un d'autre. Seule la branche « modérateur » change.
-- (`!=` d'origine remplacé par `IS DISTINCT FROM` : sur un participant
-- introuvable la comparaison rendait NULL, donc la garde entière NULL,
-- donc `IF NOT NULL` faux → la garde était SAUTÉE. Cas non atteignable
-- depuis l'app — `p_participant_id` vient toujours d'une ligne lue — mais
-- l'écrire correctement coûte zéro.)

CREATE OR REPLACE FUNCTION public.add_to_queue(
  p_table_id       uuid,
  p_participant_id uuid,
  p_queue_type     text,
  p_position       int DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_pos int;
BEGIN
  IF auth.uid() IS DISTINCT FROM (SELECT user_id FROM participants WHERE id = p_participant_id)
     AND NOT is_table_moderator(p_table_id)
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_position IS NULL THEN
    SELECT COALESCE(MAX(position), 0) + 1 INTO v_pos
    FROM queue_entries
    WHERE table_id = p_table_id AND queue_type = p_queue_type;
  ELSE
    v_pos := p_position;
    UPDATE queue_entries
    SET position = position + 1
    WHERE table_id   = p_table_id
      AND queue_type = p_queue_type
      AND position  >= p_position;
  END IF;

  INSERT INTO queue_entries (table_id, participant_id, queue_type, position)
  VALUES (p_table_id, p_participant_id, p_queue_type, v_pos)
  ON CONFLICT (table_id, participant_id, queue_type) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_to_queue(uuid, uuid, text, int) TO anon, authenticated;

-- ── move_queue_entry ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.move_queue_entry(
  p_entry_id  uuid,
  p_direction text   -- 'up' | 'down'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_table_id   uuid;
  v_queue_type text;
  v_pos        int;
  v_adj_id     uuid;
  v_adj_pos    int;
BEGIN
  SELECT table_id, queue_type, position
  INTO   v_table_id, v_queue_type, v_pos
  FROM   queue_entries WHERE id = p_entry_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found'; END IF;

  IF NOT is_table_moderator(v_table_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_direction = 'up' THEN
    SELECT id, position INTO v_adj_id, v_adj_pos
    FROM   queue_entries
    WHERE  table_id = v_table_id AND queue_type = v_queue_type AND position < v_pos
    ORDER BY position DESC LIMIT 1;
  ELSE
    SELECT id, position INTO v_adj_id, v_adj_pos
    FROM   queue_entries
    WHERE  table_id = v_table_id AND queue_type = v_queue_type AND position > v_pos
    ORDER BY position ASC LIMIT 1;
  END IF;

  IF v_adj_id IS NULL THEN RETURN; END IF;

  UPDATE queue_entries SET position = v_adj_pos WHERE id = p_entry_id;
  UPDATE queue_entries SET position = v_pos      WHERE id = v_adj_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.move_queue_entry(uuid, text) TO anon, authenticated;

-- ── reorder_queue_entry ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reorder_queue_entry(p_entry_id uuid, p_new_position int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_table_id   uuid;
  v_queue_type text;
  v_old_pos    int;
  v_max_pos    int;
BEGIN
  SELECT table_id, queue_type, position
  INTO   v_table_id, v_queue_type, v_old_pos
  FROM   queue_entries WHERE id = p_entry_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found'; END IF;

  IF NOT is_table_moderator(v_table_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COALESCE(MAX(position), 1) INTO v_max_pos
  FROM queue_entries WHERE table_id = v_table_id AND queue_type = v_queue_type;

  p_new_position := GREATEST(1, LEAST(p_new_position, v_max_pos));

  IF p_new_position = v_old_pos THEN RETURN; END IF;

  IF p_new_position < v_old_pos THEN
    UPDATE queue_entries
    SET position = position + 1
    WHERE table_id   = v_table_id
      AND queue_type = v_queue_type
      AND position  >= p_new_position
      AND position   < v_old_pos
      AND id        != p_entry_id;
  ELSE
    UPDATE queue_entries
    SET position = position - 1
    WHERE table_id   = v_table_id
      AND queue_type = v_queue_type
      AND position   > v_old_pos
      AND position  <= p_new_position
      AND id        != p_entry_id;
  END IF;

  UPDATE queue_entries SET position = p_new_position WHERE id = p_entry_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_queue_entry(uuid, int) TO anon, authenticated;

-- ── correct_turn ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.correct_turn(
  p_turn_id        uuid,
  p_started_at     timestamptz DEFAULT NULL,
  p_ended_at       timestamptz DEFAULT NULL,
  p_participant_id uuid        DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_table_id uuid;
BEGIN
  SELECT table_id INTO v_table_id FROM speaking_turns WHERE id = p_turn_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Turn not found'; END IF;

  IF NOT is_table_moderator(v_table_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE speaking_turns
  SET started_at     = COALESCE(p_started_at,     started_at),
      ended_at       = COALESCE(p_ended_at,        ended_at),
      participant_id = COALESCE(p_participant_id,  participant_id)
  WHERE id = p_turn_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.correct_turn(uuid, timestamptz, timestamptz, uuid) TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3. Policies RLS — même élargissement
--
-- Rappel du mode d'échec propre à RLS : un UPDATE/DELETE refusé par une
-- policy n'est pas une erreur, il affecte simplement zéro ligne. D'où les
-- « échecs silencieux » du forçage de questionnaire et de la suppression de
-- table décrits en tête de fichier.
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS tables_update_moderator ON tables;
CREATE POLICY tables_update_moderator ON tables
  FOR UPDATE
  USING      (is_table_moderator(id))
  WITH CHECK (is_table_moderator(id));

DROP POLICY IF EXISTS tables_delete_moderator ON tables;
CREATE POLICY tables_delete_moderator ON tables
  FOR DELETE
  USING (is_table_moderator(id));

DROP POLICY IF EXISTS queue_entries_insert ON queue_entries;
CREATE POLICY queue_entries_insert ON queue_entries
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM participants
      WHERE id      = queue_entries.participant_id
        AND user_id = auth.uid()
    )
    OR is_table_moderator(queue_entries.table_id)
  );

DROP POLICY IF EXISTS queue_entries_update_moderator ON queue_entries;
CREATE POLICY queue_entries_update_moderator ON queue_entries
  FOR UPDATE
  USING      (is_table_moderator(queue_entries.table_id))
  WITH CHECK (is_table_moderator(queue_entries.table_id));

DROP POLICY IF EXISTS queue_entries_delete ON queue_entries;
CREATE POLICY queue_entries_delete ON queue_entries
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM participants
      WHERE id      = queue_entries.participant_id
        AND user_id = auth.uid()
    )
    OR is_table_moderator(queue_entries.table_id)
  );

DROP POLICY IF EXISTS speaking_turns_insert_moderator ON speaking_turns;
CREATE POLICY speaking_turns_insert_moderator ON speaking_turns
  FOR INSERT
  WITH CHECK (is_table_moderator(speaking_turns.table_id));

DROP POLICY IF EXISTS speaking_turns_update_moderator ON speaking_turns;
CREATE POLICY speaking_turns_update_moderator ON speaking_turns
  FOR UPDATE
  USING      (is_table_moderator(speaking_turns.table_id))
  WITH CHECK (is_table_moderator(speaking_turns.table_id));


-- =============================================================
-- REQUÊTES DE VÉRIFICATION (à exécuter après application)
-- =============================================================
--
-- 1. Le helper existe, avec la bonne signature et le bon search_path :
--    SELECT p.proname,
--           pg_get_function_identity_arguments(p.oid) AS args,
--           pg_get_function_result(p.oid)             AS res,
--           p.prosecdef                               AS security_definer,
--           p.proconfig                               AS search_path
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'is_table_moderator';
--    → attendu : (p_table_id uuid) | boolean | t | {"search_path=public, extensions"}
--
-- 2. Aucune surcharge résiduelle sur les 9 fonctions reprises :
--    SELECT p.proname, count(*)
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('grant_floor','end_turn','end_turn_and_advance',
--                        'kick_participant','add_offline_participant',
--                        'add_to_queue','move_queue_entry',
--                        'reorder_queue_entry','correct_turn')
--    GROUP BY p.proname HAVING count(*) > 1;
--    → attendu : 0 ligne
--
-- 3. Plus aucune garde `created_by` dans les corps repris :
--    SELECT p.proname
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('grant_floor','end_turn','end_turn_and_advance',
--                        'kick_participant','add_offline_participant',
--                        'add_to_queue','move_queue_entry',
--                        'reorder_queue_entry','correct_turn')
--      AND p.prosrc LIKE '%created_by%';
--    → attendu : 0 ligne
--
-- 4. Les 7 policies pointent bien sur le helper :
--    SELECT tablename, policyname, qual, with_check
--    FROM pg_policies
--    WHERE schemaname = 'public'
--      AND policyname IN ('tables_update_moderator','tables_delete_moderator',
--                         'queue_entries_insert','queue_entries_update_moderator',
--                         'queue_entries_delete','speaking_turns_insert_moderator',
--                         'speaking_turns_update_moderator');
--    → attendu : `is_table_moderator(...)` partout, plus aucun `created_by`
--
-- 5. Table de vérité du helper sur une séance réelle (remplacer <TABLE_ID>).
--    Se lit « pour chaque membre de la séance, aurait-il l'autorité sur
--    cette table ? » — sans avoir à se connecter sous chaque identité :
--    WITH cible AS (SELECT id, session_id, created_by FROM tables WHERE id = '<TABLE_ID>')
--    SELECT sm.pseudo,
--           sm.is_moderator,
--           ta.table_id = c.id                              AS assis_a_cette_table,
--           sm.user_id  = c.created_by                      AS createur,
--           (sm.user_id = c.created_by)
--             OR (sm.is_moderator AND ta.table_id = c.id)   AS autorite_attendue
--    FROM cible c
--    JOIN session_members sm        ON sm.session_id = c.session_id
--    LEFT JOIN table_assignments ta ON ta.member_id  = sm.id
--    ORDER BY autorite_attendue DESC NULLS LAST, sm.pseudo;
--    → attendu : `autorite_attendue = true` UNIQUEMENT pour le créateur et
--      pour les modérateurs assis à cette table. En particulier : un
--      modérateur d'une AUTRE table de la même séance doit ressortir
--      `false`.
--
-- =============================================================
-- SQL D'ANNULATION (rollback complet vers l'état pré-chantier 60)
-- =============================================================
--
-- Restaure les gardes `created_by` telles qu'elles étaient dans
-- `20260526000000_rename_sessions_to_tables.sql` (+ chantier 44 pour
-- `add_offline_participant`), et supprime le helper.
--
-- Les 7 policies sont restaurées intégralement ci-dessous. Pour les 9
-- fonctions, le rollback consiste à recopier les corps d'origine, qui sont
-- déjà en base sous forme de fichiers :
--   · les 8 premières  → `20260526000000_rename_sessions_to_tables.sql`,
--                        section « I. Recréer les fonctions SECURITY
--                        DEFINER » (grant_floor, end_turn, add_to_queue,
--                        move_queue_entry, correct_turn, reorder_queue_entry,
--                        kick_participant, end_turn_and_advance) ;
--   · add_offline_participant → `20260902_chantier44_add_offline_participant.sql`
--                        (rejouable EN ENTIER, c'est un simple
--                        CREATE OR REPLACE).
--
-- ⚠️ NE PAS rejouer `20260526000000_rename_sessions_to_tables.sql` en
-- entier : ce fichier renomme `sessions` → `tables` et DROP les policies
-- avant de les recréer — il n'est pas idempotent sur une base déjà migrée.
-- N'en extraire QUE les blocs `CREATE OR REPLACE FUNCTION` des 8 fonctions
-- listées (à partir de « ── grant_floor ── », ~ligne 447).
--
-- Après quoi :
--
-- BEGIN;
--
-- DROP POLICY IF EXISTS tables_update_moderator ON tables;
-- CREATE POLICY tables_update_moderator ON tables FOR UPDATE
--   USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
--
-- DROP POLICY IF EXISTS tables_delete_moderator ON tables;
-- CREATE POLICY tables_delete_moderator ON tables FOR DELETE
--   USING (auth.uid() = created_by);
--
-- DROP POLICY IF EXISTS queue_entries_insert ON queue_entries;
-- CREATE POLICY queue_entries_insert ON queue_entries FOR INSERT WITH CHECK (
--   EXISTS (SELECT 1 FROM participants WHERE id = queue_entries.participant_id AND user_id = auth.uid())
--   OR EXISTS (SELECT 1 FROM tables WHERE id = queue_entries.table_id AND created_by = auth.uid()));
--
-- DROP POLICY IF EXISTS queue_entries_update_moderator ON queue_entries;
-- CREATE POLICY queue_entries_update_moderator ON queue_entries FOR UPDATE
--   USING      (EXISTS (SELECT 1 FROM tables WHERE id = queue_entries.table_id AND created_by = auth.uid()))
--   WITH CHECK (EXISTS (SELECT 1 FROM tables WHERE id = queue_entries.table_id AND created_by = auth.uid()));
--
-- DROP POLICY IF EXISTS queue_entries_delete ON queue_entries;
-- CREATE POLICY queue_entries_delete ON queue_entries FOR DELETE USING (
--   EXISTS (SELECT 1 FROM participants WHERE id = queue_entries.participant_id AND user_id = auth.uid())
--   OR EXISTS (SELECT 1 FROM tables WHERE id = queue_entries.table_id AND created_by = auth.uid()));
--
-- DROP POLICY IF EXISTS speaking_turns_insert_moderator ON speaking_turns;
-- CREATE POLICY speaking_turns_insert_moderator ON speaking_turns FOR INSERT
--   WITH CHECK (EXISTS (SELECT 1 FROM tables WHERE id = speaking_turns.table_id AND created_by = auth.uid()));
--
-- DROP POLICY IF EXISTS speaking_turns_update_moderator ON speaking_turns;
-- CREATE POLICY speaking_turns_update_moderator ON speaking_turns FOR UPDATE
--   USING      (EXISTS (SELECT 1 FROM tables WHERE id = speaking_turns.table_id AND created_by = auth.uid()))
--   WITH CHECK (EXISTS (SELECT 1 FROM tables WHERE id = speaking_turns.table_id AND created_by = auth.uid()));
--
-- DROP FUNCTION IF EXISTS public.is_table_moderator(uuid);
--
-- COMMIT;
