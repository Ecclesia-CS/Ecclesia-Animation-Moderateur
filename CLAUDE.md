# CLAUDE.md — Ecclesia · Modérateur de débat

> **Terminologie** : "table" = cercle de débat modéré. "session"/"séance" (`sessions`) = conteneur optionnel regroupant plusieurs tables.

> ⚠️ **« Lance le chantier N » / « où est le chantier N » — chercher dans CES DEUX fichiers, jamais dans un seul :**
> - [`docs/chantiers.md`](./docs/chantiers.md) : ce qui a **déjà été fait**, chantier par chantier (fichier de suivi).
> - [`docs/chantiers-a-faire.md`](./docs/chantiers-a-faire.md) : la **file d'attente**, ce qui reste à faire, avec le détail complet de chaque chantier dicté par Jules mais pas encore lancé (description, précisions, garde-fous, périmètre de fichiers). **Un chantier récent qui n'apparaît pas dans `chantiers.md` est presque toujours ici, pas absent du dépôt.**
>
> Si un numéro de chantier ne se trouve dans NI L'UN NI L'AUTRE après recherche, le dire explicitement plutôt que de conclure qu'il n'existe pas — chercher aussi dans `docs/registre-merges-en-attente.md` et `git log --all --grep`.

Voir [`docs/chantiers.md`](./docs/chantiers.md) pour l'état courant des chantiers — **seul fichier de suivi de l'avancement**, à tenir à jour au fil des chantiers, il sert de point de synchronisation entre contributeurs. (`PROJECT_STATUS.md` a été supprimé au chantier 78 : deux fichiers de suivi en parallèle avaient produit un doublon périmé de quinze chantiers, en contradiction avec `git log`. Son contenu unique — les tâches lettrées des chantiers 1 à 25 et le reste-à-faire — est passé en annexes A et B de `docs/chantiers.md`.)

> ⚠️ **Avant de merger une branche sur `main`, lire [docs/registre-merges-en-attente.md](./docs/registre-merges-en-attente.md).** Certaines branches sont **volontairement** retenues hors de `main` (une migration qui casserait l'existant tant que le code n'est pas déployé, un workflow qui attend des secrets GitHub), et des périodes de gel s'appliquent au parcours de vote avant chaque utilisation en production réelle. Une branche non mergée n'est pas forcément un oubli.

> ⚠️ **Chantier en cours — déclaration obligatoire, dans les deux sens.** [`docs/chantiers-a-faire.md`](./docs/chantiers-a-faire.md) a une section **« Chantiers en cours »** en tête de fichier : c'est ce qui permet à une session démarrant en parallèle de savoir quelles branches sont vivantes et quels fichiers ne pas toucher sans risque de conflit.
> - **Au lancement d'un chantier** : y ajouter une entrée (numéro, branche, fichiers touchés, date) **avant** de commencer à coder.
> - **Au merge/push sur `main`** : retirer cette entrée dans le **même** commit ou juste après — un chantier resté marqué « en cours » après son merge est une fausse alerte aussi trompeuse qu'un chantier en cours non déclaré.
> Format et détail complet dans le fichier lui-même.

