# `bench/` — banc d'essai de l'algorithme d'allocation (chantier 29)

Outillage de **mesure**, pas de production. Rien ici n'est importé par l'app.

## Contenu

| Fichier | Rôle | Tourne avec `npm test` ? |
|---|---|---|
| `allocation-bench.ts` | Générateur de populations synthétiques + métriques. | — (module) |
| `allocation-bench.test.ts` | Exécute la comparaison et écrit le rapport Markdown. | **Non** (voir ci-dessous) |
| `strategy-sanity.test.ts` | Garde-fous appliqués à *chaque* stratégie candidate : déterminisme (§6), aucun membre perdu, bornes de taille, latence < 5 s sur 200 personnes. | **Oui** |

## Lancer la comparaison

```bash
ALLOC_BENCH=1 npx vitest run bench/          # ~90 s, écrit docs/chantier-29-comparatif-allocation.md
ALLOC_BENCH=1 ALLOC_BENCH_QUICK=1 npx vitest run bench/   # grille réduite, ~10 s
```

Sans `ALLOC_BENCH=1` le banc est ignoré (`describe.skipIf`) : `npm test` reste rapide et ne
dépend pas d'un fichier généré.

## Ajouter un scénario

Éditer `NORMATIVE`, `EDGE_CASES` ou `buildGrid()` dans `allocation-bench.ts`. Un scénario est
décrit par `ConfigSpec` : nombre de participants, part d'anciens, part d'actifs, part de
consentants, poids des camps d'opinion, nombre de modérateurs, nombre d'enregistreurs, et
disponibilité de l'analyse des camps.

Les effectifs sont **exacts** (et non tirés au sort membre par membre) : les ratios demandés
sont respectés à la personne près, ce qui rend les comparaisons entre stratégies
interprétables. Les attributs sont en revanche **décorrélés** entre eux — contrairement aux
populations `balanced()` des tests unitaires, dont la corrélation masquait un défaut réel
(cf. le commentaire dans `evaluate()` de `src/lib/allocation.ts`).

## Comparer une stratégie

Les stratégies sont exportées par `src/lib/allocation.ts` (`STRATEGY_LEGACY`,
`STRATEGY_ABSOLUTE_ONLY`, `STRATEGY_STRONG_SEARCH_ONLY`, `STRATEGY_ABSOLUTE_STRONG`) et se
passent via `AllocationInput.strategy`. **Sans ce champ, `runAllocation` garde le comportement
historique** — le banc n'influence donc jamais la production.

Pour ajouter une piste : définir une nouvelle constante `AllocationStrategy`, l'ajouter au
tableau `STRATEGIES` d'`allocation-bench.ts`, relancer. L'intérêt du découpage en champs
indépendants (`shortfallMetric`, `perShapeBudget`, `targetedNeighborhood`, `quotaSeeding`,
`boundPruning`) est de pouvoir **isoler la contribution de chaque piste** plutôt que de
constater l'effet d'un correctif global non attribuable.
