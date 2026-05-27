# CLAUDE.md — Ecclesia · Modérateur de débat

> **Note (refactor B0)** : depuis ce refactor, ce qu'on appelait "session" dans le code (un cercle de débat modéré) s'appelle désormais **"table"**. Le mot "session" est réservé pour un futur niveau supérieur (= "séance"), qui contiendra plusieurs tables.

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
  **"Coupe file"** (pour répondre à ce qui est dit actuellement uniquement)
- Auto-avancement de la file : la parole est accordée automatiquement au premier
  de file (Coupe file en priorité), sans action manuelle du modérateur
- Chronomètre en direct pour l'orateur + **timer global de séance** (= cumul des tours), toujours visible dans le hero
- Cumul du temps de parole par participant + temps total de séance
- Pause/reprise du chrono par le modérateur (tour clôturé en DB, rouvert à la reprise)
- Participant : bouton "J'ai fini de parler" pour libérer la parole soi-même
- Correction manuelle des tours ("Historique des participations")
- **Export CSV** : bouton "Exporter" (modérateur) — télécharge résumé participants + historique complet des tours
- Persistance de session après rechargement (localStorage) ; reconnexion automatique au même participant via pseudo
- **Pseudo unique par session** : rejoindre avec le même pseudo récupère le compte et l'historique existants
- Reprise de la modération depuis un autre appareil (Code Ecclesia)
- Bouton "Quitter" pour participants et modérateur (sans clôturer la session)
- Sidebar participants en temps réel (vue modérateur toujours visible ; vue participant sur md+ uniquement)
- Drag & drop depuis la liste participants vers les files (modérateur) — stratégie `pointerWithin`
- Exclusion de participant ("Exclure") avec confirmation
- Vue participant : pas d'affichage de l'orateur en cours (les participants ne voient que leurs propres boutons)
- **Questionnaire post-débat** : bouton dans le header des deux vues → modale avec 6 questions (idées de thèmes, vote 0-5 sur 26 thèmes en ordre aléatoire, staffing, note du débat, retour libre) ; réponses persistées en base (upsert par user+table)
- **Documentation par séance** : 3 URLs optionnelles sur la séance (`doc_info_url`, `doc_summary_url`, `doc_collab_url`) — configurées par le superadmin ; bouton "Documentation" dropdown dans les headers modérateur et participant (masqué si aucun doc) ; lien collaboratif visible sur l'EntryScreen avant même de rejoindre

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

Six tables dans le schéma `public`. Toutes ont RLS activé.

### `app_config`
| Colonne | Type | Notes |
|---|---|---|
| `key` | text PK | Ex. `creation_code_hash`, `superadmin_code_hash` |
| `value` | text | Hash bcrypt — jamais retourné au client |

Zéro politique RLS → accès total interdit hors fonctions SECURITY DEFINER.

### `sessions`
| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `title` | text NOT NULL | Titre de la séance |
| `description` | text \| null | Description optionnelle |
| `scheduled_at` | timestamptz \| null | Date/heure prévue |
| `join_code` | text \| null | 6 caractères hex uppercase, unique parmi non-fermées |
| `phase` | text | `'draft'` \| `'voting'` \| `'allocating'` \| `'debating'` \| `'questionnaire'` \| `'closed'` |
| `created_at` | timestamptz | |
| `doc_info_url` | text \| null | URL publique de la fiche information (PDF kDrive, etc.) |
| `doc_summary_url` | text \| null | URL publique du résumé (PDF) |
| `doc_collab_url` | text \| null | URL du document collaboratif (Google Docs, Notion…) |

Index partiel `sessions_join_code_active_idx` sur `(join_code) WHERE phase != 'closed' AND join_code IS NOT NULL`.

### `tables`
| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `join_code` | text UNIQUE | 6 caractères hexadécimaux uppercase |
| `created_by` | uuid | `auth.uid()` du modérateur courant |
| `current_speaker_id` | uuid \| null | FK → `participants.id` |
| `current_turn_started_at` | timestamptz \| null | Timestamp serveur |
| `created_at` | timestamptz | |
| `session_id` | uuid \| null | FK → `sessions.id` ON DELETE SET NULL |
| `questionnaire_forced_at` | timestamptz \| null | Posé par `force_session_questionnaire` pour déclencher l'ouverture du modal chez les participants |

Note : la colonne `moderator_code_hash` a été supprimée (migration 003). Il n'y
a plus de code par table — la reprise de modération utilise le Code Ecclesia
global (`app_config.creation_code_hash`).
`session_id` est NULL par défaut : une table sans séance fonctionne exactement comme avant (non-régression B0).

### `participants`
| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `table_id` | uuid FK → tables | ON DELETE CASCADE |
| `user_id` | uuid | `auth.uid()` |
| `pseudo` | text | |
| `created_at` | timestamptz | |

Contrainte : `UNIQUE (table_id, pseudo)` (migration 005) — un pseudo est unique dans une table.
Un même `user_id` peut donc avoir plusieurs lignes participants (si l'utilisateur rejoint avec des pseudos
différents). **Conséquence critique :** toute fonction SQL qui cherche un participant par
`WHERE user_id = auth.uid()` doit utiliser `LIMIT 1` ou un JOIN direct sur `current_speaker_id`,
sous peine de récupérer une ligne arbitraire. Voir `end_turn_as_speaker` (migration 007) comme modèle.

Comportement de `join_table` et `reclaim_moderator` en cas de conflit de pseudo :
`ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id` — le compte
(et son historique) est transféré au nouveau venu. Permet de retrouver son compte depuis
un autre appareil en retapant le même pseudo.

### `queue_entries`
| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `table_id` | uuid FK → tables | ON DELETE CASCADE |
| `participant_id` | uuid FK → participants | ON DELETE CASCADE |
| `queue_type` | text | `'long'` ou `'interactive'` |
| `position` | int | Ordre dans la file |
| `created_at` | timestamptz | |

Contrainte : `UNIQUE (table_id, participant_id, queue_type)` — un participant ne
peut être qu'une seule fois dans chaque file.

### `questionnaire_responses`
| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `table_id` | uuid \| null | FK → `tables.id` ON DELETE SET NULL |
| `session_id` | uuid \| null | FK → `sessions.id` ON DELETE SET NULL |
| `user_id` | uuid NOT NULL | `auth.uid()` |
| `theme_ideas` | text \| null | Idées de thèmes libres |
| `theme_ratings` | jsonb DEFAULT '{}' | Notes 0-5 par thème `{ "thème": note }` |
| `debate_attended` | text \| null | Débat auquel l'utilisateur a participé |
| `debate_rating` | smallint \| null | Note globale 0-5 |
| `staff_interest` | text \| null | Coordonnées si intérêt pour staffer |
| `feedback` | text \| null | Retour libre |
| `created_at` | timestamptz | |

Index partiel unique `(user_id, table_id) WHERE table_id IS NOT NULL` — un user ne répond qu'une fois par table (upsert possible).
RLS : SELECT `user_id = auth.uid()` ; INSERT/UPDATE uniquement via `submit_questionnaire` (SECURITY DEFINER).

### `private_notes`
| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `table_id` | uuid FK → tables | ON DELETE CASCADE |
| `user_id` | uuid NOT NULL | `auth.uid()` |
| `content` | text NOT NULL | HTML produit par contenteditable |
| `updated_at` | timestamptz NOT NULL | |

Contrainte : `UNIQUE(table_id, user_id)` — une note par utilisateur par table (upsert).
RLS : SELECT/INSERT/UPDATE/DELETE uniquement par `user_id = auth.uid()`. Aucune fonction SECURITY DEFINER — les notes ne sont accessibles à personne d'autre, y compris le superadmin.

### `speaking_turns`
| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `table_id` | uuid FK → tables | ON DELETE CASCADE |
| `participant_id` | uuid FK → participants | ON DELETE CASCADE |
| `started_at` | timestamptz NOT NULL | Posé par le serveur (`now()`) |
| `ended_at` | timestamptz \| null | NULL = tour en cours |
| `source` | text | `'long'`, `'interactive'`, ou `'manual'` |

### Relations
```
app_config (standalone)

sessions ──< tables ──< participants ──< queue_entries
                    ──< speaking_turns
                    ──< participants (via current_speaker_id, nullable)
```
Toutes les suppressions en cascade depuis `tables` : supprimer une table
nettoie automatiquement participants, queue_entries et speaking_turns.
Supprimer une `sessions` pose `tables.session_id = NULL` (ON DELETE SET NULL) — les tables survivent.

---

## Modèle de sécurité

### Authentification anonyme
Chaque navigateur reçoit un `user_id` UUID persistant via `signInAnonymously()`.
Pas d'email, pas de mot de passe, pas d'OTP. La clé anon Supabase est publique
par conception — la sécurité repose entièrement sur RLS + SECURITY DEFINER.

