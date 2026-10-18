# backend/tests/test_build_cross_viz.py
import copy

import pytest

from build_cross_viz import (CrossError, build, classify_statement, esteban_ray, mean_tension,
                             speech_minutes, stance_counts, theme_minutes)


def test_speech_minutes_ignores_unknown_and_unplaced_voices():
    segs = [
        {"start": 0, "end": 60, "speaker": "Interlocuteur 1"},
        {"start": 60, "end": 90, "speaker": "[?]"},
        {"start": 90, "end": 150, "speaker": "Interlocuteur 1"},
        {"start": 150, "end": 180, "speaker": "Interlocuteur 2"},
    ]
    assert speech_minutes(segs) == {"i1": 2.0, "i2": 0.5}


def test_esteban_ray_extremes():
    assert esteban_ray([(-10, 1), (10, 1)]) == 100.0      # deux masses égales aux pôles
    assert esteban_ray([(2.5, 1), (2.5, 3)]) == 0.0       # consensus parfait
    assert esteban_ray([(5, 1)]) is None                  # une seule voix : pas de polarisation


def test_esteban_ray_grows_with_distance():
    near = esteban_ray([(0, 1), (2.5, 1)])
    far = esteban_ray([(0, 1), (7.5, 1)])
    assert 0 < near < far < 100


def test_stance_counts():
    st = [{"p": "A1", "pos": "pour"}, {"p": "A2", "pos": "contre"}, {"p": "A3", "pos": "nuance"},
          {"p": "B1", "pos": "pour"}]
    assert stance_counts(st, ["A", "B"]) == {"A": {"pour": 1, "contre": 1, "nuance": 1},
                                             "B": {"pour": 1, "contre": 0, "nuance": 0}}


@pytest.mark.parametrize("a,b,expected", [
    # commun aux deux tables
    ({"pour": 3, "contre": 0, "nuance": 0}, {"pour": 2, "contre": 0, "nuance": 0}, ("commun", "consensus_pour")),
    ({"pour": 5, "contre": 1, "nuance": 0}, {"pour": 6, "contre": 0, "nuance": 1}, ("commun", "large_pour")),
    ({"pour": 2, "contre": 3, "nuance": 0}, {"pour": 2, "contre": 1, "nuance": 1}, ("commun", "dissensus")),
    ({"pour": 0, "contre": 3, "nuance": 0}, {"pour": 0, "contre": 2, "nuance": 0}, ("commun", "consensus_contre")),
    # propre à une table
    ({"pour": 2, "contre": 3, "nuance": 0}, {"pour": 0, "contre": 0, "nuance": 0}, ("A", "dissensus")),
    ({"pour": 0, "contre": 0, "nuance": 0}, {"pour": 4, "contre": 0, "nuance": 0}, ("B", "consensus_pour")),
])
def test_classify_statement(a, b, expected):
    assert classify_statement({"A": a, "B": b}, ["A", "B"]) == expected


def test_classify_statement_few_voices_is_not_a_consensus():
    # deux voix « pour » seulement : trop peu pour parler de consensus
    assert classify_statement({"A": {"pour": 1, "contre": 0, "nuance": 0},
                               "B": {"pour": 1, "contre": 0, "nuance": 0}}, ["A", "B"])[1] == "partage"


def test_theme_minutes_maps_and_sums():
    timeline = [[0, 2, None], [2, 5, "x"], [5, 6, "y"], [6, 8, "x"]]
    out = theme_minutes(timeline, {"x": "commun", "y": "commun", "__none__": "anim"})
    assert out == {"anim": 2.0, "commun": 6.0}


def test_theme_minutes_unmapped_theme_is_an_error():
    with pytest.raises(CrossError, match="zzz"):
        theme_minutes([[0, 1, "zzz"]], {"x": "commun"})


def test_mean_tension_is_time_weighted():
    # 0→10 min : de 0 à 100 (moyenne 50) ; 10→20 min : constant à 100
    assert mean_tension([[0, 0], [10, 100]], 20) == 75.0


# ───────── build() sur deux mini-tables ─────────
def _seg(a, b, who):
    return {"start": a * 60.0, "end": b * 60.0, "speaker": who, "text": "..."}


def _table(key, code, color, second_voice):
    return {
        "key": key, "code": code, "color": color, "label": f"Table {key}",
        "names": ["Prénomsecret"],
        "segments": [_seg(0, 3, "Interlocuteur 1"), _seg(3, 4, second_voice),
                     _seg(4, 9, "Interlocuteur 1"), _seg(9, 10, "[?]")],
        "analysis": {
            "events": [{"t": 1, "type": "dissensus", "magnitude": 2, "title": "t", "desc": "d"}],
            "tension": [[0, 20], [10, 40]],
            "interactions": [{"t": 3, "from": "i1", "to": "i2", "type": "desaccord", "desc": "d"}],
            "personas": {"i1": {}, "i2": {}},
            "synthesis": {"themes": [{"id": "t1", "kind": "coeur", "label": "T"}],
                          "timeline": [[0, 10, "t1"]],
                          "affirmations": [{"text": "S", "stances": [{"id": "i1", "pos": "pour", "t": 0.0}]}]},
        },
        "rapport": {"metriques": {"unknown_ratio": 0.1}},
    }


