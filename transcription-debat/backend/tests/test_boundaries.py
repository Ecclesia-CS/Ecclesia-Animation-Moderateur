from boundaries import snap_turn_boundaries, boundary_cut_report


def _turn(label, a, b, refuse=False):
    return {"interlocuteur": label, "debut_sec": a, "fin_sec": b, "refuse": refuse}


def _w(a, b, text):
    return {"start": a, "end": b, "text": text}


# A parle jusqu'à 11 s, mais le clic du modérateur a été enregistré à 10 s.
BLEED_WORDS = [
    _w(8.0, 8.6, "ça"), _w(8.6, 9.4, "exerce"),
    _w(9.8, 10.2, "une"), _w(10.2, 10.6, "certaine"), _w(10.6, 11.0, "influence."),
    _w(11.8, 12.2, "Oui,"), _w(12.2, 12.6, "je"), _w(12.6, 13.0, "pense"),
]


def test_contiguous_boundary_snaps_to_sentence_end():
    turns = [_turn("A", 0.0, 10.0), _turn("B", 10.0, 20.0)]
    out = snap_turn_boundaries(turns, BLEED_WORDS)
    assert 11.0 <= out[0]["fin_sec"] <= 11.8
    assert out[1]["debut_sec"] == out[0]["fin_sec"]


def test_original_log_times_are_kept():
    turns = [_turn("A", 0.0, 10.0), _turn("B", 10.0, 20.0)]
    out = snap_turn_boundaries(turns, BLEED_WORDS)
    assert out[0]["fin_sec_log"] == 10.0
    assert out[1]["debut_sec_log"] == 10.0
    assert turns[0]["fin_sec"] == 10.0  # entrée non modifiée


def test_no_candidate_keeps_boundary():
    turns = [_turn("A", 0.0, 10.0), _turn("B", 10.0, 20.0)]
    words = [_w(1.0, 2.0, "loin"), _w(17.0, 18.0, "loin")]
    out = snap_turn_boundaries(turns, words)
    assert out[0]["fin_sec"] == 10.0 and out[1]["debut_sec"] == 10.0


def test_voice_change_point_has_priority_over_punctuation():
    turns = [_turn("A", 0.0, 10.0), _turn("B", 10.0, 20.0)]
    words = [
        _w(8.0, 8.5, "fin."), _w(8.9, 9.5, "encore"), _w(9.5, 10.5, "un"),
        _w(10.9, 11.5, "mot"), _w(11.5, 12.0, "après"),
    ]
    # la voix change entre « un » (10.5) et « mot » (10.9)
    out = snap_turn_boundaries(turns, words, change_points=[10.7])
    assert 10.5 <= out[0]["fin_sec"] <= 10.9


def test_boundary_stays_inside_search_window():
    turns = [_turn("A", 0.0, 10.0), _turn("B", 10.0, 40.0)]
    words = [_w(9.0, 9.5, "mot"), _w(25.0, 25.5, "loin."), _w(27.0, 28.0, "après")]
    out = snap_turn_boundaries(turns, words, before=4.0, after=6.0)
    assert 6.0 <= out[0]["fin_sec"] <= 16.0


def test_gap_boundaries_snap_independently_and_stay_ordered():
    # A finit officiellement à 10, B commence à 14 ; A parle en réalité jusqu'à 11.2
    turns = [_turn("A", 0.0, 10.0), _turn("B", 14.0, 30.0)]
    words = [_w(9.0, 10.5, "presque"), _w(10.5, 11.2, "fini."), _w(14.6, 15.0, "Bon,"), _w(15.0, 15.5, "alors")]
    out = snap_turn_boundaries(turns, words)
    assert 11.2 <= out[0]["fin_sec"] <= 14.6
    assert out[0]["fin_sec"] <= out[1]["debut_sec"]
    assert out[1]["debut_sec"] <= 14.6


def test_refused_turn_is_never_shrunk():
    """RGPD : recaler une frontière ne doit jamais exposer la parole d'une personne qui a refusé."""
    turns = [_turn("A", 0.0, 10.0), _turn("[REFUS]", 10.0, 20.0, refuse=True), _turn("B", 20.0, 30.0)]
    words = [
        _w(10.2, 10.8, "refus"), _w(10.8, 11.2, "parle."),   # parole du refus juste après 10 s
        _w(18.0, 18.6, "toujours."), _w(19.0, 19.5, "refus"),  # et juste avant 20 s
        _w(21.5, 22.0, "B."),
    ]
    out = snap_turn_boundaries(turns, words)
    refus = out[1]
    assert refus["debut_sec"] <= 10.0
    assert refus["fin_sec"] >= 20.0


def test_turn_never_collapses():
    turns = [_turn("A", 0.0, 2.0), _turn("B", 2.0, 4.0), _turn("C", 4.0, 10.0)]
    words = [_w(0.2, 0.4, "a."), _w(3.7, 3.9, "b."), _w(5.0, 5.5, "c.")]
    out = snap_turn_boundaries(turns, words)
    for t in out:
        assert t["fin_sec"] > t["debut_sec"]
    for a, b in zip(out, out[1:]):
        assert a["fin_sec"] <= b["debut_sec"]


def test_boundary_cut_report_counts_mid_sentence_cuts():
    segments = [
        {"start": 0, "end": 10, "speaker": "A", "text": "je pense que ça exerce"},
        {"start": 10, "end": 12, "speaker": "B", "text": "une certaine influence."},
        {"start": 12, "end": 15, "speaker": "A", "text": "Oui, bien sûr."},
        {"start": 15, "end": 20, "speaker": "B", "text": "Merci."},
    ]
    rep = boundary_cut_report(segments)
    assert rep == {"changes": 3, "mid_sentence": 1}
