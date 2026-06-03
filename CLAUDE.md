# CLAUDE.md — Ecclesia · Modérateur de débat

> **Terminologie** : "table" = cercle de débat modéré. "session"/"séance" (`sessions`) = conteneur optionnel regroupant plusieurs tables.

---

## Stack & Déploiement

React 18 + Vite + TypeScript · Tailwind CSS v3 · Supabase (PostgreSQL + Auth anonyme + Realtime) · dnd-kit · GitHub Pages

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<clé publique anon>
```

`vite.config.ts` a `base: '/Ecclesia-Animation-Moderateur/'` — **ne pas supprimer**.

---

## Modèle de données

### `app_config` — zéro RLS, SECURITY DEFINER uniquement
`key` (PK) / `value` (bcrypt hash). Clés : `creation_code_hash`, `superadmin_code_hash`.

### `sessions`
`id`, `title`, `description?`, `scheduled_at?`, `join_code?` (6 hex unique parmi non-fermées), `phase` (`draft`|`pre_voting`|`voting`|`allocating`|`debating`|`questionnaire`|`closed`), `doc_info_url?`, `doc_summary_url?`, `doc_collab_url?`, `moderation_policy` (`open`|`closed`|`ai`, défaut `closed`), `vote_timer_minutes?` (int), `vote_threshold_percent?` (int), `group_names` (jsonb, défaut `[]`) — tableau `GroupNameResult[]` persisté en DB par `update_group_names` (superadmin) et lu par les participants via `select('*')`

Phase order : `draft → pre_voting → voting → allocating → debating → questionnaire → closed`
- `pre_voting` : vote ouvert à distance, `attending_in_person = false` par défaut. Pas d'onboarding.
- `voting` : vote présentiel uniquement — confirmation présentielle requise. Clustering filtre `attending_in_person = true`.

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
`id`, `session_id` (CASCADE), `user_id`, `pseudo`, `created_at`, `joined_phase?` (text), `attending_in_person` (boolean, défaut `false`), `reclaim_code?` (text, plain — code 4 chiffres généré côté client lors de l'inscription en `pre_voting`)
Contraintes : `UNIQUE(session_id, user_id)`, `UNIQUE(session_id, pseudo)`.
- `attending_in_person = false` → inscrit en pré-vote depuis chez soi. Exclu du clustering.
- `attending_in_person = true` → a confirmé sa présence physique (`confirm_attendance`). Inclus dans le clustering.

### `entry_responses` — Bloc C
`id`, `session_id` (CASCADE), `member_id` (CASCADE→session_members), `consent_transcript`, `group_size_pref` (`small`|`medium`|`large`), `moderator_pref`, `openness_to_diff` (1-5), `participation_style` (`listener`|`active`), `created_at`
Contrainte : `UNIQUE(session_id, member_id)`.

### `assertions` — Bloc C
`id`, `session_id` (CASCADE), `member_id` (CASCADE→session_members), `content`, `status` (`pending`|`approved`|`rejected`), `created_at`

### `assertion_votes` — Bloc C
`id`, `assertion_id` (CASCADE), `session_id` (CASCADE), `member_id` (CASCADE→session_members), `vote` (`agree`|`disagree`|`pass`), `created_at`
Contrainte : `UNIQUE(assertion_id, member_id)`.

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

### Fonctions SECURITY DEFINER

| Fonction | Rôle |
|---|---|
| `is_table_participant(uuid)` | Helper RLS anti-récursion |
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
| `submit_entry_response(session_id, ...)` | Upsert entry_responses |
| `submit_assertion(session_id, content)` | Insère assertion (status auto selon moderation_policy) |
| `cast_vote(assertion_id, vote)` | Upsert assertion_votes |
| `get_vote_results(session_id)` | Retourne assertions approved avec consensus_score |
| `approve_assertion(password, assertion_id)` | status → 'approved' |
| `reject_assertion(password, assertion_id)` | status → 'rejected' |
| `set_session_phase(password, session_id, phase)` | Change la phase (inclut `pre_voting`) |
| `run_clustering_v1(password, session_id, target_size?)` | Répartition aléatoire — **filtre `attending_in_person = true`** → table_assignments, phase → 'allocating'. Retourne `{table_count, member_count}` |
| `run_clustering_v2(password, session_id, target_size?)` | Répartition hétérogène PCA — **filtre `attending_in_person = true`** → table_assignments, phase → 'allocating'. Retourne `{table_count, member_count}`. Les membres présents sans votes sont distribués aléatoirement. |
| `update_session_config(password, session_id, moderation_policy, vote_timer_minutes, vote_threshold_percent)` | Met à jour la configuration de vote. `moderation_policy` ∈ `('open','closed','ai')` |
| `update_group_names(password, session_id, group_names)` | Persiste les noms de groupes Gemini en DB (`sessions.group_names`). Appelé par `SuperadminScreen` après chaque génération Gemini (en parallèle du localStorage). |
| `assign_table_to_group(password, session_id, table_number, table_id?)` | Rattache une table physique à un groupe logique (NULL = désassigner). Met aussi à jour `tables.session_id`. |
| `get_all_votes_for_analysis(password, session_id, attending_only?)` | Retourne tous les votes avec `attending_in_person` par vote. Si `attending_only=true` : filtre présentiels uniquement. |
| `get_session_voting_stats(password, session_id)` | Retourne `{member_count, attending_count, remote_count, onboarded_count, voter_count, approved_assertion_count, total_votes}` |
| `merge_assertion_votes(password, keep_id, reject_id)` | Transfère les votes de `reject_id` vers `keep_id` : nouveaux votants insérés, conflits résolus (agree prime). Appelé avant `reject_assertion` dans `LLMModerationPanel.handleMerge`. |

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
│   ├── voting.ts         Wrappers RPC Bloc C (registerSessionMember, confirmAttendance, submitEntryResponse, submitAssertion, castVote, getVoteResults, approve/rejectAssertion, setSessionPhase, runClusteringV1, runClusteringV2, updateSessionConfig, assignTableToGroup, listAssertionsAdmin)
│   ├── gemini.ts         Client Edge Function Gemini (moderateAssertions, mergeAssertions, nameIdeologicalGroups, nameSingleGroup) — jamais d'appel direct à api.google.com
│   ├── analysis.ts       PCA + k-means côté navigateur (runOpinionAnalysis, loadVotesForAnalysis, loadLatestAnalysis, saveAnalysisResult, loadResultsMap). `ResultsMapData` inclut `repness`, `group_consensus`, `all_assertions` (depuis migration `20260621`). Score repness : `(mean_vote_in_group − mean_vote_out_group) × n_votes_réels_groupe`. `loadVotesForAnalysis` accepte `attendingOnly?: boolean`.
│   ├── storage.ts        tableStore.get/set/clear (localStorage)
│   └── utils.ts          formatDuration, extractErr, generateTableCSV, generateQuestionnaireCSV
├── hooks/useLiveMs.ts    setInterval 500ms → Date.now()
├── context/TableContext.tsx  État, Realtime, Broadcast, polling, toutes les actions
├── screens/
│   ├── EntryScreen.tsx         Section "Séances en cours" (polling 30s, phases pre_voting/voting/allocating/debating/questionnaire) + tabs Rejoindre/Reprendre/Créer + lien Administration
│   ├── SuperadminScreen.tsx    Auth sessionStorage, liste séances, clustering, ModerationPolicyEditor, LLMModerationPanel, nommage groupes Gemini. `SessionDetail` organisé en 4 onglets (🟢 En direct / 🪑 Tables / ⚙️ Préparation / 📊 Analyse). Persistance séance ouverte via `sessionStorage` (clé `ecclesia_superadmin_session`). Persistance onglet actif via `sessionStorage` (clé `ecclesia_admin_tab_<session.id>`, fallback `defaultTab(phase)`). Exports CSV + toggle questionnaire dans l'accordéon "Actions post-séance" (onglet Analyse). Stats présentiels/distance dans `VotingStatsPanel`.
│   ├── SessionRouterScreen.tsx Routeur intelligent #session/<join_code> — redirige selon phase (pre_voting/voting/allocating → #vote/, debating → check member → #vote/ ou message) ; phase=closed → ResultsMapScreen (membre) ou PublicResultsScreen (visiteur)
│   ├── VoteScreen.tsx          Flow vote participant. En `pre_voting` : pseudo → ReclaimCodeDisplay → vote (pas d'onboarding). En `voting` : VotingEntryForm (pseudo OU code, reclaim auto si pseudo pris) → onboarding → vote → AllocatingScreen. Confirmation présentielle (known_user, même appareil) via AttendanceConfirmScreen.
│   ├── AllocatingScreen.tsx    Post-vote : affectation groupe, code table, nom du camp (DB via session.group_names en priorité, localStorage fallback), bouton rejoindre. Affiche VoteResultsSummary + accordéon "Voir toutes les assertions"
│   ├── ResultsMapScreen.tsx    Écran résultats post-clôture (participant inscrit). Charge en parallèle : scatter PCA (`loadResultsMap`), affectation groupe (`getMyTableAssignment`), assertions (`getVoteResults`). Affiche : carte groupe (couleur du groupe, nom+description depuis session.group_names), section "Ce qui vous caractérise" (top repness du groupe), scatter avec légende nommée, "Les autres camps" (top repness par groupe), "Points de clivage" (spread repness inter-groupes), "Points de consensus". Fallback sans analyse PCA : dissensus via consensus_score. Couleur et nom du camp du participant basés sur `selfGroupId` (cluster k-means 0-indexé depuis `data.points`) — **NE PAS** utiliser `assignment.table_number` pour la recherche du nom Gemini car `table_number` est la table physique de débat, sans correspondance garantie avec le cluster k-means. Bouton "← Retour au menu" (hash='') en bas de page — permet de rejoindre une nouvelle séance depuis cet écran.
│   ├── CollabDocScreen.tsx     Document collaboratif de sources (#collab/<join_code>)
│   ├── TableView.tsx           Routage isModerator
│   ├── ModeratorView.tsx       Vue projetable (DndContext, auto-avancement, pause). Overlay "Séance terminée" + bouton "Voir les résultats →" (#session/<join_code>) + bouton "← Retour au menu" (hash='') quand session.phase=closed
│   └── ParticipantView.tsx     Vue mobile. Overlay "Séance terminée" + bouton "Voir vos résultats →" (#session/<join_code>) + bouton "← Retour au menu" (hash='') quand session.phase=closed
└── components/
    ├── voting/
    │   ├── LLMModerationPanel.tsx    Panneau IA superadmin : modération/fusion manuelle+auto, log tokens, fusions effectuées
    │   ├── TableAssignmentCard.tsx   Carte groupe + nom camp (prop groupName) + join_code + bouton rejoindre
    │   ├── VoteResultsSummary.tsx    Résumé des votes — top 3 consensus + 2 dissensus (assertions + consensus_score)
    │   ├── VoteResultsList.tsx       Liste complète de toutes les assertions approuvées, triée par consensus_score décroissant
    │   └── VoteTimerBadge.tsx        Countdown timer de vote (vote_timer_minutes)
    ├── AnalysisPanel.tsx         Scatter PCA, assertions clivantes/consensuelles. Props: groupNames?: GroupNameResult[], totalMembers?: number, sessionPhase?: string. Section Automatisation : toggle auto-analyse + slider 1-15 min (actif si phase=voting). Légende scatter : nom + description du groupe (depuis groupNames). En-têtes "Assertions clivantes" : nom + description en gris sous le nom coloré. Toggle "Tous les votants / Présentiels uniquement" : recharge les votes avec `attendingOnly=true`, recalcule repness/consensus localement sans sauvegarder.
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
    └── DocumentationButton.tsx   Dropdown 3 liens ; masqué si aucune URL
```

