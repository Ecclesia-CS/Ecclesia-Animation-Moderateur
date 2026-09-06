# Registre des merges en attente

> **À lire par toute session Claude Code qui s'apprête à merger une branche sur `main`.**
> Ce fichier est la seule trace durable de ce qui est **volontairement retenu** hors de `main`, et pourquoi.
> Une branche non mergée n'est pas forcément un oubli — vérifier ici avant de conclure.

Dernière mise à jour : **2026-09-06**.

---

## Gel du parcours de vote — jusqu'au 2026-09-10 inclus

**Une séance de vote tourne en production réelle le jeudi 10 septembre 2026** : phase `voting` seule, en présentiel, onboarding désactivé (`sessions.onboarding_enabled = false`), on ne va pas plus loin dans le flux — ni allocation, ni débat, ni clôture.

En conséquence, **à partir du mercredi 9 septembre au soir et jusqu'à la fin de la séance du 10**, ne pas merger sur `main` de changement touchant :

- `src/screens/VoteScreen.tsx`
- la RPC `cast_vote`
- `register_session_member`, `confirm_attendance`
- `submit_assertion`, `approve_assertion`, `reject_assertion`
- la colonne `sessions.onboarding_enabled` et la RPC `set_session_onboarding_enabled` (chantier 71)

Raison : aucun des chantiers en cours n'apporte quoi que ce soit à cette séance. Le risque n'est pas de manquer une fonctionnalité, c'est de casser le seul chemin qui doit marcher ce jour-là. Après le 10/09, ce gel tombe — supprimer cette section.

---

## Branches retenues

| Branche | Contenu | Pourquoi retenue | Condition de déblocage |
|---|---|---|---|
| `chantier-58-colonnes-sessions` | Restreint les colonnes de `sessions` lisibles publiquement. 4 RPC de lecture (`get_session_by_id`, `get_session_by_join_code`, `list_sessions_admin`, `list_public_closed_sessions`) **déjà appliquées en base** ; la migration contient en plus un `REVOKE SELECT ON sessions` + `GRANT SELECT (id, title, phase, join_code, scheduled_at, created_at)` **non appliqué**. | Le `REVOKE` casserait huit écrans tant que le code correspondant n'est pas déployé. Aucun écran de `src/` n'appelle encore ces RPC : tous lisent `sessions` par `select('*')` sous le GRANT actuel, non restreint. | Merger et déployer la branche **d'abord**, appliquer le `REVOKE`/`GRANT` **ensuite**, jamais l'inverse. **Avant d'appliquer, ajouter `onboarding_enabled` à la liste des colonnes accordées** (colonne ajoutée par le chantier 71, postérieure à cette branche) — sinon l'interrupteur d'onboarding cesse de fonctionner côté participant. |
| `chantier-secu-sauvegardes` | Workflow GitHub Actions de sauvegarde chiffrée quotidienne de la base Supabase (`.github/workflows/db-backup.yml`). | Inutilisable tant que les deux secrets GitHub n'existent pas. | Jules doit créer les secrets `SUPABASE_DB_URL` et `BACKUP_PASSPHRASE` dans les réglages du dépôt. Bloqué sur lui, pas sur le code. |

Ces deux branches sont protégées en dur par `scripts/cleanup-worktrees.sh` — ne pas les retirer de sa liste d'exclusion.

---

## Chantiers en cours au 2026-09-06

Lancés après la passe de tests de Jules sur la production. Découpés **par fichier** pour permettre trois sessions en parallèle sans collision — respecter ce découpage si l'un d'eux est relancé.

