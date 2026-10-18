"""Construit viz/ à partir d'une analyse faite à la main (lecture humaine ou par Claude) du transcript.

Alternative à analyze_debate.py quand l'analyse Gemini n'est pas fiable. Même partage des rôles :
l'interprétation (axes, positions, reformulations, événements, tension) vient du fichier d'analyse ;
tout ce qui se mesure (temps de parole, entrée, refus, durée, polarisation) est calculé depuis le
transcript, jamais recopié.

Choix de méthode : une position par voix, fixe tant que la personne ne change pas explicitement d'avis.
Un changement d'avis se déclare dans "shifts" ({t, x, y, desc}, ancré sur la prise de parole où il est
exprimé) et déplace durablement le point. Un nuage de scores par prise de parole, lui, fait bouger les
points dès que le sujet change, sans que l'opinion change : c'est ce qu'on évite.
La dynamique passe par les interactions (accord, désaccord, concession d'une voix à une autre) :
liens sur la carte, et seule une concession explicite fait pencher un point, temporairement.

Garde-fous (l'analyse est refusée, pas corrigée) :
- chaque voix du transcript doit être analysée, et aucune voix inventée ;
- chaque prise de position doit tomber sur un segment de CETTE voix (±3 s) : une reformulation
  attribuée à la mauvaise personne ou à un instant où elle ne parle pas est une erreur ;
- reformulations sans guillemets (jamais de citation) ni prénom de name_map.json.

Usage (depuis backend/) :
  .venv\\Scripts\\python "code python\\build_manual_viz.py" <CODE>_<DATE>_corrected.json <CODE>_analyse_manuelle.json [--name-map name_map.json]
"""
import argparse
import json
import re
import sys
from pathlib import Path

from analyze_debate import (AXIS_MAX, AXIS_MIN, EVENT_TYPES, POLARIZATION_ALPHA, _FORBIDDEN_STANCE_CHARS,
                            assemble_data, build_meta, compute_refus, compute_speech, compute_voices, write_viz)

SNAP_TOLERANCE_MIN = 0.05   # 3 s : le .txt arrondit les horodatages à la seconde
INTERACTION_TYPES = {"accord", "desaccord", "concession"}
SHIFT_TRANSITION = 1.0      # minutes : durée du déplacement animé après un changement d'avis


class AnalysisError(ValueError):
    pass


def _segment_starts(segments: list[dict]) -> dict[str, list[float]]:
    starts: dict[str, list[float]] = {}
    for seg in segments:
        m = re.match(r"^Interlocuteur\s+(\d+)$", seg["speaker"])
        if m:
            starts.setdefault(f"i{m.group(1)}", []).append(seg["start"] / 60.0)
    return starts


def _check_text(text: str, where: str, names: list[str]) -> None:
    if any(c in text for c in _FORBIDDEN_STANCE_CHARS):
        raise AnalysisError(f"{where} : guillemets interdits (reformuler, ne pas citer)")
    for name in names:
        if re.search(rf"\b{re.escape(name)}\b", text, re.IGNORECASE):
            raise AnalysisError(f"{where} : prénom réel « {name} »")


def polarization(personas: list[dict]) -> dict | None:
    """Esteban-Ray par axe (même formule qu'analyze_debate), en excluant d'un axe les voix
    dont la position y est non déterminable — leur centre par défaut n'est pas une mesure."""
    def er(vals):
        a = POLARIZATION_ALPHA
        total = sum(w for _, w in vals)
        norm = [((v - AXIS_MIN) / (AXIS_MAX - AXIS_MIN), w / total) for v, w in vals]
        s = sum((pi ** (1 + a)) * pj * abs(yi - yj) for yi, pi in norm for yj, pj in norm)
        return round(min(100.0, 100.0 * s / (2 ** -(1 + a))), 1)

    out, counts = {}, {}
    for key, idx in (("x", 1), ("y", 2)):
        vals = [(p["kf"][-1][idx], p["weight"]) for p in personas
                if not (p.get("uncertain") or {}).get(key) and p["weight"] > 0]
        if len(vals) < 2:
            return None
        out[key], counts[key] = er(vals), len(vals)
    return {"x": out["x"], "y": out["y"], "n": counts["x"], "nY": counts["y"],
            "method": "esteban_ray", "alpha": POLARIZATION_ALPHA}


