# Fusion des assertions — état des lieux et pistes

> Document de travail rédigé le 2026-07-29 à l'issue du chantier 18, destiné à
> une conversation dédiée sur la refonte de l'appel. Il se veut **autonome** :
> tout ce qui suit est mesuré ou vérifiable dans le dépôt, aucune connaissance
> préalable de la conversation d'origine n'est nécessaire.
>
> Références : [calibrage-fusion-assertions.md](./calibrage-fusion-assertions.md)
> (les 24 verdicts de Jules qui font office de spécification), et
> `supabase/functions/gemini-proxy/index.ts` (`buildMergePrompt`).

---

## 1. À quoi sert la fusion, et pourquoi la qualité compte

Pendant la phase de vote, les participants soumettent des assertions. Beaucoup
disent des choses voisines. La fusion sert à éliminer les quasi-doublons pour
que les votants ne votent pas trois fois sur la même idée.

**L'enjeu n'est pas cosmétique.** Ces votes alimentent l'analyse en camps (PCA +
k-means, `src/lib/analysis.ts`) qui détermine ensuite la répartition en tables.
Une fusion abusive **efface un clivage réel** de la carte d'opinion : deux
formulations qui auraient reçu des votes différents n'en forment plus qu'une.
Une assertion en double, à l'inverse, coûte quelques secondes aux participants.

D'où la règle directrice retenue au calibrage — **le test du désaccord** :

> Peut-on imaginer une personne de bonne foi qui approuve l'une et refuse
> l'autre ? Si oui, même de justesse, ne pas fusionner.

Le biais par défaut est donc très nettement à la **non-fusion** : sur 24 cas
arbitrés, 19 non-fusion contre 5 fusion.

---

## 2. Chaîne d'appel actuelle

```
LLMModerationPanel / SuperadminScreen   (frontend React)
        │  mergeAssertions(payload)
        ▼
src/lib/gemini.ts                        ← garde-fous déterministes ICI
        │  supabase.functions.invoke('gemini-proxy', { action:'merge', payload })
        ▼
supabase/functions/gemini-proxy/index.ts (Edge Function Deno)
        │  buildMergePrompt() → un seul prompt texte
        │  callGemini() → generateContent, responseMimeType: application/json
        ▼
Gemini 2.5 Flash Lite
        │  tableau JSON [{ keep_id, reject_ids[], merged_content?, reason }]
        ▼
        └─ sanitisation UUID côté Edge Function, puis garde-fous côté client
```

**Règle d'architecture à respecter** (CLAUDE.md) : aucun appel direct à
`api.google.com` depuis le frontend. Tout passe par l'Edge Function, qui porte
la clé `GEMINI_API_KEY` en secret Supabase et valide le JWT de l'appelant.

### Les 3 déclencheurs

| Déclencheur | Emplacement | Quand |
|---|---|---|
| Bouton « Analyser les doublons » | `LLMModerationPanel.handleAnalyzeMerges` | manuel, superadmin |
| Auto-fusion périodique | `LLMModerationPanel`, `setInterval` 1-30 min | si `ai_auto_merge_periodic_<id>` |
| Auto-fusion pré-clustering | `SuperadminScreen`, avant `run_clustering_*` | si `ai_auto_merge_<id>` |

Les trois envoient **toutes les assertions `approved` de la séance en un seul
appel**. C'est le point central de la discussion à venir.

### Ce que fait l'appel, en une phrase

On envoie N assertions et on demande : *« trouve les doublons »*. C'est une
**tâche ouverte** — le modèle doit lui-même décider quoi comparer à quoi, soit
N(N−1)/2 comparaisons implicites.

### Flux aval (acquis, ne pas casser)

1. Gemini **propose**, rien n'est écrit en base (chantier 7). Les propositions
   vivent dans `localStorage` (`merge_proposals_<id>`), snapshot autonome.
2. Le modérateur valide au cas par cas : « garder telle quelle » ou « fusionner
   en formulation combinée » (texte éditable).
