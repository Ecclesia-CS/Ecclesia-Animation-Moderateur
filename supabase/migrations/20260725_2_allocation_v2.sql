-- =============================================================
-- Chantier 19 — Allocation v2 (spec : docs/chantier-5-allocation-v2-spec.md)
--
-- 1. (G4) session_members.is_moderator + set_member_moderator
-- 2. (G2) create_tables_batch — création de N tables vides en lot
-- 3.      get_allocation_inputs — entrées de l'algo (bypass RLS)
-- 4.      apply_allocation — persiste le résultat calculé côté client
--
-- Le calcul lui-même est côté client (src/lib/allocation.ts) : contraintes,
-- recherche locale et nombre de tables variable sont ingérables proprement
-- en plpgsql (§9 de la spec).
--
-- ⚠️ À appliquer APRÈS 20260725_1_onboarding_3_questions.sql
--    (get_allocation_inputs lit entry_responses.ecclesia_experience en booléen).
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. (G4) Statut « modérateur POUR CETTE séance »
--
-- À ne pas confondre avec `questionnaire_responses.staff_interest`
-- (« je voudrais être modérateur à une séance future ») qui reste un
-- signal de recrutement informatif, inchangé et hors scope.
--
-- Ce signal-ci est un critère DUR de l'algorithme d'allocation : il
-- détermine le nombre de tables animées. Il est posé hors onboarding —
-- à l'entrée en séance via le mot de passe Ecclesia (chantier 21) ou
-- directement par le superadmin — et doit être disponible AVANT le
-- lancement de l'allocation.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE session_members
  ADD COLUMN IF NOT EXISTS is_moderator boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN session_members.is_moderator IS
  'Modérateur pour CETTE séance (critère dur de l''allocation v2). '
  'Distinct de questionnaire_responses.staff_interest (recrutement futur).';

