# backend/code python/analyze_debate.py
import json
import os
import re
import shutil
import sys
from pathlib import Path

from dotenv import load_dotenv
from correct_transcript import _load_api_key, _make_client

load_dotenv()

MODEL = os.getenv("GEMINI_ANALYSIS_MODEL", "gemini-3.1-flash-lite")
AXIS_MIN, AXIS_MAX = -10, 10
MODERATOR_COLOR = "#534AB7"
PALETTE = ["#D64545", "#0F8A6A", "#E09020", "#D85A30", "#639922",
           "#8FBF4B", "#6E6D68", "#9A9992", "#4A90D9", "#C0507A", "#3FA7A0"]
EVENT_TYPES = {"cadrage", "technique", "dissensus", "consensus", "concession", "meta"}
MAX_KF_AMP = 4.0
MAX_KF_GAP = 10.0
MIN_BLOCK_WORDS = 15
SCORE_BATCH_SIZE = 25
SCORE_CONTEXT = 3
EWMA_ALPHA = 0.35

_INTERLOCUTEUR_RE = re.compile(r"^Interlocuteur\s+(\d+)$")


def _parse_json(raw: str):
    """Strip JSON fences, parse, return None on error."""
    try:
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        return json.loads(raw)
    except (json.JSONDecodeError, IndexError, AttributeError):
        return None


def _call_validated(client, prompt: str, validator, retries: int = 2):
    """Call Gemini, parse response, validate, retry on failure."""
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
    """Compact transcript format: '[mm:ss] speaker: text' per line."""
    lines = []
    for s in segments:
        m, sec = int(s["start"] // 60), int(s["start"] % 60)
        prefix = "[non enregistré] " if s.get("refused") else ""
        lines.append(f"[{m:02d}:{sec:02d}] {s['speaker']}: {prefix}{s['text']}")
    return "\n".join(lines)


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


# Validators (Task 2)

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
            if not (0 <= t <= duration) or t < prev_t or not (0 <= v <= 100):
                return False
        except (IndexError, TypeError):
            return False
        prev_t = t
    return True


def validate_kf(kf: list, entry: float, final_xy: list[float]) -> bool:
    if not isinstance(kf, list) or len(kf) < 1:
        return False
    try:
        if abs(kf[0][0] - entry) > 0.5:
            return False
        last = kf[-1]
        if abs(last[1] - final_xy[0]) > 0.5 or abs(last[2] - final_xy[1]) > 0.5:
            return False
    except (IndexError, TypeError):
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


# Task 4: Passe 1 — Cadre + voix

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


# Task 5: Passe 2 — Events + tension

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


# Task 6: Passe 3 — Trajectoires (kf)

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


# Task 7: Passe 4 — Réseau conceptuel

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


# Task 8: Assemblage + écriture data.js


def merge_personas(voices, personas_interp, kf_map, duration) -> list[dict]:
    """Merge computed voices with interpolation (camp/note/color) + keyframes.

    If a voice has no kf in kf_map, use static fallback: entry to duration at same position.
    Omit voices absent from personas_interp (no position → unplaceable).
    """
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
    """Build DEBATE_DATA dict. frame/timeline/concepts may be None → omit those sections.

    Graceful degradation: if a pass failed (None), skip that key entirely.
    """
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
    if concepts is not None:
        data["concepts"] = concepts
    return data


def write_data_js(data: dict, path: Path) -> None:
    """Write const DEBATE_DATA = <json>; with header comment."""
    header = (
        "// data.js — généré par analyze_debate.py (analyse Gemini)\n"
        "// Coordonnées interprétatives, pas des mesures objectives.\n\n"
    )
    body = json.dumps(data, ensure_ascii=False, indent=2)
    path.write_text(f"{header}const DEBATE_DATA = {body};\n", encoding="utf-8")


# Task 10: Orchestration + CLI

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