### Edge Functions Supabase

```
supabase/functions/
└── gemini-proxy/index.ts   Proxy Gemini Flash (gemini-2.5-flash-lite)
                             Actions : moderate | merge | name_groups
                             Auth : JWT Supabase via getUser()
                             Clé : GEMINI_API_KEY (secret Supabase)
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
- **Confondre `group_id` k-means et `table_number` physique** — `analysis_members.group_id` (0-indexé, cluster d'opinion) ≠ `table_assignments.table_number` (1-indexé, table de débat). `run_clustering_v2` mélange intentionnellement les clusters → aucune correspondance garantie. Les `group_names` Gemini sont indexés par numéro de cluster (1 = group_id 0). Dans `ResultsMapScreen`, toujours utiliser `selfGroupId + 1` pour chercher le nom Gemini, jamais `assignment.table_number`.

---

## Phase de vote (Bloc C)

Flux complet :

1. **`draft`** → séance créée, pas encore ouverte
2. **`pre_voting`** *(optionnel)* → vote ouvert à distance avant l'événement. Participants s'inscrivent avec `attending_in_person=false`. Un code de rappel 4 chiffres leur est affiché (à screenshoter). Pas d'onboarding. VoteScreen géré via `#vote/<join_code>`. EntryScreen affiche la séance comme "en cours".
3. **`voting`** → vote présentiel. Nouveaux arrivants : `VotingEntryForm` (pseudo OU code), reclaim auto si pseudo déjà pris. Pré-votants sur même appareil : `AttendanceConfirmScreen` (mode `known_user`). Clustering et analyse filtrés sur `attending_in_person = true`.
4. **`allocating`** → superadmin lance `run_clustering_v1` → `table_assignments` créés (`table_id` auto-assigné si tables physiques rattachées). Participants voient leur numéro de groupe + nom du camp dans AllocatingScreen (polling 5s + Realtime). Polling couvre aussi la phase `allocating` quand `assignment === null`.
5. **`debating`** → superadmin clique "Ouvrir le débat". Participants voient le `join_code` et rejoignent via `join_table(join_code, pseudo)` → `tableStore.set(...)` → callback `onTableJoined` → `App.handleTableJoined` met à jour `phase` en `table` → TableView (sans reload).

