# Ecclesia — État du projet

> Descriptions complètes des tâches : voir `ecclesia_plan_chantiers.md`. Ce fichier ne recense que le statut courant — à mettre à jour au fil des PR. Statuts possibles : `Backlog` / `En cours` / `Bloqué` / `Terminé`.

Dernière mise à jour : 27/07/2026 — **Chantier 21 : flow d'entrée modérateur & refonte menu participant livré** (G8/G9/G10/G11) — onglet « Modérateur » (remplace « Voter ») auto-déclarant via `claim_moderator_status`, fusion des onglets Rejoindre/Reprendre avec bouton « Je suis modérateur », fallback superadmin (G9) déjà suffisant depuis le chantier 19. Bug corrigé en passant : `AllocatingScreen.handleJoin` codait `isModerator` en dur à `false`, empêchant tout modérateur assigné par l'allocation d'arriver en `ModeratorView` au passage en `debating`. Développé en worktree dédié (`chantier-21-flow-moderateur`) en parallèle du chantier 20 — aucun chevauchement de fichiers constaté. **Reste le parcours fonctionnel navigateur complet** (mot de passe superadmin requis) : voir A_VERIFIER.md.

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
| C3 | Affichage documents + backend de stockage | Backlog | | Décision infra |
| C4 | Distinction vote pass/neutre + doc technique | Backlog | | Jules (doc pol.is) |
| D6 | Mention non-conservation des audios | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| D11 | Assertions visibles pendant le débat | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| D12 | Mention anonymat des votes | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| D13 | Ordre aléatoire des assertions | Fait — déjà implémenté (shuffle Fisher-Yates dans VoteScreen), vérifié en lisant le code | Claude | — |
| D15 | QR code lien table (modérateurs) | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| D16 | Pouvoir changer son vote | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |

---

*Pour référencer ce fichier depuis `CLAUDE.md`, ajouter une ligne du type : `Voir PROJECT_STATUS.md pour l'état courant des chantiers et ecclesia_plan_chantiers.md pour le détail des tâches.`*
