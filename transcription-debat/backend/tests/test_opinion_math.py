# backend/tests/test_opinion_math.py
import math

import numpy as np
import pytest

import opinion_math as om


@pytest.fixture(autouse=True)
def fast(monkeypatch):
    monkeypatch.setattr(om, "N_NULL", 40)
    monkeypatch.setattr(om, "N_BOOT", 40)


def _stances(**voices):
    return [{"p": k, "pos": pos} for pos, keys in voices.items() for k in keys.split()]


def test_vote_matrix_encodes_polis_values_and_missing_as_nan():
    m = om.vote_matrix(["A1", "A2", "A3"], [_stances(pour="A1", contre="A2", nuance="A3"), _stances(pour="A2")])
    assert m[:, 0].tolist() == [1.0, -1.0, 0.0]
    assert math.isnan(m[0, 1]) and m[1, 1] == 1.0


def test_polis_map_needs_three_voices_with_enough_stances():
    m = om.vote_matrix(["A1", "A2"], [_stances(pour="A1 A2")] * 3)
    assert om.polis_map(m) is None


def test_polis_map_imputes_column_mean_and_scales_sparse_voices():
    """Polis §1.1-1.2 : une case vide prend la moyenne de la colonne (donc ne pèse pas après centrage),
    et la position est multipliée par √(C / Cp)."""
    st = [_stances(pour="A1 A2", contre="A3 A4"), _stances(pour="A1 A2", contre="A3 A4"),
          _stances(pour="A1 A2", contre="A3"), _stances(pour="A1 A2", contre="A3")]
    m = om.vote_matrix(["A1", "A2", "A3", "A4"], st)
    pm = om.polis_map(m)
    assert pm is None or 3 not in pm["placed"]  # A4 n'a que 2 prises de position : non placée
    st[2] = _stances(pour="A1 A2", contre="A3 A4")
    m = om.vote_matrix(["A1", "A2", "A3", "A4"], st)
    pm = om.polis_map(m)
    assert pm["placed"] == [0, 1, 2, 3]
    row = m[3][pm["cols"]]
    expected = pm["components"] @ (np.where(np.isnan(row), pm["means"], row) - pm["means"]) * math.sqrt(4 / 3)
    assert np.allclose(pm["coords"][3], expected)


def test_polis_map_orientation_is_deterministic():
    st = [_stances(pour="A1 A2", contre="A3 A4"), _stances(pour="A3 A4", contre="A1 A2"), _stances(pour="A1 A3", contre="A2 A4")]
    pm = om.polis_map(om.vote_matrix(["A1", "A2", "A3", "A4"], st))
    for k in range(2):
        assert pm["components"][k][np.argmax(np.abs(pm["components"][k]))] > 0
    assert sum(pm["variance"]) <= 1.0 + 1e-9


def test_silhouette_of_two_tight_far_groups_is_close_to_one():
    x = np.array([[0, 0], [0, 0.1], [0.1, 0], [10, 10], [10, 10.1], [10.1, 10]])
    assert om.silhouette(x, np.array([0, 0, 0, 1, 1, 1])) > 0.95


def test_kmeans_is_deterministic():
    x = np.random.default_rng(1).normal(size=(20, 2))
    assert om.kmeans(x, 3)[0].tolist() == om.kmeans(x, 3)[0].tolist()


def test_camps_follow_the_pre_vote_rule_and_the_audit_test_is_optional():
    rng = np.random.default_rng(3)
    groups = np.vstack([rng.normal([-6, 0], 0.5, (6, 2)), rng.normal([6, 0], 0.5, (6, 2))])
    res = om.camps(groups)
    assert res["nets"] is True and res["k"] == 2 and "stabilite" not in res
    assert sorted(np.bincount(res["labels"]).tolist()) == [6, 6]
    tested = om.camps(groups, test=True)
    assert tested["bat_le_hasard"] is True and tested["stabilite"] > 0.9
    blob = rng.normal(0, 1, (12, 2))
    assert om.camps(blob)["nets"] is True                      # comme le pré-vote : des camps sont toujours formés
    assert om.camps(blob, test=True)["bat_le_hasard"] is False  # … même quand l'audit les juge indiscernables du hasard


def test_a_single_voice_camp_is_kept_when_there_is_no_other_solution():
    x = np.array([[0, 0], [0.1, 0], [0, 0.1], [0.1, 0.1], [0.2, 0], [20, 20]])
    assert om.best_k(x) is None                                  # aucune solution sans camp d'une personne…
    res = om.camps(x)                                             # … alors la meilleure est gardée, comme au pré-vote
    assert res["nets"] is True and sorted(np.bincount(res["labels"]).tolist()) == [1, 5]


def test_too_few_voices_for_camps():
    res = om.camps(np.array([[0, 0], [1, 1], [2, 2]]))
    assert res["nets"] is False and res["k"] == 0 and "trop peu" in res["raison"]


def test_adjusted_rand_index():
    assert om.adjusted_rand([0, 0, 1, 1], [1, 1, 0, 0]) == pytest.approx(1.0)
    assert om.adjusted_rand([0, 0, 1, 1], [0, 1, 0, 1]) < 0


def test_representative_statements_follow_polis_significance():
    camp, rest = {"A1", "A2", "A3", "A4"}, {"B1", "B2", "B3", "B4"}
    stmts = [{"text": "clivant", "stances": _stances(pour="A1 A2 A3 A4", contre="B1 B2 B3 B4")},
             {"text": "partagé", "stances": _stances(pour="A1 A2 B1 B2", contre="A3 A4 B3 B4")}]
    rep = om.representative(stmts, camp, rest)
    assert [r["text"] for r in rep] == ["clivant"] and rep[0]["sens"] == "pour"
    assert rep[0]["part_pour_camp"] == 1.0 and rep[0]["part_pour_reste"] == 0.0
    assert om.representative(stmts, rest, camp)[0]["sens"] == "contre"


def test_group_consensus_is_a_product_over_camps():
    st = _stances(pour="A1 A2 B1", contre="B2")
    c = om.group_consensus(st, [{"A1", "A2"}, {"B1", "B2"}])
    assert c["pour"] == pytest.approx((3 / 4) * (2 / 4))


def test_procrustes_is_one_for_a_rotated_copy():
    a = np.array([[0, 0], [1, 0], [0, 2], [3, 1]], float)
    rot = np.array([[0, -1], [1, 0]])
    assert om.procrustes_r2(a, 2 * a @ rot + 5) == pytest.approx(1.0)


def test_krippendorff_alpha_nominal_matches_hand_computation():
    assert om.krippendorff_alpha_nominal([["a", "a"], ["b", "b"]]) == 1.0
    # coïncidences : aa=2, bb=2, ab=ba=1 ; Do = 2/6, De = 18/30 → alpha = 1 − (1/3)/0,6
    assert om.krippendorff_alpha_nominal([["a", "a"], ["b", "b"], ["a", "b"]]) == pytest.approx(1 - (1 / 3) / 0.6, abs=1e-3)
    assert om.krippendorff_alpha_nominal([["a", None]]) is None