| Chantier | Branche | Périmètre de fichiers | Contenu |
|---|---|---|---|
| 72 | `chantier-72-moderation-superadmin` | SQL + `SuperadminScreen.tsx` | **Livré le 2026-09-06. Ses quatre migrations sont APPLIQUÉES en base ; la branche n'est pas encore mergée** — la base est donc en avance sur `main`, sans conséquence (les deux RPC neuves `release_table_moderation` et `update_session_meta` n'ont aucun appelant déployé, et le changement de `set_member_moderator` est compatible avec le front en production). Contenu : bug de reprise de modération d'une table ; ajouter un modérateur à une table qui n'en a pas ; défaut « actif » pour un membre sans `entry_responses` ; `DROP FUNCTION add_collab_source(uuid, text, text, text)` (surcharge sans validation d'URL restée exécutable après le chantier 52) ; édition du titre et de la description d'une séance ; accordéon « Participants inscrits » déplacé dans l'onglet Table. **Arbitrage à valider par Jules** : `claim_table_as_moderator` accepte désormais la reprise de main quand le pseudo saisi est celui du modérateur en place — donc Code Ecclesia + code de table + pseudo affiché suffisent à prendre une table. Plus strict qu'avant le chantier 68 (`reclaim_moderator` n'exigeait aucun pseudo), moins strict que le 68 (refus absolu, qui était le bug). Le §3 de la migration 1/4 se retire seul si l'arbitrage est refusé. Scénario C.3 d'`A_VERIFIER.md` : vérifier qu'un pseudo **différent** reste refusé. **À corriger ailleurs** : le commentaire du champ `isActive` dans `src/lib/allocation.ts` l. 185 (« Sans onboarding → false ») est devenu faux ; fichier hors périmètre, aucune ligne de logique à changer. |
| 73 | `chantier-73-entree-moderateur` — **interrompue par la limite de session le 2026-09-06 après 24 tours, avant d'avoir produit le moindre fichier. À relancer avec le même brief.** | `VoteScreen.tsx`, `EntryScreen.tsx`, `ParticipantView.tsx`, `ParticipantToolsButton.tsx` | Déclaration modérateur dès l'inscription dans les quatre phases pertinentes ; bouton « Me déclarer modérateur » déplacé dans Outils ; retrait de la création de table côté modérateur ; retrait des onglets « Modérateur / Rejoindre / Créer » de l'écran principal (**sous réserve** — voir ci-dessous) ; bouton « Voir les votes des anciennes séances » aligné sur « Voir tous les débats » ; inversion de l'ordre des deux fenêtres d'accueil en prévote. |
| 74 | `chantier-74-phases-et-hors-ligne` | `PhaseIndicator.tsx`, `phaseLabels.ts`, `ModeratorView.tsx` | **Arrêté le 2026-09-06 avant d'avoir produit quoi que ce soit** (quota). À relancer tel quel, rien n'est perdu. Trois retours de Jules : (1) au clic sur l'indicateur de phase, ouvrir une fenêtre montrant toutes les phases et celle en cours — à faire entièrement dans `PhaseIndicator` pour ne pas toucher les cinq écrans qui l'affichent ; (2) les participants sans téléphone ajoutés par les modérateurs n'existent pas en base alors qu'ils prennent du temps de parole — la RPC `add_offline_participant(uuid, text)` existe pourtant, diagnostiquer avant de coder ; (3) à l'ajout d'une personne sans téléphone, les caractères saisis n'apparaissent pas dans le champ, alors que la saisie fonctionne et que l'ajout marche. |

**Question ouverte, chantier 73** : le retrait des trois onglets de `EntryScreen` supprime peut-être deux chemins sans équivalent — la prise en charge d'une table par un modérateur en retard via son code (`claim_table_as_moderator`, chantier 68) et le retour d'un participant ayant perdu sa session locale qui veut rejoindre sa table par code en phase débat. Le chantier 73 doit rendre cet inventaire **avant** de retirer quoi que ce soit. Ne pas merger ce retrait sans que la question soit tranchée.

C'est le chantier 73 qui touche `VoteScreen.tsx`, donc le seul des trois concerné par le gel ci-dessus.

---

## Ce qui n'est pas encore commencé

- **Chantier 55** — exiger le code de rappel, et non le seul nom, pour reprendre une identité. Dépend de l'extension de la génération de `reclaim_code` à plus de phases.
- **Chantier 56** — durcissement SQL : fermer `app_config`, figer le `search_path` des fonctions à mot de passe. **Peut verrouiller Jules dehors** — à faire uniquement quand il est disponible et jamais à l'approche d'une utilisation en production.
- **Chantier 59** — canaux Realtime privés. La vraie correction de ce que le chantier 53 n'a fait qu'atténuer.
- Déclaration modérateur au moment de la récupération de compte ; reconnexion par pseudo après clôture.
- Déploiement de `gemini-proxy` — demande un `supabase login`, bloqué sur Jules.
- Deux sujets de fond réservés par Jules pour après les chantiers courants : **cybersécurité** (base : `docs/audit-securite-*.md` et `docs/2026-09-02-*.md`) et **revue des parcours utilisateurs**, qu'il veut réexpliquer lui-même avant toute analyse.

---

## Vérifications jamais jouées

`A_VERIFIER.md` comptait **80 entrées ouvertes** au 2026-09-04. Jules en a validé une partie lors de sa passe du 2026-09-06 ; ce qui reste ouvert dans ce fichier est la base de travail de la prochaine session de vérification. Aucune vérification navigateur automatisée n'a été jouée depuis la mise en place du jeton de serveur de dev — une seule session à la fois a le droit de lancer `npm run dev`.
