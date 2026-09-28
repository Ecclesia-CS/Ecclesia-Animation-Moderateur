-- Chantier 140b — Les noms sont comparés sans tenir compte des majuscules
-- (décision de Jules, 2026-09-28 : « les majuscules doivent être considérées
-- comme des minuscules »).
--
-- Avant : « jules dupont » pouvait s'inscrire à côté de « Jules Dupont »
-- (contrainte UNIQUE (session_id, pseudo) exacte), et la reconnexion par code
-- exigeait la casse exacte du nom. Les espaces en trop comptaient aussi.
--
-- Clé de comparaison : pseudo_key(t) = minuscules + espaces de bord retirés +
-- espaces internes multiples réduits à un. Le nom affiché, lui, n'est jamais
-- modifié (on garde la casse saisie à l'inscription).
--
-- Contenu :
--   1. pseudo_key(text) (IMMUTABLE, utilisable en index).
--   2. Doublons existants (même séance, même clé) : le plus ancien garde son
--      nom, les suivants reçoivent le suffixe « (2) », « (3) »… — propagé aux
--      copies du nom (participants, session_sources) comme le fait
--      rename_session_member. Constaté le 28/09 : 2 cas sur dev, 1 sur prod
--      (séance close du 2026-06-03).
--   3. Index unique (session_id, pseudo_key(pseudo)) : toutes les RPC qui
--      inscrivent attrapent déjà unique_violation (« nom déjà pris »).
--   4. Recherches par nom passées sur pseudo_key : confirm_attendance,
--      reclaim_prevoting_member, resolve_table_entry_pseudo (140),
--      sync_table_assignment, rename_session_member, regenerate_reclaim_code_*.
--   5. Anti-force-brute (reclaim_attempts) indexé par la clé — sinon changer la
--      casse du nom remettait le compteur de tentatives à zéro.
--   6. add_offline_participant : ne reprend plus le siège d'une personne déjà
--      assise sous ce nom (même défaut que join_table, chantier 140), et son
--      ON CONFLICT couvre aussi le nouvel index.
--
-- Réécrit depuis pg_get_functiondef (base dev, 2026-09-28). Identiques sur
-- prod, sauf regenerate_reclaim_code_admin (check_member_admin, chantier 135)
-- ⚠️ Prod : appliquer APRÈS les migrations du 135 et 20260928_chantier140.

-- ── 1. Clé ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pseudo_key(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $$ SELECT lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')) $$;

-- ── 2. Doublons existants ────────────────────────────────────────────────────
DO $$
DECLARE
  r      record;
  v_new  text;
  v_n    int;
BEGIN
  FOR r IN
    SELECT id, session_id, user_id, pseudo, rn FROM (
      SELECT sm.*, row_number() OVER (
        PARTITION BY session_id, pseudo_key(pseudo) ORDER BY created_at, id
      ) AS rn
      FROM session_members sm
    ) x
    WHERE rn > 1
  LOOP
    v_n := r.rn;
    LOOP
      v_new := btrim(r.pseudo) || ' (' || v_n || ')';
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM session_members
        WHERE session_id = r.session_id AND pseudo_key(pseudo) = pseudo_key(v_new)
      );
      v_n := v_n + 1;
    END LOOP;

    UPDATE session_members SET pseudo = v_new WHERE id = r.id;

    UPDATE participants p SET pseudo = v_new
    FROM tables t
    WHERE t.id = p.table_id AND t.session_id = r.session_id
      AND p.user_id = r.user_id AND p.pseudo = r.pseudo;

    UPDATE session_sources SET pseudo = v_new
    WHERE session_id = r.session_id AND user_id = r.user_id AND pseudo = r.pseudo;

    RAISE NOTICE 'chantier 140b : doublon renommé (session %, membre %)', r.session_id, r.id;
  END LOOP;
END $$;

-- ── 3. Index unique insensible à la casse ────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS session_members_session_pseudo_key_uniq
  ON public.session_members (session_id, public.pseudo_key(pseudo));

-- ── 5. Anti-force-brute indexé par la clé ────────────────────────────────────
-- Table de limitation transitoire (blocage d'une minute) : on la vide plutôt
-- que de migrer des clés qui pourraient entrer en collision.
DELETE FROM public.reclaim_attempts;

CREATE OR REPLACE FUNCTION public.reclaim_block_reason(p_session_id uuid, p_pseudo text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN ra.blocked_until IS NOT NULL AND ra.blocked_until > now()
    THEN 'Trop de tentatives. Réessaie dans '
         || GREATEST(1, ceil(extract(epoch FROM ra.blocked_until - now()))::int)::text
         || ' secondes.'
    ELSE NULL
  END
  FROM reclaim_attempts ra
  WHERE ra.session_id = p_session_id AND ra.pseudo = pseudo_key(p_pseudo);
$function$;

CREATE OR REPLACE FUNCTION public.record_reclaim_failure(p_session_id uuid, p_pseudo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO reclaim_attempts (session_id, pseudo, fail_count, window_start)
  VALUES (p_session_id, pseudo_key(p_pseudo), 1, now())
  ON CONFLICT (session_id, pseudo) DO UPDATE
  SET fail_count = CASE
        WHEN reclaim_attempts.window_start < now() - interval '1 minute' THEN 1
        ELSE reclaim_attempts.fail_count + 1
      END,
      window_start = CASE
        WHEN reclaim_attempts.window_start < now() - interval '1 minute' THEN now()
        ELSE reclaim_attempts.window_start
      END;

  UPDATE reclaim_attempts
  SET blocked_until = now() + interval '1 minute',
      fail_count    = 0,
      window_start  = now()
  WHERE session_id = p_session_id AND pseudo = pseudo_key(p_pseudo) AND fail_count >= 10;
END;
$function$;

CREATE OR REPLACE FUNCTION public.clear_reclaim_attempts(p_session_id uuid, p_pseudo text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DELETE FROM reclaim_attempts WHERE session_id = p_session_id AND pseudo = pseudo_key(p_pseudo);
$function$;

-- ── 4. Recherches par nom ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_attendance(p_session_id uuid, p_pseudo text DEFAULT NULL::text, p_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_phase         text;
  v_caller        uuid := auth.uid();
  v_target        session_members%ROWTYPE;
  v_caller_member session_members%ROWTYPE;
  v_pseudo        text := btrim(coalesce(p_pseudo, ''));
  v_blocked       text;
BEGIN
  SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;
  IF v_phase IS NULL THEN
    RAISE EXCEPTION 'Séance introuvable';
  END IF;
  IF v_phase = 'draft' THEN
    RAISE EXCEPTION 'La séance n''est pas ouverte (phase: %)', v_phase;
  END IF;

  SELECT * INTO v_caller_member
  FROM session_members
  WHERE session_id = p_session_id AND user_id = v_caller;

  IF v_caller_member.id IS NOT NULL THEN
    IF v_phase IN ('voting', 'allocating', 'debating') AND NOT v_caller_member.attending_in_person THEN
      UPDATE session_members
      SET attending_in_person = true
      WHERE id = v_caller_member.id
      RETURNING * INTO v_caller_member;
    END IF;
    RETURN to_jsonb(v_caller_member);
  END IF;

  IF v_phase = 'closed' THEN
    RETURN jsonb_build_object('error', 'La séance est clôturée : la reconnexion n''est plus possible.');
  END IF;
  IF v_pseudo = '' OR p_code IS NULL OR btrim(p_code) = '' THEN
    RETURN jsonb_build_object('error', 'Nom prénom ET code de rappel requis.');
  END IF;

  v_blocked := reclaim_block_reason(p_session_id, v_pseudo);
  IF v_blocked IS NOT NULL THEN
    RETURN jsonb_build_object('error', v_blocked);
  END IF;

  SELECT * INTO v_target
  FROM session_members
  WHERE session_id = p_session_id AND pseudo_key(pseudo) = pseudo_key(v_pseudo);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Aucune inscription à ce nom pour cette séance.');
  END IF;

  IF v_target.reclaim_code_hash IS NULL
     OR crypt(btrim(p_code), v_target.reclaim_code_hash) IS DISTINCT FROM v_target.reclaim_code_hash
  THEN
    PERFORM record_reclaim_failure(p_session_id, v_pseudo);
    RETURN jsonb_build_object('error', 'Code de rappel invalide.');
  END IF;

  PERFORM clear_reclaim_attempts(p_session_id, v_pseudo);

  UPDATE session_members
  SET user_id = v_caller,
      attending_in_person = CASE
        WHEN v_phase IN ('voting', 'allocating', 'debating') THEN true
        ELSE attending_in_person
      END
  WHERE id = v_target.id
  RETURNING * INTO v_target;

  RETURN to_jsonb(v_target);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reclaim_prevoting_member(p_session_id uuid, p_pseudo text DEFAULT NULL::text, p_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_phase         text;
  v_caller        uuid := auth.uid();
  v_caller_member session_members%ROWTYPE;
  v_target        session_members%ROWTYPE;
  v_pseudo        text := btrim(coalesce(p_pseudo, ''));
  v_blocked       text;
BEGIN
  SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;
  IF v_phase IS NULL THEN
    RAISE EXCEPTION 'Séance introuvable';
  END IF;
  IF v_phase != 'pre_voting' THEN
    RAISE EXCEPTION 'La reconquête d''un profil pré-vote n''est disponible qu''en phase de vote à distance (phase actuelle : %)', v_phase;
  END IF;

  SELECT * INTO v_caller_member
  FROM session_members
  WHERE session_id = p_session_id AND user_id = v_caller;

  IF v_caller_member.id IS NOT NULL THEN
    RETURN to_jsonb(v_caller_member);
  END IF;

  IF v_pseudo = '' OR p_code IS NULL OR btrim(p_code) = '' THEN
    RETURN jsonb_build_object('error', 'Nom prénom ET code de rappel requis.');
  END IF;

  v_blocked := reclaim_block_reason(p_session_id, v_pseudo);
  IF v_blocked IS NOT NULL THEN
    RETURN jsonb_build_object('error', v_blocked);
  END IF;

  SELECT * INTO v_target
  FROM session_members
  WHERE session_id = p_session_id AND pseudo_key(pseudo) = pseudo_key(v_pseudo);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Aucune inscription à ce nom pour cette séance.');
  END IF;

  IF v_target.reclaim_code_hash IS NULL
     OR crypt(btrim(p_code), v_target.reclaim_code_hash) IS DISTINCT FROM v_target.reclaim_code_hash
  THEN
    PERFORM record_reclaim_failure(p_session_id, v_pseudo);
    RETURN jsonb_build_object('error', 'Code de rappel invalide.');
  END IF;

  PERFORM clear_reclaim_attempts(p_session_id, v_pseudo);

  UPDATE session_members
  SET user_id = v_caller
  WHERE id = v_target.id
  RETURNING * INTO v_target;

  RETURN to_jsonb(v_target);
END;
$function$;

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
    WHERE session_id = v_session_id AND pseudo_key(pseudo) = pseudo_key(v_pseudo)
  ) THEN
    RETURN jsonb_build_object(
      'reconnect_required', true,
      'session_id',         v_session_id,
      'pseudo',             v_pseudo
    );
  END IF;

  SELECT user_id INTO v_holder
  FROM participants
  WHERE table_id = p_table_id AND pseudo_key(pseudo) = pseudo_key(v_pseudo)
    AND user_id IS DISTINCT FROM auth.uid()
  LIMIT 1;

  IF v_holder IS NOT NULL THEN
    RAISE EXCEPTION 'Ce nom est déjà pris à cette table. Choisis-en un autre.';
  END IF;

  RETURN jsonb_build_object('pseudo', v_pseudo);
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_table_entry_pseudo(uuid, text) FROM PUBLIC, anon, authenticated;

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
        where session_id = p_session_id and pseudo_key(pseudo) = pseudo_key(p_pseudo)
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

-- Renommer uniquement la casse de son propre nom reste permis (« jules » →
-- « Jules ») : le contrôle « déjà pris » exclut sa propre ligne.
CREATE OR REPLACE FUNCTION public.rename_session_member(p_session_id uuid, p_new_pseudo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_member  session_members%ROWTYPE;
  v_new     text := btrim(p_new_pseudo);
  v_old     text;
BEGIN
  IF v_new = '' THEN
    RETURN jsonb_build_object('error', 'Le nom ne peut pas être vide.');
  END IF;

  SELECT * INTO v_member
  FROM session_members
  WHERE session_id = p_session_id AND user_id = auth.uid();

  IF v_member.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Tu n''es pas inscrit à cette séance.');
  END IF;

  v_old := v_member.pseudo;
  IF v_old = v_new THEN
    RETURN to_jsonb(v_member);
  END IF;

  IF EXISTS (
    SELECT 1 FROM session_members
    WHERE session_id = p_session_id
      AND pseudo_key(pseudo) = pseudo_key(v_new)
      AND id <> v_member.id
  ) THEN
    RETURN jsonb_build_object('error', 'Ce nom est déjà pris dans cette séance.');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM participants p
    JOIN tables t ON t.id = p.table_id
    WHERE t.session_id = p_session_id
      AND p.user_id = auth.uid()
      AND (
        t.current_speaker_id = p.id
        OR EXISTS (SELECT 1 FROM queue_entries qe WHERE qe.participant_id = p.id)
      )
  ) THEN
    RETURN jsonb_build_object(
      'error',
      'Impossible de changer de nom pendant ta prise de parole ou tant que tu es dans la file.'
    );
  END IF;

  UPDATE session_members SET pseudo = v_new WHERE id = v_member.id
  RETURNING * INTO v_member;

  UPDATE participants p
  SET pseudo = v_new
  FROM tables t
  WHERE t.id = p.table_id
    AND t.session_id = p_session_id
    AND p.user_id = auth.uid();

  UPDATE session_sources
  SET pseudo = v_new
  WHERE session_id = p_session_id
    AND user_id = auth.uid();

  DELETE FROM reclaim_attempts WHERE session_id = p_session_id AND pseudo = pseudo_key(v_old);

  RETURN to_jsonb(v_member);
END;
$function$;

CREATE OR REPLACE FUNCTION public.regenerate_reclaim_code_admin(p_password text, p_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_member session_members%ROWTYPE;
  v_code   text;
BEGIN
  PERFORM check_member_admin(p_password, p_member_id);

  SELECT * INTO v_member FROM session_members WHERE id = p_member_id;
  IF v_member.id IS NULL THEN
    RAISE EXCEPTION 'Membre introuvable';
  END IF;

  v_code := gen_member_reclaim_code(v_member.session_id);

  UPDATE session_members
  SET reclaim_code_hash = crypt(v_code, gen_salt('bf'))
  WHERE id = p_member_id;

  DELETE FROM reclaim_attempts
  WHERE session_id = v_member.session_id AND pseudo = pseudo_key(v_member.pseudo);

  RETURN jsonb_build_object('pseudo', v_member.pseudo, 'new_reclaim_code', v_code);
END;
$function$;

CREATE OR REPLACE FUNCTION public.regenerate_reclaim_code_moderator(p_table_id uuid, p_pseudo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_member session_members%ROWTYPE;
  v_code   text;
BEGIN
  IF NOT is_table_moderator(p_table_id) THEN
    RAISE EXCEPTION 'Tu n''animes pas cette table';
  END IF;

  SELECT sm.* INTO v_member
  FROM session_members sm
  JOIN table_assignments ta ON ta.member_id = sm.id
  WHERE ta.table_id = p_table_id
    AND pseudo_key(sm.pseudo) = pseudo_key(p_pseudo);

  IF v_member.id IS NULL THEN
    RAISE EXCEPTION 'Ce participant n''est pas inscrit à cette table';
  END IF;

  v_code := gen_member_reclaim_code(v_member.session_id);

  UPDATE session_members
  SET reclaim_code_hash = crypt(v_code, gen_salt('bf'))
  WHERE id = v_member.id;

  DELETE FROM reclaim_attempts
  WHERE session_id = v_member.session_id AND pseudo = pseudo_key(v_member.pseudo);

  RETURN jsonb_build_object('pseudo', v_member.pseudo, 'new_reclaim_code', v_code);
END;
$function$;

CREATE OR REPLACE FUNCTION public.regenerate_reclaim_code_self(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_member session_members%ROWTYPE;
  v_code   text;
BEGIN
  SELECT * INTO v_member
  FROM session_members
  WHERE session_id = p_session_id
    AND user_id    = auth.uid()
  LIMIT 1;

  IF v_member.id IS NULL THEN
    RAISE EXCEPTION 'Tu n''es pas inscrit à cette séance';
  END IF;

  v_code := gen_member_reclaim_code(v_member.session_id);

  UPDATE session_members
  SET reclaim_code_hash = crypt(v_code, gen_salt('bf'))
  WHERE id = v_member.id;

  DELETE FROM reclaim_attempts
  WHERE session_id = v_member.session_id AND pseudo = pseudo_key(v_member.pseudo);

  RETURN jsonb_build_object('pseudo', v_member.pseudo, 'new_reclaim_code', v_code);
END;
$function$;

-- ── 6. add_offline_participant ───────────────────────────────────────────────
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

  -- Chantier 140b — ne jamais reprendre le siège d'une personne déjà assise
  -- sous ce nom (l'ancien ON CONFLICT … SET user_id le transférait au
  -- modérateur).
  if exists (
    select 1 from participants
    where table_id = p_table_id
      and pseudo_key(pseudo) = pseudo_key(p_pseudo)
      and user_id is distinct from auth.uid()
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