def build(segments: list[dict], analysis: dict, topic: str, code: str, date: str,
          names: list[str] | None = None) -> dict:
    names = [n for n in (names or []) if len(n) >= 3]
    voices = compute_voices(segments)
    refus, redacted, duration = compute_refus(segments)
    speech = compute_speech(segments)
    starts = _segment_starts(segments)

    manual = analysis["personas"]
    voice_ids = {v["id"] for v in voices}
    missing, extra = voice_ids - set(manual), set(manual) - voice_ids
    if missing or extra:
        raise AnalysisError(f"voix non analysées : {sorted(missing)} ; voix inconnues : {sorted(extra)}")

    for axis in ("x", "y"):
        for pole, anchors in analysis["axes"][axis]["anchors"].items():
            for a in anchors:
                _check_text(a, f"ancre {axis}.{pole}", names)

    personas = []
    for v in voices:
        m = manual[v["id"]]
        x, y = float(m["x"]), float(m["y"])
        if not (AXIS_MIN <= x <= AXIS_MAX and AXIS_MIN <= y <= AXIS_MAX):
            raise AnalysisError(f"{v['id']} : position hors du plan ({x}, {y})")
        uncertain = m.get("uncertain") or {}
        if set(uncertain) - {"x", "y"}:
            raise AnalysisError(f"{v['id']} : axe incertain inconnu {sorted(uncertain)}")
        for k in ("camp", "note"):
            _check_text(m[k], f"{v['id']}.{k}", names)
        points = []
        for pt in m["points"]:
            t = float(pt["t"])
            near = [s for s in starts.get(v["id"], []) if abs(s - t) <= SNAP_TOLERANCE_MIN]
            if not near:
                raise AnalysisError(f"{v['id']} à {t:.2f} min : aucun segment de cette voix ne commence là")
            _check_text(pt["stance"], f"{v['id']} à {t:.2f} min", names)
            points.append({"t": round(min(near, key=lambda s: abs(s - t)), 2), "stance": pt["stance"]})
        points.sort(key=lambda p: p["t"])
        # Position fixe, sauf changement d'avis explicite (m["shifts"]) : chacun est ancré sur la prise
        # de parole où la personne change de position, et déplace durablement le point.
        kf, shifts, cur = [[v["entry"], x, y]], [], (x, y)
        for sh in sorted(m.get("shifts", []), key=lambda s: s["t"]):
            ts = _snap(starts, v["id"], sh["t"], f"{v['id']} : changement d'avis")
            nx, ny = float(sh["x"]), float(sh["y"])
            if not (AXIS_MIN <= nx <= AXIS_MAX and AXIS_MIN <= ny <= AXIS_MAX):
                raise AnalysisError(f"{v['id']} à {ts} min : changement d'avis hors du plan")
            if ts <= kf[-1][0] or ts >= duration:
                raise AnalysisError(f"{v['id']} à {ts} min : changement d'avis pendant le précédent, ou après la fin")
            _check_text(sh["desc"], f"{v['id']} : changement d'avis", names)
            # le déplacement s'anime sur SHIFT_TRANSITION, raccourci s'il survient en toute fin de débat
            kf += [[ts, *cur], [round(min(ts + SHIFT_TRANSITION, duration), 2), nx, ny]]
            shifts.append({"t": ts, "from": list(cur), "to": [nx, ny], "desc": sh["desc"]})
            cur = (nx, ny)
        if kf[-1][0] < duration:
            kf.append([duration, *cur])
        persona = {
            "id": v["id"], "label": v["label"], "camp": m["camp"],
            "color": m.get("color", v["color"]), "weight": v["weight"], "entry": v["entry"],
            "note": m["note"], "speech": speech.get(v["id"], []), "points": points, "kf": kf,
        }
        if shifts:
            persona["shifts"] = shifts
        if uncertain:
            persona["uncertain"] = uncertain
        personas.append(persona)

    # Interactions : qui répond à qui. `from` doit parler à cet instant (même contrôle que les points),
    # `to` doit être une autre voix du débat.
    interactions = []
    for it in analysis.get("interactions", []):
        where = f"interaction {it.get('from')}→{it.get('to')} à {it.get('t')} min"
        if it.get("type") not in INTERACTION_TYPES:
            raise AnalysisError(f"{where} : type inconnu {it.get('type')!r}")
        if it["from"] not in voice_ids or it["to"] not in voice_ids or it["from"] == it["to"]:
            raise AnalysisError(f"{where} : voix inconnue ou identique")
        near = [s for s in starts.get(it["from"], []) if abs(s - float(it["t"])) <= SNAP_TOLERANCE_MIN]
        if not near:
            raise AnalysisError(f"{where} : aucun segment de {it['from']} ne commence là")
        _check_text(it["desc"], where, names)
        interactions.append({"t": round(min(near, key=lambda s: abs(s - float(it["t"]))), 2),
                             "from": it["from"], "to": it["to"], "type": it["type"], "desc": it["desc"]})
    interactions.sort(key=lambda i: i["t"])

    for ev in analysis["events"]:
        if not (0 <= ev["t"] <= duration) or ev["type"] not in EVENT_TYPES or ev["magnitude"] not in (1, 2, 3):
            raise AnalysisError(f"événement invalide : {ev}")
        _check_text(ev["title"] + " " + ev["desc"], f"événement à {ev['t']} min", names)
    tension = analysis["tension"]
    ts = [t for t, _ in tension]
    if ts != sorted(ts) or ts[0] != 0 or ts[-1] > duration or any(not 0 <= v <= 100 for _, v in tension):
        raise AnalysisError("courbe de tension : temps croissants depuis 0, dans la durée, valeurs 0-100")

    meta = build_meta(segments, topic, code, date, redacted, duration)
    meta["method"] = analysis["method"]
    frame = {"axes": analysis["axes"], "schools": []}
    timeline = {"events": sorted(analysis["events"], key=lambda e: e["t"]), "tension": tension}
    data = assemble_data(meta, frame, personas, timeline, refus, polarization(personas))
    if interactions:
        data["interactions"] = interactions
    if "synthesis" in analysis:
        data["synthesis"] = _validate_synthesis(analysis["synthesis"], voice_ids, starts, duration, names)
    return data


