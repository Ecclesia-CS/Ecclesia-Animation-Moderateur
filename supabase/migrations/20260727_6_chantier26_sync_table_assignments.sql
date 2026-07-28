-- =============================================================
-- Chantier 26 (H25) — table_assignments désynchronisé du rejoint physique
--
-- Symptôme rapporté par Jules sur VERIF7 (a06b7105-a96b-49bc-a5db-dc9ff25178fe) :
--   1. Un participant quitte sa table (retour au menu) puis rejoint une
--      AUTRE table via son QR code (join_code) : dans la vue superadmin
--      « Tables » (onglet Groupes, alimenté par table_assignments), il
--      reste affiché dans l'ancienne table — la nouvelle affectation
--      n'apparaît nulle part.
--   2. Un retardataire qui rejoint/crée une table sans être jamais passé
--      par l'allocation (aucune ligne table_assignments pour lui) est
--      invisible dans cette même vue, même après reload.
--
-- Cause : `join_table` et `create_table` écrivent uniquement dans
-- `participants` (le rejoint physique, utilisé par TableView/ModeratorView).
-- Ils n'ont jamais touché `table_assignments`, qui est la source de vérité
-- de la vue superadmin (`GroupRow` dans SuperadminScreen.tsx, alimenté par
-- une requête sur `table_assignments`). Les deux structures divergent dès
-- qu'un participant rejoint une table autrement que via le bouton
-- « Rejoindre » de l'écran d'allocation juste après `apply_allocation`.
--
-- Vérifié empiriquement sur VERIF7 : une 4e table (join_code AA32D1),
-- créée ~35 min après les 3 tables de l'allocation initiale, avec 1
-- participant réellement inscrit (`participants`) mais zéro ligne
-- `table_assignments`.
--
-- Correctif : un helper `sync_table_assignment`, appelé par `join_table`
-- et `create_table` juste après l'insertion du participant, qui pose ou
-- met à jour la ligne `table_assignments` du membre (upsert sur la
-- contrainte UNIQUE(session_id, member_id) — un membre ne peut être que
-- dans une seule table à la fois, donc une simple mise à jour déplace
-- naturellement l'ancienne affectation). Best-effort et ne lève jamais :
-- le rejoint physique réel (participants) ne doit jamais échouer à cause
-- d'un souci de synchronisation du tableau de bord superadmin.
-- =============================================================

CREATE OR REPLACE FUNCTION sync_table_assignment(
  p_session_id uuid,
  p_table_id   uuid,
  p_user_id    uuid,
  p_pseudo     text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_phase        text;
  v_member_id    uuid;
  v_table_number int;
BEGIN
  IF p_session_id IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;

    -- Membre déjà inscrit à la séance (vote, onboarding...) ?
    SELECT id INTO v_member_id
    FROM session_members
    WHERE session_id = p_session_id AND user_id = p_user_id;

    -- Retardataire jamais inscrit : on le crée directement en "présentiel",
    -- sans passer par register_session_member (dont le garde-fou de phase
    -- interdit l'inscription en phase debating — légitime ici).
    IF v_member_id IS NULL THEN
      INSERT INTO session_members (session_id, user_id, pseudo, joined_phase, attending_in_person)
      VALUES (p_session_id, p_user_id, p_pseudo, COALESCE(v_phase, 'debating'), true)
      RETURNING id INTO v_member_id;
    END IF;

    -- Réutilise le numéro logique déjà associé à cette table physique
    -- (posé par apply_allocation / assign_table_to_group) ; sinon en crée un.
    SELECT table_number INTO v_table_number
    FROM table_assignments
    WHERE session_id = p_session_id AND table_id = p_table_id
    LIMIT 1;

    IF v_table_number IS NULL THEN
      SELECT COALESCE(MAX(table_number), 0) + 1 INTO v_table_number
      FROM table_assignments
      WHERE session_id = p_session_id;
    END IF;

    INSERT INTO table_assignments (session_id, member_id, table_number, table_id)
    VALUES (p_session_id, v_member_id, v_table_number, p_table_id)
    ON CONFLICT (session_id, member_id)
    DO UPDATE SET table_number = EXCLUDED.table_number, table_id = EXCLUDED.table_id;
  EXCEPTION WHEN OTHERS THEN
    -- Best-effort : un pseudo déjà pris par un autre membre de la séance,
    -- ou tout autre accroc, ne doit jamais faire échouer le join réel.
    NULL;
  END;
END;
$$;

-- ── join_table — synchronise après le rejoint physique ───────

CREATE OR REPLACE FUNCTION join_table(
  p_join_code text,
  p_pseudo    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table_id       uuid;
  v_session_id     uuid;
  v_participant_id uuid;
  v_result         jsonb;
BEGIN
  SELECT id, session_id INTO v_table_id, v_session_id
  FROM tables WHERE join_code = upper(p_join_code);
  IF v_table_id IS NULL THEN
    RAISE EXCEPTION 'Session introuvable';
  END IF;

  INSERT INTO participants (table_id, user_id, pseudo)
  VALUES (v_table_id, auth.uid(), p_pseudo)
  ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
  RETURNING id INTO v_participant_id;

  PERFORM sync_table_assignment(v_session_id, v_table_id, auth.uid(), p_pseudo);

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

-- ── create_table — idem quand un participant crée sa table en direct ──

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

  INSERT INTO tables (join_code, created_by, session_id, leaderless)
  VALUES (v_join_code, auth.uid(), p_session_id, p_leaderless)
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