def _spec():
    return {
        "title": "T", "subtitle": "S", "topic": "Sujet",
        "axes": {"x": {"leftLabel": "g", "rightLabel": "d", "anchors": {"left": ["a"], "right": ["b"]}, "levels": []},
                 "y": {"bottomLabel": "b", "topLabel": "h", "anchors": {"bottom": ["a"], "top": ["b"]}, "levels": []},
                 "quadrants": {"topLeft": "", "topRight": "", "bottomLeft": "", "bottomRight": ""}},
        "personas": {
            "A1": {"camp": "c", "note": "n", "x": 5, "y": 2.5},
            "A2": {"camp": "c", "note": "n", "x": -2.5, "y": 0, "uncertain": {"y": "peu parlé"}},
            "B1": {"camp": "c", "note": "n", "x": 7.5, "y": 5},
            "B2": {"camp": "c", "note": "n", "x": 0, "y": -5},
        },
        "common_themes": [{"id": "c1", "label": "Commun", "color": "#111", "kind": "shared"}],
        "theme_map": {"A": {"t1": "c1", "__none__": "c1"}, "B": {"t1": "c1", "__none__": "c1"}},
        "summary": "Résumé.",
        "groups": [{"label": "G", "color": "#222", "members": ["A1", "B1"], "arguments": ["arg"]}],
        "unclassified": {"members": ["A2", "B2"], "note": "n"},
        "statements": [{"text": "Énoncé", "stances": [
            {"p": "A1", "pos": "pour", "t": 0.0}, {"p": "B1", "pos": "contre", "t": 0.0}]}],
        "differences": {"intro": "i", "cards": []},
        "only_one_table": {"A": [], "B": []},
        "method": {"caption": "c", "footer": ["f"]},
    }


def _tables():
    return [_table("A", "AAA111", "#184795", "Interlocuteur 2"), _table("B", "BBB222", "#E67E22", "Interlocuteur 2")]


def test_build_end_to_end():
    data = build(_spec(), _tables())
    assert [p["key"] for p in data["personas"]] == ["A1", "A2", "B1", "B2"]
    a2 = next(p for p in data["personas"] if p["key"] == "A2")
    assert a2["uncertain"] == {"y": "peu parlé"} and a2["weight"] == 1.0
    assert data["meta"]["tables"][0]["interactions"] == {"accord": 0, "desaccord": 1, "concession": 0}
    st = data["statements"][0]
    assert st["scope"] == "commun" and st["counts"]["A"]["pour"] == 1 and st["counts"]["B"]["contre"] == 1
    assert data["polarization"]["all"]["x"] > 0


def test_build_rejects_missing_voice():
    spec = _spec()
    del spec["personas"]["B2"]
    with pytest.raises(CrossError, match="B2"):
        build(spec, _tables())


def test_build_rejects_unknown_voice():
    spec = _spec()
    spec["personas"]["B9"] = {"camp": "c", "note": "n", "x": 0, "y": 0}
    with pytest.raises(CrossError, match="B9"):
        build(spec, _tables())


def test_build_rejects_quotes_and_real_names():
    spec = _spec()
    spec["summary"] = "Il a dit « non »."
    with pytest.raises(CrossError, match="guillemets"):
        build(spec, _tables())
    spec = _spec()
    spec["personas"]["A1"]["note"] = "Prénomsecret est d'accord."
    with pytest.raises(CrossError, match="prénom"):
        build(spec, _tables())


def test_build_rejects_stance_not_anchored_on_voice_segment():
    spec = _spec()
    spec["statements"][0]["stances"][0]["t"] = 3.5     # A1 ne commence à parler qu'à 0 et 4 min
    with pytest.raises(CrossError, match="A1"):
        build(spec, _tables())


def test_build_rejects_position_out_of_plane_and_duplicate_group_member():
    spec = _spec()
    spec["personas"]["A1"]["x"] = 11
    with pytest.raises(CrossError, match="plan"):
        build(spec, _tables())
    spec = _spec()
    spec["groups"].append({"label": "H", "color": "#333", "members": ["A1"], "arguments": ["x"]})
    with pytest.raises(CrossError, match="A1"):
        build(spec, _tables())


def test_build_rejects_unmapped_table_theme():
    spec = copy.deepcopy(_spec())
    del spec["theme_map"]["B"]["t1"]
    with pytest.raises(CrossError, match="t1"):
        build(spec, _tables())


def test_build_refuses_per_table_shifts_without_cross_equivalent():
    tables = _tables()
    tables[0]["analysis"]["personas"]["i1"] = {"shifts": [{"t": 1, "x": 0, "y": 0, "desc": "d"}]}
    with pytest.raises(CrossError, match="changement d'avis"):
        build(_spec(), tables)


def test_method_text_may_use_guillemets_but_not_real_names():
    spec = _spec()
    spec["method"]["footer"] = ["Voir « Comment lire la carte »."]
    build(spec, _tables())                       # accepté
    spec["method"]["footer"] = ["Prénomsecret a relu."]
    with pytest.raises(CrossError, match="prénom"):
        build(spec, _tables())
