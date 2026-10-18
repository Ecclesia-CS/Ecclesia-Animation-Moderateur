# backend/tests/test_build_unified_viz.py
import copy

import pytest

from build_cross_viz import CrossError
from build_unified_viz import (KIND_LABELS, UnifiedError, build, rank_statements, relabel, tally,
                               theme_minutes)


def _st(text, **voices):
    """_st("x", pour="A1 A2", contre="B1") → énoncé avec ses prises de position."""
    return {"text": text, "stances": [{"p": k, "pos": pos, "t": 1.0}
                                      for pos, keys in voices.items() for k in keys.split()]}


def test_relabel_handles_elision_and_plain_label():
    assert relabel("Rejoint l'Interlocuteur 3 puis L'Interlocuteur 12", "A") == "Rejoint A3 puis A12"
    assert relabel("Interlocuteur 4 répond à l’Interlocuteur 5", "B") == "B4 répond à B5"


def test_tally_sorts_voices_and_ignores_nuances_in_agreement():
    t = tally(_st("x", pour="A10 A2", contre="B1", nuance="A3")["stances"])
    assert t["pour"] == ["A2", "A10"] and (t["p"], t["c"], t["nu"]) == (2, 1, 1)
    assert t["agreement"] == pytest.approx(1 / 3, abs=1e-3)


def test_consensus_ranked_by_net_margin_and_rejection_counts():
    r = rank_statements([
        _st("trois sur trois", pour="A1 A2 A3"),
        _st("onze contre un", pour="A1 A2 A3 A4 A5 A6 A7 B1 B2 B3 B4", contre="B5"),
        _st("rejet", pour="A1", contre="B1 B2 B3 B4 B5"),
        _st("trop peu de voix", pour="A1 A2"),
    ])
    assert [s["text"] for s in r["consensus"]] == ["onze contre un", "rejet", "trois sur trois"]
    assert r["consensus"][1]["side"] == "contre"
    assert r["dissensus"] == []


def test_dissensus_needs_both_sides_and_is_ranked_by_minority_size():
    r = rank_statements([
        _st("un contre un", pour="A1", contre="A2"),
        _st("quatre contre quatre", pour="A1 A2 A3 A4", contre="B1 B2 B3 B4"),
        _st("trois contre deux", pour="A1 A2 A3", contre="B1 B2"),
        _st("unanime", pour="A1 A2 A3"),
    ])
    assert [s["text"] for s in r["dissensus"]] == ["quatre contre quatre", "trois contre deux", "un contre un"]


def test_ties_with_the_last_kept_statement_are_reported():
    stmts = [_st(f"s{i}", pour="A1 A2 A3") for i in range(5)]
    r = rank_statements(stmts)
    assert [s["text"] for s in r["consensus"]] == ["s0", "s1", "s2"]   # à égalité : l'ordre du fichier
    assert r["consensus_ties"] == ["s3", "s4"]


def test_statement_without_any_stance_is_ignored():
    assert rank_statements([_st("vide")]) == {"consensus": [], "consensus_ties": [], "dissensus": [], "dissensus_ties": []}


def test_theme_minutes_puts_untitled_time_under_animation():
    assert theme_minutes([[0, 1, None], [1, 4, "a"], [4, 5, "b"], [5, 7, "a"]]) == {"__anim__": 1, "a": 5, "b": 1}


# ───────── construction complète sur un mini-débat à deux tables ─────────

def _persona(key, x, y):
    return {"key": key, "table": key[0], "id": "i" + key[1:], "label": key, "camp": "camp", "note": "note",
            "x": x, "y": y, "weight": 2.0, "entry": 0.5, "kf": [[0.5, x, y], [10, x, y]]}


