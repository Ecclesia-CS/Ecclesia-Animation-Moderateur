# Visualisation page unique — trajectoires par scoring de blocs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer les trajectoires inventées par Gemini par des trajectoires **calculées** (EWMA) à partir de prises de parole scorées individuellement, et réécrire le dashboard en **page unique** (carte animée + frise de tension synchronisées), avec axes ancrés et paraphrases — jamais de citation exacte.

**Architecture:** `analyze_debate.py` passe de 4 à 3 passes Gemini : (1) cadre enrichi d'ancres d'axes, (2) events+tension inchangée, (3) scoring par bloc de parole en lots de 25 (mécanique de `correct_transcript.py`). Python calcule les trajectoires par lissage exponentiel pondéré par la saillance. Le template `viz_template/index.html` est réécrit sans onglets : sections conditionnelles pilotées par `data.js`.

**Tech Stack:** Python 3 (stdlib + google-genai via `correct_transcript._make_client`), pytest, D3.js v7 (CDN), HTML/CSS/JS vanilla.

**Spec:** `docs/superpowers/specs/2026-07-01-viz-page-unique-scoring-design.md`

## Global Constraints

- Tout le code Python vit dans `transcription-debat/backend/code python/` (espace dans le nom → toujours quoter). Imports à plat (`from correct_transcript import ...`), jamais de package/relatif.
- Tests : depuis `transcription-debat/backend/`, avec le **Python système** : `python -m pytest tests/test_analyze_debate.py -v`. Le `conftest.py` racine backend ajoute `code python/` au `sys.path`.
- Exécution du pipeline réel : `.venv\Scripts\python` depuis `backend/`.
- Bornes des axes : `AXIS_MIN, AXIS_MAX = -10, 10` (existant, ne pas changer).
- Modèle : `MODEL = os.getenv("GEMINI_ANALYSIS_MODEL", "gemini-3.1-flash-lite")` (existant, ne pas changer).
- **Jamais de citation exacte** dans les sorties LLM : les `stance` et ancres sont des reformulations ; le validateur rejette les guillemets (`"`, `«`, `»`) dans `stance`.
- Garde anti-invention : les prompts interdisent tout prénom/nom propre ; le LLM ne référence que les labels d'entrée (Interlocuteur N, Modérateur).
- Nouvelles constantes : `MIN_BLOCK_WORDS = 15`, `EWMA_ALPHA = 0.35`, `SCORE_BATCH_SIZE = 25`, `SCORE_CONTEXT = 3`.
- Texte UI et messages console en français. Fichiers UTF-8.
- Dégradation gracieuse : l'échec d'une passe (ou d'un lot) ne fait jamais échouer `analyze()` ; on écrit toujours `viz/`.
- Commits fréquents : un commit par tâche, préfixes `feat(analyze):` / `feat(viz):` / `test:` / `docs:`.

**Répertoire de travail de toutes les commandes : `transcription-debat/backend/`** (chemins de fichiers ci-dessous relatifs à la racine du repo).

---

### Task 1: Mesures sans LLM — `compute_speech` + `select_scorable_blocks`

**Files:**
- Modify: `transcription-debat/backend/code python/analyze_debate.py`
- Test: `transcription-debat/backend/tests/test_analyze_debate.py`

**Interfaces:**
- Consumes: `_speaker_id(speaker) -> str | None` (existant, ligne ~62).
- Produces:
  - `MIN_BLOCK_WORDS: int = 15` (constante module)
  - `compute_speech(segments: list[dict]) -> dict[str, list[list[float]]]` — id de voix → intervalles de parole `[[min_début, min_fin], ...]` en minutes, fusionnés si écart ≤ 2 s, arrondis à 2 décimales.
  - `select_scorable_blocks(segments: list[dict]) -> list[dict]` — blocs substantiels : `[{"i": <index dans segments>, "vid": <id voix>, "label": <speaker>, "t": <minute début, round 2>, "text": <texte>}]`. Exclut `refused`, locuteurs non plaçables (`[REFUS]`, `[?]`), blocs < `MIN_BLOCK_WORDS` mots.

- [ ] **Step 1: Enrichir la fixture `SEGMENTS` des tests**

Les textes actuels font < 15 mots : aucun bloc ne serait scorable. Dans `tests/test_analyze_debate.py`, remplacer la fixture `SEGMENTS` (lignes 7-14) par (les durées/locuteurs ne changent pas → les tests poids/entrée existants restent valides) :

```python
SEGMENTS = [
    {"start": 0.0,   "end": 60.0,  "speaker": "Modérateur",      "text": "Bonjour, on commence.", "refused": False},
    {"start": 60.0,  "end": 180.0, "speaker": "Interlocuteur 1", "text": "Je pense que la liberté prime sur tout le reste parce que sans elle aucune égalité réelle n'est jamais possible dans la durée.", "refused": False},
    {"start": 180.0, "end": 240.0, "speaker": "Interlocuteur 2", "text": "Pas d'accord du tout, l'égalité vient d'abord car la liberté sans conditions matérielles reste un privilège réservé à quelques-uns seulement.", "refused": False},
    {"start": 240.0, "end": 300.0, "speaker": "[REFUS]",         "text": "[N'a pas souhaité être enregistré(e)]", "refused": True},
    {"start": 300.0, "end": 320.0, "speaker": "[REFUS]",         "text": "[N'a pas souhaité être enregistré(e)]", "refused": True},
    {"start": 320.0, "end": 600.0, "speaker": "Interlocuteur 1", "text": "Je maintiens ma position initiale malgré vos objections, car aucun argument avancé ici ne me semble remettre en cause ce principe fondamental.", "refused": False},
]
```

- [ ] **Step 2: Écrire les tests qui échouent**

Ajouter à la fin de `tests/test_analyze_debate.py` :

```python
# Mesures sans LLM : speech + blocs scorables

def test_compute_speech_per_voice():
    from analyze_debate import compute_speech
    speech = compute_speech(SEGMENTS)
    # i1 parle 60-180 s et 320-600 s → deux intervalles disjoints (en minutes)
    assert speech["i1"] == [[1.0, 3.0], [5.33, 10.0]]
    assert speech["anim"] == [[0.0, 1.0]]
    assert "[REFUS]" not in speech and None not in speech


def test_compute_speech_merges_consecutive():
    from analyze_debate import compute_speech
    segs = [
        {"start": 0.0,  "end": 60.0,  "speaker": "Interlocuteur 1", "text": "a", "refused": False},
        {"start": 61.0, "end": 120.0, "speaker": "Interlocuteur 1", "text": "b", "refused": False},
    ]
    # écart 1 s ≤ 2 s → fusion en un seul intervalle
    assert compute_speech(segs) == {"i1": [[0.0, 2.0]]}


def test_select_scorable_blocks_filters_short_and_special():
    from analyze_debate import select_scorable_blocks
    blocks = select_scorable_blocks(SEGMENTS)
    # Modérateur (3 mots) exclu, [REFUS] exclus, les 3 blocs longs gardés
    assert [b["i"] for b in blocks] == [1, 2, 5]
    assert all(b["vid"] in ("i1", "i2") for b in blocks)


def test_select_scorable_blocks_index_and_time():
    from analyze_debate import select_scorable_blocks
    blocks = {b["i"]: b for b in select_scorable_blocks(SEGMENTS)}
    assert blocks[1]["t"] == 1.0
    assert blocks[5]["t"] == 5.33
    assert blocks[1]["label"] == "Interlocuteur 1"
```

- [ ] **Step 3: Vérifier l'échec**

Run: `python -m pytest tests/test_analyze_debate.py -k "compute_speech or select_scorable" -v`
Expected: 4 FAIL avec `ImportError: cannot import name 'compute_speech'`.

- [ ] **Step 4: Implémenter**

Dans `code python/analyze_debate.py`, ajouter `MIN_BLOCK_WORDS = 15` sous les constantes existantes (après `MAX_KF_GAP`, ligne ~21), puis après `compute_refus` :

```python
def compute_speech(segments: list[dict]) -> dict[str, list[list[float]]]:
    """Intervalles de parole mesurés par voix (minutes), fusionnés si écart <= 2 s."""
    speech: dict[str, list[list[float]]] = {}
    for seg in segments:
        vid = _speaker_id(seg["speaker"])
        if vid is None:
            continue
        a, b = seg["start"] / 60.0, seg["end"] / 60.0
        iv = speech.setdefault(vid, [])
        if iv and a - iv[-1][1] <= 2.0 / 60.0:
            iv[-1][1] = b
        else:
            iv.append([a, b])
    return {vid: [[round(a, 2), round(b, 2)] for a, b in ivs] for vid, ivs in speech.items()}


def select_scorable_blocks(segments: list[dict]) -> list[dict]:
    """Blocs de parole substantiels à scorer (passe 3). Index = position dans segments."""
    blocks = []
    for i, seg in enumerate(segments):
        if seg.get("refused"):
            continue
        vid = _speaker_id(seg["speaker"])
        if vid is None:
            continue
        if len(seg["text"].split()) < MIN_BLOCK_WORDS:
            continue
        blocks.append({"i": i, "vid": vid, "label": seg["speaker"],
                       "t": round(seg["start"] / 60.0, 2), "text": seg["text"]})
    return blocks
```

- [ ] **Step 5: Vérifier le passage**

Run: `python -m pytest tests/test_analyze_debate.py -v`
Expected: les 4 nouveaux PASS, et tous les tests existants PASS (la fixture enrichie ne change ni durées ni locuteurs).

- [ ] **Step 6: Commit**

```bash
git add "transcription-debat/backend/code python/analyze_debate.py" transcription-debat/backend/tests/test_analyze_debate.py
git commit -m "feat(analyze): compute_speech + select_scorable_blocks (mesures sans LLM)"
```

---

### Task 2: Validateur de la passe scoring — `validate_scores`

**Files:**
- Modify: `transcription-debat/backend/code python/analyze_debate.py`
- Test: `transcription-debat/backend/tests/test_analyze_debate.py`

**Interfaces:**
- Consumes: `_in_bounds(v)` (existant).
- Produces: `validate_scores(scores, allowed: set[int]) -> bool` — `scores` est la réponse LLM parsée pour UN lot. Exige : liste ; chaque item est un dict avec `"i"` entier ∈ `allowed`, sans doublon ; **tous** les indices de `allowed` présents ; item = `{"i", "none": True}` OU `{"i", "x", "y", "stance", "salience"}` avec x/y dans les bornes, `stance` str non vide **sans** `"`, `«`, `»`, `salience` numérique ∈ [0, 1].

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `tests/test_analyze_debate.py` :

```python
# Validateur de la passe scoring

def test_validate_scores_ok():
    from analyze_debate import validate_scores
    scores = [
        {"i": 1, "x": -8, "y": 6, "stance": "Défend la primauté de la liberté.", "salience": 0.9},
        {"i": 2, "none": True},
    ]
    assert validate_scores(scores, {1, 2}) is True


def test_validate_scores_rejects_unknown_index():
    from analyze_debate import validate_scores
    scores = [{"i": 99, "x": 0, "y": 0, "stance": "s", "salience": 0.5},
              {"i": 1, "none": True}, {"i": 2, "none": True}]
    assert validate_scores(scores, {1, 2}) is False


def test_validate_scores_requires_all_indices():
    from analyze_debate import validate_scores
    scores = [{"i": 1, "none": True}]  # 2 manquant
    assert validate_scores(scores, {1, 2}) is False


def test_validate_scores_rejects_out_of_bounds():
    from analyze_debate import validate_scores
    scores = [{"i": 1, "x": 99, "y": 0, "stance": "s", "salience": 0.5}]
    assert validate_scores(scores, {1}) is False


def test_validate_scores_rejects_empty_or_quoted_stance():
    from analyze_debate import validate_scores
    empty = [{"i": 1, "x": 0, "y": 0, "stance": "  ", "salience": 0.5}]
    quoted = [{"i": 1, "x": 0, "y": 0, "stance": "Il dit « je refuse »", "salience": 0.5}]
    assert validate_scores(empty, {1}) is False
    assert validate_scores(quoted, {1}) is False


def test_validate_scores_rejects_bad_salience_and_malformed():
    from analyze_debate import validate_scores
    assert validate_scores([{"i": 1, "x": 0, "y": 0, "stance": "s", "salience": 2}], {1}) is False
    assert validate_scores("pas une liste", {1}) is False
    assert validate_scores([{"x": 0}], {1}) is False
```

- [ ] **Step 2: Vérifier l'échec**

Run: `python -m pytest tests/test_analyze_debate.py -k "validate_scores" -v`
Expected: 6 FAIL avec `ImportError: cannot import name 'validate_scores'`.

- [ ] **Step 3: Implémenter**

Dans `code python/analyze_debate.py`, après `validate_kf` (le style suit les validateurs existants : try/except large, retour bool) :

```python
_FORBIDDEN_STANCE_CHARS = ('"', "«", "»")


def validate_scores(scores, allowed: set[int]) -> bool:
    """Valide la réponse LLM d'un lot de scoring (passe 3)."""
    if not isinstance(scores, list):
        return False
    seen: set[int] = set()
    for item in scores:
        try:
            i = item["i"]
            if not isinstance(i, int) or i not in allowed or i in seen:
                return False
            seen.add(i)
            if item.get("none") is True:
                continue
            if not (_in_bounds(item["x"]) and _in_bounds(item["y"])):
                return False
            stance = item["stance"]
            if not isinstance(stance, str) or not stance.strip():
                return False
            if any(c in stance for c in _FORBIDDEN_STANCE_CHARS):
                return False
            sal = item["salience"]
            if not isinstance(sal, (int, float)) or not (0 <= sal <= 1):
                return False
        except (KeyError, TypeError):
            return False
    return seen == allowed
```

- [ ] **Step 4: Vérifier le passage**

Run: `python -m pytest tests/test_analyze_debate.py -k "validate_scores" -v`
Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add "transcription-debat/backend/code python/analyze_debate.py" transcription-debat/backend/tests/test_analyze_debate.py
git commit -m "feat(analyze): validate_scores (bornes, couverture des indices, anti-citation)"
```

---

### Task 3: Passe 3 — `build_scoring_prompt` + `run_scoring` (lots de 25)

**Files:**
- Modify: `transcription-debat/backend/code python/analyze_debate.py`
- Test: `transcription-debat/backend/tests/test_analyze_debate.py`

**Interfaces:**
- Consumes: `_call_validated(client, prompt, validator, retries=2)`, `validate_scores`, `select_scorable_blocks` (Tasks 1-2).
- Produces:
  - `SCORE_BATCH_SIZE = 25`, `SCORE_CONTEXT = 3` (constantes module)
  - `build_scoring_prompt(batch: list[dict], ctx_before: list[dict], ctx_after: list[dict], axes: dict, meta: dict) -> str`
  - `run_scoring(client, blocks: list[dict], axes: dict, meta: dict) -> dict[int, dict]` — indice de bloc → `{"x", "y", "stance", "salience"}`. Les entrées `none` sont exclues du résultat. Lot invalide après retries → ignoré (dégradation). `blocks` vide → `{}` sans appel.
  - `axes` est `frame["axes"]` de la passe 1 (contient `x.leftLabel/rightLabel`, `y.bottomLabel/topLabel`).

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `tests/test_analyze_debate.py` :

```python
# Passe 3 — scoring par bloc

AXES_FIXT = {
    "x": {"leftLabel": "Liberté", "rightLabel": "Égalité"},
    "y": {"bottomLabel": "Technique", "topLabel": "Principes"},
}


def test_build_scoring_prompt_includes_axes_and_payload():
    from analyze_debate import build_scoring_prompt
    batch = [{"i": 1, "vid": "i1", "label": "Interlocuteur 1", "t": 1.0, "text": "Texte du bloc."}]
    prompt = build_scoring_prompt(batch, [], [], AXES_FIXT, {"topic": "Retraites"})
    assert "Liberté" in prompt and "Égalité" in prompt
    assert "Texte du bloc." in prompt
    assert "reformulation" in prompt.lower()
    assert "prénom" in prompt.lower()


def test_run_scoring_merges_batches():
    from analyze_debate import run_scoring
    import analyze_debate
    # 26 blocs → 2 lots (25 + 1)
    blocks = [{"i": n, "vid": "i1", "label": "Interlocuteur 1", "t": float(n), "text": "x " * 20}
              for n in range(26)]
    lot1 = json.dumps([{"i": n, "x": 0, "y": 0, "stance": "Position.", "salience": 0.5}
                       for n in range(25)])
    lot2 = json.dumps([{"i": 25, "none": True}])
    client = MagicMock()
    r1 = MagicMock(); r1.text = lot1
    r2 = MagicMock(); r2.text = lot2
    client.models.generate_content.side_effect = [r1, r2]
    out = run_scoring(client, blocks, AXES_FIXT, {"topic": "X"})
    assert client.models.generate_content.call_count == 2
    assert set(out.keys()) == set(range(25))          # le "none" (i=25) est exclu
    assert out[0]["stance"] == "Position."


def test_run_scoring_skips_failed_batch():
    from analyze_debate import run_scoring
    blocks = [{"i": n, "vid": "i1", "label": "Interlocuteur 1", "t": float(n), "text": "x " * 20}
              for n in range(26)]
    bad = MagicMock(); bad.text = "pas du json"
    lot2 = MagicMock(); lot2.text = json.dumps(
        [{"i": 25, "x": 1, "y": 1, "stance": "Position.", "salience": 0.7}])
    client = MagicMock()
    # lot 1 : 2 tentatives échouées ; lot 2 : OK
    client.models.generate_content.side_effect = [bad, bad, lot2]
    out = run_scoring(client, blocks, AXES_FIXT, {"topic": "X"})
    assert set(out.keys()) == {25}


def test_run_scoring_empty_blocks_no_call():
    from analyze_debate import run_scoring
    client = MagicMock()
    assert run_scoring(client, [], AXES_FIXT, {"topic": "X"}) == {}
    client.models.generate_content.assert_not_called()
```

- [ ] **Step 2: Vérifier l'échec**

Run: `python -m pytest tests/test_analyze_debate.py -k "scoring" -v`
Expected: 4 FAIL avec `ImportError`.

- [ ] **Step 3: Implémenter**

Dans `code python/analyze_debate.py` : ajouter les constantes sous `MIN_BLOCK_WORDS` :

```python
SCORE_BATCH_SIZE = 25
SCORE_CONTEXT = 3
```

Puis, après `validate_scores` :

```python
# Passe 3 — Scoring par bloc de parole

def build_scoring_prompt(batch, ctx_before, ctx_after, axes, meta) -> str:
    payload = json.dumps({
        "context_avant": [{"locuteur": b["label"], "texte": b["text"]} for b in ctx_before],
        "blocs": [{"i": b["i"], "locuteur": b["label"], "texte": b["text"]} for b in batch],
        "context_apres": [{"locuteur": b["label"], "texte": b["text"]} for b in ctx_after],
    }, ensure_ascii=False)
    return f"""Tu analyses des prises de parole d'un débat sur « {meta.get("topic", "")} ».

Le cadre d'analyse est un plan à deux axes (échelle -10 à +10) :
- Axe x : {axes["x"]["leftLabel"]} (-10) ⟷ {axes["x"]["rightLabel"]} (+10)
- Axe y : {axes["y"]["bottomLabel"]} (-10) ⟷ {axes["y"]["topLabel"]} (+10)

On te donne un JSON : "context_avant" (lecture seule), "blocs" (à scorer), "context_apres" (lecture seule).

Pour CHAQUE élément de "blocs", réponds :
- s'il exprime une position sur le sujet : {{"i": <même i>, "x": <-10..10>, "y": <-10..10>,
  "stance": "<reformulation élégante en 1-2 phrases du point de vue exprimé, à la 3e personne>",
  "salience": <0..1, force avec laquelle la position est affirmée>}}
- sinon (logistique, question neutre, relance, plaisanterie) : {{"i": <même i>, "none": true}}

Règles STRICTES :
- "stance" est une REFORMULATION, jamais une citation. N'utilise AUCUN guillemet.
- N'introduis AUCUN prénom ni nom propre de personne. Désigne les personnes par leur label
  (Interlocuteur N, Modérateur).
- Ne score que le contenu réellement présent dans le bloc. N'invente rien.
- Réponds UNIQUEMENT avec un tableau JSON, un objet par bloc, tous les "i" de "blocs" présents.

{payload}"""


def run_scoring(client, blocks, axes, meta) -> dict[int, dict]:
    """Score chaque bloc par lots ; les lots invalides sont ignorés (dégradation)."""
    scores: dict[int, dict] = {}
    for k in range(0, len(blocks), SCORE_BATCH_SIZE):
        batch = blocks[k:k + SCORE_BATCH_SIZE]
        ctx_before = blocks[max(0, k - SCORE_CONTEXT):k]
        ctx_after = blocks[k + SCORE_BATCH_SIZE:k + SCORE_BATCH_SIZE + SCORE_CONTEXT]
        allowed = {b["i"] for b in batch}
        prompt = build_scoring_prompt(batch, ctx_before, ctx_after, axes, meta)
        out = _call_validated(client, prompt, lambda o, a=allowed: validate_scores(o, a))
        if out is None:
            print(f"  Lot de scoring ignoré ({len(batch)} blocs).", file=sys.stderr)
            continue
        for item in out:
            if not item.get("none"):
                scores[item["i"]] = {"x": item["x"], "y": item["y"],
                                     "stance": item["stance"].strip(),
                                     "salience": item["salience"]}
    return scores
```

- [ ] **Step 4: Vérifier le passage**

Run: `python -m pytest tests/test_analyze_debate.py -k "scoring" -v`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add "transcription-debat/backend/code python/analyze_debate.py" transcription-debat/backend/tests/test_analyze_debate.py
git commit -m "feat(analyze): passe scoring par lots de 25 avec contexte et dégradation par lot"
```

---

### Task 4: Trajectoires calculées — `compute_trajectories` (EWMA)

**Files:**
- Modify: `transcription-debat/backend/code python/analyze_debate.py`
- Test: `transcription-debat/backend/tests/test_analyze_debate.py`

**Interfaces:**
- Consumes: sorties de `select_scorable_blocks` (Task 1) et `run_scoring` (Task 3).
- Produces:
  - `EWMA_ALPHA = 0.35` (constante module)
  - `compute_trajectories(blocks: list[dict], scores: dict[int, dict], entries: dict[str, float]) -> dict[str, dict]` — id de voix → `{"points": [{"t", "x", "y", "stance", "salience"}], "kf": [[t, x, y], ...]}`.
  - Lissage : par voix, blocs scorés triés par `t` ; le premier initialise `(sx, sy)` à son `(x, y)` ; ensuite `sx += EWMA_ALPHA * salience * (x - sx)` (idem `sy`).
  - `kf` : `[[entry, x0, y0]]` (position du premier bloc scoré, cf. spec) puis un point `[t, round(sx,2), round(sy,2)]` par bloc scoré avec `t` strictement croissant (skip si `t <= précédent`). Si `t` du premier bloc ≤ entry, le point d'entrée n'est pas dupliqué.
  - Voix sans bloc scoré → absente du résultat.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `tests/test_analyze_debate.py` :

```python
# Trajectoires calculées (EWMA)

def _blocks_and_scores(specs):
    """specs: liste de (i, vid, t, x, y, salience). Retourne (blocks, scores)."""
    blocks, scores = [], {}
    for (i, vid, t, x, y, sal) in specs:
        blocks.append({"i": i, "vid": vid, "label": vid, "t": t, "text": "x " * 20})
        scores[i] = {"x": x, "y": y, "stance": f"Position {i}.", "salience": sal}
    return blocks, scores


def test_compute_trajectories_smooths_toward_new_score():
    from analyze_debate import compute_trajectories
    blocks, scores = _blocks_and_scores([
        (1, "i1", 2.0, 0, 0, 1.0),
        (2, "i1", 10.0, 10, 0, 1.0),
    ])
    out = compute_trajectories(blocks, scores, {"i1": 1.0})
    # EWMA : 0 + 0.35*1.0*(10-0) = 3.5 — pas un saut à 10
    assert out["i1"]["kf"] == [[1.0, 0.0, 0.0], [2.0, 0.0, 0.0], [10.0, 3.5, 0.0]]


def test_compute_trajectories_salience_zero_keeps_position():
    from analyze_debate import compute_trajectories
    blocks, scores = _blocks_and_scores([
        (1, "i1", 2.0, 0, 0, 1.0),
        (2, "i1", 10.0, 10, 10, 0.0),   # saillance nulle → ne bouge pas
    ])
    out = compute_trajectories(blocks, scores, {"i1": 1.0})
    assert out["i1"]["kf"][-1] == [10.0, 0.0, 0.0]


def test_compute_trajectories_single_block_fixed():
    from analyze_debate import compute_trajectories
    blocks, scores = _blocks_and_scores([(1, "i1", 2.0, -4, 5, 0.8)])
    out = compute_trajectories(blocks, scores, {"i1": 1.0})
    assert out["i1"]["kf"] == [[1.0, -4.0, 5.0], [2.0, -4.0, 5.0]]
    assert len(out["i1"]["points"]) == 1
    assert out["i1"]["points"][0]["stance"] == "Position 1."


def test_compute_trajectories_voice_without_scores_absent():
    from analyze_debate import compute_trajectories
    blocks, scores = _blocks_and_scores([(1, "i1", 2.0, 0, 0, 1.0)])
    # i2 a un bloc mais aucun score (lot échoué, ou "none")
    blocks.append({"i": 2, "vid": "i2", "label": "Interlocuteur 2", "t": 3.0, "text": "x " * 20})
    out = compute_trajectories(blocks, scores, {"i1": 1.0, "i2": 3.0})
    assert "i2" not in out


def test_compute_trajectories_kf_monotonic_and_entry_not_duplicated():
    from analyze_debate import compute_trajectories
    # premier bloc exactement à l'entrée → pas de doublon [entry, ...]
    blocks, scores = _blocks_and_scores([
        (1, "i1", 1.0, 2, 2, 1.0),
        (2, "i1", 5.0, 4, 4, 1.0),
    ])
    out = compute_trajectories(blocks, scores, {"i1": 1.0})
    ts = [p[0] for p in out["i1"]["kf"]]
    assert ts == sorted(ts) and len(ts) == len(set(ts))
    assert out["i1"]["kf"][0] == [1.0, 2.0, 2.0]
```

- [ ] **Step 2: Vérifier l'échec**

Run: `python -m pytest tests/test_analyze_debate.py -k "compute_trajectories" -v`
Expected: 5 FAIL avec `ImportError`.

- [ ] **Step 3: Implémenter**

Dans `code python/analyze_debate.py` : ajouter `EWMA_ALPHA = 0.35` sous `SCORE_CONTEXT`, puis après `run_scoring` :

```python
def compute_trajectories(blocks, scores, entries) -> dict[str, dict]:
    """Trajectoire lissée (EWMA pondérée par la saillance) par voix — pur calcul, zéro LLM."""
    by_voice: dict[str, list[dict]] = {}
    for b in blocks:
        sc = scores.get(b["i"])
        if sc is None:
            continue
        by_voice.setdefault(b["vid"], []).append({
            "t": b["t"], "x": sc["x"], "y": sc["y"],
            "stance": sc["stance"], "salience": sc["salience"],
        })
    out: dict[str, dict] = {}
    for vid, pts in by_voice.items():
        pts.sort(key=lambda p: p["t"])
        entry = entries.get(vid, pts[0]["t"])
        sx, sy = float(pts[0]["x"]), float(pts[0]["y"])
        kf: list[list[float]] = []
        if entry < pts[0]["t"]:
            kf.append([round(entry, 2), round(sx, 2), round(sy, 2)])
        for i, p in enumerate(pts):
            if i > 0:
                a = EWMA_ALPHA * p["salience"]
                sx += a * (p["x"] - sx)
                sy += a * (p["y"] - sy)
            t = round(p["t"], 2)
            if kf and t <= kf[-1][0]:
                continue
            kf.append([t, round(sx, 2), round(sy, 2)])
        out[vid] = {"points": pts, "kf": kf}
    return out
```

- [ ] **Step 4: Vérifier le passage**

Run: `python -m pytest tests/test_analyze_debate.py -k "compute_trajectories" -v`
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add "transcription-debat/backend/code python/analyze_debate.py" transcription-debat/backend/tests/test_analyze_debate.py
git commit -m "feat(analyze): compute_trajectories — lissage EWMA pondéré par la saillance"
```

---

### Task 5: Passe 1 enrichie — ancres d'axes

**Files:**
- Modify: `transcription-debat/backend/code python/analyze_debate.py` (`build_frame_prompt`, `validate_frame`)
- Test: `transcription-debat/backend/tests/test_analyze_debate.py`

**Interfaces:**
- Produces: `validate_frame` exige désormais `axes.x.anchors.left/right` et `axes.y.anchors.bottom/top`, chacun liste de 2-3 str non vides. Le format `frame["axes"]` s'enrichit — consommé tel quel par `assemble_data` (Task 6) et le template (Task 7).

- [ ] **Step 1: Mettre à jour les fixtures de tests + tests qui échouent**

Dans `tests/test_analyze_debate.py` :

1. Définir un helper d'ancres et l'utiliser dans **toutes** les fixtures de frame (les 3 fixtures inline de `test_validate_frame_ok`, `test_validate_frame_rejects_unknown_voice`, `test_validate_frame_rejects_out_of_bounds`, et la constante `FRAME_RESPONSE`). Ajouter au-dessus de `test_validate_frame_ok` :

```python
ANCHORS_X = {"left": ["La liberté individuelle passe avant tout.",
                      "Toute contrainte collective doit rester exceptionnelle."],
             "right": ["Sans conditions matérielles partagées, la liberté est un privilège.",
                       "L'égalité réelle précède la liberté formelle."]}
ANCHORS_Y = {"bottom": ["Le débat doit rester sur les mécanismes concrets.",
                        "Les chiffres tranchent mieux que les principes."],
             "top": ["C'est une question de principes avant tout.",
                     "Les valeurs priment sur la faisabilité."]}
```

2. Dans chaque fixture de frame, l'axe `x` devient `{"leftLabel": ..., "rightLabel": ..., "anchors": ANCHORS_X}` et l'axe `y` devient `{"bottomLabel": ..., "topLabel": ..., "anchors": ANCHORS_Y}`. Pour `FRAME_RESPONSE` (constante `json.dumps`), inliner les mêmes dicts :

```python
FRAME_RESPONSE = json.dumps({
    "axes": {
        "x": {"leftLabel": "Liberté", "rightLabel": "Égalité", "anchors": ANCHORS_X},
        "y": {"bottomLabel": "Technique", "topLabel": "Principes", "anchors": ANCHORS_Y},
        "quadrants": {"topLeft": "a", "topRight": "b", "bottomLeft": "c", "bottomRight": "d"},
    },
    "personas_interp": {
        "i1": {"camp": "Libéral", "note": "Constance", "pos": [-8, 6]},
        "i2": {"camp": "Solidariste", "note": "Égalité", "pos": [7, 2]},
        "anim": {"camp": "Méta", "note": "Protocole", "pos": [0, 4]},
    },
    "schools": [
        {"id": "lib", "label": "Libéraux", "cx": -8, "cy": 6, "rx": 2, "ry": 2, "members": ["i1"]},
        {"id": "sol", "label": "Solidaristes", "cx": 7, "cy": 2, "rx": 2, "ry": 2, "members": ["i2"]},
    ],
})
```

3. Ajouter le nouveau test :

```python
def test_validate_frame_rejects_missing_anchors():
    from analyze_debate import validate_frame
    frame = {
        "axes": {
            "x": {"leftLabel": "a", "rightLabel": "b"},   # pas d'anchors
            "y": {"bottomLabel": "c", "topLabel": "d", "anchors": ANCHORS_Y},
            "quadrants": {"topLeft": "a", "topRight": "b", "bottomLeft": "c", "bottomRight": "d"},
        },
        "personas_interp": {},
        "schools": [],
    }
    assert validate_frame(frame, VOICE_IDS) is False
    # ancre vide → rejet aussi
    bad = {"left": ["ok", "  "], "right": ["a", "b"]}
    frame["axes"]["x"] = {"leftLabel": "a", "rightLabel": "b", "anchors": bad}
    assert validate_frame(frame, VOICE_IDS) is False
```

- [ ] **Step 2: Vérifier l'échec**

Run: `python -m pytest tests/test_analyze_debate.py -k "validate_frame or run_frame" -v`
Expected: `test_validate_frame_rejects_missing_anchors` FAIL (validate_frame actuel accepte l'absence d'anchors) ; les autres PASS.

- [ ] **Step 3: Implémenter**

Dans `validate_frame` (`code python/analyze_debate.py`), après les deux vérifications de labels et avant celle des quadrants, insérer :

```python
        for axis, poles in (("x", ("left", "right")), ("y", ("bottom", "top"))):
            anchors = ax[axis]["anchors"]
            for pole in poles:
                vals = anchors[pole]
                if not isinstance(vals, list) or not (2 <= len(vals) <= 3):
                    return False
                if not all(isinstance(s, str) and s.strip() for s in vals):
                    return False
```

(Le `except (KeyError, TypeError, IndexError)` existant capture l'absence de `anchors`.)

Dans `build_frame_prompt`, remplacer le point 1 :

```
1. Trouve les DEUX axes qui structurent le mieux ce débat précis. Axe x et axe y, échelle -10 à +10.
   Donne un label court à chaque extrémité (leftLabel/rightLabel pour x, bottomLabel/topLabel pour y),
   et un descripteur court à chacun des 4 quadrants.
```

par :

```
1. Trouve les DEUX axes qui structurent le mieux ce débat précis. Axe x et axe y, échelle -10 à +10.
   Donne un label court à chaque extrémité (leftLabel/rightLabel pour x, bottomLabel/topLabel pour y),
   et un descripteur court à chacun des 4 quadrants.
   Pour chaque pôle, donne aussi "anchors" : 2 à 3 positions-types RÉELLEMENT entendues dans ce débat
   qui incarnent ce pôle, REFORMULÉES en une phrase chacune — jamais de citation exacte, aucun guillemet,
   aucun prénom.
```

et dans le schéma JSON du prompt, remplacer les lignes des axes par :

```
    "x": {{"leftLabel": "...", "rightLabel": "...", "anchors": {{"left": ["...", "..."], "right": ["...", "..."]}}}},
    "y": {{"bottomLabel": "...", "topLabel": "...", "anchors": {{"bottom": ["...", "..."], "top": ["...", "..."]}}}},
```

- [ ] **Step 4: Vérifier le passage**

Run: `python -m pytest tests/test_analyze_debate.py -v`
Expected: tous PASS (y compris `test_run_frame_ok` avec la fixture enrichie).

- [ ] **Step 5: Commit**

```bash
git add "transcription-debat/backend/code python/analyze_debate.py" transcription-debat/backend/tests/test_analyze_debate.py
git commit -m "feat(analyze): ancres d'axes exigées dans la passe 1 (positions-types paraphrasées)"
```

---

### Task 6: Purge passes 3/4 LLM + nouveaux `merge_personas`/`assemble_data` + orchestration 3 passes

**Files:**
- Modify: `transcription-debat/backend/code python/analyze_debate.py`
- Test: `transcription-debat/backend/tests/test_analyze_debate.py`

**Interfaces:**
- Consumes: `compute_speech`, `select_scorable_blocks` (Task 1), `run_scoring` (Task 3), `compute_trajectories` (Task 4).
- Produces:
  - `merge_personas(voices, personas_interp, traj_map, speech_map, duration) -> list[dict]` — persona = `{id, label, camp, color, weight, entry, note, speech, points, kf}`. Voix sans trajectoire calculée mais avec position passe 1 → fallback statique `kf=[[entry, x, y], [duration, x, y]]`, `points=[]`.
  - `assemble_data(meta, frame, personas, timeline, refus) -> dict` — plus de paramètre `concepts`, plus de clé `"concepts"`.
  - `analyze(json_path, topic, code, date, client=None) -> bool` — 3 passes ; si `run_scoring` ne produit rien (`traj_map` vide) → `personas = []` (carte masquée).
- **Supprimés** (code + tests) : `build_traj_prompt`, `run_trajectories`, `validate_kf`, `build_concepts_prompt`, `run_concepts`, `validate_concepts`, constantes `MAX_KF_AMP`, `MAX_KF_GAP`.

- [ ] **Step 1: Supprimer les tests obsolètes**

Dans `tests/test_analyze_debate.py`, supprimer intégralement : `test_validate_kf_ok`, `test_validate_kf_rejects_big_jump`, `test_validate_kf_rejects_wrong_endpoints`, `test_validate_kf_rejects_malformed_keyframe`, `test_validate_concepts`, `_traj_setup`, `test_run_trajectories_keeps_valid_kf`, `test_run_trajectories_omits_bad_kf`, `CONCEPTS_RESPONSE`, `SCHOOLS_FIXT`, `test_run_concepts_ok`, `test_run_concepts_rejects_unknown_camp`.

- [ ] **Step 2: Réécrire les tests d'assemblage + e2e (qui échouent)**

Remplacer `test_merge_personas_static_fallback_when_no_kf`, `test_assemble_data_omits_failed_passes`, `test_analyze_end_to_end_writes_viz`, `test_analyze_degrades_when_a_pass_fails` par, et ajouter `SCORING_RESPONSE` + `test_merge_personas_includes_points_and_speech` :

```python
# Assemblage + orchestration (3 passes)

SCORING_RESPONSE = json.dumps([
    {"i": 1, "x": -8, "y": 6, "stance": "Défend la primauté de la liberté individuelle.", "salience": 0.9},
    {"i": 2, "x": 7, "y": 2, "stance": "Oppose que l'égalité doit primer.", "salience": 0.8},
    {"i": 5, "x": -8, "y": 5, "stance": "Réaffirme sa position initiale.", "salience": 0.6},
])


def test_merge_personas_static_fallback_when_no_traj():
    from analyze_debate import compute_voices, merge_personas
    voices = compute_voices(SEGMENTS)
    interp = {"i1": {"camp": "Lib", "note": "n", "pos": [-8, 6]}}
    personas = merge_personas(voices, interp, traj_map={}, speech_map={}, duration=10.0)
    p = {x["id"]: x for x in personas}
    assert "i1" in p and "i2" not in p          # pas de position passe 1 → omise
    assert p["i1"]["kf"] == [[p["i1"]["entry"], -8, 6], [10.0, -8, 6]]
    assert p["i1"]["points"] == []
    assert p["i1"]["camp"] == "Lib"


def test_merge_personas_includes_points_and_speech():
    from analyze_debate import compute_voices, merge_personas
    voices = compute_voices(SEGMENTS)
    interp = {"i1": {"camp": "Lib", "note": "n", "pos": [-8, 6]}}
    traj = {"i1": {"points": [{"t": 2.0, "x": 0, "y": 0, "stance": "s", "salience": 1.0}],
                   "kf": [[1.0, 0.0, 0.0], [2.0, 0.0, 0.0]]}}
    speech = {"i1": [[1.0, 3.0], [5.33, 10.0]]}
    personas = merge_personas(voices, interp, traj, speech, 10.0)
    p = {x["id"]: x for x in personas}
    assert p["i1"]["points"][0]["stance"] == "s"
    assert p["i1"]["speech"] == [[1.0, 3.0], [5.33, 10.0]]
    assert p["i1"]["kf"][0] == [1.0, 0.0, 0.0]


def test_assemble_data_omits_failed_passes():
    from analyze_debate import assemble_data
    data = assemble_data(
        meta={"topic": "X", "totalDurationMinutes": 10, "totalRedactedMinutes": 1},
        frame={"axes": {"x": {}}, "schools": [], "personas_interp": {}},
        personas=[{"id": "i1", "kf": [[0, 0, 0]]}],
        timeline=None,          # passe 2 échouée
        refus=[[4.0, 5.3]],
    )
    assert "axes" in data
    assert "events" not in data and "tension" not in data
    assert "concepts" not in data
    assert data["refus"] == [[4.0, 5.3]]


def test_analyze_end_to_end_writes_viz(tmp_path):
    from analyze_debate import analyze
    debate_dir = tmp_path / "Retraites" / "0F6A9E"
    debate_dir.mkdir(parents=True)
    json_path = debate_dir / "0F6A9E_2026-05-28_corrected.json"
    json_path.write_text(json.dumps(SEGMENTS), encoding="utf-8")

    client = MagicMock()
    frame_r = MagicMock(); frame_r.text = FRAME_RESPONSE
    timeline_r = MagicMock(); timeline_r.text = TIMELINE_RESPONSE
    scoring_r = MagicMock(); scoring_r.text = SCORING_RESPONSE
    client.models.generate_content.side_effect = [frame_r, timeline_r, scoring_r]

    ok = analyze(json_path, "Retraites", "0F6A9E", "2026-05-28", client=client)
    assert ok is True
    viz = debate_dir / "viz"
    assert (viz / "data.js").exists() and (viz / "index.html").exists()
    content = (viz / "data.js").read_text(encoding="utf-8")
    assert "const DEBATE_DATA" in content
    assert '"anchors"' in content        # passe 1 enrichie
    assert '"points"' in content and '"speech"' in content
    assert '"stance"' in content
    assert '"concepts"' not in content   # passe supprimée


def test_analyze_degrades_when_a_pass_fails(tmp_path):
    from analyze_debate import analyze
    debate_dir = tmp_path / "Retraites" / "0F6A9E"
    debate_dir.mkdir(parents=True)
    json_path = debate_dir / "0F6A9E_2026-05-28_corrected.json"
    json_path.write_text(json.dumps(SEGMENTS), encoding="utf-8")

    client = MagicMock()
    frame_r = MagicMock(); frame_r.text = FRAME_RESPONSE
    bad = MagicMock(); bad.text = "pas du json"     # timeline KO (2 tentatives)
    scoring_r = MagicMock(); scoring_r.text = SCORING_RESPONSE
    # frame(1), timeline(2 essais), scoring(1)
    client.models.generate_content.side_effect = [frame_r, bad, bad, scoring_r]

    ok = analyze(json_path, "Retraites", "0F6A9E", "2026-05-28", client=client)
    assert ok is True
    content = (debate_dir / "viz" / "data.js").read_text(encoding="utf-8")
    assert '"events"' not in content    # timeline omise
    assert '"axes"' in content          # frame présente
    assert '"points"' in content        # scoring OK malgré timeline KO


def test_analyze_hides_map_when_scoring_fully_fails(tmp_path):
    from analyze_debate import analyze
    debate_dir = tmp_path / "Retraites" / "0F6A9E"
    debate_dir.mkdir(parents=True)
    json_path = debate_dir / "0F6A9E_2026-05-28_corrected.json"
    json_path.write_text(json.dumps(SEGMENTS), encoding="utf-8")

    client = MagicMock()
    frame_r = MagicMock(); frame_r.text = FRAME_RESPONSE
    timeline_r = MagicMock(); timeline_r.text = TIMELINE_RESPONSE
    bad = MagicMock(); bad.text = "pas du json"     # scoring KO (2 tentatives, 1 seul lot)
    client.models.generate_content.side_effect = [frame_r, timeline_r, bad, bad]

    ok = analyze(json_path, "Retraites", "0F6A9E", "2026-05-28", client=client)
    assert ok is True
    content = (debate_dir / "viz" / "data.js").read_text(encoding="utf-8")
    assert '"personas": []' in content  # carte masquée
    assert '"tension"' in content       # frise seule
```

- [ ] **Step 3: Vérifier l'échec**

Run: `python -m pytest tests/test_analyze_debate.py -v`
Expected: FAIL sur `merge_personas` (signature), `assemble_data` (paramètre `concepts` manquant), et les 3 tests `analyze` (side_effect à 3 réponses alors que le code fait 4 appels).

- [ ] **Step 4: Implémenter**

Dans `code python/analyze_debate.py` :

1. **Supprimer** : les constantes `MAX_KF_AMP` et `MAX_KF_GAP` ; la fonction `validate_kf` ; le bloc entier `# Task 6: Passe 3 — Trajectoires (kf)` (`build_traj_prompt`, `run_trajectories`) ; le bloc entier `# Task 7: Passe 4 — Réseau conceptuel` (`build_concepts_prompt`, `run_concepts`) ; la fonction `validate_concepts`.

2. **Remplacer** `merge_personas` par :

```python
def merge_personas(voices, personas_interp, traj_map, speech_map, duration) -> list[dict]:
    """Fusionne mesures (voices/speech) + interprétation passe 1 + trajectoires calculées.

    Voix sans trajectoire mais positionnée par la passe 1 → kf statique (fallback).
    Voix absente de personas_interp → non plaçable, omise.
    """
    personas = []
    for v in voices:
        interp = personas_interp.get(v["id"])
        if interp is None:
            continue
        traj = traj_map.get(v["id"])
        if traj:
            kf, points = traj["kf"], traj["points"]
        else:
            x, y = interp["pos"]
            kf, points = [[v["entry"], x, y], [duration, x, y]], []
        personas.append({
            "id": v["id"], "label": v["label"], "camp": interp["camp"],
            "color": v["color"], "weight": v["weight"], "entry": v["entry"],
            "note": interp["note"], "speech": speech_map.get(v["id"], []),
            "points": points, "kf": kf,
        })
    return personas
```

3. **Remplacer** `assemble_data` par :

```python
def assemble_data(meta, frame, personas, timeline, refus) -> dict:
    """Build DEBATE_DATA dict. frame/timeline may be None → omit those sections."""
    data = {
        "meta": meta,
        "personas": personas,
        "refus": refus,
        "totalRedactedMinutes": meta["totalRedactedMinutes"],
        "totalDurationMinutes": meta["totalDurationMinutes"],
    }
    if frame is not None:
        data["axes"] = frame["axes"]
        data["schools"] = frame["schools"]
    if timeline is not None:
        data["events"] = timeline["events"]
        data["tension"] = timeline["tension"]
    return data
```

4. **Remplacer** le cœur de `analyze()` (de `print("Passe 1/4 ...` jusqu'à `data = assemble_data(...)` inclus) par :

```python
    print("Passe 1/3 — cadre + voix...")
    frame = run_frame(client, transcript, voices, meta)
    print("Passe 2/3 — events + tension...")
    timeline = run_timeline(client, transcript, meta)

    personas = []
    if frame is not None:
        print("Passe 3/3 — scoring des prises de parole...")
        blocks = select_scorable_blocks(segments)
        scores = run_scoring(client, blocks, frame["axes"], meta)
        traj_map = compute_trajectories(blocks, scores,
                                        {v["id"]: v["entry"] for v in voices})
        if traj_map:
            personas = merge_personas(voices, frame["personas_interp"], traj_map,
                                      compute_speech(segments), duration)
        else:
            print("Passe 3 entièrement échouée — carte masquée, frise seule.", file=sys.stderr)
    else:
        print("Passe 1 échouée — carte indisponible, on garde ce qui peut l'être.", file=sys.stderr)

    data = assemble_data(meta, frame, personas, timeline, refus)
```

- [ ] **Step 5: Vérifier le passage**

Run: `python -m pytest tests/test_analyze_debate.py -v`
Expected: tous PASS (le test template `test_viz_template_exists_and_generalized` passe encore — le template n'est réécrit qu'en Task 7).

- [ ] **Step 6: Commit**

```bash
git add "transcription-debat/backend/code python/analyze_debate.py" transcription-debat/backend/tests/test_analyze_debate.py
git commit -m "feat(analyze): orchestration 3 passes — trajectoires calculées, passe concepts supprimée"
```

---

### Task 7: Template page unique — réécriture de `viz_template/index.html`

**Files:**
- Rewrite: `transcription-debat/backend/code python/viz_template/index.html`
- Test: `transcription-debat/backend/tests/test_analyze_debate.py`

**Interfaces:**
- Consumes: le schéma `data.js` produit par Task 6 : `meta{topic,code,date,totalDurationMinutes,totalRedactedMinutes}`, `axes{x{leftLabel,rightLabel,anchors{left,right}},y{bottomLabel,topLabel,anchors{bottom,top}},quadrants}`, `personas[{id,label,camp,color,weight,entry,note,speech,points,kf}]`, `events`, `tension`, `refus`, `schools` (non affiché).
- Produces: page unique autonome (un seul fichier + `data.js`), sections conditionnelles : `#sec-axes` (si `axes.x.anchors`), `#sec-map` (si `personas` non vide), `#sec-tension` (si `events` + `tension`), bandeau `#banner-partial` si une section manque.

- [ ] **Step 1: Remplacer le test de template (qui échoue)**

Dans `tests/test_analyze_debate.py`, remplacer `test_viz_template_exists_and_generalized` par :

```python
def test_viz_template_single_page():
    template = Path(__file__).parent.parent / "code python" / "viz_template" / "index.html"
    assert template.exists()
    html = template.read_text(encoding="utf-8")
    assert 'id="hdr-title"' in html
    # plus d'onglets ni de vues V1/V4/V5
    assert "nav.tabs" not in html and "data-tab" not in html
    assert "sankey" not in html.lower()
    assert "drawV1" not in html and "drawV4" not in html and "drawV5" not in html
    # page unique pilotée par les données
    assert "Comment lire cette carte" in html
    assert 'id="now-list"' in html
    assert "totalDurationMinutes" in html
    assert 'max="85"' not in html        # plus de durée en dur
```

Run: `python -m pytest tests/test_analyze_debate.py::test_viz_template_single_page -v`
Expected: FAIL (`nav.tabs` présent dans le template actuel).

- [ ] **Step 2: Écrire le nouveau template (fichier complet)**

Remplacer **intégralement** le contenu de `code python/viz_template/index.html` par :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Visualisation du débat</title>
<script src="https://d3js.org/d3.v7.min.js"></script>
<style>
:root {
  --bg: #ffffff; --bg2: #f4f4f4; --bg3: #e8e8e8;
  --fg: #111111; --fg2: #666666; --fg3: #999999;
  --border: #dddddd; --axis: #aaaaaa;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f0f0f; --bg2: #1a1a1a; --bg3: #242424;
    --fg: #eeeeee; --fg2: #999999; --fg3: #666666;
    --border: #333333; --axis: #555555;
  }
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--fg); min-height: 100vh; }
header { padding: 14px 24px 10px; border-bottom: 1px solid var(--border); display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap; }
header h1 { font-size: 1rem; font-weight: 600; }
header p  { font-size: 0.8rem; color: var(--fg2); }
.wrap { padding: 16px; max-width: 1100px; margin: 0 auto; }
section h2 { font-size: 0.9rem; font-weight: 600; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--fg2); }
.hidden { display: none !important; }
#banner-partial { margin: 12px auto 0; max-width: 1068px; padding: 8px 16px; border: 1px solid #E09020; border-radius: 6px; color: #E09020; font-size: 0.82rem; }

