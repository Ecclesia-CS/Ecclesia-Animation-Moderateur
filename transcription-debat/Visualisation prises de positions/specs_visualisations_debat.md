# Spécifications de visualisations pour Claude Code

*Débat sur les systèmes de retraite, cartographie idéologique, dynamique des opinions et topologie des accords*

---

## Comment utiliser ce document

Donne ce fichier entier à Claude Code comme contexte, puis demande-lui une visualisation à la fois en collant le bloc "Prompt pour Claude Code" correspondant. Les cinq visualisations partagent les mêmes jeux de données, définis une seule fois en section 1, de sorte que les rendus restent cohérents entre eux et peuvent à terme cohabiter dans un seul tableau de bord (section 3).

Toutes les coordonnées et tous les poids sont des estimations interprétatives, construites à partir d'une analyse de la transcription, pas des mesures. Les axes, les seuils de tension et le placement des voix encodent un jugement argumenté, pas une donnée objective. Ce point doit figurer en légende des rendus.

---

## 0. Modèle conceptuel commun

### 0.1 Les deux axes du plan idéologique

Tout le dispositif repose sur un espace à deux dimensions, qui s'est révélé être la bonne grille pour ce débat précis.

L'axe horizontal, `X`, va de la primauté de la liberté individuelle, à gauche, valeur négative, à la primauté de l'égalité et de la solidarité collective, à droite, valeur positive. Échelle de moins dix à plus dix. C'est l'axe des valeurs ultimes, celui que les deux protagonistes principaux ont eux-mêmes identifié comme le vrai point de friction.

L'axe vertical, `Y`, va de l'ancrage dans les données, les mécanismes et la technique, en bas, valeur négative, à l'ancrage dans les principes, les valeurs et la déduction, en haut, valeur positive. Échelle de moins dix à plus dix. C'est l'axe de la méthode, celui qui révèle la vraie ligne de faille du groupe, la tension entre vouloir un débat technique et vouloir un débat philosophique.

Les quatre quadrants reçoivent une lecture philosophique : en haut à gauche l'individualisme principiel, en haut à droite le solidarisme principiel, en bas à gauche le libéralisme technique, en bas à droite la technocratie redistributive. Le centre est la zone de gravité du débat, là où convergent les positions pragmatiques.

### 0.2 Provenance et limites des données

Trois caveats doivent être visibles dans les rendus, sous forme de note de bas de visualisation.

La diarisation automatique a regroupé l'essentiel des échanges dans un locuteur non identifié. Les voix nommées, Jules, Inès, Émilien, Damien, Faustin, Maxence ou Marc, Mathis, ont été reconstruites par le contenu des arguments et par les prénoms d'adresse, ce sont des hypothèses, pas des certitudes.

Près de 19 pour cent du débat, environ 16 minutes sur 85, sont redactés par refus d'enregistrement. Ces fenêtres doivent apparaître comme des zones aveugles, pas comme des silences neutres.

Le débat est un débat de cristallisation : les positions de fond se déplacent peu. Les visualisations dynamiques doivent rendre lisibles de petits glissements sans exagérer l'amplitude des mouvements.

---

## 1. Jeux de données canoniques

Colle ces blocs tels quels. Ils sont conçus pour être chargés en JavaScript ou écrits dans un fichier `data.js`.

### 1.1 Définition des axes

```json
{
  "axes": {
    "x": { "key": "liberte_egalite", "min": -10, "max": 10,
           "leftLabel": "Liberté individuelle", "rightLabel": "Égalité · solidarité" },
    "y": { "key": "technique_principes", "min": -10, "max": 10,
           "bottomLabel": "Données · technique", "topLabel": "Valeurs · principes" },
    "quadrants": {
      "topLeft": "individualisme principiel",
      "topRight": "solidarisme principiel",
      "bottomLeft": "libéralisme technique",
      "bottomRight": "technocratie redistributive"
    }
  }
}
```

### 1.2 Les voix et leurs trajectoires

Chaque voix possède une trajectoire `kf`, liste de points clés au format `[minute, x, y]`. La position à un instant `t` s'obtient par interpolation linéaire entre les points clés encadrants. `entry` est la minute d'entrée de la voix dans le débat, avant laquelle elle est masquée. `weight` est un proxy du temps de parole, à utiliser pour le rayon des points.

