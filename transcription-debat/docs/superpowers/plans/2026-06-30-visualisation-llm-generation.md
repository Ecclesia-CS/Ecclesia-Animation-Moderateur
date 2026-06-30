# Génération LLM des visualisations de débat — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une étape de pipeline qui transforme un transcript corrigé en un dashboard de visualisation autonome (`viz/index.html` + `data.js`) par débat, le `data.js` étant généré par analyse Gemini étagée + garde-fous.

**Architecture:** Nouveau module `analyze_debate.py` (standalone + appelable, comme `correct_transcript.py`). Les champs mesurables (temps de parole, entrée, refus, durée) sont calculés directement depuis le JSON ; les champs interprétatifs (axes, positions, events, tension, concepts) sont produits par 4 passes Gemini ciblées, chacune validée avec retry ×2 et dégradation gracieuse. Le résultat est assemblé en `DEBATE_DATA` et écrit dans `viz/data.js` à côté d'une copie d'un template HTML généralisé.

**Tech Stack:** Python 3.11 (venv backend), `google-genai`, pytest (Python système, Gemini mocké), D3 v7 (template, inchangé sauf généralisation header/onglets), PowerShell (orchestration).

## Global Constraints

- **Tout le code Python vit dans `backend/code python/`** (dossier avec espace → toujours quoter dans les commandes). Imports à plat (`from correct_transcript import ...`), jamais relatifs/package.
- **Commandes Python : `.venv\Scripts\python` depuis `backend/`.** Tests : Python système depuis `backend/` (`python -m pytest tests/ -v`).
- **Modèle d'analyse :** `os.getenv("GEMINI_ANALYSIS_MODEL", "gemini-3.1-flash-lite")` — distinct de `GEMINI_MODEL` (correction). Paramétrable.
- **Gemini : vérifier l'échec ET parser défensivement.** Strip des fences ```` ``` ````, `json.loads`, `try/except` → `None` en cas d'échec (jamais d'exception qui remonte). `responseMimeType` non requis ici (on parse défensivement comme `correct_transcript.py`).
- **Anti-invention de noms (RGPD) — à ne jamais lever :** le LLM ne référence QUE les `id` de voix calculés (`i1`, `i2`, … `anim`) et les `id` d'écoles qu'il a lui-même définis. Les `label` des voix sont posés par le code, jamais par le LLM. Tout `id` inconnu → rejet de la passe.
- **Bornes interprétatives :** `x, y ∈ [-10, 10]`, `tension ∈ [0, 100]`, `magnitude ∈ {1,2,3}`, `t ∈ [0, durée]`.
- **Schéma `data.js` conservé tel quel** (voir `Visualisation prises de positions/data.js`) pour réutiliser la viz. Section absente (passe échouée) → onglet masqué côté template.
- **Dégradation gracieuse :** une passe ratée n'interrompt jamais l'écriture du `data.js`.

---

## File Structure

**Créés :**
- `backend/code python/analyze_debate.py` — calcul des champs mesurables, validateurs, passes Gemini, assemblage, écriture `viz/`.
- `backend/code python/viz_template/index.html` — template HTML généralisé (copie de l'existant + header/onglets pilotés par les données).
- `backend/tests/test_analyze_debate.py` — tests (déterministe + Gemini mocké).

**Modifiés :**
- `backend/run_transcription.ps1` — switch `-Visualize`.
- `transcription-debat/CLAUDE.md` — doc (étape, module, switch, variable, table de tests).

**Référence intacte :** `Visualisation prises de positions/{index.html,data.js}` (maquette Retraite) — ne pas modifier.

---

## Constantes partagées (définies en tête de `analyze_debate.py`, Task 1)

```python
MODEL = os.getenv("GEMINI_ANALYSIS_MODEL", "gemini-3.1-flash-lite")
AXIS_MIN, AXIS_MAX = -10, 10
# Palette fixe (cohérence inter-vues). Modérateur = violet méta réservé.
MODERATOR_COLOR = "#534AB7"
PALETTE = ["#D64545", "#0F8A6A", "#E09020", "#D85A30", "#639922",
           "#8FBF4B", "#6E6D68", "#9A9992", "#4A90D9", "#C0507A", "#3FA7A0"]
EVENT_TYPES = {"cadrage", "technique", "dissensus", "consensus", "concession", "meta"}
# Garde-fou anti-grand-mouvement (débat de cristallisation) :
# déplacement max entre deux keyframes proches.
MAX_KF_AMP = 4.0   # points de position
MAX_KF_GAP = 10.0  # minutes ; au-delà, l'amplitude n'est plus plafonnée
```

---

### Task 1: Champs mesurables (calcul sans LLM)

**Files:**
- Create: `backend/code python/analyze_debate.py`
- Test: `backend/tests/test_analyze_debate.py`

**Interfaces:**
- Produces:
  - `compute_voices(segments: list[dict]) -> list[dict]` → liste de personas `{id, label, weight, entry, color}` (sans champs interprétatifs). Exclut les locuteurs `"[REFUS]"` et `"[?]"`. `"Modérateur"` → `id="anim"`, couleur `MODERATOR_COLOR`. `"Interlocuteur N"` → `id=f"i{N}"`. `weight` = durée de parole normalisée par le max (∈ ]0,1]). `entry` = minute de première prise de parole (float). Ordre : par `entry` croissant, Modérateur en dernier.
  - `compute_refus(segments: list[dict]) -> tuple[list[list[float]], float, float]` → `(intervalles_minutes, total_redacted_min, total_duration_min)`. Fusionne les segments consécutifs `refused=True` (jointifs si écart ≤ 0.5 s) en intervalles `[start_min, end_min]`. Arrondi 1 décimale.
  - `build_meta(segments, topic, code, date, total_redacted_min, total_duration_min) -> dict` → `{topic, code, date, totalDurationMinutes, totalRedactedMinutes}`.

- [ ] **Step 1: Écrire les tests qui échouent**

```python
# backend/tests/test_analyze_debate.py
import json
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock

SEGMENTS = [
    {"start": 0.0,   "end": 60.0,  "speaker": "Modérateur",      "text": "Bonjour, on commence.", "refused": False},
    {"start": 60.0,  "end": 180.0, "speaker": "Interlocuteur 1", "text": "Je pense que la liberté prime.", "refused": False},
    {"start": 180.0, "end": 240.0, "speaker": "Interlocuteur 2", "text": "Pas d'accord, l'égalité d'abord.", "refused": False},
    {"start": 240.0, "end": 300.0, "speaker": "[REFUS]",         "text": "[N'a pas souhaité être enregistré(e)]", "refused": True},
    {"start": 300.0, "end": 320.0, "speaker": "[REFUS]",         "text": "[N'a pas souhaité être enregistré(e)]", "refused": True},
    {"start": 320.0, "end": 600.0, "speaker": "Interlocuteur 1", "text": "Je maintiens ma position.", "refused": False},
]


def test_compute_voices_excludes_refus_and_unknown():
    from analyze_debate import compute_voices
    voices = compute_voices(SEGMENTS)
    ids = {v["id"] for v in voices}
    assert ids == {"anim", "i1", "i2"}


def test_compute_voices_weight_and_entry():
    from analyze_debate import compute_voices
    voices = {v["id"]: v for v in compute_voices(SEGMENTS)}
    # i1 parle 120 + 280 = 400 s (le plus), poids = 1.0 ; entrée à 1.0 min
    assert voices["i1"]["weight"] == pytest.approx(1.0)
    assert voices["i1"]["entry"] == pytest.approx(1.0)
    # i2 parle 60 s ; poids = 60/400 = 0.15
    assert voices["i2"]["weight"] == pytest.approx(0.15, abs=0.01)


def test_compute_voices_moderator_color():
    from analyze_debate import compute_voices, MODERATOR_COLOR
    voices = {v["id"]: v for v in compute_voices(SEGMENTS)}
    assert voices["anim"]["color"] == MODERATOR_COLOR
    assert voices["i1"]["label"] == "Interlocuteur 1"


def test_compute_refus_merges_intervals():
    from analyze_debate import compute_refus
    refus, redacted, duration = compute_refus(SEGMENTS)
    # Les deux segments refused 240-300 et 300-320 fusionnent en [4.0, 5.33]
    assert refus == [[4.0, 5.3]]
    assert redacted == pytest.approx(1.3, abs=0.1)
    assert duration == pytest.approx(10.0)


def test_build_meta():
    from analyze_debate import build_meta
    meta = build_meta(SEGMENTS, "Retraites", "0F6A9E", "2026-05-28", 1.3, 10.0)
    assert meta["topic"] == "Retraites"
    assert meta["code"] == "0F6A9E"
    assert meta["totalDurationMinutes"] == pytest.approx(10.0)
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run (depuis `backend/`) : `python -m pytest tests/test_analyze_debate.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'analyze_debate'`.

- [ ] **Step 3: Implémenter `analyze_debate.py` (constantes + champs mesurables)**

```python
# backend/code python/analyze_debate.py
import json
import os
import re
import shutil
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

MODEL = os.getenv("GEMINI_ANALYSIS_MODEL", "gemini-3.1-flash-lite")
AXIS_MIN, AXIS_MAX = -10, 10
MODERATOR_COLOR = "#534AB7"
PALETTE = ["#D64545", "#0F8A6A", "#E09020", "#D85A30", "#639922",
           "#8FBF4B", "#6E6D68", "#9A9992", "#4A90D9", "#C0507A", "#3FA7A0"]
