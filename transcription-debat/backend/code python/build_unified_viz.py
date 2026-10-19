"""Construit la page UNIQUE de restitution d'un débat à plusieurs tables, en menus accordéons.

Une seule page, des menus repliables de haut en bas :
1. Synthèse pré-débat : consensus, dissensus et camps d'opinion issus du vote d'AVANT le débat, lus
   dans le JSON exporté par l'appli (chantier 170, format ecclesia.pre_debat.v1). Blocs à compléter
   tant que `pre_debate` est absent ou null.
2. Synthèse flash : résumé très court de toutes les tables réunies, les 3 plus forts consensus et
   dissensus communs aux tables, la carte 2D finale de tous les participants (fixe, une couleur par
   table, taille = temps de parole), les camps d'opinion de la transcription.
3. Un menu par table (« Table A · <code> ») : résumé, ses 3 plus forts consensus et dissensus, temps
   passé par sujet, carte animée (échanges en flèches, changements d'avis) avec la tension intégrée au
   panneau « en ce moment », camps d'opinion de la table.

La carte est la MÊME grille dans tous les menus : positions de l'analyse croisée (build_cross_viz.build,
recalculée en mémoire), et non les axes propres à chaque analyse par table. Des analyses par table on garde
ce qui est propre au déroulé (prises de parole, reformulations horodatées, échanges, événements, tension,
thèmes), calculé EN MÉMOIRE par build_manual_viz.build : aucune page par table ni page croisée n'est écrite.

Anonymat des synthèses (consigne du 2026-10-19) : consensus, dissensus, carte de la synthèse flash et
camps ne montrent jamais qui a dit quoi, seulement des décomptes (global et par camp) ; seule la carte
animée d'une table garde ses repères de voix.

Tout ce qui se mesure ou se classe est calculé ici : sélection des 3 consensus/dissensus (règles
ci-dessous), égalités signalées, minutes par thème. Les seuls textes écrits à la main sont dans la spec :
le résumé flash et la lecture du pré-débat, soumis aux garde-fous (ni guillemets ni prénom réel).

Spec (JSON, chemins relatifs à backend/) :
  { "cross": "transcripts/<Thème>/analyse_croisee.json",
    "flash_summary": "...",
    "pre_debate": "transcripts/<Thème>/ecclesia_pre_debat_<titre>_<date>.json",     (ou null)
    "pre_debate_lecture": {                                                          (facultatif)
       "axes":  {"x": {"left": "...", "right": "..."}, "y": {"bottom": "...", "top": "..."}},
       "camps": {"1": "synthèse de deux lignes", "2": "..."} } }

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
from build_manual_viz import AnalysisError, build as build_table

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

PRE_DEBATE_FORMAT = "ecclesia.pre_debat.v1"
PRE_MAP_EXTENT = 9.0   # la carte ACP pré-débat (sans unité) est ramenée dans ±9 sur le plan -10..+10 de la page
_HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")

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


_VOICE_KEY_RE = re.compile(r"\b[A-H]\d{1,2}\b")


def anonymize_keys(text: str) -> str:
    """Retire les identifiants de voix (« A7 ») des textes de camps : un camp se décrit sans dire qui en est."""
    text = re.sub(r"^\s*" + _VOICE_KEY_RE.pattern, "Une personne", text)
    text = re.sub(r"([.!?]\s+)" + _VOICE_KEY_RE.pattern, lambda m: m.group(1) + "Une personne", text)
    return _VOICE_KEY_RE.sub("une personne", text)


def public_camps(groups: list[dict], unclassified: dict | None, table_of=None) -> tuple[list[dict], dict]:
    """Camps tels qu'affichés : titre, couleur, taille (et répartition par table), arguments ; jamais leurs membres."""
    out = []
    for g in groups:
        c = {"label": g["label"], "color": g["color"], "size": len(g["members"]),
             "arguments": [anonymize_keys(a) for a in g.get("arguments", [])],
             **({"note": anonymize_keys(g["note"])} if g.get("note") else {})}
        if table_of:
            by: dict[str, int] = {}
            for m in g["members"]:
                by[table_of(m)] = by.get(table_of(m), 0) + 1
            c["by_table"] = by
        out.append(c)
    un = unclassified or {}
    return out, {"count": len(un.get("members", [])), "note": anonymize_keys(un.get("note", ""))}