-- Marquage / démarquage par le superadmin (fallback du chantier 21 :
-- modérateur arrivé en retard ou ayant oublié le mot de passe Ecclesia).
CREATE OR REPLACE FUNCTION set_member_moderator(
  p_password     text,
  p_session_id   uuid,
  p_member_id    uuid,
  p_is_moderator boolean
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_member session_members%ROWTYPE;
BEGIN
  PERFORM check_superadmin_password(p_password);

  UPDATE session_members
  SET is_moderator = p_is_moderator
  WHERE id = p_member_id
    AND session_id = p_session_id
  RETURNING * INTO v_member;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membre introuvable pour cette séance';
  END IF;

  RETURN to_jsonb(v_member);
END;
$$;

GRANT EXECUTE ON FUNCTION set_member_moderator(text, uuid, uuid, boolean) TO anon, authenticated;

-- Auto-déclaration via le mot de passe Ecclesia (code de création).
-- Prépare le flow du chantier 21 (onglet « Modérateur » de l'accueil) :
-- le membre doit déjà être inscrit à la séance.
CREATE OR REPLACE FUNCTION claim_moderator_status(
  p_session_id    uuid,
  p_creation_code text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_hash   text;
  v_member session_members%ROWTYPE;
BEGIN
  SELECT value INTO v_hash FROM app_config WHERE key = 'creation_code_hash';
  IF v_hash IS NULL OR crypt(p_creation_code, v_hash) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'Code Ecclesia invalide';
  END IF;

  UPDATE session_members
  SET is_moderator = true
  WHERE session_id = p_session_id
    AND user_id = auth.uid()
  RETURNING * INTO v_member;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vous n''êtes pas inscrit à cette séance';
  END IF;

  RETURN to_jsonb(v_member);
END;
$$;

GRANT EXECUTE ON FUNCTION claim_moderator_status(uuid, text) TO anon, authenticated;

-- list_session_members_admin : exposer is_moderator + le consentement, pour
-- que l'onglet Participants du superadmin puisse marquer les modérateurs.
CREATE OR REPLACE FUNCTION list_session_members_admin(
  p_password   text,
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_rows jsonb;
BEGIN
  PERFORM check_superadmin_password(p_password);

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT
      sm.id,
      sm.pseudo,
      sm.created_at,
      sm.joined_phase,
      sm.attending_in_person,
      sm.is_moderator,
      (er.id IS NOT NULL) AS has_entry_response,
      EXISTS (
        SELECT 1 FROM assertion_votes av WHERE av.member_id = sm.id
      ) AS has_voted
    FROM session_members sm
    LEFT JOIN entry_responses er
      ON er.member_id = sm.id
     AND er.session_id = p_session_id
    WHERE sm.session_id = p_session_id
  ) t;

  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION list_session_members_admin(text, uuid) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2. (G2) create_tables_batch — N tables vides en lot
--
-- `create_table` exige un pseudo et crée systématiquement un participant :
-- inutilisable pour générer des tables vides. `admin_create_table` n'en crée
-- qu'une à la fois, et sans contrôle du flag leaderless par table.
--
-- p_leaderless : tableau de booléens, un par table à créer. Sa longueur
-- détermine le nombre de tables. `true` = table sans animateur (aucun
-- modérateur disponible pour elle).
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

    INSERT INTO tables (join_code, created_by, session_id, leaderless)
    VALUES (v_join_code, auth.uid(), p_session_id, COALESCE(p_leaderless[v_i], false))
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
-- 3. get_allocation_inputs — entrées de l'algorithme
--
-- Un seul aller-retour : membres présentiels avec leurs attributs
-- d'onboarding et leur camp d'opinion. Bypass de la RLS owner-only
-- d'`entry_responses` (mot de passe superadmin).
--
-- `group_id` provient de la dernière analyse status='done'. NULL si le
-- membre n'a pas voté ou si aucune analyse n'existe.
-- `opinions_available` : false → la règle 3 est désactivée côté client.
--
-- Population (§2) : seuls les présentiels sont retournés. Les modérateurs
-- le sont aussi (is_moderator = true) car leurs votes alimentent l'analyse,
-- mais le client les exclut des sièges à pourvoir.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_allocation_inputs(
  p_password   text,
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_analysis_id uuid;
  v_members     jsonb;
BEGIN
  PERFORM check_superadmin_password(p_password);

  SELECT id INTO v_analysis_id
  FROM session_analysis
  WHERE session_id = p_session_id
    AND status = 'done'
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at, t.member_id), '[]'::jsonb)
    INTO v_members
  FROM (
    SELECT
      sm.id                                  AS member_id,
      sm.pseudo,
      sm.is_moderator,
      sm.created_at,
      -- Sans onboarding : non-actif, non-consentant, nouveau (conservateur, §6)
      COALESCE(er.participation_style = 'active', false) AS is_active,
      COALESCE(er.consent_transcript, false)             AS consents,
      COALESCE(er.ecclesia_experience, false)            AS is_veteran,
      am.group_id
    FROM session_members sm
    LEFT JOIN entry_responses er
      ON er.member_id = sm.id
     AND er.session_id = p_session_id
    LEFT JOIN analysis_members am
      ON am.member_id = sm.id
     AND am.analysis_id = v_analysis_id
    WHERE sm.session_id = p_session_id
      AND sm.attending_in_person = true
  ) t;

  RETURN jsonb_build_object(
    'members',            v_members,
    'opinions_available', (v_analysis_id IS NOT NULL),
    'analysis_id',        v_analysis_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_allocation_inputs(text, uuid) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. apply_allocation — persistance du résultat
--
-- p_tables : tableau JSON
--   [{ table_number, moderated, member_ids[], moderator_member_ids[] }]
--
-- Comportement :
--   · réutilise les tables physiques déjà rattachées à la séance (par
--     ordre de join_code), en alignant leur flag `leaderless` ;
--   · crée les tables manquantes via create_tables_batch ;
--   · remplace intégralement table_assignments pour cette séance ;
--   · les modérateurs sont enregistrés dans table_assignments comme les
--     autres (c'est `session_members.is_moderator` qui les distingue) —
--     ils doivent être routés vers leur table en phase `debating` ;
--   · passe la séance en phase `allocating`.
--
-- N'échoue jamais pour des raisons de qualité de données : les seules
-- exceptions possibles sont un mot de passe invalide ou un payload vide.
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
      UPDATE tables SET leaderless = NOT v_moderated WHERE id = v_table_id;
    ELSE
      LOOP
        v_join_code := upper(encode(gen_random_bytes(3), 'hex'));
        EXIT WHEN NOT EXISTS (SELECT 1 FROM tables WHERE join_code = v_join_code);
      END LOOP;
      INSERT INTO tables (join_code, created_by, session_id, leaderless)
      VALUES (v_join_code, auth.uid(), p_session_id, NOT v_moderated)
      RETURNING id INTO v_table_id;
      v_created := v_created + 1;
    END IF;

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

  UPDATE sessions
  SET phase = 'allocating', phase_changed_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'table_count',    v_count,
    'member_count',   v_members,
    'tables_created', v_created,
    'tables_reused',  v_used
  );
END;
$$;

GRANT EXECUTE ON FUNCTION apply_allocation(text, uuid, jsonb) TO anon, authenticated;