3. L'application passe par `apply_assertion_merge` (RPC atomique) qui enregistre
   de quoi **annuler** : contenu d'avant, votes basculés, votes transférés.
4. `revert_assertion_merge` restaure l'état exact, en préservant les votes
   exprimés *après* la fusion.

---

## 3. Le prompt

Structure : rôle → thème/description de séance → **liste des N assertions** →
règle fondamentale (test du désaccord) → typage (PRESCRIPTION / JUGEMENT /
CONSTAT, avec interdiction absolue de fusionner deux types différents) → 7
motifs de blocage (objet, degré, motif, modalité, agent, inclusion partielle,
portée) → 3 familles de fusion autorisée → format JSON attendu.

Version déployée : **v13**. Instructions fixes : 6 823 caractères.

Le détail des 7 motifs et leur justification cas par cas sont dans
[calibrage-fusion-assertions.md](./calibrage-fusion-assertions.md). **Toute
refonte doit continuer à satisfaire ces 24 verdicts** — ils sont la spécification.

---

## 4. Performances mesurées

Trois appels réels (quota Gemini gratuit, partagé et limité — c'est une
contrainte forte, les mesures ci-dessous sont donc précieuses et à ne pas
refaire à la légère).

| # | Prompt | N assertions | Tokens entrée | Tokens sortie | Total |
|---|---|---|---|---|---|
| 1 | v12 | 10 (jeu PUBFUS) | 2 078 | 747 | 2 825 |
| 2 | v13 | **41** (jeu de calibrage) | 3 799 | **3 805** | 7 604 |
| 3 | v13 | 10 (jeu PUBFUS) | 2 283 | 516 | 2 799 |

### Modèle de coût

À partir des deux points v13 (10 → 2 283 et 41 → 3 799) :

```
tokens_entrée ≈ 1 800 + 49 × N
```

- **~1 800 tokens de coût fixe** (instructions + thème/description), payés à
  chaque appel quel que soit N.
- **~49 tokens par assertion**, dont une part notable en UUID (chaque assertion
  est sérialisée `N. [uuid] contenu`).
- Ratio observé en français : **~3,4 caractères par token**.

*Précision méthodologique* : une estimation basée sur le nombre de caractères
donnait ~27 tokens/assertion, la régression sur les deux mesures réelles donne
~49. L'écart vient des longueurs de contenu et de la tokenisation des UUID. La
vraie valeur est dans la fourchette 27–49 ; utiliser 49 comme majorant prudent.

**Les tokens de sortie explosent avec N** : 3 805 tokens de sortie à N=41, soit
plus que l'entrée. Le modèle produit une entrée JSON par fusion, avec un champ
`reason` verbeux. Toute solution doit regarder l'entrée *et* la sortie.

---

## 5. Le mode d'échec : décrochage au-delà de ~30 assertions

C'est le problème à résoudre.

| N | Comportement | Résultat |
|---|---|---|
| 10 | Détection de doublons par paires | 3 entrées, toutes des paires, 2 fusions attendues sur 2 correctes |
| 41 | **Regroupement thématique** | 10 entrées absorbant jusqu'à **9 assertions**, **28 faux positifs** |

À N=41, Gemini a cessé de faire ce qu'on lui demandait et s'est mis à **classer
par thème**. Exemple réel, une seule et même « fusion » proposée :

> « Il faut réduire la publicité » · « Le marketing c'est mal » · « L'État doit
> réglementer la publicité » · « Les marques doivent s'autoréguler »

Deux de ces assertions sont **opposées**. La consigne « ne fusionne jamais plus
de 2 assertions ensemble », présente dans le prompt depuis le chantier 7, est
purement ignorée.

**Le contrôle est net** : le *même* prompt v13 sur 10 assertions ne renvoie que
des paires. La bascule tient au **volume**, pas aux règles. Le calibrage n'est
pas en cause, et le problème **préexistait** — rien dans les versions
antérieures ne l'empêchait, il n'avait simplement jamais été testé à l'échelle
d'une vraie séance.

