# backend/tests/test_build_manual_viz.py
import copy

import pytest

from build_manual_viz import AnalysisError, build

SEGMENTS = [
    {"start": 0.0, "end": 60.0, "speaker": "Interlocuteur 1", "text": "..."},
    {"start": 60.0, "end": 130.0, "speaker": "Interlocuteur 2", "text": "..."},
    {"start": 130.0, "end": 140.0, "speaker": "[?]", "text": "..."},
    {"start": 140.0, "end": 200.0, "speaker": "Interlocuteur 1", "text": "..."},
]

AXES = {
    "x": {"leftLabel": "A", "rightLabel": "B", "anchors": {"left": ["a"], "right": ["b"]}},
    "y": {"bottomLabel": "C", "topLabel": "D", "anchors": {"bottom": ["c"], "top": ["d"]}},
    "quadrants": {"topLeft": "", "topRight": "", "bottomLeft": "", "bottomRight": ""},
}

ANALYSIS = {
    "method": {"kind": "manual"},
    "axes": AXES,
    "personas": {
        "i1": {"camp": "c1", "note": "n1", "x": 5, "y": -5,
               "points": [{"t": 2.35, "stance": "Défend une position."}]},
        "i2": {"camp": "c2", "note": "n2", "x": -5, "y": 0, "uncertain": {"y": "rien dit"},
               "points": [{"t": 1.0, "stance": "Défend l'autre position."}]},
    },
    "events": [{"t": 1.0, "type": "dissensus", "magnitude": 2, "title": "t", "desc": "d"}],
    "tension": [[0, 20], [2.0, 60], [3.3, 30]],
}


def test_positions_are_fixed_and_points_snap_to_real_segments():
    data = build(SEGMENTS, ANALYSIS, "Energie", "X1", "2026-09-28")
    p1 = next(p for p in data["personas"] if p["id"] == "i1")
    assert p1["kf"] == [[0.0, 5.0, -5.0], [3.3, 5.0, -5.0]]   # même point de l'entrée à la fin
    assert p1["points"][0]["t"] == 2.33                         # recalé sur le segment (140 s)
    assert data["meta"]["method"]["kind"] == "manual"


def test_an_explicit_change_of_opinion_moves_the_point_durably():
    a = copy.deepcopy(ANALYSIS)
    a["personas"]["i1"]["shifts"] = [{"t": 2.35, "x": -5, "y": -5, "desc": "Se range à l'avis inverse."}]
    p1 = next(p for p in build(SEGMENTS, a, "Energie", "X1", "2026-09-28")["personas"] if p["id"] == "i1")
    # en toute fin de débat (3,3 min), le déplacement est raccourci jusqu'à la fin
    assert p1["kf"] == [[0.0, 5.0, -5.0], [2.33, 5.0, -5.0], [3.3, -5.0, -5.0]]
    assert p1["shifts"] == [{"t": 2.33, "from": [5.0, -5.0], "to": [-5.0, -5.0], "desc": "Se range à l'avis inverse."}]


def test_change_of_opinion_must_be_anchored_on_the_speaker():
    a = copy.deepcopy(ANALYSIS)
    a["personas"]["i1"]["shifts"] = [{"t": 1.0, "x": -5, "y": -5, "desc": "x"}]   # i2 parle à 1 min
    with pytest.raises(AnalysisError, match="aucun segment"):
        build(SEGMENTS, a, "Energie", "X1", "2026-09-28")


def test_point_outside_speaker_segments_is_refused():
    bad = copy.deepcopy(ANALYSIS)
    bad["personas"]["i1"]["points"][0]["t"] = 1.0   # c'est Interlocuteur 2 qui parle à 1 min
    with pytest.raises(AnalysisError, match="aucun segment"):
        build(SEGMENTS, bad, "Energie", "X1", "2026-09-28")


def test_every_voice_must_be_analysed():
    bad = copy.deepcopy(ANALYSIS)
    del bad["personas"]["i2"]
    with pytest.raises(AnalysisError, match="non analysées"):
        build(SEGMENTS, bad, "Energie", "X1", "2026-09-28")


@pytest.mark.parametrize("text", ['Il a dit "non".', "Merci Camille pour ce point."])
def test_quotes_and_real_first_names_are_refused(text):
    bad = copy.deepcopy(ANALYSIS)
    bad["personas"]["i1"]["points"][0]["stance"] = text
    with pytest.raises(AnalysisError):
        build(SEGMENTS, bad, "Energie", "X1", "2026-09-28", names=["Camille"])


