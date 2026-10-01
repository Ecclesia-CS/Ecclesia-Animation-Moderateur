-- Chantier 119 — Angles morts du code de rappel (inscriptions sans code)
-- (numéroté 117, puis 118, au fil de deux rebases : collisions avec les
-- chantiers 117 et 118 pris par deux autres sessions le même jour)
--
-- Constat (pg_get_functiondef, jamais les anciens fichiers de migration) : sur les
-- 6 fonctions qui insèrent dans session_members, seules register_session_member,
-- claim_moderator_status et assign_least_filled_table (chantier 111) génèrent un
-- reclaim_code. Trois angles morts corrigés ici :
--
-- 1. sync_table_assignment (appelée par join_table/switch_table/create_table,
--    donc par tout "rejoindre une table par son code") crée la ligne
--    session_members sans jamais générer de reclaim_code_hash.
-- 2. claim_table_as_moderator (chantier 68, rattrapage modérateur sur une table
--    sans modérateur) n'appelle jamais sync_table_assignment : aucune ligne
--    session_members/table_assignments créée pour ce modérateur de rattrapage.
-- 3. add_offline_participant (outil modérateur "ajouter une personne sans
--    téléphone") crée la ligne session_members sans code — cette personne ne
--    pourra jamais réclamer son identité, même plus tard depuis son propre
--    appareil via confirm_attendance (pseudo + code).
--
-- sync_table_assignment change de type de retour (void -> jsonb) pour remonter
-- le nouveau code le cas échéant : DROP FUNCTION IF EXISTS obligatoire (règle
-- SQL du projet). Signature vérifiée en base avant écriture : sync_table_assignment
-- (uuid, uuid, text) — 3 arguments, pas les 4 documentés par d'anciens fichiers
-- de migration (déjà relevé au chantier 111).

drop function if exists public.sync_table_assignment(uuid, uuid, text);

create or replace function public.sync_table_assignment(p_session_id uuid, p_table_id uuid, p_pseudo text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
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

    insert into table_assignments (session_id, member_id, table_number, table_id)
    values (p_session_id, v_member_id, v_table_number, p_table_id)
    on conflict (session_id, member_id)
    do update set table_number = excluded.table_number, table_id = excluded.table_id;
  exception when others then
    raise warning 'sync_table_assignment: échec pour session=%, user=%, pseudo=%, table=% — %',
      p_session_id, auth.uid(), p_pseudo, p_table_id, sqlerrm;
    return null;
  end;

  if v_code is not null then
    return jsonb_build_object('new_reclaim_code', v_code);
  end if;
  return null;
end;
$function$;

-- sync_table_assignment reste un helper interne (chantier 102) : le DROP+CREATE
-- ci-dessus a réinitialisé son ACL. Sur ce projet, les privilèges par défaut de
-- Supabase regrant EXECUTE explicitement à anon/authenticated sur toute fonction
-- nouvellement créée (constaté après coup via proacl : REVOKE ... FROM PUBLIC seul
-- ne suffit pas à les retirer, ce sont des grants explicites, pas hérités de
-- PUBLIC) — il faut les lister nommément pour retrouver l'ACL de départ
-- ({postgres=X, service_role=X}, identique à leave_other_session_tables).
revoke execute on function public.sync_table_assignment(uuid, uuid, text) from public, anon, authenticated;

-- join_table, switch_table, create_table : mêmes signature et type de retour,
-- CREATE OR REPLACE suffit. Seul changement : capturer le retour de
-- sync_table_assignment (désormais jsonb) et le fusionner dans le résultat.

create or replace function public.join_table(p_join_code text, p_pseudo text)
 returns jsonb
 language plpgsql
 security definer
as $function$
declare
  v_table_id       uuid;
  v_session_id     uuid;
  v_participant_id uuid;
  v_sync           jsonb;
  v_result         jsonb;
begin
  select id, session_id into v_table_id, v_session_id
  from tables where join_code = upper(p_join_code);
  if v_table_id is null then
    raise exception 'Session introuvable';
  end if;

  perform leave_other_session_tables(v_session_id, v_table_id);

  insert into participants (table_id, user_id, pseudo)
  values (v_table_id, auth.uid(), p_pseudo)
  on conflict (table_id, pseudo) do update set user_id = excluded.user_id
  returning id into v_participant_id;

  v_sync := sync_table_assignment(v_session_id, v_table_id, p_pseudo);

  select jsonb_build_object(
    'id',                      s.id,
    'join_code',               s.join_code,
    'created_by',              s.created_by,
    'current_speaker_id',      s.current_speaker_id,
    'current_turn_started_at', s.current_turn_started_at,
    'created_at',              s.created_at,
    'participant_id',          v_participant_id
  ) into v_result
  from tables s where s.id = v_table_id;

  return v_result || coalesce(v_sync, '{}'::jsonb);
end;
$function$;

create or replace function public.switch_table(p_session_id uuid, p_join_code text, p_pseudo text)
 returns jsonb
 language plpgsql
 security definer
as $function$
declare
  v_table_id       uuid;
  v_table_session  uuid;
  v_participant_id uuid;
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

  perform leave_other_session_tables(p_session_id, v_table_id);

  insert into participants (table_id, user_id, pseudo)
  values (v_table_id, auth.uid(), p_pseudo)
  on conflict (table_id, pseudo) do update set user_id = excluded.user_id
  returning id into v_participant_id;

  v_sync := sync_table_assignment(p_session_id, v_table_id, p_pseudo);

  select jsonb_build_object(
    'id',                      s.id,
    'join_code',               s.join_code,
    'created_by',              s.created_by,
    'current_speaker_id',      s.current_speaker_id,
    'current_turn_started_at', s.current_turn_started_at,
    'created_at',              s.created_at,
    'participant_id',          v_participant_id
  ) into v_result
  from tables s where s.id = v_table_id;

  return v_result || coalesce(v_sync, '{}'::jsonb);
end;
$function$;

create or replace function public.create_table(p_pseudo text, p_creation_code text, p_session_id uuid default null::uuid, p_leaderless boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_hash           text;
  v_join_code      text;
  v_table_id       uuid;
  v_participant_id uuid;
  v_sync           jsonb;
  v_result         jsonb;
begin
  if p_session_id is null then
    raise exception 'session_required';
  end if;

  if not p_leaderless then
    select value into v_hash from app_config where key = 'creation_code_hash';
    if crypt(p_creation_code, v_hash) is distinct from v_hash then
      raise exception 'Code de création invalide';
    end if;
  end if;

  loop
    v_join_code := upper(encode(gen_random_bytes(3), 'hex'));
    exit when not exists (select 1 from tables where join_code = v_join_code);
  end loop;

  insert into tables (join_code, created_by, session_id, leaderless, leaderless_by_design)
  values (v_join_code, auth.uid(), p_session_id, p_leaderless, p_leaderless)
  returning id into v_table_id;

  insert into participants (table_id, user_id, pseudo)
  values (v_table_id, auth.uid(), p_pseudo)
  returning id into v_participant_id;

  v_sync := sync_table_assignment(p_session_id, v_table_id, p_pseudo);

  select jsonb_build_object(
    'id',                      s.id,
    'join_code',               s.join_code,
    'created_by',              s.created_by,
    'current_speaker_id',      s.current_speaker_id,
    'current_turn_started_at', s.current_turn_started_at,
    'created_at',              s.created_at,
    'session_id',              s.session_id,
    'leaderless',              s.leaderless,
    'participant_id',          v_participant_id
  ) into v_result
  from tables s where s.id = v_table_id;

  return v_result || coalesce(v_sync, '{}'::jsonb);
end;
$function$;

-- claim_table_as_moderator (chantier 68) : appelle désormais sync_table_assignment,
-- comme join_table/switch_table/create_table — ce modérateur de rattrapage obtient
-- enfin une ligne session_members/table_assignments et un code de rappel.
create or replace function public.claim_table_as_moderator(p_join_code text, p_creation_code text, p_pseudo text, p_session_id uuid default null::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_hash           text;
  v_table          tables%rowtype;
  v_participant_id uuid;
  v_member_id      uuid;
  v_sync           jsonb;
  v_result         jsonb;
begin
  select value into v_hash from app_config where key = 'creation_code_hash';
  if v_hash is null or crypt(p_creation_code, v_hash) is distinct from v_hash then
    raise exception 'Code Ecclesia incorrect';
  end if;

  select * into v_table
  from tables
  where join_code = upper(p_join_code)
  for update;

  if not found then
    raise exception 'Table introuvable (code %)', upper(p_join_code);
  end if;

  if p_session_id is not null and v_table.session_id is distinct from p_session_id then
    raise exception 'Ce code de table n''appartient pas à cette séance';
  end if;

  if p_pseudo is null or btrim(p_pseudo) = '' then
    raise exception 'Le pseudo ne peut pas être vide';
  end if;

  if table_has_moderator(v_table.id)
     and not table_moderator_is(v_table.id, p_pseudo) then
    raise exception 'Cette table a déjà un modérateur — choisis-en une autre ou contacte le superadmin';
  end if;

  if v_table.session_id is not null then
    select id into v_member_id
    from session_members
    where session_id = v_table.session_id
      and user_id    = auth.uid();
  end if;

  update tables
  set created_by = auth.uid(),
      leaderless = false,
      active_moderator_member_id = coalesce(active_moderator_member_id, v_member_id)
  where id = v_table.id;

  perform leave_other_session_tables(v_table.session_id, v_table.id);

  insert into participants (table_id, user_id, pseudo)
  values (v_table.id, auth.uid(), btrim(p_pseudo))
  on conflict (table_id, pseudo) do update set user_id = excluded.user_id
  returning id into v_participant_id;

  if v_table.session_id is not null then
    v_sync := sync_table_assignment(v_table.session_id, v_table.id, btrim(p_pseudo));
  end if;

  select jsonb_build_object(
    'id',                      s.id,
    'join_code',               s.join_code,
    'created_by',              s.created_by,
    'current_speaker_id',      s.current_speaker_id,
    'current_turn_started_at', s.current_turn_started_at,
    'created_at',              s.created_at,
    'participant_id',          v_participant_id
  ) into v_result
  from tables s where s.id = v_table.id;

  return v_result || coalesce(v_sync, '{}'::jsonb);
end;
$function$;

-- add_offline_participant : génère désormais un vrai code de rappel, retourné
-- au modérateur pour transmission orale/écrite à la personne sans téléphone.
-- ON CONFLICT DO NOTHING inchangé (pseudo déjà pris dans la séance = ne pas
-- écraser un membre existant) ; dans ce cas, pas de nouveau code à retourner.
create or replace function public.add_offline_participant(p_table_id uuid, p_pseudo text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_participant_id uuid;
  v_session_id     uuid;
  v_code           text;
  v_new_member_id  uuid;
begin
  if not is_table_moderator(p_table_id) then
    raise exception 'Non autorisé';
  end if;

  if p_pseudo is null or btrim(p_pseudo) = '' then
    raise exception 'Pseudo requis';
  end if;

  insert into participants (table_id, user_id, pseudo)
  values (p_table_id, auth.uid(), btrim(p_pseudo))
  on conflict (table_id, pseudo) do update set user_id = excluded.user_id
  returning id into v_participant_id;

  select session_id into v_session_id from tables where id = p_table_id;
  if v_session_id is not null then
    v_code := gen_member_reclaim_code(v_session_id);

    insert into session_members (session_id, user_id, pseudo, joined_phase, attending_in_person, reclaim_code_hash)
    values (v_session_id, gen_random_uuid(), btrim(p_pseudo), 'debating', true, crypt(v_code, gen_salt('bf')))
    on conflict (session_id, pseudo) do nothing
    returning id into v_new_member_id;

    if v_new_member_id is null then
      v_code := null;
    end if;
  end if;

  return jsonb_build_object('participant_id', v_participant_id, 'new_reclaim_code', v_code);
end;
$function$;
