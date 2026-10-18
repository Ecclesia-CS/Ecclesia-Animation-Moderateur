"""Construit la page UNIQUE de restitution d'un débat à plusieurs tables, en menus accordéons.

Une seule page, des menus repliables de haut en bas :
1. Synthèse pré-débat : consensus, dissensus et camps d'opinion issus du questionnaire envoyé AVANT
   le débat. Données pas encore exportées : blocs à compléter tant que `pre_debate` est absent.
2. Synthèse flash : résumé très court de toutes les tables réunies, les 3 plus forts consensus et
   dissensus communs aux tables, la carte 2D finale de tous les participants (fixe, une couleur par
   table, taille = temps de parole), les camps d'opinion de la transcription.
3. Un menu par table (« Table A · <code> ») : résumé, ses 3 plus forts consensus et dissensus, temps
   passé par sujet, carte animée (échanges en flèches, changements d'avis) avec la tension intégrée au
   panneau « en ce moment », camps d'opinion de la table.

La carte est la MÊME grille dans tous les menus : positions recalées de l'analyse croisée
(build_cross_viz.py), et non les axes propres à chaque analyse par table. Des analyses par table
(<CODE>.json écrit par build_manual_viz.py) on garde ce qui est propre au déroulé : prises de parole,
reformulations horodatées, échanges, événements, courbe de tension, thèmes.

Tout ce qui se mesure ou se classe est calculé ici : sélection des 3 consensus/dissensus (règles
ci-dessous), égalités signalées, minutes par thème. Le seul texte écrit à la main est le résumé flash
(fichier de spec), soumis aux mêmes garde-fous que l'analyse croisée (ni guillemets ni prénom réel).

Spec (JSON, chemins relatifs à backend/) :
  { "cross": "transcripts/<Thème>/analyse_croisee.json",
    "tables": { "<CODE>": "transcripts/<Thème>/<CODE>/viz/<CODE>.json", ... },
    "flash_summary": "...",
    "pre_debate": null }

Usage (depuis backend/) :
  .venv\\Scripts\\python "code python\\build_unified_viz.py" <spec.json> [--out <dossier>]
"""
import argparse
import json
import re
import shutil
import sys
from pathlib import Path

from build_cross_viz import CrossError, _check_text, build as build_cross, load_tables

TOP_N = 3
MIN_VOICES_CONSENSUS = 3   # au moins 3 voix pour/contre pour parler de consensus
CONSENSUS_AGREEMENT = 0.5  # indice d'accord |pour − contre| / (pour + contre) à partir duquel on parle de consensus
# Libellés des familles de thèmes : on ne hiérarchise pas les sujets (pas de « cœur du sujet »,
# pas de « leviers et effets ») ; seuls les sujets annexes sont signalés comme tels.
KIND_LABELS = {"coeur": "La question posée", "connexe": "Questions liées", "annexe": "Sujets annexes"}
CAMP_COLORS = ["#1E6B6D", "#9B3A2D", "#6383B4", "#7A5C99", "#3F8462", "#B97A2A"]
UNCLASSIFIED_COLOR = "#898A8C"
# Pied de page : méthode de CETTE page (le classement diffère de celui de la page croisée, d'où un texte propre).
FOOTER = [
    "⚠ Positions interprétatives et volontairement grossières (pas de 2,5), établies à la lecture des transcriptions "
    "et recalées sur une grille commune à toutes les tables : ce ne sont pas des mesures. Quelques tables et une "
    "quinzaine de participants forment un petit échantillon, sans valeur statistique.",
    f"⚠ Consensus et dissensus sont classés par calcul à partir des prises de position relevées : consensus = au moins "
    f"{MIN_VOICES_CONSENSUS} voix pour ou contre, dont au moins les trois quarts du même côté ; dissensus = des voix "
    "des deux côtés sans majorité nette. Ne pas s'être exprimé n'est ni une adhésion ni un rejet.",
    "⚠ Les résumés et les prises de position sont des reformulations, jamais des citations, et aucun prénom réel "
    "n'apparaît. Temps de parole, sujets, tension et échanges viennent des analyses de chaque table.",
]

_TEMPLATE_DIR = Path(__file__).parent / "viz_template_unifiee"
_ASSETS = ["logo_ecclesia.webp", "newsreader-latin-opsz-normal.woff2", "newsreader-latin-opsz-italic.woff2",
           "archivo-latin-wght-normal.woff2", "archivo-latin-wght-italic.woff2",
           "OFL-newsreader.txt", "OFL-archivo.txt"]

_LABEL_ELIDED_RE = re.compile(r"\b[lL][’']Interlocuteur (\d+)")
_LABEL_RE = re.compile(r"\bInterlocuteur (\d+)")


class UnifiedError(ValueError):
    pass


# ───────────────────────── calculs purs ─────────────────────────

def relabel(text: str, table_key: str) -> str:
    """« l'Interlocuteur 3 » / « Interlocuteur 3 » → « A3 » : un même nom pour une voix dans toute la page."""
    text = _LABEL_ELIDED_RE.sub(lambda m: f"{table_key}{m.group(1)}", text)
    return _LABEL_RE.sub(lambda m: f"{table_key}{m.group(1)}", text)


