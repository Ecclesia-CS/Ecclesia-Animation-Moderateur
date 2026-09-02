-- Chantier 61 — Inscription (et donc vote) encore possibles en phase `allocating`.
--
-- Demande produit de Jules : le jour de la séance, des gens arrivent en
-- retard, pendant que l'organisateur calcule la répartition des tables.
-- Aujourd'hui `register_session_member` refuse toute phase hors
-- (draft, pre_voting, voting) : le retardataire reçoit
-- « La séance n'est pas en phase d'inscription (phase: allocating) »
-- en rouge, sans aucune issue.
--
-- Ce que ce fichier change, et ce qu'il ne change PAS :
--   * `allocating` rejoint la liste des phases d'inscription.
--   * `attending_in_person` reste calculé par `v_phase != 'pre_voting'`,
--     donc `true` en `allocating` : quelqu'un qui s'inscrit pendant que
--     les tables se forment est nécessairement sur place. Aucune ligne à
--     changer pour ça — c'est déjà la règle en `voting`.
--   * `reclaim_code` reste réservé à `pre_voting` (le code de rappel ne
--     sert qu'à retrouver une inscription faite à distance).
--   * `joined_phase` vaudra donc 'allocating' pour ces membres —
--     nouvelle valeur possible dans cette colonne, elle est libre (text,
--     sans CHECK).
--   * `cast_vote`, `submit_assertion` et `submit_entry_response` ne
--     testent AUCUNE phase (vérifié : ils n'exigent qu'une ligne
--     `session_members`). Le vote pendant l'allocation fonctionne donc
--     déjà côté serveur — seul le chemin d'entrée bloquait.
--   * `confirm_attendance` ne teste aucune phase non plus : la reconquête
--     par nom ou par code marchait déjà en `allocating`, c'est l'UI qui
--     ne montait pas le formulaire (corrigé côté React).
--
-- Conséquence connue, hors périmètre : un membre inscrit APRÈS
-- `apply_allocation` n'a pas de ligne `table_assignments` et reste sur
-- « Formation des groupes en cours… ». C'est l'objet du chantier 62
-- (saisie manuelle d'un code de table). Les deux doivent être livrés
-- ensemble.
--
-- ── Piège Postgres (cf. CLAUDE.md) ───────────────────────────────────
-- Signature ciblée, à vérifier avant application :
--   SELECT p.oid::regprocedure,
--          pg_get_function_identity_arguments(p.oid),
--          pg_get_function_result(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'register_session_member';
--
-- Attendu : `register_session_member(uuid, text, text)` → `jsonb`.
-- Le CREATE OR REPLACE ci-dessous conserve à l'identique le nom des
-- paramètres (p_session_id, p_pseudo, p_reclaim_code), leur ordre, leur
-- type, la valeur par défaut, le type de retour (jsonb), le langage et
-- SECURITY DEFINER — aucun DROP nécessaire pour cette signature-là.
--
-- En revanche la surcharge historique à 2 arguments,
-- `register_session_member(uuid, text)` (migrations 20260528_voting_app
-- et 20260531_superadmin_features), n'a jamais été supprimée : la version
-- à 3 arguments de 20260622 l'a doublée au lieu de la remplacer. Elle est
-- morte du point de vue de l'app (le wrapper `registerSessionMember` de
-- src/lib/voting.ts envoie TOUJOURS les 3 paramètres nommés, PostgREST
-- résout donc sur la 3-aire), mais elle porte encore un garde de phase
-- périmé qui ignore jusqu'à `pre_voting` : n'importe quel appel à 2
-- paramètres nommés retomberait dessus et rejouerait le bug corrigé ici.
-- On la supprime. Si elle n'existe pas, le DROP ne fait rien.
DROP FUNCTION IF EXISTS register_session_member(uuid, text);

CREATE OR REPLACE FUNCTION register_session_member(
  p_session_id   uuid,
  p_pseudo       text,
  p_reclaim_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_phase     text;
  v_member    session_members%ROWTYPE;
  v_attending boolean;
BEGIN
  SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;
  -- Chantier 61 : 'allocating' ajouté. Restent exclues 'debating'
  -- (l'inscription passe alors par join_table → sync_table_assignment,
  -- qui crée le membre lui-même) et 'closed' (séance terminée).
  IF v_phase NOT IN ('draft', 'pre_voting', 'voting', 'allocating') THEN
    RAISE EXCEPTION 'La séance n''est pas en phase d''inscription (phase: %)', v_phase;
  END IF;

  v_attending := v_phase != 'pre_voting';

  BEGIN
    INSERT INTO session_members(session_id, user_id, pseudo, joined_phase, attending_in_person, reclaim_code)
    VALUES (p_session_id, auth.uid(), p_pseudo, v_phase, v_attending,
            CASE WHEN v_phase = 'pre_voting' THEN p_reclaim_code ELSE NULL END)
    ON CONFLICT (session_id, user_id) DO UPDATE SET pseudo = session_members.pseudo
    RETURNING * INTO v_member;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Pseudo déjà pris';
  END;

  RETURN to_jsonb(v_member);
END;
$$;

GRANT EXECUTE ON FUNCTION register_session_member(uuid, text, text) TO anon, authenticated;

-- ── Vérification après application ───────────────────────────────────
-- Sur une séance en phase 'allocating', depuis une session anonyme :
--   SELECT register_session_member('<session_id>', 'Test Retardataire');
-- Attendu : un objet JSON avec joined_phase = 'allocating' et
-- attending_in_person = true.
--
-- ── SQL D'ANNULATION (revenir au comportement d'avant le chantier 61) ─
-- Ne restaure PAS la surcharge à 2 arguments supprimée ci-dessus : elle
-- était inatteignable depuis l'app et son garde de phase était périmé.
-- Si elle devait vraiment revenir, son corps exact est dans
-- supabase/migrations/20260531_superadmin_features.sql.
--
-- CREATE OR REPLACE FUNCTION register_session_member(
--   p_session_id   uuid,
--   p_pseudo       text,
--   p_reclaim_code text DEFAULT NULL
-- )
-- RETURNS jsonb
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- AS $$
-- DECLARE
--   v_phase     text;
--   v_member    session_members%ROWTYPE;
--   v_attending boolean;
-- BEGIN
--   SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;
--   IF v_phase NOT IN ('draft', 'pre_voting', 'voting') THEN
--     RAISE EXCEPTION 'La séance n''est pas en phase d''inscription (phase: %)', v_phase;
--   END IF;
--
--   v_attending := v_phase != 'pre_voting';
--
--   BEGIN
--     INSERT INTO session_members(session_id, user_id, pseudo, joined_phase, attending_in_person, reclaim_code)
--     VALUES (p_session_id, auth.uid(), p_pseudo, v_phase, v_attending,
--             CASE WHEN v_phase = 'pre_voting' THEN p_reclaim_code ELSE NULL END)
--     ON CONFLICT (session_id, user_id) DO UPDATE SET pseudo = session_members.pseudo
--     RETURNING * INTO v_member;
--   EXCEPTION WHEN unique_violation THEN
--     RAISE EXCEPTION 'Pseudo déjà pris';
--   END;
--
--   RETURN to_jsonb(v_member);
-- END;
-- $$;
