-- Chantier 167 — scénarios SQL du résumé « qui a changé d'avis ».
-- À exécuter sur la base DEV (execute_sql). Le bloc crée sa propre séance
-- jetable, fait voter 4 membres par de VRAIS appels à cast_vote (l'identité est
-- simulée par request.jwt.claims), puis se termine par une exception volontaire
-- qui ANNULE tout. Un échec lève 'ECHEC : …' ; la réussite lève
-- 'OK : <n> scénarios passés (annulés)'.
DO $$
DECLARE
  s   uuid;
  u_a uuid := gen_random_uuid(); u_b uuid := gen_random_uuid();
  u_c uuid := gen_random_uuid(); u_d uuid := gen_random_uuid();
  m_a uuid; m_b uuid; m_c uuid; m_d uuid;
  x uuid; y uuid; z uuid;
  r jsonb;
  n int := 0;
  fx jsonb;
BEGIN
  INSERT INTO sessions (title, phase) VALUES ('T167 jetable', 'voting') RETURNING id INTO s;
  INSERT INTO session_members (session_id, user_id, pseudo, attending_in_person) VALUES
    (s, u_a, 'T167 A', true), (s, u_b, 'T167 B', true), (s, u_c, 'T167 C', true), (s, u_d, 'T167 D', false);
  SELECT id INTO m_a FROM session_members WHERE session_id = s AND user_id = u_a;
  SELECT id INTO m_b FROM session_members WHERE session_id = s AND user_id = u_b;
  SELECT id INTO m_c FROM session_members WHERE session_id = s AND user_id = u_c;
  SELECT id INTO m_d FROM session_members WHERE session_id = s AND user_id = u_d;
  INSERT INTO assertions (session_id, content, status) VALUES (s, 'T167 X', 'approved') RETURNING id INTO x;
  INSERT INTO assertions (session_id, content, status) VALUES (s, 'T167 Y', 'approved') RETURNING id INTO y;
  INSERT INTO assertions (session_id, content, status) VALUES (s, 'T167 Z', 'approved') RETURNING id INTO z;

  -- Avant le débat (phase voting).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  PERFORM cast_vote(x, 'agree'); PERFORM cast_vote(y, 'agree'); PERFORM cast_vote(z, 'pass');
  -- A change d'avis AVANT le débat sur Z : ne doit pas compter comme changement post-débat.
  PERFORM cast_vote(z, 'agree');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, true);
  PERFORM cast_vote(x, 'agree'); PERFORM cast_vote(y, 'disagree');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_c, 'role', 'authenticated')::text, true);
  PERFORM cast_vote(x, 'disagree');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_d, 'role', 'authenticated')::text, true);
  PERFORM cast_vote(x, 'agree');

  -- Le débat est fini : post-vote.
  UPDATE sessions SET phase = 'post_voting' WHERE id = s;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  PERFORM cast_vote(x, 'disagree');   -- A change X : agree -> disagree
  PERFORM cast_vote(y, 'agree');      -- A reclique le même vote Y : aucun changement
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, true);
  PERFORM cast_vote(x, 'disagree');   -- B change X puis revient : au final inchangé
  PERFORM cast_vote(x, 'agree');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_c, 'role', 'authenticated')::text, true);
  PERFORM cast_vote(z, 'disagree');   -- C vote Z pour la première fois en post-vote : pas d'« avant »

  r := vote_changes_summary(s, false);

  -- 1. Membres ayant un « avant » : A, B, C, D.
  IF (r->>'members_before')::int <> 4 THEN RAISE EXCEPTION 'ECHEC : members_before % attendu 4', r->>'members_before'; END IF; n := n + 1;
  -- 2. Seul A a changé d'avis (B est revenu à son vote, le changement de Z de A est d'avant-débat).
  IF (r->>'members_changed')::int <> 1 THEN RAISE EXCEPTION 'ECHEC : members_changed % attendu 1', r->>'members_changed'; END IF; n := n + 1;
  -- 3. Paires avant : A:3 (X,Y,Z) B:2 C:1 D:1 = 7 ; une seule a changé.
  IF (r->>'pairs_total')::int <> 7 THEN RAISE EXCEPTION 'ECHEC : pairs_total % attendu 7', r->>'pairs_total'; END IF; n := n + 1;
  IF (r->>'pairs_changed')::int <> 1 THEN RAISE EXCEPTION 'ECHEC : pairs_changed % attendu 1', r->>'pairs_changed'; END IF; n := n + 1;
  -- 4. Le vote de C sur Z est nouveau, il n'a pas d'« avant ».
  IF (r->>'new_votes')::int <> 1 OR (r->>'new_voters')::int <> 1 THEN RAISE EXCEPTION 'ECHEC : new_votes/new_voters %', r; END IF; n := n + 1;
  -- 5. Transition unique agree -> disagree.
  IF jsonb_array_length(r->'transitions') <> 1
     OR r->'transitions'->0->>'from' <> 'agree' OR r->'transitions'->0->>'to' <> 'disagree'
     OR (r->'transitions'->0->>'count')::int <> 1 THEN RAISE EXCEPTION 'ECHEC : transitions %', r->'transitions'; END IF; n := n + 1;
  -- 6. Par assertion : seule X a bougé ; avant 3 d'accord / 1 pas d'accord, après 2 / 2.
  IF jsonb_array_length(r->'assertions') <> 1 THEN RAISE EXCEPTION 'ECHEC : assertions %', r->'assertions'; END IF; n := n + 1;
  fx := r->'assertions'->0;
  IF (fx->>'assertion_id')::uuid <> x OR (fx->>'changed')::int <> 1
     OR (fx->>'before_agree')::int <> 3 OR (fx->>'before_disagree')::int <> 1
     OR (fx->>'after_agree')::int <> 2 OR (fx->>'after_disagree')::int <> 2 THEN RAISE EXCEPTION 'ECHEC : assertion X %', fx; END IF; n := n + 1;
  -- 7. Filtre « présents en personne » : D (distanciel) disparaît.
  r := vote_changes_summary(s, true);
  IF (r->>'members_before')::int <> 3 THEN RAISE EXCEPTION 'ECHEC : attending_only members_before % attendu 3', r->>'members_before'; END IF; n := n + 1;
  -- 8. Séance sans aucun vote : zéros et tableaux vides, pas de NULL.
  r := vote_changes_summary(gen_random_uuid(), false);
  IF (r->>'members_changed')::int <> 0 OR r->'transitions' <> '[]'::jsonb OR r->'assertions' <> '[]'::jsonb THEN RAISE EXCEPTION 'ECHEC : séance vide %', r; END IF; n := n + 1;
  -- 9. Le calcul interne n'est pas appelable depuis l'extérieur.
  IF has_function_privilege('anon', 'vote_changes_summary(uuid, boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'vote_changes_summary(uuid, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ECHEC : vote_changes_summary appelable depuis anon/authenticated';
  END IF; n := n + 1;

  RAISE EXCEPTION 'OK : % scénarios passés (annulés)', n;
END $$;
