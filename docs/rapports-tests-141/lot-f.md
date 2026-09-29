# Chantier 141f — reprise du non-joué faisable du 141d (2026-09-29) — PARTIEL

Environnement : **dev** (`mnjqrlrrzrycuconlfqb`), Vite local, `.env.local` pointé sur dev (non commité). Séances `QA141F-*`, tables `QA1FT1/2/3`, purgées (0 ligne restante vérifiée : séances, tables, membres, participants).
Méthode « créateur physique » du 141a : uid anonyme lu dans `localStorage` (`sb-…-auth-token`), `tables.created_by` posé dessus, identité de table posée via `ecclesia_table`. Une modale de bienvenue et une modale « Règles » s'ouvrent au premier affichage d'une table — les fermer avant d'ouvrir « Outils ».

**Volet sans mot de passe : fait. Volets « mot de passe superadmin » et « Code Ecclesia » : non joués** — ils exigent que Jules saisisse le mot de passe dans le Browser pane.

## Résultats

| Item | Résultat | Détail |
|---|---|---|
| Chantier 74 point 3 — ligne `session_members` créée | ✅ | « QA Hors-Ligne » : `joined_phase='debating'`, `attending_in_person=true`, `user_id` distinct de celui du modérateur, code de rappel affiché et haché en base. |
| Chantier 74 point 3 — même pseudo qu'un membre réel | ✅ | Ajout de « Béa Réelle » (membre inscrit, pas assis à la table) : participant ajouté, la ligne `session_members` existante est **inchangée** (même `user_id`, `joined_phase='voting'`), aucun code émis, modale fermée. |
| Chantier 74 point 3 — table sans séance | ✅ | « QA Sans Seance » ajouté : participant créé, **aucune** ligne `session_members`. |
| Chantier 113 — table autonome | ✅ | Bouton « Modérateur » présent (un seul), la modale ne propose **que** « Reprendre l'animation de cette table ». |
| Chantier 46, côté visiteur | ✅ | Modale « Anciennes séances » : `QA141F-closed-public` (closed, `results_public=true`) listée ; `QA141F-closed-prive` (closed, non public) et `QA141F-post-public` (`post_voting`, public) **absentes**. |

## Non joué

- **113, cas « bouton masqué »** (déjà modérateur ET table sans séance) : inatteignable par cette voie — un modérateur physique voit `ModeratorView` (`ModeratorToolsButton`), pas `ParticipantToolsButton`. Reste un cas théorique (modérateur désigné dans `ParticipantView` sur table sans séance).
- **A1 du 141d** : la prise d'une table `leaderless` par la porte modérateur exige le Code Ecclesia (contrairement à ce que laissait entendre le classement « sans mot de passe ») → à rejouer avec Jules.
- **Volet superadmin** (65 rattachement/détachement, 108, 134 pt 4, 33 « humain ») et **volet Code Ecclesia** (refus Bloc C, JoinTableScreen/EntryScreen, 107/110 par code, idempotence 140 règle 4, A3) : en attente des mots de passe saisis par Jules.

## Volet superadmin (mot de passe saisi par Jules dans le Browser pane) — 2026-09-29

Séance `QA141F-draft` (brouillon) et table libre `QA1FT4` créées en SQL sur dev, purgées ensuite (0 ligne restante).

| Item | Résultat | Détail |
|---|---|---|
| Chantier 65 — rattacher / détacher une table à une séance en brouillon | ⚠️ **obsolète** | Le chantier 95 a supprimé `attachTableToSession` / `detachTableFromSession` de `src/lib/sessions.ts` : aucun écran ne permet plus de le faire (la fiche d'un brouillon n'a que En direct / Tables / Préparation / Analyse, sans rattachement). Les RPC restent en base, sans appelant. À reformuler dans `A_VERIFIER.md` plutôt qu'à revérifier. |
| Chantier 65 — le brouillon n'est listé sur aucune liste publique | ✅ | Accueil : « Séances en cours » ne montre pas `QA141F-draft`. Fiche superadmin ouverte normalement (Phase 0, barre de phases, onglets). |
| Chantiers 108, 134 point 4 | reportés | Ils demandent le **Code Ecclesia**, pas le mot de passe superadmin → volet Code Ecclesia. |
| Chantier 33 (glisser-déposer) | humain | Hors automatisation (voir `triage.md`). |
