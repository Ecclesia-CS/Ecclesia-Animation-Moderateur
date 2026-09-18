import json

import pytest

from voice import (
    overlap_matrix, refine_offset, map_clusters, holdout_agreement, voice_of_word,
    change_points, load_diarization, save_diarization, shift_turns,
)


def _turn(label, a, b, refuse=False):
    return {"interlocuteur": label, "debut_sec": a, "fin_sec": b, "refuse": refuse}


def _d(a, b, spk):
    return {"start": a, "end": b, "speaker": spk}


TURNS = [_turn("A", 0, 30), _turn("B", 30, 60), _turn("A", 60, 90), _turn("C", 90, 120)]
DIAR = [_d(0, 30, "S0"), _d(30, 60, "S1"), _d(60, 90, "S0"), _d(90, 120, "S2")]


def test_overlap_matrix_uses_turn_interiors():
    m = overlap_matrix(TURNS, DIAR, margin=1.0)
    assert m[("S0", "A")] == pytest.approx(56.0)
    assert m[("S1", "B")] == pytest.approx(28.0)
    assert ("S0", "B") not in m


def test_refine_offset_recovers_clock_shift():
    # l'audio est en avance de 3 s sur le log : les voix commencent 3 s plus tard
    diar = [_d(s["start"] + 3.0, s["end"] + 3.0, s["speaker"]) for s in DIAR]
    shift, curve = refine_offset(TURNS, diar, search=10.0, step=0.5)
    assert shift == pytest.approx(3.0)
    assert len(curve) == 41


def test_shift_turns_moves_all_times():
    out = shift_turns(TURNS, 2.5)
    assert out[0]["debut_sec"] == 2.5 and out[-1]["fin_sec"] == 122.5
    assert TURNS[0]["debut_sec"] == 0


def test_map_clusters_by_purity_and_support():
    diar = DIAR + [
        _d(10, 11, "S9"), _d(40, 41, "S9"), _d(70, 71, "S9"), _d(100, 101, "S9"),  # voix éparse
    ]
    mapping = map_clusters(TURNS, diar, min_support=10.0, min_purity=0.6)
    assert mapping["S0"]["label"] == "A"
    assert mapping["S1"]["label"] == "B"
    assert mapping["S2"]["label"] == "C"
    assert mapping["S9"]["label"] is None          # support trop faible
    assert mapping["S0"]["purity"] == pytest.approx(1.0)


def test_map_clusters_spread_voice_is_unmapped_but_distinct():
    """Une voix (ex. modérateur) minoritaire dans les tours de plusieurs orateurs."""
    diar = DIAR + [_d(5, 12, "SM"), _d(35, 42, "SM"), _d(65, 72, "SM"), _d(95, 102, "SM")]
    mapping = map_clusters(TURNS, diar, min_support=10.0, min_purity=0.6)
    assert mapping["SM"]["label"] is None
    assert mapping["SM"]["kind"] == "distincte"


def test_map_clusters_merged_voice_is_flagged():
    """Un cluster dominant dans les tours de deux orateurs différents = voix fusionnées."""
    diar = [_d(0, 30, "S0"), _d(30, 60, "S0"), _d(60, 90, "S0"), _d(90, 120, "S2")]
    mapping = map_clusters(TURNS, diar, min_support=10.0, min_purity=0.8)
    assert mapping["S0"]["label"] is None
    assert mapping["S0"]["kind"] == "fusionnee"


def test_map_clusters_two_clusters_same_speaker():
    diar = [_d(0, 30, "S0"), _d(30, 60, "S1"), _d(60, 90, "S3"), _d(90, 120, "S2")]
    mapping = map_clusters(TURNS, diar, min_support=10.0)
    assert mapping["S0"]["label"] == "A" and mapping["S3"]["label"] == "A"


def test_map_clusters_refused_turns_map_to_refus():
    turns = TURNS + [_turn("[REFUS]", 120, 150, refuse=True)]
    diar = DIAR + [_d(120, 150, "S5")]
    mapping = map_clusters(turns, diar, min_support=10.0)
    assert mapping["S5"]["label"] == "[REFUS]"


def test_holdout_agreement_perfect_and_degraded():
    turns = [_turn("A" if i % 2 == 0 else "B", i * 20, i * 20 + 20) for i in range(8)]
    diar = [_d(t["debut_sec"], t["fin_sec"], "S0" if t["interlocuteur"] == "A" else "S1") for t in turns]
    rep = holdout_agreement(turns, diar, min_support=5.0)
    assert rep["agreement"] == pytest.approx(1.0)
    # la voix de A parle aussi pendant un tour de B (interruption) → accord < 1
    diar2 = diar + [_d(150, 158, "S0")]
    rep2 = holdout_agreement(turns, diar2, min_support=5.0)
    assert rep2["agreement"] < 1.0


def test_voice_of_word_single_and_overlap():
    diar = [_d(0, 10, "S0"), _d(9, 20, "S1")]
    assert voice_of_word({"start": 2, "end": 3}, diar) == "S0"
    assert voice_of_word({"start": 12, "end": 13}, diar) == "S1"
    assert voice_of_word({"start": 9.2, "end": 9.8}, diar) is None   # parole superposée
    assert voice_of_word({"start": 30, "end": 31}, diar) is None      # aucune voix détectée


def test_change_points_between_different_speakers():
    diar = [_d(0, 10, "S0"), _d(10.2, 20, "S1"), _d(20.5, 30, "S1"), _d(31, 40, "S0")]
    assert change_points(diar) == pytest.approx([10.1, 30.5])


def test_diarization_cache_roundtrip(tmp_path):
    p = tmp_path / "d.json"
    save_diarization(p, DIAR, centroids={"S0": [0.1, 0.2]}, pipeline="x")
    segs = load_diarization(p)
    assert segs == DIAR
    assert json.loads(p.read_text(encoding="utf-8"))["pipeline"] == "x"