/* Guide de lecture des axes */
#axes-guide { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.axis-block { background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; }
.axis-block h3 { font-size: 0.85rem; margin-bottom: 8px; }
.pole { margin-bottom: 8px; }
.pole b { font-size: 0.8rem; }
.pole ul { margin: 4px 0 0 16px; }
.pole li { font-size: 0.78rem; color: var(--fg2); font-style: italic; line-height: 1.45; }
@media (max-width: 820px) {
  #axes-guide { grid-template-columns: 1fr; }
  .main-grid { grid-template-columns: 1fr !important; }
}

/* Contrôles de lecture */
.controls { display: flex; align-items: center; gap: 12px; padding: 10px 0 10px; flex-wrap: wrap; }
#slider-wrap { flex: 1; min-width: 200px; position: relative; }
#slider-wrap input[type=range] { width: 100%; accent-color: var(--fg); }
#slider-marks { position: absolute; left: 0; right: 0; bottom: -5px; height: 6px; pointer-events: none; }
#slider-marks .mark { position: absolute; width: 5px; height: 5px; border-radius: 50%; transform: translateX(-2px); }
.controls button { background: var(--bg2); border: 1px solid var(--border); border-radius: 4px; padding: 4px 14px; font-size: 0.85rem; cursor: pointer; color: var(--fg); }
.controls button:hover { background: var(--bg3); }
.controls button.speed { padding: 4px 8px; }
.controls button.speed.active { background: var(--fg); color: var(--bg); border-color: var(--fg); }
.controls span { font-size: 0.82rem; color: var(--fg2); white-space: nowrap; }
.tension-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 0.82rem; padding: 3px 10px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg2); }
.tension-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.phase-text { font-size: 0.8rem; color: var(--fg2); font-style: italic; padding: 2px 0 8px; min-height: 1.4em; }

