// data.js — généré par build_unified_viz.py. Carte et camps calculés à partir des prises de position relevées.

window.UNIFIED_DATA = {
  "meta": {
    "topic": "Comment assurer la sécurité de tous en France ?",
    "date": "2026-10-14",
    "tables": [
      {
        "key": "A",
        "code": "3EBF76",
        "label": "Table A"
      },
      {
        "key": "B",
        "code": "3E24D5",
        "label": "Table B"
      }
    ]
  },
  "axes": {
    "x": {
      "variance": 0.518,
      "enonces": [
        {
          "text": "La violence est légitime ou efficace pour se faire entendre",
          "poids": 0.544,
          "accord_vers": "plus"
        },
        {
          "text": "La police et la justice traitent mal les violences sexuelles parce qu'elles défendent l'ordre établi",
          "poids": 0.504,
          "accord_vers": "plus"
        },
        {
          "text": "Le capitalisme profite du sexisme",
          "poids": 0.421,
          "accord_vers": "plus"
        },
        {
          "text": "Les détenus ont plus peur des autres détenus que des gardiens",
          "poids": -0.355,
          "accord_vers": "moins"
        }
      ]
    },
    "y": {
      "variance": 0.231,
      "enonces": [
        {
          "text": "Il faut légaliser ou dépénaliser en partie les drogues",
          "poids": 0.877,
          "accord_vers": "plus"
        },
        {
          "text": "Imposer des logements sociaux dans les quartiers et immeubles aisés est une bonne idée",
          "poids": 0.343,
          "accord_vers": "plus"
        },
        {
          "text": "Les détenus ont plus peur des autres détenus que des gardiens",
          "poids": 0.252,
          "accord_vers": "plus"
        },
        {
          "text": "La police et la justice traitent mal les violences sexuelles parce qu'elles défendent l'ordre établi",
          "poids": -0.192,
          "accord_vers": "moins"
        }
      ]
    },
    "lecture": null
  },
  "method": {
    "voix": 14,
    "placees": 10,
    "enonces": 11,
    "enonces_carte": 11,
    "remplissage": 0.364,
    "min_prises": 3,
    "variance": [
      0.518,
      0.231
    ],
    "camps": {
      "nets": false,
      "k": 0,
      "silhouette": null,
      "silhouette_hasard_95": null,
      "stabilite": null,
      "raison": "tous les regroupements possibles isolent une seule personne, ce qui ne fait pas un camp"
    },
    "concordance_lecture": {
      "r2": 0.454,
      "hasard_95": 0.332,
      "n": 10
    }
  },
  "map": [
    {
      "table": "A",
      "x": 0.973,
      "y": 2.761,
      "weight": 17.203
    },
    {
      "table": "A",
      "x": 0.09,
      "y": 2.72,
      "weight": 9.233
    },
    {
      "table": "A",
      "x": 0.274,
      "y": -0.855,
      "weight": 18.213
    },
    {
      "table": "A",
      "x": 0.056,
      "y": 0.916,
      "weight": 7.749
    },
    {
      "table": "A",
      "x": 0.566,
      "y": 1.122,
      "weight": 11.61
    },
    {
      "table": "A",
      "x": -1.371,
      "y": -6.212,
      "weight": 17.997
    },
    {
      "table": "B",
      "x": 2.867,
      "y": -3.24,
      "weight": 13.134
    },
    {
      "table": "B",
      "x": 1.599,
      "y": 1.979,
      "weight": 20.883
    },
    {
      "table": "B",
      "x": 4.812,
      "y": 0.884,
      "weight": 18.004
    },
    {
      "table": "B",
      "x": -9.0,
      "y": 0.682,
      "weight": 27.682
    }
  ],
  "pre_debate": {
    "participation": {
      "votants_places": 18,
      "assertions_approuvees": 16,
      "assertions_analysees": 16,
      "votes": 288
    },
    "consensus": [
      {
        "rang": 1,
        "enonce": "Le problème de la police est quantitatif : plus d'effectifs, de véhicules et de brigades.",
        "score": 1,
        "pour": 0,
        "contre": 15,
        "abstention": 3,
        "blanc": 0,
        "part_pour": 0,
        "par_camp": [
          {
            "camp": 1,
            "pour": 0,
            "contre": 6,
            "part_pour": 0
          },
          {
            "camp": 2,
            "pour": 0,
            "contre": 6,
            "part_pour": 0
          },
          {
            "camp": 3,
            "pour": 0,
            "contre": 3,
            "part_pour": 0
          }
        ],
        "sens": "rejet"
      },
      {
        "rang": 2,
        "enonce": "La prison est nécessaire.",
        "score": 1,
        "pour": 15,
        "contre": 0,
        "abstention": 3,
        "blanc": 0,
        "part_pour": 1,
        "par_camp": [
          {
            "camp": 1,
            "pour": 6,
            "contre": 0,
            "part_pour": 1
          },
          {
            "camp": 2,
            "pour": 5,
            "contre": 0,
            "part_pour": 1
          },
          {
            "camp": 3,
            "pour": 4,
            "contre": 0,
            "part_pour": 1
          }
        ],
        "sens": "adhesion"
      },
      {
        "rang": 3,
        "enonce": "La meilleure politique de sécurité est une politique sociale : école, insertion, soutien aux familles.",
        "score": 0.75,
        "pour": 16,
        "contre": 2,
        "abstention": 0,
        "blanc": 0,
        "part_pour": 0.889,
        "par_camp": [
          {
            "camp": 1,
            "pour": 7,
            "contre": 0,
            "part_pour": 1
          },
          {
            "camp": 2,
            "pour": 6,
            "contre": 1,
            "part_pour": 0.857
          },
          {
            "camp": 3,
            "pour": 3,
            "contre": 1,
            "part_pour": 0.75
          }
        ],
        "sens": "adhesion"
      }
    ],
    "dissensus": [
      {
        "rang": 1,
        "enonce": "Pour réduire la surpopulation carcérale, il faut construire des places plutôt que réduire les peines.",
        "score": 1,
        "pour": 7,
        "contre": 6,
        "abstention": 5,
        "blanc": 0,
        "part_pour": 0.538,
        "par_camp": [
          {
            "camp": 1,
            "pour": 0,
            "contre": 5,
            "part_pour": 0
          },
          {
            "camp": 2,
            "pour": 3,
            "contre": 1,
            "part_pour": 0.75
          },
          {
            "camp": 3,
            "pour": 4,
            "contre": 0,
            "part_pour": 1
          }
        ]
      },
      {
        "rang": 2,
        "enonce": "L'insécurité en France est résiduelle, elle est surtout ressentie à cause des médias.",
        "score": 0.833,
        "pour": 9,
        "contre": 7,
        "abstention": 2,
        "blanc": 0,
        "part_pour": 0.563,
        "par_camp": [
          {
            "camp": 1,
            "pour": 6,
            "contre": 0,
            "part_pour": 1
          },
          {
            "camp": 2,
            "pour": 1,
            "contre": 5,
            "part_pour": 0.167
          },
          {
            "camp": 3,
            "pour": 2,
            "contre": 2,
            "part_pour": 0.5
          }
        ]
      },
      {
        "rang": 3,
        "enonce": "Sans sanction rapide et certaine, aucune politique de prévention ne protège les victimes.",
        "score": 0.8,
        "pour": 6,
        "contre": 7,
        "abstention": 5,
        "blanc": 0,
        "part_pour": 0.462,
        "par_camp": [
          {
            "camp": 1,
            "pour": 1,
            "contre": 3,
            "part_pour": 0.25
          },
          {
            "camp": 2,
            "pour": 1,
            "contre": 4,
            "part_pour": 0.2
          },
          {
            "camp": 3,
            "pour": 4,
            "contre": 0,
            "part_pour": 1
          }
        ]
      }
    ],
    "camps": [
      {
        "camp": 1,
        "couleur": "#2b4a86",
        "taille": 7,
        "part": 0.389,
        "centre": {
          "x": -5.58,
          "y": -0.249
        },
        "enonces_caracteristiques": [
          {
            "enonce": "Pour réduire la surpopulation carcérale, il faut construire des places plutôt que réduire les peines.",
            "sens": "contre",
            "part_pour_camp": 0,
            "part_pour_reste": 0.875
          },
          {
            "enonce": "L'insécurité en France est résiduelle, elle est surtout ressentie à cause des médias.",
            "sens": "pour",
            "part_pour_camp": 1,
            "part_pour_reste": 0.3
          },
          {
            "enonce": "Un État doit consacrer ses moyens de sécurité d'abord aux risques qui tuent le plus, pas à ceux qui inquiètent le plus.",
            "sens": "pour",
            "part_pour_camp": 1,
            "part_pour_reste": 0.5
          }
        ],
        "synthese": "Relativise l'insécurité, jugée surtout ressentie et amplifiée par les médias, et veut concentrer les moyens sur les risques qui tuent le plus. Préfère réduire les peines plutôt que construire des places de prison."
      },
      {
        "camp": 2,
        "couleur": "#b04a3c",
        "taille": 7,
        "part": 0.389,
        "centre": {
          "x": 3.424,
          "y": 3.822
        },
        "enonces_caracteristiques": [
          {
            "enonce": "Un État doit consacrer ses moyens de sécurité d'abord aux risques qui tuent le plus, pas à ceux qui inquiètent le plus.",
            "sens": "contre",
            "part_pour_camp": 0.333,
            "part_pour_reste": 1
          },
          {
            "enonce": "L'insécurité en France est résiduelle, elle est surtout ressentie à cause des médias.",
            "sens": "contre",
            "part_pour_camp": 0.167,
            "part_pour_reste": 0.8
          },
          {
            "enonce": "Le narcotrafic ne se combat qu'en s'attaquant à la demande, y compris en sanctionnant les consommateurs.",
            "sens": "pour",
            "part_pour_camp": 0.6,
            "part_pour_reste": 0
          }
        ],
        "synthese": "Prend l'insécurité au sérieux, pas comme un simple ressenti, et veut combattre le narcotrafic par la demande, consommateurs compris. Plutôt favorable à de nouvelles places de prison, sans faire de la sanction rapide une priorité."
      },
      {
        "camp": 3,
        "couleur": "#3f8462",
        "taille": 4,
        "part": 0.222,
        "centre": {
          "x": 3.77,
          "y": -6.245
        },
        "enonces_caracteristiques": [
          {
            "enonce": "Sans sanction rapide et certaine, aucune politique de prévention ne protège les victimes.",
            "sens": "pour",
            "part_pour_camp": 1,
            "part_pour_reste": 0.222
          },
          {
            "enonce": "Pour réduire la surpopulation carcérale, il faut construire des places plutôt que réduire les peines.",
            "sens": "pour",
            "part_pour_camp": 1,
            "part_pour_reste": 0.333
          },
          {
            "enonce": "Il faut plusieurs polices privées en concurence",
            "sens": "pour",
            "part_pour_camp": 0.5,
            "part_pour_reste": 0
          }
        ],
        "synthese": "Met la sanction rapide et certaine avant la prévention et veut construire des places de prison plutôt que réduire les peines. Seul camp où l'idée de polices privées en concurrence trouve des soutiens."
      }
    ],
    "axes": {
      "x": {
        "left": "Insécurité relativisée, réduire les peines",
        "right": "Insécurité prise au sérieux, plus de places de prison"
      },
      "y": {
        "bottom": "Sanction rapide et certaine d'abord",
        "top": "Cibler le narcotrafic, sanction rapide secondaire"
      }
    },
    "carte": {
      "points": [
        {
          "x": -6.561,
          "y": -0.777,
          "camp": 1
        },
        {
          "x": -6.532,
          "y": 0.974,
          "camp": 1
        },
        {
          "x": -6.468,
          "y": 1.825,
          "camp": 1
        },
        {
          "x": -6.271,
          "y": -0.714,
          "camp": 1
        },
        {
          "x": -5.409,
          "y": -0.48,
          "camp": 1
        },
        {
          "x": -4.446,
          "y": 0.428,
          "camp": 1
        },
        {
          "x": -3.357,
          "y": -3.011,
          "camp": 1
        },
        {
          "x": -0.985,
          "y": 5.967,
          "camp": 2
        },
        {
          "x": 0.119,
          "y": 0.784,
          "camp": 2
        },
        {
          "x": 3.242,
          "y": 2.691,
          "camp": 2
        },
        {
          "x": 3.844,
          "y": 5.223,
          "camp": 2
        },
        {
          "x": 4.446,
          "y": 3.654,
          "camp": 2
        },
        {
          "x": 4.796,
          "y": 0.974,
          "camp": 2
        },
        {
          "x": 8.509,
          "y": 7.454,
          "camp": 2
        },
        {
          "x": -1.279,
          "y": -4.825,
          "camp": 3
        },
        {
          "x": 1.859,
          "y": -5.286,
          "camp": 3
        },
        {
          "x": 6.617,
          "y": -9.0,
          "camp": 3
        },
        {
          "x": 7.881,
          "y": -5.874,
          "camp": 3
        }
      ],
      "variance_expliquee": [
        0.237,
        0.159
      ]
    }
  },
  "flash": {
    "summary": "Quatorze participants, sur deux tables, ont débattu de la même question : comment assurer la sécurité de tous en France ? Personne n'a contesté que les médias et les réseaux exagèrent le sentiment d'insécurité. Les deux tables jugent la prison inefficace pour réinsérer, la table A la gardant pour les personnes dangereuses, et la plupart penchent pour légaliser en partie les drogues. Ce qui sépare surtout les participants, c'est la confiance accordée à la police, à la justice et à l'État. Personne n'a changé d'avis.",
    "ranking": {
      "consensus": [
        {
          "text": "L'insécurité est surtout ressentie, exagérée par les médias et les réseaux",
          "side": "pour",
          "p": 6,
          "c": 0,
          "nu": 3,
          "agreement": 1.0,
          "score_consensus": 0.6364,
          "score_dissensus": null
        },
        {
          "text": "Il faut légaliser ou dépénaliser en partie les drogues",
          "side": "pour",
          "p": 5,
          "c": 1,
          "nu": 2,
          "agreement": 0.667,
          "score_consensus": 0.6,
          "score_dissensus": null
        }
      ],
      "consensus_ties": [],
      "dissensus": [],
      "dissensus_ties": []
    },
    "groups": [],
    "n_participants": 14,
    "n_common_statements": 2
  },
  "tables": [
    {
      "key": "A",
      "code": "3EBF76",
      "label": "Table A",
      "duration": 109.2,
      "summary": "Partie de la doxa qui lie délinquance, prisons pleines et immigration, la discussion a rapidement dérivé vers la prison et la réinsertion, puis vers le logement social et la mixité, la drogue, et enfin les violences sexuelles et les féminicides. Presque tous jugent la prison nécessaire pour les personnes dangereuses mais inefficace pour les autres, et préfèrent accompagner et réinsérer. Le principal désaccord oppose ceux qui défendent la mixité sociale par le logement à une voix libérale qui y voit corruption et électoralisme, puis la légalisation partielle des drogues, refusée par une seule voix. Une proposition de mettre la police et la justice en concurrence est restée isolée. Personne n'a explicitement changé d'avis.",
      "ranking": {
        "consensus": [
          {
            "text": "Il faut accompagner et réinsérer plutôt que seulement enfermer",
            "side": "pour",
            "p": 6,
            "c": 0,
            "nu": 0,
            "agreement": 1.0,
            "score_consensus": 0.875,
            "score_dissensus": null
          },
          {
            "text": "La prison est nécessaire pour les personnes dangereuses",
            "side": "pour",
            "p": 3,
            "c": 0,
            "nu": 0,
            "agreement": 1.0,
            "score_consensus": 0.8,
            "score_dissensus": null
          },
          {
            "text": "Il faut légaliser ou dépénaliser en partie les drogues",
            "side": "pour",
            "p": 3,
            "c": 1,
            "nu": 0,
            "agreement": 0.5,
            "score_consensus": 0.6667,
            "score_dissensus": null
          }
        ],
        "consensus_ties": [],
        "dissensus": [
          {
            "text": "Il faut mettre la police et la justice en concurrence",
            "side": "pour",
            "p": 1,
            "c": 1,
            "nu": 1,
            "agreement": 0.0,
            "score_consensus": 0.4,
            "score_dissensus": null
          }
        ],
        "dissensus_ties": []
      },
      "groups": [],
      "unplaced": 1,
      "kinds": {
        "coeur": {
          "label": "La question posée",
          "desc": "Prison, réinsertion, quartiers, drogue, violences sexuelles."
        },
        "connexe": {
          "label": "Questions liées",
          "desc": "Médias, réseaux sociaux et exploitation politique de la peur."
        },
        "annexe": {
          "label": "Sujets annexes",
          "desc": "Rôle de l'État, corruption, justice privée, bilan du débat."
        }
      },
      "themes": [
        {
          "id": "medias",
          "kind": "connexe",
          "short": "Médias",
          "color": "#8E44AD",
          "label": "Médias et sentiment d'insécurité",
          "desc": "Réseaux sociaux, information continue et exploitation politique de la peur."
        },
        {
          "id": "prison",
          "kind": "coeur",
          "short": "Prison",
          "color": "#184795",
          "label": "Prison, peines et justice",
          "desc": "Efficacité de la prison, coût, libération médicale, tribunaux, peines selon les délits."
        },
        {
          "id": "travail",
          "kind": "coeur",
          "short": "Emploi",
          "color": "#16A085",
          "label": "Réinsertion, emploi et code du travail",
          "desc": "Quartiers prioritaires, intégration par le travail, assouplissement du code du travail, grands travaux."
        },
        {
          "id": "causes",
          "kind": "coeur",
          "short": "Causes",
          "color": "#27AE60",
          "label": "Causes sociales : investissement et éducation",
          "desc": "Paix sociale ou avenir, cités des années soixante-dix, culture scolaire, lycées."
        },
        {
          "id": "logement",
          "kind": "coeur",
          "short": "Logement",
          "color": "#C0392B",
          "label": "Logement social, mixité et quartiers",
          "desc": "Quotas, mixité dans un immeuble, coût pour l'État, corruption, fuite des voisins."
        },
        {
          "id": "etat",
          "kind": "annexe",
          "short": "État",
          "color": "#34495E",
          "label": "Rôle de l'État : monopole, corruption, justice privée",
          "desc": "Monopole de l'État, corruption, mise en concurrence de la police et de la justice."
        },
        {
          "id": "drogue",
          "kind": "coeur",
          "short": "Drogue",
          "color": "#E67E22",
          "label": "Drogue et trafic",
          "desc": "Légalisation, dépénalisation, plaque tournante européenne, lien avec la criminalité."
        },
        {
          "id": "violences",
          "kind": "coeur",
          "short": "Violences sexuelles",
          "color": "#C0507A",
          "label": "Violences sexuelles, féminicides et justice",
          "desc": "Chiffres, éducation, plainte, dispositifs d'alerte, jugement des viols."
        },
        {
          "id": "bilan",
          "kind": "annexe",
          "short": "Bilan",
          "color": "#D4AC0D",
          "label": "Bilan du débat",
          "desc": "Cadrage, changements de sujet, modération, débat suivant."
        }
      ],
      "timeline": [
        [
          0,
          2.78,
          "medias"
        ],
        [
          2.78,
          11.7,
          "prison"
        ],
        [
          11.7,
          14.33,
          "travail"
        ],
        [
          14.33,
          15.5,
          null
        ],
        [
          15.5,
          17.28,
          "prison"
        ],
        [
          17.28,
          19.4,
          "travail"
        ],
        [
          19.4,
          25.7,
          "causes"
        ],
        [
          25.7,
          48.78,
          "logement"
        ],
        [
          48.78,
          49.55,
          null
        ],
        [
          49.55,
          51.23,
          "etat"
        ],
        [
          51.23,
          54.98,
          "logement"
        ],
        [
          54.98,
          56.75,
          null
        ],
        [
          56.75,
          68.0,
          "drogue"
        ],
        [
          68.0,
          69.72,
          "violences"
        ],
        [
          69.72,
          70.37,
          null
        ],
        [
          70.37,
          90.47,
          "violences"
        ],
        [
          90.47,
          92.47,
          "bilan"
        ],
        [
          92.47,
          94.62,
          "etat"
        ],
        [
          94.62,
          96.83,
          "prison"
        ],
        [
          96.83,
          109.17,
          "bilan"
        ]
      ],
      "mentions": [],
      "theme_minutes": {
        "medias": 2.78,
        "prison": 12.91,
        "travail": 4.75,
        "__anim__": 4.36,
        "causes": 6.3,
        "logement": 26.83,
        "etat": 3.83,
        "drogue": 11.25,
        "violences": 21.82,
        "bilan": 14.34
      },
      "personas": [
        {
          "key": "A1",
          "placed": true,
          "x": 0.973,
          "y": 2.761,
          "kf": [
            [
              34.73,
              0.428,
              0.844
            ],
            [
              59.32,
              0.428,
              0.844
            ],
            [
              60.32,
              0.973,
              2.761
            ],
            [
              109.2,
              0.973,
              2.761
            ]
          ],
          "weight": 17.203,
          "entry": 0.94,
          "camp": "Sans camp net",
          "note": "Voix la plus constante pour la prévention : juge que le bâton coûte plus cher que la carotte, veut un accompagnement personnalisé et de l'éducation dès le plus jeune âge, défend un quota de logements sociaux dans chaque immeuble et la légalisation d'une partie des drogues douces pour casser les réseaux.",
          "color": "var(--ta)",
          "speech": [
            [
              0.94,
              0.95
            ],
            [
              1.01,
              1.47
            ],
            [
              8.21,
              8.51
            ],
            [
              8.64,
              9.85
            ],
            [
              23.26,
              24.67
            ],
            [
              24.73,
              24.76
            ],
            [
              25.08,
              25.71
            ],
            [
              26.99,
              27.24
            ],
            [
              34.73,
              37.24
            ],
            [
              38.38,
              38.47
            ],
            [
              42.5,
              43.04
            ],
            [
              43.98,
              44.36
            ],
            [
              52.01,
              52.74
            ],
            [
              53.15,
              53.22
            ],
            [
              53.29,
              53.34
            ],
            [
              53.9,
              53.91
            ],
            [
              53.98,
              54.07
            ],
            [
              59.32,
              60.15
            ],
            [
              60.32,
              60.37
            ],
            [
              66.19,
              66.86
            ],
            [
              67.21,
              67.68
            ],
            [
              67.76,
              68.2
            ],
            [
              68.26,
              68.32
            ],
            [
              70.34,
              70.38
            ],
            [
              72.41,
              72.7
            ],
            [
              79.16,
              81.02
            ],
            [
              81.07,
              81.55
            ],
            [
              85.77,
              86.87
            ],
            [
              87.17,
              87.81
            ],
            [
              90.27,
              90.37
            ],
            [
              90.86,
              92.24
            ],
            [
              108.44,
              108.44
            ],
            [
              108.59,
              108.63
            ]
          ],
          "points": [
            {
              "t": 1.01,
              "stance": "Estime que les réseaux sociaux et l'information continue font remarquer bien plus de faits divers qu'autrefois, ce qui donne l'impression d'une insécurité plus présente."
            },
            {
              "t": 8.64,
              "stance": "Pense que la prison n'est parfois pas la bonne réponse : un accompagnement personne par personne pour réinsérer par le travail coûterait moins cher que le bâton actuel, même si les fonds ne seront sans doute jamais débloqués."
            },
            {
              "t": 23.26,
              "stance": "Juge que ce n'est pas qu'une question d'argent : la différence entre quartiers tient surtout à la culture scolaire, au suivi après les cours et aux activités culturelles, plus qu'à un terrain de sport."
            },
            {
              "t": 25.08,
              "stance": "Doute que des quotas dans les lycées favorisés changent grand-chose : l'ouverture existe déjà pour quelques très bons élèves et profite surtout aux meilleurs lycées parisiens."
            },
            {
              "t": 34.73,
              "stance": "Défend un quota de logements sociaux dans chaque immeuble plutôt que des bâtiments pour pauvres ; les riverains n'ont pas à décider qui peut habiter près d'eux, et les promoteurs pourraient être compensés par l'impôt sur le revenu."
            },
            {
              "t": 42.5,
              "stance": "Illustre par l'anniversaire d'un enfant que la mixité rapproche les milieux et peut aider durablement les enfants défavorisés."
            },
            {
              "t": 59.32,
              "stance": "Distingue le consommateur du vendeur et pense que légaliser une partie des drogues douces pourrait toucher les grands trafiquants en tuant leur marché."
            },
            {
              "t": 67.76,
              "stance": "Accepte que la France devienne une plaque tournante de la drogue si cela réduit la criminalité et les nuisances pour la population."
            },
            {
              "t": 79.16,
              "stance": "Cherche pourquoi les violences domestiques viennent surtout d'hommes et place la cause dans l'éducation dès le plus jeune âge, avec une intervention auprès des parents."
            },
            {
              "t": 85.77,
              "stance": "Insiste pour agir en amont des violences conjugales plutôt qu'au dernier moment, quand une femme les subit depuis des années."
            },
            {
              "t": 90.86,
              "stance": "Juge injuste de traiter le viol comme un crime à part faute de moyens : tous les justiciables paient des impôts pour être protégés."
            }
          ]
        },
        {
          "key": "A2",
          "placed": true,
          "x": 0.09,
          "y": 2.72,
          "kf": [
            [
              47.9,
              -0.564,
              1.035
            ],
            [
              62.95,
              -0.564,
              1.035
            ],
            [
              63.95,
              0.113,
              2.927
            ],
            [
              93.47,
              0.113,
              2.927
            ],
            [
              94.47,
              0.09,
              2.72
            ],
            [
              109.2,
              0.09,
              2.72
            ]
          ],
          "weight": 9.233,
          "entry": 0.04,
          "camp": "Sans camp net",
          "note": "Voit un problème systémique de peines et de prisons plutôt qu'un problème d'immigration, veut traiter les causes par de grands travaux et des industries publiques offrant des emplois stables, accepte un encadrement étatique de la drogue et préfère l'indépendance financière des femmes à l'ingérence dans les familles.",
          "color": "var(--ta)",
          "speech": [
            [
              0.04,
              0.94
            ],
            [
              17.3,
              19.28
            ],
            [
              19.36,
              19.39
            ],
            [
              21.6,
              21.67
            ],
            [
              21.75,
              21.83
            ],
            [
              32.88,
              34.72
            ],
            [
              47.9,
              48.77
            ],
            [
              53.23,
              53.27
            ],
            [
              62.95,
              63.86
            ],
            [
              81.55,
              82.67
            ],
            [
              83.01,
              83.07
            ],
            [
              83.14,
              83.14
            ],
            [
              87.98,
              88.37
            ],
            [
              93.47,
              93.6
            ],
            [
              95.74,
              95.81
            ],
            [
              106.55,
              106.73
            ],
            [
              106.79,
              107.02
            ],
            [
              107.25,
              107.41
            ],
            [
              107.5,
              107.59
            ],
            [
              107.66,
              107.66
            ],
            [
              108.96,
              109.06
            ]
          ],
          "points": [
            {
              "t": 0.04,
              "stance": "Reconnaît une part de réalité aux faits divers mais voit surtout un problème systémique de peines et de capacité des prisons, sans lien nécessaire avec l'immigration."
            },
            {
              "t": 17.3,
              "stance": "Juge la libération médicale des détenus âgés efficace mais à nuancer, et préfère revenir aux causes : grands travaux publics et industries souveraines offriraient des CDI solides, même avec un casier."
            },
            {
              "t": 32.88,
              "stance": "Voit dans les HLM une passerelle sociale utile mais fragile, qui peut faire fuir les élites ; rappelle que l'éducation et la santé sont aussi des infrastructures essentielles et que le budget des Jeux olympiques aurait pu servir à plus durable."
            },
            {
              "t": 47.9,
              "stance": "Soutient que mélanger les populations unifie la démocratie, à condition que l'accès aux HLM soit très encadré et sélectif pour éliminer la corruption et rassurer."
            },
            {
              "t": 62.95,
              "stance": "Voit dans l'encadrement de la consommation de drogue par l'État un compromis qui évite les produits non maîtrisés, tout en comprenant l'inquiétude des parents."
            },
            {
              "t": 81.55,
              "stance": "Pour les violences conjugales, préfère garantir l'indépendance financière des femmes et des logements d'urgence plutôt que laisser l'État s'ingérer dans les familles."
            },
            {
              "t": 93.47,
              "stance": "Doute de l'idée de mettre les justices en concurrence et demande qui choisirait le tribunal, l'agressé ou l'agresseur."
            }
          ]
        },
        {
          "key": "A3",
          "placed": true,
          "x": 0.274,
          "y": -0.855,
          "kf": [
            [
              5.26,
              0.372,
              -0.072
            ],
            [
              27.8,
              0.372,
              -0.072
            ],
            [
              28.8,
              0.274,
              -0.855
            ],
            [
              109.2,
              0.274,
              -0.855
            ]
          ],
          "weight": 18.213,
          "entry": 1.47,
          "camp": "Sans camp net",
          "note": "Pense que le système judiciaire s'acharne sur les mêmes personnes sans les aider ; garde la prison pour les personnes dangereuses, veut libérer les détenus âgés ou malades, relie la drogue à la criminalité des cités et voit dans les violences sexuelles un sexisme systémique à traiter par la formation des jeunes.",
          "color": "var(--ta)",
          "speech": [
            [
              1.47,
              2.77
            ],
            [
              4.91,
              5.14
            ],
            [
              5.26,
              7.14
            ],
            [
              14.67,
              14.83
            ],
            [
              15.51,
              17.29
            ],
            [
              19.28,
              19.36
            ],
            [
              27.8,
              29.74
            ],
            [
              41.44,
              42.1
            ],
            [
              42.19,
              42.43
            ],
            [
              44.38,
              44.39
            ],
            [
              45.45,
              45.59
            ],
            [
              60.37,
              61.4
            ],
            [
              68.32,
              69.61
            ],
            [
              69.66,
              69.72
            ],
            [
              74.98,
              75.01
            ],
            [
              75.53,
              79.1
            ],
            [
              83.84,
              85.77
            ],
            [
              86.88,
              87.17
            ],
            [
              87.82,
              87.98
            ],
            [
              92.29,
              92.32
            ],
            [
              105.02,
              106.45
            ]
          ],
          "points": [
            {
              "t": 1.47,
              "stance": "Partage l'avis sur le traitement médiatique : l'insécurité est exacerbée parce que des acteurs politiques ont intérêt à en faire le sujet central, la peur faisant gagner des élections, et que des plateformes d'extrême droite ont proliféré."
            },
            {
              "t": 5.26,
              "stance": "Trouve que le système judiciaire et carcéral vise toujours les mêmes personnes sans rien changer ; une amende de 500 euros à une personne sans domicile ne l'aide pas. La prison reste nécessaire pour les personnes dangereuses, comme en cas d'homicide ou de viol."
            },
            {
              "t": 6.71,
              "stance": "Pour le vol de nourriture, demande pourquoi on vole plutôt que de punir : ces personnes n'ont souvent pas le choix."
            },
            {
              "t": 15.51,
              "stance": "Cite une étude américaine : la population carcérale vieillit, les détenus de plus de soixante-cinq ans récidivent très peu et coûtent cher en santé ; propose une libération pour raisons médicales."
            },
            {
              "t": 27.8,
              "stance": "Rappelle que l'affectation scolaire à Paris est sectorielle et que les logements sociaux y sont nombreux et discrets ; la vraie question est ce qu'on fait pour les banlieues."
            },
            {
              "t": 60.37,
              "stance": "Relie le trafic de drogue à une grande part de la criminalité des cités : il fait sortir des jeunes de l'école vers un monde dont ils n'ont pas le contrôle et mène à la violence."
            },
            {
              "t": 75.53,
              "stance": "Voit dans les violences sexuelles un sexisme systémique : peur de ne pas être prise au sérieux, classements sans suite faute de preuves ; propose la formation des jeunes et de faire connaître le dispositif de la pharmacie."
            },
            {
              "t": 83.84,
              "stance": "Invite à regarder un film sur une maison qui prend en charge les femmes victimes de violences et évoque les excisions qui se pratiquent encore en France."
            },
            {
              "t": 86.88,
              "stance": "Précise que soutenir les victimes n'empêche pas d'agir en prévention auprès des jeunes."
            }
          ]
        },
        {
          "key": "A4",
          "placed": true,
          "x": 0.056,
          "y": 0.916,
          "kf": [
            [
              44.69,
              0.056,
              0.916
            ],
            [
              109.2,
              0.056,
              0.916
            ]
          ],
          "weight": 7.749,
          "entry": 2.79,
          "camp": "Sans camp net",
          "note": "Raconte avoir vu des procès à Paris comme un échec, juge la prison nécessaire dans une certaine mesure mais pas la seule solution, soutient la mixité du logement malgré son coût pour l'État et veut punir plus les atteintes aux personnes et moins les délits de précarité.",
          "color": "var(--ta)",
          "speech": [
            [
              2.79,
              4.0
            ],
            [
              4.08,
              4.88
            ],
            [
              8.51,
              8.6
            ],
            [
              37.28,
              37.29
            ],
            [
              37.34,
              37.46
            ],
            [
              44.69,
              45.45
            ],
            [
              45.59,
              46.6
            ],
            [
              46.76,
              47.9
            ],
            [
              56.07,
              56.19
            ],
            [
              70.38,
              71.5
            ],
            [
              71.56,
              72.37
            ],
            [
              75.12,
              75.12
            ],
            [
              90.37,
              90.48
            ],
            [
              92.32,
              92.36
            ],
            [
              95.35,
              95.35
            ],
            [
              95.45,
              95.6
            ],
            [
              96.18,
              96.39
            ],
            [
              97.24,
              97.26
            ],
            [
              108.07,
              108.07
            ],
            [
              108.63,
              108.65
            ]
          ],
          "points": [
            {
              "t": 2.79,
              "stance": "Raconte avoir assisté à des procès au tribunal de Paris et ressenti un échec : peines à la chaîne contre des multirécidivistes ou une personne sans domicile ; juge la prison nécessaire dans une certaine mesure mais pas la seule solution, sans avoir de solution."
            },
            {
              "t": 44.69,
              "stance": "Juge qu'imposer des logements sociaux dans des immeubles existants peut être bon mais coûterait à l'État la différence que payait le promoteur."
            },
            {
              "t": 45.59,
              "stance": "Admet que construire du neuf est négligeable face au stock et se demande si le problème est le logement social ou la corruption des fonctionnaires."
            },
            {
              "t": 46.76,
              "stance": "Soutient qu'à l'échelle nationale, marginaliser et communautariser les pauvres coûte beaucoup plus cher à l'État et nourrit le sentiment d'insécurité."
            },
            {
              "t": 70.38,
              "stance": "Place les violences sexuelles au cœur de l'insécurité : un taux de plainte de 5 % rendrait le problème énorme même s'il baissait de moitié ; veut savoir comment la société peut mieux écouter et réduire ces violences."
            },
            {
              "t": 95.45,
              "stance": "Voudrait punir plus lourdement les atteintes aux personnes, comme les violences sexuelles et les homicides, et moins les délits liés à la précarité comme les vols ou la drogue."
            }
          ]
        },
        {
          "key": "A5",
          "placed": true,
          "x": 0.566,
          "y": 1.122,
          "kf": [
            [
              56.88,
              0.639,
              1.428
            ],
            [
              99.11,
              0.639,
              1.428
            ],
            [
              100.11,
              0.566,
              1.122
            ],
            [
              109.2,
              0.566,
              1.122
            ]
          ],
          "weight": 11.61,
          "entry": 7.2,
          "camp": "Sans camp net",
          "note": "Voit un système perçu comme fait pour punir, qui crée un nous contre eux ; veut intégrer par le travail, refuse de criminaliser toute consommation de drogue, mise sur l'éducation contre les violences conjugales et défend le monopole de l'État sur la police et la justice.",
          "color": "var(--ta)",
          "speech": [
            [
              7.2,
              8.19
            ],
            [
              12.47,
              12.63
            ],
            [
              43.08,
              43.98
            ],
            [
              51.89,
              51.89
            ],
            [
              54.34,
              54.78
            ],
            [
              56.75,
              56.8
            ],
            [
              56.88,
              58.87
            ],
            [
              61.42,
              62.29
            ],
            [
              62.47,
              62.85
            ],
            [
              72.37,
              72.39
            ],
            [
              72.82,
              74.98
            ],
            [
              93.96,
              94.04
            ],
            [
              94.83,
              95.07
            ],
            [
              99.11,
              102.08
            ],
            [
              102.5,
              102.86
            ],
            [
              108.39,
              108.4
            ]
          ],
          "points": [
            {
              "t": 7.2,
              "stance": "Estime que le système est perçu comme fait pour punir, ce qui crée un nous contre eux ; les quartiers prioritaires ne le sont pas vraiment et l'intégration par le travail serait une voie."
            },
            {
              "t": 12.47,
              "stance": "Précise que le classement des quartiers prioritaires repose seulement sur le revenu par habitant."
            },
            {
              "t": 43.08,
              "stance": "Pense que vivre dans un logement social mixte, même avec un sentiment de marginalisation, vaut mieux que grandir au milieu de la criminalité et des dealers."
            },
            {
              "t": 54.34,
              "stance": "Craint qu'au-delà d'un certain pourcentage de ménages pauvres dans un quartier la mixité sature, comme une dilution."
            },
            {
              "t": 56.88,
              "stance": "Lie la drogue au manque d'emploi légal et aux addictions ; refuse de criminaliser toute consommation, car un casier pour un joint nuit à l'insertion et alimente corruption et injustice."
            },
            {
              "t": 61.42,
              "stance": "Prend l'exemple de la Tunisie, où criminaliser toute consommation détruit des jeunes sans l'enrayer, nourrit des circuits illégaux et des produits dangereux."
            },
            {
              "t": 72.82,
              "stance": "Cite l'exemple de l'Espagne pour faciliter le dépôt de plainte, voit dans les violences conjugales un sexisme intérieur et mise sur l'éducation et le dialogue."
            },
            {
              "t": 99.11,
              "stance": "S'oppose à la privatisation de la police et de la justice : des forces privées deviendraient des gangs et l'État doit garder le monopole pour que la justice soit acceptée."
            }
          ]
        },
        {
          "key": "A6",
          "placed": true,
          "x": -1.371,
          "y": -6.212,
          "kf": [
            [
              37.46,
              -0.056,
              -0.916
            ],
            [
              63.89,
              -0.056,
              -0.916
            ],
            [
              64.89,
              -1.371,
              -6.212
            ],
            [
              109.2,
              -1.371,
              -6.212
            ]
          ],
          "weight": 17.997,
          "entry": 5.14,
          "camp": "Sans camp net",
          "note": "Issu d'une famille de magistrats, compare avec la Belgique et la Finlande pour dire que la prison coûte cher sans protéger davantage ; doute que l'argent des quartiers construise l'avenir, refuse la dépénalisation de la drogue et voit dans la défiance envers la justice une part de l'insécurité.",
          "color": "var(--ta)",
          "speech": [
            [
              5.14,
              5.25
            ],
            [
              9.85,
              11.64
            ],
            [
              12.45,
              12.47
            ],
            [
              15.04,
              15.22
            ],
            [
              19.43,
              21.57
            ],
            [
              21.87,
              22.7
            ],
            [
              25.71,
              26.99
            ],
            [
              27.24,
              27.76
            ],
            [
              37.46,
              38.38
            ],
            [
              38.47,
              41.01
            ],
            [
              41.06,
              41.33
            ],
            [
              41.38,
              41.4
            ],
            [
              55.35,
              55.35
            ],
            [
              59.19,
              59.29
            ],
            [
              63.89,
              65.8
            ],
            [
              65.86,
              66.17
            ],
            [
              66.89,
              67.21
            ],
            [
              69.61,
              69.66
            ],
            [
              70.04,
              70.12
            ],
            [
              82.7,
              83.01
            ],
            [
              83.08,
              83.12
            ],
            [
              88.3,
              88.33
            ],
            [
              88.42,
              88.79
            ],
            [
              88.85,
              90.27
            ],
            [
              93.7,
              93.72
            ],
            [
              95.86,
              95.89
            ],
            [
              96.83,
              96.98
            ],
            [
              102.92,
              104.99
            ],
            [
              107.12,
              107.23
            ],
            [
              108.25,
              108.27
            ]
          ],
          "points": [
            {
              "t": 9.85,
              "stance": "Vient d'une famille de magistrats et cite la Belgique et la Finlande : avec un budget de justice comparable, elles emprisonnent deux fois moins, sans plus d'insécurité, en misant sur l'accompagnement."
            },
            {
              "t": 10.89,
              "stance": "Rappelle que la prison est nécessaire pour les personnes dangereuses, mais que les crimes ne sont qu'une petite partie des affaires ; envoyer des multirécidivistes un an en prison coûte cher et les met au contact d'une criminalité plus lourde."
            },
            {
              "t": 20.7,
              "stance": "Se demande si l'argent investi dans les quartiers construit l'avenir ou achète seulement la paix sociale, faute de mesure des effets."
            },
            {
              "t": 21.87,
              "stance": "Rappelle que les grands ensembles des années soixante-dix ont concentré le logement social et créé les cités d'aujourd'hui."
            },
            {
              "t": 25.71,
              "stance": "Juge la mixité imposée par un quota de logements sociaux une des meilleures solutions, tout en notant qu'une ville riche peut respecter le quota avec des logements de militaires."
            },
            {
              "t": 37.46,
              "stance": "Refuse d'imposer un logement social à l'intérieur d'un immeuble privé : il y voit une limite à ce que l'État peut faire, probablement illégale."
            },
            {
              "t": 39.77,
              "stance": "Pense qu'un habitat social voisin dérange à court terme mais ne fait pas baisser durablement le niveau culturel du quartier ; les gens monteront plutôt."
            },
            {
              "t": 63.89,
              "stance": "Refuse la dépénalisation de la drogue : les Pays-Bas sont devenus la plaque tournante et la France le deviendrait ; dénonce un biais médiatique qui lie criminalité et trafic alors que les viols sont bien plus nombreux."
            },
            {
              "t": 88.42,
              "stance": "Alerte sur le traitement des viols dans une cour criminelle départementale sans jury populaire, mise en place faute de moyens, et s'interroge sur ce que les autres en pensent."
            },
            {
              "t": 103.99,
              "stance": "Souligne que le sentiment de déclassement de la classe moyenne nourrit une grande part de l'insécurité et que la défiance envers la justice en fait partie."
            }
          ]
        },
        {
          "key": "A7",
          "placed": false,
          "x": null,
          "y": null,
          "kf": [],
          "weight": 11.382,
          "entry": 11.7,
          "camp": "Non placé : moins de 3 prises de position relevées",
          "note": "Seule voix libérale de la table : juge le code du travail trop rigide, rejette les logements sociaux (électoralisme, corruption), voit dans tout monopole d'État une source de corruption et propose de mettre en concurrence plusieurs justices et polices.",
          "color": "var(--ta)",
          "speech": [
            [
              11.7,
              12.45
            ],
            [
              12.66,
              14.33
            ],
            [
              15.36,
              15.51
            ],
            [
              24.82,
              24.82
            ],
            [
              29.75,
              32.86
            ],
            [
              41.33,
              41.37
            ],
            [
              46.6,
              46.71
            ],
            [
              49.54,
              49.93
            ],
            [
              49.99,
              51.19
            ],
            [
              51.24,
              51.74
            ],
            [
              51.89,
              52.01
            ],
            [
              52.74,
              53.15
            ],
            [
              53.22,
              53.23
            ],
            [
              53.27,
              53.29
            ],
            [
              53.35,
              53.68
            ],
            [
              54.79,
              54.99
            ],
            [
              55.22,
              55.31
            ],
            [
              55.35,
              55.39
            ],
            [
              55.53,
              55.65
            ],
            [
              72.75,
              72.82
            ],
            [
              83.14,
              83.78
            ],
            [
              92.47,
              92.53
            ],
            [
              92.65,
              92.76
            ],
            [
              92.82,
              93.44
            ],
            [
              93.72,
              93.91
            ],
            [
              94.12,
              94.38
            ],
            [
              95.93,
              96.04
            ],
            [
              97.85,
              97.86
            ],
            [
              107.03,
              107.06
            ],
            [
              108.1,
              108.15
            ],
            [
              109.14,
              109.14
            ]
          ],
          "points": [
            {
              "t": 11.7,
              "stance": "Pense que voler pour le plaisir existe, conteste que les quartiers prioritaires soient marginalisés vu leurs infrastructures, et juge le code du travail trop rigide : exiger un domicile et des justificatifs bloque l'accès au travail."
            },
            {
              "t": 13.79,
              "stance": "Soutient que faciliter le licenciement et l'expulsion fluidifierait l'accès au travail et au logement, car les barrières à la sortie provoquent des barrières à l'entrée."
            },
            {
              "t": 29.75,
              "stance": "Rejette les logements sociaux : ils serviraient à acheter des électeurs, seraient entachés de corruption, coûteraient plus cher aux autres locataires et feraient fuir les voisins."
            },
            {
              "t": 31.27,
              "stance": "Étaye la corruption par des enquêtes et rappelle qu'on garde un logement social même quand les ressources s'améliorent."
            },
            {
              "t": 49.54,
              "stance": "Soutient que la corruption vient de tout monopole d'État et pas des seuls logements sociaux : des fonctionnaires qui manipulent l'argent des autres sont faciles à corrompre."
            },
            {
              "t": 49.99,
              "stance": "Pense que les riches échapperont toujours à la mixité, qui ne touchera que la classe moyenne, exposée à l'insécurité sans pouvoir fuir."
            },
            {
              "t": 92.65,
              "stance": "Propose de mettre en concurrence plusieurs justices et polices privées : les moins bonnes perdraient leurs abonnés."
            }
          ]
        }
      ],
      "interactions": [
        {
          "t": 5.26,
          "from": "A3",
          "to": "A4",
          "type": "accord",
          "desc": "Approuve son constat que le système judiciaire et carcéral est peu optimal."
        },
        {
          "t": 7.2,
          "from": "A5",
          "to": "A3",
          "type": "accord",
          "desc": "Rebondit sur les personnes qui volent pour dire qu'elles ont été marginalisées."
        },
        {
          "t": 8.21,
          "from": "A1",
          "to": "A4",
          "type": "accord",
          "desc": "S'appuie sur son récit du tribunal pour dire que les récidivistes reviennent sans cesse."
        },
        {
          "t": 8.64,
          "from": "A1",
          "to": "A5",
          "type": "accord",
          "desc": "Approuve l'idée d'aider ces personnes par la réinsertion dans le travail."
        },
        {
          "t": 11.7,
          "from": "A7",
          "to": "A3",
          "type": "desaccord",
          "desc": "Conteste qu'on ne vole que par nécessité : on vole aussi pour le plaisir."
        },
        {
          "t": 11.7,
          "from": "A7",
          "to": "A5",
          "type": "desaccord",
          "desc": "Conteste que les quartiers prioritaires soient marginalisés."
        },
        {
          "t": 17.3,
          "from": "A2",
          "to": "A3",
          "type": "accord",
          "desc": "Confirme l'intérêt de la libération médicale pour gérer l'incarcération."
        },
        {
          "t": 19.43,
          "from": "A6",
          "to": "A3",
          "type": "desaccord",
          "desc": "Objecte qu'en France la peine maximale est limitée et que l'idée s'applique peu."
        },
        {
          "t": 23.26,
          "from": "A1",
          "to": "A6",
          "type": "desaccord",
          "desc": "Pense que l'écart entre quartiers n'est pas qu'une question d'argent."
        },
        {
          "t": 27.24,
          "from": "A6",
          "to": "A1",
          "type": "desaccord",
          "desc": "Soutient que l'ouverture de deux lycées entretient les élites."
        },
        {
          "t": 29.75,
          "from": "A7",
          "to": "A6",
          "type": "desaccord",
          "desc": "Rejette la mixité par le logement social, qu'il juge atroce."
        },
        {
          "t": 32.88,
          "from": "A2",
          "to": "A7",
          "type": "accord",
          "desc": "Reconnaît le danger de fuite des élites qu'il a soulevé."
        },
        {
          "t": 34.73,
          "from": "A1",
          "to": "A7",
          "type": "desaccord",
          "desc": "Répond que les riverains ne décident pas qui peut habiter près d'eux."
        },
        {
          "t": 37.46,
          "from": "A6",
          "to": "A1",
          "type": "desaccord",
          "desc": "Refuse d'imposer un logement social dans un immeuble privé."
        },
        {
          "t": 41.44,
          "from": "A3",
          "to": "A6",
          "type": "desaccord",
          "desc": "Ne comprend pas pourquoi refuser des logements sociaux dans un même immeuble."
        },
        {
          "t": 44.69,
          "from": "A4",
          "to": "A6",
          "type": "desaccord",
          "desc": "Pense que cette mixité pourrait être une bonne chose, malgré son coût."
        },
        {
          "t": 45.59,
          "from": "A4",
          "to": "A7",
          "type": "desaccord",
          "desc": "Distingue le problème de corruption de celui du logement social."
        },
        {
          "t": 46.76,
          "from": "A4",
          "to": "A7",
          "type": "desaccord",
          "desc": "Soutient que communautariser coûte plus cher à l'ensemble du pays."
        },
        {
          "t": 49.54,
          "from": "A7",
          "to": "A4",
          "type": "desaccord",
          "desc": "Répond que la corruption tient au monopole de l'État."
        },
        {
          "t": 52.01,
          "from": "A1",
          "to": "A7",
          "type": "desaccord",
          "desc": "Dit qu'il ne serait pas gêné d'avoir un voisin moins riche."
        },
        {
          "t": 52.74,
          "from": "A7",
          "to": "A1",
          "type": "desaccord",
          "desc": "Répond que seule la classe moyenne subira cette proximité."
        },
        {
          "t": 54.34,
          "from": "A5",
          "to": "A7",
          "type": "accord",
          "desc": "Rejoint l'idée d'une saturation de la mixité dans certains quartiers."
        },
        {
          "t": 59.32,
          "from": "A1",
          "to": "A5",
          "type": "accord",
          "desc": "Rejoint la volonté de ne pas tout criminaliser côté consommateurs."
        },
        {
          "t": 60.37,
          "from": "A3",
          "to": "A1",
          "type": "accord",
          "desc": "Ajoute que la drogue pousse les jeunes hors de l'école."
        },
        {
          "t": 62.95,
          "from": "A2",
          "to": "A1",
          "type": "accord",
          "desc": "Comprend le point de vue de l'encadrement par l'État."
        },
        {
          "t": 63.89,
          "from": "A6",
          "to": "A1",
          "type": "desaccord",
          "desc": "Refuse la dépénalisation de la drogue pour des raisons européennes."
        },
        {
          "t": 67.76,
          "from": "A1",
          "to": "A6",
          "type": "desaccord",
          "desc": "Répond qu'une plaque tournante est acceptable si la criminalité baisse."
        },
        {
          "t": 72.82,
          "from": "A5",
          "to": "A4",
          "type": "accord",
          "desc": "Reprend les raisons déjà évoquées sur les violences sexuelles."
        },
        {
          "t": 75.53,
          "from": "A3",
          "to": "A4",
          "type": "accord",
          "desc": "Se dit tout à fait d'accord sur l'insécurité des femmes."
        },
        {
          "t": 75.53,
          "from": "A3",
          "to": "A5",
          "type": "desaccord",
          "desc": "Juge le problème plus large qu'un esprit sexiste individuel : il est systémique."
        },
        {
          "t": 81.55,
          "from": "A2",
          "to": "A1",
          "type": "desaccord",
          "desc": "Estime que l'État ne doit pas s'ingérer dans les familles."
        },
        {
          "t": 86.88,
          "from": "A3",
          "to": "A1",
          "type": "accord",
          "desc": "Précise que l'aide aux victimes et la prévention ne s'opposent pas."
        },
        {
          "t": 93.47,
          "from": "A2",
          "to": "A7",
          "type": "desaccord",
          "desc": "Doute d'une justice soumise à la concurrence."
        },
        {
          "t": 99.11,
          "from": "A5",
          "to": "A7",
          "type": "desaccord",
          "desc": "Soutient que des forces privées deviendraient des gangs."
        }
      ],
      "events": [
        {
          "t": 1.0,
          "type": "cadrage",
          "magnitude": 1,
          "title": "Ouverture sur la doxa",
          "desc": "L'animation rappelle l'opinion commune qui lie délinquance, prisons saturées et immigration."
        },
        {
          "t": 2.8,
          "type": "technique",
          "magnitude": 2,
          "title": "Un retour d'expérience au tribunal",
          "desc": "Un participant raconte des procès à Paris vus comme un échec."
        },
        {
          "t": 5.1,
          "type": "consensus",
          "magnitude": 2,
          "title": "La prison est jugée nécessaire",
          "desc": "L'assertion sur la nécessité de la prison a recueilli un fort accord, qui surprend plusieurs participants."
        },
        {
          "t": 9.8,
          "type": "technique",
          "magnitude": 2,
          "title": "Belgique et Finlande emprisonnent deux fois moins",
          "desc": "Même budget de justice, sans plus d'insécurité, grâce à l'accompagnement."
        },
        {
          "t": 11.7,
          "type": "dissensus",
          "magnitude": 2,
          "title": "Les quartiers prioritaires sont-ils marginalisés ?",
          "desc": "Désaccord sur la marginalisation, les infrastructures et le classement des quartiers."
        },
        {
          "t": 13.8,
          "type": "dissensus",
          "magnitude": 2,
          "title": "Assouplir le code du travail ?",
          "desc": "Faciliter licenciements et expulsions pour fluidifier l'accès au travail et au logement."
        },
        {
          "t": 17.3,
          "type": "technique",
          "magnitude": 2,
          "title": "Libération médicale et grands travaux",
          "desc": "Détenus âgés peu récidivistes, puis emplois publics stables malgré le casier."
        },
        {
          "t": 19.4,
          "type": "technique",
          "magnitude": 2,
          "title": "Investir : bâtir l'avenir ou acheter la paix sociale ?",
          "desc": "Doute sur l'efficacité de l'argent investi dans les quartiers."
        },
        {
          "t": 25.7,
          "type": "dissensus",
          "magnitude": 2,
          "title": "Imposer la mixité par des quotas de logements sociaux",
          "desc": "Un quota est défendu, jugé limité, ou refusé dans les immeubles privés."
        },
        {
          "t": 29.75,
          "type": "dissensus",
          "magnitude": 3,
          "title": "Logement social : corruption et fuite des voisins",
          "desc": "Une voix rejette les logements sociaux, les autres défendent la mixité."
        },
        {
          "t": 44.7,
          "type": "technique",
          "magnitude": 2,
          "title": "Coût pour l'État, corruption ou logement social ?",
          "desc": "Qui paie la différence ; où se situe le vrai problème."
        },
        {
          "t": 49.5,
          "type": "dissensus",
          "magnitude": 2,
          "title": "La corruption vient-elle du monopole de l'État ?",
          "desc": "Débat sur l'origine de la corruption et sur l'effet réel de la mixité."
        },
        {
          "t": 54.98,
          "type": "cadrage",
          "magnitude": 1,
          "title": "Vote pour le sujet suivant",
          "desc": "L'animation soumet trois sujets au vote : travail et logement, victimes, drogue."
        },
        {
          "t": 59.3,
          "type": "dissensus",
          "magnitude": 3,
          "title": "Légaliser ou dépénaliser en partie les drogues ?",
          "desc": "Consommateurs, vendeurs, réseaux : deux visions de la légalisation."
        },
        {
          "t": 63.9,
          "type": "dissensus",
          "magnitude": 3,
          "title": "La France, plaque tournante : un risque acceptable ?",
          "desc": "Les Pays-Bas servent d'exemple, la réponse dépend du bilan sur la criminalité."
        },
        {
          "t": 68.0,
          "type": "cadrage",
          "magnitude": 1,
          "title": "Basculement vers les féminicides",
          "desc": "Une digression sur les chiffres de meurtres mène à un vote de changement de sujet."
        },
        {
          "t": 70.4,
          "type": "consensus",
          "magnitude": 2,
          "title": "Les violences sexuelles au cœur de l'insécurité",
          "desc": "Plusieurs voix s'accordent pour y voir l'insécurité la plus répandue."
        },
        {
          "t": 75.5,
          "type": "technique",
          "magnitude": 2,
          "title": "Sexisme systémique et dispositif de la pharmacie",
          "desc": "Classements sans suite, éducation des jeunes et dispositifs d'alerte."
        },
        {
          "t": 81.6,
          "type": "dissensus",
          "magnitude": 2,
          "title": "Éduquer en famille ou garantir l'indépendance des femmes ?",
          "desc": "Divergence sur la place de l'État dans la vie privée."
        },
        {
          "t": 88.4,
          "type": "technique",
          "magnitude": 2,
          "title": "Cour criminelle départementale et traitement des viols",
          "desc": "Un jugement sans jury populaire pour désengorger les tribunaux."
        },
        {
          "t": 90.5,
          "type": "cadrage",
          "magnitude": 1,
          "title": "Tour de table de clôture",
          "desc": "L'animation lance le retour sur le fond et la forme du débat."
        },
        {
          "t": 92.6,
          "type": "dissensus",
          "magnitude": 3,
          "title": "Mettre en concurrence police et justice ?",
          "desc": "Une proposition libérale très minoritaire dans le vote rapporté par l'animation."
        },
        {
          "t": 94.7,
          "type": "consensus",
          "magnitude": 2,
          "title": "Réserver la prison aux atteintes aux personnes",
          "desc": "Plus punir les atteintes aux personnes et moins les délits de précarité."
        },
        {
          "t": 97.0,
          "type": "meta",
          "magnitude": 1,
          "title": "Bilan du débat",
          "desc": "Cadrage trop large ou juste milieu, changements de sujet organiques, absence d'immigration et de violences policières."
        },
        {
          "t": 106.0,
          "type": "meta",
          "magnitude": 1,
          "title": "Annonce du débat suivant",
          "desc": "Écologie et capitalisme, la semaine suivante."
        }
      ],
      "tension": [
        [
          0,
          18
        ],
        [
          1.0,
          30
        ],
        [
          2.8,
          35
        ],
        [
          5.1,
          32
        ],
        [
          9.8,
          40
        ],
        [
          11.7,
          50
        ],
        [
          13.8,
          52
        ],
        [
          17.3,
          35
        ],
        [
          19.4,
          40
        ],
        [
          25.7,
          50
        ],
        [
          29.75,
          62
        ],
        [
          37.4,
          58
        ],
        [
          44.7,
          52
        ],
        [
          49.5,
          55
        ],
        [
          55,
          38
        ],
        [
          59.3,
          55
        ],
        [
          63.9,
          65
        ],
        [
          68.0,
          40
        ],
        [
          75.5,
          35
        ],
        [
          81.6,
          48
        ],
        [
          90.5,
          25
        ],
        [
          92.6,
          55
        ],
        [
          94.7,
          35
        ],
        [
          97.0,
          18
        ],
        [
          109.0,
          10
        ]
      ],
      "refus": []
    },
    {
      "key": "B",
      "code": "3E24D5",
      "label": "Table B",
      "duration": 109.1,
      "summary": "La table est partie du rôle des médias dans le sentiment d'insécurité, puis des chiffres européens, avant de s'attarder sur les prisons (places, conditions, travail, finalité de la peine), sur le traitement policier et judiciaire des violences sexuelles, sur la drogue et sur les blocus lycéens. Presque tous jugent la prison inefficace pour réinsérer et veulent des alternatives pour la plupart des détenus. Les plus grands désaccords ont porté sur le rôle de la police (au service de l'ordre établi ou non), sur la responsabilité des consommateurs de drogue et sur la légitimité de la violence politique, où une voix attachée aux institutions s'est opposée seule aux autres. La table a regretté l'absence de contradicteurs de droite. Personne n'a explicitement changé d'avis.",
      "ranking": {
        "consensus": [
          {
            "text": "La violence est légitime ou efficace pour se faire entendre",
            "side": "pour",
            "p": 4,
            "c": 1,
            "nu": 1,
            "agreement": 0.6,
            "score_consensus": 0.625,
            "score_dissensus": null
          },
          {
            "text": "L'insécurité est surtout ressentie, exagérée par les médias et les réseaux",
            "side": "pour",
            "p": 3,
            "c": 0,
            "nu": 2,
            "agreement": 1.0,
            "score_consensus": 0.5714,
            "score_dissensus": null
          }
        ],
        "consensus_ties": [],
        "dissensus": [
          {
            "text": "Les détenus ont plus peur des autres détenus que des gardiens",
            "side": "pour",
            "p": 1,
            "c": 1,
            "nu": 1,
            "agreement": 0.0,
            "score_consensus": 0.4,
            "score_dissensus": null
          },
          {
            "text": "Le capitalisme profite du sexisme",
            "side": "pour",
            "p": 1,
            "c": 1,
            "nu": 1,
            "agreement": 0.0,
            "score_consensus": 0.4,
            "score_dissensus": null
          },
          {
            "text": "La police et la justice traitent mal les violences sexuelles parce qu'elles défendent l'ordre établi",
            "side": "pour",
            "p": 2,
            "c": 1,
            "nu": 2,
            "agreement": 0.333,
            "score_consensus": 0.4286,
            "score_dissensus": null
          }
        ],
        "dissensus_ties": []
      },
      "groups": [],
      "unplaced": 3,
      "kinds": {
        "coeur": {
          "label": "La question posée",
          "desc": "Justice, prisons, police, violences sexuelles, drogue."
        },
        "connexe": {
          "label": "Questions liées",
          "desc": "Médias, blocus lycéens, violence politique."
        },
        "annexe": {
          "label": "Sujets annexes",
          "desc": "Capitalisme et sexisme, bilan du débat."
        }
      },
      "themes": [
        {
          "id": "medias",
          "kind": "connexe",
          "short": "Médias",
          "color": "#8E44AD",
          "label": "Médias et sentiment d'insécurité",
          "desc": "Chiffres européens, médiatisation des faits divers, récit des blocus, bulles de filtres."
        },
        {
          "id": "prison",
          "kind": "coeur",
          "short": "Prison",
          "color": "#184795",
          "label": "Justice, prisons et peines",
          "desc": "Moyens de la justice, surpopulation, conditions, travail en prison, finalité de la peine."
        },
        {
          "id": "police",
          "kind": "coeur",
          "short": "Police et violences sexuelles",
          "color": "#C0507A",
          "label": "Police, justice et violences sexuelles",
          "desc": "Fonction de la police, plaintes, éducation, tolérance sociale, justice alternative."
        },
        {
          "id": "capital",
          "kind": "annexe",
          "short": "Capitalisme",
          "color": "#34495E",
          "label": "Capitalisme, sexisme et travail des femmes",
          "desc": "Travail domestique, productivité, secteur tertiaire."
        },
        {
          "id": "drogue",
          "kind": "coeur",
          "short": "Drogue",
          "color": "#E67E22",
          "label": "Drogue et narcotrafic",
          "desc": "Responsabilité des consommateurs, des dealers, légalisation, alcool."
        },
        {
          "id": "blocus",
          "kind": "connexe",
          "short": "Blocus",
          "color": "#16A085",
          "label": "Blocus lycéens et mobilisations",
          "desc": "Revendications des lycéens, comparaison avec la Serbie."
        },
        {
          "id": "violence",
          "kind": "connexe",
          "short": "Violence politique",
          "color": "#C0392B",
          "label": "Violence politique : légitime, efficace ?",
          "desc": "Rapport de force, non-violence, grèves, référendums, syndicats."
        },
        {
          "id": "bilan",
          "kind": "annexe",
          "short": "Bilan",
          "color": "#D4AC0D",
          "label": "Bilan du débat",
          "desc": "Entre-soi, absence de contradicteurs, format, débat suivant."
        }
      ],
      "timeline": [
        [
          0,
          2.98,
          null
        ],
        [
          2.98,
          7.3,
          "medias"
        ],
        [
          7.3,
          30.97,
          "prison"
        ],
        [
          30.97,
          45.8,
          "police"
        ],
        [
          45.8,
          53.0,
          "capital"
        ],
        [
          53.0,
          69.15,
          "drogue"
        ],
        [
          69.15,
          71.47,
          "blocus"
        ],
        [
          71.47,
          74.37,
          "medias"
        ],
        [
          74.37,
          78.13,
          "violence"
        ],
        [
          78.13,
          80.08,
          "medias"
        ],
        [
          80.08,
          83.52,
          "blocus"
        ],
        [
          83.52,
          85.42,
          "violence"
        ],
        [
          85.42,
          86.67,
          "bilan"
        ],
        [
          86.67,
          98.08,
          "violence"
        ],
        [
          98.08,
          109.15,
          "bilan"
        ]
      ],
      "mentions": [],
      "theme_minutes": {
        "__anim__": 2.98,
        "medias": 9.17,
        "prison": 23.67,
        "police": 14.83,
        "capital": 7.2,
        "drogue": 16.15,
        "blocus": 5.76,
        "violence": 17.07,
        "bilan": 12.32
      },
      "personas": [
        {
          "key": "B1",
          "placed": false,
          "x": null,
          "y": null,
          "kf": [],
          "weight": 11.365,
          "entry": 2.64,
          "camp": "Non placé : moins de 3 prises de position relevées",
          "note": "Ne voit pas la finalité de la prison, y compris améliorée ; voit dans les violences sexuelles un problème d'éducation et d'institutions en amont, doute que responsabiliser les consommateurs de drogue suffise et juge que, dans les faits, la violence fait bouger les choses.",
          "color": "var(--tb)",
          "speech": [
            [
              2.64,
              2.96
            ],
            [
              26.96,
              28.89
            ],
            [
              33.38,
              33.84
            ],
            [
              33.97,
              34.45
            ],
            [
              39.47,
              39.53
            ],
            [
              42.53,
              43.38
            ],
            [
              43.44,
              43.97
            ],
            [
              44.03,
              44.13
            ],
            [
              60.39,
              60.92
            ],
            [
              61.07,
              61.26
            ],
            [
              61.32,
              62.22
            ],
            [
              76.36,
              78.13
            ],
            [
              101.98,
              102.65
            ],
            [
              103.12,
              105.2
            ],
            [
              106.16,
              106.45
            ],
            [
              106.61,
              106.83
            ]
          ],
          "points": [
            {
              "t": 26.96,
              "stance": "Ne voit pas la finalité de la prison : même améliorée et avec du travail, elle reste un lieu où l'on enferme des gens en espérant que cela se passe bien, une solution de facilité qui n'empêche pas la récidive."
            },
            {
              "t": 33.38,
              "stance": "Refuse de rejeter sur les policiers le traitement des violences sexuelles : c'est surtout un problème juridique et de moyens, et il faut éviter les clichés."
            },
            {
              "t": 42.53,
              "stance": "Considère les violences sexuelles comme un problème d'éducation et d'institutions en amont, donc de prévention, et pas seulement de traitement après coup."
            },
            {
              "t": 43.44,
              "stance": "Précise que la structure de la société arrange les dominants, sans décision consciente ni volonté d'un riche en particulier."
            },
            {
              "t": 60.39,
              "stance": "Doute que responsabiliser les consommateurs suffise : les jeunes ignorent l'économie de la drogue, et même informés, ceux qui consomment restent loin de ses effets."
            },
            {
              "t": 76.36,
              "stance": "Distingue le discrédit jeté sur un mouvement par le gouvernement et les médias de sa légitimité réelle."
            },
            {
              "t": 77.81,
              "stance": "Juge que moralement la violence est discutable mais qu'en pratique elle fait bouger les choses, car brûler envoie une image d'instabilité qui force le gouvernement à réagir."
            },
            {
              "t": 101.98,
              "stance": "Affirme qu'on ne peut pas demander aux opprimés d'être non violents quand l'État et l'économie sont eux-mêmes violents."
            },
            {
              "t": 103.12,
              "stance": "Reconnaît qu'il faudrait éviter la violence, tout en soulignant ses deux niveaux ; regrette que la droite ne soit pas représentée à la table."
            }
          ]
        },
        {
          "key": "B2",
          "placed": true,
          "x": 2.867,
          "y": -3.24,
          "kf": [
            [
              32.3,
              3.298,
              -1.995
            ],
            [
              50.45,
              3.298,
              -1.995
            ],
            [
              51.45,
              2.856,
              -1.728
            ],
            [
              58.03,
              2.856,
              -1.728
            ],
            [
              59.03,
              2.016,
              -3.361
            ],
            [
              83.52,
              2.016,
              -3.361
            ],
            [
              84.52,
              2.867,
              -3.24
            ],
            [
              109.1,
              2.867,
              -3.24
            ]
          ],
          "weight": 13.134,
          "entry": 3.65,
          "camp": "Sans camp net",
          "note": "Prend au sérieux les chiffres de criminalité mais voit la police protéger d'abord l'ordre établi et la propriété ; lie violences sexuelles, capitalisme et rapport de force racial, veut un contrôle d'État de l'alcool sans que le cannabis se répande, et croit que seuls les mouvements violents obtiennent des changements.",
          "color": "var(--tb)",
          "speech": [
            [
              3.65,
              4.58
            ],
            [
              4.73,
              5.31
            ],
            [
              6.24,
              6.52
            ],
            [
              8.54,
              8.87
            ],
            [
              14.68,
              14.69
            ],
            [
              30.98,
              33.34
            ],
            [
              36.2,
              36.49
            ],
            [
              46.94,
              47.23
            ],
            [
              47.32,
              47.42
            ],
            [
              47.53,
              48.98
            ],
            [
              50.45,
              51.77
            ],
            [
              58.03,
              60.39
            ],
            [
              62.28,
              62.58
            ],
            [
              73.82,
              73.93
            ],
            [
              74.0,
              74.12
            ],
            [
              74.17,
              74.29
            ],
            [
              83.52,
              84.85
            ],
            [
              105.8,
              105.91
            ],
            [
              105.98,
              106.16
            ],
            [
              106.45,
              106.61
            ],
            [
              106.83,
              107.27
            ]
          ],
          "points": [
            {
              "t": 3.65,
              "stance": "Cite les indices de criminalité par pays pour dire que la France est en tête en Europe ; a du mal à se positionner car l'État et la bourgeoisie s'emparent de l'insécurité pour déployer les CRS."
            },
            {
              "t": 4.73,
              "stance": "Regrette que la gauche écarte les chiffres d'augmentation des crimes et délits en n'y voyant qu'un sentiment amplifié."
            },
            {
              "t": 30.98,
              "stance": "Pense que les violences sexuelles sont peu traitées parce que la police protège d'abord la propriété privée et l'État bourgeois, que ces violences ne remettent pas en cause."
            },
            {
              "t": 32.3,
              "stance": "Doute que les détenus aient plus peur les uns des autres que des gardiens : le rapport de force se joue entre personnes marginalisées, souvent racisées, et policiers blancs, avec un héritage colonial."
            },
            {
              "t": 47.53,
              "stance": "Estime que la droite n'aborde les violences sexuelles que pour stigmatiser les étrangers, et qu'un policier ne priorise pas une plainte domestique."
            },
            {
              "t": 50.45,
              "stance": "Soutient que le capitalisme n'a mis les femmes au travail que lorsque la productivité l'exigeait, avec le secteur tertiaire."
            },
            {
              "t": 58.03,
              "stance": "Ne souhaite pas que l'usage du cannabis se répande, mais voit dans la légalisation un moyen de financer une industrie plutôt qu'un système qui tue ; défend un contrôle d'État de l'alcool comme en Suède."
            },
            {
              "t": 83.52,
              "stance": "Cite l'idée que les mouvements violents, plus que les marches pacifistes, ont produit des changements, et doute qu'une convention citoyenne suffise tant que l'économie n'est pas bloquée."
            }
          ]
        },
        {
          "key": "B3",
          "placed": true,
          "x": 1.599,
          "y": 1.979,
          "kf": [
            [
              53.67,
              0.394,
              2.529
            ],
            [
              95.66,
              0.394,
              2.529
            ],
            [
              96.66,
              1.599,
              1.979
            ],
            [
              109.1,
              1.599,
              1.979
            ]
          ],
          "weight": 20.883,
          "entry": 5.33,
          "camp": "Sans camp net",
          "note": "Pense que les taux de crime ont baissé et que les médias entretiennent l'impression inverse ; veut des détenus traités dignement, voit dans la police et la formation une faute institutionnelle face aux violences sexuelles, refuse de pénaliser consommateurs et petits dealers et défend un pouvoir de pression du peuple sur l'État.",
          "color": "var(--tb)",
          "speech": [
            [
              5.33,
              6.24
            ],
            [
              6.42,
              6.45
            ],
            [
              6.52,
              7.28
            ],
            [
              17.68,
              19.2
            ],
            [
              23.17,
              23.54
            ],
            [
              23.72,
              25.87
            ],
            [
              26.01,
              26.89
            ],
            [
              41.38,
              42.53
            ],
            [
              53.67,
              55.03
            ],
            [
              55.09,
              55.67
            ],
            [
              62.59,
              62.74
            ],
            [
              62.8,
              66.05
            ],
            [
              78.13,
              79.07
            ],
            [
              79.12,
              79.9
            ],
            [
              80.09,
              83.45
            ],
            [
              85.27,
              85.39
            ],
            [
              95.66,
              97.95
            ],
            [
              98.1,
              98.24
            ],
            [
              108.54,
              108.68
            ]
          ],
          "points": [
            {
              "t": 5.33,
              "stance": "Croit que les taux de crime ont baissé depuis des décennies et que les médias entretiennent l'impression inverse par des faits divers permanents."
            },
            {
              "t": 6.52,
              "stance": "Relève que comparer les pays suppose de savoir quels crimes sont déclarés ; dans beaucoup de pays les violences sexuelles ne sont pas traitées correctement."
            },
            {
              "t": 17.68,
              "stance": "Se méfie d'un ordre carcéral imposé par les gardiens : trop de restrictions créent des trafics et de la violence, qu'un cadre de vie normal réduirait."
            },
            {
              "t": 23.17,
              "stance": "Estime que payer pour les détenus est un choix de société et une responsabilité collective, même si les prisons coûtent cher."
            },
            {
              "t": 25.41,
              "stance": "Dénonce le travail forcé des détenus aux États-Unis, mal payé et qui laisse endettés à la sortie."
            },
            {
              "t": 41.38,
              "stance": "Voit dans le mauvais accueil des plaintes pour violences sexuelles une faute institutionnelle de la police, de formation et d'éducation."
            },
            {
              "t": 53.67,
              "stance": "Estime que ni le consommateur ni le petit dealer ne sont les vrais coupables : sans demande il n'y aurait pas de trafic, et pénaliser les deux ne résout rien."
            },
            {
              "t": 62.8,
              "stance": "Explique l'addiction par la souffrance et la défavorisation, et le deal par le manque d'autres opportunités dans des quartiers à fort chômage."
            },
            {
              "t": 95.66,
              "stance": "Défend que la population ait un pouvoir de pression sur l'État par les grèves et blocages, pour que les dirigeants craignent le peuple."
            }
          ]
        },
        {
          "key": "B4",
          "placed": true,
          "x": 4.812,
          "y": 0.884,
          "kf": [
            [
              34.53,
              2.559,
              -0.714
            ],
            [
              45.83,
              2.559,
              -0.714
            ],
            [
              46.83,
              4.031,
              -0.581
            ],
            [
              55.7,
              4.031,
              -0.581
            ],
            [
              56.7,
              4.171,
              1.127
            ],
            [
              85.43,
              4.171,
              1.127
            ],
            [
              86.43,
              4.812,
              0.884
            ],
            [
              109.1,
              4.812,
              0.884
            ]
          ],
          "weight": 18.004,
          "entry": 7.31,
          "camp": "Sans camp net",
          "note": "Explique la criminalité par le manque de moyens de la justice et l'humiliation carcérale, juge le système classique incapable de traiter les violences sans témoin et voit dans le capitalisme un système qui se nourrit des inégalités ; préfère une justice alternative pour les personnes issues de la misère et pense que la violence fait partie du rapport de force.",
          "color": "var(--tb)",
          "speech": [
            [
              7.31,
              8.54
            ],
            [
              8.89,
              9.52
            ],
            [
              9.58,
              9.59
            ],
            [
              10.85,
              11.63
            ],
            [
              19.26,
              21.22
            ],
            [
              34.45,
              35.74
            ],
            [
              35.8,
              36.04
            ],
            [
              36.1,
              36.19
            ],
            [
              36.55,
              38.43
            ],
            [
              44.27,
              45.77
            ],
            [
              45.83,
              46.94
            ],
            [
              51.83,
              52.98
            ],
            [
              55.7,
              56.46
            ],
            [
              71.48,
              73.75
            ],
            [
              84.85,
              84.87
            ],
            [
              84.93,
              85.27
            ],
            [
              85.43,
              86.67
            ],
            [
              94.23,
              95.61
            ],
            [
              97.95,
              98.1
            ],
            [
              98.24,
              98.29
            ]
          ],
          "points": [
            {
              "t": 7.31,
              "stance": "Juge la comparaison européenne pertinente et voit dans le manque de juges et de greffiers, deux fois moindre que la moyenne, une explication du taux de criminalité élevé."
            },
            {
              "t": 8.89,
              "stance": "Pense qu'une justice sans moyens est plus lente, moins dissuasive et moins capable de réhabiliter, ce qui nourrit la criminalité."
            },
            {
              "t": 10.85,
              "stance": "Précise que les policiers par habitant sont proches de la moyenne européenne mais que la surpopulation carcérale atteint 140 % dans les prisons et 174 % dans les maisons d'arrêt."
            },
            {
              "t": 19.26,
              "stance": "Soutient que la culture policière laisse beaucoup de violences sexuelles non élucidées, le chiffre primant sur le fond, et que l'ordre imposé par la prison engendre humiliation et frustration ; ramène la question au financement public."
            },
            {
              "t": 34.53,
              "stance": "Soutient que le système judiciaire classique est incompétent pour les faits sans témoin et arrange la classe dirigeante, et que l'institution divise pour mieux régner entre détenus."
            },
            {
              "t": 36.55,
              "stance": "Distingue une justice qui punit pour donner du sens et une justice utilitariste ; note que la prison est efficace contre la délinquance en col blanc alors qu'une justice alternative convient mieux aux personnes issues de la misère."
            },
            {
              "t": 45.83,
              "stance": "Soutient que le capitalisme se nourrit des inégalités, y compris sexistes, en exploitant gratuitement le travail domestique des femmes."
            },
            {
              "t": 55.7,
              "stance": "Retient d'une série policière qu'une zone de tolérance de la drogue a été efficace sur les chiffres mais abandonnée par les politiques parce qu'inadmissible."
            },
            {
              "t": 71.48,
              "stance": "Dénonce que les médias traditionnels donnent un récit pro-gouvernemental des blocus en ne montrant que les dégradations, alors que les réseaux sociaux portent la voix des lycéens."
            },
            {
              "t": 85.43,
              "stance": "Estime que la violence fait partie du rapport de force, qu'il faut ensuite faire aboutir ; regrette que la table ne réunisse que des étudiants de grandes écoles."
            },
            {
              "t": 94.23,
              "stance": "Rappelle que les luttes se diversifient et que les puissants imposent aussi un agenda à la majorité, parfois par des actions financières."
            }
          ]
        },
        {
          "key": "B5",
          "placed": true,
          "x": -9.0,
          "y": 0.682,
          "kf": [
            [
              13.35,
              -3.08,
              1.446
            ],
            [
              39.89,
              -3.08,
              1.446
            ],
            [
              40.89,
              -5.584,
              2.364
            ],
            [
              49.02,
              -5.584,
              2.364
            ],
            [
              50.02,
              -6.736,
              2.057
            ],
            [
              56.51,
              -6.736,
              2.057
            ],
            [
              57.51,
              -6.641,
              0.221
            ],
            [
              86.67,
              -6.641,
              0.221
            ],
            [
              87.67,
              -9.0,
              0.682
            ],
            [
              109.1,
              -9.0,
              0.682
            ]
          ],
          "weight": 27.682,
          "entry": 9.61,
          "camp": "Sans camp net",
          "note": "Voix la plus attachée aux institutions : veut plus de places, de gardiens et de rénovation des prisons, des peines alternatives et du travail en prison, interdit et sanctionne consommateurs et vendeurs de drogue tout en offrant une substitution, et refuse de légitimer la violence au profit de référendums et de syndicats forts.",
          "color": "var(--tb)",
          "speech": [
            [
              9.61,
              10.77
            ],
            [
              11.83,
              14.64
            ],
            [
              14.69,
              16.15
            ],
            [
              21.27,
              23.13
            ],
            [
              28.93,
              30.92
            ],
            [
              34.5,
              34.52
            ],
            [
              39.54,
              39.65
            ],
            [
              39.89,
              41.21
            ],
            [
              49.02,
              50.44
            ],
            [
              56.51,
              57.96
            ],
            [
              66.12,
              68.69
            ],
            [
              68.74,
              68.8
            ],
            [
              73.93,
              73.96
            ],
            [
              74.38,
              76.24
            ],
            [
              86.67,
              92.15
            ],
            [
              98.35,
              101.98
            ],
            [
              102.65,
              103.1
            ]
          ],
          "points": [
            {
              "t": 9.61,
              "stance": "Dit que, que l'insécurité augmente ou non, il faut répondre aux plaintes dans les zones touchées ; le problème se situe surtout au niveau de la justice, dont les délais sont énormes, plus que de la police."
            },
            {
              "t": 11.83,
              "stance": "Veut plus de places et la rénovation des prisons vétustes, ainsi que de meilleures conditions de vie : un détenu humilié par l'État en sort plus enclin à récidiver."
            },
            {
              "t": 13.35,
              "stance": "Réclame plus de moyens pour faire régner l'ordre en prison dans l'intérêt des détenus, citant un détenu tué après des menaces connues."
            },
            {
              "t": 14.69,
              "stance": "Veut éloigner meurtriers et personnes dangereuses mais favorise des peines alternatives et du vrai travail en prison pour réinsérer."
            },
            {
              "t": 28.93,
              "stance": "Juge les peines alternatives difficiles à surveiller et préfère faire travailler en prison, qui sépare aussi du milieu criminel et dissuade."
            },
            {
              "t": 39.89,
              "stance": "Refuse d'attribuer le mauvais traitement des violences sexuelles à une volonté des élites : toute la société les tolérait, c'était institutionnalisé à tous niveaux."
            },
            {
              "t": 49.02,
              "stance": "Conteste que le capitalisme ait intérêt à écarter les femmes du travail : l'inégalité a appauvri tout le monde."
            },
            {
              "t": 56.51,
              "stance": "Maintient que consommateurs et vendeurs de drogue sont coupables parce qu'ils financent un narcotrafic meurtrier ; propose une substitution encadrée pour les personnes dépendantes et la légalisation de certaines drogues douces."
            },
            {
              "t": 74.38,
              "stance": "Voit un problème démocratique français : le seul moyen de se faire entendre serait de bloquer ; la violence discrédite les mouvements légitimes, comme après la mort de Nahel."
            },
            {
              "t": 86.67,
              "stance": "Refuse de légitimer la violence : dire qu'il en faut pour avancer est antidémocratique, et seuls ceux qui peuvent bloquer sont entendus."
            },
            {
              "t": 89.61,
              "stance": "Plaide pour plus de participation, des référendums d'initiative populaire et un pouvoir moins centralisé, et regrette que des assemblées citoyennes n'aient rien donné."
            },
            {
              "t": 99.94,
              "stance": "Estime qu'on peut faire bouger les choses avec moins de violence, par des syndicats plus forts et des moyens démocratiques comme la destitution."
            }
          ]
        },
        {
          "key": "B6",
          "placed": false,
          "x": null,
          "y": null,
          "kf": [],
          "weight": 4.072,
          "entry": 11.63,
          "camp": "Non placé : moins de 3 prises de position relevées",
          "note": "Peu d'interventions : se demande si l'on doit ajouter des places ou raccourcir les peines, s'étonne du silence médiatique sur la violence conjugale et défend l'idée d'une violence structurelle qu'il est difficile de condamner depuis une position privilégiée.",
          "color": "var(--tb)",
          "speech": [
            [
              11.63,
              11.79
            ],
            [
              16.19,
              16.39
            ],
            [
              16.56,
              16.87
            ],
            [
              38.43,
              39.41
            ],
            [
              68.97,
              69.1
            ],
            [
              92.17,
              92.63
            ],
            [
              92.68,
              94.16
            ],
            [
              105.2,
              105.49
            ],
            [
              105.75,
              105.8
            ]
          ],
          "points": [
            {
              "t": 16.56,
              "stance": "Demande si l'on doit vraiment ajouter des places ou si les peines sont trop longues, puisque des chiffres suggèrent que la longueur ne diminue pas la récidive."
            },
            {
              "t": 38.43,
              "stance": "S'étonne que certains meurtres soient très médiatisés alors que la violence conjugale, qui touche une femme sur trois, l'est peu ; l'explique par le caractère privé de cette violence."
            },
            {
              "t": 92.68,
              "stance": "Défend l'argument de la violence structurelle : dans un système idéal il n'y aurait pas de violence, mais condamner les personnes les plus touchées est difficile depuis une position de privilège."
            }
          ]
        },
        {
          "key": "B7",
          "placed": false,
          "x": null,
          "y": null,
          "kf": [],
          "weight": 0.842,
          "entry": 3.27,
          "camp": "Non placé : moins de 3 prises de position relevées",
          "note": "Trois interventions courtes : s'interroge sur la surmédiatisation des faits divers et juge que certaines peines, notamment pour les violences sexuelles, ne sont pas assez longues.",
          "color": "var(--tb)",
          "speech": [
            [
              3.27,
              3.33
            ],
            [
              4.58,
              4.67
            ],
            [
              16.97,
              17.63
            ],
            [
              105.09,
              105.12
            ]
          ],
          "points": [
            {
              "t": 4.58,
              "stance": "Se demande si la surmédiatisation des faits divers, avec leur reprise politique, ne fait pas plus peur qu'il ne faudrait."
            },
            {
              "t": 16.97,
              "stance": "Remarque que certaines peines ne sont pas assez longues, notamment pour les violences sexuelles, et que les condamnations restent rares."
            }
          ]
        }
      ],
      "interactions": [
        {
          "t": 4.73,
          "from": "B2",
          "to": "B7",
          "type": "accord",
          "desc": "Admet que le sentiment est amplifié par la médiatisation."
        },
        {
          "t": 5.33,
          "from": "B3",
          "to": "B2",
          "type": "desaccord",
          "desc": "Oppose que les taux de crime ont baissé depuis des décennies."
        },
        {
          "t": 6.52,
          "from": "B3",
          "to": "B2",
          "type": "desaccord",
          "desc": "Relève que les comparaisons dépendent des crimes déclarés à la police."
        },
        {
          "t": 7.31,
          "from": "B4",
          "to": "B3",
          "type": "accord",
          "desc": "Rejoint l'idée d'une dynamique surévaluée par les médias."
        },
        {
          "t": 7.31,
          "from": "B4",
          "to": "B2",
          "type": "accord",
          "desc": "Juge la comparaison européenne pertinente."
        },
        {
          "t": 8.54,
          "from": "B2",
          "to": "B4",
          "type": "desaccord",
          "desc": "Demande comment relier le manque de moyens de la justice à la criminalité."
        },
        {
          "t": 9.61,
          "from": "B5",
          "to": "B4",
          "type": "accord",
          "desc": "Se dit d'accord et déplace le problème vers la justice plus que la police."
        },
        {
          "t": 16.56,
          "from": "B6",
          "to": "B5",
          "type": "desaccord",
          "desc": "Demande si ajouter des places est la bonne réponse."
        },
        {
          "t": 17.68,
          "from": "B3",
          "to": "B5",
          "type": "desaccord",
          "desc": "Doute que l'ordre imposé par les gardiens soit la solution."
        },
        {
          "t": 19.26,
          "from": "B4",
          "to": "B3",
          "type": "accord",
          "desc": "Approuve que l'ordre pénitentiaire engendre violence et humiliation."
        },
        {
          "t": 21.27,
          "from": "B5",
          "to": "B3",
          "type": "concession",
          "desc": "Reconnaît que trop contraindre provoque de la violence."
        },
        {
          "t": 23.17,
          "from": "B3",
          "to": "B5",
          "type": "desaccord",
          "desc": "Rappelle que des camps de travail aux États-Unis relèvent de l'esclavage."
        },
        {
          "t": 26.96,
          "from": "B1",
          "to": "B5",
          "type": "desaccord",
          "desc": "Ne voit pas la finalité d'une prison améliorée où l'on travaille."
        },
        {
          "t": 28.93,
          "from": "B5",
          "to": "B1",
          "type": "desaccord",
          "desc": "Soutient que le travail en prison permet de séparer du milieu criminel."
        },
        {
          "t": 32.3,
          "from": "B2",
          "to": "B5",
          "type": "desaccord",
          "desc": "Doute que les détenus craignent plus leurs pairs que les gardiens."
        },
        {
          "t": 33.38,
          "from": "B1",
          "to": "B2",
          "type": "desaccord",
          "desc": "Refuse de mettre les violences sexuelles sur le dos des policiers."
        },
        {
          "t": 34.53,
          "from": "B4",
          "to": "B2",
          "type": "accord",
          "desc": "Rejoint l'idée que la structure arrange la classe dirigeante."
        },
        {
          "t": 35.8,
          "from": "B4",
          "to": "B2",
          "type": "desaccord",
          "desc": "Rappelle que l'institution divise pour mieux régner entre détenus."
        },
        {
          "t": 39.89,
          "from": "B5",
          "to": "B2",
          "type": "desaccord",
          "desc": "Refuse de rendre les élites responsables de la tolérance passée."
        },
        {
          "t": 41.38,
          "from": "B3",
          "to": "B5",
          "type": "accord",
          "desc": "Admet que la société a toléré ces violences, mais garde une part de faute à la police."
        },
        {
          "t": 42.53,
          "from": "B1",
          "to": "B3",
          "type": "accord",
          "desc": "Reconnaît le problème de traitement, mais déplace le sujet vers la prévention."
        },
        {
          "t": 43.44,
          "from": "B1",
          "to": "B5",
          "type": "concession",
          "desc": "Précise que ses propos n'impliquent aucune décision consciente des élites."
        },
        {
          "t": 45.83,
          "from": "B4",
          "to": "B5",
          "type": "desaccord",
          "desc": "Soutient que le capitalisme se nourrit des inégalités entre sexes."
        },
        {
          "t": 47.53,
          "from": "B2",
          "to": "B1",
          "type": "desaccord",
          "desc": "Soutient que la police traite mal les violences sexuelles."
        },
        {
          "t": 49.02,
          "from": "B5",
          "to": "B4",
          "type": "desaccord",
          "desc": "Conteste que le capitalisme ait intérêt à écarter les femmes du travail."
        },
        {
          "t": 50.45,
          "from": "B2",
          "to": "B5",
          "type": "desaccord",
          "desc": "Affirme que la mise au travail des femmes dépendait de la productivité."
        },
        {
          "t": 51.83,
          "from": "B4",
          "to": "B2",
          "type": "accord",
          "desc": "Rejoint l'idée d'une mutation liée au capitalisme, avec des raisons culturelles en plus."
        },
        {
          "t": 56.51,
          "from": "B5",
          "to": "B3",
          "type": "desaccord",
          "desc": "Maintient que consommateurs et vendeurs sont coupables."
        },
        {
          "t": 58.03,
          "from": "B2",
          "to": "B3",
          "type": "desaccord",
          "desc": "Demande ce que veut dire résoudre le problème de la drogue."
        },
        {
          "t": 60.39,
          "from": "B1",
          "to": "B5",
          "type": "desaccord",
          "desc": "Doute que la responsabilisation des consommateurs soit réaliste."
        },
        {
          "t": 62.28,
          "from": "B2",
          "to": "B5",
          "type": "desaccord",
          "desc": "Rappelle que presque tout objet de consommation exploite des gens."
        },
        {
          "t": 62.8,
          "from": "B3",
          "to": "B5",
          "type": "desaccord",
          "desc": "Soutient que la souffrance et la défavorisation expliquent addiction et deal."
        },
        {
          "t": 66.12,
          "from": "B5",
          "to": "B1",
          "type": "concession",
          "desc": "Admet que les gens sont mal informés, tout en maintenant l'interdiction."
        },
        {
          "t": 76.36,
          "from": "B1",
          "to": "B5",
          "type": "desaccord",
          "desc": "Distingue le discrédit imposé de la légitimité réelle d'un mouvement."
        },
        {
          "t": 78.13,
          "from": "B3",
          "to": "B1",
          "type": "accord",
          "desc": "Approuve que les médias propagent des images chocs."
        },
        {
          "t": 83.52,
          "from": "B2",
          "to": "B5",
          "type": "desaccord",
          "desc": "Doute que les voies démocratiques suffisent sans blocage économique."
        },
        {
          "t": 84.93,
          "from": "B4",
          "to": "B2",
          "type": "accord",
          "desc": "Rejoint la question du rapport de force."
        },
        {
          "t": 86.67,
          "from": "B5",
          "to": "B1",
          "type": "desaccord",
          "desc": "Refuse de légitimer la violence comme moyen d'avancer."
        },
        {
          "t": 92.68,
          "from": "B6",
          "to": "B5",
          "type": "desaccord",
          "desc": "Oppose la violence structurelle à l'appel à la non-violence."
        },
        {
          "t": 94.23,
          "from": "B4",
          "to": "B5",
          "type": "desaccord",
          "desc": "Rappelle que les puissants imposent aussi un agenda à la majorité."
        },
        {
          "t": 95.66,
          "from": "B3",
          "to": "B5",
          "type": "desaccord",
          "desc": "Soutient que grèves et blocages sont nécessaires pour que l'État craigne le peuple."
        },
        {
          "t": 98.35,
          "from": "B5",
          "to": "B3",
          "type": "desaccord",
          "desc": "Cite les pays nordiques, moins grévistes, pour dire qu'on peut faire autrement."
        },
        {
          "t": 101.98,
          "from": "B1",
          "to": "B5",
          "type": "desaccord",
          "desc": "Objecte qu'on ne peut demander aux opprimés d'être non violents."
        },
        {
          "t": 103.12,
          "from": "B1",
          "to": "B5",
          "type": "accord",
          "desc": "Admet qu'il faudrait éviter la violence."
        }
      ],
      "events": [
        {
          "t": 1.4,
          "type": "cadrage",
          "magnitude": 1,
          "title": "Présentation des outils de modération",
          "desc": "File d'attente, coupe-file et choix du sujet par les participants."
        },
        {
          "t": 3.0,
          "type": "cadrage",
          "magnitude": 2,
          "title": "Le rôle des médias dans le sentiment d'insécurité",
          "desc": "L'animation propose d'ouvrir sur l'assertion qui n'avait pas fait consensus."
        },
        {
          "t": 3.6,
          "type": "dissensus",
          "magnitude": 3,
          "title": "Insécurité réelle ou ressentie ? Les chiffres européens",
          "desc": "Classement de la France en tête de la criminalité en Europe contre baisse des taux et biais de déclaration."
        },
        {
          "t": 7.3,
          "type": "technique",
          "magnitude": 2,
          "title": "Moitié moins de juges et de greffiers que la moyenne européenne",
          "desc": "Les moyens de la justice avancés comme explication."
        },
        {
          "t": 11.8,
          "type": "dissensus",
          "magnitude": 2,
          "title": "Plus de places de prison ou des peines plus courtes ?",
          "desc": "Rénover et agrandir contre raccourcir les peines."
        },
        {
          "t": 17.7,
          "type": "dissensus",
          "magnitude": 2,
          "title": "Ordre carcéral ou conditions de vie normales ?",
          "desc": "Plus de gardiens contre des restrictions qui créent de la violence."
        },
        {
          "t": 23.2,
          "type": "technique",
          "magnitude": 2,
          "title": "Coût des détenus et travail forcé aux États-Unis",
          "desc": "Choix de société, esclavage des condamnés et dettes à la sortie."
        },
        {
          "t": 27.0,
          "type": "dissensus",
          "magnitude": 3,
          "title": "Quelle finalité pour la prison ?",
          "desc": "Travail en prison, séparation du milieu criminel ou solution de facilité."
        },
        {
          "t": 31.0,
          "type": "dissensus",
          "magnitude": 3,
          "title": "Violences sexuelles mal traitées : faute de la police, de l'État ou de la société ?",
          "desc": "Fonction de la police, formation, éducation et tolérance sociale ancienne."
        },
        {
          "t": 36.6,
          "type": "technique",
          "magnitude": 2,
          "title": "Punir ou réparer : prison et délinquance en col blanc",
          "desc": "Justice qui punit pour donner du sens contre justice utilitariste."
        },
        {
          "t": 45.8,
          "type": "dissensus",
          "magnitude": 3,
          "title": "Le capitalisme profite-t-il du sexisme ?",
          "desc": "Travail domestique non payé, productivité, secteur tertiaire."
        },
        {
          "t": 53.0,
          "type": "cadrage",
          "magnitude": 1,
          "title": "Passage au narcotrafic",
          "desc": "L'animation propose narcotrafic ou blocus ; la table choisit le narcotrafic."
        },
        {
          "t": 56.5,
          "type": "dissensus",
          "magnitude": 3,
          "title": "Consommateurs et vendeurs de drogue : coupables ou victimes ?",
          "desc": "Responsabilité, souffrance, absence d'alternatives, substitution encadrée."
        },
        {
          "t": 58.0,
          "type": "technique",
          "magnitude": 2,
          "title": "Alcool, cannabis et contrôle d'État",
          "desc": "Le modèle suédois de monopole sur l'alcool est évoqué."
        },
        {
          "t": 66.1,
          "type": "concession",
          "magnitude": 2,
          "title": "Interdire tout en admettant le manque d'information",
          "desc": "Un participant concède que les consommateurs sont mal renseignés."
        },
        {
          "t": 69.2,
          "type": "cadrage",
          "magnitude": 2,
          "title": "Les blocus lycéens",
          "desc": "L'animation expose revendications, dégradations et réponse de l'État."
        },
        {
          "t": 71.5,
          "type": "technique",
          "magnitude": 2,
          "title": "Médias traditionnels et réseaux sociaux face aux blocus",
          "desc": "Récit pro-gouvernemental contre voix des lycéens, bulles de filtres."
        },
        {
          "t": 74.4,
          "type": "dissensus",
          "magnitude": 3,
          "title": "La violence politique est-elle légitime ou efficace ?",
          "desc": "Discrédit des mouvements, rapport de force, comparaison historique."
        },
        {
          "t": 80.1,
          "type": "technique",
          "magnitude": 2,
          "title": "Mobilisations étudiantes en Serbie",
          "desc": "Comparaison avec trois ans de blocages et réaction autoritaire."
        },
        {
          "t": 83.5,
          "type": "dissensus",
          "magnitude": 3,
          "title": "Convention citoyenne ou rapport de force ?",
          "desc": "Doute sur l'effet des assemblées citoyennes sans pression économique."
        },
        {
          "t": 85.4,
          "type": "meta",
          "magnitude": 1,
          "title": "Un débat entre étudiants de grandes écoles",
          "desc": "Regret d'un entre-soi social et politique."
        },
        {
          "t": 98.1,
          "type": "meta",
          "magnitude": 1,
          "title": "Bilan : absence de contradicteurs de droite",
          "desc": "Une table intra-gauche, quelques regrets sur le cadrage et la contradiction."
        },
        {
          "t": 108.0,
          "type": "meta",
          "magnitude": 1,
          "title": "Annonce du débat suivant",
          "desc": "Écologie et capitalisme, ouvert à des personnes extérieures."
        }
      ],
      "tension": [
        [
          0,
          15
        ],
        [
          1.4,
          15
        ],
        [
          3.0,
          38
        ],
        [
          3.6,
          48
        ],
        [
          7.3,
          42
        ],
        [
          11.8,
          52
        ],
        [
          17.7,
          50
        ],
        [
          23.2,
          48
        ],
        [
          27.0,
          58
        ],
        [
          31.0,
          62
        ],
        [
          36.6,
          50
        ],
        [
          45.8,
          58
        ],
        [
          53.0,
          38
        ],
        [
          56.5,
          55
        ],
        [
          58.0,
          45
        ],
        [
          66.1,
          40
        ],
        [
          69.2,
          38
        ],
        [
          71.5,
          45
        ],
        [
          74.4,
          62
        ],
        [
          80.1,
          48
        ],
        [
          83.5,
          60
        ],
        [
          92.0,
          65
        ],
        [
          98.1,
          28
        ],
        [
          109.0,
          12
        ]
      ],
      "refus": []
    }
  ],
  "footer": [
    "⚠ Carte et camps de la transcription calculés, pas choisis : analyse en composantes principales et regroupement des prises de position relevées, selon la méthode de Polis, avec un test qui écarte les camps indiscernables du hasard. Quelques tables et une quinzaine de participants forment un petit échantillon : à lire avec prudence.",
    "⚠ Consensus et dissensus sont classés par calcul à partir des prises de position relevées : consensus = au moins 3 voix pour ou contre, dont au moins les trois quarts du même côté, classés par le consensus tenant compte des camps de Polis ; dissensus = des voix des deux côtés sans majorité nette. Ne pas s'être exprimé n'est ni une adhésion ni un rejet.",
    "⚠ Les énoncés et les prises de position sont relevés à la lecture de la transcription, chacun rattaché à un moment de l'enregistrement ; ce sont des reformulations, jamais des citations, et aucun prénom réel n'apparaît."
  ]
};
