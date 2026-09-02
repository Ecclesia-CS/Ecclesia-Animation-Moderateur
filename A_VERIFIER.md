# À vérifier

Liste des points nécessitant une validation humaine, générés lors des sessions Claude Code.
Ne pas supprimer une entrée sans validation explicite de Jules — se contenter de la déplacer en section "Validé" une fois confirmée. Si un point semble obsolète, le marquer comme tel plutôt que l'effacer.

> **2026-08-03** — Fichier allégé à la demande de Jules avant une remise à zéro de la mémoire Dispatch : toutes les entrées déjà vérifiées/confirmées (chantiers 1 à 32 et vagues de vérification antérieures) ont été retirées — leur historique complet reste dans l'historique git de ce fichier (`git log -p -- A_VERIFIER.md`).
>
> **Correction 2026-09-01** : les chantiers **33 et 34** avaient été retirés par cet allégement alors qu'ils n'ont **jamais été vérifiés humainement** (33 : uniquement `tsc`/tests/mock réseau ; 34 : uniquement mock réseau via route de debug) — réintégrés ci-dessous, section Superadmin (33) et Participant (34).
>
> **⚠️ 2026-09-02 (session de consolidation) — toute la vague récente repose entièrement sur la passe manuelle de Jules.** Les recettes des chantiers **50, 51, 53, 57, 60, 61 et 62** ont été écrites par des sessions headless (harnais partagé, pas de mot de passe superadmin/Code Ecclesia, consigne explicite de ne lancer aucun serveur de dev ni test navigateur) — **aucune d'elles n'a été jouée à l'écran**, ni par une session Claude Code ni par Jules, au moment de l'écriture de cette note. Tout ce qui suit dans ce fichier pour ces sept chantiers (y compris les scénarios détaillés, marqués "Déjà vérifié : tsc/build/tests uniquement") reste donc à dérouler intégralement à la main avant de les considérer clos.

## Règle — plus de migration SQL appliquée par une session de chantier (2026-09-01)

Décision de Jules : une session de chantier **n'applique plus jamais de migration SQL elle-même**, qu'elle ait ou non un accès MCP Supabase disponible. Elle **documente ici** le chemin du fichier de migration et ce qu'il change. C'est la **session de vérification dédiée** qui applique le SQL (SQL Editor du dashboard Supabase ou MCP) et qui met à jour l'entrée correspondante (statut "appliquée", résultat du test). Le paragraphe "Accès MCP Supabase" de `CLAUDE.md` qui affirmait un accès direct pour toute session est corrigé en conséquence — voir ce fichier.

## Comment vérifier "tout d'un coup"

Les points sont groupés **par écran/parcours**, pas par chantier, pour permettre une seule passe par écran plutôt que d'aller-retour entre chantiers. Dans l'ordre suggéré :

