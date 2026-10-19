# Audit des méthodes : énoncés, camps, catégorisation, carte 2D

**Date : 2026-10-19 · Périmètre : la page de restitution (`viz_unifiee/`) et l'analyse pré-débat de l'appli (`src/lib/analysis.ts`)**

> Complète [`recherche_classification_opinions_2026-07.md`](./recherche_classification_opinions_2026-07.md), qui auditait l'ancienne chaîne Gemini (`analyze_debate.py`). Depuis le 19/10, cette chaîne n'est plus livrée : le présent document audite **ce qui produit réellement la page aujourd'hui**.
>
> Références : **[V]** = vérifiée pendant cette étude (texte ou notice consultés) · **[L]** = littérature établie, à revérifier avant une citation académique.
>
> Les chiffres de la partie 3 sont reproductibles : `audit_tests_2026-10.py` (à côté de ce fichier), lancé depuis `backend/` : `.venv\Scripts\python "..\Visualisation prises de positions\audit_tests_2026-10.py" transcripts`.

---

## 1. Réponse courte

La page combine **deux sources de nature très différentes**, sans que le lecteur puisse les distinguer :

| Ce qui est affiché | Comment c'est produit aujourd'hui | Statut |
|---|---|---|
| **Pré-débat** : carte, camps, consensus/dissensus | Calcul dans l'appli à partir des votes : ACP, puis k-means, puis scores par assertion. Déterministe, rejouable. | **Méthode publiée** (Polis), avec 4 écarts à corriger (§ 4.1) |
| **Transcription** : énoncés repérés | Écrits par l'IA (Claude) en lisant le transcript, fichier `analyse_croisee.json` | **Jugement non validé** |
| **Transcription** : qui est pour/contre chaque énoncé | Écrit par l'IA, mais **chaque prise de position doit pointer sur un passage où la personne parle** (±3 s), sinon la page est refusée | Jugement **traçable**, pas validé |
| **Transcription** : position x/y de chaque voix | **Choisie par l'IA** sur une grille de niveaux décrits (−7,5 à +7,5 par pas de 2,5) | **Jugement non validé, non mesuré** |
| **Transcription** : camps et leurs membres | **Décidés par l'IA** (listes `members`) | **Jugement non validé** ; des « camps » d'une seule personne |
| Consensus/dissensus, temps de parole, polarisation, tension | **Calculés** par le code à partir des éléments ci-dessus | Calcul fiable, **sur des entrées jugées** |

Donc, à votre question « comment être sûr que le plan 2D est la bonne représentation » : **pour le pré-débat, on peut le vérifier et le chiffrer ; pour la transcription, aujourd'hui, on ne peut le vérifier qu'en partie.** La carte des transcriptions est une lecture experte mise en forme, pas une mesure : recoupée avec les prises de position enregistrées, elle concorde pour moitié environ (§ 3.2), le reste n'est pas vérifiable. Les garde-fous existants (ancrage horodaté, refus des prénoms et des citations) garantissent la **provenance** des textes, pas la **justesse** des positions.

Ce document propose de remplacer chaque jugement libre par une méthode publiée, et d'afficher sur la page les chiffres qui disent jusqu'où croire la carte.

---

## 2. Ce que fait chaque brique, en détail

### 2.1 Pré-débat (appli, `src/lib/analysis.ts`)

1. **Matrice votants × assertions** : d'accord = +1, pas d'accord = −1, passe = 0, **absent = 0**, vote blanc = 0 mais non compté comme vote réel. Assertions avec moins de 3 votes réels retirées ; votants avec moins de 1 vote réel retirés.
2. **ACP** (`ml-pca`) sur cette matrice, deux premières composantes = la carte. Les axes n'ont pas de sens en soi ; leurs libellés sur la page (`pre_debate_lecture`) sont **écrits à la main** et la page le signale.
3. **k-means** (k-means++, graine 42) sur les coordonnées 2D, k de 2 à 5, k retenu = meilleure **silhouette**.
4. **Assertions caractéristiques d'un camp** : `(moyenne du camp − moyenne du reste) × nombre de votes du camp`.
5. **Consensus** : plus petite moyenne parmi les camps.

