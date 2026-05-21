# CLAUDE.md — Ecclesia · Modérateur de débat

Document de référence pour les sessions Claude Code. Lire en entier avant de
modifier quoi que ce soit.

---

## Contexte du projet

Ecclesia est une application web de modération de débat en temps réel, conçue
pour les assemblées générales et clubs de discussion. Le modérateur (le créateur
de la session) pilote depuis un écran projetable (desktop) ; les participants
rejoignent depuis leur téléphone.

Fonctionnalités principales :
- Deux files d'attente de prise de parole : **"File d'attente : demander la parole"** (nouveau point) et
  **"Coupe file"** (réponse directe)
- Auto-avancement de la file : la parole est accordée automatiquement au premier
  de file (Coupe file en priorité), sans action manuelle du modérateur
- Chronomètre en direct pour l'orateur + **timer global de séance** (= cumul des tours), toujours visible dans le hero
- Cumul du temps de parole par participant + temps total de séance
- Pause/reprise du chrono par le modérateur (tour clôturé en DB, rouvert à la reprise)
- Participant : bouton "J'ai fini de parler" pour libérer la parole soi-même
- Correction manuelle des tours ("Historique des participations")
- Persistance de session après rechargement (localStorage)
- **Pseudo unique par session** : rejoindre avec le même pseudo récupère le compte et l'historique existants
- Reprise de la modération depuis un autre appareil (Code Ecclesia)
- Bouton "Quitter" pour participants et modérateur (sans clôturer la session)
- Sidebar participants en temps réel (vue modérateur toujours visible ; vue participant sur md+ uniquement)
- Drag & drop depuis la liste participants vers les files (modérateur) — stratégie `pointerWithin`
- Exclusion de participant ("Exclure") avec confirmation

---

## Stack technique

| Couche | Technologie |
|---|---|
| Framework UI | React 18 + Vite + TypeScript |
| Styles | Tailwind CSS v3 |
| Backend / BDD | Supabase (PostgreSQL + Auth + Realtime) |
| Auth | Anonyme uniquement (`signInAnonymously`) — pas d'email ni d'OTP |
| Drag & drop | `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` |
| Déploiement | GitHub Pages via GitHub Actions |

Variables d'environnement requises (fichier `.env`, jamais commité) :
```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<clé publique anon>
```

### Déploiement

