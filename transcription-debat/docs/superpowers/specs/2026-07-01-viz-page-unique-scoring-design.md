# Design — Visualisation page unique : trajectoires crédibles par scoring de blocs

**Date** : 2026-07-01 · **Branche** : `feat/viz-llm-generation` · **Statut** : validé par l'utilisateur

## Problème

Le dashboard actuel (`viz/index.html`, 5 onglets) n'est pas crédible aux yeux de
l'utilisateur : les trajectoires (V2) sont des keyframes inventées globalement par
Gemini (~5 par voix), les points bougent « sans raison », les axes ne sont pas
compris, et rien ne relie un mouvement à ce qui a réellement été dit.

## Objectif

Une **page unique** centrée sur deux vues synchronisées — carte des trajectoires
animée + frise de tension — où **chaque position est traçable** :

- chaque prise de parole substantielle est scorée individuellement par Gemini ;
- la trajectoire est **calculée en Python** (lissage) à partir de ces scores —
  plus aucune trajectoire inventée par le LLM ;
- chaque point scoré porte une **paraphrase élégante du point de vue exprimé**
  (1-2 phrases). **Jamais de citation exacte** (choix explicite de l'utilisateur,
  cohérent avec l'anonymisation RGPD du projet) ;
- les axes sont **ancrés** : chaque pôle est défini et illustré par 2-3
  positions-types paraphrasées entendues dans *ce* débat.

Les vues V1 (carte statique), V4 (réseau conceptuel) et V5 (flux thématique,
jamais alimenté) sont **supprimées**, ainsi que la passe Gemini « concepts ».

## Décisions actées

| Question | Décision |
|---|---|
| Crédibilité des trajectoires | Scoring par bloc + trajectoire calculée (approche A) |
| Citations exactes | **Interdites** — paraphrases uniquement |
| Sort des autres vues | Supprimées (page = trajectoires + tension seulement) |
| Passe « concepts » (4) | Supprimée avec ses validateurs/prompts/tests |
| `schools` (passe 1) | Conservées dans les données, **non affichées** |

## Architecture backend — `analyze_debate.py`, 3 passes

### Passe 1 — Cadre (enrichie)

Comme aujourd'hui (axes `leftLabel/rightLabel/bottomLabel/topLabel`, quadrants,
camp + note par voix, schools), **plus** l'ancrage des axes :

```json
"axes": {
  "x": { "leftLabel": "...", "rightLabel": "...",
         "anchors": { "left": ["paraphrase 1", "paraphrase 2"],
                      "right": ["paraphrase 1", "paraphrase 2"] } },
  "y": { "bottomLabel": "...", "topLabel": "...",
         "anchors": { "bottom": [...], "top": [...] } }
}
```

Chaque ancre = paraphrase d'une position réellement entendue dans le débat qui
incarne ce pôle. `validate_frame` exige 2-3 ancres non vides par pôle.

### Passe 2 — Events + tension

Inchangée.

### Passe 3 — Scoring par bloc (remplace `run_trajectories`)

**Sélection des blocs substantiels** (calculée, sans LLM) :
- voix présentes dans `personas` (issues de `compute_voices`) ;
- exclut `[REFUS]`, `[?]` et les blocs de moins de `MIN_BLOCK_WORDS = 15` mots.

**Appel Gemini** : lots de 25 blocs avec contexte ±3 (même mécanique que
`correct_transcript.py`). Pour chaque bloc, sortie :

```json
{ "i": 12, "x": -4.0, "y": 6.5, "stance": "Défend que …", "salience": 0.8 }
```

ou `{ "i": 12, "none": true }` si le bloc n'exprime aucune position
(logistique, question neutre, relance). `x`/`y` ∈ [AXIS_MIN, AXIS_MAX] = [-10, 10],
`salience` ∈ [0, 1].

**Validation par lot** (`validate_scores`) : indices ⊆ indices envoyés, bornes,
`stance` non vide si pas `none`, structure correcte → retry ×2, sinon **lot
ignoré** (les autres lots suffisent). Garde anti-invention conservé : le prompt
travaille sur du texte déjà anonymisé et interdit d'introduire tout nom ou label
absent de l'entrée.

**Trajectoire calculée** (`compute_trajectories`, pur Python) :
- par voix, scores triés par temps ; moyenne mobile exponentielle
  (`EWMA_ALPHA = 0.35`) pondérée par la saillance ;
