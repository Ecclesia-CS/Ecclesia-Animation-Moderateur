"""Mesure de la qualité d'un transcript.

Deux familles de mesures :

1. Indicateurs SANS référence (transcript_metrics) — calculables sur n'importe
   quel transcript, pour comparer deux versions du pipeline : part de parole
   non attribuée ([?]), provenance de l'attribution (log, voix, les deux…),
   changements d'orateur qui coupent une phrase, artefacts de recollage, mots
   que Whisper a peu sûrement reconnus. Ce sont des indices, pas des preuves.

2. Mesures AVEC référence (wer_wder) — sur un extrait corrigé à l'écoute :
   - WER (word error rate) : (substitutions + suppressions + insertions) / mots
     de la référence, après alignement de Levenshtein — mesure standard de la
     reconnaissance vocale (Radford et al. 2023 pour Whisper) ;
   - WDER (word diarization error rate, Shafey, Soltau & Shafran 2019) : part
     des mots alignés (corrects ou substitués) attribués au mauvais orateur.
"""
import re
import unicodedata

from boundaries import boundary_cut_report

_LEGACY = re.compile(r"\w '\w|\w -[^\W\d_]")
_TS_LINE = re.compile(r"^\[(\d+):(\d{2}):(\d{2})\]\s*([^:]+?):\s?(.*)$")


def transcript_metrics(segments: list[dict]) -> dict:
    total = sum(s["end"] - s["start"] for s in segments)
    by_source: dict[str, float] = {}
    for s in segments:
        src = s.get("speaker_source", "non renseignée")
        by_source[src] = by_source.get(src, 0.0) + (s["end"] - s["start"])
    unknown = sum(s["end"] - s["start"] for s in segments if s["speaker"] == "[?]")
    cuts = boundary_cut_report(segments)
    return {
        "segments": len(segments),
        "duration_sec": total,
        "by_source_sec": by_source,
        "unknown_ratio": unknown / total if total else 0.0,
        "speaker_changes": cuts["changes"],
        "mid_sentence_cuts": cuts["mid_sentence"],
        "legacy_join_artifacts": sum(len(_LEGACY.findall(s["text"])) for s in segments),
        "low_conf_words": sum(len(s.get("low_conf_words", [])) for s in segments),
    }


_CAP_WORD = re.compile(r"^[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’-]{2,}$")
_LABELS = {"Interlocuteur", "Modérateur"}


def proper_noun_candidates(segments: list[dict]) -> list[tuple[str, int]]:
    """Noms propres présents dans le texte, à relire (prénoms non masqués ?).

    Un mot à majuscule dont la forme en minuscules n'apparaît jamais ailleurs dans
    le transcript est probablement un nom propre (lieu, auteur… ou prénom d'un
    participant resté visible). Liste d'aide à la relecture RGPD, triée par
    fréquence — elle ne modifie rien.
    """
    texts = [s["text"] for s in segments if not s.get("refused")]
    lower = {w.lower() for t in texts for w in re.findall(r"[\w'’-]+", t) if w.islower()}
    counts: dict[str, int] = {}
    for t in texts:
        for tok in t.split():
            w = tok.strip(".,;:!?…\"'«»()[]")
            if _CAP_WORD.match(w) and w not in _LABELS and w.lower() not in lower:
                counts[w] = counts.get(w, 0) + 1
    return sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))


def normalize_tokens(text: str) -> list[str]:
    """Normalisation pour le WER : minuscules, sans ponctuation ni balises ; l'élision
    est un mot à part (« l' état ») et le trait d'union sépare (« est ce »)."""
    text = unicodedata.normalize("NFC", text).lower()
    text = re.sub(r"\[[^\]]*\]", " ", text)          # [HORS-DÉBAT], [prénom]…
    text = text.replace("’", "'").replace("-", " ")
    text = re.sub(r"(\w')", r"\1 ", text)            # l'état → l' état
    text = re.sub(r"[^\w' ]", " ", text)
    return [t for t in text.split() if t.strip("'")]


def align(ref: list[str], hyp: list[str]) -> list[tuple[str, int | None, int | None]]:
    """Alignement de Levenshtein. Retourne [(op, i_ref, j_hyp)], op ∈ ok|sub|del|ins."""
    n, m = len(ref), len(hyp)
    d = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        d[i][0] = i
    for j in range(1, m + 1):
        d[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            cost = 0 if ref[i - 1] == hyp[j - 1] else 1
            d[i][j] = min(d[i - 1][j - 1] + cost, d[i - 1][j] + 1, d[i][j - 1] + 1)
    ops = []
    i, j = n, m
    while i > 0 or j > 0:
        if i > 0 and j > 0 and d[i][j] == d[i - 1][j - 1] + (0 if ref[i - 1] == hyp[j - 1] else 1):
            ops.append(("ok" if ref[i - 1] == hyp[j - 1] else "sub", i - 1, j - 1))
            i, j = i - 1, j - 1
        elif i > 0 and d[i][j] == d[i - 1][j] + 1:
            ops.append(("del", i - 1, None))
            i -= 1
        else:
            ops.append(("ins", None, j - 1))
            j -= 1
    return ops[::-1]


def wer_wder(ref: list[tuple[str, str]], hyp: list[tuple[str, str]]) -> dict:
    """ref/hyp : [(mot normalisé, orateur)]. Retourne WER, WDER et les comptes."""
    ops = align([w for w, _ in ref], [w for w, _ in hyp])
    counts = {"ok": 0, "sub": 0, "del": 0, "ins": 0}
    aligned = wrong_spk = 0
    for op, i, j in ops:
        counts[op] += 1
        if op in ("ok", "sub"):
            aligned += 1
            if ref[i][1] != hyp[j][1]:
                wrong_spk += 1
    n = len(ref)
    return {
        "wer": (counts["sub"] + counts["del"] + counts["ins"]) / n if n else 0.0,
        "wder": wrong_spk / aligned if aligned else 0.0,
        "ref_words": n,
        **counts,
    }


def parse_reference_txt(text: str) -> list[tuple[float, str, str]]:
    """Lit un extrait de référence « [hh:mm:ss] Orateur: texte » (lignes # ignorées)."""
    out = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = _TS_LINE.match(line)
        if m:
            h, mi, se, spk, txt = m.groups()
            out.append((int(h) * 3600 + int(mi) * 60 + int(se), spk.strip(), txt.strip()))
    return out