```json
{
  "personas": [
    { "id": "jules", "label": "Jules", "camp": "Individualisme libéral", "color": "#D64545", "weight": 1.0, "entry": 0,
      "kf": [[0,-9,6.5],[18,-9,7],[23,-7.6,6.4],[26,-9,7],[33,-7,6],[37,-8.6,6.8],[85,-9,7]],
      "note": "Constance axiomatique. Deux excursions vers le centre sont des concessions tactiques, sur le minimum vers 23 min et sur l’émotion vers 33 min, suivies d’un retour." },
    { "id": "solid", "label": "Solidariste", "camp": "Solidarisme égalitariste", "color": "#0F8A6A", "weight": 1.0, "entry": 8,
      "kf": [[8,7,3.2],[16,7.4,3.5],[31,6.5,2.6],[50,7,1.6],[62,7,1],[85,7,1.4]],
      "note": "X stable autour de 7. Y descend, la voix s’ancre de plus en plus dans la technique, multiplicateurs budgétaires, comptes des caisses." },
    { "id": "damien", "label": "Damien", "camp": "Humanisme du minimum vital", "color": "#E09020", "weight": 0.6, "entry": 30,
      "kf": [[30,5,7],[33,5,7.6],[85,5,7]],
      "note": "Statique, haut sur l’axe des valeurs, pathos assumé, cas du mec qui perd tout." },
    { "id": "marc", "label": "Maxence/Marc", "camp": "Assurantiel pragmatique", "color": "#D85A30", "weight": 0.55, "entry": 33,
      "kf": [[33,3,2],[35,3.4,1.4],[85,3,1.5]],
      "note": "Cas cancer et accident, plaide un socle redistributif, refuse la caricature des loups de Wall Street." },
    { "id": "reform", "label": "Réformiste", "camp": "Système mixte · conventions", "color": "#639922", "weight": 0.7, "entry": 34,
      "kf": [[34,1,-1],[36,1.6,-1.6],[66,2,-0.6],[85,4,0.2]],
      "note": "Seule vraie dérive idéologique du débat. Part du centre constructif, conventions citoyennes et 2 à 3 pour cent de capitalisation, et glisse vers la redistribution par le haut en clôture." },
    { "id": "emilien", "label": "Émilien", "camp": "Sceptique prudent", "color": "#8FBF4B", "weight": 0.5, "entry": 12,
      "kf": [[12,1,-3],[40,1.5,-3],[85,1.6,-2.6]],
      "note": "Petits épargnants, suffisance des obligations, performances passées. Empirique et prudent, proche du centre." },
    { "id": "faustin", "label": "Faustin", "camp": "Positivisme technicien", "color": "#6E6D68", "weight": 0.7, "entry": 6,
      "kf": [[6,-1,-7],[85,-1,-7]],
      "note": "Démographie, taux d’épargne et pouvoir d’achat des retraités. Très bas sur l’axe technique, neutre en valeurs avec un léger penchant liberté." },
    { "id": "mathis", "label": "Mathis", "camp": "Positivisme technicien", "color": "#9A9992", "weight": 0.45, "entry": 66,
      "kf": [[66,1,-8],[85,1,-8]],
      "note": "Dissection budgétaire des EHPAD, périmètre comptable, arrive tard." },
    { "id": "anim", "label": "Animation", "camp": "Posture méta · processus", "color": "#534AB7", "weight": 0.5, "entry": 0,
      "kf": [[0,1,4],[72,2,5],[85,2,5]],
      "note": "Gère le protocole, regrette le manque d’émotions, théorise la valeur du dissensus en clôture, référence à Schopenhauer." }
  ]
}
```

### 1.3 Les écoles de pensée comme régions

Pour V1, on peut dessiner chaque école comme une ellipse de fond, centrée sur `cx, cy`, de demi-axes `rx, ry`, regroupant les voix associées.

