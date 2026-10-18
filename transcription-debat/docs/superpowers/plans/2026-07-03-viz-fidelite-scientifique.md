# Fidélité scientifique de la visualisation des débats — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre les déplacements sur la carte du débat aussi proches de la réalité que possible et sans hallucination, en appliquant les recommandations du document `Visualisation prises de positions/recherche_classification_opinions_2026-07.md` (§8.3, §8.4).

**Architecture:** Toutes les modifications de calcul vivent dans `backend/code python/analyze_debate.py` (pipeline 3 passes Gemini + calculs purs). Les modifications d'affichage vivent dans `backend/code python/viz_template/index.html` (page unique, D3, pilotée par `data.js`). Aucun nouveau fichier de code, aucune nouvelle dépendance.

**Tech Stack:** Python 3 (pur, pas de numpy nécessaire), google-genai (client existant), pytest, D3 v7 dans le template.

## Global Constraints

- Page unique : tout reste dans `viz_template/index.html` piloté par `data.js` (pas d'onglets, pas de fichier additionnel).
- Le LLM ne fait que de l'interprétation ; poids/entrée/refus/speech/durée ET trajectoires sont calculés — jamais demandés au LLM (règle CLAUDE.md).
- Ne jamais lever le garde-fou anti-guillemets (`validate_scores`) ni l'anti-invention de prénoms.
- Dégradation gracieuse par passe et par lot : un échec ne casse jamais la génération.
- Tests : lancés depuis `backend/` avec le Python système : `python -m pytest tests/ -q`.
- Chaque justification scientifique = renvoi au doc de recherche (sections citées dans les commits).

## Fondement scientifique de chaque tâche

| Tâche | Recommandation du doc de recherche |
|---|---|
| 1. temperature=0 + seed | §5.2 (Gilardi 2023 : accord inter-runs 91→97 % à T basse), §8.4.1 |
| 2. Ancres dans le prompt de scoring | §5.3 mitigation (2), §8.4.2 |
| 3. Échelle ordinale -2..+2 remappée | §8.3.1 (stance ordinale validée, continue non ; SemEval/P-Stance) |
| 4. Plancher de salience 0,3 | §8.3.4 (salience LLM non validée → la borner) |
| 5. Hold keyframes (silences longs) | §8.3.3 (audit : « silences longs interpolés » = mouvement sans preuve) |
| 6. Polarisation Esteban-Ray par axe | Axe 6 §6.2 (Esteban & Ray 1994 ; positions pondérées temps de parole) |
| 7. Audit de symétrie (inversion d'axes) | §5.3 mitigation (3), §8.4.3 (biais politique des LLM mesuré) |
| 8. Provenance/incertitude affichées | §8.1 point 9 (traçabilité), Pangakis 2023 (validation obligatoire) |

Explicitement écartés (et pourquoi) :
- Graphe accord/désaccord LLM : nouvelle surface d'hallucination, contraire au « sans aucune hallucination » ; la moitié sûre de l'axe 6 (polarisation calculée) est retenue.
- Confiance ASR par bloc : les JSON corrigés existants ne portent pas de log-prob ; exigerait de relancer Whisper (heures GPU). Futur travail.
- BERTopic : pertinent inter-débats uniquement (§4.3).
- Sentiment analysis : outil inadapté, dit explicitement (§2.3).

---

### Task 1: Config déterministe des appels Gemini (temperature=0 + seed)

**Files:**
- Modify: `transcription-debat/backend/code python/analyze_debate.py` (`_call_validated`, nouvelle constante `GEN_CONFIG`)
- Test: `transcription-debat/backend/tests/test_analyze_debate.py`

**Interfaces:**
- Produces: `GEN_CONFIG: dict` (module-level), passé comme `config=` à chaque `generate_content`. Dict brut (pas d'import google.genai au top-level — les tests tournent sans la lib).

- [ ] **Step 1: Test échouant**

```python
def test_call_validated_uses_deterministic_config():
    from analyze_debate import _call_validated, GEN_CONFIG
    client = MagicMock()
    resp = MagicMock(); resp.text = '{"ok": true}'
    client.models.generate_content.return_value = resp
    _call_validated(client, "prompt", validator=lambda o: True)
    kwargs = client.models.generate_content.call_args.kwargs
    assert kwargs["config"]["temperature"] == 0.0
    assert "seed" in kwargs["config"]
    assert GEN_CONFIG["temperature"] == 0.0
```

- [ ] **Step 2: Vérifier l'échec** — `python -m pytest tests/test_analyze_debate.py::test_call_validated_uses_deterministic_config -q` → FAIL (ImportError GEN_CONFIG)

- [ ] **Step 3: Implémentation**

```python
# Reproductibilité (recherche §5.2) : T=0 fait passer l'accord inter-exécutions ~91→97 %.
GEN_CONFIG = {"temperature": 0.0, "seed": 71}
```
Dans `_call_validated` : `client.models.generate_content(model=MODEL, contents=prompt, config=GEN_CONFIG)`.

- [ ] **Step 4: Tests verts** — suite complète.
- [ ] **Step 5: Commit** `feat(analyze): temperature=0 + seed sur tous les appels d'analyse (recherche §5.2, §8.4.1)`

---

### Task 2: Ancres d'axes injectées dans le prompt de scoring + refus du doute

**Files:**
- Modify: `analyze_debate.py` (`build_scoring_prompt`)
- Test: `tests/test_analyze_debate.py` (fixture `AXES_FIXT` enrichie d'anchors)

**Interfaces:**
- Consumes: `axes` = `frame["axes"]` (contient toujours `anchors` — validé par `validate_frame`). Le builder reste tolérant (`.get("anchors")`) pour rester testable.

- [ ] **Step 1: Test échouant**

```python
def test_build_scoring_prompt_includes_anchors_and_doubt_rule():
    from analyze_debate import build_scoring_prompt
    batch = [{"i": 1, "vid": "i1", "label": "Interlocuteur 1", "t": 1.0, "text": "Texte."}]
    prompt = build_scoring_prompt(batch, [], [], AXES_ANCHORED_FIXT, {"topic": "Retraites"})
    assert "La liberté individuelle passe avant tout." in prompt   # ancre gauche
    assert "positions-types" in prompt.lower()
    assert "none" in prompt and "doute" in prompt.lower()
```

- [ ] **Step 2: FAIL** puis **Step 3: Implémentation** — dans `build_scoring_prompt`, après les deux lignes d'axes, si anchors présentes :

```python
def _anchor_lines(axes) -> str:
    lines = []
    for axis, poles in (("x", (("left", "leftLabel"), ("right", "rightLabel"))),
                        ("y", (("bottom", "bottomLabel"), ("top", "topLabel")))):
        anchors = axes.get(axis, {}).get("anchors")
        if not anchors:
            continue
        for pole, label_key in poles:
            vals = anchors.get(pole) or []
            if vals:
                lines.append(f'- {axes[axis][label_key]} : ' + " · ".join(vals))
    if not lines:
        return ""
    return "Positions-types entendues dans ce débat, incarnant chaque pôle (repères de scoring) :\n" + "\n".join(lines) + "\n\n"
```
Et dans les règles STRICTES : `- En cas de doute sur la position, ou si elle est hors de ces axes : {"i": <même i>, "none": true}. Ne devine JAMAIS.`

- [ ] **Step 4: Tests verts** · **Step 5: Commit** `feat(analyze): ancres d'axes dans le prompt de scoring + refus du doute (recherche §5.3, §8.4.2)`

---

### Task 3: Échelle ordinale -2..+2 remappée vers -10..+10 à l'affichage

**Files:**
- Modify: `analyze_debate.py` (constantes `ORD_MIN/ORD_MAX/ORD_SCALE`, `validate_scores`, `run_scoring`, `build_scoring_prompt`)
- Test: fixtures `SCORING_RESPONSE` et tests de `validate_scores`/`run_scoring` adaptés

**Interfaces:**
- Produces: `run_scoring` retourne des scores déjà remappés (`x`, `y` ∈ {-10,-5,0,5,10}) — `compute_trajectories` et l'aval inchangés.
- `validate_scores(scores, allowed)` : borne désormais x/y à [-2, 2] (numérique, arrondi à l'entier à l'ingestion pour robustesse).

- [ ] **Step 1: Tests échouants**

```python
def test_validate_scores_ordinal_bounds():
    from analyze_debate import validate_scores
    ok = [{"i": 1, "x": -2, "y": 2, "stance": "Position.", "salience": 0.5}]
    too_big = [{"i": 1, "x": 5, "y": 0, "stance": "Position.", "salience": 0.5}]
    assert validate_scores(ok, {1}) is True
    assert validate_scores(too_big, {1}) is False

def test_run_scoring_remaps_ordinal_to_display_scale():
    from analyze_debate import run_scoring
    blocks = [{"i": 0, "vid": "i1", "label": "Interlocuteur 1", "t": 1.0, "text": "x " * 20}]
    resp = MagicMock(); resp.text = json.dumps(
        [{"i": 0, "x": -2, "y": 1.2, "stance": "Position.", "salience": 0.9}])
    client = MagicMock(); client.models.generate_content.return_value = resp
    out = run_scoring(client, blocks, AXES_ANCHORED_FIXT, {"topic": "X"})
    assert out[0]["x"] == -10      # -2 × 5
    assert out[0]["y"] == 5        # round(1.2)=1 × 5
```

- [ ] **Step 2: FAIL** · **Step 3: Implémentation**

```python
# Échelle ordinale courte (recherche §8.3.1) : la stance ordinale est validée par la
# littérature, le placement continu -10..+10 par LLM ne l'est pas. Remap ×5 à l'affichage.
ORD_MIN, ORD_MAX = -2, 2
ORD_SCALE = 5
```
`validate_scores` : `_in_ord_bounds(v) = isinstance(v,(int,float)) and ORD_MIN <= v <= ORD_MAX` à la place de `_in_bounds` pour x/y.
`run_scoring` : `"x": int(round(item["x"])) * ORD_SCALE` (idem y).
`build_scoring_prompt` : réécrit l'échelle —

```
- s'il exprime une position claire par rapport à ces axes :
  {"i": <même i>, "x": <entier -2..2>, "y": <entier -2..2>, "stance": "...", "salience": <0..1>}
  Échelle x : -2 = nettement {leftLabel} · -1 = plutôt {leftLabel} · 0 = mitoyen/équilibré ·
  +1 = plutôt {rightLabel} · +2 = nettement {rightLabel}. Échelle y identique de {bottomLabel} vers {topLabel}.
```
Adapter les fixtures existantes : `SCORING_RESPONSE` (valeurs -8/7/6 → -2/2/1 etc.), `test_validate_scores_ok` (-8 → -2), `test_validate_scores_rejects_out_of_bounds` (99 reste rejeté), asserts e2e éventuels.

- [ ] **Step 4: Tests verts** · **Step 5: Commit** `feat(analyze): scoring sur échelle ordinale -2..+2 remappée ×5 (recherche §8.3.1)`

---

### Task 4: Plancher de salience dans l'EWMA

**Files:**
- Modify: `analyze_debate.py` (`SALIENCE_FLOOR`, `compute_trajectories`)
- Test: remplacer `test_compute_trajectories_salience_zero_keeps_position`

**Interfaces:**
- Produces: `SALIENCE_FLOOR = 0.3`. Poids EWMA effectif = `EWMA_ALPHA * max(SALIENCE_FLOOR, salience)`.

- [ ] **Step 1: Test échouant** (remplace le test « salience 0 → immobile ») :

```python
def test_compute_trajectories_salience_is_floored():
    from analyze_debate import compute_trajectories
    blocks, scores = _blocks_and_scores([
        (1, "i1", 2.0, 0, 0, 1.0),
        (2, "i1", 10.0, 10, 0, 0.0),   # salience 0 → plancher 0.3 s'applique
    ])
    out = compute_trajectories(blocks, scores, {"i1": 1.0})
    # 0 + 0.35*max(0.3, 0)*(10-0) = 1.05
    assert out["i1"]["kf"][-1] == [10.0, 1.05, 0.0]
```

- [ ] **Step 2: FAIL** · **Step 3: Implémentation**

```python
# Plancher (recherche §8.3.4) : la salience LLM n'est pas validée comme pondération ;
# la borner évite qu'elle écrase l'influence d'un bloc réellement scoré.
SALIENCE_FLOOR = 0.3
```
Dans `compute_trajectories` : `a = EWMA_ALPHA * max(SALIENCE_FLOOR, p["salience"])`.

- [ ] **Step 4: Tests verts** · **Step 5: Commit** `feat(analyze): plancher de salience 0.3 dans l'EWMA (recherche §8.3.4)`

---

### Task 5: Hold keyframes — pas de dérive pendant les silences longs

**Files:**
- Modify: `analyze_debate.py` (`TRAJ_HOLD_GAP`, `TRAJ_TRANSITION`, `compute_trajectories`)
- Test: nouveau test + mise à jour des kf attendus dans 2 tests existants (gap de 8 min)

**Interfaces:**
- Produces: kf enrichi d'un keyframe de maintien `[t_next - 1.0, x_prec, y_prec]` quand l'écart entre deux blocs scorés dépasse `TRAJ_HOLD_GAP = 3.0` min. Le template (lerp) n'a pas à changer.

- [ ] **Step 1: Test échouant**

```python
def test_compute_trajectories_holds_position_during_long_silence():
    from analyze_debate import compute_trajectories
    blocks, scores = _blocks_and_scores([
        (1, "i1", 2.0, 0, 0, 1.0),
        (2, "i1", 30.0, 10, 0, 1.0),   # 28 min de silence
    ])
    out = compute_trajectories(blocks, scores, {"i1": 1.0})
    # maintien à l'ancienne position jusqu'à 1 min avant la nouvelle prise de parole
    assert [29.0, 0.0, 0.0] in out["i1"]["kf"]
    assert out["i1"]["kf"][-1] == [30.0, 3.5, 0.0]
```

- [ ] **Step 2: FAIL** · **Step 3: Implémentation**

```python
# Maintien pendant les silences (recherche §8.3.3, audit « silences longs interpolés ») :
# une voix qui ne parle pas ne doit pas glisser sur la carte — le déplacement est ancré
# au moment réel de la prise de parole suivante.
TRAJ_HOLD_GAP = 3.0      # minutes de silence au-delà desquelles on fige
TRAJ_TRANSITION = 1.0    # le déplacement s'anime sur la minute précédant la prise de parole
```
Dans la boucle de `compute_trajectories`, pour `i > 0`, avant la mise à jour EWMA :

```python
if kf and p["t"] - kf[-1][0] > TRAJ_HOLD_GAP:
    kf.append([round(p["t"] - TRAJ_TRANSITION, 2), round(sx, 2), round(sy, 2)])
```
Mettre à jour `test_compute_trajectories_smooths_toward_new_score` et `test_compute_trajectories_salience_is_floored` (gap 2→10 min : keyframe de maintien `[9.0, 0.0, 0.0]` attendu).

- [ ] **Step 4: Tests verts** · **Step 5: Commit** `feat(analyze): hold keyframes — position figée pendant les silences longs (recherche §8.3.3)`

---

### Task 6: Polarisation d'opinion par axe (Esteban-Ray, pondérée temps de parole)

**Files:**
- Modify: `analyze_debate.py` (`compute_polarization`, `assemble_data` param, appel dans `analyze`)
- Test: nouveaux tests unitaires + assert e2e

**Interfaces:**
- Produces: `compute_polarization(personas) -> dict | None` = `{"x": 0-100, "y": 0-100, "n": int, "method": "esteban_ray", "alpha": 1.6}`. Positions finales (`kf[-1]`), poids = temps de parole relatif, **modérateur exclu**. `assemble_data(..., polarization=None)` ajoute `data["polarization"]` si non-None.

- [ ] **Step 1: Tests échouants**

```python
def _mk_persona(pid, x, y, weight):
    return {"id": pid, "weight": weight, "kf": [[0.0, x, y], [10.0, x, y]]}

def test_compute_polarization_two_poles_is_max():
    from analyze_debate import compute_polarization
    pol = compute_polarization([_mk_persona("i1", -10, 0, 1.0), _mk_persona("i2", 10, 0, 1.0)])
    assert pol["x"] == 100.0
    assert pol["y"] == 0.0
    assert pol["n"] == 2

def test_compute_polarization_consensus_is_zero():
    from analyze_debate import compute_polarization
    pol = compute_polarization([_mk_persona("i1", 4, 4, 1.0), _mk_persona("i2", 4, 4, 0.5)])
    assert pol["x"] == 0.0 and pol["y"] == 0.0

def test_compute_polarization_excludes_moderator_and_needs_two():
    from analyze_debate import compute_polarization
    assert compute_polarization([_mk_persona("i1", -10, 0, 1.0), _mk_persona("anim", 10, 0, 1.0)]) is None
```

- [ ] **Step 2: FAIL** · **Step 3: Implémentation**

```python
# Polarisation d'opinions (recherche axe 6 §6.2) : famille Esteban-Ray (Econometrica 1994)
# sur les positions finales pondérées par temps de parole. α=1.6 (valeur canonique max).
# Normalisée par le maximum théorique (deux masses égales aux pôles) → indice 0-100.
POLARIZATION_ALPHA = 1.6

def compute_polarization(personas) -> dict | None:
    pts = [(p["kf"][-1][1], p["kf"][-1][2], p["weight"])
           for p in personas if p["id"] != "anim" and p.get("kf") and p.get("weight", 0) > 0]
    if len(pts) < 2:
        return None
    total_w = sum(w for _, _, w in pts)
    a = POLARIZATION_ALPHA
    out = {}
    for key, idx in (("x", 0), ("y", 1)):
        vals = [((pt[idx] - AXIS_MIN) / (AXIS_MAX - AXIS_MIN), pt[2] / total_w) for pt in pts]
        er = sum((pi ** (1 + a)) * pj * abs(yi - yj)
                 for yi, pi in vals for yj, pj in vals)
        out[key] = round(min(100.0, 100.0 * er / (2 ** -(1 + a))), 1)
    return {"x": out["x"], "y": out["y"], "n": len(pts),
            "method": "esteban_ray", "alpha": a}
```
`assemble_data(meta, frame, personas, timeline, refus, polarization=None)` : `if polarization is not None: data["polarization"] = polarization`. Dans `analyze()` : `polarization = compute_polarization(personas) if personas else None`.

- [ ] **Step 4: Tests verts** · **Step 5: Commit** `feat(analyze): indice de polarisation Esteban-Ray par axe (recherche axe 6)`

---

### Task 7: Audit de symétrie — inversion d'axes sur un échantillon

**Files:**
- Modify: `analyze_debate.py` (`_invert_axes`, `_pearson`, `run_symmetry_audit`, intégration dans `analyze` + param `audit=True`)
- Test: tests unitaires du pearson/inversion/audit

**Interfaces:**
- Produces: `run_symmetry_audit(client, blocks, scores, axes, meta) -> dict | None` = `{"type": "axisInversion", "n": int, "rX": float|None, "rY": float|None}`. Stocké dans `meta["reliability"]` (donc visible dans `data.js` sous `meta.reliability`). `analyze(..., audit=True)`.
- Consumes: `run_scoring` (Task 3) pour re-scorer l'échantillon avec les axes inversés.

- [ ] **Step 1: Tests échouants**

```python
def test_invert_axes_swaps_poles_and_anchors():
    from analyze_debate import _invert_axes
    inv = _invert_axes({
        "x": {"leftLabel": "Liberté", "rightLabel": "Égalité", "anchors": ANCHORS_X},
        "y": {"bottomLabel": "Technique", "topLabel": "Principes", "anchors": ANCHORS_Y}})
    assert inv["x"]["leftLabel"] == "Égalité" and inv["x"]["rightLabel"] == "Liberté"
    assert inv["x"]["anchors"]["left"] == ANCHORS_X["right"]
    assert inv["y"]["topLabel"] == "Technique"

def test_symmetry_audit_perfect_inversion_gives_r1():
    from analyze_debate import run_symmetry_audit
    blocks, ords = [], {}
    for n in range(10):
        blocks.append({"i": n, "vid": "i1", "label": "Interlocuteur 1", "t": float(n), "text": "x " * 20})
        ords[n] = (n % 5) - 2                     # -2..2 variés
    scores = {n: {"x": v * 5, "y": v * 5, "stance": "s", "salience": 0.5} for n, v in ords.items()}
    inv_resp = MagicMock()
    inv_resp.text = json.dumps([{"i": n, "x": -v, "y": -v, "stance": "Position.", "salience": 0.5}
                                for n, v in ords.items()])
    client = MagicMock(); client.models.generate_content.return_value = inv_resp
    axes = {"x": {"leftLabel": "A", "rightLabel": "B", "anchors": ANCHORS_X},
            "y": {"bottomLabel": "C", "topLabel": "D", "anchors": ANCHORS_Y}}
    rel = run_symmetry_audit(client, blocks, scores, axes, {"topic": "X"})
    assert rel["n"] == 10
    assert rel["rX"] == 1.0 and rel["rY"] == 1.0

def test_symmetry_audit_too_few_blocks_returns_none_without_call():
    from analyze_debate import run_symmetry_audit
    client = MagicMock()
    assert run_symmetry_audit(client, [], {}, {}, {}) is None
    client.models.generate_content.assert_not_called()
```

- [ ] **Step 2: FAIL** · **Step 3: Implémentation**

```python
# Audit de symétrie (recherche §5.3, §8.4.3) : les LLM ont un biais politique mesuré ;
# re-scorer un échantillon avec les axes INVERSÉS doit donner x → -x. La corrélation
# de Pearson entre -x_inversé et x_original est publiée dans meta.reliability.
AUDIT_SAMPLE = 30
AUDIT_MIN_PAIRS = 8

def _invert_axes(axes: dict) -> dict:
    def _swap(ax, lo_lab, hi_lab, lo, hi):
        an = ax.get("anchors") or {}
        return {lo_lab: ax[hi_lab], hi_lab: ax[lo_lab],
                "anchors": {lo: an.get(hi, []), hi: an.get(lo, [])}}
    return {"x": _swap(axes["x"], "leftLabel", "rightLabel", "left", "right"),
            "y": _swap(axes["y"], "bottomLabel", "topLabel", "bottom", "top")}

def _pearson(xs: list[float], ys: list[float]) -> float | None:
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    cov = sum((a - mx) * (b - my) for a, b in zip(xs, ys))
    vx = sum((a - mx) ** 2 for a in xs)
    vy = sum((b - my) ** 2 for b in ys)
    if vx <= 0 or vy <= 0:
        return None
    return cov / ((vx * vy) ** 0.5)

def run_symmetry_audit(client, blocks, scores, axes, meta) -> dict | None:
    scored = [b for b in blocks if b["i"] in scores]
    if len(scored) < AUDIT_MIN_PAIRS:
        return None
    step = max(1, len(scored) // AUDIT_SAMPLE)
    sample = scored[::step][:AUDIT_SAMPLE]
    inverted = run_scoring(client, sample, _invert_axes(axes), meta)
    pairs = [(scores[b["i"]], inverted[b["i"]]) for b in sample if b["i"] in inverted]
    if len(pairs) < AUDIT_MIN_PAIRS:
        return None
    r_x = _pearson([o["x"] for o, _ in pairs], [-v["x"] for _, v in pairs])
    r_y = _pearson([o["y"] for o, _ in pairs], [-v["y"] for _, v in pairs])
    if r_x is None and r_y is None:
        return None
    return {"type": "axisInversion", "n": len(pairs),
            "rX": None if r_x is None else round(r_x, 2),
            "rY": None if r_y is None else round(r_y, 2)}
```
Dans `analyze(json_path, topic, code, date, client=None, audit=True)`, après `traj_map` :

```python
if audit and scores:
    print("Audit de fiabilité — inversion d'axes...")
    reliability = run_symmetry_audit(client, blocks, scores, frame["axes"], meta)
    if reliability:
        meta["reliability"] = reliability
        print(f"  n={reliability['n']}, rX={reliability['rX']}, rY={reliability['rY']}")
    else:
        print("  Échantillon insuffisant ou audit échoué — ignoré.", file=sys.stderr)
```
(Les tests e2e existants ont 3 blocs scorés < 8 → audit sans appel API, rien ne casse.)

- [ ] **Step 4: Tests verts** · **Step 5: Commit** `feat(analyze): audit de symétrie par inversion d'axes → meta.reliability (recherche §8.4.3)`

---

### Task 8: Template — provenance, incertitude, polarisation (LIRE le skill dataviz d'abord)

**Files:**
- Modify: `viz_template/index.html`
- Test: `test_viz_template_single_page` étendu

**Interfaces:**
- Consumes: `D.polarization` (Task 6), `D.meta.reliability` (Task 7), `p.points.length` (existant).

- [ ] **Step 0: Invoquer le skill `dataviz`** avant de toucher au HTML (obligatoire pour les meters/stat tiles).

- [ ] **Step 1: Test échouant** — étendre `test_viz_template_single_page` :

```python
    # provenance + incertitude + polarisation
    assert "polarization" in html
    assert "reliability" in html
    assert "prises de parole scorées" in html
    assert "stroke-dasharray" in html      # voix sans preuve = cercle pointillé
```

- [ ] **Step 2: FAIL** · **Step 3: Implémentation** (page unique, sections conditionnelles) :
1. **Bloc polarisation** dans `#sec-axes` (sous la grille) : si `D.polarization`, deux meters 0-100 (axe horizontal / vertical) avec valeur, note de méthode « indice d'Esteban-Ray sur les positions finales, pondéré par le temps de parole, modérateur exclu (n=N) ». Respecter les tokens CSS existants (var(--bg2), var(--border)…) et le skill dataviz.
2. **Tooltip des voix** : ajouter une ligne de preuve — `${(p.points||[]).length} prises de parole scorées` si > 0, sinon `position globale estimée — aucune prise de parole scorée individuellement`.
3. **Cercle pointillé** pour les voix sans points (`.attr('stroke-dasharray', (p.points||[]).length ? null : '4,3')`).
4. **Footer fiabilité** : si `D.meta.reliability`, paragraphe « Contrôle de fiabilité : re-scoring d'un échantillon de N blocs avec axes inversés — corrélation attendue -1→+1 : rX=…, rY=… ».

- [ ] **Step 4: Tests verts** · **Step 5: Commit** `feat(viz): provenance, incertitude et polarisation affichées (recherche §8.1.9)`

---

### Task 9: Documentation

**Files:**
- Modify: `transcription-debat/CLAUDE.md` (ligne pipeline `analyze_debate.py`, règles critiques, compte de tests)

- [ ] **Step 1:** Mettre à jour : échelle ordinale -2..+2 remappée ×5, T=0+seed, plancher salience 0.3, hold keyframes, polarisation Esteban-Ray, audit de symétrie dans `meta.reliability`, nouveaux comptes de tests.
- [ ] **Step 2: Commit** `docs(transcription): documente le durcissement scientifique de l'analyse`

---

### Task 10: Vérification de bout en bout sur le débat réel

- [ ] **Step 1:** Suite complète verte : `python -m pytest tests/ -q` (≈130 tests).
- [ ] **Step 2:** Régénérer la visualisation réelle :
`.venv\Scripts\python "code python\analyze_debate.py" "transcripts\Multiculturalisme\71B505\71B505_2026-06-24_corrected.json"` depuis `backend/`.
- [ ] **Step 3:** Vérifier `data.js` : les `points` portent des x/y multiples de 5 (scores ordinaux remappés), les `kf` lissés restent continus et contiennent des keyframes de maintien pour les gaps > 3 min ; `polarization` présent ; `meta.reliability` présent avec rX/rY.
- [ ] **Step 4:** Ouvrir la page dans Chrome (skill claude-in-chrome), vérifier visuellement carte + meters + footer, console sans erreur.
- [ ] **Step 5:** Skill `verify` + `superpowers:verification-before-completion` avant le rapport final.
