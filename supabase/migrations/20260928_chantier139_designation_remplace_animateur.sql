-- Chantier 139 — désigner un modérateur sur une table DÉJÀ modérée remplace l'animateur.
--
-- Diagnostic (voir docs/chantiers.md, chantier 139), reproduit sur dev dans une
-- transaction annulée, séance en `debating`, deux tables déjà modérées :
--
--   (a) `assign_moderator_to_table` ne posait `active_moderator_member_id` que si
--       la table n'avait AUCUN animateur effectif (`IF NOT has_effective_moderator`).
--       Sur une table déjà modérée, la personne désignée recevait le drapeau
--       `is_moderator` et une ligne `table_assignments`, mais pas l'animation :
--       « modérateur en surplus » (chantier 25b), donc jamais l'écran modérateur —
--       « bloqué en participant alors qu'on est modo ». Recharger ne change rien :
--       c'est l'état en base, pas un cache.
--   (b) Un modérateur « physique » (`tables.created_by`, table prise par Code
--       Ecclesia) n'était jamais délogé : `is_table_moderator` a deux branches
--       indépendantes, la désignation n'en touchait qu'une. Résultat mesuré : les
--       DEUX (l'ancien et le nouveau) passent `is_table_moderator` — l'ancien reste
--       « bloqué en modo alors qu'il ne devrait plus l'être ».
--
-- L'interface masquait en plus la zone de dépôt « modérateur » (et le bouton
-- « En faire le principal ») sur toute table ayant déjà un animateur : le seul
-- chemin de remplacement était « Libérer la modération », puis la zone réapparaissait.
-- Voir SuperadminScreen.tsx, même chantier.
--
-- Règle nouvelle : désigner explicitement X modérateur de la table N fait de X
-- l'animateur de N. L'éventuel titulaire précédent (animateur Bloc C effectif, ou
-- modérateur physique assis à la table) est libéré par `release_table_moderation`
-- (chantier 72/118) — il garde son drapeau `is_moderator` et reste assis, donc il
-- devient « modérateur en surplus » visible du superadmin, et perd l'écran
-- modérateur. Aucune autre RPC n'est modifiée : les trois appelants de
-- `assign_moderator_to_table` (zone de dépôt, champ de saisie, « En faire le
-- principal ») sont tous des désignations explicites.
--
-- Fonction lue en base avant réécriture (`pg_get_functiondef` sur dev le 2026-09-28) :
-- identique à prod hors la garde d'accès `check_session_admin` (chantier 135).
-- Seuls ajouts par rapport à l'existant : la lecture de `user_id` du membre, le
-- bloc « autre titulaire » et l'appel à `release_table_moderation`.

CREATE OR REPLACE FUNCTION public.assign_moderator_to_table(
  p_password     text,
  p_session_id   uuid,
  p_table_number integer,
  p_member_id    uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_table_id     uuid;
  v_member_user  uuid;
  v_other_holder boolean;
BEGIN
  PERFORM check_session_admin(p_password, p_session_id);

  SELECT user_id INTO v_member_user
  FROM session_members
  WHERE id = p_member_id AND session_id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ce membre n''appartient pas à cette séance';
  END IF;

  SELECT id INTO v_table_id
  FROM tables
  WHERE session_id = p_session_id AND table_number = p_table_number
  LIMIT 1;

  IF v_table_id IS NULL THEN
    SELECT DISTINCT table_id INTO v_table_id
    FROM table_assignments
    WHERE session_id = p_session_id
      AND table_number = p_table_number
      AND table_id IS NOT NULL
    LIMIT 1;
  END IF;

  IF v_table_id IS NULL THEN
    RAISE EXCEPTION 'La table % n''existe pas encore pour cette séance : applique l''allocation avant d''y désigner un modérateur', p_table_number;
  END IF;

  UPDATE session_members SET is_moderator = true WHERE id = p_member_id;

  PERFORM release_moderator_on_leave(p_member_id, v_table_id);

  INSERT INTO table_assignments (session_id, member_id, table_number, table_id)
  VALUES (p_session_id, p_member_id, p_table_number, v_table_id)
  ON CONFLICT (session_id, member_id)
  DO UPDATE SET table_number = EXCLUDED.table_number, table_id = EXCLUDED.table_id;

  -- Chantier 139 — un AUTRE titulaire tient encore la table :
  --   · un animateur Bloc C effectif (drapeau + assis ici) qui n'est pas ce membre ;
  --   · ou un modérateur physique (`created_by`) réellement assis à cette table
  --     et qui n'est pas ce membre. Un `created_by` qui est le superadmin
  --     (tables issues d'`apply_allocation`) n'est pas assis : il ne compte pas.
  SELECT
    (has_effective_moderator(t.id)
       AND t.active_moderator_member_id IS DISTINCT FROM p_member_id)
    OR EXISTS (
      SELECT 1 FROM participants p
      WHERE p.table_id = t.id
        AND p.user_id  = t.created_by
        AND t.created_by IS DISTINCT FROM v_member_user
    )
  INTO v_other_holder
  FROM tables t
  WHERE t.id = v_table_id;

  IF COALESCE(v_other_holder, false) THEN
    PERFORM release_table_moderation(p_password, v_table_id);
  END IF;

  IF NOT has_effective_moderator(v_table_id) THEN
    UPDATE tables
    SET leaderless                 = false,
        active_moderator_member_id = p_member_id
    WHERE id = v_table_id;
  END IF;
END;
$function$;