C'est, à quelques écarts près, l'algorithme de **Polis** (Small et al., *Recerca* 2021) **[V]**, utilisé en vTaiwan et dans des centaines de consultations. C'est la brique la plus solide du projet.

### 2.2 Transcription (`build_unified_viz.py`, `build_cross_viz.py`, `build_manual_viz.py`)

Le code **ne décide rien** sur le fond : il lit `analyse_croisee.json` et `<CODE>_analyse_manuelle.json`, écrits par l'IA en lisant le transcript, puis il vérifie et calcule.

- **Énoncés** (`statements`) : phrases rédigées par l'IA pour résumer les points discutés. Aucun protocole ne dit lesquels retenir, ni combien. Rien ne mesure si des points importants ont été oubliés.
- **Prises de position** (`stances`) : `pour` / `contre` / `nuance`, chacune avec un instant `t` qui doit tomber sur un segment de la voix. C'est le meilleur garde-fou existant : on peut **réécouter** chaque prise de position.
- **Positions** (`personas.x/y`) : l'IA choisit un niveau sur chaque axe. Les axes ont des ancres (3 phrases par pôle) et des **niveaux décrits** (`levels`), ce qui rapproche la grille d'une échelle d'évaluation à ancrage comportemental (Smith & Kendall 1963) **[L]**. Mais aucune règle ne relie les positions aux prises de position : elles viennent d'une note de synthèse (`note`) par voix.
- **Changements d'avis** (`shifts`) et **concessions** (déplacement de 20 % vers l'autre, aller-retour) : déclarés par l'IA, ancrés sur un segment ; le 20 % est une convention graphique.
- **Camps** (`groups.members`) : listes décidées par l'IA, avec des arguments rédigés.
- **Calculé** : consensus/dissensus par seuils (≥ 3 voix, ≥ 75 % du même côté), polarisation d'Esteban-Ray (Econometrica 1994) **[L]** sur les positions, temps de parole, temps par sujet.

### 2.3 Ce que l'on ne peut pas savoir aujourd'hui

- Si une autre lecture (un humain, ou la même IA relancée) produirait les mêmes énoncés, les mêmes positions et les mêmes camps.
- Si la carte d'une table est fidèle à ce que les gens ont dit, ou à l'idée que l'IA se fait des courants d'opinion. Les biais politiques des LLM sont documentés (Feng et al. ACL 2023 ; Motoki et al. *Public Choice* 2024) **[L]**, et le placement libre est exactement la tâche où ils s'expriment.
- Si les camps de la transcription correspondent à ceux du pré-débat (les identités ne sont pas reliées, à juste titre).

---

## 3. Mesures faites sur vos débats

### 3.1 Les camps du pré-débat sont-ils réels ?

Deux tests sur les cartes exportées par l'appli (insécurité, capitalisme et écologie) :
- **Test d'absence de structure** : on tire 200 nuages de points de même forme mais **sans aucun groupe** (loi normale de même covariance), on y applique le même k-means, et on regarde quelle silhouette le hasard produit. Principe de la *gap statistic* (Tibshirani, Walther & Hastie, *JRSS-B* 2001) **[L]**.
- **Stabilité** : on rééchantillonne les votants 200 fois et on mesure si les mêmes camps reviennent (indice de Rand ajusté, 1 = identiques, 0 = hasard ; Hennig 2007, *CSDA*) **[L]**.

