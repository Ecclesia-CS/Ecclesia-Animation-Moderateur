-- Chantier 65 — Une séance en brouillon ne doit être accessible à personne.
--
-- Revue de parcours du 2026-09-02 : `register_session_member` accepte encore
-- la phase `draft`, héritée du chantier 61 (qui a ajouté `allocating` à la
-- liste et n'a jamais retiré `draft`, présent depuis l'origine de la
-- fonction). Une séance en préparation, dont le `join_code` est déjà généré
-- à la création (`create_session`), peut donc être rejointe et votée par
-- quiconque a le lien ou repère la séance dans la liste — avant même que
-- l'organisateur ait ouvert quoi que ce soit.
--
-- Ce fichier retire uniquement `draft` de la liste des phases autorisées.
-- Restent acceptées, inchangées depuis le chantier 61 :
--   * `pre_voting`, `voting` — inscriptions normales.
--   * `allocating` — retardataires pendant que les tables se forment.
-- Restent exclues, inchangées : `debating` (rejoint via join_table) et
-- `closed` (séance terminée).
--
-- Le superadmin garde un accès complet à sa séance en brouillon : toutes ses
-- actions de préparation (créer, modifier les docs, rattacher/détacher des
-- tables, changer de phase) passent par des RPC SECURITY DEFINER à mot de
-- passe (`create_session`, `update_session_docs`, `attach_table_to_session`,
-- `set_session_phase`, etc.), jamais par `register_session_member` — cette
-- fonction ne concerne que l'inscription d'un participant anonyme.
--
-- Effet de bord côté frontend (fait dans ce même chantier, hors SQL) :
-- `VoteScreen`/`SessionRouterScreen` n'essaient plus d'inscrire quelqu'un
-- pendant `draft` — ils affichent directement un message « pas encore
-- ouverte ». Sans le blocage serveur ci-dessous, un appel RPC direct (curl,
-- ancien bundle en cache, etc.) contournerait ce garde-fou côté client :
-- c'est cette migration qui ferme réellement la porte.
--
-- ── Piège Postgres (cf. CLAUDE.md) ───────────────────────────────────
-- Signature ciblée, à vérifier avant application :
--   SELECT p.oid::regprocedure,
--          pg_get_function_identity_arguments(p.oid),
--          pg_get_function_result(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'register_session_member';
--
-- Attendu : une seule ligne, `register_session_member(uuid, text, text)` →
-- `jsonb` (la surcharge historique à 2 arguments a été supprimée par le
-- chantier 61 — si elle est revenue d'une manière ou d'une autre, la
-- retirer avant d'appliquer ce fichier, sinon `register_session_member`
-- resterait ambigu/accessible avec un garde de phase périmé).
-- Le CREATE OR REPLACE ci-dessous conserve à l'identique le nom des
-- paramètres, leur ordre, leur type, la valeur par défaut, le type de
-- retour (jsonb), le langage et SECURITY DEFINER — aucun DROP nécessaire.

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
  -- Chantier 65 : 'draft' retiré. Restent 'pre_voting', 'voting',
  -- 'allocating' (chantier 61). Toujours exclues : 'debating', 'closed'.
  IF v_phase NOT IN ('pre_voting', 'voting', 'allocating') THEN
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

-- ── confirm_attendance — trou trouvé pendant l'inventaire du chantier 65 ──
-- Cette fonction ne testait ABSOLUMENT AUCUNE phase (cf. le commentaire du
-- chantier 61 : « confirm_attendance ne teste aucune phase »). Son 3ᵉ cas
-- (pseudo non trouvé) INSERT un tout nouveau `session_members` sans passer
-- par `register_session_member` — donc sans jamais toucher le garde-fou
-- ci-dessus. Et `sessions` a une policy `SELECT USING (true)` (RLS
-- publique, cf. 20260526000001_sessions_schema.sql) : n'importe qui peut
-- lister TOUTES les séances, y compris en brouillon, par simple requête
-- REST sur la clé anon publique — sans même passer par l'onglet « Créer ».
-- Sans ce correctif, retirer 'draft' de register_session_member (ci-dessus)
-- et de la liste EntryScreen (fait côté frontend dans ce même chantier)
-- laisse cette porte grande ouverte : `confirm_attendance(session_id,
-- pseudo:'Test')` sur une séance en brouillon crée quand même un membre
-- attending, sans jamais appeler register_session_member.
--
-- Signature à vérifier avant application :
--   SELECT p.oid::regprocedure, pg_get_function_identity_arguments(p.oid), pg_get_function_result(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'confirm_attendance';
-- Attendu : confirm_attendance(uuid, text, text) → jsonb, une seule version.
--
-- Le CREATE OR REPLACE ajoute uniquement un garde de phase en tête de
-- fonction (bloque 'draft' avant les 3 cas existants) — aucun autre
-- comportement changé pour les phases qui fonctionnaient déjà
-- (pre_voting exclu du usage réel côté frontend mais pas testé ici non
-- plus ; voting/allocating/debating/closed inchangés).

CREATE OR REPLACE FUNCTION confirm_attendance(
  p_session_id uuid,
  p_pseudo     text DEFAULT NULL,
  p_code       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_phase         text;
  v_caller        uuid := auth.uid();
  v_target        session_members%ROWTYPE;
  v_caller_member session_members%ROWTYPE;
BEGIN
  SELECT phase INTO v_phase FROM sessions WHERE id = p_session_id;
  IF v_phase IS NULL THEN
    RAISE EXCEPTION 'Séance introuvable';
  END IF;
  -- Chantier 65 : une séance en brouillon n'accepte encore aucune
  -- confirmation de présence, pour les mêmes raisons que
  -- register_session_member ci-dessus.
  IF v_phase = 'draft' THEN
    RAISE EXCEPTION 'La séance n''est pas en phase d''inscription (phase: %)', v_phase;
  END IF;

  -- Cas 1 : le caller a déjà un membre dans cette session
  SELECT * INTO v_caller_member
  FROM session_members
  WHERE session_id = p_session_id AND user_id = v_caller;

  IF v_caller_member.id IS NOT NULL THEN
    UPDATE session_members
    SET attending_in_person = true
    WHERE id = v_caller_member.id
    RETURNING * INTO v_caller_member;
    RETURN to_jsonb(v_caller_member);
  END IF;

  -- Cas 2 : recherche par code
  IF p_code IS NOT NULL THEN
    SELECT * INTO v_target
    FROM session_members
    WHERE session_id = p_session_id AND reclaim_code = p_code;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Code de rappel invalide';
    END IF;

    UPDATE session_members
    SET user_id = v_caller, attending_in_person = true
    WHERE id = v_target.id
    RETURNING * INTO v_target;
    RETURN to_jsonb(v_target);
  END IF;

  -- Cas 3 : recherche par pseudo
  IF p_pseudo IS NOT NULL THEN
    SELECT * INTO v_target
    FROM session_members
    WHERE session_id = p_session_id AND pseudo = p_pseudo;

    IF NOT FOUND THEN
      -- Pseudo inconnu → créer un nouveau membre attending
      INSERT INTO session_members(session_id, user_id, pseudo, attending_in_person, joined_phase)
      VALUES (p_session_id, v_caller, p_pseudo, true, 'voting')
      RETURNING * INTO v_target;
      RETURN to_jsonb(v_target);
    END IF;

    -- Pseudo trouvé → reclaim
    UPDATE session_members
    SET user_id = v_caller, attending_in_person = true
    WHERE id = v_target.id
    RETURNING * INTO v_target;
    RETURN to_jsonb(v_target);
  END IF;

  RAISE EXCEPTION 'Fournir un pseudo ou un code de rappel';
END;
$$;

GRANT EXECUTE ON FUNCTION confirm_attendance(uuid, text, text) TO anon, authenticated;

-- ── Vérification après application ───────────────────────────────────
-- Sur une séance en phase 'draft', depuis une session anonyme :
--   SELECT register_session_member('<session_id>', 'Test Curieux');
-- Attendu : exception « La séance n'est pas en phase d'inscription
-- (phase: draft) ». Puis, sur la même séance passée en 'pre_voting' :
--   SELECT register_session_member('<session_id>', 'Test Curieux');
-- Attendu : succès, comme avant ce chantier.
--
-- Sur une séance en phase 'draft' :
--   SELECT confirm_attendance('<session_id>', 'Test Curieux', NULL);
-- Attendu : même exception. Puis sur une séance en 'voting' avec un membre
-- existant non-attending : vérifier que confirm_attendance fonctionne
-- toujours comme avant (marque attending_in_person = true).
--
-- ── SQL D'ANNULATION (revenir au comportement du chantier 61) ─────────
-- register_session_member :
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
--   IF v_phase NOT IN ('draft', 'pre_voting', 'voting', 'allocating') THEN
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
--
-- confirm_attendance (retire le garde de phase ajouté ici — pas de perte
-- de données, juste réouvre la porte trouvée pendant l'inventaire) :
--
-- CREATE OR REPLACE FUNCTION confirm_attendance(
--   p_session_id uuid,
--   p_pseudo     text DEFAULT NULL,
--   p_code       text DEFAULT NULL
-- )
-- RETURNS jsonb
-- LANGUAGE plpgsql SECURITY DEFINER AS $$
-- DECLARE
--   v_caller        uuid := auth.uid();
--   v_target        session_members%ROWTYPE;
--   v_caller_member session_members%ROWTYPE;
-- BEGIN
--   SELECT * INTO v_caller_member
--   FROM session_members
--   WHERE session_id = p_session_id AND user_id = v_caller;
--
--   IF v_caller_member.id IS NOT NULL THEN
--     UPDATE session_members
--     SET attending_in_person = true
--     WHERE id = v_caller_member.id
--     RETURNING * INTO v_caller_member;
--     RETURN to_jsonb(v_caller_member);
--   END IF;
--
--   IF p_code IS NOT NULL THEN
--     SELECT * INTO v_target
--     FROM session_members
--     WHERE session_id = p_session_id AND reclaim_code = p_code;
--
--     IF NOT FOUND THEN
--       RAISE EXCEPTION 'Code de rappel invalide';
--     END IF;
--
--     UPDATE session_members
--     SET user_id = v_caller, attending_in_person = true
--     WHERE id = v_target.id
--     RETURNING * INTO v_target;
--     RETURN to_jsonb(v_target);
--   END IF;
--
--   IF p_pseudo IS NOT NULL THEN
--     SELECT * INTO v_target
--     FROM session_members
--     WHERE session_id = p_session_id AND pseudo = p_pseudo;
--
--     IF NOT FOUND THEN
--       INSERT INTO session_members(session_id, user_id, pseudo, attending_in_person, joined_phase)
--       VALUES (p_session_id, v_caller, p_pseudo, true, 'voting')
--       RETURNING * INTO v_target;
--       RETURN to_jsonb(v_target);
--     END IF;
--
--     UPDATE session_members
--     SET user_id = v_caller, attending_in_person = true
--     WHERE id = v_target.id
--     RETURNING * INTO v_target;
--     RETURN to_jsonb(v_target);
--   END IF;
--
--   RAISE EXCEPTION 'Fournir un pseudo ou un code de rappel';
-- END;
-- $$;