1. **Migration SQL en attente** (ci-dessous) — à appliquer avant de tester les chantiers 33, 39, 44, 46, 48, 61 et 62 (62 n'ajoute pas de migration propre mais dépend de celle du 48, `switch_table`).
2. **Résultats publics (chantier 46)** — accueil (bouton + modale), superadmin (pastille par séance), page publique `#results/<id>`.
3. **Superadmin** — onglets Tables, Membres, phase voting.
4. **Participant** — vote/pré-vote, écran "Débat en cours", entrée en débat, résultats de fin de séance.
5. **Modérateur** (`ModeratorView`) — Code Ecclesia + vraie table animée requis. Couvre aussi le chantier 44 ("Ajouter une personne sans téléphone") et la refonte "Outils Modo" (chantier 43).
6. **Questionnaire post-débat** — les trois points d'entrée (table, `#vote/`, `#session/`) et leur déclenchement automatique à la clôture (chantier 39).
7. **Synchronisation temps réel (chantier 35)** — nécessite deux onglets/navigateurs en parallèle, à faire à part.
8. **Nettoyage des données de test** — une fois tout vérifié, purger les tables de QA listées en bas de fichier.

## ⚠️ Migration SQL en attente d'application

> **✅ Mise à jour 2026-09-02 (session de consolidation)** : les 4 migrations des chantiers **60, 50, 51 et 61** ont été **appliquées par l'orchestration le 2026-09-02**. Les entrées ci-dessous pour ces 4 chantiers restent en place (append-only) mais ne bloquent plus sur l'application SQL — seuls les tests navigateur listés dans chacune restent à dérouler. Les migrations des chantiers **48, 46, 33, 39, 44** ci-dessous, elles, **n'ont pas de statut d'application confirmé** — ne pas les rejouer depuis une session de chantier (règle du 2026-09-01 ci-dessus), et ne pas présumer qu'elles sont passées : à vérifier en base avant de tester leur comportement.

- [x] **Chantier 60 — `supabase/migrations/20260902_chantier60_moderator_authority.sql`** ✅ **appliquée le 2026-09-02** — corrige le bloquant le plus grave du projet (un modérateur désigné par l'allocation ne peut rien faire), et modifie des fonctions/policies utilisées par tous les autres tests du parcours Modérateur. Reste à faire : le test manuel complet (section Parcours Modérateur ci-dessous) — jamais joué à l'écran.

  **Le bug corrigé** : un participant marqué `session_members.is_moderator` (allocation v2, `claim_moderator_status`, `assign_moderator_to_table`, `set_member_moderator`) voit bien la vue modérateur depuis le chantier 41, mais **aucune de ses actions n'aboutit** : donner/retirer la parole → « Not authorized » ; exclure → « Non autorisé » ; ajouter une personne sans téléphone → « Non autorisé » ; forcer le questionnaire et supprimer la table → **échec silencieux** (une policy RLS qui refuse un UPDATE/DELETE n'est pas une erreur, elle affecte simplement zéro ligne). Cause : toutes les gardes testent `tables.created_by = auth.uid()`, alors que `apply_allocation`/`create_tables_batch` posent `created_by` = l'identifiant anonyme du **superadmin** qui déclenche l'allocation. Les seuls modérateurs qui fonctionnent aujourd'hui sont ceux passés par « Créer une table » ou par « Je suis modérateur de cette table » (`reclaim_moderator`) — les deux seuls chemins qui posent `created_by`, ce qui explique que le défaut n'ait jamais explosé en séance réelle.

  **Contenu du fichier** :
  1. Nouveau helper `is_table_moderator(p_table_id uuid) RETURNS boolean`, `SECURITY DEFINER STABLE SET search_path = public, extensions` (mêmes conventions anti-récursion qu'`is_table_participant`). Vrai si l'appelant est **soit** le créateur physique de la table (`tables.created_by`, chemin historique inchangé), **soit** un membre de la séance de cette table marqué `session_members.is_moderator = true` **ET** affecté à **cette table précise** via `table_assignments` (les deux conditions sont cumulatives — c'est le point de régression critique).
  2. Les **9 fonctions** d'animation reprises pour utiliser ce helper : `grant_floor`, `end_turn`, `end_turn_and_advance`, `kick_participant`, `add_offline_participant` (les 5 du périmètre initial) **+ 4 trouvées à l'inventaire** : `add_to_queue` (mettre quelqu'un d'*autre* en file), `move_queue_entry` (↑/↓), `reorder_queue_entry` (réordonnancement DnD), `correct_turn` (modale « Corriger un tour »). Corps strictement identiques, seule la garde change.
  3. Les **7 policies RLS** reprises de la même façon : `tables_update_moderator` (forçage questionnaire, UPDATE direct depuis `TableContext`) et `tables_delete_moderator` (`endTable()`, DELETE direct) — les deux « échecs silencieux » ; `queue_entries_delete` (**`removeFromQueue` et `changeQueueType` font un DELETE DIRECT, pas une RPC** → un modérateur désigné ne peut retirer personne de la file, silencieusement) ; plus `queue_entries_insert`, `queue_entries_update_moderator`, `speaking_turns_insert_moderator`, `speaking_turns_update_moderator` par cohérence (leurs écritures passent aujourd'hui par des RPC `SECURITY DEFINER`, donc hors RLS).
  4. Un bloc `DO $guard$` en tête qui compare `pg_get_function_identity_arguments` + `pg_get_function_result` de chaque fonction à ce qui va être créé, et DROP toute surcharge divergente — protection contre le piège `CREATE OR REPLACE` (refus si un nom de paramètre change, surcharge ambiguë si le nombre/type change) qui a déjà mordu le projet deux fois. Sans perte de droits : aucune de ces fonctions n'a de GRANT explicite dans l'historique, et la migration repose un `GRANT EXECUTE ... TO anon, authenticated` après chaque création.

  **Ce qui n'est PAS touché** (inventaire complet fait avant modification) : `create_table`, `create_tables_batch`, `apply_allocation`, `admin_create_table`, `run_clustering_*` → INSERT de `created_by` (attribution, pas autorisation) ; `reclaim_moderator`, `designate_moderator` → UPDATE d'attribution, chemins de *promotion*, hors périmètre ; `list_session_tables`/`list_available_tables`/`get_questionnaire_responses` → `p.user_id = t.created_by` en JOIN d'*affichage* (pseudo de l'animateur) ; `end_turn_as_speaker` et `claim_floor` → gardes fondées sur `participants`/`leaderless`, aucune notion de `created_by`.

  **Pourquoi l'option (ii) — élargir les gardes — plutôt que (i) — faire poser `created_by` par `apply_allocation`** : vérifié dans le code avant application. `created_by` est une colonne **scalaire** → (i) interdit toute co-modération ; un modérateur peut être désigné **après** la création des tables (`claim_moderator_status` accepte `allocating` ET `debating` depuis le chantier 33, plus `assign_moderator_to_table` et `set_member_moderator`) → (i) obligerait à patcher ces chemins **et** à gérer le remplacement (retirer `created_by` à l'ancien) ; `created_by` sert aussi de donnée d'affichage dans `list_session_tables` ; et (i) laisse à découvert les tables créées par `create_tables_batch` avant qu'un modérateur ne soit assis. (ii) est purement **additive** — le créateur garde toute son autorité, rien de ce qui marche aujourd'hui ne régresse.

  **À faire (session de vérification)** : exécuter le fichier via le SQL Editor du dashboard Supabase (ou MCP) — surveiller les `NOTICE` éventuels du bloc `DO $guard$`, qui signalent une signature divergente en base et donc un écart entre les migrations et l'état réel. Puis dérouler les **5 requêtes de vérification en pied de fichier de migration** (helper présent avec le bon `search_path` ; aucune surcharge résiduelle sur les 9 fonctions ; plus aucun `created_by` dans leurs corps ; les 7 policies pointent sur le helper ; **table de vérité** du helper sur une vraie séance, qui liste membre par membre qui aurait l'autorité — la requête 5 permet de valider les cas négatifs sans avoir à se connecter sous chaque identité). Enfin dérouler le test manuel de la section **Parcours Modérateur** ci-dessous.

- [x] **Chantier 50 — `supabase/migrations/20260902_chantier50_close_identity_tables.sql`** ✅ **appliquée le 2026-09-02** — corrigeait une fuite de données personnelles. Reste à faire : les tests navigateur ci-dessous (jamais joués à l'écran) — notamment la comparaison avant/après sur l'onglet 🪑 Tables et le retrait du repli `loadTableAssignmentRows` (voir entrée dédiée, section Parcours Superadmin, **désormais actionnable puisque la migration est en place**).

  **Le problème** : `session_members` et `table_assignments` ont chacune une policy `SELECT USING (true)` pour le rôle `public`, héritée de `20260528_voting_app.sql`. Il n'y a pas de backend : le navigateur parle directement à Supabase avec la clé `anon`, qui est dans le bundle JS public. Un simple `GET /rest/v1/session_members` avec cette clé retourne **toutes** les colonnes de **tous** les inscrits de **toutes** les séances — dont `pseudo` (nom et prénom réels) et `reclaim_code` (le code à 4 chiffres, **en clair**, qui permet de reprendre l'inscription de quelqu'un d'autre). `table_assignments` expose de la même façon la composition complète des tables. Confirmé en base le 2026-09-02.

  **Contenu du fichier** :
  1. Helper `is_own_session_member(p_member_id uuid) RETURNS boolean`, `SECURITY DEFINER STABLE SET search_path = public, extensions` — anti-récursion, mêmes conventions qu'`is_table_participant` / `is_table_moderator` : la policy de `table_assignments` doit lire `session_members`, elle-même sous RLS.
  2. `session_members_select` (`USING (true)`) remplacée par `session_members_select_own` (`USING (user_id = auth.uid())`).
  3. `table_assignments_select` (`USING (true)`) remplacée par `table_assignments_select_own` (`USING (is_own_session_member(member_id))`).
  4. `list_table_assignments_admin(p_password, p_session_id) RETURNS jsonb`, SECURITY DEFINER + `check_superadmin_password` — la seule lecture croisée des deux tables dont l'app avait besoin (vue Groupes du superadmin). Retourne `table_number`, `member_id`, `table_id`, `pseudo`, `is_moderator`, triés par `table_number`.
  5. Un bloc `DO $chk$` **qui lève une exception** s'il reste, après coup, une autre policy SELECT permissive sur l'une des deux tables. Les policies permissives se cumulent en OR : une seule `USING (true)` oubliée (ajoutée par un chantier parallèle) suffirait à tout rouvrir en silence. Mieux vaut un échec bruyant qu'une fermeture illusoire.

  **Inventaire des policies fait avant écriture** (toutes les migrations du dépôt relues) — seule `20260528_voting_app.sql` crée des policies sur ces deux tables : `session_members_select` (SELECT, `true`), `session_members_insert` (INSERT, `WITH CHECK (false)`), `table_assignments_select` (SELECT, `true`). **Aucune policy UPDATE ni DELETE** : toutes les écritures passent déjà par des fonctions SECURITY DEFINER. Le **chantier 60**, mergé le même jour, n'a touché que les policies de `tables`, `queue_entries` et `speaking_turns` — aucun recouvrement ; son helper `is_table_moderator` lit bien `session_members` et `table_assignments`, mais en `SECURITY DEFINER`, donc **hors RLS** : ce chantier ne défait rien de son travail. Idem pour `get_my_table_assignment`, `list_session_members_admin`, `get_allocation_inputs`, `apply_allocation` et les `run_clustering_*`, toutes SECURITY DEFINER.

  **Ordre d'application** : après le chantier 60 (qui reste prioritaire), sans dépendance technique entre les deux — c'est uniquement une question de priorité de test.

  **Pourquoi le SQL peut être appliqué sans attendre le frontend, et réciproquement** : les deux sont livrés séparément (règle du 2026-09-01) et le code de ce chantier tient dans les deux sens. `SuperadminScreen.loadGroups()` appelle la RPC en chemin nominal et **retombe sur la lecture directe historique** si — et seulement si — PostgREST répond que la fonction est absente du schéma (`PGRST202`). Toute autre erreur (mot de passe refusé, réseau) remonte, pour ne pas masquer un échec réel derrière une lecture qui renverrait des membres `null` sous les nouvelles policies.

  **À faire (session de vérification)** :
  1. Exécuter le fichier via le SQL Editor du dashboard Supabase (ou MCP). Le bloc `DO $chk$` doit passer sans exception ; s'il en lève une, **ne pas contourner** — la lister et l'analyser, elle signale une policy permissive résiduelle inconnue de l'inventaire.
  2. Dérouler les requêtes de vérification en pied de fichier de migration (fonction présente ; RPC fonctionnelle sur une vraie séance ; RPC qui refuse un mauvais mot de passe ; lecture self-only côté participant connecté).
  3. **Vérification négative, clé anonyme, hors navigateur** (curl / Postman, en utilisant la clé `anon` publique du site, sans session utilisateur) — c'est le test qui prouve que la fuite est fermée :
     - `GET /rest/v1/session_members?select=pseudo,reclaim_code` → attendu `[]`
     - `GET /rest/v1/table_assignments?select=member_id` → attendu `[]`
     Ces deux requêtes retournent aujourd'hui la base entière : **les jouer AVANT l'application** pour constater la fuite, et après pour constater sa fermeture.
  4. Une fois la migration appliquée **et** les points « Parcours Superadmin » / « Parcours Participant » ci-dessous validés : supprimer le repli `loadTableAssignmentRows` dans `src/screens/SuperadminScreen.tsx` (le bloc `catch` et sa lecture directe) — il n'a plus de raison d'être et il est le dernier `.from('table_assignments')` du frontend. Entrée dédiée en section Superadmin ci-dessous.

  **Effet de bord souhaitable** : ce chantier referme aussi la question ouverte sur `REPLICA IDENTITY FULL` (`session_members`, migration chantier 35). Le WAL continue de transporter toutes les colonnes, `reclaim_code` compris, mais Realtime applique la RLS avant livraison : les événements ne partent plus qu'au propriétaire de la ligne.
- [x] **Chantier 61 — `supabase/migrations/20260902_chantier61_register_during_allocating.sql`** ✅ **appliquée le 2026-09-02**. Reste à faire : les 6 scénarios de test manuel ci-dessous (jamais joués à l'écran), y compris les scénarios 1 et 4 qui ne pouvaient pas passer avant cette application.

  **Contenu du fichier** :
  1. `DROP FUNCTION IF EXISTS register_session_member(uuid, text)` — supprime la **surcharge historique à 2 arguments** (migrations `20260528_voting_app.sql` puis `20260531_superadmin_features.sql`). La version à 3 arguments introduite par `20260622_pre_voting.sql` ne l'a jamais remplacée : `CREATE OR REPLACE` sur une arité différente **crée une seconde fonction**. L'ancienne est morte du point de vue de l'app (le wrapper `registerSessionMember` de `src/lib/voting.ts` envoie toujours les 3 paramètres nommés, PostgREST résout donc sur la 3-aire) mais elle porte encore le garde de phase d'origine, qui ignore jusqu'à `pre_voting`.
  2. `CREATE OR REPLACE FUNCTION register_session_member(uuid, text, text) RETURNS jsonb` — **même signature, mêmes noms de paramètres, même type de retour** que la version en place : seule la liste des phases autorisées change, `('draft','pre_voting','voting')` → `('draft','pre_voting','voting','allocating')`. `attending_in_person` reste calculé par `v_phase != 'pre_voting'`, donc `true` en `allocating` : quelqu'un qui s'inscrit pendant que les tables se forment est nécessairement sur place. `joined_phase` prendra la nouvelle valeur `'allocating'` (colonne `text` libre, sans CHECK).

  **Pourquoi** : demande explicite de Jules — les retardataires doivent encore pouvoir rejoindre la séance et voter pendant que l'organisateur calcule la répartition. Aujourd'hui ils reçoivent « La séance n'est pas en phase d'inscription (phase: allocating) » en rouge, sans aucune issue.

  **À faire (session de vérification)** :
  1. **Avant** d'appliquer, confirmer la signature ciblée (piège Postgres documenté dans `CLAUDE.md`) :
     ```sql
     SELECT p.oid::regprocedure,
            pg_get_function_identity_arguments(p.oid),
            pg_get_function_result(p.oid)
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'register_session_member';
     ```
     Attendu : `register_session_member(uuid, text, text)` → `jsonb`, et **possiblement** une seconde ligne `register_session_member(uuid, text)` (celle que le DROP retire). Si le résultat montre autre chose — notamment un type de retour différent de `jsonb` — **ne pas appliquer** et remonter le point : le `CREATE OR REPLACE` échouerait.
  2. Appliquer le fichier via le SQL Editor du dashboard Supabase (ou MCP).
  3. Rejouer la requête ci-dessus : il ne doit rester **qu'une** ligne, la 3-aire.
  4. Dérouler le test manuel de la section Participant ci-dessous.

  **Tant qu'elle n'est pas appliquée** : le formulaire d'entrée s'affiche bien en phase `allocating` (partie React livrée), mais toute inscription d'un **nouveau** nom échoue avec l'ancien message d'erreur. Les **reconquêtes** (nom déjà inscrit, ou code de rappel) fonctionnent en revanche déjà sans la migration — elles passent par `confirm_attendance`, qui ne teste aucune phase.

  **Point de conception tranché et vérifié par lecture du SQL** : `cast_vote`, `submit_assertion` et `submit_entry_response` (définitions courantes : `20260528_voting_app.sql` pour les deux premières, `20260725_1_onboarding_3_questions.sql` pour la troisième) **n'ont aucun garde de phase** — ils n'exigent qu'une ligne `session_members`. Le vote pendant l'allocation fonctionnait donc **déjà** côté serveur ; seul le chemin d'entrée bloquait. Aucune policy RLS ne teste la phase non plus (vérifié sur `session_members`, `entry_responses`, `assertions`, `assertion_votes`). C'est ce qui réduit ce chantier à une seule ligne de SQL utile plus deux conditions React.

- [ ] **Chantier 65 — `supabase/migrations/20260902_chantier65_register_session_member_reject_draft.sql`** (nouvelle, jamais appliquée) — une séance en phase `draft` ne doit être accessible à personne.

  **Le problème (revue de parcours du 2026-09-02)** : `create_session` attribue le `join_code` **dès la création** de la séance, en phase `draft`. Or `register_session_member` acceptait encore `draft` dans sa liste de phases autorisées (héritage jamais retiré, y compris par le chantier 61 juste au-dessus, qui a ajouté `allocating` sans retirer `draft`). Résultat : quiconque a le lien, ou repérait la séance dans l'onglet « Créer » de l'accueil (qui la listait), pouvait s'inscrire et voter avant que l'organisateur ait ouvert quoi que ce soit.

  **Inventaire fait avant d'écrire** (comme demandé — chercher plus large que le brief) :
  1. `register_session_member` acceptait `draft` → corrigé ci-dessous.
  2. `SessionRouterScreen.tsx` redirigeait une séance `draft` vers `#vote/` comme les autres phases d'inscription → corrigé côté frontend (nouveau statut `not_open`, message "Séance pas encore ouverte" au lieu d'une redirection qui de toute façon échouerait maintenant à l'inscription).
  3. `VoteScreen.tsx` (accessible directement via `#vote/<join_code>`, pas seulement via le routeur) affichait le formulaire de pseudo pour une séance `draft` → corrigé côté frontend (nouvelle étape `not_open`, même message).
  4. L'onglet « Créer » de `EntryScreen.tsx` listait les séances `draft` (`.in('phase', ['draft', 'pre_voting', 'voting', 'debating'])`) → `draft` retiré de la liste.
  5. **Trouvé en creusant, absent du brief initial** : `confirm_attendance` — appelée par `VoteScreen.tsx` uniquement en phase `voting`/`allocating` côté frontend, mais c'est une RPC `SECURITY DEFINER` appelable directement, et elle **ne testait strictement aucune phase** (déjà noté en passant par le chantier 61 juste au-dessus, ligne 98 : « elles passent par `confirm_attendance`, qui ne teste aucune phase »). Son cas 3 (pseudo non trouvé) fait un `INSERT` de tout nouveau `session_members`, sans jamais passer par `register_session_member` — donc sans jamais toucher le garde-fou du point 1. Et la table `sessions` a une policy `sessions_select ON sessions FOR SELECT USING (true)` (`20260526000001_sessions_schema.sql`, jamais restreinte depuis) : **n'importe qui peut lister toutes les séances, y compris en brouillon, par une requête REST directe avec la clé anon publique**, sans même passer par l'onglet « Créer ». Sans corriger `confirm_attendance`, retirer `draft` de `register_session_member` et de l'onglet « Créer » ne fermait donc rien : `confirm_attendance(session_id, pseudo:'Test')` sur une séance en brouillon créait quand même un membre `attending_in_person = true`. Corrigé dans le même fichier de migration (garde de phase ajouté en tête de fonction, comportement inchangé pour toutes les autres phases).
  6. Vérifié et laissés **inchangés**, car déjà corrects ou non concernés : `claim_moderator_status` (déjà `IF v_phase NOT IN ('pre_voting', 'voting', 'allocating', 'debating')` — `draft` déjà exclu) ; `reclaim_prevoting_member` (déjà `IF v_phase != 'pre_voting'` — `draft` déjà exclu) ; `cast_vote`/`submit_assertion`/`submit_entry_response` (aucun garde de phase, mais exigent tous une ligne `session_members` existante — protégés transitivement une fois les points 1 et 5 fermés, aucun membre ne pouvant plus se créer pendant `draft`) ; `EntryScreen.tsx` "Séances en cours" et onglet "Modérateur" (excluaient déjà `draft` de leurs requêtes) ; `PastSessionsModal` (filtre déjà `phase = 'closed'`).

  **Résidu non corrigé, à trancher par Jules** : la policy `sessions_select ON sessions FOR SELECT USING (true)` reste ouverte à la lecture complète pour tout le monde (même défaut que celui fermé par le chantier 50 sur `session_members`/`table_assignments`) — après ce chantier, lire une séance `draft` en REST direct ne permet plus de s'y inscrire ni d'y voter (portes fermées côté fonctions), mais son `title`/`description`/`join_code` restent lisibles par quiconque connaît ou devine son `id`. Restreindre cette policy est un chantier à part : plusieurs écrans (accueil, superadmin) lisent `sessions` sans mot de passe pour l'affichage, il faudrait vérifier chacun avant de resserrer la RLS sans rien casser.

  **Le superadmin garde un accès complet à sa séance en brouillon** : toutes ses actions de préparation (`create_session`, `update_session_docs`, `attach_table_to_session`/`detach_table_from_session`, `set_session_phase`, `list_session_tables`) passent par des RPC `SECURITY DEFINER` à mot de passe superadmin, jamais par `register_session_member`/`confirm_attendance` — aucune de ces deux fonctions n'est touchée par ce chantier de son côté. Voir le scénario de non-régression en section Superadmin ci-dessous.

  **À faire (session de vérification)** :
  1. **Avant** d'appliquer, confirmer les deux signatures ciblées (piège Postgres, cf. `CLAUDE.md`) :
     ```sql
     SELECT p.oid::regprocedure, pg_get_function_identity_arguments(p.oid), pg_get_function_result(p.oid)
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN ('register_session_member', 'confirm_attendance');
     ```
     Attendu : une seule ligne par fonction — `register_session_member(uuid, text, text)` → `jsonb` et `confirm_attendance(uuid, text, text)` → `jsonb`. Si une surcharge apparaît, s'arrêter et remonter le point avant d'appliquer.
  2. Appliquer le fichier via le SQL Editor du dashboard Supabase (ou MCP).
  3. Vérification directe en SQL : sur une séance de test en phase `draft`, `SELECT register_session_member('<id>', 'Test');` et `SELECT confirm_attendance('<id>', 'Test', NULL);` doivent tous deux lever « La séance n'est pas en phase d'inscription (phase: draft) ». Repasser la séance en `pre_voting` et rejouer les deux : succès, comme avant ce chantier.
  4. Vérification négative REST (clé anon publique, hors navigateur) — confirme que le trou `sessions_select` reste ouvert en lecture mais que les portes d'inscription sont bien fermées : créer une séance de test en `draft`, noter son `id`, puis `POST /rest/v1/rpc/register_session_member` et `POST /rest/v1/rpc/confirm_attendance` avec cet `id` → attendu : erreur 400 avec le message de phase, dans les deux cas.
  5. Dérouler les 3 scénarios de test manuel ci-dessous (Participant × 2, Superadmin × 1 — non-régression).

- [ ] **Chantier 48 — `supabase/migrations/20260902_chantier48_switch_table.sql`**

  **Contenu du fichier** : crée `switch_table(p_session_id uuid, p_join_code text, p_pseudo text) returns jsonb` — permet à un participant de rejoindre une autre table que celle qui lui a été assignée, depuis `AllocatingScreen`. Vérifie que le code correspond à une table de **cette** séance (sinon exception explicite), que le participant n'est pas déjà à cette table, puis **retire proprement** toute ligne `participants` de l'utilisateur dans les autres tables de la séance (libère le micro/clôt le tour en cours si besoin, même traitement que `kick_participant`) avant d'insérer la nouvelle ligne et de déplacer `table_assignments` via `sync_table_assignment` (déjà existante, chantier 26). Voir l'en-tête du fichier de migration pour le détail du raisonnement (pourquoi une RPC dédiée plutôt que réutiliser `join_table`).

  **À faire (session de vérification)** : exécuter le contenu du fichier via le SQL Editor du dashboard Supabase (ou MCP), confirmer `SELECT proname FROM pg_proc WHERE proname = 'switch_table'` retourne la fonction, puis dérouler le test manuel ci-dessous (section Participant). **Avant d'appliquer**, nettoyer si possible les 2 lignes `participants` orphelines laissées dans la table `589D79` par la vérification navigateur de ce chantier (voir section Nettoyage plus bas) — pas strictement nécessaire pour tester, mais ça fausse le compte de présents affiché en `ParticipantView`.

- [ ] **Chantier 46 — `supabase/migrations/20260901_chantier46_public_results_visibility.sql`**

  **Contenu du fichier** :
  1. `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS results_public boolean NOT NULL DEFAULT false` — opt-in explicite par séance, aucune séance existante ne devient publique automatiquement.
  2. `set_session_results_public(password, session_id, results_public)` — RPC superadmin (mot de passe requis) qui bascule la colonne. Utilisée par le nouveau bouton "Résultats publics" / "Résultats privés" sur chaque séance close du superadmin (`SessionCard`, écran de liste).
  3. `get_public_results(session_id)` **remplacé** — durci pour exiger `phase='closed' AND results_public=true` (avant : `phase='closed'` seul, donc *toute* séance close était déjà publique — comportement qui n'avait jamais été demandé). Charge utile changée : au lieu d'un résumé filtré (top-3 assertions par camp + consensus > seuil), retourne désormais la liste complète des assertions approuvées avec leurs compteurs `agree_count`/`disagree_count`/`pass_count`, et le nuage de points PCA (`pca_x`, `pca_y`, `group_id` — **sans** `member_id` ni aucun identifiant, contrairement à `get_results_map` qui est réservée aux membres inscrits). Le fichier de migration contient en pied de page les requêtes SQL de vérification (colonne, séance non-publique → NULL, séance publique → payload sans identifiant, appel anonyme, mauvais mot de passe).

  **Pourquoi cette migration change le comportement de l'existant** : la fonction `get_public_results` existait déjà (chantier antérieur, migration `20260613_public_results.sql`) et rendait **toute** séance close consultable publiquement dès sa clôture — sans bascule de visibilité. Le retour de test de Jules du 2026-09-01 demande explicitement à restreindre l'accès aux séances *explicitement marquées visibles*, pas à tout l'historique clos. Tant que cette migration n'est pas appliquée, l'ancien comportement (tout closed = public) reste actif en base, et l'ancienne forme de payload (`groups`/`consensus`) ne correspond plus à ce qu'attend le frontend (`points`/`assertions`) — voir le point "Résultats publics" ci-dessous pour l'impact exact sur les tests.

  **À faire (session de vérification)** : appliquer le fichier, dérouler les 5 requêtes de vérification en pied de fichier (colonne + défaut, séance non-publique → NULL, séance publique → payload strictement `k_chosen`/`points`/`assertions` sans `member_id`/`user_id`/`pseudo`, appel anonyme fonctionnel, mauvais mot de passe rejeté), puis dérouler le test manuel de la section "Résultats publics (chantier 46)" plus bas.

- [ ] **Chantier 33 — `supabase/migrations/20260801_chantier33_moderator_table_assignment.sql`** (statut d'application non confirmé — aucune trace de vérification post-application dans l'historique, contrairement aux migrations chantier-35 et chantier-37 ci-dessous)

  **Contenu du fichier** : redéfinit `claim_moderator_status(session_id, creation_code, pseudo?)` pour (a) accepter la phase `debating` en plus de `pre_voting`/`voting`/`allocating`, et (b) asseoir automatiquement le nouveau modérateur sur la première table animée encore sans modérateur (ordre des numéros de table) via une nouvelle ligne `table_assignments`. Crée aussi `assign_moderator_to_table(password, session_id, table_number, member_id)` — assignation manuelle superadmin, pose `is_moderator=true` + `table_assignments`.

  **À faire (session de vérification)** : exécuter le contenu du fichier via le SQL Editor du dashboard Supabase (ou MCP), confirmer `SELECT proname FROM pg_proc WHERE proname IN ('claim_moderator_status','assign_moderator_to_table')` retourne bien les deux fonctions à jour, puis cocher cette entrée et dérouler le test manuel du chantier 33 ci-dessous (section Superadmin). **Tant qu'elle n'est pas appliquée** : le contrôle d'ajout/retrait de modérateur par table (`AddModeratorControl`) échoue silencieusement côté RPC, et l'auto-assise en phase `debating` reste bloquée par l'ancienne signature de `claim_moderator_status`.

- [ ] **Chantier 39 — `supabase/migrations/20260901_chantier39_remove_questionnaire_phase.sql`** (jamais appliquée)

  **Contenu du fichier** :
  1. `UPDATE sessions SET phase = 'closed', phase_changed_at = now() WHERE phase = 'questionnaire'` — au moment de l'écriture, aucune séance de la base de test n'était dans cet état (vérifié par requête REST anon `select id,title,phase,join_code`), mais la migration doit rester idempotente/défensive pour toute séance réelle qui y serait encore.
  2. Contrainte `sessions_phase_check` réécrite sans `'questionnaire'` (`draft`, `pre_voting`, `voting`, `allocating`, `debating`, `closed`).
  3. `set_session_phase(password, session_id, phase)` réécrite avec la même liste sans `'questionnaire'` — sinon la fonction acceptait toujours l'ancienne valeur alors que le frontend ne l'envoie plus jamais.

  **Pourquoi retirer la phase plutôt que la garder mais inutilisée** : Jules a demandé explicitement la suppression (« on va supprimer cette phase ») — le questionnaire post-débat se déclenche désormais automatiquement à la sortie de `debating` (voir entrée dédiée, section "Questionnaire post-débat" plus bas) au lieu de nécessiter une étape de phase manuelle.

  **À faire (session de vérification)** : exécuter le fichier via le SQL Editor (ou MCP), puis `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'sessions_phase_check'` pour confirmer l'absence de `'questionnaire'` dans la définition, et `SELECT count(*) FROM sessions WHERE phase = 'questionnaire'` doit retourner 0. **Tant qu'elle n'est pas appliquée** : si une séance reste dans l'ancienne phase `questionnaire` (aucune trouvée dans la base de test au moment de l'écriture), `SuperadminScreen.tsx` ne la reconnaît plus dans `PHASE_SEQUENCE` (`indexOf` retourne -1) et affiche un `PhaseBar` incohérent (case courante non repérée, bouton suivant pointant vers `draft`) — appliquer la migration avant de rouvrir une telle séance dans le superadmin plutôt que de cliquer les boutons de phase pour la sortir de cet état.

- [ ] **Chantier 44 — `supabase/migrations/20260902_chantier44_add_offline_participant.sql`** (nouvelle fonction, jamais appliquée)

  **Contenu du fichier** : crée `add_offline_participant(p_table_id uuid, p_pseudo text) RETURNS jsonb`, `SECURITY DEFINER`. Garde d'autorisation identique à `kick_participant`/`grant_floor` (`tables.created_by = auth.uid()`). Reprend uniquement le cœur de `join_table` — `INSERT INTO participants (table_id, user_id, pseudo) VALUES (p_table_id, auth.uid(), btrim(p_pseudo)) ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id` — sans jamais appeler `sync_table_assignment` (voir justification détaillée dans l'entrée "Chantier 43/44" du parcours Modérateur ci-dessous : appelé sous l'identité du modérateur, ce mécanisme pollue par erreur `session_members` avec une ligne fantôme). SQL exact :

    ```sql
    CREATE OR REPLACE FUNCTION add_offline_participant(
      p_table_id uuid,
      p_pseudo   text
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      v_participant_id uuid;
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM tables WHERE id = p_table_id AND created_by = auth.uid()
      ) THEN
        RAISE EXCEPTION 'Non autorisé';
      END IF;

      IF p_pseudo IS NULL OR btrim(p_pseudo) = '' THEN
        RAISE EXCEPTION 'Pseudo requis';
      END IF;

      INSERT INTO participants (table_id, user_id, pseudo)
      VALUES (p_table_id, auth.uid(), btrim(p_pseudo))
      ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
      RETURNING id INTO v_participant_id;

      RETURN jsonb_build_object('participant_id', v_participant_id);
    END;
    $$;
    ```

  **À faire (session de vérification)** : exécuter ce SQL (fichier ou copié ci-dessus) via le SQL Editor du dashboard Supabase (ou MCP), confirmer `SELECT proname FROM pg_proc WHERE proname = 'add_offline_participant'` retourne la fonction, puis cocher cette entrée et dérouler le test du chantier 44 (section Parcours Modérateur, entrée "Chantier 43/44"). **Tant qu'elle n'est pas appliquée** : le bouton "Ajouter une personne sans téléphone" échoue à l'appel RPC (fonction PostgreSQL inexistante — erreur affichée dans le formulaire, rien de silencieux côté UI).

- [x] **Chantier 51 — `supabase/migrations/20260902_chantier51_hide_assertion_author.sql`** ✅ **appliquée le 2026-09-02** — anonymat réel des auteurs d'assertions. Le point bloquant Realtime ci-dessous (fuite possible de `member_id` par WebSocket) et le reste du test manuel n'ont **toujours pas été joués à l'écran** — c'est désormais possible puisque la migration est en place.

  **⚠️ Point bloquant non tranchable sans accès DB, à vérifier EN PREMIER (avant de considérer ce chantier clos)** : ce correctif retire `member_id` de la lecture REST directe de `assertions`, mais on ne sait pas si Supabase Realtime applique les mêmes privilèges de colonne aux charges utiles `postgres_changes` — si le WebSocket continue de pousser `member_id` dans ses payloads, la fuite subsiste par ce canal et ce correctif est insuffisant à lui seul.
  **Manipulation exacte** : une fois la migration appliquée, dans `src/screens/VoteScreen.tsx` l.365 (`payload => { const a = payload.new as Assertion`), ajouter temporairement `console.log('[chantier51] payload.new', payload.new)` juste après. Recharger `#vote/<join_code>` sur une séance en phase `voting` avec des assertions `pending`, ouvrir la console DevTools du participant, puis côté superadmin approuver une assertion (`approve_assertion`) pour déclencher l'événement UPDATE. Lire l'objet loggé : présence ou non de la clé `member_id`.
  - Si **absent** : le correctif est complet, rien à faire de plus. Retirer le `console.log` et cocher cette entrée.
  - Si **présent** : la fuite passe par le WebSocket — ne pas improviser de correctif côté client. Solution de repli connue : une vue `assertions_public` (sans `member_id`) avec sa propre policy, lue à la place de la table par `VoteScreen.tsx` — chantier distinct à ouvrir. Documenter le résultat ici avant de considérer le chantier 51 clos.

  **Contexte (audit sécurité 2026-08-03, constat B5)** : `assertions_select_approved` (`FOR SELECT USING (status = 'approved')`) filtre les LIGNES mais laisse passer toutes les colonnes, dont `member_id`. Comme `session_members` est lisible publiquement (nom/prénom réels), une simple requête REST anonyme (`GET /rest/v1/assertions?select=member_id,...`) suivie d'une jointure sur `session_members` désanonymise l'auteur de n'importe quelle assertion approuvée — sur des sujets clivants, dans une école où les gens se croisent. Le front est déjà discipliné (`VoteScreen.tsx` liste ses colonnes et exclut `member_id` depuis la migration `20260721_hide_assertion_author.sql`, commentaire "E2 — anonymat des auteurs") mais ce masquage front ne protège pas un appel REST direct.

  **Contenu du fichier** :
  1. `REVOKE SELECT ON assertions FROM anon, authenticated` puis `GRANT SELECT (id, session_id, content, status, created_at) ON assertions TO anon, authenticated` — retire l'accès à la colonne `member_id` en lecture directe, sans toucher la policy de ligne existante. Colonnes de `assertions` vérifiées exhaustivement dans `supabase/migrations/` (créées par `20260528_voting_app.sql`, jamais modifiées depuis) : `id, session_id, member_id, content, status, created_at` — seule `member_id` est retirée, c'est le seul identifiant reliant une assertion à son auteur.
  2. `get_my_assertion_ids(p_session_id uuid) RETURNS uuid[]`, `SECURITY DEFINER` — remplace la requête `VoteScreen.tsx` qui lisait `member_id` dans une clause `WHERE` pour compter "mes propositions" (`proposedCount`) ; un `GRANT SELECT` restreint à certaines colonnes interdit aussi d'utiliser les colonnes non accordées dans `WHERE`, d'où le passage par une RPC (comme tous les autres accès à `assertions` qui touchent `member_id` : `submit_assertion`, `approve_assertion`, etc., déjà `SECURITY DEFINER`, non modifiées ici).

  **Code frontend déjà livré (ne dépend pas de la migration pour compiler/charger)** : `getMyAssertionIds(sessionId)` ajouté dans `src/lib/voting.ts`, appelé depuis `loadVoteData` (`src/screens/VoteScreen.tsx` l.~305-320) à la place de l'ancienne requête `.from('assertions').select('id').eq('member_id', m.id)`, avec un `.catch(() => [])` (même garde que `SuperadminScreen.loadGroups`) pour qu'un échec RPC ne fasse pas rejeter tout le `Promise.all` et bloquer aussi le chargement des assertions/votes. `npx tsc -b` OK. **Tant que la migration n'est pas appliquée**, cet appel RPC échoue silencieusement (`PGRST202` — fonction inexistante, absorbée par le `.catch`) : le compteur "mes propositions" (`proposedCount`) reste à 0 en permanence, mais le reste du flux (liste des assertions, vote, polling) continue de fonctionner normalement — pas de blocage total, juste ce compteur faux tant que la migration n'est pas en place.

  **À faire (session de vérification)** :
  1. Exécuter le fichier via le SQL Editor du dashboard Supabase (ou MCP), confirmer `SELECT proname FROM pg_proc WHERE proname = 'get_my_assertion_ids'` retourne la fonction.
  2. Vérification négative REST (clé anon publique, hors navigateur) :
     - `GET /rest/v1/assertions?select=member_id` → attendu `42501`/403.
     - `GET /rest/v1/assertions?select=id,session_id,content,status,created_at` → doit continuer à fonctionner normalement.
  3. Dérouler le parcours de vote complet (`#vote/<join_code>`, séance `pre_voting` ou `voting`) : liste des assertions, compteur "X / Y votées" cohérent, proposer une assertion et vérifier qu'elle compte bien comme "la mienne" (`proposedCount` — cassé silencieusement avant l'application de la migration, cf. ci-dessus), polling de secours (approuver une assertion côté superadmin → apparition côté participant en moins de 15s), écran "Tu as tout voté", bouton "Voir toutes".
  4. Le point bloquant Realtime en tête de cette section — à faire avant de clore le chantier.

## Résultats publics (chantier 46)

*Nécessite la migration SQL ci-dessus appliquée pour tester le flux de bout en bout (nouvelle colonne `results_public` + nouvelle forme du payload `get_public_results`). Sans elle : le bouton "Résultats publics" du superadmin échoue avec l'erreur Postgres "column sessions.results_public does not exist" (vérifié en navigateur ci-dessous, échec propre — pas de crash) et `get_public_results` renvoie encore l'ancienne forme (`groups`/`consensus`) que le frontend ne lit plus, donc `points`/`assertions` restent vides même pour une séance déjà close.*

- [ ] **2026-09-01 — Bouton "Voir tous les débats" (accueil)** — `src/screens/EntryScreen.tsx`

  Lien externe vers `https://ecclesia-centralesupelec.vercel.app/#debats` (site public Ecclesia, hébergé à part sur Vercel), `target="_blank" rel="noopener noreferrer"`. Placé en pied de carte d'accueil, au-dessus du lien "Administration".

  **Déjà vérifié en navigateur** : présent sur l'écran d'accueil, `href`/`target`/`rel` corrects (lu via le DOM), zéro erreur console au chargement de l'écran.

  **Non vérifiable en session headless** : l'ouverture réelle d'un nouvel onglet vers un domaine externe (Vercel) n'a pas été cliquée pour de vrai — seuls les attributs du lien ont été inspectés.

- [ ] **2026-09-01 — Modale "Anciennes séances" (accueil)** — `src/screens/EntryScreen.tsx` (`PastSessionsModal`)

  Bouton "Voir les votes des anciennes séances" en pied de carte d'accueil → modale listant les séances `phase='closed' AND results_public=true` (titre, date, description), triées par date décroissante. Clic sur une séance → `#results/<id>` (nouvelle route directe par id, pas de join_code — un `join_code` de séance close peut être réutilisé par une séance non-close plus récente, donc le routage par id évite toute ambiguïté).

  **Déjà vérifié en navigateur (avant migration)** : la modale s'ouvre, affiche "Anciennes séances" avec bouton de fermeture, la requête échoue proprement avec le message Postgres explicite affiché à l'écran ("column sessions.results_public does not exist") — pas de page blanche, pas d'exception React non gérée. Fermeture de la modale (✕) fonctionne.

  **Test minimal (après migration)** : au moins une séance `closed` avec `results_public=true` créée par la session de vérification (via le nouveau bouton superadmin ci-dessous) → vérifier son apparition dans la liste, triée correctement si plusieurs. Cliquer dessus → arrivée sur `#results/<id>` (voir section dédiée ci-dessous). Vérifier aussi le cas vide ("Aucune séance aux résultats publics pour l'instant.") si aucune séance n'est encore marquée visible.

- [ ] **2026-09-01 — Bouton "Résultats publics" par séance (superadmin)** — `src/screens/SuperadminScreen.tsx` (`SessionCard`)

  Sur chaque séance `closed` de la liste superadmin (écran de liste, avant d'ouvrir le détail) : pastille bascule "Résultats privés" (gris) / "Résultats publics" (vert) à côté de la description. Appelle `set_session_results_public` (mot de passe déjà en session), mise à jour optimiste de la liste avec rollback si l'appel échoue (message d'erreur affiché sous la pastille). Nommage tranché sans consulter Jules davantage : "Résultats publics" plutôt que sa proposition "Visible post débat" — le libellé décrit l'effet (qui peut voir quoi) plutôt que le moment (déjà capturé par le badge de phase "Clôturée" juste au-dessus), cohérent avec le style des autres badges d'état de la carte.

  **Non testable en session headless** : aucun mot de passe superadmin disponible. Uniquement vérifié : `tsc -b`, `npm test` (94 passants), `npm run build`, chargement de l'écran d'accueil sans erreur console. Le comportement d'échec pré-migration (colonne absente) a été vérifié indirectement via la modale "Anciennes séances" ci-dessus, qui tape la même colonne.

  **Test minimal (mot de passe superadmin requis, migration appliquée au préalable)** : ouvrir une séance close depuis la liste, cliquer la pastille → passe à "Résultats publics" sans reload ; recharger la page → l'état persiste (relu depuis `sessions.results_public`) ; cliquer à nouveau → repasse à "Résultats privés". Vérifier qu'aucune pastille n'apparaît sur les séances non closes.

- [ ] **2026-09-01 — Page de résultats publics** — `src/screens/PublicResultsScreen.tsx`, routes `#results/<session_id>` et `#session/<join_code>` (phase closed, visiteur non inscrit)

  Page unique : nuage de points PCA anonyme (aucun `member_id`, mêmes couleurs/légende que l'onglet Analyse du superadmin) si une analyse existe, puis liste complète des assertions approuvées avec barre agree/disagree/pass et compteurs. Accessible sans connexion (auth anonyme uniquement). Aucune table, aucun pseudo, aucun découpage par table de débat — vérifié en lisant le payload exact retourné par `get_public_results` (voir requêtes de vérification dans le fichier de migration) : seulement `k_chosen`, `points[].{pca_x,pca_y,group_id}`, `assertions[].{content,agree_count,disagree_count,pass_count}`.

  **Déjà vérifié en navigateur (avant migration)** : `#results/<uuid inexistant>` → "Séance introuvable." affiché proprement (pas de crash), zéro exception React. `#results/<id>` sans `session` prop résout bien la séance par id avant de charger les résultats (chemin de code distinct de l'usage existant via `SessionRouterScreen`, qui passe toujours `session` directement).

  **Non testable avant migration** : le rendu réel avec des données (nuage de points + assertions) — la fonction `get_public_results` encore déployée renvoie l'ancienne forme (`groups`/`consensus`), donc `data.points`/`data.assertions` restent vides même pour une séance close existante avec `results_public` inexistant en base.

  **Test minimal (après migration, mot de passe superadmin pour préparer une séance de test)** : séance close avec au moins une analyse d'opinion lancée et quelques assertions votées → marquer `results_public=true` (bouton superadmin ci-dessus) → ouvrir `#results/<id>` (via la modale accueil) et `#session/<join_code>` (si le join_code est encore d'actualité) en visiteur non connecté (nouvel onglet privé / navigateur non inscrit à la séance) → vérifier l'affichage du nuage de points, des assertions avec compteurs, l'absence totale de nom/pseudo/table à l'écran, zéro erreur console. Démarquer `results_public=false` → revérifier que la page affiche "non disponibles publiquement" (le RPC renvoie NULL).

## Parcours Superadmin

- [ ] **2026-09-02 — Chantier 50 — onglet 🪑 Tables sous les policies self-only** — `src/screens/SuperadminScreen.tsx` (`loadGroups`, `loadTableAssignmentRows`), `src/lib/sessions.ts` (`listTableAssignmentsAdmin`) *(migration SQL requise, voir plus haut)*

  **Ce qui change** : la vue Groupes lisait `table_assignments` en direct avec une **jointure imbriquée PostgREST** (`session_members!member_id(pseudo, is_moderator)`), qui traversait les deux tables permissives d'un coup. Sous les policies self-only, PostgREST **ne renvoie pas d'erreur** dans ce cas : l'objet imbriqué devient `null` et les listes de membres se videraient en silence. La lecture passe désormais par la RPC `list_table_assignments_admin`. Le superadmin n'étant membre d'aucune séance, il perd aussi tous les événements Realtime sur `table_assignments` : un polling de secours de 10 s prend le relais (l'abonnement Realtime est conservé — il resservira si le superadmin est un jour membre, et il ne coûte rien).

  **C'est une régression silencieuse qu'on cherche, pas un crash** : le symptôme d'un échec serait des tables affichées **vides** ou des pseudos remplacés par `?`, sans le moindre message d'erreur.

  **Test — AVANT application de la migration** (état actuel de la base, repli actif) :
  1. Ouvrir une séance en `allocating` (ou `debating`), onglet 🪑 Tables → la composition de chaque table doit s'afficher normalement (pseudos, badges modérateur, barre de camps, badges de seuil, badge « enregistrable »).
  2. La console navigateur doit afficher **une fois par chargement** `[chantier 50] RPC list_table_assignments_admin absente — repli sur la lecture directe`. C'est le comportement attendu tant que le SQL n'est pas appliqué.
  3. Glisser-déposer un membre d'une table à une autre → il change de table, et les badges de seuil des deux tables se recalculent immédiatement.

  **Test — APRÈS application de la migration** (chemin nominal) :
  1. Recharger la même séance, même onglet → **exactement les mêmes membres, mêmes pseudos, mêmes badges** qu'avant. C'est la comparaison qui compte : une table qui perd ses membres ou affiche des `?` est l'échec caractéristique.
  2. Plus aucun message `[chantier 50] … repli …` en console (si le message revient, la RPC est absente ou son nom diffère → la migration n'a pas été appliquée, ou pas entièrement).
  3. Glisser-déposer à nouveau un membre → fonctionne, diagnostics recalculés en direct.
  4. Bouton « 🖨️ Récapitulatif » → la vue récapitulative liste bien tous les membres par table.
  5. Assigner un modérateur à une table (glisser-déposer sur la zone « Ajouter un modérateur », **et** saisie du nom avec autocomplete) → le membre apparaît bien avec son badge modérateur.

  **Test du polling de 10 s — trois choses à regarder ensemble** :
  1. **Il fonctionne** : laisser l'onglet 🪑 Tables ouvert, faire un changement depuis un 2ᵉ onglet superadmin (déplacer un membre) → le 1ᵉʳ onglet doit refléter le changement seul, en ≤ 10 s, sans reload.
  2. **Il ne réintroduit pas le bug du chantier 38** : scroller loin dans la fiche séance, ne plus toucher au clavier ni à la souris pendant ≥ 40 s → **la page ne doit jamais remonter en haut**. Le polling met les données à jour en place ; `groupsLoading` ne pilote qu'un petit spinner à côté du bouton Récapitulatif, jamais un état de chargement plein écran. C'est le point de vigilance principal de ce chantier côté UX.
  3. **Il ne clignote pas** : le badge vert « à jour à HH:MM:SS » ne doit **pas** se transformer en spinner toutes les 10 s. Les rafraîchissements de fond sont volontairement silencieux (`loadGroups(true)`) ; seuls le chargement initial et les rechargements consécutifs à une action montrent le spinner. L'horodatage du badge, lui, doit bien avancer.
  4. Quitter l'onglet 🪑 Tables / changer de phase (`closed`) → le polling doit s'arrêter (il n'est actif qu'en `allocating` et `debating`) : vérifiable dans l'onglet Réseau, plus d'appel `list_table_assignments_admin` toutes les 10 s.

  **Course connue, non corrigée** (à signaler seulement si elle se manifeste vraiment) : un tick de polling parti **avant** un glisser-déposer peut arriver **après** lui et réafficher l'état antérieur pendant ≤ 10 s. Le glisser-déposer n'est pas optimiste (il attend la RPC puis recharge), donc rien n'est perdu en base — c'est un affichage transitoire. La même course existait déjà avec le rafraîchissement déclenché par Realtime ; elle n'a pas été traitée ici pour ne pas ajouter de machinerie d'annulation à un écran déjà dense.

- [ ] **2026-09-02 — Chantier 50 — retirer le repli de lecture directe, la migration est appliquée** — `src/screens/SuperadminScreen.tsx` (`loadTableAssignmentRows`)

  **La moitié « migration appliquée » de la condition ci-dessous est désormais remplie (2026-09-02)** — reste la moitié « tests passés ». Une fois les deux séries de tests ci-dessus jouées (elles ne l'ont jamais été à l'écran, voir l'avertissement en tête de fichier), supprimer le bloc `catch` de `loadTableAssignmentRows` et n'y laisser que l'appel à `listTableAssignmentsAdmin`. Ce repli n'existe que pour couvrir la fenêtre entre le déploiement du frontend et l'application du SQL ; tant qu'il est là, il reste le **dernier `.from('table_assignments')` du frontend**, et il masquerait une future disparition de la RPC. À ne pas supprimer avant d'être certain que la migration est en base **en production** (pas seulement confirmé par l'orchestration côté outillage) et que le comportement observé est identique avant/après.

- [ ] **2026-09-01 — Chantier 38 (2ème passe) — scroll qui remonte en haut sur la fiche séance** — `src/screens/SuperadminScreen.tsx` (`SessionDetail`)

  **Retour de Jules** : « toutes les 10 secondes ou moins » l'écran superadmin « nous remmène en haut de la page » — constaté sans aucune session Claude Code active, sur tous les onglets superadmin (🟢 En direct / 🪑 Tables / ⚙️ Préparation / 📊 Analyse), sans clignotement visible. Ce retour infirme l'hypothèse Vite HMR retenue par la 1ère passe (voir "Historique / notes de session" plus bas) — diagnostic repris de zéro.

  **Cause trouvée** : `SessionDetail` a un seul état `loading` (posé par `load()`, la fonction qui charge "Tables rattachées"/"Tables disponibles" — polling 15 s depuis le chantier 35, + rappelée par le channel Realtime `tables` sur tout événement, + par tout changement de filtre de date). Ce `loading` gate **tout le contenu de la fiche séance** (ligne ~2064 : `{loading ? <Chargement…/> : <>…tous les onglets…</>}`), pas seulement la section des tables. À chaque déclenchement — donc au minimum toutes les 15 s, parfois plus souvent via Realtime — la totalité du contenu affiché (quel que soit l'onglet actif) est remplacée par un petit spinner le temps de l'appel réseau, ce qui effondre la hauteur du document ; le navigateur clampe alors `scrollY` à la nouvelle hauteur (beaucoup plus faible), et **ne restaure jamais** la position de scroll quand le contenu revient. D'où : ça touche tous les onglets (le gate est en dehors du switch d'onglet), ça n'a besoin d'aucune session Claude Code (bug 100 % applicatif, indépendant du HMR), et ça ne "clignote" pas franchement (le spinner est bref, ce qui se voit surtout c'est le saut de scroll).

  **Reproduit concrètement** (Browser pane, mock `fetch` sans mot de passe réel, même technique que les passes précédentes) : scroll à 893px sur une fiche mockée, clic sur un filtre de date (déclenche `load()` avec 900ms de latence simulée) → `scrollHeight` s'effondre de 993 à 563 **et `scrollY` est immédiatement clampé de 893 à 563** ; ~1.6s plus tard le contenu revient (`scrollHeight` remonte à 993) mais `scrollY` reste bloqué à 563 — jamais restauré. Instrumentation : `MutationObserver` + lecture de `window.scrollY`/`document.documentElement.scrollHeight` avant/après clic.

  **Correctif appliqué** : `load()` ne pose `setLoading(true)` (donc n'affiche le spinner plein écran) que lors du **tout premier** chargement (`hasLoadedTablesRef`, un `useRef`) — plus jamais sur un rafraîchissement de fond (polling 15s, Realtime, changement de filtre). Les données de "Tables rattachées"/"Tables disponibles" continuent de se mettre à jour en place, sans jamais vider le reste de la fiche séance ni changer la hauteur du document. Un seul changement de comportement assumé : changer le filtre de date ("Tout afficher"/"Depuis…") ne montre plus de spinner plein écran non plus — juste une mise à jour silencieuse de la liste, strictement mieux pour le même problème.

  **Déjà vérifié par moi** : `npx tsc -b` / `npm run build` / `npm test` (184/186, 2 skip préexistants) OK. Reproduction Browser pane confirmée **avant** correctif (voir ci-dessus) puis **absence totale** de collapse/clamp après correctif, sur le même scénario exact (`scrollY` et `scrollHeight` inchangés pendant tout le rafraîchissement, zéro mutation DOM observée). Zéro erreur console imputable au correctif (un warning `validateDOMNesting` pré-existant et sans rapport dans `AnalysisPanel` — bouton imbriqué dans un bouton — reste présent, non traité ici, voir entrée séparée ci-dessous si besoin).

  **Reste à vérifier par Jules en conditions réelles** : ouvrir une séance avec du contenu réel (plusieurs tables, participants, assertions), scroller loin dans la page, laisser tourner ≥ 30-40 s sans toucher au clavier/souris → la page ne doit plus jamais remonter toute seule, sur aucun des 4 onglets. Si le symptôme persiste malgré ce correctif, il reste un canal Realtime supplémentaire à investiguer (le channel `session-tables:<id>` ci-dessus a pu masquer une deuxième cause si Realtime déclenchait `load()` bien plus souvent que 15 s en usage réel — à confirmer avec le compteur d'appels réseau du vrai navigateur, impossible à observer sans données réelles).

- [ ] **2026-08-01 — Chantier 33 — gestion des modérateurs par table** — `SuperadminScreen.tsx`, `AddModeratorControl`, onglet 🪑 Tables *(migration SQL requise, voir ci-dessus)*

  **Livré (4 points)** :
  1. Accordéon "Allocation des tables" déplacé de l'onglet 🟢 En direct vers l'onglet 🪑 Tables.
  2. Sur chaque table animée en attente de modérateur (⏳) : nouveau contrôle `AddModeratorControl` — glisser-déposer d'un `DraggableMemberChip` existant sur la zone droppable, **et** un champ avec autocomplete sur les pseudos inscrits à la séance. Les deux appellent `assign_moderator_to_table`. Bouton "Retirer" symétrique (réutilise `set_member_moderator(..., false)`).
  3. `claim_moderator_status` (self-déclaration, onglet 🎙️ Modérateur de l'accueil) auto-assied désormais sur la première table animée encore sans modérateur.
  4. `claim_moderator_status` accepte la phase `debating` en plus de `pre_voting`/`voting`/`allocating`.

  **Déjà vérifié** (`tsc -b`, `npm run build`, `npm test`, tous OK) : le filtre de phase `EntryScreen` (`phase=in.(pre_voting,voting,allocating,debating)`) confirmé par interception réseau + rendu mocké. **Rien d'autre n'a pu être testé en conditions réelles** (mot de passe superadmin non détenu par la session d'origine).

  **Test minimal** (mot de passe superadmin requis, migration SQL appliquée au préalable) :
  1. Onglet ⚙️ Préparation → vérifier que "Allocation des tables" n'y est plus ; onglet 🪑 Tables → vérifier qu'il apparaît en haut, au-dessus de "Groupes".
  2. Séance en `allocating` avec ≥ 1 table animée sans modérateur assis : vérifier l'apparition du contrôle ⏳ (zone de drop + champ de recherche). Glisser un `DraggableMemberChip` dessus → badge "🎙️ Modérateur : <pseudo>" apparaît, la personne disparaît de son ancienne table si elle était ailleurs. Taper un nom existant → "➕ Ajouter" → même vérification. Taper un nom inexistant → message d'erreur, aucun appel réseau raté silencieusement.
  3. Cliquer "Retirer" à côté d'un modérateur assis → il redevient participant ordinaire de la même table (le contrôle ⏳ réapparaît).
  4. Nouveau participant, onglet 🎙️ Modérateur de l'accueil, séance `allocating` avec ≥ 1 table en attente → vérifier l'assise directe sans intervention superadmin (Realtime ou polling 5s dans `AllocatingScreen`).
  5. Même test que 4 mais séance en `debating` → vérifier aussi que le join direct par numéro de table (`JoinTableForm`/`SessionRouterScreen`, statut `debating_no_member`) fonctionne toujours.

  **Hypothèse non tranchée avec Jules** : quand plusieurs tables attendent un modérateur, l'auto-attachement choisit toujours la première dans l'ordre des numéros — comportement arbitraire assumé, à confirmer si un autre ordre était attendu.

- [ ] **Chantier 37 — Point 1 : bouton "Répartir en tables" retiré (phase voting)**
  Mergé sur `main` (`cf7083d`), aucune migration.

  **Test minimal** : séance en phase `voting`, superadmin → vérifier l'absence du bouton "Répartir en tables". Avec le toggle "Fusionner auto en fin de vote" (`ai_auto_merge_<id>`) activé, faire passer la séance en `allocating` → vérifier que la fusion IA s'est bien déclenchée (log `LLMModerationPanel`), puisque c'est désormais ce passage de phase qui la déclenche (au lieu du bouton supprimé).

- [ ] **Chantier 37 — Point 2 : bug de réassignation modérateur (onglet Membres)**
  Mergé sur `main` (`cf7083d`). Migration `supabase/migrations/20260803_chantier37_set_member_moderator_seat.sql` **déjà appliquée et vérifiée par Jules côté Supabase** (`set_member_moderator` confirmée contenir la logique de placement) — seul le test manuel ci-dessous reste à faire.

  **Test minimal** : séance avec ≥ 2 tables animées, une avec modérateur déjà assis, une sans. Onglet Membres → cocher "modérateur" sur quelqu'un assis à la table déjà pourvue → vérifier dans l'onglet Tables qu'il apparaît maintenant assis (déplacé) sur la table sans modérateur.

- [ ] **Chantier 36 — Point 1 : modérateur affiché en double (onglet 🪑 Tables)**
  Mergé sur `main` (`0c98775`), aucune migration.

  **Test minimal** (mot de passe superadmin requis) : séance `allocating`/`debating` avec une table animée dont le modérateur est déjà assis → vérifier l'absence de doublon (badge "🎙️ Modérateur : X" seul, plus jamais aussi en puce glissable ordinaire dans la liste des membres en dessous). Cas modérateur en surplus (assis ailleurs comme participant ordinaire, chantier 25b) → vérifier qu'il n'apparaît que dans son propre badge, jamais en puce.

  → Bon moment pour vérifier **en même temps** le chantier 33 ci-dessus (même onglet Tables).

- [ ] **Chantier 35 — synchronisation temps réel du statut modérateur (volet superadmin)**
  Voir la section dédiée **"Synchronisation temps réel (chantier 35)"** plus bas — nécessite deux onglets/navigateurs en parallèle, regroupée à part pour ne pas la faire deux fois.

- [ ] **2026-09-01 — Chantier 39 — renommage "Phase 0" + suppression de la phase `questionnaire`** — `SuperadminScreen.tsx` (`PHASE_LABEL`, `PHASE_SEQUENCE_LABELS`, `PhaseBar`, `handlePhaseChange`) *(migration SQL requise, voir ci-dessus — mais le comportement décrit ici ne dépend pas de son application, seule la définition de `sessions_phase_check`/`set_session_phase` en base en dépend)*

  **Livré (3 points)** :
  1. Le badge de phase et le `PhaseBar` de la fiche séance affichent **"Phase 0"** au lieu de "Brouillon" pour la phase `draft`.
  2. Numérotation des cercles du `PhaseBar` alignée sur la nomenclature participant (voir section dédiée CLAUDE.md « Nomenclature des phases côté participant ») : `draft`=0, `pre_voting`=1, `voting`=2, `allocating`=3, `debating`=4, `closed`=5 — au lieu de 1..6 précédemment (`{i}` au lieu de `{i + 1}`).
  3. La phase `questionnaire` a disparu du `PhaseBar` (6 cercles au lieu de 7) et de `PHASE_SEQUENCE`. Le passage manuel `debating → closed` déclenche désormais automatiquement `force_session_questionnaire` (avant : nécessitait de cliquer "Passer en Questionnaire" comme étape intermédiaire). Le bouton "Forcer questionnaire" manuel de l'accordéon "Actions post-séance" reste inchangé et disponible à tout moment (chantier 45), indépendamment de ce déclenchement automatique.

  **Déjà vérifié** (`tsc -b`, `npm run build`, `npm test` — 94 tests, tous OK ; aucune régression sur `allocation.ts`, non modifié). Session sans mot de passe superadmin — **le rendu réel du `PhaseBar` et le déclenchement de `handlePhaseChange` n'ont pas pu être exercés en navigateur.**

  **Test minimal** (mot de passe superadmin requis) :
  1. Ouvrir une séance en `draft` → vérifier le badge "Phase 0" (liste des séances ET fiche séance) et le cercle "0" (pas "1") dans le `PhaseBar`.
  2. Dérouler les phases une par une → vérifier la numérotation 0,1,2,3,4,5 sur les 6 cercles (pas de 7ᵉ cercle "Questionnaire").
  3. Séance en `debating` avec ≥ 1 participant connecté à une table de la séance → cliquer "Passer en Clôturée" → vérifier dans les secondes qui suivent que le modal questionnaire s'ouvre chez ce participant (`ParticipantView`, `table.questionnaire_forced_at` mis à jour) **sans** être passé par une phase intermédiaire — et que le bouton manuel "Forcer questionnaire"/"Annuler forçage" de l'accordéon "Actions post-séance" reflète bien l'état forcé (`isQForced=true`).
  4. Vérifier qu'aucun bouton "Passer en Questionnaire" n'apparaît plus nulle part dans le `PhaseBar`.

- [ ] **2026-09-02 — Chantier 57 — quota et plafond de charge utile sur `gemini-proxy`** — `supabase/functions/gemini-proxy/index.ts`, `src/lib/gemini.ts` *(déploiement de l'Edge Function requis, voir ci-dessous — le test complet n'est possible qu'une fois déployée)*

  **Le problème corrigé** : `gemini-proxy` ne vérifiait qu'un JWT Supabase valide (n'importe quel utilisateur anonyme, y compris un porteur direct de la clé anon publique du bundle JS, sans jamais passer par le mot de passe superadmin) avant de relayer vers l'API Gemini payante — ni limite de fréquence d'appel, ni limite de taille de charge utile. Un tiers pouvait épuiser le quota Gemini du projet ou faire monter la facture sans connaître aucun secret.

  **Livré (2 points, dans la fonction elle-même — aucune migration SQL)** :
  1. **Quota par utilisateur** : 20 appels par fenêtre glissante de 60 secondes, par `user_id` (compteur **en mémoire**, pas de table Postgres — voir justification en commentaire en tête du fichier, section "Anti-abus (chantier 57)"). Au-delà : réponse `429` avec `{ error, retryAfterSeconds }` et en-tête `Retry-After`.
  2. **Plafond de taille de la charge utile** : 300 Ko (vérifié sur l'en-tête `Content-Length` en rejet rapide, puis re-vérifié sur la taille réellement lue). Au-delà : réponse `413` avec message clair.
  3. **Refus explicites côté client** : `src/lib/gemini.ts` extrayait déjà `data?.error`, mais pour une réponse non-2xx (ce que sont justement 429/413), `supabase.functions.invoke` lève une `FunctionsHttpError` dont `.message` est un texte générique ("Edge Function returned a non-2xx status code") — le message clair est dans le corps JSON de la réponse HTTP d'origine (`error.context`, un `Response`), pas automatiquement lu. Ajout d'`extractGeminiError()` qui lit ce corps quand l'erreur est une `FunctionsHttpError`. Les 4 fonctions exportées (`moderateAssertions`, `mergeAssertions`, `nameIdeologicalGroups`, `nameSingleGroup`) l'utilisent désormais au lieu de `extractErr(error)` seul.

  **Où ce message ressort à l'écran** : les actions manuelles superadmin ("Modérer maintenant", "Analyser les doublons" dans `LLMModerationPanel`) affichent déjà `e.message` via `showMsg` dans leurs blocs `catch` existants — aucune modification de ces panneaux n'a été nécessaire, le message clair remonte automatiquement une fois `gemini.ts` corrigé. Les ticks `setInterval` d'auto-modération/auto-fusion et le nommage automatique des camps restent **silencieux** en cas d'erreur (comportement préexistant, "erreurs loggées dans la console uniquement" / "les camps restent sans nom") — un utilisateur qui déclencherait la limite uniquement via ces automatismes ne verrait rien à l'écran, seulement dans la console ; jugé acceptable car ces automatismes sont, par calibrage (voir commentaire dans le fichier), très loin sous la limite de 20/min en usage normal.

  **Calibrage de la limite (raisonnement complet dans le commentaire en tête de fichier)** : seul le superadmin appelle cette fonction en pratique (aucun écran participant n'importe `lib/gemini.ts`). Pire cas légitime théorique avec toutes les automatisations réglées sur leur intervalle le plus agressif (modération auto 1 min, fusion auto périodique 1 min, nommage jusqu'à 5 groupes × 2 tentatives à chaque analyse) : ≈ 12 appels/minute depuis un même onglet. Limite retenue : 20/min, marge confortable au-dessus de ce pire cas, tout en bornant fermement un script qui viserait la fonction en boucle.

  **Pourquoi un compteur en mémoire plutôt qu'une table Postgres** : projet à échelle très réduite (~3 personnes, séances ponctuelles, cf. `CLAUDE.md`). Une table ajouterait une écriture par appel Gemini et une migration pour un gain marginal ici — le compteur mémoire suffit à bloquer en pratique un script qui bombarderait la fonction en boucle depuis un même onglet, au prix d'un reset à chaque cold start Deno Deploy et d'un compteur non partagé si plusieurs instances tournent en parallèle (accepté explicitement, voir commentaire dans le fichier). À revoir si le projet grandit.

  **Déjà vérifié** : `npx tsc --noEmit`, `npm test` (94 tests, tous passants), `npm run build` — tous OK. Code de la fonction relu intégralement (pas d'accès Deno CLI dans cette session pour un vrai type-check du runtime Deno, mais le fichier ne touche à rien de spécifique à Deno au-delà de `Deno.serve`/`Deno.env`, déjà présents avant ce chantier). **Rien de tout cela n'a pu être exercé en conditions réelles** : pas de déploiement effectué (interdit par la consigne de ce chantier), donc aucun appel HTTP réel à la fonction modifiée.

  **⚠️ Déploiement requis avant tout test réel** — commande exacte (depuis la racine du projet, après avoir mergé cette branche ou dans son worktree) :
  ```
  npx supabase functions deploy gemini-proxy
  ```
  (nécessite d'être lié au projet Supabase — `npx supabase link` si pas déjà fait — et les secrets `GEMINI_API_KEY` déjà configurés côté Supabase, inchangés par ce chantier.)

  **Test minimal (après déploiement, mot de passe superadmin requis)** :
  1. **Usage nominal** : ouvrir `LLMModerationPanel` sur une séance en `voting`/`pre_voting` avec des assertions `pending`/`approved`, cliquer "Modérer maintenant" puis "Analyser les doublons" à quelques secondes d'intervalle (moins de 10 appels en tout) → doit fonctionner normalement, sans jamais voir de message de quota. Vérifier aussi `AnalysisPanel` : lancer une analyse manuelle une ou deux fois → nommage des camps fonctionne normalement.
  2. **Comportement à la limite** : dans la console DevTools du superadmin, exécuter 21 fois de suite (boucle `for`) un appel direct à `supabase.functions.invoke('gemini-proxy', { body: { action: 'moderate', payload: { session_title: 't', session_description: null, assertions: [] } } })` → les 20 premiers appels doivent renvoyer une réponse (succès ou erreur Gemini normale), le 21ᵉ doit échouer avec un message contenant "Trop de requêtes IA" et un nombre de secondes à attendre. Reproduire ensuite la même chose via un vrai bouton de l'UI (ex. spammer "Modérer maintenant") : le message affiché dans `LLMModerationPanel` (zone `showMsg` en rouge) doit être ce même texte clair, pas "Edge Function returned a non-2xx status code".
  3. **Refus d'une charge utile surdimensionnée** : depuis la console DevTools, appeler `supabase.functions.invoke('gemini-proxy', { body: { action: 'moderate', payload: { session_title: 't', session_description: null, assertions: [{ id: crypto.randomUUID(), content: 'x'.repeat(400000) }] } } })` → doit échouer immédiatement (413) avec un message contenant "trop volumineuse", sans avoir appelé Gemini (vérifiable en confirmant qu'aucune ligne n'apparaît dans le journal `ai_log_<id>`/compteur de tokens journalier pour cet appel).
  4. Vérifier qu'aucune des deux limites ne s'est déclenchée par erreur pendant le test 1 (usage nominal) une fois les tests 2 et 3 terminés — c'est-à-dire que la fenêtre de 60 s du test 2 n'a pas laissé le compteur de l'utilisateur de test dans un état qui bloquerait un usage normal ensuite (attendre 60 s après le test 2 avant de relancer un usage nominal si besoin).

- [ ] **2026-09-02 — Chantier 65 — non-régression superadmin sur une séance en brouillon** — `src/screens/SuperadminScreen.tsx` *(migration SQL requise, voir "Migration SQL en attente" ci-dessus)*

  **Pourquoi ce test** : ce chantier ferme l'accès à une séance `draft` pour tout le monde côté inscription (`register_session_member`, `confirm_attendance`) — le superadmin, lui, doit continuer à pouvoir préparer sa séance normalement, puisque tout son travail passe par des RPC à mot de passe séparées, jamais par ces deux fonctions.

  **Test** :
  1. Onglet Administration (`#superadmin`), mot de passe superadmin → créer une nouvelle séance de test (reste en `draft`).
  2. Dans sa fiche : renseigner titre/description, ajouter les URLs de documentation (`update_session_docs`), rattacher/détacher une table existante (`attach_table_to_session`/`detach_table_from_session`) → tout doit fonctionner sans message d'erreur, exactement comme avant ce chantier.
  3. Copier son `join_code` (visible dans la fiche superadmin) et l'ouvrir dans un **autre navigateur/onglet privé, non connecté superadmin** sur `#session/<join_code>` puis sur `#vote/<join_code>` → les deux doivent afficher le message "Séance pas encore ouverte" (voir scénario Participant ci-dessous), pas une erreur, pas un formulaire d'inscription.
  4. Toujours côté superadmin : faire passer la séance en `pre_voting` (ou directement `voting`) via le bouton de phase → la fiche doit continuer de fonctionner normalement, et l'onglet ouvert à l'étape 3, une fois rechargé, doit désormais montrer le formulaire d'inscription normal (plus le message "pas encore ouverte").
  5. Vérifier que la séance de test n'apparaît dans aucune liste publique **pendant qu'elle est encore en `draft`** : accueil onglet "Créer" (ne doit plus la lister), accueil "Séances en cours" (ne l'a jamais listée), accueil "Anciennes séances" (phase `closed` uniquement, non concerné ici).

## Parcours Participant

- [ ] **2026-09-02 — Chantier 65 — visiteur ouvrant le lien d'une séance en brouillon** — `src/screens/SessionRouterScreen.tsx`, `src/screens/VoteScreen.tsx` *(migration SQL requise, voir "Migration SQL en attente" ci-dessus — sans elle, le message s'affiche déjà côté frontend mais l'inscription resterait possible en tentant quand même le formulaire par un autre chemin)*

  **Contexte** : avant ce chantier, une séance `draft` (dont le `join_code` existe dès sa création) redirigeait silencieusement vers le formulaire d'inscription normal — n'importe qui avec le lien pouvait s'inscrire et voter avant l'ouverture. Deux points d'entrée à tester séparément, ils ne partagent pas de code.

  **Test 1 — via `#session/<join_code>`** (le lien réellement partagé, cf. QR code / lien WhatsApp) :
  1. Superadmin : créer une séance de test (reste en `draft`), noter son `join_code`.
  2. Dans un autre navigateur/onglet privé (pas de session superadmin) : ouvrir `https://.../#session/<join_code>`.
  3. Attendu : écran "🔒 Séance pas encore ouverte" avec un message invitant à revenir plus tard, **pas** de redirection vers un formulaire d'inscription, **pas** d'erreur JS en console. Bouton "← Retour à l'accueil" fonctionnel.

  **Test 2 — via `#vote/<join_code>` directement** (lien bookmarké, ou tapé à la main) :
  1. Même séance de test, même onglet privé : ouvrir directement `https://.../#vote/<join_code>` (en contournant le routeur).
  2. Attendu : même écran "🔒 Séance pas encore ouverte" (variante locale à `VoteScreen`), pas le formulaire de pseudo.
  3. Essayer de soumettre malgré tout une inscription (console DevTools : `supabase.rpc('register_session_member', { p_session_id: '<id>', p_pseudo: 'Test' })`) → doit échouer avec le message de phase, **une fois la migration SQL appliquée** (sans elle, ce test échoue — l'inscription réussirait encore, c'est le point qui prouve que le blocage frontend seul ne suffit pas).

  **Test 3 — l'onglet « Créer » ne propose plus la séance** : depuis l'accueil (sans mot de passe), onglet "Créer", menu déroulant des séances → la séance de test en `draft` ne doit **pas** apparaître dans la liste (avant ce chantier, elle y figurait avec son titre et son `join_code`, visible à quiconque ouvre cet onglet).

  **Une fois les 3 tests validés** : faire passer la séance de test en `pre_voting` côté superadmin, recharger les mêmes deux liens (`#session/` et `#vote/`) → le formulaire d'inscription normal doit apparaître, comme avant ce chantier.

- [ ] **2026-09-02 — Chantier 50 — écran d'affectation et lectures participant sous les policies self-only** *(migration SQL requise, voir plus haut)*

  **Ce qui est en jeu** : les 4 lectures directes de `session_members` du frontend sont déjà filtrées `.eq('user_id', userId)` (`TableContext`, `SessionRouterScreen` ×2, `VoteScreen`) et `get_my_table_assignment` est SECURITY DEFINER — en théorie rien ne change côté participant. Ces tests servent à confirmer qu'aucune lecture n'avait été oubliée à l'inventaire. Aucun de ces fichiers n'a été modifié par ce chantier.

  **À vérifier après application de la migration** (un participant réel, séance réelle) :
  1. **Écran d'affectation** (`AllocatingScreen`, phase `allocating`) : le numéro de groupe et le code de la table s'affichent, et le bouton « Rejoindre » mène bien à la bonne table. C'est le point le plus exposé — il dépend de `get_my_table_assignment`.
  2. **Attente d'affectation** : arriver sur l'écran d'affectation **avant** que le superadmin ait lancé l'allocation, puis le laisser la lancer → l'affectation doit apparaître seule en ≤ 10 s (Realtime sur sa propre ligne, ou polling de secours), sans reload.
  3. **Vote** (`VoteScreen`, `pre_voting` et `voting`) : un participant déjà inscrit qui revient sur `#vote/<code>` est bien reconnu (pas de nouvelle demande de pseudo).
  4. **Reconquête d'un pseudo déjà pris** (`PseudoForm` en `pre_voting`, `VotingEntryForm` en `voting`) : saisir un pseudo déjà inscrit doit toujours proposer l'écran de reconquête et le mener à bien (par le nom **et** par le code de rappel). Ces chemins passent par des RPC, ils ne devraient pas bouger — mais c'est le seul endroit où le frontend raisonne sur des inscriptions qui ne sont pas les siennes.
  5. **Routeur** (`#session/<code>`) : en `debating`, un membre inscrit est redirigé vers `#vote/`, un visiteur non inscrit voit le message « pas membre ». En `closed`, un membre non répondant voit le questionnaire, un membre répondant voit la carte des résultats, un visiteur voit les résultats publics. C'est le test qui prouve que `SessionRouterScreen` distingue toujours membre et non-membre.
  6. **Entrée en débat** : rejoindre la table depuis l'écran d'affectation → `ParticipantView` s'affiche sans reload, avec le bon compte de présents.
- [ ] **2026-09-02 — Chantier 61 — s'inscrire et voter pendant la phase `allocating`** — `src/screens/VoteScreen.tsx`, migration `20260902_chantier61_register_during_allocating.sql` *(voir « Migration SQL en attente » ci-dessus — les scénarios 1 et 4 ne passent qu'une fois appliquée ; 2 et 3 passent sans)*

  **Aucune vérification navigateur n'a été faite** (session headless, harnais partagé avec d'autres chantiers) : seuls `npx tsc --noEmit`, `npm test` (94 tests) et `npm run build` ont été joués, tous verts. Tout ce qui suit est à jouer à la main.

  **Livré** : (a) migration ci-dessus ; (b) `VotingEntryForm` — le formulaire combiné « Mon nom » / « Mon code de rappel », avec reconquête automatique — est désormais monté en phase `voting` **et** `allocating`, au lieu de `voting` seul ; (c) un membre déjà connu sur cet appareil mais pas encore confirmé présent (`attending_in_person = false`, cas typique du pré-votant à distance) passe par l'écran de confirmation de présence en `allocating` comme il le faisait déjà en `voting` ; (d) un encart ambre à l'entrée prévient que les groupes sont en cours de formation et que le vote ne changera plus la répartition.

  ⚠️ **À lire avant de tester — ce chantier déplaçait le mur, il ne l'enlevait pas à lui seul.** Un participant inscrit **après** que l'organisateur a appliqué l'allocation n'a aucune ligne `table_assignments` : une fois son vote terminé et la phase passée en `debating`, il se serait retrouvé sur « Formation des groupes en cours… » sans porte de sortie. C'est l'objet du **chantier 62** (sortie de secours — saisie manuelle d'un code de table sur `TableAssignmentCard`), livré séparément mais désormais présent sur cette branche. **Les deux doivent être vérifiés ensemble** — voir l'entrée dédiée « Chantier 62 » juste en dessous, qui prolonge le scénario 1 ci-dessous jusqu'au passage en phase `debating`.

  **Préparation commune** : une séance de test avec au moins une assertion `approved`, passée en phase `pre_voting` puis `voting` (pour créer un pré-votant), puis **`allocating`** depuis le superadmin. Prévoir 2 navigateurs/profils distincts (identités anonymes séparées).

  **Scénario 1 — nouvel arrivant qui s'inscrit pendant l'allocation** *(migration requise)*
  1. Séance en phase `allocating`. Ouvrir `#vote/<join_code>` dans un profil navigateur **neuf** (jamais inscrit à cette séance).
  2. Observer : le formulaire « Vote présentiel » à deux onglets (**Mon nom** / **Mon code de rappel**) s'affiche — et **pas** l'ancien écran à un seul champ. Un encart ambre annonce que les groupes sont en cours de formation.
  3. Onglet « Mon nom » → saisir un nom **jamais utilisé** sur cette séance → Continuer.
  4. Observer : **aucune erreur rouge** « La séance n'est pas en phase d'inscription (phase: allocating) ». L'écran suivant doit être **le questionnaire d'entrée (onboarding)** — les 3 questions (consentement transcription / style de participation / déjà fait un débat Ecclesia). *C'est le point le plus important à contrôler : l'onboarding ne doit pas être sauté.*
  5. Répondre aux 3 questions → l'écran de vote s'affiche, avec la bannière ambre « L'organisateur forme les groupes de débat… ».
  6. Vérifier dans le superadmin, onglet participants : le nouveau membre apparaît, **coché présent** (`attending_in_person = true`) et avec la colonne onboarding à ✅. *(Note : la pastille de phase d'inscription affichera la valeur brute `allocating` — `PHASE_LABEL_MEMBER` dans `SuperadminScreen.tsx` ne traduit ni `pre_voting` ni `allocating`. Cosmétique, fichier laissé intact car occupé par le chantier 50.)*

  **Scénario 2 — pré-votant qui se retrouve par son nom, pendant l'allocation** *(fonctionne même sans la migration)*
  1. Depuis un profil navigateur **neuf** (pas celui qui a servi au pré-vote — c'est le cas « nouvel appareil »), séance en phase `allocating`, ouvrir `#vote/<join_code>`.
  2. Onglet « Mon nom » → saisir **exactement** le nom utilisé lors du pré-vote.
  3. Observer : écran vert « Bienvenue \<nom\> ! Tes votes ont bien été récupérés. » → Continuer.
  4. Observer : comme ce pré-votant n'a jamais fait l'onboarding (la phase `pre_voting` n'en propose pas), le **questionnaire d'entrée doit s'afficher** avant le vote.
  5. Après l'onboarding : l'écran de vote doit montrer **les votes déjà exprimés à distance** (les assertions déjà votées ne réapparaissent pas comme non votées).
  6. Superadmin : le membre est maintenant **présent** (`attending_in_person` passé à `true`), sans doublon de ligne.

  **Scénario 3 — le même, par code de rappel** *(fonctionne même sans la migration)*
  1. Profil navigateur neuf, séance en `allocating`, `#vote/<join_code>`.
  2. Onglet « **Mon code de rappel** » → saisir le code à 4 chiffres affiché lors de l'inscription au pré-vote.
  3. Mêmes observations qu'au scénario 2 : écran vert de reconquête, puis onboarding, puis vote avec les votes d'origine.
  4. Contrôle négatif : un code à 4 chiffres inexistant doit afficher « Code de rappel invalide » en rouge, sans navigation ni création de membre.

  **Scénario 4 — le vote fonctionne réellement pour ces nouveaux venus** *(le cœur du chantier)*
  1. Dans chacun des trois cas ci-dessus, une fois sur l'écran de vote en phase `allocating` : voter d'accord / pas d'accord / passer sur au moins 3 assertions.
  2. Observer : chaque vote est accepté (l'assertion suivante s'affiche), **aucune erreur** de type « Cette assertion n'est pas approuvée » ou « Vous n'êtes pas inscrit à cette séance ».
  3. Recharger la page : les votes sont bien conservés.
  4. Bouton « ✏️ Proposer » → soumettre une assertion → vérifier qu'elle arrive côté superadmin (`pending` ou `approved` selon `moderation_policy`).
  5. Superadmin, onglet Analyse : les votes de ces membres apparaissent dans les compteurs.

  **Scénario 5 — pré-votant sur le même appareil (confirmation de présence)** *(fonctionne même sans la migration)*
  1. Reprendre **le profil navigateur qui a servi au pré-vote** (identité anonyme conservée), séance en `allocating`, ouvrir `#vote/<join_code>`.
  2. Observer : l'écran « Tu avais voté à distance sous le nom \<nom\> — Es-tu présent(e) au débat aujourd'hui ? » s'affiche, avec l'encart ambre. *Avant ce chantier, cet écran n'apparaissait qu'en phase `voting` : en `allocating` le membre filait au vote en restant compté absent.*
  3. « ✓ Oui, je suis présent(e) » → onboarding (jamais fait) → vote.
  4. Superadmin : `attending_in_person` du membre est passé à `true`.

  **Scénario 6 — non-régression des phases voisines**
  1. Phase `voting` : le parcours d'entrée doit être **strictement inchangé** (formulaire deux onglets, sans encart ambre).
  2. Phase `pre_voting` : `PseudoForm` à un seul champ, code de rappel affiché après inscription, pas d'onboarding — inchangé.
  3. Phase `debating` : un profil neuf sur `#vote/<join_code>` doit toujours voir « Le vote est terminé, tu ne peux plus rejoindre cette séance. » (l'inscription passe alors par `join_table`, pas par `register_session_member`).
  4. Phase `closed` : inchangé (questionnaire post-débat puis résultats).

- [ ] **2026-09-02 — Chantier 62 — sortie de secours pour le participant inscrit sans affectation de table** — `src/components/voting/TableAssignmentCard.tsx` *(pas de migration SQL — réutilise `switch_table`, chantier 48)*

  **Aucune vérification navigateur n'a été faite** (consigne explicite : session headless, harnais partagé avec d'autres chantiers en cours de merge). Seuls `npx tsc --noEmit`, `npm test` (94 tests) et `npm run build` ont été joués, tous verts. Tout ce qui suit est à jouer à la main, **après application de la migration `switch_table` du chantier 48** (voir « Migration SQL en attente » — pas de nouveau fichier SQL pour ce chantier, mais la sortie de secours dépend de la même RPC).

  **Le bug corrigé** : `TableAssignmentCard` affichait « Formation des groupes en cours… » dès que `loading` était vrai **ou** que `assignment` était `null`, sans distinction — un participant inscrit après que l'allocation a tourné (typiquement via le **chantier 61**, inscription pendant `allocating`) n'a aucune ligne `table_assignments` et restait bloqué indéfiniment sur ce spinner une fois la phase passée en `debating`, sans aucune porte de sortie.

  **États réellement atteignables, établis avant d'écrire le correctif** (documentés en commentaire en tête du composant) : `TableAssignmentCard` n'est monté que par `AllocatingScreen`, elle-même montée par `VoteScreen` uniquement quand `session.phase === 'debating'` au moment du montage (jamais pendant `allocating` elle-même, qui reste sur l'écran de vote avec une bannière ambre). Une fois montée, la phase ne peut plus évoluer que vers `closed`. D'où trois branches désormais distinctes :
  - `loading === true`, ou `assignment === null` dans une phase autre que `debating`/`closed` (en pratique inatteignable, traité par précaution comme "en cours") → spinner inchangé.
  - `assignment === null` **et** `phase === 'debating'` → **nouveau** : formulaire de sortie de secours (message expliquant la situation + champ code à 6 caractères + bouton "Rejoindre cette table").
  - `assignment === null` **et** `phase === 'closed'` → **nouveau** : message neutre "Le débat est terminé. Tu n'as rejoint aucune table pendant cette séance." — pas de formulaire (rejoindre n'a plus de sens une fois le débat clos ; la bannière de clôture existante d'`AllocatingScreen` prend le relais juste en dessous).
  - `assignment !== null` → cas nominal, **strictement inchangé** (carte "Tu es à la Table N" + CTA + lien "Je veux rejoindre une autre table" du chantier 48).

  **Mécanisme réutilisé, pas réinventé** : le formulaire de sortie de secours appelle la même prop `onSwitch` → `AllocatingScreen.handleSwitchTable` → RPC `switch_table` (chantier 48), déjà câblée pour le cas "je suis déjà à une table mais j'en veux une autre". Choix justifié par lecture de code plutôt que par supposition : `switch_table` (a) vérifie que le code appartient à la séance en cours (`tables.session_id = p_session_id`, sinon exception explicite) — contrairement à `join_table`/`JoinTableForm`, dont le docstring du chantier 48 documente explicitement l'absence de cette vérification ; (b) retire proprement le participant de ses tables précédentes dans la séance avant d'insérer la nouvelle — non pertinent ici puisqu'il n'y en a aucune, mais la boucle de nettoyage ne fait simplement rien dans ce cas (`FOR ... LOOP` sur un ensemble vide), sans erreur ; (c) crée la ligne `table_assignments` manquante via `sync_table_assignment` (chantier 26), exactement ce qu'il faut puisque c'est l'absence de cette ligne qui cause le bug. Un succès déclenche `onTableJoined(...)` comme le flux "switch" existant : navigation directe vers `TableView`/`ParticipantView`, sans attendre que `AllocatingScreen` ne rafraîchisse son état `assignment`.

  **Non touché** : `AllocatingScreen.tsx` — le câblage `onSwitch`/`switchLoading`/`switchError` existait déjà intégralement pour le chantier 48 et fonctionne à l'identique pour ce nouveau cas, aucune modification nécessaire.

  **Test minimal** (nécessite la migration `switch_table` appliquée — voir chantier 48 ci-dessous — et complète le scénario 1 du chantier 61 ci-dessus) :
  1. **Cas cible — sortie de secours affichée** : reprendre le scénario 1 du chantier 61 (nouvel arrivant inscrit et ayant voté pendant `allocating`, sans être passé par l'allocation) jusqu'à son terme, puis faire passer la séance en `debating` depuis le superadmin. Sur l'écran de ce participant : vérifier qu'il voit désormais le message "Le débat a commencé, mais tu n'as pas encore de table." avec le champ de code — **et non plus le spinner "Formation des groupes en cours…"**.
  2. **Code valide** : saisir le code à 6 caractères d'une vraie table de la séance (demandé à un autre participant déjà assis, ou via l'onglet Tables du superadmin) → vérifier l'arrivée directe dans `ParticipantView`/`ModeratorView` de cette table, et que `table_assignments` reflète la nouvelle affectation côté superadmin (onglet 🪑 Tables).
  3. **Code invalide** : saisir un code inexistant → vérifier le message "Aucune table ne correspond à ce code." affiché en rouge sous le champ, sans navigation ni crash.
  4. **Code d'une autre séance** : saisir le code d'une table réelle mais rattachée à une autre séance → vérifier "Ce code correspond à une table d'une autre séance."
  5. **Non-régression — cas nominal** : un participant correctement inclus dans l'allocation (présent avant que le superadmin ne clique "Appliquer") doit voir sa carte "Tu es à la Table N" normalement en phase `debating`, sans jamais croiser ce nouveau formulaire.
  6. **Non-régression — séance clôturée sans table** : si un participant reste sans affectation jusqu'à la clôture de la séance, vérifier qu'il voit le message neutre "Le débat est terminé. Tu n'as rejoint aucune table pendant cette séance." (pas le formulaire de code, pas le spinner).

- [ ] **2026-09-02 — Chantier 48 — « Je veux rejoindre une autre table »** — `src/components/voting/TableAssignmentCard.tsx`, `src/screens/AllocatingScreen.tsx`, migration `switch_table` *(voir « Migration SQL en attente » ci-dessus — le test complet de bascule réelle n'est possible qu'une fois appliquée)*

  **Retour de Jules** : « Dans l'écran qui nous annonce notre table, il faut un bouton : je veux rejoindre une autre table. […] Il faut un message pour lui dire de demander à son ami dans la nouvelle table, ou au modérateur de la nouvelle table, de lui donner le code de la table. »

  **Livré** : sur `AllocatingScreen` (l'écran "Vote terminé ! / Tu es à la Table N"), en phase `debating`, un lien "Je veux rejoindre une autre table" sous le bouton "Accéder à la table →". Au clic : petit formulaire avec le message d'aide demandé par Jules ("Demande le code à 6 caractères de la table visée à un ami déjà installé là-bas, ou à son modérateur") et un champ de code à 6 caractères, réutilisant le même mécanisme que les join codes existants — aucun second système créé.

  **Gestion des cas limites** (répond aux points soulevés dans le dispatch de ce chantier) :
  - **Code identique à la table déjà assignée** : bloqué **côté client**, sans appel réseau (`Tu es déjà à cette table.`) — vérifié en navigateur, `read_network_requests` confirme zéro requête.
  - **Code invalide** : `switch_table` lève `Aucune table ne correspond à ce code.` — non vérifié en conditions réelles (migration non appliquée), mais message écrit et testé par lecture de code.
  - **Code d'une table d'une autre séance** : `switch_table` compare `tables.session_id` à la séance courante et lève `Ce code correspond à une table d'une autre séance.` avant tout effet de bord — idem, à vérifier une fois la migration appliquée.
  - **Appartenance à l'ancienne table** : `switch_table` retire la/les ligne(s) `participants` de l'utilisateur dans les autres tables de la séance avant d'insérer la nouvelle (jamais dans les deux à la fois). Nécessaire car `leaveTable()` (bouton "Quitter" côté participant) **ne supprime jamais** la ligne `participants` en base — seulement le cache local (`tableStore.clear()`) — un fait **confirmé en conditions réelles** pendant la vérification de ce chantier (voir "Déjà vérifié" ci-dessous et la section Nettoyage).

  **Arbitrage produit laissé ouvert par Jules, tranché par défaut faute de réponse** : le déplacement est **libre** — aucune limite de place, aucune restriction aux tables non modérées. Recherché dans le code : rien dans `src/lib/allocation.ts` (non modifié, hors périmètre de ce chantier) ni ailleurs ne contraint la composition d'une table après l'allocation initiale — la seule contrainte existante est calculée **une fois**, au moment de `apply_allocation`. Conséquence assumée : un participant qui change de table de son propre chef peut défaire l'équilibre idéologique/répartition des anciens/taille de table calculé par l'algorithme, sans aucun garde-fou. À trancher avec Jules si ça pose problème en pratique (ex : limite de place par table, ou blocage des tables déjà équilibrées) — pas anticipé ici pour ne pas complexifier une fonctionnalité qu'il a demandée simple.

  **Déjà vérifié en navigateur réel** (séance partagée "Test manuel — Vote & bascule modérateur (chantiers 35/37)", table `589D79`, deux identités de test "TestChantier48A" et "TestChantier48B") : bouton absent tant qu'on n'est pas en phase `debating` (code inchangé par rapport à l'existant, non re-testé isolément) ; visible et fonctionnel une fois sur `AllocatingScreen` avec une vraie affectation (`table_assignments` réelle, join_code réel `589D79`) ; formulaire s'ouvre/se ferme (bouton "Annuler") sans effet de bord ; garde côté client sur le code déjà assigné confirmée (voir ci-dessus) ; soumission d'un code différent mais réel de la même séance (`6ABDC9`) déclenche bien `switch_table(p_join_code, p_pseudo, p_session_id)` avec les bons paramètres — Postgrest répond proprement `Could not find the function public.switch_table(...)` puisque la migration n'est pas appliquée, affiché en rouge dans le formulaire sans crash, bouton réactivé ensuite. Zéro erreur console au-delà de ce 404 attendu (confirmé par `read_console_messages`). En reproduisant le parcours de Jules (rejoindre → Quitter → revenir sur `AllocatingScreen`), le problème de ligne `participants` orpheline visé par ce chantier a été **observé réellement**, pas seulement supposé : "TestChantier48A" reste listé comme présent de la table `589D79` après être passé par "Quitter", sans avoir jamais rejoint aucune autre table entre-temps.

  **Non testable cette session** (migration non appliquée, voir ci-dessus) : le succès réel d'une bascule (nouvelle ligne `participants` créée, ancienne(s) supprimée(s), `table_assignments` déplacé, arrivée directe en `ParticipantView`/`ModeratorView` de la nouvelle table) et les deux messages d'erreur serveur (code invalide, autre séance).

  **Test minimal restant** (après application de la migration) :
  1. Un membre avec une table assignée réelle, en phase `debating`, sur `AllocatingScreen` → cliquer "Je veux rejoindre une autre table" → code d'une **vraie** table de la même séance → vérifier l'arrivée directe dans la nouvelle table (`ParticipantView`/`ModeratorView` selon le cas), et que l'ancienne table ne le liste plus dans ses présents.
  2. Même parcours avec un code inexistant → vérifier le message "Aucune table ne correspond à ce code." sans navigation.
  3. Même parcours avec le code d'une table réelle mais d'une **autre** séance → vérifier "Ce code correspond à une table d'une autre séance."
  4. Vérifier dans l'onglet 🪑 Tables du superadmin que `table_assignments` reflète bien la nouvelle table après la bascule (pas les deux).

- [ ] **2026-08-01 — Chantier 34 — carte "Votre groupe" affichée à tort pour les non-votants** — `src/screens/ResultsMapScreen.tsx`

  **Bug** : sur l'écran de résultats de fin de séance (`ResultsMapScreen`, `#session/<join_code>` en phase `closed`, membre inscrit), la carte "Votre groupe" s'affichait dès que `assignment != null` — or `table_assignments` inclut tous les présents, votants ou non. Un membre inscrit mais n'ayant jamais voté a un `assignment` mais aucun point dans l'analyse PCA → `selfGroupId` reste `null` → il tombait sur "L'organisateur n'a pas encore nommé les groupes.", un texte qui n'a de sens que pour un vrai camp pas encore nommé.

  **Correctif** : condition d'affichage passée de `assignment != null` à `assignment != null && selfGroupId !== null`. Trois cas attendus :
  - Jamais voté → `selfGroupId === null` → carte "Votre groupe" totalement absente.
  - Voté, camp pas encore nommé → carte affichée avec "Camp pas encore nommé" (titre porté par le chantier 30/J6, fusionné sans conflit avec ce correctif).
  - Voté, camp nommé → nom/description du camp affichés normalement.

  **Déjà vérifié** : uniquement via une route de debug temporaire (`#debug-results-map`) + mock de `window.fetch` sur les 3 RPC consommées (`get_my_table_assignment`, `get_results_map`, `get_vote_results`), retirée avant commit. Les 3 rendus correspondent à la spec, zéro erreur console. **Jamais testé contre une vraie séance Supabase.**

  **Test minimal** (nécessite une séance `closed` avec un mix membre votant / membre non-votant — mot de passe superadmin pour créer/clôturer la séance de test, ou une vraie séance passée qui a ce mix) : membre n'ayant jamais voté → `#session/<join_code>` → vérifier l'absence totale de la carte "Votre groupe" (reste de la page — scatter, autres camps, consensus/clivage — inchangé). Membre ayant voté, camp pas encore nommé par Gemini → carte présente avec "Camp pas encore nommé". Membre ayant voté, camp nommé → nom/description corrects.

- [ ] **Chantier 36 — Point 2 : case "Je suis modérateur" sur l'écran "Débat en cours"**
  Mergé sur `main` (`0c98775`), aucune migration.

  **Comportement attendu** : écran "Débat en cours" (accessible via "Séances en cours" → "Rejoindre →" sur une séance `debating`) : cocher "Je suis modérateur de cette table" révèle un champ "Code Ecclesia" ; la soumission doit amener en `ModeratorView` (pas `ParticipantView`) sur la table dont le code a été saisi.

  **Hypothèse non tranchée avec Jules** : ce point réutilise `reclaim_moderator` (rejoint *la table dont le code a été saisi*) plutôt que `claim_moderator_status` (auto-assise sur la première table animée en attente, chantier 33). Si le comportement attendu était plutôt ce second mécanisme, c'est un choix différent à trancher.

  **Test minimal** : "Séances en cours" → "Rejoindre →" sur une séance `debating`, compte n'ayant jamais rejoint cette séance → cocher la case, code de table réel + Code Ecclesia réel → vérifier l'arrivée en `ModeratorView`.

- [ ] **2026-09-01 — Chantier 40 — ordre des modales d'entrée en débat** — `src/screens/ParticipantView.tsx`, `src/components/DebateRulesModal.tsx`

  Retour de Jules : à l'entrée en débat, les deux modales successives ("Bienvenue dans le débat" puis les règles) n'étaient pas clairement présentées comme une séquence voulue. Trois changements purement front, aucune logique de phase touchée :
  1. Ordre inversé : "Bienvenue dans le débat" s'affiche désormais **avant** les règles.
  2. Titre de la 2ᵉ modale changé de "Règles du débat" à "Règles d'Ecclesia lors des débats".
  3. Bouton bleu de la 1ʳᵉ modale changé de "C'est parti ! →" à "Lire les règles de débat Ecclesia →".

  **Déjà vérifié en navigateur** (table `leaderless` de test, séance partagée "Test manuel — Vote & bascule modérateur") : parcours complet accueil → "Bienvenue dans le débat" (nouveau texte de bouton) → clic → modale règles (nouveau titre) → "J'ai lu" → retour vue débat normale, aucune 3ᵉ modale. Rechargement de page : les deux `localStorage` (`debate_welcome_<id>`, `debate_rules_read_<id>`) empêchent bien toute réapparition. Zéro erreur console.

  **Non testé** : rendu sur une table non-`leaderless` (avec modérateur) — risque de régression jugé nul, la logique ne dépend pas de `leaderless` ; parcours mobile réel (uniquement viewport desktop testé).

  **Test minimal** : reproduire le parcours ci-dessus sur une table **avec modérateur** (pas seulement leaderless), et sur mobile (`resize_window` ou vrai appareil) pour couvrir les deux angles non testés.

- [ ] **2026-09-01 — Chantier 42 — notes participant perdues (retour de test Jules)** — `src/components/NotesModal.tsx`

  **Cause identifiée** : les 3 chemins de fermeture de la modale (croix, clic hors modale, Échap) appelaient `onClose()` sans vider le debounce de 800ms qui déclenche l'écriture en base (`saveNote`). Fermer puis rouvrir juste après une frappe pouvait recharger la base *avant* que l'écriture différée n'ait abouti → la note paraissait perdue (course, pas une perte réelle). Risque aggravant identifié en même temps : au premier enregistrement, deux écritures concurrentes pouvaient se percuter sur la contrainte unique partielle `(session_id, user_id)` / `(table_id, user_id)` de `private_notes`.

  **Correctif appliqué** : `handleClose()` vide et exécute immédiatement le debounce en attente (`await saveNote(...)`) avant d'appeler `onClose()`, sur les 3 chemins de fermeture.

  **Déjà vérifié en navigateur** : frappe dans l'éditeur → fermeture ~200ms après la frappe → réouverture ~150ms après la fermeture → contenu bien présent au rechargement. Zéro erreur console, zéro message "Erreur :" affiché dans la modale.

  **Point non couvert par ce correctif — à vérifier humainement** : la fermeture *dure* du navigateur/onglet (pas la modale) pendant l'écriture différée — le flush est déclenché par `onClose()` React, qui ne s'exécute pas si l'onglet/la page est fermé(e) avant. Reste une perte possible dans ce cas précis (`beforeunload`/`pagehide` non gérés) — scénario différent de celui rapporté par Jules ("écrit, fermé, rouvert" la modale, pas l'onglet), donc hors scope du fix. À évaluer si ça revient.

  **Test minimal** : reproduire le scénario original de Jules (écrire une note, fermer, rouvrir rapidement) sur `NotesModal` en phase vote et en phase débat (table rattachée à une séance, notes partagées vote→débat). Optionnel : tester le cas non couvert (fermeture d'onglet pendant l'écriture) pour évaluer si ça vaut la peine de gérer `beforeunload`.

- [ ] **Chantier 35 — synchronisation temps réel du statut modérateur (volet participant)**
  Voir la section dédiée **"Synchronisation temps réel (chantier 35)"** plus bas.

- [ ] **2026-09-01 — Chantier 39 — repère de phase participant (`PhaseIndicator`)** — `src/components/PhaseIndicator.tsx`, `src/lib/phaseLabels.ts`, `VoteScreen.tsx`, `AllocatingScreen.tsx`, `ParticipantView.tsx`, `ResultsMapScreen.tsx`, `SessionQuestionnaireForm.tsx`

  **Livré** : pastille "Étape N · Libellé" affichée tout au long du parcours participant — 1 Distanciel (`pre_voting`), 2 Vote en présentiel (`voting`), 3 Allocation (`allocating`), 4 Débat (`debating`), 5 Post-débat (`closed`). Absente en phase `draft` (jamais vue par un participant) et dans `PublicResultsScreen`/`ModeratorView` (hors périmètre). Rendu flottant façon `QuitLink` (coin opposé, en haut à droite) sur les écrans sans en-tête propre (pseudo, onboarding, attente, reconquête de code, confirmation de présence, questionnaire) ; rendu inline dans l'en-tête existant sur les écrans qui en ont un (`VoteScreen` étape vote, `AllocatingScreen`, `ParticipantView`, `ResultsMapScreen`).

  **Déjà vérifié en navigateur** (séance de test réelle "Esai 24/08", phase `draft`, inscription avec pseudo "Chantier39 Verif") : étapes pseudo → onboarding (Question 1/3) → aucune pastille affichée nulle part, conforme (phase `draft` = pas de numéro participant), zéro erreur console. **Non testé faute d'accès superadmin pour faire avancer une séance de test à travers les phases** : l'apparition réelle de la pastille elle-même (1 à 5) sur `pre_voting`/`voting`/`allocating`/`debating`/`closed`, ainsi que son intégration visuelle dans les en-têtes de `VoteScreen` (étape vote)/`AllocatingScreen`/`ParticipantView`/`ResultsMapScreen` (collision potentielle avec les boutons existants, notamment le header dense de `VoteScreen` en phase vote).

  **Test minimal** (mot de passe superadmin requis pour faire avancer une séance de test) : dérouler pre_voting → voting → allocating → debating → closed avec un même compte participant, vérifier à chaque étape le texte et le numéro corrects, l'absence de chevauchement avec les boutons de header (`Quitter`/`Outils`/`Proposer` en phase vote, `Devenir modérateur`/`Outils`/`Quitter` dans `ParticipantView`), et la disparition complète en phase `draft`. Vérifier aussi l'apparition dans `SessionQuestionnaireForm` (voir entrée dédiée ci-dessous, section "Questionnaire post-débat").

- [ ] **2026-09-02 — Incohérence de nommage entre `AppIntroModal` et `PhaseIndicator`** — `src/screens/VoteScreen.tsx` (`AppIntroModal`, fonction interne l.~1288) vs `src/components/PhaseIndicator.tsx`/`src/lib/phaseLabels.ts` (chantier 39)

  **Constat (lecture de code, pas de correction faite ici — à trancher par Jules)** : `AppIntroModal` (modale "Comment se déroule la séance ?", affichée une fois à la connexion, D5) annonce **4 étapes** — 1. Vote, 2. Répartition en groupes, 3. Débat, 4. Questionnaire — tandis que `PhaseIndicator` (pastille "Étape N · Libellé" affichée en continu, chantier 39) en annonce **5** — 1 Distanciel, 2 Vote en présentiel, 3 Allocation, 4 Débat, 5 Post-débat. Le mapping n'est pas qu'une histoire de vocabulaire : `AppIntroModal` fusionne "Distanciel" et "Vote en présentiel" en une seule étape "1. Vote", ce qui décale toute la numérotation (son "2" = allocation = le "3" de `PhaseIndicator` ; son "3" = débat = le "4" de `PhaseIndicator` ; etc.). Un participant qui a vu la modale d'intro puis regarde la pastille en cours de séance peut légitimement se demander pourquoi les numéros ne correspondent pas.

  **Ne pas corriger dans cette session** — juste le signaler. À trancher avec Jules : soit aligner `AppIntroModal` sur les 5 étapes de `PhaseIndicator` (probablement le plus cohérent, `PhaseIndicator` étant le repère affiché en continu), soit assumer que ce sont deux granularités différentes à dessein (l'intro simplifie, la pastille détaille) et le documenter comme tel.

- [ ] **2026-09-02 — Chantier 47 — déclaration modérateur "à l'heure" + créer une table depuis le vote** — nouveau `src/components/voting/ModeratorAccessPanel.tsx`, branché dans `src/screens/VoteScreen.tsx` (header, étape `vote`)

  **Contexte / retour de Jules** : depuis "Séances en cours" → clic sur une séance, on arrive dans `VoteScreen`. Le bouton pour se déclarer modérateur "en retard" (séance déjà en `debating`, via `JoinTableForm`/`reclaim_moderator`, écran "Débat en cours") existait déjà. Manquait le cas "à l'heure" : se déclarer modérateur pendant `pre_voting`, `voting` ou `allocating` — ces trois phases correspondent toutes à l'étape `vote` de `VoteScreen` (seule `debating` bascule vers un autre écran). Une fois modérateur, accès à un bouton "Créer une table" dans la séance.

  **Ce qui a été fait** (2 volets, aucune nouvelle RPC — réutilise l'existant à l'identique) :
  1. **Se déclarer modérateur** : bouton "🎙️ Je suis modérateur" à côté du pseudo, visible tant que `member.is_moderator` est faux. Ouvre une modale avec un seul champ "Code Ecclesia" → appelle `claimModeratorStatus(session.id, password, member.pseudo)` (`lib/voting.ts`, déjà utilisée par l'onglet 🎙️ Modérateur de l'accueil pour le même mot de passe et la même RPC `claim_moderator_status`). Succès → `member` mis à jour localement (`setMember`), le badge existant "🎙️ Vous êtes modérateur" apparaît.
  2. **Créer une table** : une fois `member.is_moderator` vrai, le bouton devient "➕ Créer une table". Ouvre une modale (pseudo préempli + Code Ecclesia) → appelle directement `supabase.rpc('create_table', { p_pseudo, p_creation_code, p_session_id: session.id, p_leaderless: false })` (même RPC que l'onglet "Créer" de l'accueil, sans repasser par un écran de sélection de séance puisqu'elle est déjà connue). Succès → `tableStore.set(...)` + `onTableJoined(tableId, participantId, true)`, navigation directe vers `ModeratorView` sur la nouvelle table (même pattern que `JoinTableForm` plus bas dans ce fichier).

  **Mot de passe** : un seul, le Code Ecclesia (`app_config.creation_code_hash`) — le même que partout ailleurs dans l'app (création de table, reprise de modération, onglet Modérateur de l'accueil). Aucun mot de passe en dur, aucun second mécanisme introduit.

  **Aucune migration SQL** : `claim_moderator_status(p_session_id, p_creation_code, p_pseudo)` et `create_table(p_pseudo, p_creation_code, p_session_id, p_leaderless)` existent déjà en base avec exactement cette signature — confirmé par appel direct des deux RPC via `fetch` (mot de passe volontairement faux, aucune donnée modifiée) : les deux renvoient l'erreur serveur attendue (`"Code Ecclesia invalide"` / `"Code de création invalide"`) plutôt qu'une erreur de paramètre inconnu, ce qui valide que les noms de paramètres utilisés côté client correspondent au déployé.

  **Déjà vérifié** : `tsc -b` et `npm run build` propres (aucune erreur TS). Aucune régression constatée sur le chemin "en retard" existant (`JoinTableForm` sur une séance `debating` réelle, zéro erreur console). Sondage réseau direct des deux RPC avec mauvais mot de passe (ci-dessus) confirmant la forme des appels.

  **Non testé — session headless sans mot de passe modérateur, volontairement** (voir consigne de Jules) : le flux complet avec le vrai Code Ecclesia n'a pas pu être exercé. Aucune séance de test disponible en ce moment en phase `pre_voting`/`voting`/`allocating` (toutes les séances existantes sont en `draft`, `debating` ou `closed`) — impossible même de voir le nouveau bouton apparaître en conditions réelles depuis cette session.

  **Test minimal** (Code Ecclesia requis, séance en `pre_voting`, `voting` ou `allocating` avec au moins un membre inscrit) :
  1. Depuis "Séances en cours" → clic sur la séance → arrivée sur l'étape vote → vérifier la présence du bouton "🎙️ Je suis modérateur" à côté du pseudo (les 3 phases pré-vote/vote/allocation).
  2. Cliquer → saisir un mauvais mot de passe → vérifier le message d'erreur "Code Ecclesia invalide" sans planter. Saisir le vrai Code Ecclesia → la modale se ferme, le badge "🎙️ Vous êtes modérateur" apparaît, le bouton devient "➕ Créer une table".
  3. Recharger la page → vérifier que `member.is_moderator` a bien persisté (le bouton "➕ Créer une table" doit réapparaître directement, sans repasser par l'étape 2).
  4. Cliquer "➕ Créer une table" → pseudo préempli avec le sien (modifiable) + Code Ecclesia → soumettre → vérifier l'arrivée directe en `ModeratorView` sur une table neuve rattachée à la séance (visible ensuite côté superadmin, onglet Tables).
  5. Répéter le point 4 en phase `allocating` spécifiquement (voir hypothèse non tranchée ci-dessous).

  **Hypothèses non tranchées avec Jules** :
  - **Table créée toujours "avec animateur"** (`p_leaderless: false`) — pas de case à cocher "table sans modérateur" dans cette modale, contrairement à l'onglet "Créer" de l'accueil. Choix délibéré : le but exprimé était que le modérateur anime lui-même la nouvelle table ; à corriger si une option leaderless était aussi souhaitée ici.
  - **"Créer une table" reste accessible en phase `allocating`** — l'onglet "Créer" de l'accueil (`EntryScreen`) exclut délibérément cette phase de sa liste de séances proposées (probablement pour ne pas interférer avec le calcul d'allocation en cours dans `AllocationPanel`). Cette nouvelle modale ne réplique pas cette restriction : le bouton reste actif en `allocating`. Si une table créée manuellement pendant que le superadmin lance l'allocation pose problème (collision avec `apply_allocation`), il faudra masquer/désactiver le bouton pour cette phase spécifiquement.
  - **Pas de restriction de phase côté serveur** sur `claim_moderator_status` pour un membre déjà inscrit (seul le cas "créer un nouveau profil" vérifie la phase) — cohérent avec le fait que ce nouveau bouton fonctionne dans les 3 phases demandées sans qu'aucun changement SQL n'ait été nécessaire.

## Parcours Modérateur (`ModeratorView`)

- [ ] **2026-09-02 — Chantier 50 — détection d'un modérateur désigné pendant la séance** *(migration SQL requise ; à faire APRÈS la migration du chantier 60)*

  **Pourquoi ce test ici** : `TableContext` lit `session_members.is_moderator` en direct pour savoir s'il doit afficher `ModeratorView` — lecture filtrée sur `user_id`, donc a priori intacte. Mais la garde d'autorité du chantier 60 (`is_table_moderator`) lit, elle, `session_members` **et** `table_assignments` pour quelqu'un d'autre que l'appelant. Elle est `SECURITY DEFINER`, donc hors RLS et non affectée — ce test le confirme concrètement plutôt que sur lecture de code. Les deux chantiers se croisent exactement ici.

  1. Séance en `allocating`/`debating`, une table animée sans modérateur. Depuis un 2ᵉ navigateur : `#session/<code>` → « 🎙️ Modérateur » → se déclarer avec le code Ecclesia → il doit être assis à la table et **basculer sur `ModeratorView` sans reload**.
  2. Une fois en `ModeratorView` : donner la parole, retirer la parole, passer au suivant, déplacer quelqu'un dans la file, exclure un participant. **Tout doit aboutir** — c'est ce que corrige le chantier 60, et ce que ce chantier ne doit pas re-casser.
  3. Symétrique : le superadmin lui retire son statut depuis l'onglet Membres → bascule vers `ParticipantView` sans reload.
  4. **Régression** : un modérateur « classique » (table créée via « Créer une table », donc `tables.created_by` posé, et **aucune ligne `session_members`**) garde toute son autorité. C'est le cas qui ne dépend d'aucune des deux tables fermées ici.

*Nécessite un Code Ecclesia et une vraie table animée (avec modérateur) pour la plupart des points ci-dessous — pas testable avec une table `leaderless` seule.*

- [ ] **Chantier 60 — le modérateur désigné par l'allocation peut enfin animer sa table** — branche `chantier-60-autorite-moderateur`, **pas mergée sur `main`**. Migration `supabase/migrations/20260902_chantier60_moderator_authority.sql`, **à appliquer avant tout autre test de cette section** (voir la section « Migration SQL en attente d'application » pour le détail du contenu et les 5 requêtes SQL de vérification).

  **Aucun changement frontend** — la vue modérateur s'affiche déjà correctement pour ces personnes depuis le chantier 41 (`TableContext.isModerator = physicalModerator || sessionMemberIsModerator`). Le chantier 60 est 100 % SQL : il aligne l'autorisation serveur sur ce que l'interface montre déjà.

  **Déjà vérifié** : `npx tsc --noEmit` propre, `npm test` 94 passés / 1 skip pré-existant, `npm run build` réussi. **Aucun test navigateur** (consigne : plusieurs sessions en parallèle se disputent le harnais). **Aucune migration appliquée** par la session de chantier.

  ### Scénario central — le chemin nominal, celui qui est cassé aujourd'hui

  Prérequis : une séance allouée **automatiquement** (bouton d'allocation v2 dans `AllocationPanel`, phase `allocating`), avec au moins **2 tables animées** et **au moins 3 participants par table** — les cas négatifs ci-dessous ont besoin d'un modérateur sur chacune des deux tables. Le superadmin passe ensuite la séance en `debating`.

  1. Se connecter sur un **appareil / navigateur distinct de celui du superadmin** avec l'identité d'un participant que l'allocation a désigné modérateur (`session_members.is_moderator = true`), et rejoindre sa table depuis `AllocatingScreen`. Confirmer que `ModeratorView` s'affiche.
  2. **Donner la parole** : cliquer sur un participant (ou le glisser depuis le panneau participants) → il devient orateur, le chrono démarre. *Avant le correctif : « Not authorized ».*
  3. **Retirer la parole** : bouton de fin de tour → l'orateur est libéré. Puis, avec au moins une personne en file, vérifier l'**auto-avancement** (`end_turn_and_advance`) : la parole passe bien au suivant, priorité file interactive.
  4. **Files d'attente** : mettre un **autre** participant en file (glisser-déposer participant → file, `add_to_queue`), le **retirer** de la file (`removeFromQueue` — DELETE direct sur `queue_entries`, chemin RLS), le **réordonner** par glisser-déposer (`reorder_queue_entry`), et le **basculer** d'une file à l'autre (`changeQueueType` — DELETE direct + `add_to_queue`). Les 4 doivent aboutir, y compris ceux qui échouaient **silencieusement** avant (retrait et bascule).
  5. **Exclure un participant** : bouton « Exclure » dans `ParticipantsTable` → la ligne disparaît. *Avant le correctif : « Non autorisé ».*
  6. **Ajouter une personne sans téléphone** : « Outils Modo » → section Table → saisir un « Prénom Nom » → la personne apparaît dans la liste des participants. *Avant le correctif : « Non autorisé ».* (Nécessite aussi la migration du chantier 44.)
  7. **Corriger un tour** : « Outils Modo » → Historique → modifier l'heure de début/fin d'un tour (`correct_turn`) → la correction est bien enregistrée.
  8. **Forcer le questionnaire** puis **l'annuler** : « Outils Modo » → section Table. *Avant le correctif : échec **silencieux** — aucune erreur affichée, mais le modal n'apparaissait chez personne. Vérifier donc l'EFFET (le modal s'ouvre chez un participant de la table), pas seulement l'absence de message d'erreur.*
  9. **Supprimer la table** : à faire **en dernier**, même remarque — c'était un échec silencieux, la table restait en place. Vérifier que la table disparaît réellement et que les participants sont éjectés.

  ### Cas négatifs — indispensables : le correctif élargit qui peut animer

  Une erreur dans le helper donnerait l'autorité d'animation à des gens qui ne devraient pas l'avoir. Chacun de ces cas doit être vérifié **explicitement** ; la requête SQL n° 5 en pied de fichier de migration (« table de vérité ») permet de les couvrir toutes d'un coup, sans se connecter sous chaque identité, et devrait être exécutée **en plus** des tests d'interface ci-dessous.

  - [ ] **Participant ordinaire de la table** (ni créateur, ni `is_moderator`) → doit voir `ParticipantView`, **pas** `ModeratorView`. Aucune action d'animation possible depuis l'interface. Il conserve en revanche ses droits propres : se mettre lui-même en file, se retirer lui-même de la file, clore **son** tour d'orateur.
  - [ ] **Modérateur d'une AUTRE table de la même séance** → c'est le cas le plus important. Depuis son propre appareil, il ne doit avoir **aucune** autorité sur la table 1. Le vérifier par la requête SQL n° 5 lancée sur la table 1 : sa ligne doit ressortir `autorite_attendue = false`. *Nuance à connaître : s'il **quitte** sa table et **rejoint** physiquement la table 1, `join_table` → `sync_table_assignment` **déplace** sa ligne `table_assignments` vers la table 1, et il en devient alors légitimement modérateur. C'est cohérent avec l'interface (chantier 41 lui montre déjà `ModeratorView`) et avec le fait qu'il détient déjà le Code Ecclesia — mais si Jules veut interdire ce déplacement, le dire : c'est le comportement de `sync_table_assignment` (chantier 26) qu'il faudrait revoir, pas le helper.*
  - [ ] **Modérateur de la bonne table** → autorité complète (c'est le scénario central ci-dessus).
  - [ ] **Créateur de la table** (table créée via « Créer une table » avec le Code Ecclesia, ou reprise via « Je suis modérateur de cette table ») → **aucune régression** : tout ce qui marchait avant marche toujours. À dérouler sur une table hors séance (créée depuis l'accueil) pour confirmer que le chemin historique est intact.
  - [ ] **Utilisateur hors séance** (autre navigateur, jamais inscrit à cette séance) → ne doit rien pouvoir faire. Il ne peut de toute façon pas atteindre la table sans son `join_code` ; le vérifier plutôt côté SQL (requête n° 5 : il n'apparaît pas dans `session_members`, donc jamais `autorite_attendue = true`).

  ### Point de sémantique à trancher par Jules — modérateur en surplus sur une table `leaderless`

  Le helper ne fait **pas** d'exception pour `tables.leaderless = true`. Raison : `assign_moderator_to_table` et `set_member_moderator` posent `is_moderator = true` + une ligne `table_assignments` **sans jamais retourner `tables.leaderless`** — exclure les tables leaderless casserait donc une désignation pourtant légitime.

  Conséquence : un modérateur **en surplus** au sens du chantier 25b (l'algorithme l'a fait redevenir un participant ordinaire faute de table à animer, mais son `session_members.is_moderator` reste `true` en base — `AllocationPanel` ne retire le flag qu'aux modérateurs **décochés**, pas aux surplus) et assis à une table `leaderless` obtiendrait l'autorité d'animation sur celle-ci, ce qui contredit la règle « pour les tables leaderless, `isModerator` est toujours `false` » de `CLAUDE.md`.

  **Ce n'est pas une régression introduite par ce chantier** : depuis le chantier 41, l'interface lui affiche **déjà** `ModeratorView` sur cette table (l'`OR` de `TableContext`) ; le chantier 60 se contente de faire fonctionner les boutons qu'elle montre. Les deux corrections possibles si Jules juge le comportement indésirable : (a) faire retirer `is_moderator` aux modérateurs en surplus au moment de l'`apply_allocation`, ou (b) exclure les tables `leaderless` **à la fois** dans le helper SQL **et** dans l'`OR` du chantier 41. Ne rien changer sans arbitrage — les deux touchent des zones occupées par d'autres chantiers.

  **À vérifier au passage** : allouer une séance qui produit **au moins une table leaderless** et **plus de modérateurs que de tables animées**, puis regarder si le modérateur en surplus voit `ModeratorView` sur sa table leaderless. Si oui, arbitrer.

  **✅ Tranché par Jules le 2026-09-02** : c'est le comportement voulu — un modérateur en surplus assis sur une table leaderless obtient bien l'autorité d'animation dessus. Aucune des deux corrections (a)/(b) ci-dessus n'est à faire. Conséquence directe : la ligne de `CLAUDE.md` affirmant que « pour les tables `leaderless`, `isModerator` est toujours `false` » était **inexacte** pour ce cas précis — corrigée dans cette même session (section `isModerator`). Reste quand même à vérifier une fois en conditions réelles que le comportement observé correspond bien à cette confirmation (scénario ci-dessus), simple confirmation visuelle, plus une décision à trancher.

- [ ] ~~**Chantier 43 — Fusion "Outils Modo" + suppression transcription (vue modérateur)**~~ **(doublon — voir "Branche non mergée — Chantier 43/44" plus bas)**
  Entrée initiale écrite avant la consolidation du 2026-09-01 puis avant l'élargissement au chantier 44 (2026-09-02). Conservée telle quelle par respect de la règle append-only, mais périmée — le contenu à jour (incluant le bouton "Ajouter une personne sans téléphone") est dans l'entrée consolidée ci-dessous. Ne pas la dérouler.

- [ ] **Chantier 8 (rattrapage) — Fix DnD : l'entrée déposée n'arrive plus en dernier (A2)**
  Mergé sur `main` (`e1fb31a`), aucune migration.

  **Comportement attendu** : dans `ModeratorView` (files d'attente longue/interactive), glisser une entrée sur une ligne précise doit la déposer à cette position exacte — pas systématiquement en dernier.

  **Test minimal** (table animée réelle, Code Ecclesia requis) : avec plusieurs entrées dans une file, glisser une entrée (depuis le panneau participants ou une autre position) directement sur une ligne précise → vérifier qu'elle atterrit à la position visée.

- [ ] **Branche non mergée — Chantier 43/44 — fusion "Outils Modo" + suppression transcription + "Ajouter une personne sans téléphone" (vue modérateur)** — branche `chantier-43-outils-modo-transcription`, **pas mergée sur `main`** (en attente de la vérification manuelle ci-dessous avant merge). Rebasée sur `origin/main` le 2026-09-02 (chantiers 40/42/45 inclus). **Ne contient pas** le fix `isModerator` du chantier 41 (`22078ff`, branche `chantier-41-reload-moderateur`) — pas encore mergé sur `main` au moment du rebase ; `TableContext.tsx` n'a pas été touché par ce chantier, rien à réconcilier pour l'instant, mais le prochain rebase avant merge devra le prendre en compte si chantier 41 est mergé entre-temps.

  **Chantier 43 — ce qui a été fait** : `NotesButton`, `AssertionsButton` et `QuestionnaireFab` (header de `ModeratorView`) retirés — leur contenu intégré comme entrées du menu `ModeratorToolsButton` ("Outils Modo"), organisé en 3 sections séparées par des lignes : **Camps & assertions** (Camps, Assertions votées — en premier, visible seulement si `table.session_id`), **Table** (QR code, Historique, **Ajouter une personne sans téléphone** — chantier 44, voir ci-dessous, Forçage questionnaire), **Personnel** (Mes notes, Questionnaire post-débat). Seul le bouton Documentation reste séparé dans le header. Le bouton et le code de transcription *live* (`useTranscription.ts`, backend WebSocket, déjà signalé mort dans `CLAUDE.md` depuis le 2026-06-30) sont supprimés — le sous-projet `transcription-debat/` (pipeline offline) n'est pas touché.

  **Chantier 44 — ce qui a été fait** : nouveau bouton **"Ajouter une personne sans téléphone"** dans la section **Table** (placé juste après "QR code de la table") — ouvre un formulaire "Prénom Nom", appelle la nouvelle RPC `add_offline_participant(p_table_id, p_pseudo)` *(migration SQL non appliquée, voir section dédiée plus bas)*. La personne créée apparaît dans `participants` comme n'importe qui (Realtime déjà abonné, aucun changement côté `TableContext`) — le modérateur lui donne/retire la parole avec les outils existants (glisser-déposer, "Exclure" dans `ParticipantsTable`), rien de nouveau à ce niveau.

  **Pourquoi une nouvelle RPC plutôt que réutiliser `join_table`** : `join_table` appelle aussi `sync_table_assignment(session_id, table_id, auth.uid(), pseudo)`, qui opère par **user_id**, pas par pseudo. Appelé sous l'identité du modérateur (c'est son appareil qui insère la ligne), ce mécanisme chercherait/créerait la ligne `session_members` du **modérateur lui-même** — pour un modérateur "classique" jamais inscrit au vote de cette séance (cas déjà documenté dans ce fichier, section chantier 35), ça insère une ligne `session_members` fantôme portant le user_id du modérateur mais le pseudo de la personne ajoutée, avec `attending_in_person=true` en trop (fausse les stats `get_session_voting_stats`). `add_offline_participant` reprend uniquement le cœur de `join_table` (`INSERT INTO participants ... ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id`, donc **exactement le même mécanisme de collision** — si quelqu'un rejoint plus tard avec le même nom, il reprend la main sur cette ligne, comme une reconnexion depuis un autre appareil) sans jamais toucher `session_members`/`table_assignments`/`entry_responses`.

  **Deux hypothèses posées, non tranchées explicitement par Jules** :
  1. **Comptage votes/allocation** : cette personne ne compte **jamais** dans les votes ni dans l'allocation. Ce n'est pas un choix arbitraire — `ModeratorToolsButton` n'existe que dans `ModeratorView`, qui n'existe qu'en phase `debating`, c'est-à-dire **après** que vote et allocation aient déjà eu lieu. Il n'y a structurellement rien à recompter. C'est aussi cohérent avec le fait que `add_offline_participant` n'écrit que dans `participants` — pas de ligne `session_members`/`entry_responses` créée, donc rien qui pourrait entrer dans une analyse ou un futur clustering.
  2. **Persistance** : la ligne créée persiste en base normalement, exactement comme n'importe quel participant (même table `participants`, même CASCADE si la table de débat est supprimée, exclusion via `kick_participant` comme tout le monde). Pas de statut "éphémère"/session-only : ce concept n'existe nulle part ailleurs dans le schéma (`speaking_turns`, `queue_entries` persistent aussi), l'inventer pour ce seul cas aurait été une incohérence, pas une simplification.

  Si l'une de ces deux hypothèses ne convient pas à Jules, la RPC `add_offline_participant` est le seul endroit à modifier (elle est volontairement isolée, ne réutilise pas `join_table`).

  **Déjà vérifié** : `tsc --noEmit` propre (94 tests passés, 1 skip pré-existant, aucune régression), `npm run build` réussi, app rechargée dans le Browser pane sans erreur console après le rebase et l'ajout du bouton (EntryScreen, listing des séances). **Aucun test en conditions réelles sur `ModeratorView`/`ModeratorToolsButton`** — session headless sans Code Ecclesia ni mot de passe superadmin (volontaire, cf. consigne de Jules).

  **Test minimal** (Code Ecclesia + vraie table animée avec modérateur requis — couvre les deux chantiers en une passe) :
  1. **Migration SQL appliquée au préalable** (voir section dédiée ci-dessous) — sinon le bouton "Ajouter une personne sans téléphone" échoue à l'appel RPC (fonction inexistante).
  2. Rejoindre une table de débat en tant que modérateur → ouvrir "Outils Modo" → confirmer les 3 sections dans l'ordre (Camps & assertions en premier, Table, Personnel), séparées par des lignes.
  3. Section Table : cliquer "Ajouter une personne sans téléphone" → saisir "Prénom Nom" → "Ajouter" → modal se ferme, la personne apparaît dans la liste des participants (`ParticipantsTable`/sidebar) sans reload. Lui donner la parole (glisser dans une file, ou clic direct) → vérifier que ça fonctionne comme pour un participant normal. La retirer via "Exclure".
  4. **Collision** : ajouter à nouveau une personne avec le **même** "Prénom Nom" qu'un participant déjà présent (ajouté par ce bouton ou ayant rejoint normalement) → vérifier qu'aucune erreur ne bloque, et que ça se comporte comme une reconnexion (même ligne participant, pas de doublon dans la liste).
  5. Confirmer que tous les autres items s'ouvrent sans erreur console (Camps, Assertions votées, QR code, Historique, Forcer/Annuler questionnaire, Mes notes, Questionnaire post-débat) et qu'aucun bouton/mention "Transcription" ne subsiste.
  6. Cas sans séance rattachée (table créée hors séance) : confirmer que la section "Camps & assertions" est bien absente (conditionnée à `table.session_id`) et qu'il n'y a pas de ligne de séparation orpheline. Le bouton "Ajouter une personne sans téléphone" doit lui rester visible (section Table, indépendante de `session_id`).
  7. Si un avis tranche différemment les deux hypothèses ci-dessus (comptage votes/allocation, persistance) : le signaler, `add_offline_participant` est isolée pour être facile à ajuster.

  **Reste identifié mais volontairement non touché** : `src/hooks/useTranscription.ts` supprimé (mort après retrait de son unique appelant), mais `src/components/voting/OnboardingForm.tsx:158` mentionne encore la transcription dans un texte de consentement participant (anonymisation du pipeline offline, sans lien avec le hook supprimé) — non modifié, hors périmètre.

- [ ] **Chantier 35 — synchronisation temps réel du statut modérateur (volet ModeratorView/ParticipantView)**
  Voir la section dédiée **"Synchronisation temps réel (chantier 35)"** plus bas.

## Questionnaire post-débat

- [ ] **2026-09-01 — Chantier 45 — retrait "à quel débat" + note globale obligatoire en 1ʳᵉ position** — `QuestionnaireModal.tsx` (table), `SessionQuestionnaireForm.tsx` (séance sans table)

  Aucune migration (changement frontend uniquement — `debate_attended` reste en base pour l'historique mais n'est plus jamais renseigné par le frontend).

  **Comportement attendu** : questionnaire post-débat sans la question "à quel débat viens-tu de participer ?" ; la question de note globale (0-5) est en première position et bloque l'envoi tant qu'elle n'est pas remplie (sauf si déjà enregistrée avant ce changement — verrouillée comme les autres champs) ; la question de retour libre est en deuxième position.

  **Déjà vérifié** (via `ParticipantToolsButton` → Outils → Questionnaire post-débat, table `leaderless` de la séance de test) : ordre des questions conforme, absence de la question "à quel débat", clic "Envoyer" sans note → message d'erreur bloquant sans appel réseau, note sélectionnée puis "Envoyer" → succès, réponse relue verrouillée (rating=4 disabled) confirmant la persistance en base. Zéro erreur console.

  **Reste à vérifier — les deux autres points d'entrée, jamais exercés en navigateur** :
  1. `QuestionnaireBtn` dans le header de `ModeratorView` (bouton "Outils Modo" → Questionnaire post-débat, ou l'ancien `QuestionnaireFab` si le chantier 43 n'est pas encore mergé) — nécessite une table **animée** avec Code Ecclesia réel, jamais testé (une table `leaderless` ne donne accès qu'à `ParticipantView`).
  2. `SessionQuestionnaireForm` — formulaire rattaché à la séance sans table, utilisé dans `AllocatingScreen`/`VoteScreen` — modifié à l'identique du point ci-dessus mais jamais exercé en navigateur.

  **Test minimal** : dérouler le même parcours que "Déjà vérifié" ci-dessus, une fois depuis `ModeratorView` (table animée, Code Ecclesia) et une fois depuis `SessionQuestionnaireForm` — **note chantier 39 ci-dessous : ses points d'entrée ont changé, ce n'est plus `allocating`/`voting`**.

- [ ] **2026-09-01 — Chantier 39 — déclenchement de `SessionQuestionnaireForm` déplacé de la phase `questionnaire` (supprimée) vers `closed`** — `VoteScreen.tsx`, `AllocatingScreen.tsx`, `SessionRouterScreen.tsx`, `lib/voting.ts` (`hasQuestionnaireResponse`) *(migration SQL requise, voir "Migration SQL en attente" — mais sans effet sur ce comportement frontend tant qu'aucune séance réelle n'est restée bloquée en phase `questionnaire`)*

  **Pourquoi** : la phase `questionnaire` disparaît de la machine à états (demande explicite de Jules). Le formulaire `SessionQuestionnaireForm` (déjà repositionné par le chantier 45 ci-dessus) doit donc se déclencher autrement : désormais, dès qu'une séance passe en `closed`, `SessionQuestionnaireForm` s'affiche à la place de l'écran de résultats **pour un membre inscrit qui n'a pas encore de ligne dans `questionnaire_responses` pour cette séance** (nouvelle fonction `hasQuestionnaireResponse(sessionId)`, RLS `user_id = auth.uid()` déjà en place — pas de filtre supplémentaire nécessaire). Une fois répondu (`onDone`), l'écran de résultats normal s'affiche. Un visiteur non inscrit (`PublicResultsScreen`) n'est **jamais** concerné par ce gate — volontaire, il n'a jamais voté.

  **Trois points d'entrée concernés, tous avec la même logique** :
  1. `VoteScreen` (`#vote/<join_code>`) — au chargement initial, sur les mises à jour Realtime (2 canaux distincts) et sur le polling 10s de secours.
  2. `AllocatingScreen` (rendu par `VoteScreen` en phase `debating`/`allocating` pour qui n'a pas encore rejoint de table) — sur Realtime et sur le polling 10s.
  3. `SessionRouterScreen` (`#session/<join_code>`) — anciennement un texte statique non fonctionnel ("Réponds au questionnaire", sans formulaire réel, cf. TODO `CLAUDE.md` désormais retiré) ; affiche maintenant le vrai `SessionQuestionnaireForm`. C'est probablement le point d'entrée le plus emprunté en pratique (lien QR code / WhatsApp stable tout au long de la séance).

  **Déjà vérifié** (`tsc -b`, `npm run build`, `npm test`, tous OK) + navigateur, séances de test réelles : `#session/DEBAT8` (`closed`, visiteur non inscrit) → `PublicResultsScreen` normal, aucun questionnaire proposé (comportement attendu, visiteur jamais voté), zéro erreur console. **Non testé faute de compte membre dans une séance `closed` réelle** : l'apparition effective du formulaire pour un membre inscrit sans réponse, ni la disparition après soumission (`onDone` → écran de résultats).

  **Test minimal** (mot de passe superadmin requis pour clôturer une séance de test avec un membre inscrit n'ayant pas encore répondu) :
  1. Membre inscrit, séance passée en `closed`, jamais répondu au questionnaire → `#vote/<join_code>` **et** `#session/<join_code>` (les deux, séparément, avec des comptes/sessions différents si besoin) → vérifier l'apparition de `SessionQuestionnaireForm` dans les deux cas, pastille "Étape 5 · Post-débat" visible dans son en-tête (chantier 39, voir entrée `PhaseIndicator` ci-dessus).
  2. Répondre et envoyer → vérifier la transition vers l'écran de résultats normal (`ResultsMapScreen`) sans reload.
  3. Revenir sur le même lien après avoir déjà répondu → vérifier l'accès direct à l'écran de résultats, sans repasser par le questionnaire.
  4. Séance en `debating` avec un participant connecté à sa table (`ParticipantView`) → superadmin clique "Passer en Clôturée" → vérifier le déclenchement **automatique** du modal questionnaire chez ce participant (couvert aussi par l'entrée superadmin ci-dessus) — ce test-ci vérifie spécifiquement qu'aucune étape de phase intermédiaire n'est nécessaire.

## Synchronisation temps réel (chantier 35)

*Nécessite deux onglets ou deux navigateurs en parallèle sur la même séance/table — ne peut pas se tester avec un seul client.*

- [ ] **2026-09-02 — Chantier 50 — Realtime ne livre plus que ses propres lignes** *(migration SQL requise, voir plus haut)*

  **Ce qui change** : les abonnements Realtime sur `session_members` et `table_assignments` sont filtrés `session_id=eq.<id>`, c'est-à-dire à l'échelle de la séance entière, et les handlers rejettent ensuite côté client ce qui ne les concerne pas (`TableContext` : `if (r.user_id !== userId) return` ; `AllocatingScreen` : `if (row.member_id !== member.id) return`). Ces lignes transitaient donc jusque-là par le réseau de tous les participants avant d'être jetées — `reclaim_code` compris, puisque `session_members` est en `REPLICA IDENTITY FULL`. Sous les policies self-only, Realtime applique la RLS **avant** livraison : elles ne partent plus. Les abonnements reçoivent moins et utilisent autant ; aucun de ces deux fichiers n'a été modifié.

  **Test (deux navigateurs, participants A et B inscrits à la même séance)** :
  1. Sur B, ouvrir la console et instrumenter la réception (ou simplement observer l'onglet Réseau, frame WebSocket). Depuis le superadmin, modifier le membre **A** (cocher/décocher `is_moderator`, le déplacer de table) → **B ne doit recevoir aucun événement**. Avant la migration, il en recevait un et le jetait en silence.
  2. Modifier ensuite le membre **B** → B doit toujours recevoir son propre événement et réagir : badge « Vous êtes modérateur » qui apparaît/disparaît en phase vote, bascule `ModeratorView`/`ParticipantView` en débat, changement de numéro de table sur l'écran d'affectation.
  3. C'est le point 2 qui compte le plus : le risque n'est pas d'en recevoir trop, c'est de ne plus rien recevoir du tout parce que la policy est trop stricte.

- [ ] **Chantier 35 — synchronisation temps réel du statut modérateur**
  Mergé sur `main` (`42ccae2`). Migration `supabase/migrations/20260803_chantier35_session_members_replica_identity.sql` **déjà appliquée et vérifiée par Jules côté Supabase** (`REPLICA IDENTITY FULL` confirmé sur `session_members`) — les deux abonnements realtime `session_members` sont donc actifs, seul le test manuel ci-dessous reste à faire.

  **Comportement attendu** (3 points) :
  1. Superadmin voit en direct (sans reload) un changement de modérateur initié côté participant (auto-attachement chantier 33, `reclaim_moderator`) — section "Tables rattachées" ET onglet Tables/Groupes.
  2. Participant bascule en direct vers `ParticipantView` (sans reload) si le superadmin lui retire son statut de modérateur pendant le débat — et redevient `ModeratorView` si le statut est rendu (réversible, tant que personne d'autre n'a repris le contrôle physique de la table).
  3. Le badge "Vous êtes modérateur" (phase vote) se met à jour en direct si le superadmin décoche le statut depuis l'onglet Membres.

  **Test minimal** (mot de passe superadmin requis, deux onglets/navigateurs) :
  1. **Point 1 (reclaim)** : superadmin sur "Tables rattachées" ouvert, 2ᵉ onglet fait un `reclaim_moderator` sur une table → `moderator_pseudo` doit se mettre à jour sans reload (~15s max).
  2. **Point 1 (auto-attachement, à re-tester en priorité — jamais reproduit en session)** : séance `allocating`/`debating`, table animée sans modérateur, superadmin sur l'onglet 🪑 Tables. 2ᵉ onglet : `#session/<code>` → "🎙️ Modérateur" → se déclarer modérateur → vérifier l'apparition à la table sans reload.
  3. **Point 2 (retrait en débat)** : participant modérateur physique d'une table en `debating` → superadmin retire son statut (onglet Tables ou case Membres) → vérifier bascule vers `ParticipantView` sans reload, puis réversibilité en recochant.
  4. **Point 3 (phase vote)** : participant avec badge "Vous êtes modérateur" visible → superadmin décoche depuis Membres → badge doit disparaître sans reload.
  5. **Régression** : un modérateur "classique" (table créée via `create_table`/`reclaim_moderator`, jamais inscrit au vote de cette séance, donc sans ligne `session_members`) doit garder son `ModeratorView` sans interruption.

- [ ] **2026-09-02 — Chantier 53 — plafonner le refetch déclenché par broadcast Realtime** — `src/context/TableContext.tsx`

  **Constat de sécurité à l'origine du chantier** : le canal Realtime `table:<id>` est ouvert (créé sans `{ config: { private: true } }`), donc n'importe quel porteur de la clé anonyme publique (présente dans le bundle JS) peut s'y abonner **et y émettre**, sans connaître aucun secret — seul le `table_id` (public) est nécessaire. Avant ce chantier, le handler `broadcast` du contexte déclenchait un `refetch()` complet (`tables`, `participants`, `queue_entries`, `speaking_turns`) sans aucun contrôle à chaque message `refresh` reçu : un attaquant qui en émet en boucle pouvait figer l'interface de tous les clients connectés à une table, sur tous les téléphones de la salle simultanément. La correction de fond (canaux privés) est un autre chantier, plus lourd — celui-ci dégrade l'attaque en simple nuisance.

  **Correctif appliqué** (uniquement le handler de réception — le helper d'émission `broadcast()` n'a pas été touché) :
  1. Debounce ~1 s (`REFRESH_DEBOUNCE_MS`) : les noms de table reçus dans la fenêtre sont accumulés dans un `Set`, un seul `refetch()` avec l'union est déclenché à l'expiration.
  2. Plafond de fréquence (`REFRESH_RATE_LIMIT_PER_SECOND = 5`) : compteur glissant sur 1 s, tout message `refresh` au-delà de 5/s est silencieusement ignoré (pas de log en boucle, pas d'exception).
  3. Timer nettoyé au démontage (`clearTimeout` + vidage du `Set` dans le `return` du `useEffect`) — pas de `setTimeout` orphelin.

  **Déjà vérifié** : `npx tsc --noEmit` propre, `npm test` (94 tests, tous verts, aucune régression), `npm run build` réussi. **Non vérifiable en session headless** : tout effet réel sur le temps réel nécessite un navigateur — recette de test ci-dessous, à jouer par Jules.

  **Risque de régression à surveiller** : latence perçue allant jusqu'à ~1 s sur l'octroi de la parole quand plusieurs actions s'enchaînent rapidement (le debounce regroupe et retarde le refetch déclenché par le broadcast — les 3 autres couches de rattrapage, mise à jour locale immédiate/polling 5s/monitoring WebSocket, ne changent pas).

  **Test minimal** (deux onglets/navigateurs sur la même table, un modérateur + un participant, ou deux participants) :
  1. Enchaîner rapidement côté modérateur : donner la parole à A → fin de tour → auto-avancement vers B → donner la parole à C manuellement. Vérifier qu'aucun écran ne se fige côté participant et que l'orateur affiché reste cohérent des deux côtés (au pire ~1 s de retard, jamais un état incohérent durable).
  2. Glisser-déposer une entrée dans la file côté modérateur → vérifier que la vue participant reflète le nouvel ordre en moins de 2 s.
  3. Exclure un participant côté modérateur → vérifier sa disparition côté participant.
  4. Couper puis rétablir le réseau d'un des deux clients (mode avion ou DevTools offline) → vérifier la resynchronisation après reconnexion (monitoring WebSocket + polling 5s, couches inchangées par ce chantier).

- [ ] **2026-09-01 — Chantier 41 — nomination d'un modérateur déjà assis, invisible sans quitter/rejoindre** — `src/context/TableContext.tsx`, branche `chantier-41-reload-moderateur`

  **Retour de Jules** : « Quand je suis déjà en phase débat, et que je nomme quelqu'un en modérateur sur une table, lorsque celui-ci fait un reload, la vue modérateur n'apparaît pas. Il faut pour cela qu'il quitte, avec le bouton quitter, puis revienne dans le débat. »

  **Diagnostic — ce n'est PAS une régression de 35/36/37, c'est l'asymétrie que chantier 35 avait explicitement documentée et volontairement laissée de côté** (ligne "Volontairement pas traité" ci-dessus, maintenant retirée puisque couverte par ce correctif) : `isModerator` était calculé `physicalModerator && !moderatorRevoked` — un pur véto qui ne peut que *dégrader*. `moderatorRevoked` se recalcule bien à chaque `load()` (montage + polling 5s) et via un abonnement realtime sur `session_members`, mais dans les deux cas il ne fait que poser `true`/`false` sur le véto, jamais remonter `physicalModerator` de `false` à `true`. Un participant nommé modérateur *après* avoir déjà rejoint sa table reste donc bloqué, en direct **et** après un simple reload — `physicalModerator` ne vient que du prop `initialIsModerator`, lui-même figé au moment du join initial (`AllocatingScreen.handleJoin` / cache `tableStore` restauré tel quel par `App.tsx` au montage, sans re-vérification). Seul un `leaveTable()` + retour (qui repasse par `AllocatingScreen.handleJoin`, lequel relit `member.is_moderator` à neuf) recalculait correctement — exactement le contournement que Jules a trouvé.

  **Correctif** : `isModerator = physicalModerator || sessionMemberIsModerator` (OR, plus de véto). `sessionMemberIsModerator` reflète `session_members.is_moderator` en direct (realtime, déjà existant côté chantier 35) et à chaque `load()`/reload — dans les deux sens désormais. Ne réintroduit pas de régression sur le cas que chantier 35 ciblait (démodération d'un modérateur assigné côté Bloc C) : pour les tables issues de l'allocation, `tables.created_by` est l'uid du superadmin qui a appelé `apply_allocation`/`create_tables_batch`, jamais celui du participant assigné — `physicalModerator` y est donc déjà `false`, et `session_members.is_moderator = false` suffit seul à garder `isModerator` à `false`.

  **Constat annexe, confirmé en navigateur réel (voir "Déjà vérifié" ci-dessous)** : en creusant ce mécanisme, la même veto asymétrique de chantier 35 casse aussi l'auto-désignation "Désigner comme animateur" (`designate_moderator`, table `leaderless` rattachée à une séance) : cette RPC pose `tables.created_by` mais ne touche jamais `session_members.is_moderator` (qui reste `false` par défaut) — au prochain `load()` (5s ou reload), l'ancien véto retombait systématiquement à `false` pour *tout* auto-désigné sur une table leaderless rattachée à une séance, sans intervention du superadmin. Le passage à l'OR corrige ce cas (il ne dépend plus que de `physicalModerator`) — **reproduit et corrigé en conditions réelles**, pas seulement en théorie.

  **Déjà vérifié** : `tsc --noEmit` propre, `npm run build` réussi, `npm test` (204/206, 2 skips préexistants, aucune régression sur `allocation.ts`/`groupNaming.ts`).

  **Vérifié en navigateur réel (2026-09-01)**, sur la table `589D79` (leaderless, séance "Test manuel — Vote & bascule modérateur", participant "Test Chantier40" — voir note dans "Nettoyage des données de test" : cette table n'est plus leaderless suite à ce test) :
  - Join de la table → `ParticipantView` correcte ("Groupe auto-géré"), zéro erreur console.
  - Clic "🎙️ Devenir modérateur" → confirmation → `designate_moderator` → bascule immédiate vers `ModeratorView` ("Micro libre", panneau Participants). Ceci exerce exactement le mécanisme du "constat annexe" ci-dessus : `physicalModerator=true`, `session_members.is_moderator=false` (jamais posé par cette RPC).
  - **Sans le correctif, l'ancien code aurait dû redescendre en `ParticipantView` au bout de 5s** (véto `moderatorRevoked` recalculé par le polling `load()`, `is_moderator === false` trouvé). Attendu 7s : **toujours `ModeratorView`**, zéro nouvelle erreur console.
  - Reload complet de la page (scénario exact de Jules — recharger sans quitter/rejoindre) : **`ModeratorView` toujours affichée immédiatement**, zéro erreur console.
  - Les 2 erreurs console visibles (404, 401) proviennent de requêtes de diagnostic que j'ai faites moi-même dans la console du navigateur pour retrouver un `join_code` de test (pas de MCP Supabase, clé anon publique lue depuis `.env` — usage en lecture seule, cf. `CLAUDE.md`) ; confirmé sans rapport avec l'app via `read_network_requests` (uniquement des requêtes locales Vite dans la fenêtre capturée). Aucune erreur émise par le code applicatif lui-même à aucune étape.

  **Non testé en conditions réelles — bloqué par l'absence de mot de passe superadmin dans cette session headless** : le scénario exact décrit par Jules (promotion via `session_members.is_moderator`, posée par `set_member_moderator`/`assign_moderator_to_table`, pas par `designate_moderator`). Le code qui consomme ce flag (`setSessionMemberIsModerator`, dans `load()` et dans l'abonnement realtime) est strictement le même que celui exercé ci-dessus — seule la RPC qui écrit `session_members.is_moderator=true` diffère — mais la session de vérification devrait dérouler ce chemin exact avant merge, pas seulement l'analogue.

  **Test minimal restant** (mot de passe superadmin requis) :
  1. **Scénario exact de Jules** : séance `debating`, participant déjà assis à une table (`ParticipantView`). Superadmin → onglet Membres, cocher "modérateur" sur ce participant (assis à une table déjà pourvue **ou** sans modérateur, peu importe — cf. chantier 37 point 2 pour la logique de placement). Sans que le participant ne fasse quoi que ce soit : recharger sa page → vérifier l'apparition immédiate de `ModeratorView` (plus besoin de quitter/rejoindre).
  2. **Variante en direct** : même mise en place, mais sans reload — laisser tourner ~5s (polling `load()`) ou vérifier que le realtime `session_members` (déjà actif, chantier 35) bascule l'écran instantanément.
  3. **Non-régression démodération (chantier 35, point 2 déjà listé ci-dessus)** : toujours vérifier avec ce correctif en place.

## Nettoyage des données de test (séances partagées)

Données factices laissées par les sessions de vérification navigateur, à nettoyer une fois les points correspondants confirmés (pas de MCP Supabase pour le faire depuis une session de chantier — voir la règle SQL ci-dessus ; à faire par la session de vérification ou par Jules directement). **Checklist unique par table** (2026-09-02, regroupée depuis les entrées individuelles précédentes — même contenu, pas de perte) :

- [ ] **Table `589D79`** (séance partagée "Test manuel — Vote & bascule modérateur (chantiers 35/37)") — à purger entièrement :
  - Participant **"Test Chantier40"** : table créée *leaderless* pour vérifier le chantier 40, **n'est plus leaderless** depuis le 2026-09-01 (clic "Devenir modérateur" → `designate_moderator` en navigateur réel pour vérifier le chantier 41 → table basculée `leaderless=false`, `created_by` = l'uid anonyme de la session de test). Ne pas s'étonner de la retrouver en table animée plutôt que leaderless au moment du nettoyage.
  - Participants **"TestChantier48A"** et **"TestChantier48B"** : créés pour vérifier le chantier 48. Les deux illustrent volontairement le bug visé par ce chantier — partis via "Quitter" sans jamais rejoindre une autre table, leurs lignes `participants` sont restées dans `589D79` (`leaveTable()` ne supprime jamais la ligne en base). **Garder tel quel tant que le test manuel restant du chantier 48 (bascule réelle via `switch_table`, désormais possible — la migration `switch_table` du chantier 48 reste toutefois hors du lot appliqué le 2026-09-02, à vérifier en base avant de compter dessus) n'a pas été joué** — ça sert de donnée de repro. Les deux ont aussi une ligne `session_members`/`table_assignments` dans la séance (auto-créées par `sync_table_assignment` lors du join en retard).
- [ ] **Table `6ABDC9`** (même séance partagée) — pseudo **"TestQ45"** + une réponse `questionnaire_responses` (note=4), créées pour vérifier le chantier 45.
- [ ] **Table `6296A9`** (leaderless, séance **TEST33A**) — participant **"Test Notes QA"**, créé pour vérifier le chantier 42.

## Historique / notes de session (non actionnable)

Notes de contexte conservées pour mémoire (règle append-only) mais qui ne demandent aucune action de Jules.

- **2026-08-01 — Réconciliation `main` local / `origin/main`** (préalable au merge du chantier 34) : `main` local et `origin/main` avaient divergé depuis `17c30ff` — `main` local contenait le chantier 29 jamais poussé, `origin/main` contenait 7 commits (chantier 30, B3, docs chantier 18) poussés directement sans passer par `main` local. Réconcilié dans un worktree dédié (`reconcile-main-20260801`), un seul conflit textuel sur `A_VERIFIER.md` (deux sessions ayant chacune inséré leur entrée en tête de "En attente"), résolu sans perte de contenu. `tsc`/`npm test` (90/90) OK, vérification navigateur rapide sans erreur console. Poussé en fast-forward sur `origin/main`. Tag de rollback : `pre-reconcile-main-20260801`.

- [ ] **2026-09-01** — Chantier 38 (reload/remount écran superadmin) — `src/screens/SuperadminScreen.tsx` (1 ligne), diagnostic uniquement sinon

  **Demande de Jules** : « sur l'écran superadmin, il y a un reload successif qui est très désagréable, et qui, toutes les 10 secondes ou moins, nous remmène en haut de la page ». Hypothèse de départ du chantier : un polling ou un abonnement Realtime qui remonte tout le composant au lieu de mettre à jour les données en place.

  **Investigation menée** (aucun accès au mot de passe superadmin — règle de sécurité constante de ce projet, confirmée par des dizaines d'entrées précédentes dans ce fichier — donc aucune manipulation avec un vrai secret) : lecture exhaustive de `SuperadminScreen.tsx` (4748 lignes) — seuls 3 `setInterval` existent, tous dans `SessionDetail` : `loadAssertions` (10 s), `loadMembers` (15 s), `loadStats` (15 s). Aucun ne remonte de composant : les `setState` qu'ils déclenchent (`setAssertions`, `setMembers`, `setVotingStats`) sont de simples mises à jour de props/état, aucun `key` instable trouvé sur un ancêtre commun, `AllocationPanel` a bien un `key={currentSession.id}` mais `currentSession.id` ne change jamais (vérifié : les 3 seuls `setCurrentSession` préservent `id`). Aucun `scrollTo`/`scrollIntoView`/`autoFocus` dans ce fichier ni dans `AllocationPanel.tsx`/`LLMModerationPanel.tsx`/`AnalysisPanel.tsx`/`TableDiagnosticsList.tsx`. Le seul canal Realtime de ce fichier (`table_assignments:<id>`) ne se ré-abonne que sur changement de phase, jamais sur un timer.

  **Reproduction dynamique** (technique déjà validée par une session précédente — cf. entrée E9/H10 plus haut — interception de `window.fetch` pour simuler une authentification superadmin réussie et des réponses RPC, **sans jamais saisir ni faire circuler de vrai mot de passe** ; bascule du hash `#superadmin`→`#foo`→`#superadmin` pour forcer un remount propre de `SuperadminScreen` avec le mock actif) : session factice montée avec succès dans l'onglet 🟢 En direct, en phase `voting` **et** en phase `allocating` (donc avec `AllocationPanel` affiché). Un marqueur JS posé sur `document.querySelector('main')` et un suivi de `window.scrollY` toutes les 3 s, sur ~50-80 s de test à chaque fois (compteurs d'appels confirmant que les 3 `setInterval` tournaient bien en continu, `list_assertions` et `voting_stats`/`list_members` incrémentant à leur cadence attendue) : **aucun remount détecté** (`main` jamais recréé), **`scrollY` resté rigoureusement stable** (testé à 400 px). Test répété à l'identique sur un **build de production** (`npm run build` + `vite preview`, donc sans Vite/HMR) : même résultat, zéro remount, zéro reset de scroll.

  **Hypothèse retenue faute de reproduction côté app** : le symptôme observé par Jules est très probablement un **rechargement complet déclenché par Vite HMR en mode `npm run dev`**, causé par des **sessions Claude Code concurrentes qui sauvegardent des fichiers `src/lib/*.ts`** (modules non-composants comme `lib/allocation.ts`, `lib/voting.ts`) pendant que son onglet navigateur pointe sur le **même serveur dev partagé** (`ecclesia-dev`, port 5173, dossier racine). Un module utilitaire (non-composant React) édité invalide tout le graphe de modules qui l'importe → HMR ne peut pas faire de mise à jour ciblée → rechargement complet de la page → perte du scroll. Preuve indirecte concrète : au tout début de cette session, `git status` sur le dossier racine partagé montrait déjà `src/lib/allocation.ts`, `src/lib/allocation.test.ts` et `bench/strategy-sanity.test.ts` modifiés et non commités par une autre session — cohérent avec le pattern documenté ailleurs dans ce dépôt de « plusieurs chantiers tournent en parallèle sur ce repo ». Cette hypothèse n'explique **pas** un rechargement observé sur le site déployé (GitHub Pages, sans HMR) — si le symptôme se reproduit aussi là, l'hypothèse ci-dessus est fausse et il faut rouvrir l'investigation (tester d'autres onglets — 🪑 Tables / ⚙️ Préparation — ou une séance avec beaucoup plus de données réelles, ce que cette session n'a pas pu reproduire sans le mot de passe).

  **Bug réel trouvé au passage (corrigé)** : `AnalysisPanel` recevait `sessionPhase={session.phase}` (ligne 2057) — la prop `session` est la copie **figée** reçue à l'ouverture de la fiche séance, jamais mise à jour après un changement de phase (c'est `currentSession`, mis à jour par `setCurrentSession`, qui suit la phase réelle). Conséquence : le toggle « auto-analyse » de `AnalysisPanel` (actif seulement en phase `voting`/`pre_voting`) restait activable indéfiniment si la fiche avait été ouverte pendant `voting` puis la séance passée en `allocating`/`debating` sans recharger la page. Corrigé en `sessionPhase={currentSession.phase}`. Sans rapport avec le symptôme de reload — ne change rien au scroll/remount, ne provoque aucune re-fetch supplémentaire (la prop ne contrôle qu'un `if` dans un `useEffect` déjà existant).

  **Déjà vérifié par moi** : `npx tsc -b` (exit 0). `npm run build` (production, exit 0). Reproduction Browser pane décrite ci-dessus, sur serveur dev (`chantier-38-dev`, port 5204, config ajoutée à `.claude/launch.json`) **et** sur build de production (`vite preview`, port 5210, arrêté après test). Après la correction d'`AnalysisPanel`, re-vérifié que la fiche séance factice (phase `allocating`) se remonte toujours sans erreur console (hors erreurs 400 attendues, dues au faux mot de passe non mocké pour tous les endpoints).

  **Non vérifié / reste à faire par Jules ou une session avec le mot de passe superadmin** :
  1. **Confirmer où le symptôme a été observé** : `npm run dev` local (avec ou sans autre session Claude Code active en parallèle dans le même dossier) ou site déployé GitHub Pages ? C'est la donnée manquante la plus importante pour trancher entre l'hypothèse HMR ci-dessus et un vrai bug applicatif non reproduit.
  2. Si le symptôme se reproduit **aussi en production** (ou en dev sans aucune autre session active) : retester spécifiquement les onglets 🪑 Tables et ⚙️ Préparation (non couverts par cette reproduction, qui s'est limitée à 🟢 En direct), et avec un volume de données réaliste (beaucoup d'assertions/membres), ce qu'une session sans mot de passe ne peut pas mettre en place elle-même.
  3. Parcours de clic réel sur une séance de test, avec captures d'écran/vidéo si possible du moment exact du "reload", pour confirmer s'il s'agit d'un vrai remount React (perte de tout l'état local, ex. accordéons qui se referment) ou seulement d'un reset de `scrollY` sans perte d'état (ce qui pointerait vers une cause navigateur plutôt qu'React).

  **⚠️ Hypothèse HMR infirmée par Jules (2026-09-01, 2ème passe)** : « lorsque je constate cette erreur, aucune séance Claude Code ne tournait » + « j'ai l'impression que c'est sur tous les onglets superadmin » + « ça ne clignote pas particulièrement ». Ce retour a rouvert l'investigation — **vrai bug applicatif trouvé et corrigé**, voir la nouvelle entrée en tête de la section **"Parcours Superadmin"** ci-dessous. La reproduction de cette 1ère passe (point "Reproduction dynamique" ci-dessus) n'avait rien vu car son `scrollY` de test (400px) restait **au-dessus** de la hauteur du spinner de chargement plein écran — donc jamais assez profond pour déclencher le clamp de scroll observable en usage réel (beaucoup de contenu ouvert = scroll bien plus profond que 400px). Conservé ici pour mémoire (append-only), ne plus utiliser comme diagnostic de référence.

## Validé

<!-- déplacer ici une fois vérifié, au format : - [x] **AAAA-MM-JJ (validé le AAAA-MM-JJ)** — `fichier` — description -->
