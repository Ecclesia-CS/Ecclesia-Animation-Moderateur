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
`id`, `title`, `description?`, `scheduled_at?`, `join_code?` (6 hex unique parmi non-fermées), `phase` (`draft`|`voting`|`allocating`|`debating`|`questionnaire`|`closed`), `doc_info_url?`, `doc_summary_url?`, `doc_collab_url?`

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

**RLS Realtime** : `REPLICA IDENTITY FULL` sur les 4 tables de données — obligatoire pour que les DELETE filtrés arrivent aux subscribers.

---

## Architecture TypeScript

```
src/
├── lib/
│   ├── supabase.ts       Client Supabase
│   ├── types.ts          Session, Table, Participant, QueueEntry, SpeakingTurn, QuestionnaireResponse
│   ├── sessions.ts       Wrappers RPC séances (verifyPassword, createSession, closeSession, attach/detach, listSessionTables, listAvailableTables, updateSessionDocs)
│   ├── storage.ts        tableStore.get/set/clear (localStorage)
│   └── utils.ts          formatDuration, extractErr, generateTableCSV
├── hooks/useLiveMs.ts    setInterval 500ms → Date.now()
├── context/TableContext.tsx  État, Realtime, Broadcast, polling, toutes les actions
├── screens/
│   ├── EntryScreen.tsx      Tabs Rejoindre/Reprendre/Créer + lien Administration
│   ├── SuperadminScreen.tsx Auth sessionStorage, liste séances, rattachement tables
│   ├── TableView.tsx        Routage isModerator
│   ├── ModeratorView.tsx    Vue projetable (DndContext, auto-avancement, pause)
│   └── ParticipantView.tsx  Vue mobile
└── components/
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

## Reste à faire (éventuel)
- Toast notifications
- Page 404 / table expirée élégante
- Persistance de la pause après rechargement (localStorage)
- Tests manuels complets sur mobile (iOS Safari, Android Chrome)