/* Carte + panneau narratif */
.main-grid { display: grid; grid-template-columns: 1fr 300px; gap: 16px; align-items: start; }
#map-container svg { display: block; width: 100%; height: auto; }
#now-panel { background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; padding: 12px; position: sticky; top: 12px; }
#now-panel h3 { font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--fg2); margin-bottom: 8px; }
.now-item { border-left: 3px solid var(--fg3); padding: 6px 8px; margin-bottom: 8px; font-size: 0.8rem; line-height: 1.45; background: var(--bg); border-radius: 0 6px 6px 0; }
.now-item .now-time { color: var(--fg3); font-size: 0.72rem; }
.now-empty { font-size: 0.78rem; color: var(--fg3); font-style: italic; }
.map-caption { font-size: 0.75rem; color: var(--fg3); padding-top: 6px; }

/* Détail d'une voix (preuve de trajectoire) */
#voice-detail { margin-top: 14px; background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; }
#voice-detail-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
#voice-detail-title { font-size: 0.85rem; font-weight: 600; }
#voice-detail-close { background: none; border: none; color: var(--fg2); cursor: pointer; font-size: 0.8rem; }
#voice-detail-list div { font-size: 0.8rem; padding: 4px 0; border-bottom: 1px dashed var(--border); line-height: 1.45; }
#voice-detail-list .vd-time { color: var(--fg3); font-size: 0.72rem; margin-right: 6px; }

