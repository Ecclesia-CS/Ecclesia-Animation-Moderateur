-- Chantier 140 — Portes d'entrée : un nom déjà pris ne donne jamais accès
-- sans le code de rappel.
--
-- Faille (symptôme 1 de Jules, « entré dans un débat sous un nom qui n'était
-- pas le mien, sans qu'on me demande le numéro ») : quatre RPC assoient
-- l'appelant par
--     INSERT INTO participants ... ON CONFLICT (table_id, pseudo)
--     DO UPDATE SET user_id = EXCLUDED.user_id
-- AVANT tout contrôle d'identité. Taper le nom d'un participant déjà assis à
-- la table suffisait à lui prendre son siège (son participant_id, donc son nom
-- à l'écran, sa place dans la file). `sync_table_assignment` détectait bien le
-- conflit ensuite (`reconnect_required`, chantier 120) — mais le siège était
-- déjà réécrit, et seul `App.tsx` (restauration au reload) lisait ce drapeau :
-- `JoinTableForm` (porte « code de table », celle du débat) l'ignorait et
-- faisait entrer l'utilisateur.
--
-- Correctif : un contrôle unique, `resolve_table_entry_pseudo`, appelé en tête
-- des quatre RPC, avant toute écriture :
--   · l'appelant est déjà membre de la séance (même appareil, ou reconnecté par
--     code via confirm_attendance) → son identité EST ce membre : le pseudo
--     effectif est celui du membre, quel que soit le nom tapé ;
--   · sinon, le nom appartient à un membre de la séance → `reconnect_required`
--     (rien n'est écrit), le client ouvre l'accordéon « code de rappel » ;
--   · sinon, le nom est tenu à cette table par un autre compte sans être un
--     membre (tables hors séance, héritage) → refus explicite.
-- Les RPC renvoient désormais aussi `pseudo` (le pseudo effectif).
--
-- Réécrit (base : définitions courantes de la base dev, pg_get_functiondef,
-- 2026-09-28 — incluent check_moderator_code du chantier 135) :
--   join_table(text,text), switch_table(uuid,text,text),
--   claim_table_as_moderator(text,text,text,uuid),
--   reclaim_moderator(text,text), reclaim_moderator(text,text,text).
-- Seul changement dans chacune : le contrôle ajouté en tête + le pseudo
-- effectif utilisé partout à la place de p_pseudo + `pseudo` dans le retour.
-- ⚠️ Prod : appliquer APRÈS les migrations du chantier 135 (check_moderator_code).

-- ── Helper ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_table_entry_pseudo(p_table_id uuid, p_pseudo text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_session_id uuid;
  v_pseudo     text := btrim(coalesce(p_pseudo, ''));
  v_mine       text;
  v_holder     uuid;
BEGIN
  SELECT session_id INTO v_session_id FROM tables WHERE id = p_table_id;

  IF v_session_id IS NOT NULL THEN
    SELECT pseudo INTO v_mine
    FROM session_members
    WHERE session_id = v_session_id AND user_id = auth.uid()
    LIMIT 1;

    IF v_mine IS NOT NULL THEN
      RETURN jsonb_build_object('pseudo', v_mine);
    END IF;
  END IF;

  IF v_pseudo = '' THEN
    RAISE EXCEPTION 'Le pseudo ne peut pas être vide';
  END IF;

  IF v_session_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM session_members
    WHERE session_id = v_session_id AND pseudo = v_pseudo
  ) THEN
    RETURN jsonb_build_object(
      'reconnect_required', true,
      'session_id',         v_session_id,
      'pseudo',             v_pseudo
    );
  END IF;

  SELECT user_id INTO v_holder
  FROM participants
  WHERE table_id = p_table_id AND pseudo = v_pseudo;

  IF v_holder IS NOT NULL AND v_holder IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Ce nom est déjà pris à cette table. Choisis-en un autre.';
  END IF;

  RETURN jsonb_build_object('pseudo', v_pseudo);
END;
$function$;

-- Helper interne : jamais appelé directement par le client (chantier 102).
REVOKE ALL ON FUNCTION public.resolve_table_entry_pseudo(uuid, text) FROM PUBLIC, anon, authenticated;

-- ── join_table ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.join_table(p_join_code text, p_pseudo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_table_id       uuid;
  v_session_id     uuid;
  v_participant_id uuid;
  v_check          jsonb;
  v_pseudo         text;
  v_sync           jsonb;
  v_result         jsonb;
begin
  select id, session_id into v_table_id, v_session_id
  from tables where join_code = upper(p_join_code);
  if v_table_id is null then
    raise exception 'Session introuvable';
  end if;

  -- Chantier 140 — contrôle d'identité AVANT toute écriture.
  v_check := resolve_table_entry_pseudo(v_table_id, p_pseudo);
  if coalesce((v_check->>'reconnect_required')::boolean, false) then
    return v_check;
  end if;
  v_pseudo := v_check->>'pseudo';

  perform leave_other_session_tables(v_session_id, v_table_id);

  insert into participants (table_id, user_id, pseudo)
  values (v_table_id, auth.uid(), v_pseudo)
  on conflict (table_id, pseudo) do update set user_id = excluded.user_id
  returning id into v_participant_id;

  v_sync := sync_table_assignment(v_session_id, v_table_id, v_pseudo);

  select jsonb_build_object(
    'id',                      s.id,
    'join_code',               s.join_code,
    'created_by',              s.created_by,
    'current_speaker_id',      s.current_speaker_id,
    'current_turn_started_at', s.current_turn_started_at,
    'created_at',              s.created_at,
    'session_id',              s.session_id,
    'participant_id',          v_participant_id,
    'pseudo',                  v_pseudo
  ) into v_result
  from tables s where s.id = v_table_id;

  return v_result || coalesce(v_sync, '{}'::jsonb);
end;
$function$;

-- ── switch_table ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.switch_table(p_session_id uuid, p_join_code text, p_pseudo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_table_id       uuid;
  v_table_session  uuid;
  v_participant_id uuid;
  v_check          jsonb;
  v_pseudo         text;
  v_sync           jsonb;
  v_result         jsonb;
begin
  if p_session_id is null then
    raise exception 'Séance requise.';
  end if;

  select id, session_id into v_table_id, v_table_session
  from tables where join_code = upper(p_join_code);

  if v_table_id is null then
    raise exception 'Aucune table ne correspond à ce code.';
  end if;

  if v_table_session is distinct from p_session_id then
    raise exception 'Ce code correspond à une table d''une autre séance.';
  end if;

  if exists (
    select 1 from participants where table_id = v_table_id and user_id = auth.uid()
  ) then
    raise exception 'Tu es déjà à cette table.';
  end if;

  -- Chantier 140 — contrôle d'identité AVANT toute écriture.
  v_check := resolve_table_entry_pseudo(v_table_id, p_pseudo);
  if coalesce((v_check->>'reconnect_required')::boolean, false) then
    return v_check;
  end if;
  v_pseudo := v_check->>'pseudo';

  perform leave_other_session_tables(p_session_id, v_table_id);

  insert into participants (table_id, user_id, pseudo)
  values (v_table_id, auth.uid(), v_pseudo)
  on conflict (table_id, pseudo) do update set user_id = excluded.user_id
  returning id into v_participant_id;

  v_sync := sync_table_assignment(p_session_id, v_table_id, v_pseudo);

  select jsonb_build_object(
    'id',                      s.id,
    'join_code',               s.join_code,
    'created_by',              s.created_by,
    'current_speaker_id',      s.current_speaker_id,
    'current_turn_started_at', s.current_turn_started_at,
    'created_at',              s.created_at,
    'participant_id',          v_participant_id,
    'pseudo',                  v_pseudo
  ) into v_result
  from tables s where s.id = v_table_id;

  return v_result || coalesce(v_sync, '{}'::jsonb);
end;
$function$;

-- ── claim_table_as_moderator ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_table_as_moderator(p_join_code text, p_creation_code text, p_pseudo text, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_hash           text;
  v_table          tables%ROWTYPE;
  v_participant_id uuid;
  v_member_id      uuid;
  v_check          jsonb;
  v_pseudo         text;
  v_sync           jsonb;
  v_result         jsonb;
BEGIN
  IF NOT check_moderator_code(p_creation_code, (SELECT t.session_id FROM tables t WHERE t.join_code = upper(p_join_code))) THEN RAISE EXCEPTION 'Code Ecclesia incorrect'; END IF;

  SELECT * INTO v_table
  FROM tables
  WHERE join_code = upper(p_join_code)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table introuvable (code %)', upper(p_join_code);
  END IF;

  IF p_session_id IS NOT NULL AND v_table.session_id IS DISTINCT FROM p_session_id THEN
    RAISE EXCEPTION 'Ce code de table n''appartient pas à cette séance';
  END IF;

  IF p_pseudo IS NULL OR btrim(p_pseudo) = '' THEN
    RAISE EXCEPTION 'Le pseudo ne peut pas être vide';
  END IF;

  -- Chantier 140 — le Code Ecclesia donne l'autorité d'animer, pas le droit
  -- de prendre le nom d'un autre : même contrôle que join_table, avant toute
  -- écriture.
  v_check := resolve_table_entry_pseudo(v_table.id, p_pseudo);
  IF coalesce((v_check->>'reconnect_required')::boolean, false) THEN
    RETURN v_check;
  END IF;
  v_pseudo := v_check->>'pseudo';

  IF table_has_moderator(v_table.id)
     AND NOT table_moderator_is(v_table.id, v_pseudo) THEN
    RAISE EXCEPTION 'Cette table a déjà un modérateur — choisis-en une autre ou contacte le superadmin';
  END IF;

  IF v_table.session_id IS NOT NULL THEN
    SELECT id INTO v_member_id
    FROM session_members
    WHERE session_id = v_table.session_id
      AND user_id    = auth.uid();
  END IF;

  UPDATE tables
  SET created_by = auth.uid(),
      leaderless = false,
      active_moderator_member_id = COALESCE(active_moderator_member_id, v_member_id)
  WHERE id = v_table.id;

  PERFORM leave_other_session_tables(v_table.session_id, v_table.id);

  INSERT INTO participants (table_id, user_id, pseudo)
  VALUES (v_table.id, auth.uid(), v_pseudo)
  ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
  RETURNING id INTO v_participant_id;

  IF v_table.session_id IS NOT NULL THEN
    v_sync := sync_table_assignment(v_table.session_id, v_table.id, v_pseudo);

    SELECT id INTO v_member_id
    FROM session_members
    WHERE session_id = v_table.session_id
      AND user_id    = auth.uid();

    IF v_member_id IS NOT NULL THEN
      UPDATE session_members
      SET is_moderator = true
      WHERE id = v_member_id
        AND is_moderator = false;

      UPDATE tables
      SET active_moderator_member_id = COALESCE(active_moderator_member_id, v_member_id)
      WHERE id = v_table.id;
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'id',                      s.id,
    'join_code',               s.join_code,
    'created_by',              s.created_by,
    'current_speaker_id',      s.current_speaker_id,
    'current_turn_started_at', s.current_turn_started_at,
    'created_at',              s.created_at,
    'participant_id',          v_participant_id,
    'pseudo',                  v_pseudo
  ) INTO v_result
  FROM tables s WHERE s.id = v_table.id;

  RETURN v_result || COALESCE(v_sync, '{}'::jsonb);
END;
$function$;

-- ── reclaim_moderator (2 surcharges, appelées seulement par TestScreen) ──────
CREATE OR REPLACE FUNCTION public.reclaim_moderator(p_join_code text, p_moderator_code text, p_pseudo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_table_id       uuid;
  v_creation_hash  text;
  v_participant_id uuid;
  v_check          jsonb;
  v_pseudo         text;
  v_result         jsonb;
BEGIN
  SELECT id
  INTO   v_table_id
  FROM   tables
  WHERE  join_code = upper(p_join_code);

  IF v_table_id IS NULL THEN
    RAISE EXCEPTION 'Table introuvable (code %)', upper(p_join_code);
  END IF;

  IF NOT check_moderator_code(p_moderator_code, (SELECT t.session_id FROM tables t WHERE t.id = v_table_id)) THEN RAISE EXCEPTION 'Code Ecclesia incorrect'; END IF;

  IF trim(p_pseudo) = '' THEN
    RAISE EXCEPTION 'Le pseudo ne peut pas être vide';
  END IF;

  -- Chantier 140 — contrôle d'identité AVANT toute écriture.
  v_check := resolve_table_entry_pseudo(v_table_id, p_pseudo);
  IF coalesce((v_check->>'reconnect_required')::boolean, false) THEN
    RETURN v_check;
  END IF;
  v_pseudo := v_check->>'pseudo';

  UPDATE tables SET created_by = auth.uid() WHERE id = v_table_id;

  INSERT INTO participants (table_id, user_id, pseudo)
  VALUES (v_table_id, auth.uid(), v_pseudo)
  ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
  RETURNING id INTO v_participant_id;

  SELECT jsonb_build_object(
    'id',                      s.id,
    'join_code',               s.join_code,
    'created_by',              s.created_by,
    'current_speaker_id',      s.current_speaker_id,
    'current_turn_started_at', s.current_turn_started_at,
    'created_at',              s.created_at,
    'participant_id',          v_participant_id,
    'pseudo',                  v_pseudo
  ) INTO v_result
  FROM tables s WHERE s.id = v_table_id;

  RETURN v_result;
END;
$function$;

-- Version 2 arguments : reprenait le pseudo de l'ancien créateur de la table —
-- c'est-à-dire, par construction, le siège de quelqu'un d'autre. Elle passe
-- désormais par le même contrôle : refus (reconnect_required) sauf si
-- l'appelant EST le membre qui porte ce nom.
CREATE OR REPLACE FUNCTION public.reclaim_moderator(p_join_code text, p_moderator_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_table_id uuid; v_old_created_by uuid; v_creation_hash text;
  v_pseudo text; v_participant_id uuid; v_result jsonb; v_check jsonb;
BEGIN
  SELECT id, created_by INTO v_table_id, v_old_created_by FROM tables WHERE join_code = upper(p_join_code);
  IF v_table_id IS NULL THEN RAISE EXCEPTION 'Session introuvable (code %)', upper(p_join_code); END IF;
  IF NOT check_moderator_code(p_moderator_code, (SELECT t.session_id FROM tables t WHERE t.id = v_table_id)) THEN RAISE EXCEPTION 'Code Ecclesia incorrect'; END IF;
  SELECT pseudo INTO v_pseudo FROM participants WHERE table_id = v_table_id AND user_id = v_old_created_by LIMIT 1;

  -- Chantier 140 — contrôle d'identité AVANT toute écriture.
  v_check := resolve_table_entry_pseudo(v_table_id, COALESCE(v_pseudo, 'Modérateur'));
  IF coalesce((v_check->>'reconnect_required')::boolean, false) THEN
    RETURN v_check;
  END IF;
  v_pseudo := v_check->>'pseudo';

  UPDATE tables SET created_by = auth.uid() WHERE id = v_table_id;
  INSERT INTO participants (table_id, user_id, pseudo) VALUES (v_table_id, auth.uid(), v_pseudo)
  ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
  RETURNING id INTO v_participant_id;
  SELECT jsonb_build_object('id', s.id, 'join_code', s.join_code, 'created_by', s.created_by,
    'current_speaker_id', s.current_speaker_id, 'current_turn_started_at', s.current_turn_started_at,
    'created_at', s.created_at, 'participant_id', v_participant_id, 'pseudo', v_pseudo)
  INTO v_result FROM tables s WHERE s.id = v_table_id;
  RETURN v_result;
END;
$function$;
