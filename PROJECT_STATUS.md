# Ecclesia — État du projet

> Descriptions complètes des tâches : voir `ecclesia_plan_chantiers.md`. Ce fichier ne recense que le statut courant — à mettre à jour au fil des PR. Statuts possibles : `Backlog` / `En cours` / `Bloqué` / `Terminé`.

Dernière mise à jour : 21/07/2026

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
| D2 | Désignation d'un admin en cours de débat | Backlog | | Chantier 1 |

## Chantier 4 — Rejoindre en cours de séance
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| D14 | Rejoindre le débat en retard, quelle que soit la phase | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| D8 | Rejoindre un ami via code distribué | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |

## Chantier 5 — Algo d'allocation & modérateurs
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| B1 | Refonte algo d'allocation + questionnaire | Fait (à vérifier — voir A_VERIFIER.md) | Claude | Chantier 2 |
| B2 | Assignation des modérateurs | Fait (à vérifier — voir A_VERIFIER.md) | Claude | Chantier 2 |
| E4 | Vue superadmin : retour des réponses modérateur | Fait (à vérifier — voir A_VERIFIER.md) | Claude | Chantier 2 |

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
| B4 | Fusion des assertions ne marche pas | En cours (à vérifier) | Claude | — |

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
| E1 | Suppression groupée assertions poubelle | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| E2 | Masquer qui a soumis quelle assertion | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |

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
| D16 | Pouvoir changer son vote | En cours (fragment WIP non fonctionnel sur branche `chantier-10-revote-fragment-incomplet`, hors scope de cette itération) | Claude | — |

---

*Pour référencer ce fichier depuis `CLAUDE.md`, ajouter une ligne du type : `Voir PROJECT_STATUS.md pour l'état courant des chantiers et ecclesia_plan_chantiers.md pour le détail des tâches.`*