**Portée pratique** : une séance réelle produit facilement 40 assertions ou plus.
Le décrochage est donc le régime **nominal**, pas un cas limite.

### Garde-fous en place (symptomatiques, pas curatifs)

Dans `src/lib/gemini.ts`, après réponse :

1. **Anti-regroupement** — toute entrée à plus d'un `reject_id` est jetée. Une
   entrée qui regroupe 9 assertions n'est pas un jugement de doublon fiable ; en
   garder une paire au hasard serait deviner.
2. **Anti-inclusion partielle** — `src/lib/mergeGuards.ts`, `isPartialInclusion`,
   14 tests. Bloque en dur quand la plus longue coordonne deux propositions
   (« et », « ainsi que ») et que la courte n'en reprend qu'une. Nécessaire parce
   que le modèle enfreignait ce verdict **même cité mot pour mot** dans le prompt.

Le nombre de propositions écartées est **affiché** dans le panneau, pas masqué.

**Limite assumée** : à grande échelle, le garde-fou n°1 supprime aussi les vraies
fusions. La fonctionnalité devient donc quasi inopérante là où elle servirait le
plus. C'est un filet de sécurité, pas une solution.

---

## 6. Chiffrage des pistes

### Piste A — découper en lots de 30

`ceil(N/30)` appels, chacun repayant les ~1 800 tokens fixes.

| N | 1 seul appel | Lots de 30 | Surcoût entrée |
|---|---|---|---|
| 60 | 4 740 | 6 528 (2 appels) | ×1,38 |
| 90 | 6 210 | 9 792 (3 appels) | ×1,58 |
| 120 | 7 680 | 13 056 (4 appels) | ×1,70 |

**Le surcoût en tokens est borné à ~×2,2** quand N grandit (asymptote
`(1800+49×30)/(49×30)`). Ce n'est donc pas là qu'est le vrai problème.

**Le vrai problème du découpage, c'est le rappel.** Avec un découpage
**aléatoire**, deux doublons ne sont comparés que s'ils tombent dans le même lot.
Probabilité ≈ `29/(N−1)` :

| N | Chance qu'un vrai doublon soit détecté |
|---|---|
| 60 | ~49 % |
| 90 | ~33 % |
| 120 | ~24 % |

On perdrait donc la majorité des fusions légitimes. **Le découpage n'a de sens
que si les lots sont constitués par proximité sémantique** — ce qui ramène à la
piste B. Autrement dit A et B ne sont pas des alternatives : B est ce qui rend A
viable.

### Piste B — enfouissement sémantique pour pré-grouper

Calculer un vecteur par assertion, puis les distances deux à deux (calcul local,
gratuit, N²/2 comparaisons — négligeable pour N ≤ quelques centaines). Deux
usages possibles :

- **B1 — paires candidates** : ne garder que les K paires les plus proches et
  demander à Gemini de trancher **chaque paire** par oui/non. La tâche passe
  d'un regroupement ouvert à une **classification binaire**, ce qui est
  précisément ce qui échoue aujourd'hui. Coût : `1 800 + 49 × 2K`, **constant
  en N**. Avec K=15 : ~3 300 tokens d'entrée, quel que soit le nombre
  d'assertions.
- **B2 — lots cohérents** : constituer les lots de 30 par voisinage sémantique
  plutôt qu'au hasard, ce qui restaure le rappel de la piste A.

**Point de vigilance majeur** : l'enfouissement mesure une proximité
**thématique** — or le mode d'échec actuel est exactement une sur-fusion
thématique. L'enfouissement ne doit donc servir qu'au **rappel** (ratisser
large), jamais à la décision. Prendre K généreusement.

**Travail technique** : le proxy ne connaît aujourd'hui que `generateContent`.
Il faudrait une nouvelle action `embed` dans `gemini-proxy`. Les modèles
d'enfouissement coûtent nettement moins cher que la génération.