```json
{
  "schools": [
    { "id": "lib", "label": "Individualisme libéral intégral", "cx": -8.2, "cy": 6.6, "rx": 2.2, "ry": 1.8, "color": "#D64545", "members": ["jules"] },
    { "id": "sol", "label": "Solidarisme égalitariste", "cx": 7.0, "cy": 2.2, "rx": 1.8, "ry": 2.0, "color": "#0F8A6A", "members": ["solid"] },
    { "id": "hum", "label": "Humanisme du minimum vital", "cx": 4.2, "cy": 5.2, "rx": 2.4, "ry": 2.6, "color": "#E09020", "members": ["damien","marc"] },
    { "id": "mix", "label": "Pragmatisme réformiste, système mixte", "cx": 1.6, "cy": -1.4, "rx": 2.6, "ry": 2.2, "color": "#639922", "members": ["reform","emilien"] },
    { "id": "tec", "label": "Positivisme technicien", "cx": -0.2, "cy": -7.4, "rx": 2.6, "ry": 1.8, "color": "#6E6D68", "members": ["faustin","mathis"] }
  ]
}
```

### 1.4 Les points de bascule

`type` vaut `cadrage`, `dissensus`, `concession`, `consensus`, `technique` ou `meta`. `magnitude` de 1 à 3 contrôle la taille du marqueur.

```json
{
  "events": [
    { "t": 1,   "type": "cadrage",   "magnitude": 2, "title": "Énoncé de la doxa", "desc": "Un participant énonce l’opinion dominante avant de donner la sienne, ce qui oriente le terrain sur le coût et l’efficacité de l’État." },
    { "t": 6,   "type": "technique", "magnitude": 1, "title": "Le ratio démographique", "desc": "4 actifs par retraité en 1960, 1,8 aujourd’hui, 1,4 en 2070. Socle de fait partagé." },
    { "t": 16,  "type": "dissensus", "magnitude": 2, "title": "Liberté contre égalité", "desc": "Première formulation explicite du conflit de valeurs, identifié par les deux camps comme le vrai point de friction." },
    { "t": 18,  "type": "dissensus", "magnitude": 2, "title": "La redistribution comme vol", "desc": "La solidarité forcée requalifiée en captation par le pôle individualiste." },
    { "t": 22.5,"type": "dissensus", "magnitude": 3, "title": "L’État comme abonnement", "desc": "Pivot dramaturgique. Métaphore du service résiliable, réplique prison, surenchère exil et exit tax. Le sujet retraite se fractionne en trois fils." },
    { "t": 25,  "type": "consensus", "magnitude": 2, "title": "Intérêt d’un système mixte", "desc": "Recentrage. Tous sauf l’individualisme intégral admettent qu’un dosage mérite examen." },
    { "t": 31,  "type": "concession","magnitude": 2, "title": "L’égalité n’est pas absolue", "desc": "Le pôle solidariste recentre sa position sur la seule réduction des écarts." },
    { "t": 33,  "type": "concession","magnitude": 3, "title": "Cancer et accident", "desc": "Irruption du concret incarné. L’individualisme passe en défensive et concède comprendre l’émotion. Pic de pathos efficace." },
    { "t": 37,  "type": "consensus", "magnitude": 2, "title": "Espérance de vie des ouvriers", "desc": "Aporie partagée. La répartition uniforme garantit moins d’années de pension aux ouvriers, plusieurs reconnaissent la faille sans solution." },
    { "t": 50,  "type": "technique", "magnitude": 3, "title": "Requalification du déficit", "desc": "Le déséquilibre projeté provient d’une baisse des recettes, moins de fonctionnaires, point d’indice gelé, pas d’une explosion des besoins. Combler ne coûterait qu’une fraction de la hausse des salaires." },
    { "t": 60,  "type": "technique", "magnitude": 1, "title": "Laffer et théorème de Rolle", "desc": "Moment d’épistémologie. La courbe de Laffer reconnue comme non empirique, seuls les zéros aux extrémités font consensus, maximum déduit par Rolle." },
    { "t": 68,  "type": "consensus", "magnitude": 2, "title": "EHPAD, un sujet distinct", "desc": "Accord pour séparer la dépendance, enjeu de santé et de budget de l’État, du mécanisme de retraite." },
    { "t": 71,  "type": "meta",      "magnitude": 2, "title": "Tour de table", "desc": "Bascule de registre, du combat à la réflexivité, apaisement institutionnalisé." },
    { "t": 82.5,"type": "meta",      "magnitude": 2, "title": "Clôture, éloge du dissensus", "desc": "Référence à L’art d’avoir toujours raison, l’opinion se transforme après le débat plutôt que pendant." }
  ]
}
```

### 1.5 Série de tension

Intensité de 0 à 100, haut égale dissensus fort, bas égale apaisement ou consensus. Format `[minute, valeur]`. Interpolation linéaire.

