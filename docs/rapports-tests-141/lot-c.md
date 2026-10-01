# Chantier 141c — rapport (superadmin, modérateurs et groupes) — 2026-09-29, dev

Environnement : serveur local sur la base **dev** (`mnjqrlrrzrycuconlfqb`) via `.env.local` non commité (Vite sur le port réellement écouté, 5175) ; session superadmin ouverte par Jules dans le Browser pane (mot de passe jamais vu ni saisi par la session). Deux séances jetables `QA141-c-A` (3 tables, modérateurs actif / en surplus / en attente / physique) et `QA141-c-B` (36 inscrits dont 3 modérateurs, 20 actifs, 13 passifs, un binôme réciproque), insérées par SQL, **purgées** (0 ligne restante vérifiée : séances, tables, participants, membres). Aucun changement dans `src/`.

## Résultats — tout passe au clic, deux observations

| Item | Résultat | Détail |
|---|---|---|
| **106** — badge « Modérateur en surplus » dans l'onglet Groupes | ✅ | Table 1 : « Modérateur : QA Actif Un » (indigo) + « Modérateur en surplus : QA Surplus Deux » (ambre, avec « En faire le principal » et « Retirer »). |
| **117** — modérateur « physique » (sans `session_members`) visible dans Groupes | ✅ | Table 3 (`created_by` = un participant assis) : « Modérateur : QA Physique Modo » avec « Retirer ». |
| **117 / 118** — « Retirer » sur ce modérateur physique | ✅ | Aucune erreur « membre introuvable ». En base : `created_by` n'est plus le sien, une ligne `session_members` est créée (`is_moderator = true`, code de rappel présent), la table repasse « En attente de modérateur », le modérateur est affiché « en surplus ». |
| **118** — « Libérer la modération de cette table » (table 2) | ✅ | Le modérateur en exercice devient « en surplus » (drapeau conservé, `active_moderator_member_id` vidé), la table repasse « En attente de modérateur ». |
| **109** — récapitulatif de la modale « Ouvrir le débat » | ✅ | « 2 modérateur(s) en attente vont être placés : … → table 2, … → table 3 » + avertissement ambre « Resteront sans table (plus de modérateurs en attente que de tables libres) : QA Surplus Deux ». « Ouvrir le débat » applique : phase `debating`, `active_moderator_member_id` posé sur les tables 2 et 3, table 1 inchangée. |
| **91-1/2/3** — allocation : actifs/public par table, déterminisme | ✅ | 33 présentiels + 3 modérateurs → 3 tables animées : 7+7+6 = 20 actifs, public 5+4+4 = 13 (à une personne près), chaque table ≤ 14 actifs et ≤ 30 personnes. Recalcul : proposition **identique** au caractère près. |
| **92-3** — grappe de binôme réunie à l'allocation | ✅ | Le binôme (membres 10 et 11) atterrit à la même table ; « 🔗 1/1 grappe(s) réunie(s) » dans la proposition. |
| **92-4 (partiel)** — badges 🔗 dans Groupes | ✅ (affichage) | Deux badges 🔗 sur la table 1, « 🔗 1/1 GRAPPE(S) RÉUNIE(S) » dans « Santé des tables ». **Non joué** : le glisser-déposer qui déplace A **et** B (voir plus bas). |
| **121-3** — badge « N actifs » sur chaque carte | ✅ | Affiché sur les trois cartes après application (voir O1 pour le décompte). |
| **Application de l'allocation** | ✅ | « Appliquer » écrit bien en base (3 tables, 36 affectations) ; l'écran met ~10 s à afficher les groupes (bouton « Application… » puis liste). |

## Observations (aucune bloquante)

- **O1 — mineur, front** — le badge « N actifs » (121-3) **compte le modérateur de la table** quand il a répondu « actif » à l'onboarding (table 1 : « 8 actifs » alors que la proposition annonçait 7 actifs + 1 modérateur ; total affiché 8+8+7 = 23 au lieu de 20). L'allocation, elle, exclut les modérateurs qui animent des sièges (`CLAUDE.md` § Ne jamais faire). Le nombre affiché peut donc induire en erreur face aux seuils du chantier 91 (5-14 actifs par table). À arbitrer : exclure du badge le modérateur en exercice.
- **O2 — mineur, SQL (`assign_pending_moderators`)** — le récapitulatif du 109 traite comme « table sans modérateur » une table tenue par un modérateur **physique** (`created_by` = un participant assis, `active_moderator_member_id` NULL, cas d'avant le chantier 119) : il y place un second modérateur, d'où deux « Modérateur : » sur la table 3 avant le « Retirer ». Cas limité aux séances antérieures au 119 (depuis, `claim_table_as_moderator` pose `active_moderator_member_id`) ; à confirmer que ça ne peut plus se produire.
- **O3 — outillage** — comme au 141b : Vite écoute sur 5175 alors que `preview_start` annonce un autre port ; la liste des séances du superadmin ne se rafraîchit pas seule (recharger la page pour voir une séance créée par SQL) ; après `location.reload()` la séance ouverte est restaurée.
- **O4 — cosmétique** — sur les cartes de table, « Libérer la modération de cette table » et « Refaire une table sans animateur » s'affichent collés, sans séparateur (« …cetteRefaire une… » dans le texte de la page).

## Non joué (hors 141c ou hors automatisation)

- **Glisser-déposer à la souris** (139 : encart « Remplacer le modérateur » ; 92-4 : déplacer un binôme ; 91-4 : passif vers une table sans modérateur) — dnd-kit ne réagit pas au pointeur synthétique. Reste humain, sur une séance de test.
- **139** — le reste de la recette avait déjà été joué au navigateur le 2026-09-28 (points 1 à 6) ; non rejoué ici.
- **91-5** — cas limite < 5 actifs : non joué.
- **Points « Sur prod, après merge `dev` → `main` »** (106, 109, 117, 118, 139) : hors périmètre (post-merge).
- **118 / 109 côté participant** (le modérateur placé voit son écran, l'ancien animateur repasse en participant) : demande une seconde identité connectée, hors de portée du Browser pane.
