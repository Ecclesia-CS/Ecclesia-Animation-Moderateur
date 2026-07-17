# Ecclesia — État du projet

> Descriptions complètes des tâches : voir `ecclesia_plan_chantiers.md`. Ce fichier ne recense que le statut courant — à mettre à jour au fil des PR. Statuts possibles : `Backlog` / `En cours` / `Bloqué` / `Terminé`.

Dernière mise à jour : 17/07/2026

## Chantier 1 — Navigation partout
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| C5 | Bouton « Quitter » dans toutes les phases | Backlog | | — |
| D3 | Messages de reload en phase d'attente | Backlog | | — |
| D5 | Message d'intro sur le fonctionnement de l'app | Backlog | | — |
| D9 | Infos sur la phase « allocating » | Backlog | | — |

## Chantier 2 — Questionnaire & identité avant allocation
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| D18 | Question modérateur oui/non | Backlog | | — |
| D4 | Renommer « pseudo » → « nom prénom » | Backlog | | — |
| D7 | Préremplir le nom/pseudo | Backlog | | — |

## Chantier 3 — Débat sans admin
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| D1 | Lecture rapide des règles à l'entrée de table | Backlog | | Chantier 1 |
| D2 | Désignation d'un admin en cours de débat | Backlog | | Chantier 1 |

## Chantier 4 — Rejoindre en cours de séance
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| D14 | Rejoindre le débat en retard, quelle que soit la phase | Backlog | | Chantier 1 |
| D8 | Rejoindre un ami via code distribué | Backlog | | Chantier 1 |

## Chantier 5 — Algo d'allocation & modérateurs
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| B1 | Refonte algo d'allocation + questionnaire | Backlog | | Chantier 2 |
| B2 | Assignation des modérateurs | Backlog | | Chantier 2 |
| E4 | Vue superadmin : retour des réponses modérateur | Backlog | | Chantier 2 |

## Chantier 6 — Analyse des camps (Gemini)
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| A1 | Bug de nommage des camps | Backlog | | — |
| E3 | Nommage Gemini systématique après analyse | Backlog | | — |
| D10 | Assertions consensuelles inter-groupes | Backlog | | A1/E3 |
| C6 | Tracking impact énergétique des appels LLM | Backlog | | — |

## Chantier 7 — Fusion des assertions
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| B4 | Fusion des assertions ne marche pas | Backlog | | — |

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
| E1 | Suppression groupée assertions poubelle | Backlog | | — |
| E2 | Masquer qui a soumis quelle assertion | Backlog | | — |

## Chantier 10 — Petites tâches transverses
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| C1 | Ping automatique Supabase | Backlog | | — |
| C2 | Identité visuelle / branding | Backlog | | Charte graphique (Jules) |
| C3 | Affichage documents + backend de stockage | Backlog | | Décision infra |
| C4 | Distinction vote pass/neutre + doc technique | Backlog | | Jules (doc pol.is) |
| D6 | Mention non-conservation des audios | Backlog | | — |
| D11 | Assertions visibles pendant le débat | Backlog | | — |
| D12 | Mention anonymat des votes | Backlog | | — |
| D13 | Ordre aléatoire des assertions | Backlog | | — |
| D15 | QR code lien table (modérateurs) | Backlog | | — |
| D16 | Pouvoir changer son vote | Backlog | | — |

---

*Pour référencer ce fichier depuis `CLAUDE.md`, ajouter une ligne du type : `Voir PROJECT_STATUS.md pour l'état courant des chantiers et ecclesia_plan_chantiers.md pour le détail des tâches.`*
