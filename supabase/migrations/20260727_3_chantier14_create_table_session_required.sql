-- ============================================================
-- Chantier 14 (F11) — restaure l'obligation de session_id sur create_table
-- ------------------------------------------------------------
-- Contexte : 20260527000003_fix_tables_mandatory_session.sql avait ajouté
-- `IF p_session_id IS NULL THEN RAISE EXCEPTION 'session_required'`.
-- 20260618_leaderless_tables.sql a ensuite fait DROP FUNCTION + CREATE OR
-- REPLACE de create_table (pour ajouter p_leaderless) sans reporter ce
-- garde-fou. Le frontend (EntryScreen, onglet "Créer") impose bien la
-- sélection d'une séance avant tout appel RPC, mais côté base la fonction
-- SECURITY DEFINER acceptait silencieusement p_session_id = NULL — un appel
-- RPC direct (hors UI) pouvait donc créer une table "sans admin" orpheline
-- (session_id NULL), reproduit et vérifié empiriquement le 2026-07-27.
-- admin_create_table n'est PAS concernée : la création de tables sans
-- séance y est intentionnelle (workflow superadmin "Tables disponibles à
-- rattacher", rattachement manuel différé via attach_table_to_session).
-- ============================================================

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
