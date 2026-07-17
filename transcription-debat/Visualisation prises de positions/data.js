// data.js — Données débat Retraites 2026-05-29
// Coordonnées interprétatives issues d'une analyse de transcription.
// Les axes, seuils de tension et placements encodent un jugement argumenté, pas des mesures objectives.

const DEBATE_DATA = {

  axes: {
    x: { min: -10, max: 10, leftLabel: "Liberté individuelle", rightLabel: "Égalité · solidarité" },
    y: { min: -10, max: 10, bottomLabel: "Données · technique", topLabel: "Valeurs · principes" },
    quadrants: {
      topLeft:    "Individualisme\nprincipiel",
      topRight:   "Solidarisme\nprincipiel",
      bottomLeft: "Libéralisme\ntechnique",
      bottomRight:"Technocratie\nredistributive"
    }
  },

  personas: [
    {
      id: "i1", label: "Interlocuteur 1", camp: "Individualisme libéral",
      color: "#D64545", weight: 1.0, entry: 0,
      kf: [[0,-9,6.5],[18,-9,7],[23,-7.6,6.4],[26,-9,7],[33,-7,6],[37,-8.6,6.8],[85,-9,7]],
      note: "Constance axiomatique. Deux excursions vers le centre : concessions tactiques sur le minimum (t≈23 min) et l'émotion (t≈33 min), suivies d'un retour."
    },
    {
      id: "i2", label: "Interlocuteur 2", camp: "Solidarisme égalitariste",
      color: "#0F8A6A", weight: 1.0, entry: 8,
      kf: [[8,7,3.2],[16,7.4,3.5],[31,6.5,2.6],[50,7,1.6],[62,7,1],[85,7,1.4]],
      note: "X stable autour de 7. Y descend : la voix s'ancre progressivement dans la technique (multiplicateurs budgétaires, comptes des caisses)."
    },
    {
      id: "i3", label: "Interlocuteur 3", camp: "Humanisme du minimum vital",
      color: "#E09020", weight: 0.6, entry: 30,
      kf: [[30,5,7],[33,5,7.6],[85,5,7]],
      note: "Statique, haut sur l'axe des valeurs, pathos assumé."
    },
    {
      id: "i4", label: "Interlocuteur 4", camp: "Assurantiel pragmatique",
      color: "#D85A30", weight: 0.55, entry: 33,
      kf: [[33,3,2],[35,3.4,1.4],[85,3,1.5]],
      note: "Plaide un socle redistributif à travers des cas concrets. Refuse la caricature des extrêmes."
    },
    {
      id: "i5", label: "Interlocuteur 5", camp: "Système mixte · conventions",
      color: "#639922", weight: 0.7, entry: 34,
      kf: [[34,1,-1],[36,1.6,-1.6],[66,2,-0.6],[85,4,0.2]],
      note: "Seule vraie dérive idéologique du débat. Part du centre constructif (conventions citoyennes, 2-3% capitalisation) et glisse vers la redistribution en clôture."
    },
    {
      id: "i6", label: "Interlocuteur 6", camp: "Sceptique prudent",
      color: "#8FBF4B", weight: 0.5, entry: 12,
      kf: [[12,1,-3],[40,1.5,-3],[85,1.6,-2.6]],
      note: "Empirique et prudent, proche du centre. Petits épargnants, suffisance des obligations, performances passées."
    },
    {
      id: "i7", label: "Interlocuteur 7", camp: "Positivisme technicien",
      color: "#6E6D68", weight: 0.7, entry: 6,
      kf: [[6,-1,-7],[85,-1,-7]],
      note: "Démographie, taux d'épargne et pouvoir d'achat des retraités. Très bas sur l'axe technique, neutre en valeurs."
    },
    {
      id: "i8", label: "Interlocuteur 8", camp: "Positivisme technicien",
      color: "#9A9992", weight: 0.45, entry: 66,
      kf: [[66,1,-8],[85,1,-8]],
      note: "Dissection budgétaire des EHPAD, périmètre comptable. Arrive tard dans le débat."
    },
    {
      id: "anim", label: "Animateur", camp: "Posture méta · processus",
      color: "#534AB7", weight: 0.5, entry: 0,
      kf: [[0,1,4],[72,2,5],[85,2,5]],
      note: "Gère le protocole, regrette le manque d'émotions, théorise la valeur du dissensus en clôture. Référence à Schopenhauer."
    }
  ],

  schools: [
    { id: "lib", label: "Individualisme libéral intégral",  cx: -8.2, cy: 6.6, rx: 2.2, ry: 1.8, color: "#D64545", members: ["i1"] },
    { id: "sol", label: "Solidarisme égalitariste",         cx:  7.0, cy: 2.2, rx: 1.8, ry: 2.0, color: "#0F8A6A", members: ["i2"] },
    { id: "hum", label: "Humanisme du minimum vital",       cx:  4.2, cy: 5.2, rx: 2.4, ry: 2.6, color: "#E09020", members: ["i3","i4"] },
    { id: "mix", label: "Pragmatisme réformiste",           cx:  1.6, cy:-1.4, rx: 2.6, ry: 2.2, color: "#639922", members: ["i5","i6"] },
    { id: "tec", label: "Positivisme technicien",           cx: -0.2, cy:-7.4, rx: 2.6, ry: 1.8, color: "#6E6D68", members: ["i7","i8"] }
  ],

  events: [
    { t:  1,    type: "cadrage",    magnitude: 2, title: "Énoncé de la doxa",              desc: "Un participant énonce l'opinion dominante avant de donner la sienne, orientant le terrain sur le coût et l'efficacité de l'État." },
    { t:  6,    type: "technique",  magnitude: 1, title: "Le ratio démographique",         desc: "4 actifs par retraité en 1960, 1,8 aujourd'hui, 1,4 en 2070. Socle de fait partagé." },
    { t: 16,    type: "dissensus",  magnitude: 2, title: "Liberté contre égalité",         desc: "Première formulation explicite du conflit de valeurs, identifié par les deux camps comme le vrai point de friction." },
    { t: 18,    type: "dissensus",  magnitude: 2, title: "La redistribution comme vol",    desc: "La solidarité forcée requalifiée en captation par le pôle individualiste." },
    { t: 22.5,  type: "dissensus",  magnitude: 3, title: "L'État comme abonnement",        desc: "Pivot dramaturgique. Métaphore du service résiliable, réplique « prison », surenchère exil et exit tax. Le sujet retraite se fractionne en trois fils." },
    { t: 25,    type: "consensus",  magnitude: 2, title: "Intérêt d'un système mixte",     desc: "Recentrage. Tous sauf l'individualisme intégral admettent qu'un dosage mérite examen." },
    { t: 31,    type: "concession", magnitude: 2, title: "L'égalité n'est pas absolue",    desc: "Le pôle solidariste recentre sa position sur la seule réduction des écarts." },
    { t: 33,    type: "concession", magnitude: 3, title: "Cancer et accident",              desc: "Irruption du concret incarné. Le pôle individualiste passe en défensive et concède comprendre l'émotion." },
    { t: 37,    type: "consensus",  magnitude: 2, title: "Espérance de vie des ouvriers",  desc: "Aporie partagée. La répartition uniforme garantit moins d'années de pension aux ouvriers — plusieurs reconnaissent la faille sans solution." },
    { t: 50,    type: "technique",  magnitude: 3, title: "Requalification du déficit",     desc: "Le déséquilibre projeté provient d'une baisse des recettes (moins de fonctionnaires, point d'indice gelé), pas d'une explosion des besoins." },
    { t: 60,    type: "technique",  magnitude: 1, title: "Laffer et théorème de Rolle",    desc: "Moment d'épistémologie : la courbe de Laffer reconnue comme non empirique, seuls les zéros aux extrémités font consensus, maximum déduit par Rolle." },
    { t: 68,    type: "consensus",  magnitude: 2, title: "EHPAD, un sujet distinct",       desc: "Accord pour séparer la dépendance (enjeu de santé et de budget) du mécanisme de retraite." },
    { t: 71,    type: "meta",       magnitude: 2, title: "Tour de table",                  desc: "Bascule de registre, du combat à la réflexivité. Apaisement institutionnalisé." },
    { t: 82.5,  type: "meta",       magnitude: 2, title: "Clôture — éloge du dissensus",   desc: "Référence à L'art d'avoir toujours raison : l'opinion se transforme après le débat plutôt que pendant." }
  ],

  tension: [
    [0,38],[3,42],[10,52],[15,68],[18,74],[22,82],[23,90],[24,72],[25,52],[26,58],
    [31,72],[33,80],[35,58],[37,55],[40,60],[47,55],[50,46],[56,48],[57,50],[60,58],
    [62,55],[66,46],[68,44],[71,38],[74,42],[78,40],[82,32],[85,30]
  ],

  refus: [[40.7,47.3],[56.6,57.1],[62.6,66.5],[75.6,75.7],[77.4,81.9],[81.9,82.6]],
  totalRedactedMinutes: 16.3,
  totalDurationMinutes: 85,

  concepts: {
    regular: ["Mérite","Capitalisation","Répartition","Croissance","Risque de l'existence","Démographie"],

    fauxConsensus: [
      { concept: "Liberté",       senseA: "Négative — absence de contrainte sur le revenu",    campA: "lib", senseB: "Positive — capacité effective d'agir",            campB: "sol" },
      { concept: "Solidarité",    senseA: "Vertu volontaire entre proches",                     campA: "lib", senseB: "Obligation institutionnelle universelle",          campB: "sol" },
      { concept: "Minimum vital", senseA: "Garanti par une assurance privée",                   campA: "lib", senseB: "Garanti par la collectivité",                     campB: "hum" },
      { concept: "Égalité",       senseA: "À neutraliser — négation de la différence",          campA: "lib", senseB: "À promouvoir — réduction des écarts",             campB: "sol" },
      { concept: "État",          senseA: "Acteur le plus sûr, tient sa promesse depuis 50 ans",campA: "tec", senseB: "Caisse unique fongible, source de confusion",     campB: "mix" }
    ],

    gordian: [
      { concept: "Redistribution",         poleA: "Vol, captation",                         campA: "lib", poleB: "Assurance de la liberté",              campB: "sol", why: "Désaccord de définition — aucune donnée ne tranche." },
      { concept: "Hiérarchie des valeurs", poleA: "Liberté au sommet",                      campA: "lib", poleB: "Égalité conditionne la liberté",        campB: "sol", why: "Conflit de valeurs ultimes." },
      { concept: "Statut de l'inégalité",  poleA: "Neutre tant que la liberté est garantie",campA: "lib", poleB: "Problème à corriger",                  campB: "sol", why: "Le désaccord glisse de l'empirique vers le normatif." }
    ],

    consensus: [
      { label: "Réalité du choc démographique",              t: 6,  scope: "tous" },
      { label: "Intérêt d'un système mixte",                 t: 25, scope: "tous sauf lib" },
      { label: "Espérance de vie — faille de répartition",   t: 37, scope: "large" },
      { label: "EHPAD — sujet distinct de la retraite",      t: 68, scope: "tous" },
      { label: "Valeur du dissensus argumenté",              t: 82, scope: "tous, méta" }
    ],

    concessions: [
      { by: "lib", t: 23, label: "Un minimum peut exister, mais géré au privé",                     targetConcept: "Minimum vital" },
      { by: "lib", t: 35, label: "L'inégalité d'espérance de vie est réelle, l'émotion se comprend", targetConcept: "Statut de l'inégalité" },
      { by: "sol", t: 31, label: "L'égalité n'est pas une valeur absolue",                           targetConcept: "Égalité" },
      { by: "i5",  t: 66, label: "Glissement vers la réduction des pensions les plus hautes",        targetConcept: "Redistribution" }
    ]
  },

  sankey: {
    nodes: [
      { id: "retraites",   label: "Les retraites",                         stage: 0, color: "#888888" },
      { id: "abonnement",  label: "Contrat social",                        stage: 1, color: "#534AB7" },
      { id: "valeurs",     label: "Écarts de valeurs",                     stage: 1, color: "#0F8A6A" },
      { id: "minimum",     label: "Minimum vital",                         stage: 1, color: "#E09020" },
      { id: "financement", label: "Financement · déficit",                 stage: 1, color: "#6E6D68" },
      { id: "ehpad",       label: "EHPAD · dépendance (écarté)",           stage: 1, color: "#bbbbbb" },
      { id: "reflexif",    label: "Tour de table réflexif",                stage: 2, color: "#4A90D9" }
    ],
    links: [
      { source: "retraites",   target: "abonnement",  value: 9 },
      { source: "retraites",   target: "valeurs",     value: 10 },
      { source: "retraites",   target: "minimum",     value: 7 },
      { source: "retraites",   target: "financement", value: 8 },
      { source: "retraites",   target: "ehpad",       value: 4 },
      { source: "abonnement",  target: "reflexif",    value: 6 },
      { source: "valeurs",     target: "reflexif",    value: 8 },
      { source: "minimum",     target: "reflexif",    value: 6 },
      { source: "financement", target: "reflexif",    value: 5 },
      { source: "ehpad",       target: "reflexif",    value: 2 }
    ]
  }
};
