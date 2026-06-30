# backend/tests/test_analyze_debate.py
import json
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock

SEGMENTS = [
    {"start": 0.0,   "end": 60.0,  "speaker": "Modérateur",      "text": "Bonjour, on commence.", "refused": False},
    {"start": 60.0,  "end": 180.0, "speaker": "Interlocuteur 1", "text": "Je pense que la liberté prime.", "refused": False},
    {"start": 180.0, "end": 240.0, "speaker": "Interlocuteur 2", "text": "Pas d'accord, l'égalité d'abord.", "refused": False},
    {"start": 240.0, "end": 300.0, "speaker": "[REFUS]",         "text": "[N'a pas souhaité être enregistré(e)]", "refused": True},
    {"start": 300.0, "end": 320.0, "speaker": "[REFUS]",         "text": "[N'a pas souhaité être enregistré(e)]", "refused": True},
    {"start": 320.0, "end": 600.0, "speaker": "Interlocuteur 1", "text": "Je maintiens ma position.", "refused": False},
]


def test_compute_voices_excludes_refus_and_unknown():
    from analyze_debate import compute_voices
    voices = compute_voices(SEGMENTS)
    ids = {v["id"] for v in voices}
    assert ids == {"anim", "i1", "i2"}


def test_compute_voices_weight_and_entry():
    from analyze_debate import compute_voices
    voices = {v["id"]: v for v in compute_voices(SEGMENTS)}
    # i1 parle 120 + 280 = 400 s (le plus), poids = 1.0 ; entrée à 1.0 min
    assert voices["i1"]["weight"] == pytest.approx(1.0)
    assert voices["i1"]["entry"] == pytest.approx(1.0)
    # i2 parle 60 s ; poids = 60/400 = 0.15
    assert voices["i2"]["weight"] == pytest.approx(0.15, abs=0.01)


def test_compute_voices_moderator_color():
    from analyze_debate import compute_voices, MODERATOR_COLOR
    voices = {v["id"]: v for v in compute_voices(SEGMENTS)}
    assert voices["anim"]["color"] == MODERATOR_COLOR
    assert voices["i1"]["label"] == "Interlocuteur 1"


def test_compute_refus_merges_intervals():
    from analyze_debate import compute_refus
    refus, redacted, duration = compute_refus(SEGMENTS)
    # Les deux segments refused 240-300 et 300-320 fusionnent en [4.0, 5.33]
    assert refus == [[4.0, 5.3]]
    assert redacted == pytest.approx(1.3, abs=0.1)
    assert duration == pytest.approx(10.0)


def test_build_meta():
    from analyze_debate import build_meta
    meta = build_meta(SEGMENTS, "Retraites", "0F6A9E", "2026-05-28", 1.3, 10.0)
    assert meta["topic"] == "Retraites"
    assert meta["code"] == "0F6A9E"
    assert meta["totalDurationMinutes"] == pytest.approx(10.0)


# Validators tests (Task 2)

VOICE_IDS = {"i1", "i2", "anim"}
SCHOOL_IDS = {"lib", "sol"}


def test_validate_frame_ok():
    from analyze_debate import validate_frame
    frame = {
        "axes": {
            "x": {"leftLabel": "Liberté", "rightLabel": "Égalité"},
            "y": {"bottomLabel": "Technique", "topLabel": "Principes"},
            "quadrants": {"topLeft": "a", "topRight": "b", "bottomLeft": "c", "bottomRight": "d"},
        },
        "personas_interp": {"i1": {"camp": "Libéral", "note": "x", "pos": [-8, 6]}},
        "schools": [{"id": "lib", "label": "Libéraux", "cx": -8, "cy": 6, "rx": 2, "ry": 2, "members": ["i1"]}],
    }
    assert validate_frame(frame, VOICE_IDS) is True


def test_validate_frame_rejects_unknown_voice():
    from analyze_debate import validate_frame
    frame = {
        "axes": {"x": {"leftLabel": "a", "rightLabel": "b"},
                 "y": {"bottomLabel": "c", "topLabel": "d"},
                 "quadrants": {"topLeft": "a", "topRight": "b", "bottomLeft": "c", "bottomRight": "d"}},
        "personas_interp": {"i99": {"camp": "X", "note": "y", "pos": [0, 0]}},
        "schools": [],
    }
    assert validate_frame(frame, VOICE_IDS) is False


def test_validate_frame_rejects_out_of_bounds():
    from analyze_debate import validate_frame
    frame = {
        "axes": {"x": {"leftLabel": "a", "rightLabel": "b"},
                 "y": {"bottomLabel": "c", "topLabel": "d"},
                 "quadrants": {"topLeft": "a", "topRight": "b", "bottomLeft": "c", "bottomRight": "d"}},
        "personas_interp": {"i1": {"camp": "X", "note": "y", "pos": [99, 0]}},
        "schools": [],
    }
    assert validate_frame(frame, VOICE_IDS) is False


def test_validate_events():
    from analyze_debate import validate_events
    ok = [{"t": 5, "type": "dissensus", "magnitude": 2, "title": "T", "desc": "D"}]
    assert validate_events(ok, 85) is True
    assert validate_events([{"t": 5, "type": "bogus", "magnitude": 2, "title": "T", "desc": "D"}], 85) is False
    assert validate_events([{"t": 999, "type": "meta", "magnitude": 1, "title": "T", "desc": "D"}], 85) is False


def test_validate_tension():
    from analyze_debate import validate_tension
    assert validate_tension([[0, 40], [10, 60], [85, 30]], 85) is True
    assert validate_tension([[0, 40], [10, 200]], 85) is False   # v hors borne
    assert validate_tension([[10, 40], [5, 60]], 85) is False    # t non croissant


def test_validate_kf_ok():
    from analyze_debate import validate_kf
    kf = [[8, 7, 3], [40, 7, 2], [85, 7, 1.5]]
    assert validate_kf(kf, entry=8, final_xy=[7, 1.5]) is True


def test_validate_kf_rejects_big_jump():
    from analyze_debate import validate_kf
    # saut de 8 points en 2 min (> MAX_KF_AMP sur Δt < MAX_KF_GAP)
    kf = [[8, -8, 0], [10, 0, 0], [85, 0, 0]]
    assert validate_kf(kf, entry=8, final_xy=[0, 0]) is False


def test_validate_kf_rejects_wrong_endpoints():
    from analyze_debate import validate_kf
    kf = [[20, 0, 0], [85, 5, 5]]  # entry attendue 8, finale [0,0]
    assert validate_kf(kf, entry=8, final_xy=[0, 0]) is False


def test_validate_concepts():
    from analyze_debate import validate_concepts
    net = {
        "regular": ["Mérite"],
        "fauxConsensus": [{"concept": "Liberté", "senseA": "x", "campA": "lib", "senseB": "y", "campB": "sol"}],
        "gordian": [{"concept": "Redistribution", "poleA": "x", "campA": "lib", "poleB": "y", "campB": "sol", "why": "z"}],
        "consensus": [{"label": "Démographie", "t": 6, "scope": "tous"}],
        "concessions": [{"by": "lib", "t": 23, "label": "x", "targetConcept": "Liberté"}],
    }
    assert validate_concepts(net, SCHOOL_IDS, VOICE_IDS) is True
    bad = dict(net, concessions=[{"by": "zzz", "t": 1, "label": "x", "targetConcept": "Liberté"}])
    assert validate_concepts(bad, SCHOOL_IDS, VOICE_IDS) is False
