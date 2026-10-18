"""Recalage des frontières de tours du log Ecclesia sur la parole réelle.

Le log horodate le CLIC du modérateur, pas la fin de la parole : sur 71B505,
27 des 35 changements d'orateur coupaient une phrase (la fin de phrase du sortant
était attribuée à l'entrant). En conversation, les changements de locuteur se
font aux « points de transition » (fin d'unité syntaxique/prosodique, Sacks,
Schegloff & Jefferson 1974) et l'écart entre deux tours est court (quelques
centaines de ms, Stivers et al. 2009) : on déplace donc chaque frontière, dans
une fenêtre de quelques secondes autour du clic, vers la coupure la plus
crédible entre deux mots :

  1. un changement de voix détecté par la diarisation (si disponible) ;
  2. sinon une fin de phrase (ponctuation Whisper . ? ! …) ;
  3. sinon une pause d'au moins MIN_PAUSE s ;
  4. sinon on garde l'heure du log.

À priorité égale, la coupure la plus proche du clic l'emporte. Les heures du log
sont conservées (debut_sec_log / fin_sec_log) pour traçabilité.

RGPD : un tour refusé ([REFUS]) n'est jamais réduit — ses frontières ne peuvent
que s'élargir, pour ne jamais exposer la parole d'une personne qui a refusé.
"""
import re

SNAP_BEFORE = 4.0   # s cherchés avant l'heure du clic
SNAP_AFTER = 6.0    # s cherchés après (le sortant finit souvent sa phrase après le clic)
MIN_PAUSE = 0.3     # silence minimal (s) pour qu'une pause soit une coupure crédible
MIN_TURN = 0.5      # un tour recalé garde au moins cette durée (s)
CONTIGUOUS_TOL = 0.5  # deux tours séparés de moins de 0,5 s partagent la même frontière
VOICE_TOL = 0.3     # un changement de voix à ± 0,3 s d'un silence inter-mots le désigne

_SENTENCE_END = re.compile(r"[.?!…]$")
_CLOSERS = "\"'»”)] "

# Classes de coupure (plus petit = plus fiable)
_VOICE, _SENTENCE, _PAUSE = 0, 1, 2


def _is_sentence_end(text: str) -> bool:
    return bool(_SENTENCE_END.search(text.rstrip(_CLOSERS)))


def _candidates(words: list[dict], ref: float, lo: float, hi: float, change_points) -> list[tuple[int, float]]:
    """Coupures possibles entre deux mots consécutifs, dans [lo, hi].

    Le point de coupure est l'instant du silence inter-mots le plus proche de ref
    (l'heure du clic) : si le clic tombe déjà dans le silence, on ne le bouge pas.
    """
    cands: list[tuple[int, float]] = []
    for a, b in zip(words, words[1:]):
        gap = b["start"] - a["end"]
        cut = min(max(ref, a["end"]), b["start"]) if gap > 0 else a["end"]
        if not (lo <= cut <= hi):
            continue
        if any(a["end"] - VOICE_TOL <= c <= b["start"] + VOICE_TOL for c in change_points):
            cls = _VOICE
        elif _is_sentence_end(a["text"]):
            cls = _SENTENCE
        elif gap >= MIN_PAUSE:
            cls = _PAUSE
        else:
            continue
        cands.append((cls, cut))
    return cands


def _choose(words, b: float, lo: float, hi: float, change_points) -> float:
    if lo > hi:
        return b
    cands = _candidates(words, b, lo, hi, change_points)
    if not cands:
        return b
    best = min(cls for cls, _ in cands)
    return min((cut for cls, cut in cands if cls == best), key=lambda t: abs(t - b))


def snap_turn_boundaries(
    turns: list[dict],
    words: list[dict],
    change_points=None,
    before: float = SNAP_BEFORE,
    after: float = SNAP_AFTER,
) -> list[dict]:
    """Retourne une copie des tours (triés) avec debut_sec/fin_sec recalés.

    words : mots Whisper horodatés ({start, end, text}), triés.
    change_points : instants de changement de voix (diarisation), optionnels.
    """
    change_points = sorted(change_points or [])
    words = sorted(words, key=lambda w: w["start"])
    out = [
        {**t, "debut_sec_log": t["debut_sec"], "fin_sec_log": t["fin_sec"]}
        for t in sorted(turns, key=lambda t: t["debut_sec"])
    ]
    inf = float("inf")

    for i, t in enumerate(out):
        prev = out[i - 1] if i > 0 else None
        nxt = out[i + 1] if i + 1 < len(out) else None

        # Début de tour non partagé (premier tour, ou tour précédé d'un silence du log)
        if prev is None or t["debut_sec"] - prev["fin_sec"] > CONTIGUOUS_TOL:
            b = t["debut_sec"]
            lo = max(prev["fin_sec"] if prev else -inf, b - before)
            hi = min(t["fin_sec"] - MIN_TURN, b + after)
            if t["refuse"]:
                hi = min(hi, b)       # un refus ne peut que commencer plus tôt
            if prev is not None and prev["refuse"]:
                lo = max(lo, prev["fin_sec"])
            t["debut_sec"] = _choose(words, b, lo, hi, change_points)

        b = t["fin_sec"]
        if nxt is not None and nxt["debut_sec"] - b <= CONTIGUOUS_TOL:
            # Frontière partagée entre deux tours consécutifs
            lo = max(t["debut_sec"] + MIN_TURN, b - before)
            hi = min(nxt["fin_sec"] - MIN_TURN, b + after)
            if t["refuse"]:
                lo = max(lo, b)       # le refus sortant ne peut que finir plus tard
            if nxt["refuse"]:
                hi = min(hi, nxt["debut_sec"])  # le refus entrant ne peut que commencer plus tôt
            cut = _choose(words, b, lo, hi, change_points)
            t["fin_sec"] = cut
            nxt["debut_sec"] = min(cut, nxt["debut_sec"]) if nxt["refuse"] else cut
        else:
            # Fin de tour suivie d'un silence du log (ou dernier tour)
            lo = max(t["debut_sec"] + MIN_TURN, b - before)
            hi = b + after
            if nxt is not None:
                hi = min(hi, nxt["fin_sec"] - MIN_TURN)
                if nxt["refuse"]:
                    hi = min(hi, nxt["debut_sec"])
            if t["refuse"]:
                lo = max(lo, b)
            t["fin_sec"] = _choose(words, b, lo, hi, change_points)
            if nxt is not None and nxt["debut_sec"] < t["fin_sec"]:
                nxt["debut_sec"] = t["fin_sec"]
    return out


def boundary_cut_report(segments: list[dict], max_gap: float = 1.0) -> dict:
    """Compte les changements d'orateur qui coupent une phrase.

    Indicateur indirect de la justesse des frontières : le segment sortant ne se
    termine pas par une ponctuation de fin de phrase ET l'entrant commence par une
    minuscule (suite de phrase). Seuls les changements séparés de ≤ max_gap s comptent.
    """
    changes = mid = 0
    for a, b in zip(segments, segments[1:]):
        if a["speaker"] == b["speaker"] or b["start"] - a["end"] > max_gap:
            continue
        changes += 1
        nxt = b["text"].removeprefix("[HORS-DÉBAT]").lstrip()
        if not _is_sentence_end(a["text"]) and nxt[:1].islower():
            mid += 1
    return {"changes": changes, "mid_sentence": mid}
