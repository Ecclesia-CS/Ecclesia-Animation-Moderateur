# Chantier 29 — suite : session de test et réglage du modèle

> Brief de reprise pour une **nouvelle conversation**. La conversation d'origine (instruction
> du I1, mesure des 4 pistes, adoption de D) est close : tout ce qui suit se suffit à lui-même.

---

## 1. Où on en est

Le chantier 29 (I1) est **mergé sur `main`**. L'algorithme d'allocation utilise désormais
`STRATEGY_ABSOLUTE_STRONG` par défaut dans `src/lib/allocation.ts`.

Ce qui a changé par rapport à l'algorithme des chantiers 19→25c :

| Piste | Effet |
|---|---|
| `shortfallMetric: 'absolute'` | Les règles 1 et 4 sont scorées en **manque total de personnes**, plus en taux d'échec `-fail/T`. Le taux récompensait mécaniquement le découpage : à manque égal, six petites tables battaient cinq grandes. |
| `perShapeBudget: 'fair'` | Le budget d'évaluations est réparti **équitablement entre les formes candidates** au lieu d'être un pool global vidé par les premières formes énumérées. |
| `quotaSeeding` | Amorce réalisant la **solution exacte** du sous-problème d'affectation des anciens et des actifs (le manque minimal vaut `max(0, Σseuils − offre)`, indépendant de la distribution). |
| `targetedNeighborhood` | Les déficits sont réparés en priorité par des échanges **à camp constant**, structurellement neutres pour la règle 3 — dont le maximin, classé juste avant la règle 4, figeait sinon la descente. |
| `boundPruning` | Une forme dont l'**optimum théorique** est déjà lexicographiquement battu n'est pas explorée. |

**Le constat qui a motivé tout ça** : l'exemple normatif du §4 de
`docs/chantier-5-allocation-v2-spec.md` (60 participants / 4 modérateurs → 8 tables)
**n'était pas tenu**. Son test de non-régression employait une population aux attributs
corrélés (`balanced()`, `i%2`/`i%5`/`i%3`) ; sur une population décorrélée de même composition
agrégée, l'ancien algorithme produisait 6 tables dont deux de 10 sans animateur — précisément
ce que le §4 désigne comme mauvais. Un test durci (`… population DÉCORRÉLÉE`) verrouille
désormais la propriété : il est **rouge** si on rebascule le défaut sur `STRATEGY_LEGACY`.

Mesuré par ablation sur ~160 configurations : **ni la métrique seule ni la recherche seule ne
suffisent**, et la recherche seule est même souvent *pire* que l'existant (elle applique plus
efficacement un objectif biaisé). Rapport complet :
`docs/chantier-29-comparatif-allocation.md`.

---

## 2. Ce que Jules attend de la prochaine session

> Citation de la demande : « tu génèreras plusieurs séances avec plusieurs prop, les lanceras
> sous l'algo, et me présenteras le résultat. Je dirai quelles répartitions je préfèrerai ou
> non, et on en discutera pour affiner le modèle. »

Concrètement :

