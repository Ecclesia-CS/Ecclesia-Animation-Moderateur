-- Chantier 103 — Sécurité : ne plus faire confiance au user_id reçu en paramètre
--
-- leave_other_session_tables et sync_table_assignment prenaient le user_id de leur
-- cible en paramètre au lieu de lire auth.uid(). Tant que c'était le cas, la
-- fermeture du chantier 102 (REVOKE EXECUTE FROM public) ne tenait que par ce grant :
-- s'il se défaisait un jour (ça s'est déjà produit sans laisser de trace, voir le
-- chantier 105 sur assertions.member_id), un appel direct avec un user_id arbitraire
-- rouvrirait l'éjection/déplacement à distance d'un participant.
--
-- Vérifié sur les définitions courantes en base (pg_get_functiondef, jamais les
-- anciens fichiers de migration) : les quatre appelants — join_table, switch_table,
-- create_table, claim_table_as_moderator — passent déjà auth.uid() comme dernier
-- argument. Le changement est donc neutre fonctionnellement.
--
-- Changer le nombre de paramètres change la signature : DROP + CREATE nécessaires
-- pour les deux fonctions modifiées, et les quatre appelants doivent être recréés
-- dans la même migration pour appeler la nouvelle signature.

drop function if exists public.leave_other_session_tables(uuid, uuid, uuid);

create function public.leave_other_session_tables(p_session_id uuid, p_new_table_id uuid)
returns void
language plpgsql
security definer
as $function$
DECLARE
  v_old_table_id        uuid;
  v_is_moderator        boolean;
  v_prev_assigned_table uuid;
BEGIN
  IF p_session_id IS NULL THEN
    RETURN;
  END IF;

  SELECT sm.is_moderator, ta.table_id
  INTO v_is_moderator, v_prev_assigned_table
  FROM session_members sm
  LEFT JOIN table_assignments ta
    ON  ta.session_id = sm.session_id
    AND ta.member_id  = sm.id
  WHERE sm.session_id = p_session_id
    AND sm.user_id    = auth.uid();

  FOR v_old_table_id IN
    SELECT DISTINCT p.table_id
    FROM participants p
    JOIN tables t ON t.id = p.table_id
    WHERE p.user_id = auth.uid()
      AND t.session_id = p_session_id
      AND p.table_id IS DISTINCT FROM p_new_table_id
  LOOP
    UPDATE tables
    SET current_speaker_id = NULL, current_turn_started_at = NULL
    WHERE id = v_old_table_id
      AND current_speaker_id IN (
        SELECT id FROM participants WHERE table_id = v_old_table_id AND user_id = auth.uid()
      );

    UPDATE speaking_turns
    SET ended_at = now()
    WHERE table_id = v_old_table_id
      AND participant_id IN (
        SELECT id FROM participants WHERE table_id = v_old_table_id AND user_id = auth.uid()
      )
      AND ended_at IS NULL;

    DELETE FROM participants WHERE table_id = v_old_table_id AND user_id = auth.uid();
  END LOOP;

  IF v_is_moderator
     AND v_prev_assigned_table IS NOT NULL
     AND v_prev_assigned_table IS DISTINCT FROM p_new_table_id
  THEN
    UPDATE tables
    SET leaderless = true
    WHERE id = v_prev_assigned_table
      AND leaderless_by_design = true;
  END IF;
END;
$function$;

-- Ce projet a des privilèges par défaut (ALTER DEFAULT PRIVILEGES IN SCHEMA public)
-- qui accordent EXECUTE directement à anon/authenticated sur toute fonction nouvelle
-- — pas seulement via PUBLIC. Un DROP+CREATE fait donc regagner ce privilège à la
-- création : revoke both public and the two roles explicitly, sinon la fonction
-- rouvre exactement le trou que ce chantier ferme.
revoke execute on function public.leave_other_session_tables(uuid, uuid) from public, anon, authenticated;

drop function if exists public.sync_table_assignment(uuid, uuid, uuid, text);

create function public.sync_table_assignment(p_session_id uuid, p_table_id uuid, p_pseudo text)
returns void
language plpgsql
security definer
as $function$
DECLARE
  v_phase        text;
  v_member_id    uuid;
  v_table_number int;
