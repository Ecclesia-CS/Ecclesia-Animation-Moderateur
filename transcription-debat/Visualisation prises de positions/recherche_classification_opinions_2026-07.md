# Classification et analyse d'opinions dans les transcripts de débats — état de l'art et implémentabilité

**Date : juillet 2026 · Contexte : pipeline Ecclesia (Whisper → anonymisation → scoring Gemini → dashboard)**

> Conventions de fiabilité des références : **[W]** = vérifié par recherche web pendant cette étude · **[T]** = connaissance issue de la littérature établie, référence à re-vérifier avant citation académique. Les chiffres de performance sont donnés tels que rapportés par leurs auteurs ; les ordres de grandeur incertains sont signalés par « ~ ».

---

## Axe 1 — Stance detection (détection de position)

### 1.1 Définitions et frontières

La **stance detection** classe l'attitude d'un texte **envers une cible donnée** (favor / against / neutral), là où la **sentiment analysis** mesure la polarité affective du texte lui-même. La distinction est empiriquement établie : Mohammad et al. ont montré qu'un texte au ton neutre ou même positif peut porter une position tranchée contre la cible, et que les features de sentiment seules sont insuffisantes pour prédire la stance [T : Mohammad et al., *Stance and Sentiment in Tweets*, ACM TOIT 2017]. L'**opinion mining** est un terme parapluie plus ancien centré sur les aspects (produit → caractéristiques) ; l'**argument mining** (axe 3) s'intéresse à la *structure* justificative, pas à la direction de la position.

Deux surveys de référence structurent le champ : Küçük & Can (ACM Computing Surveys, 2020) [T] et ALDayel & Magdy (IP&M, 2021) [T]. Pour l'ère LLM, un survey dédié couvre 2019 → avril 2025 : *Large Language Models Meet Stance Detection* (arXiv 2505.08464, prépublication) **[W]**.

### 1.2 Approches et performances chiffrées

**Classiques (2016-2018).** SVM sur n-grammes + lexiques : le meilleur système de SemEval-2016 Task 6 (MITRE) atteignait ~67,8 de F1 moyen [T]. Plafond rapide : ces modèles ne généralisent pas hors des cibles vues à l'entraînement.

**Fine-tuning transformers (2019-2023).** BERT/RoBERTa/BERTweet fine-tunés : ~75-77 macro-F1 sur SemEval-2016 T6, ~80-84 sur P-Stance selon les configurations [T]. DeBERTa apporte 1-3 points supplémentaires sur la plupart des tâches de classification [T]. Coût : quelques milliers d'exemples annotés par cible ou domaine, GPU d'entraînement modeste (une carte grand public suffit).

**Zero-shot / few-shot LLM (2023-2026).** Résultat central pour ton projet : le zero-shot bien fait **égale ou dépasse le fine-tuning supervisé** sur les bancs d'essai canoniques. FlanT5-XXL (11B, open source) atteint **76,2 macro-F1 sur SemEval-2016 T6 et 82,9 sur P-Stance sans aucun exemple annoté du domaine** (Benchmarking zero-shot stance detection with FlanT5-XXL, arXiv 2403.00236, version étendue publiée dans PeerJ Computer Science 2025) **[W]**. Chae & Davidson (2025) comparent 10 modèles sur les régimes zero-shot / few-shot / fine-tuné et confirment la compétitivité du zero-shot des grands LLM **[W]**. Une voie intermédiaire éprouvée en science politique : les classifieurs **NLI universels** (DeBERTa-v3 entraîné sur MNLI+, utilisé en « entailment » : « ce texte est favorable à X ») — Laurer et al., *Less Annotating, More Classifying*, Political Analysis 2024 [T] ; Burnham, *Stance Detection: A Practical Guide*, 2024 [T].

**Multi-cibles et multi-locuteurs.** Datasets : Multi-Target Stance (Sobhani et al., EACL 2017) [T] ; VAST (Allaway & McKeown, EMNLP 2020) pour la stance **zero-shot sur des milliers de cibles ouvertes** [T] — le plus proche de ton cas (cibles = axes propres à chaque débat). Pour les fils conversationnels : RumourEval (SemEval 2017/2019) avec le schéma SDQC (support/deny/query/comment) [T]. La stance conversationnelle multi-locuteurs reste nettement moins mature que la stance sur textes isolés ; les travaux récents exploitent le contexte du fil (arXiv 2211.03061) **[W]**.