| Débat | Votants | Variance montrée par la carte | Silhouette des camps publiés | Silhouette du hasard (95e pct) | Stabilité (ARI médian) |
|---|---|---|---|---|---|
| Insécurité | 18 | 24 % + 16 % = **40 %** | 0,53 (k=3) | 0,49 | 0,85 |
| Capitalisme et écologie | 14 | 20 % + 17 % = **36 %** | 0,53 (k=4) | **0,55** | 0,80 |

Lecture :
- **La carte ne montre que 36 à 40 % des différences d'opinion.** Les 60 % restants sont invisibles en 2D. C'est normal (Polis rapporte 22 % + 6 % sur vTaiwan **[V]**), mais la page doit le dire.
- **Insécurité** : les 3 camps se distinguent tout juste du hasard et reviennent de façon assez stable. Défendable, avec prudence.
- **Capitalisme et écologie** : les 4 camps (3 ou 4 personnes chacun) **ne se distinguent pas d'un nuage sans structure**. Le k-means trouve toujours des camps, même quand il n'y en a pas : l'appli ne teste jamais l'hypothèse « un seul groupe ».
- Limite du test : il porte sur la carte 2D exportée, pas sur les votes bruts. Il faudra le refaire dans l'appli sur la matrice complète (§ 4.1).

### 3.2 La carte des transcriptions est-elle cohérente avec ce que les gens ont dit ?

On recalcule une carte **sans jugement** à partir de la seule matrice voix × énoncés (pour = +1, contre = −1, nuance = 0, ACP façon Polis), puis on la compare à la carte placée à la main par **analyse procustéenne** (on tourne, retourne et met à l'échelle une carte pour la superposer à l'autre ; R² = part de la forme commune) **[L]**. On compare à ce que donneraient des positions tirées au hasard.

| Débat | Voix | Énoncés | Cases remplies | Voix utilisables | R² manuel ↔ calculé | R² du hasard (95e pct) | Verdict |
|---|---|---|---|---|---|---|---|
| Héritage | 15 | 18 | 39 % | 15 | **0,60** (distances : ρ = 0,64) | 0,25 | Accord net, partiel |
| Insécurité | 14 | 11 | 36 % | 13 | **0,50** (distances : ρ = 0,55) | 0,26 | Accord net, partiel |
| Capitalisme et écologie | 11 | 7 | 51 % | 10 | 0,36 (distances : ρ = 0,70) | 0,38 | Accord sur les distances, limite sur la forme |

(Les énoncés repris d'une analyse par table, `from_table`, sont résolus comme le fait `build_cross_viz.py`.)

Lecture :
- **La carte manuelle n'est pas arbitraire** : sur les trois débats, elle partage 36 à 60 % de sa forme avec une carte calculée sans jugement, nettement au-dessus du hasard (sauf la forme d'ensemble sur Capitalisme, à la limite, mais les distances entre personnes y concordent bien, ρ = 0,70).
- **Mais 40 à 64 % de la forme ne s'explique pas par les prises de position enregistrées.** Cette part vient des notes de synthèse rédigées par l'IA, c'est-à-dire d'un jugement qu'on ne peut pas recouper. C'est exactement là que se logent les risques de biais.
- Constat de fond : **à l'oral, chacun ne se prononce que sur une partie des sujets** (36 à 51 % de cases remplies, contre presque 100 % dans un vote). Une ACP brute de la transcription est donc fragile ; il faut une méthode faite pour les données lacunaires (§ 4.2).

---

## 4. Recommandations, appuyées sur des méthodes publiées

### 4.1 Pré-débat : s'aligner exactement sur Polis (code, peu coûteux)

Écarts constatés entre `analysis.ts` et la publication de référence (Small et al. 2021, §1.1-1.4) **[V]** :