def rank_statements(statements: list[dict], n: int = TOP_N, camp_of=None, n_camps: int = 0) -> dict:
    """Les n plus forts consensus (adhésion OU rejet) et dissensus, avec les énoncés à égalité avec le
    dernier retenu. `statements` : [{text, stances:[{p, pos, t}]}] déjà restreints aux voix voulues.

    Consensus : au moins MIN_VOICES_CONSENSUS voix pour/contre et indice d'accord ≥ CONSENSUS_AGREEMENT.
    Dissensus : au moins une voix de chaque côté et indice d'accord < CONSENSUS_AGREEMENT.
    Les nuances ne comptent pas dans l'indice ; elles sont affichées.

    Sortie anonyme : décomptes seulement, jamais qui a pris position. `camp_of(clé) → n° de camp (1..n_camps)
    ou None` ajoute `par_camp` (pour/contre/nuance de chaque camp ; camp 0 = voix non rattachées)."""
    rows = []
    for st in statements:
        t = tally(st["stances"])
        if t["p"] + t["c"] + t["nu"] == 0:
            continue
        side = "pour" if t["p"] >= t["c"] else "contre"
        row = {"text": st["text"], "side": side, "p": t["p"], "c": t["c"], "nu": t["nu"], "agreement": t["agreement"]}
        if camp_of is not None:
            per = {i: {"camp": i, "pour": 0, "contre": 0, "nuance": 0} for i in range(1, n_camps + 1)}
            for s in st["stances"]:
                ci = camp_of(s["p"]) or 0
                per.setdefault(ci, {"camp": ci, "pour": 0, "contre": 0, "nuance": 0})[s["pos"]] += 1
            row["par_camp"] = [v for k, v in sorted(per.items(), key=lambda kv: (kv[0] == 0, kv[0]))
                               if k != 0 or v["pour"] + v["contre"] + v["nuance"]]
        rows.append(row)

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


# ───────────────────────── pré-débat (export de l'appli) ─────────────────────────

def _num(v, where: str, lo: float | None = None, hi: float | None = None) -> float:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise UnifiedError(f"pré-débat, {where} : nombre attendu")
    if (lo is not None and v < lo) or (hi is not None and v > hi):
        raise UnifiedError(f"pré-débat, {where} : {v} hors de [{lo}, {hi}]")
    return v


def _count(v, where: str) -> int:
    if isinstance(v, bool) or not isinstance(v, int) or v < 0:
        raise UnifiedError(f"pré-débat, {where} : entier positif ou nul attendu")
    return v


def _list(d, key: str, where: str) -> list:
    v = d.get(key) if isinstance(d, dict) else None
    if not isinstance(v, list):
        raise UnifiedError(f"pré-débat, {where} : liste « {key} » attendue")
    return v


_WRAPPING_QUOTES = {'"': '"', "«": "»", "“": "”"}


def unwrap_quotes(text: str) -> str:
    """Retire les guillemets qui entourent TOUT un énoncé (« "La prison est nécessaire." »). Les assertions
    du questionnaire sont souvent saisies ainsi dans l'appli : ce sont les énoncés votés, pas des propos
    rapportés. Un guillemet à l'intérieur du texte reste refusé par _check_text."""
    t = text.strip()
    while len(t) >= 2 and _WRAPPING_QUOTES.get(t[0]) == t[-1]:
        t = t[1:-1].strip()
    return t


