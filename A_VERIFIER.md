# À vérifier

> ✅ **La passe de validation manuelle de Jules du 06/09/2026 a été réintégrée ici le 2026-09-07** (chantier 78). Ses 37 entrées sont passées en section « Validé » en bas de page, chacune portant la mention « validé le 2026-09-06 » — **avec leur recette complète**, rien n'a été condensé, et l'annotation qu'il avait écrite dans sa passe est reportée sous chaque entrée. Ce fichier fait donc foi à lui seul : plus besoin de croiser avec un autre.
>
> ⚠️ **Douze de ces entrées portent la réserve « validé avant la refonte des chantiers 73/74 du 06/09, à revalider ».** Jules a validé sur le code déployé le matin du 06/09 ; les chantiers 73 et 74 ont été mergés **après**, et ont réécrit en profondeur `VoteScreen.tsx`, `EntryScreen.tsx`, `ParticipantToolsButton.tsx`, `PseudoForm.tsx`, `PhaseIndicator.tsx` et le composant d'ajout hors ligne. Une validation portant sur l'un de ces écrans a donc pu être invalidée depuis : la traiter comme un point rouvert, pas comme un acquis.
>
> 🗂️ [`docs/A_VERIFIER-passe-validation-jules-20260906.md`](./docs/A_VERIFIER-passe-validation-jules-20260906.md) reste dans le dépôt comme trace de ce qu'il a réellement vu à l'écran ce jour-là. Ne pas le supprimer ; ne plus s'en servir comme source de statut.

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

