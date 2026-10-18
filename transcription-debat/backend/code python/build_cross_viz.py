"""Construit une visualisation CROISÉE de plusieurs tables ayant débattu du même sujet.

Complète build_manual_viz.py (une page par table) : une seule page où tous les participants sont
placés sur UN MÊME plan 2D (une couleur par table, ni flèches ni liste de prises de position), avec une
synthèse générale qui ne distingue pas les tables, puis, en descendant, ce qui est commun (consensus et
dissensus communs) et ce qui diffère (sujets propres à une table, dynamique, composition).

Même partage des rôles que build_manual_viz.py : l'interprétation (positions sur les axes communs, textes
de synthèse, énoncés et prises de position) vient du fichier d'analyse croisée, écrit à la lecture des deux
analyses par table ; tout ce qui se mesure (temps de parole, entrée, polarisation, temps par thème,
interactions, tension moyenne, comptage des positions, classement consensus/dissensus) est calculé ici,
jamais recopié.

Garde-fous (l'analyse est refusée, pas corrigée) :
- chaque voix de chaque table est placée, et aucune voix inventée ;
- chaque prise de position d'un énoncé tombe sur un segment de CETTE voix (±3 s) ;
- aucun guillemet (reformulations, jamais de citation) ni prénom des name_map.json ;
- chaque thème de chaque table est rattaché à un thème commun ;
- les changements d'avis déclarés dans une analyse par table doivent être re-placés dans l'analyse croisée.

Usage (depuis backend/) :
  .venv\\Scripts\\python "code python\\build_cross_viz.py" <analyse_croisee.json> [--out <dossier>]
"""
import argparse
import json
import re
import shutil
import sys
from pathlib import Path

from analyze_debate import (AXIS_MAX, AXIS_MIN, POLARIZATION_ALPHA, _ASSETS, _FORBIDDEN_STANCE_CHARS,
                            _speaker_id)

SNAP_TOLERANCE_MIN = 0.05   # 3 s : le .txt arrondit les horodatages à la seconde
STANCES = ("pour", "contre", "nuance")
SHIFT_TRANSITION = 1.0      # minutes : durée du déplacement animé après un changement d'avis
# Classement d'un énoncé (calculé, jamais décidé à la main) :
MIN_VOICES_FOR_CONSENSUS = 3    # au moins 3 voix pour/contre pour parler de consensus ou de large accord
LARGE_SHARE = 0.75              # part de la position majoritaire parmi les voix pour/contre
MIN_EACH_FOR_DISSENSUS = 2      # au moins 2 voix de chaque côté

_TEMPLATE = Path(__file__).parent / "viz_template_croisee" / "index.html"


class CrossError(ValueError):
    pass


# ───────────────────────── calculs purs ─────────────────────────

def speech_minutes(segments: list[dict]) -> dict[str, float]:
    """Minutes de parole par voix « iN » (modérateur, [?] et [REFUS] ne sont pas placés)."""
    out: dict[str, float] = {}
    for seg in segments:
        vid = _speaker_id(seg["speaker"])
        if vid and vid != "anim":
            out[vid] = out.get(vid, 0.0) + (seg["end"] - seg["start"]) / 60.0
    return {k: round(v, 3) for k, v in out.items()}


def segment_starts(segments: list[dict]) -> dict[str, list[float]]:
    starts: dict[str, list[float]] = {}
    for seg in segments:
        vid = _speaker_id(seg["speaker"])
        if vid and vid != "anim":
            starts.setdefault(vid, []).append(seg["start"] / 60.0)
    return starts


def esteban_ray(points: list[tuple[float, float]]) -> float | None:
    """Polarisation d'Esteban-Ray sur un axe : points = [(valeur, poids)], indice 0-100 (même formule
    que analyze_debate.compute_polarization : α=1.6, normalisée par le maximum théorique)."""
    pts = [(v, w) for v, w in points if w > 0]
    if len(pts) < 2:
        return None
    total = sum(w for _, w in pts)
    a = POLARIZATION_ALPHA
    norm = [((v - AXIS_MIN) / (AXIS_MAX - AXIS_MIN), w / total) for v, w in pts]
    s = sum((pi ** (1 + a)) * pj * abs(yi - yj) for yi, pi in norm for yj, pj in norm)
    return round(min(100.0, 100.0 * s / (2 ** -(1 + a))), 1)


