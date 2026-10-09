-- Chantier 165 — scénarios SQL des binômes / trios (noms à venir, trio plein,
-- demandes reçues, modérateurs). À exécuter sur la base DEV (execute_sql) : le
-- bloc crée ses propres membres de test dans une séance existante passée en
-- 'voting', vérifie chaque scénario, puis se termine par une exception
-- volontaire qui ANNULE tout (aucune trace). Un échec lève 'ECHEC : …' ; la
-- réussite lève 'OK : <n> scénarios passés (annulés)'.
DO $$
DECLARE
  s   uuid := 'f0b295a9-13ed-4015-b3ed-ba3c9a671095';  -- « QA Vérifs — Complète » (dev)
  u_a uuid := gen_random_uuid(); u_b uuid := gen_random_uuid(); u_c uuid := gen_random_uuid();
  u_d uuid := gen_random_uuid(); u_e uuid := gen_random_uuid(); u_f uuid := gen_random_uuid();
  u_g uuid := gen_random_uuid(); u_h uuid := gen_random_uuid(); u_x uuid := gen_random_uuid();
  m_a uuid; m_b uuid; m_c uuid; m_d uuid; m_e uuid; m_f uuid; m_g uuid; m_h uuid; m_x uuid;
  r jsonb;
  n int := 0;
