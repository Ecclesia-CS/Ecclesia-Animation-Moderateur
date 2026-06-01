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
`id`, `title`, `description?`, `scheduled_at?`, `join_code?` (6 hex unique parmi non-fermées), `phase` (`draft`|`voting`|`allocating`|`debating`|`questionnaire`|`closed`), `doc_info_url?`, `doc_summary_url?`, `doc_collab_url?`, `moderation_policy` (`open`|`closed`|`ai`, défaut `closed`), `vote_timer_minutes?` (int), `vote_threshold_percent?` (int)

### `tables`
`id`, `join_code` (UNIQUE, 6 hex), `created_by` (auth.uid()), `current_speaker_id?` (FK→participants), `current_turn_started_at?`, `session_id?` (FK→sessions ON DELETE SET NULL)

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
`id`, `session_id` (CASCADE), `user_id`, `pseudo`, `created_at`
Contraintes : `UNIQUE(session_id, user_id)`, `UNIQUE(session_id, pseudo)`.

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
| `create_table(pseudo, creation_code, session_id?)` | Crée table + participant |
| `join_table(join_code, pseudo)` | ON CONFLICT → transfère user_id (retour autre appareil) |
| `reclaim_moderator(join_code, creation_code)` | Reprend la modération |
| `grant_floor(table_id, participant_id, source)` | Clôt tour ouvert + ouvre nouveau |
| `end_turn(table_id)` | Pose ended_at, vide current_speaker_id |
| `end_turn_and_advance(table_id)` | Clôt + accorde au suivant (interactive > long) en 1 transaction. Retourne `{current_speaker_id, current_turn_started_at, removed_queue_entry_id}` |
| `end_turn_as_speaker(table_id)` | Comme end_turn mais par l'orateur lui-même (JOIN via current_speaker_id) |
| `add_to_queue(table_id, participant_id, queue_type, position?)` | Idempotent. Si position fournie, décale les existants |
| `reorder_queue_entry(entry_id, new_position)` | Déplace atomiquement |
| `kick_participant(table_id, participant_id)` | Exclut + cascade |
| `correct_turn(turn_id, started_at, ended_at, participant_id)` | COALESCE — NULL = ne pas modifier |
| `create_session(password, title, description?, scheduled_at?, doc_*?)` | Crée une séance |
| `attach_table_to_session(password, table_id, session_id)` | Rattache |
| `detach_table_from_session(password, table_id)` | Détache |
| `close_session(password, session_id)` | phase → 'closed' |
| `list_session_tables(password, session_id)` | Tables rattachées (bypass RLS) |
| `list_available_tables(password)` | Tables sans séance (48h) |
| `submit_questionnaire(table_id, ...)` | Upsert questionnaire_responses |
| `update_session_docs(password, session_id, doc_*?)` | Met à jour les 3 URLs docs |
| `register_session_member(session_id, pseudo)` | Inscrit l'utilisateur (ON CONFLICT user → retourne existant ; pseudo pris → exception) |
| `submit_entry_response(session_id, ...)` | Upsert entry_responses |
| `submit_assertion(session_id, content)` | Insère assertion (status auto selon moderation_policy) |
| `cast_vote(assertion_id, vote)` | Upsert assertion_votes |
| `get_vote_results(session_id)` | Retourne assertions approved avec consensus_score |
| `approve_assertion(password, assertion_id)` | status → 'approved' |
| `reject_assertion(password, assertion_id)` | status → 'rejected' |
| `set_session_phase(password, session_id, phase)` | Change la phase de la séance |
| `run_clustering_v1(password, session_id, target_size?)` | Répartition aléatoire des membres → table_assignments, phase → 'allocating'. Retourne `{table_count, member_count}` |
| `run_clustering_v2(password, session_id, target_size?)` | Répartition hétérogène basée sur l'analyse PCA (si analyse existe) → table_assignments, phase → 'allocating'. Retourne `{table_count, member_count}` |
| `update_session_config(password, session_id, moderation_policy, vote_timer_minutes, vote_threshold_percent)` | Met à jour la configuration de vote. `moderation_policy` ∈ `('open','closed','ai')` |
| `assign_table_to_group(password, session_id, table_number, table_id?)` | Rattache une table physique à un groupe logique (NULL = désassigner). Met aussi à jour `tables.session_id`. |
| `get_all_votes_for_analysis(password, session_id)` | Retourne tous les votes de la séance (bypass RLS — superadmin uniquement) |

