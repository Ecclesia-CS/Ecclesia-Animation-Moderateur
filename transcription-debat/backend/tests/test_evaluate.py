import pytest

from evaluate import make_reference_text, score_reference, parse_windows


SEGS = [
    {"start": 455.0, "end": 462.0, "speaker": "Interlocuteur 1", "text": "avant la fenêtre", "refused": False},
    {"start": 462.0, "end": 470.0, "speaker": "Interlocuteur 2", "text": "Je dirais que la laïcité compte.", "refused": False},
    {"start": 470.0, "end": 480.0, "speaker": "[?]", "text": "Oui, tout à fait.", "refused": False},
    {"start": 800.0, "end": 810.0, "speaker": "Interlocuteur 1", "text": "après la fenêtre", "refused": False},
]


def test_parse_windows():
    assert parse_windows("460-760,4300-4600") == [(460.0, 760.0), (4300.0, 4600.0)]


def test_make_reference_text_prefills_window_only():
    txt = make_reference_text(SEGS, (460.0, 760.0), "71B505", clip_name="extrait_1.mp3")
    assert "# fenetre: 460.0-760.0" in txt
    assert "[00:07:42] Interlocuteur 2: Je dirais que la laïcité compte." in txt
    assert "[00:07:50] [?]: Oui, tout à fait." in txt
    assert "avant la fenêtre" not in txt and "après la fenêtre" not in txt
    assert "extrait_1.mp3" in txt


def test_score_reference_perfect_then_errors():
    ref = make_reference_text(SEGS, (460.0, 760.0), "71B505")
    perfect = score_reference(ref, SEGS)
    assert perfect["wer"] == 0.0 and perfect["wder"] == 0.0
    # la référence corrigée à l'écoute : le [?] est en fait Interlocuteur 1, et un mot différait
    corrected = ref.replace("[?]: Oui, tout à fait.", "Interlocuteur 1: Oui, tout à fait.") \
                   .replace("la laïcité compte", "la laïcité compte vraiment")
    r = score_reference(corrected, SEGS)
    assert r["ref_words"] == 11
    assert r["wer"] == pytest.approx(1 / 11)       # « vraiment » manquant
    assert r["wder"] == pytest.approx(4 / 10)      # 4 mots de « oui tout à fait » mal attribués


def test_score_reference_requires_window_header():
    with pytest.raises(ValueError):
        score_reference("[00:00:01] A: bonjour", SEGS)