### Les codes et leur rôle

| Code | Stocké où | Utilisé pour |
|---|---|---|
| **Code Ecclesia** | `app_config.creation_code_hash` (bcrypt) | Créer une table ET reprendre la modération depuis un autre appareil |
| **Code de table (join_code)** | `tables.join_code` (texte clair, 6 hex) | Rejoindre une table existante ; affiché sur le tableau de modération |
| **Mot de passe superadmin** | `app_config.superadmin_code_hash` (bcrypt) | Gérer les séances (créer, attacher des tables, fermer) |

Il n'y a plus de code modérateur par table (supprimé en migration 003).
**Aucun hash ne quitte jamais la base.** Les fonctions SECURITY DEFINER les
vérifient en base et retournent les données (jsonb ou objet) ou lèvent une exception.

### Row Level Security (RLS)

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `app_config` | ✗ (zéro politique) | ✗ | ✗ | ✗ |
| `sessions` | public (`true`) | ✗ (via RPC) | ✗ (via RPC) | ✗ (via RPC) |
| `tables` | participant de la table | ✗ (via RPC) | modérateur | modérateur |
| `participants` | participant de la table | `user_id = auth.uid()` | — | — |
| `queue_entries` | participant de la table | soi-même ou modérateur | modérateur | soi-même ou modérateur |
| `speaking_turns` | participant de la table | modérateur | modérateur | — |

**Piège RLS auto-référentiel :** la politique SELECT sur `tables` appelle
`is_table_participant()` qui lit `participants`, dont la politique SELECT
appelle à son tour `is_table_participant()` → boucle infinie. Résolu par la
fonction helper `is_table_participant(uuid)` déclarée `SECURITY DEFINER` qui
contourne RLS pour sa propre requête interne.

### Fonctions SECURITY DEFINER

Toutes les opérations multi-tables ou nécessitant la lecture des hashes passent
par des fonctions SQL `SECURITY DEFINER` (s'exécutent avec les droits du
propriétaire, pas du client) :

| Fonction | Migration | Rôle |
|---|---|---|
| `is_table_participant(uuid)` | 000 | Helper RLS anti-récursion |
| `create_table(pseudo, creation_code, session_id?)` | 003/B1.3 | Vérifie le Code Ecclesia, génère join_code, crée table + participant. `p_session_id uuid DEFAULT NULL` — rattache optionnellement à une séance à la création. |
| `join_table(join_code, pseudo)` | 005 | Conflit sur `(table_id, pseudo)` → transfère `user_id` au nouvel appelant (retour depuis autre appareil) |
| `reclaim_moderator(join_code, creation_code)` | 006 | Retourne jsonb (même shape que join_table). Lève exception si table introuvable ou code incorrect. Corrige le conflit sur pseudo (migration 005) |
| `grant_floor(table_id, participant_id, source)` | 001 | Atomique : clôt tour ouvert, défile, ouvre nouveau tour, met à jour table |
| `end_turn(table_id)` | 001 | Pose `ended_at = now()`, vide `current_speaker_id` — modérateur uniquement |
| `add_to_queue(table_id, participant_id, queue_type, position?)` | 001/010 | `MAX(position)+1` atomique, idempotent. Si `p_position` fourni, décale les entrées existantes et insère à la position exacte (DnD). |
| `move_queue_entry(entry_id, direction)` | 001 | Swap de positions avec l'entrée adjacente |
| `correct_turn(turn_id, started_at, ended_at, participant_id)` | 001 | `COALESCE(param, existing)` — NULL = ne pas modifier |
| `end_turn_as_speaker(table_id)` | 007 | Comme `end_turn` mais appelable par l'orateur lui-même. Utilise un JOIN `tables → participants` via `current_speaker_id` pour éviter l'ambiguïté quand plusieurs lignes existent pour le même `user_id` |
| `reorder_queue_entry(entry_id, new_position)` | 002 | Déplace atomiquement une entrée à une position arbitraire en décalant les voisins |
| `kick_participant(table_id, participant_id)` | 004 | Exclut un participant : vérifie que l'appelant est modérateur, clôt son tour si actif, supprime sa ligne (cascade queue + turns) |
| `end_turn_and_advance(table_id)` | 008 | Clôt le tour courant ET accorde la parole au suivant (interactive > long) en une transaction atomique. Appelable par le modérateur OU l'orateur actuel. Retourne jsonb `{ current_speaker_id, current_turn_started_at, removed_queue_entry_id }` pour mise à jour locale immédiate côté client. |
| `generate_session_join_code()` | B1 | Helper interne — génère un join_code 6 hex unique parmi les séances non-fermées (retry max 10). |
| `check_superadmin_password(password)` | B1 | Helper interne — vérifie `app_config.superadmin_code_hash` via bcrypt, lève exception si faux. |
| `create_session(password, title, description?, scheduled_at?)` | B1 | Crée une séance avec join_code généré. Retourne la ligne `sessions`. |
| `attach_table_to_session(password, table_id, session_id)` | B1 | Rattache une table à une séance. Retourne la ligne `tables`. |
| `detach_table_from_session(password, table_id)` | B1 | Détache une table de sa séance (`session_id = NULL`). Retourne la ligne `tables`. |
| `close_session(password, session_id)` | B1 | Passe `phase = 'closed'`. Retourne la ligne `sessions`. |
| `list_session_tables(password, session_id)` | B1.3 | Retourne les tables rattachées à une séance (id, join_code, moderator_pseudo, participant_count, is_active). SECURITY DEFINER — bypass RLS `tables`. |
| `list_available_tables(password)` | B1.3 | Retourne les tables sans séance créées dans les 48h. Même structure que `list_session_tables`. |
| `submit_questionnaire(table_id, session_id?, theme_ideas?, theme_ratings?, debate_attended?, debate_rating?, staff_interest?, feedback?)` | 003 questionnaire | Upsert `questionnaire_responses` pour `auth.uid()`. Conflit sur `(user_id, table_id)` → mise à jour. Retourne la ligne résultante. |
| `update_session_docs(password, session_id, doc_info_url?, doc_summary_url?, doc_collab_url?)` | session_docs | Met à jour les 3 URLs de documentation d'une séance (NULL = vide le champ). Retourne la ligne `sessions`. |
| `get_questionnaire_responses(password, session_id?)` | questionnaire_export | Retourne toutes les réponses au questionnaire (bypass RLS) avec JOIN sessions + tables. Si `session_id` fourni, filtre sur la séance ; sinon retourne tout. |
| `delete_questionnaire_response(password, response_id)` | questionnaire_export | Supprime une réponse au questionnaire (bypass RLS). Vérifie le mot de passe superadmin. |
| `add_collab_source(session_id, title, url?, content?, table_join_code?)` | collab_sources + 20260527130000 | Insert une source ; stocke `table_join_code` explicitement (évite la sous-requête non-déterministe). |
| `list_session_sources(session_id)` | collab_sources + 20260527130000 | Retourne les sources avec `COALESCE(ss.table_join_code, sous-requête ORDER BY created_at LIMIT 1)` — rétrocompatible avec les anciennes sources sans valeur stockée. |
| `force_session_questionnaire(password, session_id)` | 20260527140000 | Pose `questionnaire_forced_at = now()` sur toutes les tables de la séance — déclenche l'ouverture du QuestionnaireModal chez les participants connectés. |

### REPLICA IDENTITY FULL

Posé sur les 4 tables de données (migration 001). Obligatoire pour que les
événements DELETE de Supabase Realtime incluent les colonnes non-PK dans le
filtre côté client (ex. `table_id=eq.<id>` sur `queue_entries`). Sans cela,
les abonnements filtrés ne reçoivent pas les DELETE.

---

## Règles métier critiques

### Un seul orateur à la fois
`grant_floor` clôt systématiquement le tour ouvert (UPDATE `ended_at = now()`)
avant d'en créer un nouveau. Il n'y a jamais deux `speaking_turns` avec
`ended_at IS NULL` pour la même table.

### Chronomètre depuis le timestamp serveur
Le temps affiché est **toujours** calculé comme :
```typescript
Date.now() - new Date(table.current_turn_started_at).getTime()
```
`current_turn_started_at` est posé par `now()` côté PostgreSQL dans `grant_floor`.
Le hook `useLiveMs()` rafraîchit le composant toutes les 500 ms via
`setInterval(() => setMs(Date.now()), 500)` — la variable `ms` ne s'incrémente
pas : elle reçoit `Date.now()` à chaque tick.

### Deux files indépendantes
`queue_type` : `'long'` (affiché "File d'attente : demander la parole") ou `'interactive'`
(affiché "Coupe file"). Elles sont gérées séparément dans l'UI (deux `<QueuePanel>`) et dans
les calculs de position (MAX(position) filtré par `queue_type`).

