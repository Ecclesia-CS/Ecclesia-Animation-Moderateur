# Référence — Tables sans animateur (`leaderless`)

> Les quatre chemins par lesquels une table sans animateur devient modérée, et la règle de bascule arrière (`leaderless_by_design`). Sujet dense et plusieurs fois source d'erreur : lire cette page **en entier** avant de toucher à `tables.leaderless`.

---

### Tables leaderless (`table.leaderless = true`)
Tout le monde voit `ParticipantView`, tant qu'aucun modérateur n'a été désigné. Pas de modérateur par défaut. Flux de parole :
1. Participant appuie "Demander la parole" → entre en file
2. `useEffect` dans `ParticipantView` détecte : leaderless + personne ne parle + je suis premier → appelle `claimFloor()` (RPC atomique, silencieux si race condition)
3. Quand on a la parole, bouton "J'ai fini de parler" visible → appelle `endTurnAndAdvance` → donne la parole au suivant
4. Création via EntryScreen (checkbox "Table sans animateur", pas de code Ecclesia requis) ou bouton "+ Sans admin" dans le superadmin
5. Badge jaune "Sans animateur" dans la vue superadmin, tant qu'elle reste `leaderless`

**Devenir modérateur d'une table leaderless (chantier 64)** — deux chemins, tous deux posent `leaderless = false` côté serveur (jamais côté client seul) :
- **Auto-désignation en cours de débat** (`designate_moderator`, chantier 3/D2) : un participant assis à la table clique "🎙️ Devenir modérateur" (bandeau d'accueil et header de `ParticipantView`), confirme (`ConfirmModal` — le texte précise qu'il renonce à participer). Pose `tables.leaderless = false` et `tables.created_by = auth.uid()`. Indépendant de toute séance/Bloc C.
- **Désignation Bloc C** (`claim_moderator_status`, `set_member_moderator`, `assign_moderator_to_table`) : si le membre visé a déjà un siège (`table_assignments`) sur une table `leaderless`, ces trois RPC la convertissent en place (`UPDATE tables SET leaderless = false`) plutôt que de chercher une autre table animée sans modérateur — le membre garde son siège, la table devient la sienne à animer.
- **Prise en charge par un modérateur en retard, par code** (`claim_table_as_moderator`, chantier 68) : un modérateur qui n'est PAS déjà assis à la table la cible par son `join_code` (formulaire de rattrapage `JoinTableForm`/`EntryScreen`, D14). Refusé si `table_has_moderator` répond vrai (créateur physique assis, ou modérateur Bloc C désigné) — une table `leaderless` y répond toujours `false`, donc ciblable. Pose `tables.created_by = auth.uid()` et `leaderless = false`, comme `designate_moderator`, mais sans qu'il soit nécessaire d'être déjà participant de la table.
- **Retrait en place vs. départ vers une autre table (chantier 64, complément)** — Jules distingue deux cas via `tables.leaderless_by_design` (posé une fois à la création ou à chaque recalcul d'allocation, jamais par une conversion organique — voir plus haut) :
  - **`leaderless_by_design = false`** (table conçue pour avoir un modérateur) : retirer son modérateur (`set_member_moderator(..., false)`) ou le voir partir vers une autre table (`switch_table` ou `move_member_to_group`) **ne change rien** — `leaderless` reste `false`, Jules considère qu'il va revenir.
  - **`leaderless_by_design = true`** (table convertie depuis une table sans modérateur) : retirer le modérateur **en place** (`set_member_moderator(..., false)`, le membre reste assis à la même table) ne change toujours rien — état déjà supporté par l'app (table fraîchement créée par `create_tables_batch`, ou en cours de configuration en `allocating`). Mais s'il **part rejoindre une autre table**, sa table d'origine **redevient `leaderless = true`** (`leaderless_by_design` ne bouge pas, la table reste reconvertible) — que le départ vienne du participant lui-même (`switch_table`, chantier 48) ou du superadmin qui le déplace (`move_member_to_group`, glisser-déposer onglet Groupes — **chantier 64, complément 2**, même garde exacte). Le bouton "Quitter" (`leaveTable()`) ne compte pas — purement local, ne supprime aucune ligne, jamais de bascule depuis ce chemin.
  - Aucun `DELETE`/`TRUNCATE` n'est déclenché par ces bascules dans un sens ou l'autre : file d'attente, tours de parole et temps de parole sont préservés (aucun trigger sur `tables` dans tout l'historique de migrations ; `leaderless`/`leaderless_by_design` sont de simples colonnes sans effet de bord). Voir `A_VERIFIER.md` (chantier 64) pour les scénarios de vérification et pour les chemins délibérément non traités (`kick_participant` — pas de table de destination ; `assign_table_to_group` — rebind tout un groupe, pas un membre ; inventaire complet en tête de `20260902_chantier64c_move_member_to_group_revert.sql`).

---

*Annexe de [`CLAUDE.md`](../CLAUDE.md) — extraite au chantier 78 (2026-09-07) pour alléger le fichier réinjecté au démarrage de chaque session. **Contenu déplacé tel quel, rien n'a été supprimé ni résumé.** Si une information d'ici doit redevenir un réflexe permanent, la remonter dans `CLAUDE.md` plutôt que de la dupliquer.*