### 1.3 Corpus français

C'est le point faible du domaine, très anglophone :

| Corpus | Contenu | Schéma | Référence |
|---|---|---|---|
| **French Tweet Corpus for Automatic Stance Detection** | tweets FR (été 2018), premier corpus stance FR librement disponible | SDQC + ignore (5 classes) | Evrard et al., LREC 2020 **[W]** |
| **Corpus Macron/Le Pen 2017** (multilingue FR/IT) | tweets présidentielle 2017, cibles = candidats | favor/against/none | Lai et al., Computer Speech & Language 2020 **[W]** |
| **X-Stance** | questions politiques suisses, dont **~17k exemples en français**, cibles multiples | favor/against | Vamvas & Sennrich, SwissText 2020 [T] |
| DEFT (campagnes d'évaluation FR) | sentiment/opinion sur tweets FR (DEFT 2015/2017) | polarité | [T] |

**Limites méthodologiques communes** : tweets courts (≠ tours de parole de débat oral de 30-200 mots), cibles figées, annotation parfois faiblement accordée (κ rarement publié > 0,7), et aucun corpus français de stance sur **débats oraux transcrits** — ton terrain est vierge dans la littérature FR.

### 1.4 Tableau comparatif

| Approche | Complexité impl. | Données requises | Coût calcul | Perf. rapportée | Validé sur politique ? |
|---|---|---|---|---|---|
| SVM + features | faible | 2-10k annotés/cible | négligeable | ~65-68 F1 (SemEval) | oui (2016) |
| BERT/CamemBERT fine-tuné | moyenne | 1-5k annotés | GPU, heures | ~75-84 F1 | oui (EN) ; FR : peu |
| NLI universel (DeBERTa-MNLI) | faible | 0 (zéro-shot) | CPU/GPU léger | ~70-78 F1 selon cible | oui (science po.) |
| LLM zero-shot (FlanT5-XXL, GPT/Gemini) | très faible | 0 | API ou 1 GPU 24 Go | **76-83 F1** = SOTA | oui **[W]** |
| LLM few-shot + CoT | faible | 5-20 exemples | API | +1-4 pts vs zero-shot [T] | partiel |

### 1.5 Recommandation

Pour un projet individuel : **LLM zero-shot avec sortie structurée** (ton choix actuel) est aujourd'hui l'option validée au meilleur rapport gain/coût — la littérature 2024-2025 la place au niveau du fine-tuning sans exiger de corpus annoté français qui, de toute façon, n'existe pas pour ton domaine. Le fine-tuning ne se justifierait que si tu constituais ≥ 1-2k blocs annotés à la main et voulais l'indépendance vis-à-vis des API. **Nuance importante** : la littérature valide la stance **catégorielle ou ordinale** (favor/against/none, éventuellement ±2) ; le placement **continu** sur un axe -10..+10 tel que tu le pratiques n'est *pas* une tâche validée en tant que telle (voir synthèse, §8.3).

---

## Axe 2 — Sentiment analysis appliquée aux discours politiques

### 2.1 Le problème structurel

Sur du discours argumentatif, le sentiment mesure le mauvais objet : un intervenant peut défendre calmement une position radicale (sentiment neutre, stance forte) ou s'indigner en étant d'accord (sentiment négatif, stance favorable). C'est documenté depuis Mohammad et al. 2017 [T] et c'est la raison pour laquelle la stance detection s'est constituée en tâche distincte. Le sentiment reste utile pour un objet différent : **l'intensité affective / la température de l'échange** — ce que ta « frise de tension » approxime déjà par LLM.

### 2.2 Modèles français disponibles

- **CamemBERT** (Martin et al., ACL 2020) et **FlauBERT** (Le et al., LREC 2020) [T] : encodeurs de référence ; CamemBERT 2.0 (2024) rafraîchit les données [T].
- Fine-tunés sentiment publics (ex. `tblard/tf-allocine`, entraîné sur ~200k critiques Allociné, ~97 % acc.) [T] : performance **non transférable** au discours politique — le domaine d'entraînement (critiques de films) est éloigné ; la dégradation hors-domaine des classifieurs de sentiment est un phénomène bien documenté [T], mais je n'ai pas trouvé d'évaluation chiffrée publiée de ces modèles sur corpus politique FR : considère toute performance sur tes données comme inconnue a priori.
- Les campagnes DEFT ont produit des systèmes de sentiment sur tweets FR politiques (~60-70 macro-F1 à l'époque) [T].

### 2.3 Recommandation

**Ne pas investir** dans la sentiment analysis pour la cartographie des positions — c'est l'outil inadapté, et la littérature le dit explicitement. Usage légitime et bon marché : signal d'intensité émotionnelle par tour de parole (via ton LLM existant, éventuellement croisé avec la salience) pour enrichir la frise de tension. Un CamemBERT sentiment local n'apporterait ni précision ni économie significative face à un appel Gemini déjà budgété.

---

## Axe 3 — Argument mining et structure argumentative

### 3.1 État de l'art

Tâches canoniques : (1) détection de composants (claims/prémisses), (2) prédiction de relations (support/attaque), (3) évaluation de qualité. Cadres théoriques : le modèle de **Toulmin** (1958) pour la structure interne (claim, data, warrant…) et les **frameworks d'argumentation abstraite de Dung** (AIJ 1995) pour les graphes attaque/support [T]. Surveys : Lippi & Torroni (ACM TOIT 2016) et Lawrence & Reed (Computational Linguistics 2020) [T].

Corpus pertinents : Persuasive Essays (Stab & Gurevych, CL 2017) [T] ; surtout **US2016** — débats présidentiels US annotés en Inference Anchoring Theory par le groupe ARG-tech (Visser et al., Language Resources & Evaluation 2020) [T] : preuve que l'annotation argumentative de *débats oraux* est faisable, mais à coût d'annotation très élevé et accord inter-annotateurs modeste (κ ~0,5-0,6 typique sur les relations [T]).

**Outils.** MARGOT (Lippi & Torroni 2016, serveur web) et TARGER (Chernodub et al., ACL 2019 demo, BiLSTM) existent toujours mais sont vieillissants et anglophones **[W]** ; l'écosystème récent est actif (Argument Mining Workshop 2024 ; **MAMKit**, toolkit multimodal 2024 ; « Open Argument Mining Framework » 2024-2025) **[W]**, mais aucun outil clé en main robuste n'existe pour le **français oral**. Les F1 de détection de relations restent souvent < 60 même en anglais écrit [T].

### 3.2 Tableau comparatif

| Approche | Complexité | Données | Perf. | Utilisable FR/oral ? |
|---|---|---|---|---|
| TARGER/MARGOT (préentraînés EN) | faible | 0 | claims ~F1 50-70 (essais EN) | non (EN, écrit) |
| Fine-tuning sur corpus AM | très élevée | corpus annoté AM (rare, cher) | relations F1 < 60 | non réaliste en solo |
| **Extraction LLM de relations d'accord/désaccord** | faible | 0 | non benchmarkée en continu ; tâche voisine ((dis)agreement detection, ex. DEBAGREEMENT 2021 [T]) bien faisable | **oui** |

### 3.3 Recommandation

L'argument mining « canonique » (structure Toulmin complète) est **hors de portée raisonnable** d'un projet individuel sur du français oral — c'est le verdict honnête de la littérature. En revanche, la version *dégradée mais utile* pour visualiser des désaccords structurés est accessible : demander au LLM, par bloc, « à quel bloc précédent ce tour répond-il, et est-ce un soutien, une attaque ou une reformulation ? » (avec les mêmes garde-fous d'indices que ta passe de scoring). Cela produit un graphe orienté accord/désaccord exploitable pour l'axe 6, sans prétendre à la granularité prémisse/conclusion.

---

## Axe 4 — Topic modeling et clustering d'opinions

### 4.1 État de l'art

- **LDA** (Blei et al., JMLR 2003) [T] : robuste sur gros corpus longs ; faible sur textes courts et exige de fixer k.
- **Top2Vec** (Angelov, arXiv 2020, prépublication) et **BERTopic** (Grootendorst, arXiv 2022, prépublication) [T] : embeddings (sentence-transformers, multilingues dont FR) + UMAP + HDBSCAN ; BERTopic ajoute le c-TF-IDF par classe.
- Comparaisons empiriques : Egger & Yu (Frontiers in Sociology 2022) jugent BERTopic et NMF meilleurs sur tweets à l'évaluation humaine **[W]** ; d'autres bancs d'essai donnent LDA gagnant en cohérence c_v mais BERTopic gagnant en diversité et lisibilité **[W]**. Mise en garde méthodologique : les métriques de cohérence automatiques sont peu fiables (Hoyle et al., NeurIPS 2021, *Is Automated Topic Model Evaluation Broken?*) [T] — les chiffres de cohérence se comparent mal d'une étude à l'autre.

**Topic + stance** : la combinaison « qui pense quoi sur quel sous-thème » est exactement le modèle **Polis** (Small et al., *Polis: Scaling Deliberation*, Recerca 2021 [T]) : matrice participants × énoncés votés → PCA/clustering. C'est déjà ce que fait ton app côté vote (`analysis.ts`, PCA + k-means + repness) — tu as donc déjà la version validée de cette brique, côté votes.

### 4.2 Tableau comparatif

| Approche | Volume min. de docs | Complexité | FR ? | Verdict pour UN débat (100-200 blocs) |
|---|---|---|---|---|
| LDA | milliers | moyenne | oui | inadapté (trop peu de docs, docs courts) |
| BERTopic (ST multilingue) | centaines-milliers | faible | oui | limite basse ; thèmes instables |
| Segmentation thématique par LLM | 1 débat suffit | très faible | oui | **adapté** — cohérent avec tes « events » |
| Polis-style (votes) | ~10+ votants × ~20+ énoncés | déjà implémenté | oui | validé, côté phase de vote |

### 4.3 Recommandation

Pour un débat isolé, le topic modeling statistique est le mauvais outil (pas assez de documents) ; la segmentation thématique par LLM (que ta passe « events » fait implicitement) est le choix raisonnable. BERTopic devient pertinent **en inter-débats** : quand tu auras des dizaines de tables sur des thèmes variés, il permettra de cartographier les sous-thèmes récurrents à travers le corpus — garde-le pour cette échelle.

---

## Axe 5 — Approches LLM (le cœur de ton pipeline)

### 5.1 Qualité d'annotation : ce qui est validé

- **Gilardi, Alizadeh & Kubli (PNAS 2023)** : sur 6 183 tweets/articles, ChatGPT zero-shot dépasse les crowd workers MTurk d'environ **25 points d'accuracy** en moyenne sur relevance, stance, topics, frames **[W]**.
- **Törnberg (2023, arXiv 2304.06588 ; version journal 2024)** : GPT-4 dépasse experts et crowd workers pour classer l'affiliation politique de tweets, avec fiabilité supérieure et biais égal ou moindre **[W]**.
- **Ziems et al. (Computational Linguistics 2024)** : les LLM sont des annotateurs zero-shot crédibles pour la CSS, mais à valider tâche par tâche [T].
- Contrepoints : **Pangakis et al. 2023** (*Automated Annotation with Generative AI Requires Validation*) [T] et Ollion et al. (2024) [T] — l'usage sans échantillon de validation humain est méthodologiquement indéfendable.

### 5.2 Reproductibilité et stabilité

- **Température** : l'accord inter-exécutions de ChatGPT passe de ~91 % (T=1) à **~97 % (T=0.2)** dans Gilardi et al. **[W]**. Implication directe : fixe explicitement `temperature: 0` (et `seed` si dispo) dans tes appels Gemini — aujourd'hui tu utilises les défauts du modèle.
- **Sensibilité au prompt** : Barrie, Palmer & Spirling / Törnberg proposent le *Prompt Stability Scoring* (arXiv 2407.02039, prépublication) **[W]** : mesurer l'accord de classification sous paraphrases du prompt. Bonne pratique transposable : re-scorer un échantillon de blocs avec 2-3 formulations et mesurer l'accord.
- La sortie **contrainte** (JSON mode / function calling) fiabilise le parsing mais peut légèrement dégrader le raisonnement (*Let Me Speak Freely?*, Tam et al., EMNLP Findings 2024 [T]) — ton pattern « JSON demandé dans le prompt + validateur + retry » est un bon compromis documenté.

### 5.3 Biais politiques mesurés — le risque principal pour toi

La littérature d'audit converge : les LLM alignés penchent **centre-gauche** de façon mesurable et multi-instruments — Feng et al. (ACL 2023, *From Pretraining Data to Language Models to Downstream Tasks*, best paper) montrent la propagation du biais du préentraînement vers les tâches aval ; Motoki et al. (Public Choice 2024) le mesurent sur ChatGPT ; Santurkar et al. (ICML 2023, OpinionQA) et Rozado (PLoS ONE 2024) le confirment sur des dizaines de modèles ; Röttger et al. (ACL 2024) tempèrent : les questionnaires à choix forcé **surestiment** la cohérence de ces « opinions », très sensibles au format **[W]**. Un audit 2026 montre en plus une **sycophantie à l'auditeur inféré** (arXiv 2604.27633, prépublication) **[W]**.

**Conséquence concrète pour ton pipeline** : le placement de positions françaises sensibles (laïcité, immigration…) sur des axes peut être systématiquement décalé. Mitigations peu coûteuses : (1) axes **ancrés symétriquement** — tu le fais déjà, c'est exactement la bonne pratique ; (2) injecter les ancres dans le prompt de *scoring* (aujourd'hui seule la passe 1 les connaît — tes prompts de passe 3 ne reçoivent que les labels de pôles) ; (3) test de symétrie : re-scorer un échantillon avec axes inversés (gauche↔droite) et vérifier que x → −x ; (4) échantillon de validation humaine périodique.

