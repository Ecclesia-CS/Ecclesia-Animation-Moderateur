# backend/tests/test_build_unified_viz.py
import copy

import pytest

from build_cross_viz import CrossError
from build_unified_viz import (KIND_LABELS, PRE_MAP_EXTENT, UnifiedError, build, prepare_pre_debate,
                               rank_statements, relabel, tally, theme_minutes)


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


# ───────── pré-débat : export de l'appli (chantier 170, ecclesia.pre_debat.v1) ─────────

def _ranked_row(rang, enonce, **extra):
    return {"rang": rang, "enonce": enonce, "score": 0.8, "pour": 8, "contre": 2, "abstention": 1, "blanc": 0,
            "part_pour": 0.8, "par_camp": [{"camp": 1, "pour": 5, "contre": 0, "part_pour": 1.0},
                                           {"camp": 2, "pour": 3, "contre": 2, "part_pour": 0.6}], **extra}


def pre_export():
    """Export factice au format de src/lib/preDebateExport.ts."""
    return {
        "format": "ecclesia.pre_debat.v1", "lisez_moi": ["..."],
        "seance": {"titre": "Séance test", "date_seance": "2026-10-01", "exporte_le": "2026-10-19T10:00:00Z",
                   "votes": "avant débat (pre_closure)"},
        "participation": {"votants_places": 4, "assertions_approuvees": 6, "assertions_analysees": 5, "votes": 22},
        "consensus": [_ranked_row(2, "Deuxième consensus", sens="rejet"), _ranked_row(1, "Premier consensus", sens="adhesion")],
        "dissensus": [_ranked_row(1, "Un dissensus")],
        "camps": [
            {"camp": 2, "couleur": "#b04a3c", "taille": 2, "part": 0.5, "centre": {"x": -0.5, "y": 0.1},
             "enonces_caracteristiques": [{"enonce": "Plutôt contre", "sens": "contre", "part_pour_camp": 0.1, "part_pour_reste": 0.9}]},
            {"camp": 1, "couleur": "#2b4a86", "taille": 2, "part": 0.5, "centre": {"x": 0.5, "y": -0.1},
             "nom_ia": "Les réformateurs", "description_ia": "Veulent changer la règle.",
             "enonces_caracteristiques": [{"enonce": "Plutôt pour", "sens": "pour", "part_pour_camp": 1.0, "part_pour_reste": 0.2}]},
        ],
        "carte": {"axes": "composantes principales", "variance_expliquee": [0.41, 0.22],
                  "points": [{"x": 0.4, "y": -0.2, "camp": 1}, {"x": 0.6, "y": 0.0, "camp": 1},
                             {"x": -0.3, "y": 0.1, "camp": 2}, {"x": -0.7, "y": 0.1, "camp": 2}]},
    }


def test_build_without_pre_debate_keeps_placeholder(mini):
    spec, cross, viz = mini
    assert build(spec, cross, viz, names=[])["pre_debate"] is None


def test_build_with_pre_debate_fills_menu(mini):
    spec, cross, viz = mini
    pre = build(spec, cross, viz, names=["Camille"], pre_debate=pre_export())["pre_debate"]
    assert [s["enonce"] for s in pre["consensus"]] == ["Premier consensus", "Deuxième consensus"]   # trié par rang
    assert pre["consensus"][1]["sens"] == "rejet"
    assert [s["enonce"] for s in pre["dissensus"]] == ["Un dissensus"]
    assert pre["dissensus"][0]["par_camp"][1] == {"camp": 2, "pour": 3, "contre": 2, "part_pour": 0.6}
    assert [c["camp"] for c in pre["camps"]] == [1, 2]
    assert pre["camps"][0]["nom_ia"] == "Les réformateurs" and "nom_ia" not in pre["camps"][1]
    assert pre["participation"]["votants_places"] == 4
    assert pre["carte"]["variance_expliquee"] == [0.41, 0.22]


def test_pre_debate_map_is_scaled_onto_the_plane_without_distortion():
    pre = prepare_pre_debate(pre_export(), names=[])
    pts = pre["carte"]["points"]
    # le point le plus éloigné (|x| = 0,7) arrive au bord du plan ; même facteur sur les deux axes
    assert max(max(abs(p["x"]), abs(p["y"])) for p in pts) == pytest.approx(PRE_MAP_EXTENT)
    assert pts[0] == {"x": pytest.approx(0.4 * PRE_MAP_EXTENT / 0.7, abs=1e-3), "y": pytest.approx(-0.2 * PRE_MAP_EXTENT / 0.7, abs=1e-3), "camp": 1}
    assert pre["camps"][0]["centre"] == {"x": pytest.approx(0.5 * PRE_MAP_EXTENT / 0.7, abs=1e-3), "y": pytest.approx(-0.1 * PRE_MAP_EXTENT / 0.7, abs=1e-3)}


def test_pre_debate_with_all_points_at_origin_does_not_divide_by_zero():
    raw = pre_export()
    raw["carte"]["points"] = [{"x": 0, "y": 0, "camp": 1}]
    for c in raw["camps"]:
        c["centre"] = {"x": 0, "y": 0}
    assert prepare_pre_debate(raw, names=[])["carte"]["points"] == [{"x": 0, "y": 0, "camp": 1}]


def test_pre_debate_refuses_quotes_or_real_names():
    raw = pre_export()
    raw["consensus"][0]["enonce"] = "Il faut « tout changer »"
    with pytest.raises(UnifiedError, match="guillemets"):
        prepare_pre_debate(raw, names=[])
    raw = pre_export()
    raw["camps"][1]["enonces_caracteristiques"][0]["enonce"] = "Camille a raison"
    with pytest.raises(UnifiedError, match="prénom"):
        prepare_pre_debate(raw, names=["Camille"])
    raw = pre_export()
    raw["camps"][1]["nom_ia"] = "Le camp de Camille"
    with pytest.raises(UnifiedError, match="prénom"):
        prepare_pre_debate(raw, names=["Camille"])


@pytest.mark.parametrize("mutate", [
    lambda r: r.update(format="ecclesia.pre_debat.v2"),
    lambda r: r.pop("consensus"),
    lambda r: r.update(camps=[]),
    lambda r: r["carte"]["points"].append({"x": 0, "y": 0, "camp": 9}),
    lambda r: r["dissensus"][0]["par_camp"].append({"camp": 9, "pour": 1, "contre": 1, "part_pour": 0.5}),
    lambda r: r["consensus"][0].update(part_pour=1.4),
    lambda r: r["consensus"][0].update(sens="neutre"),
    lambda r: r["consensus"][0].update(pour="8"),
    lambda r: r["camps"][0].update(couleur="rouge"),
    lambda r: r["camps"].append(copy.deepcopy(r["camps"][0])),
    lambda r: r["camps"][0]["enonces_caracteristiques"][0].update(sens="neutre"),
    lambda r: r["carte"]["points"][0].update(x=None),
])
def test_pre_debate_refuses_malformed_export(mutate):
    raw = pre_export()
    mutate(raw)
    with pytest.raises(UnifiedError):
        prepare_pre_debate(raw, names=[])
