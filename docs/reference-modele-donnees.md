# Référence — Modèle de données

> Détail colonne par colonne des tables PostgreSQL. Le cœur de `CLAUDE.md` ne garde que l'ordre des phases et les invariants de sécurité ; tout le reste est ici.

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
`id`, `join_code` (UNIQUE, 6 hex), `created_by` (auth.uid()), `current_speaker_id?` (FK→participants), `current_turn_started_at?`, `session_id?` (FK→sessions ON DELETE SET NULL), `leaderless` (boolean, défaut `false`), `leaderless_by_design` (boolean, défaut `false` — **chantier 64**, voir « Tables leaderless » plus bas : `leaderless` décrit l'état courant, `leaderless_by_design` décrit ce que la table est censée être — seule une création ou un (re)calcul d'allocation la pose, jamais une conversion/bascule organique)

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
`id`, `session_id` (CASCADE), `user_id`, `pseudo`, `created_at`, `joined_phase?` (text), `attending_in_person` (boolean, défaut `false`), `reclaim_code?` (text, plain — code 4 chiffres généré côté client lors de l'inscription en `pre_voting`. **Chantier 49** : purgé — `NULL` — dès que la séance passe en `closed`, voir « Rétention des données »), `is_moderator` (boolean, défaut `false` — chantier 19)
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

---

### Rétention des données — codes de rappel (chantier 49)

`session_members.reclaim_code` (PIN 4 chiffres, **en clair**) n'a d'utilité que pendant que la séance est encore ouverte au vote à distance ou présentiel (`confirm_attendance` et `reclaim_prevoting_member` sont les deux seuls lecteurs, tous deux sans usage possible sur une séance close — voir plus bas). Combiné au `pseudo` (nom + prénom réels), c'est la donnée la plus sensible du schéma : elle permet de reprendre l'identité de quelqu'un.

**Politique** : `reclaim_code` est effacé (`NULL`) dès qu'une séance passe en phase `closed` — purge intégrée à `set_session_phase` (migration `20260902_chantier49_purge_reclaim_codes.sql`), pas de tâche périodique séparée. Une purge ponctuelle (même migration) a aussi nettoyé les séances déjà closes au moment du chantier.

**Pourquoi aucune régression fonctionnelle** :
- `confirm_attendance` (phase `voting`/`allocating` uniquement côté frontend — `VoteScreen.tsx`, chemin `#vote/`) n'est jamais atteignable sur une séance `closed` : le routeur redirige vers le questionnaire post-débat ou les résultats avant d'y arriver.
- `reclaim_prevoting_member` (chantier B3) est **phase-safe côté serveur** — il lève une exception si `sessions.phase != 'pre_voting'`, donc échoue déjà sur une séance close indépendamment de la purge.
- Le code affiché au participant juste après inscription (`ReclaimCodeDisplay`, `VoteScreen.tsx`) est généré côté client (`Math.random()`) et jamais relu depuis la base — rien côté UI ne dépend de la persistance du code après affichage initial.

**Ce qui n'est pas purgé, et pourquoi** : le reste de `session_members` (pseudo, réponses d'onboarding, votes, assertions) est conservé indéfiniment — c'est l'historique du débat, réutilisé par `ResultsMapScreen`/`PublicResultsScreen` sans limite de durée connue à ce jour. Pas de politique de rétention tranchée dessus ; voir la recommandation ci-dessous.

**Recommandation (non implémentée)** : envisager, à la clôture, l'anonymisation du `pseudo` (remplacé par un identifiant type "Participant N") une fois passé un délai raisonnable après la clôture — le nom réel n'a plus d'usage fonctionnel une fois les résultats calculés et les camps nommés, alors que `pseudo` reste, avec `reclaim_code` avant cette purge, la donnée la plus identifiante du schéma. Différer l'anonymisation (plutôt que la faire à la clôture comme `reclaim_code`) pour laisser une fenêtre où le superadmin peut encore contacter un participant si besoin (support, litige). Non tranché : durée du délai, et si l'app a un jour besoin de recontacter un participant après coup.

---

*Annexe de [`CLAUDE.md`](../CLAUDE.md) — extraite au chantier 78 (2026-09-07) pour alléger le fichier réinjecté au démarrage de chaque session. **Contenu déplacé tel quel, rien n'a été supprimé ni résumé.** Si une information d'ici doit redevenir un réflexe permanent, la remonter dans `CLAUDE.md` plutôt que de la dupliquer.*