EVENT_TYPES = {"cadrage", "technique", "dissensus", "consensus", "concession", "meta"}
MAX_KF_AMP = 4.0
MAX_KF_GAP = 10.0

_INTERLOCUTEUR_RE = re.compile(r"^Interlocuteur\s+(\d+)$")


def _speaker_id(speaker: str) -> str | None:
    """Mappe un label de locuteur vers un id stable, ou None si non plaçable."""
    if speaker == "Modérateur":
        return "anim"
    m = _INTERLOCUTEUR_RE.match(speaker)
    if m:
        return f"i{m.group(1)}"
    return None  # [REFUS], [?] ou inconnu → non placé sur la carte


def compute_voices(segments: list[dict]) -> list[dict]:
    durations: dict[str, float] = {}
    entries: dict[str, float] = {}
    labels: dict[str, str] = {}
    for seg in segments:
        vid = _speaker_id(seg["speaker"])
        if vid is None:
            continue
        durations[vid] = durations.get(vid, 0.0) + (seg["end"] - seg["start"])
        start_min = seg["start"] / 60.0
        if vid not in entries or start_min < entries[vid]:
            entries[vid] = start_min
        labels[vid] = seg["speaker"]
    if not durations:
        return []
    max_dur = max(durations.values())
    ordered = sorted(
        durations.keys(),
        key=lambda v: (v == "anim", entries[v]),  # Modérateur en dernier
    )
    color_i = 0
    voices = []
    for vid in ordered:
        if vid == "anim":
            color = MODERATOR_COLOR
        else:
            color = PALETTE[color_i % len(PALETTE)]
            color_i += 1
        voices.append({
            "id": vid,
            "label": labels[vid],
            "weight": round(durations[vid] / max_dur, 3),
            "entry": round(entries[vid], 2),
            "color": color,
        })
    return voices


def compute_refus(segments: list[dict]) -> tuple[list[list[float]], float, float]:
    intervals: list[list[float]] = []
    for seg in segments:
        if not seg.get("refused"):
            continue
        a, b = seg["start"] / 60.0, seg["end"] / 60.0
        if intervals and a - intervals[-1][1] <= 0.5 / 60.0:
            intervals[-1][1] = b
        else:
            intervals.append([a, b])
    intervals = [[round(a, 1), round(b, 1)] for a, b in intervals]
    redacted = round(sum(b - a for a, b in intervals), 1)
    duration = round(max((s["end"] for s in segments), default=0.0) / 60.0, 1)
    return intervals, redacted, duration


def build_meta(segments, topic, code, date, total_redacted_min, total_duration_min) -> dict:
    return {
        "topic": topic,
        "code": code,
        "date": date,
        "totalDurationMinutes": total_duration_min,
        "totalRedactedMinutes": total_redacted_min,
    }
```

- [ ] **Step 4: Lancer les tests pour vérifier le succès**

Run : `python -m pytest tests/test_analyze_debate.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add "backend/code python/analyze_debate.py" backend/tests/test_analyze_debate.py
git commit -m "feat(analyze): champs mesurables voix/refus/meta sans LLM"
```

---

### Task 2: Validateurs (fonctions pures)

**Files:**
- Modify: `backend/code python/analyze_debate.py` (ajout des validateurs)
- Test: `backend/tests/test_analyze_debate.py` (ajout)

**Interfaces:**
- Consumes: `AXIS_MIN`, `AXIS_MAX`, `EVENT_TYPES`, `MAX_KF_AMP`, `MAX_KF_GAP` (Task 1).
- Produces:
  - `validate_frame(frame: dict, voice_ids: set[str]) -> bool` — `frame` = `{axes, schools, personas_interp}`. Vérifie : `axes.x/y` ont `leftLabel/rightLabel` (resp. `bottomLabel/topLabel`), `axes.quadrants` a 4 clés ; chaque clé de `personas_interp` ∈ `voice_ids` ; chaque `pos` ∈ bornes ; chaque `schools[i].members ⊆ voice_ids` ; chaque `schools[i]` a `id,label,cx,cy,rx,ry` avec `cx,cy` ∈ bornes.
  - `validate_events(events: list[dict], duration: float) -> bool` — chaque event a `t ∈ [0,duration]`, `type ∈ EVENT_TYPES`, `magnitude ∈ {1,2,3}`, `title` et `desc` non vides.
  - `validate_tension(tension: list, duration: float) -> bool` — liste non vide de `[t, v]`, `t` croissant, `t ∈ [0,duration]`, `v ∈ [0,100]`.
  - `validate_kf(kf: list, entry: float, final_xy: list[float]) -> bool` — `t` strictement croissant ; `kf[0][0] == entry` (±0.5) ; dernier point `≈ final_xy` (±0.5) ; toutes coords ∈ bornes ; pour deux keyframes consécutives avec `Δt ≤ MAX_KF_GAP`, le déplacement euclidien `≤ MAX_KF_AMP`.
  - `validate_concepts(net: dict, school_ids: set[str], voice_ids: set[str]) -> bool` — `fauxConsensus[*].campA/campB ∈ school_ids` ; `gordian[*].campA/campB ∈ school_ids` ; `concessions[*].by ∈ school_ids ∪ voice_ids` ; `concessions[*].targetConcept` présent dans l'ensemble des concepts cités.

- [ ] **Step 1: Écrire les tests qui échouent**

```python
# Ajouter à backend/tests/test_analyze_debate.py

VOICE_IDS = {"i1", "i2", "anim"}
SCHOOL_IDS = {"lib", "sol"}


def test_validate_frame_ok():
    from analyze_debate import validate_frame
    frame = {
        "axes": {
            "x": {"leftLabel": "Liberté", "rightLabel": "Égalité"},
            "y": {"bottomLabel": "Technique", "topLabel": "Principes"},
            "quadrants": {"topLeft": "a", "topRight": "b", "bottomLeft": "c", "bottomRight": "d"},
        },
        "personas_interp": {"i1": {"camp": "Libéral", "note": "x", "pos": [-8, 6]}},
        "schools": [{"id": "lib", "label": "Libéraux", "cx": -8, "cy": 6, "rx": 2, "ry": 2, "members": ["i1"]}],
    }
    assert validate_frame(frame, VOICE_IDS) is True


def test_validate_frame_rejects_unknown_voice():
    from analyze_debate import validate_frame
    frame = {
        "axes": {"x": {"leftLabel": "a", "rightLabel": "b"},
                 "y": {"bottomLabel": "c", "topLabel": "d"},
                 "quadrants": {"topLeft": "a", "topRight": "b", "bottomLeft": "c", "bottomRight": "d"}},
        "personas_interp": {"i99": {"camp": "X", "note": "y", "pos": [0, 0]}},
        "schools": [],
    }
    assert validate_frame(frame, VOICE_IDS) is False


def test_validate_frame_rejects_out_of_bounds():
    from analyze_debate import validate_frame
    frame = {
        "axes": {"x": {"leftLabel": "a", "rightLabel": "b"},
                 "y": {"bottomLabel": "c", "topLabel": "d"},
                 "quadrants": {"topLeft": "a", "topRight": "b", "bottomLeft": "c", "bottomRight": "d"}},
        "personas_interp": {"i1": {"camp": "X", "note": "y", "pos": [99, 0]}},
        "schools": [],
    }
    assert validate_frame(frame, VOICE_IDS) is False


def test_validate_events():
    from analyze_debate import validate_events
    ok = [{"t": 5, "type": "dissensus", "magnitude": 2, "title": "T", "desc": "D"}]
    assert validate_events(ok, 85) is True
    assert validate_events([{"t": 5, "type": "bogus", "magnitude": 2, "title": "T", "desc": "D"}], 85) is False
    assert validate_events([{"t": 999, "type": "meta", "magnitude": 1, "title": "T", "desc": "D"}], 85) is False


def test_validate_tension():
    from analyze_debate import validate_tension
    assert validate_tension([[0, 40], [10, 60], [85, 30]], 85) is True
    assert validate_tension([[0, 40], [10, 200]], 85) is False   # v hors borne
    assert validate_tension([[10, 40], [5, 60]], 85) is False    # t non croissant


def test_validate_kf_ok():
    from analyze_debate import validate_kf
    kf = [[8, 7, 3], [40, 7, 2], [85, 7, 1.5]]
    assert validate_kf(kf, entry=8, final_xy=[7, 1.5]) is True


def test_validate_kf_rejects_big_jump():
    from analyze_debate import validate_kf
    # saut de 8 points en 2 min (> MAX_KF_AMP sur Δt < MAX_KF_GAP)
    kf = [[8, -8, 0], [10, 0, 0], [85, 0, 0]]
    assert validate_kf(kf, entry=8, final_xy=[0, 0]) is False


def test_validate_kf_rejects_wrong_endpoints():
    from analyze_debate import validate_kf
    kf = [[20, 0, 0], [85, 5, 5]]  # entry attendue 8, finale [0,0]
    assert validate_kf(kf, entry=8, final_xy=[0, 0]) is False


def test_validate_concepts():
    from analyze_debate import validate_concepts
    net = {
        "regular": ["Mérite"],
        "fauxConsensus": [{"concept": "Liberté", "senseA": "x", "campA": "lib", "senseB": "y", "campB": "sol"}],
        "gordian": [{"concept": "Redistribution", "poleA": "x", "campA": "lib", "poleB": "y", "campB": "sol", "why": "z"}],
        "consensus": [{"label": "Démographie", "t": 6, "scope": "tous"}],
        "concessions": [{"by": "lib", "t": 23, "label": "x", "targetConcept": "Liberté"}],
    }
    assert validate_concepts(net, SCHOOL_IDS, VOICE_IDS) is True
    bad = dict(net, concessions=[{"by": "zzz", "t": 1, "label": "x", "targetConcept": "Liberté"}])
    assert validate_concepts(bad, SCHOOL_IDS, VOICE_IDS) is False
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run : `python -m pytest tests/test_analyze_debate.py -k validate -v`
Expected: FAIL — `ImportError: cannot import name 'validate_frame'`.