def stance_counts(stances: list[dict], table_keys: list[str]) -> dict[str, dict[str, int]]:
    out = {k: {s: 0 for s in STANCES} for k in table_keys}
    for st in stances:
        out[st["p"][0]][st["pos"]] += 1
    return out


def classify_statement(counts: dict[str, dict[str, int]], table_keys: list[str]) -> tuple[str, str]:
    """(portée, nature). Portée : « commun » si chaque table a au moins une voix, sinon la clé de la
    seule table concernée. Nature : consensus_pour/contre (aucune voix de l'autre côté), large_pour/contre
    (≥ 75 % des voix pour/contre), dissensus (≥ 2 voix de chaque côté sans large majorité), partage sinon."""
    present = [k for k in table_keys if sum(counts[k].values()) > 0]
    scope = "commun" if len(present) == len(table_keys) else present[0]
    pour = sum(c["pour"] for c in counts.values())
    contre = sum(c["contre"] for c in counts.values())
    both = pour + contre
    if both >= MIN_VOICES_FOR_CONSENSUS:
        major, side = (pour, "pour") if pour >= contre else (contre, "contre")
        if min(pour, contre) == 0:
            return scope, f"consensus_{side}"
        if major / both >= LARGE_SHARE:
            return scope, f"large_{side}"
        if min(pour, contre) >= MIN_EACH_FOR_DISSENSUS:
            return scope, "dissensus"
    return scope, "partage"


def theme_minutes(timeline: list, mapping: dict[str, str]) -> dict[str, float]:
    """Minutes par thème COMMUN : chaque thème d'une table est rattaché à un thème commun ; les passages
    sans thème (None) vont sous mapping['__none__']."""
    out: dict[str, float] = {}
    for a, b, tid in timeline:
        key = "__none__" if tid is None else tid
        if key not in mapping:
            raise CrossError(f"thème « {key} » sans rattachement à un thème commun")
        out[mapping[key]] = out.get(mapping[key], 0.0) + (b - a)
    return {k: round(v, 2) for k, v in out.items()}


def mean_tension(curve: list[list[float]], duration: float) -> float:
    """Tension moyenne pondérée par le temps (interpolation linéaire, dernière valeur prolongée)."""
    pts = [list(p) for p in curve]
    if pts[-1][0] < duration:
        pts.append([duration, pts[-1][1]])
    area = sum((b[0] - a[0]) * (a[1] + b[1]) / 2 for a, b in zip(pts, pts[1:]))
    return round(area / (pts[-1][0] - pts[0][0]), 1)


def _check_text(text: str, where: str, names: list[str], quotes: bool = True) -> None:
    """Refuse guillemets (reformuler, jamais citer) et prénoms réels. `quotes=False` pour les textes de
    méthode, qui emploient des guillemets pour nommer des sections ou des termes, pas pour citer."""
    if quotes and any(c in text for c in _FORBIDDEN_STANCE_CHARS):
        raise CrossError(f"{where} : guillemets interdits (reformuler, ne pas citer)")
    for name in names:
        if re.search(rf"\b{re.escape(name)}\b", text, re.IGNORECASE):
            raise CrossError(f"{where} : prénom réel « {name} »")


def _snap(starts: list[float], t: float, where: str) -> float:
    near = [s for s in starts if abs(s - float(t)) <= SNAP_TOLERANCE_MIN]
    if not near:
        raise CrossError(f"{where} : aucun segment de cette voix ne commence à {float(t):.2f} min")
    return round(min(near, key=lambda s: abs(s - float(t))), 2)


# ───────────────────────── construction ─────────────────────────

