# Chantier 141 — rapport consolidé (141a + 141b + 141c) — 2026-09-29

**Périmètre** : passe navigateur sur **dev** (`mnjqrlrrzrycuconlfqb`), aucun changement de `src/`. Sources : [`lot-1.md`](./lot-1.md) (141a), [`lot-b.md`](./lot-b.md), [`lot-c.md`](./lot-c.md).
**⚠️ Consolidation partielle : 141d (anciens jalons, portes Code Ecclesia, scénarios du 68) n'a pas été joué** (il exige le superadmin **et** le Code Ecclesia, saisis par Jules). À compléter quand 141d sera fait.
Une vérification sur dev ne vaut pas pour prod (bases distinctes). Rien n'est passé en « Validé » dans `A_VERIFIER.md` — décision de Jules.

## 1. Bilan

Tout ce qui a été joué **passe**. Aucune anomalie bloquante ni grave. Une seule entrée « obsolète » (test 3 du chantier 65, onglet « Créer » disparu). Le reste : quelques observations mineures/cosmétiques, à trier ci-dessous.

## 2. Observations, triées par gravité

| # | Gravité | Type | Origine | Observation | Suite proposée |
|---|---|---|---|---|---|
| 1 | mineur | front | 141c O1 (chantier 121-3) | Le badge « N actifs » compte le modérateur en exercice quand il a répondu « actif » (table 1 : 8 affichés pour 7 + 1 modérateur ; total 23 au lieu de 20). Contredit le décompte de l'allocation (91) et peut induire en erreur face aux seuils 5-14. | Exclure le modérateur en exercice du badge. Petit chantier front. |
| 2 | mineur | SQL | 141c O2 (109) | `assign_pending_moderators` traite comme « sans modérateur » une table tenue par un modérateur **physique** (`created_by` sans `active_moderator_member_id`) : deux modérateurs sur la table. Limité aux séances d'avant le chantier 119. | Confirmer que le cas ne peut plus se produire ; sinon garde SQL. |
| 3 | mineur | front | 141b O1 (135) | `#asso` dans un onglet où le superadmin est connecté affiche « Espace association » mais liste **toutes** les séances (session superadmin réutilisée). Sans conséquence pour une vraie asso ; onglet neuf sain. | Confirmer si voulu. |
| 4 | mineur | front | 141a O1 | Deux `join_table` en 400 au chargement quand `localStorage` garde une table périmée ; retour à l'accueil sans message. Peut-être du bruit de test. | Vérifier si un vrai participant peut être dans ce cas sans explication. |
| 5 | cosmétique | front | 141b O2 | L'onglet Analyse d'un **sondage** propose « Comparaison avant/après débat », « Réponses au questionnaire », « Recrutement modérateurs » (sans objet sans débat). Non vérifié pour un débat simple. | Masquer selon `session_type` (règle CLAUDE.md « types de séance »). |
| 6 | cosmétique | front | 141c O4 | Sur les cartes de table, « Libérer la modération de cette table » et « Refaire une table sans animateur » sont collés, sans séparateur. | Ajouter un espacement. |
| 7 | test obsolète | doc | 141a (65, test 3) | L'onglet « Créer » de l'accueil n'existe plus (refonte 73/74/140/143). Substance confirmée. | Reformuler l'entrée d'`A_VERIFIER.md`. |

**Décision en attente, pas une tâche de test — chantier 120** : `session_members.user_id` se désynchronise au renouvellement du jeton anonyme. Bug **confirmé, sans correctif codé**, en attente d'un arbitrage de sécurité de Jules.

## 3. Outillage (à connaître pour toute future passe)

- Vite prend un autre port (5174/5175) que celui annoncé par `preview_start` : lire `preview_logs`.
- `127.0.0.1` injoignable dans le Browser pane → **une seule identité anonyme** par session de test.
- Le Browser pane rogne l'écran à ~800 px sans `resize_window` ; les `ref` périmées après re-rendu de fenêtre de confirmation.
- La liste des séances du superadmin ne se rafraîchit pas seule après un insert SQL.
- Méthode utile : `ModeratorView` sans Code Ecclesia via `tables.created_by` = uid anonyme courant (voir `lot-1.md`).

## 4. Reste à faire par un humain (ou par 141d)

- **Glisser-déposer** réel (139 « Remplacer le modérateur », 92-4 déplacer un binôme, 91-4) — dnd-kit ne réagit pas au pointeur synthétique.
- **Second appareil / deux identités simultanées** : écran du modérateur supprimé ou remplacé (137-D d, 118, 109 côté participant), chantier 132 en live, synchro Realtime multi-onglets.
- **Gemini réel** (nommage des camps ; `gemini-proxy` non déployé sur dev).
- **Expiration réelle** d'un compte d'association (l. 3049).
- **Restauration de sauvegarde** (l. 997).
- **91-5** : cas limite < 5 actifs, non joué.
- Tous les points **« Sur prod, après merge `dev` → `main` »** (106, 109, 117, 118, 139…).
- **141d** : anciens jalons 33-39, 50, 54, 65 (côté superadmin), 72, 74 ; scénarios du 68 ; portes modérateur 107/110/140 ; 134 point 4 ; chantiers 108, 113, 142 (`add_offline_participant`), 143 (restes).
- **Ménage des tables de test partagées** `589D79`/`6ABDC9`/`6296A9` (`A_VERIFIER.md` ~l. 1749-1757) : **accord explicite de Jules requis** avant toute suppression — **proposé ici, non fait**.