/* Frise + légende */
#tl-container svg { display: block; width: 100%; height: auto; }
.legend { display: flex; flex-wrap: wrap; gap: 10px 20px; padding: 8px 0; font-size: 0.78rem; color: var(--fg2); }
.legend-item { display: flex; align-items: center; gap: 5px; }
.legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

footer { margin-top: 32px; padding: 16px 24px; border-top: 1px solid var(--border); font-size: 0.75rem; color: var(--fg3); line-height: 1.6; }
footer p + p { margin-top: 4px; }
#tooltip { position: fixed; display: none; background: var(--bg2); border: 1px solid var(--border); border-radius: 6px; padding: 8px 12px; font-size: 0.8rem; color: var(--fg); max-width: 280px; pointer-events: none; z-index: 9999; line-height: 1.5; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
#tooltip b { font-weight: 600; }
#tooltip .tip-camp { color: var(--fg2); font-size: 0.75rem; margin-bottom: 4px; }
#tooltip .tip-note { font-style: italic; color: var(--fg2); }
</style>
</head>
<body>

<header>
  <h1 id="hdr-title">Cartographie du débat</h1>
  <p id="hdr-sub">Données interprétatives · Reconstruction par analyse de transcription</p>
</header>

<div id="banner-partial" class="hidden">⚠ Analyse partielle : certaines passes d'analyse ont échoué — les sections correspondantes sont masquées. Relancer analyze_debate.py pour compléter.</div>

