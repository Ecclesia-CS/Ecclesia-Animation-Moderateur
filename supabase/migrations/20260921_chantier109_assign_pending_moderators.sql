-- Chantier 109 — Placement des modérateurs en attente au passage en `debating`
--
-- Contrepartie du chantier 107 : depuis ce chantier, `claim_moderator_status`
-- ne pose plus qu'un drapeau pendant `allocating` — il ne place plus personne
-- sur une table, pour ne pas faire bouger la répartition sous les yeux du
-- superadmin pendant qu'il la retouche. Il faut donc un geste explicite, au
-- moment où le superadmin en a fini avec les tables, qui place chaque
-- modérateur resté « en attente » (drapeau `is_moderator=true` mais pas en
-- exercice — `tables.active_moderator_member_id`, chantier 106) sur une table
-- animée qui n'a personne en exercice.
--
-- Décision de Jules (2026-09-20, arbitrage 1) : « Lorsqu'il a fini de
-- travailler sur les tables, et passent en débat, les modérateurs qui
-- étaient en attente (et qui ont pu se déclarer entre temps) sont associés
-- à leurs tables. »
--
-- Le geste : `assign_pending_moderators(password, session_id, apply)`.
-- `p_apply = false` (défaut) calcule le placement SANS écrire — c'est le
-- récapitulatif de confirmation exigé par Jules (« 3 modérateurs en attente
-- vont être placés aux tables 2, 5 et 7 — confirmer ? », avec le nom de
-- chaque modérateur et la table visée, plus ce qui NE sera PAS fait :
-- modérateurs en attente sans table libre, tables animées restées sans
-- modérateur). `p_apply = true` rejoue le même calcul et écrit :
-- `table_assignments` (déplace si le modérateur était assis ailleurs) et
-- `tables.active_moderator_member_id`. Déterministe : modérateurs par
-- `created_at` (ordre d'inscription), tables libres par `table_number`
-- croissant — même calcul en dry-run et en écriture, donc le récapitulatif
-- affiché correspond exactement à ce qui sera appliqué.
--
-- Un modérateur en attente de trop (plus de modérateurs que de tables
-- libres) reste participant avec son drapeau, sans traitement particulier
-- (arbitrage 2, chantier 106) : il apparaît dans `unplaced_moderators`.
-- Une table animée qui reste sans modérateur (pas assez de modérateurs en
-- attente) est signalée dans `tables_without_moderator` ; l'option « interdire
-- les tables sans modérateur » du chantier 98 existe déjà en amont pour
-- éviter d'en arriver là — ce chantier ne fait que le signaler, pas le corriger.

CREATE OR REPLACE FUNCTION public.assign_pending_moderators(
  p_password   text,
  p_session_id uuid,
  p_apply      boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_moderator   RECORD;
  v_table_id    uuid;
  v_table_num   int;
  v_used_tables uuid[] := ARRAY[]::uuid[];
  v_placements  jsonb := '[]'::jsonb;
  v_unplaced    jsonb := '[]'::jsonb;
  v_tables_without_moderator jsonb;
BEGIN
  PERFORM check_superadmin_password(p_password);

  IF NOT EXISTS (SELECT 1 FROM sessions WHERE id = p_session_id) THEN
    RAISE EXCEPTION 'Séance introuvable';
  END IF;

  -- Modérateurs en attente : drapeau posé, en exercice sur aucune table de
  -- cette séance (ni via active_moderator_member_id).
  FOR v_moderator IN
    SELECT sm.id, sm.pseudo
    FROM session_members sm
    WHERE sm.session_id  = p_session_id
      AND sm.is_moderator = true
      AND NOT EXISTS (
        SELECT 1 FROM tables t
        WHERE t.session_id = p_session_id
          AND t.active_moderator_member_id = sm.id
      )
    ORDER BY sm.created_at, sm.id
  LOOP
    -- Première table animée de cette séance sans modérateur en exercice,
    -- pas déjà retenue plus haut dans cette même boucle.
    SELECT t.id, t.table_number INTO v_table_id, v_table_num
    FROM tables t
    WHERE t.session_id = p_session_id
      AND t.leaderless  = false
      AND t.active_moderator_member_id IS NULL
      AND NOT (t.id = ANY(v_used_tables))
    ORDER BY t.table_number
    LIMIT 1;

    IF v_table_id IS NULL THEN
      v_unplaced := v_unplaced || jsonb_build_object('member_id', v_moderator.id, 'pseudo', v_moderator.pseudo);
      CONTINUE;
    END IF;

    v_used_tables := v_used_tables || v_table_id;
    v_placements  := v_placements || jsonb_build_object(
      'member_id',    v_moderator.id,
      'pseudo',       v_moderator.pseudo,
      'table_number', v_table_num,
      'table_id',     v_table_id
    );

    IF p_apply THEN
      INSERT INTO table_assignments (session_id, member_id, table_number, table_id)
      VALUES (p_session_id, v_moderator.id, v_table_num, v_table_id)
      ON CONFLICT (session_id, member_id) DO UPDATE
        SET table_number = EXCLUDED.table_number,
            table_id     = EXCLUDED.table_id;

      UPDATE tables SET active_moderator_member_id = v_moderator.id WHERE id = v_table_id;
    END IF;
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('table_number', t.table_number) ORDER BY t.table_number), '[]'::jsonb)
    INTO v_tables_without_moderator
  FROM tables t
  WHERE t.session_id = p_session_id
    AND t.leaderless  = false
    AND t.active_moderator_member_id IS NULL
    AND NOT (t.id = ANY(v_used_tables));

  RETURN jsonb_build_object(
    'placements',               v_placements,
    'unplaced_moderators',      v_unplaced,
    'tables_without_moderator', v_tables_without_moderator
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_pending_moderators(text, uuid, boolean) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Vérification (à exécuter après application, à consigner dans A_VERIFIER.md) :
--
-- 1. Dry-run puis apply renvoient le même `placements` sur une séance non
--    modifiée entre les deux appels :
--    SELECT assign_pending_moderators('<code>', '<session_id>', false);
--    SELECT assign_pending_moderators('<code>', '<session_id>', true);
--
-- 2. Recette navigateur : allouer une séance, faire déclarer un modérateur
--    supplémentaire pendant `allocating` (drapeau posé, aucun siège bougé —
--    chantier 107), passer en `debating` et vérifier le récapitulatif puis
--    que la table ciblée obtient bien ce modérateur comme `ModeratorView`.
-- ─────────────────────────────────────────────────────────────