```json
{
  "tension": [[0,38],[3,42],[10,52],[15,68],[18,74],[22,82],[23,90],[24,72],[25,52],[26,58],[31,72],[33,80],[35,58],[37,55],[40,60],[47,55],[50,46],[56,48],[57,50],[60,58],[62,55],[66,46],[68,44],[71,38],[74,42],[78,40],[82,32],[85,30]]
}
```

### 1.6 Zones non enregistrées

Format `[début, fin]` en minutes. À masquer ou griser dans tous les rendus temporels.

```json
{
  "refus": [[40.7,47.3],[56.6,57.1],[62.6,66.5],[75.6,75.7],[77.4,81.9],[81.9,82.6]],
  "totalRedactedMinutes": 16.3,
  "totalDurationMinutes": 85
}
```

### 1.7 Réseau conceptuel des accords et désaccords

Trois familles de relations structurent V4. Les `fauxConsensus` sont des concepts dédoublés, même mot, deux sens incompatibles. Les `gordian` sont les blocages irréconciliables. Les `consensus` sont les points stabilisés. Les `concessions` sont datées.

```json
{
  "concepts": ["Liberté","Égalité","Solidarité","Minimum vital","Mérite","Redistribution","État","Capitalisation","Répartition","Croissance","Risque de l’existence","Démographie"],

  "fauxConsensus": [
    { "concept": "Liberté",     "senseA": "négative, absence de contrainte sur le revenu", "campA": "lib", "senseB": "positive, capacité effective d’agir", "campB": "sol" },
    { "concept": "Solidarité",  "senseA": "vertu volontaire entre proches", "campA": "lib", "senseB": "obligation institutionnelle universelle", "campB": "sol" },
    { "concept": "Minimum vital","senseA": "garanti par une assurance privée", "campA": "lib", "senseB": "garanti par la collectivité", "campB": "hum" },
    { "concept": "Égalité",     "senseA": "à neutraliser, négation de la différence", "campA": "lib", "senseB": "à promouvoir, réduction des écarts", "campB": "sol" },
    { "concept": "État",        "senseA": "acteur le plus sûr, tient sa promesse depuis 50 ans", "campA": "tec", "senseB": "caisse unique fongible, source de confusion", "campB": "mix" }
  ],

  "gordian": [
    { "concept": "Redistribution", "poleA": "vol, captation", "campA": "lib", "poleB": "assurance de la liberté", "campB": "sol", "why": "Désaccord de définition, pas d’hypothèse, aucune donnée ne tranche." },
    { "concept": "Hiérarchie des valeurs", "poleA": "liberté au sommet", "campA": "lib", "poleB": "égalité conditionne la liberté", "campB": "sol", "why": "Conflit de valeurs ultimes." },
    { "concept": "Statut de l’inégalité", "poleA": "neutre tant que la liberté est garantie", "campA": "lib", "poleB": "problème à corriger", "campB": "sol", "why": "Le désaccord se déplace de l’empirique vers le normatif." }
  ],

  "consensus": [
    { "label": "Réalité du choc démographique", "t": 6, "scope": "tous" },
    { "label": "Intérêt d’un système mixte", "t": 25, "scope": "tous sauf lib" },
    { "label": "Espérance de vie, faille de la répartition uniforme", "t": 37, "scope": "large" },
    { "label": "EHPAD, sujet distinct de la retraite", "t": 68, "scope": "tous" },
    { "label": "Valeur du dissensus argumenté", "t": 82, "scope": "tous, méta" }
  ],

  "concessions": [
    { "by": "lib", "t": 23, "label": "Un minimum peut exister, mais géré au privé" },
    { "by": "lib", "t": 35, "label": "L’inégalité d’espérance de vie est réelle, l’émotion se comprend" },
    { "by": "sol", "t": 31, "label": "L’égalité n’est pas une valeur absolue" },
    { "by": "reform", "t": 66, "label": "Glissement vers la réduction des pensions les plus hautes" }
  ]
}
```

### 1.8 Fractionnement du sujet, données pour un flux alluvial

Capture la dynamique où le sujet unique retraite éclate en sous-fils au moment de la bascule de la 22e minute, puis se réagrège en clôture. Les valeurs sont des poids d’attention approximatifs.