def _text(v, where: str, names: list[str]) -> str:
    if not isinstance(v, str) or not v.strip():
        raise UnifiedError(f"pré-débat, {where} : texte attendu")
    v = unwrap_quotes(v)
    try:
        _check_text(v, f"pré-débat, {where}", names)
    except CrossError as e:
        raise UnifiedError(str(e)) from e
    return v


def _ranked(rows: list, kind: str, camp_ids: set[int], names: list[str]) -> list[dict]:
    out = []
    for i, r in enumerate(rows, 1):
        w = f"{kind} n° {i}"
        if not isinstance(r, dict):
            raise UnifiedError(f"pré-débat, {w} : objet attendu")
        item = {"rang": _count(r.get("rang", i), w + ", rang"), "enonce": _text(r.get("enonce"), w, names),
                "score": _num(r.get("score"), w + ", score", 0, 1),
                **{k: _count(r.get(k), f"{w}, {k}") for k in ("pour", "contre", "abstention", "blanc")},
                "part_pour": _num(r.get("part_pour"), w + ", part_pour", 0, 1), "par_camp": []}
        if kind == "consensus":
            if r.get("sens") not in ("adhesion", "rejet"):
                raise UnifiedError(f"pré-débat, {w} : sens « adhesion » ou « rejet » attendu")
            item["sens"] = r["sens"]
        for c in _list(r, "par_camp", w):
            if not isinstance(c, dict) or c.get("camp") not in camp_ids:
                raise UnifiedError(f"pré-débat, {w} : camp inconnu dans par_camp")
            pp = c.get("part_pour")
            item["par_camp"].append({"camp": c["camp"], "pour": _count(c.get("pour"), w), "contre": _count(c.get("contre"), w),
                                     "part_pour": None if pp is None else _num(pp, w + ", part_pour du camp", 0, 1)})
        out.append(item)
    return sorted(out, key=lambda x: x["rang"])