**RLS Realtime** : `REPLICA IDENTITY FULL` sur les 4 tables de données — obligatoire pour que les DELETE filtrés arrivent aux subscribers.
Les tables Bloc C (`session_members`, `assertions`, `assertion_votes`, `table_assignments`) sont dans la publication Realtime — pas de broadcast custom, Realtime natif uniquement.
`table_assignments` a aussi `REPLICA IDENTITY FULL` (migration `20260530`) : sans ça, un UPDATE de `table_id` seul ne transmet pas `session_id` dans le WAL → le filtre Realtime `session_id=eq.<id>` ne peut pas matcher → les participants ne reçoivent pas le join_code en temps réel.

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
│   ├── voting.ts         Wrappers RPC Bloc C (registerSessionMember, submitEntryResponse, submitAssertion, castVote, getVoteResults, approve/rejectAssertion, setSessionPhase, runClusteringV1, runClusteringV2, updateSessionConfig, assignTableToGroup, listAssertionsAdmin)
│   ├── gemini.ts         Client Edge Function Gemini (moderateAssertions, mergeAssertions, nameIdeologicalGroups) — jamais d'appel direct à api.google.com
│   ├── analysis.ts       PCA + k-means côté navigateur (runOpinionAnalysis, loadVotesForAnalysis, loadLatestAnalysis, saveAnalysisResult)
│   ├── storage.ts        tableStore.get/set/clear (localStorage)
│   └── utils.ts          formatDuration, extractErr, generateTableCSV
├── hooks/useLiveMs.ts    setInterval 500ms → Date.now()
├── context/TableContext.tsx  État, Realtime, Broadcast, polling, toutes les actions
├── screens/
│   ├── EntryScreen.tsx         Section "Séances en cours" (fetch public) + tabs Rejoindre/Reprendre/Créer + lien Administration
│   ├── SuperadminScreen.tsx    Auth sessionStorage, liste séances, clustering, ModerationPolicyEditor, LLMModerationPanel, nommage groupes Gemini
│   ├── SessionRouterScreen.tsx Routeur intelligent #session/<join_code> — redirige selon phase (voting/allocating → #vote/, debating → check member → #vote/ ou message)
│   ├── VoteScreen.tsx          Flow vote participant : pseudo → onboarding → vote → AllocatingScreen
│   ├── AllocatingScreen.tsx    Post-vote : affectation groupe, code table, bouton rejoindre (join_table RPC + tableStore + reload)
│   ├── CollabDocScreen.tsx     Document collaboratif de sources (#collab/<join_code>)
│   ├── TableView.tsx           Routage isModerator
│   ├── ModeratorView.tsx       Vue projetable (DndContext, auto-avancement, pause)
│   └── ParticipantView.tsx     Vue mobile
└── components/
    ├── voting/
    │   ├── LLMModerationPanel.tsx    Panneau IA superadmin : modération/fusion manuelle+auto, log tokens, fusions effectuées
    │   ├── TableAssignmentCard.tsx   Carte groupe + join_code + bouton rejoindre (2 états : join / arrived)
    │   ├── VoteResultsSummary.tsx    Résumé des votes (assertions + consensus_score)
    │   └── VoteTimerBadge.tsx        Countdown timer de vote (vote_timer_minutes)
    ├── AnalysisPanel.tsx         Scatter PCA, assertions clivantes/consensuelles. Prop groupNames?: GroupNameResult[] pour afficher les noms Gemini
    ├── SpeakerTimer.tsx          Chrono avec offsetMs
    ├── QueuePanel.tsx            File DnD (useDroppable + SortableContext + ghostId)
    ├── ReadOnlyQueuePanel.tsx    File lecture seule (participants)
    ├── ParticipantsTable.tsx     Temps cumulés + drag handles + Exclure
    ├── ParticipantsSidebar.tsx   Liste temps réel (dark/light)
    ├── CorrectTurnModal.tsx      Historique tours
    ├── ConfirmModal.tsx          Confirmation générique
    ├── QuestionnaireModal.tsx    6 questions, 26 thèmes aléatoires, upsert RPC
    ├── QuestionnaireFab.tsx      Bouton header → QuestionnaireModal
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
grantFloor, endTurn, endTurnAsSpeaker, endTurnAndAdvance
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

---

## Phase de vote (Bloc C)

Flux complet :

1. **`draft`** → séance créée, pas encore ouverte
2. **`voting`** → participants s'inscrivent (`register_session_member`) + soumettent/votent des assertions. VoteScreen géré via `#vote/<join_code>`.
3. **`allocating`** → superadmin lance `run_clustering_v1` → `table_assignments` créés (`table_id` NULL, `table_number` logique attribué). Superadmin rattache chaque groupe à une table physique via `assign_table_to_group`. Participants voient leur numéro de groupe dans AllocatingScreen (polling 5s + Realtime).
4. **`debating`** → superadmin clique "Ouvrir le débat". Participants voient le `join_code` de leur table et rejoignent via `join_table(join_code, pseudo)` → `tableStore.set(...)` → `window.location.reload()` → TableView.

`moderation_policy = 'open'` : assertions directement `approved`. `= 'closed'` : `pending` jusqu'à `approve_assertion`. `= 'ai'` : `pending`, modération automatique par Gemini via `LLMModerationPanel` (setInterval configurable).

`vote_timer_minutes` / `vote_threshold_percent` : configurés à la création ou via update, NULL = désactivé.

Realtime : les 4 tables Bloc C utilisent Realtime natif (pas de broadcast custom).

### Navigation post-vote (AllocatingScreen)

- `join_table(join_code, pseudo)` → `TableResult`
- `tableStore.set({ tableId, participantId, joinCode, isModerator: false, pseudo })`
- `window.location.reload()` → App.tsx relit le `tableStore` dans `init()` → monte `TableView`
- **Ne pas faire** `window.location.hash = ''` directement : App.tsx a déjà `phase={type:'entry'}` en mémoire, il afficherait EntryScreen au lieu de TableView.

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
| `ai_auto_moderate_<id>` | `'true'/'false'` — toggle auto-modération |
| `ai_auto_interval_<id>` | nombre (minutes) — intervalle setInterval |
| `ai_auto_merge_<id>` | `'true'/'false'` — fusion automatique avant clustering |
| `group_names_<id>` | `GroupNameResult[]` — noms Gemini des groupes |
| `group_names_fp_<id>` | string JSON — empreinte groupes pour éviter re-appel Gemini |

### Règles critiques IA
- **`group_names_fp_<id>`** : ne rappeler Gemini pour le nommage que si l'empreinte des groupes a changé (nouveau clustering) ou si aucun nom n'est stocké
- **Fallback nommage** : si Gemini retourne moins d'entrées que de groupes, compléter côté frontend avec `{ name: "Groupe N", description: "..." }` avant de stocker
- **Cache incomplet** : si l'empreinte correspond mais des noms manquent, appliquer le fallback localement sans rappeler Gemini (cas du retour sur une session existante avec cache stale)
- **Retry individuel** : après l'appel batch, pour chaque groupe non nommé, faire un appel Gemini avec un payload `groups` de longueur 1. Réutilise `nameIdeologicalGroups` sans changement de signature. Le fallback générique ne reste qu'après échec du retry.
- **`responseMimeType: 'application/json'`** : passé dans `generationConfig` de l'appel Gemini pour forcer la sortie JSON native (évite les enrobages markdown)
- **`ai_rejected_ids_<id>`** : seules les assertions dans ce set s'affichent dans "Assertions rejetées par l'IA" — les rejets manuels n'y apparaissent pas
- **Ne pas appeler `supabase.functions.invoke` sans vérifier `error` ET `data?.error`**

### ⚠️ Bug connu — nommage Gemini incomplet pour k=3+
Sur un appel batch avec 3 groupes ou plus, Gemini 2.5 Flash Lite retourne **systématiquement moins d'entrées** que demandé (typiquement 2/3), malgré :
- La "RÈGLE ABSOLUE" du prompt (`buildNameGroupsPrompt` dans `supabase/functions/gemini-proxy/index.ts`)
- `responseMimeType: 'application/json'` dans `generationConfig`
- Le retry individuel par groupe manquant (un appel solo retourne aussi un tableau vide ou skip le groupe)

**Symptôme observé** : sur la session test mobilité urbaine (3 camps bien séparés pro-voiture / pro-vélo / pro-TC), seuls 2 camps reçoivent un nom Gemini, le 3ᵉ tombe sur le fallback générique `"Groupe 3"`.

**Hypothèses non testées** :
- Utiliser `responseSchema` avec `minItems`/`maxItems` (Gemini structured outputs) pour contraindre le compte d'entrées
- Reformuler le prompt en JSON-mode strict (one-shot exemple complet)
- Tester avec `gemini-2.5-flash` (non lite) ou `gemini-2.5-pro`
- Découper le batch en N appels solo dès le départ (au lieu de batch + retry)

### Mapping group_id ↔ table_number
`AnalysisPanel` utilise `group_id` 0-indexé. Les `table_number` de `table_assignments` et de Gemini sont 1-indexés. Mapping : `table_number = group_id + 1`.

---

## Reste à faire (éventuel)
- Toast notifications
- Page 404 / table expirée élégante
- Persistance de la pause après rechargement (localStorage)
- Tests manuels complets sur mobile (iOS Safari, Android Chrome)
- Phase `questionnaire` : connecter `SessionRouterScreen` + flow questionnaire participant
- Génération de QR code dans l'UI superadmin (actuellement : site externe)
- Migrer `group_names` de localStorage vers la base de données
- Exposer les assertions clivantes (`repness`) depuis `AnalysisPanel` via callback pour les passer à `nameIdeologicalGroups` comme `divisive_assertions`