### Piste C — pré-filtrage lexical seul : **écartée, mesures à l'appui**

Tentant parce que gratuit et déjà à moitié écrit (`normalize` /
`significantWords` dans `mergeGuards.ts`). **Mais c'est impossible.** Indice de
Jaccard sur les mots porteurs de sens, calculé sur les cas arbitrés :

| Doivent fusionner | Jaccard |
|---|---|
| 3 — « manipule les gens » / « est manipulatrice » | 0,25 |
| 12 — « il faut taxer » / « devrait être taxée » | 0,33 |
| **13 — « la pub, faut arrêter ça » / « il faut mettre fin à la publicité »** | **0,00** |
| 15 — « ne devrait pas être interdite » / « doit rester autorisée » | 0,25 |
| 22 — « je trouve la pub agaçante » / « la pub est agaçante » | 0,67 |

| Ne doivent PAS fusionner | Jaccard |
|---|---|
| 21 — inclusion partielle | 0,67 |
| 8 — périmètre | 0,67 |
| 18 — motif | 0,50 |
| 1 — type | 0,40 |
| 5 — degré | 0,33 |

Le cas 13 partage **zéro mot** avec son doublon validé, tandis que du bruit
monte à 0,67. Il faudrait un seuil ≤ 0,00 pour ne rien rater, c'est-à-dire tout
garder. **Les deux distributions se recouvrent complètement : aucun seuil
lexical ne sépare.** C'est l'argument le plus fort en faveur du sémantique.

### Piste D — supprimer le surcoût des UUID (orthogonale, peu coûteuse)

Les assertions sont sérialisées avec leur UUID complet. Les remplacer par des
index `1..N` remappés côté client réduirait le coût par assertion **et**
supprimerait toute une classe de bugs : Gemini hallucine parfois des UUID
légèrement altérés, ce qui impose aujourd'hui une sanitisation par expression
régulière dans l'Edge Function et un second garde-fou côté client. Compatible
avec n'importe laquelle des pistes ci-dessus.

---

## 7. Contraintes à respecter

- **Quota Gemini gratuit, partagé et limité.** Privilégier les tests simulés ;
  ne consommer de vrais appels que pour des vérifications de bout en bout.
- **Aucun appel direct à `api.google.com`** depuis le frontend : tout via
  `gemini-proxy`. Toute modification du prompt exige un **redéploiement** de
  l'Edge Function pour prendre effet.
- **Les 24 verdicts du calibrage sont la spécification.** Toute refonte doit
  continuer à les satisfaire. Les 14 tests de `mergeGuards.test.ts` en figent
  déjà une partie.
- **Ne pas casser le flux aval** : proposition → validation humaine → RPC
  atomique annulable. La fusion ne doit jamais écrire en base sans validation.
- **Reproductibilité** : le superadmin doit pouvoir relancer une analyse sans
  obtenir un résultat radicalement différent.

---

## 8. Ce qu'il faudrait mesurer en premier

1. **L'enfouissement rattrape-t-il le cas 13 ?** C'est le test décisif de la
   piste B : « la pub, faut arrêter ça » et « il faut mettre fin à la
   publicité » ont zéro mot commun. Si la distance sémantique les classe parmi
   les plus proches, la piste B tient ; sinon elle souffre du même angle mort
   que la piste C.
2. **Où se situe exactement le seuil de décrochage ?** On sait que 10 va bien et
   41 non. Tester 20, 25, 30, 35 bornerait la zone et dirait si un lot de 30 est
   déjà trop grand.
3. **La formulation par paires supprime-t-elle le décrochage ?** Un appel de
   test avec 15 paires explicites, à comparer au même contenu envoyé en vrac.

Le jeu de validation des 41 assertions est reconstructible à partir des 24
paires de [calibrage-fusion-assertions.md](./calibrage-fusion-assertions.md)
(dédupliquer les phrases répétées). Fusions attendues : cas 3, 12, 13, 15, 22.
Tout le reste est un faux positif.