def prepare_pre_debate(raw: dict, names: list[str], lecture: dict | None = None) -> dict:
    """Valide l'export pré-débat de l'appli (chantier 170, format ecclesia.pre_debat.v1) et le prépare
    pour la page : textes soumis aux garde-fous (ni guillemets ni prénom réel), carte ACP mise à l'échelle
    sur le plan de la page avec le même facteur sur les deux axes (les distances ne sont pas déformées).
    Les classements viennent de l'appli : rien n'est recalculé ici."""
    if not isinstance(raw, dict) or raw.get("format") != PRE_DEBATE_FORMAT:
        raise UnifiedError(f"pré-débat : format {PRE_DEBATE_FORMAT} attendu")
    camps_raw = _list(raw, "camps", "fichier")
    if not camps_raw:
        raise UnifiedError("pré-débat : aucun camp")
    camp_ids: set[int] = set()
    for c in camps_raw:
        cid = _count(c.get("camp") if isinstance(c, dict) else None, "numéro de camp")
        if cid in camp_ids:
            raise UnifiedError(f"pré-débat : camp {cid} en double")
        camp_ids.add(cid)

    carte = raw.get("carte")
    pts = _list(carte, "points", "carte")
    for i, p in enumerate(pts, 1):
        if not isinstance(p, dict) or p.get("camp") not in camp_ids:
            raise UnifiedError(f"pré-débat, point {i} de la carte : camp inconnu")
        _num(p.get("x"), f"point {i}, x"), _num(p.get("y"), f"point {i}, y")
    centres = []
    for c in camps_raw:
        ce = c.get("centre")
        if not isinstance(ce, dict):
            raise UnifiedError(f"pré-débat, camp {c['camp']} : centre attendu")
        centres.append((_num(ce.get("x"), f"camp {c['camp']}, centre x"), _num(ce.get("y"), f"camp {c['camp']}, centre y")))
    extent = max([abs(v) for p in pts for v in (p["x"], p["y"])] + [abs(v) for xy in centres for v in xy] + [0])
    scale = PRE_MAP_EXTENT / extent if extent > 0 else 1.0

    def plan(v: float) -> float:
        return round(v * scale, 3)

    camps = []
    for c, (cx, cy) in zip(camps_raw, centres):
        w = f"camp {c['camp']}"
        if not isinstance(c.get("couleur"), str) or not _HEX_RE.match(c["couleur"]):
            raise UnifiedError(f"pré-débat, {w} : couleur #RRGGBB attendue")
        carac = []
        for j, e in enumerate(_list(c, "enonces_caracteristiques", w), 1):
            we = f"{w}, énoncé caractéristique {j}"
            if not isinstance(e, dict) or e.get("sens") not in ("pour", "contre"):
                raise UnifiedError(f"pré-débat, {we} : sens « pour » ou « contre » attendu")
            carac.append({"enonce": _text(e.get("enonce"), we, names), "sens": e["sens"],
                          "part_pour_camp": _num(e.get("part_pour_camp"), we, 0, 1),
                          "part_pour_reste": _num(e.get("part_pour_reste"), we, 0, 1)})
        camps.append({"camp": c["camp"], "couleur": c["couleur"], "taille": _count(c.get("taille"), w + ", taille"),
                      "part": _num(c.get("part"), w + ", part", 0, 1), "centre": {"x": plan(cx), "y": plan(cy)},
                      **({"nom_ia": _text(c["nom_ia"], w + ", nom", names)} if c.get("nom_ia") else {}),
                      **({"description_ia": _text(c["description_ia"], w + ", description", names)}
                         if c.get("description_ia") else {}),
                      "enonces_caracteristiques": carac})
    camps.sort(key=lambda c: c["camp"])

    # Lecture écrite à la main dans la spec (pre_debate_lecture) : libellés des axes de la carte ACP et
    # synthèse de deux lignes par camp. Interprétation, signalée comme telle sur la page.
    axes = None
    if lecture:
        if not isinstance(lecture, dict):
            raise UnifiedError("pre_debate_lecture : objet attendu")
        la = lecture.get("axes")
        if la is not None:
            axes = {"x": {s: _text((la.get("x") or {}).get(s), f"axe x, {s}", names) for s in ("left", "right")},
                    "y": {s: _text((la.get("y") or {}).get(s), f"axe y, {s}", names) for s in ("bottom", "top")}}
        syn = lecture.get("camps") or {}
        unknown = set(syn) - {str(c["camp"]) for c in camps}
        if unknown:
            raise UnifiedError(f"pre_debate_lecture : camps inconnus {sorted(unknown)}")
        for c in camps:
            if str(c["camp"]) in syn:
                c["synthese"] = _text(syn[str(c["camp"])], f"synthèse du camp {c['camp']}", names)

    part = raw.get("participation") if isinstance(raw.get("participation"), dict) else {}
    var = carte.get("variance_expliquee")
    return {
        "participation": {k: _count(part.get(k, 0), f"participation, {k}")
                          for k in ("votants_places", "assertions_approuvees", "assertions_analysees", "votes")},
        "consensus": _ranked(_list(raw, "consensus", "fichier"), "consensus", camp_ids, names),
        "dissensus": _ranked(_list(raw, "dissensus", "fichier"), "dissensus", camp_ids, names),
        "camps": camps,
        "axes": axes,
        "carte": {"points": [{"x": plan(p["x"]), "y": plan(p["y"]), "camp": p["camp"]} for p in pts],
                  "variance_expliquee": [_num(v, "variance expliquée", 0, 1) for v in var]
                  if isinstance(var, list) and len(var) == 2 else None},
    }


# ───────────────────────── construction ─────────────────────────

