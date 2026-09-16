# Chantier 91 — comparatif avant/après de l'allocation

Branche `claude/chantier-91-allocation-passifs`, 2026-09-16. **À valider par Jules avant tout merge sur `main`.**

## Ce qui a changé

| | Avant | Après |
|---|---|---|
| Seuil d'actifs (règle 1) | `min(⌈2/5·taille⌉, 4)` : plafonné à 4, donc inopérant au-delà de 10 personnes | `⌊3/5·taille⌋` sans plafond : 3 à 5, 4 à 7, 6 à 10, 7 à 12, **8 à 14** |
| Plafond d'une table animée | 12 personnes au total | **14 actifs** ; les passifs s'ajoutent en plus, dans une limite dure de 24 personnes |
| Tables sans modérateur | 5 à 7 personnes | inchangé, 5 à 7 personnes **au total** |
| Passifs | répartis comme tout le monde | d'abord aux tables animées, **les plus fournies en actifs en premier**, autant que la règle 1 le permet |
| Ordre des règles | 1 actifs · 2 enregistrable · 3 hétérogénéité · 4 anciens · 5 nouveaux encadrés | 1 actifs · **2 passifs encadrés** · 3 enregistrable · 4 hétérogénéité · 5 anciens · 6 nouveaux encadrés |

La règle 2 est la « 6ᵉ règle » actée par Jules, placée **juste après la règle 1**, dans sa forme d'évitement : « ne pas mettre de passifs aux tables sans modérateur ». La forme positive (« sur les grosses tables à modérateurs ») n'est pas une règle en concurrence : c'est la façon dont les passifs sont distribués.

## Trois décisions prises pendant l'implémentation — à valider

Toutes trois corrigent un défaut **mesuré** sur les scénarios ci-dessous, pas une préférence.

1. **Dans la règle 1, le manque d'actifs aux tables sans modérateur compte en premier.** Sans ça, 60 part. / 50 % actifs / 4 modé. donnait une table sans modérateur avec **0 actif et 5 passifs** : sur le papier, le manque total d'actifs y était plus faible d'une personne, mais en pratique la table ne démarre pas. Une table animée qui manque un peu d'actifs a au moins un modérateur pour relancer.
2. **La règle 2 cherche aussi à avoir « le plus de tables animées possible ».** Maintenant que les passifs ne comptent plus dans la taille, l'hétérogénéité préfère toujours des tables plus grosses : 47 part. / 4 modé. donnait **3 tables d'environ 22 personnes et un modérateur renvoyé en participant**. Avant, le plafond de 12 personnes l'empêchait sans le dire.
3. **Plafond dur de 24 personnes par table animée** (`TABLE_TOTAL_MAX`). Ce chiffre n'est pas arbitraire : 14 actifs + 10 passifs, c'est la plus grande table qui tient encore les 3/5 d'actifs. Sans ce plafond, une salle presque entièrement passive donnait **une seule table de 37 personnes**. Ce cas est réaliste : un membre qui n'a pas fait l'onboarding compte comme passif.

## Mesures

`C91_OUT=<fichier> npx vitest run bench/chantier-91-compare.test.ts`, populations du banc d'essai (attributs décorrélés, graine fixe), 1 enregistreur.

**Lecture** : 🎙️ = table animée, ∅ = table sans modérateur, `8+6` = 8 actifs + 6 passifs. Les critères sont **recalculés à l'identique pour « avant » et « après »** avec les nouvelles règles (3/5 d'actifs, passifs sans modérateur) : la colonne « avant » montre donc comment l'ancien algorithme s'en sort face aux exigences de Jules, pas face aux siennes.