def test_interactions_are_anchored_on_the_speaker_and_sorted():
    ok = copy.deepcopy(ANALYSIS)
    ok["interactions"] = [
        {"t": 2.35, "from": "i1", "to": "i2", "type": "desaccord", "desc": "Répond à son argument."},
        {"t": 1.0, "from": "i2", "to": "i1", "type": "concession", "desc": "Concède un point."},
    ]
    data = build(SEGMENTS, ok, "Energie", "X1", "2026-09-28")
    assert [(i["t"], i["from"]) for i in data["interactions"]] == [(1.0, "i2"), (2.33, "i1")]


@pytest.mark.parametrize("bad_it", [
    {"t": 1.0, "from": "i1", "to": "i2", "type": "accord", "desc": "x"},      # i1 ne parle pas à 1 min
    {"t": 1.0, "from": "i2", "to": "i2", "type": "accord", "desc": "x"},      # à soi-même
    {"t": 1.0, "from": "i2", "to": "i9", "type": "accord", "desc": "x"},      # voix inconnue
    {"t": 1.0, "from": "i2", "to": "i1", "type": "soutien", "desc": "x"},     # type inconnu
])
def test_invalid_interactions_are_refused(bad_it):
    bad = copy.deepcopy(ANALYSIS)
    bad["interactions"] = [bad_it]
    with pytest.raises(AnalysisError):
        build(SEGMENTS, bad, "Energie", "X1", "2026-09-28")


SYNTHESIS = {
    "theme": "Énergie",
    "summary": "Résumé court.",
    "groups": [{"label": "G1", "color": "#000", "members": ["i1"], "arguments": ["Argument."]}],
    "unclassified": {"members": ["i2"], "note": ""},
    "kinds": {},
    "themes": [{"id": "a", "kind": "coeur", "label": "A", "color": "#111", "desc": ""},
               {"id": "b", "kind": "annexe", "label": "B", "color": "#222", "desc": ""}],
    "timeline": [[0.0, 1.0, "a"], [1.0, 2.0, None], [2.0, 3.3, "b"]],
    "mentions": [{"t": 2.5, "theme": "a", "label": "retour"}],
    "affirmations": [{"text": "Affirmation", "stances": [
        {"id": "i1", "pos": "pour", "t": 2.35}, {"id": "i2", "pos": "contre", "t": 1.0}]}],
}


def _with_synthesis(**changes):
    a = copy.deepcopy(ANALYSIS)
    a["synthesis"] = copy.deepcopy(SYNTHESIS)
    a["synthesis"].update(changes)
    return a


def test_synthesis_stances_are_anchored_on_real_speech():
    data = build(SEGMENTS, _with_synthesis(), "Energie", "X1", "2026-09-28")
    stances = data["synthesis"]["affirmations"][0]["stances"]
    assert [s["t"] for s in stances] == [2.33, 1.0]
    bad = copy.deepcopy(SYNTHESIS["affirmations"])
    bad[0]["stances"][0]["t"] = 1.0          # i1 ne parle pas à 1 min
    with pytest.raises(AnalysisError, match="aucun segment"):
        build(SEGMENTS, _with_synthesis(affirmations=bad), "Energie", "X1", "2026-09-28")


@pytest.mark.parametrize("timeline", [
    [[0.0, 1.0, "a"], [1.5, 3.3, "b"]],       # trou
    [[0.0, 1.0, "a"], [1.0, 2.0, "z"]],       # thème inconnu
    [[0.0, 1.0, "a"], [1.0, 2.0, "b"]],       # s'arrête avant la fin du débat
])
def test_theme_timeline_must_cover_the_whole_debate(timeline):
    with pytest.raises(AnalysisError, match="découpage"):
        build(SEGMENTS, _with_synthesis(timeline=timeline), "Energie", "X1", "2026-09-28")


def test_a_voice_belongs_to_one_group_only():
    groups = [{"label": "G1", "color": "#000", "members": ["i1"], "arguments": []},
              {"label": "G2", "color": "#000", "members": ["i1"], "arguments": []}]
    with pytest.raises(AnalysisError, match="déjà dans un groupe"):
        build(SEGMENTS, _with_synthesis(groups=groups), "Energie", "X1", "2026-09-28")


def test_uncertain_axis_is_left_out_of_polarization():
    data = build(SEGMENTS, ANALYSIS, "Energie", "X1", "2026-09-28")
    assert "polarization" not in data   # une seule voix placée sur l'axe vertical : indice non calculable
    placed = copy.deepcopy(ANALYSIS)
    del placed["personas"]["i2"]["uncertain"]
    pol = build(SEGMENTS, placed, "Energie", "X1", "2026-09-28")["polarization"]
    assert pol["n"] == 2 and pol["nY"] == 2