Ce dépôt contient **deux projets** :
1. **L'app web de modération** (racine `src/`) — le présent CLAUDE.md.
2. **La transcription des débats** (`transcription-debat/`) — pipeline Python **offline** (Whisper + croisement log Ecclesia + anonymisation + correction Gemini). Doc dédiée : [transcription-debat/CLAUDE.md](./transcription-debat/CLAUDE.md). Voir la section [Sous-projet transcription](#sous-projet--transcription-des-débats) ci-dessous.

---

## Annexes

Ce fichier est réinjecté au démarrage de **chaque** session : il ne garde que ce dont l'oubli fait commettre une erreur. Le détail vit dans `docs/`, et **rien n'a été supprimé** en l'y déplaçant (chantier 78).

| Annexe | Quand l'ouvrir |
|---|---|
| [`docs/reference-modele-donnees.md`](./docs/reference-modele-donnees.md) | Écrire une requête ou une migration : colonnes, contraintes, rétention |
| [`docs/reference-fonctions-sql.md`](./docs/reference-fonctions-sql.md) | **Avant d'écrire une RPC** — elle existe peut-être déjà |
| [`docs/reference-arborescence.md`](./docs/reference-arborescence.md) | Situer un fichier de `src/` sans le chercher |
| [`docs/reference-ia-gemini.md`](./docs/reference-ia-gemini.md) | Toucher à la modération/fusion IA, ou au nommage des camps |
| [`docs/reference-parcours-participant.md`](./docs/reference-parcours-participant.md) | Détails d'écran du parcours participant |
| [`docs/reference-tables-leaderless.md`](./docs/reference-tables-leaderless.md) | **Avant de toucher à `tables.leaderless`** |
| [`docs/reference-transcription.md`](./docs/reference-transcription.md) | Sous-projet transcription (offline, indépendant) |

Quatre fichiers de suivi, distincts et non redondants : [`docs/chantiers.md`](./docs/chantiers.md) (ce qui a été fait, chantier par chantier), [`docs/chantiers-a-faire.md`](./docs/chantiers-a-faire.md) (ce qui reste à faire, avec le détail complet de chaque chantier dicté — **à consulter avant de dire qu'un chantier n'existe pas**), [`docs/registre-merges-en-attente.md`](./docs/registre-merges-en-attente.md) (ce qui est retenu hors de `main`, et pourquoi), [`A_VERIFIER.md`](./A_VERIFIER.md) (ce qui reste à vérifier humainement).

---

## Stack & Déploiement

React 18 + Vite + TypeScript · Tailwind CSS v3 · Supabase (PostgreSQL + Auth anonyme + Realtime) · dnd-kit · GitHub Pages

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<clé publique anon>
```

### Règle SQL — révisée le 2026-09-07

**Une session de chantier peut appliquer sa propre migration**, décision de Jules : « une session peut appliquer ses migrations, et si elle supprime du travail précédent, ça devait être une exception. » Cela annule la règle du 01/09 qui réservait l'application à une session de vérification dédiée.

**La garde qui avait motivé cette règle reste, elle :** avant d'appliquer une migration qui **réécrit une fonction existante**, comparer son corps à la **définition courante en base** (`pg_get_functiondef`), et non aux anciens fichiers de migration. Plusieurs fonctions ont été modifiées en base par des chantiers dont le code n'était pas encore sur `main` : repartir du fichier les efface silencieusement. Deux cas réels en trois jours — le chantier 67 aurait effacé le 64, et le 70 aurait créé deux surcharges ambiguës au lieu de remplacer (`get_all_votes_for_analysis` avait déjà deux versions en base). Ça ne coûte qu'une requête.

Documenter dans `A_VERIFIER.md` le chemin du fichier, ce qu'il change, et le fait qu'il a été appliqué.

`vite.config.ts` a `base: '/Ecclesia-Animation-Moderateur/'` — **ne pas supprimer**.

---

## Environnements — dev / prod (Vercel + Supabase, chantier du 2026-09-25)

Deux environnements complets, déployés automatiquement à chaque push :

| | Branche | Déploiement | Base Supabase |
|---|---|---|---|
| **Prod** | `main` | GitHub Pages (workflow existant) **et** Vercel — `ecclesia-animation-moderateur.vercel.app` | `Ecclesia-Animation-Moderateur` (`plpjiehqsxxakbuykmkm`) |
| **Dev** | `dev` | Vercel uniquement — `ecclesia-animation-moderateur-git-dev-ecclesia5.vercel.app` (lien stable, à partager pour tester) | `Ecclesia-Animation-Moderateur-dev` (`mnjqrlrrzrycuconlfqb`) |

Le projet Vercel a un build command dédié (`npm run build -- --base=/`, qui écrase pour ce déploiement seulement le `base` GitHub Pages de `vite.config.ts` — le fichier source n'est pas modifié) et la protection SSO désactivée (liens ouvrables sans compte Vercel). Les variables `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` sont scopées par environnement Vercel (Production → base prod, Preview → base dev) — ne jamais les fusionner en un seul scope, ni recopier la valeur prod dans le scope Preview.

**Schéma dev** : cloné le 2026-09-25 par introspection de l'état *courant* de prod (pas un rejeu de l'historique des migrations, qui contient des étapes obsolètes comme l'ancien renommage `sessions → tables`) — tables, contraintes, index, policies RLS, fonctions et droits d'exécution (GRANT/REVOKE issus des chantiers 102/103) reproduits à l'identique. `app_config` contient les mêmes hash bcrypt que prod (mêmes codes de test) ; aucune donnée participant copiée.

### Règle de circulation : dev d'abord, main ensuite — dans les deux sens

- **Nouveau chantier → partir de `dev`**, jamais de `main` directement (le réglage GitHub "branche par défaut" reste `main` : c'est une discipline manuelle, pas un automatisme d'outil).
- **Toute migration SQL doit être appliquée deux fois, dans l'ordre** : d'abord sur la base dev (pour tester), puis sur la base prod au moment du merge vers `main`. Le code se propage tout seul par le merge git ; **le schéma de base ne se synchronise jamais automatiquement** — c'est un geste manuel à ne pas oublier à chaque merge.
- **Toute migration appliquée doit avoir son fichier `.sql` commité dans le même geste, sans exception.** Une migration appliquée en direct sans fichier casse la seule méthode fiable de savoir « qu'est-ce qui manque à prod » (comparer les fichiers de migration de `dev` à `list_migrations` sur prod). Cas réel : le chantier 128 a été appliqué sur prod le 25/09 sans fichier commité pendant plusieurs heures — repéré seulement en clonant le schéma pour dev, par chance avant qu'une autre session ne le recommence en double.

### Nettoyage au merge — worktree et branche

Au merge d'un chantier vers `dev` (ou vers `main`) :
- **Supprimer la branche GitHub distante** (`git push origin --delete <branche>`) dans la foulée — un dépôt qui accumule des dizaines de branches de chantiers mergés (constaté au chantier 126) rend `git branch -a` inutilisable.
- **Tenter `ExitWorktree`** si la session a elle-même ouvert son worktree via `EnterWorktree`. La plupart des sessions reçoivent leur worktree déjà provisionné par le harnais au démarrage plutôt que de l'ouvrir elles-mêmes — dans ce cas `ExitWorktree` est un no-op silencieux (l'outil n'agit que sur un worktree qu'il a lui-même créé dans la session courante). Ne pas bloquer dessus : le signaler en une ligne (« worktree à nettoyer manuellement ») plutôt que d'insister.
- **Filet de sécurité, au merge `dev` → `main`** : une passe croise `git worktree list` avec les chantiers marqués faits dans `docs/chantiers.md` (et l'absence dans `docs/registre-merges-en-attente.md`) pour purger les worktrees/branches orphelins de chantiers terminés que le nettoyage immédiat aurait manqués.

---

## Test navigateur automatisé

**Solution retenue : le Browser pane intégré au harnais Claude Code** (outils `mcp__Claude_Browser__*` — `preview_start`, `navigate`, `read_page`, `find`, `computer`, `get_page_text`...), piloté via `.claude/launch.json` (commité, racine du repo).

**Pourquoi ce choix plutôt que Playwright MCP ou Claude in Chrome** :
- **Zéro installation** : contrairement à un plugin Playwright MCP (nouveau serveur MCP à ajouter et à faire approuver par chaque contributeur), le Browser pane est déjà disponible dans toute session Claude Code — rien à installer, rien à faire valider par l'utilisateur.
- **Config versionnable** : `.claude/launch.json` (commité) décrit comment lancer `npm run dev` (port 5173) — identique pour tous les contributeurs et worktrees, contrairement à une configuration locale de navigateur.
- **Auth anonyme sans friction** : Ecclesia utilise `signInAnonymously()` (participants) et un mot de passe superadmin en `sessionStorage` — aucun flux OAuth ni session utilisateur réelle à reproduire. L'avantage de Claude in Chrome (session Chrome réelle déjà authentifiée) ne s'applique donc pas ici ; Claude in Chrome reste pertinent uniquement si un test nécessite un vrai compte Google/service tiers.
- **Pilotage par arbre d'accessibilité** : `read_page`/`find` donnent des références stables (`ref_N`) pour cliquer/typer sans dépendre de screenshots — reproductible d'une session à l'autre, comme le serait Playwright MCP, sans son coût d'installation.

**Invocation type** :
```
preview_start { name: "ecclesia-dev" }                          → lance `npm run dev`, ouvre le Browser pane
navigate { url: "http://localhost:5173/Ecclesia-Animation-Moderateur/#vote/<join_code>" }
read_page { filter: "interactive" }                              → arbre d'accessibilité, refs cliquables
computer { action: "left_click", ref: "ref_N" }                  → interaction
get_page_text {}                                                 → vérifier le contenu affiché
```

**Règle pour les états asynchrones du cycle de séance** (`draft → pre_voting → voting → allocating → debating → post_voting → closed`, et transitions Realtime en général) :

Ne **jamais** enchaîner une action (clic, RPC déclenchant un changement de phase) avec une vérification immédiate. L'app elle-même n'attend jamais une transition instantanément — elle combine Realtime + polling de secours (5-10s selon l'écran, voir `AllocatingScreen`/`VoteScreen`). Le test navigateur doit reproduire cette tolérance : après une action qui déclenche un changement d'état (phase de séance, apparition d'un participant, mise à jour d'une file d'attente...), **relire l'état affiché en boucle bornée** (`read_page`/`get_page_text`, intervalle ~1-2s, jusqu'à ~15-20s de plafond) jusqu'à observer le résultat attendu, plutôt que de cliquer ou d'asserter juste après l'action. Un échec après le plafond est un vrai signal (bug ou régression Realtime) — ne pas l'ignorer en relançant indéfiniment.

> **La règle de jeton exclusif sur `npm run dev` (une seule session à la fois) a existé mais n'existe plus** (retirée le 2026-09-16, sur décision de Jules) — chaque session peut lancer son propre serveur de dev sans coordination préalable.

**Historique** : la quasi-totalité des chantiers antérieurs à cette date, y compris mergés et déployés, n'ont eu qu'une vérification `tsc`/tests/build, jamais un parcours réel à l'écran — c'était la conséquence de cette règle de jeton, désormais levée. « Mergé » ne veut pas dire « vérifié » pour ces chantiers-là — `A_VERIFIER.md` reste la seule trace fiable de ce qui a été confirmé humainement.

### Points à vérifier humainement — `A_VERIFIER.md`

> 📋 **Deux fichiers compagnons, à lire avant de conclure quoi que ce soit sur l'état du projet** : [docs/chantiers.md](./docs/chantiers.md) (la liste de tous les chantiers depuis le 34, avec ce qui a été fait et son statut) et [docs/registre-merges-en-attente.md](./docs/registre-merges-en-attente.md) (ce qui est retenu hors de `main`, et la passation).
>
> 🗂️ La passe de validation manuelle de Jules du 06/09/2026 (37 entrées vérifiées à l'écran) **a été réintégrée dans `A_VERIFIER.md` le 2026-09-07** (chantier 78) : ces entrées sont en section « Validé », avec la mention « validé le 2026-09-06 ». Un seul fichier fait foi désormais — inutile de croiser. [`docs/A_VERIFIER-passe-validation-jules-20260906.md`](./docs/A_VERIFIER-passe-validation-jules-20260906.md) est conservé comme trace de ce qu'il a réellement vu à l'écran ce jour-là ; ne pas le supprimer, mais ne plus s'en servir comme source de statut.

Après tout test navigateur, ou toute implémentation dont le comportement reste incertain (edge case non couvert, résultat visuel à confirmer, comportement ambigu sur peu de données), consigner une entrée dans [A_VERIFIER.md](./A_VERIFIER.md) avec la date, le fichier concerné, et une description courte du point à vérifier. Ne jamais supprimer une entrée de ce fichier sans confirmation explicite de l'utilisateur — se contenter de la déplacer en section "Validé" une fois la confirmation obtenue. Le fichier est commité avec les changements de code concernés (pas de `.gitignore`) pour rester visible par les autres contributeurs.

---

## Types de séance — toute évolution se questionne pour les trois (chantier 134)

Depuis le chantier 134, une séance a un **type**, fixé à la création (`sessions.session_type`) :

| Type | Phases | Contenu |
|---|---|---|
| `full` — séance complète | `draft → pre_voting → voting → allocating → debating → post_voting → closed` | le parcours historique |
| `debate` — débat simple | `draft → debating → closed` | une table modérée (d'autres ajoutables), questionnaire de fin, aucun vote |
| `poll` — sondage | `draft → pre_voting → closed` | vote distanciel seul, résultats et camps visibles pendant le vote, publics à la clôture |

La séquence vit à deux endroits qui doivent rester identiques : `session_type_allows_phase` (SQL, garde de `set_session_phase`) et `phaseSequenceFor` (`src/lib/phaseLabels.ts`). Lire le type via `sessionTypeOf(session)`, jamais `session.session_type` brut.

> ⚠️ **Règle demandée par Jules (2026-09-26) — à appliquer par chaque session, sans attendre qu'on le lui rappelle** : la plupart des modifications apportées aux séances complètes doivent **se transférer aux séances partielles** (débat simple, sondage). Toute session qui touche un écran, une RPC ou une règle du parcours doit **se poser explicitement la question** : « ce changement concerne-t-il aussi `debate` et/ou `poll` ? » — et soit l'y appliquer, soit dire dans son compte rendu (et dans `docs/chantiers.md`) pourquoi il ne s'y applique pas. Un changement qui teste `phase === '…'` sans penser au type est le cas typique où l'oubli passe inaperçu : un débat simple n'a jamais de `voting`, un sondage jamais de `debating`.

## Modèle de données

> 📎 **Détail colonne par colonne : [`docs/reference-modele-donnees.md`](./docs/reference-modele-donnees.md)** — toutes les tables (`sessions`, `tables`, `participants`, `queue_entries`, `session_members`, `entry_responses`, `assertions`, `assertion_votes`, `assertion_merges`, `table_assignments`, `speaking_turns`, `questionnaire_responses`, `private_notes`, `app_config`) et la politique de rétention des codes de rappel.

Ce qu'il faut connaître sans aller voir :

**Ordre des phases** — `draft → pre_voting → voting → allocating → debating → post_voting → closed`
- `pre_voting` : vote ouvert à distance, `attending_in_person = false` par défaut, pas d'onboarding.
- `voting` : vote présentiel — confirmation de présence requise. Le clustering et l'analyse filtrent sur `attending_in_person = true`.
- La phase `questionnaire` **n'existe plus** (chantier 39) : `debating → post_voting` déclenche automatiquement le questionnaire post-débat.
- `post_voting` (chantier 89) : le débat est fini, mais la séance n'est pas encore clôturée. Le participant voit ses résultats et peut revoter (`PostVoteScreen`, chantier 69). Le passage en `closed` coupe l'accès au revote — `ResultsMapScreen` n'affiche le bouton « ↻ Revoter » que si `phase === 'post_voting'`.

**Deux pièges d'identité, sources d'erreurs répétées :**
- **Un même `user_id` peut avoir plusieurs lignes `participants`** (pseudos différents, contrainte `UNIQUE(table_id, pseudo)`). Tout `WHERE user_id = auth.uid()` doit donc porter un `LIMIT 1` ou passer par une jointure sur `current_speaker_id`.
- **`analysis_members.group_id` (0-indexé, camp d'opinion k-means) ≠ `table_assignments.table_number` (1-indexé, table physique de débat).** Aucune correspondance garantie entre les deux — voir « Ne jamais faire ».

## Sécurité

| Code | Stockage | Usage |
|---|---|---|
| **Code Ecclesia** | `app_config.creation_code_hash` (bcrypt) | Créer une table + reprendre la modération |
| **join_code** | `tables.join_code` (clair) | Rejoindre une table |
| **Mot de passe superadmin** | `app_config.superadmin_code_hash` (bcrypt) | Gérer les séances |

**Aucun hash ne quitte jamais la base.** RLS + SECURITY DEFINER uniquement. Auth anonyme (`signInAnonymously`).

### `session_members` / `table_assignments` — lecture self-only (chantier 50)

Les deux tables avaient une policy `SELECT USING (true)`. Comme il n'y a pas de backend et que la clé `anon` est dans le bundle JS public, `GET /rest/v1/session_members` retournait tous les inscrits de toutes les séances — `pseudo` (nom et prénom réels) et `reclaim_code` (4 chiffres, **en clair**) compris. Depuis la migration `20260902_chantier50_close_identity_tables.sql` :
- `session_members_select_own` : `USING (user_id = auth.uid())`
- `table_assignments_select_own` : `USING (is_own_session_member(member_id))`

**Conséquences à connaître avant d'écrire une lecture** :
- Toute lecture directe de ces tables ne voit que **ses propres lignes**. Les 4 lectures existantes (`TableContext`, `SessionRouterScreen` ×2, `VoteScreen`) sont déjà filtrées `.eq('user_id', userId)` — ne pas en ajouter d'autre sans passer par une RPC SECURITY DEFINER.
- **Ne jamais lire ces tables via une jointure imbriquée PostgREST** (`table_assignments.select('…, session_members!member_id(…)')`) pour le compte du superadmin : sous ces policies, PostgREST **ne renvoie pas d'erreur**, l'objet imbriqué devient `null` et les listes se vident en silence. Utiliser `list_table_assignments_admin`.
- Le superadmin n'étant membre d'aucune séance, il ne reçoit **plus aucun événement Realtime** sur ces deux tables. La vue Groupes compense par un polling 10 s (`allocating`/`debating`). **Chantier 59** : l'abonnement Realtime dormant (`table_assignments:<session_id>`) a été **supprimé**, ainsi que `session-tables:<session_id>` — ce dernier était mort pour une raison voisine jamais relevée jusque-là (la policy de `tables` est `is_table_participant(id)`, et le superadmin n'a aucune ligne `participants` : `apply_allocation` lui donne `created_by`, pas un siège). Les pollings 10 s et 15 s tenaient déjà ces deux vues à jour.
- Effet de bord souhaitable : `REPLICA IDENTITY FULL` fait toujours transiter toutes les colonnes dans le WAL, mais Realtime applique la RLS avant livraison — `reclaim_code` ne part plus qu'au propriétaire de la ligne.

### Rétention des données — codes de rappel (chantier 49)

`session_members.reclaim_code` (PIN 4 chiffres, **en clair** à l'origine) est effacé (`NULL`) dès qu'une séance passe en phase `closed` — purge intégrée à `set_session_phase`, pas de tâche périodique. Combiné au `pseudo` (nom + prénom réels), c'est la donnée la plus sensible du schéma. Le reste de `session_members` n'est **pas** purgé (c'est l'historique du débat, réutilisé par les écrans de résultats sans limite de durée).

> ⚠️ **Colonne renommée et changée de nature au chantier 93** (`20260918_chantier93_identite_participant.sql`, découvert au chantier 116 en comparant à `information_schema.columns`) : `reclaim_code` (texte clair) a été remplacé par `reclaim_code_hash` (bcrypt, comme `session_members.reclaim_code_hash` d'avant le 23/06). Un code haché est irrécupérable par construction — d'où l'existence de `regenerate_reclaim_code_admin`/`_moderator`/`_self` (émettre un nouveau code plutôt que relire l'ancien). Le reste de ce paragraphe (purge à la clôture, sensibilité de la donnée) reste vrai à l'identique, seule la représentation en base a changé.

> 📎 Justification détaillée, preuve d'absence de régression et recommandation d'anonymisation non implémentée : [`docs/reference-modele-donnees.md`](./docs/reference-modele-donnees.md).

### Fonctions SECURITY DEFINER

> 📎 **Table complète des RPC : [`docs/reference-fonctions-sql.md`](./docs/reference-fonctions-sql.md)** — une soixantaine de fonctions, avec leur rôle et le chantier qui les a introduites. **La consulter avant d'écrire une RPC** : plusieurs chantiers récents ont découvert trop tard qu'une fonction existante couvrait déjà le besoin. On y trouve aussi les tables en `REPLICA IDENTITY FULL` et pourquoi.

Les trois helpers d'autorisation, à connaître de mémoire parce que les contourner est le piège le plus coûteux du projet :

| Helper | Répond à |
|---|---|
| `is_table_participant(uuid)` | « L'appelant est-il assis à cette table ? » — anti-récursion RLS |
| `is_table_moderator(uuid)` | « L'appelant a-t-il autorité d'animation sur cette table ? » |
| `is_own_session_member(uuid)` | « Cette ligne `session_members` est-elle la mienne ? » |

## Architecture TypeScript

> 📎 **Arborescence commentée de `src/` : [`docs/reference-arborescence.md`](./docs/reference-arborescence.md)** — rôle de chaque module de `lib/`, de chaque écran et de chaque composant, plus l'état exposé par `TableContext`.


### Hash routes (App.tsx)

| Hash | Composant | Description |
|---|---|---|
| `#session/<join_code>` | `SessionRouterScreen` | Routeur intelligent — QR code / lien WhatsApp |
| `#vote/<join_code>` | `VoteScreen` | Flow vote participant |
| `#collab/<join_code>` | `CollabDocScreen` | Document collaboratif sources |
| `#superadmin` | `SuperadminScreen` | Administration séances |
| *(vide)* | `EntryScreen` ou `TableView` | Accueil ou débat en cours |

URL de production : `https://ecclesia-cs.github.io/Ecclesia-Animation-Moderateur/#session/<join_code>`
URL locale : `http://localhost:5173/Ecclesia-Animation-Moderateur/#session/<join_code>`

### Canaux Realtime privés (chantier 59)

**Tout canal s'ouvre via `privateChannel()` (`src/lib/realtime.ts`), jamais via `supabase.channel()` directement.** Le helper pose `{ config: { private: true } }` et journalise en `console.error` tout `CHANNEL_ERROR`/`TIMED_OUT` — 6 des 8 canaux appellent `.subscribe()` sans callback, un refus d'autorisation serait sinon totalement muet.

L'autorisation est décrite par `can_join_realtime_topic(topic)` (migration `20260906_chantier59_realtime_canaux_prives.sql`), appelée par deux policies sur `realtime.messages` : lecture au niveau du topic, émission restreinte à `extension = 'broadcast'`. Les 8 topics et leur règle :

| topic | règle |
|---|---|
| `table:<table_id>` · `session-member-status:<table_id>` | participant de la table |
| `allocating:<session_id>` · `vote:<session_id>` · `vote-wait:<session_id>` | membre de la séance |
| `session-member:<member_id>` · `postvote:<session_id>:<member_id>` | ce membre est le mien |
| `collab:<session_id>` | tout authentifié (aussi ouvert que `session_sources`, RLS `true`) |

⚠️ **`can_join_realtime_topic` est fail-closed** : ajouter un `.channel()` sans ajouter la branche correspondante dans cette fonction SQL produit un canal qui ne se connecte jamais.

⚠️ **`private: true` ne protège que le broadcast.** Le `postgres_changes` est filtré par la RLS des tables, sur canal privé comme public (doc Supabase) — le passage en privé ne lui apporte ni protection ni régression. Et **fermer F6 exige en plus de désactiver « Allow public access »** (dashboard → Realtime → Settings), réglage projet global : sans lui, un attaquant rejoint le même topic en mode public. Ce réglage n'est **pas** appliqué à ce jour — voir `A_VERIFIER.md`, chantier 59, pour l'ordre d'application (l'inverser casse toute la production d'un coup) et le rollback d'urgence.

---

## Règles critiques

### Chrono
Toujours `Date.now() - new Date(table.current_turn_started_at).getTime()`. Timestamps posés par `now()` PostgreSQL uniquement (sauf `correct_turn`).

### Auto-avancement
Chemin principal : `endTurnAndAdvance` (1 transaction). Fallback `useEffect` dans `ModeratorView` (condition de course uniquement). Guards : `isGranting` + `pausedSpeakerId !== null`.

### Pause
Réelle en DB : `endTurn()` → stocker `pausedSpeakerId`. Reprise : `grantFloor(pausedSpeakerId, 'manual')`. `SpeakerTimer` accepte `offsetMs` pour timer continu (accumulé entre les pauses).

### isModerator
Stocké en localStorage au moment du create/join. Ne pas dériver de `table.created_by === userId` (incorrect si 2 onglets même userId).
`TableContext.isModerator = physicalModerator || sessionMemberIsModerator` (chantier 41). Sur une table `leaderless`, `isModerator` n'est **plus** systématiquement `false` — cette affirmation, historiquement présente ici, était déjà périmée dès le chantier 41/60. Un participant y devient modérateur soit par auto-désignation (`designateModerator`, bouton "🎙️ Devenir modérateur", flux ci-dessous), soit parce qu'un membre déjà assis à cette table (Bloc C, `table_assignments`) se voit poser `session_members.is_moderator = true` — par lui-même (`claim_moderator_status`) ou par le superadmin (`set_member_moderator`, `assign_moderator_to_table`). Dans ce second cas, la table elle-même **cesse d'être `leaderless`** (chantier 64, voir juste en dessous). Le listener Realtime sur `tables` (UPDATE) remet `physicalModerator` à `false` si la table redevient `leaderless` (cas inverse, ex. recalcul d'allocation) — cf. commentaire chantier 35 dans `TableContext.tsx`.