- [ ] **Step 3: Implémenter les validateurs**

```python
# Ajouter à backend/code python/analyze_debate.py

def _in_bounds(v) -> bool:
    return isinstance(v, (int, float)) and AXIS_MIN <= v <= AXIS_MAX


def validate_frame(frame: dict, voice_ids: set[str]) -> bool:
    try:
        ax = frame["axes"]
        if not all(k in ax["x"] for k in ("leftLabel", "rightLabel")):
            return False
        if not all(k in ax["y"] for k in ("bottomLabel", "topLabel")):
            return False
        if set(ax["quadrants"]) != {"topLeft", "topRight", "bottomLeft", "bottomRight"}:
            return False
        for vid, p in frame["personas_interp"].items():
            if vid not in voice_ids:
                return False
            if not (_in_bounds(p["pos"][0]) and _in_bounds(p["pos"][1])):
                return False
            if not p.get("camp") or "note" not in p:
                return False
        for s in frame["schools"]:
            if not all(k in s for k in ("id", "label", "cx", "cy", "rx", "ry", "members")):
                return False
            if not (_in_bounds(s["cx"]) and _in_bounds(s["cy"])):
                return False
            if not set(s["members"]).issubset(voice_ids):
                return False
    except (KeyError, TypeError, IndexError):
        return False
    return True


def validate_events(events: list[dict], duration: float) -> bool:
    if not isinstance(events, list):
        return False
    for ev in events:
        try:
            if not (0 <= ev["t"] <= duration):
                return False
            if ev["type"] not in EVENT_TYPES:
                return False
            if ev["magnitude"] not in (1, 2, 3):
                return False
            if not ev.get("title") or not ev.get("desc"):
                return False
        except (KeyError, TypeError):
            return False
    return True


def validate_tension(tension: list, duration: float) -> bool:
    if not isinstance(tension, list) or not tension:
        return False
    prev_t = -1.0
    for pt in tension:
        try:
            t, v = pt[0], pt[1]
        except (IndexError, TypeError):
            return False
        if not (0 <= t <= duration) or t < prev_t or not (0 <= v <= 100):
            return False
        prev_t = t
    return True


def validate_kf(kf: list, entry: float, final_xy: list[float]) -> bool:
    if not isinstance(kf, list) or len(kf) < 1:
        return False
    if abs(kf[0][0] - entry) > 0.5:
        return False
    last = kf[-1]
    if abs(last[1] - final_xy[0]) > 0.5 or abs(last[2] - final_xy[1]) > 0.5:
        return False
    prev_t = None
    prev_xy = None
    for point in kf:
        try:
            t, x, y = point[0], point[1], point[2]
        except (IndexError, TypeError):
            return False
        if not (_in_bounds(x) and _in_bounds(y)):
            return False
        if prev_t is not None:
            if t <= prev_t:
                return False
            if t - prev_t <= MAX_KF_GAP:
                dist = ((x - prev_xy[0]) ** 2 + (y - prev_xy[1]) ** 2) ** 0.5
                if dist > MAX_KF_AMP:
                    return False
        prev_t, prev_xy = t, (x, y)
    return True


def validate_concepts(net: dict, school_ids: set[str], voice_ids: set[str]) -> bool:
    try:
        concept_names = set(net.get("regular", []))
        for fc in net.get("fauxConsensus", []):
            concept_names.add(fc["concept"])
            if fc["campA"] not in school_ids or fc["campB"] not in school_ids:
                return False
        for g in net.get("gordian", []):
            concept_names.add(g["concept"])
            if g["campA"] not in school_ids or g["campB"] not in school_ids:
                return False
        allowed_by = school_ids | voice_ids
        for c in net.get("concessions", []):
            if c["by"] not in allowed_by:
                return False
            if c["targetConcept"] not in concept_names:
                return False
    except (KeyError, TypeError):
        return False
    return True
```

- [ ] **Step 4: Lancer pour vérifier le succès**

Run : `python -m pytest tests/test_analyze_debate.py -v`
Expected: PASS (tous, ~13 tests).

- [ ] **Step 5: Commit**

```bash
git add "backend/code python/analyze_debate.py" backend/tests/test_analyze_debate.py
git commit -m "feat(analyze): validateurs frame/events/tension/kf/concepts"
```

---

### Task 3: Helper Gemini (client + appel JSON validé)

**Files:**
- Modify: `backend/code python/analyze_debate.py`
- Test: `backend/tests/test_analyze_debate.py`

**Interfaces:**
- Consumes: `_load_api_key`, `_make_client` de `correct_transcript` (réutilisés, DRY).
- Produces:
  - `_parse_json(raw: str) -> object | None` — strip des fences ```` ``` ````, `json.loads`, `None` si échec.
  - `_call_validated(client, prompt: str, validator, retries: int = 2) -> object | None` — appelle `client.models.generate_content(model=MODEL, contents=prompt)`, parse, applique `validator(parsed)` (callable `obj -> bool`), retourne le parsed validé ou `None` après `retries` tentatives. Toute exception → tentative suivante.
  - `_segments_to_text(segments: list[dict]) -> str` — transcript compact `"[mm:ss] speaker: text"` par ligne (ignore `refused`/`[?]`? non : on garde tout pour le contexte, mais on préfixe les refused par `[non enregistré]`).

- [ ] **Step 1: Écrire les tests qui échouent**

```python
# Ajouter à backend/tests/test_analyze_debate.py

def test_parse_json_strips_fences():
    from analyze_debate import _parse_json
    assert _parse_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert _parse_json('{"b": 2}') == {"b": 2}
    assert _parse_json('pas du json') is None


def test_call_validated_retries_then_succeeds():
    from analyze_debate import _call_validated
    client = MagicMock()
    bad = MagicMock(); bad.text = "oops"
    good = MagicMock(); good.text = '{"ok": true}'
    client.models.generate_content.side_effect = [bad, good]
    result = _call_validated(client, "prompt", validator=lambda o: o.get("ok") is True)
    assert result == {"ok": True}
    assert client.models.generate_content.call_count == 2


def test_call_validated_gives_up_after_retries():
    from analyze_debate import _call_validated
    client = MagicMock()
    resp = MagicMock(); resp.text = '{"ok": false}'
    client.models.generate_content.return_value = resp
    result = _call_validated(client, "prompt", validator=lambda o: o.get("ok") is True, retries=2)
    assert result is None


def test_segments_to_text():
    from analyze_debate import _segments_to_text
    txt = _segments_to_text(SEGMENTS[:2])
    assert "[00:00] Modérateur:" in txt
    assert "[01:00] Interlocuteur 1:" in txt
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run : `python -m pytest tests/test_analyze_debate.py -k "parse_json or call_validated or segments_to_text" -v`
Expected: FAIL — import errors.

- [ ] **Step 3: Implémenter le helper Gemini**

```python
# Ajouter à backend/code python/analyze_debate.py
# (en haut, après les imports existants)
from correct_transcript import _load_api_key, _make_client


def _parse_json(raw: str):
    try:
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        return json.loads(raw)
    except (json.JSONDecodeError, IndexError, AttributeError):
        return None


def _call_validated(client, prompt: str, validator, retries: int = 2):
    for attempt in range(retries):
        try:
            response = client.models.generate_content(model=MODEL, contents=prompt)
            parsed = _parse_json(response.text)
            if parsed is not None and validator(parsed):
                return parsed
        except Exception as exc:
            print(f"  Appel Gemini échoué (tentative {attempt + 1}/{retries}) : {exc}", file=sys.stderr)
            continue
        print(f"  Réponse Gemini rejetée (tentative {attempt + 1}/{retries}).", file=sys.stderr)
    return None


def _segments_to_text(segments: list[dict]) -> str:
    lines = []
    for s in segments:
        m, sec = int(s["start"] // 60), int(s["start"] % 60)
        prefix = "[non enregistré] " if s.get("refused") else ""
        lines.append(f"[{m:02d}:{sec:02d}] {s['speaker']}: {prefix}{s['text']}")
    return "\n".join(lines)
```

- [ ] **Step 4: Lancer pour vérifier le succès**

Run : `python -m pytest tests/test_analyze_debate.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "backend/code python/analyze_debate.py" backend/tests/test_analyze_debate.py
git commit -m "feat(analyze): helper Gemini appel JSON validé + transcript compact"
```

---

### Task 4: Passe 1 — Cadre + voix (axes, schools, positions)

**Files:**
- Modify: `backend/code python/analyze_debate.py`
- Test: `backend/tests/test_analyze_debate.py`

**Interfaces:**
- Consumes: `_call_validated`, `_segments_to_text`, `validate_frame`, `compute_voices`.
- Produces:
  - `build_frame_prompt(transcript: str, voices: list[dict], meta: dict) -> str`
  - `run_frame(client, transcript: str, voices: list[dict], meta: dict) -> dict | None` → `{axes, schools, personas_interp}` validé, ou `None`.

- [ ] **Step 1: Écrire le test qui échoue**