### Auto-avancement de la file
**Chemin principal** : `endTurnAndAdvance` (RPC 008) gère l'avancement côté serveur en une
seule transaction. Appelé par le bouton "Terminer la prise de parole" (modérateur) et
"J'ai fini de parler" (participant). Priorité : interactive > longue.

**Fallback** : un `useEffect` dans `ModeratorView` déclenche `grantFloor` si
`table.current_speaker_id` passe à `null` alors que la file est non-vide. Couvre
uniquement les cas où la file était vide au moment de `endTurnAndAdvance` mais qu'une
entrée est arrivée juste après (condition de course). Protégé par deux guards :
- `isGranting` (flag local) — évite les double-appels en cas de re-render rapide
- `pausedSpeakerId !== null` — ne pas auto-avancer quand le modérateur est en pause

### Pause du chrono
La pause est **réelle en DB** : elle appelle `endTurn()` (pose `ended_at`), et
stocke l'ID de l'orateur dans `pausedSpeakerId` (état local `useState`).
La reprise appelle `grantFloor(pausedSpeakerId, 'manual')`. Le temps cumulé est
correct car `ParticipantsTable` somme tous les tours y compris le tour pré-pause.
La pause est persistée dans `localStorage` sous la clé `ecclesia_pause_<tableId>` (JSON `{ pausedSpeakerId, timerOffset }`). Au rechargement, `ModeratorView` restaure ces valeurs via un initialiseur paresseux — le guard de l'auto-avancement (`pausedRef.current !== null`) est donc actif dès le premier rendu, empêchant le déclenchement de `grantFloor`. Un `useEffect` de validation invalide la pause restaurée si quelqu'un d'autre a entre-temps obtenu la parole, ou si le participant n'existe plus.

### ON DELETE CASCADE
Supprimer la ligne `tables` déclenche la suppression en cascade de tous les
participants, entrées de file et tours. C'est le mécanisme de clôture de table.
Les participants reçoivent l'événement DELETE via Realtime → `handleEnd()` →
retour à l'écran d'entrée.