def build(spec: dict, tables: list[dict]) -> dict:
    keys = [t["key"] for t in tables]
    by_key = {t["key"]: t for t in tables}
    names = [n for t in tables for n in t.get("names", []) if len(n) >= 3]
    duration = max(max(s["end"] for s in t["segments"]) / 60.0 for t in tables)
    starts = {k: segment_starts(t["segments"]) for k, t in by_key.items()}
    minutes = {k: speech_minutes(t["segments"]) for k, t in by_key.items()}
    entries = {k: {} for k in keys}
    for k, t in by_key.items():
        for seg in t["segments"]:
            vid = _speaker_id(seg["speaker"])
            if vid and vid != "anim":
                entries[k][vid] = min(entries[k].get(vid, 1e9), seg["start"] / 60.0)

    # 1. Voix : toutes placées, aucune inventée
    expected = {f"{k}{vid[1:]}" for k in keys for vid in starts[k]}
    given = set(spec["personas"])
    if expected - given or given - expected:
        raise CrossError(f"voix non placées : {sorted(expected - given)} ; voix inconnues : {sorted(given - expected)}")
    for k, t in by_key.items():
        for vid, p in t["analysis"].get("personas", {}).items():
            if p.get("shifts"):
                raise CrossError(f"{k}{vid[1:]} : changement d'avis déclaré dans l'analyse de la table, "
                                 "à re-placer (champ shifts) dans l'analyse croisée")

    for label in ("summary",):
        _check_text(spec[label], label, names)
    for axis in ("x", "y"):
        for pole, anchors in spec["axes"][axis]["anchors"].items():
            for a in anchors:
                _check_text(a, f"ancre {axis}.{pole}", names)
        for lv in spec["axes"][axis].get("levels", []):
            _check_text(lv["text"], f"niveau {axis} {lv['v']}", names)

    personas = []
    for pkey in sorted(given, key=lambda s: (s[0], int(s[1:]))):
        m = spec["personas"][pkey]
        tk, vid = pkey[0], "i" + pkey[1:]
        x, y = float(m["x"]), float(m["y"])
        if not (AXIS_MIN <= x <= AXIS_MAX and AXIS_MIN <= y <= AXIS_MAX):
            raise CrossError(f"{pkey} : position hors du plan ({x}, {y})")
        unc = m.get("uncertain") or {}
        if set(unc) - {"x", "y"}:
            raise CrossError(f"{pkey} : axe incertain inconnu {sorted(unc)}")
        for f in ("camp", "note"):
            _check_text(m[f], f"{pkey}.{f}", names)
        entry = round(entries[tk][vid], 2)
        kf, shifts, cur = [[entry, x, y]], [], (x, y)
        for sh in sorted(m.get("shifts", []), key=lambda s: s["t"]):
            ts = _snap(starts[tk][vid], sh["t"], f"{pkey} : changement d'avis")
            nx, ny = float(sh["x"]), float(sh["y"])
            if not (AXIS_MIN <= nx <= AXIS_MAX and AXIS_MIN <= ny <= AXIS_MAX):
                raise CrossError(f"{pkey} à {ts} min : changement d'avis hors du plan")
            if ts <= kf[-1][0] or ts >= duration:
                raise CrossError(f"{pkey} à {ts} min : changement d'avis pendant le précédent, ou après la fin")
            _check_text(sh["desc"], f"{pkey} : changement d'avis", names)
            kf += [[ts, *cur], [round(min(ts + SHIFT_TRANSITION, duration), 2), nx, ny]]
            shifts.append({"t": ts, "from": list(cur), "to": [nx, ny], "desc": sh["desc"]})
            cur = (nx, ny)
        if kf[-1][0] < duration:
            kf.append([round(duration, 2), *cur])
        persona = {"key": pkey, "table": tk, "id": vid, "label": pkey, "camp": m["camp"], "note": m["note"],
                   "x": x, "y": y, "weight": minutes[tk][vid], "entry": entry, "kf": kf}
        if unc:
            persona["uncertain"] = unc
        if shifts:
            persona["shifts"] = shifts
        personas.append(persona)

    # 2. Polarisation et centres de gravité (sur les positions finales, pondérées par le temps de parole ;
    #    une voix dont la position est non déterminable sur un axe en est exclue)
    def polar(subset):
        out, n = {}, {}
        for axis in ("x", "y"):
            pts = [(p["kf"][-1][1 if axis == "x" else 2], p["weight"]) for p in subset
                   if axis not in p.get("uncertain", {})]
            out[axis], n[axis] = esteban_ray(pts), len(pts)
        return {"x": out["x"], "y": out["y"], "n": n["x"], "nY": n["y"]}

    def centroid(subset):
        res = {}
        for axis in ("x", "y"):
            pts = [(p["kf"][-1][1 if axis == "x" else 2], p["weight"]) for p in subset
                   if axis not in p.get("uncertain", {}) and p["weight"] > 0]
            tw = sum(w for _, w in pts)
            res[axis] = round(sum(v * w for v, w in pts) / tw, 2) if tw else None
        return res

    polarization = {"all": polar(personas), **{k: polar([p for p in personas if p["table"] == k]) for k in keys},
                    "method": "esteban_ray", "alpha": POLARIZATION_ALPHA}
    centroids = {k: centroid([p for p in personas if p["table"] == k]) for k in keys}

    # 3. Thèmes : rattachement obligatoire de chaque thème de chaque table à un thème commun
    common = spec["common_themes"]
    common_ids = {c["id"] for c in common} | {"anim"}
    tmeta, theme_min, timelines = [], {}, {}
    for k, t in by_key.items():
        syn = t["analysis"]["synthesis"]
        mapping = spec["theme_map"][k]
        for th in syn["themes"]:
            if th["id"] not in mapping:
                raise CrossError(f"table {k} : thème « {th['id']} » sans rattachement à un thème commun")
        bad = set(mapping.values()) - common_ids
        if bad:
            raise CrossError(f"table {k} : thèmes communs inconnus {sorted(bad)}")
        theme_min[k] = theme_minutes(syn["timeline"], mapping)
        timelines[k] = [[a, b, None if tid is None else mapping[tid]] for a, b, tid in syn["timeline"]]
    for c in common:
        _check_text(c["label"], f"thème {c['id']}", names)
        present = [k for k in keys if theme_min[k].get(c["id"], 0) > 0]
        c["scope"] = "commun" if len(present) == len(keys) else (present[0] if present else "aucun")

    # 4. Groupes d'opinion transverses
    seen: set[str] = set()
    for grp in spec["groups"]:
        _check_text(grp["label"], "groupe", names)
        for pk in grp["members"]:
            if pk not in given or pk in seen:
                raise CrossError(f"groupe {grp['label']} : membre inconnu ou déjà dans un groupe ({pk})")
            seen.add(pk)
        for arg in grp["arguments"]:
            _check_text(arg, f"groupe {grp['label']}", names)
    for pk in spec.get("unclassified", {}).get("members", []):
        if pk not in given or pk in seen:
            raise CrossError(f"non rattaché : voix inconnue ou déjà dans un groupe ({pk})")
        seen.add(pk)
    _check_text(spec.get("unclassified", {}).get("note", ""), "non rattachés", names)

    # 5. Énoncés (positions ancrées sur un segment de la voix) : classement calculé
    statements = []
    for raw in spec["statements"]:
        if "from_table" in raw:     # reprise telle quelle d'un énoncé d'une analyse par table
            tk = raw["from_table"]
            src = by_key[tk]["analysis"]["synthesis"]["affirmations"][raw["index"]]
            text = src["text"]
            stances = [{"p": f"{tk}{s['id'][1:]}", "pos": s["pos"], "t": s["t"], **({"note": s["note"]} if "note" in s else {})}
                       for s in src["stances"]]
        else:
            text, stances = raw["text"], [dict(s) for s in raw["stances"]]
        _check_text(text, f"énoncé « {text} »", names)
        ids = [s["p"] for s in stances]
        if len(ids) != len(set(ids)):
            raise CrossError(f"énoncé « {text} » : une voix compte deux fois")
        for s in stances:
            if s["p"] not in given or s["pos"] not in STANCES:
                raise CrossError(f"énoncé « {text} » : voix ou position invalide ({s['p']}, {s['pos']})")
            s["t"] = _snap(starts[s["p"][0]]["i" + s["p"][1:]], s["t"], f"énoncé « {text} » ({s['p']})")
            if "note" in s:
                _check_text(s["note"], f"énoncé « {text} » ({s['p']})", names)
        counts = stance_counts(stances, keys)
        scope, nature = classify_statement(counts, keys)
        statements.append({"text": text, "stances": stances, "counts": counts, "scope": scope, "nature": nature})

    # 6. Mesures par table
    meta_tables = []
    for k, t in by_key.items():
        an = t["analysis"]
        inter = {"accord": 0, "desaccord": 0, "concession": 0}
        for it in an.get("interactions", []):
            inter[it["type"]] += 1
        tdur = max(s["end"] for s in t["segments"]) / 60.0
        mins = minutes[k]
        total = sum(mins.values())
        top = max(mins.values())
        unknown = (t.get("rapport") or {}).get("metriques", {}).get("unknown_ratio")
        meta_tables.append({
            "key": k, "code": t["code"], "color": t["color"], "label": t["label"],
            "participants": len(mins), "duration": round(tdur, 2), "speech_minutes": round(total, 1),
            "top_share": round(100 * top / total, 1), "interactions": inter,
            "events": len(an.get("events", [])), "tension_mean": mean_tension(an["tension"], tdur),
            "unknown_ratio": None if unknown is None else round(100 * unknown, 1),
            "theme_minutes": theme_min[k], "timeline": timelines[k],
        })
    for f in ("title", "subtitle"):
        _check_text(spec[f], f, names)
    for sec in ("differences",):
        _check_text(spec[sec].get("intro", ""), sec, names)
        for card in spec[sec].get("cards", []):
            _check_text(card["title"] + " " + card["body"], f"{sec} : {card['title']}", names)
    only = spec.get("only_one_table", {})
    for k, items in only.items():
        for it in items:
            _check_text(it["title"] + " " + it["body"], f"propre à {k} : {it['title']}", names)
    _check_text(" ".join(spec["method"]["footer"]) + " " + spec["method"]["caption"], "méthode", names, quotes=False)

    return {
        "meta": {"title": spec["title"], "subtitle": spec["subtitle"], "topic": spec.get("topic", ""),
                 "duration": round(duration, 2), "tables": meta_tables},
        "axes": spec["axes"], "personas": personas, "polarization": polarization, "centroids": centroids,
        "synthesis": {"summary": spec["summary"], "groups": spec["groups"],
                      "unclassified": spec.get("unclassified", {"members": [], "note": ""})},
        "themes": common, "statements": statements,
        "differences": spec["differences"], "only_one_table": only, "method": spec["method"],
    }


