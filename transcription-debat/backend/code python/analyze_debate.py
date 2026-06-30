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