- `kf` = valeur lissée échantillonnée au temps de chaque bloc scoré,
  précédée d'un point d'entrée `[entry, x₀, y₀]` où `(x₀, y₀)` est la position
  du premier bloc scoré ; interpolation linéaire côté template ;
- voix avec 0 bloc scoré → pas de `kf` (point absent de l'animation) ;
  1 bloc → position fixe.

### Schéma `data.js` (nouveau)

```js
const DEBATE_DATA = {
  meta: { topic, code, date, totalDurationMinutes, totalRedactedMinutes },
  axes: { x: {...anchors}, y: {...anchors}, quadrants: {...} },
  personas: [{
    id, label, camp, color, note, weight, entry,
    speech: [[t0, t1], ...],                        // intervalles de parole mesurés
    points: [{ t, x, y, stance, salience }, ...],   // blocs scorés = preuves
    kf: [[t, x, y], ...]                            // trajectoire lissée calculée
  }],
  events: [...], tension: [...],                    // passe 2, inchangé
  refus: [[t0, t1], ...],
  schools: [...],                                    // conservé, non affiché
  totalRedactedMinutes, totalDurationMinutes
};
```

`speech` est mesuré depuis les segments (aucun LLM) — il alimente la mise en
évidence du « point qui parle » pendant l'animation.

## Page unique — réécriture de `viz_template/index.html`

Plus d'onglets. Layout vertical :

1. **Header** — thème, code, date, durée.
2. **« Comment lire cette carte »** — les 2 axes, chaque pôle défini + ses
   positions-types paraphrasées (ancres de la passe 1).
3. **Carte animée** (colonne principale) + **panneau « En ce moment »**
   (colonne latérale) :
   - points colorés par camp + traînées ; le point de la voix **en train de
     parler pulse** (via `speech`, donnée mesurée), les autres sont atténués ;
   - panneau latéral : paraphrases des derniers blocs scorés à l'instant t
     (« Interlocuteur 2 défend que… »), colorées par voix ;
   - clic sur un point/traînée → liste complète de ses points scorés
     (heure + paraphrase) = preuve intégrale de la trajectoire ;
   - contrôles : ▶ lecture/pause, slider (marqueurs d'events discrets),
     vitesse ×1/×2/×4, temps affiché.
4. **Frise de tension** pleine largeur, synchronisée : tête de lecture
   partagée avec la carte ; clic sur un event → seek de l'animation ;
   zones `[REFUS]` grisées (mesure absente ≠ silence).
5. **Footer** — avertissements méthodologiques (inchangés sur le fond).

Sections conditionnelles selon les données présentes (voir dégradation) —
le mécanisme `__VIZ_PRESENT` de masquage d'onglets est remplacé par un
masquage de sections.

## Dégradation gracieuse

| Échec | Comportement |
|---|---|
| Passe 1 | Pas d'axes ancrés ni de camps ; frise seule si passe 2 OK ; bandeau « analyse partielle » |
| Passe 2 | Carte animée sans frise (slider simple) |
| Passe 3 — un lot | Blocs du lot ignorés, trajectoire calculée avec le reste |
| Passe 3 — totale | Carte masquée, frise seule |

`analyze_debate.py` reste ré-exécutable seul sur un transcript corrigé
(régénère tout). `run_transcription.ps1 -Visualize`, `GEMINI_ANALYSIS_MODEL`
et l'emplacement `viz/{index.html, data.js}` sont inchangés.

## Tests (`tests/test_analyze_debate.py`)

- Sélection des blocs substantiels : exclusions `[REFUS]`/`[?]`/seuil de mots.
- `validate_scores` : indices inconnus, hors bornes, `stance` vide, `none`,
  lot malformé → `False`.
- `compute_trajectories` : lissage EWMA, pondération saillance, voix à 0/1 bloc,
  échantillonnage des `kf`, monotonie temporelle.
- `validate_frame` : ancres de pôles présentes et non vides.
- Assemblage `data.js` nouveau schéma + `speech` mesuré + dégradation par passe.
- Suppression des tests de la passe concepts.
- Template : la page se génère avec données partielles (sections conditionnelles).

## Doc

Mise à jour du `CLAUDE.md` de `transcription-debat` : 3 passes au lieu de 4,
principe « trajectoire = donnée calculée depuis des scores par bloc, le LLM ne
score que ce qu'il a sous les yeux », page unique, suppression V1/V4/V5.

## Hors scope

- Toute nouvelle passe d'analyse (thèmes, sankey…).
- Affichage des `schools`.
- Régénération incrémentale (re-tenter uniquement les passes manquantes).
