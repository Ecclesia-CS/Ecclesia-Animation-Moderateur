# CLAUDE.md — Ecclesia · Modérateur de débat

> **Terminologie** : "table" = cercle de débat modéré. "session"/"séance" (`sessions`) = conteneur optionnel regroupant plusieurs tables.

Voir [PROJECT_STATUS.md](./PROJECT_STATUS.md) pour l'état courant des chantiers (statut, contributeur, dépendances) et `ecclesia_plan_chantiers.md` pour le détail des tâches. À tenir à jour au fil des PR — sert de point de synchronisation entre contributeurs.

Ce dépôt contient **deux projets** :
1. **L'app web de modération** (racine `src/`) — le présent CLAUDE.md.
2. **La transcription des débats** (`transcription-debat/`) — pipeline Python **offline** (Whisper + croisement log Ecclesia + anonymisation + correction Gemini). Doc dédiée : [transcription-debat/CLAUDE.md](./transcription-debat/CLAUDE.md). Voir la section [Sous-projet transcription](#sous-projet--transcription-des-débats) ci-dessous.

---

## Stack & Déploiement

React 18 + Vite + TypeScript · Tailwind CSS v3 · Supabase (PostgreSQL + Auth anonyme + Realtime) · dnd-kit · GitHub Pages

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<clé publique anon>
```

### Accès MCP Supabase — règle SQL (2026-09-01)

**Une session de chantier n'applique plus jamais de migration SQL elle-même**, qu'un accès MCP Supabase soit disponible ou non dans la session. Elle écrit la migration dans `supabase/migrations/` et **documente dans `A_VERIFIER.md`** le chemin du fichier et ce qu'il change. C'est la **session de vérification dédiée** qui applique le SQL (SQL Editor du dashboard ou MCP) et met à jour l'entrée correspondante. Ne pas présumer d'un accès MCP Supabase direct pour une session de chantier — l'affirmation inverse, qui figurait ici, était périmée.

`vite.config.ts` a `base: '/Ecclesia-Animation-Moderateur/'` — **ne pas supprimer**.

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

**Règle pour les états asynchrones du cycle de séance** (`draft → pre_voting → voting → allocating → debating → closed`, et transitions Realtime en général) :

Ne **jamais** enchaîner une action (clic, RPC déclenchant un changement de phase) avec une vérification immédiate. L'app elle-même n'attend jamais une transition instantanément — elle combine Realtime + polling de secours (5-10s selon l'écran, voir `AllocatingScreen`/`VoteScreen`). Le test navigateur doit reproduire cette tolérance : après une action qui déclenche un changement d'état (phase de séance, apparition d'un participant, mise à jour d'une file d'attente...), **relire l'état affiché en boucle bornée** (`read_page`/`get_page_text`, intervalle ~1-2s, jusqu'à ~15-20s de plafond) jusqu'à observer le résultat attendu, plutôt que de cliquer ou d'asserter juste après l'action. Un échec après le plafond est un vrai signal (bug ou régression Realtime) — ne pas l'ignorer en relançant indéfiniment.

### Points à vérifier humainement — `A_VERIFIER.md`

Après tout test navigateur, ou toute implémentation dont le comportement reste incertain (edge case non couvert, résultat visuel à confirmer, comportement ambigu sur peu de données), consigner une entrée dans [A_VERIFIER.md](./A_VERIFIER.md) avec la date, le fichier concerné, et une description courte du point à vérifier. Ne jamais supprimer une entrée de ce fichier sans confirmation explicite de l'utilisateur — se contenter de la déplacer en section "Validé" une fois la confirmation obtenue. Le fichier est commité avec les changements de code concernés (pas de `.gitignore`) pour rester visible par les autres contributeurs.

---

## Modèle de données

### `app_config` — zéro RLS, SECURITY DEFINER uniquement
`key` (PK) / `value` (bcrypt hash). Clés : `creation_code_hash`, `superadmin_code_hash`.

### `sessions`
`id`, `title`, `description?`, `scheduled_at?`, `join_code?` (6 hex unique parmi non-fermées), `phase` (`draft`|`pre_voting`|`voting`|`allocating`|`debating`|`closed`), `doc_info_url?`, `doc_summary_url?`, `doc_collab_url?`, `moderation_policy` (`open`|`closed`|`ai`, défaut `closed`), `phase_changed_at?`, `group_names` (jsonb, défaut `[]`) — tableau `GroupNameResult[]` persisté en DB par `update_group_names` (superadmin) et lu par les participants via `select('*')`

Phase order : `draft → pre_voting → voting → allocating → debating → closed`
- `pre_voting` : vote ouvert à distance, `attending_in_person = false` par défaut. Pas d'onboarding.
- `voting` : vote présentiel uniquement — confirmation présentielle requise. Clustering filtre `attending_in_person = true`.
- **Chantier 39** : la phase `questionnaire` a été supprimée de l'énumération — voir « Nomenclature des phases côté participant » plus bas pour la correspondance à jour et le mécanisme de déclenchement automatique du questionnaire post-débat.

### `tables`
`id`, `join_code` (UNIQUE, 6 hex), `created_by` (auth.uid()), `current_speaker_id?` (FK→participants), `current_turn_started_at?`, `session_id?` (FK→sessions ON DELETE SET NULL), `leaderless` (boolean, défaut `false`)

### `participants`
`id`, `table_id` (CASCADE), `user_id`, `pseudo`, `created_at`
Contrainte : `UNIQUE(table_id, pseudo)`. **Un même `user_id` peut avoir plusieurs lignes** (pseudos différents). Tout `WHERE user_id = auth.uid()` doit utiliser `LIMIT 1` ou JOIN via `current_speaker_id`.

### `queue_entries`
`id`, `table_id` (CASCADE), `participant_id` (CASCADE), `queue_type` (`'long'`|`'interactive'`), `position`, `created_at`
Contrainte : `UNIQUE(table_id, participant_id, queue_type)`

### `questionnaire_responses`
`id`, `table_id?`, `session_id?`, `user_id` (NOT NULL), `theme_ideas?`, `theme_ratings` (jsonb), `debate_attended?`, `debate_rating?`, `staff_interest?`, `feedback?`
Index unique `(user_id, table_id) WHERE table_id IS NOT NULL`

### `speaking_turns`
`id`, `table_id` (CASCADE), `participant_id` (CASCADE), `started_at` (NOT NULL, posé par serveur), `ended_at?` (NULL = en cours), `source` (`'long'`|`'interactive'`|`'manual'`)

### `session_members` — Bloc C
`id`, `session_id` (CASCADE), `user_id`, `pseudo`, `created_at`, `joined_phase?` (text), `attending_in_person` (boolean, défaut `false`), `reclaim_code?` (text, plain — code 4 chiffres généré côté client lors de l'inscription en `pre_voting`), `is_moderator` (boolean, défaut `false` — chantier 19)
Contraintes : `UNIQUE(session_id, user_id)`, `UNIQUE(session_id, pseudo)`.
- `attending_in_person = false` → inscrit en pré-vote depuis chez soi. Exclu du clustering.
- `attending_in_person = true` → a confirmé sa présence physique (`confirm_attendance`). Inclus dans le clustering.
- `is_moderator = true` → **modérateur POUR CETTE séance**. Critère dur de l'allocation v2 (détermine le nombre de tables animées) ; le membre n'occupe pas de siège mais ses votes alimentent l'analyse des camps. Posé hors onboarding : `claim_moderator_status` (mot de passe Ecclesia) ou `set_member_moderator` (superadmin). **À ne pas confondre** avec `questionnaire_responses.staff_interest` (« je voudrais être modérateur à une séance future »), signal de recrutement purement informatif.

### `entry_responses` — Bloc C
`id`, `session_id` (CASCADE), `member_id` (CASCADE→session_members), `consent_transcript` (règle 2), `participation_style` (`listener`|`active` — règle 1), `ecclesia_experience` (**boolean** — règles 4/5), `created_at`
Contrainte : `UNIQUE(session_id, member_id)`.
**Chantier 19 (G3)** : onboarding réduit de 6 à 3 questions. `moderator_pref`, `group_size_pref` et `openness_to_diff` sont **supprimées** ; `ecclesia_experience` est passée de `text` (`never`|`once_twice`|`several_times`) à `boolean` (« As-tu déjà fait un débat Ecclesia ? »). Chaque colonne restante alimente une règle de l'allocation — ne pas en ajouter sans usage algorithmique.

### `assertions` — Bloc C
`id`, `session_id` (CASCADE), `member_id` (CASCADE→session_members), `content`, `status` (`pending`|`approved`|`rejected`), `created_at`

### `assertion_votes` — Bloc C
`id`, `assertion_id` (CASCADE), `session_id` (CASCADE), `member_id` (CASCADE→session_members), `vote` (`agree`|`disagree`|`pass`), `created_at`
Contrainte : `UNIQUE(assertion_id, member_id)`.

### `assertion_merges` — Chantier 18 / F24
`id`, `session_id` (CASCADE), `keep_id` (CASCADE→assertions), `reject_id` (CASCADE→assertions), `keep_content_before`, `keep_content_after`, `reject_content`, `flipped_votes` (jsonb), `inserted_member_ids` (jsonb), `reason?`, `created_at`, `reverted_at?`
Zéro policy RLS — accès exclusivement via `apply_assertion_merge` / `revert_assertion_merge` / `list_assertion_merges` (SECURITY DEFINER + mot de passe superadmin), même modèle qu'`app_config`.
**Pourquoi cette table** : `merge_assertion_votes` n'est pas réversible par calcul — il écrase des votes existants (`disagree`/`pass` → `agree`) sans mémoriser leur valeur d'avant et insère des lignes indiscernables d'un vote légitime. Le **delta** (`flipped_votes` = votes basculés avec leur valeur précédente, `inserted_member_ids` = votes créés par le transfert) doit donc être capturé au moment de la fusion. On stocke un delta et non un instantané complet, précisément pour que les votes exprimés **après** la fusion ne soient pas écrasés par l'annulation.

### `table_assignments` — Bloc C
`id`, `session_id` (CASCADE), `member_id` (CASCADE→session_members), `table_number` (int), `table_id?` (FK→tables ON DELETE SET NULL), `created_at`
Contrainte : `UNIQUE(session_id, member_id)`.

### `private_notes`
`id`, `user_id` (NOT NULL), `content` (text), `updated_at`, `table_id?` (FK→tables ON DELETE CASCADE), `session_id?` (FK→sessions ON DELETE CASCADE)
Index partiels : `UNIQUE(session_id, user_id) WHERE session_id IS NOT NULL` ; `UNIQUE(table_id, user_id) WHERE table_id IS NOT NULL AND session_id IS NULL`.
RLS : owner-only (`user_id = auth.uid()`).
Usage : notes privées par participant. En phase vote → keyed par `session_id`. En phase débat avec table rattachée à une séance → aussi keyed par `session_id` (notes persistantes vote→débat). Table seule sans séance → keyed par `table_id`.

---

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
- Le superadmin n'étant membre d'aucune séance, il ne reçoit **plus aucun événement Realtime** sur ces deux tables. La vue Groupes compense par un polling 10 s (`allocating`/`debating`) ; l'abonnement Realtime est conservé mais dormant.
- Effet de bord souhaitable : `REPLICA IDENTITY FULL` fait toujours transiter toutes les colonnes dans le WAL, mais Realtime applique la RLS avant livraison — `reclaim_code` ne part plus qu'au propriétaire de la ligne.

### Fonctions SECURITY DEFINER

| Fonction | Rôle |
|---|---|
| `is_table_participant(uuid)` | Helper RLS anti-récursion |
| `is_table_moderator(uuid)` | **Chantier 60** — helper d'autorité d'animation, anti-récursion (`SECURITY DEFINER STABLE`, `search_path = public, extensions`). Vrai si l'appelant est le **créateur** de la table (`tables.created_by`) **ou** un membre de la séance marqué `session_members.is_moderator` **et** affecté à **cette table précise** (`table_assignments`) — les deux conditions de la 2ᵉ branche sont cumulatives. Utilisé par `grant_floor`, `end_turn`, `end_turn_and_advance`, `kick_participant`, `add_offline_participant`, `add_to_queue`, `move_queue_entry`, `reorder_queue_entry`, `correct_turn`, et par 7 policies RLS (`tables_update_moderator`, `tables_delete_moderator`, `queue_entries_*`, `speaking_turns_*`). **Ne jamais réintroduire un test direct `created_by = auth.uid()` dans une garde d'animation** : `apply_allocation`/`create_tables_batch` posent `created_by` = l'uid du **superadmin**, pas celui du modérateur assis |
| `is_own_session_member(uuid)` | **Chantier 50** — helper RLS anti-récursion pour `table_assignments` (`SECURITY DEFINER STABLE`, `search_path = public, extensions`). Vrai si la ligne `session_members` visée appartient à l'appelant. Nécessaire parce que la policy de `table_assignments` doit lire `session_members`, elle-même sous RLS |
| `create_table(pseudo, creation_code, session_id?, leaderless?)` | Crée table + participant. Si `leaderless=true`, le code Ecclesia n'est pas vérifié et la table n'a pas d'animateur |
| `join_table(join_code, pseudo)` | ON CONFLICT → transfère user_id (retour autre appareil) |
| `reclaim_moderator(join_code, creation_code)` | Reprend la modération |
| `grant_floor(table_id, participant_id, source)` | Clôt tour ouvert + ouvre nouveau |
| `end_turn(table_id)` | Pose ended_at, vide current_speaker_id |
| `end_turn_and_advance(table_id)` | Clôt + accorde au suivant (interactive > long) en 1 transaction. Retourne `{current_speaker_id, current_turn_started_at, removed_queue_entry_id}` |
| `end_turn_as_speaker(table_id)` | Comme end_turn mais par l'orateur lui-même (JOIN via current_speaker_id) |
| `claim_floor(table_id)` | Tables leaderless uniquement — accorde la parole au premier en file si personne ne parle. Atomique (FOR UPDATE). Retourne `{current_speaker_id, current_turn_started_at, removed_queue_entry_id}` |
| `add_to_queue(table_id, participant_id, queue_type, position?)` | Idempotent. Si position fournie, décale les existants |
| `reorder_queue_entry(entry_id, new_position)` | Déplace atomiquement |
| `kick_participant(table_id, participant_id)` | Exclut + cascade |
| `correct_turn(turn_id, started_at, ended_at, participant_id)` | COALESCE — NULL = ne pas modifier |
| `create_session(password, title, description?, scheduled_at?, doc_*?)` | Crée une séance |
| `attach_table_to_session(password, table_id, session_id)` | Rattache |
| `detach_table_from_session(password, table_id)` | Détache |
| `close_session(password, session_id)` | phase → 'closed' |
| `list_session_tables(password, session_id)` | Tables rattachées (bypass RLS) — inclut `leaderless` |
| `list_available_tables(password, since?)` | Tables sans séance (48h) — inclut `leaderless` |
| `submit_questionnaire(table_id, ...)` | Upsert questionnaire_responses |
| `update_session_docs(password, session_id, doc_*?)` | Met à jour les 3 URLs docs |
| `register_session_member(session_id, pseudo, reclaim_code?)` | Inscrit l'utilisateur. En `pre_voting` : `attending_in_person=false` + stocke le code en clair. ON CONFLICT user → retourne existant ; pseudo pris → exception |
| `confirm_attendance(session_id, pseudo?, code?)` | Confirme présence présentielle. Cas 1 : caller déjà membre → marking attending. Cas 2 : code fourni → reclaim par `reclaim_code`. Cas 3 : pseudo fourni → reclaim ou création. L'un ou l'autre suffit. |
| `reclaim_prevoting_member(session_id, pseudo?, code?)` | **Chantier B3** — reconquête d'un profil `pre_voting` déjà inscrit (pseudo pris suite à une perte d'identité locale — User ID instable selon navigateur). Par pseudo ou code de rappel, l'un ou l'autre suffit. Phase-safe : exception si la séance n'est plus en `pre_voting`. **Ne touche jamais `attending_in_person`** (contrairement à `confirm_attendance`, à ne pas réutiliser ici — reconquête à distance, pas une confirmation de présence physique) — transfère uniquement `user_id`. |
| `submit_entry_response(session_id, ...)` | Upsert entry_responses |
| `submit_assertion(session_id, content)` | Insère assertion (status auto selon moderation_policy) |
| `cast_vote(assertion_id, vote)` | Upsert assertion_votes |
| `get_vote_results(session_id)` | Retourne assertions approved avec consensus_score |
| `approve_assertion(password, assertion_id)` | status → 'approved' |
| `reject_assertion(password, assertion_id)` | status → 'rejected' |
| `set_session_phase(password, session_id, phase)` | Change la phase (inclut `pre_voting`) |
| `run_clustering_v1(password, session_id, target_size?)` | Répartition aléatoire — **filtre `attending_in_person = true`** → table_assignments, phase → 'allocating'. Retourne `{table_count, member_count}`. **Chantier 37** : plus appelée par le frontend (modale « Répartir en tables » supprimée, cf. section Phase de vote) — conservée en base, inutilisée. |
| `run_clustering_v2(password, session_id, target_size?)` | Répartition hétérogène PCA — **filtre `attending_in_person = true`** → table_assignments, phase → 'allocating'. Retourne `{table_count, member_count}`. Les membres présents sans votes sont distribués aléatoirement. **Chantier 37** : idem, plus appelée par le frontend. |
| `update_session_config(password, session_id, moderation_policy)` | Met à jour la politique de modération. `moderation_policy` ∈ `('open','closed','ai')`. **Chantier 22 / G14** : ne prend plus `vote_timer_minutes`/`vote_threshold_percent` — colonnes supprimées, timers de phase retirés de l'app (gestion de la durée entièrement manuelle, hors application) |
| `update_group_names(password, session_id, group_names)` | Persiste les noms de groupes Gemini en DB (`sessions.group_names`). Appelé par `SuperadminScreen` après chaque génération Gemini (en parallèle du localStorage). |
| `assign_table_to_group(password, session_id, table_number, table_id?)` | Rattache une table physique à un groupe logique (NULL = désassigner). Met aussi à jour `tables.session_id`. |
| `get_all_votes_for_analysis(password, session_id, attending_only?)` | Retourne tous les votes avec `attending_in_person` par vote. Si `attending_only=true` : filtre présentiels uniquement. |
| `get_session_voting_stats(password, session_id)` | Retourne `{member_count, attending_count, remote_count, onboarded_count, voter_count, approved_assertion_count, total_votes}` |
| `merge_assertion_votes(password, keep_id, reject_id)` | Transfère les votes de `reject_id` vers `keep_id` : nouveaux votants insérés, conflits résolus (agree prime). **Chantier 18** : plus appelée par l'app (remplacée par `apply_assertion_merge`, qui fait la même chose *et* enregistre de quoi annuler). Conservée pour compatibilité. |
| `apply_assertion_merge(password, keep_id, reject_id, new_content?, reason?)` | **Chantier 18 / F24** — applique une fusion de façon **atomique** : enregistre le delta dans `assertion_merges`, réécrit éventuellement le contenu de l'assertion conservée (formulation combinée), transfère les votes, rejette l'assertion absorbée. Retourne l'`id` de la fusion. Remplace la séquence `update_assertion_content` → `merge_assertion_votes` → `reject_assertion`. |
| `revert_assertion_merge(password, merge_id)` | **Chantier 18 / F24** — annule une fusion : restaure la formulation d'origine (uniquement si le texte n'a pas été retouché depuis), retire les votes créés par le transfert, rend leur valeur aux votes basculés en `agree`, ré-approuve l'assertion absorbée. Retourne `{content_restored, votes_removed, votes_restored}`. Refuse une double annulation. |
| `list_assertion_merges(password, session_id)` | **Chantier 18 / F24** — historique des fusions d'une séance (contenu avant/après, assertion absorbée, `reverted_at`). Source de la section « Fusions effectuées » de `LLMModerationPanel`. |
| `update_assertion_content(password, assertion_id, content)` | **Chantier 7 / B4** — réécrit le contenu d'une assertion existante (conserve id/statut/votes). Utilisé par le bouton « Fusionner en formulation combinée » : remplace le texte de l'assertion conservée par la formulation qui réunit les deux. Migration `20260722_update_assertion_content.sql`. |
| `get_allocation_inputs(password, session_id)` | **Chantier 19** — entrées de l'algo v2 en un aller-retour : membres présentiels + attributs d'onboarding + `group_id` de la dernière analyse `done` + `is_moderator`. Bypass de la RLS owner-only d'`entry_responses`. Retourne `{members, opinions_available, analysis_id}` — `opinions_available = false` → **règle 3 désactivée côté client, sans exception** (contrairement à `run_clustering_v2`/`v3`). |
| `apply_allocation(password, session_id, tables)` | **Chantier 19** — persiste le résultat calculé côté client. Réutilise les tables déjà rattachées (ordre `join_code`), crée les manquantes, aligne `tables.leaderless` sur `moderated`, remplace `table_assignments`, phase → `allocating`. Les modérateurs sont écrits dans `table_assignments` comme les autres — c'est `session_members.is_moderator` qui les distingue. **Chantier 25 (H18)** : détache aussi (`session_id = NULL`) les tables excédentaires **vides** laissées par un calcul précédent plus large — sans ça elles restaient rattachées et ressurgissaient via `list_session_tables` alors qu'elles n'apparaissent pas dans l'onglet Groupes (construit depuis `table_assignments`). Une table déjà rejointe par un participant n'est jamais détachée, seulement comptée dans `tables_orphaned`. |
| `create_tables_batch(password, session_id, leaderless[])` | **Chantier 19 / G2** — crée N tables vides (join codes générés, `session_id` renseigné, un `leaderless` par table). `create_table` exige un pseudo et crée un participant → inutilisable pour ça. Plafond 60 tables. |
| `set_member_moderator(password, session_id, member_id, is_moderator)` | **Chantier 19 / G4** — marque/démarque un membre comme modérateur de la séance (fallback superadmin, depuis la liste des participants — distinct de `assign_moderator_to_table` qui cible une table précise). **Chantier 37** : quand `is_moderator=true`, assied aussi le membre sur la première table animée sans modérateur (même logique que `claim_moderator_status`) — avant ce fix, poser le flag depuis cette liste ne déplaçait jamais personne, un modérateur assis à une table déjà pourvue restait invisible côté tableau de bord tant que le superadmin ne le déplaçait pas à la main. |
| `list_table_assignments_admin(password, session_id)` | **Chantier 50** — composition des tables d'une séance (`table_number`, `member_id`, `table_id`, `pseudo`, `is_moderator`), triée par `table_number`. Seule lecture croisée `table_assignments` × `session_members` possible depuis que les deux tables sont en self-only : le superadmin n'est membre d'aucune séance. Source de la vue Groupes (`SuperadminScreen.loadGroups`) |
| `claim_moderator_status(session_id, creation_code)` | **Chantier 19 / G4** — auto-déclaration via le mot de passe Ecclesia. Le membre doit déjà être inscrit à la séance. Prêt pour le flow UI du chantier 21. |

**RLS Realtime** : `REPLICA IDENTITY FULL` sur les tables suivantes — obligatoire pour que les événements filtrés (DELETE et UPDATE avec RLS) arrivent aux subscribers :
- `tables`, `participants`, `queue_entries`, `speaking_turns` (migration `core_functions`)
- `table_assignments` (migration `20260530`) : sans ça, un UPDATE de `table_id` seul ne transmet pas `session_id` dans le WAL → le filtre Realtime `session_id=eq.<id>` ne peut pas matcher
- `sessions` (migration `20260615`) : sans ça, les UPDATE de phase (draft→voting, allocating→debating) ne sont pas livrés aux participants → les transitions de phase nécessitaient un reload manuel

Les tables Bloc C (`session_members`, `assertions`, `assertion_votes`, `table_assignments`) sont dans la publication Realtime — pas de broadcast custom, Realtime natif uniquement.

---

## Architecture TypeScript

```
src/
├── lib/
│   ├── supabase.ts       Client Supabase
│   ├── types.ts          Session, Table, Participant, QueueEntry, SpeakingTurn, QuestionnaireResponse
│   │                     + SessionMember, EntryResponse, Assertion, AssertionVote, VoteResult, TableAssignment
│   │                     + ModerationPolicy, ModerationResult, MergeResult, GroupNameResult (sprint IA)
│   ├── sessions.ts       Wrappers RPC séances (verifyPassword, createSession, closeSession, attach/detach, listSessionTables, listAvailableTables, updateSessionDocs)
│   │                     + chantier 50 : listTableAssignmentsAdmin (composition des tables pour la vue Groupes)
│   ├── voting.ts         Wrappers RPC Bloc C (registerSessionMember, confirmAttendance, submitEntryResponse, submitAssertion, castVote, getVoteResults, approve/rejectAssertion, setSessionPhase, updateSessionConfig, assignTableToGroup, listAssertionsAdmin)
│   │                     + chantier 19 : loadAllocationInputs, applyAllocation, createTablesBatch, setMemberModerator, claimModeratorStatus
│   ├── allocation.ts     **Chantier 19 (G1)** — algorithme d'allocation v2, 100 % pur (aucun React/Supabase), spec `docs/chantier-5-allocation-v2-spec.md`.
│   │                     `runAllocation(input)` : 5 règles en **ordre lexicographique strict** (actifs ≥ min(⌈2/5·taille⌉,4) · ≥1 table enregistrable · hétérogénéité ≤70 %/2e camp ≥2 · anciens ≥ ⌈2/5·taille⌉ · nouveaux aux tables animées). Contraintes dures : N≤10 → table unique ; sinon 5..10, dépassement ≤20 seulement s'il améliore strictement la règle 1.
│   │                     `diagnoseAllocation(tables, members, opinionsAvailable)` : recalcul des seuils après retouche manuelle (tableau de bord en direct).
│   │                     **Ne peut jamais échouer** : dégradation par l'ordre lexicographique (règle 5 sacrifiée d'abord, règle 1 en dernier). Recherche locale **déterministe** (graine fixe `DEFAULT_SEED`) et budget d'évaluations borné. Tests : `src/lib/allocation.test.ts` (`npm test`, 49 cas).
│   │                     **Chantier 25b (H17)** : un modérateur en surplus (plus de modérateurs que de tables animées) redevient un **participant ordinaire** et entre dans la population **avant** la recherche — il est donc optimisé par les règles 1 à 5 comme n'importe qui, jamais laissé sans affectation ni casé après coup. La circularité (asseoir quelqu'un change le nombre de tables, donc le surplus) est levée par **énumération** du nombre `k` de modérateurs qui animent : on part de `k = M` et on redescend `k` au nombre de tables produit tant que `k > T`. `k` décroît strictement, la boucle termine, `k = 0` est toujours cohérent. Entrée `moderatorProfiles` = attributs réels de ces modérateurs (toujours fournie par `loadAllocationInputs`). Sorties : `seatedModeratorIds`, `animatingModerators`, `recorderTarget`.
│   ├── gemini.ts         Client Edge Function Gemini (moderateAssertions, mergeAssertions, nameIdeologicalGroups, nameSingleGroup) — jamais d'appel direct à api.google.com
│   ├── analysis.ts       PCA + k-means côté navigateur (runOpinionAnalysis, loadVotesForAnalysis, loadLatestAnalysis, saveAnalysisResult, loadResultsMap). `ResultsMapData` inclut `repness`, `group_consensus`, `all_assertions` (depuis migration `20260621`). Score repness : `(mean_vote_in_group − mean_vote_out_group) × n_votes_réels_groupe`. `loadVotesForAnalysis` accepte `attendingOnly?: boolean`.
│   ├── groupNaming.ts    Orchestration du nommage des camps (Gemini + repli descriptif). `namingGroupsFromAnalysis(members)` — **seule** façon autorisée de construire la liste à nommer (invariant : `table_number` = `group_id + 1`, cf. « Ne jamais faire »). `discriminatingAssertions()` — top 3 des assertions où un camp s'écarte du reste, envoyées en `divisive_assertions` à Gemini (chantier 28 / H9). `groupsFingerprint()` — empreinte de composition, évite de rappeler Gemini. Tests : `src/lib/groupNaming.test.ts` (12 cas).
│   ├── storage.ts        tableStore.get/set/clear (localStorage) + lastNameStore.get/set (dernier nom prénom saisi, préremplit les formulaires d'identité — D7)
│   ├── phaseLabels.ts    **Chantier 39** — nomenclature des phases côté participant (`PARTICIPANT_PHASE_STEPS`, `participantPhaseStep()`), distincte des libellés superadmin. Voir « Nomenclature des phases côté participant ».
│   └── utils.ts          formatDuration, extractErr, generateTableCSV, generateQuestionnaireCSV
├── hooks/
│   ├── useLiveMs.ts      setInterval 500ms → Date.now()
│   └── useTranscription.ts  ⚠️ LEGACY — reliquat du mode transcription *live* (WebSocket → backend temps réel). Le backend live a été supprimé le 2026-06-30 (transcription 100% offline désormais). Le hook et son bouton dans ModeratorView.tsx (l.180-599) sont morts tant qu'aucun serveur live ne tourne — à retirer ou réactiver selon décision.
├── context/TableContext.tsx  État, Realtime, Broadcast, polling, toutes les actions
├── screens/
│   ├── EntryScreen.tsx         Section "Séances en cours" (polling 30s, phases pre_voting/voting/allocating/debating) + tabs Rejoindre/Reprendre/Créer + lien Administration
│   ├── SuperadminScreen.tsx    Auth sessionStorage, liste séances, clustering, ModerationPolicyEditor, LLMModerationPanel, nommage groupes Gemini. `SessionDetail` organisé en 4 onglets (🟢 En direct / 🪑 Tables / ⚙️ Préparation / 📊 Analyse). Persistance séance ouverte via `sessionStorage` (clé `ecclesia_superadmin_session`). Persistance onglet actif via `sessionStorage` (clé `ecclesia_admin_tab_<session.id>`, fallback `defaultTab(phase)`). Exports CSV + toggle questionnaire dans l'accordéon "Actions post-séance" (onglet Analyse). Stats présentiels/distance dans `VotingStatsPanel`.
│   ├── SessionRouterScreen.tsx Routeur intelligent #session/<join_code> — redirige selon phase (pre_voting/voting/allocating → #vote/, debating → check member → #vote/ ou message) ; phase=closed → membre sans réponse au questionnaire post-débat → `SessionQuestionnaireForm`, sinon ResultsMapScreen (membre) ou PublicResultsScreen (visiteur) — chantier 39
│   ├── VoteScreen.tsx          Flow vote participant. En `pre_voting` : pseudo → ReclaimCodeDisplay → vote (pas d'onboarding). En `voting` : VotingEntryForm (nom prénom OU code, reclaim auto si nom déjà pris) → **onboarding (entry_responses)** → vote → AllocatingScreen. Confirmation présentielle (known_user, même appareil) via AttendanceConfirmScreen, puis onboarding si pas déjà répondu. Champs identité (nom prénom) préremplis via `lastNameStore` (D7) — voir `lib/storage.ts`.
│   ├── AllocatingScreen.tsx    Post-vote : affectation groupe, code table, nom du camp (DB via session.group_names en priorité, localStorage fallback), bouton rejoindre. Affiche VoteResultsSummary + accordéon "Voir toutes les assertions"
│   ├── ResultsMapScreen.tsx    Écran résultats post-clôture (participant inscrit). Charge en parallèle : scatter PCA (`loadResultsMap`), affectation groupe (`getMyTableAssignment`), assertions (`getVoteResults`). Affiche : carte groupe (couleur du groupe, nom+description depuis session.group_names), section "Ce qui vous caractérise" (top repness du groupe), scatter avec légende nommée, "Les autres camps" (top repness par groupe), "Points de clivage" (spread repness inter-groupes), "Points de consensus". Fallback sans analyse PCA : dissensus via consensus_score. Couleur et nom du camp du participant basés sur `selfGroupId` (cluster k-means 0-indexé depuis `data.points`) — **NE PAS** utiliser `assignment.table_number` pour la recherche du nom Gemini car `table_number` est la table physique de débat, sans correspondance garantie avec le cluster k-means. Bouton "← Retour au menu" (hash='') en bas de page — permet de rejoindre une nouvelle séance depuis cet écran.
│   ├── CollabDocScreen.tsx     Document collaboratif de sources (#collab/<join_code>)
│   ├── TableView.tsx           Routage isModerator
│   ├── ModeratorView.tsx       Vue projetable (DndContext, auto-avancement, pause). Overlay "Séance terminée" + bouton "Voir les résultats →" (#session/<join_code>) + bouton "← Retour au menu" (hash='') quand session.phase=closed
│   └── ParticipantView.tsx     Vue mobile. Overlay "Séance terminée" + bouton "Voir vos résultats →" (#session/<join_code>) + bouton "← Retour au menu" (hash='') quand session.phase=closed
└── components/
    ├── voting/
    │   ├── LLMModerationPanel.tsx    Panneau IA superadmin : modération/fusion manuelle+auto, log tokens, fusions effectuées
    │   ├── AllocationPanel.tsx       **Chantier 19** — déclenchement manuel de l'allocation v2 en phase `allocating` (§7 : rien d'automatique à l'entrée en phase). Charge les entrées, calcule en local, affiche la proposition + avertissements, puis `applyAllocation` crée les tables. Saisies optionnelles : modérateurs à ajouter, enregistreurs disponibles.
    │   │                             **Chantier 25/25b/25c** : la proposition et les saisies sont persistées en `sessionStorage` (clé `ecclesia_alloc_preview_<sessionId>`, jamais en base) — elles survivent au changement d'onglet et au rechargement (H14). Liste à cocher des modérateurs présents (H16) : **décocher est une sélection purement locale**, aucun appel réseau ni recalcul automatique. Tout est différé au clic sur « Appliquer », qui recalcule avec la sélection, crée les tables, **puis seulement en cas de succès** retire `is_moderator` aux décochés — jamais de statut perdu sans tables créées. Horodatage « calculé à HH:MM:SS » (H13) et objectif d'enregistrement effectif affiché (H15).
    │   ├── TableDiagnosticsList.tsx  **Chantier 19** — tableau de bord d'une liste de tables : composition par camp (barre colorée), 4 badges de seuil, badge enregistrable. Purement présentationnel → le parent passe des diagnostics recalculés, d'où la « mise à jour en direct » après glisser-déposer.
    │   ├── TableAssignmentCard.tsx   Carte groupe + nom camp (prop groupName) + join_code + bouton rejoindre
    │   ├── VoteResultsSummary.tsx    Résumé des votes — top 3 consensus + 2 dissensus (assertions + consensus_score)
    │   └── VoteResultsList.tsx       Liste complète de toutes les assertions approuvées, triée par consensus_score décroissant
    ├── AnalysisPanel.tsx         Scatter PCA, assertions clivantes/consensuelles. Props: groupNames?: GroupNameResult[], totalMembers?: number, sessionPhase?: string. Section Automatisation : toggle auto-analyse + slider 1-15 min (actif si phase=voting ou pre_voting). Légende scatter : nom + description du groupe (depuis groupNames). En-têtes "Assertions clivantes" : nom + description en gris sous le nom coloré. Toggle "Tous les votants / Présentiels uniquement" : recharge les votes avec `attendingOnly=true`, recalcule repness/consensus localement sans sauvegarder.
    ├── SpeakerTimer.tsx          Chrono avec offsetMs
    ├── QueuePanel.tsx            File DnD (useDroppable + SortableContext + ghostId)
    ├── ReadOnlyQueuePanel.tsx    File lecture seule (participants)
    ├── ParticipantsTable.tsx     Temps cumulés + drag handles + Exclure
    ├── ParticipantsSidebar.tsx   Liste temps réel (dark/light)
    ├── CorrectTurnModal.tsx      Historique tours
    ├── ConfirmModal.tsx          Confirmation générique
    ├── QuestionnaireModal.tsx    6 questions, 26 thèmes aléatoires, upsert RPC
    ├── QuestionnaireFab.tsx      Bouton header → QuestionnaireModal
    ├── ParticipantToolsButton.tsx Panneau Outils (débat) : documentation, résultats du vote (modal VoteResultsList, lazy-loaded, visible si table.session_id non-null), notes, questionnaire
    ├── DocumentationButton.tsx   Dropdown 3 liens ; masqué si aucune URL
    └── PhaseIndicator.tsx        **Chantier 39** — pill "Étape N · Libellé" (voir `lib/phaseLabels.ts`). Prop `floating` : pill fixe façon `QuitLink` (coin opposé) pour les écrans sans en-tête propre ; sinon rendu inline (à intégrer dans l'en-tête existant de l'écran appelant).
```

### Edge Functions Supabase

```
supabase/functions/
└── gemini-proxy/index.ts   Proxy Gemini Flash (gemini-2.5-flash-lite)
                             Actions : moderate | merge | name_groups
                             Auth : JWT Supabase via getUser()
                             Clé : GEMINI_API_KEY (secret Supabase)
                             Chantier 57 : quota 20 appels/60s par user_id (compteur en
                             mémoire, pas de table Postgres — voir commentaire en tête du
                             fichier) → 429 ; plafond de charge utile 300 Ko → 413. Messages
                             extraits côté client par `extractGeminiError()` (src/lib/gemini.ts)
                             car `FunctionsHttpError` masque le corps JSON derrière un message
                             générique pour toute réponse non-2xx.
```

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

### TableContext — état exposé
```typescript
table, participants, queueLong, queueInteractive, speakingTurns, myParticipant, isModerator
leaveTable, endTable
grantFloor, endTurn, endTurnAsSpeaker, endTurnAndAdvance, claimFloor
addToQueue, removeFromQueue, moveQueueEntry, reorderQueueEntry, changeQueueType
correctTurn, kickParticipant
```

Realtime : 1 channel `table:<id>`, 4 `postgres_changes` + 1 broadcast `refresh` + monitoring WebSocket.

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
Pour les tables `leaderless`, `isModerator` est toujours `false` — le créateur rejoint en tant que participant normal. Le listener Realtime skipppe la mise à jour de `isModerator` si `row.leaderless`.

### Tables leaderless (`table.leaderless = true`)
Tout le monde voit `ParticipantView`. Pas de modérateur. Flux de parole :
1. Participant appuie "Demander la parole" → entre en file
2. `useEffect` dans `ParticipantView` détecte : leaderless + personne ne parle + je suis premier → appelle `claimFloor()` (RPC atomique, silencieux si race condition)
3. Quand on a la parole, bouton "J'ai fini de parler" visible → appelle `endTurnAndAdvance` → donne la parole au suivant
4. Création via EntryScreen (checkbox "Table sans animateur", pas de code Ecclesia requis) ou bouton "+ Sans admin" dans le superadmin
5. Badge jaune "Sans animateur" dans la vue superadmin

### Realtime latence — 4 couches
1. Mise à jour locale immédiate après RPC
2. Broadcast `{event:'refresh', payload:{tables}}` → tous les clients refetch
3. Polling 5s (rattrapage broadcasts manqués)
4. Monitoring WebSocket (`CHANNEL_ERROR`/`TIMED_OUT` → reload complet)

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
6. **`closed`** → superadmin clique pour clôturer. **Chantier 39** : la phase `questionnaire`, qui s'intercalait ici comme étape manuelle dédiée, a été supprimée de l'énumération `sessions.phase`. Le passage `debating → closed` déclenche désormais automatiquement `force_session_questionnaire` (même effet que l'ancien passage manuel en phase `questionnaire` : force le modal chez les participants encore connectés à une table de la séance — `handlePhaseChange`, `SuperadminScreen.tsx`). Un membre inscrit qui revient sur `#vote/<join_code>` ou `#session/<join_code>` après clôture sans avoir répondu se voit proposer `SessionQuestionnaireForm` avant l'écran de résultats — gate sur l'absence de ligne dans `questionnaire_responses` (`hasQuestionnaireResponse`, `lib/voting.ts`) plutôt que sur la phase. Voir « Nomenclature des phases côté participant » ci-dessous.

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
| 5 | Post-débat | `closed` (questionnaire post-débat inclus — plus de phase `questionnaire` séparée, voir point 6 du flux ci-dessus) |

`PhaseIndicator` ne rend rien en phase `draft` ou si la phase est absente/inconnue. Affiché dans `VoteScreen`, `AllocatingScreen`, `ParticipantView` (phase 4, uniquement si la table est rattachée à une séance — `table.session_id`), `ResultsMapScreen` et `SessionQuestionnaireForm` (phase 5 fixe, ce formulaire n'apparaissant plus qu'en post-clôture). Volontairement absent de `PublicResultsScreen` (visiteur non inscrit, hors « parcours participant ») et de `ModeratorView` (vue modérateur, hors périmètre du chantier).

### Navigation post-vote (AllocatingScreen)

- `join_table(join_code, pseudo)` → `TableResult`
- `tableStore.set({ tableId, participantId, joinCode, isModerator: false, pseudo })`
- Appel du callback `onTableJoined(tableId, participantId, false)` → `App.handleTableJoined` → `setPhase({ type:'table', ... })` + `history.replaceState` (nettoyage URL sans hashchange)
- Guard dans App.tsx : `hash.startsWith('#vote/') && phase.type !== 'table'` — dès que `phase` passe à `table`, le routing hash n'a plus priorité → TableView s'affiche sans reload
- **Compatibilité Messenger** : plus de `window.location.href` / `window.location.reload()`. Le fallback `href` reste si `onTableJoined` n'est pas fourni (usage standalone).
- **Pas d'étape intermédiaire "J'arrive"** : `TableAssignmentCard` ne prend plus de props `joined`/`onArrived` — le join et la navigation sont fusionnés en une seule action.

### Reconquête d'un pseudo pré-vote déjà pris (`PseudoForm` — chantier B3)

En phase `pre_voting`, si le pseudo saisi est déjà inscrit (perte d'identité locale — User ID instable selon navigateur), `PseudoForm` ne bloque plus avec une simple erreur : il bascule vers un écran de reconquête (onglets "C'est bien moi" / code de rappel) qui appelle `reclaim_prevoting_member` — jamais `confirm_attendance`, qui marquerait à tort `attending_in_person=true` pour un vote resté à distance. Symétrique à la reconquête déjà existante pour la phase `voting` (`VotingEntryForm`/`AttendanceConfirmScreen` + `confirm_attendance`), mais phase-safe et sans effet de bord sur la présence. Un succès saute l'écran d'affichage du code (`step === 'reclaim_code'` dans `VoteScreen`) — le code généré côté client pour la tentative en cours n'a jamais été persisté — et va directement au vote via `handlePseudoReclaimSuccess`.

### Polling de secours phase (VoteScreen + AllocatingScreen — Messenger/WebSocket indisponible)

`VoteScreen` ajoute un polling 10 s sur la phase de la séance pendant les étapes `waiting` et `vote`. Si le WebSocket Realtime est coupé (in-app browsers), la transition de phase est détectée dans les 10 s sans rechargement. L'étape `onboarding` bénéficie aussi d'une protection : `handleOnboardingSuccess` re-fetch la phase courante avant de décider la prochaine étape (évite une session périmée).

`AllocatingScreen` ajoute un polling 10 s sur la phase de la séance pendant l'étape `allocating`. Couvre la transition `allocating → debating` quand Realtime est indisponible — sans ça, le participant resterait bloqué sans voir le bouton "Rejoindre".

### Nom du camp dans AllocatingScreen — **supprimé (chantier 28 / H26)**

`AllocatingScreen` cherchait dans `group_names` l'entrée dont `table_number === assignment.table_number` et la passait à `TableAssignmentCard` via une prop `groupName`. **Retiré** : `group_names` est indexé par camp d'opinion (`group_id + 1`), pas par table physique — l'affichage montrait donc le nom d'un camp arbitraire. Et sous l'allocation v2 la table mélange plusieurs camps par construction, donc aucun nom de camp ne la décrit. `TableAssignmentCard` affiche à la place une phrase expliquant que la table réunit volontairement des avis différents ; le participant découvre son propre camp sur `ResultsMapScreen` en fin de séance.

Pour afficher « ton camp » dès la phase `allocating`, il faudrait une RPC dédiée : `analysis_members` est en RLS *no-select*, le participant ne peut pas lire son `group_id`.

---

## Modération IA (sprint Gemini Flash)

### Architecture
Toutes les fonctions IA passent **exclusivement** par l'Edge Function `gemini-proxy` — jamais d'appel direct à `api.google.com` depuis le frontend.

`src/lib/gemini.ts` → `supabase.functions.invoke('gemini-proxy')` → Gemini API

### Clés localStorage IA (par session.id)
| Clé | Contenu |
|---|---|
| `ai_log_<id>` | `LogEntry[]` max 50 FIFO — historique appels Gemini |
| `ai_tokens_day_<YYYY-MM-DD>` | `{ total_tokens, request_count }` — compteurs journaliers |
| `merge_log_<id>` | `MergeLogEntry[]` max 100 FIFO — **legacy chantier 18** : plus alimenté. L'historique des fusions est en base (`assertion_merges`). Encore affiché en lecture seule sous « Fusions antérieures (journal local) », avec une annulation *partielle* (ré-approbation seule, sans restauration du contenu ni des votes). Se vide naturellement. |
| `merge_proposals_<id>` | `ProposedMerge[]` — **chantier 7 / B4** — fusions PROPOSÉES par Gemini, en attente de validation humaine (self-contained : snapshot du contenu + `merged_content` optionnel). Aucune écriture en base tant que non validées. |
| `ai_rejected_ids_<id>` | `string[]` — UUIDs rejetés par l'IA (distinct des rejets manuels) |
| `ai_approved_ids_<id>` | `string[]` — UUIDs approuvés par l'IA (modération manuelle + auto). Badge "acceptée par IA" dans la vue Approuvées |
| `ai_auto_moderate_<id>` | `'true'/'false'` — toggle auto-modération |
| `ai_auto_interval_<id>` | nombre (minutes) — intervalle auto-modération (1-10) |
| `ai_auto_merge_<id>` | `'true'/'false'` — fusion automatique avant clustering |
| `ai_auto_merge_periodic_<id>` | `'true'/'false'` — toggle fusion périodique (setInterval) |
| `ai_auto_merge_interval_<id>` | nombre (minutes) — intervalle auto-fusion (1-30) |
| `analysis_auto_<id>` | `'true'/'false'` — toggle auto-analyse des camps |
| `analysis_auto_interval_<id>` | nombre (minutes) — intervalle auto-analyse (1-15) |
| `group_names_<id>` | `GroupNameResult[]` — noms Gemini des groupes |
| `group_names_fp_<id>` | string JSON — empreinte groupes pour éviter re-appel Gemini |

### Règles critiques IA
- **`group_names_fp_<id>`** : ne rappeler Gemini pour le nommage que si l'empreinte des groupes a changé (nouveau clustering) ou si aucun nom n'est stocké
- **Fallback nommage** : si Gemini retourne moins d'entrées que de groupes, compléter côté frontend avec `{ name: "Groupe N", description: "..." }` avant de stocker
- **Cache incomplet** : si l'empreinte correspond mais des noms manquent, appliquer le fallback localement sans rappeler Gemini (cas du retour sur une session existante avec cache stale)
- **Nommage par appels séquentiels** : `nameSingleGroup` est appelé une fois par groupe, séquentiellement (boucle `for...of` avec retry ×2). Chaque appel utilise l'action `name_single_group` de la Edge Function, qui retourne un **objet unique** `{ name, description }` via `responseSchema` — pas un tableau. Le fallback générique reste si les 2 tentatives échouent. La validation côté client rejette les noms du type `"Groupe N"` (regex `/^groupe\s*\d+$/i`) et déclenche le retry.
- **`responseMimeType: 'application/json'`** : passé dans `generationConfig` de l'appel Gemini pour forcer la sortie JSON native (évite les enrobages markdown)
- **`ai_rejected_ids_<id>`** : seules les assertions dans ce set s'affichent dans "Assertions rejetées par l'IA" — les rejets manuels n'y apparaissent pas
- **`ai_approved_ids_<id>`** : symétrique à `ai_rejected_ids`. Populé lors de `handleModerate` et de l'auto-modération (`addAiApprovedIds`). Utilisé par `AssertionsPanel` (via `aiLabelMap`) pour afficher le badge "acceptée par IA"
- **`LLMModerationPanel` — accordéon auto-ouvert** : `open` s'initialise à `true` si `readLog(session.id).length > 0` — l'historique est donc visible immédiatement au retour sur la page sans avoir à déplier manuellement
- **`PhaseBar` — navigation directe** : chaque cercle d'étape non-courant est un `<button>` qui appelle `onPhaseSelect(phase)`. La modal de confirmation existante gère l'affichage (titre "← Revenir" si `isBack`, "Passer en phase X" sinon). Les badges "fusionnée" / "modérée par IA" / "acceptée par IA" dans `AssertionRow` sont calculés par `aiLabelMap` (useMemo dans `AssertionsPanel`, lecture directe de localStorage)
- **Ne pas appeler `supabase.functions.invoke` sans vérifier `error` ET `data?.error`**
- **Sanitisation UUID merge** : `gemini-proxy` filtre les résultats `merge` avant retour — Gemini peut halluciner un UUID légèrement altéré (ex : premier tiret manquant). La validation côté Edge Function (regex UUID + présence dans les IDs d'entrée) est la première ligne de défense ; `LLMModerationPanel` ajoute un guard avant `rejectAssertion`. Ne pas supprimer ces validations.
- **Prescription vs jugement (chantier 18 / F23)** : `buildMergePrompt` impose une **étape de typage** avant toute comparaison — chaque assertion est PRESCRIPTION (propose une action), JUGEMENT (porte une appréciation) ou CONSTAT (affirme un fait) — et une règle absolue : **deux types différents ne fusionnent jamais**, même sujet identique et même orientation. Cause racine du bug : le durcissement du chantier 7 était bien déployé (v11) et n'a pas suffi ; empiler des contre-exemples ne remplace pas une règle catégorielle. Le `reason` renvoyé annonce le type commun → chaque proposition est auditable d'un coup d'œil. **Redéployer l'Edge Function après toute modification du prompt** (version courante : v12).
- **Fusion annulable (chantier 18 / F24)** : ne plus appeler `merge_assertion_votes` + `reject_assertion` à la main depuis le frontend — utiliser `apply_assertion_merge`, sinon la fusion est **définitive** (rien n'est enregistré pour la défaire). Voir la table `assertion_merges`.
- **Fusion en deux temps (chantier 7 / B4)** : la fusion n'écrit **plus jamais** en base sans validation humaine. « Analyser les doublons » empile des `ProposedMerge` dans `merge_proposals_<id>` (snapshot self-contained). Le modérateur valide chaque proposition : soit « garder ✅ telle quelle » (transfert de votes + `reject_assertion`), soit « ✨ fusionner en formulation combinée » (`update_assertion_content` réécrit l'assertion conservée avec `merged_content`, puis transfert + reject). L'auto-fusion **périodique** alimente ces propositions au lieu d'appliquer ; l'auto-fusion **en fin de vote** (`SuperadminScreen`, toggle « Fusionner auto en fin de vote », clé `ai_auto_merge_<id>`) reste auto et transfère les votes avant de rejeter (correction d'une perte de votes). **Chantier 37** : son déclenchement a migré de la modale héritée « Répartir en tables » (supprimée) vers `handlePhaseChange`, au moment où le superadmin fait passer la séance de `voting` à `allocating` — cf. section Phase de vote. Le prompt `buildMergePrompt` a été durci (biais « ne pas fusionner » + contre-exemples réels sur le thème publicité) — **il faut redéployer l'Edge Function `gemini-proxy` pour que ce prompt prenne effet**.

### ⚠️ Bug connu — nommage Gemini : groupe N toujours nommé "Groupe N"

Avec k=3+ groupes, Gemini 2.5 Flash Lite retourne systématiquement `"Groupe 3"` (ou `"Groupe N"`) comme nom pour le dernier groupe, même avec :
- L'action `name_single_group` (objet unique, pas tableau)
- `responseSchema: { type: 'object', required: ['name','description'] }`
- L'instruction explicite INTERDIT dans le prompt
- La validation client qui rejette `"Groupe N"` et déclenche un retry
- Le retry (2ème appel) produit le même résultat

**Ce qui a été tenté et éliminé** :
1. Batch `name_groups` (array) → Gemini retourne moins d'entrées que demandé
2. Solo retry via `name_groups` (array d'1 élément) → Gemini retourne `[]`
3. Transport : 3 appels parallèles → le 3ème n'atteignait pas le serveur (bug client Supabase)
4. Transport : 3 appels séquentiels → tous atteignent Gemini, mais le 3ème retourne `"Groupe 3"`
5. Prompt avec règle INTERDIT + validation/retry côté client → Gemini retourne quand même `"Groupe 3"`

**Hypothèses non testées** :
- Utiliser `gemini-2.5-flash` (non lite) ou `gemini-2.5-pro`
- Remplacer les labels "Groupe 1/2/3" dans le contexte par des lettres neutres "A/B/C" pour que le modèle ne puisse pas les recopier
- Passer les données groupe par groupe sans contexte des autres groupes (prompt encore plus court)

### Mapping group_id ↔ table_number
`AnalysisPanel` et `ResultsMapScreen` utilisent `group_id` 0-indexé. Les `table_number` de `table_assignments` et de Gemini sont 1-indexés. Mapping : `table_number = group_id + 1`. **Ne pas utiliser `ring-1` Tailwind sans `ring-[color]`** pour les highlights de groupe — Tailwind applique son bleu par défaut. Toujours utiliser `outline` inline : `style={{ outline: \`1px solid ${color}60\` }}`.

---

## UX Participant — règles importantes

### Modal d'accueil débat (`ParticipantView`)
Affiché une seule fois par table via `localStorage` (clé `debate_welcome_<tableId>`). Explique les deux files, les outils, le modérateur. Ne pas utiliser `useEffect` pour l'initialisation — lire `localStorage` directement dans `useState(() => ...)`.

### Modal intro vote (`VoteScreen`)
`showVoteIntro` mis à `true` dans `loadVoteData()` juste avant `setStep('vote')`, seulement si `localStorage['ecclesia_vote_intro_<session.id>']` est absent (chantier 11 / F3 — auparavant affiché à chaque rechargement, changement volontaire). Posé par `closeVoteIntro()` à la fermeture (croix ou bouton "Commencer →").

### Voir toutes les assertions (`VoteScreen`)
Bouton "📋 Voir toutes" visible dès qu'il y a des assertions, que le participant ait tout voté ou non. Charge `getVoteResults` à la demande. Sur l'écran "Tu as tout voté", les barres de votes collectifs sont aussi affichées inline dans la liste "Tes votes" (depuis `voteResults` déjà chargé).

### Modal Outils en phase vote (`VoteScreen`)
Bouton "Outils" dans le header (à côté de "Proposer"). Ouvre `VoteToolsPanel` : documentation (fiche info, résumé, sources collaboratives), notes (`NotesModal` avec `sessionId`). Sans dépendance à `TableContext`. Quand tout est voté, `DocNudge` apparaît entre "Proposer" et `VoteResultsSummary`. Toutes les 10 assertions votées, un nudge propose de soumettre une assertion (`showProposalNudge` + `nextNudgeAt`).

**Piège `VoteToolsPanel` + `NotesModal`** : `showNotesModal` doit être dans le parent (`step === 'vote'`), pas dans `VoteToolsPanel`. Si `NotesModal` est rendu à l'intérieur de `VoteToolsPanel`, appeler `onClose()` démonte le panneau avant que `notesOpen=true` prenne effet → modal jamais affiché. Pattern correct : `VoteToolsPanel` reçoit `onOpenNotes: () => void` en prop et l'appelle après `onClose()` ; le parent rend `{showNotesModal && <NotesModal .../>}` indépendamment.

### Notes `NotesModal` — props flexibles
`NotesModal` accepte `tableId?: string` OU `sessionId?: string` (au moins un requis). Si `sessionId` fourni → requête `eq('session_id', sessionId)` ; sinon → `eq('table_id', tableId)`. Insert : champ correspondant + l'autre à `null`. `ParticipantToolsButton` (débat) passe `sessionId={table.session_id}` quand la table est rattachée à une séance — les notes sont ainsi partagées entre vote et débat.

### Retour depuis `CollabDocScreen`
Avant de naviguer vers `#collab/<join_code>`, l'écran appelant stocke `sessionStorage.setItem('ecclesia_collab_return', '#vote/<join_code>')` (ou tout autre hash). `CollabDocScreen` lit et supprime cette clé au démarrage ; le bouton ← utilise ce hash au lieu de `''`. Générique : n'importe quel écran peut définir ce retour.

### Polling assertions + Realtime (`VoteScreen`)
Réception des nouvelles assertions via deux mécanismes :
- **Realtime** : channel `vote:<session.id>`, écoute `postgres_changes` sur `assertions` filtré par `session_id`. Nécessite `REPLICA IDENTITY FULL` sur `assertions` (migration `assertions_replica_identity_full`) — sans ça, les UPDATE (`pending → approved`) ne transmettent pas `session_id` dans le WAL et le filtre Realtime ne matche pas.
- **Polling REST 10s** : fallback via `setInterval` quand `step === 'vote'`, append des nouvelles assertions uniquement.

### Forçage questionnaire — expiration 1h (`ParticipantView`)
`forcedTimerRef` (useRef) stocke l'ID du `setTimeout`. **Ne jamais mettre le setTimeout dans un `.then()` en espérant que le `return () => clearTimeout()` remonte au useEffect** — il est ignoré. Le timer doit être posé dans le `.then()` mais stocké dans le ref, et nettoyé dans le useEffect d'annulation. Durée : `questionnaire_forced_at + 3 600 000 ms`. Quand expiré, `forced={false}` → la croix réapparaît.

### Synthèse des votes admin — enrichissement content (`SuperadminScreen`)
`get_vote_counts_admin` RPC ne retourne pas le champ `content`. Dans `loadAssertions`, après `Promise.allSettled`, construire une `Map<id, content>` depuis `assertions` et l'appliquer sur `voteResults` avant `setVoteResults`.

---

## Changements temporaires (à remettre)

### GitHub Pages — `cancel-in-progress: false` (2026-06-03)
Le workflow `.github/workflows/deploy.yml` a `cancel-in-progress: false` (anciennement `true`). Ce changement évite qu'un déploiement en cours soit annulé par un commit suivant, ce qui causait une fenêtre de 404 pendant le redéploiement. Le CDN Fastly de GitHub Pages met en cache les 404 (`Cache-Control: max-age=600`), rendant le site inaccessible jusqu'à expiration du cache. **Ne pas repasser à `true`.**

---

## Sous-projet : Transcription des débats

Dossier `transcription-debat/` — **outil offline autonome**, indépendant de l'app web. Transforme un enregistrement audio + le log CSV des tours de parole Ecclesia en un transcript horodaté, attribué par locuteur, anonymisé et corrigé.

> **Doc complète et à jour** : [transcription-debat/CLAUDE.md](./transcription-debat/CLAUDE.md). Ne pas dupliquer son contenu ici — cette section n'est qu'un pointeur.

- **Pipeline** : anonymisation (`anonymize_log.py`) → Whisper `large-v3` GPU + alignement mot×tour (`transcribe_offline.py`) → déduplication anti-hallucinations (`deduplicate.py`) → correction Gemini par lots (`correct_transcript.py`). Commande unique : `backend/run_transcription.ps1`.
- **Stack** : Python + venv (`backend/.venv/`), `faster-whisper`, `google-genai`, ffmpeg. Secrets dans `backend/.env` (`GEMINI_API_KEY`, `HF_TOKEN`). `Débats/` et `transcripts/` non versionnés (RGPD + audio volumineux).
- **Tests** : 70 tests pytest (`transcription-debat/backend/tests/`).
- **Historique récent** (voir git) : correction Gemini post-Whisper (juin), module `deduplicate` 3 passes (2026-06-21), organisation des transcripts par thème/table, **suppression du mode live → offline uniquement (2026-06-30)**.
- **Plans/specs archivés** : `transcription-debat/docs/superpowers/`. Les plans *live*/*intégration* à la racine `docs/superpowers/` (`2026-05-26-transcription-live*`, `2026-05-26-transcription-integration*`) sont **obsolètes** — le mode live abandonné.

---

## Reste à faire (éventuel)
- Toast notifications
- Page 404 / table expirée élégante
- Persistance de la pause après rechargement (localStorage)
- Tests manuels complets sur mobile (iOS Safari, Android Chrome)
- ~~Phase `questionnaire` : connecter `SessionRouterScreen` + flow questionnaire participant~~ — **fait (chantier 39)**, autrement : la phase `questionnaire` a été supprimée plutôt que connectée ; `SessionRouterScreen` route désormais vers `SessionQuestionnaireForm` en phase `closed` tant que `questionnaire_responses` ne contient pas de réponse pour le membre.
- Génération de QR code dans l'UI superadmin (actuellement : site externe)
- ~~Exposer les assertions clivantes (`repness`) depuis `AnalysisPanel` via callback pour les passer à `nameSingleGroup` comme `divisive_assertions`~~ — **fait (chantier 28 / H9)** autrement : `groupNaming.discriminatingAssertions()` recalcule côté client, par camp, les 3 assertions où il s'écarte le plus du reste (proxy de `repness`), sans dépendre d'un callback depuis `AnalysisPanel`.
