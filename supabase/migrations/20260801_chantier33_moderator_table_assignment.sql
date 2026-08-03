-- =============================================================
-- Chantier 33 — Gestion des modérateurs par table (superadmin)
--
-- 1. `claim_moderator_status` (self-déclaration via l'onglet « Modérateur »
--    de l'accueil) est étendue à la phase `debating` (point 4 du chantier :
--    aujourd'hui le join direct par numéro de table fonctionne déjà en
--    débat via `reclaim_moderator`, mais cette 2e porte d'entrée était
--    bloquée — "La séance n'est pas dans une phase permettant
--    l'inscription (phase: debating)").
--
-- 2. Bug corrigé (point 3) : quand des tables sont déjà formées
--    (`allocating`, algo validé mais pas toutes les tables pourvues, ou
--    `debating`) et qu'au moins une table animée (`tables.leaderless =
--    false`) n'a encore aucun modérateur assis, tout nouveau
--    `is_moderator = true` posé par `claim_moderator_status` y assied
--    directement ce membre — sinon il reste un modérateur sans siège,
--    invisible tant que le superadmin n'intervient pas à la main.
--    Choix arbitraire assumé (annoncé par Jules) : la première table
--    encore en attente, dans l'ordre des numéros de table. Aucun
--    algorithme de préférence — cf. CLAUDE.md "Ne jamais faire" sur
--    l'algo d'allocation, qui reste totalement hors de ce chantier.
--
-- 3. Nouvelle RPC `assign_moderator_to_table` (point 2) : le superadmin
--    assigne manuellement un participant déjà inscrit comme modérateur
--    d'une table précise — par glisser-déposer d'un membre existant ou en
--    tapant son nom (autocomplete côté frontend). Retirer un modérateur
--    réutilise `set_member_moderator(..., false)`, déjà existante — il
--    redevient un participant ordinaire de la même table, pas besoin
--    d'une RPC dédiée.
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1 + 2. claim_moderator_status — phase `debating` + auto-assignation
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION claim_moderator_status(
  p_session_id    uuid,
  p_creation_code text,
  p_pseudo        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_hash      text;
  v_member    session_members%ROWTYPE;
  v_phase     text;
  v_table_num int;
  v_table_id  uuid;
BEGIN
  SELECT value INTO v_hash FROM app_config WHERE key = 'creation_code_hash';
  IF v_hash IS NULL OR crypt(p_creation_code, v_hash) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'Code Ecclesia invalide';
  END IF;

  -- Cas (b) : déjà inscrit sur cet appareil pour cette séance → on marque, c'est tout.
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

    BEGIN
      INSERT INTO session_members(session_id, user_id, pseudo, joined_phase, attending_in_person, is_moderator)
      VALUES (p_session_id, auth.uid(), btrim(p_pseudo), v_phase, true, true)
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

GRANT EXECUTE ON FUNCTION claim_moderator_status(uuid, text, text) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. assign_moderator_to_table — assignation manuelle superadmin
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION assign_moderator_to_table(
  p_password      text,
  p_session_id    uuid,
  p_table_number  int,
  p_member_id     uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_table_id uuid;
BEGIN
  PERFORM check_superadmin_password(p_password);

  IF NOT EXISTS (
    SELECT 1 FROM session_members WHERE id = p_member_id AND session_id = p_session_id
  ) THEN
    RAISE EXCEPTION 'Ce membre n''appartient pas à cette séance';
  END IF;

  -- table_id physique de la table cible (peut être NULL si pas encore rattachée) —
  -- même logique que move_member_to_group.
  SELECT DISTINCT table_id INTO v_table_id
  FROM table_assignments
  WHERE session_id = p_session_id
    AND table_number = p_table_number
  LIMIT 1;

  UPDATE session_members SET is_moderator = true WHERE id = p_member_id;

  INSERT INTO table_assignments (session_id, member_id, table_number, table_id)
  VALUES (p_session_id, p_member_id, p_table_number, v_table_id)
  ON CONFLICT (session_id, member_id)
  DO UPDATE SET table_number = EXCLUDED.table_number, table_id = EXCLUDED.table_id;
END;
$$;

GRANT EXECUTE ON FUNCTION assign_moderator_to_table(text, uuid, int, uuid) TO anon, authenticated;
