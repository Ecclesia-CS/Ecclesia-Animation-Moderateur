# Chantier 5 — Allocation & assignation des modérateurs (B1, B2, E4)

> Design/décisions. Rédigé par la session Claude « chantier-5 » (2026-07-21).
> **À valider par Jules** — plusieurs choix reposent sur une interprétation des
> intitulés courts de `PROJECT_STATUS.md` (le détail `ecclesia_plan_chantiers.md`
> est absent du dépôt).

---

## 🚩 DÉCISIONS À VALIDER PAR JULES (algorithme d'allocation & modérateurs)

> Sur consigne de Jules : les vrais choix d'architecture/algorithme ne sont **pas
> tranchés seul**. Ci-dessous chaque décision non triviale, avec 2-3 options et leurs
> avantages/inconvénients. **Le code mergé implémente à chaque fois l'Option A** — ce
> n'est pas un choix définitif, juste la variante la plus sûre/rétrocompatible en
> attendant l'arbitrage. E4 (panneau d'affichage) n'est pas listé ici : c'est de
> l'affichage non ambigu.

### Décision 1 — Quels critères du questionnaire l'algo doit-il utiliser, et avec quelle priorité ? (B1)

- **Option A — hétérogénéité d'opinion (primaire) + équilibrage écoute/actif (secondaire)** ✅ *implémentée*
  - ➕ Simple ; améliore la qualité délibérative (évite une table 100 % passive) ; ne dégrade pas l'hétérogénéité d'opinion ; rétrocompatible (opt-in).
  - ➖ N'exploite pas `group_size_pref`, `openness_to_diff`, `moderator_pref` dans l'algo.
- **Option B — A + appariement offre/demande de modérateur** (partitionner les demandeurs vers les tables modérées)
  - ➕ Répond directement à la demande de modérateur.
  - ➖ **En tension avec l'hétérogénéité** (un objectif au détriment de l'autre) ; plus complexe ; cf. Décision 3.
- **Option C — A + modulation de l'hétérogénéité par `openness_to_diff`** (regrouper ceux qui veulent des avis proches, mixer ceux qui veulent de la diversité)
  - ➕ Respecte la préférence individuelle de diversité.
  - ➖ Crée des tables homogènes — potentiellement contraire à l'esprit délibératif Ecclesia ; complexifie la notion de « table cible ».

### Décision 2 — Nouvel algo opt-in vs remplacement de l'algo par défaut (B1)

- **Option A — `run_clustering_v3` séparée, activée par une case à cocher ; v1/v2 restent le défaut** ✅ *implémentée*
  - ➕ Zéro risque de régression ; permet à Jules de valider avant d'en faire le défaut.
  - ➖ Deux algos à maintenir ; la nouveauté n'est utilisée que si on coche.
