-- =============================================================
-- Chantier 64 (complément) — Origine d'une table + bascule arrière
--               au départ du modérateur
--
-- DEMANDE DE JULES (complément à la migration 20260902_chantier64_...)
-- -----------------------------------------------------------------------
-- « Pour le cas où le modérateur part, il faut distinguer deux cas. Le
-- premier cas est une table directement créée pour avoir un modérateur.
-- dans ce cas, si le modo part, aucun problème, elle reste comme avant, il
-- va revenir. Si la table était une table sans modérateur, devient
-- modérateur, et que le modérateur part de la table (va dans une autre
-- table), oui, on peut refaire devenir cette table en non modérateur. De
-- préférence, il faudrait que l'historique des files, et de la table en
-- général avec le temps de parole ou autre, soit persistant de ces
-- transformations. »
--
-- La première migration de ce chantier (20260902_chantier64_...) avait posé
-- explicitement, faute de mieux à l'époque, que retirer un modérateur ne
-- repose jamais `leaderless = true` — parce qu'aucune colonne ne permettait
-- de distinguer une table conçue pour avoir un modérateur d'une table
-- devenue modérée en cours de route. Jules tranche maintenant : il FAUT
-- cette distinction, et le comportement diffère selon le cas.
--
-- 1. NOUVELLE COLONNE — `tables.leaderless_by_design`
-- -----------------------------------------------------------------------
-- Le booléen `leaderless` décrit l'état COURANT (y a-t-il un modérateur en
-- ce moment). Il ne suffit plus à lui seul : il faut aussi savoir ce que la
-- table est *censée* être. D'où `leaderless_by_design boolean NOT NULL
-- DEFAULT false` :
--   · `true`  → table conçue pour s'auto-organiser. `leaderless` peut
--     temporairement valoir `false` (un membre assis dessus est devenu
--     modérateur — chantier 64 initial) ; si CE modérateur s'en va vers une
--     autre table (`switch_table`), la table redevient `leaderless = true`.
--   · `false` → table conçue pour avoir un modérateur. Si son modérateur
--     s'en va, **rien ne change** : `leaderless` reste `false`, Jules
--     considère qu'il va revenir.
--
-- Posée UNE FOIS par les opérations qui DÉCIDENT authentiquement de la
-- nature d'une table — création et (re)calcul d'allocation — jamais par les
-- conversions/bascules organiques (chantier 64 initial, et la bascule
-- arrière ci-dessous) :
--   · `create_table`, `admin_create_table`, `create_tables_batch` : posée à
--     la création, égale au `leaderless` initial demandé.
--   · `apply_allocation` : reposée à CHAQUE calcul (tables réutilisées et
--     nouvelles), égale à `NOT v_moderated` — un recalcul d'allocation est
--     une redécision autoritaire de ce que chaque table doit être, y
--     compris pour une table réutilisée qui aurait été `leaderless` avant
--     ce recalcul (elle devient alors « conçue pour avoir un modérateur »
--     à part entière, plus une conversion organique révocable).
--
-- Backfill (tables déjà existantes) : `leaderless_by_design = leaderless`.
-- Best-effort assumé, faute d'historique : une table DÉJÀ convertie par le
-- chantier 64 initial avant l'application de cette migration (fenêtre
-- réduite : ce chantier n'a jamais été appliqué en production) sera
-- classée à tort comme « conçue pour avoir un modérateur » et ne pourra
-- donc jamais être re-bascule automatiquement. C'est le défaut le plus sûr
-- (il ne retire jamais l'autorité de quelqu'un par surprise) — documenté
-- dans A_VERIFIER.md plutôt que traité en silence.
--
-- 2. BASCULE ARRIÈRE — `switch_table` (chantier 48)
-- -----------------------------------------------------------------------
-- Jules est explicite sur le déclencheur : le participant qui REJOINT UNE
-- AUTRE TABLE via `switch_table`. Le bouton « Quitter » (`leaveTable()`,
-- purement local — ne supprime aucune ligne, cf. tranché ce matin par
-- Jules) ne compte PAS et n'est pas touché par cette migration.
--
-- Avant tout déplacement, `switch_table` capture désormais si l'appelant
-- est le modérateur Bloc C (`session_members.is_moderator = true`) de la
-- table qu'il quitte (résolue via `table_assignments`, PAS via
-- `participants` — c'est `table_assignments` qui porte l'autorité,
-- cf. `is_table_moderator`). Après le déplacement (une fois
-- `sync_table_assignment` exécuté), si ces conditions tenaient ET que la
-- table quittée a `leaderless_by_design = true`, elle repasse
-- `leaderless = true`.
--
-- Cas volontairement exclus de cette bascule, à trancher séparément si
-- besoin (pas dans le périmètre de la demande de Jules, qui ne cite que
-- `switch_table`) :
--   · `set_member_moderator(..., false)` (retrait en place, le membre RESTE
--     à la même table) — décision déjà prise par la migration initiale de
--     ce chantier et INCHANGÉE : rester assis ne « libère » pas la table.
--   · `move_member_to_group` (déplacement d'un membre par le superadmin,
--     onglet Groupes) — mécaniquement identique à `switch_table` (le membre
--     quitte une table pour une autre), mais Jules ne l'a pas nommé. Pas
--     touché ici ; signalé dans A_VERIFIER.md plutôt que traité par
--     extrapolation silencieuse du périmètre demandé.
--   · `kick_participant` — le modérateur exclut quelqu'un d'autre, jamais
--     lui-même ; scénario non atteignable en pratique.
--
-- 3. HISTORIQUE PRÉSERVÉ — aucun DELETE/TRUNCATE déclenché par la bascule
-- -----------------------------------------------------------------------
-- Vérifié par lecture : aucun trigger n'existe sur `tables` dans tout
-- l'historique de migrations (`grep CREATE TRIGGER` : zéro résultat dans
-- `supabase/migrations/`). `leaderless`/`leaderless_by_design` sont de
-- simples colonnes booléennes sans FK ni règle associée — les faire
-- basculer, dans un sens comme dans l'autre, ne touche ni `queue_entries`,
-- ni `speaking_turns`, ni `participants`. La seule suppression qui se
-- produit dans `switch_table` est celle, déjà existante et inchangée,
-- de la ligne `participants` du membre qui change de table (et son
-- CASCADE sur ses propres `queue_entries`, comme pour n'importe quel
-- départ) — jamais un DELETE en masse sur la table quittée. Scénario de
-- vérification écrit dans A_VERIFIER.md.
--
-- SIGNATURES INCHANGÉES
-- -----------------------
-- `create_table`, `admin_create_table`, `create_tables_batch`,
-- `apply_allocation`, `switch_table` gardent exactement leur signature et
-- leur type de retour d'origine — `CREATE OR REPLACE` suffit.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 0. Garde-fou Postgres — signatures inchangées
-- ─────────────────────────────────────────────────────────────

DO $guard$
DECLARE
  v_want record;
  v_have record;
BEGIN
  FOR v_want IN
    SELECT * FROM (VALUES
      ('create_table',        'p_pseudo text, p_creation_code text, p_session_id uuid, p_leaderless boolean', 'jsonb'),
      ('admin_create_table',  'p_password text, p_session_id uuid, p_leaderless boolean',                     'jsonb'),
      ('create_tables_batch', 'p_password text, p_session_id uuid, p_leaderless boolean[]',                   'jsonb'),
      ('apply_allocation',    'p_password text, p_session_id uuid, p_tables jsonb',                            'jsonb'),
      ('switch_table',        'p_session_id uuid, p_join_code text, p_pseudo text',                            'jsonb')
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
        RAISE NOTICE 'chantier 64b — DROP public.%(%) RETURNS %  [attendu : (%) RETURNS %]',
          v_want.fname, v_have.args, v_have.res, v_want.args, v_want.res;
        EXECUTE format('DROP FUNCTION public.%I(%s)', v_want.fname, v_have.args);
      END IF;
    END LOOP;
  END LOOP;
END
$guard$;


-- ─────────────────────────────────────────────────────────────
-- 1. Colonne d'origine + backfill
-- ─────────────────────────────────────────────────────────────

ALTER TABLE tables ADD COLUMN IF NOT EXISTS leaderless_by_design boolean NOT NULL DEFAULT false;

-- Best-effort : voir en-tête pour la limite assumée sur les tables déjà
-- converties par le chantier 64 initial avant application de cette
-- migration (fenêtre nulle en pratique — jamais appliqué en production).
UPDATE tables SET leaderless_by_design = leaderless WHERE leaderless_by_design IS DISTINCT FROM leaderless;


-- ─────────────────────────────────────────────────────────────
-- 2. create_table — pose leaderless_by_design à la création
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_table(
  p_pseudo        text,
  p_creation_code text,
  p_session_id    uuid    DEFAULT NULL,
  p_leaderless    boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash           text;
  v_join_code      text;
  v_table_id       uuid;
  v_participant_id uuid;
  v_result         jsonb;
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'session_required';
  END IF;

  IF NOT p_leaderless THEN
    SELECT value INTO v_hash FROM app_config WHERE key = 'creation_code_hash';
    IF crypt(p_creation_code, v_hash) IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'Code de création invalide';
    END IF;
  END IF;

  LOOP
    v_join_code := upper(encode(gen_random_bytes(3), 'hex'));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM tables WHERE join_code = v_join_code);
  END LOOP;

  INSERT INTO tables (join_code, created_by, session_id, leaderless, leaderless_by_design)
  VALUES (v_join_code, auth.uid(), p_session_id, p_leaderless, p_leaderless)
  RETURNING id INTO v_table_id;

  INSERT INTO participants (table_id, user_id, pseudo)
  VALUES (v_table_id, auth.uid(), p_pseudo)
  RETURNING id INTO v_participant_id;

  PERFORM sync_table_assignment(p_session_id, v_table_id, auth.uid(), p_pseudo);

  SELECT jsonb_build_object(
    'id',                      s.id,
    'join_code',               s.join_code,
    'created_by',              s.created_by,
    'current_speaker_id',      s.current_speaker_id,
    'current_turn_started_at', s.current_turn_started_at,
    'created_at',              s.created_at,
    'session_id',              s.session_id,
    'leaderless',              s.leaderless,
    'participant_id',          v_participant_id
  ) INTO v_result
  FROM tables s WHERE s.id = v_table_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION create_table(text, text, uuid, boolean) TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3. admin_create_table — idem
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_create_table(
  p_password   text,
  p_session_id uuid    DEFAULT NULL,
  p_leaderless boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_join_code text;
  v_table_id  uuid;
BEGIN
  PERFORM check_superadmin_password(p_password);

  LOOP
    v_join_code := upper(encode(gen_random_bytes(3), 'hex'));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM tables WHERE join_code = v_join_code);
  END LOOP;

  INSERT INTO tables (join_code, created_by, session_id, leaderless, leaderless_by_design)
  VALUES (v_join_code, auth.uid(), p_session_id, p_leaderless, p_leaderless)
  RETURNING id INTO v_table_id;

  RETURN jsonb_build_object('table_id', v_table_id, 'join_code', v_join_code);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_create_table(text, uuid, boolean) TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4. create_tables_batch — idem, un booléen par table
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_tables_batch(
  p_password   text,
  p_session_id uuid,
  p_leaderless boolean[]
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count     int;
  v_i         int;
  v_join_code text;
  v_table_id  uuid;
  v_out       jsonb := '[]'::jsonb;
BEGIN
  PERFORM check_superadmin_password(p_password);

  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'session_id requis';
  END IF;

  v_count := COALESCE(array_length(p_leaderless, 1), 0);
  IF v_count < 1 THEN
    RAISE EXCEPTION 'Aucune table à créer';
  END IF;
  IF v_count > 60 THEN
    RAISE EXCEPTION 'Trop de tables demandées (%). Maximum 60.', v_count;
  END IF;

  FOR v_i IN 1..v_count LOOP
    LOOP
      v_join_code := upper(encode(gen_random_bytes(3), 'hex'));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM tables WHERE join_code = v_join_code);
    END LOOP;

    INSERT INTO tables (join_code, created_by, session_id, leaderless, leaderless_by_design)
    VALUES (v_join_code, auth.uid(), p_session_id, COALESCE(p_leaderless[v_i], false), COALESCE(p_leaderless[v_i], false))
    RETURNING id INTO v_table_id;

    v_out := v_out || jsonb_build_object(
      'table_id',   v_table_id,
      'join_code',  v_join_code,
      'leaderless', COALESCE(p_leaderless[v_i], false)
    );
  END LOOP;

  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION create_tables_batch(text, uuid, boolean[]) TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5. apply_allocation — repose leaderless_by_design à chaque recalcul
--    (tables réutilisées ET nouvelles). Corps inchangé sinon.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION apply_allocation(
  p_password   text,
  p_session_id uuid,
  p_tables     jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count       int;
  v_entry       jsonb;
  v_num         int;
  v_moderated   boolean;
  v_table_id    uuid;
  v_join_code   text;
  v_free_ids    uuid[];
  v_used        int := 0;
  v_created     int := 0;
  v_members     int := 0;
  v_member_id   uuid;
  v_used_ids    uuid[] := ARRAY[]::uuid[];
  v_detached    int := 0;
  v_orphaned    int := 0;
BEGIN
  PERFORM check_superadmin_password(p_password);

  IF p_tables IS NULL OR jsonb_typeof(p_tables) <> 'array' THEN
    RAISE EXCEPTION 'Payload d''allocation invalide';
  END IF;

  v_count := jsonb_array_length(p_tables);
  IF v_count < 1 THEN
    RAISE EXCEPTION 'Aucune table dans le résultat d''allocation';
  END IF;

  -- Tables physiques déjà rattachées, réutilisables (ordre stable).
  SELECT COALESCE(array_agg(id ORDER BY join_code), ARRAY[]::uuid[])
    INTO v_free_ids
  FROM tables
  WHERE session_id = p_session_id;

  DELETE FROM table_assignments WHERE session_id = p_session_id;

  FOR v_entry IN SELECT jsonb_array_elements(p_tables) LOOP
    v_num       := (v_entry->>'table_number')::int;
    v_moderated := COALESCE((v_entry->>'moderated')::boolean, false);

    -- Réutiliser une table existante, sinon en créer une.
    IF v_used < COALESCE(array_length(v_free_ids, 1), 0) THEN
      v_used     := v_used + 1;
      v_table_id := v_free_ids[v_used];
      -- Chantier 64 (complément) — un recalcul d'allocation redécide de la
      -- nature de la table, même si elle était `leaderless` avant (ex.
      -- table créée hors allocation puis rattachée) : `leaderless_by_design`
      -- suit `leaderless` ici, ce n'est plus une conversion organique
      -- révocable mais une redésignation autoritaire.
      UPDATE tables SET leaderless = NOT v_moderated, leaderless_by_design = NOT v_moderated WHERE id = v_table_id;
    ELSE
      LOOP
        v_join_code := upper(encode(gen_random_bytes(3), 'hex'));
        EXIT WHEN NOT EXISTS (SELECT 1 FROM tables WHERE join_code = v_join_code);
      END LOOP;
      INSERT INTO tables (join_code, created_by, session_id, leaderless, leaderless_by_design)
      VALUES (v_join_code, auth.uid(), p_session_id, NOT v_moderated, NOT v_moderated)
      RETURNING id INTO v_table_id;
      v_created := v_created + 1;
    END IF;

    v_used_ids := v_used_ids || v_table_id;

    -- Participants + modérateurs de cette table
    FOR v_member_id IN
      SELECT value::uuid FROM jsonb_array_elements_text(
        COALESCE(v_entry->'member_ids', '[]'::jsonb)
        || COALESCE(v_entry->'moderator_member_ids', '[]'::jsonb)
      ) AS value
    LOOP
      INSERT INTO table_assignments(session_id, member_id, table_number, table_id)
      VALUES (p_session_id, v_member_id, v_num, v_table_id)
      ON CONFLICT (session_id, member_id) DO UPDATE
        SET table_number = EXCLUDED.table_number,
            table_id     = EXCLUDED.table_id;
      v_members := v_members + 1;
    END LOOP;
  END LOOP;

  -- ── H18 : détacher les tables excédentaires et vides ──
  -- Reliquats d'une allocation précédente plus large. On ne touche pas à
  -- celles où quelqu'un a déjà rejoint (`participants`) : on ne coupe pas le
  -- sol sous les pieds d'un participant déjà en séance.
  --
  -- Compté d'abord, modifié ensuite (plutôt qu'une CTE modifiante référencée
  -- en sous-requête scalaire, dont la validité est moins évidente à relire).
  SELECT
    count(*) FILTER (WHERE NOT has_people),
    count(*) FILTER (WHERE has_people)
  INTO v_detached, v_orphaned
  FROM (
    SELECT EXISTS (SELECT 1 FROM participants p WHERE p.table_id = t.id) AS has_people
    FROM tables t
    WHERE t.session_id = p_session_id
      AND NOT (t.id = ANY (v_used_ids))
  ) s;

  UPDATE tables t
  SET session_id = NULL
  WHERE t.session_id = p_session_id
    AND NOT (t.id = ANY (v_used_ids))
    AND NOT EXISTS (SELECT 1 FROM participants p WHERE p.table_id = t.id);

  UPDATE sessions
  SET phase = 'allocating', phase_changed_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'table_count',     v_count,
    'member_count',    v_members,
    'tables_created',  v_created,
    'tables_reused',   v_used,
    -- Tables reliquats remises dans le pool des tables libres.
    'tables_detached', v_detached,
    -- Tables reliquats conservées car des participants y sont déjà.
    'tables_orphaned', v_orphaned
  );
END;
$$;

GRANT EXECUTE ON FUNCTION apply_allocation(text, uuid, jsonb) TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 6. switch_table — bascule arrière si le modérateur qui part quittait une
--    table `leaderless_by_design`
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION switch_table(
  p_session_id uuid,
  p_join_code  text,
  p_pseudo     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table_id            uuid;
  v_table_session       uuid;
  v_participant_id      uuid;
  v_old_table_id        uuid;
  v_result              jsonb;
  v_is_moderator        boolean;
  v_prev_assigned_table uuid;
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'Séance requise.';
  END IF;

  SELECT id, session_id INTO v_table_id, v_table_session
  FROM tables WHERE join_code = upper(p_join_code);

  IF v_table_id IS NULL THEN
    RAISE EXCEPTION 'Aucune table ne correspond à ce code.';
  END IF;

  IF v_table_session IS DISTINCT FROM p_session_id THEN
    RAISE EXCEPTION 'Ce code correspond à une table d''une autre séance.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM participants WHERE table_id = v_table_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Tu es déjà à cette table.';
  END IF;

  -- Chantier 64 (complément) — capturer AVANT tout déplacement : ce
  -- participant est-il le modérateur Bloc C (session_members.is_moderator)
  -- de la table qu'il s'apprête à quitter (table_assignments — c'est elle
  -- qui porte l'autorité, cf. is_table_moderator, pas `participants`) ?
  -- NULL si pas de ligne session_members pour ce user dans cette séance —
  -- traité comme "pas modérateur" par le AND ci-dessous (logique à 3 valeurs).
  SELECT sm.is_moderator, ta.table_id
  INTO v_is_moderator, v_prev_assigned_table
  FROM session_members sm
  LEFT JOIN table_assignments ta
    ON  ta.session_id = sm.session_id
    AND ta.member_id  = sm.id
  WHERE sm.session_id = p_session_id
    AND sm.user_id    = auth.uid();

  -- Retirer proprement le participant de ses éventuelles tables précédentes
  -- dans CETTE séance (normalement une seule, on couvre plusieurs par
  -- sécurité) — même traitement que kick_participant : libère le micro et
  -- clôt le tour en cours avant de supprimer la ligne (cascade queue/turns).
  FOR v_old_table_id IN
    SELECT DISTINCT p.table_id
    FROM participants p
    JOIN tables t ON t.id = p.table_id
    WHERE p.user_id = auth.uid() AND t.session_id = p_session_id
  LOOP
    UPDATE tables
    SET current_speaker_id = NULL, current_turn_started_at = NULL
    WHERE id = v_old_table_id
      AND current_speaker_id IN (
        SELECT id FROM participants WHERE table_id = v_old_table_id AND user_id = auth.uid()
      );

    UPDATE speaking_turns
    SET ended_at = now()
    WHERE table_id = v_old_table_id
      AND participant_id IN (
        SELECT id FROM participants WHERE table_id = v_old_table_id AND user_id = auth.uid()
      )
      AND ended_at IS NULL;

    DELETE FROM participants WHERE table_id = v_old_table_id AND user_id = auth.uid();
  END LOOP;

  INSERT INTO participants (table_id, user_id, pseudo)
  VALUES (v_table_id, auth.uid(), p_pseudo)
  ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
  RETURNING id INTO v_participant_id;

  PERFORM sync_table_assignment(p_session_id, v_table_id, auth.uid(), p_pseudo);

  -- Chantier 64 (complément) — bascule arrière de la table quittée. Ne
  -- change QUE `leaderless` : `leaderless_by_design` reste `true`, la table
  -- peut être reconvertie puis re-basculée indéfiniment.
  IF v_is_moderator
     AND v_prev_assigned_table IS NOT NULL
     AND v_prev_assigned_table IS DISTINCT FROM v_table_id
  THEN
    UPDATE tables
    SET leaderless = true
    WHERE id = v_prev_assigned_table
      AND leaderless_by_design = true;
  END IF;

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

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION switch_table(uuid, text, text) TO anon, authenticated;


-- =============================================================
-- REQUÊTES DE VÉRIFICATION (à exécuter après application)
-- =============================================================
--
-- 1. Colonne posée, backfill cohérent avec l'état courant :
--    SELECT count(*) FROM tables WHERE leaderless_by_design IS DISTINCT FROM leaderless;
--    → non nul seulement pour une table déjà convertie par le chantier 64
--      initial avant cette migration (cf. limite documentée en en-tête) ;
--      attendu : 0 en pratique, ce chantier n'ayant jamais été appliqué.
--
-- 2. Table conçue modérée dès l'origine : le départ ne change rien.
--    (remplacer les UUID par une vraie table créée via create_table avec
--    p_leaderless=false, avec un modérateur assis dessus)
--    SELECT leaderless, leaderless_by_design FROM tables WHERE id = '<TABLE_ID>'; -- false, false
--    SELECT switch_table('<SESSION_ID>', '<AUTRE_JOIN_CODE>', '<PSEUDO>');
--    SELECT leaderless, leaderless_by_design FROM tables WHERE id = '<TABLE_ID>'; -- toujours false, false
--
-- 3. Table convertie depuis leaderless : le départ du modérateur la bascule.
--    (table créée leaderless=true, puis convertie via set_member_moderator/
--    claim_moderator_status/assign_moderator_to_table — chantier 64 initial)
--    SELECT leaderless, leaderless_by_design FROM tables WHERE id = '<TABLE_ID>'; -- false, true
--    SELECT switch_table('<SESSION_ID>', '<AUTRE_JOIN_CODE>', '<PSEUDO>');  -- appelé par LE modérateur
--    SELECT leaderless, leaderless_by_design FROM tables WHERE id = '<TABLE_ID>'; -- true, true
--
-- 4. Historique préservé (voir aussi A_VERIFIER.md) :
--    SELECT count(*) FROM speaking_turns WHERE table_id = '<TABLE_ID>';   -- avant bascule
--    -- ... déclencher la bascule (test 3 ci-dessus) ...
--    SELECT count(*) FROM speaking_turns WHERE table_id = '<TABLE_ID>';   -- identique après
--    SELECT count(*) FROM queue_entries  WHERE table_id = '<TABLE_ID>';   -- inchangé pour les entrées
--                                                                            des AUTRES participants
--
-- =============================================================
-- SQL D'ANNULATION (rollback vers l'état pré-complément)
-- =============================================================
--
-- Recopier tel quel le corps des 5 fonctions depuis leurs dernières
-- définitions pré-complément (aucune n'a changé de signature) :
--   · create_table        → 20260727_6_chantier26_sync_table_assignments.sql
--   · admin_create_table  → 20260618_leaderless_tables.sql
--   · create_tables_batch → 20260725_2_allocation_v2.sql
--   · apply_allocation    → 20260727_4_chantier25_allocation_surplus.sql
--   · switch_table        → 20260902_chantier48_switch_table.sql
--
-- BEGIN;
-- -- ... recopier les 5 CREATE OR REPLACE FUNCTION depuis les fichiers ci-dessus ...
-- ALTER TABLE tables DROP COLUMN IF EXISTS leaderless_by_design;
-- COMMIT;
-- =============================================================
