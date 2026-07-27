# Ecclesia — État du projet

> Descriptions complètes des tâches : voir `ecclesia_plan_chantiers.md`. Ce fichier ne recense que le statut courant — à mettre à jour au fil des PR. Statuts possibles : `Backlog` / `En cours` / `Bloqué` / `Terminé`.

Dernière mise à jour : 27/07/2026 — **Chantier 16 : bug de routage post-clôture corrigé (F14)** — le bouton "Voir les résultats"/"Voir vos résultats" (overlay "Séance terminée" de `ParticipantView.tsx`/`ModeratorView.tsx`, phase `closed`) était un `<a href="#session/<code>">` rendu alors que `phase.type === 'table'` dans `App.tsx` — or le guard de routage (`hash.startsWith('#session/') && phase.type !== 'table'`) exclut explicitement ce cas, donc le clic changeait le hash du navigateur sans jamais monter `SessionRouterScreen` : le bouton semblait "ne rien faire". En cliquant ensuite "← Retour au menu" (`leaveTable()` → `phase: 'entry'`), le hash déjà positionné devenait exploitable au re-render suivant → la navigation aboutissait enfin, d'où le symptôme "indisponible puis accessible après avoir quitté". **Investigation d'abord** : confirmé qu'il ne s'agissait pas d'un artefact de séance de test sans analyse (`ResultsMapScreen`/`PublicResultsScreen` gèrent déjà proprement l'absence d'analyse avec un message "pas encore disponible", ce n'est pas ce qui était en cause). Corrigé en remplaçant les deux liens par des boutons dont le clic positionne le hash **et** appelle `leaveTable()` dans le même handler. Root cause + mécanisme du fix confirmés en direct dans le Browser pane (reproduction du blocage puis de la résolution en 2 temps, sans données de séance clôturée disponibles côté superadmin). Développé en worktree dédié (`chantier-16-resultats-cloture`) en parallèle du chantier 14 — voir A_VERIFIER.md pour le parcours de vérification complet restant (nécessite le mot de passe superadmin + une séance passée en phase `closed`).

Mise à jour précédente : 27/07/2026 — **Chantier 13 : 404 persistant sur les fiches d'info corrigé (F10)** — cause racine : 4 copies dupliquées d'une logique de réécriture d'URL supposant un stockage interne (`public/docs/*.html` commité), dont une (`VoteScreen.tsx`, panneau Outils en phase de vote) avait un `BASE_DOCS` codé en dur sans le segment `/Ecclesia-Animation-Moderateur/` → 404 systématique sur GitHub Pages. Conforme à la décision C3 (2026-07-23, Jules — fiches hébergées sur un site externe séparé) : toute la logique de réécriture est supprimée, `doc_info_url`/`doc_summary_url` sont utilisés tels quels (passthrough), champ superadmin passé en URL libre. Aucune migration nécessaire (schéma inchangé). Développé en worktree dédié (`chantier-13-fiches-info-404`) en parallèle du chantier 12 — aucun chevauchement de fichiers constaté (seul `VoteScreen.tsx` touché des deux côtés, sur des zones distinctes, fusion automatique propre). **Reste à faire par Jules** : nettoyer l'URL localhost restée dans `doc_info_url` de la séance de test `GENER1` (nécessite le mot de passe superadmin) — voir A_VERIFIER.md.

Mise à jour précédente : 27/07/2026 — **Chantier 12 : ordre des assertions & changement de vote livré (F8-F9)** — F8 : bug réel trouvé et corrigé — le shuffle initial fonctionnait, mais toute assertion approuvée après le premier chargement (cas normal en séance réelle) était toujours ajoutée en fin de liste dans le même ordre pour tout le monde (Realtime + polling 10s), ce qui annulait l'effet du hasard en pratique ; corrigé avec une insertion à position aléatoire par élément. F9 : la modale "Voir toutes les assertions" affichait juste une icône cliquable sans libellé pour changer un vote déjà posé (contrairement au bouton "Voter" texté et à la liste "Tes votes" qui a déjà "Changer") — harmonisé avec une pastille icône+"Changer" identique aux autres boutons. Développé en worktree dédié (`chantier-12-ordre-assertions-vote`) en parallèle du chantier 13 — aucun chevauchement de fichiers constaté. **Reste à vérifier** : comportement de l'insertion aléatoire sur une nouvelle assertion approuvée pendant qu'un participant est déjà sur l'écran de vote (bloqué par modération fermée sur la séance de test disponible, mot de passe superadmin requis) — voir A_VERIFIER.md.