BEGIN
  IF p_session_id IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;

    SELECT id INTO v_member_id
    FROM session_members
    WHERE session_id = p_session_id AND user_id = auth.uid();

    IF v_member_id IS NULL THEN
      INSERT INTO session_members (session_id, user_id, pseudo, joined_phase, attending_in_person)
      VALUES (p_session_id, auth.uid(), p_pseudo, COALESCE(v_phase, 'debating'), true)
      RETURNING id INTO v_member_id;
    END IF;

    SELECT table_number INTO v_table_number
    FROM tables
    WHERE id = p_table_id;

    IF v_table_number IS NULL THEN
      SELECT table_number INTO v_table_number
      FROM table_assignments
      WHERE session_id = p_session_id AND table_id = p_table_id
      LIMIT 1;
    END IF;

    IF v_table_number IS NULL THEN
      SELECT COALESCE(MAX(table_number), 0) + 1 INTO v_table_number
      FROM table_assignments
      WHERE session_id = p_session_id;
    END IF;

    UPDATE tables
    SET table_number = v_table_number
    WHERE id = p_table_id
      AND session_id = p_session_id
      AND table_number IS NULL;

    INSERT INTO table_assignments (session_id, member_id, table_number, table_id)
    VALUES (p_session_id, v_member_id, v_table_number, p_table_id)
    ON CONFLICT (session_id, member_id)
    DO UPDATE SET table_number = EXCLUDED.table_number, table_id = EXCLUDED.table_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_table_assignment: échec pour session=%, user=%, pseudo=%, table=% — %',
      p_session_id, auth.uid(), p_pseudo, p_table_id, SQLERRM;
  END;
END;
$function$;

revoke execute on function public.sync_table_assignment(uuid, uuid, text) from public, anon, authenticated;

-- Les quatre appelants gardent leur propre signature (inchangée) : CREATE OR REPLACE
-- suffit, il ne reste qu'à adapter leurs appels aux deux fonctions ci-dessus (un
-- paramètre en moins chacune). Corps repris de pg_get_functiondef en base.

create or replace function public.join_table(p_join_code text, p_pseudo text)
returns jsonb
language plpgsql
security definer
as $function$
DECLARE
  v_table_id       uuid;
  v_session_id     uuid;
  v_participant_id uuid;
  v_result         jsonb;
BEGIN
  SELECT id, session_id INTO v_table_id, v_session_id
  FROM tables WHERE join_code = upper(p_join_code);
  IF v_table_id IS NULL THEN
    RAISE EXCEPTION 'Session introuvable';
  END IF;

  PERFORM leave_other_session_tables(v_session_id, v_table_id);

  INSERT INTO participants (table_id, user_id, pseudo)
  VALUES (v_table_id, auth.uid(), p_pseudo)
  ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
  RETURNING id INTO v_participant_id;

  PERFORM sync_table_assignment(v_session_id, v_table_id, p_pseudo);

  SELECT jsonb_build_object(
    'id',                      s.id,
    'join_code',               s.join_code,
    'created_by',              s.created_by,
    'current_speaker_id',      s.current_speaker_id,
    'current_turn_started_at', s.current_turn_started_at,
    'created_at',              s.created_at,
    'participant_id',          v_participant_id
  ) INTO v_result
  FROM tables s WHERE s.id = v_table_id;

  RETURN v_result;
END;
$function$;