```python
# Ajouter à backend/tests/test_analyze_debate.py

FRAME_RESPONSE = json.dumps({
    "axes": {
        "x": {"leftLabel": "Liberté", "rightLabel": "Égalité"},
        "y": {"bottomLabel": "Technique", "topLabel": "Principes"},
        "quadrants": {"topLeft": "a", "topRight": "b", "bottomLeft": "c", "bottomRight": "d"},
    },
    "personas_interp": {
        "i1": {"camp": "Libéral", "note": "Constance", "pos": [-8, 6]},
        "i2": {"camp": "Solidariste", "note": "Égalité", "pos": [7, 2]},
        "anim": {"camp": "Méta", "note": "Protocole", "pos": [0, 4]},
    },
    "schools": [{"id": "lib", "label": "Libéraux", "cx": -8, "cy": 6, "rx": 2, "ry": 2, "members": ["i1"]}],
})


def test_run_frame_ok():
    from analyze_debate import run_frame, compute_voices
    voices = compute_voices(SEGMENTS)
    client = MagicMock()
    resp = MagicMock(); resp.text = FRAME_RESPONSE
    client.models.generate_content.return_value = resp
    frame = run_frame(client, "transcript", voices, {"topic": "Retraites"})
    assert frame["axes"]["x"]["leftLabel"] == "Liberté"
    assert "i1" in frame["personas_interp"]


def test_run_frame_rejects_invented_voice():
    from analyze_debate import run_frame, compute_voices
    voices = compute_voices(SEGMENTS)
    bad = json.dumps({
        "axes": {"x": {"leftLabel": "a", "rightLabel": "b"},
                 "y": {"bottomLabel": "c", "topLabel": "d"},
                 "quadrants": {"topLeft": "a", "topRight": "b", "bottomLeft": "c", "bottomRight": "d"}},
        "personas_interp": {"i77": {"camp": "X", "note": "y", "pos": [0, 0]}},
        "schools": [],
    })
    client = MagicMock()
    resp = MagicMock(); resp.text = bad
    client.models.generate_content.return_value = resp
    assert run_frame(client, "transcript", voices, {"topic": "X"}) is None
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run : `python -m pytest tests/test_analyze_debate.py -k run_frame -v`
Expected: FAIL — import error.

- [ ] **Step 3: Implémenter la passe 1**

```python
# Ajouter à backend/code python/analyze_debate.py

def build_frame_prompt(transcript: str, voices: list[dict], meta: dict) -> str:
    voice_lines = "\n".join(
        f'- {v["id"]} = {v["label"]} (poids parole {v["weight"]}, entre à {v["entry"]} min)'
        for v in voices
    )
    return f"""Tu es un analyste politique. Voici la transcription d'un débat oral sur « {meta.get("topic", "")} ».

Voix identifiées (utilise EXACTEMENT ces id, n'en invente AUCUN autre, n'écris JAMAIS de prénom réel) :
{voice_lines}

Ta tâche : poser le CADRE idéologique propre à CE débat et y placer chaque voix.

1. Trouve les DEUX axes qui structurent le mieux ce débat précis. Axe x et axe y, échelle -10 à +10.
   Donne un label court à chaque extrémité (leftLabel/rightLabel pour x, bottomLabel/topLabel pour y),
   et un descripteur court à chacun des 4 quadrants.
2. Place chaque voix à sa position de FIN de débat : pos = [x, y], x et y entre -10 et +10.
   Donne aussi un "camp" (étiquette courte de sa posture) et une "note" (1 phrase d'analyse).
3. Regroupe les voix proches en "écoles" : pour chaque école un id court (ex. "lib", "sol"),
   un label, un centre cx/cy (entre -10 et 10), des demi-axes rx/ry (1 à 3), et la liste members (des id de voix).

Réponds UNIQUEMENT avec ce JSON, sans commentaire :
{{
  "axes": {{
    "x": {{"leftLabel": "...", "rightLabel": "..."}},
    "y": {{"bottomLabel": "...", "topLabel": "..."}},
    "quadrants": {{"topLeft": "...", "topRight": "...", "bottomLeft": "...", "bottomRight": "..."}}
  }},
  "personas_interp": {{ "<id>": {{"camp": "...", "note": "...", "pos": [x, y]}} }},
  "schools": [ {{"id": "...", "label": "...", "cx": 0, "cy": 0, "rx": 2, "ry": 2, "members": ["<id>"]}} ]
}}

Transcription :
{transcript}"""


def run_frame(client, transcript: str, voices: list[dict], meta: dict) -> dict | None:
    voice_ids = {v["id"] for v in voices}
    prompt = build_frame_prompt(transcript, voices, meta)
    return _call_validated(client, prompt, lambda o: validate_frame(o, voice_ids))
```

- [ ] **Step 4: Lancer pour vérifier le succès**

Run : `python -m pytest tests/test_analyze_debate.py -k run_frame -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "backend/code python/analyze_debate.py" backend/tests/test_analyze_debate.py
git commit -m "feat(analyze): passe 1 cadre idéologique + positions des voix"
```

---

### Task 5: Passe 2 — Events + tension

**Files:**
- Modify: `backend/code python/analyze_debate.py`
- Test: `backend/tests/test_analyze_debate.py`

**Interfaces:**
- Consumes: `_call_validated`, `validate_events`, `validate_tension`.
- Produces:
  - `build_timeline_prompt(transcript: str, meta: dict) -> str`
  - `run_timeline(client, transcript: str, meta: dict) -> dict | None` → `{events, tension}` validé, ou `None`. Le validateur combiné exige les deux clés valides.

- [ ] **Step 1: Écrire le test qui échoue**

```python
# Ajouter à backend/tests/test_analyze_debate.py

TIMELINE_RESPONSE = json.dumps({
    "events": [
        {"t": 1, "type": "cadrage", "magnitude": 2, "title": "Doxa", "desc": "Énoncé initial."},
        {"t": 16, "type": "dissensus", "magnitude": 3, "title": "Conflit", "desc": "Liberté vs égalité."},
    ],
    "tension": [[0, 40], [16, 75], [10, 50]],  # volontairement non trié pour tester le tri
})


def test_run_timeline_ok_and_sorts_tension():
    from analyze_debate import run_timeline
    client = MagicMock()
    resp = MagicMock(); resp.text = TIMELINE_RESPONSE
    client.models.generate_content.return_value = resp
    out = run_timeline(client, "transcript", {"totalDurationMinutes": 85})
    assert len(out["events"]) == 2
    # la tension doit être triée par t croissant avant validation/sortie
    ts = [p[0] for p in out["tension"]]
    assert ts == sorted(ts)


def test_run_timeline_rejects_bad_event_type():
    from analyze_debate import run_timeline
    bad = json.dumps({"events": [{"t": 1, "type": "zzz", "magnitude": 1, "title": "T", "desc": "D"}],
                      "tension": [[0, 40], [85, 30]]})
    client = MagicMock()
    resp = MagicMock(); resp.text = bad
    client.models.generate_content.return_value = resp
    assert run_timeline(client, "transcript", {"totalDurationMinutes": 85}) is None
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run : `python -m pytest tests/test_analyze_debate.py -k run_timeline -v`
Expected: FAIL.

- [ ] **Step 3: Implémenter la passe 2**

```python
# Ajouter à backend/code python/analyze_debate.py

def build_timeline_prompt(transcript: str, meta: dict) -> str:
    duration = meta.get("totalDurationMinutes", 0)
    return f"""Tu analyses la dynamique temporelle d'un débat oral de {duration} minutes sur « {meta.get("topic", "")} ».

Produis deux choses :

1. "events" : les points de bascule du débat, horodatés. Pour chacun :
   - t : minute (entre 0 et {duration})
   - type : un parmi "cadrage", "technique", "dissensus", "consensus", "concession", "meta"
   - magnitude : 1, 2 ou 3 (importance)
   - title : titre court
   - desc : une phrase de description
   Vise 8 à 15 events bien répartis.

2. "tension" : une courbe d'intensité conflictuelle, liste de [minute, valeur] avec valeur de 0
   (apaisement/consensus) à 100 (dissensus fort), échantillonnée régulièrement, t croissant,
   du début (0) à la fin ({duration}).

Réponds UNIQUEMENT avec ce JSON :
{{"events": [{{"t": 0, "type": "...", "magnitude": 1, "title": "...", "desc": "..."}}],
  "tension": [[0, 40], [{duration}, 30]]}}

Transcription :
{transcript}"""


def run_timeline(client, transcript: str, meta: dict) -> dict | None:
    duration = meta.get("totalDurationMinutes", 0) or 1e9

    def _validate(o):
        if not isinstance(o, dict) or "events" not in o or "tension" not in o:
            return False
        o["tension"] = sorted(o["tension"], key=lambda p: p[0])
        return validate_events(o["events"], duration) and validate_tension(o["tension"], duration)

    prompt = build_timeline_prompt(transcript, meta)
    return _call_validated(client, prompt, _validate)
```

- [ ] **Step 4: Lancer pour vérifier le succès**

Run : `python -m pytest tests/test_analyze_debate.py -k run_timeline -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "backend/code python/analyze_debate.py" backend/tests/test_analyze_debate.py
git commit -m "feat(analyze): passe 2 events + courbe de tension"
```

---

### Task 6: Passe 3 — Trajectoires (kf), ancrées aux events

**Files:**
- Modify: `backend/code python/analyze_debate.py`
- Test: `backend/tests/test_analyze_debate.py`

