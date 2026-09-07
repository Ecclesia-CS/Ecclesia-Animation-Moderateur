-- =============================================================
-- Chantier 59 — Canaux Realtime privés (F6 à la racine)
--
-- ⚠️⚠️ CETTE MIGRATION SEULE NE CHANGE RIEN, ET C'EST VOULU.
-- Elle pose des policies sur `realtime.messages`, qui ne sont consultées
-- que pour les canaux ouverts avec `config: { private: true }`. Tant que
-- le frontend correspondant n'est pas déployé, aucun canal n'est privé,
-- aucune policy n'est évaluée, le comportement est strictement identique.
-- C'est délibéré : voir « ORDRE D'APPLICATION » plus bas, l'ordre est la
-- seule chose qui peut casser la production dans ce chantier.
--
-- =============================================================
-- ÉTAT DES LIEUX ÉTABLI EN BASE (MCP lecture, 2026-09-06)
-- =============================================================
-- Contrairement à ce que laisse croire une lecture rapide de F6, la
-- majeure partie du flux temps réel est DÉJÀ protégée. Mesuré, pas supposé :
--
-- 1. Les 10 tables de la publication `supabase_realtime` ont toutes RLS
--    activée. Or la doc Supabase est explicite (« Interaction with Postgres
--    Changes ») : les enregistrements ne sont envoyés qu'aux clients
--    autorisés à les lire par les policies, et « private and public
--    channels can subscribe to Postgres Changes ». Autrement dit
--    `private: true` ne change RIEN au `postgres_changes` — ni en
--    protection, ni en régression. Les policies SELECT effectives :
--      · tables, participants, queue_entries, speaking_turns
--                                   → is_table_participant(...)   ✅ fermé
--      · session_members            → user_id = auth.uid()         ✅ fermé (ch. 50)
--      · table_assignments          → is_own_session_member(...)   ✅ fermé (ch. 50)
--      · assertion_votes            → ses propres votes            ✅ fermé
--      · assertions                 → status = 'approved'          ⚠️ ouvert
--      · sessions                   → true                         ⚠️ ouvert
--      · session_sources            → true                         ⚠️ ouvert
--    Les trois derniers sont des décisions produit assumées ailleurs (la
--    liste des séances en cours AVEC leur join_code est le parcours
--    d'entrée voulu, §1.4 du plan sécurité ; les assertions approuvées et
--    les sources collaboratives sont le matériau public du débat). Ce
--    chantier ne les touche pas — `private: true` ne les fermerait pas
--    davantage, seul un resserrement de leurs policies le ferait, et
--    c'est le périmètre du chantier 58.
--
-- 2. `realtime.messages` : RLS **activée**, **zéro policy**, et les GRANT
--    SELECT/INSERT/UPDATE sont déjà en place pour `anon` et
--    `authenticated`. L'infrastructure d'autorisation Realtime est donc
--    présente et inerte : aucun canal privé ne pourrait fonctionner
--    aujourd'hui (RLS sans policy = tout refusé), et comme aucun canal
--    n'est privé, elle n'est jamais consultée. C'est exactement l'état
--    « disponible, non activé ».
--
-- 3. `realtime.topic()`, `realtime.send()`, `realtime.broadcast_changes()`
--    existent — support complet de Realtime Authorization.
--
-- LE TROU RÉEL, DONC, C'EST LE BROADCAST — ET LUI SEUL
-- -------------------------------------------------------------
-- Un seul canal de toute l'application émet et écoute un broadcast :
-- `table:<table_id>` (`TableContext`, événement `refresh`). Le broadcast
-- n'est soumis à AUCUNE RLS sur un canal public. N'importe qui connaissant
-- un `table_id` peut donc :
--   · s'y abonner et observer le rythme de la séance (métadonnée : quand
--     un tour change, quand quelqu'un demande la parole) ;
--   · surtout, **émettre** des `refresh` et déclencher un refetch REST
--     chez tous les clients de la table. C'est F6, confirmé exploitable
--     par l'audit du 03/08.
-- Le chantier 53 a plafonné le refetch côté client (débounce + N/s). La
-- porte, elle, est restée ouverte. C'est elle qu'on ferme ici.
--
-- Le payload du broadcast lui-même ne fuit rien : c'est `{tables: [...]}` ,
-- une liste de NOMS de tables à refetcher, pas des données.
--
-- =============================================================
-- ⚠️ CE QUE CETTE MIGRATION NE PEUT PAS FAIRE — ACTION HUMAINE REQUISE
-- =============================================================
-- La doc Supabase (Realtime Authorization) le dit noir sur blanc :
--
--   « To enforce private channels you need to disable the "Allow public
--     access" setting in Realtime Settings. »
--
-- C'est un réglage **projet**, dans le dashboard
-- (Project Settings → Realtime → Settings), inaccessible depuis une
-- migration SQL. Tant qu'il est activé, un attaquant peut rejoindre le
-- topic `table:<id>` en mode **public** et y émettre des broadcasts que
-- nos abonnés privés recevront quand même : le nom du topic est le même,
-- `private` n'est qu'une assertion par connexion.
--
-- ⇒ **Sans ce réglage, le chantier 59 ne ferme PAS F6.** Les policies et
--    le `private: true` sont nécessaires mais pas suffisants. C'est le
--    point le plus important de ce fichier.
--
-- ⇒ Et ce réglage est **global** : une fois désactivé, TOUT canal non
--    privé est refusé, dans toute l'application, immédiatement. D'où
--    l'ordre ci-dessous.
--
-- ORDRE D'APPLICATION — NON NÉGOCIABLE
-- -------------------------------------------------------------
--   1. Appliquer CETTE migration (sans effet observable, cf. en-tête).
--   2. Déployer le frontend de cette branche (`private: true` partout).
--   3. Vérifier en séance de test que tout le temps réel fonctionne
--      encore — c'est l'étape où une policy trop stricte se voit.
--   4. SEULEMENT ENSUITE, désactiver « Allow public access ».
--   5. Re-vérifier : c'est à cette étape, et pas avant, que F6 est fermé.
--
-- Inverser 2 et 4 casse instantanément la production : tous les canaux
-- déployés aujourd'hui sont publics, ils seraient tous refusés d'un coup.
-- ⚠️ Une séance de vote tourne en production le **jeudi 10 septembre**.
-- Ne rien faire de tout ceci avant. Cette branche n'est pas destinée à
-- être mergée avant cette date.
--
-- ROLLBACK D'URGENCE (si le temps réel casse en séance)
-- -------------------------------------------------------------
-- Réactiver « Allow public access » dans le dashboard. Effet immédiat,
-- sans redéploiement ni migration : les canaux privés continuent de
-- fonctionner, et les éventuels canaux publics redeviennent acceptés.
-- C'est le levier à connaître AVANT d'y toucher.
--
-- =============================================================
-- CE QUE FAIT CETTE MIGRATION
-- =============================================================
-- §1  Durcit `is_table_participant` (ajout du `SET search_path`, absent).
-- §2  Helper `can_join_realtime_topic(topic)` — la carte des topics.
-- §3  Deux policies sur `realtime.messages` (lecture / émission).
--
-- PIÈGES DU PROJET (CLAUDE.md) — traités
-- -------------------------------------------------------------
--   · `is_table_participant` : signature et type de retour INCHANGÉS
--     (uuid → boolean), `CREATE OR REPLACE` suffit. Corps recopié depuis
--     `pg_get_functiondef` **en base** (pas depuis un ancien fichier de
--     migration), seul le `SET search_path` est ajouté.
--   · `can_join_realtime_topic` est NEUVE — `DROP FUNCTION IF EXISTS` de
--     la signature exacte posé quand même, au cas où une session
--     parallèle en aurait créé une variante.
--   · `SET search_path = public, extensions` partout. Aucune de ces
--     fonctions n'atteint `crypt()`, mais une fonction SECURITY DEFINER
--     sans search_path est le défaut d'hygiène relevé au §6.1 de l'audit.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- §1. is_table_participant — durcissement (search_path)
--
-- Corps identique à celui lu en base le 2026-09-06 via
-- pg_get_functiondef ; SEUL le SET search_path est ajouté, pour aligner
-- cette fonction sur sa jumelle `is_own_session_member` (chantier 50),
-- qui l'a déjà. Elle devient ici la clé de voûte de l'autorisation
-- Realtime (§2) en plus des 4 policies de table qu'elle porte déjà :
-- raison de plus pour ne pas la laisser sans search_path fixé.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_table_participant(p_table_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM participants
    WHERE table_id = p_table_id
      AND user_id  = auth.uid()
  );
