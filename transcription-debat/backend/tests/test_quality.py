import pytest

from quality import transcript_metrics, normalize_tokens, align, wer_wder, parse_reference_txt


def _s(a, b, spk, text, **kw):
    return {"start": a, "end": b, "speaker": spk, "text": text, "refused": False, **kw}


def test_transcript_metrics_sources_unknown_and_cuts():
    segs = [
        _s(0, 10, "A", "je pense que ça exerce", speaker_source="log+voix", low_conf_words=["exerce"]),
        _s(10, 12, "B", "une certaine influence.", speaker_source="log"),
        _s(12, 20, "[?]", "bon c 'est ça", speaker_source="aucune"),
    ]
    m = transcript_metrics(segs)
    assert m["duration_sec"] == pytest.approx(20)
    assert m["by_source_sec"] == {"log+voix": 10, "log": 2, "aucune": 8}
    assert m["unknown_ratio"] == pytest.approx(0.4)
    assert m["speaker_changes"] == 2 and m["mid_sentence_cuts"] == 1
    assert m["legacy_join_artifacts"] == 1
    assert m["low_conf_words"] == 1


def test_transcript_metrics_legacy_without_source():
    m = transcript_metrics([_s(0, 5, "A", "x")])
    assert m["by_source_sec"] == {"non renseignée": 5}


def test_normalize_tokens_french():
    assert normalize_tokens("L'état, est-ce qu’il « va » bien ? [HORS-DÉBAT] Oui…") == \
        ["l'", "état", "est", "ce", "qu'", "il", "va", "bien", "oui"]


def test_align_counts_edits():
    ops = align(["a", "b", "c", "d"], ["a", "x", "c"])
    kinds = [o[0] for o in ops]
    assert kinds.count("ok") == 2 and kinds.count("sub") == 1 and kinds.count("del") == 1


def test_wer_wder():
    ref = [("le", "A"), ("chat", "A"), ("dort", "A"), ("oui", "B")]
    hyp = [("le", "A"), ("chien", "A"), ("dort", "B"), ("oui", "B")]
    r = wer_wder(ref, hyp)
    assert r["wer"] == pytest.approx(0.25)
    assert r["ref_words"] == 4
    # WDER = (S_IS + C_IS) / (S + C) (Shafey et al. 2019) : 4 mots alignés
    # (3 corrects + 1 substitué) dont « dort » mal attribué → 1/4
    assert r["wder"] == pytest.approx(0.25)


def test_parse_reference_txt_skips_comments():
    txt = "# consignes\n# ...\n[00:07:40] Interlocuteur 1: Bonjour à tous.\n\n[00:07:45] Interlocuteur 2: Merci.\n"
    lines = parse_reference_txt(txt)
    assert lines == [(460.0, "Interlocuteur 1", "Bonjour à tous."), (465.0, "Interlocuteur 2", "Merci.")]


def test_proper_noun_candidates_skips_ordinary_words_and_labels():
    from quality import proper_noun_candidates
    segs = [
        _s(0, 1, "A", "Mais c'est Zélie qui m'a aidé. Et mais oui, Interlocuteur 3 le dit."),
        _s(1, 2, "B", "En France, Mais bon, comme le dit Spinoza à Zélie en passant."),
        _s(2, 3, "B", "[N'a pas souhaité être enregistré(e)]", refused=True),
    ]
    assert proper_noun_candidates(segs) == [("Zélie", 2), ("France", 1), ("Spinoza", 1)]
