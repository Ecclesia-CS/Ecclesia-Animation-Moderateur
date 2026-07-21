# Chantier 5 — Allocation & assignation des modérateurs (B1, B2, E4)

> Design/décisions. Rédigé par la session Claude « chantier-5 » (2026-07-21).
> **À valider par Jules** — plusieurs choix reposent sur une interprétation des
> intitulés courts de `PROJECT_STATUS.md` (le détail `ecclesia_plan_chantiers.md`
> est absent du dépôt).

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

## Point à trancher par Jules (décision produit, non tranchée ici)

Faut-il que l'algorithme **partitionne** les membres selon `moderator_pref`
(regrouper les « je veux un modérateur » sur les tables modérées, les autres sur des
tables `leaderless`) ? Cela **entre en tension avec l'hétérogénéité d'opinion**
(un objectif ne peut être maximal que si l'autre est relâché). Je n'ai **pas** tranché
ce compromis unilatéralement : v3 conserve l'hétérogénéité comme objectif primaire et
laisse l'appariement offre/demande au superadmin (couche B2). Si Jules veut un
partitionnement algorithmique dur, c'est une évolution de `run_clustering_v3` à
spécifier explicitement.

## Livrables

- `supabase/migrations/20260721_moderator_responses.sql` — `get_moderator_responses`.
- `supabase/migrations/20260721_clustering_v3.sql` — `run_clustering_v3` (opt-in).
- `src/lib/types.ts`, `src/lib/voting.ts` — types + wrappers.
- `src/screens/SuperadminScreen.tsx` — panneau E4, badges/alertes B2, toggle B1.