def tally(stances: list[dict]) -> dict:
    by = {pos: sorted((s["p"] for s in stances if s["pos"] == pos), key=lambda k: (k[0], int(k[1:])))
          for pos in ("pour", "contre", "nuance")}
    p, c = len(by["pour"]), len(by["contre"])
    return {**by, "p": p, "c": c, "nu": len(by["nuance"]),
            "agreement": round(abs(p - c) / (p + c), 3) if p + c else 0.0}


def _consensus_key(s: dict):
    # marge nette d'abord (10 voix contre 1 pèse plus que 3 voix contre 0), puis netteté, puis voix exprimées
    return (abs(s["p"] - s["c"]), s["agreement"], s["p"] + s["c"] + s["nu"])


def _dissensus_key(s: dict):
    # taille du camp minoritaire d'abord (un vrai face-à-face), puis équilibre, puis voix exprimées
    return (min(s["p"], s["c"]), -s["agreement"], s["p"] + s["c"] + s["nu"])


def rank_statements(statements: list[dict], n: int = TOP_N) -> dict:
    """Les n plus forts consensus (adhésion OU rejet) et dissensus, avec les énoncés à égalité avec le
    dernier retenu. `statements` : [{text, stances:[{p, pos, t}]}] déjà restreints aux voix voulues.

    Consensus : au moins MIN_VOICES_CONSENSUS voix pour/contre et indice d'accord ≥ CONSENSUS_AGREEMENT.
    Dissensus : au moins une voix de chaque côté et indice d'accord < CONSENSUS_AGREEMENT.
    Les nuances ne comptent pas dans l'indice ; elles sont affichées."""
    rows = []
    for st in statements:
        t = tally(st["stances"])
        if t["p"] + t["c"] + t["nu"] == 0:
            continue
        side = "pour" if t["p"] >= t["c"] else "contre"
        rows.append({"text": st["text"], "side": side, **t})

    def pick(cands, key):
        cands = sorted(cands, key=key, reverse=True)   # tri stable : à égalité, l'ordre du fichier
        top = cands[:n]
        ties = [c for c in cands[n:] if top and key(c) == key(top[-1])]
        return top, ties

    cons = [r for r in rows if r["p"] + r["c"] >= MIN_VOICES_CONSENSUS and r["agreement"] >= CONSENSUS_AGREEMENT]
    diss = [r for r in rows if r["p"] >= 1 and r["c"] >= 1 and r["agreement"] < CONSENSUS_AGREEMENT]
    ctop, cties = pick(cons, _consensus_key)
    dtop, dties = pick(diss, _dissensus_key)
    return {"consensus": ctop, "consensus_ties": [r["text"] for r in cties],
            "dissensus": dtop, "dissensus_ties": [r["text"] for r in dties]}


def theme_minutes(timeline: list) -> dict[str, float]:
    out: dict[str, float] = {}
    for a, b, tid in timeline:
        key = tid or "__anim__"
        out[key] = round(out.get(key, 0.0) + (b - a), 2)
    return out


def camp_colors(groups: list[dict]) -> list[str]:
    return [CAMP_COLORS[i % len(CAMP_COLORS)] for i in range(len(groups))]


# ───────────────────────── construction ─────────────────────────