**Interfaces:**
- Consumes: `_call_validated`, `validate_kf`. A besoin des positions finales (passe 1) et des events (passe 2).
- Produces:
  - `build_traj_prompt(transcript, voices, personas_interp, events, meta) -> str`
  - `run_trajectories(client, transcript, voices, personas_interp, events, meta) -> dict | None` → `{ "<id>": [[t,x,y],...] }`. Chaque kf validée individuellement par `validate_kf` (avec l'`entry` calculé et la `pos` finale de la passe 1). Une voix dont la kf échoue est **omise** (la trajectoire de cette voix sera dégradée à un point statique à l'assemblage). Retourne `None` seulement si la réponse est inexploitable (aucune kf valide).

- [ ] **Step 1: Écrire le test qui échoue**

```python
# Ajouter à backend/tests/test_analyze_debate.py

def _traj_setup():
    from analyze_debate import compute_voices
    voices = compute_voices(SEGMENTS)
    personas_interp = {
        "i1": {"camp": "Libéral", "note": "x", "pos": [-8, 6]},
        "i2": {"camp": "Solidariste", "note": "y", "pos": [7, 1.5]},
        "anim": {"camp": "Méta", "note": "z", "pos": [0, 4]},
    }
    events = [{"t": 16, "type": "dissensus", "magnitude": 2, "title": "T", "desc": "D"}]
    return voices, personas_interp, events


def test_run_trajectories_keeps_valid_kf():
    from analyze_debate import run_trajectories
    voices, personas_interp, events = _traj_setup()
    # i1 entre à 1.0 min, finale [-8,6] ; i2 entre à 3.0, finale [7,1.5] ; anim entre à 0.0, finale [0,4]
    response = json.dumps({
        "i1":   [[1.0, -8, 6], [16, -7, 6], [10.0, -8, 6]],
        "i2":   [[3.0, 7, 3], [40, 7, 2], [10.0, 7, 1.5]],
        "anim": [[0.0, 0, 4], [10.0, 0, 4]],
    })
    client = MagicMock()
    resp = MagicMock(); resp.text = response
    client.models.generate_content.return_value = resp
    out = run_trajectories(client, "transcript", voices, personas_interp, events, {"totalDurationMinutes": 10})
    assert set(out.keys()) == {"i1", "i2", "anim"}
    # les kf sont triées par t et finissent à la position finale
    assert out["i1"][0][0] <= out["i1"][-1][0]


def test_run_trajectories_omits_bad_kf():
    from analyze_debate import run_trajectories
    voices, personas_interp, events = _traj_setup()
    response = json.dumps({
        "i1":   [[1.0, -8, 6], [3, 8, -8], [10.0, -8, 6]],  # saut énorme → rejeté
        "anim": [[0.0, 0, 4], [10.0, 0, 4]],                # ok
    })
    client = MagicMock()
    resp = MagicMock(); resp.text = response
    client.models.generate_content.return_value = resp
    out = run_trajectories(client, "transcript", voices, personas_interp, events, {"totalDurationMinutes": 10})
    assert "i1" not in out
    assert "anim" in out
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run : `python -m pytest tests/test_analyze_debate.py -k run_trajectories -v`
Expected: FAIL.

- [ ] **Step 3: Implémenter la passe 3**

```python
# Ajouter à backend/code python/analyze_debate.py

def build_traj_prompt(transcript, voices, personas_interp, events, meta) -> str:
    duration = meta.get("totalDurationMinutes", 0)
    voice_lines = "\n".join(
        f'- {v["id"]} : entre à {v["entry"]} min, position FINALE = {personas_interp[v["id"]]["pos"]}'
        for v in voices if v["id"] in personas_interp
    )
    event_lines = "\n".join(f'- {e["t"]} min : {e["title"]} ({e["type"]})' for e in events)
    return f"""Tu traces la trajectoire d'opinion de chaque voix au fil d'un débat de {duration} minutes.

IMPORTANT — c'est un débat de CRISTALLISATION : les positions de fond bougent PEU.
Ne fabrique PAS de grands mouvements. Rends lisibles de PETITS glissements ancrés sur les
moments de bascule. Un déplacement de plus de {MAX_KF_AMP} points entre deux instants proches
sera rejeté.

Voix (commence chaque trajectoire à la minute d'entrée, termine EXACTEMENT à la position finale donnée) :
{voice_lines}

Moments de bascule à utiliser comme ancrages temporels :
{event_lines}

Pour chaque voix, donne une liste de keyframes [minute, x, y], minute croissante, de l'entrée
jusqu'à {duration}, x et y entre -10 et +10. Le premier point est à la minute d'entrée, le
dernier est la position finale.

Réponds UNIQUEMENT avec ce JSON : {{ "<id>": [[minute, x, y], ...] }}

Transcription :
{transcript}"""


def run_trajectories(client, transcript, voices, personas_interp, events, meta) -> dict | None:
    entries = {v["id"]: v["entry"] for v in voices}
    finals = {vid: p["pos"] for vid, p in personas_interp.items()}

    def _validate(o):
        # On accepte tant que c'est un dict ; le filtrage par voix se fait après.
        return isinstance(o, dict) and len(o) > 0

    prompt = build_traj_prompt(transcript, voices, personas_interp, events, meta)
    raw = _call_validated(client, prompt, _validate)
    if raw is None:
        return None
    kept = {}
    for vid, kf in raw.items():
        if vid not in entries or vid not in finals:
            continue
        try:
            kf = sorted(kf, key=lambda p: p[0])
        except (TypeError, IndexError):
            continue
        if validate_kf(kf, entries[vid], finals[vid]):
            kept[vid] = kf
    return kept or None
```

- [ ] **Step 4: Lancer pour vérifier le succès**

Run : `python -m pytest tests/test_analyze_debate.py -k run_trajectories -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "backend/code python/analyze_debate.py" backend/tests/test_analyze_debate.py
git commit -m "feat(analyze): passe 3 trajectoires kf bornées + ancrées aux events"
```

---

### Task 7: Passe 4 — Réseau conceptuel

**Files:**
- Modify: `backend/code python/analyze_debate.py`
- Test: `backend/tests/test_analyze_debate.py`

**Interfaces:**
- Consumes: `_call_validated`, `validate_concepts`.
- Produces:
  - `build_concepts_prompt(transcript, schools, voices, meta) -> str`
  - `run_concepts(client, transcript, schools, voices, meta) -> dict | None` → objet `concepts` `{regular, fauxConsensus, gordian, consensus, concessions}` validé, ou `None`.

- [ ] **Step 1: Écrire le test qui échoue**

```python
# Ajouter à backend/tests/test_analyze_debate.py

CONCEPTS_RESPONSE = json.dumps({
    "regular": ["Mérite", "Démographie"],
    "fauxConsensus": [{"concept": "Liberté", "senseA": "négative", "campA": "lib", "senseB": "positive", "campB": "sol"}],
    "gordian": [{"concept": "Redistribution", "poleA": "vol", "campA": "lib", "poleB": "assurance", "campB": "sol", "why": "définition"}],
    "consensus": [{"label": "Choc démographique", "t": 6, "scope": "tous"}],
    "concessions": [{"by": "lib", "t": 23, "label": "minimum privé", "targetConcept": "Liberté"}],
})

SCHOOLS_FIXT = [
    {"id": "lib", "label": "Libéraux", "cx": -8, "cy": 6, "rx": 2, "ry": 2, "members": ["i1"]},
    {"id": "sol", "label": "Solidaristes", "cx": 7, "cy": 2, "rx": 2, "ry": 2, "members": ["i2"]},
]


def test_run_concepts_ok():
    from analyze_debate import run_concepts, compute_voices
    voices = compute_voices(SEGMENTS)
    client = MagicMock()
    resp = MagicMock(); resp.text = CONCEPTS_RESPONSE
    client.models.generate_content.return_value = resp
    out = run_concepts(client, "transcript", SCHOOLS_FIXT, voices, {"topic": "X"})
    assert out["fauxConsensus"][0]["campA"] == "lib"


def test_run_concepts_rejects_unknown_camp():
    from analyze_debate import run_concepts, compute_voices
    voices = compute_voices(SEGMENTS)
    bad = json.dumps({"regular": [], "fauxConsensus": [
        {"concept": "X", "senseA": "a", "campA": "ZZZ", "senseB": "b", "campB": "sol"}],
        "gordian": [], "consensus": [], "concessions": []})
    client = MagicMock()
    resp = MagicMock(); resp.text = bad
    client.models.generate_content.return_value = resp
    assert run_concepts(client, "transcript", SCHOOLS_FIXT, voices, {"topic": "X"}) is None
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run : `python -m pytest tests/test_analyze_debate.py -k run_concepts -v`
Expected: FAIL.

- [ ] **Step 3: Implémenter la passe 4**

```python
# Ajouter à backend/code python/analyze_debate.py

def build_concepts_prompt(transcript, schools, voices, meta) -> str:
    school_lines = "\n".join(f'- {s["id"]} = {s["label"]}' for s in schools)
    return f"""Tu cartographies la structure conceptuelle d'un débat sur « {meta.get("topic", "")} ».

Camps/écoles disponibles (utilise EXACTEMENT ces id, aucun autre) :
{school_lines}

Produis un objet "concepts" avec :
- "regular" : liste de concepts simples mobilisés (juste des noms).
- "fauxConsensus" : les mots que tout le monde emploie mais avec des sens INCOMPATIBLES.
  Pour chacun : concept, senseA, campA (un id d'école), senseB, campB (un id d'école).
- "gordian" : les blocages irréconciliables. Pour chacun : concept, poleA, campA, poleB, campB, why.
- "consensus" : points stabilisés. Pour chacun : label, t (minute), scope (texte court).
- "concessions" : reculs datés. Pour chacun : by (un id d'école OU de voix), t (minute),
  label, targetConcept (DOIT être un concept cité plus haut dans regular/fauxConsensus/gordian).

Réponds UNIQUEMENT avec ce JSON :
{{"regular": [], "fauxConsensus": [], "gordian": [], "consensus": [], "concessions": []}}

Transcription :
{transcript}"""


def run_concepts(client, transcript, schools, voices, meta) -> dict | None:
    school_ids = {s["id"] for s in schools}
    voice_ids = {v["id"] for v in voices}
    prompt = build_concepts_prompt(transcript, schools, voices, meta)
    return _call_validated(client, prompt, lambda o: validate_concepts(o, school_ids, voice_ids))
```