1. **Migration SQL en attente** (ci-dessous) — à appliquer avant de tester les chantiers 33, 39, 44, 46, 48, 54, 60, 61, 62, 64 et 66 (54 est indépendante de toutes les autres ; 62 n'ajoute pas de migration propre mais dépend de celle du 48, `switch_table` ; 64 se compose de trois fichiers, à appliquer dans l'ordre : `20260902_chantier64_leaderless_becomes_moderated.sql`, puis `20260902_chantier64b_leaderless_origin_and_revert.sql` (après le 48), puis `20260902_chantier64c_move_member_to_group_revert.sql` ; 66 s'applique après le 48 et toute sa suite 64b/64c, repart de leur dernière version de `switch_table`).
2. **Résultats publics (chantier 46)** — accueil (bouton + modale), superadmin (pastille par séance), page publique `#results/<id>`.
3. **Superadmin** — onglets Tables, Membres, phase voting.
4. **Participant** — vote/pré-vote, écran "Débat en cours", entrée en débat, résultats de fin de séance.
5. **Modérateur** (`ModeratorView`) — Code Ecclesia + vraie table animée requis. Couvre aussi le chantier 44 ("Ajouter une personne sans téléphone") et la refonte "Outils Modo" (chantier 43).
6. **Questionnaire post-débat** — les trois points d'entrée (table, `#vote/`, `#session/`) et leur déclenchement automatique à la clôture (chantier 39).
7. **Synchronisation temps réel (chantier 35)** — nécessite deux onglets/navigateurs en parallèle, à faire à part.
8. **Nettoyage des données de test** — une fois tout vérifié, purger les tables de QA listées en bas de fichier.

## Chantier 89 — phase `post_voting` (2026-09-07) — ✅ mergé sur `main` (`7bb7d3e`)

Nouvelle phase insérée entre `debating` et `closed` (demande de Jules : le revote post-débat doit être une fenêtre, pas un accès permanent — coupée dès la clôture). Détail dans `CLAUDE.md` § Ordre des phases / § Phase de vote (Bloc C). Migration appliquée (`supabase/migrations/20260907_chantier89_post_voting_phase.sql`).

Vérifié au navigateur côté **participant** le 2026-09-07 (séance QA jetable, purgée après test) — voir historique de ce fichier pour la recette complète : Realtime `debating → post_voting → closed`, questionnaire forcé, revote fonctionnel (vote changé en base), bouton « ↻ Revoter » qui disparaît bien en `closed`, zéro erreur console. Les transitions ont été faites par `UPDATE sessions.phase` en SQL direct (pas de mot de passe superadmin transmis à la session) — **rien côté superadmin n'est donc encore vérifié à l'écran** :

- [ ] **Bouton `PhaseBar` réel** — cliquer "Passer en Post-vote →" depuis l'onglet Live d'une séance en `debating`, et vérifier que `handlePhaseChange` appelle bien `force_session_questionnaire` (participants encore sur une table forcés au questionnaire) avant même que `sessions.phase` ne change côté DB.
- [ ] **Bouton "Passer en Clôturée →"** depuis `post_voting` — vérifier que le bouton `PhaseBar` propose bien cet intitulé (généré depuis `PHASE_LABEL`/`PHASE_SEQUENCE_LABELS`, jamais testé à l'écran) et que le clic déclenche la purge de `reclaim_code` pour les membres qui en ont un (un membre inscrit en `pre_voting`, pas juste `voting` comme le membre de test précédent).
- [ ] **`PhaseBar` — étapes cliquables directement** (cercles 0-6, `onPhaseSelect`) — vérifier qu'un saut direct `debating → closed` (en sautant `post_voting`) reste possible depuis l'UI et ne casse rien (les boutons non-linéaires existaient déjà avant ce chantier, mais jamais testés avec la phase `post_voting` insérée entre les deux).
- [ ] **Onglet "Live"** — `defaultTab` inclut désormais `post_voting` dans la liste qui garde l'onglet Live actif par défaut ; vérifier à l'écran que l'onglet superadmin reste bien sur "Live" (pas basculé sur "Analyse") juste après le passage en `post_voting`.
- [ ] **Badge de phase** — `PHASE_LABEL`/`PHASE_CLASS` : le badge "Post-vote" (fond teal, jamais utilisé ailleurs dans l'app) s'affiche correctement sur la carte de séance dans la liste superadmin et en haut du détail de séance.
- [ ] **Rattrapage de nommage des camps** — la condition élargie (`allocating`/`debating`/`post_voting`/`closed`) qui relance `loadLatestAnalysis` pour combler un `group_names` manquant/corrompu (chantier 28) n'a jamais été exercée en `post_voting` spécifiquement.
- [ ] Visiteur non inscrit sur `#session/<code>` pendant `post_voting` (`SessionRouterScreen`, statut `post_voting_no_member`, message "Le débat vient de se terminer") — nécessite une deuxième identité anonyme, pas simulée lors du test participant (même navigateur/storage).

## ⚠️ Migration SQL en attente d'application

> **✅ Mise à jour 2026-09-02 (session de consolidation)** : les 4 migrations des chantiers **60, 50, 51 et 61** ont été **appliquées par l'orchestration le 2026-09-02**. Les entrées ci-dessous pour ces 4 chantiers restent en place (append-only) mais ne bloquent plus sur l'application SQL — seuls les tests navigateur listés dans chacune restent à dérouler. Les migrations des chantiers **48, 46, 33, 39, 44 et 64** ci-dessous, elles, **n'ont pas de statut d'application confirmé** — ne pas les rejouer depuis une session de chantier (règle du 2026-09-01 ci-dessus), et ne pas présumer qu'elles sont passées : à vérifier en base avant de tester leur comportement.


- [ ] **Chantier 64 (complément 2) — `supabase/migrations/20260902_chantier64c_move_member_to_group_revert.sql`** — **à appliquer après la migration chantier 64b ci-dessus** (a besoin de `tables.leaderless_by_design`).

  **Ce qu'elle change** : `move_member_to_group` (glisser-déposer d'un membre vers un autre groupe, onglet Groupes du superadmin) applique désormais exactement la même bascule que `switch_table` — si le membre déplacé était le modérateur Bloc C (`session_members.is_moderator`) de la table qu'il quitte, et que cette table est `leaderless_by_design = true`, elle redevient `leaderless = true`. Une table conçue modérée dès l'origine ne bascule jamais, quel que soit le membre déplacé.

  **Inventaire demandé par Jules** (« vérifie s'il existe d'autres chemins... ») — recherche exhaustive de toute écriture dans `table_assignments` et de tout `DELETE FROM participants`/`session_members` sur l'ensemble de `supabase/migrations/` (détail complet en tête du fichier de migration) :
  - **Couverts par la bascule** : `switch_table` (chantier 48, complément initial) et `move_member_to_group` (ce fichier) — les deux seuls chemins où un membre quitte une table pour une AUTRE table du même type d'opération.
  - **Volontairement non couverts, chacun avec sa raison** :
    - `set_member_moderator(..., false)` — retrait EN PLACE, le membre ne change pas de `table_assignments`. Tranché dès le chantier 64 initial : ne bascule jamais.
    - `kick_participant` — supprime la ligne `participants` mais ne touche JAMAIS `table_assignments` (défaut préexistant, indépendant de ce chantier). Pas de table de destination : la personne est exclue, elle ne « part vers une autre table ». Le kick de soi-même comme modérateur n'est pas offert par l'UI (`ParticipantsTable`, bouton "Exclure") mais reste techniquement possible via appel RPC direct — signalé, non traité, à trancher séparément si Jules le juge nécessaire.
    - `assign_table_to_group` — catégorie différente : rebind la table PHYSIQUE de tout un numéro de groupe (`table_number`) pour TOUS ses membres d'un coup, sans jamais toucher `participants`. Le concept de « bascule au départ d'un membre » ne s'applique pas à une opération qui déplace un groupe entier.
    - `apply_allocation` — recalcul complet, déjà couvert différemment (chantier 64b) : chaque table touchée par un recalcul se voit reposer `leaderless_by_design` à la valeur du nouveau plan.
    - `run_clustering_v1/v2/v3`, `auto_assign_tables` — fonctions de clustering historiques, confirmées mortes (plus appelées par le frontend depuis le chantier 37) et ne touchant jamais `tables.leaderless` (vérifié par lecture, elles prédatent la colonne). Non modifiées.
    - Aucune RPC ne supprime jamais de ligne `session_members` — un membre ne peut être que réaffecté, auto-relogé, ou exclu physiquement d'une table, jamais retiré d'une séance entièrement.

  **Recette de vérification — superadmin déplace le modérateur d'une table convertie** :
  1. Séance avec une table `leaderless = true` dont un membre assis devient modérateur (`set_member_moderator`/`claim_moderator_status`/`assign_moderator_to_table`). Vérifier en base : `leaderless = false`, `leaderless_by_design = true`.
  2. Noter le nombre de lignes `speaking_turns` pour cette table et le contenu de la file d'attente (`queue_entries`) des AUTRES participants restés dessus.
  3. Onglet Groupes → glisser-déposer la carte de CE modérateur vers un autre groupe (`move_member_to_group`). **Observer** : la table d'origine repasse `leaderless = true` — badge "Sans modérateur" réapparaît (immédiat, `loadGroups()` est rappelé en séquence par `handleDragEnd`) ; un participant resté sur cette table voit à nouveau la possibilité de s'auto-gérer (`ParticipantView`, bloc "Groupe auto-géré").
  4. **Historique intact** : recompter `speaking_turns` pour cette table (identique à l'étape 2) et relire les entrées de `queue_entries` des participants restés (inchangées — aucune ligne supprimée ni tronquée par la bascule elle-même).
  5. **Non-régression, table conçue modérée** : répéter 1-3 sur une table `leaderless_by_design = false` (créée directement avec un modérateur, ou issue d'une allocation qui l'a désignée `moderated: true`). **Observer** : le déplacement du modérateur ne change RIEN — la table reste `leaderless = false`.
  6. **Non-régression, membre ordinaire** : sur la table convertie du test 1, déplacer un membre qui N'EST PAS le modérateur. **Observer** : la table reste `leaderless = false` — seul le départ DU modérateur bascule.

  **Recette de vérification — table conçue modérée, aucun changement au départ** :
  1. Créer une table via "Créer une table" (Code Ecclesia, pas la case "table sans animateur") ou par une allocation qui la désigne `moderated: true` dès le calcul. Vérifier `leaderless_by_design = false` en base.
  2. Le modérateur assis rejoint une autre table via "Je veux rejoindre une autre table" (`AllocatingScreen`, `switch_table`). **Observer** : la table quittée reste `leaderless = false` — toujours affichée "avec modérateur" côté superadmin (onglet Groupes), même sans personne dessus.

  **Recette de vérification — table convertie, bascule au départ** :
  3. Table `leaderless=true` dont un membre assis devient modérateur (`set_member_moderator`/`claim_moderator_status`/`assign_moderator_to_table` — chantier 64 initial). Vérifier `leaderless = false, leaderless_by_design = true` en base.
  4. Ce modérateur (et lui spécifiquement — pas un autre participant de la même table) clique "Je veux rejoindre une autre table" et rejoint une table différente. **Observer** : la table quittée **redevient** `leaderless = true` — badge "Sans modérateur" réapparaît côté superadmin (immédiat via `loadGroups()` si l'action vient du superadmin, sinon polling 10 s), et un participant resté sur cette table voit à nouveau la possibilité de s'auto-gérer (`ParticipantView`, bloc "Groupe auto-géré", bouton "Devenir modérateur" à nouveau visible).
  5. **Non-régression** : un participant ORDINAIRE (pas le modérateur) de cette même table convertie utilise "Je veux rejoindre une autre table" pour partir. **Observer** : la table reste `leaderless = false` — son départ ne doit rien basculer, seul le départ DU modérateur compte.

  **Recette de vérification — historique préservé (point explicitement souligné par Jules, ne pas se contenter d'une lecture de code)** :
  6. Avant la bascule du test 4 : noter le nombre de lignes dans `speaking_turns` pour cette table (`SELECT count(*) FROM speaking_turns WHERE table_id = '<id>'`), et le contenu de la file d'attente des AUTRES participants restés sur la table (`queue_entries`).
  7. Déclencher la bascule (test 4). **Observer** : le compte de `speaking_turns` est identique après (aucune ligne supprimée) ; les entrées de file des participants restés sont intactes (seule celle du modérateur parti, s'il en avait une, disparaît — cascade normale de la suppression de SA ligne `participants`, comme pour n'importe quel départ via `switch_table`, inchangé par ce chantier) ; les temps de parole cumulés affichés dans `ParticipantsTable`/export CSV restent corrects pour tout le monde.

- [ ] **Chantier 33 — `supabase/migrations/20260801_chantier33_moderator_table_assignment.sql`** (statut d'application non confirmé — aucune trace de vérification post-application dans l'historique, contrairement aux migrations chantier-35 et chantier-37 ci-dessous)

  **Contenu du fichier** : redéfinit `claim_moderator_status(session_id, creation_code, pseudo?)` pour (a) accepter la phase `debating` en plus de `pre_voting`/`voting`/`allocating`, et (b) asseoir automatiquement le nouveau modérateur sur la première table animée encore sans modérateur (ordre des numéros de table) via une nouvelle ligne `table_assignments`. Crée aussi `assign_moderator_to_table(password, session_id, table_number, member_id)` — assignation manuelle superadmin, pose `is_moderator=true` + `table_assignments`.

  **À faire (session de vérification)** : exécuter le contenu du fichier via le SQL Editor du dashboard Supabase (ou MCP), confirmer `SELECT proname FROM pg_proc WHERE proname IN ('claim_moderator_status','assign_moderator_to_table')` retourne bien les deux fonctions à jour, puis cocher cette entrée et dérouler le test manuel du chantier 33 ci-dessous (section Superadmin). **Tant qu'elle n'est pas appliquée** : le contrôle d'ajout/retrait de modérateur par table (`AddModeratorControl`) échoue silencieusement côté RPC, et l'auto-assise en phase `debating` reste bloquée par l'ancienne signature de `claim_moderator_status`.


- [ ] **Chantier 52 — `supabase/migrations/20260902_chantier52_valider_url_sources_fermer_collab_users.sql`** (jamais appliquée)

  **Contexte (audit sécurité 2026-08-03)** : deux constats distincts sur les sources collaboratives.
  1. Aucune validation de schéma sur `session_sources.url` — `add_collab_source`/`update_collab_source` acceptaient n'importe quelle chaîne, rendue ensuite cliquable dans un `<a href>` (`CollabDocScreen.tsx` et `SuperadminScreen.tsx`/`CollabSourcesList`). Un `javascript:`/`data:` inséré là exécute du script dans le navigateur de quiconque clique — le superadmin en premier lieu, puisqu'il consulte la liste des sources de toutes les tables.
  2. `collab_session_users` avait une policy SELECT `USING (true)` — même défaut que celui fermé pour `session_members`/`table_assignments` par le chantier 50 (confirmé en base le 2026-09-02). Un `GET /rest/v1/collab_session_users` avec la clé anon retournait pseudo + user_id de tous les inscrits aux documents collaboratifs de toutes les séances.

  **Contenu du fichier** :
  1. `is_valid_source_url(p_url text) RETURNS boolean` — NULL/chaîne vide autorisés (pas de lien), sinon schéma `http(s)://` obligatoire (insensible à la casse).
  2. `add_collab_source` et `update_collab_source` **redéfinies avec la signature inchangée** (5 et 4 arguments respectivement, `RETURNS public.session_sources`, vérifiée en relisant `20260527000006_collab_sources.sql` et `20260527130000_collab_table_join_code.sql`, seules migrations à toucher ces fonctions) — ajoutent la validation en tête, normalisent une URL vide/blanche en `NULL` avant écriture. Aucun autre comportement changé.
  3. `collab_session_users_select` (`USING (true)`) remplacée par `collab_session_users_select_own` (`USING (user_id = auth.uid())`), avec le même bloc `DO $chk$` de garde-fou contre une policy permissive résiduelle que le chantier 50.

  **Inventaire fait avant écriture** : une seule lecture directe de `collab_session_users` dans `src/` — `CollabDocScreen.tsx:83`, déjà filtrée `.eq('session_id', ...).eq('user_id', uid)` — non affectée par la fermeture. Pas d'abonnement Realtime sur cette table (elle n'est pas dans la publication `supabase_realtime`, contrairement à `session_sources`). Aucune fonction `SECURITY DEFINER` ne fait de lecture croisée dessus pour le superadmin : pas de RPC de remplacement nécessaire, contrairement au chantier 50.

  **Ce qui n'a PAS été inspecté** : le contenu réel de `session_sources.url` en base — impossible sans accès MCP Supabase direct depuis cette session (règle du 2026-09-01). **À faire en priorité par la session de vérification**, avant même d'appliquer la migration :
  ```sql
  SELECT id, session_id, pseudo, url FROM session_sources
  WHERE url IS NOT NULL AND btrim(url) <> '' AND url !~* '^https?://';
  ```
  Si cette requête retourne des lignes, **les signaler à Jules plutôt que de les modifier ou de les supprimer** (consigne explicite du brief de ce chantier).

  **Côté frontend, déjà livré (ne dépend pas de la migration pour compiler)** : `isSafeUrl()` dans `src/lib/utils.ts`, utilisée à l'affichage dans `CollabDocScreen.tsx` (`SourceCard`) et `SuperadminScreen.tsx` (`CollabSourcesList`) — un lien dont le schéma n'est pas `http(s)` s'affiche en texte rouge non cliquable au lieu d'un `<a href>`, **y compris pour les lignes déjà en base jamais validées à l'écriture**. Le formulaire d'ajout/modification de `CollabDocScreen.tsx` fait aussi un contrôle client immédiat (message "Lien invalide : seuls les liens http:// ou https:// sont acceptés.") avant l'appel RPC — pure UX, la défense réelle reste côté serveur. `npx tsc --noEmit`, `npm test` (94 passants) et `npm run build` OK.

  **À faire (session de vérification)** :
  1. La requête de repérage des URL douteuses ci-dessus, en premier.
  2. Exécuter le fichier via le SQL Editor du dashboard Supabase (ou MCP). Vérifier au préalable la signature des deux fonctions (`pg_get_function_identity_arguments('add_collab_source'::regproc)` / `('update_collab_source'::regproc)`) au cas où une session parallèle y aurait touché depuis l'écriture de cette migration — le fichier suppose la signature de `20260527130000_collab_table_join_code.sql`.
  3. Dérouler les requêtes de vérification en pied de fichier de migration (URL valide acceptée, `javascript:`/`data:`/bare hostname refusés, lecture publique de `collab_session_users` fermée, lecture self-only toujours fonctionnelle).
  4. Dérouler le test manuel de la section "Sources collaboratives" ci-dessous.

- [x] **Chantier 58 — `supabase/migrations/20260903_chantier58_restrict_session_columns.sql`** ✅ **appliquée le 2026-09-07** (via MCP, section 5 du fichier — `REVOKE`/`GRANT`, `onboarding_enabled` inclus dans la liste accordée), sur instruction explicite de Jules d'avancer avant la séance du 10/09 (même dérogation que les chantiers 58-merge/59). Répond au « Résidu non corrigé » signalé par le chantier 65 ci-dessus (ligne ~172) : `sessions` a une policy `SELECT USING (true)`, donc `description`, `doc_info_url`/`doc_summary_url`/`doc_collab_url` et surtout `group_names` (l'analyse PCA des camps — contourne le garde-fou `results_public`) étaient lisibles par n'importe qui avec la clé anon, pour toute séance y compris `draft`. Aucune dépendance avec les autres migrations en attente ci-dessus, applicable indépendamment.

  **Recette de vérification déroulée le 2026-09-07 (MCP + `curl` direct, clé `anon` publique, hors navigateur)** :
  1. Signatures des 4 RPC confirmées en base avant application (`pg_get_function_identity_arguments`/`pg_get_function_result`) — conformes à ce que le fichier attend.
  2. `onboarding_enabled` confirmée présente sur `sessions` (chantier 71) avant d'appliquer le `GRANT`.
  3. Après application : `information_schema.column_privileges` confirme le privilège `SELECT` limité à exactement `id, title, phase, join_code, scheduled_at, created_at, onboarding_enabled` pour `anon`/`authenticated` — aucune colonne annexe.
  4. `GET /rest/v1/sessions?select=description|doc_info_url|group_names|*` → `42501 permission denied for table sessions` (HTTP 401, pas 403 comme le fichier l'anticipait, mais le code Postgres `42501` documenté est bien celui obtenu).
  5. `GET /rest/v1/sessions?select=id,title,phase,join_code,onboarding_enabled` → 200, données réelles renvoyées.
  6. `get_session_by_id`/`get_session_by_join_code` → ligne complète (description, `doc_info_url`, `group_names`, `onboarding_enabled` inclus) sur une séance de test réelle.
  7. `list_public_closed_sessions()` → liste de séances closes avec `description`.
  8. `list_sessions_admin` avec un mauvais mot de passe → exception `P0001 Mot de passe superadmin incorrect`, comme attendu.

  **Test navigateur réel effectué le 2026-09-08** (`.claude/launch.json` recréé — absent du dépôt malgré la mention dans `CLAUDE.md`, à commiter). Séance jetable créée par SQL direct (`QA58TEST`, phase `voting`, `onboarding_enabled = true`), supprimée après coup :
  1. `#vote/QA58TEST` → titre de séance affiché correctement (lu via `getSessionByJoinCode`, RPC), écran d'intro puis formulaire d'inscription.
  2. Inscription d'un participant de test → `register_session_member`, onboarding 3 questions dérouché sans erreur → écran de vote.
  3. Proposition d'une assertion (`moderation_policy = 'open'`) → approuvée immédiatement, vote « D'accord » dessus → résumé de progression et consensus affichés correctement.
  4. Aucune erreur console, aucun 401/403 sur `sessions` observé pendant tout le parcours.
  5. Accueil (`EntryScreen`) : les deux séances en cours listées correctement (dont celle du 10/09, non touchée), et « Voir les votes des anciennes séances » (`list_public_closed_sessions`) affiche bien titre + date + description des séances closes publiques.

  Parcours superadmin (`list_sessions_admin`) non testé au clic (mot de passe superadmin non disponible pour cette session) — déjà couvert côté contrat par le test `curl` du 07/09 (RPC fonctionnelle, mauvais mot de passe rejeté).

  **Ce que ça change** : `REVOKE`/`GRANT` de colonne sur `sessions` — seules `id, title, phase, join_code, scheduled_at, created_at` restent lisibles par un `select()` direct (`anon`/`authenticated`). Les 8 autres colonnes (`description`, les 3 `doc_*_url`, `moderation_policy`, `phase_changed_at`, `group_names`, `results_public`) ne le sont plus. **Ce qui NE bouge PAS** (décision explicite de Jules) : la policy RLS elle-même reste `USING (true)` — `id`/`title`/`phase`/`join_code` d'une séance `draft` restent lisibles par qui devine son `id`, exactement comme le chantier 65 l'avait laissé. Ce chantier ferme uniquement les colonnes annexes, pas la visibilité des lignes.

  **4 nouvelles RPC `SECURITY DEFINER`** (aucun mot de passe requis sauf la 3ᵉ — comportement identique à ce que `select('*')`/le `select()` ciblé permettait déjà à n'importe qui, seul le canal change) :
  - `get_session_by_id(uuid)` / `get_session_by_join_code(text)` — ligne complète, remplacent les 8 lectures `select('*')` recensées (voir en-tête du fichier de migration pour la liste précise fichier:ligne) + les 2 lectures `select('title, join_code, doc_info_url, doc_summary_url, doc_collab_url')` de `ModeratorView.tsx`/`ParticipantView.tsx`.
  - `list_sessions_admin(password)` — remplace le `select('*')` de `SuperadminScreen.loadSessions()` (mot de passe superadmin requis, seule RPC des 4 qui l'exige — c'est le seul écran qui a besoin de TOUTES les séances, `draft` incluses, avec TOUTES les colonnes).
  - `list_public_closed_sessions()` — remplace le `select('id, title, description, scheduled_at')` de `PastSessionsModal` (accueil, « Voir les votes des anciennes séances ») ; filtre en base `phase='closed' AND results_public=true`, donc `description` n'est retourné que pour une séance explicitement rendue publique par le superadmin.

  **Inventaire fait avant écriture** (refait le 2026-09-03, celui du 02/09 datait déjà) : **15 lectures directes de `sessions` dans `src/`** — 8 en `select('*')`, 3 en `select(colonnes)` qui nommaient une colonne désormais retirée (donc tout autant cassées qu'un `select('*')`), 4 en `select(colonnes)` qui ne touchent que des colonnes restées publiques (inchangées). Détail fichier:ligne complet en tête du fichier de migration. Fonctions `SECURITY DEFINER` qui lisent `sessions` en interne (`create_session`, `close_session`, `set_session_phase`, `get_public_results`, `register_session_member`, etc.) : insensibles aux privilèges de colonne (s'exécutent avec les droits du propriétaire), non affectées — listées en tête du fichier de migration pour montrer qu'elles ont été distinguées des lectures directes, pas modifiées.

  **Fenêtre de casse** : aucune dans le sens migration-avant-code (le nouveau code fonctionne dès la migration appliquée, avec ou sans redéploiement). Dans le sens code-avant-migration en revanche, le nouveau frontend appelle des RPC qui n'existent pas encore tant que la migration n'est pas passée (erreur `PGRST202`/« function not found ») — **déployer le code seulement après application de cette migration**, pas avant.

  **`npx tsc --noEmit`, `npm test` (94 passants) et `npm run build` OK** — vérifié après rebase sur `main` du 2026-09-03 (chantiers 49/52/54/67 mergés entre-temps), un seul conflit trivial (deux imports ajoutés à la même ligne dans `EntryScreen.tsx`, résolu en gardant les deux).

  **À faire (session de vérification)** :
  1. Exécuter le fichier via le SQL Editor du dashboard Supabase (ou MCP).
  2. Vérification négative REST (clé anon publique, hors navigateur) :
     ```
     GET /rest/v1/sessions?select=*                            → attendu 403 / 42501
     GET /rest/v1/sessions?select=description                  → attendu 403 / 42501
     GET /rest/v1/sessions?select=group_names                  → attendu 403 / 42501
     GET /rest/v1/sessions?select=doc_info_url,doc_summary_url → attendu 403 / 42501
     GET /rest/v1/sessions?select=id,title,phase,join_code     → attendu 200, toutes les séances (draft incluses)
     ```
  3. RPC publiques (aucune auth requise) : `SELECT get_session_by_id('<session_id>');`, `SELECT get_session_by_join_code('<join_code>');`, `SELECT * FROM list_public_closed_sessions();` → attendu : ligne(s) complète(s), `description`/`doc_*_url`/`group_names` inclus.
  4. RPC admin : `SELECT * FROM list_sessions_admin('<mot de passe superadmin>');` (toutes séances, `draft` incluses) et `SELECT * FROM list_sessions_admin('mauvais-mot-de-passe');` (attendu : exception « Mot de passe superadmin incorrect »).
  5. Dérouler les scénarios de la section « Colonnes annexes de sessions (chantier 58) » ci-dessous, écran par écran.

## Sources collaboratives (chantier 52)

*Nécessite la migration SQL ci-dessus appliquée pour tester le refus serveur d'une URL à schéma non autorisé ; l'affichage sécurisé (lien masqué pour une ligne déjà en base) et le contrôle client sont eux indépendants de la migration — testables dès maintenant.*


- [ ] **Chantier 67 (point 2) — `supabase/migrations/20260902_chantier67_claim_moderator_prevoting.sql`**

  **Contenu du fichier** : redéfinit `claim_moderator_status(session_id, creation_code, pseudo?, reclaim_code?)` — nouveau 4e paramètre `p_reclaim_code text DEFAULT NULL`. Reprend exactement la règle de `register_session_member` (chantier 61) : `attending_in_person := v_phase != 'pre_voting'` (au lieu de toujours `true`), et le code de rappel n'est stocké que pour une inscription **créée** en `pre_voting` (branche « cas (a) », nouveau profil). La branche « cas (b) » (déjà inscrit sur cet appareil, simple `UPDATE is_moderator = true`) n'est pas concernée — elle ne touchait déjà ni l'un ni l'autre.

  **Pourquoi** : un modérateur qui se déclare depuis chez lui pendant `pre_voting` (onglet « 🎙️ Modérateur » d'`EntryScreen`) était compté `attending_in_person = true` dès l'inscription — faussant les stats de présence et l'allocation, qui filtrent toutes deux sur cette colonne — et ne recevait jamais de code de rappel, contrairement à un inscrit classique via `register_session_member`.

  **Signature changée (3 → 4 arguments)** : `DROP FUNCTION IF EXISTS claim_moderator_status(uuid, text, text)` explicite avant recréation (piège CLAUDE.md — un changement du nombre d'arguments crée une surcharge ambiguë au lieu de remplacer).

  **Code frontend déjà livré** (compile et tourne indépendamment de l'application de la migration — tant que l'ancienne fonction 3-aire reste en base, PostgREST résout dessus et ignore silencieusement le `p_reclaim_code` envoyé par le client, donc aucun crash, juste l'ancien comportement) :
  - `claimModeratorStatus()` (`src/lib/voting.ts`) accepte un 4e paramètre optionnel `reclaimCode`.
  - `EntryScreen.handleClaimModerator` génère un code à 4 chiffres côté client — même génération que `VoteScreen` pour `register_session_member`, pas de second générateur — l'envoie, et si la réponse renvoie `reclaim_code === candidateCode` (signe que la branche « nouveau profil en pré-vote » a tourné), affiche l'écran `ReclaimCodeDisplay` avant de rediriger vers `#vote/<join_code>`. Sinon (déjà inscrit, ou phase ≠ `pre_voting`), redirection immédiate comme avant.
  - `ReclaimCodeDisplay` extrait de `VoteScreen.tsx` vers `src/components/voting/ReclaimCodeDisplay.tsx` (composant partagé, réutilisé aux deux endroits — comportement visuel strictement identique à l'écran déjà existant en pré-vote classique).
  - `SessionMember.reclaim_code?: string | null` ajouté à `src/lib/types.ts` pour lire ce champ (absent du type avant ce chantier, jamais lu depuis la réponse d'une RPC jusqu'ici).

  **À faire (session de vérification)** :
  1. Vérifier la signature avant application (requête en tête du fichier de migration) — attendu avant : `claim_moderator_status(uuid, text, text)` → `jsonb`.
  2. Exécuter le fichier via le SQL Editor du dashboard Supabase (ou MCP).
  3. Rejouer la requête de signature : `claim_moderator_status(uuid, text, text, text)` → `jsonb`, une seule ligne.
  4. Dérouler le test manuel « Chantier 67 (point 2) » — section Parcours Participant ci-dessous.

  **Tant qu'elle n'est pas appliquée** : le comportement actuel (bug) reste actif — `attending_in_person = true` toujours posé, jamais de `reclaim_code` — et le nouvel écran `ReclaimCodeDisplay` ne s'affichera jamais côté `EntryScreen`, puisque `updated.reclaim_code` restera toujours différent de `candidateCode`.

- [ ] **Chantier 67 (point 3) — `supabase/migrations/20260902_chantier67_sync_table_assignment_log.sql`**

  **Contenu du fichier** : `sync_table_assignment` avalait silencieusement toute exception (`EXCEPTION WHEN OTHERS THEN NULL;`), y compris une collision de pseudo sur `session_members` (`UNIQUE(session_id, pseudo)`) — le participant rejoint bien physiquement sa table (`participants`) mais reste invisible du tableau de bord superadmin (`table_assignments` jamais posé), sans aucune trace de l'échec nulle part. Corrigé en remplaçant le `NULL;` par un `RAISE WARNING` (contexte : session/user/pseudo/table + `SQLERRM`), visible dans les logs Postgres/Supabase (dashboard → Logs). Signature et comportement transactionnel **inchangés** (`RETURNS void`, ne lève toujours jamais vers l'appelant) — voir la justification détaillée en tête du fichier de migration sur le choix « logger, pas lever » plutôt que faire échouer `join_table`/`create_table`/`switch_table`, qui ont déjà inséré la ligne `participants` dans la même transaction au moment où `sync_table_assignment` est appelée.

  **Recouvrement signalé, pas résolu ici** : `join_table` est retravaillé en parallèle par le chantier 66 sur ce même fichier source (`20260727_6_chantier26_sync_table_assignments.sql`). Cette migration ne touche **que** le corps de `sync_table_assignment` — aucun de ses trois appelants (`join_table`, `create_table`, `switch_table`) n'est modifié, précisément pour ne pas empiéter sur ce chantier en cours.

  **À faire (session de vérification)** :
  1. Exécuter le fichier via le SQL Editor du dashboard Supabase (ou MCP), confirmer la signature inchangée (`sync_table_assignment(uuid, uuid, uuid, text)` → `void`).
  2. Provoquer une collision volontaire : inscrire un membre de séance avec un pseudo X (n'importe quel inscrit), puis depuis un **autre** profil anonyme, rejoindre une table de la même séance en tapant ce même pseudo X (via `join_table`/`JoinTableForm`, `create_table`, ou `switch_table`).
  3. Vérifier que le join **réussit** normalement côté participant — aucun changement de comportement visible pour lui.
  4. Vérifier dans l'onglet Logs du dashboard Supabase (niveau warning/Postgres) l'apparition d'une ligne `sync_table_assignment: échec pour session=..., pseudo=X...`.
  5. Confirmer côté superadmin que ce participant reste bien absent de l'onglet 🪑 Tables — le bug lui-même (ligne `table_assignments` manquante en cas de collision) **n'est pas corrigé** par ce chantier, seule sa **visibilité** change (log au lieu de silence total).

  **Tant qu'elle n'est pas appliquée** : comportement actuel inchangé (échec toujours totalement silencieux, aucun log).


- [ ] **Chantier 68 — `supabase/migrations/20260903_chantier68_claim_table_as_moderator.sql`** (jamais appliquée) ⚠️ **à appliquer APRÈS le chantier 66** (`20260903_chantier66_join_table_single_table.sql`, branche `chantier-66-une-seule-table` — dépendance dure, voir plus bas)

  **Aucune vérification navigateur faite** (session headless, consigne explicite de ne lancer aucun serveur de dev). Seuls `npx tsc --noEmit`, `npm test` (94 tests) et `npm run build` ont été joués, tous verts.

  **Le problème** : `JoinTableForm` (case « Je suis modérateur de cette table ») et un chemin dupliqué dans `EntryScreen` (onglet « Rejoindre ou reprendre une table », même case) appelaient tous deux `reclaim_moderator`, qui écrase `tables.created_by` **sans aucune vérification** dès lors que le Code Ecclesia est valide. Le Code Ecclesia étant partagé entre tous les modérateurs, quiconque le connaît pouvait reprendre la main sur une table qui a déjà un modérateur actif et l'en déposséder silencieusement, en pleine séance.

  **Le correctif** : nouvelle RPC `claim_table_as_moderator(p_join_code, p_creation_code, p_pseudo, p_session_id?)`, appelée à la place de `reclaim_moderator` par `JoinTableForm` et `EntryScreen`. Vérifie dans l'ordre : (1) le Code Ecclesia, (2) que la table appartient bien à la séance précisée par l'appelant (`p_session_id`, optionnel — voir plus bas), (3) qu'aucun modérateur n'a déjà autorité sur cette table (nouveau helper `table_has_moderator`, généralisation de `is_table_moderator` du chantier 60 : « quelqu'un a-t-il déjà autorité ? » plutôt que « l'appelant a-t-il autorité ? », nécessaire ici puisqu'un nouvel arrivant n'a par construction aucun historique avec son `auth.uid()` sur cette table). Chaque échec lève un message dédié. Sur succès : devient créateur physique + siège comme participant, et pose `leaderless = false` (une table `leaderless` est une cible légitime — voir plus bas).

  **`reclaim_moderator` n'est PAS modifiée** — elle reste le seul chemin de vraie reprise de main (quelqu'un qui était déjà le modérateur de cette table précise et revient sur un nouvel appareil), sans la nouvelle vérification. Voir l'en-tête de la migration pour le détail complet du raisonnement, l'inventaire des appelants migrés (`JoinTableForm`, `EntryScreen` — `TestScreen` est du code mort, non touché) et pourquoi une table `leaderless` est ciblable par ce chemin (cohérent avec le chantier 64).

  **⚠️ Dépendance dure sur le chantier 66, découverte pendant l'écriture de cette migration (pas au premier passage — main a bougé entre-temps)** : le chantier 66 (`leave_other_session_tables`, appelé par `join_table`/`switch_table`) impose l'invariant « un participant n'est présent que dans une table à la fois au sein d'une séance ». `claim_table_as_moderator` insère elle aussi une ligne `participants` : sans le même appel, un modérateur en retard déjà assis ailleurs dans la séance (assigné par l'allocation à une autre table, par exemple) se retrouverait sur deux tables à la fois en prenant en charge celle-ci — exactement le bug que le chantier 66 vient de fermer pour les deux autres chemins d'entrée. Le corps de la fonction appelle donc `leave_other_session_tables(v_table.session_id, v_table.id, auth.uid())` avant l'insertion. **Si cette migration est appliquée avant le chantier 66** : `leave_other_session_tables` n'existe pas encore, la fonction se crée sans erreur (plpgsql ne valide pas les appels au moment du `CREATE`) mais **tout appel échoue à l'exécution** (`function leave_other_session_tables(...) does not exist`) — vérifier son existence avant d'appliquer (requête en tête de fichier de migration).

  **Point à trancher explicitement par la session de vérification, faute d'accès Supabase pour le confirmer ici** : `p_session_id` est optionnel — `SessionRouterScreen` (état `debating_no_member`) le transmet et bénéficie donc du refus « code d'une autre séance », mais `JoinTableScreen` (lien `#table/<code>` d'un ami) et `EntryScreen` (accueil générique) n'ont aucune séance en contexte et l'omettent : sur ces deux écrans, un code de table valide d'une AUTRE séance que celle visée par l'utilisateur serait accepté tant que la table elle-même n'a pas de modérateur. Décision assumée dans la migration (pas de séance à vérifier là où l'écran n'en connaît aucune) — signaler à Jules si ce comportement doit être resserré (ex. exiger une séance partout, quitte à perdre le cas `JoinTableScreen`/`EntryScreen`).

  **À faire (session de vérification)** :
  1. Vérifier `SELECT proname FROM pg_proc WHERE proname = 'leave_other_session_tables'` retourne une ligne (chantier 66 déjà appliqué) — sinon appliquer d'abord `20260903_chantier66_join_table_single_table.sql`.
  2. Exécuter le fichier via le SQL Editor du dashboard Supabase (ou MCP).
  3. Dérouler les 8 requêtes SQL de vérification en pied de fichier de migration (table sans modérateur → succès ; table déjà modérée, créateur physique assis → refus ; table modérée via Bloc C (`session_members.is_moderator` + `table_assignments`) → refus ; code d'une autre séance → refus ; table `leaderless` jamais réclamée → succès et bascule `leaderless = false` ; `reclaim_moderator` inchangée ; preneur déjà assis ailleurs dans la même séance → nettoyé par `leave_other_session_tables`).
  4. Dérouler les scénarios navigateur de la section « Prendre en charge une table en retard, par son code (chantier 68) » ci-dessous.

## Prendre en charge une table en retard, par son code (chantier 68)

*Nécessite la migration `20260903_chantier68_claim_table_as_moderator.sql` ci-dessus appliquée. Sans elle, les trois écrans ci-dessous continuent d'appeler une fonction PostgreSQL inexistante côté RPC (`claim_table_as_moderator`) — erreur affichée dans le formulaire, rien de silencieux.*

- [ ] **Cas nominal — `SessionRouterScreen`, séance en `debating`, jamais inscrit** — `#session/<join_code_séance>`

  1. Préparer une séance en phase `debating` avec au moins une table Bloc C rattachée (allocation appliquée), animée (`moderated: true` au calcul) mais **sans personne assise dessus** — l'état « table animée déjà formée mais encore sans modérateur assis » (chantiers 33/37/64). Noter le `join_code` de cette table précise et le `join_code` de la séance.
  2. Depuis un profil navigateur neuf (jamais inscrit à cette séance) : ouvrir `#session/<join_code_séance>`. Attendu : écran « 🗣️ Débat en cours » avec le formulaire de rattrapage (`JoinTableForm`).
  3. Cocher « Je suis modérateur de cette table », saisir le code de la table notée à l'étape 1, un nom, le Code Ecclesia → « Reprendre la main ».
  4. Attendu : navigation directe vers `ModeratorView` de cette table (pas d'erreur). Superadmin, onglet Groupes : la table n'affiche plus le badge « Sans modérateur », son `leaderless` est passé à `false` en base.

- [ ] **Refus — table déjà modérée, créateur physique assis** — même écran

  1. Table créée directement via « Créer une table » (Code Ecclesia, checkbox « Table sans admin » décochée) — un vrai modérateur y est donc déjà assis physiquement. Noter son `join_code`.
  2. Depuis un autre profil navigateur, même parcours que ci-dessus (case cochée, ce code, un nom, le Code Ecclesia) → « Reprendre la main ».
  3. Attendu : message d'erreur explicite « Cette table a déjà un modérateur — choisis-en une autre ou contacte le superadmin », **aucune navigation**, le modérateur en place n'est pas affecté (vérifier qu'il continue d'animer normalement sur son propre appareil pendant ce test).

- [ ] **Refus — table déjà modérée via Bloc C (désignation par l'allocation, pas de créateur physique)** — même écran

  1. Table Bloc C dont un membre a été désigné modérateur et **assis** dessus (`claim_moderator_status`, `set_member_moderator` ou `assign_moderator_to_table` — vérifier en base que `table_has_moderator('<id>')` retourne `true` avant le test, via le SQL Editor).
  2. Même tentative de prise en charge que ci-dessus, avec le code de cette table.
  3. Attendu : même refus explicite, alors que `tables.created_by` de cette table pointe encore vers le superadmin (pas vers le modérateur désigné) — c'est le point qui prouve que la vérification couvre bien les deux formes d'autorité du chantier 60, pas seulement `created_by`.

- [ ] **Refus — code d'une autre séance** — même écran

  1. Deux séances en `debating` en parallèle (A et B), chacune avec au moins une table sans modérateur assis. Ouvrir `#session/<join_code_séance_A>`.
  2. Dans le formulaire de rattrapage, saisir le code d'une table appartenant à la séance **B** (pas A).
  3. Attendu : message d'erreur explicite « Ce code de table n'appartient pas à cette séance », aucune navigation — même si cette table de B n'a elle-même aucun modérateur.

- [ ] **Table `leaderless` ciblée volontairement — devient modérée** — même écran ou `JoinTableScreen`

  1. Table créée « sans admin » (`leaderless = true`, jamais réclamée par personne).
  2. Prise en charge par ce chemin (case cochée, code de cette table, nom, Code Ecclesia).
  3. Attendu : succès — la table bascule `leaderless = false` en base, comme une désignation Bloc C (chantier 64). Un participant resté sur `ParticipantView` pour cette table doit basculer sur la vue modérateur pour le preneur, et perdre la proposition d'auto-gestion par file (plus de tentative silencieuse de `claimFloor()`) pour les autres.

- [ ] **`JoinTableScreen` — lien `#table/<code>` d'un ami, sans séance en contexte** — `#table/<join_code_table>`

  1. Reprendre le scénario « Cas nominal » ci-dessus, mais en ouvrant directement `#table/<join_code_table>` (lien de type D8, pas de passage par `#session/`).
  2. Attendu : même succès pour une table sans modérateur, même refus explicite pour une table déjà modérée (créateur physique ou Bloc C) — **sans** vérification d'appartenance à une séance (aucune séance n'est connue à cet endroit, `p_session_id` est omis). Un code de table valide appartenant à n'importe quelle séance est accepté tant que la table elle-même n'a pas de modérateur — comportement assumé, voir le point signalé dans l'entrée de migration ci-dessus.

- [ ] **`EntryScreen` — onglet « Rejoindre ou reprendre une table », accueil générique** — hash vide, onglet « Rejoindre »

  1. Depuis l'accueil (pas de séance sélectionnée), onglet « Rejoindre ou reprendre une table », cocher « Je suis modérateur de cette table ».
  2. Reprendre les scénarios « Cas nominal » et les deux refus (table déjà modérée, l'une ou l'autre forme) avec les codes de table correspondants.
  3. Attendu : mêmes résultats que sur `JoinTableScreen` — pas de vérification de séance ici non plus.

- [ ] **Non-régression — vraie reprise de main toujours permise** — n'importe lequel des trois écrans ci-dessus

  1. Table dont le modérateur physique a perdu sa session (nouvel onglet privé = nouvel `auth.uid()` anonyme), ou changé d'appareil. Depuis ce nouveau profil : case cochée, le code de SA table, un nom, le Code Ecclesia.
  2. Attendu : succès (même si la table « a déjà un modérateur » au sens de `table_has_moderator`, `reclaim_moderator` reste le chemin appelé pour cette action précise si un jour elle est réexposée dans l'UI — actuellement l'UI n'expose plus que `claim_table_as_moderator` sur ces trois écrans, donc **ce scénario passe par le même refus explicite que « table déjà modérée »** ci-dessus tant qu'aucun écran dédié à la vraie reprise de main n'existe. **Point à confirmer avec Jules** : si un modérateur légitime qui a perdu sa session doit pouvoir reprendre sa propre table depuis ces écrans, il se heurtera désormais au même refus qu'un voleur — la distinction entre « reprise légitime » et « vol » n'est plus faite côté UI depuis ce chantier, seule la RPC `reclaim_moderator` (non appelée par aucun écran restant) sait encore le faire sans vérification. À trancher : faut-il un chemin UI dédié pour la vraie reprise de main (ex. un mode distinct, ou une question posée à l'utilisateur), ou ce cas est-il jugé assez rare pour rester au superadmin (`assign_moderator_to_table`) ?

- [ ] **Interaction avec le chantier 66 — le preneur était déjà assis à une autre table de la même séance** — n'importe lequel des trois écrans

  **Contexte** : `join_table`/`switch_table` (chantier 66) garantissent qu'un participant n'est jamais présent sur deux tables à la fois au sein d'une même séance, via le helper `leave_other_session_tables`. `claim_table_as_moderator` insère elle aussi une ligne `participants` — ce scénario vérifie qu'elle respecte le même invariant plutôt que de dupliquer le participant sur deux tables.

  1. Séance en `debating` avec deux tables A et B rattachées, toutes deux sans modérateur assis sur B. L'appareil de test est déjà participant (simple, pas modérateur) de la table A — par exemple via son affectation d'allocation.
  2. Depuis cet appareil : prendre en charge la table B par ce chemin (code de B, nom, Code Ecclesia).
  3. Attendu : succès sur B (nouveau modérateur, `leaderless = false` si elle l'était). **Et** : l'appareil disparaît de la table A — plus de ligne dans `participants` pour ce `user_id` à la table A, micro libéré s'il parlait, tour en cours clos. Si l'appareil était le modérateur Bloc C d'une table A `leaderless_by_design = true`, A redevient `leaderless = true` (même bascule que `switch_table`).
  4. **Non-régression** : sur une table A `leaderless_by_design = false` (conçue modérée dès l'origine), répéter le test — A doit rester `leaderless = false` après le départ, comme pour `switch_table`/`move_member_to_group` (chantier 64b/64c).
  5. **Table sans séance** : répéter avec une table B `leaderless` standalone (`session_id` NULL, jamais rattachée à une séance) — le nettoyage ne doit rien tenter côté table A (early return de `leave_other_session_tables` sur `p_session_id IS NULL`), donc si A et B ne partagent pas de séance, l'appareil reste normalement sur A (aucune notion de « même séance » ne s'applique).


## Résultats publics (chantier 46)

*Nécessite la migration SQL ci-dessus appliquée pour tester le flux de bout en bout (nouvelle colonne `results_public` + nouvelle forme du payload `get_public_results`). Sans elle : le bouton "Résultats publics" du superadmin échoue avec l'erreur Postgres "column sessions.results_public does not exist" (vérifié en navigateur ci-dessous, échec propre — pas de crash) et `get_public_results` renvoie encore l'ancienne forme (`groups`/`consensus`) que le frontend ne lit plus, donc `points`/`assertions` restent vides même pour une séance déjà close.*


- [ ] **2026-09-01 — Bouton "Résultats publics" par séance (superadmin)** — `src/screens/SuperadminScreen.tsx` (`SessionCard`)

  Sur chaque séance `closed` de la liste superadmin (écran de liste, avant d'ouvrir le détail) : pastille bascule "Résultats privés" (gris) / "Résultats publics" (vert) à côté de la description. Appelle `set_session_results_public` (mot de passe déjà en session), mise à jour optimiste de la liste avec rollback si l'appel échoue (message d'erreur affiché sous la pastille). Nommage tranché sans consulter Jules davantage : "Résultats publics" plutôt que sa proposition "Visible post débat" — le libellé décrit l'effet (qui peut voir quoi) plutôt que le moment (déjà capturé par le badge de phase "Clôturée" juste au-dessus), cohérent avec le style des autres badges d'état de la carte.

  **Non testable en session headless** : aucun mot de passe superadmin disponible. Uniquement vérifié : `tsc -b`, `npm test` (94 passants), `npm run build`, chargement de l'écran d'accueil sans erreur console. Le comportement d'échec pré-migration (colonne absente) a été vérifié indirectement via la modale "Anciennes séances" ci-dessus, qui tape la même colonne.

  **Test minimal (mot de passe superadmin requis, migration appliquée au préalable)** : ouvrir une séance close depuis la liste, cliquer la pastille → passe à "Résultats publics" sans reload ; recharger la page → l'état persiste (relu depuis `sessions.results_public`) ; cliquer à nouveau → repasse à "Résultats privés". Vérifier qu'aucune pastille n'apparaît sur les séances non closes.


## Colonnes annexes de sessions (chantier 58)

*(migration SQL requise — voir l'entrée dédiée section « Migration SQL en attente d'application », plus haut, pour le contenu complet et les vérifications REST/RPC directes.)*

Session headless — aucun de ces scénarios n'a été joué à l'écran. Seuls `tsc -b`, `npm test` (94 passants) et `npm run build` ont été vérifiés côté outillage, après rebase sur `main` du 2026-09-03. Chaque scénario ci-dessous exerce un écran dont la lecture de `sessions` a été convertie (`select('*')` ou colonne retirée → RPC) ; l'objectif est de confirmer qu'aucun de ces écrans ne charge plus « vide » ou en erreur 403 après application de la migration.

- [ ] **Accueil (`EntryScreen`) — liste des séances en cours, inchangée** — `src/screens/EntryScreen.tsx`. Ouvrir l'accueil avec au moins une séance en `pre_voting`/`voting`/`allocating`/`debating` : la carte titre + badge de phase + bouton d'action doit s'afficher normalement (ces 3 requêtes n'ont pas changé, elles ne touchaient déjà que `id, title, phase, join_code` — ce scénario est une non-régression, à vérifier que le rebase sur les chantiers 65/67 n'a rien cassé).

- [ ] **Accueil — modale « Anciennes séances »** — `src/screens/EntryScreen.tsx` (`PastSessionsModal`), maintenant sur `list_public_closed_sessions()`. Prérequis : au moins une séance `closed` avec `results_public = true` portant une `description` et un `scheduled_at` non nuls. Cliquer « Voir les votes des anciennes séances » → la carte doit afficher titre, date ET description (les 3 champs, pas seulement le titre — c'est justement le champ `description` dont la lecture directe vient d'être coupée). Vérifier aussi qu'une séance `closed` avec `results_public = false` n'apparaît PAS dans la liste (déjà le comportement attendu avant ce chantier, non-régression).

- [ ] **Vote (`VoteScreen`) — écran de pseudo, phase `pre_voting`** — `src/components/voting/PseudoForm.tsx` lit `session.description` pour l'afficher sous le titre de la séance. Rejoindre `#vote/<join_code>` d'une séance `pre_voting` dont la `description` est renseignée → le texte doit apparaître sous le formulaire de pseudo, exactement comme avant ce chantier (la donnée vient maintenant de `get_session_by_join_code`, pas d'un `select('*')` direct — le rendu ne doit rien montrer de différent).

- [ ] **Vote (`VoteScreen`) — bandeau de modération, `moderation_policy`** — `src/components/voting/SubmitAssertionModal.tsx` affiche un texte différent selon `session.moderation_policy === 'closed'`. Sur une séance dont la politique est « Modération manuelle », ouvrir « Proposer une assertion » → le texte d'avertissement (assertion en attente de validation) doit apparaître. Sur une séance en politique « Ouverte », ce texte ne doit pas apparaître. Non-régression pure — cette donnée passe maintenant par les RPC de lecture de `sessions`.

- [ ] **Vote (`VoteScreen`) — polling de secours phase, sans rechargement** — deux onglets sur la même séance en `pre_voting` : dans l'un, garder `#vote/<join_code>` ouvert sur l'étape "waiting"/"vote" (ne pas recharger) ; dans l'autre (superadmin), faire avancer la phase (`pre_voting → voting`, ou `voting → debating`). Sous ~10 s, le premier onglet doit détecter la transition et changer d'étape tout seul (`getSessionById` remplace directement le `select('*')` qui alimentait ce polling — un oubli ici planterait silencieusement le `setInterval`, sans erreur visible à l'écran, seulement en console réseau).

- [ ] **Débat — liens de documentation (`ModeratorView` et `ParticipantView`)** — `src/screens/ModeratorView.tsx` / `src/screens/ParticipantView.tsx`, bouton « Documentation ». Séance rattachée à une table (`table.session_id` non nul) avec au moins une des 3 URL (`doc_info_url`/`doc_summary_url`/`doc_collab_url`) renseignée : ouvrir le menu Documentation côté modérateur ET côté participant → les liens doivent apparaître et pointer vers la bonne URL (c'est exactement la lecture qui utilisait `select('title, join_code, doc_info_url, ...)` avant ce chantier — la colonne est maintenant fermée en direct, donc un oubli dans la conversion RPC viderait silencieusement le menu, sans erreur visible côté UI puisque `DocumentationButton` se contente de masquer les liens absents).

- [ ] **Allocation (`AllocatingScreen`) — polling de secours phase** — même principe que le polling `VoteScreen` ci-dessus, mais sur la transition `allocating → debating`. Un participant sur l'écran d'allocation (bouton « Rejoindre » pas encore affiché) pendant que le superadmin déclenche l'ouverture du débat → sous ~10 s, le bouton « Rejoindre »/le passage à l'écran suivant doit apparaître sans rechargement.

- [ ] **Résultats (`SessionRouterScreen` / `PublicResultsScreen`) — routage et résultats publics** — `#session/<join_code>` sur une séance `closed`. Membre inscrit → doit atterrir sur `ResultsMapScreen` (ou le questionnaire post-débat s'il n'a pas répondu) sans erreur ; visiteur non inscrit → `PublicResultsScreen`, avec le nom des camps si `group_names` est renseigné (donnée désormais servie par `get_session_by_join_code`, plus par un `select('*')` direct — un oubli ici afficherait des camps sans nom au lieu de planter, donc vérifier spécifiquement que le nom apparaît, pas seulement l'absence d'erreur). Tester aussi `#results/<session_id>` directement (accueil → « Anciennes séances » → clic sur une carte) — chemin qui passe par `getSessionById`, distinct du précédent.

- [ ] **Superadmin — liste des séances, tous les champs d'édition** — `src/screens/SuperadminScreen.tsx` (`loadSessions`, maintenant sur `list_sessions_admin(password)`). Se connecter en superadmin → la liste doit inclure les séances `draft` (contrairement à l'accueil public) avec, sur chaque carte/détail : description, dates, URLs des 3 documents, pastille `results_public`, politique de modération, noms de groupes déjà générés (`group_names`) — tous des champs désormais fermés à la lecture directe pour tout le monde SAUF cette RPC. Modifier une description ou une URL de document, enregistrer, recharger la page → la valeur doit persister (confirme que l'édition elle-même, qui passe par `update_session_docs`/RPC dédiées non touchées par ce chantier, fonctionne toujours après le changement de lecture).

- [ ] **Vérification négative — clé anon, hors navigateur** — voir le détail complet (requêtes REST exactes) dans l'entrée de migration ci-dessus. Rappel synthétique : `select=*` et `select=` sur n'importe laquelle des 8 colonnes retirées doivent répondre 403/42501 ; `select=id,title,phase,join_code` doit continuer à répondre 200 avec toutes les séances (y compris `draft` — pas dans le périmètre de ce chantier, cf. note sur le chantier 65 plus haut).

## Parcours Superadmin

- [ ] **Chantier 54 — non-régression : le superadmin peut toujours supprimer une table** *(migration SQL requise, voir section « Migration SQL en attente d'application »)*

  **Pourquoi ce test** : ce chantier a retiré au modérateur le droit RLS de supprimer une table (`tables_delete_moderator`). Le superadmin passe par un chemin entièrement différent (RPC `SECURITY DEFINER` `delete_table_admin`, indépendante de RLS) qui ne doit pas être affecté — ce test le confirme.

  1. Onglet 🪑 Tables (ou l'écran équivalent listant les tables d'une séance), créer une table de test (bouton "+ Sans admin" ou via "Créer une table") puis la supprimer via le bouton "Supprimer" → confirmer dans la modale ("Supprimer définitivement la table ... ? Tous les participants, tours et files seront supprimés.") → la table disparaît de la liste, sans erreur.
  2. Vérifier que les tables restantes de la séance ne sont pas affectées (composition, badges de seuil inchangés).

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


- [ ] **2026-09-02 — Chantier 67 (point 2) — code de rappel pour un modérateur qui se déclare en pré-vote** — `src/screens/EntryScreen.tsx`, `src/components/voting/ReclaimCodeDisplay.tsx` *(migration `20260902_chantier67_claim_moderator_prevoting.sql` requise — voir « Migration SQL en attente » plus haut)*

  **Aucune vérification navigateur faite** (session headless). `tsc`/`test`/`build` verts.

  **Test minimal** (après application de la migration) :
  1. Séance en phase `pre_voting`, avec un `join_code`. Depuis un profil navigateur neuf, aller sur l'accueil (`EntryScreen`), onglet « 🎙️ Modérateur ».
  2. Sélectionner la séance, saisir un nom **jamais utilisé** sur cette séance, le Code Ecclesia → « Rejoindre en tant que modérateur ».
  3. Observer : l'écran « Note ton code de rappel » (🔑) s'affiche — pseudo + code à 4 chiffres — **avant** la redirection vers le vote (nouveau comportement ; avant ce chantier, aucun code n'était jamais affiché pour ce parcours).
  4. Cliquer « Continuer vers le vote → » → arrivée directe sur l'écran de vote (pas d'onboarding — la pré-vote n'en a pas).
  5. Superadmin, onglet Membres : vérifier que ce membre a `attending_in_person = false` et `is_moderator = true`.
  6. **Non-régression — phases `voting`/`allocating`/`debating`** : refaire le même parcours sur une séance dans une de ces phases → observer qu'**aucun** écran de code de rappel ne s'affiche (redirection immédiate comme avant), et que le membre créé a bien `attending_in_person = true`.
  7. **Non-régression — déjà inscrit** : sur un profil déjà membre de la séance en `pre_voting` (a déjà voté), utiliser le même onglet « 🎙️ Modérateur » → observer une redirection immédiate (pas d'écran de code — cas (b) de la RPC, comportement inchangé) et `is_moderator` passé à `true` sur le membre existant, sans toucher son `attending_in_person`/`reclaim_code` d'origine.


- [ ] **2026-09-02 — Chantier 50 — écran d'affectation et lectures participant sous les policies self-only** *(migration SQL requise, voir plus haut)*

  **Ce qui est en jeu** : les 4 lectures directes de `session_members` du frontend sont déjà filtrées `.eq('user_id', userId)` (`TableContext`, `SessionRouterScreen` ×2, `VoteScreen`) et `get_my_table_assignment` est SECURITY DEFINER — en théorie rien ne change côté participant. Ces tests servent à confirmer qu'aucune lecture n'avait été oubliée à l'inventaire. Aucun de ces fichiers n'a été modifié par ce chantier.

  **À vérifier après application de la migration** (un participant réel, séance réelle) :
  1. **Écran d'affectation** (`AllocatingScreen`, phase `allocating`) : le numéro de groupe et le code de la table s'affichent, et le bouton « Rejoindre » mène bien à la bonne table. C'est le point le plus exposé — il dépend de `get_my_table_assignment`.
  2. **Attente d'affectation** : arriver sur l'écran d'affectation **avant** que le superadmin ait lancé l'allocation, puis le laisser la lancer → l'affectation doit apparaître seule en ≤ 10 s (Realtime sur sa propre ligne, ou polling de secours), sans reload.
  3. **Vote** (`VoteScreen`, `pre_voting` et `voting`) : un participant déjà inscrit qui revient sur `#vote/<code>` est bien reconnu (pas de nouvelle demande de pseudo).
  4. **Reconquête d'un pseudo déjà pris** (`PseudoForm` en `pre_voting`, `VotingEntryForm` en `voting`) : saisir un pseudo déjà inscrit doit toujours proposer l'écran de reconquête et le mener à bien (par le nom **et** par le code de rappel). Ces chemins passent par des RPC, ils ne devraient pas bouger — mais c'est le seul endroit où le frontend raisonne sur des inscriptions qui ne sont pas les siennes.
  5. **Routeur** (`#session/<code>`) : en `debating`, un membre inscrit est redirigé vers `#vote/`, un visiteur non inscrit voit le message « pas membre ». En `closed`, un membre non répondant voit le questionnaire, un membre répondant voit la carte des résultats, un visiteur voit les résultats publics. C'est le test qui prouve que `SessionRouterScreen` distingue toujours membre et non-membre.
  6. **Entrée en débat** : rejoindre la table depuis l'écran d'affectation → `ParticipantView` s'affiche sans reload, avec le bon compte de présents.


- [ ] **Chantier 36 — Point 2 : case "Je suis modérateur" sur l'écran "Débat en cours"**
  Mergé sur `main` (`0c98775`), aucune migration.

  **Comportement attendu** : écran "Débat en cours" (accessible via "Séances en cours" → "Rejoindre →" sur une séance `debating`) : cocher "Je suis modérateur de cette table" révèle un champ "Code Ecclesia" ; la soumission doit amener en `ModeratorView` (pas `ParticipantView`) sur la table dont le code a été saisi.

  **Hypothèse non tranchée avec Jules** : ce point réutilise `reclaim_moderator` (rejoint *la table dont le code a été saisi*) plutôt que `claim_moderator_status` (auto-assise sur la première table animée en attente, chantier 33). Si le comportement attendu était plutôt ce second mécanisme, c'est un choix différent à trancher.

  **Test minimal** : "Séances en cours" → "Rejoindre →" sur une séance `debating`, compte n'ayant jamais rejoint cette séance → cocher la case, code de table réel + Code Ecclesia réel → vérifier l'arrivée en `ModeratorView`.


- [ ] **Chantier 35 — synchronisation temps réel du statut modérateur (volet participant)**
  Voir la section dédiée **"Synchronisation temps réel (chantier 35)"** plus bas.


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

- [ ] **Chantier 54 — le modérateur ne peut plus supprimer sa table** *(migration SQL requise, voir ci-dessus)*

  **Déjà vérifié** : `npx tsc --noEmit` propre, `npm run build` réussi, `npm test` → 92 passés / 2 échecs / 1 skip. Les 2 échecs (`bench/strategy-sanity.test.ts`, seuils de latence à 5 s sur un calcul d'allocation à 200 personnes) sont préexistants et sans rapport avec ce chantier — le diff ne touche que `CLAUDE.md` et `src/context/TableContext.tsx`, jamais `src/lib/allocation.ts` ; probablement de la contention CPU due aux sessions en parallèle sur cette machine. Aucun test navigateur (consigne : plusieurs sessions se disputent le harnais).

  1. **Bouton absent** : ouvrir `ModeratorView` sur une vraie table animée (Code Ecclesia). Chercher un bouton "Terminer la session" / "Supprimer la table" dans tout l'écran (header, footer, "Outils Modo") → **il ne doit apparaître nulle part**. C'était déjà vrai avant ce chantier (retiré en juin 2026) — ce point confirme la non-régression.
  2. **Appel API direct bloqué** (le vrai test de ce chantier — c'est lui qui était cassé) : depuis la console DevTools du navigateur du modérateur, sur une table qu'il anime réellement :
     ```js
     const { data: { session } } = await window.supabase.auth.getSession()
     await fetch('<VITE_SUPABASE_URL>/rest/v1/tables?id=eq.<table_id>', {
       method: 'DELETE',
       headers: {
         apikey: '<VITE_SUPABASE_ANON_KEY>',
         Authorization: `Bearer ${session.access_token}`,
       },
     }).then(r => r.status)
     ```
     (adapter si `window.supabase` n'est pas exposé globalement — sinon reproduire l'appel avec `fetch` et le token de session récupéré via `localStorage`). Avant la migration : `204` et la table disparaît. Après la migration : la requête réussit toujours au niveau HTTP (RLS filtre silencieusement, comportement standard PostgREST) mais **0 ligne affectée** — recharger la page confirme que la table existe toujours, avec tous ses participants, sa file et son historique de tours intacts.
  3. **Aucun effet de bord** : après le test précédent, vérifier que la table est toujours pleinement fonctionnelle — donner la parole, retirer la parole, file d'attente — rien ne doit avoir été perturbé par la tentative de suppression avortée.


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

  **Complément chantier 64 (2026-09-02)** : ce chantier ne tranche PAS le point ci-dessus, mais réduit sa portée. `set_member_moderator`, `claim_moderator_status` et `assign_moderator_to_table` posent désormais aussi `tables.leaderless = false` quand ils affectent explicitement un modérateur à une table leaderless — donc le cas « un modérateur légitimement affecté à sa table via l'un de ces trois chemins » n'est plus dans la zone grise : la table cesse d'être leaderless en même temps, `CLAUDE.md` et l'affichage superadmin restent cohérents avec l'autorité réelle. Le cas résiduel décrit ci-dessus (modérateur en **surplus**, `is_moderator=true` resté vrai en base sans être passé par un réajustement explicite de table, assis par hasard sur une table leaderless via un chemin qui ne passe par aucune de ces trois RPC) reste entier et toujours à trancher par Jules.

  **Limitation pré-existante, non corrigée par ce chantier** : le tableau « En direct » de la liste des séances (`list_session_tables`, colonne `moderator_pseudo`, utilisé par `SuperadminScreen` dans la carte de séance repliable) dérive le pseudo du modérateur via `participants.user_id = tables.created_by` — qui ne pointe jamais vers le vrai modérateur assis pour une table issue de l'allocation (Bloc C), `created_by` y restant l'uid du superadmin (même défaut que documenté par le chantier 60 pour d'autres lectures). Une table convertie par le chantier 64 y affichera donc toujours un pseudo de modérateur vide, alors que l'onglet Groupes (source fiable, `table_assignments` × `session_members`) l'affiche correctement. Pas corrigé ici : défaut plus large que ce chantier, pré-existant pour toute table Bloc C qu'elle ait été convertie ou non.

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

## Onboarding optionnel (chantier 71)


- [ ] **2026-09-06 — Chantier 72 — 4 migrations, jamais appliquées** — modération superadmin (bug de reprise de table, ajout de modérateur, défaut d'allocation, faille `add_collab_source`, édition titre/description, déplacement d'accordéon)

  **Périmètre imposé** : SQL + `src/screens/SuperadminScreen.tsx`. `VoteScreen.tsx`, `EntryScreen.tsx`, `ParticipantView.tsx` (chantier 73) et `PhaseIndicator.tsx`, `ModeratorView.tsx` (chantier 74) **non touchés**. `src/lib/allocation.ts` non touché (hors périmètre permanent). Deux écarts assumés au périmètre, tous deux en ajout pur en fin de fichier (aucune ligne existante modifiée, risque de conflit minimal avec les sessions parallèles) : `src/lib/sessions.ts` (+`updateSessionMeta`) et `src/lib/voting.ts` (+`releaseTableModeration`, +`ReleaseTableModerationResult`) — les wrappers RPC vivent dans `lib/` par convention du projet, appeler `supabase.rpc` directement depuis un écran aurait été le vrai écart.

  **Aucun accès MCP Supabase dans cette session.** Les corps de fonctions recopiés dans les migrations viennent des fichiers de `supabase/migrations/`, **pas de la base**. Chaque fichier porte en tête la requête `pg_get_functiondef` à jouer **avant** application pour confirmer qu'aucune version plus récente n'existe en base (règle « la vérité est en base », incident chantier 67).

  ---

  ### Bug 1 — « Cette table a déjà un modérateur » — diagnostic

  Retour de Jules : après un retrait de modération par le superadmin, plus personne ne peut prendre la table ; et lui-même, en resaisissant **exactement le pseudo du modérateur** (`T33 Mod1`, table `A10001`) avec le bon Code Ecclesia, se voit répondre qu'il y a déjà un modérateur.

  Le message vient d'un seul endroit : le point 4 de `claim_table_as_moderator` (chantier 68) → `table_has_moderator(table_id)`, dont les deux branches sont **(a)** `NOT tables.leaderless` ET `tables.created_by` physiquement assis, **(b)** un `session_members.is_moderator` affecté à cette table via `table_assignments`. **Les deux branches sont en cause, pour deux raisons distinctes** :

  - **Défaut A — le retrait ne libère que la branche (b).** `set_member_moderator(..., false)` (dernière définition : chantier 64, section 1), appelée par le bouton « Retirer » de l'onglet Tables, ne fait qu'un `UPDATE session_members SET is_moderator = false`. Elle ne touche jamais `tables.created_by`. Si le modérateur avait pris la table par `designate_moderator` (bouton « Devenir modérateur ») ou par `claim_table_as_moderator` — les deux posent `created_by = auth.uid()` **et** insèrent une ligne `participants` —, la branche (a) reste vraie après le retrait : la table est « pourvue » alors que plus personne ne l'anime, **définitivement**. Aggravant : ces deux chemins ne posent jamais `is_moderator`, donc un tel modérateur n'apparaît même pas dans la carte de groupe du superadmin (`g.members.filter(m => m.is_moderator)`) — aucun bouton, aucune RPC ne permettait de le viser.
  - **Défaut B — plus aucun chemin de vraie reprise de main.** C'est le test exact de Jules. `table_has_moderator` répond « quelqu'un a-t-il autorité ? », jamais « est-ce l'appelant ? ». Le modérateur en place est donc refusé **par sa propre présence** dès qu'il revient avec un `auth.uid()` différent (autre appareil/navigateur, session anonyme perdue — User ID anonyme instable, cf. chantier B3). Avant le chantier 68 ce cas passait par `reclaim_moderator` ; le 68 a migré `JoinTableForm`/`EntryScreen` vers `claim_table_as_moderator` sans laisser de chemin pour la reprise légitime. Point déjà signalé comme ouvert dans `CLAUDE.md` et dans l'entrée chantier 68 de ce fichier.

  **Cas que Jules n'a pas pu tester (« utilisateur déjà existant, le superadmin le rajoute »)** : **constat par lecture du code, à confirmer à l'écran** — ce chemin fonctionne, et pour une raison structurelle : `AddModeratorControl` → `assign_moderator_to_table` pose `is_moderator` et déplace `table_assignments` **sans jamais interroger `table_has_moderator`**. Le modérateur obtient ensuite son autorité par la branche (b) d'`is_table_moderator` (chantier 60), lue par `TableContext.isModerator` via `sessionMemberIsModerator` (chantier 41). Aucune des deux branches en cause n'est sur ce trajet.

  ### ⚠️ Arbitrage tranché par hypothèse — à valider par Jules

  Le correctif du **défaut B** relâche `claim_table_as_moderator` : le refus ne tombe plus que si le modérateur en place n'est **pas** l'appelant (`table_has_moderator` ET `NOT table_moderator_is`). Reconnaître « c'est moi qui reviens » sur un appareil neuf étant impossible par `auth.uid()`, la preuve retenue est le **pseudo** — convention d'identité déjà employée par `join_table` (`ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id`, commentaire « retour autre appareil », cf. `CLAUDE.md`).

  **Conséquence de sécurité, énoncée franchement** : connaître le Code Ecclesia + le code de la table + **le pseudo affiché** du modérateur en place suffit pour lui prendre la table. C'est strictement **plus** strict qu'avant le chantier 68 (`reclaim_moderator` : Code Ecclesia + code de table, sans pseudo) et strictement **moins** strict que le chantier 68 (refus absolu, qui est le bug). Le pseudo du modérateur est visible de tous les participants (`ParticipantsSidebar`) : ce n'est pas un secret, c'est un discriminant.

  **Alternative non retenue** : un chemin d'UI dédié à la reprise de main (« je suis DÉJÀ le modérateur de cette table ») branché sur `reclaim_moderator`, distinct de la prise en charge d'une table libre. Elle exige de modifier `src/screens/EntryScreen.tsx` et `src/components/JoinTableForm.tsx` — `EntryScreen.tsx` est explicitement hors périmètre (chantier 73). Le correctif retenu est 100 % SQL : les deux écrans transmettent **déjà** le pseudo à `claim_table_as_moderator`, aucun changement frontend n'est requis. **Si Jules préfère l'alternative, le §3 de la migration 1/4 se retire seul** (rollback documenté en pied de fichier) sans toucher aux §1/§2.

  ---

  ### Migrations à appliquer (dans cet ordre, indépendantes entre elles)

  1. **`supabase/migrations/20260906_chantier72_1_reprise_moderation.sql`** — bug 1. §1 `set_member_moderator(..., false)` libère aussi `tables.created_by` quand il pointait sur ce membre (garde `AND created_by = v_member.user_id` : on ne déposssède jamais un autre modérateur) ; `tables.leaderless` **n'est pas touché**, conformément à la décision de Jules au chantier 64 (« retirer le modérateur en place ne change rien, il va revenir »). §2 nouvelle RPC `release_table_moderation(password, table_id)`, seul levier atteignant un modérateur « physique » sans flag. §3 nouveau helper `table_moderator_is(table_id, pseudo)` + assouplissement de `claim_table_as_moderator` (voir arbitrage ci-dessus). `SET search_path = public, extensions` ajouté sur `set_member_moderator`, qui n'en avait aucun alors qu'elle appelle `check_superadmin_password` → `crypt()`.
  2. **`20260906_chantier72_2_allocation_actif_par_defaut.sql`** — retour 3. `get_allocation_inputs` : `COALESCE(er.participation_style = 'active', false)` → `true`. **Seul le cas « pas de ligne `entry_responses` » change** ; un `'listener'` explicite fait valoir l'égalité `false` (pas `NULL`), le COALESCE n'intervient pas, il reste passif. `consents` et `is_veteran` inchangés à `false`. `SET search_path` ajouté (absent).
  3. **`20260906_chantier72_3_drop_add_collab_source_4args.sql`** — retour 4, sécurité. `DROP FUNCTION IF EXISTS public.add_collab_source(uuid, text, text, text);`. Vérification faite avant écriture : un seul site d'appel RPC (`src/lib/sessions.ts:248`), qui envoie **toujours** les 5 paramètres nommés dont `p_table_join_code: tableJoinCode ?? null` (jamais omis) ; un seul appelant du wrapper (`src/screens/CollabDocScreen.tsx:208`). PostgREST résout la surcharge par l'ensemble des noms reçus → seule la signature à 5 arguments peut matcher. Le fichier contient la requête de contrôle « les 2 signatures coexistent-elles encore ? » à jouer avant.
  4. **`20260906_chantier72_4_update_session_meta.sql`** — retour 5. Nouvelle RPC `update_session_meta(password, session_id, title, description)`, même forme que `update_session_docs`/`set_session_onboarding_enabled`. Titre obligatoire (colonne NOT NULL), description vide normalisée en `NULL`, aucune restriction de phase. `scheduled_at` **volontairement exclu** (non demandé ; son édition pose une question distincte de fuseau horaire) — ajoutable plus tard en 4ᵉ paramètre optionnel, avec `DROP FUNCTION` explicite de la signature à 3 arguments.

  ### Changements frontend

  - `src/screens/SuperadminScreen.tsx` — (2) la condition `g.moderated` qui encadrait `AddModeratorControl` est **retirée** : elle masquait l'encart « ajouter un modérateur » sur exactement les tables visées par la demande de Jules (`tables.leaderless = true`). **Aucune RPC nouvelle n'était nécessaire** — `assign_moderator_to_table` convertit déjà la table (`leaderless = false`) depuis le chantier 64, seul le chemin d'accès manquait. Nouveau libellé « 🙌 Table sans animateur » (prop `leaderless`) au lieu de « ⏳ En attente de modérateur », qui laisserait croire à un oubli d'allocation. — (1) nouveau bouton **« Libérer la modération de cette table »** sur chaque groupe rattaché à une table physique (`handleReleaseTableModeration`). — (5) section « Titre et description » en tête de l'onglet Préparation (mode lecture / bouton Modifier / formulaire), et l'en-tête de `SessionDetail` lit désormais `currentSession.title`/`.description` au lieu de la prop `session` figée au montage, pour refléter l'édition sans repasser par la liste. — (6) accordéon « Participants inscrits » **déplacé** de l'onglet « En direct » vers l'onglet « Tables ».
  - `src/lib/sessions.ts` — `updateSessionMeta` (ajout en fin de fichier).
  - `src/lib/voting.ts` — `releaseTableModeration` + type `ReleaseTableModerationResult` (ajout en fin de fichier).

  ### ⚠️ Commentaire devenu faux, non corrigé (hors périmètre)

  `src/lib/allocation.ts`, l. 185 — doc du champ `isActive` : « Sans onboarding → false (conservateur, §6) ». **Faux après la migration 2/4** : le défaut est posé côté SQL et vaut désormais `true`. Le **code** TypeScript ne fait aucune supposition (il consomme le booléen déjà résolu par `get_allocation_inputs`), il n'y a **aucune ligne de logique à changer** — seulement ce commentaire. Fichier interdit de modification (piloté par une autre conversation) : à corriger par la session qui en a la charge.

  ### Autre lecteur de `participation_style` — inventorié, délibérément non touché

  `run_clustering_v3` (`20260721_clustering_v3.sql`, l. 81 et 100) trie par `COALESCE(er.participation_style, 'zzz')`, c'est-à-dire place les membres sans onboarding **en dernier** du round-robin sans jamais les assimiler à actif ou passif — ce n'est donc pas la même supposition. Et surtout : cette fonction n'est plus appelée par le frontend (comme `run_clustering_v1/v2`, chantier 37). La modifier reviendrait à réanimer un chemin mort. `get_table_opinion_summary` et `run_clustering_v1/v2` ne lisent pas du tout `participation_style` (vérifié par grep).

  ### Déjà vérifié — et rien de plus

  `npx tsc --noEmit` : propre. `npm test` : **94 passés / 1 skip préexistant** (aucun test ajouté : les changements sont soit du SQL, soit du branchement JSX — aucune fonction pure nouvelle à unit-tester). `npm run build` : propre (avertissement de taille de bundle préexistant, sans rapport). **Aucune vérification navigateur, aucun SQL appliqué** (consignes explicites de la session).

  ---

  ### Recette de vérification

  **Prérequis** : appliquer les 4 migrations après avoir joué, pour chacune, la requête de contrôle de son en-tête. Puis dérouler les requêtes de vérification en pied de chaque fichier (elles couvrent les cas SQL purs, y compris les non-régressions).

  **A. Bug 1 — défaut A, retrait ordinaire** (séance en `debating`, une table avec un modérateur Bloc C) :
  1. Onglet Tables → sur la carte du groupe, cliquer « Retirer » à côté du modérateur.
  2. Depuis un **autre navigateur** (session anonyme neuve), accueil → « Rejoindre ou reprendre une table » → cocher « Je suis modérateur de cette table », saisir le code de la table, un pseudo **nouveau**, le Code Ecclesia → **doit réussir** (avant : « cette table a déjà un modérateur »).
  3. Vérifier que le nouveau venu voit bien `ModeratorView` et que la file d'attente, les tours de parole et les temps cumulés de la table sont **intacts**.

  **B. Bug 1 — défaut A aggravé, modérateur « physique »** (le cas qu'aucun bouton n'atteignait) :
  1. Sur une table `leaderless` en débat, un participant clique « 🎙️ Devenir modérateur » (`designate_moderator`) — ou une table est prise via le formulaire de rattrapage.
  2. Superadmin, onglet Tables : ce modérateur **n'apparaît pas** comme « Modérateur : … » sur la carte (attendu : il n'a pas de flag `is_moderator`). Cliquer **« Libérer la modération de cette table »**.
  3. Depuis un autre navigateur : reprendre la table par son code + Code Ecclesia → **doit réussir**.
  4. Vérifier en base que `tables.leaderless` **n'a pas changé** au passage (décision chantier 64) et qu'aucun tour de parole / entrée de file n'a disparu.

  **C. Bug 1 — défaut B, vraie reprise de main (le test de Jules)** :
  1. Table animée par « T33 Mod1 », séance en `debating`. **Sans rien retirer** côté superadmin.
  2. Depuis un **autre navigateur/appareil** : « Je suis modérateur de cette table », code de la table, pseudo **exactement `T33 Mod1`**, Code Ecclesia → **doit réussir** et rendre la main sur cet appareil.
  3. **Non-régression, le point le plus important de cette recette** : refaire la même chose avec un pseudo **différent** de celui du modérateur en place → **doit être refusé** avec « Cette table a déjà un modérateur ». Si ce cas passe, l'arbitrage est cassé — le signaler avant de déployer.
  4. Vérifier au passage la casse/les espaces : `t33 mod1` et ` T33 Mod1 ` doivent être acceptés comme le même pseudo (comparaison `lower(btrim(...))`).

  **D. Bug 1 — le cas que Jules n'a pas pu tester** (à confirmer, constat par lecture seule) : sur une table sans modérateur, superadmin → onglet Tables → glisser un participant déjà inscrit sur l'encart « ajouter un modérateur » (ou saisir son nom) → il devient modérateur, et **côté participant** sa vue doit basculer sur `ModeratorView` sans rechargement. Vérifier aussi que la table passe `leaderless = false` si elle l'était (chantier 64).

  **E. Retour 2 — ajouter un modérateur à une table créée sans modérateur** : séance avec au moins une table `leaderless` rattachée → onglet Tables : l'encart d'ajout doit maintenant **apparaître** sur cette carte, libellé « 🙌 Table sans animateur ». Assigner quelqu'un par glisser-déposer **et** par saisie du nom (les deux chemins). Vérifier en base : `session_members.is_moderator = true`, `table_assignments` déplacé, `tables.leaderless = false`.

  **F. Retour 3 — actif par défaut** : séance en `allocating` avec au moins un membre présentiel **sans** ligne `entry_responses` (onboarding désactivé, chantier 71) et au moins un membre ayant répondu `listener`. Jouer la requête n° 2 du pied de la migration 2/4 : le premier doit ressortir `is_active = true`, le second `is_active = false`. Puis `AllocationPanel` → « Calculer » : la proposition doit se calculer sans erreur, et les badges de seuil « actifs n/N » doivent refléter le nouveau décompte.

  **G. Retour 4 — faille `add_collab_source`** : après le DROP, ouvrir `#collab/<join_code>` et ajouter une source avec une URL valide → doit fonctionner exactement comme avant. Puis jouer les requêtes 3 et 4 du pied de la migration 3/4 (URL `javascript:` refusée sur la signature à 5 arguments ; signature à 4 arguments introuvable).

  **H. Retour 5 — titre/description** : onglet Préparation → section « Titre et description » → « Modifier » → changer les deux → « Enregistrer ». Vérifier : l'en-tête de la page se met à jour **immédiatement** (sans rechargement) ; revenir à la liste des séances → le nouveau titre y apparaît ; vider entièrement la description → doit s'afficher « Aucune description » et valoir `NULL` en base ; vider le titre → le bouton « Enregistrer » doit être désactivé. Vérifier aussi l'effet côté participant (accueil « Séances en cours », en-tête de `#vote/`).

  **I. Retour 6 — accordéon déplacé** : « Participants inscrits » ne doit plus figurer dans l'onglet « En direct » et doit apparaître **en tête** de l'onglet « Tables ». Vérifier que le bouton de rafraîchissement, le badge de compte et la bascule « + modérateur » de la liste fonctionnent toujours depuis leur nouvel emplacement.

## Entrée modérateur (chantier 73)

- [ ] **2026-09-06 — Chantier 73 — déclaration modérateur dès l'inscription + ménage EntryScreen/VoteScreen** — `src/screens/VoteScreen.tsx`, `src/components/voting/PseudoForm.tsx`, `src/components/voting/ModeratorDeclareField.tsx` (nouveau), `src/components/voting/ModeratorClaimModal.tsx` (nouveau, remplace `ModeratorAccessPanel.tsx` supprimé), `src/components/ParticipantToolsButton.tsx`, `src/screens/EntryScreen.tsx`

  **Demande de Jules** : se déclarer modérateur (case à cocher + mot de passe) dès l'écran d'inscription à une séance, dans les phases `pre_voting`/`voting`/`allocating`/`debating` ; déplacer le bouton "Je suis modérateur" du header (trop visible) vers le panneau Outils, renommé "Me déclarer modérateur" ; retirer la fonction "créer une table" pour un modérateur en cours de séance ; harmoniser l'apparence du bouton "Voir les votes des anciennes séances" avec "Voir tous les débats" ; inverser l'ordre des deux modales d'accueil en pré-vote (intro app avant l'annonce du vote à distance).

  **1. Case à cocher "Je suis modérateur" sur les formulaires d'inscription** (`ModeratorDeclareField`, nouveau composant réutilisable) — ajoutée à :
  - `PseudoForm` (pré-vote, écran d'inscription principal — pas sur le sous-écran de reconquête "pseudo déjà pris", cas plus rare).
  - `VotingEntryForm` (vote présentiel + allocation, les deux onglets "Mon nom"/"Mon code").
  - `AttendanceConfirmScreen` (confirmation de présence, les deux modes `known_user` et `reclaim`).

  Dans les trois cas : **inscription/reclaim d'abord**, tentative de déclaration modérateur **ensuite** via `tryClaimModeratorStatus` (nouvelle fonction non-levante dans `lib/voting.ts`, wrapper de `claim_moderator_status` déjà existante — **aucune nouvelle RPC**). Un mot de passe erroné ne bloque jamais l'inscription : le membre est créé/confirmé normalement, et un écran intermédiaire ("Bienvenue ⚠️ … la déclaration modérateur a échoué : …") affiche l'erreur avant de continuer, réutilisant le pattern d'écran de succès déjà existant (`reclaimDone` dans `VotingEntryForm`, généralisé en `completed`). Non couvert par cette case : le bouton "Non, je continue à voter à distance" d'`AttendanceConfirmScreen` (`handleContinueRemoteClick`) ne confirme aucun membre côté serveur et ne peut donc pas déclencher la déclaration ici — un pré-votant dans ce cas précis doit utiliser "Me déclarer modérateur" dans Outils une fois revenu sur l'écran de vote (couvert par le point 2).

  **2. Bouton modérateur déplacé dans Outils, fonction "créer une table" retirée** — `ModeratorAccessPanel.tsx` (header de `VoteScreen`, boutons "🎙️ Je suis modérateur" / "➕ Créer une table") **supprimé**. Remplacé par `ModeratorClaimModal` (modal minimal : mot de passe → `claim_moderator_status`, aucune création de table), accessible via un nouveau bouton "Me déclarer modérateur" dans :
  - `VoteScreen` → panneau Outils (`VoteToolsPanel`), pendant les phases `pre_voting`/`voting`/`allocating`.
  - `ParticipantToolsButton` (`ParticipantView`, en débat) → même bouton, visible seulement si `table.session_id` existe (sans séance, pas de statut modérateur Bloc C à déclarer). Complète la couverture "toutes les phases pertinentes" demandée par Jules pour la phase débat.

  Le bouton reste affiché même pour un modérateur déjà déclaré (`member.is_moderator`) — un second appel est un no-op côté serveur, jamais bloqué côté UI (texte adapté : "tu es déjà marqué·e… reconfirmer n'aura aucun effet"). **Piège évité** (documenté dans CLAUDE.md pour `NotesModal`) : l'état d'ouverture de la modale vit dans le composant **parent** (`showModeratorClaimModal` dans `VoteScreen`, `moderatorClaimOpen` dans `ParticipantToolsButton`), jamais dans le panneau Outils lui-même — sinon `onClose()` démonte le panneau avant que la modale ne s'ouvre.

  **3. Réponse à la question de Jules (point 2 — onglets "Modérateur"/"Rejoindre"/"Créer" d'`EntryScreen`)** : **aucun onglet retiré**, décision documentée ici plutôt que bloquée (session headless). Inventaire par onglet :
  - **"🎙️ Modérateur"** : très largement rendu redondant par le point 1 ci-dessus (déclaration inline désormais possible dès l'inscription réelle). Conserve un usage résiduel mineur : parcourir les séances actives par titre sans connaître de join_code. Le seul des trois qui serait raisonnablement supprimable seul.
  - **"Rejoindre" (par défaut, sans "Je suis modérateur")** : **pas d'équivalent dans le périmètre**. `join_table` par simple code de TABLE (pas le join_code de SÉANCE) depuis l'écran d'accueil nu — c'est le **seul point d'entrée** pour une table **standalone** (`tables.session_id IS NULL`, aucune route `#session/<code>`/`#vote/<code>` ne s'applique à une table sans séance) et pour quiconque n'a que le code de table (annoncé oralement, écrit sur un carton) sans lien de séance. `#table/<join_code>` (`JoinTableScreen`) couvre le même besoin mais seulement via un **lien déjà construit** — pas une saisie manuelle depuis l'accueil.
  - **"Rejoindre" + case "Je suis modérateur"** (rattrapage chantier 68, `claim_table_as_moderator`) : le même chemin existe aussi via `SessionRouterScreen` (`#session/<code>`, état `debating_no_member`, avec `sessionId` transmis) et `VoteScreen` (`#vote/<code>`, étape `ended`+`debating`, **sans** `sessionId` transmis à `JoinTableForm` — à vérifier si c'est le bug corrigé par le chantier 72, sans y toucher ici, hors périmètre). Mais ces deux chemins exigent le **join_code de la séance** ; l'onglet d'accueil est le seul à fonctionner avec **seulement** le code de la table, pertinent pour une table standalone ou un modérateur qui n'a que ce code.
  - **"Créer"** : depuis le retrait du point 2 (création de table dans `ModeratorAccessPanel`), c'est désormais le **seul** chemin restant dans toute l'app participant pour créer une table (avec ou sans Code Ecclesia via la case "sans modérateur") sans passer par les outils superadmin (`AllocationPanel`/`create_tables_batch`, hors périmètre chantier 72/74).

  **Conclusion** : "Rejoindre" et "Créer" couvrent chacun un chemin sans équivalent dans mon périmètre — conservés tels quels, conformément à la consigne ("si un chemin disparaît sans équivalent, ne retire pas"). Si Jules souhaite quand même les faire disparaître, il faudrait au minimum : (a) un moyen de saisir un code de table brut depuis l'accueil sans onglet dédié (ex. détection automatique d'un format 6-hex dans un champ générique), et (b) accepter qu'une table ne puisse plus être créée que par le superadmin. Seul "🎙️ Modérateur" est retirable sans perte fonctionnelle identifiée — non retiré ici faute d'instruction explicite à agir seul sur un sous-ensemble des trois.

  **4. "Voir les votes des anciennes séances"** (`EntryScreen.tsx`) : restylé en bouton plein-largeur bordé, identique à "Voir tous les débats" (texte et action `onClick` inchangés — le comportement diffère nécessairement, lien externe vs modal locale, mais l'apparence est désormais alignée).

  **5. Ordre des modales d'accueil en pré-vote** (`VoteScreen.tsx`, 4 occurrences) : `AppIntroModal` ("Comment se déroule la séance ?") s'affiche désormais avant `PreVotingAnnounceModal` ("Vote à distance ouvert", jaune) partout où les deux peuvent apparaître (`waiting`, `pseudo`, `confirm_attendance`, `vote`).

  **Vérifié par moi (headless, pas de serveur dev lancé)** : `npx tsc --noEmit` (exit 0). `npm test` (94/95, 1 skip préexistant — aucun test dédié à ce chantier, logique de formulaires/UI non couverte par les tests existants qui portent sur `allocation.ts`/`groupNaming.ts`/`mergeGuards.ts`). `npm run build` (exit 0, seul avertissement pré-existant sur la taille du bundle). Aucun des trois fichiers réservés aux chantiers parallèles (`SuperadminScreen.tsx`, `PhaseIndicator.tsx`, `ModeratorView.tsx`) n'a été touché (vérifié par `git diff --name-only`).

  **Prêt pour vérification navigateur — recette** :
  1. **Pré-vote** : ouvrir `#vote/<code>` d'une séance en `pre_voting` avant toute inscription → vérifier que la modale "Comment se déroule la séance ?" apparaît **avant** la modale jaune "Vote à distance ouvert" (fermer l'une pour voir l'autre apparaître). Sur le formulaire d'inscription, cocher "Je suis modérateur", saisir un mauvais mot de passe → l'inscription doit réussir quand même, avec un écran "⚠️ la déclaration modérateur a échoué" et un bouton Continuer → arrivée normale au vote, `member.is_moderator` resté `false`. Refaire avec le bon mot de passe → arrivée directe au vote, badge "🎙️ Vous êtes modérateur" visible dans le header.
  2. **Vote présentiel** (`voting`) : sur `VotingEntryForm`, tester la case modérateur sur l'onglet "Mon nom" (nouvelle inscription) ET sur l'onglet "Mon code" (reclaim) — bon et mauvais mot de passe dans chaque cas.
  3. **Confirmation de présence** (`AttendanceConfirmScreen`, un pré-votant qui revient en phase `voting`) : tester la case modérateur en mode "Oui je suis présent" et en mode reclaim (pseudo/code) — bon et mauvais mot de passe.
  4. **Outils → Me déclarer modérateur** : pendant le vote (`VoteScreen`, bouton "Outils"), vérifier que "🎙️ Je suis modérateur"/"➕ Créer une table" ont disparu du header, et que "Me déclarer modérateur" apparaît dans le panneau Outils, fonctionne avec bon/mauvais mot de passe, et reste cliquable (sans erreur) pour un modérateur déjà déclaré. Vérifier qu'aucun bouton ne permet plus de créer une table depuis le vote.
  5. **Débat** : rejoindre une table rattachée à une séance (`table.session_id` non nul), ouvrir Outils dans `ParticipantView` → "Me déclarer modérateur" présent et fonctionnel. Sur une table **standalone** (créée hors séance), vérifier que ce bouton n'apparaît **pas**.
  6. **EntryScreen** : confirmer que les 3 onglets ("🎙️ Modérateur", "Rejoindre ou reprendre une table", "Créer") sont toujours visibles et fonctionnels comme avant — aucun changement voulu ici au-delà du bouton "Voir les votes des anciennes séances" (comparer visuellement son style à "Voir tous les débats").

## Phases et hors ligne (chantier 74)

- [ ] **2026-09-06 — Chantier 74 — modale des phases + participant hors ligne (session_members + texte invisible)** — `src/components/PhaseIndicator.tsx`, `src/components/ModeratorToolsButton.tsx`, `supabase/migrations/20260906_chantier74_add_offline_participant_session_member.sql` (jamais appliquée)

  **1. `PhaseIndicator`** : la pill devient un bouton qui ouvre une modale autonome (état local au composant, aucun des 5 écrans appelants modifié) listant les 5 étapes de `PARTICIPANT_PHASE_STEPS`, avec l'étape en cours mise en avant (fond indigo + badge "En cours") et les étapes passées marquées d'un ✓ vert. Fonctionne à l'identique en mode `floating` et inline.

  **2 et 3. "Ajouter une personne sans téléphone" — diagnostic complet avant tout correctif** (`ModeratorToolsButton.tsx`, `add_offline_participant`) :

  **Point 2 — ce qui a été vérifié et ce qui ne l'était PAS** :
  - **La garde d'autorisation n'est PAS le problème.** Hypothèse initiale (le pattern `created_by = auth.uid()` interdit par CLAUDE.md) vérifiée et **infirmée** par lecture directe de `pg_proc` sur le projet Supabase de production (`plpjiehqsxxakbuykmkm`, via MCP, lecture seule — aucune migration appliquée) : `add_offline_participant` utilise déjà `is_table_moderator(p_table_id)` (chantier 60, appliqué). Le fichier `20260902_chantier44_add_offline_participant.sql` contient encore l'ancienne garde `created_by`, mais il est *remplacé* par la redéfinition postérieure dans `20260902_chantier60_moderator_authority.sql` (le fichier historique n'a jamais été corrigé, mais la fonction courante en base l'est). L'insertion dans `participants` fonctionne donc normalement pour tout modérateur du chemin nominal (allocation v2).
  - **Le vrai gap** : la fonction n'écrit *que* dans `participants` (documenté dans le commentaire de tête de la migration chantier 44 elle-même, comme hypothèse posée mais non tranchée par Jules à l'époque) — jamais dans `session_members`. La personne ajoutée existe donc bel et bien en base, avec un temps de parole réel (`speaking_turns`, lié à son `participant_id`), mais reste invisible de tout ce qui liste les membres au niveau **séance** (roster superadmin, stats de vote, exports par séance — par opposition aux exports par table, qui l'incluent déjà correctement).
  - **Obstacle levé pour corriger ça** : `session_members` a `UNIQUE(session_id, user_id)`. Vérifié en base (`information_schema`) : `user_id` n'a **aucune** contrainte FK vers `auth.users` — un UUID synthétique (`gen_random_uuid()`), propre à chaque personne ajoutée, est donc admissible sans rien casser.
  - **Point non tranché seul, à faire vérifier** : `register_session_member` refuse toute inscription hors `pre_voting`/`voting`/`allocating`. `add_offline_participant` n'existe qu'en phase `debating` — la migration écrite introduit donc le premier chemin qui fait grandir `session_members` **pendant** le débat. Additif (`ON CONFLICT (session_id, pseudo) DO NOTHING`, jamais de collision avec un membre réel), mais les vues du chantier 72 (`SuperadminScreen.tsx`, en cours en parallèle, non touché ici) verront apparaître cette nouvelle catégorie de membre (`joined_phase = 'debating'`, sans onboarding ni vote) — à vérifier avec cette session avant application.
  - **Migration écrite, non appliquée** (règle du projet — voir CLAUDE.md) : `supabase/migrations/20260906_chantier74_add_offline_participant_session_member.sql`. Détail complet, requêtes de vérification et rollback en tête et en pied de ce fichier.

  **Point 3 — texte invisible en tapant le nom** : cause trouvée et corrigée, sans lien avec `useLiveMs()` (vérifié : `useLiveMs()` est déjà correctement confiné aux feuilles `SpeakerTimer`/`SessionTimerDisplay`, hypothèse de CLAUDE.md écartée après lecture du code). Cause réelle : l'`<input>` du formulaire "Ajouter une personne sans téléphone" n'avait **aucune classe de couleur de texte explicite** — il héritait donc, par cascade CSS normale (héritage `color`, indépendant des frontières de composants React), du `text-white` posé sur le `<div>` racine de `ModeratorView.tsx` (page en thème sombre). Résultat : texte blanc sur fond d'input blanc, invisible pendant la frappe, alors que la valeur réelle (state React, jamais affectée) était correcte — d'où "les lettres s'écrivent, et on peut l'ajouter". Le placeholder restait visible car Tailwind lui applique une couleur explicite (`placeholder:text-gray-300`), ce qui a caché le problème avant la frappe. Corrigé en ajoutant `text-gray-900 bg-white` sur l'input.

  **Vérifié par moi (headless)** : `npx tsc --noEmit` (exit 0). Diagnostic point 2 mené par lecture directe du schéma/code en production via MCP Supabase (lecture seule — `pg_proc`, `information_schema` — aucune migration appliquée, conformément à la règle du projet). Une requête exploratoire sur des données réelles de participants a été bloquée par le classificateur de permissions (données personnelles) — sans impact sur le diagnostic, qui n'en avait pas besoin.

  **Prêt pour vérification navigateur — recette** :
  1. **PhaseIndicator** : sur n'importe lequel des 5 écrans qui l'affichent (VoteScreen, AllocatingScreen, ParticipantView, ResultsMapScreen, SessionQuestionnaireForm), cliquer la pill "Étape N · Libellé" → une modale s'ouvre avec les 5 étapes, celle en cours visuellement distincte (fond + badge), les précédentes cochées ✓. Tester en mode flottant (ex. VoteScreen) et en mode inline (ex. ParticipantView, phase débat) — même comportement d'ouverture/fermeture (clic sur le fond ou "Fermer").
  2. **Texte invisible (point 3)** : en tant que modérateur (`ModeratorView`), Outils Modo → "Ajouter une personne sans téléphone" → taper un nom → le texte doit maintenant être visible (gris foncé sur fond blanc) pendant la frappe, pas seulement après coup.
  3. **session_members (point 2, nécessite la migration appliquée)** : sur une séance de test en phase `debating`, ajouter une personne sans téléphone depuis `ModeratorView` → vérifier en base qu'une ligne `session_members` est créée pour elle (`joined_phase = 'debating'`, `attending_in_person = true`, `user_id` distinct du modérateur), en plus de sa ligne `participants`. Vérifier aussi qu'ajouter quelqu'un portant le même pseudo qu'un membre déjà réellement inscrit à la séance ne modifie **pas** la ligne existante de ce membre. Sur une table standalone (sans séance), vérifier qu'aucune ligne `session_members` n'apparaît.


## Validé

<!-- déplacer ici une fois vérifié, au format : - [x] **AAAA-MM-JJ (validé le AAAA-MM-JJ)** — `fichier` — description -->

- [x] **Chantier 79 — Écran de comparaison avant/après débat** *(validé le 2026-09-07)* — `src/components/AnalysisPanel.tsx` (`AnalysisComparisonPanel`), `src/lib/analysis.ts` (`pairGroups`, `computeMemberMovements`, `computeConsensusMovements`), `src/screens/SuperadminScreen.tsx` (onglet 📊 Analyse) — ✅ vérifié au navigateur par Jules sur une séance de test générée directement en base (16 membres fictifs, deux camps, votes avant/après débat avec un mouvement de camp réel et une assertion passant de clivante à consensuelle, analyse `pre_closure` calculée avec le vrai pipeline PCA/k-means du projet). Donnée de test supprimée après validation (cascade sur `sessions`).

  **Piège traité** : deux calculs k-means successifs ne numérotent pas les camps pareil (`group_id` est un artefact d'exécution, k peut même différer). `pairGroups` apparie donc les groupes des deux analyses par **chevauchement de membres réels** (glouton, pas d'appariement optimal global — suffisant pour k ≤ 5). `computeConsensusMovements` compare `group_consensus` directement (scalaire par assertion, indépendant du numéro de groupe). `computeMemberMovements` distingue "resté dans son camp apparié" / "changé de camp" / "absent de l'analyse après".

  **Point resté ouvert, non tranché ici** : rien dans l'UI ne déclenche aujourd'hui le calcul d'une analyse `pre_closure` en conditions réelles (seul un membre qui revote via le postvote, chantier 69, sur une séance déjà `closed`, en produit une automatiquement). Sans un moyen superadmin dédié, l'écran de comparaison n'a un second terme à comparer que dans ce cas précis. À chantierer séparément si Jules le confirme.

- [x] **2026-09-07 — Réserves sécurité `get_public_results` (chantier 80)** — `supabase/migrations/20260907_chantier80_reserves_public_results.sql` *(validé le 2026-09-07)*

  Jules, 07/09 : « pour la page publique, il ne faut pas qu'on puisse remonter aux participants, ou alors, il faut le rendre dur (et l'anonymat et changement de l'ordre des points comme tu l'as écrit est largement suffisant) ». Vérification de la définition en base (`pg_get_functiondef`, avant migration) : aucun identifiant ni pseudo ne sortait déjà de `get_public_results` — seuls `pca_x`/`pca_y`/`group_id` par point, et `content`/compteurs par assertion. Deux trous corrigés par cette migration, **appliquée en base le 2026-09-07** (nouvelle règle SQL du même jour — session autorisée à appliquer sa propre migration) :
  1. Les points sortaient dans l'ordre d'agrégation de `jsonb_agg` (ordre physique de `analysis_members`, qui suit l'ordre d'inscription) faute d'`ORDER BY` — ajout de `ORDER BY random()` dans le sous-`SELECT` des points.
  2. `SET search_path = public, extensions` manquant sur cette fonction `SECURITY DEFINER` — ajouté.

  Explicitement refusé par Jules, non touché : seuil de k-anonymat, compteurs par assertion, coupure d'une séance déjà publique en production, écran participant (résultats persos), colonnes `sessions` (hors périmètre).

  **Vérifié en base** : `pg_get_functiondef` relu après application — nouvelle définition bien en place, signature/type de retour inchangés (`CREATE OR REPLACE` simple). Advisors sécurité Supabase : les deux seules alertes restantes sur `get_public_results` (`anon`/`authenticated` peuvent l'appeler en `SECURITY DEFINER`) sont attendues — RPC volontairement publique — et inchangées après migration.

  **Vérifié au navigateur le 2026-09-07** (worktree `Ecclesia-chantier-80`, port 5215) sur les deux séances publiques réelles : `#results/5fcdcb3a-b537-4694-a137-48c511a48d93` (« Multiculturalisme », 21 points, k=4) rend le nuage et les 37 assertions sans aucun identifiant ; `#results/92c648d7-2fa7-4aaf-b316-1f0f9a815a2c` (« Retraite », aucune analyse) affiche proprement "Aucune assertion approuvée", pas de blocage. Désordre confirmé directement en base : deux appels successifs de `get_public_results(...)` sur la séance Multiculturalisme renvoient deux ordres de `group_id` différents. Aucune régression console.

- [x] **Chantier 64 — `supabase/migrations/20260902_chantier64_leaderless_becomes_moderated.sql`** *(validé le 2026-09-06)* — **à appliquer APRÈS le chantier 60** (touche `set_member_moderator`/`claim_moderator_status`/`assign_moderator_to_table`, dont les dernières définitions en date sont antérieures au 60 mais indépendantes de lui — pas de dépendance technique, seulement l'ordre déjà établi pour ce chantier de test).

  **Ce qu'elle change** : quand `set_member_moderator`, `claim_moderator_status` ou `assign_moderator_to_table` pose `session_members.is_moderator = true` pour un membre déjà assis (`table_assignments`) sur une table `leaderless`, cette table passe désormais `leaderless = false` dans la même transaction — au lieu de laisser le flag inchangé pendant que le membre obtient déjà, silencieusement, l'autorité d'animation (chantier 60). Voir l'en-tête du fichier de migration pour le détail complet (symptôme, correctif, décision documentée sur le retrait d'un modérateur — pas de bascule arrière automatique).

  **Aucun changement frontend requis** pour refléter la bascule côté superadmin : l'onglet Groupes (`SuperadminScreen.loadGroups`) relit déjà `tables.leaderless` à chaque appel et est rafraîchi après les actions superadmin + par le polling 10 s (chantier 50) pour le cas auto-déclaré. Un changement ciblé a en revanche été fait dans `ParticipantView.tsx` (texte du panorama d'accueil, table `leaderless`) et dans `CLAUDE.md` (section `isModerator`/Tables leaderless, corrigée — elle affirmait à tort que `isModerator` est toujours `false` sur une table leaderless, périmé depuis les chantiers 41/60).

  **Recette de vérification** (voir aussi la section « Point de sémantique à trancher » du chantier 60 juste en dessous, dont ce chantier ne change qu'une partie) :

  1. **Bascule par le superadmin** — séance en `allocating`/`debating` avec une table `leaderless` rattachée et au moins un participant assis dessus (`table_assignments`, pas seulement `participants` — passer par une allocation ou une assignation manuelle, pas par un simple `join_table`). Onglet Groupes → poser le flag modérateur sur ce membre (`set_member_moderator` via l'accordéon participant, ou glisser-déposer sur cette table via `assign_moderator_to_table`). **Observer** : le badge « Sans modérateur » de cette table disparaît (immédiatement après l'action superadmin, `loadGroups()` est appelé en séquence — pas besoin d'attendre le polling).
  2. **Bascule automatique du participant** — sur l'appareil du participant concerné (déjà sur la table au moment de l'étape 1, `ParticipantView` ouvert) : sans recharger la page, il doit basculer sur `ModeratorView` (Realtime `session_members` déjà branché depuis le chantier 41 — l'OR de `isModerator` ne dépend pas de ce chantier, seul `tables.leaderless` est nouveau ici).
  3. **Les autres participants de la table** — sur un 2ᵉ appareil resté sur `ParticipantView` : après la bascule, il ne doit plus proposer l'auto-gestion par file (plus de tentative silencieuse de `claimFloor()` — vérifier l'absence d'erreur réseau `claim_floor` dans la console) ; le nouveau modérateur doit pouvoir donner la parole normalement depuis `ModeratorView`.
  4. **Auto-déclaration côté participant** (`claim_moderator_status`, onglet "🎙️ Modérateur" de l'accueil ou `ModeratorAccessPanel`) — même test que 1-3, mais déclenché par le participant lui-même avec le Code Ecclesia plutôt que par le superadmin. Le superadmin doit voir la bascule dans les 10 s (polling de secours), sans action de sa part.
  5. **Message d'accueil de la table leaderless** — nouveau participant qui rejoint une table `leaderless` **avant** toute désignation : le panorama d'accueil (« Bienvenue dans le débat », bloc « Groupe auto-géré ») doit mentionner qu'un participant peut devenir modérateur mais renoncera alors à participer. Vérifier le texte affiché, pas seulement sa présence dans le code.
  6. **Retrait en place du modérateur** (`set_member_moderator(..., false)`, le membre reste assis à la même table) : la table reste `leaderless = false` (pas de retour à l'auto-gestion) et n'a plus personne avec l'autorité d'animation tant que le superadmin n'y réassigne pas un modérateur. *Mis à jour le 2026-09-02 : Jules a tranché le cas du DÉPART (pas du simple retrait en place) — voir l'entrée « Chantier 64 (complément) » juste en dessous, qui NUANCE ce point sans le contredire : rester assis ne bascule jamais, partir peut basculer.*

  **Validation de Jules (06/09)** : ✅ **appliquée (confirmée en base)** (touche `set_member_moderator`/`claim_moderator_status`/`assign_moderator_to_table`, dont les dernières définitions en date sont antérieures au 60 mais indépendantes de lui — pas de dépendance technique, seulement l'ordre déjà établi pour ce chantier de test).

- [x] **Chantier 64 (complément) — `supabase/migrations/20260902_chantier64b_leaderless_origin_and_revert.sql`** *(validé le 2026-09-06)* — **à appliquer après la migration chantier 64 ci-dessus** (redéfinit les mêmes fonctions Bloc C, plus `create_table`/`admin_create_table`/`create_tables_batch`/`apply_allocation`/`switch_table`) et **après le chantier 48** (`switch_table` doit déjà exister — cette migration la redéfinit intégralement, pas un patch incrémental).

  **Ce qu'elle change** : Jules a tranché le point resté ouvert par la migration chantier 64 initiale (retrait du modérateur). Nouvelle colonne `tables.leaderless_by_design` (posée à la création ou à chaque recalcul d'allocation, jamais par une conversion organique) qui distingue :
  - une table **conçue pour avoir un modérateur** (`leaderless_by_design = false`) — son départ, qu'il soit en place ou vers une autre table, ne change jamais rien, Jules considère qu'il va revenir ;
  - une table **devenue modérée** en cours de route (`leaderless_by_design = true`, convertie depuis `leaderless=true` par la migration chantier 64 initiale) — si son modérateur **part rejoindre une autre table** via `switch_table` (chantier 48), elle **redevient `leaderless = true`**. Rester assis à la même table (`set_member_moderator(..., false)`) ne bascule toujours rien — seul le DÉPART physique via `switch_table` compte.

  Le bouton "Quitter" (`leaveTable()`) reste hors de tout ça — action purement locale (vide le cache `tableStore`), aucune ligne supprimée, aucun appel RPC, donc ne peut mécaniquement pas déclencher la bascule. Voir l'en-tête du fichier de migration pour le détail complet. *Mis à jour le 2026-09-02 : le cas laissé de côté ci-dessous (`move_member_to_group`) a été tranché par Jules — « oui, faisons la même chose si c'est le super admin qui l'enlève » — et est maintenant couvert par l'entrée « Chantier 64 (complément 2) » juste en dessous. Le rétro-classement (tables existantes classées `leaderless_by_design = leaderless`) est validé tel quel par Jules, sans changement.*

  **Validation de Jules (06/09)** : ✅ **appliquée et vérifiée par une session Claude Code le 2026-09-06** — voir « Ce qu'elle change » (redéfinit les mêmes fonctions Bloc C, plus `create_table`/`admin_create_table`/`create_tables_batch`/`apply_allocation`/`switch_table`) et **après le chantier 48** (`switch_table` doit déjà exister — cette migration la redéfinit intégralement, pas un patch incrémental).

- [x] **Chantier 60 — `supabase/migrations/20260902_chantier60_moderator_authority.sql`** *(validé le 2026-09-06)* ✅ **appliquée le 2026-09-02** — corrige le bloquant le plus grave du projet (un modérateur désigné par l'allocation ne peut rien faire), et modifie des fonctions/policies utilisées par tous les autres tests du parcours Modérateur. Reste à faire : le test manuel complet (section Parcours Modérateur ci-dessous) — jamais joué à l'écran.

  **Le bug corrigé** : un participant marqué `session_members.is_moderator` (allocation v2, `claim_moderator_status`, `assign_moderator_to_table`, `set_member_moderator`) voit bien la vue modérateur depuis le chantier 41, mais **aucune de ses actions n'aboutit** : donner/retirer la parole → « Not authorized » ; exclure → « Non autorisé » ; ajouter une personne sans téléphone → « Non autorisé » ; forcer le questionnaire et supprimer la table → **échec silencieux** (une policy RLS qui refuse un UPDATE/DELETE n'est pas une erreur, elle affecte simplement zéro ligne). Cause : toutes les gardes testent `tables.created_by = auth.uid()`, alors que `apply_allocation`/`create_tables_batch` posent `created_by` = l'identifiant anonyme du **superadmin** qui déclenche l'allocation. Les seuls modérateurs qui fonctionnent aujourd'hui sont ceux passés par « Créer une table » ou par « Je suis modérateur de cette table » (`reclaim_moderator`) — les deux seuls chemins qui posent `created_by`, ce qui explique que le défaut n'ait jamais explosé en séance réelle.

  **Contenu du fichier** :
  1. Nouveau helper `is_table_moderator(p_table_id uuid) RETURNS boolean`, `SECURITY DEFINER STABLE SET search_path = public, extensions` (mêmes conventions anti-récursion qu'`is_table_participant`). Vrai si l'appelant est **soit** le créateur physique de la table (`tables.created_by`, chemin historique inchangé), **soit** un membre de la séance de cette table marqué `session_members.is_moderator = true` **ET** affecté à **cette table précise** via `table_assignments` (les deux conditions sont cumulatives — c'est le point de régression critique).
  2. Les **9 fonctions** d'animation reprises pour utiliser ce helper : `grant_floor`, `end_turn`, `end_turn_and_advance`, `kick_participant`, `add_offline_participant` (les 5 du périmètre initial) **+ 4 trouvées à l'inventaire** : `add_to_queue` (mettre quelqu'un d'*autre* en file), `move_queue_entry` (↑/↓), `reorder_queue_entry` (réordonnancement DnD), `correct_turn` (modale « Corriger un tour »). Corps strictement identiques, seule la garde change.
  3. Les **7 policies RLS** reprises de la même façon : `tables_update_moderator` (forçage questionnaire, UPDATE direct depuis `TableContext`) et `tables_delete_moderator` (`endTable()`, DELETE direct) — les deux « échecs silencieux » ; `queue_entries_delete` (**`removeFromQueue` et `changeQueueType` font un DELETE DIRECT, pas une RPC** → un modérateur désigné ne peut retirer personne de la file, silencieusement) ; plus `queue_entries_insert`, `queue_entries_update_moderator`, `speaking_turns_insert_moderator`, `speaking_turns_update_moderator` par cohérence (leurs écritures passent aujourd'hui par des RPC `SECURITY DEFINER`, donc hors RLS).
  4. Un bloc `DO $guard$` en tête qui compare `pg_get_function_identity_arguments` + `pg_get_function_result` de chaque fonction à ce qui va être créé, et DROP toute surcharge divergente — protection contre le piège `CREATE OR REPLACE` (refus si un nom de paramètre change, surcharge ambiguë si le nombre/type change) qui a déjà mordu le projet deux fois. Sans perte de droits : aucune de ces fonctions n'a de GRANT explicite dans l'historique, et la migration repose un `GRANT EXECUTE ... TO anon, authenticated` après chaque création.

  **Ce qui n'est PAS touché** (inventaire complet fait avant modification) : `create_table`, `create_tables_batch`, `apply_allocation`, `admin_create_table`, `run_clustering_*` → INSERT de `created_by` (attribution, pas autorisation) ; `reclaim_moderator`, `designate_moderator` → UPDATE d'attribution, chemins de *promotion*, hors périmètre ; `list_session_tables`/`list_available_tables`/`get_questionnaire_responses` → `p.user_id = t.created_by` en JOIN d'*affichage* (pseudo de l'animateur) ; `end_turn_as_speaker` et `claim_floor` → gardes fondées sur `participants`/`leaderless`, aucune notion de `created_by`.

  **Pourquoi l'option (ii) — élargir les gardes — plutôt que (i) — faire poser `created_by` par `apply_allocation`** : vérifié dans le code avant application. `created_by` est une colonne **scalaire** → (i) interdit toute co-modération ; un modérateur peut être désigné **après** la création des tables (`claim_moderator_status` accepte `allocating` ET `debating` depuis le chantier 33, plus `assign_moderator_to_table` et `set_member_moderator`) → (i) obligerait à patcher ces chemins **et** à gérer le remplacement (retirer `created_by` à l'ancien) ; `created_by` sert aussi de donnée d'affichage dans `list_session_tables` ; et (i) laisse à découvert les tables créées par `create_tables_batch` avant qu'un modérateur ne soit assis. (ii) est purement **additive** — le créateur garde toute son autorité, rien de ce qui marche aujourd'hui ne régresse.

  **À faire (session de vérification)** : exécuter le fichier via le SQL Editor du dashboard Supabase (ou MCP) — surveiller les `NOTICE` éventuels du bloc `DO $guard$`, qui signalent une signature divergente en base et donc un écart entre les migrations et l'état réel. Puis dérouler les **5 requêtes de vérification en pied de fichier de migration** (helper présent avec le bon `search_path` ; aucune surcharge résiduelle sur les 9 fonctions ; plus aucun `created_by` dans leurs corps ; les 7 policies pointent sur le helper ; **table de vérité** du helper sur une vraie séance, qui liste membre par membre qui aurait l'autorité — la requête 5 permet de valider les cas négatifs sans avoir à se connecter sous chaque identité). Enfin dérouler le test manuel de la section **Parcours Modérateur** ci-dessous.

  **Validation de Jules (06/09)** : ✅ **appliquée le 2026-09-02** — corrige le bloquant le plus grave du projet (un modérateur désigné par l'allocation ne peut rien faire), et modifie des fonctions/policies utilisées par tous les autres tests du parcours Modérateur. Reste à faire : le test manuel complet (section Parcours Modérateur ci-dessous) — jamais joué à l'écran.

- [x] **Chantier 50 — `supabase/migrations/20260902_chantier50_close_identity_tables.sql`** *(validé le 2026-09-06)* ✅ **appliquée le 2026-09-02** — corrigeait une fuite de données personnelles. Reste à faire : les tests navigateur ci-dessous (jamais joués à l'écran) — notamment la comparaison avant/après sur l'onglet 🪑 Tables et le retrait du repli `loadTableAssignmentRows` (voir entrée dédiée, section Parcours Superadmin, **désormais actionnable puisque la migration est en place**).

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

  **Validation de Jules (06/09)** : ✅ **appliquée le 2026-09-02** — corrigeait une fuite de données personnelles. Reste à faire : les tests navigateur ci-dessous (jamais joués à l'écran) — notamment la comparaison avant/après sur l'onglet 🪑 Tables et le retrait du repli `loadTableAssignmentRows` (voir entrée dédiée, section Parcours Superadmin, **désormais actionnable puisque la migration est en place**).

- [x] **Chantier 61 — `supabase/migrations/20260902_chantier61_register_during_allocating.sql`** *(validé le 2026-09-06)* ✅ **appliquée le 2026-09-02**. Reste à faire : les 6 scénarios de test manuel ci-dessous (jamais joués à l'écran), y compris les scénarios 1 et 4 qui ne pouvaient pas passer avant cette application.

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

  **Validation de Jules (06/09)** : ✅ **appliquée le 2026-09-02**. Reste à faire : les 6 scénarios de test manuel ci-dessous (jamais joués à l'écran), y compris les scénarios 1 et 4 qui ne pouvaient pas passer avant cette application.

- [x] **Chantier 65 — `supabase/migrations/20260902_chantier65_register_session_member_reject_draft.sql`** *(validé le 2026-09-06)* (nouvelle, jamais appliquée) — une séance en phase `draft` ne doit être accessible à personne.

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

  **Validation de Jules (06/09)** : ✅ **appliquée (confirmée en base 2026-09-06) et vérifiée par une session Claude Code le 2026-09-06** — une séance en phase `draft` ne doit être accessible à personne.

- [x] **Chantier 49 — `supabase/migrations/20260902_chantier49_purge_reclaim_codes.sql`** *(validé le 2026-09-06)* (jamais appliquée) ⚠️ **MIGRATION DESTRUCTIVE — IRRÉVERSIBLE, aucune sauvegarde de la base n'existe à ce jour**

  **Contenu du fichier** :
  1. Purge ponctuelle : `session_members.reclaim_code` → `NULL` pour tout membre d'une séance déjà en phase `closed` (rattrapage des séances passées, avant que la fermeture de lecture du chantier 50 n'existe).
  2. `set_session_phase` réécrite pour purger automatiquement `reclaim_code` de la séance dès qu'elle passe en `closed` — plus jamais besoin de rejouer une purge ponctuelle par la suite. Ajout au passage d'un `SET search_path = public, extensions` explicite (absent de la version chantier 39) — la fonction appelle `crypt()`, et le projet s'est déjà fait piéger par ce piège précis (« mot de passe incorrect » trompeur quand `extensions` manque du search_path).

  **Pourquoi c'est irréversible** : un `reclaim_code` effacé ne se retrouve pas — ni recalculable, ni dérivable d'une autre colonne. Jules a explicitement autorisé à procéder sans sauvegarde préalable (« je n'ai pas prévu d'utiliser l'appli jusqu'à ce que tout, y compris les sauvegardes, soit livré »).

  **Pourquoi aucune régression attendue** (vérifié par lecture du SQL avant d'écrire la migration — inventaire complet des lecteurs de `reclaim_code`) :
  - `confirm_attendance` (phase `voting`/`allocating`, `VoteScreen.tsx`) n'est jamais atteignable sur une séance `closed` côté frontend — le routeur redirige vers le questionnaire post-débat/résultats avant.
  - `reclaim_prevoting_member` (chantier B3) est **phase-safe côté serveur** : il lève déjà une exception si `sessions.phase != 'pre_voting'`, indépendamment de cette purge.
  - Le code affiché au participant à l'inscription (`ReclaimCodeDisplay`) est généré côté client (`Math.random()`), jamais relu depuis la base.

  **À faire (session de vérification), dans cet ordre** :
  1. **Avant toute application**, exécuter la requête de diagnostic en tête du fichier de migration (comptage par séance + total global des `reclaim_code` non-NULL sur des séances `closed`) et noter le résultat (nombre de lignes, capture d'écran si possible) — trace de ce qui va être effacé.
  2. Exécuter le fichier via le SQL Editor du dashboard Supabase (ou MCP). Le bloc `DO $purge$` émet deux `NOTICE` (compte avant purge, lignes effectivement mises à jour) — vérifier qu'ils correspondent au comptage de l'étape 1.
  3. **Aucun code ne subsiste sur une séance close** :
     ```sql
     SELECT count(*) FROM session_members sm
     JOIN sessions s ON s.id = sm.session_id
     WHERE s.phase = 'closed' AND sm.reclaim_code IS NOT NULL;
     ```
     Attendu : `0`.
  4. **Purge automatique à la clôture** — sur une séance de test en phase `debating` avec au moins un membre `reclaim_code IS NOT NULL` : `SELECT set_session_phase('<mot de passe superadmin>', '<session_id>', 'closed')`, puis relire `session_members.reclaim_code` pour cette séance → attendu `NULL` partout.
  5. **Non-régression — reconquête pré-vote toujours fonctionnelle sur une séance encore ouverte** (phase `pre_voting`, ne pas confondre avec l'étape précédente) : inscrire un membre de test en `pre_voting`, noter son code de rappel, puis `SELECT reclaim_prevoting_member('<session_id>', NULL, '<code>')` depuis une autre identité (`auth.uid()` différent, ou simplement vérifier que le code n'a pas été touché par cette migration) → attendu : succès, transfert de `user_id`. Confirme que seules les séances `closed` sont purgées, pas les séances encore actives.

  **Recommandation non implémentée, à trancher séparément** : envisager d'anonymiser aussi `session_members.pseudo` (nom + prénom réels) après un délai post-clôture — c'est, une fois `reclaim_code` purgé, la donnée la plus identifiante qui reste indéfiniment en base. Non tranché : durée du délai, et si l'app doit un jour pouvoir recontacter un participant après coup (support, litige). Voir section "Rétention des données" de `CLAUDE.md`.

  **Validation de Jules (06/09)** : ✅ **appliquée (confirmée en base) et vérifiée par une session Claude Code le 2026-09-06** ⚠️ était une migration destructive/irréversible

- [x] **Chantier 48 — `supabase/migrations/20260902_chantier48_switch_table.sql`** *(validé le 2026-09-06)*

  **Contenu du fichier** : crée `switch_table(p_session_id uuid, p_join_code text, p_pseudo text) returns jsonb` — permet à un participant de rejoindre une autre table que celle qui lui a été assignée, depuis `AllocatingScreen`. Vérifie que le code correspond à une table de **cette** séance (sinon exception explicite), que le participant n'est pas déjà à cette table, puis **retire proprement** toute ligne `participants` de l'utilisateur dans les autres tables de la séance (libère le micro/clôt le tour en cours si besoin, même traitement que `kick_participant`) avant d'insérer la nouvelle ligne et de déplacer `table_assignments` via `sync_table_assignment` (déjà existante, chantier 26). Voir l'en-tête du fichier de migration pour le détail du raisonnement (pourquoi une RPC dédiée plutôt que réutiliser `join_table`).

  **À faire (session de vérification)** : exécuter le contenu du fichier via le SQL Editor du dashboard Supabase (ou MCP), confirmer `SELECT proname FROM pg_proc WHERE proname = 'switch_table'` retourne la fonction, puis dérouler le test manuel ci-dessous (section Participant). **Avant d'appliquer**, nettoyer si possible les 2 lignes `participants` orphelines laissées dans la table `589D79` par la vérification navigateur de ce chantier (voir section Nettoyage plus bas) — pas strictement nécessaire pour tester, mais ça fausse le compte de présents affiché en `ParticipantView`.

  **Validation de Jules (06/09)** : ✅ **appliquée et vérifiée par une session Claude Code le 2026-09-06**

- [x] **Chantier 39 — `supabase/migrations/20260901_chantier39_remove_questionnaire_phase.sql`** *(validé le 2026-09-06)* (jamais appliquée)

  **Contenu du fichier** :
  1. `UPDATE sessions SET phase = 'closed', phase_changed_at = now() WHERE phase = 'questionnaire'` — au moment de l'écriture, aucune séance de la base de test n'était dans cet état (vérifié par requête REST anon `select id,title,phase,join_code`), mais la migration doit rester idempotente/défensive pour toute séance réelle qui y serait encore.
  2. Contrainte `sessions_phase_check` réécrite sans `'questionnaire'` (`draft`, `pre_voting`, `voting`, `allocating`, `debating`, `closed`).
  3. `set_session_phase(password, session_id, phase)` réécrite avec la même liste sans `'questionnaire'` — sinon la fonction acceptait toujours l'ancienne valeur alors que le frontend ne l'envoie plus jamais.

  **Pourquoi retirer la phase plutôt que la garder mais inutilisée** : Jules a demandé explicitement la suppression (« on va supprimer cette phase ») — le questionnaire post-débat se déclenche désormais automatiquement à la sortie de `debating` (voir entrée dédiée, section "Questionnaire post-débat" plus bas) au lieu de nécessiter une étape de phase manuelle.

  **À faire (session de vérification)** : exécuter le fichier via le SQL Editor (ou MCP), puis `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'sessions_phase_check'` pour confirmer l'absence de `'questionnaire'` dans la définition, et `SELECT count(*) FROM sessions WHERE phase = 'questionnaire'` doit retourner 0. **Tant qu'elle n'est pas appliquée** : si une séance reste dans l'ancienne phase `questionnaire` (aucune trouvée dans la base de test au moment de l'écriture), `SuperadminScreen.tsx` ne la reconnaît plus dans `PHASE_SEQUENCE` (`indexOf` retourne -1) et affiche un `PhaseBar` incohérent (case courante non repérée, bouton suivant pointant vers `draft`) — appliquer la migration avant de rouvrir une telle séance dans le superadmin plutôt que de cliquer les boutons de phase pour la sortir de cet état.

  **Validation de Jules (06/09)** : ✅ **appliquée (confirmée en base) et vérifiée par une session Claude Code le 2026-09-06**

- [x] **Chantier 44 — `supabase/migrations/20260902_chantier44_add_offline_participant.sql`** *(validé le 2026-09-06 — ⚠️ validé avant la refonte des chantiers 73/74 du 06/09, à revalider)* (nouvelle fonction, jamais appliquée)

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

  **Validation de Jules (06/09)** : ✅ **appliquée et vérifiée par une session Claude Code le 2026-09-06**

- [x] **Chantier 51 — `supabase/migrations/20260902_chantier51_hide_assertion_author.sql`** *(validé le 2026-09-06)* ✅ **appliquée le 2026-09-02** — anonymat réel des auteurs d'assertions. Le point bloquant Realtime ci-dessous (fuite possible de `member_id` par WebSocket) et le reste du test manuel n'ont **toujours pas été joués à l'écran** — c'est désormais possible puisque la migration est en place.

  **⚠️ Point bloquant non tranchable sans accès DB, à vérifier EN PREMIER (avant de considérer ce chantier clos)** : ce correctif retire `member_id` de la lecture REST directe de `assertions`, mais on ne sait pas si Supabase Realtime applique les mêmes privilèges de colonne aux charges utiles `postgres_changes` — si le WebSocket continue de pousser `member_id` dans ses payloads, la fuite subsiste par ce canal et ce correctif est insuffisant à lui seul.
  **Manipulation exacte** : une fois la migration appliquée, dans `src/screens/VoteScreen.tsx` l.365 (`payload => { const a = payload.new as Assertion`), ajouter temporairement `console.log('[chantier51] payload.new', payload.new)` juste après. Recharger `#vote/<join_code>` sur une séance en phase `voting` avec des assertions `pending`, ouvrir la console DevTools du participant, puis côté superadmin approuver une assertion (`approve_assertion`) pour déclencher l'événement UPDATE. Lire l'objet loggé : présence ou non de la clé `member_id`.
  - Si **absent** : le correctif est complet, rien à faire de plus. Retirer le `console.log` et cocher cette entrée.
  - Si **présent** : la fuite passe par le WebSocket — ne pas improviser de correctif côté client. Solution de repli connue : une vue `assertions_public` (sans `member_id`) avec sa propre policy, lue à la place de la table par `VoteScreen.tsx` — chantier distinct à ouvrir. Documenter le résultat ici avant de considérer le chantier 51 clos.

  **✅ Vérifié au navigateur le 2026-09-07 (chantier 86)** — **`member_id` absent du payload Realtime.** Manipulation reproduite à l'identique (`console.log` temporaire l.387, Browser pane + serveur `ecclesia-dev`), avec une séance de test créée et supprimée par SQL (`sessions.join_code = 'TST86X'`, id `fa171e66-90e5-472c-8ea8-248e2bfd9138` — nettoyée après coup) pour ne dépendre d'aucun mot de passe. Participant inscrit via `#vote/TST86X`, assertion soumise (`pending`, `moderation_policy='closed'`), puis `UPDATE assertions SET status='approved'` exécuté en base (même effet que `approve_assertion`, qui ne fait que ce seul UPDATE). Payload capté côté participant : `{id, status, content, created_at, session_id}` — pas de `member_id`. La `GRANT SELECT (colonnes)` de la migration s'applique donc aussi aux charges `postgres_changes`, pas seulement à la lecture REST directe. Point bloquant levé, chantier 51 peut être considéré clos sur ce volet. `console.log` retiré après vérification.

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

  **Validation de Jules (06/09)** : ✅ **appliquée le 2026-09-02** — anonymat réel des auteurs d'assertions. Le point bloquant Realtime ci-dessous (fuite possible de `member_id` par WebSocket) et le reste du test manuel n'ont **toujours pas été joués à l'écran** — c'est désormais possible puisque la migration est en place.

- [x] **Ajout d'une source avec une URL valide** *(validé le 2026-09-06)* — `#collab/<join_code>` (`CollabDocScreen.tsx`)

  Rejoindre le document collaboratif d'une séance (via le lien affiché dans une table de débat rattachée à une séance, ou en naviguant directement sur `#collab/<join_code>` avec un `join_code` de séance connu). S'enregistrer avec un pseudo. "+ Ajouter" → titre + `https://example.com` en lien → "Ajouter". Attendu : la source apparaît immédiatement dans la liste, groupée sous la bonne table (ou "Non assigné"), le lien est bleu et cliquable, ouvre un nouvel onglet vers `https://example.com`.

  **Validation de Jules (06/09)** : `#collab/<join_code>` (`CollabDocScreen.tsx`) — ✅ vérifié le 2026-09-06 sur `#collab/65155A` : source acceptée, affichée avec lien bleu cliquable.

- [x] **Comportement à l'affichage d'une ligne douteuse déjà en base** *(validé le 2026-09-06)* — `CollabDocScreen.tsx` et `SuperadminScreen.tsx` (onglet sources, superadmin)

  Si la requête de repérage ci-dessus (section migration) a trouvé des lignes avec un `url` non http(s) : ouvrir le document collaboratif de la séance concernée et l'onglet sources du superadmin pour cette même séance. Attendu dans les deux écrans : le titre et le contenu de la source s'affichent normalement, mais le lien apparaît en texte rouge "⚠ Lien non affiché (schéma non autorisé)", **non cliquable**, au lieu d'un lien bleu. Si aucune ligne douteuse n'existe en base au moment du test, simuler le cas en insérant une ligne de test via `add_collab_source` en base **avant** l'application de la migration de ce chantier (donc sans la validation), ou directement par `INSERT` SQL manuel avec `url = 'javascript:alert(1)'` sur une séance de test — puis nettoyer cette ligne après vérification.

  **Validation de Jules (06/09)** : ✅ **vérifié par une session Claude Code le 2026-09-06** — `CollabDocScreen.tsx` et `SuperadminScreen.tsx` (onglet sources, superadmin)

- [x] **Non-régression de l'écran collaboratif après restriction de `collab_session_users`** *(validé le 2026-09-06)* — `CollabDocScreen.tsx`

  Sur une séance déjà utilisée pour les tests ci-dessus (ou une nouvelle) : recharger `#collab/<join_code>` avec le même navigateur/pseudo déjà enregistré → doit reconnaître automatiquement le pseudo (pas de ré-enregistrement demandé), afficher "Changer" à côté du pseudo dans l'en-tête, et permettre de modifier/supprimer ses propres sources (icônes crayon/poubelle visibles uniquement sur les sources dont `isOwn` est vrai). Changer de navigateur ou session anonyme (nouvel onglet privé) sur la **même séance** → la liste des sources reste visible (lecture publique de `session_sources`, non touchée par ce chantier), mais aucune source n'apparaît comme "à moi" (pas d'icônes crayon/poubelle) tant qu'aucun pseudo n'est enregistré sous cette nouvelle identité — s'enregistrer avec un pseudo déjà pris par un autre `user_id` doit transférer la propriété de ses sources (`register_collab_pseudo`, comportement inchangé par ce chantier, à vérifier non régressé).

  **Validation de Jules (06/09)** : ✅ **vérifié par une session Claude Code le 2026-09-06** — `CollabDocScreen.tsx`

- [x] **Chantier 66 — `supabase/migrations/20260903_chantier66_join_table_single_table.sql`** *(validé le 2026-09-06)* (nouvelle, jamais appliquée) — **à appliquer après le chantier 48 et sa suite** (`20260902_chantier48_switch_table.sql`, `20260902_chantier64b_...`, `20260902_chantier64c_...`) : elle redéfinit `switch_table` en repartant de sa dernière version, et suppose donc que `tables.leaderless_by_design` existe déjà. Indépendante du chantier 67 (point 3) juste au-dessus : les deux touchent des fonctions différentes du même fichier source d'origine sans se chevaucher (l'une `sync_table_assignment`, l'autre `join_table`/`switch_table`).

  **Symptôme corrigé** : `join_table` ne retirait jamais le participant de ses tables précédentes dans la même séance (simple upsert) — rejoindre une nouvelle table AJOUTAIT une ligne `participants` sans supprimer l'ancienne. Deux identités de test étaient encore listées comme présentes à la table `589D79` le 02/09 alors qu'elles l'avaient quittée. Le trou n'avait été bouché que pour `switch_table` (chantier 48/64b), jamais pour `join_table`.

  **Contenu du fichier** : nouvelle fonction `leave_other_session_tables(p_session_id, p_new_table_id, p_user_id)` — extraction du nettoyage déjà présent dans `switch_table` (libère le micro, clôt le tour en cours, supprime la ligne `participants`, bascule arrière `leaderless_by_design` si l'utilisateur en était le modérateur Bloc C) — **hors table de destination**, exclusion nécessaire pour que reprendre le code de sa table actuelle ne se coupe pas soi-même le micro. `join_table` l'appelle désormais avant l'INSERT (nouveauté) ; `switch_table` est refactorisée pour l'appeler aussi (comportement observable inchangé — sa garde « Tu es déjà à cette table » rendait déjà l'exclusion redondante). Signatures de `join_table` et `switch_table` inchangées.

  **Décision de Jules, non modifiée par ce chantier** : le bouton "Quitter" (`leaveTable()`) reste purement local, ne supprime rien, aucun appel RPC — le nettoyage ne se déclenche qu'à l'entrée dans une nouvelle table.

  **Question ouverte, non traitée par cette migration** — lignes fantômes déjà présentes en base (créées par le bug avant ce correctif, ex. table `589D79`). Requête de **diagnostic seulement** (aucune suppression) :
  ```sql
  -- Participants qui ont, dans une même séance, plusieurs lignes `participants`
  -- (donc plusieurs tables) au même moment — le symptôme du bug.
  SELECT
    t.session_id,
    p.user_id,
    array_agg(DISTINCT p.pseudo)   AS pseudos,
    array_agg(DISTINCT t.join_code) AS tables_join_codes,
    count(DISTINCT p.table_id)      AS nb_tables
  FROM participants p
  JOIN tables t ON t.id = p.table_id
  WHERE t.session_id IS NOT NULL
  GROUP BY t.session_id, p.user_id
  HAVING count(DISTINCT p.table_id) > 1
  ORDER BY nb_tables DESC;
  ```
  Ne pas supprimer ces lignes sans confirmation explicite de Jules — pas de sauvegarde active de la base à ce jour (`chantier-secu-sauvegardes`, non mergée).

  **À faire (session de vérification)** :
  1. Exécuter le fichier via le SQL Editor du dashboard Supabase (ou MCP). Vérifier au préalable `tables.leaderless_by_design` existe (`SELECT column_name FROM information_schema.columns WHERE table_name='tables' AND column_name='leaderless_by_design';`).
  2. **Rejoindre le lien d'un ami après en avoir déjà une** — un participant déjà dans TABLE_A (via `join_table` ou `switch_table`) reçoit/tape le code de TABLE_B (même séance). Rejoindre TABLE_B via l'onglet "Rejoindre" de l'accueil ou le lien `#table/<code_B>`. **Observer** : `SELECT * FROM participants WHERE table_id = '<TABLE_A_ID>'` ne montre plus ce participant ; il apparaît dans TABLE_B. Sur l'appareil du modérateur de TABLE_A (`ModeratorView`/`ParticipantsTable`), il doit disparaître de la liste sans action de sa part (Realtime).
  3. **Rejoindre la table où l'on est déjà, sans perte** — reprendre le même code de table avec le même pseudo (ex. recharger `App.tsx` après un vidage du localStorage Supabase auth, ou retaper son propre code dans "Rejoindre"). **Observer** : l'`id` de la ligne `participants` est inchangé (pas de suppression/réinsertion), et si le participant avait la parole, il ne la perd pas.
  4. **Arrivée d'un retardataire en phase `debating`** (jamais passé par l'allocation) — via `VoteScreen`/`SessionRouterScreen` ("le vote est terminé, mais tu peux rejoindre une table directement avec le code") ou `#table/<code>`. **Observer** : aucune régression — le participant rejoint normalement, une ligne `session_members`/`table_assignments` est créée pour lui (`sync_table_assignment`, best-effort, inchangé par ce chantier).
  5. **"Quitter" laisse toujours la ligne en place** — un participant clique "Quitter" (retour au menu) sans rejoindre d'autre table. **Observer** : `SELECT * FROM participants WHERE table_id = '<TABLE_ID>' AND user_id = '<USER_ID>'` renvoie toujours la ligne — comportement volontaire (décision de Jules), pas un oubli. Le modérateur voit toujours ce participant dans sa liste tant qu'il ne l'exclut pas via "Exclure" ou qu'il ne rejoint pas une autre table.
  6. **Bascule arrière d'une table leaderless** — répéter le test 2 avec un participant qui est le modérateur Bloc C (`session_members.is_moderator`) d'une table `leaderless_by_design = true`, en utilisant `join_table` (pas `switch_table`) pour changer de table. **Observer** : la table quittée repasse `leaderless = true` — même comportement que si le départ s'était fait via `switch_table` (chantier 64b).

  **Tant qu'elle n'est pas appliquée** : comportement actuel inchangé (rejoindre une nouvelle table via `join_table` laisse l'ancienne ligne `participants` en place).

  **Validation de Jules (06/09)** : ✅ **appliquée (confirmée en base) et vérifiée par une session Claude Code le 2026-09-06** (`20260902_chantier48_switch_table.sql`, `20260902_chantier64b_...`, `20260902_chantier64c_...`) : elle redéfinit `switch_table` en repartant de sa dernière version, et suppose donc que `tables.leaderless_by_design` existe déjà. Indépendante du chantier 67 (point 3) juste au-dessus : les deux touchent des fonctions différentes du même fichier source d'origine sans se chevaucher (l'une `sync_table_assignment`, l'autre `join_table`/`switch_table`).

- [x] **Chantier 54 — `supabase/migrations/20260903_chantier54_remove_moderator_table_delete.sql`** *(validé le 2026-09-06)* — supprime purement et simplement la policy RLS `tables_delete_moderator` (posée par le chantier 60 sur `is_table_moderator`), sans la remplacer. Aucune dépendance avec les autres migrations en attente ci-dessus, applicable indépendamment.

  **Pourquoi** : Jules a découvert qu'un modérateur pouvait encore supprimer sa table (`TableContext.endTable()`, DELETE direct côté client), alors qu'il croyait ce chemin déjà fermé — le bouton correspondant avait bien été retiré de `ModeratorView` en juin 2026 (commit `54b6b93`), mais la policy RLS qui autorisait le DELETE en base restait active, donc l'action restait possible par un appel REST direct (`DELETE /rest/v1/tables?id=eq.<id>` avec la clé anon publique), sans passer par l'UI. Décision de Jules : le modérateur ne doit plus jamais pouvoir supprimer sa table, par aucun chemin. `endTable()` et son entrée dans `TableCtxValue` ont aussi été retirés de `TableContext.tsx` (code mort, plus aucun appelant côté écrans depuis juin).

  **N'affecte pas** la suppression de table côté superadmin (`SuperadminScreen` → `deleteTableAdmin` → RPC `SECURITY DEFINER` `delete_table_admin`, indépendante de cette policy — elle contourne RLS entièrement).

  **À faire (session de vérification)** :
  1. Exécuter le fichier via le SQL Editor du dashboard Supabase (ou MCP).
  2. `SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tables' AND cmd = 'DELETE';` → **aucune ligne retournée**.
  3. Voir les recettes détaillées dans les sections Parcours Modérateur et Parcours Superadmin ci-dessous.

  **Validation de Jules (06/09)** : ✅ **appliquée et vérifiée par une session Claude Code le 2026-09-06** — supprime purement et simplement la policy RLS `tables_delete_moderator` (posée par le chantier 60 sur `is_table_moderator`), sans la remplacer. Aucune dépendance avec les autres migrations en attente ci-dessus, applicable indépendamment.

- [x] **2026-09-04 — Chantier 70 — `supabase/migrations/20260904_chantier70_historiser_votes.sql`** *(validé le 2026-09-06)* (jamais appliquée) — historiser les votes pour mesurer le déplacement des opinions après le débat, suite directe du point signalé par le chantier 69

  **Contexte / décision de Jules** : `cast_vote` (chantier 69) écrase l'ancien vote par upsert, sans historique — la comparaison avant/après débat que la démarche Ecclesia veut mesurer était impossible. Jules a tranché : « il faut faire une "sauvegarde" de l'ancien vote pour pouvoir le comparer au nouveau vote [...] on pourra relancer l'analyse, et voir comment les positions idéologiques ont bougé après le débat. » Ce chantier ne fait QUE la partie serveur et données — **aucun écran de comparaison n'a été conçu**, c'est volontaire (Jules veut son mot à dire sur cette visualisation). Voir « Ce que ces données permettent, et ce qu'il reste à faire » en fin d'entrée.

  **Choix de conception — table d'historique plutôt qu'élargissement de la contrainte d'unicité** (justification complète en tête du fichier de migration) : `assertion_votes` reste structurellement et comportementalement identique à aujourd'hui (une ligne par paire assertion×membre = le vote courant). L'ancien vote est détourné vers une nouvelle table `assertion_vote_history`, alimentée par `cast_vote` juste avant chaque écrasement réel (pas de ligne si le nouveau vote est identique à l'ancien — évite le bruit d'un re-clic sur le même bouton). Alternative rejetée : élargir `UNIQUE(assertion_id, member_id)` sur `assertion_votes` lui-même aurait obligé à retoucher tous ses lecteurs existants (inventaire fait avant d'écrire la migration : `get_vote_results`, `get_vote_counts_admin`, `get_all_votes_for_analysis`, `get_session_voting_stats`, `get_table_opinion_summary`, `get_public_results`, `get_vote_results_all`, les gardes "has_voted" de `list_session_members_admin`/`get_allocation_inputs`, et côté client `VoteScreen.tsx`/`PostVoteScreen.tsx`) — aucun ne filtre aujourd'hui sur une notion de version, tous supposent au plus une ligne par paire. La table à part laisse ces lecteurs **strictement inchangés**.

  **Contenu du fichier** (détail et rationale complets en commentaires en tête du fichier) :
  1. Table `assertion_vote_history` (RLS self-only, même policy que `assertion_votes_select_own`) — capture `vote`, `voted_at` (created_at de la ligne remplacée), `superseded_at`, `phase_at_change` (`sessions.phase` au moment de l'écrasement, `text` libre sans CHECK — même convention que `session_members.joined_phase`).
  2. Colonne `assertion_votes.first_cast_phase` (nouvelle, `NOT NULL`) — phase au moment du tout premier vote sur cette paire, jamais retouchée par un upsert ultérieur. Backfill `'legacy'` sur toutes les lignes déjà en base.
  3. Colonne `session_analysis.vote_scope` (nouvelle, `NOT NULL DEFAULT 'current'`) — `'current'` ou `'pre_closure'`, tague quels votes ont nourri l'analyse.
  4. `cast_vote` redéfinie — historise avant d'écraser (voir ci-dessus). Mêmes vérifications et même valeur de retour qu'avant pour l'appelant.
  5. `get_all_votes_for_analysis` redéfinie — nouveau paramètre `p_vote_scope` (défaut `'current'`, donc tout appel existant continue à fonctionner à l'identique sans le passer). `p_vote_scope = 'pre_closure'` reconstitue, pour chaque paire, la valeur juste avant le premier écrasement en phase `'closed'` ; exclut les paires dont le tout premier vote a été posé en `'closed'` (n'existaient pas avant la clôture — ex. une assertion votée pour la première fois via la section "3 · Assertions non vues" du postvote).
  6. `save_analysis` redéfinie — nouveau paramètre `p_vote_scope` (défaut `'current'`, même comportement qu'avant si omis). `session_analysis` était **déjà append-only** (simple `INSERT`, jamais un upsert, depuis sa création en `20260610_opinion_analysis.sql`) — relancer une analyse n'a donc jamais écrasé la précédente, avant comme après ce chantier.
  7. `get_latest_analysis`, `get_results_map`, `get_public_results` redéfinies — ajout de `AND vote_scope = 'current'` à leur sélection de "dernière analyse `done`". **Point tranché sans consultation, à valider par Jules** (voir note dédiée en tête du fichier de migration) : sans ce filtre, lancer une analyse `'pre_closure'` après une analyse `'current'` la rendrait chronologiquement plus récente et donc, silencieusement, celle montrée aux participants sur `ResultsMapScreen`/`PublicResultsScreen` — jugé absurde, d'où le filtre. Comportement strictement inchangé pour toutes les analyses déjà en base (`vote_scope` vaut `'current'` par défaut dessus).
  8. Deux nouvelles RPC : `list_session_analyses(password, session_id)` (toutes les analyses d'une séance, triées par date, avec `vote_scope` et nombre de membres placés) et `get_analysis_by_id(password, analysis_id)` (relit une analyse précise, pas seulement "la dernière"). Nécessaires pour qu'un futur écran de comparaison puisse charger une analyse `'current'` et une `'pre_closure'` côte à côte.

  **Côté frontend, déjà livré (ne dépend pas de la migration pour compiler)** — `src/lib/analysis.ts` : type `VoteScope`, `LoadedAnalysis.vote_scope` (nouveau champ), `SessionAnalysisSummary` (nouveau type) ; `loadVotesForAnalysis`/`saveAnalysisResult` acceptent un `voteScope` optionnel (défaut `'current'`) ; nouvelles fonctions `listSessionAnalyses`/`loadAnalysisById`. Seul changement hors `analysis.ts` : `src/components/AnalysisPanel.tsx`, `resultToLoaded()` pose `vote_scope: 'current'` sur l'objet qu'elle construit localement (mécanique, pour satisfaire le type étendu — ce chemin ne calcule jamais depuis les votes pré-clôture, aucune UI ne le déclenche). **Aucun autre changement dans `AnalysisPanel.tsx`/`SuperadminScreen.tsx`** — le bouton "Lancer une analyse" continue d'appeler `loadVotesForAnalysis`/`saveAnalysisResult` sans le nouveau paramètre, donc toujours en `vote_scope='current'`, comportement identique à avant ce chantier. `npx tsc --noEmit`, `npm test` (94 passants, 1 skip) et `npm run build` propres.

  **⚠️ Fenêtre de contamination, à savoir avant d'exploiter les données** : le chantier 69 (écran postvote) est déjà mergé et déployé, et permettait déjà de revoter en phase `closed` **sans** historisation avant cette migration. Le backfill `first_cast_phase = 'legacy'` suppose qu'aucune ligne déjà en base n'a été posée/modifiée pendant que la séance était `closed` — vrai pour tout ce qui précède le chantier 69, potentiellement faux pour une poignée de votes passés entre le déploiement du chantier 69 et l'application de cette migration. Aucune parade a posteriori (l'information n'a jamais été capturée) — l'appliquer au plus tôt réduit la fenêtre.

  **À faire (session de vérification)** :
  1. Exécuter le fichier via le SQL Editor du dashboard Supabase (ou MCP).
  2. Vérifier le backfill : `SELECT COUNT(*) FROM assertion_votes WHERE first_cast_phase IS NULL` → attendu `0` (contrainte `NOT NULL` posée en fin de section 2, donc cette requête ne peut de toute façon plus remonter de ligne — sert à confirmer qu'aucune erreur n'a interrompu le backfill avant la contrainte).
  3. Scénario minimal d'historisation — sur une séance de test `closed` avec au moins un membre inscrit et une assertion approuvée :
     - Nettoyer une paire de test si besoin, voter une première fois (`SELECT cast_vote('<assertion_id>', 'agree')` en simulant l'appelant, ou via l'écran postvote réel).
     - Revoter différemment (`cast_vote('<assertion_id>', 'disagree')`).
     - `SELECT * FROM assertion_vote_history WHERE assertion_id = '<assertion_id>' AND member_id = '<member_id>'` → attendu une ligne, `vote = 'agree'`, `phase_at_change = 'closed'`.
     - Revoter une troisième fois avec la **même** valeur (`cast_vote('<assertion_id>', 'disagree')` à nouveau) → attendu : toujours une seule ligne d'historique (pas de doublon sur un re-vote identique).
  4. `SELECT get_all_votes_for_analysis('<mot de passe>', '<session_id>', false, 'pre_closure')` sur cette même séance → attendu : la paire de test apparaît avec `vote = 'agree'` (la valeur d'avant l'écrasement), pas `'disagree'`.
  5. Vérifier l'exclusion des votes nés en postvote : voter pour la toute première fois sur une paire jamais votée, pendant que la séance est `closed` → `SELECT get_all_votes_for_analysis(..., 'pre_closure')` ne doit **pas** contenir cette paire (alors que `get_all_votes_for_analysis(..., 'current')`, ou l'omission du 4ᵉ paramètre, la contient normalement).
  6. Lancer une analyse via le panneau superadmin existant (`AnalysisPanel`, bouton "Lancer une analyse") **avant et après** avoir appliqué cette migration si possible, sinon juste après : vérifier que le comportement est identique à avant (aucun changement visible), et que `SELECT vote_scope FROM session_analysis ORDER BY created_at DESC LIMIT 1` retourne bien `'current'`.
  7. `SELECT list_session_analyses('<mot de passe>', '<session_id>')` → toutes les analyses de la séance apparaissent, triées par date décroissante, avec leur `vote_scope`.
  8. `SELECT get_analysis_by_id('<mot de passe>', '<id d'une analyse ancienne, pas la dernière>')` → retourne cette analyse précise (pas la plus récente).

  **Ce que ces données permettent, et ce qu'il reste à faire (pour Jules, avant d'ouvrir l'écran de comparaison)** :
  - Il est maintenant possible d'appeler `loadVotesForAnalysis(supabase, password, sessionId, false, 'pre_closure')` puis `runOpinionAnalysis(...)` puis `saveAnalysisResult(..., 'pre_closure')` pour calculer et conserver une analyse "avant clôture", à tout moment après que des votes ont commencé à être révisés en postvote — **sans jamais toucher** à l'analyse `'current'` existante (ligne distincte, jamais écrasée).
  - `listSessionAnalyses`/`loadAnalysisById` permettent de charger deux analyses précises (une `'current'`, une `'pre_closure'`) pour les comparer — même structure de données que ce que `ResultsMapScreen`/`AnalysisPanel` savent déjà afficher côté scatter/repness/consensus pour une analyse individuelle.
  - **Ce qui manque, hors périmètre de ce chantier** : (a) un bouton dans `AnalysisPanel` pour déclencher explicitement une analyse `'pre_closure'` (aujourd'hui uniquement possible via un appel direct aux fonctions `analysis.ts`, aucun déclencheur UI) ; (b) un écran ou un mode de `ResultsMapScreen`/`AnalysisPanel` juxtaposant les deux scatters ou calculant un delta par membre (ex. `group_id` avant vs après, ou distance PCA parcourue) ; (c) une réflexion sur la présentation aux **participants** eux-mêmes (voient-ils leur propre déplacement, ou seulement le superadmin ?) — non tranchée, à décider par Jules.

  **Validation de Jules (06/09)** : ✅ **appliquée et vérifiée par une session Claude Code le 2026-09-06** — historiser les votes pour mesurer le déplacement des opinions après le débat, suite directe du point signalé par le chantier 69

- [x] **2026-09-01 — Bouton "Voir tous les débats" (accueil)** *(validé le 2026-09-06 — ⚠️ validé avant la refonte des chantiers 73/74 du 06/09, à revalider)* — `src/screens/EntryScreen.tsx`

  Lien externe vers `https://ecclesia-centralesupelec.vercel.app/#debats` (site public Ecclesia, hébergé à part sur Vercel), `target="_blank" rel="noopener noreferrer"`. Placé en pied de carte d'accueil, au-dessus du lien "Administration".

  **Déjà vérifié en navigateur** : présent sur l'écran d'accueil, `href`/`target`/`rel` corrects (lu via le DOM), zéro erreur console au chargement de l'écran.

  **Non vérifiable en session headless** : l'ouverture réelle d'un nouvel onglet vers un domaine externe (Vercel) n'a pas été cliquée pour de vrai — seuls les attributs du lien ont été inspectés.

  **Validation de Jules (06/09)** : `src/screens/EntryScreen.tsx` — ✅ présence confirmée en navigateur le 2026-09-06

- [x] **2026-09-01 — Modale "Anciennes séances" (accueil)** *(validé le 2026-09-06 — ⚠️ validé avant la refonte des chantiers 73/74 du 06/09, à revalider)* — `src/screens/EntryScreen.tsx` (`PastSessionsModal`)

  Bouton "Voir les votes des anciennes séances" en pied de carte d'accueil → modale listant les séances `phase='closed' AND results_public=true` (titre, date, description), triées par date décroissante. Clic sur une séance → `#results/<id>` (nouvelle route directe par id, pas de join_code — un `join_code` de séance close peut être réutilisé par une séance non-close plus récente, donc le routage par id évite toute ambiguïté).

  **Déjà vérifié en navigateur (avant migration)** : la modale s'ouvre, affiche "Anciennes séances" avec bouton de fermeture, la requête échoue proprement avec le message Postgres explicite affiché à l'écran ("column sessions.results_public does not exist") — pas de page blanche, pas d'exception React non gérée. Fermeture de la modale (✕) fonctionne.

  **Test minimal (après migration)** : au moins une séance `closed` avec `results_public=true` créée par la session de vérification (via le nouveau bouton superadmin ci-dessous) → vérifier son apparition dans la liste, triée correctement si plusieurs. Cliquer dessus → arrivée sur `#results/<id>` (voir section dédiée ci-dessous). Vérifier aussi le cas vide ("Aucune séance aux résultats publics pour l'instant.") si aucune séance n'est encore marquée visible.

  **Validation de Jules (06/09)** : ✅ **vérifiée par une session Claude Code le 2026-09-06** — `src/screens/EntryScreen.tsx` (`PastSessionsModal`)

- [x] **2026-09-01 — Page de résultats publics** *(validé le 2026-09-06)* — `src/screens/PublicResultsScreen.tsx`, routes `#results/<session_id>` et `#session/<join_code>` (phase closed, visiteur non inscrit)

  Page unique : nuage de points PCA anonyme (aucun `member_id`, mêmes couleurs/légende que l'onglet Analyse du superadmin) si une analyse existe, puis liste complète des assertions approuvées avec barre agree/disagree/pass et compteurs. Accessible sans connexion (auth anonyme uniquement). Aucune table, aucun pseudo, aucun découpage par table de débat — vérifié en lisant le payload exact retourné par `get_public_results` (voir requêtes de vérification dans le fichier de migration) : seulement `k_chosen`, `points[].{pca_x,pca_y,group_id}`, `assertions[].{content,agree_count,disagree_count,pass_count}`.

  **Déjà vérifié en navigateur (avant migration)** : `#results/<uuid inexistant>` → "Séance introuvable." affiché proprement (pas de crash), zéro exception React. `#results/<id>` sans `session` prop résout bien la séance par id avant de charger les résultats (chemin de code distinct de l'usage existant via `SessionRouterScreen`, qui passe toujours `session` directement).

  **Non testable avant migration** : le rendu réel avec des données (nuage de points + assertions) — la fonction `get_public_results` encore déployée renvoie l'ancienne forme (`groups`/`consensus`), donc `data.points`/`data.assertions` restent vides même pour une séance close existante avec `results_public` inexistant en base.

  **Test minimal (après migration, mot de passe superadmin pour préparer une séance de test)** : séance close avec au moins une analyse d'opinion lancée et quelques assertions votées → marquer `results_public=true` (bouton superadmin ci-dessus) → ouvrir `#results/<id>` (via la modale accueil) et `#session/<join_code>` (si le join_code est encore d'actualité) en visiteur non connecté (nouvel onglet privé / navigateur non inscrit à la séance) → vérifier l'affichage du nuage de points, des assertions avec compteurs, l'absence totale de nom/pseudo/table à l'écran, zéro erreur console. Démarquer `results_public=false` → revérifier que la page affiche "non disponibles publiquement" (le RPC renvoie NULL).

  **Validation de Jules (06/09)** : ✅ **vérifiée par une session Claude Code le 2026-09-06** — `src/screens/PublicResultsScreen.tsx`, routes `#results/<session_id>` et `#session/<join_code>` (phase closed, visiteur non inscrit)

- [x] **2026-09-02 — Chantier 67 (point 1) — continuer à voter à distance au lieu de mentir sur sa présence** *(validé le 2026-09-06 — ⚠️ validé avant la refonte des chantiers 73/74 du 06/09, à revalider)* — `src/screens/VoteScreen.tsx` (`AttendanceConfirmScreen`, mode `known_user`)

  **Aucune vérification navigateur faite** (session headless, consigne explicite de ne lancer aucun serveur de dev). Seuls `npx tsc --noEmit`, `npm test` (94 tests) et `npm run build` ont été joués, tous verts.

  **Le bug** : un pré-votant, au passage de la séance en phase `voting`, était basculé de force sur l'écran de confirmation de présence (« Tu avais voté à distance sous le nom X — Es-tu présent(e) au débat aujourd'hui ? »), avec seulement deux issues : confirmer sa présence (`attending_in_person → true`, alors qu'il n'est pas là) ou basculer vers l'écran de reconquête (pseudo/code/nouveau profil — qui mène, lui aussi, toujours à `attending_in_person = true`). Aucune voie ne permettait de rester à distance sans mentir.

  **Le correctif** : nouveau bouton « Non, je continue à voter à distance » entre « ✓ Oui, je suis présent(e) » et « Ce n'est pas moi / utiliser un autre compte ». Au clic : `handleContinueRemote()` ne fait **aucun appel RPC** (pas de `confirmAttendance`), le membre reste inchangé (`attending_in_person` reste `false`), et le vote reprend directement (`loadVoteData`) — même chemin que `handlePseudoReclaimSuccess` (pas d'onboarding : la pré-vote n'en a pas).

  **Allocation — non modifiée** (hors périmètre, consigne explicite de ce chantier). Vérifié par lecture de `get_allocation_inputs`/`run_clustering_v1`/`run_clustering_v2` : les trois filtrent déjà sur `attending_in_person = true` — un membre resté à `false` via ce nouveau bouton est donc déjà exclu de la répartition, sans changement nécessaire côté allocation (`src/lib/allocation.ts` non touché).

  **Test minimal** :
  1. Créer un pré-votant (phase `pre_voting`, vote via `#vote/<join_code>`), noter son pseudo.
  2. Faire passer la séance en `voting` depuis le superadmin.
  3. Recharger `#vote/<join_code>` avec **le même profil navigateur** que le pré-vote → observer l'écran « Tu avais voté à distance sous le nom X — Es-tu présent(e) au débat aujourd'hui ? » avec **trois** boutons désormais (présent / continuer à distance / pas moi).
  4. Cliquer « Non, je continue à voter à distance » → observer : retour direct à l'écran de vote (assertions), pas d'écran d'onboarding, pas d'erreur.
  5. Superadmin, onglet Membres : vérifier que `attending_in_person` de ce membre est resté `false`.
  6. Lancer l'allocation (`AllocationPanel`, phase `allocating`) : vérifier que ce membre n'apparaît dans **aucune** table proposée.
  7. **Non-régression** : reprendre les scénarios 1/2/3/5 du chantier 61 documentés ci-dessous (nouvel arrivant, reconquête par nom, par code, confirmation de présence classique) — vérifier qu'ils passent toujours, notamment que le bouton « ✓ Oui, je suis présent(e) » juste au-dessus du nouveau bouton fonctionne toujours normalement.

  **Validation de Jules (06/09)** : ✅ **entièrement vérifié par une session Claude Code le 2026-09-06** — `src/screens/VoteScreen.tsx` (`AttendanceConfirmScreen`, mode `known_user`)

- [x] **2026-09-02 — Chantier 67 (point 4) — message d'accueil aligné sur les 5 étapes de `PhaseIndicator`** *(validé le 2026-09-06 — ⚠️ validé avant la refonte des chantiers 73/74 du 06/09, à revalider)* — `src/screens/VoteScreen.tsx` (`AppIntroModal`)

  **Le bug** : `AppIntroModal` (popup « Comment se déroule la séance ? », une fois par séance) annonçait 4 étapes (Vote / Répartition / Débat / Questionnaire) alors que `PhaseIndicator` (chantier 39) en affiche 5 : 1 Distanciel, 2 Vote en présentiel, 3 Allocation, 4 Débat, 5 Post-débat.

  **Le correctif** : les 5 libellés numérotés de `AppIntroModal` reprennent mot pour mot ceux de `PARTICIPANT_PHASE_STEPS` (`src/lib/phaseLabels.ts`) — « 1. Distanciel », « 2. Vote en présentiel », « 3. Allocation », « 4. Débat », « 5. Post-débat » — avec une description courte par étape.

  **Test minimal** :
  1. Vider `localStorage['ecclesia_app_intro_<session.id>']` (ou utiliser une séance jamais visitée sur ce profil).
  2. Ouvrir `#vote/<join_code>` → observer le popup « Comment se déroule la séance ? » avec **5** lignes numérotées 1 à 5, libellés strictement identiques à ceux de la pastille `PhaseIndicator` affichée sur les écrans suivants du parcours (comparer texte à texte : « 1 · Distanciel » en pré-vote, « 2 · Vote en présentiel » en vote, etc.).
  3. Fermer (« Compris, c'est parti → ») → recharger la page → vérifier que le popup ne réapparaît pas (comportement `localStorage` inchangé).
  4. **Non-régression** : vérifier que le popup `PreVotingAnnounceModal` (l'autre popup d'accueil, prioritaire en `pre_voting`) continue de s'afficher à sa place quand les deux conditions sont réunies — ce chantier n'a pas touché cette logique de priorité (`showPreVotingAnnounce ? ... : showAppIntro && ...`).

  **Validation de Jules (06/09)** : ✅ **vérifié par une session Claude Code le 2026-09-06** — `src/screens/VoteScreen.tsx` (`AppIntroModal`)

- [x] **2026-09-02 — Chantier 61 — s'inscrire et voter pendant la phase `allocating`** *(validé le 2026-09-06 — ⚠️ validé avant la refonte des chantiers 73/74 du 06/09, à revalider)* — `src/screens/VoteScreen.tsx`, migration `20260902_chantier61_register_during_allocating.sql` *(voir « Migration SQL en attente » ci-dessus — les scénarios 1 et 4 ne passent qu'une fois appliquée ; 2 et 3 passent sans)*

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

  **Validation de Jules (06/09)** : ✅ **scénario principal vérifié par une session Claude Code le 2026-09-06 (voir chantiers 61 et 62 plus haut)** — `src/screens/VoteScreen.tsx`, migration `20260902_chantier61_register_during_allocating.sql`

- [x] **2026-09-02 — Chantier 62 — sortie de secours pour le participant inscrit sans affectation de table** *(validé le 2026-09-06)* — `src/components/voting/TableAssignmentCard.tsx` *(pas de migration SQL — réutilise `switch_table`, chantier 48)*

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

  **Validation de Jules (06/09)** : ✅ **entièrement vérifié par une session Claude Code le 2026-09-06** — `src/components/voting/TableAssignmentCard.tsx` *(pas de migration SQL — réutilise `switch_table`, chantier 48)*

- [x] **2026-09-02 — Chantier 48 — « Je veux rejoindre une autre table »** *(validé le 2026-09-06)* — `src/components/voting/TableAssignmentCard.tsx`, `src/screens/AllocatingScreen.tsx`, migration `switch_table` *(voir « Migration SQL en attente » ci-dessus — le test complet de bascule réelle n'est possible qu'une fois appliquée)*

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

  **Validation de Jules (06/09)** : ✅ **vérifié par une session Claude Code le 2026-09-06 (voir chantier 48 en section Migration SQL)** — `src/components/voting/TableAssignmentCard.tsx`, `src/screens/AllocatingScreen.tsx`, migration `switch_table`

- [x] **2026-08-01 — Chantier 34 — carte "Votre groupe" affichée à tort pour les non-votants** *(validé le 2026-09-06)* — `src/screens/ResultsMapScreen.tsx`

  **Bug** : sur l'écran de résultats de fin de séance (`ResultsMapScreen`, `#session/<join_code>` en phase `closed`, membre inscrit), la carte "Votre groupe" s'affichait dès que `assignment != null` — or `table_assignments` inclut tous les présents, votants ou non. Un membre inscrit mais n'ayant jamais voté a un `assignment` mais aucun point dans l'analyse PCA → `selfGroupId` reste `null` → il tombait sur "L'organisateur n'a pas encore nommé les groupes.", un texte qui n'a de sens que pour un vrai camp pas encore nommé.

  **Correctif** : condition d'affichage passée de `assignment != null` à `assignment != null && selfGroupId !== null`. Trois cas attendus :
  - Jamais voté → `selfGroupId === null` → carte "Votre groupe" totalement absente.
  - Voté, camp pas encore nommé → carte affichée avec "Camp pas encore nommé" (titre porté par le chantier 30/J6, fusionné sans conflit avec ce correctif).
  - Voté, camp nommé → nom/description du camp affichés normalement.

  **Déjà vérifié** : uniquement via une route de debug temporaire (`#debug-results-map`) + mock de `window.fetch` sur les 3 RPC consommées (`get_my_table_assignment`, `get_results_map`, `get_vote_results`), retirée avant commit. Les 3 rendus correspondent à la spec, zéro erreur console. **Jamais testé contre une vraie séance Supabase.**

  **Test minimal** (nécessite une séance `closed` avec un mix membre votant / membre non-votant — mot de passe superadmin pour créer/clôturer la séance de test, ou une vraie séance passée qui a ce mix) : membre n'ayant jamais voté → `#session/<join_code>` → vérifier l'absence totale de la carte "Votre groupe" (reste de la page — scatter, autres camps, consensus/clivage — inchangé). Membre ayant voté, camp pas encore nommé par Gemini → carte présente avec "Camp pas encore nommé". Membre ayant voté, camp nommé → nom/description corrects.

  **Validation de Jules (06/09)** : ✅ **vérifié contre une vraie séance Supabase par une session Claude Code le 2026-09-06** — `src/screens/ResultsMapScreen.tsx`

- [x] **2026-09-01 — Chantier 40 — ordre des modales d'entrée en débat** *(validé le 2026-09-06)* — `src/screens/ParticipantView.tsx`, `src/components/DebateRulesModal.tsx`

  Retour de Jules : à l'entrée en débat, les deux modales successives ("Bienvenue dans le débat" puis les règles) n'étaient pas clairement présentées comme une séquence voulue. Trois changements purement front, aucune logique de phase touchée :
  1. Ordre inversé : "Bienvenue dans le débat" s'affiche désormais **avant** les règles.
  2. Titre de la 2ᵉ modale changé de "Règles du débat" à "Règles d'Ecclesia lors des débats".
  3. Bouton bleu de la 1ʳᵉ modale changé de "C'est parti ! →" à "Lire les règles de débat Ecclesia →".

  **Déjà vérifié en navigateur** (table `leaderless` de test, séance partagée "Test manuel — Vote & bascule modérateur") : parcours complet accueil → "Bienvenue dans le débat" (nouveau texte de bouton) → clic → modale règles (nouveau titre) → "J'ai lu" → retour vue débat normale, aucune 3ᵉ modale. Rechargement de page : les deux `localStorage` (`debate_welcome_<id>`, `debate_rules_read_<id>`) empêchent bien toute réapparition. Zéro erreur console.

  **Non testé** : rendu sur une table non-`leaderless` (avec modérateur) — risque de régression jugé nul, la logique ne dépend pas de `leaderless` ; parcours mobile réel (uniquement viewport desktop testé).

  **Test minimal** : reproduire le parcours ci-dessus sur une table **avec modérateur** (pas seulement leaderless), et sur mobile (`resize_window` ou vrai appareil) pour couvrir les deux angles non testés.

  **Validation de Jules (06/09)** : ✅ **entièrement vérifié par une session Claude Code le 2026-09-06** — `src/screens/ParticipantView.tsx`, `src/components/DebateRulesModal.tsx`

- [x] **2026-09-01 — Chantier 42 — notes participant perdues (retour de test Jules)** *(validé le 2026-09-06)* — `src/components/NotesModal.tsx`

  **Cause identifiée** : les 3 chemins de fermeture de la modale (croix, clic hors modale, Échap) appelaient `onClose()` sans vider le debounce de 800ms qui déclenche l'écriture en base (`saveNote`). Fermer puis rouvrir juste après une frappe pouvait recharger la base *avant* que l'écriture différée n'ait abouti → la note paraissait perdue (course, pas une perte réelle). Risque aggravant identifié en même temps : au premier enregistrement, deux écritures concurrentes pouvaient se percuter sur la contrainte unique partielle `(session_id, user_id)` / `(table_id, user_id)` de `private_notes`.

  **Correctif appliqué** : `handleClose()` vide et exécute immédiatement le debounce en attente (`await saveNote(...)`) avant d'appeler `onClose()`, sur les 3 chemins de fermeture.

  **Déjà vérifié en navigateur** : frappe dans l'éditeur → fermeture ~200ms après la frappe → réouverture ~150ms après la fermeture → contenu bien présent au rechargement. Zéro erreur console, zéro message "Erreur :" affiché dans la modale.

  **Point non couvert par ce correctif — à vérifier humainement** : la fermeture *dure* du navigateur/onglet (pas la modale) pendant l'écriture différée — le flush est déclenché par `onClose()` React, qui ne s'exécute pas si l'onglet/la page est fermé(e) avant. Reste une perte possible dans ce cas précis (`beforeunload`/`pagehide` non gérés) — scénario différent de celui rapporté par Jules ("écrit, fermé, rouvert" la modale, pas l'onglet), donc hors scope du fix. À évaluer si ça revient.

  **Test minimal** : reproduire le scénario original de Jules (écrire une note, fermer, rouvrir rapidement) sur `NotesModal` en phase vote et en phase débat (table rattachée à une séance, notes partagées vote→débat). Optionnel : tester le cas non couvert (fermeture d'onglet pendant l'écriture) pour évaluer si ça vaut la peine de gérer `beforeunload`.

  **Validation de Jules (06/09)** : ✅ **vérifié par une session Claude Code le 2026-09-06** — `src/components/NotesModal.tsx`

- [x] **2026-09-01 — Chantier 39 — repère de phase participant (`PhaseIndicator`)** *(validé le 2026-09-06 — ⚠️ validé avant la refonte des chantiers 73/74 du 06/09, à revalider)* — `src/components/PhaseIndicator.tsx`, `src/lib/phaseLabels.ts`, `VoteScreen.tsx`, `AllocatingScreen.tsx`, `ParticipantView.tsx`, `ResultsMapScreen.tsx`, `SessionQuestionnaireForm.tsx`

  **Livré** : pastille "Étape N · Libellé" affichée tout au long du parcours participant — 1 Distanciel (`pre_voting`), 2 Vote en présentiel (`voting`), 3 Allocation (`allocating`), 4 Débat (`debating`), 5 Post-débat (`closed`). Absente en phase `draft` (jamais vue par un participant) et dans `PublicResultsScreen`/`ModeratorView` (hors périmètre). Rendu flottant façon `QuitLink` (coin opposé, en haut à droite) sur les écrans sans en-tête propre (pseudo, onboarding, attente, reconquête de code, confirmation de présence, questionnaire) ; rendu inline dans l'en-tête existant sur les écrans qui en ont un (`VoteScreen` étape vote, `AllocatingScreen`, `ParticipantView`, `ResultsMapScreen`).

  **Déjà vérifié en navigateur** (séance de test réelle "Esai 24/08", phase `draft`, inscription avec pseudo "Chantier39 Verif") : étapes pseudo → onboarding (Question 1/3) → aucune pastille affichée nulle part, conforme (phase `draft` = pas de numéro participant), zéro erreur console. **Non testé faute d'accès superadmin pour faire avancer une séance de test à travers les phases** : l'apparition réelle de la pastille elle-même (1 à 5) sur `pre_voting`/`voting`/`allocating`/`debating`/`closed`, ainsi que son intégration visuelle dans les en-têtes de `VoteScreen` (étape vote)/`AllocatingScreen`/`ParticipantView`/`ResultsMapScreen` (collision potentielle avec les boutons existants, notamment le header dense de `VoteScreen` en phase vote).

  **Test minimal** (mot de passe superadmin requis pour faire avancer une séance de test) : dérouler pre_voting → voting → allocating → debating → closed avec un même compte participant, vérifier à chaque étape le texte et le numéro corrects, l'absence de chevauchement avec les boutons de header (`Quitter`/`Outils`/`Proposer` en phase vote, `Devenir modérateur`/`Outils`/`Quitter` dans `ParticipantView`), et la disparition complète en phase `draft`. Vérifier aussi l'apparition dans `SessionQuestionnaireForm` (voir entrée dédiée ci-dessous, section "Questionnaire post-débat").

  **Validation de Jules (06/09)** : ✅ **entièrement vérifié par une session Claude Code le 2026-09-06** — `src/components/PhaseIndicator.tsx`, `src/lib/phaseLabels.ts`, `VoteScreen.tsx`, `AllocatingScreen.tsx`, `ParticipantView.tsx`, `ResultsMapScreen.tsx`, `SessionQuestionnaireForm.tsx`

- [x] **2026-09-02 — Incohérence de nommage entre `AppIntroModal` et `PhaseIndicator`** *(validé le 2026-09-06 — ⚠️ validé avant la refonte des chantiers 73/74 du 06/09, à revalider)* — `src/screens/VoteScreen.tsx` (`AppIntroModal`, fonction interne l.~1288) vs `src/components/PhaseIndicator.tsx`/`src/lib/phaseLabels.ts` (chantier 39)

  **Constat (lecture de code, pas de correction faite ici — à trancher par Jules)** : `AppIntroModal` (modale "Comment se déroule la séance ?", affichée une fois à la connexion, D5) annonce **4 étapes** — 1. Vote, 2. Répartition en groupes, 3. Débat, 4. Questionnaire — tandis que `PhaseIndicator` (pastille "Étape N · Libellé" affichée en continu, chantier 39) en annonce **5** — 1 Distanciel, 2 Vote en présentiel, 3 Allocation, 4 Débat, 5 Post-débat. Le mapping n'est pas qu'une histoire de vocabulaire : `AppIntroModal` fusionne "Distanciel" et "Vote en présentiel" en une seule étape "1. Vote", ce qui décale toute la numérotation (son "2" = allocation = le "3" de `PhaseIndicator` ; son "3" = débat = le "4" de `PhaseIndicator` ; etc.). Un participant qui a vu la modale d'intro puis regarde la pastille en cours de séance peut légitimement se demander pourquoi les numéros ne correspondent pas.

  **Ne pas corriger dans cette session** — juste le signaler. À trancher avec Jules : soit aligner `AppIntroModal` sur les 5 étapes de `PhaseIndicator` (probablement le plus cohérent, `PhaseIndicator` étant le repère affiché en continu), soit assumer que ce sont deux granularités différentes à dessein (l'intro simplifie, la pastille détaille) et le documenter comme tel.

  **Validation de Jules (06/09)** : **résolue** : le chantier 67 (point 4, voir plus haut) a aligné `AppIntroModal` sur les 5 étapes de `PhaseIndicator`, exactement l'option recommandée ici. Plus d'incohérence à trancher. — `src/screens/VoteScreen.tsx` (`AppIntroModal`, fonction interne l.~1288) vs `src/components/PhaseIndicator.tsx`/`src/lib/phaseLabels.ts` (chantier 39)

- [x] **2026-09-03 — Chantier 69 — écran postvote (revoter après le débat)** *(validé le 2026-09-06 — ⚠️ validé avant la refonte des chantiers 73/74 du 06/09, à revalider)* — nouveau `src/screens/PostVoteScreen.tsx`, branché dans `src/screens/ResultsMapScreen.tsx` (bouton "↻ Revoter")

  **Contexte / demande de Jules** : après le débat et le questionnaire, le participant arrive sur `ResultsMapScreen` (carte d'opinion) et le parcours s'arrêtait là. Le postvote lui offre trois actions, dans l'ordre demandé : 1) revoter sur ses propres assertions, 2) proposer une nouvelle assertion, 3) voter sur les assertions jamais vues — objectif : mesurer si le débat a fait bouger les opinions.

  **Point de vérification serveur fait avant d'écrire l'écran** : `cast_vote` et `submit_assertion` (`supabase/migrations/20260528_voting_app.sql`, jamais redéfinies depuis — confirmé par recherche sur tout `supabase/migrations/`) n'ont **aucun garde de phase**, seulement une vérification d'appartenance à la séance (`session_members`) et, pour `cast_vote`, que l'assertion visée est `status = 'approved'`. Voter et proposer après la clôture fonctionnait donc déjà côté serveur, sans migration à écrire pour ce chantier.

  **Modération en postvote — décision de Jules respectée** : `SubmitAssertionModal` est réutilisé tel quel (aucune branche postvote), donc une assertion proposée depuis cet écran suit exactement le même circuit que pendant le vote (`moderation_policy` de la séance : `open` → approuvée directement, `closed`/`ai` → `pending` jusqu'à validation superadmin ou Gemini). **Panneau de modération vérifié accessible en phase `closed`** : `SuperadminScreen.VOTE_PHASES` inclut `'closed'`, donc `showVotingSections` reste vrai et l'onglet "🟢 En direct" (Assertions, `LLMModerationPanel`, `AnalysisPanel`) reste rendu et son polling 10 s actif — seul `defaultTab(phase)` change (ouvre sur "📊 Analyse" par défaut plutôt que "🟢 En direct"), l'onglet lui-même n'est ni cassé ni masqué. **Aucun blocage à signaler.**

  **⚠️ Point de mesure — pas de fix appliqué, décision à prendre par Jules** : `cast_vote` fait un `INSERT ... ON CONFLICT (assertion_id, member_id) DO UPDATE SET vote = EXCLUDED.vote` — un revote **écrase** la ligne `assertion_votes` existante. La table n'a pas de colonne `updated_at`, et `created_at` n'est posé qu'à l'`INSERT` initial (jamais retouché par l'`UPDATE`). Concrètement : après un revote en postvote, **il est impossible de distinguer en base "un membre a voté agree dès le prévote, jamais changé" de "un membre a voté disagree en prévote, puis agree en postvote"** — la valeur d'avant-débat est perdue sans laisser de trace, et rien ne permet de savoir qu'un changement a eu lieu. Ce comportement n'est pas nouveau (le chantier D16 l'exploite déjà volontairement pour "changer son vote" en cours de vote), mais son effet est plus lourd en postvote : la comparaison avant/après débat que Jules veut mesurer ne peut pas être reconstituée avec le schéma actuel. Un correctif possible serait d'historiser (nouvelle ligne par vote au lieu d'un upsert, ou colonne `previous_vote`/`revoted_at`), mais ce chantier n'y touche pas — **décision produit à prendre par Jules avant d'envisager une migration**.

  **Ce qui a été fait** (aucune RPC nouvelle, aucune migration) :
  1. **Section 1 — Tes assertions** : combine `getMyAssertionIds(session.id)` (RPC chantier 51, retourne tous les ids de l'auteur quel que soit le statut) avec la liste des assertions approuvées de la séance (RLS `assertions_select_approved` ne laisse de toute façon passer que celles-là) → n'affiche donc que les assertions de l'auteur déjà approuvées. Bouton "Voter"/"Changer" ouvre la modale "Changer mon vote" (composant `AssertionCard` réutilisé, même pattern que la modale D16 de `VoteScreen.tsx`).
  2. **Section 2 — Proposer une nouvelle assertion** : bouton ouvrant `SubmitAssertionModal` (composant existant, non modifié) avec la `session` courante.
  3. **Section 3 — Assertions non vues** : même requête que `VoteScreen.loadVoteData` (assertions approuvées de la séance − celles déjà présentes dans `assertion_votes` pour ce `member_id`), présentées une par une via `AssertionCard` (`VoteProgress` au-dessus). Un abonnement Realtime léger sur `assertions` (filtre `session_id`) fait apparaître les assertions nouvellement approuvées sans recharger la page.
  4. **Entrée** : bouton "↻ Revoter" ajouté en haut de `ResultsMapScreen`, juste sous le header — bascule un état local (`showPostVote`) vers `<PostVoteScreen session={session} memberId={memberId} onBack={...} />`, sans hash/route dédiée. `onBack` revient à la carte de résultats sans perdre l'état déjà chargé de celle-ci.

  **Non-régression volontaire** : le bouton "↻ Revoter" est une simple invite, jamais un passage obligé — un participant qui reste sur `ResultsMapScreen` et clique "← Retour au menu" suit exactement le chemin de clôture existant (aucune modification de ce chemin).

  **Effet non couvert, à connaître** : revoter (section 1 ou 3) ou faire approuver une nouvelle assertion (section 2) après la clôture **ne recalcule rien automatiquement** — le scatter PCA / repness affiché sur `ResultsMapScreen` reste l'instantané de la dernière analyse lancée par le superadmin (`AnalysisPanel`, action manuelle). Un participant qui revote puis retourne "← Retour aux résultats" ne verra donc pas sa nouvelle position immédiatement ; c'est le comportement déjà existant pour tout changement de vote (pas spécifique au postvote), mais son importance augmente ici puisque le postvote est vendu comme le moment de mesurer le changement.

  **Non testé — session headless, aucun serveur de dev lancé (consigne explicite)** : rendu réel dans le navigateur, y compris le bouton "↻ Revoter" sur `ResultsMapScreen`, les trois sections de `PostVoteScreen`, la modale "Changer mon vote", la modale de proposition, et l'apparition Realtime d'une assertion nouvellement approuvée pendant que l'écran est ouvert. **Déjà vérifié** : `npx tsc --noEmit`, `npm test` (94 passés, 1 skip — le seul échec observé lors d'un run précédent, `bench/strategy-sanity.test.ts` sur le seuil 5000 ms, est un test de performance dépendant de la charge machine, non lié à ce chantier, et repasse au vert sur un run propre) et `npm run build` propres après rebase sur `main` (670c981).

  **Test minimal** (mot de passe superadmin utile pour vérifier la section modération, sinon compte participant suffisant) :
  1. Séance `closed` avec un membre inscrit ayant déjà répondu au questionnaire post-débat → `#session/<join_code>` → `ResultsMapScreen` s'affiche normalement → vérifier la présence du bandeau "↻ Revoter" juste sous le header, avant le chargement de la carte d'opinion.
  2. Cliquer "↻ Revoter" → `PostVoteScreen` s'affiche. Section 1 : si ce membre a une assertion approuvée à son nom, vérifier l'icône de vote actuel (✅/❌/⏭) et que "Changer" ouvre la modale avec le bon vote pré-sélectionné ; voter → vérifier la mise à jour immédiate de l'icône dans la liste.
  3. Section 2 : proposer une assertion → si `moderation_policy = 'closed'` ou `'ai'`, vérifier le message "en attente de validation" ; côté superadmin (même séance, onglet "🟢 En direct" malgré la phase `closed`), vérifier que l'assertion apparaît bien `pending` dans `AssertionsPanel` et peut être approuvée/rejetée normalement.
  4. Une fois approuvée côté superadmin, revenir sur `PostVoteScreen` (sans recharger la page si possible, pour tester le canal Realtime) → vérifier qu'elle apparaît dans la section 3 "Assertions non vues" et peut être votée.
  5. Cliquer "← Retour aux résultats" → vérifier le retour sur `ResultsMapScreen` sans rechargement complet (état déjà chargé conservé).
  6. **Non-régression** : un membre qui n'ouvre jamais "↻ Revoter" et clique directement "← Retour au menu" depuis `ResultsMapScreen` doit suivre le comportement inchangé (retour à l'accueil, hash vidé).
  7. **Cas limite** : membre sans aucune assertion approuvée à son nom → section 1 affiche "Aucune de tes assertions n'a été approuvée dans cette séance." sans erreur. Membre ayant déjà voté sur toutes les assertions approuvées → section 3 affiche "Tu as déjà voté sur toutes les assertions disponibles." sans erreur.

  **Validation de Jules (06/09)** : ✅ **vérifié en conditions réelles par une session Claude Code le 2026-09-06** — nouveau `src/screens/PostVoteScreen.tsx`, branché dans `src/screens/ResultsMapScreen.tsx` (bouton "↻ Revoter")

- [x] **2026-09-01 — Chantier 39 — déclenchement de `SessionQuestionnaireForm` déplacé de la phase `questionnaire` (supprimée) vers `closed`** *(validé le 2026-09-06 — ⚠️ validé avant la refonte des chantiers 73/74 du 06/09, à revalider)* — `VoteScreen.tsx`, `AllocatingScreen.tsx`, `SessionRouterScreen.tsx`, `lib/voting.ts` (`hasQuestionnaireResponse`) *(migration SQL requise, voir "Migration SQL en attente" — mais sans effet sur ce comportement frontend tant qu'aucune séance réelle n'est restée bloquée en phase `questionnaire`)*

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

  **Validation de Jules (06/09)** : ✅ **vérifié en conditions réelles par une session Claude Code le 2026-09-06** — `VoteScreen.tsx`, `AllocatingScreen.tsx`, `SessionRouterScreen.tsx`, `lib/voting.ts` (`hasQuestionnaireResponse`)

- [x] **2026-09-02 — Chantier 63 — questionnaire masqué par l'overlay de clôture + 2 des 3 portes en cul-de-sac (aucune vérification navigateur cette session)** *(validé le 2026-09-06 — ⚠️ validé avant la refonte des chantiers 73/74 du 06/09, à revalider)* — `ParticipantView.tsx`, `VoteScreen.tsx`, `AllocatingScreen.tsx`, `lib/voting.ts` (`hasQuestionnaireResponse`)

  **Contexte** : le point 4 ci-dessus (chantier 39) n'avait jamais été vérifié en navigateur faute de mot de passe superadmin. En lisant le code, deux bugs confirmés : l'overlay "La séance est terminée" de `ParticipantView` (z-50) s'affichait **devant** le questionnaire forcé (z-50 aussi, mais rendu avant dans le JSX) au lieu de derrière ; et sur `VoteScreen`/`AllocatingScreen`, valider le questionnaire ne menait jamais aux résultats (message générique figé, ou bannière grise sur l'écran d'annonce de table). Corrigés — voir `PROJECT_STATUS.md` pour le détail technique. *(Note ajoutée au chantier 78, 2026-09-07 : `PROJECT_STATUS.md` a été supprimé depuis ; ce détail technique se trouve désormais en **annexe A de [`docs/chantiers.md`](./docs/chantiers.md)**, où son contenu a été déplacé tel quel. L'entrée ci-dessus n'a pas été modifiée — fichier append-only.)* **Rien de ceci n'a été exercé en navigateur réel cette session** (consigne explicite : pas de serveur dev, une autre session travaillait en parallèle sur `main`).

  **Recette — écran `ParticipantView`, overlay vs questionnaire** :
  1. Table rattachée à une séance, participant connecté dedans (`ParticipantView`, pas `ModeratorView`). Superadmin fait passer la séance de `debating` à `closed`.
  2. Observer chez le participant : le questionnaire post-débat doit apparaître **au premier plan**, utilisable (notes cliquables, bouton Envoyer actif). L'overlay "La séance est terminée" ne doit **pas** être visible tant que le questionnaire est ouvert.
  3. Répondre et envoyer → le questionnaire se ferme (message de succès puis fermeture auto ~2s) → l'overlay "La séance est terminée" apparaît alors, avec le bouton "Voir vos résultats →".
  4. Cliquer "Voir vos résultats →" → doit atterrir sur `ResultsMapScreen` (carte de son propre camp), pas sur un écran de chargement bloqué.

  **Recette — les trois portes d'entrée, vers les résultats après soumission** : pour chacune des trois portes ci-dessous, avec un membre inscrit à une séance déjà `closed` et n'ayant pas encore répondu au questionnaire, vérifier que valider le formulaire amène bien à `ResultsMapScreen` (carte de camp + scatter), sans écran intermédiaire bloqué ni rechargement complet visible :
  1. `#vote/<join_code>` (`VoteScreen`, step `questionnaire`) — cas le plus simple : membre inscrit, ouvre le lien de vote après clôture.
  2. Membre resté sur `AllocatingScreen` (n'a pas encore rejoint sa table de débat) au moment où la séance passe à `closed`, détecté soit par Realtime soit par le polling 10s de secours — vérifier les deux déclencheurs si possible (couper le réseau un instant pour forcer le polling, ou simplement attendre >10s après la transition sans réagir au Realtime).
  3. `#session/<join_code>` (`SessionRouterScreen`) — déjà fonctionnel avant ce chantier, à revérifier en même temps par cohérence (les trois doivent se comporter identiquement).

  **Recette — double réponse, `hasQuestionnaireResponse` avec `.limit(1)`** : nécessite un membre ayant rempli le questionnaire forcé sur deux tables différentes de la même séance (deux lignes `questionnaire_responses`, une par `table_id`, même `session_id`/`user_id` — la table `6ABDC9`/pseudo "TestQ45" en section "Nettoyage des données de test" plus bas peut servir de point de départ si une deuxième réponse y est ajoutée sur une autre table de la même séance). Revenir sur `#vote/<join_code>` ou `#session/<join_code>` après clôture : le questionnaire ne doit **pas** être reproposé — accès direct aux résultats. Avant le fix, `.maybeSingle()` levait une erreur avalée sur ce cas précis et le redemandait indéfiniment.

  **Validation de Jules (06/09)** : ✅ **entièrement vérifié en conditions réelles par une session Claude Code le 2026-09-06** — `ParticipantView.tsx`, `VoteScreen.tsx`, `AllocatingScreen.tsx`, `lib/voting.ts` (`hasQuestionnaireResponse`)

- [x] **2026-09-01 — Chantier 41 — nomination d'un modérateur déjà assis, invisible sans quitter/rejoindre** *(validé le 2026-09-06)* — `src/context/TableContext.tsx`, branche `chantier-41-reload-moderateur`

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

  **Validation de Jules (06/09)** : ✅ **scénario exact de Jules vérifié par une session Claude Code le 2026-09-06** — `src/context/TableContext.tsx`, branche `chantier-41-reload-moderateur`

- [x] **Chantier 46 — `supabase/migrations/20260901_chantier46_public_results_visibility.sql`** *(validé le 2026-09-06)*

  **Contenu du fichier** :
  1. `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS results_public boolean NOT NULL DEFAULT false` — opt-in explicite par séance, aucune séance existante ne devient publique automatiquement.
  2. `set_session_results_public(password, session_id, results_public)` — RPC superadmin (mot de passe requis) qui bascule la colonne. Utilisée par le nouveau bouton "Résultats publics" / "Résultats privés" sur chaque séance close du superadmin (`SessionCard`, écran de liste).
  3. `get_public_results(session_id)` **remplacé** — durci pour exiger `phase='closed' AND results_public=true` (avant : `phase='closed'` seul, donc *toute* séance close était déjà publique — comportement qui n'avait jamais été demandé). Charge utile changée : au lieu d'un résumé filtré (top-3 assertions par camp + consensus > seuil), retourne désormais la liste complète des assertions approuvées avec leurs compteurs `agree_count`/`disagree_count`/`pass_count`, et le nuage de points PCA (`pca_x`, `pca_y`, `group_id` — **sans** `member_id` ni aucun identifiant, contrairement à `get_results_map` qui est réservée aux membres inscrits). Le fichier de migration contient en pied de page les requêtes SQL de vérification (colonne, séance non-publique → NULL, séance publique → payload sans identifiant, appel anonyme, mauvais mot de passe).

  **Pourquoi cette migration change le comportement de l'existant** : la fonction `get_public_results` existait déjà (chantier antérieur, migration `20260613_public_results.sql`) et rendait **toute** séance close consultable publiquement dès sa clôture — sans bascule de visibilité. Le retour de test de Jules du 2026-09-01 demande explicitement à restreindre l'accès aux séances *explicitement marquées visibles*, pas à tout l'historique clos. Tant que cette migration n'est pas appliquée, l'ancien comportement (tout closed = public) reste actif en base, et l'ancienne forme de payload (`groups`/`consensus`) ne correspond plus à ce qu'attend le frontend (`points`/`assertions`) — voir le point "Résultats publics" ci-dessous pour l'impact exact sur les tests.

  **À faire (session de vérification)** : appliquer le fichier, dérouler les 5 requêtes de vérification en pied de fichier (colonne + défaut, séance non-publique → NULL, séance publique → payload strictement `k_chosen`/`points`/`assertions` sans `member_id`/`user_id`/`pseudo`, appel anonyme fonctionnel, mauvais mot de passe rejeté), puis dérouler le test manuel de la section "Résultats publics (chantier 46)" plus bas.

  **Validation de Jules (06/09)** : résultats publics opt-in par séance (`results_public`, `set_session_results_public`, `get_public_results` durci sans identifiant). Vérifié en base et navigateur (visiteur anonyme, séance `🧪 TEST46`) par une session Claude Code le 2026-09-06 : `NULL` si non-publique, payload sans identifiant si publique. **Confirmé par Jules** : bouton "Résultats publics"/"Résultats privés" du superadmin testé directement, fonctionne.

- [x] **2026-09-04 — Chantier 71 — `supabase/migrations/20260904_chantier71_onboarding_optionnel.sql`** *(validé le 2026-09-06 — ⚠️ validé avant la refonte des chantiers 73/74 du 06/09, à revalider)* (jamais appliquée) — désactiver l'onboarding par séance

  **Demande de Jules** : « Le vote ne doit pas servir de référence. […] mettre un bouton dans la vue superadmin pour activer ou désactiver le onboarding […] je dois juste pouvoir créer une session sans onboarding. » Bloquant pour la séance de production de jeudi prochain (vote en présentiel uniquement, onboarding désactivé, on ne va pas plus loin dans le flux).

  **Contenu de la migration** : colonne `sessions.onboarding_enabled boolean NOT NULL DEFAULT true` (défaut préserve le comportement de toutes les séances existantes) ; nouvelle RPC `set_session_onboarding_enabled(password, session_id, onboarding_enabled)` (même forme que `set_session_results_public` du chantier 46) ; `create_session` redéfinie avec un 8ᵉ paramètre `p_onboarding_enabled boolean DEFAULT true` (tout appel existant qui l'omet continue de créer une séance identique à avant ce chantier). Aucune autre fonction touchée — voir justification détaillée en tête du fichier de migration pour les 3 pièges signalés par Jules :
  1. `get_session_by_id`/`get_session_by_join_code`/`list_sessions_admin` (chantier 58, déjà appliquées en base) sont `RETURNS sessions`/`SETOF sessions` avec `SELECT * FROM sessions` en interne — le type de retour est le type ligne de la table, étendu automatiquement par Postgres à `onboarding_enabled` sans redéfinition. Vérifié en lisant leur corps (branche `chantier-58-colonnes-sessions`) avant d'écrire cette migration.
  2. La même branche contient un `REVOKE SELECT ON sessions` + `GRANT` restreint à 6 colonnes, **non appliqué à ce jour** (vérifié : aucun écran de `src/` n'appelle encore les RPC du chantier 58, tous lisent encore `sessions` par `select('*')` direct sous le GRANT actuel non restreint) — donc sans impact sur ce chantier aujourd'hui. **Si cette restriction est appliquée un jour telle quelle, il faudra ajouter `onboarding_enabled` à la liste de colonnes accordées** dans le fichier de cette branche (non modifiée ici, sur consigne explicite).
  3. `get_allocation_inputs` (chantier 19, `20260725_2_allocation_v2.sql`) fait déjà un `LEFT JOIN entry_responses` avec des valeurs par défaut conservatrices (`is_active`/`consents`/`is_veteran` → `false`) pour un membre sans ligne `entry_responses` — un participant qui a sauté l'onboarding est donc déjà géré sans plantage de l'allocation/clustering. Rien changé côté SQL ni côté `src/lib/allocation.ts` (non touché, hors périmètre).

  **Côté frontend** : `src/lib/types.ts` (`Session.onboarding_enabled`), `src/lib/sessions.ts` (`createSession` accepte un 8ᵉ argument optionnel, nouvelle fonction `setSessionOnboardingEnabled`), `src/screens/SuperadminScreen.tsx` (case à cocher dans le formulaire de création + interrupteur sur chaque carte de séance, toggle optimiste avec rollback sur erreur — même schéma que le toggle « Résultats publics » du chantier 46), `src/screens/VoteScreen.tsx` (3 points de décision modifiés : le gate principal `!existingResponse` à l'ouverture/reload, `handlePseudoSuccess` pour un nouveau membre en phase `voting`, `handleConfirmAttendanceSuccess` pour une confirmation de présence — les trois sautent l'onboarding et vont directement au vote quand `onboarding_enabled = false`, exactement comme le fait déjà `pre_voting` en permanence). `pre_voting` non touché (déjà sans onboarding, indépendamment de ce flag).

  **`npx tsc --noEmit`** : propre. **`npm test`** : 94/95, 1 skip préexistant (aucun test dédié écrit pour ce chantier — logique de branchement simple, testée par lecture + build, pas de nouvelle fonction pure isolée à unit-tester). **`npm run build`** : propre (avertissement pré-existant sur la taille du bundle, sans rapport). **Aucune vérification navigateur faite** (consigne explicite : session headless, aucun serveur de dev lancé).

  **Recette de vérification (session de vérification dédiée)** :
  1. Appliquer la migration (SQL Editor du dashboard ou MCP), puis dérouler les 6 requêtes de vérification en pied de fichier de migration (colonne posée avec le bon défaut, création avec/sans le flag, toggle sur une séance existante, mauvais mot de passe refusé, RPC du chantier 58 si déjà appliquées séparément).
  2. Superadmin → « Nouvelle séance » : la case « Onboarding » est cochée par défaut ; la décocher puis créer la séance → vérifier en base que `onboarding_enabled = false` sur la ligne créée.
  3. Sur une séance déjà existante (n'importe quelle phase) : cliquer l'interrupteur « Onboarding activé »/« Onboarding désactivé » sur sa carte → vérifier le changement d'état visuel immédiat (optimiste) et sa persistance après rechargement de la liste.
  4. **Scénario cible jeudi** — séance en phase `voting`, `onboarding_enabled = false` : un nouveau participant qui s'inscrit via `VotingEntryForm` (nom/prénom) doit arriver directement sur l'écran de vote, sans jamais voir `OnboardingForm`. Un participant déjà inscrit en `pre_voting` qui confirme sa présence (`AttendanceConfirmScreen`) doit lui aussi passer directement au vote. Recharger la page en cours de vote (re-déclenche le gate principal `init()`) : toujours pas d'onboarding proposé.
  5. **Non-régression** — même séance avec `onboarding_enabled = true` (valeur par défaut) : comportement strictement identique à avant ce chantier (onboarding proposé aux nouveaux arrivants en phase `voting`, jamais en `pre_voting`).
  6. **Non-régression allocation** (si le temps le permet avant jeudi, pas bloquant pour la séance vote-only) : séance avec au moins un membre sans `entry_responses` (onboarding sauté) qui atteint la phase `allocating` → `AllocationPanel` doit calculer une proposition sans planter, ce membre traité comme non-actif/non-consentant/nouveau.

  **Validation de Jules (06/09)** : désactiver l'onboarding par séance

- [ ] **2026-09-06 — Chantier 59 — `supabase/migrations/20260906_chantier59_realtime_canaux_prives.sql`** (appliquée le 2026-09-07) — canaux Realtime privés, F6 à la racine

  **⛔ NE RIEN APPLIQUER NI DÉPLOYER AVANT LA SÉANCE DU JEUDI 10 SEPTEMBRE.** — avertissement d'origine, **explicitement levé par Jules le 2026-09-07** : il a demandé de dérouler ce chantier ce jour-là plutôt que d'attendre la fin de la séance de vote. Voir ci-dessous ce qui a réellement été fait.

  **Mise à jour du 2026-09-07 (session Claude Code)** :
  - Migration cherry-pickée depuis la branche `chantier-59-realtime-prive` (les deux commits `a3a509c`/`78bc938`) sur `main` à jour (le merge direct de la branche entière aurait régressé tout le ménage documentaire des chantiers 73-89, la branche datant d'avant). Un seul conflit réel : l'import de `VoteScreen.tsx` (fusionné à la main, le reste s'est auto-mergé proprement).
  - **Corps de `is_table_participant` comparé à `pg_get_functiondef` en base avant application** : identique à celui recopié dans la migration, seul le `SET search_path` est nouveau. `can_join_realtime_topic` et les deux policies n'existaient pas encore. Migration appliquée telle quelle via MCP (`apply_migration`).
  - **Vérifications post-application** : les 2 policies existent (`ecclesia_realtime_read`/SELECT, `ecclesia_realtime_write`/INSERT) ; `can_join_realtime_topic` répond `false` sur les 4 cas de fail-closed du fichier (uuid bidon, topic malformé, table sans uuid valide, `NULL`) sans jamais lever.
  - `npx tsc --noEmit`, `npm test` (98 passés / 1 skip préexistant — 4 tests de plus qu'au moment d'écriture du chantier, ajoutés entre-temps par d'autres chantiers), `npm run build` : tous propres.
  - **Frontend mergé sur `main` et déployé** (commit `c2d06c7`, tag de rollback `pre-merge-chantier59-20260907` posé avant le merge).
  - **Recette navigateur partielle** (étape 3 de l'ordre — avant désactivation du réglage dashboard) : table de test créée directement en base (`T59TEST`, `leaderless=true`, supprimée après coup), rejointe depuis deux onglets du même navigateur (donc deux connexions WebSocket distinctes sur le canal `table:<id>`, même s'ils partagent le même `auth.uid()` via le `localStorage` de la session anonyme — **limite connue de ce test**, pas un vrai deuxième participant). **Résultat** : jointure réussie, aucune `CHANNEL_ERROR` ni erreur console sur les deux onglets — les canaux privés autorisent bien le participant légitime. **Non testé** : la propagation effective d'un broadcast (le clic sur "Demander la parole" n'a pas déclenché de changement observable dans cette session — à investiguer séparément, ce n'est probablement qu'un souci d'interaction UI dans le test, pas une régression du chantier, puisque aucune requête réseau ni erreur n'a été émise). Les scénarios C à I (vote, allocation, post-vote, collab, bascule modération, non-régression superadmin, Messenger/JWT) n'ont **pas** été déroulés — session sans mot de passe superadmin et sans deuxième identité `auth.uid()` distincte disponible.
  - **⛔ Ce qui reste bloquant, non fait par cette session** : désactiver « Allow public access » dans le dashboard Supabase (Project Settings → Realtime → Settings). C'est un réglage web, hors SQL/MCP — cette session n'a pas de session dashboard authentifiée. **Ne pas le faire avant d'avoir rejoué la recette complète A→H avec deux vraies identités distinctes** (deux navigateurs/profils différents, pas deux onglets du même profil). Une fois fait, rejouer le scénario B (`c.subscribe()` sans `private:true` doit échouer) et le scénario I (JWT anonyme sur séance longue).

  ### État établi en base avant d'écrire quoi que ce soit (MCP lecture, 2026-09-06)

  Le périmètre annoncé dans le plan sécurité (« `private: true` sur tous les canaux ») repose sur une prémisse que la base **contredit en partie**. Mesuré, pas supposé :

  1. **Les 10 tables de la publication `supabase_realtime` ont toutes RLS activée**, et la doc Supabase (« Interaction with Postgres Changes ») est explicite : les lignes ne sont livrées qu'aux clients autorisés par les policies, et *« private and public channels can subscribe to Postgres Changes »*. Donc **`private: true` ne change rien au `postgres_changes`** — ni en protection, ni en régression. Policies SELECT effectives : `tables`/`participants`/`queue_entries`/`speaking_turns` → `is_table_participant` ✅ ; `session_members` → `user_id = auth.uid()` ✅ ; `table_assignments` → `is_own_session_member` ✅ ; `assertion_votes` → ses propres votes ✅ ; **`assertions` → `status='approved'`**, **`sessions` → `true`**, **`session_sources` → `true`** ⚠️. Le chantier 50 avait donc déjà fait l'essentiel du travail.
  2. **`realtime.messages` : RLS activée, ZÉRO policy**, et les `GRANT SELECT/INSERT/UPDATE` sont déjà en place pour `anon` et `authenticated`. Infrastructure d'autorisation présente et **inerte** — état « disponible, non activé ».
  3. `realtime.topic()`, `realtime.send()`, `realtime.broadcast_changes()` existent (support complet).

  **Conclusion : le trou réel est le BROADCAST, et lui seul.** Un seul canal de toute l'app en émet — `table:<table_id>` (`TableContext`, événement `refresh`) — et le broadcast n'est soumis à **aucune** RLS sur un canal public. N'importe qui connaissant un `table_id` peut s'y abonner (métadonnée : rythme de la séance) et surtout **émettre** des `refresh`, déclenchant un refetch REST chez tous les clients de la table. C'est exactement F6. Le payload lui-même ne fuit rien (`{tables:[...]}`, une liste de noms de tables à refetcher). Le chantier 53 a plafonné la réception ; la porte d'émission est restée ouverte.

  Les trois policies ⚠️ (`sessions`, `assertions`, `session_sources`) sont des **décisions produit assumées ailleurs** (la liste des séances en cours avec leur `join_code` est le parcours d'entrée voulu, §1.4 du plan ; assertions approuvées et sources = matériau public du débat). `private: true` ne les fermerait pas — seul un resserrement de leurs policies le ferait, périmètre du **chantier 58**. Non touchées ici.

  ### ⚠️⚠️ Le point le plus important : une action humaine hors SQL conditionne tout

  La doc Supabase : *« To enforce private channels you need to disable the "Allow public access" setting in Realtime Settings. »* C'est un réglage **projet** (dashboard → Realtime → Settings), inaccessible depuis une migration.

  **Tant qu'il est activé, ce chantier ne ferme PAS F6** : un attaquant rejoint le même topic `table:<id>` en mode **public** et y émet quand même — le nom du topic est identique, `private` n'est qu'une assertion par connexion. Les policies et le `private: true` sont **nécessaires mais pas suffisants**.

  Et ce réglage est **global** : une fois désactivé, tout canal resté public est refusé partout, immédiatement.

  **ORDRE D'APPLICATION — NON NÉGOCIABLE.** L'inverser casse la production d'un coup (tous les canaux déployés aujourd'hui sont publics) :
  1. Appliquer la migration → **aucun effet observable**, c'est normal et voulu (les policies ne sont consultées que par les canaux privés, et aucun ne l'est encore).
  2. Déployer le frontend de cette branche (`private: true` partout).
  3. Dérouler les scénarios A→H ci-dessous. **C'est l'étape où une policy trop stricte se voit.**
  4. **Seulement ensuite**, désactiver « Allow public access ».
  5. Re-dérouler A→H + le scénario I. C'est à cette étape, et pas avant, que F6 est fermé.

  **Rollback d'urgence si le temps réel casse en séance** : réactiver « Allow public access » dans le dashboard. Effet immédiat, sans redéploiement ni migration — les canaux privés continuent de fonctionner et les publics redeviennent acceptés. **Levier à connaître avant d'y toucher.**

  ### Contenu de la migration

  - **§1** `is_table_participant` — ajout du `SET search_path = public, extensions`, qu'elle n'avait pas (sa jumelle `is_own_session_member` l'a depuis le chantier 50). Corps recopié depuis `pg_get_functiondef` **en base**, pas depuis un ancien fichier. Signature et type de retour inchangés → `CREATE OR REPLACE` suffit. Elle devient la clé de voûte de l'autorisation Realtime en plus des 4 policies de table qu'elle porte déjà.
  - **§2** `can_join_realtime_topic(topic)` — carte unique des 8 topics, **fail-closed** (tout topic inconnu → `false`), robuste aux topics malformés (une exception dans une policy remonte au client comme un échec de connexion opaque). Table de correspondance : `table:` et `session-member-status:` → participant de la table ; `allocating:`, `vote:`, `vote-wait:` → membre de la séance ; `session-member:` et `postvote:<session>:<member>` → ce membre est le mien ; `collab:` → tout authentifié.
  - **§3** deux policies sur `realtime.messages` : **lecture** au niveau du topic (volontairement *sans* filtre sur `extension` — nos topics sont majoritairement `postgres_changes` seuls, un filtre trop fin risquerait de leur refuser le `join` pour un gain nul, et le risque est asymétrique) ; **émission** restreinte à `extension = 'broadcast'` — c'est le vecteur réel de F6. Aucune policy pour `anon` : tous les écrans appellent `signInAnonymously()` avant d'ouvrir un canal.

  ### Hypothèses tranchées seul (session de nuit, Jules dort) — à confirmer

  1. **`collab:<session_id>` ouvert à tout authentifié.** `session_sources` a une policy SELECT `USING (true)` : le contenu qui transite y est déjà lisible par n'importe qui en REST. Une règle plus stricte sur le canal donnerait l'illusion d'une protection sans en apporter. Si Jules veut fermer les sources collaboratives, c'est la policy de `session_sources` qu'il faut resserrer d'abord — ce canal suivra tout seul, sans retoucher la migration.
  2. **Lecture non filtrée sur `extension`** (voir §3 ci-dessus) : arbitrage prudence/rigueur, assumé au profit de la prudence parce que je ne peux pas mesurer l'effet sans navigateur.
  3. **Suppression des deux canaux superadmin** (voir juste en dessous) plutôt que création d'une table `superadmin_sessions`. Le besoin n'existe pas aujourd'hui.

  ### Changements frontend

  - **`src/lib/realtime.ts` (nouveau)** — helper `privateChannel(name)`. Un seul endroit porte `{ config: { private: true } }` : point unique de rollback, et garantie qu'aucun canal n'est oublié en public. Il **enveloppe `subscribe()`** pour journaliser un `CHANNEL_ERROR`/`TIMED_OUT` en `console.error` : **6 des 8 canaux appelaient `.subscribe()` sans aucun callback**, un refus de `join` aurait donc été totalement muet et l'écran serait resté figé sans erreur — précisément le mode de régression identifié comme risque n°1 de ce chantier dans le plan sécurité. Le callback d'origine est relayé intact (`TableContext` s'en sert pour sa resynchronisation après coupure). Volontairement `console.error` et rien d'autre : aucune UI d'erreur, aucun retrait de canal, aucune reconnexion « intelligente » — les 4 couches de rattrapage restent seules maîtres du comportement.
  - **8 canaux basculés** en privé : `TableContext` (`table:`, `session-member-status:`), `AllocatingScreen` (`allocating:`), `CollabDocScreen` (`collab:`), `PostVoteScreen` (`postvote:`), `VoteScreen` (`session-member:`, `vote-wait:`, `vote:`).
  - **2 canaux superadmin SUPPRIMÉS**, parce qu'ils étaient **déjà morts avant ce chantier** :
    - `table_assignments:<session_id>` — CLAUDE.md le documente déjà comme « conservé mais dormant » depuis le chantier 50 (policy self-only, le superadmin n'est membre d'aucune séance, Realtime applique la RLS avant livraison). Le polling 10 s de `loadGroups` est ce qui fait vivre la vue Groupes depuis.
    - `session-tables:<session_id>` — **même situation, jamais relevée jusqu'ici** : la policy SELECT de `tables` est `is_table_participant(id)`, et le superadmin n'a **aucune ligne `participants`** (les tables créées par `apply_allocation`/`create_tables_batch` lui donnent `created_by`, pas un siège — et `is_table_participant` regarde `participants`, pas `created_by`). Il ne recevait donc rien non plus. Le `setInterval(load, 15000)` posé juste au-dessus dans le même fichier tenait déjà cette vue à jour.
    - **Aucune perte fonctionnelle**, et ça dissout le seul cas d'autorisation réellement insoluble : le superadmin s'authentifie par un mot de passe bcrypt **jamais transmis à Realtime**, et son `auth.uid()` est un uid anonyme ordinaire, **indiscernable de celui d'un attaquant**. Aucune policy ne peut le reconnaître. Si un besoin de temps réel superadmin apparaît un jour, il faudra d'abord matérialiser sa session en base (table `superadmin_sessions(user_id, expires_at)` remplie par une RPC SECURITY DEFINER à la saisie du mot de passe) — chantier à part entière, sans urgence tant que les pollings tiennent.
  - **Les 4 couches de rattrapage de latence sont intactes** — aucune touchée : mise à jour locale après RPC, broadcast, polling 5 s (`TableContext`), surveillance WebSocket. Idem pour les pollings 10 s de `VoteScreen`/`AllocatingScreen` et les 5 `setInterval` du superadmin. C'est ce qui permet aux navigateurs in-app (Messenger) de fonctionner WebSocket coupé, et rien ici ne le dégrade.

  ### ⚠️ Piège légué à la prochaine session

  `can_join_realtime_topic` est **fail-closed**. **Ajouter un `.channel()` dans `src/` sans ajouter la branche correspondante dans cette fonction SQL** produira un canal qui ne se connecte jamais, une fois « Allow public access » désactivé. Signalé aussi en tête de `src/lib/realtime.ts`. Le `console.error` du helper est le garde-fou qui rend l'oubli visible.

  ### Déjà vérifié — et rien de plus

  `npx tsc --noEmit` : propre. `npm test` : 94 passés / 1 skip préexistant (aucun test ajouté : la logique est en SQL et en configuration de canal, rien d'unit-testable sans base ni navigateur). `npm run build` : propre (avertissement de taille de bundle préexistant). **Aucune migration appliquée, aucune vérification navigateur, aucun serveur de dev lancé** (consignes de la session). Le réglage « Allow public access » n'a **pas** été touché — je n'y ai pas accès et il ne doit pas l'être avant l'étape 4 ci-dessus.

  ---

  ### Recette de vérification

  **Étape SQL (après application, avant tout déploiement)** — dérouler les requêtes 1 à 4 du pied du fichier de migration. La n° 2 est jouable telle quelle et vérifie le fail-closed (`auth.uid()` vaut NULL dans le SQL Editor → tout doit répondre `false`, **sans jamais lever**). La n° 3 usurpe une identité réelle via `SET LOCAL request.jwt.claims` et prouve qu'un participant obtient bien `true` sur SA table et `false` sur une autre.

  **Étapes navigateur — à faire DEUX FOIS : une fois « Allow public access » encore activé (étape 3 de l'ordre), une fois après l'avoir désactivé (étape 5).** Garder la console ouverte en permanence : tout `[realtime] canal privé "…" — CHANNEL_ERROR` est un échec, même si l'écran a l'air normal (les pollings masquent).

  **A. Débat, cœur du chantier** (table animée, 2 navigateurs) : modérateur donne la parole → l'écran participant doit refléter le changement **en moins d'une seconde** (c'est le broadcast, pas le polling 5 s). Demander la parole, réordonner la file en glisser-déposer, terminer un tour : chaque action doit se propager instantanément dans l'autre navigateur. Si tout arrive avec ~5 s de retard, **le broadcast est cassé** — le polling compense et rend la panne quasi invisible, d'où l'importance de chronométrer.

  **B. Le test qui prouve que F6 est fermé** (à faire à l'étape 5 uniquement) : depuis un 3ᵉ navigateur **non participant**, en console sur le site :
  ```js
  const c = supabase.channel('table:<TABLE_ID>', { config: { private: true } })
  c.on('broadcast', { event: 'refresh' }, p => console.log('REÇU', p))
   .subscribe(s => console.log('statut', s))
  ```
  → attendu : `CHANNEL_ERROR`, aucun message reçu. Puis retenter **sans** `{ config: { private: true } }` (canal public) : attendu `CHANNEL_ERROR` également une fois « Allow public access » désactivé — **c'est ce second essai qui valide le réglage dashboard**, le premier ne valide que les policies. Enfin, tenter `c.send({ type:'broadcast', event:'refresh', payload:{ tables:['tables'] } })` : ne doit produire aucun refetch chez les participants légitimes.

  **C. Vote** (`#vote/<join_code>`) : proposer une assertion depuis un 2ᵉ navigateur → elle doit apparaître chez les autres votants sans rechargement (canal `vote:`). Changer la phase depuis le superadmin → l'écran participant doit suivre (canal `vote-wait:`). Poser/retirer `is_moderator` sur un membre depuis le superadmin pendant qu'il est sur l'écran de vote → son état doit changer (canal `session-member:`).

  **D. Allocation** : passer en `allocating` et appliquer une allocation → chaque participant doit voir son groupe apparaître sans recharger (canal `allocating:`).

  **E. Post-vote** (`PostVoteScreen`) : approuver une assertion depuis le superadmin → elle doit apparaître chez le membre (canal `postvote:`).

  **F. Document collaboratif** (`#collab/<join_code>`) : ajouter une source depuis un 2ᵉ navigateur → apparition immédiate chez le premier (canal `collab:`).

  **G. Bascule de modération en cours de débat** : sur une table `leaderless`, un participant clique « Devenir modérateur » → sa vue et celle des autres doivent basculer (canal `session-member-status:`, et `table:` pour l'UPDATE de `tables`).

  **H. Non-régression superadmin — la plus importante des suppressions.** Onglet Tables en phase `allocating`/`debating` : déplacer un membre d'un groupe à l'autre depuis un 2ᵉ onglet superadmin → le premier doit se mettre à jour **en ≤ 10 s** (polling `loadGroups`). Rattacher/détacher une table → la liste doit se mettre à jour **en ≤ 15 s** (polling `load`). C'est plus lent qu'un temps réel, mais c'était **déjà** le comportement réel avant ce chantier : les deux canaux supprimés ne livraient rien. **Si une de ces deux vues ne se met plus du tout à jour, c'est une vraie régression** — le signaler.

  **I. Messenger / navigateur in-app** (à l'étape 5, après désactivation du réglage) : ouvrir un lien de séance depuis Messenger, dérouler vote → allocation → débat. Le WebSocket y est souvent coupé : l'app doit rester utilisable via les pollings seuls. **Point d'attention spécifique aux canaux privés** : ils exigent un JWT valide, et la doc précise que *« if a new JWT is never received on the Channel, the client will be disconnected when the JWT expires »*. Sur une séance longue (>1 h), vérifier qu'un client resté ouvert continue de recevoir après expiration/refresh du JWT anonyme. **C'est le risque de régression le plus difficile à voir et le seul qui soit propre aux canaux privés** — si un écran se fige après une heure sans que le polling le rattrape, c'est là qu'il faut chercher.


## Validé

- [x] **Refus d'une URL à schéma non autorisé (contrôle client)** *(validé le 2026-09-06)* — `#collab/<join_code>`, formulaire d'ajout — ✅ vérifié le 2026-09-06 par Jules : `javascript:alert(1)` → message rouge, formulaire resté ouvert, aucune requête réseau émise.

  ⚠️ **Validation partielle — le volet serveur reste ouvert.** L'entrée d'origine couvrait deux contrôles ; Jules n'a validé que le premier. Le second n'a jamais été joué et reste à faire : vérifier qu'un appel RPC direct hors formulaire (requête REST manuelle vers `add_collab_source` / `update_collab_source` avec la clé anon) est lui aussi refusé **côté serveur** — c'est la ligne de défense qui compte réellement, le contrôle client n'étant qu'un confort. Le chantier 72 a supprimé depuis la surcharge à 4 arguments d'`add_collab_source` qui contournait cette validation ; ce test-là non plus n'a pas été rejoué.

  <details><summary>Texte d'origine de l'entrée, conservé</summary>

  - [ ] **Refus d'une URL à schéma non autorisé** — même écran, formulaire d'ajout
  
    Saisir `javascript:alert(1)` (ou `data:text/html,<script>alert(1)</script>`) dans le champ Lien → "Ajouter". Attendu : message rouge "Lien invalide : seuls les liens http:// ou https:// sont acceptés." sous le formulaire, **aucune requête réseau vers le serveur** (contrôle client immédiat), le formulaire reste ouvert. Vérifier ensuite qu'un appel RPC direct (hors formulaire, ex. requête REST manuelle vers `add_collab_source`/`update_collab_source` avec la clé anon) est lui aussi refusé côté serveur — c'est la ligne de défense qui compte réellement, le contrôle client n'étant qu'un confort.

  </details>
