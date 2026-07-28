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

## Reste à calibrer

- **Gradient d'intensité (série B2)** — les verdicts 5, 6 et 7 posent que toute
  différence d'intensité bloque, mais la frontière avec la simple synonymie n'est
  pas tracée : « c'est mal » = « c'est pas bien » a été validé comme fusion alors
  que « c'est mal » ≠ « c'est une catastrophe » bloque. Un jeu dédié reste à
  arbitrer (voir la proposition en fin de session).

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
