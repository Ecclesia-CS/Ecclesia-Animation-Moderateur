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
- Deux files d'attente de prise de parole : **longue** (nouveau point) et
  **interactive** (réponse directe)
- Auto-avancement de la file : la parole est accordée automatiquement au premier
  de file (interactive en priorité), sans action manuelle du modérateur
- Chronomètre en direct pour l'orateur (côté modérateur uniquement)
- Cumul du temps de parole par participant + temps total de séance
- Pause/reprise du chrono par le modérateur (tour clôturé en DB, rouvert à la reprise)
- Participant : bouton "J'ai fini de parler" pour libérer la parole soi-même
- Correction manuelle des tours (erreur de démarrage, oubli d'arrêt)
- Persistance de session après rechargement (localStorage)
- Reprise de la modération depuis un autre appareil (code modérateur)
- Bouton "Quitter" pour participants et modérateur (sans clôturer la session)

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
| `moderator_code_hash` | text | Hash bcrypt — jamais retourné au client |
| `created_by` | uuid | `auth.uid()` du modérateur courant |
| `current_speaker_id` | uuid \| null | FK → `participants.id` |
| `current_turn_started_at` | timestamptz \| null | Timestamp serveur |
| `created_at` | timestamptz | |

### `participants`
| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `session_id` | uuid FK → sessions | ON DELETE CASCADE |
| `user_id` | uuid | `auth.uid()` |
| `pseudo` | text | |
| `created_at` | timestamptz | |

Contrainte : `UNIQUE (session_id, user_id)` — un seul pseudonyme par utilisateur par session.

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

### Les trois codes et leur rôle

| Code | Stocké où | Utilisé pour |
|---|---|---|
| **Code de création du club** | `app_config.creation_code_hash` (bcrypt) | Autoriser la création de nouvelles sessions ; connu uniquement de l'organisateur du club |
| **Code de session (join_code)** | `sessions.join_code` (texte clair, 6 hex) | Rejoindre une session existante ; affiché sur le tableau de modération |
| **Code modérateur** | `sessions.moderator_code_hash` (bcrypt) | Reprendre la modération depuis un autre appareil via `reclaim_moderator` |

**Aucun hash ne quitte jamais la base.** Les fonctions SECURITY DEFINER les
vérifient en base et retournent uniquement un booléen ou les données de session.

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
| `create_session(pseudo, creation_code, moderator_code)` | 000 | Vérifie le code club, génère join_code, crée session + participant |
| `join_session(join_code, pseudo)` | 000 | Idempotent : crée ou met à jour le participant |
| `reclaim_moderator(join_code, moderator_code)` | 000 | Transfère `created_by` si code correct |
| `grant_floor(session_id, participant_id, source)` | 001 | Atomique : clôt tour ouvert, défile, ouvre nouveau tour, met à jour session |
| `end_turn(session_id)` | 001 | Pose `ended_at = now()`, vide `current_speaker_id` — modérateur uniquement |
| `add_to_queue(session_id, participant_id, queue_type)` | 001 | `MAX(position)+1` atomique, idempotent (`ON CONFLICT DO NOTHING`) |
| `move_queue_entry(entry_id, direction)` | 001 | Swap de positions avec l'entrée adjacente |
| `correct_turn(turn_id, started_at, ended_at, participant_id)` | 001 | `COALESCE(param, existing)` — NULL = ne pas modifier |
| `end_turn_as_speaker(session_id)` | 002 | Comme `end_turn` mais appelable par l'orateur lui-même (vérifie `current_speaker_id`) |
| `reorder_queue_entry(entry_id, new_position)` | 002 | Déplace atomiquement une entrée à une position arbitraire en décalant les voisins |

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
`queue_type` : `'long'` (nouveau point/ajout) ou `'interactive'` (réponse
directe). Elles sont gérées séparément dans l'UI (deux `<QueuePanel>`) et dans
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
│   └── SessionContext.tsx   Provider + useSession() hook — état, Realtime, actions
├── screens/
│   ├── EntryScreen.tsx      Tabs : Rejoindre / Reprendre / Créer
│   ├── SessionView.tsx      Routage isModerator → ModeratorView ou ParticipantView
│   ├── ModeratorView.tsx    Vue projetable (auto-avancement, pause/reprise, DnD files)
│   └── ParticipantView.tsx  Vue mobile (boutons file, bannière parole, bouton fin)
├── components/
│   ├── SpeakerTimer.tsx     Chronomètre en direct (useLiveMs + formatDuration)
│   ├── QueuePanel.tsx       Tableau de file avec DnD (@dnd-kit) — props variant + accent + onReorder
│   ├── ParticipantsTable.tsx Temps cumulés, tour actuel, total séance, barres %
│   ├── CorrectTurnModal.tsx  Formulaire de correction d'un tour
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
correctTurn, endSession
```

Realtime : un seul channel `session:<id>`, 4 abonnements `postgres_changes`.

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

**Palette et animation**
- Fond modérateur `slate-900/950` (optimisé projection) ; fond participant `white/gray-50` (mobile)
- Palette sémantique : indigo = file longue, teal = file interactive, amber = orateur actif, red = destructif
- Animation `animate-speaking` (pulse 2 s, keyframe dans `tailwind.config.js`) sur le nom de l'orateur

**Vue modérateur (`ModeratorView.tsx`)**
- Hero orateur : nom `text-5xl` animé + chrono `text-8xl font-mono` en `indigo-300`
- Placeholder "Micro libre" quand personne ne parle
- Badge source du tour (file longue / interactive / manuel) en haut du hero
- Deux files côte à côte (`grid-cols-2` sur `md+`)
- Badge **pseudo + "Modérateur"** en haut à droite du header (icône 🔑 sur mobile)
- "Terminer session" ouvre `ConfirmModal` (plus d'inline confirm)

**Vue participant (`ParticipantView.tsx`)**
- Banner ambre **"Vous avez la parole !"** avec chrono `text-4xl` quand c'est soi-même qui parle
- Boutons de file `min-h-[88px]`, label `text-xl` — 4 états visuels distincts :
  attente (blanc) / file longue (indigo rempli) / file interactive (teal rempli) / en train de parler (grisé)
- Badge de position `3 / 7` en coin supérieur droit quand actif

**Composants**
- `QueuePanel` : prop `variant="dark"` pour le skin modérateur, prop `accent` pour la couleur d'en-tête,
  icônes SVG inline (fini les emoji), premier de file mis en valeur en amber
- `ParticipantsTable` : skin dark, barres de progression inline pour le %, orateur `animate-speaking`
- `ConfirmModal` (nouveau) : modal générique réutilisable pour les actions destructives

**EntryScreen (`EntryScreen.tsx`)**
- Logomark SVG en haut de la carte, inputs plus grands (`py-3`, `rounded-xl`)
- Spinner SVG animé pendant le chargement (remplace "Chargement…")

### ✅ Terminé — Prompt 4 : Automatisation et UX avancée

**Migration `20260520000002_participant_controls.sql` appliquée**
- `end_turn_as_speaker` : l'orateur peut terminer son propre tour (vérifie `current_speaker_id`)
- `reorder_queue_entry` : déplacement atomique vers une position arbitraire (pour DnD)

**Auto-avancement (`ModeratorView.tsx`)**
- `useEffect` sur `session.current_speaker_id`, `queueInteractive`, `queueLong`
- Interactive en priorité ; guard `isGranting` anti-double-call ; suspendu si `pausedSpeakerId !== null`

**Pause / Reprise (`ModeratorView.tsx`)**
- Bouton "Pause" : `endTurn()` + `setPausedSpeakerId(currentId)`
- Bandeau ambre "Pause — [Nom]" remplace le hero pendant la pause
- Bouton "Reprendre" : `grantFloor(pausedSpeakerId, 'manual')` + clear state

**Drag & drop dans les files (`QueuePanel.tsx`)**
- `@dnd-kit/core` + `@dnd-kit/sortable` — handle de glissement par ligne
- `PointerSensor` avec `activationConstraint: { distance: 4 }` (évite les drags accidentels)
- `onDragEnd` → calcule `newIndex + 1` → appelle `onReorder(entryId, newPosition)`
- Le bouton mic (grant floor manuel) a été supprimé — remplacé par l'auto-avancement
- La section "Ajouter un participant" a été supprimée — les participants s'ajoutent eux-mêmes

**Vue participant (`ParticipantView.tsx`)**
- Chrono supprimé côté participant (ils voient juste "Vous avez la parole !")
- Bouton rouge **"J'ai fini de parler"** → `endTurnAsSpeaker()` → auto-avancement
- Libellés refondus : "Prendre la parole" (sub : "Introduire un nouveau point…")
  et "Répondre" (sub : "Répondre directement à l'orateur…")

**ParticipantsTable (`ParticipantsTable.tsx`)**
- Nouvelle colonne "Tour actuel" : `<SpeakerTimer>` en live pour l'orateur, `—` pour les autres
- Pied de tableau : "Total séance MM:SS" (somme de tous les tours)

**Bouton "Quitter" (participants + modérateur)**
- `leaveSession()` dans le contexte : efface localStorage + retour à l'écran d'entrée
- Ne clôture PAS la session — distinct de "Terminer session"

**Gestion des erreurs (`utils.ts`)**
- `extractErr(e)` : lit `e.message` si présent, sinon `String(e)` — corrige l'affichage `[object Object]`

🔲 **Reste à faire (éventuel)**
- Gestion des erreurs réseau (reconnexion Realtime, retry)
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
Les codes de création et modérateur ne doivent jamais être envoyés au client,
même hashés. La comparaison se fait **exclusivement** en base via `crypt()` dans
les fonctions SECURITY DEFINER. Ne jamais SELECT `moderator_code_hash` ou
`creation_code_hash` depuis le front.

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

### ❌ Réinitialiser `moderator_code_hash` via le frontend
Le hash bcrypt du code modérateur ne doit être modifié qu'en base (via Supabase
MCP ou SQL Editor). Il n'y a pas d'interface UI pour le changer — c'est voulu.
Pour réinitialiser : `UPDATE sessions SET moderator_code_hash = crypt('nouveau', gen_salt('bf')) WHERE join_code = 'XXXXXX';`
