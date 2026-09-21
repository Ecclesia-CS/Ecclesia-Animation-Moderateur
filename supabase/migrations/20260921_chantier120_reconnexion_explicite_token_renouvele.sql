-- Chantier 120 — au renouvellement du jeton anonyme (veille longue,
-- navigateur in-app Messenger, purge Safari ITP), `session_members.user_id`
-- pouvait rester désynchronisé de l'appareil réel du participant :
-- `sync_table_assignment` échouait alors à relier la nouvelle identité
-- (conflit `UNIQUE(session_id, pseudo)`), avalé en silence par le
-- `EXCEPTION WHEN OTHERS` du chantier 111. La personne perdait l'accès au
-- vote/questionnaire/résultats sans aucun signal.
--
-- Confirmé par repro en base le 2026-09-21 (voir A_VERIFIER.md § Chantier 120).
--
-- Décision de Jules (2026-09-21, option B) : ne JAMAIS réassigner
-- `session_members.user_id` par simple connaissance du pseudo (ça rouvrirait
-- l'usurpation par pseudo que le chantier 93 a fermée) — demander une
-- reconnexion explicite (pseudo + code, `confirm_attendance`), quitte à
-- bloquer momentanément l'utilisateur : le modérateur ou le superadmin
-- peuvent lui régénérer un code si besoin.
--
-- Signatures et types de retour inchangés (jsonb, jsonb) sur les deux
-- fonctions ci-dessous : CREATE OR REPLACE suffit, pas de DROP — évite le
-- piège de regrant de privilèges par défaut rencontré au chantier 119.

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
      -- Chantier 120 : un membre existe déjà sous ce pseudo, mais pour un
      -- user_id différent (jeton renouvelé — ou tentative d'usurpation).
      -- Ne rien créer ni modifier : signaler au client qu'une reconnexion
      -- explicite (pseudo + code, confirm_attendance) est nécessaire.
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

-- join_table doit remonter `session_id` : le client en a besoin pour appeler
-- confirm_attendance quand sync_table_assignment répond `reconnect_required`.
CREATE OR REPLACE FUNCTION public.join_table(p_join_code text, p_pseudo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
    'session_id',              s.session_id,
    'participant_id',          v_participant_id
  ) into v_result
  from tables s where s.id = v_table_id;

  return v_result || coalesce(v_sync, '{}'::jsonb);
end;
$function$;

-- Vérification manuelle après application :
--   select proacl from pg_proc where proname in ('sync_table_assignment','join_table');
--   (doit être identique à avant cette migration — CREATE OR REPLACE sans DROP ne
--   régénère pas les privilèges par défaut)