def build(spec: dict, cross: dict, table_viz: dict[str, dict], names: list[str],
          pre_debate: dict | None = None) -> dict:
    """`pre_debate` : contenu du JSON pré-débat exporté par l'appli (déjà lu), ou None → blocs à compléter."""
    tables_meta = cross["meta"]["tables"]
    missing = [t["code"] for t in tables_meta if t["code"] not in table_viz]
    if missing:
        raise UnifiedError(f"analyse par table manquante pour {missing}")
    _check_text(spec["flash_summary"], "résumé flash", names)
    by_key = {p["key"]: p for p in cross["personas"]}
    cross_groups = cross["synthesis"]["groups"]
    common = [s for s in cross["statements"] if s["scope"] == "commun"]

    flash_groups = [{**g, "color": c} for g, c in zip(cross_groups, camp_colors(cross_groups))]
    flash_camp = {m: i for i, g in enumerate(flash_groups, 1) for m in g["members"]}
    camps_pub, un_pub = public_camps(flash_groups, cross["synthesis"].get("unclassified"), table_of=lambda m: m[0])
    flash = {
        "summary": spec["flash_summary"],
        "ranking": rank_statements(common, camp_of=flash_camp.get, n_camps=len(flash_groups)),
        "groups": camps_pub,
        "unclassified": un_pub,
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
        camp_idx = {m: i for i, g in enumerate(groups, 1) for m in g["members"]}
        camps_t, un_t = public_camps(groups, unclassified)
        tables.append({
            "key": k, "code": tm["code"], "label": tm["label"], "duration": v["totalDurationMinutes"],
            "summary": relabel(syn["summary"], k),
            "ranking": rank_statements(mine, camp_of=camp_idx.get, n_camps=len(groups)),
            "groups": camps_t, "unclassified": un_t,
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
        # carte de la synthèse flash : anonyme (ni identifiant, ni note individuelle)
        "map": [{"table": p["table"], "x": p["kf"][-1][1], "y": p["kf"][-1][2], "weight": p["weight"],
                 **({"uncertain": sorted(p["uncertain"])} if p.get("uncertain") else {})} for p in cross["personas"]],
        "pre_debate": prepare_pre_debate(pre_debate, names, spec.get("pre_debate_lecture"))
        if pre_debate is not None else None,
        "flash": flash, "tables": tables, "footer": FOOTER,
    }


# ───────────────────────── entrées / sorties ─────────────────────────

def table_data(cross_spec: dict, cross_tables: list[dict]) -> dict[str, dict]:
    """Données de chaque table (déroulé, temps de parole, tension, thèmes) calculées EN MÉMOIRE par
    build_manual_viz.build, à partir du transcript corrigé et de l'analyse manuelle. Aucune page par table
    n'est écrite : depuis le 2026-10-19, seule la page unifiée est produite."""
    out = {}
    for spec_t, t in zip(cross_spec["tables"], cross_tables):
        corrected = Path(spec_t["corrected"])
        stem = corrected.name.replace("_corrected.json", "")
        date = stem.rsplit("_", 1)[-1] if "_" in stem else ""
        out[t["code"]] = build_table(t["segments"], t["analysis"], corrected.parent.parent.name, t["code"], date,
                                     [n for n in t.get("names", []) if len(n) >= 3])
    return out


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
        pre = None
        if spec.get("pre_debate"):
            try:
                pre = _load_json(base / spec["pre_debate"])
            except (OSError, json.JSONDecodeError) as e:
                raise UnifiedError(f"pré-débat illisible ({spec['pre_debate']}) : {e}") from e
        data = build(spec, cross, table_data(cross_spec, cross_tables), names, pre)
    except (CrossError, UnifiedError, AnalysisError) as e:
        print(f"Page unifiée refusée : {e}", file=sys.stderr)
        sys.exit(1)
    out = args.out or args.spec_json.parent / "viz_unifiee"
    write_unified_viz(data, out)
    print(f"Page unifiée écrite : {out / 'index.html'}")


if __name__ == "__main__":
    main()