Mise à jour précédente : 27/07/2026 — **Chantier 22 : petits ajustements UX livrés** (G12/G13/G14) — pop-up unique remplaçant la bannière `pre_voting` (mémorisée en localStorage), message de clarification sur la perte du statut de participant en devenant animateur d'une table sans admin, suppression complète des timers de phase (`vote_timer_minutes`/`vote_threshold_percent` retirés du schéma et du front). Migration `20260727_2_chantier22_remove_vote_timers.sql` **non appliquée** (MCP Supabase indisponible cette session) — fournie en clair à Jules pour application manuelle. Développé en worktree dédié (`chantier-22-ajustements-ux`) en parallèle du chantier 11, après avoir détecté et résolu une collision de dossier de travail partagé avec cette session concurrente (aucune perte de travail). **Reste le parcours fonctionnel navigateur complet** (données de test `pre_voting`/`leaderless` + mot de passe superadmin requis) : voir A_VERIFIER.md.

Mise à jour précédente : 27/07/2026 — **Chantier 11 : petits fixes UX livrés (F1-F7)** — placeholder générique corrigé (F1), modale vote intro affichée une seule fois par séance (F3), affordance checkbox pour "Tout sélectionner" superadmin (F4), bug corrigé : le champ nom se vidait en changeant d'onglet sur l'écran de code de rappel (F5), bouton "Inviter un ami" supprimé au profit du QR code seul, accessible via Outils côté participant (F6) et via un nouveau menu "Outils Modo" côté modérateur (F7). F2 (nom des séances affiché) était déjà correct, vérifié par lecture de code. Vérifié en production (GitHub Pages) contre la séance de test réelle : F1 et F5 confirmés interactivement, F6/F7/F4 confirmés par inspection du bundle déployé. **Reste le parcours superadmin/modérateur complet** (mot de passe requis) : voir A_VERIFIER.md.

Mise à jour précédente : 27/07/2026 — **Chantier 21 : flow d'entrée modérateur & refonte menu participant livré** (G8/G9/G10/G11) — onglet « Modérateur » (remplace « Voter ») auto-déclarant via `claim_moderator_status`, fusion des onglets Rejoindre/Reprendre avec bouton « Je suis modérateur », fallback superadmin (G9) déjà suffisant depuis le chantier 19. Bug corrigé en passant : `AllocatingScreen.handleJoin` codait `isModerator` en dur à `false`, empêchant tout modérateur assigné par l'allocation d'arriver en `ModeratorView` au passage en `debating`. Développé en worktree dédié (`chantier-21-flow-moderateur`) en parallèle du chantier 20 — aucun chevauchement de fichiers constaté. **Reste le parcours fonctionnel navigateur complet** (mot de passe superadmin requis) : voir A_VERIFIER.md.

Mise à jour précédente : 25/07/2026 — **Chantier 19 (Vague 3) : algorithme d'allocation v2 livré ET les 3 migrations sont APPLIQUÉES en base** (`chantier19_onboarding_3_questions`, `chantier19_allocation_v2`, `chantier19_deprecate_chantier5`, versions `20260725120352/120433/120442`). Appliquées et vérifiées directement par Claude via le MCP Supabase, devenu disponible en cours de session (projet `plpjiehqsxxakbuykmkm`). Remplace la livraison de juillet sur B1/B2/E4 du chantier 5. Vérifications en base : conversion `ecclesia_experience` exacte (18 anciens / 6 nouveaux), `is_moderator` présent sur les 61 membres, les 5 nouvelles RPC joignables en rôle `anon` et échouant au bon contrôle d'auth, `get_moderator_responses`/`run_clustering_v3` supprimées, v1/v2 conservées. **Reste le parcours fonctionnel navigateur** (mot de passe superadmin requis) : voir A_VERIFIER.md.