def _table_viz(code, ids):
    return {"meta": {"code": code, "date": "2026-10-01"}, "totalDurationMinutes": 10,
            "personas": [{"id": i, "speech": [[1, 2]], "points": [{"t": 1, "stance": f"Interlocuteur {i[1:]} parle."}]} for i in ids],
            "interactions": [{"t": 1, "from": ids[0], "to": ids[1], "type": "desaccord", "desc": f"Répond à l'Interlocuteur {ids[1][1:]}."}],
            "events": [], "tension": [[0, 20], [10, 40]], "refus": [],
            "synthesis": {"summary": "Résumé.", "groups": [{"label": "G", "members": [ids[0]], "arguments": ["arg"]}],
                          "unclassified": {"members": [ids[1]], "note": "L'Interlocuteur 2 doute."},
                          "kinds": {k: {"label": "ancien", "desc": "d"} for k in KIND_LABELS},
                          "themes": [{"id": "t1", "label": "T1", "kind": "coeur", "color": "#000"}],
                          "timeline": [[0, 1, None], [1, 10, "t1"]]}}


@pytest.fixture
def mini():
    cross = {"meta": {"topic": "Sujet", "tables": [{"key": "A", "code": "AAA111", "label": "Table A"},
                                                   {"key": "B", "code": "BBB222", "label": "Table B"}]},
             "axes": {}, "personas": [_persona("A1", 5, 5), _persona("A2", -5, 0), _persona("B1", 2.5, 2.5), _persona("B2", 0, 0)],
             "synthesis": {"groups": [{"label": "G", "members": ["A1", "B1"], "arguments": []}], "unclassified": {"members": [], "note": ""}},
             "statements": [{**_st("commun", pour="A1 B1", contre="A2 B2"), "scope": "commun"},
                            {**_st("propre à A", pour="A1 A2"), "scope": "A"}]}
    viz = {"AAA111": _table_viz("AAA111", ["i1", "i2"]), "BBB222": _table_viz("BBB222", ["i1", "i2"])}
    return {"flash_summary": "Court résumé."}, cross, viz


def test_build_uses_common_grid_and_relabels_texts(mini):
    spec, cross, viz = mini
    data = build(spec, cross, viz, names=["Camille"])
    a = data["tables"][0]
    assert {p["key"]: (p["x"], p["y"]) for p in a["personas"]} == {"A1": (5, 5), "A2": (-5, 0)}
    assert a["interactions"][0] == {"t": 1, "from": "A1", "to": "A2", "type": "desaccord", "desc": "Répond à A2."}
    assert a["personas"][0]["points"][0]["stance"] == "A1 parle."
    assert a["unclassified"] == {"members": ["A2"], "note": "A2 doute."}
    assert a["kinds"]["coeur"]["label"] == "La question posée"        # jamais « cœur du sujet »
    assert a["personas"][1]["color"] == "#898A8C"                     # non rattaché : gris
    assert data["flash"]["n_common_statements"] == 1
    assert [s["text"] for s in data["flash"]["ranking"]["dissensus"]] == ["commun"]
    assert [p["key"] for p in data["map"]] == ["A1", "A2", "B1", "B2"]


def test_build_refuses_quotes_or_real_names_in_flash_summary(mini):
    spec, cross, viz = mini
    with pytest.raises(CrossError):
        build({"flash_summary": "Il a dit « non »."}, cross, viz, names=[])
    with pytest.raises(CrossError):
        build({"flash_summary": "Camille était pour."}, cross, viz, names=["Camille"])


def test_build_refuses_voice_mismatch_between_cross_and_table(mini):
    spec, cross, viz = mini
    viz = copy.deepcopy(viz)
    viz["AAA111"]["personas"].append({"id": "i9", "speech": [], "points": []})
    with pytest.raises(UnifiedError):
        build(spec, cross, viz, names=[])


def test_build_refuses_missing_table_analysis(mini):
    spec, cross, viz = mini
    with pytest.raises(UnifiedError):
        build(spec, cross, {"AAA111": viz["AAA111"]}, names=[])
