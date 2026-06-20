import re
from difflib import SequenceMatcher

INTRA_THRESHOLD = 0.85
INTER_THRESHOLD = 0.90
NOISE_MIN_REPS = 3
NOISE_MAX_TOKEN_LEN = 5


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio()


def _split_sentences(text: str) -> list[str]:
    parts = re.split(r'(?<=[.?!…])\s+', text)
    return [p.strip() for p in parts if p.strip()]


def _dedup_intra(text: str) -> str:
    """Supprime les phrases quasi-identiques consécutives au sein d'un segment."""
    sentences = _split_sentences(text)
    if not sentences:
        return text
    result = [sentences[0]]
    for sent in sentences[1:]:
        if _similarity(sent, result[-1]) < INTRA_THRESHOLD:
            result.append(sent)
    return " ".join(result)


def _dedup_noise(text: str) -> str:
    """Supprime les tokens courts répétés >= 3 fois (ex : 'ta ta ta ta ta')."""
    pattern = rf'\b(\S{{1,{NOISE_MAX_TOKEN_LEN}}}[.!?]?)\s+(?:\1\s+){{{NOISE_MIN_REPS - 1},}}\1?'
    cleaned = re.sub(pattern, r'\1', text, flags=re.IGNORECASE)
    return re.sub(r'\s{2,}', ' ', cleaned).strip()


def _dedup_inter(segments: list[dict]) -> list[dict]:
    """Fusionne les segments consécutifs quasi-identiques (hallucinations inter-segments)."""
    if not segments:
        return []
    result = [dict(segments[0])]
    for seg in segments[1:]:
        if seg.get("refused"):
            result.append(dict(seg))
            continue
        prev = result[-1]
        if prev.get("refused"):
            result.append(dict(seg))
            continue
        if _similarity(seg["text"], prev["text"]) >= INTER_THRESHOLD:
            if len(seg["text"]) > len(prev["text"]):
                result[-1] = {**result[-1], "text": seg["text"], "end": seg["end"]}
            else:
                result[-1] = {**result[-1], "end": seg["end"]}
        else:
            result.append(dict(seg))
    return result


def deduplicate(segments: list[dict]) -> list[dict]:
    """Applique les 3 passes de déduplication. Non-mutant — retourne une nouvelle liste."""
    result = []
    for seg in segments:
        if seg.get("refused"):
            result.append(dict(seg))
            continue
        text = _dedup_intra(seg["text"])
        text = _dedup_noise(text)
        result.append({**seg, "text": text})
    return _dedup_inter(result)