- **Site public** : https://ecclesia-cs.github.io/Ecclesia-Animation-Moderateur/
- **Dépôt GitHub** : https://github.com/Ecclesia-CS/Ecclesia-Animation-Moderateur
- **Workflow** : `.github/workflows/deploy.yml` — se déclenche automatiquement à chaque `git push` sur `main`
- Les variables d'environnement Supabase sont injectées au build via les **GitHub Actions Secrets**
  (`VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans Settings → Secrets → Actions)
- `vite.config.ts` a `base: '/Ecclesia-Animation-Moderateur/'` — **ne pas supprimer**, requis pour les assets sur GitHub Pages

---

## Modèle de données

Cinq tables dans le schéma `public`. Toutes ont RLS activé.

### `app_config`
| Colonne | Type | Notes |
|---|---|---|
| `key` | text PK | Ex. `creation_code_hash` |
| `value` | text | Hash bcrypt — jamais retourné au client |

Zéro politique RLS → accès total interdit hors fonctions SECURITY DEFINER.

### `sessions`
| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `join_code` | text UNIQUE | 6 caractères hexadécimaux uppercase |
| `created_by` | uuid | `auth.uid()` du modérateur courant |
| `current_speaker_id` | uuid \| null | FK → `participants.id` |
| `current_turn_started_at` | timestamptz \| null | Timestamp serveur |
| `created_at` | timestamptz | |

Note : la colonne `moderator_code_hash` a été supprimée (migration 003). Il n'y
a plus de code par session — la reprise de modération utilise le Code Ecclesia
global (`app_config.creation_code_hash`).

### `participants`
| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `session_id` | uuid FK → sessions | ON DELETE CASCADE |
| `user_id` | uuid | `auth.uid()` |
| `pseudo` | text | |
| `created_at` | timestamptz | |

Contrainte : `UNIQUE (session_id, pseudo)` (migration 005) — un pseudo est unique dans une session.
Un même `user_id` peut donc avoir plusieurs lignes participants (si l'utilisateur rejoint avec des pseudos
différents). **Conséquence critique :** toute fonction SQL qui cherche un participant par
`WHERE user_id = auth.uid()` doit utiliser `LIMIT 1` ou un JOIN direct sur `current_speaker_id`,
sous peine de récupérer une ligne arbitraire. Voir `end_turn_as_speaker` (migration 007) comme modèle.

Comportement de `join_session` et `reclaim_moderator` en cas de conflit de pseudo :
`ON CONFLICT (session_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id` — le compte
(et son historique) est transféré au nouveau venu. Permet de retrouver son compte depuis
un autre appareil en retapant le même pseudo.

### `queue_entries`
| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `session_id` | uuid FK → sessions | ON DELETE CASCADE |
| `participant_id` | uuid FK → participants | ON DELETE CASCADE |
| `queue_type` | text | `'long'` ou `'interactive'` |
| `position` | int | Ordre dans la file |
| `created_at` | timestamptz | |

Contrainte : `UNIQUE (session_id, participant_id, queue_type)` — un participant ne
peut être qu'une seule fois dans chaque file.

### `speaking_turns`
| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `session_id` | uuid FK → sessions | ON DELETE CASCADE |
| `participant_id` | uuid FK → participants | ON DELETE CASCADE |
| `started_at` | timestamptz NOT NULL | Posé par le serveur (`now()`) |
| `ended_at` | timestamptz \| null | NULL = tour en cours |
| `source` | text | `'long'`, `'interactive'`, ou `'manual'` |

### Relations
```
app_config (standalone)

sessions ──< participants ──< queue_entries
         ──< speaking_turns
         ──< participants (via current_speaker_id, nullable)
```
Toutes les suppressions en cascade depuis `sessions` : supprimer une session
nettoie automatiquement participants, queue_entries et speaking_turns.

---

## Modèle de sécurité

### Authentification anonyme
Chaque navigateur reçoit un `user_id` UUID persistant via `signInAnonymously()`.
Pas d'email, pas de mot de passe, pas d'OTP. La clé anon Supabase est publique
par conception — la sécurité repose entièrement sur RLS + SECURITY DEFINER.

### Les deux codes et leur rôle

| Code | Stocké où | Utilisé pour |
|---|---|---|
| **Code Ecclesia** | `app_config.creation_code_hash` (bcrypt) | Créer une session ET reprendre la modération depuis un autre appareil |
| **Code de session (join_code)** | `sessions.join_code` (texte clair, 6 hex) | Rejoindre une session existante ; affiché sur le tableau de modération |

Il n'y a plus de code modérateur par session (supprimé en migration 003).
**Aucun hash ne quitte jamais la base.** Les fonctions SECURITY DEFINER les
vérifient en base et retournent les données de session (jsonb) ou lèvent une exception.

### Row Level Security (RLS)

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `app_config` | ✗ (zéro politique) | ✗ | ✗ | ✗ |
| `sessions` | participant de la session | ✗ (via RPC) | modérateur | modérateur |
| `participants` | participant de la session | `user_id = auth.uid()` | — | — |
| `queue_entries` | participant de la session | soi-même ou modérateur | modérateur | soi-même ou modérateur |
| `speaking_turns` | participant de la session | modérateur | modérateur | — |

**Piège RLS auto-référentiel :** la politique SELECT sur `sessions` appelle
`is_session_participant()` qui lit `participants`, dont la politique SELECT
appelle à son tour `is_session_participant()` → boucle infinie. Résolu par la
fonction helper `is_session_participant(uuid)` déclarée `SECURITY DEFINER` qui
contourne RLS pour sa propre requête interne.

### Fonctions SECURITY DEFINER

Toutes les opérations multi-tables ou nécessitant la lecture des hashes passent
par des fonctions SQL `SECURITY DEFINER` (s'exécutent avec les droits du
propriétaire, pas du client) :

| Fonction | Migration | Rôle |
|---|---|---|
| `is_session_participant(uuid)` | 000 | Helper RLS anti-récursion |
| `create_session(pseudo, creation_code)` | 003 | Vérifie le Code Ecclesia, génère join_code, crée session + participant (2 args, ancienne version 3 args supprimée) |
| `join_session(join_code, pseudo)` | 005 | Conflit sur `(session_id, pseudo)` → transfère `user_id` au nouvel appelant (retour depuis autre appareil) |
| `reclaim_moderator(join_code, creation_code)` | 006 | Retourne jsonb (même shape que join_session). Lève exception si session introuvable ou code incorrect. Corrige le conflit sur pseudo (migration 005) |
| `grant_floor(session_id, participant_id, source)` | 001 | Atomique : clôt tour ouvert, défile, ouvre nouveau tour, met à jour session |
| `end_turn(session_id)` | 001 | Pose `ended_at = now()`, vide `current_speaker_id` — modérateur uniquement |
| `add_to_queue(session_id, participant_id, queue_type)` | 001 | `MAX(position)+1` atomique, idempotent (`ON CONFLICT DO NOTHING`) |
| `move_queue_entry(entry_id, direction)` | 001 | Swap de positions avec l'entrée adjacente |
| `correct_turn(turn_id, started_at, ended_at, participant_id)` | 001 | `COALESCE(param, existing)` — NULL = ne pas modifier |
| `end_turn_as_speaker(session_id)` | 007 | Comme `end_turn` mais appelable par l'orateur lui-même. Utilise un JOIN `sessions → participants` via `current_speaker_id` pour éviter l'ambiguïté quand plusieurs lignes existent pour le même `user_id` |
| `reorder_queue_entry(entry_id, new_position)` | 002 | Déplace atomiquement une entrée à une position arbitraire en décalant les voisins |
| `kick_participant(session_id, participant_id)` | 004 | Exclut un participant : vérifie que l'appelant est modérateur, clôt son tour si actif, supprime sa ligne (cascade queue + turns) |

### REPLICA IDENTITY FULL

Posé sur les 4 tables de données (migration 001). Obligatoire pour que les
événements DELETE de Supabase Realtime incluent les colonnes non-PK dans le
filtre côté client (ex. `session_id=eq.<id>` sur `queue_entries`). Sans cela,
les abonnements filtrés ne reçoivent pas les DELETE.

---

## Règles métier critiques

### Un seul orateur à la fois
`grant_floor` clôt systématiquement le tour ouvert (UPDATE `ended_at = now()`)
avant d'en créer un nouveau. Il n'y a jamais deux `speaking_turns` avec
`ended_at IS NULL` pour la même session.

### Chronomètre depuis le timestamp serveur
Le temps affiché est **toujours** calculé comme :
```typescript
Date.now() - new Date(session.current_turn_started_at).getTime()
```
`current_turn_started_at` est posé par `now()` côté PostgreSQL dans `grant_floor`.
Le hook `useLiveMs()` rafraîchit le composant toutes les 500 ms via
`setInterval(() => setMs(Date.now()), 500)` — la variable `ms` ne s'incrémente
pas : elle reçoit `Date.now()` à chaque tick.

### Deux files indépendantes
`queue_type` : `'long'` (affiché "File d'attente : demander la parole") ou `'interactive'`
(affiché "Coupe file"). Elles sont gérées séparément dans l'UI (deux `<QueuePanel>`) et dans
les calculs de position (MAX(position) filtré par `queue_type`).

### Auto-avancement de la file (modérateur uniquement)
Un `useEffect` dans `ModeratorView` déclenche `grantFloor` automatiquement dès
que `session.current_speaker_id` passe à `null` et qu'une file est non-vide.
**Priorité : interactive > longue.** Protégé par deux guards :
- `isGranting` (flag local) — évite les double-appels en cas de re-render rapide
- `pausedSpeakerId !== null` — ne pas auto-avancer quand le modérateur est en pause

### Pause du chrono
La pause est **réelle en DB** : elle appelle `endTurn()` (pose `ended_at`), et
stocke l'ID de l'orateur dans `pausedSpeakerId` (état local `useState`).
La reprise appelle `grantFloor(pausedSpeakerId, 'manual')`. Le temps cumulé est
correct car `ParticipantsTable` somme tous les tours y compris le tour pré-pause.
**Limitation** : si le modérateur recharge la page pendant une pause, `pausedSpeakerId`
est perdu et l'auto-avancement reprend normalement.

### ON DELETE CASCADE
Supprimer la ligne `sessions` déclenche la suppression en cascade de tous les
participants, entrées de file et tours. C'est le mécanisme de clôture de session.
Les participants reçoivent l'événement DELETE via Realtime → `handleEnd()` →
retour à l'écran d'entrée.

### Flag `isModerator` stocké au moment de l'action
Dans un même navigateur (même `userId` anonyme), deux onglets peuvent être l'un
modérateur et l'autre participant. Le flag ne peut pas être dérivé de
`session.created_by === userId` à l'exécution (égal pour les deux onglets).
Il est stocké dans `localStorage` au moment de `create_session` (true) ou
`join_session` (false) et passé comme `initialIsModerator` au `SessionProvider`.
Il est mis à jour en temps réel uniquement si `created_by` change (reclaim
détecté via l'événement UPDATE Realtime, possible grâce à REPLICA IDENTITY FULL).

### Stratégie Realtime — Broadcast + polling + monitoring WebSocket
Le `postgres_changes` + RLS de Supabase génère une vérification SQL par événement
par subscriber → latence 50–200 ms en production. Solution en trois couches :

1. **Broadcast** (instantané) — après chaque action réussie, un message
   `{ type: 'broadcast', event: 'refresh', payload: { tables } }` est envoyé sur
   le channel. Tous les subscribers reçoivent le signal sans vérification RLS et
   appellent `refetch(tables)` immédiatement.
2. **Polling 5 s** — `setInterval(() => load(), 5000)` après `ready = true`.
   Rattrape les broadcasts manqués si un client était temporairement déconnecté.
3. **Monitoring WebSocket** — `ch.subscribe(status => {...})` détecte
   `CHANNEL_ERROR` / `TIMED_OUT` et déclenche un `load()` complet à la
   reconnexion.

Les `postgres_changes` sont conservés en parallèle pour les événements DELETE
(fin de session, participant exclu) qui ne sont pas broadcastés.

**Mapping broadcast par action** :

| Action | Tables broadcastées |
|---|---|
| `grantFloor` | `sessions, queue_entries, speaking_turns` |
| `endTurn` / `endTurnAsSpeaker` | `sessions, speaking_turns, queue_entries` |
| `addToQueue` / `removeFromQueue` / `moveQueueEntry` / `reorderQueueEntry` | `queue_entries` |
| `correctTurn` | `speaking_turns` |
| `kickParticipant` | `sessions, participants, queue_entries, speaking_turns` |
| `endSession` | — (DELETE Realtime suffit) |

---

## Architecture TypeScript

```
src/
├── lib/
│   ├── supabase.ts          Client Supabase (anon key depuis .env)
│   ├── types.ts             Interfaces Session, Participant, QueueEntry, SpeakingTurn
│   ├── storage.ts           sessionStore.get/set/clear (localStorage)
│   └── utils.ts             formatDuration, toDateTimeLocal, fromDateTimeLocal, extractErr
├── hooks/
│   └── useLiveMs.ts         setInterval 500ms → Date.now()
├── context/
│   └── SessionContext.tsx   Provider + useSession() hook — état, Realtime, Broadcast, polling, actions
├── screens/
│   ├── EntryScreen.tsx      Tabs : Rejoindre / Reprendre / Créer ("Code Ecclesia")
│   ├── SessionView.tsx      Routage isModerator → ModeratorView ou ParticipantView
│   ├── ModeratorView.tsx    Vue projetable (DndContext global, auto-avancement, pause/reprise)
│   └── ParticipantView.tsx  Vue mobile (boutons file, bannière parole, sidebar md+)
├── components/
│   ├── SpeakerTimer.tsx     Chronomètre en direct (useLiveMs + formatDuration)
│   ├── QueuePanel.tsx       File avec DnD — useDroppable (cible drop participants) + SortableContext
│   ├── ParticipantsTable.tsx Temps cumulés, drag handles (useDraggable), bouton Exclure
│   ├── ParticipantsSidebar.tsx Liste présents en temps réel, variant dark/light
│   ├── CorrectTurnModal.tsx  Historique des participations avec durée par tour
│   └── ConfirmModal.tsx     Modal de confirmation générique (actions destructives)
└── App.tsx                  Machine à états : loading | entry | session
```

### SessionContext — état exposé
```typescript
session, participants, queueLong, queueInteractive, speakingTurns
myParticipant, isModerator
leaveSession                          // quitte la vue sans clôturer la session
grantFloor, endTurn, endTurnAsSpeaker // endTurnAsSpeaker appelable par l'orateur lui-même
addToQueue, removeFromQueue
moveQueueEntry, reorderQueueEntry     // reorderQueueEntry pour le DnD (position arbitraire)
correctTurn, kickParticipant, endSession
```

Realtime : un seul channel `session:<id>`, 4 abonnements `postgres_changes` +
1 listener Broadcast `refresh` + subscribe callback pour monitoring WebSocket.

### DnD — architecture cross-container
Le `<DndContext>` est dans `ModeratorView` (englobant `<main>`). Il y a deux
types de draggables :
- `useDraggable({ data: { type: 'participant', participantId } })` — lignes de
  `ParticipantsTable`, déposables sur les QueuePanel
- `useSortable({ data: { type: 'queue-entry', queueType } })` — entrées de file,
  réordonnables dans leur panel

`handleMasterDragEnd` dispatche selon `active.data.current.type` :
- `'participant'` → `addToQueue(participantId, over.data.queueType)`
- `'queue-entry'` → `reorderQueueEntry(entryId, newIndex + 1)`

**Stratégie de collision** : `pointerWithin` en priorité (le curseur est physiquement
dans un droppable), fallback `closestCenter`. Obligatoire pour que les drops
cross-container (participant → file) fonctionnent sur les deux files.

### extractErr — gestion des erreurs Supabase
`PostgrestError` (erreur retournée par Supabase) n'est pas une instance de `Error`.
Utiliser `extractErr(e)` (dans `utils.ts`) partout où une erreur est catchée :
```typescript
import { extractErr } from '../lib/utils'
catch (e) { setErr(extractErr(e)) }
// → lit e.message si présent, sinon String(e)
// ✗ NE PAS faire : e instanceof Error ? e.message : String(e)
//   (String(e) sur un PostgrestError donne "[object Object]")
```

---

## État d'avancement

### ✅ Terminé — Prompt 1 : Fondations

- Projet React + Vite + TypeScript + Tailwind initialisé
- Client Supabase configuré (auth anonyme)
- Migration `20260520000000_initial_schema.sql` appliquée :
  - 5 tables avec RLS
  - Fonction helper `is_session_participant`
  - Fonctions `create_session`, `join_session`, `reclaim_moderator`
  - Publication Realtime sur les 4 tables de données
- Écran d'entrée (3 onglets : Rejoindre / Reprendre / Créer)

### ✅ Terminé — Prompt 2 : Cœur fonctionnel

- Migration `20260520000001_core_functions.sql` appliquée :
  - REPLICA IDENTITY FULL sur les 4 tables
  - Fonctions `grant_floor`, `end_turn`, `add_to_queue`, `move_queue_entry`, `correct_turn`
- `SessionContext` avec chargement initial + Realtime temps réel
- `ModeratorView` : header sticky, bloc orateur, deux QueuePanel, ParticipantsTable, CorrectTurnModal
- `ParticipantView` : carte orateur, boutons toggle files, position dans la file
- `SpeakerTimer` : chronomètre depuis timestamp serveur
- Persistance localStorage + restauration au rechargement
- Routage modérateur/participant correct (flag stocké au create/join, non dérivé de `created_by === userId`)

### ✅ Terminé — Prompt 3 : Polish visuel et UX

- Palette sémantique : indigo = file longue, teal = file interactive, amber = orateur, red = destructif
- Animation `animate-speaking` sur le nom de l'orateur
- Hero orateur `text-5xl` + chrono `text-8xl`, placeholder "Micro libre"
- Badge source du tour (file longue / interactive / manuel)
- `ConfirmModal` générique pour les actions destructives
- Boutons de file participant `min-h-[88px]` avec badge de position

### ✅ Terminé — Prompt 4 : Automatisation et UX avancée

- Migration `20260520000002_participant_controls.sql` : `end_turn_as_speaker`, `reorder_queue_entry`
- Auto-avancement (interactive > longue, guards `isGranting` + `pausedSpeakerId`)
- Pause/reprise du micro (endTurn → pausedSpeakerId → grantFloor)
- DnD pour réordonner les files (`reorderQueueEntry`)
- Bouton "J'ai fini de parler" côté participant
- Colonne "Tour actuel" + pied "Total séance" dans ParticipantsTable
- Bouton "Quitter" (leaveSession) distinct de "Terminer session"
- `extractErr` pour les erreurs Supabase

### ✅ Terminé — Prompt 5 : Code unifié + sidebar + DnD cross-container + kick + latence

- Migration `20260520000003_unified_code.sql` : fusion des codes (suppression `moderator_code_hash`,
  `create_session` passe à 2 args, `reclaim_moderator` vérifie `app_config`)
- Migration `20260520000004_kick_participant.sql` : fonction `kick_participant`
- `ParticipantsSidebar` (nouveau composant, variant dark/light) intégré vue modérateur + participant (md+)
- DnD cross-container : `DndContext` remonté dans `ModeratorView`, `useDraggable` sur les lignes
  participants, `useDroppable` sur les QueuePanel, `handleMasterDragEnd` dispatche selon le type
- Bouton "Exclure" dans `ParticipantsTable` avec `ConfirmModal` → `kickParticipant`
- Durée des tours dans `CorrectTurnModal` (formatDuration sur ended_at − started_at)
- Renommage : "Chronos" → "Historique", "Mot de passe du club" → "Code Ecclesia"
- Latence Realtime : Broadcast instantané + polling 5 s + monitoring WebSocket reconnect

### ✅ Terminé — Prompt 7 : Performances et fiabilité Realtime

- **`SessionTimerDisplay`** : `useLiveMs` extrait de `ModeratorView` vers un composant feuille isolé —
  `ModeratorView` ne re-render plus toutes les 500 ms, les hooks dnd-kit (`useSortable`, `useDraggable`)
  ne sont plus évalués inutilement
- **`useMemo`** sur `queueLong`, `queueInteractive`, `myParticipant` dans `SessionContext` — références
  stables, le `useEffect` d'auto-avancement ne se déclenche plus sur des arrays identiques
- **Optimistic UI `ParticipantView`** : boutons "Demander la parole" / "Coupe file" passent en couleur
  immédiatement au clic (spinner à la place du badge jusqu'à confirmation serveur) ; bannière "Vous avez
  la parole" disparaît immédiatement au clic "J'ai fini de parler"
- **Fix auto-avancement bloqué** : `endTurn` et `endTurnAsSpeaker` broadcastent maintenant
  `queue_entries` en plus de `sessions` + `speaking_turns` — le modérateur resynchronise sa file au
  moment précis de la décision d'auto-avancer, éliminant les blocages "Micro libre" causés par un
  broadcast `queue_entries` précédent manqué

### ✅ Terminé — Prompt 6 : UX, renommages, pseudo unique, corrections

- **Timer de séance** dans le hero modérateur : toujours visible, = cumul `speaking_turns` (même valeur que "Total séance" du tableau), calculé via `useLiveMs` + `formatDuration` dans `ModeratorView`
- **DnD cross-container** : stratégie `pointerWithin → closestCenter` — les deux files acceptent maintenant les drops depuis la liste participants
- **Renommages** : "File longue" → "File d'attente : demander la parole" / "File interactive" → "Coupe file" (titres panels, badges source, boutons participant)
- **Boutons participant** : "Demander la parole" (file longue) / "Coupe file" (file interactive)
- **Bouton "Donner la parole"** (était "Manuel") dans `ParticipantsTable`
- **Icône grip 6 points** (dots pleins 2×3) pour tous les drag handles — plus lisible que lignes ou main
- **Sidebar modérateur** visible sur mobile (layout `flex-col lg:flex-row` + `w-full lg:w-52`)
- **Colonne Pseudo** : `max-w-[120px] truncate` pour que "Donner la parole" tienne sur une ligne
- **Pseudo unique par session** (migration 005) : `UNIQUE(session_id, pseudo)`, `join_session` transfère `user_id` au nouvel appelant en cas de conflit
- **Fix `reclaim_moderator`** (migration 006) : retourne jsonb, lève des exceptions explicites, corrige `ON CONFLICT` cassé par migration 005
- **Fix `end_turn_as_speaker`** (migration 007) : JOIN direct `sessions → participants` via `current_speaker_id`, robuste quand plusieurs lignes existent pour le même `user_id`
- **Fix erreurs `[object Object]`** dans `EntryScreen` : `extractErr` utilisé partout, `handleReclaim` simplifié (plus de requêtes post-RPC)

🔲 **Reste à faire (éventuel)**
- Toast notifications pour les actions
- Page 404 / session expirée élégante
- Persistance de la pause après rechargement (localStorage)
- Tests manuels complets sur mobile (iOS Safari, Android Chrome)

---

## Ce qu'il ne faut jamais faire

### ❌ Utiliser la `service_role` key dans le frontend
La clé `service_role` bypasse RLS entièrement. Elle ne doit exister que côté
serveur (Edge Functions, migrations). Dans le frontend : uniquement `anon key`.

### ❌ Comparer les codes en clair côté client
Les codes ne doivent jamais être envoyés au client, même hashés. La comparaison
se fait **exclusivement** en base via `crypt()` dans les fonctions SECURITY DEFINER.

### ❌ Placer `useLiveMs()` haut dans l'arbre de composants
`useLiveMs()` déclenche un re-render de **tout** le sous-arbre toutes les 500 ms. Dès qu'un
composant parent contient des hooks dnd-kit (`useSortable`, `useDraggable`), cela devient
très coûteux. Toujours isoler `useLiveMs` dans un petit composant feuille qui ne rend que le
timer (pattern `SpeakerTimer`, `SessionTimerDisplay`) :
```tsx
// ✗ INTERDIT dans un composant parent complexe (ModeratorView, etc.)
const now = useLiveMs()
const elapsed = now - start

// ✓ CORRECT — composant feuille dédié
function MyTimer({ startedAt }: { startedAt: string }) {
  const now = useLiveMs()
  return <span>{formatDuration(now - new Date(startedAt).getTime())}</span>
}
```

### ❌ Utiliser `setInterval` pour incrémenter un compteur de temps
```typescript
// ✗ INTERDIT — dérive au fil du temps, inexact après suspension navigateur
const [elapsed, setElapsed] = useState(0)
setInterval(() => setElapsed(e => e + 1), 1000)

// ✓ CORRECT — toujours exact, même après mise en veille
const now = useLiveMs()  // Date.now() actualisé toutes les 500ms
const elapsed = now - new Date(startedAt).getTime()
```

### ❌ Poser `started_at` ou `ended_at` depuis le client
Ces timestamps doivent être posés par `now()` côté PostgreSQL (dans
`grant_floor` et `end_turn`). Seule exception : `correct_turn`, où le
modérateur corrige manuellement après coup.

### ❌ Créer un channel Realtime par abonnement
Un seul channel par session, avec plusieurs `.on()` chaînés. Multiplier les
channels consomme des connexions WebSocket inutiles.

### ❌ Dériver `isModerator` de `session.created_by === userId` dans le rendu
Incorrect dans un même navigateur où les deux onglets partagent le même
`userId`. Utiliser `initialIsModerator` passé au `SessionProvider` depuis
`localStorage`.

### ❌ Catcher les erreurs Supabase avec `String(e)` directement
`PostgrestError` est un objet plain (pas `instanceof Error`). `String(e)` donne
`[object Object]`. Toujours utiliser `extractErr(e)` de `src/lib/utils.ts`.

### ❌ Déclencher `grantFloor` sans guard `isGranting`
L'auto-avancement dans `ModeratorView` est dans un `useEffect` qui peut se
relancer plusieurs fois en rafale (changement de `queueInteractive` + changement
de `current_speaker_id` dans le même cycle). Sans le flag `isGranting`, deux
appels simultanés créent deux tours successifs non souhaités.

### ❌ Oublier `broadcast([...])` après une nouvelle action
Toute nouvelle fonction d'action dans `SessionContext` doit appeler `broadcast`
après le RPC (sur succès uniquement). Sans ça, les autres clients ne reçoivent
la mise à jour qu'au prochain polling (5 s de délai).

### ❌ Chercher un participant par `WHERE user_id = auth.uid()` sans précaution
Depuis migration 005, la contrainte `UNIQUE(session_id, user_id)` n'existe plus.
Un même `user_id` peut avoir plusieurs lignes `participants` dans une session.
Un `SELECT id INTO v_participant_id FROM participants WHERE session_id = x AND user_id = auth.uid()`
sans `LIMIT 1` ou `ORDER BY` renvoie une ligne arbitraire → bugs silencieux.
**Préférer** un JOIN direct sur `current_speaker_id` (voir `end_turn_as_speaker`)
ou ajouter `LIMIT 1` avec un `ORDER BY created_at` explicite.
