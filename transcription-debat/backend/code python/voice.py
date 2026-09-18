"""Identification des voix, ancrée sur le log Ecclesia.

La diarisation acoustique (pyannote 3.1 : segmentation « powerset » + empreintes
vocales WeSpeaker ResNet34 + clustering — Plaquet & Bredin 2023 ; Bredin 2023 ;
Wang et al. 2023) dit QUI PARLE QUAND, sous forme de voix anonymes (S0, S1…).
Le log Ecclesia dit QUI A LA PAROLE OFFICIELLEMENT. On croise les deux :

  - au cœur des tours du log (loin des frontières, où le détenteur est quasi sûr),
    on mesure quelle voix parle : une voix très majoritairement présente dans les
    tours d'un même participant est rattachée à ce participant (pureté + support
    minimal), sans jamais demander son avis à un LLM ;
  - le décalage d'horloge audio↔log est affiné en maximisant cette pureté ;
  - la fiabilité du rattachement est mesurée par validation croisée sur les tours
    du log (holdout_agreement) — le log sert de vérité terrain bruitée.

Une voix qui ne se rattache à aucun participant est soit « faible » (trop peu de
parole pour conclure), soit « fusionnee » (dominante dans les tours de plusieurs
participants : la diarisation a mélangé des voix → inutilisable), soit
« distincte » (minoritaire partout : typiquement le modérateur ou une personne
hors log) — on la garde comme voix anonyme cohérente, sans lui inventer d'identité.
"""
import bisect
import json
from pathlib import Path

REFUS = "[REFUS]"

MAP_MARGIN = 1.0       # s retirées à chaque bord de tour (zones de frontière incertaines)
MIN_SUPPORT = 15.0     # s de parole minimum au cœur des tours pour rattacher une voix
MIN_PURITY = 0.6       # part minimale de la parole d'une voix dans les tours d'UN participant
MIN_WORD_COVER = 0.5   # une voix doit couvrir ≥ 50 % d'un mot pour le revendiquer


def _label(turn: dict) -> str:
    return REFUS if turn.get("refuse") else turn["interlocuteur"]


class _Index:
    """Recherche rapide des segments de diarisation recouvrant un intervalle."""

    def __init__(self, diar: list[dict]):
        self.segs = sorted(diar, key=lambda s: s["start"])
        self.starts = [s["start"] for s in self.segs]
        self.maxlen = max((s["end"] - s["start"] for s in self.segs), default=0.0)

    def overlapping(self, a: float, b: float):
        i = bisect.bisect_left(self.starts, b)
        j = bisect.bisect_left(self.starts, a - self.maxlen)
        for s in self.segs[j:i]:
            ov = min(b, s["end"]) - max(a, s["start"])
            if ov > 0 or (a == b and s["start"] <= a <= s["end"]):
                yield s, max(ov, 0.0)


def shift_turns(turns: list[dict], shift: float) -> list[dict]:
    return [{**t, "debut_sec": t["debut_sec"] + shift, "fin_sec": t["fin_sec"] + shift} for t in turns]


def overlap_matrix(turns, diar, margin: float = MAP_MARGIN, shift: float = 0.0, index=None) -> dict:
    """Temps (s) de chaque voix au cœur des tours de chaque participant : {(voix, label): s}."""
    idx = index or _Index(diar)
    m: dict[tuple[str, str], float] = {}
    for t in turns:
        a, b = t["debut_sec"] + shift + margin, t["fin_sec"] + shift - margin
        if b <= a:
            continue
        lab = _label(t)
        for s, ov in idx.overlapping(a, b):
            if ov > 0:
                m[(s["speaker"], lab)] = m.get((s["speaker"], lab), 0.0) + ov
    return m


def _purity(m: dict) -> float:
    per_voice: dict[str, dict[str, float]] = {}
    for (v, lab), sec in m.items():
        per_voice.setdefault(v, {})[lab] = sec
    total = sum(m.values())
    if total <= 0:
        return 0.0
    return sum(max(d.values()) for d in per_voice.values()) / total