- [ ] **Step 4: Lancer pour vérifier le succès**

Run : `python -m pytest tests/test_analyze_debate.py -k run_concepts -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "backend/code python/analyze_debate.py" backend/tests/test_analyze_debate.py
git commit -m "feat(analyze): passe 4 réseau conceptuel (faux consensus, gordian)"
```

---

### Task 8: Assemblage + écriture `data.js` (dégradation gracieuse)

**Files:**
- Modify: `backend/code python/analyze_debate.py`
- Test: `backend/tests/test_analyze_debate.py`

**Interfaces:**
- Consumes: tous les résultats de passes + champs calculés.
- Produces:
  - `merge_personas(voices, personas_interp, kf_map) -> list[dict]` — fusionne chaque voix calculée avec `camp/note/color` + `kf`. Si une voix n'a pas de `kf` valide, lui donner une kf statique `[[entry, x, y], [duration, x, y]]` à partir de sa pos finale (dégradation). Une voix absente de `personas_interp` est omise (pas de position → non plaçable).
  - `assemble_data(meta, frame, personas, timeline, refus, concepts) -> dict` — construit le dict `DEBATE_DATA`. `frame`/`timeline`/`concepts` peuvent être `None` → la section correspondante est omise (clé absente).
  - `write_data_js(data: dict, path: Path) -> None` — écrit `const DEBATE_DATA = <json indenté>;\n` précédé d'un commentaire d'en-tête.

- [ ] **Step 1: Écrire le test qui échoue**

```python
# Ajouter à backend/tests/test_analyze_debate.py

def test_merge_personas_static_fallback_when_no_kf():
    from analyze_debate import compute_voices, merge_personas
    voices = compute_voices(SEGMENTS)
    interp = {"i1": {"camp": "Lib", "note": "n", "pos": [-8, 6]}}
    personas = merge_personas(voices, interp, kf_map={}, duration=10.0)
    p = {x["id"]: x for x in personas}
    assert "i1" in p
    assert "i2" not in p  # pas de position → omise
    # kf statique : début à entry, fin à durée, même position
    assert p["i1"]["kf"][0] == [p["i1"]["entry"], -8, 6]
    assert p["i1"]["kf"][-1] == [10.0, -8, 6]
    assert p["i1"]["camp"] == "Lib"


def test_assemble_data_omits_failed_passes():
    from analyze_debate import assemble_data
    data = assemble_data(
        meta={"topic": "X", "totalDurationMinutes": 10, "totalRedactedMinutes": 1},
        frame={"axes": {"x": {}}, "schools": [], "personas_interp": {}},
        personas=[{"id": "i1", "kf": [[0, 0, 0]]}],
        timeline=None,          # passe 2 échouée
        refus=[[4.0, 5.3]],
        concepts=None,          # passe 4 échouée
    )
    assert "axes" in data
    assert "events" not in data and "tension" not in data
    assert "concepts" not in data
    assert data["refus"] == [[4.0, 5.3]]
    assert data["meta"]["topic"] == "X"


def test_write_data_js(tmp_path):
    from analyze_debate import write_data_js
    path = tmp_path / "data.js"
    write_data_js({"meta": {"topic": "X"}}, path)
    content = path.read_text(encoding="utf-8")
    assert content.startswith("//")
    assert "const DEBATE_DATA =" in content
    assert content.rstrip().endswith(";")
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run : `python -m pytest tests/test_analyze_debate.py -k "merge_personas or assemble_data or write_data_js" -v`
Expected: FAIL.

- [ ] **Step 3: Implémenter l'assemblage**

```python
# Ajouter à backend/code python/analyze_debate.py

def merge_personas(voices, personas_interp, kf_map, duration) -> list[dict]:
    personas = []
    for v in voices:
        interp = personas_interp.get(v["id"])
        if interp is None:
            continue  # pas de position → non plaçable
        x, y = interp["pos"]
        kf = kf_map.get(v["id"]) or [[v["entry"], x, y], [duration, x, y]]
        personas.append({
            "id": v["id"], "label": v["label"], "camp": interp["camp"],
            "color": v["color"], "weight": v["weight"], "entry": v["entry"],
            "kf": kf, "note": interp["note"],
        })
    return personas


def assemble_data(meta, frame, personas, timeline, refus, concepts) -> dict:
    data = {"meta": meta, "personas": personas, "refus": refus,
            "totalRedactedMinutes": meta["totalRedactedMinutes"],
            "totalDurationMinutes": meta["totalDurationMinutes"]}
    if frame is not None:
        data["axes"] = frame["axes"]
        data["schools"] = frame["schools"]
    if timeline is not None:
        data["events"] = timeline["events"]
        data["tension"] = timeline["tension"]
    if concepts is not None:
        data["concepts"] = concepts
    return data


def write_data_js(data: dict, path: Path) -> None:
    header = ("// data.js — généré par analyze_debate.py (analyse Gemini)\n"
              "// Coordonnées interprétatives, pas des mesures objectives.\n\n")
    body = json.dumps(data, ensure_ascii=False, indent=2)
    path.write_text(f"{header}const DEBATE_DATA = {body};\n", encoding="utf-8")
```

- [ ] **Step 4: Lancer pour vérifier le succès**

Run : `python -m pytest tests/test_analyze_debate.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "backend/code python/analyze_debate.py" backend/tests/test_analyze_debate.py
git commit -m "feat(analyze): assemblage data.js + dégradation gracieuse par passe"
```

---

### Task 9: Template HTML généralisé (header + onglets pilotés par les données)

**Files:**
- Create: `backend/code python/viz_template/index.html` (copie de `Visualisation prises de positions/index.html` + 4 edits)
- Test: `backend/tests/test_analyze_debate.py` (vérif présence du template + marqueurs)

**Interfaces:**
- Produces: un template autonome qui lit `DEBATE_DATA.meta` pour le titre/header, et masque les onglets dont les données sont absentes (`events`/`tension` → v3 ; `concepts` → v4 ; `sankey` → v5 ; positions vides → v2).

- [ ] **Step 1: Copier le fichier existant vers le template**

```bash
mkdir -p "backend/code python/viz_template"
cp "Visualisation prises de positions/index.html" "backend/code python/viz_template/index.html"
```

- [ ] **Step 2: Edit 1 — titre dynamique.** Dans `viz_template/index.html`, remplacer la ligne 6 :

```html
<title>Débat Retraites — Visualisation idéologique</title>
```
par :
```html
<title>Visualisation idéologique</title>
```

- [ ] **Step 3: Edit 2 — header piloté par meta.** Remplacer le bloc `<header>…</header>` (≈ lignes 176-179) :

```html
<header>
  <h1>Débat sur les retraites — Cartographie idéologique</h1>
  <p>Données interprétatives · Reconstruction par analyse de transcription</p>
</header>
```
par :
```html
<header>
  <h1 id="hdr-title">Cartographie idéologique</h1>
  <p id="hdr-sub">Données interprétatives · Reconstruction par analyse de transcription</p>
</header>
```

- [ ] **Step 4: Edit 3 — masquage des onglets + titre, juste après `<script src="data.js"></script>`.** Insérer ce bloc immédiatement après la ligne `<script src="data.js"></script>` et avant le `<script>` suivant :

```html
<script>
// Header dynamique depuis meta + masquage des onglets sans données.
(function () {
  var m = (window.DEBATE_DATA && DEBATE_DATA.meta) || {};
  if (m.topic) {
    document.getElementById('hdr-title').textContent = 'Débat — ' + m.topic;
    document.title = 'Débat ' + (m.code || '') + ' — Visualisation idéologique';
  }
  function hasData(arr) { return Array.isArray(arr) && arr.length > 0; }
  var present = {
    v1: hasData(DEBATE_DATA.personas),
    v2: hasData(DEBATE_DATA.personas) && DEBATE_DATA.personas.some(function (p) { return hasData(p.kf); }),
    v3: hasData(DEBATE_DATA.events) && hasData(DEBATE_DATA.tension),
    v4: DEBATE_DATA.concepts && (hasData(DEBATE_DATA.concepts.fauxConsensus) || hasData(DEBATE_DATA.concepts.gordian)),
    v5: DEBATE_DATA.sankey && hasData(DEBATE_DATA.sankey.nodes)
  };
  window.__VIZ_PRESENT = present;
  Object.keys(present).forEach(function (k) {
    if (!present[k]) {
      var btn = document.querySelector('nav.tabs button[data-tab="' + k + '"]');
      var panel = document.getElementById('tab-' + k);
      if (btn) btn.style.display = 'none';
      if (panel) panel.classList.remove('active');
    }
  });
})();
</script>
```

- [ ] **Step 5: Edit 4 — garder les dessins initiaux défensifs.** À la toute fin du `<script>` principal (bloc `// INIT`, ≈ lignes 1209-1213), remplacer :