### 5.4 Coût, latence

Ordres de grandeur 2025-2026 : modèles « flash-lite » ≤ ~0,1 $/M tokens en entrée ; un débat de 2 h ≈ 30-60k tokens de transcript → **quelques centimes par débat, latence en minutes**. Le coût n'est pas un facteur discriminant à ton échelle ; la stabilité et le biais le sont.

---

## Axe 6 — Réseaux et polarisation

### 6.1 État de l'art

- **Modélisation en graphe** : nœuds = locuteurs, arêtes = relations d'accord/désaccord (signées) ou d'interaction. Fondateur sur Twitter politique : Conover et al. (ICWSM 2011) [T].
- **Métriques** : **Random Walk Controversy** (Garimella et al., ACM TWEB 2018, *Quantifying Controversy on Social Media*) — jugée la plus fidèle à l'intuition de controverse par ses auteurs **[W]** ; **modularité** de partition (Newman) ; **Neighbor Correlation Index** ; **distance euclidienne généralisée sur graphe** (Hohmann, Devriendt & Coscia, Science Advances 2023) **[W]**. Revue annotée : Interian et al., International Transactions in Operational Research 2023 **[W]**.
- Sur les **distributions d'opinions** (sans graphe) : bimodalité, variance inter/intra-groupes, mesure d'Esteban-Ray (Econometrica 1994) [T].
- **Mise en garde récente** : Durrheim et al. (Political Psychology 2025) — la ségrégation de réseau n'implique pas la polarisation d'opinion ; les mesures fondées sur le **langage/les positions** sont plus sensibles que la modularité **[W]**.

