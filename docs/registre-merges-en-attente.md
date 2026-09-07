# Registre des merges en attente — et passation du 2026-09-06

> **À lire par toute session Claude Code qui reprend le projet, et impérativement avant de merger une branche sur `main`.**
> Ce fichier est la seule trace durable de ce qui est **volontairement retenu** hors de `main`, de ce qui est livré mais pas fusionné, et de ce qui reste à faire. Une branche non mergée n'est pas forcément un oubli.
> La conversation d'orchestration qui a produit tout ce qui suit **a été supprimée le 2026-09-07**. Ce document la remplace : il est écrit pour être lu à froid, sans aucun contexte préalable.
> **Voir aussi** [`docs/chantiers.md`](./chantiers.md) — l'index chronologique complet des chantiers 34 à 77 (titre, ce qui a été fait, statut, branche, fichier/RPC principal). Ce registre-ci reste le tableau de bord du moment ; `chantiers.md` est la référence pour retrouver ce qu'un chantier passé a fait sans reconstituer l'historique.

Dernière mise à jour : **2026-09-06, fin de journée**.

---

## 1. Gel du parcours de vote — jusqu'au 2026-09-10 inclus

**Une séance de vote tourne en production réelle le jeudi 10 septembre 2026** : phase `voting` seule, en présentiel, onboarding désactivé (`sessions.onboarding_enabled = false`), on ne va pas plus loin — ni allocation, ni débat, ni clôture.

À partir du **mercredi 9 septembre au soir** et jusqu'à la fin de la séance, ne rien merger sur `main` qui touche :

- `src/screens/VoteScreen.tsx`
- les RPC `cast_vote`, `register_session_member`, `confirm_attendance`, `submit_assertion`, `approve_assertion`, `reject_assertion`
- la colonne `sessions.onboarding_enabled` et la RPC `set_session_onboarding_enabled`

Raison : aucun chantier en attente n'apporte quoi que ce soit à cette séance. Le risque n'est pas de manquer une fonctionnalité, c'est de casser le seul chemin qui doit marcher ce jour-là. **Après le 10/09, supprimer cette section.**

⚠️ **`VoteScreen.tsx` a été profondément remanié le 06/09 par le chantier 73, déjà mergé et déployé, et n'a jamais été vérifié au navigateur.** Le parcours de vote complet doit être rejoué à la main avant jeudi. C'est le point le plus important de tout ce document.

---

## 2. Branches livrées, poussées, non mergées

