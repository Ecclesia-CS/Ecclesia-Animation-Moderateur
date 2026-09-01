# À vérifier

Liste des points nécessitant une validation humaine, générés lors des sessions Claude Code.
Ne pas supprimer une entrée sans validation explicite de Jules — se contenter de la déplacer en section "Validé" une fois confirmée.

> **2026-08-03** — Fichier allégé à la demande de Jules avant une remise à zéro de la mémoire Dispatch : toutes les entrées déjà vérifiées/confirmées (chantiers 1 à 34 et vagues de vérification antérieures) ont été retirées — leur historique complet reste dans l'historique git de ce fichier (`git log -p -- A_VERIFIER.md`). Ne restent que les points encore réellement ouverts au 03/08/2026.

## En attente

- [ ] **Chantier 8 (rattrapage) — Fix DnD : l'entrée déposée n'arrive plus en dernier (A2)**
  Mergé sur `main` (`e1fb31a`), aucune migration.

  **Comportement attendu** : dans `ModeratorView` (files d'attente longue/interactive), glisser une entrée sur une ligne précise doit la déposer à cette position exacte — pas systématiquement en dernier.

  **Test minimal** (table animée réelle, Code Ecclesia requis) : avec plusieurs entrées dans une file, glisser une entrée (depuis le panneau participants ou une autre position) directement sur une ligne précise → vérifier qu'elle atterrit à la position visée.

- [ ] **Chantier 37 — Point 1 : bouton "Répartir en tables" retiré (phase voting)**
  Mergé sur `main` (`cf7083d`), aucune migration.

  **Comportement attendu** : le bouton n'existe plus en phase `voting` côté superadmin. Le toggle IA "Fusionner auto en fin de vote" (`ai_auto_merge_<id>`) se déclenche maintenant au moment où le superadmin fait passer la séance de `voting` à `allocating`, au lieu de dépendre du bouton supprimé.

  **Test minimal** : séance en phase `voting` → vérifier l'absence du bouton. Avec le toggle "Fusionner auto en fin de vote" activé, faire passer la séance en `allocating` → vérifier que la fusion IA s'est bien déclenchée (log `LLMModerationPanel`).

- [ ] **Chantier 37 — Point 2 : bug de réassignation modérateur**
  Mergé sur `main` (`cf7083d`). **Migration `supabase/migrations/20260803_chantier37_set_member_moderator_seat.sql` appliquée et vérifiée par Jules côté Supabase** (`set_member_moderator` confirmée contenir la logique de placement) — seul le test manuel ci-dessous reste à faire.

  **Comportement attendu** : depuis la liste des participants (onglet Membres du superadmin), cocher "modérateur" sur quelqu'un doit maintenant l'asseoir automatiquement sur la première table animée encore sans modérateur (même logique que `claim_moderator_status`), pas seulement poser le flag.

  **Test minimal** : séance avec ≥ 2 tables animées, une avec modérateur déjà assis, une sans. Onglet Membres → cocher "modérateur" sur quelqu'un assis à la table déjà pourvue → vérifier dans l'onglet Tables qu'il apparaît maintenant assis (déplacé) sur la table sans modérateur.

- [ ] **Chantier 36 — Point 1 : modérateur affiché en double (onglet 🪑 Tables)**
  Mergé sur `main` (`0c98775`), aucune migration.

  **Comportement attendu** : dans l'onglet Tables du superadmin, un modérateur ne doit apparaître qu'une fois (badge "🎙️ Modérateur : X"), plus jamais aussi comme puce glissable ordinaire dans la liste des membres en dessous.

  **Test minimal** (mot de passe superadmin requis) : séance `allocating`/`debating` avec une table animée dont le modérateur est déjà assis → vérifier l'absence de doublon. Cas modérateur en surplus (assis ailleurs comme participant ordinaire, chantier 25b) → vérifier qu'il n'apparaît que dans son propre badge, jamais en puce.

- [ ] **Chantier 36 — Point 2 : case "Je suis modérateur" sur l'écran "Débat en cours"**
  Mergé sur `main` (`0c98775`), aucune migration.

  **Comportement attendu** : sur l'écran "Débat en cours" (accessible via "Séances en cours" → "Rejoindre →" sur une séance `debating`), cocher "Je suis modérateur de cette table" révèle un champ "Code Ecclesia" ; la soumission doit amener en `ModeratorView` (pas `ParticipantView`) sur la table dont le code a été saisi.

  **Hypothèse non tranchée avec Jules** : ce point réutilise `reclaim_moderator` (rejoint *la table dont le code a été saisi*, comme modérateur de cette table précise) plutôt que `claim_moderator_status` (auto-assise sur la première table animée en attente, chantier 33). Si le comportement attendu était plutôt ce second mécanisme, c'est un choix différent à trancher.

  **Test minimal** : depuis "Séances en cours", "Rejoindre →" sur une séance `debating`, avec un compte n'ayant jamais rejoint cette séance → cocher la case, code de table réel + code Ecclesia réel → vérifier l'arrivée en `ModeratorView`.

- [ ] **Chantier 35 — synchronisation temps réel du statut modérateur**
  Mergé sur `main` (`42ccae2`). **Migration `supabase/migrations/20260803_chantier35_session_members_replica_identity.sql` appliquée et vérifiée par Jules côté Supabase** (`REPLICA IDENTITY FULL` confirmé sur `session_members`) — les deux abonnements realtime `session_members` sont donc actifs, seul le test manuel ci-dessous reste à faire.

  **Comportement attendu** (3 points) :
  1. Superadmin voit en direct (sans reload) un changement de modérateur initié côté participant (auto-attachement chantier 33, `reclaim_moderator`) — section "Tables rattachées" ET onglet Tables/Groupes.
  2. Participant bascule en direct vers `ParticipantView` (sans reload) si le superadmin lui retire son statut de modérateur pendant le débat — et redevient `ModeratorView` si le statut est rendu (réversible, tant que personne d'autre n'a repris le contrôle physique de la table).
  3. Le badge "Vous êtes modérateur" (phase vote) se met à jour en direct si le superadmin décoche le statut depuis l'onglet Membres.

  **Volontairement pas traité** : le sens inverse du point 2 (superadmin *ajoute* le statut modérateur à quelqu'un déjà physiquement assis à une table) ne fait pas basculer son écran vers `ModeratorView` — asymétrie connue, pas demandée par Jules.

  **Test minimal** (mot de passe superadmin requis) :
  1. **Point 1 (reclaim)** : superadmin sur "Tables rattachées" ouvert, 2ᵉ onglet fait un `reclaim_moderator` sur une table → `moderator_pseudo` doit se mettre à jour sans reload (~15s max).
  2. **Point 1 (auto-attachement, à re-tester en priorité — jamais reproduit en session)** : séance `allocating`/`debating`, table animée sans modérateur, superadmin sur l'onglet 🪑 Tables. 2ᵉ onglet : `#session/<code>` → "🎙️ Modérateur" → se déclarer modérateur → vérifier l'apparition à la table sans reload.
  3. **Point 2 (retrait en débat)** : participant modérateur physique d'une table en `debating` → superadmin retire son statut (onglet Tables ou case Membres) → vérifier bascule vers `ParticipantView` sans reload, puis réversibilité en recochant.
  4. **Point 3 (phase vote)** : participant avec badge "Vous êtes modérateur" visible → superadmin décoche depuis Membres → badge doit disparaître sans reload.
  5. **Régression** : un modérateur "classique" (table créée via `create_table`/`reclaim_moderator`, jamais inscrit au vote de cette séance, donc sans ligne `session_members`) doit garder son `ModeratorView` sans interruption.

## Validé

<!-- déplacer ici une fois vérifié, au format : - [x] **AAAA-MM-JJ (validé le AAAA-MM-JJ)** — `fichier` — description -->