### 6.2 Recommandation

Ton cas est favorable : tu disposes déjà (a) de positions continues par locuteur et par instant (passe 3) et (b) côté app, de matrices de votes (assertion_votes). Métriques implémentables en une soirée, défendables par la littérature :
- **Polarisation d'opinion** par axe : bimodalité / variance inter-camps vs intra-camps des positions pondérées par temps de parole (famille Esteban-Ray) — aucune infra requise.
- **Graphe accord/désaccord** : arêtes extraites par LLM (cf. axe 3) → modularité de la partition en camps, densité des arêtes négatives inter-camps. Sur 5-10 locuteurs le graphe est petit : les métriques se calculent en NetworkX trivialement ; RWC est surdimensionné à cette échelle (conçu pour des milliers de nœuds).
- Suivre la mise en garde de Durrheim : présenter la polarisation *d'opinions* (positions) comme métrique primaire, le graphe comme illustration.

---

## Axe 7 — Spécificités des transcripts oraux

### 7.1 Ce que dit la littérature

- **Propagation des erreurs ASR** : bien documentée. Sur le NER en parole spontanée, la dégradation est substantielle et les **délétions** sont les erreurs les plus nocives (*Why Aren't We NER Yet?*, ACL 2023) **[W]**. L'étude systématique de 2025 (*Measuring the Effect of Transcription Noise*, arXiv 2502.13645, prépublication) montre que la robustesse dépend du **niveau** de la tâche : les tâches sémantiques/discursives (résumé, classification de position d'un long segment) tolèrent un bruit modéré bien mieux que les tâches lexicales (NER, extraction fine) **[W]**. Traduction pour toi : le scoring de position par bloc de ≥ 15 mots est structurellement dans la zone robuste ; l'attribution fine de micro-interjections est dans la zone fragile — ton seuil `MIN_BLOCK_WORDS` est aligné avec ce résultat.
- **WER de référence** : Whisper large-v3 sur français conversationnel multi-locuteurs ≈ ~8-15 % selon conditions micro/chevauchements [T] — suffisant pour les tâches sémantiques, insuffisant pour citer verbatim (ce que tu interdis de toute façon).
- **Diarisation** : pyannote ~10 % DER en meeting [T] ; l'erreur d'attribution de locuteur est le pire risque pour une agrégation d'opinions *par personne* (une phrase forte attribuée au mauvais locuteur fausse sa trajectoire). Ton architecture — attribution par le **log applicatif des tours de parole** plutôt que par diarisation acoustique — est un avantage structurel rare : c'est une vérité terrain que la littérature n'a généralement pas.
- **Prétraitements validés** : restauration de ponctuation (améliore les tâches aval [T]), segmentation en tours, suppression de disfluences (Shriberg [T]), correction post-ASR par LLM (efficace mais risque d'hallucination → nécessite garde-fous, que tu as).

### 7.2 Recommandation

Ton pipeline couvre déjà l'essentiel des recommandations de la littérature (segmentation par tours véridique, correction validée, seuil de longueur, refus du verbatim). Deux compléments à faible coût : (1) marquer la **confiance ASR** par bloc (log-prob moyenne Whisper, déjà calculée) et la propager comme atténuateur de salience pour les blocs douteux ; (2) exclure du scoring les blocs à fort chevauchement détecté (si `--diarize` actif).

---

## 8. Synthèse transversale — pipeline plausible et statut scientifique de chaque brique

### 8.1 Architecture recommandée (de l'audio à la visualisation)

```
1. ASR Whisper large-v3 + horodatage mot            [VALIDÉ - littérature + ton usage]
2. Attribution par log des tours (vérité terrain)    [VALIDÉ - meilleur que diarisation]
3. Correction LLM + anonymisation + seuil ≥15 mots   [VALIDÉ - ingénierie conforme axe 7]
4. Extraction de positions par bloc, LLM structuré   [VALIDÉ dans sa forme catégorielle/
   (stance + paraphrase + salience)                    ordinale ; voir 8.3 pour le continu]
5. Axes du débat : induction LLM + ancres            [NON TRANCHÉ - choix d'ingénierie]
6. Lissage temporel (EWMA) → trajectoires            [NON TRANCHÉ - choix d'ingénierie]
7. Events / tension / segmentation thématique LLM    [PARTIELLEMENT VALIDÉ - annotation LLM
                                                       validée, granularité continue non]
8. (option) Graphe accord/désaccord LLM → métriques  [FAISABLE - tâches voisines validées]
   de polarisation (bimodalité, modularité)
9. Visualisation avec provenance (paraphrases)        [BONNE PRATIQUE - traçabilité]
```

### 8.2 Briques scientifiquement validées

- Annotation/classification zero-shot par LLM avec T basse et validation par échantillon (Gilardi 2023, Törnberg 2023, Ziems 2024, FlanT5 2024-2025) — **c'est le socle de ta passe 3, il est solide**.
- Robustesse des tâches sémantiques au bruit ASR modéré sur segments longs.
- Métriques de polarisation sur distributions d'opinions et petits graphes signés.
- Polis-style PCA/clustering sur matrices de votes (déjà dans ton app).

### 8.3 Ce qui relève de choix d'ingénierie non tranchés — et comment les consolider

1. **Placement continu -10..+10 par bloc** : la littérature valide la stance catégorielle/ordinale, pas l'échelle continue par LLM. Deux consolidations possibles : passer à une échelle **ordinale courte** (-2..+2, meilleures propriétés de mesure, moins de fausse précision) en la re-mappant vers -10..+10 pour l'affichage ; et/ou mesurer la **fidélité test-retest** (re-scorer 30 blocs 3 fois, corrélation attendue > 0,9 à T=0).
2. **Induction des axes par LLM (passe 1)** : aucun précédent évaluatif ; risque de biais d'axe (axe 5.3). Consolidation : injecter les ancres dans le prompt de scoring, test de symétrie par inversion d'axes, et — quand la table est liée à une séance de vote — comparer qualitativement les axes LLM aux axes PCA des votes (deux dérivations indépendantes qui devraient se ressembler).
3. **EWMA α=0,35 pondéré salience** : défendable mais arbitraire ; alternatives de même coût : lissage par processus gaussien, ou **détection de points de rupture** (PELT / Bayesian online change-point) pour distinguer vraie évolution et bruit — utile aussi pour l'audit des trajectoires déjà mené (silences longs interpolés).
4. **Salience LLM comme pondération** : non validée ; à défaut d'étude, la borner (ex. plancher 0,3) évite qu'un score l'écrase.

### 8.4 Priorités concrètes pour Ecclesia (coût ↗)

1. `temperature=0` (+ seed) sur tous les appels d'analyse — gratuit, gain de reproductibilité documenté.
2. Injecter les ancres d'axes dans le prompt de scoring — 5 lignes.
3. Test de symétrie d'axes + test-retest sur un échantillon — une soirée, produit des chiffres de fiabilité publiables dans ta doc.
4. Échantillon de validation humaine (30-50 blocs, toi + 1 autre annotateur, accord Cohen κ) — c'est LA pratique exigée par la littérature (Pangakis 2023).
5. Graphe accord/désaccord LLM + bimodalité par axe — nouvelle valeur visualisable, faible coût.
6. (plus tard, inter-débats) BERTopic multilingue sur le corpus de toutes les tables.

---

## Références principales

**Vérifiées en recherche web [W]** : Benchmarking zero-shot stance detection with FlanT5-XXL (arXiv:2403.00236 ; PeerJ CS 2025) · Large Language Models Meet Stance Detection: A Survey (arXiv:2505.08464, préprint) · Evrard et al., French Tweet Corpus for Automatic Stance Detection (LREC 2020) · Lai et al., Multilingual stance detection in social media political debates (CSL 2020) · Gilardi, Alizadeh & Kubli, ChatGPT outperforms crowd workers (PNAS 2023) · Törnberg, ChatGPT-4 Outperforms Experts and Crowd Workers (arXiv:2304.06588) · Prompt Stability Scoring (arXiv:2407.02039, préprint) · Feng et al. (ACL 2023) ; Motoki et al. (Public Choice 2024) ; Röttger et al. (ACL 2024) ; Santurkar et al. ; Rozado — audits de biais politique · Garimella et al., Quantifying Controversy (ACM TWEB 2018) · Hohmann, Devriendt & Coscia (Science Advances 2023) · Interian et al. (ITOR 2023) · Durrheim et al. (Political Psychology 2025) · Why Aren't We NER Yet? (ACL 2023) · Measuring the Effect of Transcription Noise (arXiv:2502.13645, préprint) · Egger & Yu (Frontiers in Sociology 2022) · TARGER (ACL 2019 demo) ; MARGOT (Expert Systems with Applications 2016) ; MAMKit (2024).

**Littérature établie à re-vérifier avant citation [T]** : Mohammad et al. (SemEval-2016 Task 6 ; ACM TOIT 2017) · Küçük & Can (ACM CSUR 2020) · ALDayel & Magdy (IP&M 2021) · Allaway & McKeown, VAST (EMNLP 2020) · Li et al., P-Stance (Findings ACL 2021) · Sobhani et al. (EACL 2017) · Vamvas & Sennrich, X-Stance (2020) · Laurer et al. (Political Analysis 2024) · Burnham (2024) · Martin et al., CamemBERT (ACL 2020) · Le et al., FlauBERT (LREC 2020) · Blei et al., LDA (JMLR 2003) · Grootendorst, BERTopic (arXiv 2022) · Angelov, Top2Vec (arXiv 2020) · Hoyle et al. (NeurIPS 2021) · Stab & Gurevych (CL 2017) · Visser et al., US2016 (LREC-J 2020) · Lawrence & Reed (CL 2020) · Lippi & Torroni (ACM TOIT 2016) · Toulmin (1958) · Dung (AIJ 1995) · Ziems et al. (CL 2024) · Pangakis et al. (2023) · Tam et al. (EMNLP Findings 2024) · Conover et al. (ICWSM 2011) · Esteban & Ray (Econometrica 1994) · Small et al., Polis (2021).