<section id="sec-axes" class="wrap">
  <h2>Comment lire cette carte</h2>
  <div id="axes-guide"></div>
</section>

<section id="sec-map" class="wrap">
  <h2>Trajectoires des positions</h2>
  <div class="controls">
    <button id="play">▶ Lecture</button>
    <div id="slider-wrap">
      <input type="range" id="slider" min="0" value="0" step="0.1">
      <div id="slider-marks"></div>
    </div>
    <span id="time">00:00</span>
    <button class="speed active" data-speed="1">×1</button>
    <button class="speed" data-speed="2">×2</button>
    <button class="speed" data-speed="4">×4</button>
    <span class="tension-badge" id="tension-badge">
      <span class="tension-dot" id="tdot"></span>
      <span id="tension-val">—</span>
    </span>
  </div>
  <div class="phase-text" id="phase"></div>
  <div class="main-grid">
    <div>
      <div id="map-container"></div>
      <p class="map-caption">Chaque inflexion d'une trajectoire correspond à une prise de parole scorée — cliquez un point pour l'ensemble de ses positions. Le point de la voix qui parle est mis en évidence.</p>
    </div>
    <aside id="now-panel">
      <h3>En ce moment</h3>
      <div id="now-list"></div>
    </aside>
  </div>
  <div id="voice-detail" class="hidden">
    <div id="voice-detail-head">
      <span id="voice-detail-title"></span>
      <button id="voice-detail-close">✕ fermer</button>
    </div>
    <div id="voice-detail-list"></div>
  </div>