def build(spec: dict, cross: dict, table_viz: dict[str, dict], names: list[str]) -> dict:
    tables_meta = cross["meta"]["tables"]
    missing = [t["code"] for t in tables_meta if t["code"] not in table_viz]
    if missing:
        raise UnifiedError(f"analyse par table manquante pour {missing}")
    _check_text(spec["flash_summary"], "résumé flash", names)
    by_key = {p["key"]: p for p in cross["personas"]}
    cross_groups = cross["synthesis"]["groups"]
    common = [s for s in cross["statements"] if s["scope"] == "commun"]

    flash = {
        "summary": spec["flash_summary"],
        "ranking": rank_statements(common),
        "groups": [{**g, "color": c} for g, c in zip(cross_groups, camp_colors(cross_groups))],
        "unclassified": cross["synthesis"].get("unclassified") or {"members": [], "note": ""},
        "n_participants": len(cross["personas"]),
        "n_common_statements": len(common),
    }

    tables = []
    for tm in tables_meta:
        k, v = tm["key"], table_viz[tm["code"]]
        syn = v["synthesis"]
        own = [p for p in cross["personas"] if p["table"] == k]
        vid_to_key = {p["id"]: p["key"] for p in own}
        per_table = {p["id"]: p for p in v["personas"]}
        if set(per_table) != set(vid_to_key):
            raise UnifiedError(f"table {k} : voix différentes entre l'analyse croisée et l'analyse de la table")

        groups = [{"label": g["label"], "color": c, "members": [vid_to_key[m] for m in g["members"]],
                   "arguments": [relabel(a, k) for a in g["arguments"]],
                   **({"note": relabel(g["note"], k)} if g.get("note") else {})}
                  for g, c in zip(syn["groups"], camp_colors(syn["groups"]))]
        un = syn.get("unclassified") or {"members": [], "note": ""}
        unclassified = {"members": [vid_to_key[m] for m in un.get("members", [])], "note": relabel(un.get("note", ""), k)}
        color_of = {m: g["color"] for g in groups for m in g["members"]}

        personas = []
        for p in own:
            src = per_table[p["id"]]
            personas.append({
                "key": p["key"], "x": p["x"], "y": p["y"], "kf": p["kf"], "weight": p["weight"],
                "entry": p["entry"], "camp": p["camp"], "note": p["note"],
                "color": color_of.get(p["key"], UNCLASSIFIED_COLOR),
                "speech": src.get("speech", []),
                "points": [{"t": pt["t"], "stance": relabel(pt["stance"], k)} for pt in src.get("points", [])],
                **({"uncertain": p["uncertain"]} if p.get("uncertain") else {}),
                **({"shifts": p["shifts"]} if p.get("shifts") else {}),
            })

        mine = [{"text": s["text"], "stances": [x for x in s["stances"] if x["p"][0] == k]} for s in cross["statements"]]
        tables.append({
            "key": k, "code": tm["code"], "label": tm["label"], "duration": v["totalDurationMinutes"],
            "summary": relabel(syn["summary"], k),
            "ranking": rank_statements(mine),
            "groups": groups, "unclassified": unclassified,
            "kinds": {kk: {"label": KIND_LABELS[kk], "desc": relabel(kd["desc"], k)} for kk, kd in syn["kinds"].items()},
            "themes": syn["themes"], "timeline": syn["timeline"], "mentions": syn.get("mentions", []),
            "theme_minutes": theme_minutes(syn["timeline"]),
            "personas": personas,
            "interactions": [{"t": it["t"], "from": vid_to_key[it["from"]], "to": vid_to_key[it["to"]],
                              "type": it["type"], "desc": relabel(it["desc"], k)}
                             for it in v.get("interactions", []) if it["from"] in vid_to_key and it["to"] in vid_to_key],
            "events": [{**ev, "title": relabel(ev["title"], k), "desc": relabel(ev["desc"], k)} for ev in v.get("events", [])],
            "tension": v.get("tension", []), "refus": v.get("refus", []),
        })
        for p in personas:
            for pt in p["points"]:
                _check_text(pt["stance"], f"{p['key']} à {pt['t']} min", names)

    if set(by_key) != {p["key"] for t in tables for p in t["personas"]}:
        raise UnifiedError("des voix de l'analyse croisée n'apparaissent dans aucune table")

    first = table_viz[tables_meta[0]["code"]]["meta"]
    return {
        "meta": {"topic": cross["meta"]["topic"], "date": first.get("date"),
                 "tables": [{"key": t["key"], "code": t["code"], "label": t["label"]} for t in tables]},
        "axes": cross["axes"],
        "map": [{"key": p["key"], "table": p["table"], "x": p["kf"][-1][1], "y": p["kf"][-1][2],
                 "weight": p["weight"], "camp": p["camp"], "note": p["note"],
                 **({"uncertain": p["uncertain"]} if p.get("uncertain") else {})} for p in cross["personas"]],
        "pre_debate": spec.get("pre_debate"),
        "flash": flash, "tables": tables, "footer": FOOTER,
    }


# ───────────────────────── entrées / sorties ─────────────────────────

def _load_json(path: Path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_unified_viz(data: dict, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    body = json.dumps(data, ensure_ascii=False, indent=2)
    (out_dir / "data.js").write_text(
        "// data.js — généré par build_unified_viz.py. Positions interprétatives, pas des mesures objectives.\n\n"
        f"window.UNIFIED_DATA = {body};\n", encoding="utf-8")
    (out_dir / "unifiee.json").write_text(body + "\n", encoding="utf-8")
    shutil.copyfile(_TEMPLATE_DIR / "index.html", out_dir / "index.html")
    for name in _ASSETS:
        shutil.copyfile(_TEMPLATE_DIR / name, out_dir / name)


def main() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("spec_json", type=Path)
    ap.add_argument("--out", type=Path, default=None, help="défaut : <dossier de la spec>/viz_unifiee")
    args = ap.parse_args()
    spec = _load_json(args.spec_json)
    base = Path.cwd()
    try:
        cross_spec = _load_json(base / spec["cross"])
        cross_tables = load_tables(cross_spec, base)
        cross = build_cross(cross_spec, cross_tables)
        names = [n for t in cross_tables for n in t.get("names", []) if len(n) >= 3]
        data = build(spec, cross, {code: _load_json(base / p) for code, p in spec["tables"].items()}, names)
    except (CrossError, UnifiedError) as e:
        print(f"Page unifiée refusée : {e}", file=sys.stderr)
        sys.exit(1)
    out = args.out or args.spec_json.parent / "viz_unifiee"
    write_unified_viz(data, out)
    print(f"Page unifiée écrite : {out / 'index.html'}")


if __name__ == "__main__":
    main()
