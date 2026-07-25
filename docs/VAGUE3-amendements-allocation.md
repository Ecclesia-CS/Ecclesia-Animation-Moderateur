# Vague 3 — Amendements et décisions complémentaires

> Discussion avec Jules — 2026-07-25 (suite de la session sur l'algorithme d'allocation v2)

---

## Vue modérateur — conscience idéologique

Les modérateurs doivent connaître la composition d'opinion de leur table pour savoir où chercher le consensus et le dissensus.

**Ce qu'il faut afficher dans les outils du modérateur** :
- **Liste de composition idéologique** : nombre de personnes appartenant à chaque camp d'opinion, avec le nom et la description du camp (issus de l'analyse Gemini).
- **Assertions représentatives de chaque camp** : les assertions les plus typiques de chaque opinion.
- **Assertions clivantes dans sa table** : lesquelles ont créé du désaccord le plus fort au sein de sa table.
- **Assertions consensuelles dans sa table** : lesquelles ont rassemblé au-delà des clivages.

Cet ensemble permet au modérateur de naviguer le débat en fonction de la température : chercher du consensus si la table est trop tendue, chercher du dissensus constructif si elle est trop homogène.

---

## Vue superadmin — représentation des tables

Pendant l'étape de retouche de l'allocation, le superadmin doit voir d'un coup d'œil la santé de chaque table.

**Affichage pour chaque table** :
- **Composition par camp d'opinion** : nombre de personnes dans chaque camp (visuel : barres couleur, ou texte avec logos colorés).
- **Nombre d'actifs** : pour vérifier la règle 1.
- **Statut enregistrable** : badge « enregistrable » ou « non-enregistrable ».

**Mise à jour en direct** : lorsqu'une personne est déplacée entre tables (via drag & drop existant), le tableau se met à jour immédiatement, de sorte que le superadmin voit en temps réel l'impact de ses retouches sur la viabilité de chaque table selon les règles.

---

## Flow allocation — détail des étapes

1. La séance passe en phase `allocating`.
2. Le superadmin **déclenche l'allocation** (bouton).
3. L'algorithme crée les tables automatiquement, affiche le résultat avec le tableau de bord ci-dessus.
4. Le superadmin **fait ses retouches de dernière minute** (déplacements, ajustements).
5. Le superadmin **ajoute des modérateurs retardataires** : ils arrivent une fois l'allocation lancée, il peut les marquer comme tels (via un bouton ou un formulaire rapide).
6. Le superadmin **déclenche le passage en phase `debating`**.
7. Les participants sont automatiquement redirigés vers leur table assignée.

---

## Processus modérateurs — entrée dans la séance

Les modérateurs arrivent par un chemin distinct du flux participant normal.

**Menu principal modifié** :
- L'onglet « Voter » (obsolète, car les séances actives s'affichent désormais) est **remplacé par « Modérateur »** ou « Entrée modérateur ».
- **Contenu** : dropdown listant les séances actives en phase de vote ou allocating. Sélectionner une séance. Saisir le mot de passe Ecclesia. Rejoindre en tant que modérateur (pas de pseudo participant).

**Fallback superadmin** : si un modérateur oublie son mot de passe ou arrive tard, le superadmin peut le marquer comme modérateur directement dans l'onglet Participants de la séance — il ne doit pas saisir le mot de passe lui-même.

**Passage en débat** : une fois assigné à une table lors du lancement de l'allocation, le modérateur voit sa table et ses outils (composition idéologique, assertions clivantes/consensuelles, etc.).

---

## Fusion rejoindre / reprendre (participants)

L'écran d'accueil a trop d'onglets. On fusionne deux flux similaires.

**Nouveau titre et explication** : « Rejoindre ou reprendre une table de débat (hors phase de vote) ».