- **Option B — modifier `run_clustering_v2` en place** (le nouveau comportement devient le défaut dès l'application de la migration)
  - ➕ Un seul algo ; tout le monde en bénéficie automatiquement.
  - ➖ Change le comportement pour tous d'un coup, sans période de validation.

### Décision 3 — Comment les modérateurs sont-ils assignés ? (B2)

- **Option A — informatif : afficher la demande par groupe (+ alerte si table sans animateur sur groupe demandeur), rattachement manuel par le superadmin** ✅ *implémentée*
  - ➕ Simple ; garde l'humain dans la boucle ; aucun nouveau signal requis.
  - ➖ Entièrement manuel ; pas d'automatisation.
- **Option B — semi-automatique : l'algo marque les K tables « à modérer » selon la demande agrégée et pré-remplit les rattachements ; le superadmin confirme**
  - ➕ Gain de temps sur les grosses séances.
  - ➖ Nécessite une règle « combien de modérateurs disponibles » ; logique DB supplémentaire.
- **Option C — auto-désignation d'un participant-modérateur par table**
  - ➕ Aucun modérateur staff requis.
  - ➖ **Nécessite un signal « je veux bien modérer »** qui n'existe pas (cf. Décision 4) ; risque de désigner quelqu'un de non volontaire.

### Décision 4 — Réutiliser `moderator_pref` ou ajouter une question « volonté de modérer » ? (B2/E4)

- **Option A — réutiliser `moderator_pref`** (question D18 = « veux-tu être *avec* un modérateur ? »), sans toucher au questionnaire ✅ *implémentée*
  - ➕ Aucun changement au questionnaire (respecte chantier-2) ; aligne offre/demande côté staff.
  - ➖ Ne dit pas *qui* accepterait de modérer → auto-désignation (Décision 3-C) impossible.
- **Option B — ajouter une 7ᵉ question « Accepterais-tu d'animer une table ? »**
  - ➕ Débloque l'auto-désignation.
  - ➖ Duplique le thème « modération » de chantier-2 (D18) ; rallonge l'onboarding ; nécessite une migration `entry_responses` + coordination avec chantier-2.

### Décision 5 (mineure) — Cas limites (choix par défaut, à confirmer)

- Membres sans onboarding (`participation_style` NULL) : triés en fin de groupe (`COALESCE 'zzz'`) puis répartis normalement — implémenté.
- Non-votants présents : répartis aléatoirement à part, **comportement identique à v2** — implémenté.
- Ces choix suivent l'existant ; signalés pour transparence, pas de tension architecturale.

---

## Contrainte majeure de cette session

**L'accès MCP Supabase était indisponible.** Impossible d'appliquer les migrations
sur la base distante ni de tester les nouvelles fonctions RPC de bout en bout dans
le navigateur (le dev server pointe sur la même base distante). Conséquence :

- Les **migrations SQL** sont écrites et relues, mais **doivent être appliquées par
  Jules** (`supabase db push` ou via MCP) avant que le comportement soit exerçable.
- Le **frontend** dégrade proprement si la RPC n'existe pas encore (panneau « données
  indisponibles » au lieu d'un crash).
- La vérification navigateur de cette session couvre : build TS, rendu des écrans,
  non-régression des flux existants. Elle **ne couvre pas** la justesse des données
  renvoyées par les nouvelles RPC (à faire par Jules après application — voir
  `A_VERIFIER.md`).

## Rappel du modèle existant

L'onboarding (`entry_responses`, chantier-2) collecte par membre :
`consent_transcript`, `group_size_pref`, `moderator_pref` (bool — question D18
« Tiens-tu à être avec un modérateur ? »), `openness_to_diff` (1-5),
`participation_style` (listener|active), `ecclesia_experience`.

L'allocation actuelle :
- `run_clustering_v1` : aléatoire pur (présentiels uniquement).
- `run_clustering_v2` : round-robin hétérogène par camp d'opinion (`group_id` du
  k-means), présentiels uniquement, non-votants répartis aléatoirement.
- **Aucun** de ces algorithmes n'utilise les réponses du questionnaire.

## Interprétation retenue des items

- **E4 « Vue superadmin : retour des réponses modérateur »** → afficher au superadmin
  l'agrégat des réponses à la question modérateur (`moderator_pref`) : combien veulent
  un modérateur, combien s'en passent, et — une fois l'allocation faite — la demande
  par table. C'est la lecture la plus directe de « retour des réponses modérateur ».
- **B2 « Assignation des modérateurs »** → outiller le superadmin pour affecter les
  tables physiques *modérées* (non-`leaderless`) aux groupes à forte demande de
  modérateur, et les tables `leaderless` aux groupes sans demande. Réalisé comme une
  **couche informationnelle** au-dessus de E4 (badge de demande par groupe + alerte
  « ce groupe veut un modérateur mais la table rattachée est sans animateur »),
  s'appuyant sur `assign_table_to_group` et `leaderless` déjà existants.
- **B1 « Refonte algo d'allocation + questionnaire »** → faire *utiliser* le
  questionnaire par l'allocation. Livré comme `run_clustering_v3`, **opt-in** via une
  case à cocher dans la modale de clustering (le chemin par défaut v1/v2 reste
  strictement inchangé). v3 = v2 + équilibrage de `participation_style` entre les
  tables (interleaving) tout en conservant l'hétérogénéité d'opinion.

### Pourquoi B2/E4 réutilisent `moderator_pref` (réconciliation chantier-2)

La question D18 mesure la *préférence à avoir un modérateur*, **pas** la *volonté
d'être modérateur*. Plutôt que d'ajouter une 7ᵉ question (qui dupliquerait/contredirait
le thème « modération » de chantier-2), B2/E4 exploitent le signal existant
`moderator_pref` pour aligner offre (tables modérées) et demande (membres voulant un
modérateur). Aucune modification du questionnaire n'est faite par ce chantier.

## Livrables

- `supabase/migrations/20260721_moderator_responses.sql` — `get_moderator_responses`.
- `supabase/migrations/20260721_clustering_v3.sql` — `run_clustering_v3` (opt-in).
- `src/lib/types.ts`, `src/lib/voting.ts` — types + wrappers.
- `src/screens/SuperadminScreen.tsx` — panneau E4, badges/alertes B2, toggle B1.