</section>

<section id="sec-tension" class="wrap">
  <h2>Frise de tension</h2>
  <div id="tl-container"></div>
  <div class="legend">
    <span class="legend-item"><span class="legend-dot" style="background:#D64545"></span>Dissensus</span>
    <span class="legend-item"><span class="legend-dot" style="background:#0F8A6A"></span>Consensus</span>
    <span class="legend-item"><span class="legend-dot" style="background:#E09020"></span>Concession</span>
    <span class="legend-item"><span class="legend-dot" style="background:#888888"></span>Technique</span>
    <span class="legend-item"><span class="legend-dot" style="background:#534AB7"></span>Méta</span>
    <span class="legend-item"><span class="legend-dot" style="background:#999999"></span>Cadrage</span>
  </div>
</section>

<footer>
  <p>⚠ Les coordonnées, trajectoires et la courbe de tension sont interprétatives — construites par analyse de la transcription anonymisée, pas des mesures objectives. Les trajectoires sont calculées (lissage) à partir de prises de parole scorées individuellement.</p>
  <p>⚠ Les résumés de points de vue sont des reformulations, jamais des citations. Aucun prénom réel n'apparaît.</p>
  <p>⚠ Les zones hachurées signalent des passages non enregistrés (refus de participants) : mesure absente, pas un silence.</p>
</footer>

<div id="tooltip"></div>

<script src="data.js"></script>
<script>
// ─────────────────────────────────────────────
// DONNÉES + MASQUAGE DE SECTIONS + HEADER
// ─────────────────────────────────────────────
const D = window.DEBATE_DATA || {};
const DUR = (D.meta && D.meta.totalDurationMinutes) || 0;

if (D.meta && D.meta.topic) {
  document.getElementById('hdr-title').textContent = 'Débat — ' + D.meta.topic;
  document.title = 'Débat ' + (D.meta.code || '') + ' — Visualisation';
}

