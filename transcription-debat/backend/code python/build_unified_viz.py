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

La carte est le MÊME plan dans tous les menus, et elle est CALCULÉE (depuis le 2026-10-19, opinion_math) :
analyse en composantes principales façon Polis de la matrice voix × énoncés tirée des prises de position
relevées (pour / contre / nuance), camps par k-moyennes + silhouette, affichés seulement s'ils battent un
test d'absence de structure, énoncés caractéristiques et consensus selon Polis. Les positions et camps
écrits à la lecture ne sont plus affichés : s'ils existent, ils servent seulement à mesurer la concordance
entre la lecture et le calcul. Des analyses par table on garde ce qui est propre au déroulé (prises de
parole, reformulations horodatées, échanges, événements, tension, thèmes), calculé EN MÉMOIRE par
build_manual_viz.build : aucune page par table ni page croisée n'est écrite.

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
       "camps": {"1": "synthèse de deux lignes", "2": "..."} },
    "transcription_lecture": {                                                       (facultatif)
       "axes":  {"x": {"left": "...", "right": "..."}, "y": {"bottom": "...", "top": "..."}},
       "camps": {"1": {"taille": 4, "label": "nom du camp calculé", "synthese": "..."}} },
    "codage_double": "transcripts/<Thème>/codage_2.json" }                           (facultatif)

Usage (depuis backend/) :
  .venv\\Scripts\\python "code python\\build_unified_viz.py" <spec.json> [--out <dossier>]