THEME_KINDS = {"coeur", "connexe", "annexe"}
STANCES = {"pour", "contre", "nuance"}


def _snap(starts: dict[str, list[float]], vid: str, t: float, where: str) -> float:
    near = [s for s in starts.get(vid, []) if abs(s - float(t)) <= SNAP_TOLERANCE_MIN]
    if not near:
        raise AnalysisError(f"{where} : aucun segment de {vid} ne commence à {float(t):.2f} min")
    return round(min(near, key=lambda s: abs(s - float(t))), 2)


def _validate_synthesis(syn: dict, voice_ids: set[str], starts, duration: float, names: list[str]) -> dict:
    """Synthèse du haut de page. Ce qui est factuel est contrôlé : membres des groupes, découpage
    thématique continu sur toute la durée, et chaque position pour/contre sur une affirmation ancrée
    sur une prise de parole de la personne — comme les reformulations de la carte."""
    syn = json.loads(json.dumps(syn))   # copie profonde
    _check_text(syn["summary"], "synthèse", names)

    seen: set[str] = set()
    for grp in syn["groups"]:
        for vid in grp["members"]:
            if vid not in voice_ids or vid in seen:
                raise AnalysisError(f"groupe {grp['label']} : membre inconnu ou déjà dans un groupe ({vid})")
            seen.add(vid)
        for arg in grp["arguments"]:
            _check_text(arg, f"groupe {grp['label']}", names)
    for vid in syn.get("unclassified", {}).get("members", []):
        if vid not in voice_ids or vid in seen:
            raise AnalysisError(f"non rattaché : voix inconnue ou déjà dans un groupe ({vid})")

    theme_ids = set()
    for th in syn["themes"]:
        if th["kind"] not in THEME_KINDS or th["id"] in theme_ids:
            raise AnalysisError(f"thème {th['id']} : type inconnu ou identifiant en double")
        theme_ids.add(th["id"])
    prev_end = 0.0
    for a, b, tid in syn["timeline"]:
        if abs(a - prev_end) > 0.01 or b <= a or (tid is not None and tid not in theme_ids):
            raise AnalysisError(f"découpage thématique : trou, chevauchement ou thème inconnu à {a} min")
        prev_end = b
    if abs(prev_end - duration) > 0.1:
        raise AnalysisError(f"découpage thématique : se termine à {prev_end} min, le débat à {duration} min")
    for m in syn.get("mentions", []):
        if m["theme"] not in theme_ids or not 0 <= m["t"] <= duration:
            raise AnalysisError(f"mention invalide : {m}")

    for aff in syn["affirmations"]:
        _check_text(aff["text"], "affirmation", names)
        ids = [s["id"] for s in aff["stances"]]
        if len(ids) != len(set(ids)):
            raise AnalysisError(f"affirmation « {aff['text']} » : une voix compte deux fois")
        for s in aff["stances"]:
            if s["id"] not in voice_ids or s["pos"] not in STANCES:
                raise AnalysisError(f"affirmation « {aff['text']} » : voix ou position invalide ({s})")
            s["t"] = _snap(starts, s["id"], s["t"], f"affirmation « {aff['text']} »")
    return syn


def main() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("corrected_json", type=Path)
    ap.add_argument("analysis_json", type=Path)
    ap.add_argument("--name-map", type=Path, help="name_map.json : ses clés sont interdites dans les textes")
    args = ap.parse_args()

    segments = json.loads(args.corrected_json.read_text(encoding="utf-8"))
    analysis = json.loads(args.analysis_json.read_text(encoding="utf-8"))
    names = list(json.loads(args.name_map.read_text(encoding="utf-8"))) if args.name_map else []
    topic, code = args.corrected_json.parent.parent.name, args.corrected_json.parent.name
    stem = args.corrected_json.name.replace("_corrected.json", "")
    date = stem.rsplit("_", 1)[-1] if "_" in stem else ""
    try:
        data = build(segments, analysis, topic, code, date, names)
    except AnalysisError as e:
        print(f"Analyse refusée : {e}", file=sys.stderr)
        sys.exit(1)
    viz_dir = args.corrected_json.parent / "viz"
    write_viz(data, viz_dir)
    print(f"Visualisation écrite : {viz_dir / 'index.html'}")


if __name__ == "__main__":
    main()