| Branche | Contenu | Migration | Pourquoi pas mergée |
|---|---|---|---|
| `chantier-59-realtime-prive` | Canaux Realtime privés. `src/lib/realtime.ts` (helper `privateChannel()` qui journalise les `CHANNEL_ERROR`, sans quoi un refus d'autorisation serait muet), migration `20260906_chantier59_realtime_canaux_prives.sql`, suppression de deux canaux superadmin déjà morts. | **Écrite, NON appliquée.** | Trop risqué avant la séance du 10/09. À merger après. **Ordre d'application non négociable** : appliquer la migration (sans effet observable) → déployer le code → dérouler la recette → **et seulement ensuite** désactiver « Allow public access » dans le dashboard Supabase (Realtime → Settings). Ce réglage est **global** et hors SQL ; sans lui le chantier ne ferme rien, et l'appliquer trop tôt casse toute la production d'un coup. Rollback d'urgence : réactiver le réglage, effet immédiat sans redéploiement. |
| `chantier-74-phases-et-hors-ligne` | Modale des phases au clic sur `PhaseIndicator` ; correctif du champ de saisie invisible à l'ajout d'une personne sans téléphone (`text-gray-900 bg-white`, le texte héritait du `text-white` de `ModeratorView`). | **Appliquée le 06/09** (`add_offline_participant` écrit désormais aussi dans `session_members`). | Simplement pas encore fusionnée. Aucun obstacle. |
| `chantier-76-plan-securite` | `docs/2026-09-06-plan-securite-consolide.md` — les quatre anciens documents d'audit relus un par un contre le code et la base d'aujourd'hui, chaque constat classé corrigé / ouvert / sans objet, avec un ordre de traitement. Documentaire, zéro ligne de code. | Aucune. | Simplement pas encore fusionnée. Aucun risque à merger. |
| `chantier-58-colonnes-sessions` | Restriction des colonnes de `sessions` lisibles publiquement. Ses 4 RPC de lecture sont **déjà en base** ; la migration contient en plus un `REVOKE SELECT ON sessions` + `GRANT SELECT (id, title, phase, join_code, scheduled_at, created_at)` **non appliqué**. | Partiellement appliquée. | Le `REVOKE` casserait huit écrans tant que le code correspondant n'est pas déployé. **Avant de l'appliquer, ajouter `onboarding_enabled` à la liste des colonnes accordées** — colonne créée par le chantier 71, postérieure à cette branche ; sans ça l'interrupteur d'onboarding cesse de fonctionner côté participant. |
| `chantier-secu-sauvegardes` | Workflow GitHub Actions de sauvegarde chiffrée quotidienne de la base. | Aucune. | **Bloqué sur Jules** : créer les secrets `SUPABASE_DB_URL` et `BACKUP_PASSPHRASE` dans les réglages du dépôt. Rien à faire côté code. |

Les deux dernières sont protégées en dur par `scripts/cleanup-worktrees.sh` — ne pas les retirer de sa liste d'exclusion.

---

## 3. Ce qui a été mergé et déployé le 2026-09-06

`main` est passé de `6eceafb` à `1c62418`, déployé sur GitHub Pages. Tags de rollback posés : `pre-merge-chantier-72-20260906`, `pre-merge-chantier-73-20260906`.

- **Chantier 71** — colonne `sessions.onboarding_enabled`, RPC `set_session_onboarding_enabled`, `create_session` à 8 paramètres, interrupteur superadmin, `VoteScreen` qui saute l'onboarding.
- **Chantier 70** — historisation des votes : table `assertion_vote_history`, `cast_vote` archive avant d'écraser, `vote_scope` sur `session_analysis`, RPC `list_session_analyses` / `get_analysis_by_id`. **L'écran de comparaison avant/après débat n'existe pas**, volontairement laissé à Jules.
- **Chantier 72** — bug de reprise de modération (voir §5), ajout d'un modérateur à une table sans modérateur, défaut « actif » sans onboarding, `DROP` de la surcharge non validée d'`add_collab_source`, édition du titre et de la description d'une séance, accordéon « Participants inscrits » déplacé dans l'onglet Table.
- **Chantier 73** — déclaration modérateur dès l'inscription dans les quatre phases, bouton « Me déclarer modérateur » déplacé dans Outils, création de table retirée côté participant, bouton des anciennes séances aligné, ordre des fenêtres d'accueil en prévote inversé. **Les trois onglets de `EntryScreen` n'ont pas été retirés** — voir §6.

---

## 4. Migrations : état exact

Toutes appliquées en base au 06/09 : les quatre du chantier 72 (`chantier72_1_reprise_moderation`, `_2_allocation_actif_par_defaut`, `_3_drop_add_collab_source_4args`, `_4_update_session_meta`) et celle du chantier 74. La seule migration écrite et **non appliquée** est celle du chantier 59.

**Règle du projet, vérifiée deux fois aujourd'hui et deux fois payante** : avant d'appliquer une migration, comparer le corps qu'elle réécrit avec `pg_get_functiondef` **en base**, jamais avec les anciens fichiers de migration. C'est ainsi qu'on a rattrapé, sur le chantier 70, deux `CREATE OR REPLACE` qui auraient créé des surcharges ambiguës au lieu de remplacer (`get_all_votes_for_analysis` avait déjà deux versions en base, `save_analysis` une). Et c'est ainsi que le chantier 74 a évité de « corriger » une garde déjà corrigée par le chantier 60.

---

## 5. Arbitrage en attente de validation par Jules — chantier 72

`claim_table_as_moderator` accepte désormais la reprise de main quand le pseudo saisi est celui du modérateur en place. Concrètement : **Code Ecclesia + code de table + pseudo affiché du modérateur suffisent à lui prendre la table.**

C'est plus strict qu'avant le chantier 68 (`reclaim_moderator` n'exigeait aucun pseudo) et moins strict que le 68 lui-même (refus absolu — qui *était* le bug signalé par Jules). Le nouveau helper est `table_moderator_is(table_id, pseudo)`.

Si Jules refuse cet arbitrage, l'alternative propre est un chemin d'interface dédié « je suis DÉJÀ le modérateur de cette table », branché sur `reclaim_moderator`, distinct de la prise en charge d'une table libre — ce qui exige de toucher `EntryScreen.tsx`. Le §3 de la migration 1/4 se retire seul sans défaire le reste.

**Scénario de vérification prioritaire** (recette C.3 d'`A_VERIFIER.md`) : confirmer qu'un pseudo **différent** est toujours refusé. Si ce cas passe, l'arbitrage est cassé.

---

## 6. Chantier 75, décidé mais jamais lancé — retrait des onglets de `EntryScreen`

Le chantier 73 devait inventorier ce que le retrait des onglets « Modérateur / Rejoindre / Créer » supprimerait, et ne rien retirer si un chemin disparaissait sans équivalent. Il a conclu qu'il fallait garder « Rejoindre » (seul chemin vers une table **standalone**, sans séance, et pour qui n'a que le code de la **table**) et « Créer » (seul chemin de création après le retrait de `ModeratorAccessPanel`).

**Jules a tranché contre cette conclusion le 06/09** :

> « Pour la création de table, aucun pb, c'est le superadmin qui gère. Pour le fait de rejoindre une table avec uniquement le code, normalement, quand on clique sur la séance, on doit pouvoir mettre le numéro de la table en retard, donc joindre avec uniquement le numéro. Je ne vois pas de problème. Quant au fait de rejoindre la séance à partir uniquement du numéro, personne ne fait ça. »

Donc : **retirer les trois onglets**. Mais il dit « on **doit pouvoir** », ce qui décrit peut-être une attente plutôt que le code réel. **Vérifier d'abord que ce chemin existe et qu'il est atteignable en pleine phase débat** (`switch_table` depuis `AllocatingScreen`, `JoinTableForm` à l'étape `ended` de `VoteScreen` — ce dernier ne reçoit pas de `sessionId`, contrairement à `SessionRouterScreen`). S'il n'existe pas, **le construire d'abord, retirer ensuite** — sinon on supprime la seule porte d'entrée d'un retardataire le jour où on en a besoin. Confirmer aussi que le superadmin a bien son bouton « + Sans admin » pour les tables sans animateur.

---

## 7. Ce qui n'est pas commencé

- **Chantier 55** — exiger le code de rappel, et non le seul nom, pour reprendre une identité. Dépend de l'extension de la génération de `reclaim_code` à plus de phases. **Question produit en suspens** : Jules a écrit « on l'utilisera aussi pour les sources collaboratives » à propos de ce code, sans que le sens soit clair. À lui redemander avant de lancer.
- **Chantier 56** — durcissement SQL : fermer `app_config`, figer le `search_path` des fonctions à mot de passe. ⚠️ **Peut verrouiller Jules hors de sa propre base.** À ne faire que lorsqu'il est disponible et joignable, et jamais à l'approche d'une utilisation en production.
- Déclaration modérateur au moment de la récupération de compte ; reconnexion par pseudo après clôture.
- Déploiement de `gemini-proxy` — demande un `supabase login`, bloqué sur Jules. Le prompt de fusion a été durci sans être redéployé.
- Réserves ouvertes sur `results_public`, déjà actif sur deux séances réelles : k-anonymat, ordre du nuage de points, `search_path`. Détail au §5.3 de la revue de sécurité.
- **Revue des parcours utilisateurs** — sujet de fond réservé par Jules. Il veut réexpliquer lui-même comment l'application est censée fonctionner à chaque instant, et préfère une conversation dédiée lancée en un prompt unique qui attend son texte. **Ne rien analyser avant d'avoir reçu ce texte.**

---

## 8. Vérifications : l'angle mort du projet

`A_VERIFIER.md` est le fichier de suivi le plus fiable du dépôt pour les **vérifications**. (`PROJECT_STATUS.md`, périmé de quinze chantiers et en contradiction avec `git log`, a été supprimé au chantier 78 — son contenu unique est passé en annexes A et B de [`docs/chantiers.md`](./chantiers.md), désormais le seul fichier de suivi de l'avancement.)

Jules a fait une passe de validation le 06/09 : 33 entrées déplacées vers « Validé », aucune supprimée. **Cette passe n'était pas commitée** ; elle l'est désormais, sous la forme du fichier [`docs/A_VERIFIER-passe-validation-jules-20260906.md`](./A_VERIFIER-passe-validation-jules-20260906.md) versionné (commit `234827a`) — c'est la sauvegarde durable, la seule sur laquelle compter. `A_VERIFIER.md` renvoie vers ce fichier en tête de page. Il existe aussi un `git stash` local `5dc234f` qui contient la même chose, mais un stash ne se pousse pas et ne survivra pas à un nettoyage du dépôt : ne pas s'y fier. **Il reste à la réintégrer proprement dans `A_VERIFIER.md`**, ce qui demande de la fusionner avec les sections ajoutées depuis par les chantiers 72, 73, 74 et 59 — à faire avec Jules, pas seul.

Aucune vérification navigateur automatisée n'a jamais été jouée depuis la mise en place du jeton de serveur de dev : **une seule session à la fois** a le droit de lancer `npm run dev`. Les recettes des chantiers 59, 72, 73 et 74 attendent toutes d'être déroulées.

---

## 9. Hygiène des sessions Claude Code — leçon coûteuse du 06/09

**Une session Claude Code repaie tout son historique à chaque tour.** Passé une cinquantaine de tours, lui confier un nouveau chantier coûte plus cher que d'ouvrir une session neuve, démarrage à froid compris. Le 06/09, une seule session réutilisée en boucle a dépassé 370 tours et consommé une part majeure du quota de la journée.

- **Une session par chantier, fermée à la fin.** Ne pas enchaîner.
- Une session ouverte sur un dossier **parent** verrouille aussi tous ses sous-dossiers — c'est ce qui a bloqué l'accès au dépôt racine pendant des heures.
- `main` ne peut être checked out que dans **un seul** worktree : les fusions se font donc dans le dépôt racine, jamais dans un dossier `Ecclesia-chantier-*`.
- Pousser depuis un dossier `Ecclesia-chantier-*` vers le dépôt racine échoue avec « refusing to update checked out branch ». Récupérer la branche depuis le dépôt racine (`git fetch <chemin du dossier> <branche>`) au lieu d'insister.
- `CLAUDE.md` fait environ 1400 lignes, réinjectées au démarrage de **chaque** session : coût fixe important. Le découper en un cœur court plus des annexes liées ferait baisser le prix de toutes les sessions. À proposer à Jules à froid.
- Sonnet par défaut ; Opus réservé au diagnostic ouvert et aux modèles d'autorisation.
- Le nettoyage des worktrees est prêt mais **jamais exécuté** : `bash scripts/cleanup-worktrees.sh` pour la simulation, `--go` pour supprimer. 65 worktrees, dont 59 sans risque, environ 7,5 Go. Passer par la simulation d'abord, le script n'a pas été retesté après sa dernière correction.