| Scénario | | Tables (actifs+passifs) | Manque d’actifs | Passifs sans modérateur | Tables en échec hétérogénéité / anciens | Enregistrables | Temps |
|---|---|---|---|---|---|---|---|
| 30 part. · 50 % actifs · 3 modé. | avant | 🎙️6+6 🎙️6+6 🎙️3+3 | 2 | 0 | 0 / 1 | 1 | 32 ms |
|  | après | 🎙️4+5 🎙️4+4 🎙️4+4 ∅3+2 | 1 | 2 | 0 / 1 | 1 | 14 ms |
| 47 part. · 60 % actifs · 4 modé. | avant | 🎙️6+6 🎙️6+6 🎙️5+3 🎙️3+2 ∅5+0 ∅3+2 | 2 | 2 | 0 / 1 | 3 | 45 ms |
|  | après | 🎙️7+6 🎙️7+6 🎙️7+6 🎙️7+1 | 0 | 0 | 0 / 1 | 1 | 24 ms |
| 60 part. · 50 % actifs · 4 modé. | avant | 🎙️6+6 🎙️4+8 🎙️6+6 🎙️8+4 ∅3+3 ∅3+3 | 5 | 6 | 0 / 1 | 6 | 68 ms |
|  | après | 🎙️8+8 🎙️8+8 🎙️7+7 🎙️7+7 | 4 | 0 | 0 / 1 | 4 | 57 ms |
| 60 part. · 80 % actifs · 4 modé. | avant | 🎙️9+3 🎙️11+1 🎙️8+4 🎙️9+0 ∅3+2 ∅3+2 ∅5+0 | 0 | 4 | 0 / 1 | 4 | 104 ms |
|  | après | 🎙️11+8 🎙️11+4 🎙️11+0 🎙️10+0 ∅5+0 | 0 | 0 | 0 / 1 | 1 | 90 ms |
| 60 part. · 40 % actifs · 2 modé. | avant | 🎙️4+16 🎙️10+10 ∅3+4 ∅4+3 ∅3+3 | 11 | 10 | 0 / 1 | 2 | 61 ms |
|  | après | 🎙️9+15 🎙️9+15 ∅3+3 ∅3+3 | 10 | 6 | 0 / 3 | 1 | 7 ms |
| 38 part. · 60 % actifs · 0 modé. | avant | ∅4+2 ∅3+3 ∅3+3 ∅4+1 ∅3+2 ∅3+2 ∅3+2 | 0 | 15 | 0 / 3 | 4 | 21 ms |
|  | après | ∅5+1 ∅3+3 ∅3+3 ∅3+2 ∅3+2 ∅3+2 ∅3+2 | 0 | 15 | 0 / 3 | 5 | 7 ms |
| 30 part. · 20 % actifs · 3 modé. | avant | 🎙️4+16 🎙️3+8 | 11 | 0 | 0 / 0 | 1 | 23 ms |
|  | après | 🎙️1+8 🎙️1+7 🎙️1+7 ∅3+2 | 10 | 2 | 0 / 1 | 2 | 3 ms |
| 120 part. · 60 % actifs · 6 modé. | avant | 🎙️2+3 🎙️2+3 🎙️2+3 🎙️2+3 🎙️2+3 🎙️2+3 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅4+1 ∅4+1 ∅3+2 ∅3+2 ∅3+2 ∅4+1 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅4+1 ∅4+1 ∅4+1 | 6 | 30 | 0 / 13 | 14 | 732 ms |
|  | après | 🎙️12+9 🎙️11+8 🎙️11+8 🎙️11+8 🎙️11+8 🎙️11+7 ∅5+0 | 0 | 0 | 0 / 4 | 1 | 67 ms |
| 200 part. · 60 % actifs · 8 modé. | avant | 🎙️2+3 🎙️2+3 🎙️3+2 🎙️3+2 🎙️3+2 🎙️3+2 🎙️2+3 🎙️3+2 ∅4+1 ∅4+1 ∅3+2 ∅4+1 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 | 3 | 61 | 0 / 19 | 24 | 1566 ms |
|  | après | 🎙️14+10 🎙️14+10 🎙️14+10 🎙️14+10 🎙️14+10 🎙️14+10 🎙️13+10 🎙️13+10 ∅5+0 ∅5+0 | 0 | 0 | 0 / 6 | 2 | 56 ms |

## Ce qu'il faut regarder

- **Les passifs ne vont plus aux tables sans modérateur** dès que les tables animées peuvent les accueillir (47, 60 à 50 % et à 80 %, 120, 200 participants). Quand il en reste (60 à 40 % d'actifs, 30 à 20 %), c'est que les actifs manquent partout ; un avertissement l'annonce au superadmin.
- **Grandes salles : fini l'éclatement.** Pour 120 et 200 participants, l'ancien algorithme produisait 24 et 40 tables de 5, dont 6 et 8 tables animées de 2 ou 3 actifs. On a maintenant 7 et 10 tables. Le calcul passe de 1,5 s à ~60 ms, et le nombre de tables en échec sur la règle des anciens baisse (13 → 4, 19 → 6).
- **Moins de tables enregistrables** (par ex. 14 → 1 à 120 participants). Ce n'est pas une régression de règle : l'objectif reste « au moins `recorderCount` tables propres », 1 par défaut. C'est la conséquence mécanique de tables moins nombreuses et plus grandes.
- **Salles très passives (30 part., 20 % d'actifs)** : on a maintenant 3 tables animées d'1 actif pour 7 à 8 passifs, plus une petite table sans modérateur de 3 actifs. Aucune répartition ne tient les 3/5 dans ce cas. Jules, est-ce le compromis voulu ?
- **Répartition inégale des passifs entre tables animées** (60 part. à 80 % : 🎙️11+8, 11+4, 11+0, 10+0). C'est l'application littérale de « les grosses tables d'abord » : une table ne reçoit des passifs que lorsque la précédente est pleine du point de vue de la règle 1. Une répartition égale est possible si Jules la préfère.

## Invariants vérifiés

- Jamais d'exception : tests « robustesse » et garde-fous `bench/strategy-sanity.test.ts`, sur les 4 stratégies.
- Déterminisme : même entrée → même sortie, aucun `Math.random()` ajouté.
- 200 personnes : moins de 5 s (130 ms en stratégie de production).
- `npm test` : 105 tests passent. `tsc --noEmit` et `npm run build` sont propres.