```json
{
  "sankey": {
    "nodes": [
      { "id": "retraites", "label": "Sujet, les retraites", "stage": 0 },
      { "id": "abonnement", "label": "Contrat social, abonnement à l’État", "stage": 1 },
      { "id": "valeurs", "label": "Écarts de valeurs, liberté contre égalité", "stage": 1 },
      { "id": "minimum", "label": "Minimum, filet de sécurité", "stage": 1 },
      { "id": "financement", "label": "Financement et déficit, technique", "stage": 1 },
      { "id": "ehpad", "label": "EHPAD et dépendance, écarté", "stage": 1 },
      { "id": "reflexif", "label": "Tour de table réflexif", "stage": 2 }
    ],
    "links": [
      { "source": "retraites", "target": "abonnement", "value": 9 },
      { "source": "retraites", "target": "valeurs", "value": 10 },
      { "source": "retraites", "target": "minimum", "value": 7 },
      { "source": "retraites", "target": "financement", "value": 8 },
      { "source": "retraites", "target": "ehpad", "value": 4 },
      { "source": "abonnement", "target": "reflexif", "value": 6 },
      { "source": "valeurs", "target": "reflexif", "value": 8 },
      { "source": "minimum", "target": "reflexif", "value": 6 },
      { "source": "financement", "target": "reflexif", "value": 5 },
      { "source": "ehpad", "target": "reflexif", "value": 2 }
    ]
  }
}
```

---

## 2. Les visualisations

### V1. Carte idéologique statique, le plan des écoles

**Objectif.** Donner la photographie d'ensemble, où se tient chaque voix et chaque école à la fin du débat.

**Ce qu'elle montre.** Le plan à deux axes de la section 0.1, avec les cinq écoles dessinées en ellipses de fond translucides, et les neuf voix placées en points à leur position finale, c'est-à-dire à `t` égale 85.

**Encodage visuel.** Position selon `x` et `y`. Rayon du point proportionnel à `weight`. Couleur par camp, selon le champ `color`. Étiquette nominale toujours visible à côté du point, jamais seulement au survol, pour ne pas dépendre de la couleur seule. Ellipses d'école en remplissage à 8 à 12 pour cent d'opacité, contour à 40 pour cent, étiquette de l'école au centre. Lignes d'axe fines passant par l'origine, étiquettes d'axe aux quatre extrémités, descripteurs de quadrant en petit et en retrait.

**Interactions.** Survol d'un point, encadré avec `camp` et `note`. Survol d'une école, mise en évidence de ses membres. Optionnel, un commutateur pour afficher ou masquer les ellipses d'école.

**Données.** `axes`, `personas` position à `t` égale 85, `schools`.

**Recommandation technique.** D3 v7, échelles `scaleLinear` pour les deux axes, ou un SVG construit à la main puisque la géométrie est simple. Pas de bibliothèque de graphes nécessaire.

```text
Prompt pour Claude Code
Construis une page HTML autonome, responsive, compatible mode clair et sombre, qui rend la visualisation V1 décrite dans le document de specs.
Utilise les datasets axes, personas et schools de la section 1.
Plan cartésien à deux axes. X de -10 (Liberté individuelle) à +10 (Égalité, solidarité). Y de -10 (Données, technique) à +10 (Valeurs, principes). Trace les axes par l'origine et étiquette les quatre extrémités, plus les descripteurs des quatre quadrants en petit.
Dessine les cinq écoles comme des ellipses de fond translucides centrées sur cx, cy avec demi-axes rx, ry, contour de la couleur de l'école, étiquette au centre.
Place chaque voix à la position finale, soit le dernier point clé de sa trajectoire kf, en cercle coloré, rayon proportionnel à weight, avec son label toujours visible à côté. Au survol, affiche un encadré avec camp et note.
Aucun titre ni paragraphe dans la zone graphique, seulement axes, étiquettes, légende. Ajoute en pied une note, coordonnées interprétatives reconstruites à partir d'une analyse de transcription, diarisation imparfaite.
```

---

### V2. Trajectoires dynamiques, l'animation temporelle

**Objectif.** C'est la pièce centrale demandée, suivre les glissements d'opinion au fil du débat. Une maquette interactive de cette visualisation a déjà été produite dans la conversation, ce qui suit en est la spécification complète et plus poussée.

