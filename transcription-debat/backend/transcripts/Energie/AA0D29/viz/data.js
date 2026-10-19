// data.js — généré par analyze_debate.py (analyse Gemini)
// Coordonnées interprétatives, pas des mesures objectives.

window.DEBATE_DATA = {
  "meta": {
    "topic": "Energie",
    "code": "AA0D29",
    "date": "2026-09-28",
    "totalDurationMinutes": 85.7,
    "totalRedactedMinutes": 0,
    "method": {
      "kind": "manual",
      "mapTitle": "Positions des participants",
      "caption": "Chaque point est la position d'un participant, établie à la lecture intégrale de la transcription. Un point ne se déplace durablement que si la personne change explicitement d'avis (flèche « change d'avis ») ; dans ce débat, personne ne l'a fait. Ce qui bouge, ce sont les échanges : une flèche relie celui qui parle à celui à qui il répond (verte = accord, rouge pointillée = désaccord), et une concession explicite fait pencher un instant le point vers l'autre avant qu'il revienne. Cochez « Toutes les interactions » pour voir les alliances et les lignes de fracture accumulées, « Tous les déplacements » pour les mouvements survenus. Un point apparaît à la première prise de parole et grossit quand la personne parle ; survolez-le pour le résumé de sa position.",
      "footer": [
        "⚠ Analyse faite à la main (lecture intégrale de la transcription par Claude), sans scoring automatique. Les positions sont interprétatives et volontairement grossières : ±2,5 = penchant exprimé, ±5 = position claire, ±7,5 = position centrale et répétée. Personne n'est placé aux extrêmes (±10).",
        "⚠ Tension = intensité du désaccord, pas de l'émotion (le débat est resté courtois) : ~20 cadrage ou tour de table, 35-45 questions et échanges d'informations, 50-60 désaccord argumenté, 70-80 confrontation de principes avec répliques directes. La courbe relie ces niveaux, elle n'est pas mesurée seconde par seconde.",
        "⚠ Les résumés sont des reformulations, jamais des citations, et aucun prénom réel n'apparaît. Les phrases d'animation (donner la parole, annoncer le tour de table) sont écartées, y compris quand la transcription les attribue par erreur à un participant. Le temps de parole est mesuré sur la transcription, dont quelques frontières entre voix sont imprécises."
      ]
    }
  },
  "personas": [
    {
      "id": "i2",
      "label": "Interlocuteur 2",
      "camp": "Tarification juste du carbone",
      "color": "#2E86C1",
      "weight": 0.987,
      "entry": 0.0,
      "note": "Défend la tarification du carbone redistribuée, complétée par la réglementation, et vise un capitalisme réformé. Rôle d'explication important (données, marché des quotas). Soutien modéré aux instruments européens.",
      "speech": [
        [
          0.0,
          0.07
        ],
        [
          1.12,
          1.16
        ],
        [
          1.71,
          2.81
        ],
        [
          6.22,
          7.67
        ],
        [
          9.31,
          9.96
        ],
        [
          10.29,
          10.32
        ],
        [
          10.4,
          11.06
        ],
        [
          12.29,
          12.35
        ],
        [
          15.34,
          15.92
        ],
        [
          15.97,
          16.05
        ],
        [
          22.71,
          22.84
        ],
        [
          22.91,
          23.13
        ],
        [
          24.14,
          25.55
        ],
        [
          27.09,
          27.77
        ],
        [
          30.53,
          31.45
        ],
        [
          33.75,
          34.77
        ],
        [
          43.23,
          43.93
        ],
        [
          43.99,
          44.14
        ],
        [
          44.41,
          44.44
        ],
        [
          44.48,
          44.8
        ],
        [
          50.44,
          50.49
        ],
        [
          56.22,
          57.14
        ],
        [
          57.2,
          57.2
        ],
        [
          65.47,
          65.49
        ],
        [
          65.67,
          65.69
        ],
        [
          75.94,
          75.97
        ],
        [
          80.25,
          80.38
        ]
      ],
      "points": [
        {
          "t": 1.71,
          "stance": "Conteste que sortir du pétrole coûtera forcément plus cher : l'électrique a un bien meilleur rendement et le coût des renouvelables baisse."
        },
        {
          "t": 6.22,
          "stance": "Propose de rendre aux ménages toute la recette d'une taxe sur les fossiles : le pouvoir d'achat est préservé et l'incitation à moins consommer demeure."
        },
        {
          "t": 9.31,
          "stance": "Précise que le dispositif est neutre pour les finances publiques : tout ce qui est collecté est rendu."
        },
        {
          "t": 10.4,
          "stance": "Explique que sans redistribution on perd du pouvoir d'achat, alors qu'avec elle on reste incité à choisir l'option la moins carbonée."
        },
        {
          "t": 15.34,
          "stance": "Présente des données : en valeur absolue la tarification pèse davantage sur les ménages aisés, en proportion du revenu elle est régressive."
        },
        {
          "t": 24.14,
          "stance": "Juge la taxe carbone compatible avec la compétitivité : une hausse annoncée à l'avance permet aux industriels de planifier, et l'industrie de demain sera décarbonée."
        },
        {
          "t": 27.09,
          "stance": "Explique le marché européen des quotas : l'autorité publique fixe un plafond d'émissions qui baisse chaque année."
        },
        {
          "t": 30.53,
          "stance": "Répond que les lobbies combattent la tarification et que les quotas, fixés par l'État, équivalent à une taxe et non à une autorégulation des entreprises."
        },
        {
          "t": 33.75,
          "stance": "Prend une position médiane : la tarification ne suffit pas, il faut aussi réglementer et redistribuer pour une transition juste ; il vise un capitalisme réformé, pas sa fin."
        },
        {
          "t": 43.23,
          "stance": "Estime que presque tout est électrifiable et que la France, marché de 67 millions de consommateurs, pèse assez pour faire changer une multinationale."
        },
        {
          "t": 43.99,
          "stance": "Rappelle la responsabilité historique de la France parmi les grands émetteurs."
        },
        {
          "t": 44.48,
          "stance": "Explique que le prix du carbone européen s'applique aussi aux importations, via un ajustement aux frontières."
        },
        {
          "t": 56.22,
          "stance": "Constate un accord pour davantage de protectionnisme ; veut prioriser les investissements sans abandonner les renouvelables au profit du seul nucléaire."
        }
      ],
      "kf": [
        [
          0.0,
          -5.0,
          2.5
        ],
        [
          85.7,
          -5.0,
          2.5
        ]
      ]
    },
    {
      "id": "i1",
      "label": "Interlocuteur 1",
      "camp": "Rupture avec le marché",
      "color": "#C0392B",
      "weight": 0.821,
      "entry": 1.06,
      "note": "Position la plus nette du débat contre les instruments de marché : plaide pour la contrainte et défend l'idée d'une sortie du capitalisme.",
      "speech": [
        [
          1.06,
          1.12
        ],
        [
          1.21,
          1.67
        ],
        [
          17.73,
          19.36
        ],
        [
          23.18,
          24.14
        ],
        [
          29.07,
          30.53
        ],
        [
          31.54,
          32.48
        ],
        [
          34.8,
          37.23
        ],
        [
          37.28,
          37.31
        ],
        [
          57.2,
          58.0
        ],
        [
          82.62,
          83.39
        ]
      ],
      "points": [
        {
          "t": 1.21,
          "stance": "Juge un carburant cher inévitable : le pétrole est l'énergie la plus dense et la moins chère, donc en sortir coûtera plus cher."
        },
        {
          "t": 17.73,
          "stance": "Refuse une redistribution uniforme, qui profiterait aussi aux usagers des transports sans voiture, et propose une aide ciblée, financée collectivement, pour les ménages de périphérie contraints à la voiture thermique."
        },
        {
          "t": 23.18,
          "stance": "Estime que l'incitation ne suffira pas vu le retard pris : il faut contraindre les entreprises, par exemple à financer le covoiturage de leurs salariés."
        },
        {
          "t": 29.07,
          "stance": "Voit le marché carbone comme une diversion qui étend la financiarisation au lieu de transformer la production ; propose de penser la transition comme un changement de modèle de société plutôt que comme une contrainte de compétitivité."
        },
        {
          "t": 31.54,
          "stance": "Lit l'opposition des entreprises à la taxe comme le conflit classique entre capital et travail, et doute qu'on change de société en gardant le vocabulaire du marché et du profit."
        },
        {
          "t": 34.8,
          "stance": "Défend qu'une sortie du capitalisme, même lointaine et floue, n'est pas mauvaise pour autant ; invoque des travaux sur une société post-capitaliste et l'industrialisation soviétique."
        },
        {
          "t": 36.07,
          "stance": "Pose l'alternative entre une société durable et la protection du profit, qu'il juge difficilement conciliables."
        },
        {
          "t": 57.2,
          "stance": "Voit les délocalisations comme la logique même du capital et non comme un échec ; imagine une coopération où la Chine fabriquerait nos voitures en échange de savoir-faire français."
        },
        {
          "t": 82.62,
          "stance": "Relie l'autonomie productive à l'écologie : produire plus près, en circuit court, éviterait une part des émissions du transport mondial."
        }
      ],
      "kf": [
        [
          1.06,
          7.5,
          0.0
        ],
        [
          85.7,
          7.5,
          0.0
        ]
      ],
      "uncertain": {
        "y": "propos dans les deux sens (autonomie en circuit court, mais coopération industrielle avec la Chine), rien sur l'Europe"
      }
    },
    {
      "id": "i3",
      "label": "Interlocuteur 3",
      "camp": "Transformation structurelle, Europe",
      "color": "#E67E22",
      "weight": 0.665,
      "entry": 2.9,
      "note": "Doute de l'effet du prix sur la consommation de carburant et appelle à une transformation structurelle ; avec l'Interlocuteur 9, défenseur le plus explicite d'une Europe coopérative.",
      "speech": [
        [
          2.9,
          4.51
        ],
        [
          41.38,
          42.63
        ],
        [
          43.08,
          43.22
        ],
        [
          47.85,
          50.44
        ],
        [
          50.62,
          50.83
        ],
        [
          59.87,
          61.78
        ]
      ],
      "points": [
        {
          "t": 2.9,
          "stance": "Juge le carburant peu sensible au prix : faute d'alternative, les ménages ne consomment pas moins quand il augmente ; le problème est technologique et exige une transformation profonde des transports."
        },
        {
          "t": 41.38,
          "stance": "Estime que la France reste un gros pollueur malgré une électricité décarbonée : deux tiers de son énergie sont des fossiles importés, et le modèle de surconsommation doit changer."
        },
        {
          "t": 47.85,
          "stance": "Pose la question de la souveraineté : faudrait-il ouvrir le marché européen aux voitures électriques chinoises, bien moins chères, au prix de l'industrie automobile européenne ?"
        },
        {
          "t": 59.87,
          "stance": "Plaide pour une Europe plus forte et plus coopérative, sur le modèle d'Airbus, comme réponse à la question de la souveraineté ; juge les pays européens alignés sur la transition."
        }
      ],
      "kf": [
        [
          2.9,
          5.0,
          7.5
        ],
        [
          85.7,
          5.0,
          7.5
        ]
      ]
    },
    {
      "id": "i4",
      "label": "Interlocuteur 4",
      "camp": "Technique, prix incitatif",
      "color": "#8E6C4A",
      "weight": 0.096,
      "entry": 4.56,
      "note": "Deux courtes interventions (environ une minute) : l'une technique sur le nucléaire, l'autre qui explique favorablement le dividende carbone. Position à lire avec prudence.",
      "speech": [
        [
          4.56,
          5.23
        ],
        [
          11.06,
          11.27
        ],
        [
          11.36,
          11.6
        ]
      ],
      "points": [
        {
          "t": 4.56,
          "stance": "Rappelle que l'uranium, et demain la fusion, sont aussi des sources très denses et décarbonées : le pétrole n'est pas la seule."
        },
        {
          "t": 11.06,
          "stance": "Reformule le dividende carbone : si l'électrique devient moins cher, toucher l'aide tout en roulant à l'électrique pousse à changer de véhicule."
        }
      ],
      "kf": [
        [
          4.56,
          -2.5,
          0.0
        ],
        [
          85.7,
          -2.5,
          0.0
        ]
      ],
      "uncertain": {
        "y": "ne s'est pas exprimé sur l'échelle nationale ou européenne"
      }
    },
    {
      "id": "i5",
      "label": "Interlocuteur 5",
      "camp": "Justice sociale d'abord",
      "color": "#27AE60",
      "weight": 0.314,
      "entry": 5.27,
      "note": "Priorité à la justice sociale : la hausse du prix pèse sur les plus pauvres sans changer les habitudes des plus aisés ; refuse l'attentisme au nom de la compétitivité.",
      "speech": [
        [
          5.27,
          6.16
        ],
        [
          11.28,
          11.35
        ],
        [
          12.41,
          14.07
        ],
        [
          27.81,
          28.27
        ],
        [
          40.26,
          40.82
        ]
      ],
      "points": [
        {
          "t": 5.27,
          "stance": "Alerte : renchérir les fossiles frappe d'abord les ménages pauvres sans alternative, tandis que les plus aisés, souvent plus pollueurs, ne changeront rien."
        },
        {
          "t": 12.41,
          "stance": "Récuse l'argument de la fraude aux aides, mais doute de l'efficacité d'une aide universelle quand beaucoup ne réclament pas leurs droits, alors que l'urgence presse."
        },
        {
          "t": 13.52,
          "stance": "Estime que l'incitation ne fait pas bouger ceux qui ont les moyens de garder leur confort, comme les propriétaires de gros SUV."
        },
        {
          "t": 27.81,
          "stance": "Récuse l'argument de la compétitivité : si chacun attend que les autres agissent, personne n'agit."
        },
        {
          "t": 40.26,
          "stance": "Rappelle que les émissions importées restent les nôtres : délocaliser la production ne fait que déplacer le carbone."
        }
      ],
      "kf": [
        [
          5.27,
          5.0,
          0.0
        ],
        [
          85.7,
          5.0,
          0.0
        ]
      ],
      "uncertain": {
        "y": "ne s'est pas exprimé sur l'échelle nationale ou européenne"
      }
    },
    {
      "id": "i9",
      "label": "Interlocuteur 9",
      "camp": "Incitation et Europe",
      "color": "#16A085",
      "weight": 0.946,
      "entry": 7.67,
      "note": "Défenseur le plus constant de l'incitation par le prix et d'un capitalisme réformé ; plaide en clôture pour l'échelle européenne. S'oppose à l'ouverture totale aux voitures chinoises : protection européenne, pas repli national.",
      "speech": [
        [
          7.67,
          8.28
        ],
        [
          16.05,
          17.72
        ],
        [
          25.62,
          26.89
        ],
        [
          26.94,
          27.09
        ],
        [
          32.54,
          33.72
        ],
        [
          37.31,
          38.96
        ],
        [
          44.19,
          44.41
        ],
        [
          44.47,
          44.48
        ],
        [
          44.86,
          44.92
        ],
        [
          50.84,
          52.06
        ],
        [
          52.19,
          52.53
        ],
        [
          58.05,
          58.82
        ],
        [
          83.39,
          84.88
        ],
        [
          84.93,
          85.12
        ],
        [
          85.51,
          85.55
        ],
        [
          85.63,
          85.73
        ]
      ],
      "points": [
        {
          "t": 7.67,
          "stance": "Reformule le dividende carbone : taxer le carburant tout en compensant les plus précaires, qui gagnent davantage s'ils réduisent leur consommation."
        },
        {
          "t": 16.05,
          "stance": "Estime que la protection des plus pauvres ne doit pas bloquer une mesure nécessaire : la majorité peut payer plus, et à long terme le prix pousse ménages et entreprises à changer."
        },
        {
          "t": 17.45,
          "stance": "Cite l'exemple d'une taxe carbone générale redistribuée, avec des critères sociaux pour les plus précaires."
        },
        {
          "t": 25.62,
          "stance": "Préfère une taxe carbone universelle et lisible à la contrainte et aux réglementations au cas par cas, jugées complexes et inefficaces."
        },
        {
          "t": 32.54,
          "stance": "Tient le capitalisme pour le seul modèle viable : il faut le réformer en y intégrant le coût écologique, et la taxe carbone est le moyen le plus efficace."
        },
        {
          "t": 37.31,
          "stance": "Juge irréaliste un changement de système radical que la majorité refuse : mieux vaut des étapes acceptables."
        },
        {
          "t": 44.19,
          "stance": "Demande que la taxe carbone européenne s'applique aussi aux importations."
        },
        {
          "t": 50.84,
          "stance": "Refuse d'ouvrir totalement le marché européen aux voitures chinoises : pas de réciprocité, et mieux vaut produire ici pour contrôler la pollution de fabrication."
        },
        {
          "t": 58.05,
          "stance": "Refuse d'abandonner un secteur à la Chine en échange d'un autre, la dépendance étant asymétrique ; le recyclage peut couvrir une partie des besoins en matériaux."
        },
        {
          "t": 83.39,
          "stance": "Défend l'échelle européenne : la France seule est trop petite, l'Europe unie pèse face aux États-Unis et à la Chine et partage un consensus sur la transition."
        }
      ],
      "kf": [
        [
          7.67,
          -7.5,
          7.5
        ],
        [
          85.7,
          -7.5,
          7.5
        ]
      ]
    },
    {
      "id": "i6",
      "label": "Interlocuteur 6",
      "camp": "Souveraineté, moins d'État",
      "color": "#7F8C8D",
      "weight": 0.769,
      "entry": 8.33,
      "note": "Sceptique envers les aides et la redistribution, souhaite moins d'impôts à l'intérieur mais des taxes sur les importations ; seul à rejeter nettement l'intégration européenne.",
      "speech": [
        [
          8.33,
          9.31
        ],
        [
          47.32,
          47.43
        ],
        [
          66.6,
          69.98
        ],
        [
          72.47,
          72.76
        ],
        [
          72.86,
          77.07
        ]
      ],
      "points": [
        {
          "t": 8.33,
          "stance": "Doute d'une nouvelle aide : le système d'aides est déjà confus, coûteux et sujet aux abus, en ajouter une serait un obstacle de plus."
        },
        {
          "t": 66.6,
          "stance": "Regrette une perte de volonté d'être autonome et souverain dans tous les domaines, au-delà du simple équilibre commercial."
        },
        {
          "t": 68.11,
          "stance": "Juge l'Union européenne devenue trop puissante, au-dessus des États, et dit ne pas se sentir européen."
        },
        {
          "t": 69.17,
          "stance": "Accepte des accords entre pays d'accord, y compris pour avancer sur l'écologie, mais sans autorité européenne qui dirige les autres."
        },
        {
          "t": 72.86,
          "stance": "Sur le Mercosur, préfère que chaque pays décide de ses accords, et accepte des taxes pour protéger la production française."
        },
        {
          "t": 74.18,
          "stance": "Souhaite une économie nationale qui tourne sur elle-même, avec un État qui prélève et redistribue moins."
        },
        {
          "t": 75.97,
          "stance": "Propose de beaucoup moins taxer à l'intérieur pour laisser les gens acheter, et de taxer fortement ce qui vient de l'extérieur."
        }
      ],
      "kf": [
        [
          8.33,
          -5.0,
          -7.5
        ],
        [
          85.7,
          -5.0,
          -7.5
        ]
      ]
    },
    {
      "id": "i7",
      "label": "Interlocuteur 7",
      "camp": "Questionnement, quotas",
      "color": "#D4AC0D",
      "weight": 0.439,
      "entry": 10.03,
      "note": "Intervient surtout par des questions ; seule prise de position nette : étudier des quotas carbone individuels pour limiter les émissions des plus riches.",
      "speech": [
        [
          10.03,
          10.29
        ],
        [
          10.34,
          10.4
        ],
        [
          11.67,
          11.99
        ],
        [
          21.93,
          22.03
        ],
        [
          22.08,
          22.29
        ],
        [
          22.84,
          22.88
        ],
        [
          23.13,
          23.14
        ],
        [
          44.92,
          46.58
        ],
        [
          46.69,
          47.32
        ],
        [
          47.43,
          47.84
        ],
        [
          55.77,
          56.18
        ],
        [
          65.27,
          65.33
        ],
        [
          65.8,
          65.85
        ],
        [
          69.98,
          70.83
        ]
      ],
      "points": [
        {
          "t": 10.03,
          "stance": "Ne voit pas où est l'incitation si le surcoût du carburant est entièrement rendu en aides."
        },
        {
          "t": 11.67,
          "stance": "Souligne qu'une famille modeste compensée n'a ni incitation ni pénalité à changer de voiture."
        },
        {
          "t": 44.92,
          "stance": "Rappelle que la hausse du prix vient déjà des crises géopolitiques, que l'État ne maîtrise pas ; propose d'étudier des quotas carbone individuels pour que les plus riches ne puissent pas polluer sans limite, et doute qu'une taxe dissuade une entreprise très rentable."
        },
        {
          "t": 55.77,
          "stance": "Souligne que la Chine finance massivement sa recherche pour baisser ses coûts, quand la France réduit la sienne."
        },
        {
          "t": 69.98,
          "stance": "S'interroge sur les causes du déclin européen et cite l'ouverture plafonnée du Canada aux voitures électriques chinoises, sans en tirer de conclusion."
        }
      ],
      "kf": [
        [
          10.03,
          2.5,
          0.0
        ],
        [
          85.7,
          2.5,
          0.0
        ]
      ],
      "uncertain": {
        "y": "a posé des questions sur l'Europe et le libre-échange sans prendre position"
      }
    },
    {
      "id": "i10",
      "label": "Interlocuteur 10",
      "camp": "Stratégie industrielle d'État",
      "color": "#8E44AD",
      "weight": 0.913,
      "entry": 11.99,
      "note": "Soutient la hausse du prix comme levier industriel, mais attribue la désindustrialisation au capitalisme et propose de collectiviser les industries clés ; pro-européen, avec des critiques (marché de l'électricité).",
      "speech": [
        [
          11.99,
          12.08
        ],
        [
          12.19,
          12.26
        ],
        [
          20.02,
          21.23
        ],
        [
          22.05,
          22.08
        ],
        [
          53.49,
          55.64
        ],
        [
          55.69,
          55.7
        ],
        [
          61.78,
          64.08
        ],
        [
          64.14,
          64.19
        ],
        [
          70.9,
          72.45
        ],
        [
          72.76,
          72.77
        ],
        [
          77.08,
          78.14
        ],
        [
          78.2,
          79.84
        ],
        [
          79.89,
          80.25
        ],
        [
          80.42,
          80.5
        ]
      ],
      "points": [
        {
          "t": 11.99,
          "stance": "Relève qu'un dividende uniforme transfère de l'argent de ceux qui paient le carburant vers ceux qui roulent à l'électrique, souvent plus aisés."
        },
        {
          "t": 20.02,
          "stance": "Soutient la hausse du prix des hydrocarbures comme levier pour électrifier les usages et pousser l'industrie nationale à innover, tout en se disant sensible à son coût social."
        },
        {
          "t": 53.49,
          "stance": "Voit dans la désindustrialisation un échec du marché européen, rappelle que les rapports de force et les logiques néocoloniales ne sont pas nouveaux, et appelle à choisir des filières prioritaires."
        },
        {
          "t": 61.78,
          "stance": "Juge que s'engager dans la transition avec des partenaires européens nous renforce ; critique le marché européen de l'électricité et la fausse coopération des usines chinoises en Europe."
        },
        {
          "t": 70.9,
          "stance": "Attribue les délocalisations au système capitaliste plutôt qu'à un manque de volonté, et préfère rapprocher les intérêts européens plutôt qu'éclater l'Europe."
        },
        {
          "t": 77.08,
          "stance": "Juge l'autonomie économique difficile : les productions sont très interconnectées à l'échelle mondiale."
        },
        {
          "t": 78.2,
          "stance": "Propose de collectiviser les industries clés comme l'énergie, et dénonce la cession forcée des barrages hydroélectriques au privé."
        }
      ],
      "kf": [
        [
          11.99,
          5.0,
          5.0
        ],
        [
          85.7,
          5.0,
          5.0
        ]
      ]
    },
    {
      "id": "i8",
      "label": "Interlocuteur 8",
      "camp": "Pragmatisme industriel",
      "color": "#C0507A",
      "weight": 1.0,
      "entry": 14.07,
      "note": "Accepte un carburant très cher s'il s'accompagne d'un leasing social, veut protéger l'industrie et conditionner l'ouverture aux constructeurs chinois ; doute que l'Europe puisse s'entendre, tout en préférant agir à l'échelle européenne pour le climat.",
      "speech": [
        [
          14.07,
          15.34
        ],
        [
          21.26,
          21.93
        ],
        [
          22.08,
          22.08
        ],
        [
          22.31,
          22.7
        ],
        [
          28.27,
          28.97
        ],
        [
          38.96,
          40.26
        ],
        [
          40.82,
          41.32
        ],
        [
          42.63,
          43.08
        ],
        [
          43.22,
          43.23
        ],
        [
          50.49,
          50.62
        ],
        [
          52.56,
          53.49
        ],
        [
          58.82,
          59.76
        ],
        [
          59.81,
          59.82
        ],
        [
          64.08,
          64.12
        ],
        [
          64.19,
          65.27
        ],
        [
          65.33,
          65.8
        ],
        [
          65.86,
          66.56
        ],
        [
          72.77,
          72.86
        ],
        [
          80.5,
          82.51
        ]
      ],
      "points": [
        {
          "t": 14.07,
          "stance": "Accepterait un carburant très cher, jusqu'à 4 euros le litre, à condition d'offrir un leasing social pour l'électrique : on ne peut pas priver les gens de se déplacer."
        },
        {
          "t": 21.26,
          "stance": "Tempère son propos : on ne peut pas sacrifier le tissu économique ni le transport routier, essentiel au pays, sans se faire distancer par les voisins."
        },
        {
          "t": 28.27,
          "stance": "Concède qu'attendre les autres mène à l'inaction, mais juge qu'agir seul est perdu d'avance : mieux vaut agir au moins à l'échelle européenne."
        },
        {
          "t": 38.96,
          "stance": "Se demande si la France, peu industrialisée, pollue vraiment beaucoup, une grande part de ses émissions étant importée."
        },
        {
          "t": 40.82,
          "stance": "Propose de limiter d'abord les importations pour reprendre la main sur ces émissions."
        },
        {
          "t": 52.56,
          "stance": "Refuse de laisser mourir l'industrie nationale en comptant sur la Chine ou les États-Unis, dans un monde de rapports de force."
        },
        {
          "t": 58.82,
          "stance": "Voit d'un bon œil l'implantation d'usines chinoises en Europe si elle s'accompagne de transferts de technologie."
        },
        {
          "t": 64.19,
          "stance": "Propose d'autoriser les constructeurs chinois à produire en Europe en échange d'emplois, d'ingénieurs et de recherche locale, en reconnaissant le risque pour les constructeurs français."
        },
        {
          "t": 80.5,
          "stance": "Juge qu'un modèle dirigiste comme libéral peut réussir, et que l'entente européenne ne marchera jamais, chaque pays défendant ses entreprises."
        }
      ],
      "kf": [
        [
          14.07,
          -2.5,
          -2.5
        ],
        [
          85.7,
          -2.5,
          -2.5
        ]
      ]
    }
  ],
  "refus": [],
  "totalRedactedMinutes": 0,
  "totalDurationMinutes": 85.7,
  "axes": {
    "x": {
      "leftLabel": "Marché et incitation",
      "rightLabel": "État et contrainte",
      "anchors": {
        "left": [
          "Une taxe carbone universelle et lisible est plus efficace que des réglementations au cas par cas",
          "Le capitalisme est le seul modèle viable : il faut le réformer en y intégrant le coût du carbone",
          "L'État devrait moins taxer et moins redistribuer, pour laisser l'économie tourner"
        ],
        "right": [
          "Le marché carbone est une diversion qui financiarise la transition sans changer la production",
          "Inciter ne suffira pas : il faut contraindre les entreprises",
          "Il faut remettre les industries clés, comme l'énergie, entre les mains de la collectivité"
        ]
      }
    },
    "y": {
      "bottomLabel": "Nation et autonomie",
      "topLabel": "Europe et coopération",
      "anchors": {
        "bottom": [
          "L'Union européenne est devenue trop puissante : mieux valent des accords ponctuels entre pays",
          "La coopération européenne échouera toujours, chaque pays défendant ses propres entreprises",
          "Il faut retrouver la volonté d'être autonome dans tous les domaines"
        ],
        "top": [
          "La France seule est trop petite : la bonne échelle pour la transition est l'Europe",
          "Une Europe plus coopérative, sur le modèle d'Airbus, est la clé de la souveraineté"
        ]
      }
    },
    "quadrants": {
      "topLeft": "Libéralisme européen",
      "topRight": "Europe volontariste",
      "bottomLeft": "Libéralisme souverainiste",
      "bottomRight": "Souverainisme étatiste"
    }
  },
  "schools": [],
  "events": [
    {
      "t": 0.12,
      "type": "cadrage",
      "magnitude": 2,
      "title": "Lancement sur un vote clivant",
      "desc": "L'animation part d'une affirmation qui a divisé les votes : un carburant cher serait un mal nécessaire pour sortir du pétrole."
    },
    {
      "t": 1.71,
      "type": "dissensus",
      "magnitude": 2,
      "title": "Sortir du pétrole coûtera-t-il plus cher ?",
      "desc": "D'un côté, le pétrole reste l'énergie la plus dense et la moins chère ; de l'autre, le meilleur rendement de l'électrique et la baisse du coût des renouvelables."
    },
    {
      "t": 2.9,
      "type": "dissensus",
      "magnitude": 2,
      "title": "Le prix fait-il baisser la consommation ?",
      "desc": "Le carburant est jugé peu sensible au prix faute d'alternative : sans transformation des transports, une hausse ne réduirait pas la consommation."
    },
    {
      "t": 5.27,
      "type": "dissensus",
      "magnitude": 2,
      "title": "Qui paie la hausse ?",
      "desc": "La hausse pèserait d'abord sur les ménages pauvres et contraints, sans changer les habitudes des plus aisés."
    },
    {
      "t": 6.22,
      "type": "technique",
      "magnitude": 2,
      "title": "Le dividende carbone",
      "desc": "Proposition de rendre aux ménages toute la recette de la taxe : pouvoir d'achat préservé, incitation maintenue. Le mécanisme demande plusieurs reformulations avant d'être compris."
    },
    {
      "t": 12.41,
      "type": "dissensus",
      "magnitude": 2,
      "title": "Fraude ou non-recours ?",
      "desc": "La fraude aux aides est jugée marginale ; le vrai problème serait que beaucoup ne réclament pas les aides auxquelles ils ont droit."
    },
    {
      "t": 16.05,
      "type": "dissensus",
      "magnitude": 2,
      "title": "Ne pas bloquer la transition",
      "desc": "La protection des plus précaires ne doit pas empêcher une hausse jugée nécessaire, la majorité pouvant payer plus."
    },
    {
      "t": 23.18,
      "type": "dissensus",
      "magnitude": 2,
      "title": "Inciter ou contraindre ?",
      "desc": "Pour l'un, l'incitation est trop lente et il faut contraindre les entreprises ; pour d'autres, une taxe annoncée et croissante suffit, et la contrainte multiplie les exceptions."
    },
    {
      "t": 28.27,
      "type": "concession",
      "magnitude": 2,
      "title": "Agir seul ou attendre les autres",
      "desc": "Face à l'objection que l'attentisme mène à l'inaction, un participant concède et propose d'agir au moins à l'échelle européenne."
    },
    {
      "t": 29.07,
      "type": "dissensus",
      "magnitude": 3,
      "title": "Le marché carbone, outil ou diversion ?",
      "desc": "Le marché des quotas est accusé de financiariser la transition ; réponse : les entreprises le combattent, et c'est l'État qui en fixe les quotas."
    },
    {
      "t": 32.54,
      "type": "dissensus",
      "magnitude": 3,
      "title": "Réformer ou dépasser le capitalisme",
      "desc": "Confrontation de principes : un capitalisme réformé serait le seul modèle viable, contre l'idée qu'une société durable est difficilement compatible avec le profit."
    },
    {
      "t": 33.75,
      "type": "concession",
      "magnitude": 1,
      "title": "La tarification ne suffit pas",
      "desc": "Position médiane : le prix du carbone doit être complété par la réglementation et la redistribution pour une transition juste."
    },
    {
      "t": 34.8,
      "type": "dissensus",
      "magnitude": 3,
      "title": "Le détour par l'histoire",
      "desc": "Arguments historiques croisés (industrialisation soviétique, essor chinois après les réformes) sur la viabilité d'un autre système."
    },
    {
      "t": 38.96,
      "type": "cadrage",
      "magnitude": 2,
      "title": "La France est-elle un gros pollueur ?",
      "desc": "Changement de sujet : le poids des émissions importées, estimées par les participants à environ la moitié de l'empreinte."
    },
    {
      "t": 47.85,
      "type": "cadrage",
      "magnitude": 2,
      "title": "Ouvrir le marché aux voitures chinoises ?",
      "desc": "Faut-il accepter des voitures électriques bien moins chères au prix de l'industrie automobile européenne ?"
    },
    {
      "t": 56.22,
      "type": "consensus",
      "magnitude": 2,
      "title": "Davantage de protection",
      "desc": "Constat largement partagé : il faut être plus protectionniste et choisir des filières prioritaires."
    },
    {
      "t": 57.2,
      "type": "dissensus",
      "magnitude": 2,
      "title": "Coopérer avec la Chine ?",
      "desc": "Proposition d'échanger la fabrication de voitures contre du savoir-faire, rejetée au nom d'une dépendance asymétrique."
    },
    {
      "t": 66.6,
      "type": "dissensus",
      "magnitude": 3,
      "title": "Nation ou Europe",
      "desc": "Défense d'une autonomie nationale et rejet d'une Union trop puissante, face aux partisans d'une Europe plus intégrée."
    },
    {
      "t": 70.9,
      "type": "dissensus",
      "magnitude": 2,
      "title": "Volonté ou système ?",
      "desc": "Réponse : les délocalisations tiennent au système capitaliste plus qu'à un manque de volonté, et il faut rapprocher les intérêts européens plutôt que les séparer."
    },
    {
      "t": 78.2,
      "type": "cadrage",
      "magnitude": 1,
      "title": "Collectiviser l'énergie ?",
      "desc": "Proposition de reprendre en main publique les industries clés, à partir de l'exemple des barrages hydroélectriques. Elle n'est reprise par personne ensuite."
    },
    {
      "t": 80.5,
      "type": "dissensus",
      "magnitude": 2,
      "title": "L'entente européenne est-elle possible ?",
      "desc": "Doute sur la coopération européenne (un programme d'armement commun en échec) ; réponse en clôture : seule l'échelle européenne pèse face aux États-Unis et à la Chine."
    },
    {
      "t": 85.14,
      "type": "meta",
      "magnitude": 2,
      "title": "Tour de table",
      "desc": "Chacun revient en une minute sur le débat ; le constat partagé est que le prix du carburant a occupé une grande partie du temps."
    }
  ],
  "tension": [
    [
      0,
      20
    ],
    [
      1.2,
      30
    ],
    [
      1.7,
      42
    ],
    [
      2.9,
      48
    ],
    [
      5.3,
      52
    ],
    [
      6.2,
      45
    ],
    [
      8.3,
      48
    ],
    [
      10.0,
      45
    ],
    [
      12.4,
      55
    ],
    [
      14.1,
      48
    ],
    [
      16.0,
      55
    ],
    [
      17.7,
      48
    ],
    [
      19.4,
      35
    ],
    [
      22.5,
      35
    ],
    [
      23.2,
      55
    ],
    [
      25.6,
      60
    ],
    [
      27.1,
      48
    ],
    [
      27.8,
      52
    ],
    [
      28.3,
      45
    ],
    [
      29.1,
      65
    ],
    [
      31.5,
      70
    ],
    [
      32.5,
      75
    ],
    [
      33.8,
      68
    ],
    [
      34.8,
      75
    ],
    [
      37.3,
      75
    ],
    [
      38.9,
      42
    ],
    [
      41.4,
      50
    ],
    [
      44.5,
      40
    ],
    [
      47.3,
      32
    ],
    [
      47.8,
      42
    ],
    [
      50.8,
      48
    ],
    [
      52.6,
      55
    ],
    [
      53.5,
      55
    ],
    [
      56.2,
      40
    ],
    [
      57.2,
      50
    ],
    [
      58.0,
      55
    ],
    [
      59.9,
      45
    ],
    [
      64.2,
      42
    ],
    [
      66.6,
      55
    ],
    [
      68.1,
      62
    ],
    [
      70.0,
      45
    ],
    [
      70.9,
      60
    ],
    [
      72.5,
      55
    ],
    [
      74.2,
      50
    ],
    [
      77.1,
      50
    ],
    [
      78.2,
      48
    ],
    [
      79.9,
      32
    ],
    [
      80.5,
      48
    ],
    [
      82.6,
      40
    ],
    [
      83.4,
      48
    ],
    [
      85.1,
      22
    ],
    [
      85.7,
      20
    ]
  ],
  "polarization": {
    "x": 6.1,
    "y": 10.1,
    "n": 10,
    "nY": 6,
    "method": "esteban_ray",
    "alpha": 1.6
  },
  "interactions": [
    {
      "t": 1.71,
      "from": "i2",
      "to": "i1",
      "type": "desaccord",
      "desc": "Rejette l'idée que sortir du pétrole coûtera forcément plus cher."
    },
    {
      "t": 2.9,
      "from": "i3",
      "to": "i1",
      "type": "desaccord",
      "desc": "Se dit en désaccord avec l'idée d'un carburant cher comme mal nécessaire : la demande ne baisse pas avec le prix."
    },
    {
      "t": 2.9,
      "from": "i3",
      "to": "i2",
      "type": "desaccord",
      "desc": "Corrige l'argument du rendement : le problème de l'électrique est la densité des batteries."
    },
    {
      "t": 4.56,
      "from": "i4",
      "to": "i1",
      "type": "desaccord",
      "desc": "Conteste que le pétrole soit seul à offrir une forte densité énergétique : l'uranium aussi."
    },
    {
      "t": 5.27,
      "from": "i5",
      "to": "i1",
      "type": "desaccord",
      "desc": "Répond à l'idée d'un carburant cher : ce sont les plus pauvres qui paieraient."
    },
    {
      "t": 8.33,
      "from": "i6",
      "to": "i2",
      "type": "desaccord",
      "desc": "Juge que le dividende carbone tourne en rond et ajoute une aide de plus à un système confus."
    },
    {
      "t": 9.31,
      "from": "i2",
      "to": "i6",
      "type": "desaccord",
      "desc": "Répond que le dispositif est neutre : tout ce qui est prélevé est rendu."
    },
    {
      "t": 10.03,
      "from": "i7",
      "to": "i2",
      "type": "desaccord",
      "desc": "Objecte qu'on ne voit pas l'incitation si le surcoût est entièrement rendu."
    },
    {
      "t": 11.06,
      "from": "i4",
      "to": "i2",
      "type": "accord",
      "desc": "Vient en appui du dividende carbone en réexpliquant l'incitation."
    },
    {
      "t": 11.67,
      "from": "i7",
      "to": "i4",
      "type": "desaccord",
      "desc": "Maintient qu'une famille modeste compensée n'a ni incitation ni pénalité."
    },
    {
      "t": 11.99,
      "from": "i10",
      "to": "i2",
      "type": "desaccord",
      "desc": "Objecte qu'un dividende uniforme transfère de l'argent vers les ménages plus aisés déjà électrifiés."
    },
    {
      "t": 12.41,
      "from": "i5",
      "to": "i6",
      "type": "desaccord",
      "desc": "Récuse l'argument des abus : la fraude aux aides est marginale."
    },
    {
      "t": 16.05,
      "from": "i9",
      "to": "i5",
      "type": "desaccord",
      "desc": "Reconnaît l'impact sur les plus pauvres mais refuse qu'il bloque une mesure nécessaire."
    },
    {
      "t": 17.73,
      "from": "i1",
      "to": "i9",
      "type": "desaccord",
      "desc": "Refuse une redistribution à tous, y compris à ceux qui n'ont pas de voiture."
    },
    {
      "t": 20.02,
      "from": "i10",
      "to": "i9",
      "type": "accord",
      "desc": "Rejoint l'idée qu'une hausse brutale est risquée à court terme mais utile à long terme."
    },
    {
      "t": 21.26,
      "from": "i8",
      "to": "i10",
      "type": "desaccord",
      "desc": "Ne partage pas son optimisme sur les entreprises : on risque d'abandonner le tissu économique."
    },
    {
      "t": 23.18,
      "from": "i1",
      "to": "i10",
      "type": "desaccord",
      "desc": "Reprend son mot inciter : il faudrait plutôt contraindre les entreprises."
    },
    {
      "t": 24.14,
      "from": "i2",
      "to": "i8",
      "type": "desaccord",
      "desc": "Répond sur la compétitivité : la taxe carbone ne l'empêche pas, l'Allemagne la soutient."
    },
    {
      "t": 24.14,
      "from": "i2",
      "to": "i1",
      "type": "desaccord",
      "desc": "Soutient qu'une incitation annoncée et croissante peut être très forte."
    },
    {
      "t": 25.62,
      "from": "i9",
      "to": "i2",
      "type": "accord",
      "desc": "Se dit d'accord : l'incitation peut marcher."
    },
    {
      "t": 25.62,
      "from": "i9",
      "to": "i1",
      "type": "desaccord",
      "desc": "Juge que la contrainte n'est pas la bonne solution."
    },
    {
      "t": 27.81,
      "from": "i5",
      "to": "i8",
      "type": "desaccord",
      "desc": "Se dit mal à l'aise avec l'argument de la compétitivité, qui mène à l'inaction générale."
    },
    {
      "t": 28.27,
      "from": "i8",
      "to": "i5",
      "type": "concession",
      "desc": "Se dit tout à fait d'accord et reconnaît avoir défendu le point de vue inverse, tout en voulant agir à l'échelle européenne."
    },
    {
      "t": 29.07,
      "from": "i1",
      "to": "i2",
      "type": "desaccord",
      "desc": "Voit dans le marché carbone une diversion financière."
    },
    {
      "t": 29.07,
      "from": "i1",
      "to": "i8",
      "type": "desaccord",
      "desc": "Refuse de voir la transition comme une contrainte qui nous affaiblirait face aux voisins."
    },
    {
      "t": 30.53,
      "from": "i2",
      "to": "i1",
      "type": "desaccord",
      "desc": "Répond que les entreprises combattent la tarification et que l'État fixe les quotas."
    },
    {
      "t": 31.54,
      "from": "i1",
      "to": "i2",
      "type": "desaccord",
      "desc": "Maintient que le marché carbone reste une diversion, dans un conflit entre capital et travail."
    },
    {
      "t": 32.54,
      "from": "i9",
      "to": "i1",
      "type": "desaccord",
      "desc": "Se dit pas tout à fait d'accord : sortir du capitalisme est hypothétique, le réformer est la seule voie."
    },
    {
      "t": 33.75,
      "from": "i2",
      "to": "i1",
      "type": "concession",
      "desc": "Cherche à nuancer entre les deux : la tarification ne suffit pas et la transition doit être juste."
    },
    {
      "t": 33.75,
      "from": "i2",
      "to": "i9",
      "type": "accord",
      "desc": "N'attend pas de la transition la fin du capitalisme, mais sa réforme."
    },
    {
      "t": 34.8,
      "from": "i1",
      "to": "i9",
      "type": "desaccord",
      "desc": "Répond qu'hypothétique ne veut pas dire mauvais, et discute les exemples historiques."
    },
    {
      "t": 37.31,
      "from": "i9",
      "to": "i1",
      "type": "desaccord",
      "desc": "Réplique par l'exemple chinois et le refus d'un changement radical par la majorité."
    },
    {
      "t": 40.26,
      "from": "i5",
      "to": "i8",
      "type": "desaccord",
      "desc": "Répond que les émissions importées restent les nôtres."
    },
    {
      "t": 41.38,
      "from": "i3",
      "to": "i8",
      "type": "desaccord",
      "desc": "Répond à sa question : oui, la France est un gros pollueur."
    },
    {
      "t": 43.23,
      "from": "i2",
      "to": "i8",
      "type": "desaccord",
      "desc": "Conteste que la France soit impuissante face à une multinationale."
    },
    {
      "t": 52.56,
      "from": "i8",
      "to": "i9",
      "type": "accord",
      "desc": "Va dans son sens : on ne peut pas faire aveuglément confiance à la Chine ou aux États-Unis."
    },
    {
      "t": 53.49,
      "from": "i10",
      "to": "i8",
      "type": "desaccord",
      "desc": "Se dit en désaccord : les rapports de force ne sont pas nouveaux, la loi n'a pas soudain perdu son effet."
    },
    {
      "t": 56.22,
      "from": "i2",
      "to": "i10",
      "type": "accord",
      "desc": "Se dit très d'accord sur la nécessité de prioriser."
    },
    {
      "t": 57.2,
      "from": "i1",
      "to": "i10",
      "type": "desaccord",
      "desc": "Conteste le mot échec : délocaliser est la logique même du capital."
    },
    {
      "t": 58.05,
      "from": "i9",
      "to": "i1",
      "type": "desaccord",
      "desc": "Refuse d'abandonner un secteur à la Chine en échange d'un autre."
    },
    {
      "t": 59.87,
      "from": "i3",
      "to": "i10",
      "type": "accord",
      "desc": "Se dit d'accord sur la nécessité de prioriser."
    },
    {
      "t": 61.78,
      "from": "i10",
      "to": "i3",
      "type": "accord",
      "desc": "Le rejoint sur la coopération européenne."
    },
    {
      "t": 63.27,
      "from": "i10",
      "to": "i8",
      "type": "desaccord",
      "desc": "Répond que les usines chinoises en Europe ne sont pas un vrai transfert de technologie."
    },
    {
      "t": 64.08,
      "from": "i8",
      "to": "i10",
      "type": "accord",
      "desc": "Se dit plutôt d'accord : ce n'est pas le transfert de technologie espéré."
    },
    {
      "t": 68.11,
      "from": "i6",
      "to": "i3",
      "type": "desaccord",
      "desc": "S'oppose à une Europe plus intégrée : il ne se sent pas européen."
    },
    {
      "t": 70.9,
      "from": "i10",
      "to": "i6",
      "type": "desaccord",
      "desc": "Juge que parler de volonté revient à se voiler la face : c'est le système qui délocalise."
    },
    {
      "t": 72.47,
      "from": "i6",
      "to": "i10",
      "type": "desaccord",
      "desc": "Reprend son exemple du Mercosur pour conclure en sens inverse : chaque pays doit décider."
    },
    {
      "t": 77.08,
      "from": "i10",
      "to": "i6",
      "type": "desaccord",
      "desc": "Juge son idée d'économie nationale en circuit fermé intéressante mais irréaliste."
    },
    {
      "t": 80.5,
      "from": "i8",
      "to": "i3",
      "type": "desaccord",
      "desc": "Oppose à l'exemple d'Airbus les échecs de coopération européenne."
    },
    {
      "t": 82.62,
      "from": "i1",
      "to": "i6",
      "type": "accord",
      "desc": "Reprend la question de l'autonomie en y ajoutant l'argument écologique."
    },
    {
      "t": 83.39,
      "from": "i9",
      "to": "i6",
      "type": "desaccord",
      "desc": "Juge la France trop petite pour une économie centrée sur elle-même."
    },
    {
      "t": 83.39,
      "from": "i9",
      "to": "i8",
      "type": "desaccord",
      "desc": "Défend qu'une vraie économie européenne est possible et nécessaire."
    }
  ],
  "synthesis": {
    "theme": "Énergie : quelles consommation et production viser ?",
    "summary": "Lancé sur une affirmation qui avait divisé les votes (un carburant cher serait un mal nécessaire pour sortir du pétrole), le débat a d'abord porté sur le prix des carburants et sur qui le paierait : dividende carbone, aides ciblées, leasing social. Il a ensuite opposé incitation et contrainte, jusqu'à une confrontation de principes sur le capitalisme. La seconde moitié a quitté l'énergie pour l'empreinte carbone importée, la concurrence chinoise, la souveraineté industrielle et la construction européenne. Les niveaux de consommation à viser n'ont jamais été discutés, et la production d'énergie (nucléaire, renouvelables, barrages) n'est apparue que par touches. Personne n'a changé d'avis : deux concessions ponctuelles, un large accord sur le poids social des hausses de prix et sur la protection industrielle, et des désaccords durables sur le dividende carbone, le capitalisme et l'Europe.",
    "groups": [
      {
        "label": "Réformer par le prix, à l'échelle européenne",
        "color": "#2E86C1",
        "members": [
          "i9",
          "i2"
        ],
        "arguments": [
          "Une taxe carbone universelle et prévisible, dont la recette est rendue aux ménages, garde l'incitation sans appauvrir.",
          "Une hausse annoncée à l'avance est une incitation forte ; la contrainte multiplie les exceptions.",
          "Le capitalisme doit être réformé, pas renversé : la majorité refuse un changement radical.",
          "L'Europe est la bonne échelle : marché des quotas, ajustement carbone aux frontières, poids face aux États-Unis et à la Chine."
        ]
      },
      {
        "label": "Changer de modèle : contrainte, justice sociale, État stratège",
        "color": "#C0392B",
        "members": [
          "i1",
          "i5",
          "i3",
          "i10"
        ],
        "arguments": [
          "Le carburant est peu sensible au prix, et la hausse frappe d'abord les ménages contraints sans changer les habitudes des plus aisés.",
          "L'incitation est trop lente : il faut contraindre les entreprises et cibler les aides.",
          "Le marché carbone financiarise la transition ; les délocalisations sont la logique même du capital.",
          "L'État doit choisir des filières prioritaires, voire collectiviser l'énergie."
        ],
        "note": "Divisé sur l'Europe : les Interlocuteurs 3 et 10 la défendent, les Interlocuteurs 1 et 5 ne se sont pas prononcés."
      },
      {
        "label": "Souveraineté et pragmatisme industriel",
        "color": "#7F8C8D",
        "members": [
          "i6",
          "i8"
        ],
        "arguments": [
          "Le système d'aides est déjà confus et coûteux : une aide de plus serait un obstacle.",
          "Il faut protéger l'industrie nationale et limiter les importations.",
          "L'Union européenne est trop puissante, ou incapable de s'entendre.",
          "Ouvrir aux constructeurs chinois seulement en échange d'emplois et de transferts de technologie."
        ],
        "note": "Divergent sur la fiscalité : l'Interlocuteur 6 veut moins de taxes intérieures, l'Interlocuteur 8 accepterait un carburant à 4 euros le litre avec un leasing social."
      }
    ],
    "unclassified": {
      "members": [
        "i4",
        "i7"
      ],
      "note": "Trop peu d'éléments pour un rattachement : l'Interlocuteur 4 a parlé environ une minute, l'Interlocuteur 7 est surtout intervenu par des questions."
    },
    "kinds": {
      "coeur": {
        "label": "Cœur du sujet",
        "desc": "Quels niveaux de consommation et quel mix de production d'énergie viser."
      },
      "connexe": {
        "label": "Leviers et effets",
        "desc": "Les moyens d'y arriver et leurs conséquences : prix, taxe, redistribution, mobilité, empreinte."
      },
      "annexe": {
        "label": "Sujets annexes",
        "desc": "Sujets de société, d'économie ou de géopolitique où le lien avec l'énergie devient indirect."
      }
    },
    "themes": [
      {
        "id": "prod",
        "kind": "coeur",
        "short": "Production",
        "color": "#2E86C1",
        "label": "Production et technologies",
        "desc": "Densité énergétique du pétrole et de l'uranium, rendement de l'électrique, batteries, part des fossiles, électrification."
      },
      {
        "id": "prix",
        "kind": "connexe",
        "short": "Prix",
        "color": "#E67E22",
        "label": "Prix du carburant",
        "desc": "Une hausse du prix fait-elle baisser la consommation ? Demande jugée peu sensible au prix."
      },
      {
        "id": "social",
        "kind": "connexe",
        "short": "Social",
        "color": "#27AE60",
        "label": "Justice sociale et redistribution",
        "desc": "Poids des hausses sur les ménages modestes, dividende carbone, aides, fraude et non-recours."
      },
      {
        "id": "mobilite",
        "kind": "connexe",
        "short": "Mobilité",
        "color": "#16A085",
        "label": "Mobilité et transports",
        "desc": "Leasing social, covoiturage, transports en commun, camions électriques."
      },
      {
        "id": "instr",
        "kind": "connexe",
        "short": "Inciter/contraindre",
        "color": "#D4AC0D",
        "label": "Inciter ou contraindre",
        "desc": "Compétitivité, taxe carbone et marché européen des quotas, quotas individuels."
      },
      {
        "id": "import",
        "kind": "connexe",
        "short": "Importations",
        "color": "#8E6C4A",
        "label": "Empreinte importée",
        "desc": "La France est-elle un gros pollueur ? Émissions importées, ajustement carbone aux frontières."
      },
      {
        "id": "capital",
        "kind": "annexe",
        "short": "Capitalisme",
        "color": "#C0392B",
        "label": "Capitalisme et modèle de société",
        "desc": "Réformer ou dépasser le capitalisme ; détour par l'histoire soviétique et chinoise."
      },
      {
        "id": "chine",
        "kind": "annexe",
        "short": "Chine",
        "color": "#8E44AD",
        "label": "Chine et souveraineté industrielle",
        "desc": "Voitures électriques chinoises, dépendance aux matériaux, transferts de technologie, autonomie productive."
      },
      {
        "id": "europe",
        "kind": "annexe",
        "short": "Europe",
        "color": "#34495E",
        "label": "Construction européenne",
        "desc": "Coopération européenne (Airbus, programme d'armement commun), Union trop puissante, Mercosur."
      },
      {
        "id": "etat",
        "kind": "annexe",
        "short": "État",
        "color": "#C0507A",
        "label": "Rôle de l'État et fiscalité",
        "desc": "Économie nationale en circuit fermé, impôts et redistribution, collectivisation des industries clés."
      }
    ],
    "timeline": [
      [
        0.0,
        1.2,
        null
      ],
      [
        1.2,
        2.9,
        "prod"
      ],
      [
        2.9,
        4.55,
        "prix"
      ],
      [
        4.55,
        5.27,
        "prod"
      ],
      [
        5.27,
        14.07,
        "social"
      ],
      [
        14.07,
        15.34,
        "mobilite"
      ],
      [
        15.34,
        17.73,
        "social"
      ],
      [
        17.73,
        20.02,
        "mobilite"
      ],
      [
        20.02,
        21.93,
        "instr"
      ],
      [
        21.93,
        23.18,
        "mobilite"
      ],
      [
        23.18,
        29.07,
        "instr"
      ],
      [
        29.07,
        38.96,
        "capital"
      ],
      [
        38.96,
        42.63,
        "import"
      ],
      [
        42.63,
        43.4,
        "prod"
      ],
      [
        43.4,
        44.9,
        "import"
      ],
      [
        44.9,
        47.85,
        "instr"
      ],
      [
        47.85,
        59.87,
        "chine"
      ],
      [
        59.87,
        63.27,
        "europe"
      ],
      [
        63.27,
        66.6,
        "chine"
      ],
      [
        66.6,
        74.18,
        "europe"
      ],
      [
        74.18,
        79.89,
        "etat"
      ],
      [
        79.89,
        80.5,
        null
      ],
      [
        80.5,
        82.62,
        "europe"
      ],
      [
        82.62,
        83.39,
        "chine"
      ],
      [
        83.39,
        84.93,
        "europe"
      ],
      [
        84.93,
        85.7,
        null
      ]
    ],
    "mentions": [
      {
        "t": 20.02,
        "theme": "prod",
        "label": "Batteries et électrification des usages"
      },
      {
        "t": 56.22,
        "theme": "prod",
        "label": "Renouvelables contre nucléaire : ne pas abandonner les renouvelables"
      },
      {
        "t": 61.78,
        "theme": "prod",
        "label": "Marché européen de l'électricité, jugé défavorable à EDF"
      },
      {
        "t": 78.2,
        "theme": "prod",
        "label": "Barrages hydroélectriques et leur cession au privé"
      }
    ],
    "affirmations": [
      {
        "text": "Un carburant cher est un mal nécessaire pour sortir du pétrole",
        "stances": [
          {
            "id": "i1",
            "pos": "pour",
            "t": 1.21
          },
          {
            "id": "i9",
            "pos": "pour",
            "t": 16.05
          },
          {
            "id": "i10",
            "pos": "pour",
            "t": 20.02
          },
          {
            "id": "i8",
            "pos": "nuance",
            "t": 14.07,
            "note": "d'accord à condition d'un leasing social, puis tempère"
          },
          {
            "id": "i2",
            "pos": "nuance",
            "t": 1.71,
            "note": "pour une hausse, mais conteste que la transition coûte forcément plus cher"
          },
          {
            "id": "i3",
            "pos": "contre",
            "t": 2.9
          },
          {
            "id": "i5",
            "pos": "contre",
            "t": 5.27
          }
        ]
      },
      {
        "text": "Rendre aux ménages la recette d'une taxe carbone préserve l'incitation",
        "stances": [
          {
            "id": "i2",
            "pos": "pour",
            "t": 6.22
          },
          {
            "id": "i4",
            "pos": "pour",
            "t": 11.06
          },
          {
            "id": "i9",
            "pos": "pour",
            "t": 17.45
          },
          {
            "id": "i6",
            "pos": "contre",
            "t": 8.33
          },
          {
            "id": "i7",
            "pos": "contre",
            "t": 10.03
          },
          {
            "id": "i10",
            "pos": "contre",
            "t": 11.99
          },
          {
            "id": "i1",
            "pos": "contre",
            "t": 17.73,
            "note": "contre une redistribution uniforme, pour une aide ciblée"
          }
        ]
      },
      {
        "text": "Une hausse du prix de l'énergie pèse d'abord sur les ménages modestes",
        "stances": [
          {
            "id": "i3",
            "pos": "pour",
            "t": 2.9
          },
          {
            "id": "i5",
            "pos": "pour",
            "t": 5.27
          },
          {
            "id": "i2",
            "pos": "pour",
            "t": 15.34
          },
          {
            "id": "i9",
            "pos": "pour",
            "t": 16.05
          },
          {
            "id": "i1",
            "pos": "pour",
            "t": 17.73
          },
          {
            "id": "i10",
            "pos": "pour",
            "t": 20.02
          }
        ]
      },
      {
        "text": "Pour accélérer, il faut contraindre les entreprises plutôt que les inciter",
        "stances": [
          {
            "id": "i1",
            "pos": "pour",
            "t": 23.18
          },
          {
            "id": "i2",
            "pos": "contre",
            "t": 24.14
          },
          {
            "id": "i9",
            "pos": "contre",
            "t": 25.62
          }
        ]
      },
      {
        "text": "Le capitalisme peut être réformé pour intégrer la contrainte écologique",
        "stances": [
          {
            "id": "i9",
            "pos": "pour",
            "t": 32.54
          },
          {
            "id": "i2",
            "pos": "pour",
            "t": 33.75
          },
          {
            "id": "i1",
            "pos": "contre",
            "t": 34.8
          },
          {
            "id": "i3",
            "pos": "nuance",
            "t": 41.38,
            "note": "met en cause un modèle de surconsommation, sans conclure sur le capitalisme"
          },
          {
            "id": "i10",
            "pos": "nuance",
            "t": 70.9,
            "note": "attribue les délocalisations au système capitaliste, sans dire qu'il est irréformable"
          }
        ]
      },
      {
        "text": "La France est un gros pollueur",
        "stances": [
          {
            "id": "i5",
            "pos": "pour",
            "t": 40.26
          },
          {
            "id": "i3",
            "pos": "pour",
            "t": 41.38
          },
          {
            "id": "i2",
            "pos": "pour",
            "t": 43.99
          },
          {
            "id": "i8",
            "pos": "contre",
            "t": 38.96,
            "note": "en doute, la France étant peu industrialisée"
          }
        ]
      },
      {
        "text": "Il faut taxer ou limiter les importations fortement carbonées",
        "stances": [
          {
            "id": "i8",
            "pos": "pour",
            "t": 40.82
          },
          {
            "id": "i9",
            "pos": "pour",
            "t": 44.19
          },
          {
            "id": "i2",
            "pos": "pour",
            "t": 44.48
          },
          {
            "id": "i6",
            "pos": "pour",
            "t": 75.97
          }
        ]
      },
      {
        "text": "Il ne faut pas ouvrir complètement le marché européen aux voitures électriques chinoises",
        "stances": [
          {
            "id": "i9",
            "pos": "pour",
            "t": 50.84
          },
          {
            "id": "i8",
            "pos": "pour",
            "t": 52.56
          },
          {
            "id": "i10",
            "pos": "pour",
            "t": 53.49
          },
          {
            "id": "i2",
            "pos": "pour",
            "t": 56.22
          },
          {
            "id": "i3",
            "pos": "nuance",
            "t": 47.85,
            "note": "pose le dilemme, attiré par les voitures chinoises mais attaché à l'industrie européenne"
          },
          {
            "id": "i1",
            "pos": "contre",
            "t": 57.2,
            "note": "propose que la Chine fabrique nos voitures contre du savoir-faire"
          }
        ]
      },
      {
        "text": "Il faut choisir des filières industrielles prioritaires",
        "stances": [
          {
            "id": "i10",
            "pos": "pour",
            "t": 55.16
          },
          {
            "id": "i2",
            "pos": "pour",
            "t": 56.22
          },
          {
            "id": "i3",
            "pos": "pour",
            "t": 59.87
          },
          {
            "id": "i9",
            "pos": "nuance",
            "t": 58.05,
            "note": "refuse d'abandonner un secteur en échange d'un autre"
          }
        ]
      },
      {
        "text": "L'Europe est la bonne échelle pour la transition et la souveraineté",
        "stances": [
          {
            "id": "i3",
            "pos": "pour",
            "t": 59.87
          },
          {
            "id": "i10",
            "pos": "pour",
            "t": 61.78
          },
          {
            "id": "i9",
            "pos": "pour",
            "t": 83.39
          },
          {
            "id": "i6",
            "pos": "contre",
            "t": 68.11
          },
          {
            "id": "i8",
            "pos": "contre",
            "t": 80.5
          }
        ]
      }
    ]
  }
};
