-- Chantier 144 (point 4) — add_offline_participant : refuser un nom qui est celui du modérateur lui-même.
-- Les personnes sans téléphone sont toutes insérées sous auth.uid() du modérateur, d'où l'exemption
-- `user_id is distinct from auth.uid()` (sinon on ne pourrait pas en ajouter plusieurs).
-- Conséquence : le siège du modérateur lui-même échappait à la garde. On ajoute une garde sur son
-- identité de séance (session_members.user_id = auth.uid()), comparée via pseudo_key (insensible à la casse).
-- Limite connue : un modérateur entré par Code Ecclesia sans inscription à la séance n'a pas de ligne
-- session_members — son siège reste indiscernable des personnes sans téléphone.
CREATE OR REPLACE FUNCTION public.add_offline_participant(p_table_id uuid, p_pseudo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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

  if exists (
    select 1 from participants
    where table_id = p_table_id
      and pseudo_key(pseudo) = pseudo_key(p_pseudo)
      and user_id is distinct from auth.uid()
  ) then
    raise exception 'Une personne est déjà assise à cette table sous ce nom.';
  end if;

  -- Chantier 144 — le nom du modérateur lui-même.
  if exists (
    select 1 from session_members sm
    join tables t on t.session_id = sm.session_id
    where t.id = p_table_id
      and sm.user_id = auth.uid()
      and pseudo_key(sm.pseudo) = pseudo_key(p_pseudo)
  ) then
    raise exception 'Une personne est déjà assise à cette table sous ce nom.';
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
    on conflict do nothing
    returning id into v_new_member_id;

    if v_new_member_id is null then
      v_code := null;
    end if;
  end if;

  return jsonb_build_object('participant_id', v_participant_id, 'new_reclaim_code', v_code);
end;
$function$;