`moderation_policy = 'open'` : assertions directement `approved`. `= 'closed'` : `pending` jusqu'à `approve_assertion`. `= 'ai'` : `pending`, modération automatique par Gemini via `LLMModerationPanel` (setInterval configurable).

`vote_timer_minutes` / `vote_threshold_percent` : configurés à la création ou via update, NULL = désactivé.

Realtime : les 4 tables Bloc C utilisent Realtime natif (pas de broadcast custom).

### Navigation post-vote (AllocatingScreen)

- `join_table(join_code, pseudo)` → `TableResult`
- `tableStore.set({ tableId, participantId, joinCode, isModerator: false, pseudo })`
- Appel du callback `onTableJoined(tableId, participantId, false)` → `App.handleTableJoined` → `setPhase({ type:'table', ... })` + `history.replaceState` (nettoyage URL sans hashchange)
- Guard dans App.tsx : `hash.startsWith('#vote/') && phase.type !== 'table'` — dès que `phase` passe à `table`, le routing hash n'a plus priorité → TableView s'affiche sans reload
- **Compatibilité Messenger** : plus de `window.location.href` / `window.location.reload()`. Le fallback `href` reste si `onTableJoined` n'est pas fourni (usage standalone).
- **Pas d'étape intermédiaire "J'arrive"** : `TableAssignmentCard` ne prend plus de props `joined`/`onArrived` — le join et la navigation sont fusionnés en une seule action.