**Ce qu'elle montre.** Le même plan que V1, mais animé sur 85 minutes. Chaque voix est un point qui se déplace le long de sa trajectoire `kf`, laisse une traînée de son parcours passé, et n'apparaît qu'à partir de sa minute `entry`. Un curseur temporel et un bouton lecture pilotent le temps. Un encadré affiche en continu la phase courante du débat et le niveau de tension.

**Encodage visuel.** Identique à V1 pour les points. La traînée est une polyligne de la couleur de la voix, à 30 pour cent d'opacité, échantillonnée minute par minute depuis l'entrée jusqu'à l'instant courant. Les concessions tactiques de Jules doivent se lire comme de courtes excursions vers le centre suivies d'un retour, et la dérive du Réformiste comme le seul vrai déplacement net. Ne pas exagérer les amplitudes.

**Interactions.** Curseur de 0 à 85 minutes, pas de 0,5. Bouton lecture et pause qui avance le temps automatiquement, environ une demi-minute toutes les 55 millisecondes. Affichage du temps en minutes et secondes. Bandeau de phase textuelle pilotée par `events` et par les bornes de phase. Indicateur de tension coloré, calme en bas, tendu en haut, indéterminé dans les zones de refus.

**Données.** `axes`, `personas` avec interpolation, `tension`, `refus`, `events` pour le texte de phase.

**Recommandation technique.** Vanilla JS suffit, comme dans la maquette, ou D3 avec transitions. La fonction d'interpolation entre points clés est triviale, segment encadrant puis interpolation linéaire. Pour un rendu plus fluide, animer avec `requestAnimationFrame` plutôt que `setInterval`.

```text
Prompt pour Claude Code
Construis une page HTML autonome et interactive qui rend la visualisation V2, la carte idéologique dynamique, décrite dans les specs.
Reprends le plan à deux axes de V1. Utilise les datasets personas, tension, refus et events.
Anime sur 85 minutes. Pour chaque voix, calcule la position à l'instant t par interpolation linéaire entre les points clés kf encadrants. Masque la voix tant que t est inférieur à son entry, puis fais-la apparaître. Trace une traînée, polyligne à faible opacité de la couleur de la voix, échantillonnée chaque minute de entry jusqu'à t.
Ajoute un curseur de 0 à 85 pas 0,5, un bouton lecture et pause qui avance t automatiquement, et un affichage du temps en mm:ss.
Affiche en continu, un bandeau de phase textuelle déduit du temps, par exemple à 22 minutes, bascule l'État comme abonnement le sujet se fractionne, et une pastille de tension calculée par interpolation de la série tension, verte si inférieure ou égale à 45, rouge si supérieure ou égale à 72, neutre sinon, et indéterminée si t tombe dans une zone refus.
Important, ce débat est un débat de cristallisation, les positions bougent peu, ne fabrique pas de grands mouvements, rends lisibles de petits glissements, notamment les deux excursions de Jules vers le centre puis retour, et la dérive du Réformiste vers la droite en fin de débat.
```

---

### V3. Frise de tension et points de bascule

**Objectif.** Répondre précisément à la demande, voir les moments de dissensus fort et de consensus fort et les glissements au fil du temps, sur un axe temporel unique.

**Ce qu'elle montre.** Un ruban horizontal de 0 à 85 minutes. Une courbe de tension qui monte aux pics de dissensus et descend aux moments de consensus. Des marqueurs de points de bascule positionnés dans le temps, dont la couleur encode le `type`, dissensus, consensus, concession, technique, méta, cadrage. Les zones de refus en bandes grisées. Au survol d'un marqueur, son `title` et son `desc`.

**Encodage visuel.** Courbe de tension en aire ou en ligne, une seule teinte chaude. Marqueurs colorés par type avec une petite légende de type, taille selon `magnitude`. Les concessions peuvent être marquées par une icône distincte, par exemple une flèche de rapprochement, pour les distinguer des purs dissensus. Bandes de refus hachurées ou grisées à 30 pour cent, avec un point d'interrogation sur les grandes zones.

**Interactions.** Survol des marqueurs. Optionnel, filtres par type d'événement. Si V3 cohabite avec V2 dans un tableau de bord, partager le même curseur temporel et afficher une tête de lecture synchronisée.

**Données.** `tension`, `events`, `refus`, et la partie `consensus` et `concessions` de la section 1.7 pour enrichir les marqueurs.

