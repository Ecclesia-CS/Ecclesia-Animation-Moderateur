-- Chantier 67 (point 2) — claim_moderator_status mal enregistré en pré-vote
--
-- Bug : la branche « aucun profil, on en crée un » de `claim_moderator_status`
-- insère toujours `attending_in_person = true`, quelle que soit la phase.
-- Quelqu'un qui se déclare modérateur depuis chez lui pendant `pre_voting`
-- est donc compté comme présent dès l'inscription — ce qui fausse les
-- statistiques de présence (`get_session_voting_stats`) et l'allocation
-- (`run_clustering_v1/v2` et `get_allocation_inputs`/`runAllocation`
-- filtrent tous sur `attending_in_person = true`).
--
-- Et il ne reçoit jamais de code de rappel (`reclaim_code` reste NULL) :
-- contrairement à `register_session_member`, rien n'est stocké pour lui
-- permettre de retrouver son profil sur un autre appareil.
--
-- Fix : reprend exactement le mécanisme de `register_session_member`
-- (20260902_chantier61_register_during_allocating.sql) —
--   * `attending_in_person := v_phase != 'pre_voting'`
--   * `reclaim_code` posé UNIQUEMENT en `pre_voting`, à la valeur reçue en
--     paramètre (généré côté client, jamais côté serveur — même règle
--     que `register_session_member`, cf. CLAUDE.md).
-- Nouveau paramètre `p_reclaim_code` en 4e position, DEFAULT NULL — ignoré
-- hors `pre_voting` et par la branche « déjà inscrit » (cas b), qui ne
-- touche ni `attending_in_person` ni `reclaim_code`.
--
-- Cas (b) — « déjà inscrit sur cet appareil » — n'est PAS concerné : cette
-- branche ne fait qu'un `UPDATE ... SET is_moderator = true`, elle ne
-- touche jamais `attending_in_person` ni `reclaim_code`. Si ce membre
-- s'était inscrit en pré-vote via `register_session_member`, son
-- `attending_in_person` (déjà false) et son `reclaim_code` (déjà généré)
-- restent tels quels.
--
-- ── Piège Postgres (cf. CLAUDE.md) ───────────────────────────────────
-- Signature ciblée, à vérifier avant application :
--   SELECT p.oid::regprocedure,
--          pg_get_function_identity_arguments(p.oid),
--          pg_get_function_result(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'claim_moderator_status';
--
-- Attendu avant application : `claim_moderator_status(uuid, text, text)`
-- → `jsonb` (posée par 20260801_chantier33_moderator_table_assignment.sql).
-- On ajoute un 4e paramètre (p_reclaim_code) : c'est un changement de la
-- liste d'arguments, donc une signature distincte pour Postgres — un
-- simple CREATE OR REPLACE créerait une SURCHARGE en plus de l'ancienne
-- au lieu de la remplacer. On DROP explicitement l'ancienne 3-aire d'abord.
DROP FUNCTION IF EXISTS claim_moderator_status(uuid, text, text);

CREATE OR REPLACE FUNCTION claim_moderator_status(
  p_session_id    uuid,
  p_creation_code text,
  p_pseudo        text DEFAULT NULL,
  p_reclaim_code  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_hash      text;
  v_member    session_members%ROWTYPE;
  v_phase     text;
  v_attending boolean;
  v_table_num int;
  v_table_id  uuid;
BEGIN
  SELECT value INTO v_hash FROM app_config WHERE key = 'creation_code_hash';
  IF v_hash IS NULL OR crypt(p_creation_code, v_hash) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'Code Ecclesia invalide';
  END IF;

  -- Cas (b) : déjà inscrit sur cet appareil pour cette séance → on marque, c'est tout.
  -- Ne touche ni attending_in_person ni reclaim_code (chantier 67) : ce membre
  -- a déjà son statut de présence et son éventuel code de rappel, posés par
  -- register_session_member ou une inscription antérieure.
  UPDATE session_members
  SET is_moderator = true
  WHERE session_id = p_session_id
    AND user_id = auth.uid()
  RETURNING * INTO v_member;

  IF NOT FOUND THEN
    -- Cas (a) : aucun profil — on en crée un, comme une inscription normale.
    IF p_pseudo IS NULL OR btrim(p_pseudo) = '' THEN
      RAISE EXCEPTION 'Nom prénom requis pour se déclarer modérateur';
    END IF;

    SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;
    IF v_phase IS NULL THEN
      RAISE EXCEPTION 'Séance introuvable';
    END IF;
    -- Chantier 33 (point 4) : `debating` ajoutée — le débat a déjà commencé,
    -- mais des tables animées peuvent encore attendre leur modérateur.
    IF v_phase NOT IN ('pre_voting', 'voting', 'allocating', 'debating') THEN
      RAISE EXCEPTION 'La séance n''est pas dans une phase permettant l''inscription (phase: %)', v_phase;
    END IF;

    -- Chantier 67 : même règle que register_session_member — présent
    -- partout sauf en pré-vote, code de rappel réservé au pré-vote.
    v_attending := v_phase != 'pre_voting';

    BEGIN
      INSERT INTO session_members(session_id, user_id, pseudo, joined_phase, attending_in_person, is_moderator, reclaim_code)
      VALUES (p_session_id, auth.uid(), btrim(p_pseudo), v_phase, v_attending, true,
              CASE WHEN v_phase = 'pre_voting' THEN p_reclaim_code ELSE NULL END)
      RETURNING * INTO v_member;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Ce nom prénom est déjà pris pour cette séance';
    END;
  END IF;

  -- Chantier 33 (point 3) : table animée déjà formée mais encore sans
  -- modérateur assis → on y place directement ce nouveau modérateur.
  -- Sans ça il resterait `is_moderator = true` sans aucune ligne dans
  -- `table_assignments`, invisible du tableau de bord "Groupes".
  SELECT ta.table_number, ta.table_id
  INTO v_table_num, v_table_id
  FROM table_assignments ta
  JOIN tables t ON t.id = ta.table_id
  WHERE ta.session_id = p_session_id
    AND t.leaderless = false
    AND NOT EXISTS (
      SELECT 1
      FROM table_assignments ta2
      JOIN session_members sm2 ON sm2.id = ta2.member_id
      WHERE ta2.session_id = ta.session_id
        AND ta2.table_number = ta.table_number
        AND sm2.is_moderator = true
    )
  ORDER BY ta.table_number
  LIMIT 1;

  IF v_table_num IS NOT NULL THEN
    INSERT INTO table_assignments (session_id, member_id, table_number, table_id)
    VALUES (p_session_id, v_member.id, v_table_num, v_table_id)
    ON CONFLICT (session_id, member_id)
    DO UPDATE SET table_number = EXCLUDED.table_number, table_id = EXCLUDED.table_id;
  END IF;

  RETURN to_jsonb(v_member);
END;
$$;

GRANT EXECUTE ON FUNCTION claim_moderator_status(uuid, text, text, text) TO anon, authenticated;

-- ── Vérification après application ───────────────────────────────────
-- Sur une séance en phase 'pre_voting', depuis une session anonyme sans
-- profil existant :
--   SELECT claim_moderator_status('<session_id>', '<code ecclesia>', 'Test Modo', '1234');
-- Attendu : attending_in_person = false, reclaim_code = '1234'.
--
-- Sur une séance en phase 'voting' ou 'allocating' :
--   SELECT claim_moderator_status('<session_id>', '<code ecclesia>', 'Test Modo 2', '5678');
-- Attendu : attending_in_person = true, reclaim_code = NULL (le 4e argument
-- est ignoré hors pré-vote).
--
-- ── SQL D'ANNULATION (revenir au comportement d'avant le chantier 67) ─
-- DROP FUNCTION IF EXISTS claim_moderator_status(uuid, text, text, text);
--
-- CREATE OR REPLACE FUNCTION claim_moderator_status(
--   p_session_id    uuid,
--   p_creation_code text,
--   p_pseudo        text DEFAULT NULL
-- )
-- RETURNS jsonb
-- LANGUAGE plpgsql SECURITY DEFINER AS $$
-- DECLARE
--   v_hash      text;
--   v_member    session_members%ROWTYPE;
--   v_phase     text;
--   v_table_num int;
--   v_table_id  uuid;
-- BEGIN
--   SELECT value INTO v_hash FROM app_config WHERE key = 'creation_code_hash';
--   IF v_hash IS NULL OR crypt(p_creation_code, v_hash) IS DISTINCT FROM v_hash THEN
--     RAISE EXCEPTION 'Code Ecclesia invalide';
--   END IF;
--
--   UPDATE session_members
--   SET is_moderator = true
--   WHERE session_id = p_session_id
--     AND user_id = auth.uid()
--   RETURNING * INTO v_member;
--
--   IF NOT FOUND THEN
--     IF p_pseudo IS NULL OR btrim(p_pseudo) = '' THEN
--       RAISE EXCEPTION 'Nom prénom requis pour se déclarer modérateur';
--     END IF;
--
--     SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;
--     IF v_phase IS NULL THEN
--       RAISE EXCEPTION 'Séance introuvable';
--     END IF;
--     IF v_phase NOT IN ('pre_voting', 'voting', 'allocating', 'debating') THEN
--       RAISE EXCEPTION 'La séance n''est pas dans une phase permettant l''inscription (phase: %)', v_phase;
--     END IF;
--
--     BEGIN
--       INSERT INTO session_members(session_id, user_id, pseudo, joined_phase, attending_in_person, is_moderator)
--       VALUES (p_session_id, auth.uid(), btrim(p_pseudo), v_phase, true, true)
--       RETURNING * INTO v_member;
--     EXCEPTION WHEN unique_violation THEN
--       RAISE EXCEPTION 'Ce nom prénom est déjà pris pour cette séance';
--     END;
--   END IF;
--
--   SELECT ta.table_number, ta.table_id
--   INTO v_table_num, v_table_id
--   FROM table_assignments ta
--   JOIN tables t ON t.id = ta.table_id
--   WHERE ta.session_id = p_session_id
--     AND t.leaderless = false
--     AND NOT EXISTS (
--       SELECT 1
--       FROM table_assignments ta2
--       JOIN session_members sm2 ON sm2.id = ta2.member_id
--       WHERE ta2.session_id = ta.session_id
--         AND ta2.table_number = ta.table_number
--         AND sm2.is_moderator = true
--     )
--   ORDER BY ta.table_number
--   LIMIT 1;
--
--   IF v_table_num IS NOT NULL THEN
--     INSERT INTO table_assignments (session_id, member_id, table_number, table_id)
--     VALUES (p_session_id, v_member.id, v_table_num, v_table_id)
--     ON CONFLICT (session_id, member_id)
--     DO UPDATE SET table_number = EXCLUDED.table_number, table_id = EXCLUDED.table_id;
--   END IF;
--
--   RETURN to_jsonb(v_member);
-- END;
-- $$;
--
-- GRANT EXECUTE ON FUNCTION claim_moderator_status(uuid, text, text) TO anon, authenticated;