### Polling de secours phase (VoteScreen + AllocatingScreen — Messenger/WebSocket indisponible)

`VoteScreen` ajoute un polling 10 s sur la phase de la séance pendant les étapes `waiting` et `vote`. Si le WebSocket Realtime est coupé (in-app browsers), la transition de phase est détectée dans les 10 s sans rechargement. Les étapes `pseudo` et `onboarding` bénéficient aussi d'une protection : `handleOnboardingSuccess` re-fetch la phase courante avant de décider la prochaine étape (évite une session périmée).

`AllocatingScreen` ajoute un polling 10 s sur la phase de la séance pendant l'étape `allocating`. Couvre la transition `allocating → debating` quand Realtime est indisponible — sans ça, le participant resterait bloqué sans voir le bouton "Rejoindre".

### Nom du camp dans AllocatingScreen

`AllocatingScreen` lit `localStorage.getItem('group_names_<session.id>')` (tableau `GroupNameResult[]` généré par le superadmin via Gemini) et extrait l'entrée dont `table_number === assignment.table_number`. Passé à `TableAssignmentCard` via prop `groupName?: { name, description }`. Affiché entre le header "Table N" et le code de table. Absent si aucun nom Gemini disponible — aucun fallback affiché.

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
| `merge_log_<id>` | `MergeLogEntry[]` max 100 FIFO — fusions effectuées |
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
`showVoteIntro` mis à `true` dans `loadVoteData()` juste avant `setStep('vote')`. Affiché à chaque nouvelle session de vote (pas de persistance localStorage — intentionnel).

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

## Reste à faire (éventuel)
- Toast notifications
- Page 404 / table expirée élégante
- Persistance de la pause après rechargement (localStorage)
- Tests manuels complets sur mobile (iOS Safari, Android Chrome)
- Phase `questionnaire` : connecter `SessionRouterScreen` + flow questionnaire participant
- Génération de QR code dans l'UI superadmin (actuellement : site externe)
- Exposer les assertions clivantes (`repness`) depuis `AnalysisPanel` via callback pour les passer à `nameSingleGroup` comme `divisive_assertions`