**Recommandation technique.** Chart.js pour la courbe avec annotations, ou D3 pour un contrôle complet du placement des marqueurs et des bandes. D3 est préférable ici car le mélange courbe, marqueurs typés et bandes de refus dépasse le confort de Chart.js.

```text
Prompt pour Claude Code
Construis une frise temporelle HTML qui rend la visualisation V3 des specs.
Axe horizontal de 0 à 85 minutes. Utilise tension, events et refus.
Trace la courbe de tension, 0 à 100, haut égale dissensus fort, en aire ou ligne d'une seule teinte chaude. Place sous l'axe un marqueur par événement de events, positionné à sa minute t, coloré selon type, dissensus en rouge, consensus en vert ou teal, concession en ambre avec une icône de rapprochement, technique en gris, méta en violet, cadrage en neutre, taille selon magnitude. Au survol d'un marqueur, affiche title et desc.
Dessine les zones refus en bandes grisées hachurées par dessus la courbe, avec un point d'interrogation sur les grandes zones, pour signaler une mesure manquante et non un silence.
Ajoute une mini légende des types. Aucun paragraphe dans la zone graphique. Note de pied, environ 19 pour cent du débat est non enregistré.
```

---

### V4. Réseau conceptuel des accords et désaccords

**Objectif.** Donner la profondeur philosophique demandée, montrer la structure des concepts, et surtout rendre visibles les faux consensus, ces mots que tout le monde emploie avec des sens incompatibles, qui sont le cœur intellectuel de ce débat.

**Ce qu'elle montre.** Un graphe où les concepts sont des nœuds. Les concepts à faux consensus sont dédoublés en deux demi-nœuds reliés par une arête de tension, un même mot scindé en deux sens, chacun rattaché à un camp. Les nœuds gordiens portent une arête rouge explicitement marquée irréconciliable. Les consensus sont des nœuds verts. Les concessions apparaissent comme des arêtes orientées datées d'un camp vers un concept.

**Encodage visuel.** Concepts en cercles neutres. Pour un faux consensus, deux demi-cercles accolés de couleurs de camp différentes, reliés par un trait en pointillé étiqueté, deux sens. Arêtes gordiennes en rouge épais avec une étiquette, nœud gordien. Nœuds de consensus en vert. Arêtes de concession en flèche, étiquetées avec la minute. Couleur des camps cohérente avec `schools` et `personas`.

**Interactions.** Clic sur un concept, mise en évidence de ses relations et des camps concernés. Survol d'une arête de faux consensus, affichage des deux définitions opposées. Optionnel, disposition par force, `d3.forceSimulation`, ou disposition manuelle plus lisible.

**Données.** `concepts`, `fauxConsensus`, `gordian`, `consensus`, `concessions`, et `schools` pour les couleurs de camp.

**Recommandation technique.** D3 force layout, ou Cytoscape.js si tu veux une manipulation de graphe plus riche. Étant donné le faible nombre de nœuds, une disposition manuelle soignée sera plus lisible qu'une simulation de force, qui a tendance à brouiller les regroupements.

```text
Prompt pour Claude Code
Construis un réseau conceptuel HTML qui rend la visualisation V4 des specs.
Utilise concepts, fauxConsensus, gordian, consensus, concessions et schools.
Les concepts sont des nœuds. Pour chaque entrée de fauxConsensus, dédouble le nœud du concept en deux demi-nœuds accolés, l'un coloré selon campA, l'autre selon campB, reliés par un trait pointillé étiqueté deux sens. Au survol, affiche senseA et senseB.
Pour chaque entrée de gordian, relie les deux pôles par une arête rouge épaisse étiquetée nœud gordien, et affiche why au survol.
Les entrées de consensus sont des nœuds verts. Les entrées de concessions sont des flèches orientées du camp by vers le concept, étiquetées avec la minute t.
Couleurs de camp cohérentes avec le champ color des écoles, lib rouge, sol teal, hum ambre, mix vert, tec gris. Disposition lisible, regroupe visuellement les faux consensus, privilégie un placement manuel soigné à une simulation de force si elle brouille les groupes. Aucun titre dans la zone graphique, une légende compacte des types de relation.
```

---

### V5. Flux de fractionnement du sujet, optionnel

**Objectif.** Visualiser un phénomène spécifique et frappant de ce débat, l'éclatement du sujet unique en plusieurs fils au moment de la bascule, puis sa réagrégation en clôture.

