# Chantier 91 — comparatif avant/après de l'allocation

Branche `claude/chantier-91-allocation-passifs`, 2026-09-16. **À valider par Jules avant tout merge sur `main`.**

## Le modèle retenu avec Jules

> « pourquoi avoir un ratio à respecter, si on ne veut plus considérer les actifs dans la création des tables ? » — Jules, 16/09

Un passif n'intervient a priori pas : **il assiste en public**.

| | Avant (`main`) | Après |
|---|---|---|
| Qui forme les tables | tout le monde | **les actifs seulement** |
| Taille d'une table animée | 5 à 12 personnes | **5 à 14 actifs** |
| Taille d'une table sans modérateur | 5 à 7 personnes | 5 à 7 actifs |
| Règle « assez d'actifs » (`min(⌈2/5·taille⌉, 4)`) | règle 1 | **supprimée** |
| Passifs | répartis comme tout le monde | **public, réparti uniformément sur les tables animées** |
| Limite physique | — | **30 personnes par table**, public compris |
| Règles restantes (calculées sur les actifs) | 2 enregistrable · 3 hétérogénéité · 4 anciens · 5 nouveaux encadrés | **1** enregistrable · **2** hétérogénéité · **3** anciens (plancher de 3 sans modérateur conservé) · **4** nouveaux encadrés |

Une première version (v1, abandonnée le même jour) gardait les passifs dans la taille des tables, avec un ratio de 3/5. Pour 30 personnes dont 6 actifs, elle produisait 3 tables d'un seul actif chacune. Jules voulait une seule table : les 6 actifs, le modérateur et 24 passifs en public.

## Quatre corrections faites en implémentant — à valider

Chacune corrige un défaut **mesuré**. Les trois premières ne sont pas propres au chantier 91 : le plafond de 14 actifs les a seulement rendues visibles.

1. **Hétérogénéité : ne plus récompenser le mélange une fois le seuil atteint.** La règle cherchait à rendre la table la moins mélangée toujours plus mélangée, même quand toutes les tables respectaient déjà le seuil des 70 %. Des tables de 5 (2/2/1) garantissent ce minimum, et ce gain l'emportait sur la règle des anciens. Résultat pour 120 personnes : **11 tables dont 5 sans modérateur**, et deux tables de 14 avec 0 et 1 ancien au lieu des 6 requis. Désormais, au-delà du seuil de 70 %, être plus mélangé ne rapporte plus rien (comme la marge des anciens, déjà plafonnée à 0) : **6 tables toutes animées**.
2. **Tailles équilibrées entre tables animées.** Les tables étaient remplies dans l'ordre jusqu'au plafond : avec 14, on obtenait 14/12/5. Le nombre de personnes sans modérateur est inchangé, seule la répartition entre tables animées devient égale.
3. **Surplus de modérateurs : la boucle de résolution (chantier 25b) trouve maintenant vraiment le plus grand nombre de modérateurs animants.** Elle sautait directement au nombre de tables produit : pour 47 personnes et 4 modérateurs, elle passait de 4 à 2 modérateurs animants. Résultat : 2 tables animées, 1 table sans modérateur et 2 modérateurs assis, alors que 3 modérateurs donnaient 3 tables toutes animées. Elle descend désormais d'un cran à la fois. **Conséquence à connaître** : avec beaucoup de modérateurs, on obtient plus de tables animées et plus petites (25 actifs et 6 modérateurs → 5 tables de 5, contre 3 avant). C'est ce que le §4 et le code promettaient depuis le 25b.
4. **Le public ne rend pas non enregistrable la table qui doit l'être.** La recherche garde des tables propres parmi les actifs, puis le placement uniforme y mettait des passifs non consentants. Les tables enregistrables visées ne reçoivent maintenant un non-consentant du public qu'en dernier recours.

## Mesures

`C91_OUT=<fichier> npx vitest run bench/chantier-91-compare.test.ts` sur les populations du banc d'essai (attributs décorrélés, graine fixe, 1 enregistreur). « Avant » = le fichier `src/lib/allocation.ts` de `main`, passé dans le même script.

**Lecture** : 🎙️ = table animée, ∅ = sans modérateur, `10+6` = 10 actifs + 6 passifs (un modérateur assis compte comme actif). Les colonnes « échecs » et « enregistrables » reprennent les diagnostics de chaque version, selon ses propres règles.

