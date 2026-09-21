-- Chantier 107 — claim_moderator_status ne doit jamais déplacer quelqu'un déjà assis
--
-- Constat (audit 87/101, problème B) : si l'appelant est déjà assis sur une
-- table NON leaderless, la branche ELSE de `claim_moderator_status` cherche la
-- première table animée sans modérateur et RÉÉCRIT son `table_assignments`.
-- Sa ligne `participants` (sa place physique réelle) ne bouge pas : il obtient
-- l'écran modérateur d'une table où il n'est pas, et toutes ses actions
-- d'animation échouent en silence RLS sur la table où il est réellement assis.
-- Et s'il n'existe aucune table libre, il reste sur place avec le drapeau
-- (retour au problème A / chantier 106).
--
-- Décision de Jules (2026-09-20, arbitrage 1) : « tous les gens qui doivent
-- être modérateurs puissent se déclarer (à l'entrée comme en séance) mais
-- juste que l'algo n'en tienne pas compte et que le superadmin finisse de
-- travailler sur les tables tranquillement. Cela ne doit donc pas faire
-- bouger la répartition lorsqu'il la regarde. »
--
-- Le geste : la déclaration devient LE DRAPEAU, ET RIEN D'AUTRE, dans deux cas :
--   (a) l'appelant a déjà une ligne `table_assignments`, quelle que soit la table ;
--   (b) la séance est en phase `allocating`.
-- Le placement d'office (recherche de la première table animée sans modérateur)
-- ne subsiste que pour quelqu'un SANS aucune table, HORS `allocating`.
-- La conversion en place d'une table `leaderless` sur laquelle l'appelant est
-- déjà assis (chantier 64) est CONSERVÉE : elle ne déplace personne, elle ne
-- fait que retirer le statut leaderless de la table où il est physiquement.
--
-- Neutralité au recalcul (précision tranchée par Jules le 2026-09-20) : un
-- modérateur qui se déclare pendant `allocating` EST recompté si le superadmin
-- relance le calcul d'allocation — « l'algo n'en tient pas compte » signifie
-- « la répartition ne bouge pas toute seule », pas « ignoré pour toujours ».
-- Cette neutralité s'obtient uniquement en empêchant la déclaration de POSER
-- UN SIÈGE (objet de ce chantier) : rien n'est changé ici à
-- `get_allocation_inputs`, qui relit les entrées fraîches à chaque recalcul.
--
-- Seule la déclaration PAR LE PARTICIPANT (`claim_moderator_status`) est
-- concernée. `set_member_moderator` (chantier 37 : assied aussi le membre sur
-- la première table animée sans modérateur) reste inchangé — c'est le
-- superadmin qui agit sciemment sur sa propre répartition.
--
-- Définition comparée à `pg_get_functiondef` en base avant réécriture (règle
-- SQL du CLAUDE.md) — dernière version en base : chantier 106
-- (20260921_chantier106_active_moderator_member_id.sql), qui a ajouté la pose
-- de `active_moderator_member_id` (COALESCE) dans les deux branches de
-- placement, conservée ici à l'identique.

CREATE OR REPLACE FUNCTION public.claim_moderator_status(
  p_session_id uuid,
  p_creation_code text,
  p_pseudo text DEFAULT NULL::text,
  p_reclaim_code text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_hash             text;
  v_member           session_members%ROWTYPE;
  v_phase            text;
  v_attending        boolean;
  v_table_num        int;
  v_table_id         uuid;
  v_current_table_id uuid;
  v_code             text;
BEGIN
  SELECT value INTO v_hash FROM app_config WHERE key = 'creation_code_hash';
  IF v_hash IS NULL OR crypt(p_creation_code, v_hash) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'Code Ecclesia invalide';
  END IF;

  SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;
  IF v_phase IS NULL THEN
    RAISE EXCEPTION 'Séance introuvable';
  END IF;

  UPDATE session_members
  SET is_moderator = true
  WHERE session_id = p_session_id
    AND user_id = auth.uid()
  RETURNING * INTO v_member;

  IF NOT FOUND THEN
    IF p_pseudo IS NULL OR btrim(p_pseudo) = '' THEN
      RAISE EXCEPTION 'Nom prénom requis pour se déclarer modérateur';
    END IF;

    IF v_phase NOT IN ('pre_voting', 'voting', 'allocating', 'debating') THEN
      RAISE EXCEPTION 'La séance n''est pas dans une phase permettant l''inscription (phase: %)', v_phase;
    END IF;

    v_attending := v_phase != 'pre_voting';
    v_code      := gen_member_reclaim_code(p_session_id);

    BEGIN
      INSERT INTO session_members(session_id, user_id, pseudo, joined_phase, attending_in_person, is_moderator, reclaim_code_hash)
      VALUES (p_session_id, auth.uid(), btrim(p_pseudo), v_phase, v_attending, true,
              crypt(v_code, gen_salt('bf')))
      RETURNING * INTO v_member;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Ce nom prénom est déjà pris pour cette séance';
    END;
  END IF;

  SELECT ta.table_id INTO v_current_table_id
  FROM table_assignments ta
  WHERE ta.session_id = p_session_id
    AND ta.member_id  = v_member.id;

  IF v_current_table_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM tables WHERE id = v_current_table_id AND leaderless = true)
  THEN
    -- Déjà assis, table leaderless : conversion en place (chantier 64), ne déplace personne.
    UPDATE tables
    SET leaderless = false,
        active_moderator_member_id = COALESCE(active_moderator_member_id, v_member.id)
    WHERE id = v_current_table_id;
  ELSIF v_current_table_id IS NULL AND v_phase != 'allocating' THEN
    -- Chantier 107 : le placement d'office ne subsiste que pour quelqu'un
    -- sans aucune table, hors allocating. Toute autre situation (déjà assis
    -- ailleurs, ou allocating) laisse la déclaration poser uniquement le
    -- drapeau — le superadmin garde la main sur la répartition affichée.
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

      UPDATE tables
      SET active_moderator_member_id = COALESCE(active_moderator_member_id, v_member.id)
      WHERE id = v_table_id;
    END IF;
  END IF;

  IF v_code IS NOT NULL THEN
    RETURN to_jsonb(v_member) || jsonb_build_object('new_reclaim_code', v_code);
  END IF;
  RETURN to_jsonb(v_member);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.claim_moderator_status(uuid, text, text, text) TO anon, authenticated;