def refine_offset(turns, diar, search: float = 20.0, step: float = 0.5):
    """Décalage (s) à ajouter aux tours pour que les voix collent au mieux aux tours.

    Critère : pureté du croisement voix×participants (sans marge, pour que le
    critère soit piqué). En cas de plateau, on prend son centre. Retourne
    (meilleur_décalage, courbe [(décalage, pureté)]).
    """
    idx = _Index(diar)
    n = int(round(2 * search / step))
    curve = []
    for k in range(n + 1):
        shift = -search + k * step
        curve.append((shift, _purity(overlap_matrix(turns, diar, margin=0.0, shift=shift, index=idx))))
    best = max(p for _, p in curve)
    tied = [s for s, p in curve if p >= best - 1e-9]
    return tied[len(tied) // 2], curve


def _dominant_voices(turns, diar, margin, idx) -> list[tuple[dict, str | None]]:
    out = []
    for t in turns:
        a, b = t["debut_sec"] + margin, t["fin_sec"] - margin
        acc: dict[str, float] = {}
        if b > a:
            for s, ov in idx.overlapping(a, b):
                acc[s["speaker"]] = acc.get(s["speaker"], 0.0) + ov
        out.append((t, max(acc, key=acc.get) if acc else None))
    return out


def map_clusters(
    turns, diar, margin: float = MAP_MARGIN, min_support: float = MIN_SUPPORT, min_purity: float = MIN_PURITY,
) -> dict:
    """Rattache chaque voix de la diarisation à un participant du log, ou non.

    Retour : {voix: {"label": str|None, "kind": identifiee|faible|fusionnee|distincte,
                     "best": label majoritaire, "purity": float, "support": s}}
    """
    idx = _Index(diar)
    m = overlap_matrix(turns, diar, margin=margin, index=idx)
    dominant_labels: dict[str, set[str]] = {}
    for t, v in _dominant_voices(turns, diar, margin, idx):
        if v is not None:
            dominant_labels.setdefault(v, set()).add(_label(t))

    result = {}
    for v in sorted({s["speaker"] for s in diar}):
        per_lab = {lab: sec for (vv, lab), sec in m.items() if vv == v}
        support = sum(per_lab.values())
        best = max(per_lab, key=per_lab.get) if per_lab else None
        purity = per_lab[best] / support if support > 0 else 0.0
        if support < min_support:
            kind, label = "faible", None
        elif purity >= min_purity:
            kind, label = "identifiee", best
        elif len(dominant_labels.get(v, set())) >= 2:
            kind, label = "fusionnee", None
        else:
            kind, label = "distincte", None
        result[v] = {"label": label, "kind": kind, "best": best, "purity": purity, "support": support}
    return result


def holdout_agreement(turns, diar, margin: float = MAP_MARGIN, **map_kw) -> dict:
    """Fiabilité du rattachement voix→participant, par validation croisée à 2 plis.

    Les tours de chaque participant sont répartis en alternance entre deux plis ;
    on rattache les voix sur un pli et on mesure, sur l'autre, la part du temps de
    parole (voix rattachées, cœur des tours) où la voix désigne bien le détenteur
    du tour selon le log. Le log n'est pas une vérité parfaite (interruptions,
    relances du modérateur) : c'est une borne basse de la fiabilité réelle.
    """
    folds: tuple[list, list] = ([], [])
    seen: dict[str, int] = {}
    for t in sorted(turns, key=lambda t: t["debut_sec"]):
        lab = _label(t)
        folds[seen.get(lab, 0) % 2].append(t)
        seen[lab] = seen.get(lab, 0) + 1

    idx = _Index(diar)
    agree = mapped = voiced = 0.0
    for train, test in ((folds[0], folds[1]), (folds[1], folds[0])):
        mapping = map_clusters(train, diar, margin=margin, **map_kw)
        for t in test:
            a, b = t["debut_sec"] + margin, t["fin_sec"] - margin
            if b <= a:
                continue
            for s, ov in idx.overlapping(a, b):
                voiced += ov
                lab = mapping.get(s["speaker"], {}).get("label")
                if lab is not None:
                    mapped += ov
                    if lab == _label(t):
                        agree += ov
    return {
        "agreement": agree / mapped if mapped else 0.0,
        "coverage": mapped / voiced if voiced else 0.0,
        "evaluated_sec": mapped,
    }


def voice_of_word(word: dict, diar, index=None, min_cover: float = MIN_WORD_COVER) -> str | None:
    """Voix qui prononce ce mot, ou None (aucune voix, ou parole superposée ambiguë)."""
    idx = index or _Index(diar)
    a, b = word["start"], word["end"]
    dur = b - a
    covering = set()
    for s, ov in idx.overlapping(a, b):
        if dur <= 0 or ov >= min_cover * dur:
            covering.add(s["speaker"])
    return covering.pop() if len(covering) == 1 else None


def change_points(diar) -> list[float]:
    """Instants où la voix change (milieu du passage d'une voix à une autre)."""
    segs = sorted(diar, key=lambda s: s["start"])
    return [
        (a["end"] + b["start"]) / 2
        for a, b in zip(segs, segs[1:])
        if a["speaker"] != b["speaker"]
    ]


def save_diarization(path, segments: list[dict], centroids: dict | None = None, **meta) -> None:
    payload = {**meta, "segments": segments}
    if centroids is not None:
        payload["centroids"] = centroids
    Path(path).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def load_diarization(path) -> list[dict]:
    return json.loads(Path(path).read_text(encoding="utf-8"))["segments"]
