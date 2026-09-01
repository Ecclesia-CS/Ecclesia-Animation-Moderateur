# Calibrage de la fusion des assertions

> Arbitrages de Jules, session du 2026-07-28 (chantier 18 / F23).
> Ce fichier est la **référence** du prompt de fusion (`buildMergePrompt` dans
> `supabase/functions/gemini-proxy/index.ts`). Toute modification du prompt doit
> rester compatible avec les 24 verdicts ci-dessous — ils font office de tests de
> non-régression. Ne pas modifier un verdict sans validation explicite de Jules.

## La règle de tête : le test du désaccord

Un seul critère résume les 24 arbitrages :

> **Peut-on imaginer une personne de bonne foi qui approuve l'une et refuse l'autre ?**
> Si oui — même de justesse — **ne pas fusionner**.

C'est la formulation qui est passée en tête du prompt. Le reste (typage, motifs de
blocage) n'en est que la déclinaison opérationnelle, destinée à rendre le critère
applicable par un modèle qui, sans garde-fous explicites, sur-fusionne.

Rappel du contexte qui justifie cette sévérité : les assertions sont **soumises au
vote**, et ces votes alimentent l'analyse des camps. Deux formulations susceptibles
de recevoir des votes différents doivent rester séparées, sans quoi on efface un
clivage réel. Une assertion en double coûte quelques secondes aux participants ;
une fusion abusive fausse la carte d'opinion de toute la séance.

## Bilan

**19 « ne pas fusionner » / 5 « fusionner »** sur 24 cas. Le biais par défaut est
donc très nettement à la non-fusion.

## Les 5 seuls cas où la fusion est autorisée

| # | A | B | Motif |
|---|---|---|---|
| 3 | La publicité manipule les gens | La publicité est manipulatrice | Reformulation pure (verbe ↔ adjectif) |
| 12 | Il faut taxer la publicité | La publicité devrait être taxée | Reformulation pure (actif ↔ passif) |
| 13 | La pub, faut arrêter ça | Il faut mettre fin à la publicité | Reformulation pure (registre familier ↔ soutenu) |
| 15 | La publicité ne devrait pas être interdite | La publicité doit rester autorisée | Équivalence logique stricte (double négation) |
| 22 | Je trouve la publicité agaçante | La publicité est agaçante | Cadrage personnel ↔ général, prédicat identique |

## Les 19 cas de non-fusion

