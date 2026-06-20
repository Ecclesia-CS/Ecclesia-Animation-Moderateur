import pytest
from deduplicate import deduplicate, _dedup_intra, _dedup_noise, _dedup_inter


def _seg(text, speaker="Interlocuteur 1", start=0.0, end=1.0, refused=False):
    return {"text": text, "speaker": speaker, "start": start, "end": end, "refused": refused}


# --- _dedup_intra ---

def test_intra_removes_exact_repeated_sentence():
    result = _dedup_intra("Est-ce que c'est vrai ? Est-ce que c'est vrai ?")
    assert result == "Est-ce que c'est vrai ?"


def test_intra_removes_sentence_repeated_four_times():
    result = _dedup_intra("Non. Non. Non. Non.")
    assert result.count("Non") == 1


def test_intra_keeps_distinct_sentences():
    text = "Bonjour. Comment allez-vous ?"
    assert _dedup_intra(text) == text


def test_intra_empty_string():
    assert _dedup_intra("") == ""


def test_intra_single_sentence_unchanged():
    assert _dedup_intra("Bonjour.") == "Bonjour."


# --- _dedup_noise ---

def test_noise_removes_short_repeated_tokens():
    assert _dedup_noise("ta ta ta ta ta") == "ta"


def test_noise_keeps_normal_text():
    text = "Bonjour à tous les participants"
    assert _dedup_noise(text) == text


def test_noise_removes_four_identical_short_words():
    result = _dedup_noise("non non non non")
    assert result.lower().count("non") == 1


def test_noise_collapses_double_spaces_after_removal():
    # "na na na na bonjour" → after token removal → "na  bonjour" (double space)
    # The cleanup should collapse it to "na bonjour"
    result = _dedup_noise("na na na na bonjour")
    assert "  " not in result  # no double spaces
    assert result.strip() != ""


def test_noise_collapses_exactly_three_reps():
    # NOISE_MIN_REPS=3: "ta ta ta" must be collapsed
    result = _dedup_noise("ta ta ta")
    assert result == "ta"


def test_noise_keeps_two_reps():
    # fewer than NOISE_MIN_REPS: "ta ta" must not be touched
    result = _dedup_noise("ta ta")
    assert result == "ta ta"


# --- _dedup_inter ---

def test_inter_removes_exact_duplicate_consecutive_segments():
    segs = [
        _seg("Bonjour à tous, merci d'être là.", start=0.0, end=2.0),
        _seg("Bonjour à tous, merci d'être là.", start=2.0, end=4.0),
    ]
    result = _dedup_inter(segs)
    assert len(result) == 1
    assert result[0]["end"] == 4.0


def test_inter_keeps_distinct_segments():
    segs = [_seg("Bonjour.", start=0.0, end=1.0), _seg("Au revoir.", start=1.0, end=2.0)]
    assert len(_dedup_inter(segs)) == 2


def test_inter_keeps_longer_text_when_merging():
    # Whisper sometimes outputs the same question twice with minor extension
    # Verified similarity: 0.9451 (well above 0.90 threshold)
    segs = [
        _seg("Est-ce que c'est viable sur le long terme ?", start=0.0, end=2.0),
        _seg("Est-ce que c'est viable sur le long terme ? Oui.", start=2.0, end=4.0),
    ]
    result = _dedup_inter(segs)
    assert len(result) == 1
    assert "Oui" in result[0]["text"]
    assert result[0]["end"] == 4.0


def test_inter_does_not_merge_across_refused_segment():
    segs = [
        _seg("Bonjour.", start=0.0, end=1.0),
        {"text": "[N'a pas souhaité...]", "speaker": "[REFUS]", "start": 1.0, "end": 2.0, "refused": True},
        _seg("Bonjour.", start=2.0, end=3.0),
    ]
    result = _dedup_inter(segs)
    assert len(result) == 3


def test_inter_empty_list():
    assert _dedup_inter([]) == []


# --- deduplicate (end-to-end) ---

def test_deduplicate_noop_on_clean_segments():
    segs = [_seg("Bonjour.", start=0.0, end=1.0), _seg("Au revoir.", start=1.0, end=2.0)]
    result = deduplicate(segs)
    assert len(result) == 2
    assert result[0]["text"] == "Bonjour."


def test_deduplicate_preserves_refused_unchanged():
    segs = [{"text": "[N'a pas souhaité...]", "speaker": "[REFUS]", "start": 0.0, "end": 1.0, "refused": True}]
    result = deduplicate(segs)
    assert result[0]["refused"] is True
    assert result[0]["text"] == "[N'a pas souhaité...]"


def test_deduplicate_intra_then_inter_combined():
    segs = [
        _seg("Est-ce vrai ? Est-ce vrai ? Est-ce vrai ?", start=0.0, end=3.0),
        _seg("Est-ce vrai ?", start=3.0, end=4.0),
    ]
    result = deduplicate(segs)
    assert len(result) == 1
    assert result[0]["end"] == 4.0


def test_deduplicate_empty():
    assert deduplicate([]) == []


def test_deduplicate_does_not_mutate_input():
    original_text = "Non. Non. Non. Non."
    segs = [_seg(original_text)]
    deduplicate(segs)
    assert segs[0]["text"] == original_text