create or replace function public.switch_table(p_session_id uuid, p_join_code text, p_pseudo text)
returns jsonb
language plpgsql
security definer
as $function$
DECLARE
  v_table_id       uuid;
  v_table_session  uuid;
  v_participant_id uuid;
  v_result         jsonb;
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'Séance requise.';
  END IF;

  SELECT id, session_id INTO v_table_id, v_table_session
  FROM tables WHERE join_code = upper(p_join_code);

  IF v_table_id IS NULL THEN
    RAISE EXCEPTION 'Aucune table ne correspond à ce code.';
  END IF;

  IF v_table_session IS DISTINCT FROM p_session_id THEN
    RAISE EXCEPTION 'Ce code correspond à une table d''une autre séance.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM participants WHERE table_id = v_table_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Tu es déjà à cette table.';
  END IF;

  PERFORM leave_other_session_tables(p_session_id, v_table_id);

  INSERT INTO participants (table_id, user_id, pseudo)
  VALUES (v_table_id, auth.uid(), p_pseudo)
  ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
  RETURNING id INTO v_participant_id;

  PERFORM sync_table_assignment(p_session_id, v_table_id, p_pseudo);

  SELECT jsonb_build_object(
    'id',                      s.id,
    'join_code',               s.join_code,
    'created_by',              s.created_by,
    'current_speaker_id',      s.current_speaker_id,
    'current_turn_started_at', s.current_turn_started_at,
    'created_at',              s.created_at,
    'participant_id',          v_participant_id
  ) INTO v_result
  FROM tables s WHERE s.id = v_table_id;

  RETURN v_result;
END;
$function$;

create or replace function public.create_table(p_pseudo text, p_creation_code text, p_session_id uuid default null::uuid, p_leaderless boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
DECLARE
  v_hash           text;
  v_join_code      text;
  v_table_id       uuid;
  v_participant_id uuid;
  v_result         jsonb;
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'session_required';
  END IF;

  IF NOT p_leaderless THEN
    SELECT value INTO v_hash FROM app_config WHERE key = 'creation_code_hash';
    IF crypt(p_creation_code, v_hash) IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'Code de création invalide';
    END IF;
  END IF;

  LOOP
    v_join_code := upper(encode(gen_random_bytes(3), 'hex'));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM tables WHERE join_code = v_join_code);
  END LOOP;

  INSERT INTO tables (join_code, created_by, session_id, leaderless, leaderless_by_design)
  VALUES (v_join_code, auth.uid(), p_session_id, p_leaderless, p_leaderless)
  RETURNING id INTO v_table_id;

  INSERT INTO participants (table_id, user_id, pseudo)
  VALUES (v_table_id, auth.uid(), p_pseudo)
  RETURNING id INTO v_participant_id;

  PERFORM sync_table_assignment(p_session_id, v_table_id, p_pseudo);

  SELECT jsonb_build_object(
    'id',                      s.id,
    'join_code',               s.join_code,
    'created_by',              s.created_by,
    'current_speaker_id',      s.current_speaker_id,
    'current_turn_started_at', s.current_turn_started_at,
    'created_at',              s.created_at,
    'session_id',              s.session_id,
    'leaderless',              s.leaderless,
    'participant_id',          v_participant_id
  ) INTO v_result
  FROM tables s WHERE s.id = v_table_id;

  RETURN v_result;
END;
$function$;

create or replace function public.claim_table_as_moderator(p_join_code text, p_creation_code text, p_pseudo text, p_session_id uuid default null::uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
DECLARE
  v_hash           text;
  v_table          tables%ROWTYPE;
  v_participant_id uuid;
  v_result         jsonb;
BEGIN
  SELECT value INTO v_hash FROM app_config WHERE key = 'creation_code_hash';
  IF v_hash IS NULL OR crypt(p_creation_code, v_hash) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'Code Ecclesia incorrect';
  END IF;

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

  IF table_has_moderator(v_table.id)
     AND NOT table_moderator_is(v_table.id, p_pseudo) THEN
    RAISE EXCEPTION 'Cette table a déjà un modérateur — choisis-en une autre ou contacte le superadmin';
  END IF;

  UPDATE tables
  SET created_by = auth.uid(),
      leaderless = false
  WHERE id = v_table.id;

  PERFORM leave_other_session_tables(v_table.session_id, v_table.id);

  INSERT INTO participants (table_id, user_id, pseudo)
  VALUES (v_table.id, auth.uid(), btrim(p_pseudo))
  ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
  RETURNING id INTO v_participant_id;

  SELECT jsonb_build_object(
    'id',                      s.id,
    'join_code',               s.join_code,
    'created_by',              s.created_by,
    'current_speaker_id',      s.current_speaker_id,
    'current_turn_started_at', s.current_turn_started_at,
    'created_at',              s.created_at,
    'participant_id',          v_participant_id
  ) INTO v_result
  FROM tables s WHERE s.id = v_table.id;

  RETURN v_result;
END;
$function$;