| # | A | B | Motif de blocage |
|---|---|---|---|
| 1 | Il faut interdire la publicité | Interdire la publicité serait une bonne chose | **Type** — un jugement *sur* une action reste un jugement. On peut trouver une mesure souhaitable sans vouloir l'imposer à ceux qui n'en veulent pas. |
| 2 | La publicité est un problème | Il faut faire quelque chose contre la publicité | **Type** — un problème constaté n'est pas une demande d'action |
| 4 | La publicité nous pousse à surconsommer | La publicité est responsable de la surconsommation | **Degré** — contribuer n'est pas être la cause principale |
| 5 | Il faut réduire la publicité | Il faut supprimer la publicité | **Degré** |
| 6 | Il faut fortement limiter la publicité | Il faut réduire la publicité | **Degré** (écart plus fin que le 5, mais bloquant) |
| 7 | La publicité c'est mal | La publicité est une catastrophe pour la société | **Degré** — intensité du jugement |
| 8 | Il faut interdire la publicité | Il faut interdire la publicité ciblée | **Objet** — ensemble vs partie |
| 9 | Il faut interdire la publicité | Il faut interdire la publicité dans l'espace public | **Objet** — restriction de lieu |
| 10 | La publicité c'est mal | Le marketing c'est mal | **Objet** — marketing ⊃ publicité (prix, distribution, études…), pas synonymes |
| 11 | Il faut interdire la publicité pour les enfants | …pendant les programmes jeunesse | **Objet** — deux périmètres techniques distincts |
| 14 | Il faut interdire la publicité | On pourrait envisager d'interdire la publicité | **Modalité** — obligation vs possibilité |
| 16 | La publicité n'est pas si nocive qu'on le dit | La publicité est utile | **Réfutation ≠ affirmation positive** |
| 17 | …pour protéger les enfants | …pour lutter contre la surconsommation | **Motif** — même action, raisons différentes ; deux personnes peuvent vouloir la même mesure pour des motifs opposés |
| 18 | Il faut réglementer la publicité | Il faut réglementer la publicité car elle est mensongère | **Motif** — présent d'un seul côté. Assumé comme frustrant : faire mieux supposerait de séparer chaque assertion de sa cause et de refaire voter, « on n'en sortirait pas ». |
| 19 | L'État doit réglementer la publicité | Les marques doivent s'autoréguler | **Agent** |
| 20 | L'État doit réglementer la publicité | Il faut réglementer la publicité | **Agent** — implicite vs explicite. Cas discuté : réglementer passe de fait par l'État, donc la fusion se défendrait. Tranché en non-fusion pour la **reproductibilité** — faire dépendre la décision d'une connaissance du monde (« cet agent est-il le seul possible ? ») rendrait le résultat instable d'un appel à l'autre. |
| 21 | La publicité est envahissante et manipulatrice | La publicité est envahissante | **Inclusion partielle** |
| 23 | La publicité finance les médias | Sans publicité, beaucoup de journaux disparaîtraient | **Portée** — les journaux ne sont pas tous les médias, et un autre modèle de financement reste imaginable. (Écarté comme « contraposée » après discussion : ce n'en est pas une.) |
| 24 | La publicité crée des emplois | La publicité fait vivre tout un secteur économique | **Portée** |

## Les 7 motifs de blocage encodés dans le prompt

1. **Objet** — étendue exactement identique ; ni hyperonyme/hyponyme, ni ensemble/partie
2. **Degré** — toute différence d'intensité, y compris causale
3. **Motif** — cause, but ou justification présente d'un seul côté, ou différente
4. **Modalité** — obligation ≠ possibilité
5. **Agent** — y compris implicite vs explicite
6. **Inclusion partielle** — l'une dit tout ce que dit l'autre *plus* quelque chose
7. **Portée d'un constat** — objet, mécanisme ou ampleur différents

Plus trois cas particuliers : réfutation ≠ affirmation positive · problème constaté
≠ demande d'action · deux actions différentes dans le même sens restent distinctes.

## Conséquence sur le cas laissé en suspens au chantier 18

La paire CONSTAT « La publicité permet de générer des revenus **et** de financer des
projets » / « La pub permet de financer des projets », que Gemini fusionnait encore
en v12 et que j'avais laissée à l'arbitrage, est **tranchée en non-fusion** par le
verdict 21 (inclusion partielle). Elle figure désormais comme contre-exemple
explicite dans le prompt.

## ⚠️ Découverte de la validation : Gemini décroche à grande échelle

La validation du prompt calibré a été faite sur un jeu de **41 assertions**
couvrant les 24 cas. Résultat : **3 fusions correctes sur 5 attendues, et 28
faux positifs**. Le mode d'échec n'est pas une erreur de jugement au cas par
cas, c'est un **changement de tâche** : au lieu de chercher des quasi-doublons
deux à deux, Gemini s'est mis à **regrouper par thème**, renvoyant des entrées
absorbant jusqu'à 9 assertions d'un coup — « Il faut réduire la publicité »
avec « Le marketing c'est mal », « L'État doit réglementer la publicité » et
« Les marques doivent s'autoréguler ». La consigne « ne fusionne jamais plus de
2 assertions ensemble », pourtant présente depuis le chantier 7, est purement
et simplement ignorée.

**Contrôle décisif** : le même prompt v13, sur les 10 assertions du jeu PUBFUS,
renvoie 3 entrées, **toutes des paires**, sans aucun regroupement. La bascule se
joue donc sur le **volume**, pas sur les règles du prompt — le calibrage n'est
pas en cause.

**Second problème, révélé par ce même contrôle** : à 10 assertions, v13 fusionne
toujours « La publicité permet de générer des revenus **et** de financer des
projets » avec « La pub permet de financer des projets », alors que cette paire
exacte est citée **mot pour mot** dans le prompt comme contre-exemple du motif
de blocage n°6 (inclusion partielle). Le modèle passe donc outre un
contre-exemple verbatim. C'est le seul faux positif à cette échelle (2 fusions
attendues sur 2 par ailleurs correctes). Enseignement : sur ce point précis, un
contre-exemple textuel ne suffit pas — l'inclusion partielle demanderait une
vérification déterministe côté client (si le contenu de l'une est inclus dans
celui de l'autre à quelques mots près, refuser la fusion sans consulter le
modèle), plutôt qu'une consigne supplémentaire.

