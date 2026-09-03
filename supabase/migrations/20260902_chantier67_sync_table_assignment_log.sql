-- Chantier 67 (point 3) — sync_table_assignment avale ses erreurs
--
-- Symptôme : `sync_table_assignment` (20260727_6_chantier26_sync_table_assignments.sql)
-- attrape TOUTE exception avec `EXCEPTION WHEN OTHERS THEN NULL;` — y compris
-- le cas décrit dans son propre commentaire d'origine (« un pseudo déjà pris
-- par un autre membre de la séance »/`UNIQUE(session_id, pseudo)` sur
-- `session_members`). Résultat : le participant rejoint bien physiquement la
-- table (`participants`, la source de vérité de TableView/ModeratorView),
-- mais sa ligne `table_assignments` n'est jamais posée ni mise à jour — il
-- reste invisible de la vue superadmin « Groupes » (alimentée par
-- `list_table_assignments_admin`), sans qu'aucune trace de l'échec
-- n'apparaisse nulle part : `SQLERRM` est jeté avec le `NULL;`.
--
-- ── Appelants recensés avant de choisir comment remonter l'échec ──────
-- Trois, tous via `PERFORM sync_table_assignment(...)` (valeur de retour
-- ignorée par construction — `PERFORM` jette tout ce qu'une fonction rend) :
--   1. `join_table`   (même fichier) — rejoint standard par code de table ;
--      c'est le chemin emprunté par un retardataire qui rejoint en phase
--      `debating` sans être jamais passé par l'allocation.
--   2. `create_table` (même fichier) — un modérateur crée sa table en direct.
--   3. `switch_table` (20260902_chantier48_switch_table.sql) — un participant
--      change de table depuis AllocatingScreen.
--
-- ── Choix : logger (RAISE WARNING), pas lever, pas changer la signature ──
-- Le commentaire d'origine de `sync_table_assignment` est explicite sur
-- l'invariant à préserver : « le rejoint physique réel (participants) ne
-- doit jamais échouer à cause d'un souci de synchronisation du tableau de
-- bord superadmin ». Les trois appelants exécutent l'INSERT dans
-- `participants` PUIS appellent `sync_table_assignment` dans la MÊME
-- transaction — si on la fait lever une exception non rattrapée, elle
-- remonterait à travers le `PERFORM` et ferait échouer (rollback) tout
-- `join_table`/`create_table`/`switch_table`, donc le rejoint physique
-- lui-même. Pour le retardataire en phase `debating`, ça transformerait un
-- bug d'affichage invisible en incapacité totale de rejoindre sa table —
-- une régression strictement pire que le bug actuel.
--
-- Renvoyer un statut jsonb `{synced, error}` que l'appelant devrait
-- explicitement lire et traiter forcerait à modifier `join_table`,
-- `create_table` ET `switch_table` pour exploiter cette valeur (aujourd'hui
-- perdue par `PERFORM`) — or `join_table` est actuellement retravaillé en
-- parallèle par le chantier 66 sur ce fichier même. Modifier son corps ici
-- créerait un recouvrement direct avec ce chantier plutôt qu'un simple
-- signalement, contrairement à la consigne. `create_table` et `switch_table`
-- ne sont pas dans le périmètre de ce chantier non plus.
--
-- Solution retenue, qui ne touche aucun appelant : remplacer le `NULL;` qui
-- avalait `SQLERRM` par un `RAISE WARNING` — capturé par les logs Postgres/
-- Supabase (onglet Logs du dashboard), avec assez de contexte (session,
-- user, pseudo, message d'erreur) pour diagnostiquer sans avoir à
-- reproduire. Le append au flux normal (transaction non affectée, valeur de
-- retour de `sync_table_assignment` inchangée : `void`) — donc aucun appel
-- existant (`PERFORM ...`) n'a besoin d'être modifié. Le prochain chantier
-- qui retouche `join_table`/`create_table`/`switch_table` (chantier 66 ou
-- un autre) peut, s'il le souhaite, faire évoluer la signature vers un
-- statut lu explicitement — non fait ici pour rester dans le périmètre
-- annoncé.
--
-- ── Piège Postgres (cf. CLAUDE.md) ───────────────────────────────────
-- Signature et type de retour inchangés (uuid, uuid, uuid, text) → void :
-- seul le corps change, CREATE OR REPLACE suffit, pas de DROP nécessaire.
--   SELECT p.oid::regprocedure,
--          pg_get_function_identity_arguments(p.oid),
--          pg_get_function_result(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'sync_table_assignment';
-- Attendu avant application : sync_table_assignment(uuid, uuid, uuid, text) → void.

CREATE OR REPLACE FUNCTION sync_table_assignment(
  p_session_id uuid,
  p_table_id   uuid,
  p_user_id    uuid,
  p_pseudo     text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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

    -- Membre déjà inscrit à la séance (vote, onboarding...) ?
    SELECT id INTO v_member_id
    FROM session_members
    WHERE session_id = p_session_id AND user_id = p_user_id;

    -- Retardataire jamais inscrit : on le crée directement en "présentiel",
    -- sans passer par register_session_member (dont le garde-fou de phase
    -- interdit l'inscription en phase debating — légitime ici).
    IF v_member_id IS NULL THEN
      INSERT INTO session_members (session_id, user_id, pseudo, joined_phase, attending_in_person)
      VALUES (p_session_id, p_user_id, p_pseudo, COALESCE(v_phase, 'debating'), true)
      RETURNING id INTO v_member_id;
    END IF;

    -- Réutilise le numéro logique déjà associé à cette table physique
    -- (posé par apply_allocation / assign_table_to_group) ; sinon en crée un.
    SELECT table_number INTO v_table_number
    FROM table_assignments
    WHERE session_id = p_session_id AND table_id = p_table_id
    LIMIT 1;

    IF v_table_number IS NULL THEN
      SELECT COALESCE(MAX(table_number), 0) + 1 INTO v_table_number
      FROM table_assignments
      WHERE session_id = p_session_id;
    END IF;

    INSERT INTO table_assignments (session_id, member_id, table_number, table_id)
    VALUES (p_session_id, v_member_id, v_table_number, p_table_id)
    ON CONFLICT (session_id, member_id)
    DO UPDATE SET table_number = EXCLUDED.table_number, table_id = EXCLUDED.table_id;
  EXCEPTION WHEN OTHERS THEN
    -- Best-effort : un pseudo déjà pris par un autre membre de la séance,
    -- ou tout autre accroc, ne doit jamais faire échouer le join réel
    -- (participants, déjà inséré par l'appelant dans la même transaction).
    -- Chantier 67 : mais l'échec ne doit plus disparaître en silence —
    -- RAISE WARNING (n'aborte pas la transaction, contrairement à une
    -- exception non rattrapée) avec assez de contexte pour retrouver le
    -- membre concerné depuis les logs Supabase.
    RAISE WARNING 'sync_table_assignment: échec pour session=%, user=%, pseudo=%, table=% — %',
      p_session_id, p_user_id, p_pseudo, p_table_id, SQLERRM;
  END;
END;
$$;

-- ── Vérification après application ───────────────────────────────────
-- Provoquer volontairement la collision (deux users différents, même
-- pseudo dans la même séance — le 2e ne doit ni échouer son join physique
-- ni rester silencieux) :
--   1. Inscrire un membre de séance avec pseudo 'CollisionTest' (register_session_member
--      ou tout inscrit existant).
--   2. Depuis un autre user_id, appeler join_table/create_table/switch_table
--      avec p_pseudo = 'CollisionTest' sur une table de la même séance.
--   3. Le join doit réussir normalement (participant créé), et le dashboard
--      Logs de Supabase (Postgres logs, niveau WARNING) doit contenir une
--      ligne "sync_table_assignment: échec pour session=..., pseudo=CollisionTest...".
--
-- ── SQL D'ANNULATION (revenir au comportement d'avant le chantier 67) ─
-- CREATE OR REPLACE FUNCTION sync_table_assignment(
--   p_session_id uuid,
--   p_table_id   uuid,
--   p_user_id    uuid,
--   p_pseudo     text
-- ) RETURNS void
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- AS $$
-- DECLARE
--   v_phase        text;
--   v_member_id    uuid;
--   v_table_number int;
-- BEGIN
--   IF p_session_id IS NULL THEN
--     RETURN;
--   END IF;
--
--   BEGIN
--     SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;
--
--     SELECT id INTO v_member_id
--     FROM session_members
--     WHERE session_id = p_session_id AND user_id = p_user_id;
--
--     IF v_member_id IS NULL THEN
--       INSERT INTO session_members (session_id, user_id, pseudo, joined_phase, attending_in_person)
--       VALUES (p_session_id, p_user_id, p_pseudo, COALESCE(v_phase, 'debating'), true)
--       RETURNING id INTO v_member_id;
--     END IF;
--
--     SELECT table_number INTO v_table_number
--     FROM table_assignments
--     WHERE session_id = p_session_id AND table_id = p_table_id
--     LIMIT 1;
--
--     IF v_table_number IS NULL THEN
--       SELECT COALESCE(MAX(table_number), 0) + 1 INTO v_table_number
--       FROM table_assignments
--       WHERE session_id = p_session_id;
--     END IF;
--
--     INSERT INTO table_assignments (session_id, member_id, table_number, table_id)
--     VALUES (p_session_id, v_member_id, v_table_number, p_table_id)
--     ON CONFLICT (session_id, member_id)
--     DO UPDATE SET table_number = EXCLUDED.table_number, table_id = EXCLUDED.table_id;
--   EXCEPTION WHEN OTHERS THEN
--     NULL;
--   END;
-- END;
-- $$;