| # | Aujourd'hui | Polis publié | Effet du changement |
|---|---|---|---|
| 1 | Vote absent = 0 (comme « passe ») | Absent = **moyenne de la colonne** ; passe = 0 | Un absent ne compte plus comme un avis neutre |
| 2 | Aucune correction | Position multipliée par **√(C / Cp)** (C = assertions, Cp = celles votées) | Ceux qui ont peu voté ne s'agglutinent plus au centre |
| 3 | Votant gardé dès 1 vote | Retiré sous **7 votes** (hyperparamètre) | À adapter (≈ 5 sur 16 assertions) : moins de points sans information |
| 4 | Score caractéristique = écart de moyennes × effectif, sans test | P(vote \| camp) = (1 + N_v) / (2 + N), **rapport** camp / reste, **test exact de Fisher** | Une assertion n'est « caractéristique » que si l'écart est significatif |
| 5 | Consensus = plus petite moyenne des camps | **Produit** des P(d'accord \| camp) | Formule publiée, robuste aux petits camps |

À ajouter, hors Polis mais standard :
- **Tester « un seul groupe »** avant d'afficher des camps : silhouette comparée au hasard ou *gap statistic* (Tibshirani 2001) **[L]**. Si le test échoue, afficher « pas de camps nets » plutôt que des camps.
- **Stabilité par rééchantillonnage** des votants (Hennig 2007) **[L]** : afficher « camps nets » / « camps fragiles ».
- **Afficher la variance expliquée** sous la carte : « cette carte montre 40 % des différences d'opinion ».
- **Ne pas passer à t-SNE ou UMAP** pour faire plus joli : ces méthodes déforment les distances entre groupes (Wattenberg et al., *Distill* 2016) **[L]**. ACP (ou MDS) reste le bon choix.

Règle des types de séance : ce calcul sert aussi au **sondage en mode camps** ; il ne concerne pas le sondage en consentement (aucun camp) ni le débat simple (aucun vote).

### 4.2 Transcription : remplacer chaque jugement libre par un protocole

**a. Repérer les énoncés : une liste fixée d'avance, plus une analyse des « points clés »**
- **Priorité : reprendre les assertions du pré-débat comme grille de codage.** C'est du codage déductif (analyse de contenu, Mayring 2014 ; Krippendorff 2018) **[L]** : l'IA ne choisit plus quoi mesurer, elle dit seulement si chaque voix s'est prononcée sur chaque assertion connue. Bonus considérable : la même assertion est mesurée **avant** (vote) et **pendant** (débat), ce qui permet de comparer les deux cartes.
- Pour les points nouveaux, suivre la **Key Point Analysis** d'IBM Project Debater (Bar-Haim et al., ACL 2020 ; EMNLP 2020) **[V]** : extraire des points clés, rattacher chaque prise de parole à un point, et afficher la **couverture** (part des prises de parole rattachées). Le même principe (affirmations extraites, regroupées, chacune reliée à sa source) est celui de *Talk to the City* (AI Objectives Institute, open source) **[V]**.

**b. Coder qui est pour ou contre : mesurer l'accord entre codeurs**
- Garder l'ancrage horodaté (déjà excellent).
- **Double codage** : relancer le codage une seconde fois de façon indépendante (autre formulation de consigne, ou autre modèle), et faire coder par un humain un échantillon de 30 à 50 couples voix × énoncé. Mesurer l'**alpha de Krippendorff** ; seuil usuel : ≥ 0,8 fiable, ≥ 0,667 acceptable pour des conclusions prudentes (Krippendorff 2004) **[L]**. C'est la pratique exigée pour toute annotation par LLM (Törnberg, *Sociologica* 2024 ; Pangakis et al. 2023) **[V/L]**.
- Publier ce chiffre dans le bloc « méthode » de la page.

**c. Placer sur la carte : calculer, ne plus choisir**

Trois méthodes publiées, de la plus simple à la plus robuste :

| Méthode | Principe | Référence | Quand l'utiliser |
|---|---|---|---|
| **ACP « Polis » de la matrice voix × énoncés** | Comme le pré-débat, avec moyenne pour les absents et correction √(C/Cp) | Small et al. 2021 **[V]** | Quand ≥ 40 % des cases sont remplies (grille d'assertions fixée, § a) |
| **Demander et moyenner** | Pour chaque voix et chaque axe, l'IA note un extrait **sans voir les autres voix**, plusieurs fois, et on moyenne ; validé sur tweets de sénateurs et programmes de partis, en plusieurs langues | Le Mens & Gallego, *Political Analysis* 2025 **[V]** ; O'Hagan & Schein 2024 **[V]** | Un axe libellé à l'avance, peu de voix |
| **Comparaisons par paires + Bradley-Terry** | L'IA répond seulement « qui, de A ou de B, est le plus du côté gauche de l'axe ? » pour toutes les paires ; un modèle statistique en déduit une échelle **avec marge d'erreur** | Wu, Nagler, Tucker & Messing 2023 **[V]** (corrélation forte avec DW-NOMINATE) ; Carlson & Montgomery, *APSR* 2017 **[L]** | **Le plus adapté à vos tables** : 10-15 voix = 45 à 105 paires, réponses faciles, biais d'échelle neutralisé |

Pour la recherche d'axes elle-même, la référence pour la parole politique est **Wordshoal** (Lauderdale & Herzog, *Political Analysis* 2016) **[V]** : positions estimées débat par débat puis combinées. Il faut beaucoup plus de texte qu'une table ; utile seulement si vous accumulez des dizaines de débats.

Dans tous les cas : **chaque point porte une incertitude** (ellipse ou trait), calculée en rééchantillonnant les prises de parole. Une voix qui a peu parlé apparaît floue au lieu d'être placée avec une fausse précision.

**d. Camps : les calculer et les tester**
- Camps calculés sur les positions (même k-means + silhouette que le pré-débat, ou classification hiérarchique de Ward **[L]**), avec le **test « un seul groupe »** et la stabilité du § 4.1.
- **Pas de camp d'une personne** : une voix isolée s'affiche comme telle (aujourd'hui, chacun des 3 débats a un « camp » d'un seul membre).
- L'IA ne fait plus que **nommer** les camps calculés et rédiger leurs arguments, à partir de leurs assertions caractéristiques, comme dans l'appli.

**e. Mouvements pendant le débat**
- Garder la règle « pas de déplacement sans changement d'avis observable ».
- Remplacer le « 20 % vers l'autre » par un recodage de la voix sur la grille **après** la concession (on mesure le point d'arrivée, on ne l'impose pas).

### 4.3 Comment savoir si une carte est « la bonne » : cinq critères à afficher

Il n'existe pas de carte vraie : une carte 2D est une **projection** qui perd forcément de l'information. On peut en revanche dire jusqu'où la croire. Cinq critères, chacun calculable :

1. **Fidélité** : part de la variance montrée (ACP) ou *stress* (MDS, Kruskal 1964) **[L]**. « Cette carte montre 40 % des différences. »
2. **Stabilité** : les positions et les camps reviennent-ils si l'on retire quelques personnes ou quelques assertions ? (§ 3.1)
3. **Validité convergente** : deux méthodes indépendantes donnent-elles la même carte ? (procuste, § 3.2). Pour la transcription : ACP des prises de position contre comparaisons par paires.
4. **Lisibilité des axes** : chaque axe est décrit par les assertions qui le portent le plus (poids de l'ACP), pas par une étiquette rédigée librement. La lecture humaine reste possible, mais présentée comme telle (c'est déjà le cas au pré-débat).
5. **Validité prédictive** : la position d'une personne permet-elle de deviner son vote sur une assertion cachée ? C'est le test des modèles de points idéaux (Poole & Rosenthal, NOMINATE ; Clinton, Jackman & Rivers, *APSR* 2004) **[L]**.

### 4.4 Rendre la démarche lisible sur la page

Un bloc « Comment cette carte est faite », court, avec :
- la méthode en une phrase et sa référence (« même calcul que Polis, utilisé à Taïwan ») ;
- les chiffres : variance montrée, camps nets ou fragiles, accord entre codeurs ;
- pour la transcription, au clic sur un énoncé : les passages horodatés qui le fondent (déjà disponibles, aujourd'hui seulement dans le débat en mouvement).

Ce qui est jugement (titres des camps, libellés d'axes, résumés) reste signalé comme lecture.

---

## 5. Ordre de mise en œuvre proposé

| Étape | Contenu | Coût | Gain |
|---|---|---|---|
| 1 | Pré-débat : écarts Polis 1 à 5, variance affichée | ½ à 1 jour, appli | La brique déjà solide devient conforme à sa référence |
| 2 | Test « un seul groupe » + stabilité, dans l'appli et dans la page | 1 jour | Plus de camps affichés quand il n'y en a pas |
| 3 | Transcription : grille = assertions du pré-débat, codage pour/contre/nuance/silence avec ancrage | 1 jour + relecture | L'IA ne choisit plus quoi mesurer ; avant/pendant comparables |
| 4 | Double codage + échantillon humain + alpha de Krippendorff | ½ journée de codage humain par débat | Un chiffre de fiabilité publiable |
| 5 | Carte des transcriptions par comparaisons par paires (Bradley-Terry) avec incertitude, validée contre l'ACP | 1 à 2 jours | La carte devient une mesure, avec marge d'erreur |
| 6 | Camps calculés et testés ; l'IA ne fait plus que les nommer | ½ jour | Fin des camps décidés à la main |
| 7 | Bloc « Comment cette carte est faite » | ½ jour | Traçabilité pour le lecteur |

Les étapes 1-2 touchent l'appli (chantier à déclarer dans `docs/chantiers-a-faire.md`, partir de `dev`). Les étapes 3-7 touchent `transcription-debat/` seulement.

---

## 6. Mise en œuvre côté transcription (2026-10-19)

À la demande de l'utilisateur, **seule la transcription** a été modifiée ; le pré-débat (appli et lecture de son export) est inchangé, données comprises (vérifié : bloc `pre_debate` identique avant/après sur les trois pages).

Fait (`backend/code python/opinion_math.py`, branché dans `build_unified_viz.py`, détail dans `transcription-debat/CLAUDE.md` § Calcul des opinions) :
- § 4.2 c : carte calculée par l'ACP de Polis sur la matrice voix × énoncés (imputation par la moyenne, √(C/Cp), seuil de 3 prises de position), trajectoires recalculées à chaque prise de position, plus de « penchant » de concession ;
- § 4.2 d : camps calculés (k-moyennes + silhouette), affichés seulement s'ils battent le test d'absence de structure, jamais d'une seule personne, stabilité affichée ; l'IA ne fait plus que les nommer (`transcription_lecture`, garde de taille) ;
- énoncés caractéristiques et consensus selon les formules de Polis (§ 4.1, appliquées à la transcription) ;
- § 4.2 b : alpha de Krippendorff calculé dès qu'un second relevé (`codage_double`) est fourni ;
- § 4.3-4.4 : variance montrée, test des camps, stabilité, concordance avec la lecture et fiabilité du relevé affichés sur la page.

Résultat sur les trois débats : **aucun camp net** (§ 3.2 confirmé avec la méthode complète). Restent à faire : le relevé sur une grille d'énoncés fixée d'avance (§ 4.2 a), le double codage réel d'au moins un débat (§ 4.2 b), et les comparaisons par paires (Bradley-Terry, § 4.2 c), qui demandent de nouveaux appels à un modèle de langue.

### Décision du 2026-10-19 (après mise en œuvre)

L'utilisateur a demandé des camps délimités « comme dans le pré-vote » : le test du hasard ne masque plus les camps, il reste calculable pour l'audit (`camps(..., test=True)`). Résultat de ce test sur les camps affichés : Héritage 12 + 3 voix (silhouette 0,53 contre 0,57 au hasard, stabilité 0,72), insécurité 9 + 1 (0,54 contre 0,58, stabilité 0,52), capitalisme 5 + 4 (0,36 contre 0,58, stabilité 0,24). Ces camps sont donc des tendances de lecture, pas des groupes statistiquement établis : c'est aussi le cas des camps du pré-vote de l'appli, calculés par la même règle. La page n'affiche plus aucune explication de méthode ; les indicateurs restent dans `unifiee.json` (`method`). Les cartes portent leurs libellés d'axes et de coins, écrits à partir des énoncés qui pèsent le plus sur chaque axe.

## Références

**Vérifiées [V]**
- Small, Bjorkegren, Erkkilä, Shaw & Megill, *Polis: Scaling Deliberation by Mapping High Dimensional Opinion Spaces*, Recerca 26(2), 2021 — méthode lue dans le texte (§1.1-1.4). https://gwern.net/doc/sociology/2021-small.pdf
- Le Mens & Gallego, *Positioning Political Texts with Large Language Models by Asking and Averaging*, Political Analysis 33, 2025, doi:10.1017/pan.2024.29. https://arxiv.org/abs/2311.16639
- Wu, Nagler, Tucker & Messing, *Large Language Models Can Be Used to Estimate the Latent Positions of Politicians*, arXiv 2303.12057, 2023. https://arxiv.org/abs/2303.12057
- O'Hagan & Schein, *Measurement in the Age of LLMs: An Application to Ideological Scaling*, arXiv 2312.09203, 2024. https://arxiv.org/abs/2312.09203
- Lauderdale & Herzog, *Measuring Political Positions from Legislative Speech*, Political Analysis 24(3), 2016. https://quanteda.io/reference/textmodel_wordshoal.html
- Bar-Haim et al., *From Arguments to Key Points*, ACL 2020 ; *Quantitative Argument Summarization and Beyond*, EMNLP 2020 ; *Project Debater APIs*, EMNLP 2021 demo. https://arxiv.org/abs/2110.01029
- Törnberg, *Best Practices for Text Annotation with Large Language Models*, Sociologica 18(2), 2024. https://sociologica.unibo.it/article/view/19461
- Tessler et al., *AI can help humans find common ground in democratic deliberation* (Habermas Machine), Science 386, 2024 — exemple de médiation IA évaluée sur 5 700 participants.
- Talk to the City, AI Objectives Institute (open source). https://civictech.guide/listing/talk-to-the-city
- Wojcik et al., *Birdwatch: Crowd Wisdom and Bridging Algorithms*, arXiv 2210.15723, 2022 — « bridging » : retenir ce qui plaît au-delà des camps, alternative au consensus par seuils. https://arxiv.org/abs/2210.15723

**Littérature établie, à revérifier avant citation [L]**
Rousseeuw (silhouette), J. Comput. Appl. Math. 1987 · Tibshirani, Walther & Hastie (gap statistic), JRSS-B 2001 · Hennig (stabilité par bootstrap), CSDA 2007 · Hubert & Arabie (ARI), J. Classification 1985 · Gower (analyse procustéenne), Psychometrika 1975 · Kruskal (MDS, stress), Psychometrika 1964 · Wattenberg, Viégas & Johnson, *How to Use t-SNE Effectively*, Distill 2016 · Krippendorff, *Content Analysis*, 2004/2018 · Mayring, *Qualitative Content Analysis*, 2014 · Carlson & Montgomery, APSR 2017 · Poole & Rosenthal (NOMINATE) · Clinton, Jackman & Rivers, APSR 2004 · Smith & Kendall (échelles à ancrage comportemental), J. Applied Psych. 1963 · Esteban & Ray, Econometrica 1994 · Feng et al., ACL 2023 · Motoki et al., Public Choice 2024 · Pangakis et al. 2023.