**Conséquence pour la production** : `handleAnalyzeMerges` envoie *toutes* les
assertions approuvées de la séance en un seul appel. Une séance réelle en
compte facilement 40 ou plus — le mode dégradé décrit ci-dessus est donc un
risque **réel**, et il préexistait au calibrage (rien dans le prompt v12 ne
l'empêchait ; il n'avait simplement jamais été testé à cette échelle).

**Garde-fou déployé** (`src/lib/gemini.ts`) : toute proposition comportant plus
d'un `reject_id` est jetée, avec un avertissement en console. Une entrée qui
regroupe 9 assertions n'est pas un jugement de quasi-doublon fiable ; en garder
une paire au hasard serait deviner. Sans effet sur les appels à faible volume.

**Ce garde-fou traite le symptôme, pas la cause.** À grande échelle il ne
supprime pas seulement les faux positifs mais aussi les vraies fusions, donc la
fonctionnalité devient silencieusement inopérante là où elle servirait le plus.

**Décision de Jules (2026-07-28) : on garde l'architecture d'appel actuelle** —
envoyer toutes les assertions approuvées en un seul appel — parce qu'observer
cette capacité de fusion en conditions réelles a de la valeur en soi. En
contrepartie, ce que les garde-fous écartent est **affiché dans le panneau**
(« N regroupement(s) de plus de 2 assertions écarté(s) automatiquement ») et non
filtré en silence : sur une séance chargée, c'est le signal que Gemini a
décroché. Sans cet affichage, « aucun doublon détecté » laisserait croire à une
liste propre.

**Garde-fou n°2 — inclusion partielle** (`src/lib/mergeGuards.ts`,
`isPartialInclusion`) : vérification déterministe, sans appel réseau, testée par
14 tests de non-régression bâtis sur les verdicts ci-dessus. Elle bloque une
fusion quand la plus longue des deux assertions **coordonne** deux propositions
(« et », « ainsi que ») et que la plus courte n'en reprend qu'une, tout le
supplément tenant dans le segment laissé de côté. Volontairement **étroite** :
une règle plus large (« tout mot de contenu en trop bloque ») casserait des
fusions validées — « La publicité manipule les gens » = « La publicité est
manipulatrice » serait bloquée à cause de « gens », et « Je trouve la publicité
agaçante » = « La publicité est agaçante » à cause de « trouve ». Mieux vaut
rater un cas que bloquer une fusion légitime.

**Correction de fond, écartée pour l'instant — présélection des paires candidates** : au
lieu d'envoyer N assertions et de demander « trouve les doublons » (tâche
ouverte, qui dégénère en clustering), présélectionner côté client les paires
lexicalement proches (recouvrement de mots / similarité cosinus sur les
contenus), n'en garder qu'une quinzaine, et demander à Gemini de trancher
**chaque paire** par oui/non. La tâche passe d'un regroupement ouvert à une
classification binaire, beaucoup plus fiable — et l'appel devient plus court
donc moins coûteux. Décision à prendre par Jules : ce n'est plus du calibrage
de prompt mais un changement d'architecture de l'appel.

## Reste à calibrer — série B2, gradient d'intensité