```javascript
drawV1();
drawV2();
drawV3Mini();
drawV3(document.getElementById('v3-container'), 480);
initializedTabs.add('v3');
```
par :
```javascript
var P = window.__VIZ_PRESENT || {};
if (P.v1) drawV1();
if (P.v2) { drawV2(); drawV3Mini(); }
if (P.v3) { drawV3(document.getElementById('v3-container'), 480); initializedTabs.add('v3'); }
// Activer le premier onglet réellement présent.
(function () {
  var order = ['v1', 'v2', 'v3', 'v4', 'v5'];
  var first = order.find(function (k) { return P[k]; });
  if (!first) return;
  document.querySelectorAll('nav.tabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === first); });
  document.querySelectorAll('section.tab-panel').forEach(function (p) { p.classList.toggle('active', p.id === 'tab-' + first); });
  if (first === 'v3' && !initializedTabs.has('v3')) { drawV3(document.getElementById('v3-container'), 480); initializedTabs.add('v3'); }
  if (first === 'v4') { drawV4(); initializedTabs.add('v4'); }
})();
```

> Note : `drawV3Mini` n'est appelé que si v2 est présent (il vit dans le panneau v2). `drawV2` doit déjà ignorer les voix sans kf via `lerp` ; aucune voix sans position n'existe (filtrées à l'assemblage).

- [ ] **Step 6: Test — le template existe et porte les marqueurs**

```python
# Ajouter à backend/tests/test_analyze_debate.py

def test_viz_template_exists_and_generalized():
    template = Path(__file__).parent.parent / "code python" / "viz_template" / "index.html"
    assert template.exists()
    html = template.read_text(encoding="utf-8")
    assert 'id="hdr-title"' in html
    assert "__VIZ_PRESENT" in html
    assert "Débat sur les retraites" not in html  # plus de titre en dur
```

- [ ] **Step 7: Lancer pour vérifier le succès**

Run : `python -m pytest tests/test_analyze_debate.py -k viz_template -v`
Expected: PASS.

- [ ] **Step 8: Vérification visuelle manuelle (non bloquante)**

Copier temporairement le `data.js` de référence à côté du template et l'ouvrir dans un navigateur :
```bash
cp "Visualisation prises de positions/data.js" "backend/code python/viz_template/data.js"
```
Ouvrir `backend/code python/viz_template/index.html` : les 5 onglets s'affichent (le data.js de référence a toutes les sections + sankey). Puis **supprimer** ce `data.js` de test :
```bash
rm "backend/code python/viz_template/data.js"
```

- [ ] **Step 9: Commit**

```bash
git add "backend/code python/viz_template/index.html" backend/tests/test_analyze_debate.py
git commit -m "feat(viz): template généralisé header/onglets pilotés par data.js"
```

---

### Task 10: Orchestration `analyze()` + CLI + écriture `viz/`

**Files:**
- Modify: `backend/code python/analyze_debate.py`
- Test: `backend/tests/test_analyze_debate.py`

**Interfaces:**
- Consumes: toutes les fonctions précédentes ; `_load_api_key`, `_make_client`.
- Produces:
  - `write_viz(data: dict, viz_dir: Path) -> None` — crée `viz_dir`, écrit `data.js`, copie `viz_template/index.html` → `viz_dir/index.html`.
  - `analyze(json_path: Path, topic: str, code: str, date: str, client=None) -> bool` — pipeline complet. `client=None` → en crée un via `_make_client(_load_api_key())` ; si pas de clé → message + `False`. Écrit `json_path.parent / "viz"`. Retourne `True` si `data.js` écrit (même avec passes dégradées).
  - `main()` — `argv[1]` = chemin du `*_corrected.json` ; dérive `topic` = `parent.parent.name`, `code` = `parent.name`, `date` depuis le nom de fichier (`<code>_<date>_corrected.json`).

- [ ] **Step 1: Écrire le test qui échoue**

```python
# Ajouter à backend/tests/test_analyze_debate.py

def test_analyze_end_to_end_writes_viz(tmp_path):
    from analyze_debate import analyze
    debate_dir = tmp_path / "Retraites" / "0F6A9E"
    debate_dir.mkdir(parents=True)
    json_path = debate_dir / "0F6A9E_2026-05-28_corrected.json"
    json_path.write_text(json.dumps(SEGMENTS), encoding="utf-8")

    # Client mocké : retourne tour à tour frame, timeline, trajectoires, concepts.
    client = MagicMock()
    frame_r = MagicMock(); frame_r.text = FRAME_RESPONSE
    timeline_r = MagicMock(); timeline_r.text = TIMELINE_RESPONSE
    traj_r = MagicMock(); traj_r.text = json.dumps({
        "i1": [[1.0, -8, 6], [10.0, -8, 6]],
        "i2": [[3.0, 7, 1.5], [10.0, 7, 1.5]],
        "anim": [[0.0, 0, 4], [10.0, 0, 4]],
    })
    concepts_r = MagicMock(); concepts_r.text = CONCEPTS_RESPONSE
    client.models.generate_content.side_effect = [frame_r, timeline_r, traj_r, concepts_r]

    ok = analyze(json_path, "Retraites", "0F6A9E", "2026-05-28", client=client)
    assert ok is True
    viz = debate_dir / "viz"
    assert (viz / "data.js").exists()
    assert (viz / "index.html").exists()
    content = (viz / "data.js").read_text(encoding="utf-8")
    assert "const DEBATE_DATA" in content
    assert "Liberté" in content      # passe 1
    assert "Démographie" in content  # passe 4


def test_analyze_degrades_when_a_pass_fails(tmp_path):
    from analyze_debate import analyze
    debate_dir = tmp_path / "Retraites" / "0F6A9E"
    debate_dir.mkdir(parents=True)
    json_path = debate_dir / "0F6A9E_2026-05-28_corrected.json"
    json_path.write_text(json.dumps(SEGMENTS), encoding="utf-8")

    client = MagicMock()
    frame_r = MagicMock(); frame_r.text = FRAME_RESPONSE
    bad = MagicMock(); bad.text = "pas du json"  # timeline KO (2 tentatives)
    traj_r = MagicMock(); traj_r.text = json.dumps({"i1": [[1.0, -8, 6], [10.0, -8, 6]]})
    concepts_r = MagicMock(); concepts_r.text = CONCEPTS_RESPONSE
    # frame(1), timeline(2 essais), trajectoires(1), concepts(1)
    client.models.generate_content.side_effect = [frame_r, bad, bad, traj_r, concepts_r]

    ok = analyze(json_path, "Retraites", "0F6A9E", "2026-05-28", client=client)
    assert ok is True
    content = (debate_dir / "viz" / "data.js").read_text(encoding="utf-8")
    assert '"events"' not in content   # timeline omise
    assert '"axes"' in content         # frame présente
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run : `python -m pytest tests/test_analyze_debate.py -k analyze_ -v`
Expected: FAIL.

- [ ] **Step 3: Implémenter l'orchestration + CLI**

```python
# Ajouter à backend/code python/analyze_debate.py

_TEMPLATE = Path(__file__).parent / "viz_template" / "index.html"


def write_viz(data: dict, viz_dir: Path) -> None:
    viz_dir.mkdir(parents=True, exist_ok=True)
    write_data_js(data, viz_dir / "data.js")
    shutil.copyfile(_TEMPLATE, viz_dir / "index.html")


def analyze(json_path: Path, topic: str, code: str, date: str, client=None) -> bool:
    segments = json.loads(Path(json_path).read_text(encoding="utf-8"))
    voices = compute_voices(segments)
    if not voices:
        print("Aucune voix plaçable dans le transcript.", file=sys.stderr)
        return False
    refus, redacted, duration = compute_refus(segments)
    meta = build_meta(segments, topic, code, date, redacted, duration)
    transcript = _segments_to_text(segments)

    if client is None:
        api_key = _load_api_key()
        if not api_key:
            print("GEMINI_API_KEY absent — analyse impossible.", file=sys.stderr)
            return False
        client = _make_client(api_key)

    print("Passe 1/4 — cadre + voix...")
    frame = run_frame(client, transcript, voices, meta)
    print("Passe 2/4 — events + tension...")
    timeline = run_timeline(client, transcript, meta)

    kf_map = {}
    personas = []
    if frame is not None:
        interp = frame["personas_interp"]
        events = timeline["events"] if timeline else []
        print("Passe 3/4 — trajectoires...")
        kf_map = run_trajectories(client, transcript, voices, interp, events, meta) or {}
        personas = merge_personas(voices, interp, kf_map, duration)
        print("Passe 4/4 — réseau conceptuel...")
        concepts = run_concepts(client, transcript, frame["schools"], voices, meta)
    else:
        print("Passe 1 échouée — carte/réseau indisponibles, on garde ce qui peut l'être.", file=sys.stderr)
        concepts = None

    data = assemble_data(meta, frame, personas, timeline, refus, concepts)
    viz_dir = Path(json_path).parent / "viz"
    write_viz(data, viz_dir)
    print(f"Visualisation écrite : {viz_dir / 'index.html'}")
    return True


def main() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass

    if len(sys.argv) != 2:
        print("Usage: python analyze_debate.py <corrected_json_path>", file=sys.stderr)
        sys.exit(1)

    json_path = Path(sys.argv[1])
    if not json_path.exists():
        print(f"Fichier introuvable : {json_path}", file=sys.stderr)
        sys.exit(1)

    topic = json_path.parent.parent.name
    code = json_path.parent.name
    stem = json_path.name.replace("_corrected.json", "").replace(".json", "")
    date = stem.rsplit("_", 1)[-1] if "_" in stem else ""
    result = analyze(json_path, topic, code, date)
    sys.exit(0 if result else 1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Lancer pour vérifier le succès**

Run : `python -m pytest tests/test_analyze_debate.py -v`
Expected: PASS (toute la suite).

- [ ] **Step 5: Commit**

```bash
git add "backend/code python/analyze_debate.py" backend/tests/test_analyze_debate.py
git commit -m "feat(analyze): orchestration analyze() + CLI + écriture viz/"
```

---

### Task 11: Wiring `-Visualize` dans `run_transcription.ps1`

**Files:**
- Modify: `backend/run_transcription.ps1`

**Interfaces:**
- Consumes: `analyze_debate.py` (CLI). Trouve le `*_corrected.json` le plus récent dans `transcripts\<Topic>\<Code>\`.

- [ ] **Step 1: Ajouter le paramètre.** Dans le bloc `param(...)`, après la ligne `[switch]$EditNameMap, …`, ajouter :

```powershell
    [switch]$Visualize,                                   # génère viz/ (analyze_debate.py) après correction
```

- [ ] **Step 2: Ajouter l'étape après l'étape 2.** Dans le `try { … }`, juste après le bloc `Invoke-Step "Étape 2/2 …" $txArgs` et avant le `if (-not $DryRun) { … ✅ Terminé … }`, insérer :

```powershell
    # --- Étape optionnelle : visualisation ---
    if ($Visualize) {
        $vizDir = Join-Path $Backend "transcripts\$Topic\$Code"
        if ($DryRun) {
            Write-Host "=== Visualisation (DryRun) : analyze_debate.py sur le corrected.json le plus récent de $vizDir ===" -ForegroundColor Cyan
        } else {
            $corrected = Get-ChildItem -Path $vizDir -Filter "*_corrected.json" -ErrorAction SilentlyContinue |
                         Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if ($null -eq $corrected) {
                Write-Host "Aucun *_corrected.json trouvé dans $vizDir — visualisation ignorée." -ForegroundColor Yellow
            } else {
                Invoke-Step "Étape 3 — Visualisation (analyze_debate.py)" @("code python\analyze_debate.py", $corrected.FullName)
            }
        }
    }
```

- [ ] **Step 3: Mettre à jour la synthèse finale.** Remplacer le bloc final `if (-not $DryRun) { … }` par :

```powershell
    if (-not $DryRun) {
        Write-Host ""
        Write-Host "✅ Terminé. Fichiers dans : transcripts\$Topic\$Code\" -ForegroundColor Green
        Write-Host "   $($Code)_<date>_corrected.txt / .json  ← à utiliser" -ForegroundColor Green
        if ($Visualize) { Write-Host "   viz\index.html  ← dashboard de visualisation" -ForegroundColor Green }
    }
```

- [ ] **Step 4: Vérifier en DryRun (pas d'appel réel).**

Run (depuis `backend/`) :
```powershell
.\run_transcription.ps1 -Csv "x.csv" -Audio "x.mp3" -Code TEST -Topic "TEST" -Visualize -DryRun
```
Expected : la sortie liste les étapes 1, 2, et la ligne « Étape 3 — Visualisation (DryRun) ». (Le `-DryRun` n'exécute rien ; ignorer l'absence des fichiers x.csv/x.mp3 — les vérifs Test-Path peuvent throw avant ; si c'est le cas, créer des fichiers vides `x.csv`/`x.mp3` temporaires dans `backend/` pour ce smoke-test puis les supprimer.)

- [ ] **Step 5: Commit**

```bash
git add backend/run_transcription.ps1
git commit -m "feat(pipeline): switch -Visualize génère viz/ après correction"
```

---

### Task 12: Documentation `CLAUDE.md`

**Files:**
- Modify: `transcription-debat/CLAUDE.md`

- [ ] **Step 1: Structure.** Dans l'arbre `transcription-debat/` (section « Structure »), sous `code python/`, ajouter après la ligne `deduplicate.py …` :

```
    │   ├── analyze_debate.py        génère viz/ (data.js + index.html) par analyse Gemini étagée
    │   └── viz_template/index.html  template HTML généralisé (header/onglets pilotés par data.js)
```

Et sous `transcripts/<Thème>/<CODE>/`, mentionner le nouveau sous-dossier `viz/` (dashboard autonome).

- [ ] **Step 2: Table des tests.** Remplacer les deux mentions « 70 tests » / « 70 tests : … » par le nouveau total. Compter les tests ajoutés :

```bash
python -m pytest tests/test_analyze_debate.py --collect-only -q | tail -1
```
Mettre à jour : `… + analyze_debate (N)` et le total `70 → 70+N`, aux deux endroits (section « Structure » et section « Tests »).

- [ ] **Step 3: Pipeline d'attribution.** Dans le tableau « Pipeline d'attribution (détail) », ajouter une ligne finale après « Correction » :

```
| Visualisation (option) | `analyze_debate.py` | Analyse Gemini étagée (4 passes : cadre+voix, events+tension, trajectoires, réseau conceptuel) → `viz/data.js` + dashboard. Champs mesurables (poids, entrée, refus) calculés sans LLM. Dégradation gracieuse par passe. |
```

- [ ] **Step 4: Variable d'env + commande.** Dans « Prérequis » (bloc `.env`), ajouter une ligne :

```
  GEMINI_ANALYSIS_MODEL=...  # modèle de l'étape visualisation (défaut gemini-3.1-flash-lite)
```

Ajouter une sous-section « Générer les visualisations » après « Relancer seulement la correction Gemini » :

```markdown
### Générer la visualisation (option)
Via le pipeline complet :
```powershell
.\run_transcription.ps1 -Csv ... -Audio ... -Code <CODE> -Topic "<Thème>" -Visualize
```
Ou seule, sur un transcript déjà corrigé :
```powershell
.venv\Scripts\python "code python\analyze_debate.py" "transcripts\<Thème>\<CODE>\<CODE>_<DATE>_corrected.json"
# modèle ponctuel : $env:GEMINI_ANALYSIS_MODEL = "gemini-flash"
```
Produit `transcripts\<Thème>\<CODE>\viz\{index.html, data.js}`. Ré-exécutable seul si une passe a échoué (quota).
```

- [ ] **Step 5: Règles critiques.** Dans « Règles critiques (agent) », ajouter une puce :

```markdown
- **`analyze_debate.py`** : le LLM ne fait que de l'interprétation ; `weight`/`entry`/`refus`/durée sont calculés depuis le JSON, jamais demandés au LLM. Ne jamais lever le garde-fou anti-invention (le LLM ne référence que les `id` de voix calculés). `GEMINI_ANALYSIS_MODEL` distinct de `GEMINI_MODEL`. Le template `viz_template/index.html` doit rester piloté par `data.js` (header + masquage d'onglets).
```

- [ ] **Step 6: Vérifier la cohérence du compte de tests.**

Run : `python -m pytest tests/ -q | tail -3`
Expected: tous les tests passent ; le total correspond au chiffre noté dans `CLAUDE.md`.

- [ ] **Step 7: Commit**

```bash
git add transcription-debat/CLAUDE.md
git commit -m "docs(transcription): documente l'étape visualisation analyze_debate"
```

---

## Self-Review

**1. Couverture de la spec** (chaque section du spec → tâche) :
- §3 Architecture (module standalone + appelable, calcul vs LLM, ordre des passes) → Tasks 1,3,10. ✅
- §3 Dégradation gracieuse → Tasks 8,10 (tests dédiés). ✅
- §4 Schéma (calculé vs LLM, `meta`) → Tasks 1,4-8. ✅
- §5 Garde-fous (anti-invention, bornes, cohérence référentielle, kf bornée, palette imposée, JSON strict) → Task 2 (validateurs) + Tasks 4-7 (câblage) + Task 1 (palette). ✅
- §6 Template généralisé (header/onglets data-driven, source versionnée, maquette intacte) → Task 9. ✅
- §7 Intégration (CLI standalone, `-Visualize`, `GEMINI_ANALYSIS_MODEL`) → Tasks 10,11. ✅
- §8 Tests (calculs, validateurs, dégradation, assemblage) → présents dans chaque tâche. ✅
- §9 Documentation → Task 12. ✅
- §10 Hors périmètre (V5, galerie, React, semi-auto, axe commun) → non implémenté, conforme. ✅

**2. Placeholders** : aucun « TODO/TBD » ; tous les steps de code montrent le code réel ; prompts complets. La constante « N » du spec est matérialisée en `MAX_KF_AMP`/`MAX_KF_GAP` (Task 1) et testée (Task 2). ✅

**3. Cohérence des types** : `compute_voices` → `{id,label,weight,entry,color}` consommé tel quel par `run_frame`/`run_trajectories`/`merge_personas`. `frame` = `{axes,schools,personas_interp}` produit en Task 4, consommé identiquement en Tasks 6,8,10. `timeline` = `{events,tension}` (Task 5) consommé en Tasks 8,10. `concepts` objet (Task 7) consommé en Task 8. `kf_map` = `{id: [[t,x,y]]}` (Task 6) → `merge_personas` (Task 8). Noms de fonctions cohérents bout-à-bout. ✅

---

## Execution Handoff

Plan complet et sauvegardé. Deux options d'exécution :

1. **Subagent-Driven (recommandé)** — un subagent neuf par tâche, revue entre les tâches, itération rapide.
2. **Inline Execution** — exécution dans cette session avec checkpoints de revue.