const present = {
  axes: !!(D.axes && D.axes.x && D.axes.x.anchors && D.axes.y && D.axes.y.anchors),
  map: !!(D.axes && Array.isArray(D.personas) && D.personas.length > 0),
  tension: Array.isArray(D.events) && D.events.length > 0 &&
           Array.isArray(D.tension) && D.tension.length > 0
};
if (!DUR) { present.axes = present.map = present.tension = false; }
if (!present.axes) document.getElementById('sec-axes').classList.add('hidden');
if (!present.map) document.getElementById('sec-map').classList.add('hidden');
if (!present.tension) {
  document.getElementById('sec-tension').classList.add('hidden');
  document.getElementById('tension-badge').classList.add('hidden');
}
if (!present.map || !present.tension) {
  document.getElementById('banner-partial').classList.remove('hidden');
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const EVENT_COLORS = {
  dissensus: '#D64545', consensus: '#0F8A6A', concession: '#E09020',
  technique: '#888888', meta: '#534AB7', cadrage: '#999999'
};

function lerp(kf, t) {
  if (t <= kf[0][0]) return [kf[0][1], kf[0][2]];
  const last = kf[kf.length - 1];
  if (t >= last[0]) return [last[1], last[2]];
  for (let i = 0; i < kf.length - 1; i++) {
    if (t >= kf[i][0] && t <= kf[i + 1][0]) {
      const r = (t - kf[i][0]) / (kf[i + 1][0] - kf[i][0]);
      return [kf[i][1] + r * (kf[i + 1][1] - kf[i][1]),
              kf[i][2] + r * (kf[i + 1][2] - kf[i][2])];
    }
  }
  return [last[1], last[2]];
}

function getTension(t) {
  const ts = D.tension;
  if (t <= ts[0][0]) return ts[0][1];
  if (t >= ts[ts.length - 1][0]) return ts[ts.length - 1][1];
  for (let i = 0; i < ts.length - 1; i++) {
    if (t >= ts[i][0] && t <= ts[i + 1][0]) {
      const r = (t - ts[i][0]) / (ts[i + 1][0] - ts[i][0]);
      return ts[i][1] + r * (ts[i + 1][1] - ts[i][1]);
    }
  }
  return ts[ts.length - 1][1];
}

function isInRefus(t) { return (D.refus || []).some(([a, b]) => t >= a && t <= b); }

function tensionColor(val, inRefus) {
  if (inRefus) return '#888888';
  if (val <= 45) return '#22aa55';
  if (val >= 72) return '#dd3322';
  return '#ddaa22';
}

function formatTime(minutes) {
  const m = Math.floor(minutes);
  const s = Math.round((minutes - m) * 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getCurrentEvent(t) {
  let current = null;
  for (const ev of (D.events || [])) { if (ev.t <= t) current = ev; else break; }
  return current;
}

function isSpeaking(p, t) { return (p.speech || []).some(([a, b]) => t >= a && t <= b); }

const tooltip = document.getElementById('tooltip');
function showTip(html, evt) { tooltip.innerHTML = html; tooltip.style.display = 'block'; moveTip(evt); }
function moveTip(evt) {
  const x = evt.clientX + 14, y = evt.clientY - 10;
  const rect = tooltip.getBoundingClientRect();
  tooltip.style.left = Math.min(x, window.innerWidth - rect.width - 10) + 'px';
  tooltip.style.top = Math.max(y, 10) + 'px';
}
function hideTip() { tooltip.style.display = 'none'; }

// ─────────────────────────────────────────────
// GUIDE DE LECTURE DES AXES (ancres paraphrasées)
// ─────────────────────────────────────────────
function renderAxesGuide() {
  const el = document.getElementById('axes-guide');
  const blocks = [
    { title: 'Axe horizontal', poles: [
      { name: D.axes.x.leftLabel + ' (gauche)', anchors: D.axes.x.anchors.left },
      { name: D.axes.x.rightLabel + ' (droite)', anchors: D.axes.x.anchors.right }] },
    { title: 'Axe vertical', poles: [
      { name: D.axes.y.bottomLabel + ' (bas)', anchors: D.axes.y.anchors.bottom },
      { name: D.axes.y.topLabel + ' (haut)', anchors: D.axes.y.anchors.top }] }
  ];
  el.innerHTML = blocks.map(b => `
    <div class="axis-block">
      <h3>${b.title}</h3>
      ${b.poles.map(p => `
        <div class="pole"><b>${p.name}</b> — positions-types entendues :
          <ul>${p.anchors.map(a => `<li>${a}</li>`).join('')}</ul>
        </div>`).join('')}
    </div>`).join('');
}

// ─────────────────────────────────────────────
// ÉTAT DE LECTURE PARTAGÉ (carte + frise)
// ─────────────────────────────────────────────
const state = { t: 0, playing: false, raf: null, lastTs: null, speed: 1, trails: {} };
const PLAY_BASE = DUR / 60000;   // débat complet en 60 s à ×1
let mapApi = null, tlApi = null;

const slider = document.getElementById('slider');
slider.max = DUR;

function setT(t, rebuild) {
  state.t = Math.max(0, Math.min(DUR, t));
  if (rebuild && mapApi) mapApi.rebuildTrails(state.t);
  updateAll();
}

function updateAll() {
  const t = state.t;
  slider.value = t;
  document.getElementById('time').textContent = formatTime(t);
  if (present.tension) {
    const tval = getTension(t), inRef = isInRefus(t);
    document.getElementById('tdot').style.background = tensionColor(tval, inRef);
    document.getElementById('tension-val').textContent =
      inRef ? 'Indéterminé (non enreg.)' : `Tension ${Math.round(tval)}/100`;
    const ev = getCurrentEvent(t);
    document.getElementById('phase').textContent = ev ? `${ev.title} — ${ev.desc}` : '';
  }
  if (mapApi) mapApi.update(t);
  renderNow(t);
  if (tlApi) tlApi.setReadhead(t);
}

function stopPlay() {
  state.playing = false;
  state.lastTs = null;
  if (state.raf) cancelAnimationFrame(state.raf);
  document.getElementById('play').textContent = '▶ Lecture';
}

function animFrame(ts) {
  if (!state.playing) return;
  if (state.lastTs !== null) {
    state.t = Math.min(DUR, state.t + (ts - state.lastTs) * PLAY_BASE * state.speed);
  }
  state.lastTs = ts;
  updateAll();
  if (state.t >= DUR) stopPlay();
  else state.raf = requestAnimationFrame(animFrame);
}

document.getElementById('play').addEventListener('click', () => {
  if (state.playing) { stopPlay(); return; }
  if (state.t >= DUR) setT(0, true);
  state.playing = true;
  state.lastTs = null;
  document.getElementById('play').textContent = '⏸ Pause';
  state.raf = requestAnimationFrame(animFrame);
});

slider.addEventListener('input', e => { stopPlay(); setT(+e.target.value, true); });

document.querySelectorAll('button.speed').forEach(btn => {
  btn.addEventListener('click', () => {
    state.speed = +btn.dataset.speed;
    document.querySelectorAll('button.speed').forEach(b => b.classList.toggle('active', b === btn));
  });
});

function renderSliderMarks() {
  const strip = document.getElementById('slider-marks');
  (D.events || []).forEach(ev => {
    const d = document.createElement('span');
    d.className = 'mark';
    d.style.left = (ev.t / DUR * 100) + '%';
    d.style.background = EVENT_COLORS[ev.type] || '#999';
    strip.appendChild(d);
  });
}

// ─────────────────────────────────────────────
// PANNEAU « EN CE MOMENT » (paraphrases)
// ─────────────────────────────────────────────
function renderNow(t) {
  if (!present.map) return;
  const items = [];
  D.personas.forEach(p => (p.points || []).forEach(pt => {
    if (pt.t <= t) items.push({ p, pt });
  }));
  items.sort((a, b) => b.pt.t - a.pt.t);
  const top = items.slice(0, 4);
  const el = document.getElementById('now-list');
  if (!top.length) {
    el.innerHTML = '<p class="now-empty">Aucune prise de position scorée à cet instant.</p>';
    return;
  }
  el.innerHTML = top.map(({ p, pt }) => `
    <div class="now-item" style="border-color:${p.color}">
      <span class="now-time">[${formatTime(pt.t)}]</span> <b>${p.label}</b><br>${pt.stance}
    </div>`).join('');
}

// ─────────────────────────────────────────────
// DÉTAIL D'UNE VOIX (preuve complète de trajectoire)
// ─────────────────────────────────────────────
function showVoiceDetail(p) {
  document.getElementById('voice-detail-title').textContent = `${p.label} — ${p.camp}`;
  const list = document.getElementById('voice-detail-list');
  const pts = (p.points || []).slice().sort((a, b) => a.t - b.t);
  list.innerHTML = pts.length
    ? pts.map(pt => `<div><span class="vd-time">[${formatTime(pt.t)}]</span>${pt.stance}</div>`).join('')
    : '<div class="now-empty">Aucune prise de position scorée pour cette voix.</div>';
  document.getElementById('voice-detail').classList.remove('hidden');
}
document.getElementById('voice-detail-close').addEventListener('click', () => {
  document.getElementById('voice-detail').classList.add('hidden');
});

// ─────────────────────────────────────────────
// CARTE ANIMÉE
// ─────────────────────────────────────────────
function drawMap() {
  const container = document.getElementById('map-container');
  const W = 760, H = 520;
  const mg = { top: 40, right: 30, bottom: 40, left: 50 };
  const pw = W - mg.left - mg.right, ph = H - mg.top - mg.bottom;

  const svg = d3.select(container).append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .style('width', '100%').style('height', 'auto');
  const g = svg.append('g').attr('transform', `translate(${mg.left},${mg.top})`);

  const xSc = d3.scaleLinear().domain([-10, 10]).range([0, pw]);
  const ySc = d3.scaleLinear().domain([-10, 10]).range([ph, 0]);

  // Quadrants
  const quadrants = [
    { x1: -10, y1: 0, x2: 0, y2: 10, label: D.axes.quadrants.topLeft, anchor: 'start' },
    { x1: 0, y1: 0, x2: 10, y2: 10, label: D.axes.quadrants.topRight, anchor: 'end' },
    { x1: -10, y1: -10, x2: 0, y2: 0, label: D.axes.quadrants.bottomLeft, anchor: 'start' },
    { x1: 0, y1: -10, x2: 10, y2: 0, label: D.axes.quadrants.bottomRight, anchor: 'end' }
  ];
  quadrants.forEach(q => {
    g.append('rect')
      .attr('x', xSc(q.x1)).attr('y', ySc(q.y2))
      .attr('width', xSc(q.x2) - xSc(q.x1)).attr('height', ySc(q.y1) - ySc(q.y2))
      .attr('fill', 'var(--bg2)').attr('opacity', 0.6);
    const lx = q.anchor === 'start' ? xSc(q.x1) + 6 : xSc(q.x2) - 6;
    const ly = q.y2 > 0 ? ySc(q.y2) + 14 : ySc(q.y1) - 6;
    g.append('text')
      .attr('x', lx).attr('y', ly).attr('text-anchor', q.anchor)
      .attr('font-size', '9.5px').attr('fill', 'var(--fg3)').attr('pointer-events', 'none')
      .text(q.label);
  });

  // Axes + labels
  g.append('line').attr('x1', xSc(-10)).attr('x2', xSc(10)).attr('y1', ySc(0)).attr('y2', ySc(0))
    .attr('stroke', 'var(--axis)').attr('stroke-width', 1);
  g.append('line').attr('x1', xSc(0)).attr('x2', xSc(0)).attr('y1', ySc(-10)).attr('y2', ySc(10))
    .attr('stroke', 'var(--axis)').attr('stroke-width', 1);
  const axStyle = { fill: 'var(--fg2)', size: '10px' };
  g.append('text').attr('x', xSc(-10)).attr('y', ySc(0) - 6).attr('text-anchor', 'start')
    .attr('fill', axStyle.fill).attr('font-size', axStyle.size).attr('font-weight', 600).text(D.axes.x.leftLabel);
  g.append('text').attr('x', xSc(10)).attr('y', ySc(0) - 6).attr('text-anchor', 'end')
    .attr('fill', axStyle.fill).attr('font-size', axStyle.size).attr('font-weight', 600).text(D.axes.x.rightLabel);
  g.append('text').attr('x', xSc(0) + 4).attr('y', ySc(10) + 2).attr('text-anchor', 'start')
    .attr('fill', axStyle.fill).attr('font-size', axStyle.size).attr('font-weight', 600).text(D.axes.y.topLabel);
  g.append('text').attr('x', xSc(0) + 4).attr('y', ySc(-10) + 12).attr('text-anchor', 'start')
    .attr('fill', axStyle.fill).attr('font-size', axStyle.size).attr('font-weight', 600).text(D.axes.y.bottomLabel);

  // Traînées + points
  const trailLines = {}, circles = {}, groups = {};
  D.personas.forEach(p => {
    trailLines[p.id] = g.append('polyline')
      .attr('fill', 'none').attr('stroke', p.color).attr('stroke-opacity', 0.35)
      .attr('stroke-width', 1.5).attr('stroke-linejoin', 'round');
    state.trails[p.id] = [];
  });

  const rScale = p => 5 + p.weight * 8;
  D.personas.forEach(p => {
    const grp = g.append('g').attr('opacity', 0);
    circles[p.id] = grp.append('circle')
      .attr('r', rScale(p))
      .attr('fill', p.color).attr('fill-opacity', 0.9)
      .attr('stroke', 'var(--bg)').attr('stroke-width', 1.5)
      .style('cursor', 'pointer')
      .on('mousemove', evt => showTip(
        `<b>${p.label}</b><div class="tip-camp">${p.camp}</div><div class="tip-note">${p.note}</div>`, evt))
      .on('mouseleave', hideTip)
      .on('click', () => showVoiceDetail(p));
    grp.append('text')
      .attr('dx', 12).attr('dy', -6)
      .attr('font-size', '10px').attr('font-weight', 600)
      .attr('fill', 'var(--fg)').attr('pointer-events', 'none')
      .text(p.label);
    groups[p.id] = grp;
  });

  function update(t) {
    D.personas.forEach(p => {
      const grp = groups[p.id];
      if (t < p.entry) {
        grp.attr('opacity', 0);
        state.trails[p.id] = [];
        trailLines[p.id].attr('points', '');
        return;
      }
      const speaking = isSpeaking(p, t);
      grp.attr('opacity', speaking ? 1 : 0.6);
      circles[p.id]
        .attr('r', speaking ? rScale(p) * 1.3 : rScale(p))
        .attr('stroke-width', speaking ? 2.5 : 1.5);

      const [dx, dy] = lerp(p.kf, t);
      const px = xSc(dx), py = ySc(dy);
      grp.attr('transform', `translate(${px},${py})`);

      const samples = state.trails[p.id];
      const last = samples.length ? samples[samples.length - 1] : null;
      if (!last || Math.abs(t - last[2]) >= 0.5) {
        samples.push([px, py, t]);
        if (samples.length > 400) samples.shift();
      }
      trailLines[p.id].attr('points', samples.map(s => `${s[0]},${s[1]}`).join(' '));
    });
  }

  function rebuildTrails(t) {
    D.personas.forEach(p => { state.trails[p.id] = []; });
    for (let st = 0; st <= t; st += 0.5) {
      D.personas.forEach(p => {
        if (st < p.entry) return;
        const [dx, dy] = lerp(p.kf, st);
        state.trails[p.id].push([xSc(dx), ySc(dy), st]);
      });
    }
  }

  return { update, rebuildTrails };
}

// ─────────────────────────────────────────────
// FRISE DE TENSION SYNCHRONISÉE
// ─────────────────────────────────────────────
function drawTimeline() {
  const container = document.getElementById('tl-container');
  const W = 1068;
  const mg = { top: 20, right: 20, bottom: 90, left: 46 };
  const pw = W - mg.left - mg.right;
  const chartH = 180, markerY = chartH + 16;
  const totalH = mg.top + chartH + 90;

  const svg = d3.select(container).append('svg')
    .attr('viewBox', `0 0 ${W} ${totalH}`)
    .style('width', '100%').style('height', 'auto')
    .style('cursor', 'crosshair');

  const defs = svg.append('defs');
  defs.append('pattern')
    .attr('id', 'hatch-refus')
    .attr('patternUnits', 'userSpaceOnUse')
    .attr('width', 6).attr('height', 6)
    .attr('patternTransform', 'rotate(45)')
    .append('line')
      .attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 6)
      .attr('stroke', 'var(--fg3)').attr('stroke-width', 1.5);

  const g = svg.append('g').attr('transform', `translate(${mg.left},${mg.top})`);
  const xSc = d3.scaleLinear().domain([0, DUR]).range([0, pw]);
  const ySc = d3.scaleLinear().domain([0, 100]).range([chartH, 0]);

  // Graduations temporelles
  const tickStep = DUR > 120 ? 20 : 10;
  for (let m = 0; m <= DUR; m += tickStep) {
    g.append('line').attr('x1', xSc(m)).attr('x2', xSc(m))
      .attr('y1', chartH).attr('y2', chartH + 4)
      .attr('stroke', 'var(--axis)').attr('stroke-width', 1);
    g.append('text').attr('x', xSc(m)).attr('y', chartH + 14)
      .attr('text-anchor', 'middle').attr('font-size', '9px').attr('fill', 'var(--fg3)')
      .text(`${m}'`);
  }
  [0, 50, 100].forEach(v => {
    g.append('line').attr('x1', 0).attr('x2', pw).attr('y1', ySc(v)).attr('y2', ySc(v))
      .attr('stroke', 'var(--border)').attr('stroke-width', 0.5);
    g.append('text').attr('x', -6).attr('y', ySc(v) + 4)
      .attr('text-anchor', 'end').attr('font-size', '9px').attr('fill', 'var(--fg3)').text(v);
  });
  g.append('text').attr('x', -30).attr('y', chartH / 2)
    .attr('text-anchor', 'middle').attr('font-size', '9px').attr('fill', 'var(--fg3)')
    .attr('transform', `rotate(-90,-30,${chartH / 2})`).text('Tension');

  // Aire + ligne de tension
  const area = d3.area().x(d => xSc(d[0])).y0(chartH).y1(d => ySc(d[1])).curve(d3.curveMonotoneX);
  g.append('path').datum(D.tension).attr('d', area).attr('fill', '#E8673A').attr('fill-opacity', 0.35);
  const line = d3.line().x(d => xSc(d[0])).y(d => ySc(d[1])).curve(d3.curveMonotoneX);
  g.append('path').datum(D.tension).attr('d', line)
    .attr('fill', 'none').attr('stroke', '#E8673A').attr('stroke-width', 2);

  // Zones de refus
  (D.refus || []).forEach(([a, b]) => {
    const bw = xSc(b) - xSc(a);
    g.append('rect').attr('x', xSc(a)).attr('y', 0)
      .attr('width', Math.max(bw, 2)).attr('height', chartH)
      .attr('fill', 'url(#hatch-refus)').attr('opacity', 0.45);
    if (bw > 20) {
      g.append('text').attr('x', xSc((a + b) / 2)).attr('y', chartH / 2)
        .attr('text-anchor', 'middle').attr('font-size', '11px')
        .attr('fill', 'var(--fg3)').attr('pointer-events', 'none').text('?');
    }
  });

  // Marqueurs d'events (clic → seek)
  D.events.forEach(ev => {
    const mx = xSc(ev.t);
    const mr = 4 + ev.magnitude * 1.8;
    const ec = EVENT_COLORS[ev.type] || '#999';
    g.append('line').attr('x1', mx).attr('x2', mx)
      .attr('y1', chartH).attr('y2', chartH + markerY - mr - 1)
      .attr('stroke', ec).attr('stroke-opacity', 0.35).attr('stroke-width', 1);
    const mkGrp = g.append('g')
      .attr('transform', `translate(${mx}, ${chartH + markerY})`)
      .style('cursor', 'pointer');
    if (ev.type === 'concession') {
      mkGrp.append('polygon').attr('points', `0,${-mr} ${mr},0 0,${mr} ${-mr},0`).attr('fill', ec);
    } else {
      mkGrp.append('circle').attr('r', mr).attr('fill', ec);
    }
    mkGrp
      .on('mousemove', evt => showTip(
        `<b>${ev.title}</b><br><span style="color:${ec};font-size:0.75rem;">${ev.type} — ${formatTime(ev.t)}</span><br>${ev.desc}`, evt))
      .on('mouseleave', hideTip)
      .on('click', evt => { evt.stopPropagation(); stopPlay(); setT(ev.t, true); });
  });

  // Tête de lecture partagée
  const readhead = g.append('line')
    .attr('x1', 0).attr('x2', 0)
    .attr('y1', 0).attr('y2', chartH + markerY + 8)
    .attr('stroke', 'var(--fg)').attr('stroke-width', 1.5)
    .attr('stroke-dasharray', '3,2');

  // Clic n'importe où sur la frise → seek
  svg.on('click', evt => {
    const [px] = d3.pointer(evt, g.node());
    const t = xSc.invert(px);
    if (isFinite(t)) { stopPlay(); setT(t, true); }
  });

  return { setReadhead: t => readhead.attr('x1', xSc(t)).attr('x2', xSc(t)) };
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
if (present.axes) renderAxesGuide();
if (present.map) mapApi = drawMap();
if (present.tension) { tlApi = drawTimeline(); renderSliderMarks(); }
if (DUR) setT(0, true);
</script>
</body>
</html>
```

- [ ] **Step 3: Vérifier le passage**

Run: `python -m pytest tests/test_analyze_debate.py -v`
Expected: tous PASS, dont `test_viz_template_single_page`.

- [ ] **Step 4: Vérification visuelle avec données synthétiques**

Générer un `viz/` de test sans Gemini en réutilisant les fixtures (depuis `transcription-debat/backend/`) :

```powershell
$code = @'
import sys, json
sys.path.insert(0, "code python"); sys.path.insert(0, "tests")
from pathlib import Path
from unittest.mock import MagicMock
import test_analyze_debate as T
from analyze_debate import analyze
d = Path("tmp_viz_check"); d.mkdir(exist_ok=True)
jp = d / "TEST_2026-07-01_corrected.json"
jp.write_text(json.dumps(T.SEGMENTS), encoding="utf-8")
c = MagicMock(); rs = []
for txt in (T.FRAME_RESPONSE, T.TIMELINE_RESPONSE, T.SCORING_RESPONSE):
    m = MagicMock(); m.text = txt; rs.append(m)
c.models.generate_content.side_effect = rs
analyze(jp, "Test", "TEST", "2026-07-01", client=c)
'@
$code | python -
```

Ouvrir `tmp_viz_check/viz/index.html` dans un navigateur et vérifier : le guide des axes affiche 4 pôles avec ancres ; la carte anime 3 points ; le panneau « En ce moment » affiche des paraphrases pendant la lecture ; clic sur un point → détail ; la frise réagit au clic (seek) ; la tête de lecture suit. Supprimer `tmp_viz_check/` après vérification.

- [ ] **Step 5: Commit**

```bash
git add "transcription-debat/backend/code python/viz_template/index.html" transcription-debat/backend/tests/test_analyze_debate.py
git commit -m "feat(viz): template page unique — carte+frise synchronisées, axes ancrés, narration"
```

---

### Task 8: Vérification réelle + documentation

**Files:**
- Modify: `transcription-debat/CLAUDE.md`

**Interfaces:**
- Consumes: tout ce qui précède. `run_transcription.ps1 -Visualize` et la CLI `analyze_debate.py <json>` sont inchangés.

- [ ] **Step 1: Suite complète**

Run: `python -m pytest tests/ -v` (depuis `transcription-debat/backend/`, Python système)
Expected: **117 passed** (70 existants hors analyze + 47 analyze_debate). Si le total diffère, recompter et utiliser le chiffre réel aux steps suivants.

- [ ] **Step 2: Régénération réelle**

Depuis `transcription-debat/backend/` (nécessite `GEMINI_API_KEY` dans `.env`) :

```powershell
.venv\Scripts\python "code python\analyze_debate.py" "transcripts\Multiculturalisme\71B505\71B505_2026-06-24_corrected.json"
```

Expected: `Passe 1/3 ... Passe 2/3 ... Passe 3/3 ... Visualisation écrite`. En cas de 429/503 sur des lots : le pipeline finit quand même (dégradation) — relancer plus tard pour compléter. Ouvrir `transcripts\Multiculturalisme\71B505\viz\index.html` et vérifier la page unique sur données réelles (durée 125,3 min → slider et frise vont bien jusqu'au bout, plus de plafond à 85).

- [ ] **Step 3: Mettre à jour `transcription-debat/CLAUDE.md`**

Éditer exactement :

1. Ligne de structure des tests — remplacer :
```
    ├── tests/                      104 tests (anonymize 8 + transcribe_offline 27 + correct 14 + deduplicate 21 + analyze_debate 34)
```
par :
```
    ├── tests/                      117 tests (anonymize 8 + transcribe_offline 27 + correct 14 + deduplicate 21 + analyze_debate 47)
```

2. Section **Tests** — remplacer :
```
104 tests : `anonymize_log` (8) + `transcribe_offline` (27) + `correct_transcript` (14) + `deduplicate` (21) + `analyze_debate` (34). `conftest.py` (racine backend) ajoute `transcription/` au `sys.path`.
```
par :
```
117 tests : `anonymize_log` (8) + `transcribe_offline` (27) + `correct_transcript` (14) + `deduplicate` (21) + `analyze_debate` (47). `conftest.py` (racine backend) ajoute `transcription/` au `sys.path`.
```

3. Ligne du tableau pipeline (Visualisation) — remplacer :
```
| Visualisation (option) | `analyze_debate.py` | Analyse Gemini étagée (4 passes : cadre+voix, events+tension, trajectoires, réseau conceptuel) → `viz/data.js` + dashboard. Champs mesurables (poids, entrée, refus) calculés sans LLM. Dégradation gracieuse par passe. |
```
par :
```
| Visualisation (option) | `analyze_debate.py` | Analyse Gemini étagée (3 passes : cadre+ancres d'axes, events+tension, scoring par bloc de parole) → trajectoires **calculées** (EWMA pondérée saillance) → `viz/data.js` + dashboard **page unique** (carte animée + frise synchronisées). Champs mesurables (poids, entrée, refus, `speech`) calculés sans LLM. Dégradation gracieuse par passe et par lot. |
```

4. Règle critique `analyze_debate.py` — remplacer :
```
- **`analyze_debate.py`** : le LLM ne fait que de l'interprétation ; `weight`/`entry`/`refus`/durée sont calculés depuis le JSON, jamais demandés au LLM. Ne jamais lever le garde-fou anti-invention (le LLM ne référence que les `id` de voix calculés). `GEMINI_ANALYSIS_MODEL` distinct de `GEMINI_MODEL`. Le template `viz_template/index.html` doit rester piloté par `data.js` (header + masquage d'onglets).
```
par :
```
- **`analyze_debate.py`** : le LLM ne fait que de l'interprétation ; `weight`/`entry`/`refus`/`speech`/durée ET les trajectoires (`kf`, lissage EWMA des scores par bloc) sont calculés depuis le JSON, jamais demandés au LLM. Les `stance`/ancres sont des REFORMULATIONS — `validate_scores` rejette les guillemets ; ne jamais lever ce garde-fou ni l'anti-invention de prénoms. `GEMINI_ANALYSIS_MODEL` distinct de `GEMINI_MODEL`. Le template `viz_template/index.html` est une page unique pilotée par `data.js` (sections conditionnelles, durée via `meta.totalDurationMinutes` — jamais en dur).
```

- [ ] **Step 4: Commit final**

```bash
git add transcription-debat/CLAUDE.md
git commit -m "docs(transcription): documente la visualisation page unique et le scoring par bloc"
```

---

## Self-Review (fait à la rédaction)

- **Couverture du spec** : passes 1-3 (Tasks 3, 5, 6), ancres (Task 5), scoring+validation anti-citation (Tasks 2-3), EWMA + point d'entrée (Task 4), `speech` mesuré (Task 1), schéma data.js (Task 6), page unique + narration + sync + seek + pulse + refus (Task 7), dégradations partielle/totale (Tasks 3, 6, 7), suppression V1/V4/V5/concepts (Tasks 6-7), doc (Task 8). `run_transcription.ps1`, `GEMINI_ANALYSIS_MODEL`, emplacement `viz/` : inchangés — aucun task nécessaire.
- **Hors scope respecté** : pas de sankey, pas d'affichage des `schools` (conservées dans data.js), pas de régénération incrémentale.
- **Cohérence de types** : `select_scorable_blocks` → `{i, vid, label, t, text}` consommé tel quel par `run_scoring` (Task 3) et `compute_trajectories` (Task 4) ; `run_scoring` → `dict[int, {x,y,stance,salience}]` consommé par `compute_trajectories` ; `traj_map` → `{points, kf}` consommé par `merge_personas` (Task 6) puis le template (`p.points`, `p.kf`, `p.speech`, Task 7).