1. **Générer plusieurs séances aux profils variés** (taille de salle, ratio anciens/nouveaux,
   ratio actifs/passifs, nombre de modérateurs, consentement, camps d'opinion).
2. **Les passer sous l'algorithme** tel qu'il est en production.
3. **Présenter les répartitions obtenues** sous une forme qu'il peut juger scénario par
   scénario — c'est sa méthode de validation habituelle, pas une preuve formelle.
4. Il dit ce qu'il aime ou non ; on **ajuste le modèle** en conséquence.

### Points de méthode déjà arrêtés avec lui — à respecter

- **Pas de harnais/script CLI dédié.** Il l'a explicitement écarté : il préfère discuter des
  tableaux comparatifs, ou créer de vraies séances de test dans l'app (type `VERIF7`).
- **Ne jamais merger un changement algorithmique sur `main` sans son accord explicite.** Livrer
  sur worktree/branche, défaut de production inchangé, arbitrage documenté dans
  `A_VERIFIER.md`.
- **Ne jamais utiliser `AskUserQuestion`** dans ce projet (outil indisponible côté dispatch) —
  documenter dans `A_VERIFIER.md` plutôt que poser une question bloquante.
- Présenter les **divergences entre variantes**, pas des moyennes agrégées : sur ce problème
  les moyennes écrasent les différences (mesuré — les 4 stratégies tiennent en 0,4 point d'écart
  sur la moyenne des sièges non animés, alors qu'elles divergent du simple au double sur des
  scénarios précis).

---

## 3. L'arbitrage de fond encore ouvert — le vrai sujet de la session

**Salle nombreuse, peu d'anciens, peu ou pas de modérateurs.** Exemple mesuré : 90 personnes,
15 % d'anciens, 0 modérateur.

- L'ancien algorithme donnait **16 petites tables** (des 6 et des 5), toutes sans animateur,
  28 personnes manquantes pour atteindre les seuils d'anciens.
- Le nouveau donne **9 tables de 10**, toutes sans animateur, 22 personnes manquantes.

**La spec se contredit sur ce cas**, et c'est un choix d'animation, pas un choix technique :

- le §4 dit « tables non modérées : les dimensionner vers le minimum de 5 », parce que
  l'auto-régulation par `claim_floor` (le premier en file prend la parole) est réaliste à 5 et
  beaucoup moins à 10 → plaide pour beaucoup de petites tables ;
- mais la règle 4 est **plus prioritaire** que la politique de dimensionnement, et regrouper
  donne un peu plus d'expérience par table → plaide pour moins de grandes tables.

**Question à poser à Jules, avec des exemples sous les yeux** : préfère-t-il beaucoup de petites
tables auto-gérées mais presque toutes sans participant expérimenté, ou moins de grandes tables
auto-gérées avec un peu plus d'expérience à chacune ?

Ce cas ne se pose **que** quand les modérateurs sont rares ou absents. Dès qu'il y en a assez,
le nouveau comportement est nettement meilleur (36 personnes / 6 modérateurs : l'ancien laissait
10 sièges sans animateur, le nouveau zéro).

Second arbitrage ouvert, mineur : **faut-il garder le champ `AllocationInput.strategy`** en
production (aucun appelant ne le passe ; il sert au banc d'essai), le renommer
`__benchStrategy`, ou figer la stratégie en dur ? Recommandation : le garder — c'est lui qui a
permis l'ablation.

---

## 4. Outillage disponible pour produire les scénarios

### Banc d'essai (le plus rapide pour itérer)

```bash
ALLOC_BENCH=1 npx vitest run bench/                       # ~90 s, écrit le rapport comparatif
ALLOC_BENCH=1 ALLOC_BENCH_QUICK=1 npx vitest run bench/   # grille réduite, ~10 s
```

- `bench/allocation-bench.ts` — générateur de populations (`ConfigSpec` : nombre de
  participants, part d'anciens, part d'actifs, part de consentants, poids des camps, nombre de
  modérateurs, nombre d'enregistreurs, disponibilité de l'analyse des camps) + métriques.
  Les effectifs sont **exacts** (ratios respectés à la personne près) et les attributs
  **décorrélés** — ne pas revenir à des populations corrélées, c'est ce qui masquait le défaut.
- `bench/allocation-bench.test.ts` — exécution + génération du rapport Markdown.
- `bench/strategy-sanity.test.ts` — garde-fous appliqués à *chaque* stratégie : déterminisme
  (§6), aucun membre perdu, bornes de taille, latence < 5 s sur 200 personnes. Tourne avec
  `npm test`.
- `bench/README.md` — comment ajouter un scénario ou une stratégie.

Pour la session de test, le plus efficace est probablement d'**ajouter les profils de séance
voulus dans `EDGE_CASES`** (ou une nouvelle liste dédiée) et de présenter la section détaillée
correspondante.

### Vraie séance dans l'app (si Jules veut voir en conditions réelles)

1. `#superadmin` → mot de passe → créer une séance de test, phase `voting`.
2. Inscrire N participants. Ce qui pilote l'algorithme, c'est l'**onboarding en 3 questions** :
   « As-tu déjà fait un débat Ecclesia ? » (→ ancien, viser **sous 40 %** pour les cas
   intéressants), « participer activement / plutôt écouter » (règle 1), consentement à
   l'enregistrement (règle 2).
3. Marquer les modérateurs : onglet **Participants**, ou auto-déclaration avec le mot de passe
   Ecclesia. **Le nombre de modérateurs est le second levier** du comportement.
4. Faire voter assez pour que l'analyse des camps aboutisse (sinon la règle 3 est désactivée et
   l'arbitrage change), puis lancer l'analyse dans l'onglet **Analyse**.
5. Phase `allocating` → onglet **🟢 En direct** → **« Calculer la répartition »**.

⚠️ « Calculer » n'écrit **rien** en base ; seul « Appliquer » écrit. Ne pas appliquer sur une
séance qui sert à autre chose. Le mot de passe superadmin n'est pas détenu par l'agent — c'est
Jules qui pilote cette partie.

---

## 5. Contraintes projet à ne pas oublier

- **Worktree obligatoire** pour tout travail parallèle (`git worktree add`), copier `.env`
  depuis la racine, `npm install` dans le worktree.
- `preview_start` lit le `.claude/launch.json` du **dossier racine**, pas celui du worktree :
  y ajouter une entrée avec `--prefix <chemin worktree>` et un port libre. Entrée existante pour
  ce chantier : `chantier-29-dev`, port 5191. Maximum **5 serveurs de dev simultanés** par
  dossier — les autres sessions les consomment souvent.
- `A_VERIFIER.md` : ne jamais supprimer une entrée sans validation explicite de Jules ; la
  déplacer en section « Validé ».
- L'algorithme **ne doit jamais lever d'exception** (§6) : une règle non satisfaisable se
  dégrade, elle ne bloque pas. Et il doit rester **déterministe** à graine fixe — `Math.random()`
  est interdit dans `allocation.ts`.

---

## 6. État de la vérification à la clôture

- `npx tsc --noEmit` ✅ · `npm run build` ✅ · `npm test` → **75 tests verts** (62 existants
  + 12 garde-fous par stratégie + 1 test §4 durci), banc d'essai ignoré par défaut.
- Le test §4 durci **discrimine réellement** : rouge sur `STRATEGY_LEGACY`, vert sur D.
- Banc d'essai : ~160 configurations × 4 stratégies, **zéro violation** des invariants (aucun
  participant perdu, bornes de taille respectées).
- Browser pane (port 5191) : app montée, `#superadmin` rendu, **zéro erreur console** ; module
  `allocation.ts` servi par Vite exercé dans la page — l'ancien comportement y reproduit le
  symptôme d'origine (31 participants / 12 anciens → `6M 5M 5M 5- 5- 5-`) et le nouveau donne
  le résultat attendu (`10M 10M 6M 5-`).
- **Non vérifié** : le trajet complet `loadAllocationInputs` → calcul → `apply_allocation` sur
  une vraie séance (mot de passe superadmin non détenu). C'est l'objet de la session à venir.