# ───────────────────────── entrées / sorties ─────────────────────────

def _load_json(path: Path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def load_tables(spec: dict, base: Path) -> list[dict]:
    tables = []
    for t in spec["tables"]:
        rapport = base / t["rapport"] if t.get("rapport") else None
        names = list(_load_json(base / t["name_map"])) if t.get("name_map") else []
        tables.append({"key": t["key"], "code": t["code"], "color": t["color"], "label": t["label"],
                       "segments": _load_json(base / t["corrected"]), "analysis": _load_json(base / t["analysis"]),
                       "names": names, "rapport": _load_json(rapport) if rapport and rapport.exists() else None})
    return tables


def write_cross_viz(data: dict, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    body = json.dumps(data, ensure_ascii=False, indent=2)
    (out_dir / "data.js").write_text(
        "// data.js — généré par build_cross_viz.py (analyse manuelle croisée)\n"
        "// Positions interprétatives, pas des mesures objectives.\n\n"
        f"window.CROSS_DATA = {body};\n", encoding="utf-8")
    (out_dir / "croisee.json").write_text(body + "\n", encoding="utf-8")
    shutil.copyfile(_TEMPLATE, out_dir / "index.html")
    for asset in _ASSETS:
        shutil.copyfile(asset, out_dir / asset.name)


def main() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("spec_json", type=Path, help="analyse croisée (voir la docstring du module)")
    ap.add_argument("--out", type=Path, default=None, help="dossier de sortie (défaut : <dossier de l'analyse>/viz_croisee)")
    args = ap.parse_args()
    spec = _load_json(args.spec_json)
    try:
        data = build(spec, load_tables(spec, Path.cwd()))
    except CrossError as e:
        print(f"Analyse croisée refusée : {e}", file=sys.stderr)
        sys.exit(1)
    out = args.out or args.spec_json.parent / "viz_croisee"
    write_cross_viz(data, out)
    print(f"Visualisation croisée écrite : {out / 'index.html'}")


if __name__ == "__main__":
    main()