Mise à jour précédente : 22/07/2026 — **6 migrations SQL appliquées en base + Edge Function `gemini-proxy` redéployée (v9, ACTIVE)**, rapporté par Jules via son propre outillage Supabase (cette session Claude Code n'a toujours aucun outil MCP Supabase dans son inventaire — vérifié en tout début de conversation). Migrations concernées : `delete_assertions_admin`/`hide_assertion_author` (chantier 9), `designate_moderator` (chantier 3), `moderator_responses`/`clustering_v3` (chantier 5), `update_assertion_content` (chantier 7). **Non vérifié fonctionnellement par une session avec accès navigateur** — voir A_VERIFIER.md pour le détail par chantier et les parcours manuels restants.

## Chantier 1 — Navigation partout
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| C5 | Bouton « Quitter » dans toutes les phases | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| D3 | Messages de reload en phase d'attente | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| D5 | Message d'intro sur le fonctionnement de l'app | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| D9 | Infos sur la phase « allocating » | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |

## Chantier 2 — Questionnaire & identité avant allocation
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| D18 | Question modérateur oui/non | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| D4 | Renommer « pseudo » → « nom prénom » | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| D7 | Préremplir le nom/pseudo | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |

## Chantier 3 — Débat sans admin
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| D1 | Lecture rapide des règles à l'entrée de table | Backlog | | Chantier 1 |
| D2 | Désignation d'un admin en cours de débat | Fait — migration `designate_moderator` appliquée en base (rapporté 22/07, à vérifier fonctionnellement — voir A_VERIFIER.md) | Claude | Chantier 1 |

## Chantier 4 — Rejoindre en cours de séance
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| D14 | Rejoindre le débat en retard, quelle que soit la phase | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| D8 | Rejoindre un ami via code distribué | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |

## Chantier 5 — Algo d'allocation & modérateurs
> ⚠️ **La livraison de juillet (B1/B2/E4) est remplacée par le chantier 19** (`docs/chantier-5-allocation-v2-spec.md`). `run_clustering_v3` et `get_moderator_responses` sont supprimées ; `run_clustering_v1`/`v2` sont conservées le temps de valider l'algo v2 en prod.

| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| B1 | Refonte algo d'allocation + questionnaire | **Remplacé par le chantier 19** (`run_clustering_v3` supprimée) | Claude | Chantier 2 |
| B2 | Assignation des modérateurs | **Remplacé par le chantier 19** (règle 5 + `session_members.is_moderator`) | Claude | Chantier 2 |
| E4 | Vue superadmin : retour des réponses modérateur | **Annulé** — `moderator_pref` supprimée, panneau retiré (remplacé par le tableau de bord d'allocation) | Claude | Chantier 2 |

## Chantier 19 — Algorithme d'allocation v2 (Vague 3)
> Spec normative : `docs/chantier-5-allocation-v2-spec.md` · amendements : `docs/VAGUE3-amendements-allocation.md`

| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| G1 | Algorithme v2 — 5 règles en ordre lexicographique | Fait — `src/lib/allocation.ts` + 41 tests vitest (`npm test`). **À vérifier sur données réelles** — voir A_VERIFIER.md | Claude | — |
| G2 | RPC `create_tables_batch` (N tables vides en lot) | Fait — migration `20260725_2` **appliquée et vérifiée en base** | Claude | — |
| G3 | Onboarding 6 → 3 questions | Fait — migration `20260725_1` **appliquée** (3 colonnes supprimées ; `ecclesia_experience` → booléen, conversion vérifiée : 18 true / 6 false sur 24 lignes) | Claude | — |
| G4 | Signal « modérateur pour cette séance » | Fait — `session_members.is_moderator` **en base** + `set_member_moderator` / `claim_moderator_status` vérifiées. UI minimale (onglet Participants). **Flow UI complet = chantier 21** | Claude | — |
| G5 | Dépréciation `run_clustering_v3` / `get_moderator_responses` / panneau E4 | Fait — migration `20260725_3` **appliquée** (absence des 2 fonctions confirmée via `pg_proc`) | Claude | G1 |

## Chantier 20 — Tableaux de bord allocation (Vague 3)
> Dépend du chantier 19. Amendements : `docs/VAGUE3-amendements-allocation.md` (section « Vue modérateur — conscience idéologique » / « Vue superadmin — représentation des tables »).

| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| G6 | Vue superadmin — composition par camp/actifs/enregistrable visibles directement sur chaque carte + état "à jour" (Realtime) | Fait — `npx tsc -b`/`npm run build` OK. **À vérifier fonctionnellement** — voir A_VERIFIER.md | Claude | Chantier 19 |
| G7 | Vue modérateur — composition idéologique de sa table + assertions représentatives/clivantes/consensuelles de sa table | Fait — migration `20260727_1_chantier20_table_opinion_summary.sql` **non appliquée** (MCP Supabase indisponible cette session). **À vérifier fonctionnellement** — voir A_VERIFIER.md | Claude | Chantier 19 |

## Chantier 21 — Flow d'entrée modérateur & refonte menu participant (Vague 3)
> Amendements : `docs/VAGUE3-amendements-allocation.md` § « Processus modérateurs » et § « Fusion rejoindre / reprendre »

| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| G8 | Onglet « Modérateur » (remplace « Voter ») | Fait — `EntryScreen.tsx`, appelle `claimModeratorStatus`. **À vérifier en conditions réelles** (mot de passe superadmin requis) — voir A_VERIFIER.md | Claude | G4 |
| G9 | Fallback superadmin marquage modérateur | Déjà fait au chantier 19 (`MembersPanel`, onglet Participants) — vérifié suffisant, non modifié | Claude | G4 |
| G10 | Fusion onglets Rejoindre/Reprendre + « Je suis modérateur » | Fait — `EntryScreen.tsx`, onglet unique avec révélation inline du mot de passe | Claude | — |
| G11 | Renommer l'onglet fusionné | Fait — « Rejoindre ou reprendre une table » | Claude | G10 |

⚠️ Correction associée (hors périmètre G8-G11 mais indispensable) : `AllocatingScreen.handleJoin` codait `isModerator` en dur à `false` — corrigé pour lire `member.is_moderator`, sans quoi un modérateur assigné par l'allocation v2 (chantier 19) rejoignait sa table comme participant ordinaire.

## Chantier 22 — Petits ajustements UX liés (Vague 3)
> Amendements : `docs/VAGUE3-amendements-allocation.md` § « Phase pre_voting — message d'annonce », § « Table leaderless — message de clarification », § « Suppression des notions de durée par phase »

| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| G12 | Pop-up unique pre_voting (remplace la bannière inline) | Fait — `PreVotingAnnounceModal` dans `VoteScreen.tsx`, mémorisée en localStorage. **À vérifier fonctionnellement** (nécessite une séance en `pre_voting`) — voir A_VERIFIER.md | Claude | — |
| G13 | Message de clarification « devenir animateur » (table leaderless) | Fait — texte de confirmation enrichi dans `ParticipantView.tsx` | Claude | — |
| G14 | Suppression des timers de phase | Fait — `vote_timer_minutes`/`vote_threshold_percent` retirés du type `Session`, de `update_session_config`, et de toute l'UI superadmin (VotingStatsPanel, alertes timer/seuil, formulaire de création). Migration `20260727_2_chantier22_remove_vote_timers.sql` **non appliquée** (MCP Supabase indisponible) | Claude | — |

⚠️ Développé en worktree dédié (`chantier-22-ajustements-ux` → `C:\Users\jules\projet\Ecclesia-chantier-22`) après avoir détecté que le dossier de travail partagé contenait déjà le travail non commité de la session concurrente du chantier 11 (QR codes déplacés vers Outils/Outils Modo) — collision résolue par `git stash`/restauration sur `main` sans perte, puis isolation dans un worktree. Voir A_VERIFIER.md pour le détail.

## Chantier 6 — Analyse des camps (Gemini)
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| A1 | Bug de nommage des camps | Fait & live — symptôme corrigé en prod (fallback frontend). Amélioration Edge (labels neutres) **redéployée** (`gemini-proxy` v9, rapporté 22/07 — à valider empiriquement en k=3+ camps, cf. A_VERIFIER.md) | Claude | — |
| E3 | Nommage Gemini systématique après analyse | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| D10 | Assertions consensuelles inter-groupes | Fait — lisibilité (calcul inter-camps préexistant) ; à vérifier — voir A_VERIFIER.md | Claude | A1/E3 |
| C6 | Tracking impact énergétique des appels LLM | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |

## Chantier 7 — Fusion des assertions
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| B4 | Fusion des assertions ne marche pas | Fait — migration `update_assertion_content` appliquée + Edge `gemini-proxy` redéployée avec prompt durci (rapporté 22/07, à vérifier fonctionnellement — voir A_VERIFIER.md) | Claude | — |

## Chantier 8 — Bugs techniques divers
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| A2 | Bugs DND phase débat | Backlog | | — |
| A3 | Vérifier sauvegarde des notes | Backlog | | — |
| A4+D17 | Fin de séance / forçage questionnaire | Backlog | | — |
| C7 | Bug affichage prevote | Backlog | | — |
| B3 | Instabilité user ID / collisions pseudo | Backlog | | — |

## Chantier 9 — Superadmin : gestion des données
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| E1 | Suppression groupée assertions poubelle | Fait — migration `delete_assertions_admin` appliquée en base (rapporté 22/07, à vérifier fonctionnellement — voir A_VERIFIER.md) | Claude | — |
| E2 | Masquer qui a soumis quelle assertion | Fait — migration `hide_assertion_author` appliquée en base (rapporté 22/07, à vérifier fonctionnellement — voir A_VERIFIER.md) | Claude | — |

## Chantier 10 — Petites tâches transverses
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| C1 | Ping automatique Supabase | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| C2 | Identité visuelle / branding | Backlog | | Charte graphique (Jules) |
| C3 | Affichage documents + backend de stockage | **Remplacé par le chantier 13** — décision d'infra tranchée (site externe séparé) | Claude | — |
| C4 | Distinction vote pass/neutre + doc technique | Backlog | | Jules (doc pol.is) |
| D6 | Mention non-conservation des audios | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| D11 | Assertions visibles pendant le débat | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| D12 | Mention anonymat des votes | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| D13 | Ordre aléatoire des assertions | ⚠️ Correction chantier 12 (F8) — le shuffle initial était bien là, mais les assertions approuvées après coup (cas normal en séance réelle) étaient ajoutées en fin de liste, dans le même ordre pour tout le monde | Claude | — |
| D15 | QR code lien table (modérateurs) | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| D16 | Pouvoir changer son vote | Fait — harmonisé chantier 12 (F9), voir A_VERIFIER.md | Claude | — |

## Chantier 11 — Petits fixes UX
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| F1 | Placeholder générique "Alice Dupont" → confusion | Fait & vérifié en production | Claude | — |
| F2 | Afficher le nom des séances en cours | Déjà correct — vérifié par lecture de code, aucun changement | Claude | — |
| F3 | Tooltip vote affiché une seule fois | Fait — vérifier après un premier passage sur une séance de vote (voir A_VERIFIER.md) | Claude | — |
| F4 | Affordance case "tout sélectionner" superadmin | Fait — checkbox réelle avec état indeterminate (à vérifier — voir A_VERIFIER.md) | Claude | — |
| F5 | Bug : champ "mon nom" se vide sur l'écran de code de rappel | Fait & vérifié en production (bug reproduit puis fix confirmé) | Claude | — |
| F6 | Supprimer "inviter un ami", garder QR code via Outils | Fait — bundle déployé vérifié (à vérifier interactivement — voir A_VERIFIER.md) | Claude | — |
| F7 | Déplacer QR code modérateur dans "Outils Modo" | Fait — nouveau menu créé (à vérifier interactivement — voir A_VERIFIER.md) | Claude | — |

## Chantier 13 — Fiches d'info : 404 persistant
> Décision C3 (2026-07-23, Jules) : les fiches d'info sont hébergées sur un site externe séparé (en construction par l'équipe), pas dans Ecclesia. `doc_info_url`/`doc_summary_url` sont de simples liens externes, sans backend de stockage interne.

| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| F10 | 404 sur les fiches d'info d'une séance | Bug corrigé — voir détail ci-dessous et A_VERIFIER.md | Claude | C3 |

**Cause racine identifiée** : trois copies quasi-identiques d'une logique de réécriture d'URL (`normalizeUrl`/`normalizeDocUrl` dans `DocumentationButton.tsx`, `ParticipantToolsButton.tsx`, `VoteScreen.tsx`, `SuperadminScreen.tsx`) réécrivaient `doc_info_url`/`doc_summary_url` vers `https://ecclesia-cs.github.io<BASE_URL>docs/<fichier>` en supposant un stockage interne (`public/docs/*.html` commité dans ce repo). La copie de `VoteScreen.tsx` (panneau "Outils" en phase de vote) avait un `BASE_DOCS` codé en dur **sans** le segment `/Ecclesia-Animation-Moderateur/` (`https://ecclesia-cs.github.io/docs/` au lieu de `https://ecclesia-cs.github.io/Ecclesia-Animation-Moderateur/docs/`) — un 404 systématique sur GitHub Pages dès qu'un participant cliquait "Fiche information"/"Résumé" pendant le vote. Confirmé avec les données réelles en base : la séance de test `🧪 Test général — parcours chantiers 1-4 / 8-10` (phase `voting`, live) a `doc_info_url = "http://localhost:5173/Ecclesia-Animation-Moderateur/docs/fiche-info-test-general.html"` — un artefact de test en local, jamais nettoyé, que seule cette logique de réécriture pouvait transformer en URL de prod (et le faisait mal dans `VoteScreen.tsx`).

**Correctif appliqué** (conforme à la décision C3 — plus de stockage interne) : suppression complète des 4 copies de réécriture d'URL. `doc_info_url`/`doc_summary_url` sont maintenant utilisés tels quels (passthrough), sans transformation. Le champ superadmin (`DocFileField`) est un simple `<input type="url">` en champ libre (au lieu du champ "docs/<fichier>" qui forçait la convention interne). `doc_collab_url` (document collaboratif, fonctionnalité distincte à base de `#collab/<code>`) n'est pas concerné et reste inchangé.

**Reste à faire par Jules** (hors portée code, nécessite le mot de passe superadmin) : mettre à jour `doc_info_url`/`doc_summary_url` de la séance de test `GENER1` (actuellement une URL localhost, cassée pour tout le monde) — soit vider le champ, soit y coller la vraie URL du site externe une fois disponible. Les fichiers `public/docs/*.html` (fiches de test committées à l'ancienne convention) sont maintenant orphelins — plus référencés par aucun code, à supprimer si Jules confirme qu'ils ne servent plus.

## Chantier 12 — Ordre des assertions & changement de vote
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| F8 | Ordre aléatoire des assertions ne fonctionne pas en pratique | Bug réel trouvé et corrigé — `src/screens/VoteScreen.tsx`, insertion à position aléatoire des assertions nouvellement approuvées (Realtime + polling), au lieu d'un append en fin de liste identique pour tout le monde. **Reste à vérifier en conditions réelles multi-participants** — voir A_VERIFIER.md | Claude | D13 |
| F9 | Harmoniser les deux points d'entrée "changer son vote" | Fait — la modale "Voir toutes les assertions" affiche maintenant "icône + Changer" comme le bouton "Voter" et comme la liste "Tes votes". Aucune raison légitime trouvée pour l'ancienne asymétrie (reliquat du fragment WIP D16) | Claude | D16 |

## Chantier 16 — Résultats / clôture

| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| F14 | Bouton "voir les résultats" indisponible en phase `closed`, redevient accessible après avoir quitté | Bug réel trouvé et corrigé — voir détail ci-dessous et A_VERIFIER.md | Claude | — |

**Investigation** : l'hypothèse de départ (séance de test sans clustering/analyse faite → indisponibilité "normale") a été écartée après lecture de `ResultsMapScreen.tsx`/`PublicResultsScreen.tsx` : les deux gèrent déjà proprement l'absence d'analyse PCA avec un message "pas encore disponible, revenez plus tard" — ce n'est jamais le bouton lui-même qui aurait dû être affecté par ça.

**Cause racine identifiée** : le bouton "Voir les résultats"/"Voir vos résultats" (overlay "Séance terminée", affiché quand `session?.phase === 'closed'` dans `ParticipantView.tsx`/`ModeratorView.tsx`) était un simple `<a href="#session/${session.join_code}">`, rendu **depuis l'intérieur de `TableView`**, donc pendant que `App.tsx` a `phase.type === 'table'`. Or le guard de routage de `App.tsx` pour la route `#session/` est : `hash.startsWith('#session/') && phase.type !== 'table'` — il exclut explicitement ce cas (par construction, pour laisser la priorité à `TableView` quand on vient de rejoindre une table en retard, cf. commentaire "Guard: si l'utilisateur vient de rejoindre une table en retard"). Résultat : le clic sur le lien change bien `window.location.hash`, mais `App.tsx` ne réévalue jamais la route vers `SessionRouterScreen` puisque `phase.type` reste `'table'` — le bouton semble ne rien faire. En cliquant ensuite sur "← Retour au menu" (`leaveTable()`, qui déclenche `onTableEnd` → `phase: 'entry'`), le hash déjà positionné sur `#session/<code>` devient exploitable au re-render suivant, et la navigation aboutit enfin — d'où le symptôme exact rapporté : "indisponible... redevient accessible après avoir quitté puis retenté".

**Correctif appliqué** : dans `ParticipantView.tsx` et `ModeratorView.tsx`, le `<a href>` est remplacé par un `<button onClick>` qui positionne `window.location.hash` **et** appelle `leaveTable()` dans le même handler, au lieu de compter sur une navigation `<a>` pure que le guard de `App.tsx` bloque tant qu'on est encore rattaché à la table. Aucune autre occurrence du même motif (`href={\`#session/…`, `#vote/…`, `#table/…`\`}` depuis un écran rendu en `phase.type === 'table'`) trouvée ailleurs dans le code.

**Vérifié** : `npx tsc -b` et `npm run build` (worktree dédié) passent sans erreur. Mécanisme confirmé en direct dans le Browser pane (`chantier-16-dev`, port 5181, contre la vraie base Supabase) : création d'une table sans admin rattachée à la séance de test `GENER1` (phase `voting`) → `ParticipantView` s'affiche sans erreur console. Puis reproduction du bug exact du guard de routage : `window.location.hash = '#session/16E27A'` (séance de test déjà `closed`, "Retraite") pendant que la table est encore ouverte → aucune navigation (bug confirmé, page reste sur `TableView`) ; clic sur "Quitter" juste après → `PublicResultsScreen` de la séance "Retraite" s'affiche immédiatement (résolution confirmée, hash déjà positionné + `phase.type` qui change). Ce test valide le mécanisme exact utilisé par le correctif (positionner le hash + quitter la table), sans avoir eu besoin du mot de passe superadmin. **Non vérifié** : le clic réel sur le nouveau bouton "Voir les résultats"/"Voir vos résultats" affiché par l'overlay "Séance terminée" lui-même — nécessite une séance passée en phase `closed` *pendant* qu'un participant est sur `ParticipantView`/`ModeratorView` (mot de passe superadmin requis, non saisi) — voir A_VERIFIER.md.

**Effet de bord assumé** : une table sans admin réelle ("TestF14routing", code `5A3B51`) a été créée et rattachée à la séance de test `GENER1` (phase `voting`) pour ce test — table vide, sans impact sur le déroulé de la séance de test, à nettoyer par Jules si souhaité (superadmin → onglet Tables).

---

*Pour référencer ce fichier depuis `CLAUDE.md`, ajouter une ligne du type : `Voir PROJECT_STATUS.md pour l'état courant des chantiers et ecclesia_plan_chantiers.md pour le détail des tâches.`*