**Contenu** :
- **Champ de code de table** (existant, « rejoindre »).
- **Nouveau bouton « Je suis modérateur »** : ouvre un dialogue mot de passe Ecclesia, puis agit comme « reprendre » (récupère l'identité du modérateur sur cet appareil si elle existe).
- **Bouton « Créer une table »** : conservé (cas d'usage rare, mais utile pour les usages standalone).

---

## Onglet Reprendre — clarification UI

Renommer clairement : « Rejoindre ou reprendre une table » plutôt que juste « Reprendre ». Le wording courant n'est pas assez explicite.

---

## Phase pre_voting — message d'annonce

La bannière d'annonce (actuellement en petit, orange) doit être plus visible.

**Deux options** :
1. **Pop-up une seule fois** : affichée au premier chargement de `#vote/<code>` en phase `pre_voting`, mémorisée par session (`localStorage`), fermable.
2. **Déplacement** : la bannière reste inline mais remontée, agrandie, plus en évidence.

**Problème signalé** : sur mobile, le header est déjà chargé (boutons Quitter, Outils, Proposer), l'ajout de bannerie le rend trop encombré. La pop-up une seule fois semble la solution plus légère.

---

## Table leaderless — message de clarification

Quand un participant clique sur « Devenir animateur » (tables sans modérateur), un message d'avertissement doit préciser :

> « En devenant animateur de cette table, tu n'auras plus le statut de participant au débat. Tu modereras, mais tu ne participeras pas. »

Ceci évite la confusion : animer n'est pas participer.

---

## Nettoyage du questionnaire d'onboarding

**Suppression** : la colonne `moderator_pref` d'`entry_responses` est obsolète. Avec l'algorithme d'allocation v2, cette préférence n'alimente plus rien. À supprimer en base + dans les formulaires/RPC associées.

**Raison** : elle était collectée pour évaluer la demande de modérateur par table, but désormais rempli par les règles 1 à 5 de l'algo, qui ne s'appuient que sur consentement enregistrement, style de participation, ancienneté, et camp d'opinion.

---

## Signaux modérateur — clarification

Deux signaux distincts, doivent rester distincts :

- **« Je voudrais être modérateur à une séance future »** (`staff_interest`, questionnaire de fin de séance) : signal de recrutement, **informatif uniquement**, pas utilisé par l'algo. À garder pour les futures séances.
- **« Je suis modérateur pour cette séance »** (marquage dans la vue Participants du superadmin, ou connexion via mot de passe) : signal d'affectation, **utilisé par l'algo d'allocation** pour déterminer le nombre de tables animées. Critère dur.

---

## Suppression des notions de durée par phase

**Décision** : les timers/compteurs de phase (vote, allocating, etc.) sont **retirés de l'application**. La gestion des durées est entièrement manuelle par l'organisateur, hors app.

**Raison** : ce n'est jamais une vraie contrainte en pratique — la séance démarre quand elle démarre, s'étire si besoin. Simplifier l'app plutôt que d'ajouter un système de timing que personne n'utilisera correctement.

**Conséquence** : suppression de `vote_timer_minutes` et `vote_threshold_percent` de la config de séance. Les transitions de phase restent manuelles (boutons du superadmin).

---

## Statuts et dépendances dans le plan

- **Items achevés** :
  - `run_clustering_v3` (juillet), remplacée par l'algo v2.
  - `get_moderator_responses` + onglet E4 (juillet), remplacés par l'algo v2 et les nouvelles vues.
  - `run_clustering_v1`/`v2` : à conserver provisoirement, à retirer après validation de l'algo v2 en prod.

- **Items à implémenter (Vague 3)** :
  - Algorithme d'allocation v2 complet (contraintes + recherche locale, client-side).
  - Nouvelle RPC création tables en lot (`create_tables_batch`).
  - Vue modérateur : composition idéologique + assertions clivantes/consensuelles.
  - Vue superadmin : tableau de bord allocation avec compo par camp, actifs, enregistrable.
  - Refonte menu principal : « Modérateur » en place de « Voter », fusion rejoindre/reprendre.
  - Message clarification table leaderless.
  - Pop-up annonce pre_voting.
  - Suppression `moderator_pref` du schéma.
  - Suppression timers de phase.

- **Backlog / À clarifier** :
  - Mobile header : confirmer la solution pop-up pour l'annonce pre_voting, ou ajuster le layout.