BEGIN
  UPDATE sessions SET phase = 'voting' WHERE id = s;

  INSERT INTO session_members (session_id, user_id, pseudo, attending_in_person) VALUES
    (s, u_a, 'T165 Alice',  true), (s, u_b, 'T165 Bruno', true), (s, u_c, 'T165 Chloé', true),
    (s, u_d, 'T165 David',  true), (s, u_e, 'T165 Emma',  true), (s, u_f, 'T165 Felix', true),
    (s, u_g, 'T165 Gaëlle', true), (s, u_h, 'T165 Hugo',  true);
  SELECT id INTO m_a FROM session_members WHERE session_id = s AND user_id = u_a;
  SELECT id INTO m_b FROM session_members WHERE session_id = s AND user_id = u_b;
  SELECT id INTO m_c FROM session_members WHERE session_id = s AND user_id = u_c;
  SELECT id INTO m_d FROM session_members WHERE session_id = s AND user_id = u_d;
  SELECT id INTO m_e FROM session_members WHERE session_id = s AND user_id = u_e;
  SELECT id INTO m_f FROM session_members WHERE session_id = s AND user_id = u_f;
  SELECT id INTO m_g FROM session_members WHERE session_id = s AND user_id = u_g;
  SELECT id INTO m_h FROM session_members WHERE session_id = s AND user_id = u_h;
  -- Hugo est modérateur : un modérateur est un membre comme un autre pour les binômes.
  UPDATE session_members SET is_moderator = true WHERE id = m_h;

  -- 1. Nom qui n'existe pas : gardé, signalé « introuvable », pas de lien.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  r := set_my_pairings(s, ARRAY['T165 Xavier']);
  IF NOT ((r->'results'->0->>'found')::boolean = false AND (r->'results'->0->>'saved')::boolean = true) THEN
    RAISE EXCEPTION 'ECHEC 1 : nom inconnu non gardé (%)', r; END IF;
  r := get_my_pairings(s);
  IF NOT ((r->0->>'found')::boolean = false AND r->0->>'pseudo' = 'T165 Xavier') THEN
    RAISE EXCEPTION 'ECHEC 1b : get_my_pairings ne restitue pas le nom à venir (%)', r; END IF;
  n := n + 1;

  -- 2. Xavier s'inscrit (casse et espaces différents) : le choix d'Alice se lie à lui.
  -- (chantier 165b : casse, espaces de bord et espaces multiples ne comptent pas)
  INSERT INTO session_members (session_id, user_id, pseudo, attending_in_person)
  VALUES (s, u_x, ' t165   XAVIER ', true);
  SELECT id INTO m_x FROM session_members WHERE session_id = s AND user_id = u_x;
  IF NOT EXISTS (SELECT 1 FROM member_pairings WHERE member_id = m_a AND target_member_id = m_x) THEN
    RAISE EXCEPTION 'ECHEC 2 : le nom à venir ne s''est pas lié à l''arrivée'; END IF;
  n := n + 1;

  -- 3. Xavier voit la demande d'Alice (notification) ; ce n'est pas encore réciproque.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_x, 'role', 'authenticated')::text, true);
  r := get_pairing_requests(s);
  IF NOT (jsonb_array_length(r) = 1 AND r->0->>'pseudo' = 'T165 Alice') THEN
    RAISE EXCEPTION 'ECHEC 3 : Xavier devrait voir la demande d''Alice (%)', r; END IF;
  n := n + 1;

  -- 4. Xavier cite Alice en retour : lien réciproque, la demande disparaît.
  r := set_my_pairings(s, ARRAY['T165 Alice']);
  IF NOT (r->'results'->0->>'reciprocal')::boolean THEN
    RAISE EXCEPTION 'ECHEC 4 : lien non réciproque (%)', r; END IF;
  IF jsonb_array_length(get_pairing_requests(s)) <> 0 THEN
    RAISE EXCEPTION 'ECHEC 4b : la demande devrait avoir disparu'; END IF;
  n := n + 1;

  -- 5. Deux liens qui partagent une personne = trio d'office.
  --    Alice a cité Xavier (réciproque) ; Alice cite aussi Bruno, Bruno la cite.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  r := set_my_pairings(s, ARRAY['T165 Xavier', 'T165 Bruno']);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, true);
  r := set_my_pairings(s, ARRAY['T165 Alice']);
  IF cardinality(pairing_cluster_ids(m_a)) <> 3 THEN
    RAISE EXCEPTION 'ECHEC 5 : trio attendu {Alice, Xavier, Bruno}, obtenu %', cardinality(pairing_cluster_ids(m_a)); END IF;
  n := n + 1;

  -- 6. Quelqu'un veut se rajouter au trio complet : refusé, rien d'enregistré.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_d, 'role', 'authenticated')::text, true);
  r := set_my_pairings(s, ARRAY['T165 Alice']);
  IF NOT (r->'results'->0->>'refused' = 'target_full' AND (r->'results'->0->>'saved')::boolean = false) THEN
    RAISE EXCEPTION 'ECHEC 6 : David aurait dû être refusé (%)', r; END IF;
  IF EXISTS (SELECT 1 FROM member_pairings WHERE member_id = m_d) THEN
    RAISE EXCEPTION 'ECHEC 6b : un choix refusé ne doit pas être enregistré'; END IF;
  -- … quel que soit le membre du trio visé.
  r := set_my_pairings(s, ARRAY['T165 Bruno']);
  IF NOT (r->'results'->0->>'refused' = 'target_full') THEN
    RAISE EXCEPTION 'ECHEC 6c : refus attendu aussi en visant un autre membre du trio (%)', r; END IF;
  n := n + 1;

  -- 7. Deux duos ne fusionnent pas en un groupe de 4.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_e, 'role', 'authenticated')::text, true);
  PERFORM set_my_pairings(s, ARRAY['T165 Felix']);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_f, 'role', 'authenticated')::text, true);
  PERFORM set_my_pairings(s, ARRAY['T165 Emma']);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_g, 'role', 'authenticated')::text, true);
  PERFORM set_my_pairings(s, ARRAY['T165 Hugo']);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_h, 'role', 'authenticated')::text, true);
  r := set_my_pairings(s, ARRAY['T165 Gaëlle']);          -- Hugo (modérateur) + Gaëlle = duo
  IF NOT (r->'results'->0->>'reciprocal')::boolean THEN
    RAISE EXCEPTION 'ECHEC 7a : un modérateur doit pouvoir s''apparier (%)', r; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_e, 'role', 'authenticated')::text, true);
  r := set_my_pairings(s, ARRAY['T165 Gaëlle']);          -- duo {Emma,Felix} + duo {Gaëlle,Hugo} = 4
  IF NOT (r->'results'->0->>'refused' = 'too_big') THEN
    RAISE EXCEPTION 'ECHEC 7b : fusion de deux duos à refuser (%)', r; END IF;
  n := n + 1;

  -- 8. Un duo peut accueillir une troisième personne seule (3 = autorisé).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_d, 'role', 'authenticated')::text, true);
  r := set_my_pairings(s, ARRAY['T165 Emma']);
  IF (r->'results'->0->>'saved')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'ECHEC 8 : David seul peut rejoindre le duo Emma/Felix (%)', r; END IF;
  n := n + 1;

  -- 9. Se citer soi-même est refusé ; un nom saisi deux fois ne compte qu'une fois.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_c, 'role', 'authenticated')::text, true);
  r := set_my_pairings(s, ARRAY['T165 Chloé', 't165 chloé', 'T165 Zoé', ' t165   zoé ']);
  IF NOT (r->'results'->0->>'refused' = 'self' AND jsonb_array_length(r->'results') = 2) THEN
    RAISE EXCEPTION 'ECHEC 9 : self / doublon mal traités (%)', r; END IF;
  n := n + 1;

  -- 10. Remplacer ses choix efface les anciens (y compris les noms à venir).
  r := set_my_pairings(s, ARRAY[]::text[]);
  IF EXISTS (SELECT 1 FROM member_pairings WHERE member_id = m_c) THEN
    RAISE EXCEPTION 'ECHEC 10 : choix non effacés'; END IF;
  n := n + 1;

  -- 11. Demande reçue mais irréalisable (groupe trop gros) : pas de notification.
  --     Hugo/Gaëlle sont un duo ; Alice (trio) cite Gaëlle ? refusé déjà à la saisie,
  --     donc on vérifie le cas de la demande ANTÉRIEURE : Chloé cite David (seul),
  --     puis David rejoint le duo Emma/Felix (trio) — Chloé ne peut plus être jointe.
  -- (l'appel refusé d'Emma au scénario 7 a REMPLACÉ ses choix : on les refait)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_e, 'role', 'authenticated')::text, true);
  PERFORM set_my_pairings(s, ARRAY['T165 Felix']);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_c, 'role', 'authenticated')::text, true);
  PERFORM set_my_pairings(s, ARRAY['T165 David']);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_f, 'role', 'authenticated')::text, true);
  PERFORM set_my_pairings(s, ARRAY['T165 Emma', 'T165 David']);   -- Felix cite aussi David
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_d, 'role', 'authenticated')::text, true);
  PERFORM set_my_pairings(s, ARRAY['T165 Emma', 'T165 Felix']);   -- trio {David, Emma, Felix}
  IF jsonb_array_length(get_pairing_requests(s)) <> 0 THEN
    RAISE EXCEPTION 'ECHEC 11 : David est dans un trio complet, la demande de Chloé ne doit plus être proposée (%)', get_pairing_requests(s); END IF;
  r := get_my_pairings(s);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_c, 'role', 'authenticated')::text, true);
  r := get_my_pairings(s);
  IF NOT (r->0->>'blocked')::boolean THEN
    RAISE EXCEPTION 'ECHEC 11b : Chloé devrait voir son choix « bloqué » (%)', r; END IF;
  n := n + 1;

  -- 12. Hors phase 'voting' : aucune déclaration, aucune demande.
  UPDATE sessions SET phase = 'allocating' WHERE id = s;
  BEGIN
    PERFORM set_my_pairings(s, ARRAY['T165 Bruno']);
    RAISE EXCEPTION 'ECHEC 12 : déclaration acceptée hors phase voting';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'ECHEC%' THEN RAISE; END IF;
  END;
  IF jsonb_array_length(get_pairing_requests(s)) <> 0 THEN
    RAISE EXCEPTION 'ECHEC 12b : demandes à renvoyer vides hors voting'; END IF;
  n := n + 1;

  RAISE EXCEPTION 'OK : % scénarios passés (annulés)', n;
END $$;