$fn$;


-- ─────────────────────────────────────────────────────────────
-- §2. can_join_realtime_topic — la carte des topics
--
-- Un seul endroit décrit qui a le droit d'être sur quel canal. Les
-- policies du §3 ne font que l'appeler : la logique reste lisible,
-- testable directement en SQL (`SELECT can_join_realtime_topic('table:…')`,
-- cf. recette en pied de fichier) et modifiable sans toucher aux policies.
--
-- INVENTAIRE COMPLET DES TOPICS OUVERTS PAR L'APPLICATION
-- (relevé exhaustif par `grep -rn "\.channel(" src/`, 2026-09-06) :
--
--   topic                              | fichier                  | règle
--   -----------------------------------|--------------------------|---------------------------
--   table:<table_id>                   | TableContext             | participant de la table
--   session-member-status:<table_id>   | TableContext             | participant de la table
--   allocating:<session_id>            | AllocatingScreen         | membre de la séance
--   vote:<session_id>                  | VoteScreen               | membre de la séance
--   vote-wait:<session_id>             | VoteScreen               | membre de la séance
--   session-member:<member_id>         | VoteScreen               | ce membre est le mien
--   postvote:<session_id>:<member_id>  | PostVoteScreen           | ce membre est le mien
--   collab:<session_id>                | CollabDocScreen          | tout authentifié (voir plus bas)
--   table_assignments:<session_id>     | SuperadminScreen         | SUPPRIMÉ du code (voir plus bas)
--   session-tables:<session_id>        | SuperadminScreen         | SUPPRIMÉ du code (voir plus bas)
--
-- ── Pourquoi `collab:` est ouvert à tout authentifié ──
-- `session_sources` a une policy SELECT `USING (true)` : le contenu qui
-- transite sur ce canal est déjà lisible par n'importe qui en REST. Une
-- règle plus stricte sur le canal donnerait l'illusion d'une protection
-- sans en apporter une. Si Jules veut fermer les sources collaboratives,
-- c'est la policy de `session_sources` qu'il faut resserrer d'abord —
-- ce canal suivra tout seul, sans retoucher ce fichier.
--
-- ── Pourquoi les DEUX canaux superadmin sont supprimés du code ──
-- Ils sont **déjà morts aujourd'hui**, indépendamment de ce chantier :
--   · `table_assignments:<id>` — CLAUDE.md le documente déjà comme
--     « conservé mais dormant » depuis le chantier 50 : le superadmin
--     n'est membre d'aucune séance, la policy self-only ne lui livre
--     jamais rien. Compensé par un polling 10 s (`loadGroups`).
--   · `session-tables:<id>` — même situation, jamais relevée jusqu'ici :
--     la policy de `tables` est `is_table_participant(id)` et le
--     superadmin n'a AUCUNE ligne `participants` (les tables qu'il crée
--     via apply_allocation/create_tables_batch lui donnent `created_by`,
--     pas un siège). Il ne reçoit donc rien non plus. Compensé par un
--     polling 15 s (`load`) posé juste au-dessus dans le même fichier.
-- Les supprimer n'enlève aucune fonctionnalité : ce sont deux abonnements
-- qui ne se déclenchent jamais. Et ça dissout le seul cas d'autorisation
-- réellement insoluble ici — le superadmin s'authentifie par un mot de
-- passe bcrypt qui n'est JAMAIS transmis à Realtime, et son `auth.uid()`
-- est un uid anonyme ordinaire, indiscernable de celui d'un attaquant.
-- Aucune policy ne peut le reconnaître.
--   ⇒ Si un besoin de temps réel superadmin apparaît un jour, il faudra
--     d'abord matérialiser sa session (table `superadmin_sessions
--     (user_id, expires_at)` remplie par une RPC SECURITY DEFINER au
--     moment de la saisie du mot de passe, policy qui la consulte).
--     C'est un chantier à part entière, hors périmètre ici, et il n'a
--     aucune urgence tant que les pollings tiennent.
--
-- ── Ce qui est refusé par défaut ──
-- Tout topic inconnu → `false`. Un canal ajouté plus tard SANS entrée
-- ici sera donc refusé une fois « Allow public access » désactivé. C'est
-- volontaire (fail-closed), mais c'est un piège pour la prochaine
-- session : **ajouter un canal = ajouter une branche ici**. Signalé dans
-- A_VERIFIER.md et dans src/lib/realtime.ts.
-- ─────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.can_join_realtime_topic(text);

CREATE FUNCTION public.can_join_realtime_topic(p_topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_prefix text;
  v_part2  text;
  v_part3  text;
  v_id     uuid;
BEGIN
  -- Aucun anonyme non authentifié. `signInAnonymously()` produit un vrai
  -- JWT avec un `sub` : auth.uid() est renseigné pour tous les
  -- utilisateurs légitimes de l'app, y compris les participants anonymes.
  IF auth.uid() IS NULL OR p_topic IS NULL THEN
    RETURN false;
  END IF;

  v_prefix := split_part(p_topic, ':', 1);
  v_part2  := split_part(p_topic, ':', 2);
  v_part3  := split_part(p_topic, ':', 3);

  -- Un topic malformé ne doit jamais faire lever la fonction : une
  -- exception dans une policy RLS remonte au client comme un échec de
  -- connexion opaque. On refuse proprement.
  IF v_part2 !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  v_id := v_part2::uuid;

  -- postvote:<session_id>:<member_id> — le seul topic à 3 segments.
  -- On vérifie le MEMBRE (3ᵉ segment), pas la séance : c'est lui qui
  -- porte l'identité. Le contrôle est donc strictement personnel.
  IF v_prefix = 'postvote' THEN
    IF v_part3 !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN false;
    END IF;
    RETURN is_own_session_member(v_part3::uuid)
       AND EXISTS (
             SELECT 1 FROM session_members
             WHERE id = v_part3::uuid AND session_id = v_id
           );
  END IF;

  RETURN CASE v_prefix
    -- Canaux de table : le seul endroit où un broadcast circule.
    WHEN 'table'                 THEN is_table_participant(v_id)
    WHEN 'session-member-status' THEN is_table_participant(v_id)

    -- Canaux de séance : réservés aux membres inscrits.
    WHEN 'allocating' THEN EXISTS (
      SELECT 1 FROM session_members
      WHERE session_id = v_id AND user_id = auth.uid()
    )
    WHEN 'vote' THEN EXISTS (
      SELECT 1 FROM session_members
      WHERE session_id = v_id AND user_id = auth.uid()
    )
    WHEN 'vote-wait' THEN EXISTS (
      SELECT 1 FROM session_members
      WHERE session_id = v_id AND user_id = auth.uid()
    )

    -- Canal personnel.
    WHEN 'session-member' THEN is_own_session_member(v_id)

    -- Document collaboratif : aussi ouvert que la table qu'il reflète.
    WHEN 'collab' THEN true

    -- Fail-closed.
    ELSE false
  END;
END;
$fn$;

COMMENT ON FUNCTION public.can_join_realtime_topic(text) IS
  'Chantier 59 — carte d''autorisation des topics Realtime. Appelée par les '
  'deux policies de realtime.messages. Refuse tout topic inconnu '
  '(fail-closed) : ajouter un canal dans src/ impose d''ajouter une branche '
  'ici, sinon il sera refusé dès que « Allow public access » sera désactivé '
  'dans le dashboard. Voir l''en-tête de '
  '20260906_chantier59_realtime_canaux_prives.sql.';

GRANT EXECUTE ON FUNCTION public.can_join_realtime_topic(text) TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- §3. Policies sur realtime.messages
--
-- Réparties en LECTURE (rejoindre le canal et y recevoir) et ÉMISSION
-- (y envoyer un broadcast). Realtime exige au moins une permission de
-- lecture OU d'écriture sur le topic pour autoriser le `join` — d'où une
-- policy SELECT même pour les canaux qui ne font que du
-- `postgres_changes` et ne liront jamais un message.
--
-- ── Pourquoi la policy de LECTURE ne filtre pas sur `extension` ──
-- On aurait pu la restreindre à `extension = 'broadcast'`. Ce serait plus
-- serré sur le papier, mais Realtime dérive les permissions du topic au
-- moment du `join`, et nos 7 topics restants sont majoritairement
-- `postgres_changes` seuls : un filtre trop fin risquerait de leur refuser
-- le join pour un gain nul. Le risque est asymétrique — une policy trop
-- stricte fige des écrans en séance, sans erreur visible (c'est le risque
-- n°1 identifié pour ce chantier dans le plan sécurité). On accorde donc
-- la lecture au niveau du topic, et on serre à l'ÉMISSION, qui est le
-- vecteur réel de F6.
--
-- ── Presence ──
-- Aucune fonctionnalité de l'app n'utilise Presence. La policy d'émission
-- exigeant `extension = 'broadcast'`, publier une presence est refusé.
-- La lecture de presence reste techniquement permise sur un topic
-- autorisé, mais sans personne pour en publier il n'y a rien à lire.
-- Volontaire : ne pas ajouter un filtre dont on ne peut pas mesurer
-- l'effet sans navigateur.
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "ecclesia_realtime_read"  ON realtime.messages;
DROP POLICY IF EXISTS "ecclesia_realtime_write" ON realtime.messages;

-- LECTURE : rejoindre un canal et y recevoir des messages.
CREATE POLICY "ecclesia_realtime_read"
ON realtime.messages
FOR SELECT
TO authenticated
USING ( public.can_join_realtime_topic( (SELECT realtime.topic()) ) );

-- ÉMISSION : envoyer un broadcast. C'est la porte que F6 laissait ouverte.
-- Seul `table:<id>` émet réellement (TableContext, événement `refresh`),
-- mais on autorise l'émission sur tout topic auquel on a accès : un
-- participant qui spamme sa propre table est déjà plafonné côté client
-- (chantier 53), et restreindre au seul préfixe `table:` rendrait tout
-- ajout futur de broadcast silencieusement inopérant.
CREATE POLICY "ecclesia_realtime_write"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.messages.extension = 'broadcast'
  AND public.can_join_realtime_topic( (SELECT realtime.topic()) )
);

-- Note : aucune policy pour le rôle `anon`. Tous les écrans de l'app
-- appellent `signInAnonymously()` avant d'ouvrir un canal — le client est
-- donc `authenticated`, jamais `anon`, même pour un participant anonyme.
-- Si un canal devait un jour s'ouvrir avant l'authentification, il serait
-- refusé : c'est le bon défaut, et ça se verra tout de suite en recette.


-- =============================================================
-- REQUÊTES DE VÉRIFICATION (après application)
-- =============================================================
--
-- 1. Les deux policies existent, la fonction est unique et bien réglée :
--    SELECT polname, cmd FROM pg_policies WHERE schemaname='realtime' AND tablename='messages';
--    → 2 lignes : ecclesia_realtime_read (SELECT), ecclesia_realtime_write (INSERT)
--
--    SELECT pg_get_function_identity_arguments(p.oid), p.prosecdef, p.proconfig
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname IN ('can_join_realtime_topic','is_table_participant');
--    → 1 ligne chacune, prosecdef=true, proconfig={"search_path=public, extensions"}
--
-- 2. La carte des topics, testable SANS navigateur. `auth.uid()` valant
--    NULL dans le SQL Editor, la fonction doit répondre `false` partout —
--    c'est déjà une vérification utile (le fail-closed fonctionne) :
--    SELECT can_join_realtime_topic('table:00000000-0000-0000-0000-000000000000'); -- false
--    SELECT can_join_realtime_topic('nimportequoi');                                -- false
--    SELECT can_join_realtime_topic('table:pas-un-uuid');                           -- false
--    SELECT can_join_realtime_topic(NULL);                                          -- false
--    (aucune de ces requêtes ne doit LEVER : un topic malformé se refuse,
--     il ne lève pas — une exception dans une policy remonte au client
--     comme un échec de connexion opaque, impossible à diagnostiquer.)
--
-- 3. Test avec une vraie identité (le seul qui prouve que ça s'ouvre) —
--    à jouer en remplaçant l'uid par celui d'un participant réel :
--    SET LOCAL role = 'authenticated';
--    SET LOCAL request.jwt.claims = '{"sub":"<USER_ID_D_UN_PARTICIPANT>","role":"authenticated"}';
--    SELECT can_join_realtime_topic('table:<TABLE_ID_OU_IL_EST_ASSIS>');  -- attendu : true
--    SELECT can_join_realtime_topic('table:<UNE_AUTRE_TABLE>');           -- attendu : false
--    RESET role;
--
-- 4. Non-régression `is_table_participant` (elle porte 4 policies de
--    table + toute l'autorisation Realtime) :
--    même protocole qu'en 3, puis
--    SELECT count(*) FROM tables WHERE id = '<TABLE_ID_OU_IL_EST_ASSIS>';  -- 1
--    SELECT count(*) FROM tables WHERE id = '<UNE_AUTRE_TABLE>';           -- 0
--
-- 5. Le reste de la recette est navigateur — voir A_VERIFIER.md,
--    chantier 59. Ne PAS désactiver « Allow public access » avant d'avoir
--    déroulé les scénarios A à H de cette recette.
--
-- =============================================================
-- SQL D'ANNULATION (rollback)
-- =============================================================
--
-- Si le frontend privé est déjà déployé, RÉACTIVER D'ABORD « Allow public
-- access » dans le dashboard, sinon supprimer les policies coupe tous les
-- canaux d'un coup (RLS activée sans policy = tout refusé).
--
-- BEGIN;
--   DROP POLICY IF EXISTS "ecclesia_realtime_read"  ON realtime.messages;
--   DROP POLICY IF EXISTS "ecclesia_realtime_write" ON realtime.messages;
--   DROP FUNCTION IF EXISTS public.can_join_realtime_topic(text);
--   -- is_table_participant : le SET search_path peut rester, il est
--   -- indépendant de ce chantier et sans effet de bord connu. Pour
--   -- revenir strictement à l'état antérieur, recopier le corps du §1
--   -- sans la ligne SET search_path.
-- COMMIT;
-- =============================================================