**Ce qu'elle montre.** Un diagramme alluvial, ou Sankey, en trois étages. À gauche, le sujet unique, les retraites. Au centre, les cinq fils nés du fractionnement, contrat social, valeurs, minimum, financement, EHPAD écarté. À droite, la réagrégation dans le tour de table réflexif. L'épaisseur des flux encode le poids d'attention.

**Encodage visuel.** Sankey classique, largeur des liens selon `value`. Couleur des nœuds intermédiaires reprenant la nature du fil, par exemple valeurs en teal, financement en gris technique, EHPAD en gris clair pour marquer son statut écarté.

**Interactions.** Survol d'un lien, son poids. Survol d'un nœud, son label complet.

**Données.** `sankey`.

**Recommandation technique.** `d3-sankey`, module dédié, ou Plotly Sankey si tu préfères une solution clé en main.

```text
Prompt pour Claude Code
Construis un diagramme de Sankey HTML qui rend la visualisation V5 des specs, à l'aide du dataset sankey et de d3-sankey.
Trois étages, stage 0 le sujet unique les retraites, stage 1 les cinq fils issus du fractionnement, stage 2 la réagrégation dans le tour de table réflexif. Épaisseur des liens selon value. Colore le fil valeurs en teal, financement en gris, EHPAD en gris clair pour signaler qu'il est écarté du sujet. Au survol, affiche le poids des liens et le label complet des nœuds. Aucun titre dans la zone graphique, une note de pied expliquant que le fractionnement intervient à la bascule de la 22e minute.
```

---

## 3. Recommandations techniques transverses et assemblage

### 3.1 Pile technique conseillée

Un seul fichier de données partagé, `data.js`, exportant les objets de la section 1. D3 v7 pour V1, V2, V4 et V5, qui ont besoin de placement géométrique fin. Pour V3, D3 également, de préférence à Chart.js, à cause du mélange courbe, marqueurs typés et bandes. Aucune dépendance hors CDN classique. Si tu vises un seul livrable, un `index.html` avec les cinq vues empilées et un sommaire ancré fonctionne bien.

### 3.2 Tableau de bord unifié

La valeur maximale s'obtient en couplant V2 et V3 par un curseur temporel commun. Un seul contrôle de temps pilote à la fois le déplacement des points sur le plan, V2, et la tête de lecture sur la frise, V3. L'utilisateur lit alors simultanément où en sont les positions et quel est le climat du débat à l'instant choisi. V1 sert d'écran d'accueil statique, V4 et V5 de vues d'analyse à part, accessibles par onglets construits après le streaming, jamais par `display:none` masquant du contenu non rendu.

### 3.3 Mode sombre, accessibilité, responsive

Toutes les couleurs doivent fonctionner en clair et en sombre, tester avec un fond quasi noir. Les axes et le texte par variables de thème, les couleurs de camp par teintes fixes de milieu de gamme, lisibles dans les deux modes. Chaque visualisation doit porter un résumé pour lecteurs d'écran, une phrase, et ne jamais reposer sur la couleur seule, d'où les étiquettes nominales toujours visibles et, pour V3, l'icône distincte des concessions. Largeurs fluides, le plan en `viewBox` SVG qui s'adapte, pas de hauteur fixe sur les canevas.

### 3.4 Palette

Réutilise les teintes du champ `color` pour la cohérence inter vues, individualisme libéral rouge, solidarisme teal, humanisme ambre, système mixte vert, positivisme gris, posture méta violet. La courbe de tension de V3 en une teinte chaude unique, par exemple un orange corail, pour ne pas entrer en collision avec les couleurs de camp.

---

## 4. Notes d'honnêteté analytique à reporter en légende

Trois mentions doivent accompagner les rendus, par souci de rigueur.

Les coordonnées, les seuils de tension et les poids sont interprétatifs, construits à partir d'une analyse de la transcription, ce ne sont pas des mesures objectives. Le placement encode un jugement argumenté.

L'attribution nominative des voix repose sur une reconstruction par le contenu et par les prénoms d'adresse, la diarisation automatique ayant échoué sur le cœur du débat. Les noms sont des hypothèses.

Près de 19 pour cent du débat, environ 16 minutes, sont non enregistrés par refus de participants. Les zones grisées signalent une mesure absente, pas un silence, et toute lecture de la tension dans ces fenêtres est indéterminée.