| Salle | | Tables (actifs+public) | Passifs sans modérateur | Tables > 30 pers. | Échecs hétérogénéité / anciens | Enregistrables | Temps |
|---|---|---|---|---|---|---|---|
| 30 part. · 50 % actifs · 3 modé. | avant | 🎙️6+6 🎙️6+6 🎙️3+3 | 0 | 0 | 0 / 1 | 1 | 30 ms |
|  | après | 🎙️5+5 🎙️5+5 🎙️5+5 | 0 | 0 | 0 / 0 | 1 | 9 ms |
| 47 part. · 60 % actifs · 4 modé. | avant | 🎙️6+6 🎙️6+6 🎙️5+3 🎙️3+2 ∅5+0 ∅3+2 | 2 | 0 | 0 / 1 | 3 | 57 ms |
|  | après | 🎙️10+7 🎙️10+6 🎙️9+6 | 0 | 0 | 0 / 0 | 1 | 29 ms |
| 60 part. · 50 % actifs · 4 modé. | avant | 🎙️6+6 🎙️4+8 🎙️6+6 🎙️8+4 ∅3+3 ∅3+3 | 6 | 0 | 0 / 1 | 6 | 73 ms |
|  | après | 🎙️11+10 🎙️10+10 🎙️10+10 | 0 | 0 | 0 / 0 | 3 | 15 ms |
| 60 part. · 80 % actifs · 4 modé. | avant | 🎙️9+3 🎙️11+1 🎙️8+4 🎙️9+0 ∅3+2 ∅3+2 ∅5+0 | 4 | 0 | 0 / 1 | 4 | 130 ms |
|  | après | 🎙️12+3 🎙️12+3 🎙️12+3 🎙️12+3 | 0 | 0 | 0 / 1 | 1 | 47 ms |
| 60 part. · 40 % actifs · 2 modé. | avant | 🎙️4+16 🎙️10+10 ∅3+4 ∅4+3 ∅3+3 | 10 | 0 | 0 / 1 | 2 | 47 ms |
|  | après | 🎙️12+18 🎙️12+18 | 0 | 0 | 0 / 2 | 1 | 4 ms |
| 38 part. · 60 % actifs · 0 modé. | avant | ∅4+2 ∅3+3 ∅3+3 ∅4+1 ∅3+2 ∅3+2 ∅3+2 | 15 | 0 | 0 / 3 | 4 | 11 ms |
|  | après | ∅6+4 ∅6+4 ∅6+4 ∅5+3 | 15 | 0 | 0 / 1 | 2 | 2 ms |
| 30 part. · 20 % actifs · 3 modé. | avant | 🎙️4+16 🎙️3+8 | 0 | 0 | 0 / 0 | 1 | 12 ms |
|  | après | 🎙️8+24 | 0 | 1 | 0 / 0 | 0 | 0 ms |
| 120 part. · 60 % actifs · 6 modé. | avant | 🎙️2+3 🎙️2+3 🎙️2+3 🎙️2+3 🎙️2+3 🎙️2+3 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅4+1 ∅4+1 ∅3+2 ∅3+2 ∅3+2 ∅4+1 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅4+1 ∅4+1 ∅4+1 | 30 | 0 | 0 / 13 | 14 | 676 ms |
|  | après | 🎙️12+8 🎙️12+8 🎙️12+8 🎙️12+8 🎙️12+8 🎙️12+8 | 0 | 0 | 0 / 2 | 2 | 228 ms |
| 200 part. · 60 % actifs · 8 modé. | avant | 🎙️2+3 🎙️2+3 🎙️3+2 🎙️3+2 🎙️3+2 🎙️3+2 🎙️2+3 🎙️3+2 ∅4+1 ∅4+1 ∅3+2 ∅4+1 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 ∅3+2 | 61 | 0 | 0 / 19 | 24 | 1152 ms |
|  | après | 🎙️14+10 🎙️14+10 🎙️14+10 🎙️14+10 🎙️14+10 🎙️14+10 🎙️13+10 🎙️13+10 ∅5+0 ∅5+0 | 0 | 0 | 0 / 3 | 3 | 596 ms |

## Ce qu'il faut regarder

- **Plus aucun passif à une table sans modérateur** dès qu'il existe une table animée. Le seul cas restant est la séance sans modérateur (38 participants, 0 modérateur), qui n'arrive pas en pratique.
- **Grandes salles** : on passe de 24 et 40 tables (dont 6 et 8 animées de 2 à 3 actifs) à 6 et 10 tables, et les échecs sur la règle des anciens tombent de 13 à 2 et de 19 à 3.
- **Salle très passive (30 part., 6 actifs, 3 modérateurs)** : une seule table, comme voulu. Mais les 2 modérateurs sans table la rejoignent comme actifs, ce qui fait **8 actifs + 24 public = 32 personnes**, au-delà de la limite de 30, avec un avertissement. Jules : on accepte, ou les modérateurs en surplus ne doivent-ils pas compter dans la limite ?
- **Moins de tables enregistrables**, parce qu'il y a moins de tables. L'objectif reste « au moins `recorderCount` » (1 par défaut) et il est tenu, sauf pour la salle à une seule table : quelqu'un qui n'y consent pas y est forcément assis.

## Invariants vérifiés

- Jamais d'exception, y compris sans aucun actif, sans modérateur, ou avec plus de public que de places : tests « robustesse » et `bench/strategy-sanity.test.ts` sur les 4 stratégies.
- Déterminisme : même entrée, même sortie ; le public est trié par identifiant, il ne dépend donc pas de l'ordre d'entrée. Aucun `Math.random()`.
- 200 personnes : ~0,6 s, sous la limite de 5 s.
- `npm test`, `tsc --noEmit`, `npm run build` : propres.
- **Aucune migration** : les passifs restent des lignes `table_assignments` ordinaires, `apply_allocation` n'a pas changé.