### Flag `isModerator` stocké au moment de l'action
Dans un même navigateur (même `userId` anonyme), deux onglets peuvent être l'un
modérateur et l'autre participant. Le flag ne peut pas être dérivé de
`table.created_by === userId` à l'exécution (égal pour les deux onglets).
Il est stocké dans `localStorage` au moment de `create_table` (true) ou
`join_table` (false) et passé comme `initialIsModerator` au `TableProvider`.
Il est mis à jour en temps réel uniquement si `created_by` change (reclaim
détecté via l'événement UPDATE Realtime, possible grâce à REPLICA IDENTITY FULL).

### Stratégie Realtime — Broadcast + polling + monitoring WebSocket
Le `postgres_changes` + RLS de Supabase génère une vérification SQL par événement
par subscriber → latence 50–200 ms en production. Solution en quatre couches :

1. **Mise à jour locale immédiate** (0 ms) — après chaque RPC réussi, l'acteur met à
   jour son état local directement (`setTable`, `setQueueEntries`) sans attendre le
   broadcast. `endTurnAndAdvance` retourne le jsonb serveur pour éviter tout skew de
   timestamp. `current_turn_started_at` n'est jamais posé optimistiquement par le client
   (sauf via le retour de `endTurnAndAdvance`).
2. **Broadcast** (instantané) — après chaque action réussie, un message
   `{ type: 'broadcast', event: 'refresh', payload: { tables } }` est envoyé sur
   le channel. Tous les subscribers reçoivent le signal sans vérification RLS et
   appellent `refetch(tables)` immédiatement.
3. **Polling 5 s** — `setInterval(() => load(), 5000)` après `ready = true`.
   Rattrape les broadcasts manqués si un client était temporairement déconnecté.
4. **Monitoring WebSocket** — `ch.subscribe(status => {...})` détecte
   `CHANNEL_ERROR` / `TIMED_OUT` et déclenche un `load()` complet à la
   reconnexion. Heartbeat toutes les 15 s (au lieu de 30 s par défaut).

Les `postgres_changes` sont conservés en parallèle pour les événements DELETE
(fin de table, participant exclu) qui ne sont pas broadcastés.

**Mapping broadcast par action** :

| Action | Tables broadcastées |
|---|---|
| `grantFloor` | `tables, queue_entries, speaking_turns` |
| `endTurn` / `endTurnAsSpeaker` | `tables, speaking_turns, queue_entries` |
| `endTurnAndAdvance` | `tables, speaking_turns, queue_entries` |
| `addToQueue` / `removeFromQueue` / `moveQueueEntry` / `reorderQueueEntry` / `changeQueueType` | `queue_entries` |
| `correctTurn` | `speaking_turns` |
| `kickParticipant` | `tables, participants, queue_entries, speaking_turns` |
| `endTable` | — (DELETE Realtime suffit) |
| `createSession` / `closeSession` / `attachTableToSession` / `detachTableFromSession` | — (Realtime `sessions` suffit ; pas de broadcast dédié) |

---

## Architecture TypeScript

```
src/
├── lib/
│   ├── supabase.ts          Client Supabase (anon key depuis .env)
│   ├── types.ts             Interfaces Session, Table, Participant, QueueEntry, SpeakingTurn
│   ├── sessions.ts          Wrappers RPC séances : verifyPassword, createSession, closeSession, attachTableToSession, detachTableFromSession, listSessionTables, listAvailableTables, getQuestionnaireResponses, deleteQuestionnaireResponse — types SessionTableRow
│   ├── storage.ts           tableStore.get/set/clear (localStorage)
│   └── utils.ts             formatDuration, toDateTimeLocal, fromDateTimeLocal, extractErr, generateTableCSV, generateQuestionnaireCSV, QUESTIONNAIRE_THEMES
├── hooks/
│   └── useLiveMs.ts         setInterval 500ms → Date.now()
├── context/
│   └── TableContext.tsx     Provider + useTable() hook — état, Realtime, Broadcast, polling, actions
├── screens/
│   ├── EntryScreen.tsx      Tabs : Rejoindre / Reprendre / Créer + lien "Administration" (hash routing)
│   ├── SuperadminScreen.tsx Auth mot de passe (sessionStorage), liste séances, création, fermeture, vue détail rattachement tables ; accordéons "Thèmes" (classement par moyenne) et "Réponses" (liste cliquable + suppression)
│   ├── TableView.tsx        Routage isModerator → ModeratorView ou ParticipantView
│   ├── ModeratorView.tsx    Vue projetable (DndContext global, auto-avancement, pause/reprise)
│   └── ParticipantView.tsx  Vue mobile (boutons file, bannière parole, titre séance si rattachée, sidebar md+)
├── components/
│   ├── SpeakerTimer.tsx     Chronomètre en direct (useLiveMs + formatDuration + offsetMs)
│   ├── QueuePanel.tsx       File avec DnD — useDroppable (cible drop participants) + SortableContext
│   ├── ReadOnlyQueuePanel.tsx File lecture seule (participants) — aucun DnD, position + pseudo
│   ├── ParticipantsTable.tsx Temps cumulés, drag handles (useDraggable), bouton Exclure
│   ├── ParticipantsSidebar.tsx Liste présents en temps réel, variant dark/light
│   ├── CorrectTurnModal.tsx  Historique des participations avec durée par tour
│   ├── ConfirmModal.tsx     Modal de confirmation générique (actions destructives)
│   ├── QuestionnaireModal.tsx Formulaire post-débat (6 questions, 26 thèmes en ordre aléatoire, 5 visibles + "voir plus", upsert via RPC)
│   ├── QuestionnaireFab.tsx Bouton "Questionnaire post-débat" dans le header (rend QuestionnaireModal)
│   ├── DocumentationButton.tsx Bouton "Documentation" dropdown dans le header — 3 liens (fiche info, résumé, doc collab) ouverts en nouvel onglet ; masqué si aucune URL configurée ; fermeture au clic extérieur ; prop `currentTableJoinCode` pour stocker le code table dans sessionStorage avant navigation collab
│   └── ParticipantToolsButton.tsx Bouton "Outils" unique dans le header participant — ouvre un panel bottom-sheet contenant : liens Documentation (inline, conditionnels), bouton "Mes notes" (→ NotesModal), bouton "Questionnaire post-débat" (→ QuestionnaireModal, désactivé si complet). Remplace les 3 boutons séparés dans ParticipantView.
└── App.tsx                  Machine à états : loading | entry | table + listener hashchange → SuperadminScreen sur `#superadmin`
```

### TableContext — état exposé
```typescript
table, participants, queueLong, queueInteractive, speakingTurns
myParticipant, isModerator
leaveTable                                // quitte la vue sans clôturer la table
grantFloor, endTurn, endTurnAsSpeaker     // endTurnAsSpeaker conservé pour usage futur
endTurnAndAdvance                         // clôt le tour ET avance atomiquement (1 RPC, sans double aller-retour)
addToQueue, removeFromQueue
moveQueueEntry, reorderQueueEntry         // reorderQueueEntry pour le DnD (position arbitraire)
changeQueueType                           // déplace une entrée d'une file à l'autre (DnD cross-queue)
correctTurn, kickParticipant, endTable
```

Realtime : un seul channel `table:<id>`, 4 abonnements `postgres_changes` +
1 listener Broadcast `refresh` + subscribe callback pour monitoring WebSocket.

### DnD — architecture cross-container

Le `<DndContext>` est dans `ModeratorView` (englobant `<main>`). Il y a deux types de draggables :
- `useDraggable({ id: 'p-' + p.id, data: { type: 'participant', participantId } })` — lignes de `ParticipantsTable`
- `useSortable({ data: { type: 'queue-entry', queueType } })` — entrées de file, réordonnables

**Stratégie de collision** : `pointerWithin` uniquement, **sans fallback** `closestCenter`. Retourner `[]` quand le curseur est hors de tout droppable évite le snap parasite vers la première row (ce qui plaçait l'item en position 1 par défaut). Désormais, drop hors panel = ignoré ; drop sur le panel ou une row = insertion en **dernière position** par défaut. La détection haut/bas (insérer avant ou après la row survolée selon la moitié verticale) a été tentée via `pointermove` global puis via `delta.y` de `DragOverEvent`, mais les deux approches se sont révélées non fiables avec dnd-kit (PointerSensor capture les events pointer avant qu'ils n'atteignent les listeners externes ; `delta.y` seul ne permet pas de reconstituer fidèlement la position absolue du curseur). Cette fonctionnalité a été abandonnée.

#### DnD optimiste — état local pendant le drag

`ModeratorView` maintient des **copies locales** des files (`localLong`, `localInteractive`) qui se mettent à jour à chaque `onDragOver`. Ces copies sont passées aux `QueuePanel` pendant le drag ; l'état serveur (`queueLong`, `queueInteractive`) sert uniquement à resynchroniser quand `isDragging` passe à `false`.

Références (`useRef`) gardées à jour en temps réel par des fonctions wrapper (`setLocalLong`/`setLocalInteractive`) :
```typescript
function setLocalLong(val) { localLongRef.current = val; _setLocalLong(val) }
```
Cela évite les stale closures dans `handleDragOver` (qui peut être appelé plusieurs fois avant un re-render).

#### Ghost entry (participant → file)

Quand un participant est draggé, un `QueueEntry` fantôme (`id: '__ghost__'`) est inséré dans la file locale à la position survolée. `QueuePanel` accepte une prop `ghostId` et `SortableRow` affiche le ghost en `opacity-50` + bordure pointillée sans boutons d'action.

#### `intraQueueLastOverRef` — dernier over valide pour l'intra-queue

`handleDragOver` fait un early return pour l'intra-queue (SortableContext gère l'animation CSS). Mais au moment du drop, `over.id` peut être le panel ID (`'queue-long'`) si le curseur s'est déplacé vers le bord du panel. Sans ce ref, `findIndex(over.id)` retourne -1 → réordonnancement silencieusement ignoré.

Solution : dans le bloc early return intra-queue, si `over.id` est un UUID de row (pas un panel ID ni `active.id`), on le stocke dans `intraQueueLastOverRef.current`. `handleMasterDragEnd` l'utilise en priorité sur `over.id`. Réinitialisé au dragStart et dragCancel.

#### `activeOriginalQTRef` — queue type d'origine immuable

`active.data.current` dans dnd-kit est un **ref mutable** : il change quand le composant re-render avec de nouvelles données. Quand `handleDragOver` déplace une entrée de `long` vers `interactive`, le composant re-render avec `queue_type: 'interactive'`, ce qui corrompt `active.data.current.queueType`. On capture donc le `queueType` original dans `activeOriginalQTRef` au moment du `dragStart` et on utilise ce ref (pas `active.data.current.queueType`) dans `handleMasterDragEnd` pour la détection cross-queue.

#### Comportement de `handleDragOver` selon le scénario

| Scénario | Comportement |
|---|---|
| Intra-source-queue | `currentQT === overQT && currentQT === activeOriginalQTRef.current` → skip (SortableContext gère l'animation CSS) |
| Cross-queue (1er passage) | Retire l'entrée de la source, insère dans la cible à la position survolée, met à jour les deux refs |
| Intra-target-queue (après crossing) | Même logique : retire et réinsère à la nouvelle position (tracking continu pour le drop final) |
| Hover sur l'item actif lui-même | `over.id === active.id` → skip (l'item est absent de `targetBase`, évite dstIdx = -1) |

#### `handleMasterDragEnd` — lecture de la position finale

- **Cross-queue** : `localLongRef.current` ou `localInteractiveRef.current` → `findIndex(e.id === active.id)` → position 1-based
- **Participant → file** : `localRef` → `findIndex(e.id === GHOST_ID)` → position 1-based
- **Intra-queue** : `queueLong`/`queueInteractive` (état serveur, non modifié) → `findIndex(over.id)` → `reorderQueueEntry`

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

## Niveau séance (B1)

### Concept

Une **séance** (`sessions`) est un conteneur optionnel qui regroupe plusieurs tables de débat
(= une soirée, un sujet). Une table peut exister sans séance — comportement B0 inchangé.

### Relation

```
sessions (1) ──< (0..n) tables
```

`tables.session_id` est NULL par défaut. `ON DELETE SET NULL` : supprimer une séance libère les
tables sans les effacer.

### Auth superadmin

Le superadmin est un rôle sans compte Supabase nominatif (B2). Il s'authentifie via un mot de
passe distinct du Code Ecclesia, vérifié côté PostgreSQL :

- Stocké hashé (bcrypt) dans `app_config` sous la clé `superadmin_code_hash`
- Même modèle de sécurité que `creation_code_hash` (zéro RLS, SECURITY DEFINER uniquement)
- Le client saisit le mot de passe dans l'UI superadmin ; il est conservé en `sessionStorage`
  le temps de la session navigateur (effacé à la fermeture de l'onglet) et envoyé à chaque appel RPC

Pour définir ou changer le mot de passe superadmin (via SQL Editor Supabase) :
```sql
INSERT INTO app_config (key, value)
VALUES ('superadmin_code_hash', crypt('MON_MOT_DE_PASSE', gen_salt('bf')))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

### Fonctions RPC disponibles (migration B1)

| Fonction | Rôle |
|---|---|
| `create_session(password, title, description?, scheduled_at?)` | Crée une séance, génère un join_code |
| `attach_table_to_session(password, table_id, session_id)` | Rattache une table à une séance |
| `detach_table_from_session(password, table_id)` | Détache une table (session_id → NULL) |
| `close_session(password, session_id)` | Ferme une séance (phase → 'closed') |

### Phases déclarées

`draft` → `voting` → `allocating` → `debating` → `questionnaire` → `closed`

En B1, seuls `draft` (à la création) et `closed` (via `close_session`) sont utilisés.
Les autres valeurs sont déclarées pour préparer les chantiers futurs.

### Wrappers TypeScript

`src/lib/sessions.ts` expose :
- `verifyPassword(password)` — vérifie le mot de passe sans effet de bord
- `createSession` / `closeSession` — gestion cycle de vie séance
- `attachTableToSession` / `detachTableFromSession` — rattachement
- `listSessionTables(password, sessionId)` → `SessionTableRow[]` — tables rattachées
- `listAvailableTables(password)` → `SessionTableRow[]` — tables sans séance (48h)

Chaque fonction prend le mot de passe en premier argument. Types de retour : `Session`, `Table`, ou `SessionTableRow[]`.

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
- `TableContext` avec chargement initial + Realtime temps réel
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
- Bouton "Quitter" (leaveTable) distinct de "Terminer session"
- `extractErr` pour les erreurs Supabase

### ✅ Terminé — Prompt 5 : Code unifié + sidebar + DnD cross-container + kick + latence

- Migration `20260520000003_unified_code.sql` : fusion des codes (suppression `moderator_code_hash`,
  `create_table` passe à 2 args, `reclaim_moderator` vérifie `app_config`)
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
- **`useMemo`** sur `queueLong`, `queueInteractive`, `myParticipant` dans `TableContext` — références
  stables, le `useEffect` d'auto-avancement ne se déclenche plus sur des arrays identiques
- **Optimistic UI `ParticipantView`** : boutons "Demander la parole" / "Coupe file" passent en couleur
  immédiatement au clic (spinner à la place du badge jusqu'à confirmation serveur) ; bannière "Vous avez
  la parole" disparaît immédiatement au clic "J'ai fini de parler"
- **Fix auto-avancement bloqué** : `endTurn` et `endTurnAsSpeaker` broadcastent maintenant
  `queue_entries` en plus de `tables` + `speaking_turns` — le modérateur resynchronise sa file au
  moment précis de la décision d'auto-avancer, éliminant les blocages "Micro libre" causés par un
  broadcast `queue_entries` précédent manqué
- **Fix build CI** : `userId` retiré du destructuring de `EntryScreen` (prop accepté mais non utilisé,
  `noUnusedLocals` le traitait comme erreur fatale)

### ✅ Terminé — Prompt 6 : UX, renommages, pseudo unique, corrections

- **Timer de séance** dans le hero modérateur : toujours visible, = cumul `speaking_turns` (même valeur que "Total séance" du tableau), calculé via `useLiveMs` + `formatDuration` dans `ModeratorView`
- **DnD cross-container** : stratégie `pointerWithin → closestCenter` — les deux files acceptent maintenant les drops depuis la liste participants
- **Renommages** : "File longue" → "File d'attente : demander la parole" / "File interactive" → "Coupe file" (titres panels, badges source, boutons participant)
- **Boutons participant** : "Demander la parole" (file longue) / "Coupe file" (file interactive)
- **Bouton "Donner la parole"** (était "Manuel") dans `ParticipantsTable`
- **Icône grip 6 points** (dots pleins 2×3) pour tous les drag handles — plus lisible que lignes ou main
- **Sidebar modérateur** visible sur mobile (layout `flex-col lg:flex-row` + `w-full lg:w-52`)
- **Colonne Pseudo** : `max-w-[120px] truncate` pour que "Donner la parole" tienne sur une ligne
- **Pseudo unique par table** (migration 005) : `UNIQUE(table_id, pseudo)`, `join_table` transfère `user_id` au nouvel appelant en cas de conflit
- **Fix `reclaim_moderator`** (migration 006) : retourne jsonb, lève des exceptions explicites, corrige `ON CONFLICT` cassé par migration 005
- **Fix `end_turn_as_speaker`** (migration 007) : JOIN direct `tables → participants` via `current_speaker_id`, robuste quand plusieurs lignes existent pour le même `user_id`
- **Fix erreurs `[object Object]`** dans `EntryScreen` : `extractErr` utilisé partout, `handleReclaim` simplifié (plus de requêtes post-RPC)

### ✅ Terminé — Prompt 8 : Optimisation latence

- **Migration `20260521000000_end_turn_and_advance.sql`** : nouvelle fonction SECURITY DEFINER
  `end_turn_and_advance(table_id)` — clôt le tour courant ET accorde la parole au suivant
  (interactive > long) en une seule transaction atomique. Élimine un aller-retour réseau complet
  sur chaque transition speaker→speaker.
- **`endTurnAndAdvance` dans TableContext** : appelle `end_turn_and_advance`, applique
  immédiatement le jsonb retourné (timestamp serveur exact → pas de skew timer), broadcast pour
  les autres clients. Utilisé par ModeratorView ("Terminer") et ParticipantView ("J'ai fini").
- **Mises à jour locales immédiates après RPC** dans `TableContext` : `endTurn`,
  `endTurnAsSpeaker`, `grantFloor`, `removeFromQueue` mettent à jour l'état local dès le retour
  du RPC, sans attendre le rebond du broadcast (~50–200 ms gagnés par action).
- **`addToQueue`** : refetch `queue_entries` en fire-and-forget immédiatement après le RPC,
  parallèle au broadcast (position inconnue côté client → pas de mise à jour optimiste pure).
- **Auto-avancement `useEffect`** dans `ModeratorView` rétrogradé en fallback (file vide au
  moment de la fin de tour). Commentaire mis à jour.
- **Heartbeat Supabase** : `heartbeatIntervalMs: 15000` + `reconnectAfterMs` exponentiel
  (500 ms → 5 s) dans `supabase.ts` — détection de déconnexion 2× plus rapide.
- **Fix bug `extractErr`** dans `ModeratorView` (auto-avancement) : `e instanceof Error ? ...`
  remplacé par `extractErr(e)`.

### ✅ Terminé — Prompt 9 : UX & corrections

- **Bouton "Exporter"** dans le header modérateur : génère un CSV UTF-8 (BOM Excel) avec résumé
  participants (tours, temps total) + historique détaillé des tours (`generateTableCSV` dans `utils.ts`).
  Téléchargement immédiat via `URL.createObjectURL`, fichier nommé `ecclesia_<joinCode>_<date>.csv`.
- **Masquage "Parole en cours"** côté participant : la carte affichant l'orateur actuel est supprimée de
  `ParticipantView` — les participants ne voient que leurs propres boutons de file.
- **Coupe file — précision** : sous-titre "Pour répondre à ce qui est dit actuellement uniquement" ajouté
  sur le bouton participant (props `sub`) et le QueuePanel modérateur (nouvelle prop `subtitle` optionnelle
  dans `QueuePanel`). Le panel "File longue" n'a pas de subtitle.
- **Fix doublon participant Realtime** : le handler `INSERT` de `participants` dans `TableContext` dédoublonne
  désormais — un upsert (`ON CONFLICT DO UPDATE`) peut déclencher un événement Realtime `INSERT` ; sans
  déduplication, le même participant apparaissait deux fois dans la liste.
- **Fix restauration table (user_id check)** dans `App.tsx` : la restauration vérifie que
  `participant.user_id === auth.uid()` avant de restaurer directement. Si l'auth anonyme a été renouvelé
  (nouvel `user_id`), le flux tombe sur `join_table` qui relie le nouvel `auth.uid()` via `ON CONFLICT
  DO UPDATE SET user_id = EXCLUDED.user_id` — le participant existant est récupéré sans doublon.

### ✅ Terminé — Prompt 10 : Pause améliorée, timer continu, files participant, DnD position, fix doublon

- **Bouton "Passer au suivant"** en état pause : l'admin peut sauter l'orateur pausé et accorder la parole au premier en file (interactive > longue). Si les files sont vides, retour à "Micro libre".
- **Timer continu à la reprise** : `SpeakerTimer` accepte un `offsetMs?: number`. À la pause, `handlePause` capture le temps écoulé dans `timerOffset` (state). À la reprise, le chrono repart du temps cumulé (pas de remise à zéro). Double pause supportée (accumulation). `setTimerOffset(0)` appelé sur "Terminer" et "Passer au suivant".
- **Fix doublon `queue_entries` Realtime** : le handler `INSERT` de `queue_entries` dans `TableContext` dédoublonne désormais (même pattern que `participants`) — un `ON CONFLICT DO NOTHING` ou un refetch en double ne peut plus doubler une entrée dans la liste.
- **DnD position** : migration `20260522000000` — `add_to_queue` accepte `p_position int DEFAULT NULL`. Quand `p_position` est fourni, les entrées existantes sont décalées et le participant est inséré à la position exacte. `addToQueue` dans `TableContext` + `handleMasterDragEnd` dans `ModeratorView` transmettent la position.
- **Files en lecture seule côté participant** : nouveau composant `ReadOnlyQueuePanel` (pas de DnD, affiche position + pseudo). Affiché dans `ParticipantView` après les boutons de demande de parole — visible sur mobile sans encombrer.
- **Suppression "J'ai fini de parler"** : bouton retiré de `ParticipantView`. La bannière "Vous avez la parole !" reste. Seul l'admin gère la fin de tour via "Terminer la prise de parole".

### ✅ Terminé — Prompt 11 : DnD fluide cross-queue + ghost participant

- **DnD optimiste** : `ModeratorView` maintient des copies locales `localLong`/`localInteractive` mises à jour à chaque `onDragOver`. Les `QueuePanel` affichent ces copies pendant le drag ; resynchronisation automatique avec l'état serveur quand `isDragging` passe à `false`.
- **Ghost entry** : lors d'un drag depuis la liste participants, un `QueueEntry` fantôme (`id: '__ghost__'`) s'insère dans la file locale à la position survolée et suit le curseur. `QueuePanel` reçoit une prop `ghostId` ; `SortableRow` affiche le ghost en semi-transparent + bordure pointillée.
- **`activeOriginalQTRef`** : capture le `queueType` au `dragStart` (immuable pendant le drag) pour éviter que `active.data.current.queueType` — ref mutable mis à jour par dnd-kit à chaque re-render — ne corrompe la détection cross-queue dans `handleMasterDragEnd`.
- **Fix cross-queue drop en dernière place** : `handleDragOver` continuait à tracker les mouvements intra-target-queue (après crossing) au lieu de skipper — la position finale est lue directement depuis `localLongRef`/`localInteractiveRef` (même principe que le ghost).
- **Fix `active.data.current.queueType` mutable** : en utilisant `activeOriginalQTRef`, la détection cross-queue (`overQT !== activeOriginalQT`) reste correcte même après les re-renders causés par `handleDragOver`.
- **Migration `20260522000000`** : `add_to_queue` accepte `p_position int DEFAULT NULL` (suppression de l'ancien overload 3-params via DROP FUNCTION pour éviter l'ambiguïté PostgreSQL). `changeQueueType` dans `SessionContext` transmet également la position.
- **`DragOverlay`** : affiche le nom du draggable (participant ou entrée de file) dans une pastille flottante pendant tout le drag.

### ✅ Terminé — Prompt 12 : Fix DnD — suppression closestCenter + défaut en dernier

- **Suppression du fallback `closestCenter`** : quand le curseur est hors de tout droppable, `pointerWithin` retourne `[]` et `handleDragOver` ne se déclenche pas. Avant, `closestCenter` sélectionnait quasi-systématiquement la première row → l'item atterrissait toujours en position 1 par défaut. Désormais, drop hors panel = ignoré ; drop sur le panel ou une row = insertion en dernière position.
- **`intraQueueLastOverRef`** : nouveau ref capturant le dernier `over.id` valide (UUID de row, pas panel) dans `handleDragOver` intra-queue. Utilisé par `handleMasterDragEnd` en priorité sur `over.id` du drop event (qui peut être le panel ID → `newIndex = -1` → réordonnancement silencieusement ignoré). Réinitialisé au dragStart et dragCancel.
- **Détection haut/bas abandonnée** : insérer avant ou après la row survolée selon la moitié verticale du curseur a été tenté via un listener `pointermove` global, puis via `delta.y` de `DragOverEvent`. Les deux approches se sont révélées non fiables (dnd-kit PointerSensor capture les events pointer avant les listeners externes ; `delta.y` seul ne reconstitue pas fidèlement la position absolue). Comportement retenu : insertion toujours en dernière position.

### ✅ Terminé — Refactor B0 : Renommage `session` → `table`

- **Migration SQL `20260526000000_rename_sessions_to_tables.sql`** : `ALTER TABLE sessions RENAME TO tables`, `session_id` → `table_id` dans `participants`, `queue_entries`, `speaking_turns`. Contraintes renommées, policies et fonctions SECURITY DEFINER recréées (`is_table_participant`, `create_table`, `join_table`, corps mis à jour pour les autres). Realtime publication mise à jour.
- **TypeScript** : `Session` → `Table`, `SessionResult` → `TableResult`, `StoredSession` → `StoredTable`, `sessionStore` → `tableStore`, `useSession` → `useTable`, `SessionProvider` → `TableProvider`, `SessionContext.tsx` → `TableContext.tsx`, `SessionView.tsx` → `TableView.tsx`, `generateSessionCSV` → `generateTableCSV`, `leaveSession` → `leaveTable`, `endSession` → `endTable`, RPC `create_session` → `create_table`, `join_session` → `join_table`, params `p_session_id` → `p_table_id`, Supabase `.from('sessions')` → `.from('tables')`, filtres `session_id=eq.*` → `table_id=eq.*`, channel `session:*` → `table:*`.
- **localStorage migration** : `tableStore.get()` lit d'abord `'ecclesia_table'`, migre silencieusement depuis `'ecclesia_session'` (mapping `sessionId` → `tableId`) — les utilisateurs existants ne sont pas déconnectés.
- **Strings UI françaises conservées** : "Chargement de la session…", "Code de session", "Créer une session", "Terminer session", "Session introuvable" (messages SQL), `cell('Session')` (en-tête CSV).

### ✅ Terminé — B1.1 : Schéma sessions (séances)

- **Migration SQL `20260526000001_sessions_schema.sql`** : table `sessions`, colonne `tables.session_id` (NULL par défaut), RLS SELECT public, index partiel unicité join_code parmi non-fermées, helpers `generate_session_join_code` / `check_superadmin_password`, fonctions SECURITY DEFINER `create_session` / `attach_table_to_session` / `detach_table_from_session` / `close_session`, publication Realtime.
- **`src/lib/types.ts`** : ajout interface `Session`, ajout `session_id: string | null` sur `Table`.
- **`src/lib/sessions.ts`** : wrappers typés pour les 4 RPC superadmin + `verifyPassword`.
- **`.env.example`** : hint `VITE_ECCLESIA_SUPERADMIN_PASSWORD_HINT`.

### ✅ Terminé — B1.2 : UI superadmin

- **`src/screens/SuperadminScreen.tsx`** : écran de gestion des séances accessible via `/#superadmin`.
  - Formulaire mot de passe (vérification via `verifyPassword`) ; auto-login depuis `sessionStorage`
  - Liste des séances avec badges de phase, date, description, compteur de tables
  - Tri : actives (draft/debating/…) en tête, clôturées en bas, par date décroissante
  - Création de séance (titre, description optionnelle, date/heure optionnelle) → `createSession`
  - Fermeture de séance avec `ConfirmModal` → `closeSession`
- **`src/App.tsx`** : import et rendu conditionnel `<SuperadminScreen />` (hash routing, voir B1.3+)

### ✅ Terminé — B1.3 : Rattachement tables ↔ séances

- **Migration `20260526000002_b1_3_session_attachment.sql`** :
  - `create_table` passe de 2 à 3 args (`p_session_id uuid DEFAULT NULL`) — appels existants non cassés
  - `list_session_tables(password, session_id)` et `list_available_tables(password)` — SECURITY DEFINER, bypass RLS `tables`
- **`src/screens/SuperadminScreen.tsx`** : navigation list → detail par clic sur `SessionCard` ; `SessionDetail` affiche tables rattachées + tables disponibles (48h), actions Rattacher / Détacher + confirmation
- **`src/screens/EntryScreen.tsx`** : dropdown séances actives dans le formulaire "Créer" (optionnel, caché si aucune séance active)
- **`src/screens/ParticipantView.tsx`** : titre de séance affiché discrètement sous le join_code dans le header
- **`src/lib/sessions.ts`** : `SessionTableRow` type + `listSessionTables` / `listAvailableTables`
- **`src/lib/supabase.ts`** : `session_id: string | null` ajouté à `TableResult`

### ✅ Terminé — Branchement SuperadminScreen (accès visible)

- **`src/App.tsx`** : listener `hashchange` → navigation hash réactive au clic (le check statique `window.location.hash` n'était évalué qu'au render initial)
- **`src/screens/EntryScreen.tsx`** : lien "Administration" discret en bas de la carte d'entrée
- **`src/screens/SuperadminScreen.tsx`** : bouton "← Retour" sur l'écran de mot de passe ET sur le header de la liste

### ✅ Terminé — Questionnaire post-débat

- **Migration `20260526000003_questionnaire.sql`** : table `questionnaire_responses`, index partiel unique `(user_id, table_id) WHERE table_id IS NOT NULL`, RLS SELECT (`user_id = auth.uid()`), fonction SECURITY DEFINER `submit_questionnaire` (upsert).
- **`src/components/QuestionnaireModal.tsx`** : modale avec 6 questions dans l'ordre — idées de thèmes (texte libre), vote 0-5 sur 26 thèmes proposés, intérêt pour staffer, débat suivi, note globale 0-5, retour libre. Les 26 thèmes sont mélangés aléatoirement à chaque ouverture (`useMemo` + `sort(() => Math.random() - 0.5)`), 5 affichés initialement avec bouton "Voir plus". Pré-remplissage automatique si une réponse existe déjà. Fermeture via Escape, clic overlay, ou bouton ✕. Auto-close 2s après soumission.
- **`src/components/QuestionnaireFab.tsx`** : composant bouton réutilisable (accept `className`) qui ouvre `QuestionnaireModal`. Label : "Questionnaire post-débat".
- **`src/screens/ModeratorView.tsx`** et **`src/screens/ParticipantView.tsx`** : bouton "Questionnaire post-débat" ajouté dans le header (premier bouton à gauche du groupe d'actions pour le modérateur, à gauche de "Quitter" pour le participant), stylé comme les boutons existants.
- **`src/lib/types.ts`** : interface `QuestionnaireResponse` ajoutée.

### ✅ Terminé — Documentation par séance

- **Migration `20260526000004_session_docs.sql`** : 3 colonnes `doc_info_url`, `doc_summary_url`, `doc_collab_url` (text nullable) sur `sessions`. `create_session` mis à jour pour accepter ces 3 paramètres optionnels. Nouvelle fonction SECURITY DEFINER `update_session_docs(password, session_id, ...)` pour édition post-création.
- **`src/lib/types.ts`** : 3 champs ajoutés à l'interface `Session`.
- **`src/lib/sessions.ts`** : `createSession` accepte les 3 URLs optionnelles. Nouveau wrapper `updateSessionDocs`.
- **`src/components/DocumentationButton.tsx`** : bouton "Documentation" avec dropdown (état React + overlay clic-extérieur). S'auto-masque si aucune URL configurée. Séparateur visuel entre PDFs et doc collaboratif. Accepte `className` pour s'adapter aux thèmes light/dark.
- **`src/screens/SuperadminScreen.tsx`** : 3 champs URL dans la modale de création + section "Documentation" dans le détail de séance (lecture des URLs actuelles + bouton "Modifier" → formulaire inline `update_session_docs`).
- **`src/screens/ParticipantView.tsx`** : fetch étendu pour récupérer les 3 URLs en plus du titre. `DocumentationButton` dans le header (avant Questionnaire).
- **`src/screens/ModeratorView.tsx`** : fetch ajouté (`doc_info_url, doc_summary_url, doc_collab_url`). `DocumentationButton` dans le header (premier bouton).
- **`src/screens/EntryScreen.tsx`** : dropdown séances charge `doc_collab_url` ; si la séance sélectionnée a un lien collaboratif, un lien "Document collaboratif de cette séance →" apparaît sous le dropdown — accessible avant de rejoindre.

### ✅ Terminé — Export CSV + tableau de bord questionnaires (superadmin)

- **Migration `20260527000000_questionnaire_export.sql`** : fonction SECURITY DEFINER `get_questionnaire_responses(password, session_id?)` — bypass RLS, JOIN `sessions` + `tables`, filtre optionnel par séance.
- **Migration `20260527000001_questionnaire_coalesce.sql`** : `submit_questionnaire` mis à jour — `COALESCE` sur les champs texte/number (valeur existante non écrasable), `||` sur `theme_ratings` (fusion additive). Permet le verrouillage granulaire côté client.
- **Migration `20260527000002_delete_questionnaire_response.sql`** : fonction SECURITY DEFINER `delete_questionnaire_response(password, response_id)` — suppression d'une réponse individuelle.
- **`src/lib/types.ts`** : interfaces `QuestionnaireExportRow` et `QuestionnaireResponse`.
- **`src/lib/sessions.ts`** : wrappers `getQuestionnaireResponses`, `deleteQuestionnaireResponse`.
- **`src/lib/utils.ts`** : constante `QUESTIONNAIRE_THEMES` (liste des thèmes, source unique de vérité) + `generateQuestionnaireCSV(rows)` — CSV UTF-8 BOM, colonnes : Date, Séance, Code table, Débat suivi, Note débat, Idées de thèmes, Intérêt staffing, Retour libre, puis une colonne par thème (dynamique).
- **`src/components/QuestionnaireFab.tsx`** : fetch la ligne complète au montage + à la fermeture du modal ; bouton désactivé (fade) uniquement si **tout** est rempli (tous les champs + tous les thèmes de `QUESTIONNAIRE_THEMES`).
- **`src/components/QuestionnaireModal.tsx`** : accepte `savedResponse` en prop ; champs et thèmes déjà répondus affichés en fade/disabled avec icône cadenas — les champs vierges restent éditables. Re-clic sur une note → déselection (toggle vers null).
- **`src/screens/SuperadminScreen.tsx`** :
  - Bouton **"Questionnaires"** (CSV) dans le header de `SessionDetail`
  - Accordéon **"Thèmes — classement par moyenne"** : barre de progression colorée (teal ≥ 3.5, indigo, amber < 2), score /5 (1 décimale), nb votes — trié par moyenne desc, dynamique sur `QUESTIONNAIRE_THEMES`
  - Accordéon **"Réponses au questionnaire"** : liste cliquable (expand détails : idées de thèmes, staffing, notes par thème, retour libre), croix rouge + `ConfirmModal` → `deleteQuestionnaireResponse`
  - Les deux accordéons sont fermés par défaut et placés en bas de la vue détail

### ✅ Terminé — Sources collaboratives par séance

- **Migration `20260527000006_collab_sources.sql`** : deux nouvelles tables + 5 fonctions SECURITY DEFINER.
  - `collab_session_users` (`id`, `session_id` FK → `sessions`, `user_id`, `pseudo`, `created_at`) — RLS SELECT `true`, écriture via RPC uniquement. Contrainte `UNIQUE(session_id, pseudo)` avec `ON CONFLICT DO UPDATE SET user_id = EXCLUDED.user_id` (même mécanique que `join_table` : retaper son pseudo depuis un autre appareil réattribue le compte).
  - `session_sources` (`id`, `session_id` FK, `user_id`, `pseudo`, `title`, `url` nullable, `content` nullable, `table_join_code` nullable, `created_at`, `updated_at`) — colonne `table_join_code` ajoutée (migration 20260527130000) pour stocker explicitement le code table à la création. RLS SELECT `true`, écriture via RPC uniquement. Realtime activé.
  - `register_collab_pseudo(session_id, pseudo)` — enregistre ou transfère le compte utilisateur.
  - `add_collab_source(session_id, title, url?, content?, table_join_code?)` — insert une source liée au compte courant, stocke `table_join_code` explicitement.
  - `update_collab_source(source_id, title, url?, content?)` — mise à jour (vérifie `user_id`).
  - `delete_collab_source(source_id)` — suppression (vérifie `user_id`).
  - `list_session_sources(session_id)` — retourne les sources avec `COALESCE(ss.table_join_code, sous-requête ORDER BY created_at LIMIT 1)` — déterministe.
- **`src/lib/types.ts`** : interface `CollabSource` (`id`, `session_id`, `user_id`, `pseudo`, `title`, `url`, `content`, `created_at`, `updated_at`, `table_join_code`).
- **`src/lib/sessions.ts`** : wrappers `registerCollabPseudo`, `addCollabSource`, `updateCollabSource`, `deleteCollabSource`, `listSessionSources`.
- **`src/screens/CollabDocScreen.tsx`** : nouveau screen complet accessible via `/#collab/<session_join_code>`.
  - Auth anonyme → fetch séance par join_code → vérification enregistrement → auto-pseudo sessionStorage → chargement sources.
  - Abonnement Realtime `collab:<session.id>` sur `session_sources` (INSERT/UPDATE/DELETE temps réel).
  - Sources groupées par `table_join_code` via `groupByTable()` — chaque groupe dans un accordéon.
  - `SourceCard` : titre, lien URL, contenu, boutons Modifier/Supprimer pour ses propres sources uniquement.
  - `ConfirmModal` de confirmation avant suppression.
  - Formulaire "Ajouter" et "Modifier" partagé ; passage entre les deux via `editingSource` state.
  - Bannière d'avertissement pseudo : "Retenez bien votre pseudo — il est nécessaire pour retrouver vos sources depuis un autre appareil."
- **`src/App.tsx`** : route `if (hash.startsWith('#collab/'))` → `<CollabDocScreen sessionJoinCode={joinCode} />` dans le listener `hashchange`.
- **`src/components/DocumentationButton.tsx`** : `session_join_code` ajouté au type `SessionDocs` ; `hasCollab = !!session_join_code || !!doc_collab_url` ; bouton "Sources collaboratives" (navigation in-app) quand `session_join_code` présent, sinon lien externe `doc_collab_url` ; prop `userPseudo?: string` pour le passage de pseudo.
- **`src/screens/EntryScreen.tsx`** : lien "Sources collaboratives de cette séance" dans le dropdown des séances actives — pointe vers `#collab/<session_join_code>` (au lieu de l'ancien lien externe `doc_collab_url`).
- **`src/screens/ModeratorView.tsx`** et **`src/screens/ParticipantView.tsx`** : fetch étendu avec `join_code` ; `session_join_code: data.join_code` dans l'état `sessionDocs` ; prop `userPseudo` passée à `<DocumentationButton>`.
- **`src/screens/SuperadminScreen.tsx`** : suppression du champ `doc_collab_url` dans le formulaire de création et d'édition (auto-géré par le join_code) ; lien "Ouvrir le document →" dans la vue détail séance quand `session.join_code` existe.

### ✅ Terminé — Améliorations UX CollabDoc (auto-pseudo + draft)

- **Auto-pseudo depuis la table** : quand on navigue vers `#collab/<join_code>` depuis le bouton "Sources collaboratives" d'une vue modérateur ou participant, le pseudo de la table est stocké dans `sessionStorage` sous la clé `ecclesia_collab_pseudo_<join_code>` avant la navigation. `CollabDocScreen` lit et supprime cette clé au montage — si l'utilisateur n'est pas encore enregistré, `registerCollabPseudo` est appelé silencieusement. Zéro friction pour les participants en table ; les utilisateurs arrivant via lien direct voient toujours le formulaire de pseudo.
- **Draft préservé à la fermeture** : `openAdd()` n'efface plus les champs `formTitle`/`formUrl`/`formContent` — le brouillon survive à la fermeture du formulaire. Les champs sont vidés uniquement après une soumission réussie (ajout). `openEdit()` écrase les champs avec les valeurs de la source existante sans toucher au brouillon (il est restauré à la fermeture de l'édition).

### ✅ Terminé — Notes privées par participant

- **Migration `20260527000007_private_notes.sql`** : table `private_notes` (`id`, `table_id` FK → `tables` ON DELETE CASCADE, `user_id`, `content`, `updated_at`). Contrainte `UNIQUE(table_id, user_id)`. RLS stricte `user_id = auth.uid()` sur SELECT/INSERT/UPDATE/DELETE — aucune fonction SECURITY DEFINER, aucun bypass possible. Les notes sont supprimées automatiquement en cascade à la suppression de la table.
- **`src/components/NotesModal.tsx`** : éditeur `contenteditable` avec toolbar — Gras (Ctrl+B), Italique (Ctrl+I), Souligné (Ctrl+U), Barré, taille de police (Petit/Normal/Grand via `fontSize` execCommand). Auto-save debounced 800 ms → upsert Supabase. Chargement de la note existante au montage. Fermeture : Escape, clic overlay, bouton ✕. Placeholder CSS via `content: attr(data-placeholder)`.
- **`src/components/NotesButton.tsx`** : bouton générique, prop `label?: ReactNode` pour afficher texte ou icône selon le contexte. Ouvre `NotesModal` au clic.
- **`src/lib/types.ts`** : interface `PrivateNote` ajoutée.
- **`src/screens/ModeratorView.tsx`** : `NotesButton` avec icône SVG crayon (bouton compact, `title="Mes notes"`) — header déjà chargé.
- **`src/screens/ParticipantView.tsx`** : `NotesButton` avec label texte "Mes notes" — header moins chargé.

### ✅ Terminé — Dropdown "Outils Modo" + titre de séance dans le header modérateur

- **Dropdown "Outils Modo"** : Transcription, Exporter et Historique regroupés en un seul bouton dropdown dans le header modérateur (même pattern dark que `DocumentationButton`). Réduit le header de 3 boutons à 1. Transcription : start/stop depuis le menu, point coloré vert/gris si connecté, "Modifier l'URL" en sous-item discret. Point rouge clignotant sur le bouton "Outils Modo" si enregistrement en cours. L'input URL reste inline dans le header quand actif.
- **Titre de séance à gauche** : `ModeratorView` fetch aussi `title` depuis `sessions` (en plus des URLs doc déjà chargées) et l'affiche à l'extrême gauche du header (`hidden sm:block`, `truncate max-w-[180px]`, `title` tooltip) — utilise l'espace libre côté gauche sans impacter les boutons.

### ✅ Terminé — Consolidation header participant + correctifs notes et sources collaboratives + forçage questionnaire

- **`src/components/ParticipantToolsButton.tsx`** (nouveau) : bouton "Outils" unique qui remplace les 3 boutons séparés (Documentation, Mes notes, Questionnaire post-débat) dans le header participant. Ouvre un panel bottom-sheet (overlay clic-extérieur, slide-up mobile). Stocke `ecclesia_collab_table_<join_code>` dans sessionStorage avant navigation collab.
- **`src/screens/ParticipantView.tsx`** : remplacé les 3 anciens boutons par `<ParticipantToolsButton>` + détection du forçage questionnaire (`questionnaire_forced_at`) via `useRef` pour éviter les ré-ouvertures parasites — ouvre automatiquement `QuestionnaireModal` quand la valeur change.
- **`src/components/NotesModal.tsx`** : `saveNote` destructure `{ error: dbErr }` du résultat upsert et affiche l'erreur en rouge dans le header modal — fin des échecs silencieux. Imports `extractErr` ajoutés.
- **Sources collaboratives — déterminisme** : migration `20260527130000_collab_table_join_code.sql` — `session_sources.table_join_code` stocké explicitement à la création (`add_collab_source` reçoit `p_table_join_code`). `list_session_sources` utilise `COALESCE(ss.table_join_code, sous-requête ORDER BY created_at LIMIT 1)` pour la rétrocompatibilité. La chaîne sessionStorage `DocumentationButton` → `CollabDocScreen` assure que le bon code table est toujours transmis.
- **Sources collaboratives — déconnexion** : bouton "Changer" discret à côté du pseudo dans `CollabDocScreen` — remet `myPseudo` à null et réaffiche le formulaire d'enregistrement.
- **Forçage questionnaire** : migration `20260527140000_questionnaire_force.sql` — colonne `tables.questionnaire_forced_at` + RPC SECURITY DEFINER `force_session_questionnaire(password, session_id)`. `TableContext` expose `forceQuestionnaire()` (UPDATE direct par RLS modérateur + broadcast). `ModeratorView` : item "Forcer questionnaire" dans le dropdown "Outils Modo". `SuperadminScreen` : bouton "Forcer questionnaire" dans le header `SessionDetail` avec `ConfirmModal`. `ParticipantView` : détection realtime de `questionnaire_forced_at` → ouverture automatique du modal.

🔲 **Reste à faire (éventuel)**
- Toast notifications pour les actions
- Page 404 / table expirée élégante
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
Un seul channel par table, avec plusieurs `.on()` chaînés. Multiplier les
channels consomme des connexions WebSocket inutiles.

### ❌ Dériver `isModerator` de `table.created_by === userId` dans le rendu
Incorrect dans un même navigateur où les deux onglets partagent le même
`userId`. Utiliser `initialIsModerator` passé au `TableProvider` depuis
`localStorage`.

### ❌ Catcher les erreurs Supabase avec `String(e)` directement
`PostgrestError` est un objet plain (pas `instanceof Error`). `String(e)` donne
`[object Object]`. Toujours utiliser `extractErr(e)` de `src/lib/utils.ts`.

### ❌ Lire `active.data.current` dans `handleDragEnd` pour un drag cross-queue
`active.data.current` dans dnd-kit est un **ref mutable** mis à jour à chaque re-render du composant source. Quand `handleDragOver` déplace une entrée de `long` vers `interactive`, le `SortableRow` re-render avec `queue_type: 'interactive'` → dnd-kit met à jour `active.data.current.queueType` → la détection cross-queue dans `handleDragEnd` (`overQT !== activeOriginalQT`) échoue, et on tombe sur le bloc intra-queue qui appelle `reorderQueueEntry` au lieu de `changeQueueType`.
**Solution** : capturer le `queueType` dans un `useRef` au moment du `dragStart` et utiliser ce ref (pas `active.data.current.queueType`) pour toute logique dépendant du type d'origine.

### ❌ Déclencher `grantFloor` sans guard `isGranting`
L'auto-avancement dans `ModeratorView` est dans un `useEffect` qui peut se
relancer plusieurs fois en rafale (changement de `queueInteractive` + changement
de `current_speaker_id` dans le même cycle). Sans le flag `isGranting`, deux
appels simultanés créent deux tours successifs non souhaités.

### ❌ Oublier `broadcast([...])` après une nouvelle action
Toute nouvelle fonction d'action dans `TableContext` doit appeler `broadcast`
après le RPC (sur succès uniquement). Sans ça, les autres clients ne reçoivent
la mise à jour qu'au prochain polling (5 s de délai).

### ❌ Supposer qu'un événement Realtime `INSERT` sur `participants` signifie un nouveau participant
Un upsert SQL (`INSERT ... ON CONFLICT DO UPDATE`) déclenche parfois un événement `INSERT` côté
Supabase Realtime (plutôt que `UPDATE`). Ne jamais faire `prev => [...prev, n]` sans vérifier si
`n.id` existe déjà dans `prev` — sinon le même participant apparaît deux fois dans la liste.
Pattern correct (dans les handlers Realtime de `TableContext`) :
```typescript
if (eventType === 'INSERT')
  setParticipants(prev =>
    prev.some(p => p.id === n.id)
      ? prev.map(p => p.id === n.id ? n : p)   // déjà présent → mettre à jour
      : [...prev, n]                             // vraiment nouveau
  )
```

### ❌ Chercher un participant par `WHERE user_id = auth.uid()` sans précaution
Depuis migration 005, la contrainte `UNIQUE(table_id, user_id)` n'existe plus.
Un même `user_id` peut avoir plusieurs lignes `participants` dans une table.
Un `SELECT id INTO v_participant_id FROM participants WHERE table_id = x AND user_id = auth.uid()`
sans `LIMIT 1` ou `ORDER BY` renvoie une ligne arbitraire → bugs silencieux.
**Préférer** un JOIN direct sur `current_speaker_id` (voir `end_turn_as_speaker`)
ou ajouter `LIMIT 1` avec un `ORDER BY created_at` explicite.