**Exception confirmée par Jules (2026-09-02), résiduelle après le chantier 64** : un membre marqué `session_members.is_moderator = true` sans être passé par l'une des trois RPC ci-dessus — typiquement un modérateur **en surplus** au sens du chantier 25b (sans table à animer), assis par hasard sur une table `leaderless` — obtient quand même l'autorité d'animation dessus, sans que la table cesse d'être `leaderless` (le helper `is_table_moderator` du chantier 60 ne fait pas d'exception pour `leaderless`). Comportement voulu, pas un bug ; ce cas résiduel reste ouvert, non tranché par le chantier 64 (voir A_VERIFIER.md).

### Tables leaderless (`table.leaderless = true`)

Tout le monde voit `ParticipantView` tant qu'aucun modérateur n'a été désigné ; la parole s'auto-attribue via `claimFloor()` (RPC atomique) au premier de la file quand personne ne parle.

> 📎 **Les quatre chemins qui rendent une table modérée, et la règle de bascule arrière (`leaderless_by_design`) : [`docs/reference-tables-leaderless.md`](./docs/reference-tables-leaderless.md).** Sujet dense, plusieurs fois source d'erreur — le lire en entier avant de toucher à `tables.leaderless`.

### Realtime latence — 4 couches
1. Mise à jour locale immédiate après RPC
2. Broadcast `{event:'refresh', payload:{tables}}` → tous les clients refetch
3. Polling 5s (rattrapage broadcasts manqués)
4. Monitoring WebSocket (`CHANNEL_ERROR`/`TIMED_OUT` → reload complet)

Les 4 couches sont **inchangées par le chantier 59** — elles sont ce qui rend l'app utilisable dans les navigateurs in-app (Messenger), où le WebSocket est souvent coupé. Seule la couche 2 est désormais soumise à autorisation : seuls les participants de la table peuvent émettre un `refresh`. Le plafonnement côté réception (chantier 53) reste en place.

### Broadcast par action
`grantFloor`/`endTurn`/`endTurnAndAdvance` → `tables, queue_entries, speaking_turns`
`addToQueue`/`removeFromQueue`/`moveQueueEntry`/`reorderQueueEntry`/`changeQueueType` → `queue_entries`
`kickParticipant` → `tables, participants, queue_entries, speaking_turns`

### DnD (ModeratorView)
- Stratégie `pointerWithin` **sans** fallback `closestCenter` — drop hors panel ignoré, sinon insertion en dernière position
- Copies locales `localLong`/`localInteractive` + refs wrapper (`setLocalLong`/`setLocalInteractive`) pour éviter stale closures dans `handleDragOver`
- Ghost `__ghost__` inséré dans la file locale lors d'un drag participant → file
- **`activeOriginalQTRef`** : capture queueType au dragStart car `active.data.current` est un ref mutable mis à jour à chaque re-render — ne jamais lire `active.data.current.queueType` dans `handleDragEnd`
- **`intraQueueLastOverRef`** : stocke le dernier `over.id` UUID valide (pas panel ID) en intra-queue — utilisé par `handleMasterDragEnd` car au moment du drop `over.id` peut être le panel ID → `findIndex` retourne -1

---

## ❌ Ne jamais faire

- **`service_role` key dans le frontend** — bypasse RLS entièrement
- **Comparer codes côté client** — uniquement via `crypt()` en SECURITY DEFINER
- **Garder une table pour animateur via `tables.created_by = auth.uid()`** (chantier 60) — `created_by` est l'uid du **superadmin** sur toute table créée par `apply_allocation`/`create_tables_batch`, jamais celui du modérateur assis. Une garde d'animation écrite ainsi refuse silencieusement tous les modérateurs du chemin nominal (RLS → zéro ligne, aucune erreur). Utiliser `is_table_moderator(<table_id>)`. Inversement, ne **jamais** relâcher ce helper à `is_moderator` seul (autorité sur toutes les tables de la séance) ni à `table_assignments` seul (autorité à tous les participants de la table) — les deux conditions sont cumulatives
- **Lire `session_members` ou `table_assignments` par jointure imbriquée PostgREST pour le superadmin** (chantier 50) — les deux tables sont en self-only et le superadmin n'est membre d'aucune séance : PostgREST ne lève alors aucune erreur, l'objet imbriqué devient `null` et les listes se vident **en silence**. Utiliser `list_table_assignments_admin`. Toute nouvelle lecture directe de ces tables doit être filtrée `.eq('user_id', userId)` ; sinon, passer par une RPC SECURITY DEFINER
- **`useLiveMs()` haut dans l'arbre** — re-render 500ms sur tout le sous-arbre. Toujours dans un composant feuille (pattern `SpeakerTimer`, `SessionTimerDisplay`)
- **`setInterval` pour incrémenter un compteur** — utiliser `Date.now() - startedAt`
- **Plusieurs channels Realtime** — 1 seul channel, plusieurs `.on()` chaînés
- **Un `as T` sur une donnée qui vient d'ailleurs que du code** — c'est **la première cause de panne du projet : quatre pages blanches en production, toutes en septembre 2026.** Un cast n'est pas une vérification : il est effacé à la compilation et n'affirme qu'un espoir. Deux frontières, le même geste :
  - **La base / une RPC.** Une colonne **nullable en base** typée non-nullable côté front, et le rendu plante. Cas réel du 18/09 : les RPC héritées `run_clustering_v1`/`v2` (laissées en base au chantier 37, plus appelées mais toujours invocables) créent des `session_analysis` dont `silhouette_score`, `pca_variance_explained`, `repness` et `group_consensus` sont **tous** `NULL` — `silhouette_score.toFixed()` et `Object.entries(null)` vidaient l'onglet Analyse. **Avant de typer un champ de RPC non-nullable, vérifier `is_nullable` en base** (`information_schema.columns`) : le type doit refléter la base, pas le cas favorable. Normaliser à la frontière, en un seul point (`normalizeLoadedAnalysis`, `lib/analysis.ts`), plutôt que d'ajouter des gardes chez chaque consommateur. Rendre le type **honnête** est le meilleur investissement : `tsc` désigne alors lui-même tous les usages à protéger.
  - **`localStorage`/`sessionStorage`.** Voir la ligne suivante.
- **`JSON.parse(localStorage…) as T` sans valider la forme relue** — trois des quatre pages blanches (`ai_log` le 16/09, `preview` d'allocation le 18/09, deux autres sites désamorcés le 18/09). Un blob est écrit par une version du code et relu par une version **ultérieure**, parfois des semaines plus tard ; le `as T` n'est vérifié à aucun moment à l'exécution. Conséquence directe : **ajouter un champ obligatoire à un type persisté est un changement cassant** pour toutes les données déjà dans les navigateurs — c'est exactement ce qu'ont fait le chantier 17 (`usage` sur `AiLogEntry`) et le chantier 92 (`clusters`/`brokenClusters` sur `AllocationResult`). Valider à la relecture (`isValidPreview`, `AllocationPanel.tsx` ; `isValidUsage`, `aiUsage.ts`), **ou** changer la clé de stockage (`…_v2_<id>`) pour que les anciens blobs ne soient jamais relus. ⚠️ **Ni `tsc`, ni les tests, ni le build ne peuvent attraper ça** : le cast est effacé à la compilation et un navigateur neuf (ou une fenêtre privée) passe toujours — le bug n'existe que sur une machine qui a fait tourner l'ancienne version. Et comme il n'y a **aucun `ErrorBoundary`**, une seule exception de rendu vide toute la page, pas seulement le panneau fautif.
- **`String(e)` sur erreur Supabase** — `PostgrestError` n'est pas `instanceof Error`. Utiliser `extractErr(e)` de `utils.ts`
- **`active.data.current.queueType` dans dragEnd** — ref mutable, utiliser `activeOriginalQTRef`
- **`grantFloor` sans guard `isGranting`** — double-appels en rafale créent deux tours
- **Oublier `broadcast()` après une action** — sinon 5s de délai pour les autres clients
- **`prev => [...prev, n]` sans déduplication Realtime** — upsert SQL déclenche parfois INSERT. Toujours vérifier `prev.some(p => p.id === n.id)` avant d'ajouter
- **`WHERE user_id = auth.uid()` sans `LIMIT 1`** — un user_id peut avoir plusieurs participants depuis migration 005
- **`votedCount = myVotes.size` dans VoteScreen** — `myVotes` accumule tous les votes posés, y compris sur des assertions rejetées/supprimées depuis. Toujours intersecter : `assertions.filter(a => myVotes.has(a.id)).length` pour éviter un numérateur > dénominateur.
- **`MIN_VOTES_PER_MEMBER` trop élevé dans `analysis.ts`** — `get_all_votes_for_analysis` ne retourne que les votes sur assertions `approved`. Si des assertions sont rejetées après que des participants ont voté dessus, ces participants n'ont plus assez de votes et sont exclus du scatter PCA. Valeur actuelle : 1 (abaissée de 2).
- **Faire lever une exception à l'allocation v2** — l'algorithme ne doit *jamais* échouer : le jour de la séance, rien ne doit pouvoir bloquer le passage en débat. Une règle non satisfaisable se **dégrade** (ordre lexicographique), elle ne lève pas. Ne pas ajouter de garde bloquante dans `runAllocation` ni dans `apply_allocation` ; les seules erreurs admises sont un mot de passe invalide et un payload vide.
- **Rendre l'allocation v2 non déterministe** — `Math.random()` est interdit dans `src/lib/allocation.ts` (PRNG `mulberry32` à graine fixe uniquement). Le superadmin doit pouvoir relancer le calcul et retomber sur la même répartition ; un résultat qui change entre deux clics n'est pas acceptable (§6).
- **Résoudre le surplus de modérateurs par itération vers un point fixe** — asseoir quelqu'un augmente la population → change le nombre de tables → change le surplus → … L'itération naïve diverge (sur 30 participants / 4 modérateurs elle transforme `[10, 10, 10]` en 6 tables). Utiliser l'**énumération** du nombre de modérateurs animants, avec le critère de cohérence `k ≤ T` (chantier 25b / H17).
- **Compter les modérateurs qui animent réellement comme des sièges** — un modérateur (`session_members.is_moderator`) qui anime une table n'occupe pas de place, ne compte ni comme actif ni comme passif, et son opinion n'entre pas dans le mix d'hétérogénéité de sa table. Ses votes alimentent en revanche bien l'analyse globale des camps. `loadAllocationInputs` fait déjà la séparation — ne pas la contourner. Un modérateur **en surplus** (aucune table à animer) fait exception : il redevient un participant ordinaire et occupe bien un siège (chantier 25 / H17).
- **Écrire dans `sessions.group_names` un nommage indexé par table physique** (chantier 28 / H26) — `group_names[].table_number` vaut **toujours** `analysis_members.group_id + 1` (camp d'opinion). Tous les lecteurs indexent ainsi : `ResultsMapScreen`, `AnalysisPanel`, `get_table_opinion_summary`. Construire la liste à nommer uniquement via `namingGroupsFromAnalysis()` (`lib/groupNaming.ts`). Indexer par `table_assignments.table_number` produisait un tableau tronqué (autant d'entrées que de tables, pas de camps) qui écrasait le précédent → camps au-delà anonymes sur l'écran de résultats et noms qui changent tout seuls.
- **Confondre `group_id` k-means et `table_number` physique** — `analysis_members.group_id` (0-indexé, cluster d'opinion) ≠ `table_assignments.table_number` (1-indexé, table de débat). `run_clustering_v2` mélange intentionnellement les clusters → aucune correspondance garantie. Les `group_names` Gemini sont indexés par numéro de cluster (1 = group_id 0). Dans `ResultsMapScreen`, toujours utiliser `selfGroupId + 1` pour chercher le nom Gemini, jamais `assignment.table_number`.

---

## Phase de vote (Bloc C)

Flux complet :

1. **`draft`** → séance créée, pas encore ouverte
2. **`pre_voting`** *(optionnel)* → vote ouvert à distance avant l'événement. Participants s'inscrivent avec `attending_in_person=false`. Un code de rappel 4 chiffres leur est affiché (à screenshoter). Pas d'onboarding. VoteScreen géré via `#vote/<join_code>`. EntryScreen affiche la séance comme "en cours".
3. **`voting`** → vote présentiel. Nouveaux arrivants : `VotingEntryForm` (nom prénom OU code), reclaim auto si nom déjà pris → **onboarding** (`entry_responses`, dont la question modérateur oui/non — D18) avant le vote. Pré-votants sur même appareil : `AttendanceConfirmScreen` (mode `known_user`) → onboarding si pas déjà répondu. Clustering et analyse filtrés sur `attending_in_person = true`.
4. **`allocating`** → **chantier 19** : le superadmin **déclenche manuellement** l'allocation v2 via `AllocationPanel` (rien d'automatique à l'entrée en phase — amendement à F13). Le calcul tourne dans son navigateur (`src/lib/allocation.ts`), la proposition s'affiche avec le statut de chaque seuil, puis `apply_allocation` crée les tables manquantes et écrit `table_assignments`. Retouches ensuite par glisser-déposer dans l'onglet Tables, avec recalcul des seuils en direct, avant que le superadmin ne déclenche lui-même `debating`. Participants voient leur numéro de groupe + nom du camp dans AllocatingScreen (polling 5s + Realtime). Polling couvre aussi la phase `allocating` quand `assignment === null`.
   *Chemin hérité — supprimé (chantier 37)* : le bouton « Répartir en tables » / modale de clustering (phase `voting`, RPC `run_clustering_v1`/`v2`) a été retiré du superadmin — retour de Jules (« je ne vois pas à quoi il sert encore »), confirmé en lisant le code : depuis le chantier 19, il court-circuitait l'allocation v2 en créant les tables via l'algorithme hérité (aléatoire ou PCA simple) et en poussant directement la phase en `allocating`, sans jamais passer par `AllocationPanel`. La modale elle-même avertissait déjà l'utilisateur d'utiliser l'algorithme v2 à la place. Le toggle IA « Fusionner auto en fin de vote » (`LLMModerationPanel`, clé `ai_auto_merge_<id>`) ne déclenchait que depuis cette modale : le déclenchement a été déplacé dans `handlePhaseChange` (superadmin), quand le superadmin fait passer la séance de `voting` à `allocating` — même sémantique (« fin de vote »), sans perte de fonctionnalité. Les RPC `run_clustering_v1`/`v2` restent en base (non appelées par le frontend) ; `runClusteringV1`/`runClusteringV2` (wrappers `lib/voting.ts`) et le composant `ClusteringModal` sont supprimés.
5. **`debating`** → superadmin clique "Ouvrir le débat". Participants voient le `join_code` et rejoignent via `join_table(join_code, pseudo)` → `tableStore.set(...)` → callback `onTableJoined` → `App.handleTableJoined` met à jour `phase` en `table` → TableView (sans reload).
6. **`post_voting`** *(chantier 89)* → superadmin clique "Passer en Post-vote" pour marquer la fin du débat, sans clôturer la séance. **Chantier 39** : la phase `questionnaire`, qui s'intercalait ici comme étape manuelle dédiée, a été supprimée de l'énumération `sessions.phase`. Le passage `debating → post_voting` déclenche désormais automatiquement `force_session_questionnaire` (même effet que l'ancien passage manuel en phase `questionnaire` : force le modal chez les participants encore connectés à une table de la séance — `handlePhaseChange`, `SuperadminScreen.tsx`). Un membre inscrit qui revient sur `#vote/<join_code>` ou `#session/<join_code>` sans avoir répondu se voit proposer `SessionQuestionnaireForm` avant l'écran de résultats — gate sur l'absence de ligne dans `questionnaire_responses` (`hasQuestionnaireResponse`, `lib/voting.ts`) plutôt que sur la phase. Sur `ResultsMapScreen`, un bouton « ↻ Revoter » ouvre `PostVoteScreen` (chantier 69) : revoter sur ses propres assertions, en proposer une nouvelle, ou voter sur celles jamais vues. Un visiteur non inscrit tombant sur `#session/<code>` en `post_voting` n'a pas accès au résumé public (`get_public_results` reste gated sur `phase = 'closed'` — les votes peuvent encore bouger) : message d'attente dédié (`SessionRouterScreen`).
7. **`closed`** → superadmin clique pour clôturer définitivement. Coupe l'accès au revote (le bouton « ↻ Revoter » disparaît de `ResultsMapScreen`) et purge `session_members.reclaim_code` (chantier 49, inchangé — toujours déclenché sur l'entrée en `closed`, pas en `post_voting`). C'est aussi le seul moment où `get_public_results` s'ouvre aux visiteurs non inscrits. Voir « Nomenclature des phases côté participant » ci-dessous.

`moderation_policy = 'open'` : assertions directement `approved`. `= 'closed'` : `pending` jusqu'à `approve_assertion`. `= 'ai'` : `pending`, modération automatique par Gemini via `LLMModerationPanel` (setInterval configurable).

**Chantier 22 / G14** : plus de timer/seuil de phase — colonnes `vote_timer_minutes`/`vote_threshold_percent` supprimées de `sessions`. La durée de chaque phase est gérée entièrement à la main par l'organisateur, hors application ; les transitions de phase restent des boutons superadmin.

Realtime : les 4 tables Bloc C utilisent Realtime natif (pas de broadcast custom).

### Nomenclature des phases côté participant (chantier 39)

Repère affiché en continu côté participant (`PhaseIndicator`, `src/components/PhaseIndicator.tsx` + `src/lib/phaseLabels.ts`) — numérotation distincte des libellés internes du superadmin (`PHASE_LABEL`/`PHASE_SEQUENCE_LABELS`, `SuperadminScreen.tsx`) :

| # participant | Libellé participant   | Phase interne (`sessions.phase`) |
|---|---|---|
| — | *(aucun — jamais vu par un participant)* | `draft` — rebaptisée **« Phase 0 »** côté superadmin, pour rester alignée sur cette numérotation (le superadmin part donc de 0, le participant de 1) |
| 1 | Distanciel | `pre_voting` |
| 2 | Vote en présentiel | `voting` |
| 3 | Allocation | `allocating` |
| 4 | Débat | `debating` |
| 5 | Post-débat | `post_voting` *(chantier 89 — questionnaire post-débat inclus, plus de phase `questionnaire` séparée, voir point 6 du flux ci-dessus ; revote ouvert)* |
| 6 | Résultats | `closed` (revote coupé) |

`PhaseIndicator` ne rend rien en phase `draft` ou si la phase est absente/inconnue. Affiché dans `VoteScreen`, `AllocatingScreen`, `ParticipantView` (phase 4, uniquement si la table est rattachée à une séance — `table.session_id`), `ResultsMapScreen` et `SessionQuestionnaireForm` (phase 5 fixe, ce formulaire n'apparaissant plus qu'en post-débat/post-clôture). Volontairement absent de `PublicResultsScreen` (visiteur non inscrit, hors « parcours participant ») et de `ModeratorView` (vue modérateur, hors périmètre du chantier).


### Polling de secours phase (VoteScreen + AllocatingScreen — Messenger/WebSocket indisponible)

`VoteScreen` ajoute un polling 10 s sur la phase de la séance pendant les étapes `waiting` et `vote`. Si le WebSocket Realtime est coupé (in-app browsers), la transition de phase est détectée dans les 10 s sans rechargement. L'étape `onboarding` bénéficie aussi d'une protection : `handleOnboardingSuccess` re-fetch la phase courante avant de décider la prochaine étape (évite une session périmée).

`AllocatingScreen` ajoute un polling 10 s sur la phase de la séance pendant l'étape `allocating`. Couvre la transition `allocating → debating` quand Realtime est indisponible — sans ça, le participant resterait bloqué sans voir le bouton "Rejoindre".

## Modération IA (Gemini Flash)

Toutes les fonctions IA passent **exclusivement** par l'Edge Function `gemini-proxy` — **jamais** d'appel direct à `api.google.com` depuis le frontend. `src/lib/gemini.ts` → `supabase.functions.invoke('gemini-proxy')` → Gemini API.

Ne pas appeler `supabase.functions.invoke` sans vérifier **`error` ET `data?.error`**.

> 📎 **[`docs/reference-ia-gemini.md`](./docs/reference-ia-gemini.md)** — les clés `localStorage` par séance, les règles de la modération et de la fusion d'assertions (dont la fusion en deux temps et l'annulation via `assertion_merges`), le quota de l'Edge Function, et le **bug connu du nommage Gemini** (le dernier groupe systématiquement nommé « Groupe N », avec la liste de ce qui a déjà été tenté et éliminé — à lire avant de retenter quoi que ce soit dessus).

## UX Participant — règles importantes

> 📎 **Détails d'écran : [`docs/reference-parcours-participant.md`](./docs/reference-parcours-participant.md)** — navigation post-vote, reconquête d'un pseudo pré-vote, modales d'accueil et d'intro, `NotesModal`, nudges, forçage du questionnaire. ⚠️ Ces pages décrivent l'état d'avant les chantiers 73/74 (06/09/2026), qui ont remanié les écrans participant : vérifier dans le code avant de s'appuyer sur un détail.

## Changements temporaires (à remettre)

### GitHub Pages — `cancel-in-progress: false` (2026-06-03)
Le workflow `.github/workflows/deploy.yml` a `cancel-in-progress: false` (anciennement `true`). Ce changement évite qu'un déploiement en cours soit annulé par un commit suivant, ce qui causait une fenêtre de 404 pendant le redéploiement. Le CDN Fastly de GitHub Pages met en cache les 404 (`Cache-Control: max-age=600`), rendant le site inaccessible jusqu'à expiration du cache. **Ne pas repasser à `true`.**

---

## Sous-projet : Transcription des débats

Dossier `transcription-debat/` — **outil offline autonome**, indépendant de l'app web (Whisper + croisement du log Ecclesia + anonymisation + correction Gemini). Doc dédiée : [`transcription-debat/CLAUDE.md`](./transcription-debat/CLAUDE.md).

> 📎 Résumé du pipeline, de la stack et des plans archivés : [`docs/reference-transcription.md`](./docs/reference-transcription.md).

## Reste à faire (éventuel)

> 📎 Déplacé en [annexe B de `docs/chantiers.md`](./docs/chantiers.md) au chantier 78, avec les items encore ouverts repris de `PROJECT_STATUS.md`. Un seul endroit pour le reste-à-faire, comme pour le suivi.
