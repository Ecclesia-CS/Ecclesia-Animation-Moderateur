-- Chantier 123 — « qui anime quoi » : rendre l'état cohérent sur tous les chemins.
--
-- Diagnostic (voir docs/chantiers.md, chantier 123) : l'animation d'une table est
-- décrite par QUATRE faits dénormalisés — `session_members.is_moderator` (le
-- drapeau « modérateur potentiel »), `tables.active_moderator_member_id` (le
-- modérateur EFFECTIF, seul à obtenir l'écran modérateur depuis le chantier 106),
-- `tables.leaderless`, et la ligne `table_assignments`. Chaque RPC qui déplace ou
-- désigne quelqu'un n'en met à jour qu'une PARTIE. D'où deux symptômes observés :
--
--   (a) `assign_moderator_to_table` posait
--       `active_moderator_member_id = COALESCE(active_moderator_member_id, …)` :
--       une valeur PÉRIMÉE (modérateur parti ailleurs) n'était jamais remplacée,
--       et le nouveau venu restait « modérateur en surplus ».
--   (b) aucune des fonctions qui déplacent un siège (`move_member_to_group`,
--       `sync_table_assignment` via `switch_table`, et `assign_moderator_to_table`
--       elle-même) ne nettoyait `active_moderator_member_id` de la table QUITTÉE —
--       c'est ce qui fabriquait la valeur périmée de (a).
--
-- Arbitrage de Jules (2026-09-22) : quand un modérateur quitte une table, elle perd
-- son animateur mais ne devient PAS `leaderless` pour autant. La règle du chantier
-- 64 sur `leaderless_by_design = true` est inchangée.

-- ── Helper — l'animateur enregistré d'une table est-il encore effectif ? ──
--
-- « Effectif » = il porte le drapeau ET il est encore assis à CETTE table. Sans ce
-- test, un `active_moderator_member_id` périmé bloque toute nouvelle désignation.
CREATE OR REPLACE FUNCTION public.has_effective_moderator(p_table_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM tables t
    JOIN session_members sm
      ON  sm.id            = t.active_moderator_member_id
      AND sm.session_id    = t.session_id
      AND sm.is_moderator  = true
    JOIN table_assignments ta
      ON  ta.member_id  = sm.id
      AND ta.session_id = t.session_id
      AND ta.table_id   = t.id
    WHERE t.id = p_table_id
  );
$$;

REVOKE ALL ON FUNCTION public.has_effective_moderator(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_effective_moderator(uuid) TO anon, authenticated;

-- ── Helper — libérer la table QUITTÉE par un membre ──
--
-- Appelé par tous les chemins qui déplacent un siège. Ne touche jamais
-- `leaderless` : la bascule arrière reste le monopole de la règle
-- `leaderless_by_design` du chantier 64, appliquée par ses appelants.
CREATE OR REPLACE FUNCTION public.release_moderator_on_leave(p_member_id uuid, p_new_table_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  UPDATE tables
  SET active_moderator_member_id = NULL
  WHERE active_moderator_member_id = p_member_id
    AND (p_new_table_id IS NULL OR id IS DISTINCT FROM p_new_table_id);
$$;

REVOKE ALL ON FUNCTION public.release_moderator_on_leave(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_moderator_on_leave(uuid, uuid) TO anon, authenticated;

-- ── 1. assign_moderator_to_table — le 4e chemin qui rend une table modérée ──
CREATE OR REPLACE FUNCTION public.assign_moderator_to_table(
  p_password text, p_session_id uuid, p_table_number integer, p_member_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_table_id uuid;
BEGIN
  PERFORM check_superadmin_password(p_password);

  IF NOT EXISTS (
    SELECT 1 FROM session_members WHERE id = p_member_id AND session_id = p_session_id
  ) THEN
    RAISE EXCEPTION 'Ce membre n''appartient pas à cette séance';
  END IF;

  -- Chantier 123 — la source de vérité est `tables`, pas `table_assignments` :
  -- une table VIDE (créée à la main, chantier 95) n'a aucune ligne
  -- d'assignation, et l'ancienne requête renvoyait alors NULL, ce qui sautait
  -- EN SILENCE tout le bloc d'animation ci-dessous (→ « modérateur en surplus »).
  SELECT id INTO v_table_id
  FROM tables
  WHERE session_id = p_session_id AND table_number = p_table_number
  LIMIT 1;

  IF v_table_id IS NULL THEN
    -- Repli historique. `table_assignments.table_id` est NULLABLE : sans le
    -- filtre, `SELECT DISTINCT … LIMIT 1` pouvait attraper le NULL et produire
    -- le même no-op silencieux, de façon non déterministe.
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

  -- Il quitte peut-être une table qu'il animait : la libérer AVANT de l'asseoir.
  PERFORM release_moderator_on_leave(p_member_id, v_table_id);

  INSERT INTO table_assignments (session_id, member_id, table_number, table_id)
  VALUES (p_session_id, p_member_id, p_table_number, v_table_id)
  ON CONFLICT (session_id, member_id)
  DO UPDATE SET table_number = EXCLUDED.table_number, table_id = EXCLUDED.table_id;

  -- Désigner en principal, sauf si la table a DÉJÀ un animateur effectif — auquel
  -- cas le nouveau venu est un vrai modérateur en surplus (chantier 25b), statut
  -- légitime et conservé.
  IF NOT has_effective_moderator(v_table_id) THEN
    UPDATE tables
    SET leaderless                 = false,
        active_moderator_member_id = p_member_id
    WHERE id = v_table_id;
  END IF;
END;
$function$;

-- ── 2. move_member_to_group — glisser-déposer de l'onglet Groupes ──
CREATE OR REPLACE FUNCTION public.move_member_to_group(
  p_password text, p_session_id uuid, p_member_id uuid, p_target_table_number integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_target_table_id uuid;
  v_old_table_id    uuid;
  v_is_moderator    boolean;
BEGIN
  PERFORM check_superadmin_password(p_password);

  SELECT ta.table_id, sm.is_moderator
  INTO v_old_table_id, v_is_moderator
  FROM session_members sm
  LEFT JOIN table_assignments ta
    ON  ta.session_id = sm.session_id
    AND ta.member_id  = sm.id
  WHERE sm.id         = p_member_id
    AND sm.session_id = p_session_id;

  SELECT id INTO v_target_table_id
  FROM tables
  WHERE session_id   = p_session_id
    AND table_number = p_target_table_number
  LIMIT 1;

  IF v_target_table_id IS NULL THEN
    -- Chantier 123 — `table_id` est nullable : sans ce filtre, le DISTINCT
    -- pouvait renvoyer NULL et déplacer le membre vers une table « nulle part ».
    SELECT DISTINCT table_id INTO v_target_table_id
    FROM table_assignments
    WHERE session_id = p_session_id
      AND table_number = p_target_table_number
      AND table_id IS NOT NULL
    LIMIT 1;
  END IF;

  UPDATE table_assignments
  SET table_number = p_target_table_number,
      table_id     = v_target_table_id
  WHERE session_id = p_session_id
    AND member_id  = p_member_id;

  IF v_is_moderator
     AND v_old_table_id IS NOT NULL
     AND v_old_table_id IS DISTINCT FROM v_target_table_id
  THEN
    -- Chantier 64 (inchangé) : seule une table convertie depuis une table sans
    -- animateur redevient `leaderless` quand son modérateur s'en va.
    UPDATE tables
    SET leaderless = true
    WHERE id = v_old_table_id
      AND leaderless_by_design = true;

    -- Chantier 123 — dans TOUS les cas, la table quittée perd son animateur
    -- effectif. Sans ça, elle gardait un `active_moderator_member_id` périmé qui
    -- faisait passer le modérateur suivant en « surplus ».
    PERFORM release_moderator_on_leave(p_member_id, v_target_table_id);
  END IF;
END;
$function$;

-- ── 3. sync_table_assignment — chemin participant (switch_table, chantier 48) ──
--
-- Seul ajout au corps courant : le `release_moderator_on_leave` juste avant
-- l'upsert du siège. Le reste est repris À L'IDENTIQUE de la définition en base
-- (`pg_get_functiondef`), conformément à la garde de CLAUDE.md.
CREATE OR REPLACE FUNCTION public.sync_table_assignment(p_session_id uuid, p_table_id uuid, p_pseudo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_phase        text;
  v_member_id    uuid;
  v_table_number int;
  v_code         text;
begin
  if p_session_id is null then
    return null;
  end if;

  begin
    select phase into v_phase from sessions where id = p_session_id;

    select id into v_member_id
    from session_members
    where session_id = p_session_id and user_id = auth.uid();

    if v_member_id is null then
      if exists (
        select 1 from session_members
        where session_id = p_session_id and pseudo = p_pseudo
      ) then
        return jsonb_build_object('reconnect_required', true);
      end if;

      v_code := gen_member_reclaim_code(p_session_id);

      insert into session_members (session_id, user_id, pseudo, joined_phase, attending_in_person, reclaim_code_hash)
      values (p_session_id, auth.uid(), p_pseudo, coalesce(v_phase, 'debating'), true, crypt(v_code, gen_salt('bf')))
      returning id into v_member_id;
    end if;

    select table_number into v_table_number
    from tables
    where id = p_table_id;

    if v_table_number is null then
      select table_number into v_table_number
      from table_assignments
      where session_id = p_session_id and table_id = p_table_id
      limit 1;
    end if;

    if v_table_number is null then
      select coalesce(max(table_number), 0) + 1 into v_table_number
      from table_assignments
      where session_id = p_session_id;
    end if;

    update tables
    set table_number = v_table_number
    where id = p_table_id
      and session_id = p_session_id
      and table_number is null;

    -- Chantier 123 — il change de table : libérer celle qu'il animait.
    perform release_moderator_on_leave(v_member_id, p_table_id);

    insert into table_assignments (session_id, member_id, table_number, table_id)
    values (p_session_id, v_member_id, v_table_number, p_table_id)
    on conflict (session_id, member_id)
    do update set table_number = excluded.table_number, table_id = excluded.table_id;
  exception when others then
    raise warning 'sync_table_assignment: echec pour session=%, user=%, pseudo=%, table=% -- %',
      p_session_id, auth.uid(), p_pseudo, p_table_id, sqlerrm;
    return null;
  end;

  if v_code is not null then
    return jsonb_build_object('new_reclaim_code', v_code);
  end if;
  return null;
end;
$function$;

-- ── 4. set_table_leaderless — chemin symétrique, demandé par Jules ──
--
-- Refaire d'une table modérée une table SANS ANIMATEUR. Ne touche pas au drapeau
-- `session_members.is_moderator` : celui-ci est un titre de « modérateur
-- potentiel » qui sert d'entrée à l'algorithme d'allocation, et le retirer se fait
-- séparément (bouton « Retirer »), pour que le superadmin voie ce qu'il change.
CREATE OR REPLACE FUNCTION public.set_table_leaderless(p_password text, p_table_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_table tables%ROWTYPE;
  v_owner uuid := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
BEGIN
  PERFORM check_superadmin_password(p_password);

  SELECT * INTO v_table FROM tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table introuvable';
  END IF;

  -- `leaderless_by_design` passe à true : la table est désormais CONÇUE sans
  -- animateur, donc la règle de bascule arrière du chantier 64 s'y applique si
  -- elle est de nouveau confiée à quelqu'un plus tard.
  UPDATE tables
  SET leaderless                 = true,
      leaderless_by_design       = true,
      active_moderator_member_id = NULL,
      -- Un modérateur « physique » (créateur assis, cf. chantier 72) rendrait la
      -- table non reprenable et lui laisserait l'écran modérateur malgré
      -- `leaderless` : on rend la propriété au superadmin, comme
      -- `release_table_moderation`.
      created_by                 = v_owner
  WHERE id = p_table_id;

  RETURN jsonb_build_object(
    'table_id',      p_table_id,
    'leaderless',    true,
    'has_moderator', table_has_moderator(p_table_id)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_table_leaderless(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_table_leaderless(text, uuid) TO anon, authenticated;