**Le problème** : les verdicts 5, 6 et 7 posent que *toute* différence
d'intensité bloque, mais « La publicité c'est mal » = « La communication
publicitaire, c'est pas bien » est une fusion validée — et c'est *aussi* une
différence d'intensité. Le prompt contient donc une règle absolue assortie d'une
exception, sans critère pour les départager. La frontière entre « synonymie de
registre » et « écart d'intensité » n'est pas tracée.

**Statut : volontairement laissé ouvert** (décision du 2026-07-29). Motifs :
- Aucune erreur d'intensité n'a été observée sur les deux tests réels. Le prompt
  v13 fusionne « c'est mal » / « c'est pas bien » et rien d'autre sur cet axe :
  le comportement mesuré est déjà conforme aux verdicts. La contradiction est
  logique, pas manifeste.
- Le mode d'échec réellement coûteux est ailleurs (regroupement thématique à
  grande échelle : 28 faux positifs).
- Calibrer sur des échelles fabriquées à l'avance reproduirait l'erreur du
  chantier 7, dont le contre-exemple inventé (« c'est mal » ≠ « c'est pas bien »)
  a été renversé dès le premier arbitrage réel. Les vraies paires d'intensité
  viendront des séances.

**Jeu prêt à arbitrer** — pour chaque échelle, indiquer quelles paires
**adjacentes** fusionnent (ex. « échelle 1 : seules 2-3 »), et signaler tout
couple non adjacent jugé fusionnable.

*Échelle 1 — prescriptions, de la plus faible à la plus forte*
1. Il faudrait un peu moins de publicité
2. Il faut réduire la publicité
3. Il faut diminuer la publicité
4. Il faut fortement limiter la publicité
5. Il faut réduire drastiquement la publicité
6. Il faut interdire la publicité
7. Il faut supprimer totalement la publicité

*Échelle 2 — jugements* (2 = 3 est déjà acquis et sert de repère bas)
1. La publicité, c'est pas terrible
2. La publicité, c'est pas bien
3. La publicité c'est mal
4. La publicité est nuisible
5. La publicité est très nocive
6. La publicité est un fléau
7. La publicité est une catastrophe pour la société
8. La publicité est le plus grand mal du 21e siècle

*Échelle 3 — quantificateurs* (axe distinct : fréquence, pas intensité)
1. La publicité est parfois mensongère
2. La publicité est souvent mensongère
3. La publicité est généralement mensongère
4. La publicité est toujours mensongère

*Échelle 4 — force déontique* (le verdict 14 a tranché « il faut » ≠ « on
pourrait envisager » ; reste le milieu)
1. On pourrait réduire la publicité
2. On devrait réduire la publicité
3. Il faut réduire la publicité
4. Il est urgent de réduire la publicité

**Les deux réponses les plus structurantes** : échelle 1, paire 6-7 (interdire
vs supprimer totalement — même action ou pas ?) et échelle 4, paire 2-3 (« on
devrait » vs « il faut »). Elles décident si l'axe déontique se traite comme
l'axe d'intensité ou séparément.

## Coût du prompt (mesuré, v12)

Un appel de fusion contient **toutes** les assertions approuvées de la séance.

| Composant | Caractères | Tokens |
|---|---|---|
| Instructions fixes | 5 983 | ~1 755 |
| Titre + description | 183 | ~54 |
| 10 assertions | 919 | ~269 |
| **Total mesuré** | **7 085** | **2 078** |

Ratio observé : 3,41 caractères/token en français. Coût marginal ~27 tokens par
assertion, dont ~11 pour l'UUID seul. Le coût est dominé par les instructions
fixes : allonger le prompt pour gagner en précision est peu coûteux.

**Piste d'optimisation non retenue à ce stade** : remplacer les UUID par des index
`1..N` remappés côté client économiserait ~40 % du coût par assertion *et*
supprimerait la classe de bugs « Gemini hallucine un UUID » qui impose aujourd'hui
une sanitisation côté Edge Function.