"""
import argparse
import json
import re
import shutil
import sys
from pathlib import Path

import numpy as np

from build_cross_viz import CrossError, _check_text, build as build_cross, load_tables
from build_manual_viz import AnalysisError, build as build_table
import opinion_math as om

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
    "⚠ Carte et camps de la transcription calculés, pas choisis : analyse en composantes principales et regroupement "
    "des prises de position relevées, selon la méthode de Polis, avec un test qui écarte les camps indiscernables du "
    "hasard. Quelques tables et une quinzaine de participants forment un petit échantillon : à lire avec prudence.",
    f"⚠ Consensus et dissensus sont classés par calcul à partir des prises de position relevées : consensus = au moins "
    f"{MIN_VOICES_CONSENSUS} voix pour ou contre, dont au moins les trois quarts du même côté, classés par le consensus "
    "tenant compte des camps de Polis ; dissensus = des voix des deux côtés sans majorité nette. Ne pas s'être exprimé "
    "n'est ni une adhésion ni un rejet.",
    "⚠ Les énoncés et les prises de position sont relevés à la lecture de la transcription, chacun rattaché à un moment "
    "de l'enregistrement ; ce sont des reformulations, jamais des citations, et aucun prénom réel n'apparaît.",
]

MAP_EXTENT = 9.0      # carte de la transcription ramenée dans ±9 (même facteur sur les deux axes)
MAP_CLIP = 9.8        # une position intermédiaire (peu de prises de position) ne sort pas du plan
MOVE_MINUTES = 1.0    # durée de l'animation quand une nouvelle prise de position déplace un point
AXIS_STATEMENTS = 4   # énoncés qui pèsent le plus sur chaque axe, montrés sous la carte
TABLE_COLORS = ["var(--ta)", "var(--tb)", "var(--tc3)", "var(--tc4)"]

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


_VOICE_KEY_RE = re.compile(r"\b[A-H]\d{1,2}\b")


def anonymize_keys(text: str) -> str:
    """Retire les identifiants de voix (« A7 ») des textes de camps : un camp se décrit sans dire qui en est."""
    text = re.sub(r"^\s*" + _VOICE_KEY_RE.pattern, "Une personne", text)
    text = re.sub(r"([.!?]\s+)" + _VOICE_KEY_RE.pattern, lambda m: m.group(1) + "Une personne", text)
    return _VOICE_KEY_RE.sub("une personne", text)


def public_camps(groups: list[dict], table_of=None) -> list[dict]:
    """Camps tels qu'affichés : nom, couleur, taille (et répartition par table), énoncés qui les distinguent,
    synthèse éventuelle ; jamais leurs membres."""
    out = []
    for g in groups:
        c = {"camp": g["camp"], "label": g["label"], "color": g["color"], "size": len(g["members"]),
             "representative": g.get("representative", []),
             **({"synthese": anonymize_keys(g["synthese"])} if g.get("synthese") else {})}
        if table_of:
            by: dict[str, int] = {}
            for m in g["members"]:
                by[table_of(m)] = by.get(table_of(m), 0) + 1
            c["by_table"] = by
        out.append(c)
    return out


def rank_statements(statements: list[dict], groups: list[set[str]] | None = None, n: int = TOP_N,
                    camp_of=None, n_camps: int = 0) -> dict:
    """Les n plus forts consensus (adhésion OU rejet) et dissensus, avec les énoncés à égalité avec le
    dernier retenu. `statements` : [{text, stances:[{p, pos, t}]}] déjà restreints aux voix voulues ;
    `groups` : membres de chaque camp calculé (vide ou None = pas de camps nets : toutes les voix forment
    un seul groupe).

    Éligibilité (inchangée) : consensus = au moins MIN_VOICES_CONSENSUS voix pour/contre, indice d'accord
    ≥ CONSENSUS_AGREEMENT, et aucun camp qui penche de l'autre côté ; dissensus = des voix des deux côtés
    et indice < CONSENSUS_AGREEMENT. Les nuances (le « passe » de Polis) ne comptent pas dans l'indice.

    Classement (Polis) : consensus par le consensus « tenant compte des groupes », produit sur les camps
    de P(côté | camp) avec pseudo-comptes ; dissensus par l'écart de P(pour | camp) entre le camp le plus
    pour et le plus contre, ou, sans camps, par la taille du côté minoritaire.

    Sortie anonyme : décomptes seulement. `camp_of(clé) → n° de camp (1..n_camps) ou None` ajoute
    `par_camp` (camp 0 = voix non rattachées)."""
    voices = {s["p"] for st in statements for s in st["stances"]}
    gs = [g for g in (groups or []) if g] or [voices]
    rows = []
    for st in statements:
        t = tally(st["stances"])
        if t["p"] + t["c"] + t["nu"] == 0:
            continue
        side = "pour" if t["p"] >= t["c"] else "contre"
        cons = om.group_consensus(st["stances"], gs)
        split = om.camp_split(st["stances"], gs) if len(gs) >= 2 else None
        leans_other = any(
            om._p(cnt[1] if side == "pour" else cnt[0], cnt[0] + cnt[1]) > 0.5
            for cnt in (om._counts(st["stances"], g) for g in gs) if cnt[0] + cnt[1])
        row = {"text": st["text"], "side": side, "p": t["p"], "c": t["c"], "nu": t["nu"], "agreement": t["agreement"],
               "score_consensus": round(cons[side], 4), "score_dissensus": None if split is None else round(split, 4),
               "_leans_other": leans_other}
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

    cons = [r for r in rows if r["p"] + r["c"] >= MIN_VOICES_CONSENSUS and r["agreement"] >= CONSENSUS_AGREEMENT
            and not r["_leans_other"]]
    diss = [r for r in rows if r["p"] >= 1 and r["c"] >= 1 and r["agreement"] < CONSENSUS_AGREEMENT]
    ctop, cties = pick(cons, lambda r: (r["score_consensus"], r["p"] + r["c"]))
    dtop, dties = pick(diss, lambda r: (r["score_dissensus"] or 0.0, min(r["p"], r["c"]), -r["agreement"]))
    for r in rows:
        r.pop("_leans_other")
    return {"consensus": ctop, "consensus_ties": [r["text"] for r in cties],
            "dissensus": dtop, "dissensus_ties": [r["text"] for r in dties]}


def theme_minutes(timeline: list) -> dict[str, float]:
    out: dict[str, float] = {}
    for a, b, tid in timeline:
        key = tid or "__anim__"
        out[key] = round(out.get(key, 0.0) + (b - a), 2)
    return out


def camp_colors(n: int) -> list[str]:
    return [CAMP_COLORS[i % len(CAMP_COLORS)] for i in range(n)]


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


# ───────────────────────── opinions de la transcription (calculées) ─────────────────────────

def _ttext(v, where: str, names: list[str]) -> str:
    if not isinstance(v, str) or not v.strip():
        raise UnifiedError(f"{where} : texte attendu")
    try:
        _check_text(v, where, names)
    except CrossError as e:
        raise UnifiedError(str(e)) from e
    return v


def _keyframes(stances: list[tuple[float, int, float]], pm: dict, scale: float, duration: float) -> list[list[float]]:
    """Trajectoire d'une voix : sa position est recalculée (même base que l'ACP finale) à chaque nouvelle
    prise de position, dès qu'elle en a MIN_VOTES. Elle ne bouge donc que lorsqu'elle s'exprime sur un
    énoncé. `stances` : [(t en minutes, colonne de l'énoncé, valeur)]."""
    col_of = {c: i for i, c in enumerate(pm["cols"])}
    row = np.full(len(pm["cols"]), np.nan)
    times = sorted({t for t, _, _ in stances})
    seen, kf = 0, []
    for i, t in enumerate(times):
        for tt, j, v in stances:
            if tt == t:
                seen += 1
                if j in col_of:
                    row[col_of[j]] = v
        if seen < om.MIN_VOTES or np.all(np.isnan(row)):
            continue
        xy = om.project(row, pm["means"], pm["components"], len(pm["cols"])) * scale
        xy = [round(float(np.clip(v, -MAP_CLIP, MAP_CLIP)), 3) for v in xy]
        if not kf:
            kf.append([round(t, 2), *xy])
            continue
        nxt = times[i + 1] if i + 1 < len(times) else duration
        kf += [[round(t, 2), *kf[-1][1:]], [round(t + min(MOVE_MINUTES, max(0.01, 0.9 * (nxt - t))), 2), *xy]]
    if kf and kf[-1][0] < duration:
        kf.append([round(duration, 2), *kf[-1][1:]])
    return kf


def transcription_opinions(cross: dict, durations: dict[str, float], names: list[str],
                           lecture: dict | None = None, second_coding: dict | None = None) -> dict:
    """Carte, camps, axes et indicateurs de fiabilité calculés à partir des seules prises de position
    relevées (opinion_math : Polis + tests de validité). La lecture écrite à la main (libellés des axes,
    noms et synthèses des camps) est facultative et ne fait que nommer ce qui a été calculé."""
    personas = cross["personas"]
    voices = [p["key"] for p in personas]
    statements = cross["statements"]
    m = om.vote_matrix(voices, [st["stances"] for st in statements])
    pm = om.polis_map(m)
    lecture = lecture or {}

    pos: dict[str, dict] = {k: {"placed": False, "kf": []} for k in voices}
    groups, axes = [], None
    camps_info = {"nets": False, "k": 0, "raison": "trop peu de prises de position pour une carte"}
    if pm is not None:
        coords = pm["coords"]
        extent = float(np.max(np.abs(coords))) if coords.size else 0.0
        scale = MAP_EXTENT / extent if extent > 0 else 1.0
        by_voice: dict[str, list] = {k: [] for k in voices}
        for j, st in enumerate(statements):
            for s in st["stances"]:
                by_voice[s["p"]].append((s["t"], j, om.ENCODE[s["pos"]]))
        for i, vi in enumerate(pm["placed"]):
            k = voices[vi]
            kf = _keyframes(by_voice[k], pm, scale, durations[k[0]])
            final = [round(float(v * scale), 3) for v in coords[i]]
            if kf:
                kf[-1][1:] = final
            pos[k] = {"placed": True, "x": final[0], "y": final[1], "kf": kf}

        camps_info = om.camps(coords)
        if camps_info["nets"]:
            labels = camps_info["labels"]
            members = [{voices[pm["placed"][i]] for i, lab in enumerate(labels) if lab == g}
                       for g in range(camps_info["k"])]
            for g, (mem, color) in enumerate(zip(members, camp_colors(camps_info["k"])), 1):
                others = set(voices) - mem
                groups.append({"camp": g, "label": f"Camp {g}", "color": color,
                               "members": sorted(mem, key=lambda s: (s[0], int(s[1:]))),
                               "representative": om.representative(statements, mem, others)})

        def pole(k: int) -> list[dict]:
            w = pm["components"][k]
            top = sorted(range(len(w)), key=lambda j: -abs(w[j]))[:AXIS_STATEMENTS]
            return [{"text": statements[pm["cols"][j]]["text"], "poids": round(float(w[j]), 3),
                     "accord_vers": "plus" if w[j] > 0 else "moins"} for j in top if abs(w[j]) > 1e-9]
        axes = {"x": {"variance": round(pm["variance"][0], 3), "enonces": pole(0)},
                "y": {"variance": round(pm["variance"][1], 3), "enonces": pole(1)}, "lecture": None}

    # Lecture écrite à la main : libellés des axes, noms et synthèses des camps calculés
    la = lecture.get("axes")
    if la is not None:
        if axes is None:
            raise UnifiedError("transcription_lecture : libellés d'axes donnés, mais aucune carte n'a pu être calculée")
        axes["lecture"] = {"x": {s: _ttext((la.get("x") or {}).get(s), f"lecture, axe x, {s}", names) for s in ("left", "right")},
                           "y": {s: _ttext((la.get("y") or {}).get(s), f"lecture, axe y, {s}", names) for s in ("bottom", "top")}}
    lc = lecture.get("camps") or {}
    known = {str(g["camp"]): g for g in groups}
    unknown = set(lc) - set(known)
    if unknown:
        raise UnifiedError(f"transcription_lecture : camps inconnus {sorted(unknown)} "
                           f"({'aucun camp net' if not groups else f'{len(groups)} camps calculés'})")
    for cid, entry in lc.items():
        g = known[cid]
        if not isinstance(entry, dict) or entry.get("taille") != len(g["members"]):
            raise UnifiedError(f"transcription_lecture, camp {cid} : la taille donnée ne correspond pas au camp calculé "
                               f"({len(g['members'])} voix) ; les camps ont changé, relire la page avant de les renommer")
        g["label"] = _ttext(entry.get("label"), f"lecture, nom du camp {cid}", names)
        if entry.get("synthese"):
            g["synthese"] = _ttext(entry["synthese"], f"lecture, synthèse du camp {cid}", names)

    # Indicateurs de méthode, tous calculés
    n_cells = len(voices) * len(statements)
    filled = int(np.sum(~np.isnan(m)))
    method = {"voix": len(voices), "placees": sum(1 for p in pos.values() if p["placed"]),
              "enonces": len(statements), "enonces_carte": len(pm["cols"]) if pm else 0,
              "remplissage": round(filled / n_cells, 3) if n_cells else 0.0,
              "min_prises": om.MIN_VOTES,
              "variance": [axes["x"]["variance"], axes["y"]["variance"]] if axes else None,
              "camps": {k: camps_info.get(k) for k in ("nets", "k", "silhouette", "silhouette_hasard_95", "stabilite", "raison")}}
    by_key = {p["key"]: p for p in personas}
    hand = [k for k in voices if pos[k]["placed"] and "x" in by_key[k]]
    if pm is not None and len(hand) >= 4 and len(hand) == method["placees"]:
        a = np.array([[by_key[k]["x"], by_key[k]["y"]] for k in hand])
        b = np.array([[pos[k]["x"], pos[k]["y"]] for k in hand])
        method["concordance_lecture"] = {"r2": round(om.procrustes_r2(a, b), 3),
                                         "hasard_95": round(om.procrustes_null95(a, b), 3), "n": len(hand)}
    if second_coding is not None:
        method["fiabilite_codage"] = coding_reliability(statements, voices, second_coding)
    return {"positions": pos, "groups": groups, "axes": axes, "method": method}


def coding_reliability(statements: list[dict], voices: list[str], other: dict) -> dict:
    """Alpha de Krippendorff (nominal) entre le codage de la page et un second codage indépendant des
    MÊMES énoncés ({"statements": [{"text", "stances": [{"p", "pos"}]}]}). Unité = une voix × un énoncé ;
    valeurs pour / contre / nuance / « ne s'est pas exprimé »."""
    if not isinstance(other, dict) or not isinstance(other.get("statements"), list):
        raise UnifiedError("second codage : objet {\"statements\": [...]} attendu")
    theirs = {st.get("text"): {s["p"]: s["pos"] for s in st.get("stances", [])} for st in other["statements"]}
    missing = [st["text"] for st in statements if st["text"] not in theirs]
    if missing:
        raise UnifiedError(f"second codage : énoncés absents (le texte doit être identique) : {missing[:3]}")
    units = []
    for st in statements:
        mine = {s["p"]: s["pos"] for s in st["stances"]}
        for v in voices:
            units.append([mine.get(v, "absent"), theirs[st["text"]].get(v, "absent")])
    agree = sum(1 for a, b in units if a == b)
    return {"alpha": om.krippendorff_alpha_nominal(units), "unites": len(units),
            "accord_brut": round(agree / len(units), 3) if units else None}


# ───────────────────────── construction ─────────────────────────

def build(spec: dict, cross: dict, table_viz: dict[str, dict], names: list[str],
          pre_debate: dict | None = None, second_coding: dict | None = None) -> dict:
    """`pre_debate` : contenu du JSON pré-débat exporté par l'appli (déjà lu), ou None → blocs à compléter.
    `second_coding` : second codage indépendant des prises de position (facultatif) → alpha de Krippendorff."""
    tables_meta = cross["meta"]["tables"]
    missing = [t["code"] for t in tables_meta if t["code"] not in table_viz]
    if missing:
        raise UnifiedError(f"analyse par table manquante pour {missing}")
    _check_text(spec["flash_summary"], "résumé flash", names)
    by_key = {p["key"]: p for p in cross["personas"]}
    durations = {t["key"]: table_viz[t["code"]]["totalDurationMinutes"] for t in tables_meta}
    op = transcription_opinions(cross, durations, names, spec.get("transcription_lecture"), second_coding)
    groups = op["groups"]
    camp_of = {m: g["camp"] for g in groups for m in g["members"]}
    camp_sets = [set(g["members"]) for g in groups]
    table_color = {t["key"]: TABLE_COLORS[i % len(TABLE_COLORS)] for i, t in enumerate(tables_meta)}
    common = [s for s in cross["statements"] if s["scope"] == "commun"]

    flash = {
        "summary": spec["flash_summary"],
        "ranking": rank_statements(common, camp_sets, camp_of=camp_of.get if groups else None, n_camps=len(groups)),
        "groups": public_camps(groups, table_of=lambda m: m[0]),
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

        personas = []
        for p in own:
            src, ps = per_table[p["id"]], op["positions"][p["key"]]
            g = next((g for g in groups if p["key"] in g["members"]), None)
            camp = (g["label"] if g else "Sans camp net") if ps["placed"] else \
                f"Non placé : moins de {om.MIN_VOTES} prises de position relevées"
            personas.append({
                "key": p["key"], "placed": ps["placed"], "x": ps.get("x"), "y": ps.get("y"), "kf": ps["kf"],
                "weight": p["weight"], "entry": p["entry"], "camp": camp, "note": p.get("note", ""),
                "color": g["color"] if g else table_color[k],
                "speech": src.get("speech", []),
                "points": [{"t": pt["t"], "stance": relabel(pt["stance"], k)} for pt in src.get("points", [])],
            })

        mine = [{"text": s["text"], "stances": [x for x in s["stances"] if x["p"][0] == k]} for s in cross["statements"]]
        own_keys = {p["key"] for p in own}
        t_groups = [{**g, "members": [m for m in g["members"] if m in own_keys]} for g in groups]
        tables.append({
            "key": k, "code": tm["code"], "label": tm["label"], "duration": v["totalDurationMinutes"],
            "summary": relabel(syn["summary"], k),
            "ranking": rank_statements(mine, [set(g["members"]) for g in t_groups if g["members"]],
                                       camp_of=camp_of.get if groups else None, n_camps=len(groups)),
            "groups": [c for c in public_camps(t_groups) if c["size"]],
            "unplaced": sum(1 for p in personas if not p["placed"]),
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
        "axes": op["axes"],
        "method": op["method"],
        # carte de la synthèse flash : anonyme (ni identifiant, ni note individuelle), voix placées seulement
        "map": [{"table": p["table"], "x": op["positions"][p["key"]]["x"], "y": op["positions"][p["key"]]["y"],
                 "weight": p["weight"]} for p in cross["personas"] if op["positions"][p["key"]]["placed"]],
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
        "// data.js — généré par build_unified_viz.py. Carte et camps calculés à partir des prises de position relevées.\n\n"
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
        second = None
        if spec.get("codage_double"):
            try:
                second = _load_json(base / spec["codage_double"])
            except (OSError, json.JSONDecodeError) as e:
                raise UnifiedError(f"second codage illisible ({spec['codage_double']}) : {e}") from e
        data = build(spec, cross, table_data(cross_spec, cross_tables), names, pre, second)
    except (CrossError, UnifiedError, AnalysisError) as e:
        print(f"Page unifiée refusée : {e}", file=sys.stderr)
        sys.exit(1)
    out = args.out or args.spec_json.parent / "viz_unifiee"
    write_unified_viz(data, out)
    print(f"Page unifiée écrite : {out / 'index.html'}")


if __name__ == "__main__":
    main()
