# Chantier 141 — rapport consolidé (141a à 141f) — 2026-09-29

**Périmètre** : passe navigateur sur **dev** (`mnjqrlrrzrycuconlfqb`), aucun changement de `src/`. Sources : [`lot-1.md`](./lot-1.md) (141a), [`lot-b.md`](./lot-b.md), [`lot-c.md`](./lot-c.md), [`lot-d.md`](./lot-d.md), [`lot-f.md`](./lot-f.md) (141f, reprise du non-joué du 141d). **Consolidation complète.**
Une vérification sur dev ne vaut pas pour prod (bases distinctes). Rien n'est passé en « Validé » dans `A_VERIFIER.md` — décision de Jules.

## 1. Bilan

Tout ce qui a été joué **passe**, à l'exception de A1 (non reproduit, voir ci-dessous). Aucune anomalie bloquante ni grave. Deux entrées « obsolètes » : test 3 du chantier 65 (onglet « Créer » disparu) et rattacher/détacher une table à un brouillon (fonction supprimée au chantier 95).

## 2. Observations, triées par gravité

| # | Gravité | Type | Origine | Observation | Suite proposée |
|---|---|---|---|---|---|
| 1 | mineur | front | 141c O1 (chantier 121-3) | Le badge « N actifs » compte le modérateur en exercice quand il a répondu « actif » (table 1 : 8 affichés pour 7 + 1 modérateur ; total 23 au lieu de 20). Contredit le décompte de l'allocation (91) et peut induire en erreur face aux seuils 5-14. | Exclure le modérateur en exercice du badge. Petit chantier front. |
| 2 | mineur | SQL | 141c O2 (109) | `assign_pending_moderators` traite comme « sans modérateur » une table tenue par un modérateur **physique** (`created_by` sans `active_moderator_member_id`) : deux modérateurs sur la table. Limité aux séances d'avant le chantier 119. | Confirmer que le cas ne peut plus se produire ; sinon garde SQL. |
| 3 | mineur | front | 141b O1 (135) | `#asso` dans un onglet où le superadmin est connecté affiche « Espace association » mais liste **toutes** les séances (session superadmin réutilisée). Sans conséquence pour une vraie asso ; onglet neuf sain. | Confirmer si voulu. |
| 4 | mineur | front | 141a O1 | Deux `join_table` en 400 au chargement quand `localStorage` garde une table périmée ; retour à l'accueil sans message. Peut-être du bruit de test. | Vérifier si un vrai participant peut être dans ce cas sans explication. |
| 5 | cosmétique | front | 141b O2 | L'onglet Analyse d'un **sondage** propose « Comparaison avant/après débat », « Réponses au questionnaire », « Recrutement modérateurs » (sans objet sans débat). Non vérifié pour un débat simple. | Masquer selon `session_type` (règle CLAUDE.md « types de séance »). |
| 6 | cosmétique | front | 141c O4 | Sur les cartes de table, « Libérer la modération de cette table » et « Refaire une table sans animateur » sont collés, sans séparateur. | Ajouter un espacement. |
| 7 | mineur | SQL | 141d A2 | `add_offline_participant` n'a pas de garde sur le nom du modérateur lui-même (`user_id IS DISTINCT FROM auth.uid()`) : ajouter une personne sans téléphone portant son propre nom (autre casse) crée un second participant. Même nom à la casse exacte : reprise silencieuse via `ON CONFLICT`, non testée. | Garde SQL à ajouter. |
| 8 | cosmétique | front | 141d A3 (`JoinTableForm.tsx:244`) — **confirmé au 141f** | Après un conflit de nom, l'accordéon « code de rappel » reste ouvert et vide ; corriger le nom ne le referme pas, « Rejoindre » reste grisé sans explication. | Refermer l'accordéon ou expliquer. |
| 9 | cosmétique | front | 141d | La bannière « Table créée ! Code : … » reste affichée après suppression de cette même table. | Masquer à la suppression. |
| 10 | non confirmé | front | 141d A1 | Prise d'une table `leaderless` par la porte modérateur : une fois la vue participant s'est affichée sans rechargement ; **non reproduit** en 2 essais au 141f (1 sur 3 au total). | À garder en surveillance, pas un bug établi. |
| 11 | test obsolète | doc | 141a (65, test 3) | L'onglet « Créer » de l'accueil n'existe plus (refonte 73/74/140/143). Substance confirmée. | Reformuler l'entrée d'`A_VERIFIER.md` ; idem pour le rattachement de table (65, supprimé au 95). |

**Décision en attente, pas une tâche de test — chantier 120** : `session_members.user_id` se désynchronise au renouvellement du jeton anonyme. Bug **confirmé, sans correctif codé**, en attente d'un arbitrage de sécurité de Jules.

## 3. Outillage (à connaître pour toute future passe)

- Vite prend un autre port (5174/5175) que celui annoncé par `preview_start` : lire `preview_logs`.
- `127.0.0.1` injoignable dans le Browser pane → **une seule identité anonyme** par session de test.
- Le Browser pane rogne l'écran à ~800 px sans `resize_window` ; les `ref` périmées après re-rendu de fenêtre de confirmation.
- La liste des séances du superadmin ne se rafraîchit pas seule après un insert SQL.
- Méthode utile : `ModeratorView` sans Code Ecclesia via `tables.created_by` = uid anonyme courant (voir `lot-1.md`).

## 4. Reste à faire par un humain (ou par 141d)

- **Glisser-déposer** réel (33, 139 « Remplacer le modérateur », 92-4 déplacer un binôme, 91-4) — dnd-kit ne réagit pas au pointeur synthétique.
- **Second appareil / deux identités simultanées** : écran du modérateur supprimé ou remplacé (137-D d, 118, 109 côté participant), chantier 132 en live, synchro Realtime multi-onglets.
- **Gemini réel** (nommage des camps ; `gemini-proxy` non déployé sur dev).
- **Expiration réelle** d'un compte d'association (l. 3049).
- **Restauration de sauvegarde** (l. 997).
- **91-5** : cas limite < 5 actifs, non joué. **Chantier 35** (Realtime multi-onglets) et **57** (quota `gemini-proxy`, non déployé sur dev), **37** (fusion IA auto en `allocating`) : non joués.
- **108** (C1 pré-vote, C2 réouverture en `allocating`, C3 secours `debating`) : C3 couvert par équivalence, C1/C2 demandent des parcours multi-phases. **134 point 5** et porte du secours de `VoteScreen` : non rejoués (même RPC/composant que des cas joués).
- Tous les points **« Sur prod, après merge `dev` → `main` »** (106, 109, 117, 118, 139…).
- **Ménage des tables de test partagées** `589D79`/`6ABDC9`/`6296A9` (`A_VERIFIER.md` ~l. 1749-1757) : **accord explicite de Jules requis** avant toute suppression — **proposé ici, non fait**.
