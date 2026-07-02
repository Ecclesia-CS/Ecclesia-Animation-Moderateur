# backend/tests/test_analyze_debate.py
import json
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock

SEGMENTS = [
    {"start": 0.0,   "end": 60.0,  "speaker": "Modérateur",      "text": "Bonjour, on commence.", "refused": False},
    {"start": 60.0,  "end": 180.0, "speaker": "Interlocuteur 1", "text": "Je pense que la liberté prime sur tout le reste parce que sans elle aucune égalité réelle n'est jamais possible dans la durée.", "refused": False},
    {"start": 180.0, "end": 240.0, "speaker": "Interlocuteur 2", "text": "Pas d'accord du tout, l'égalité vient d'abord car la liberté sans conditions matérielles reste un privilège réservé à quelques-uns seulement.", "refused": False},
    {"start": 240.0, "end": 300.0, "speaker": "[REFUS]",         "text": "[N'a pas souhaité être enregistré(e)]", "refused": True},
    {"start": 300.0, "end": 320.0, "speaker": "[REFUS]",         "text": "[N'a pas souhaité être enregistré(e)]", "refused": True},
    {"start": 320.0, "end": 600.0, "speaker": "Interlocuteur 1", "text": "Je maintiens ma position initiale malgré vos objections, car aucun argument avancé ici ne me semble remettre en cause ce principe fondamental.", "refused": False},
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


ANCHORS_X = {"left": ["La liberté individuelle passe avant tout.",
                      "Toute contrainte collective doit rester exceptionnelle."],
             "right": ["Sans conditions matérielles partagées, la liberté est un privilège.",
                       "L'égalité réelle précède la liberté formelle."]}
ANCHORS_Y = {"bottom": ["Le débat doit rester sur les mécanismes concrets.",
                        "Les chiffres tranchent mieux que les principes."],
             "top": ["C'est une question de principes avant tout.",
                     "Les valeurs priment sur la faisabilité."]}


def test_validate_frame_ok():
    from analyze_debate import validate_frame
    frame = {
        "axes": {
            "x": {"leftLabel": "Liberté", "rightLabel": "Égalité", "anchors": ANCHORS_X},
            "y": {"bottomLabel": "Technique", "topLabel": "Principes", "anchors": ANCHORS_Y},
            "quadrants": {"topLeft": "a", "topRight": "b", "bottomLeft": "c", "bottomRight": "d"},
        },
        "personas_interp": {"i1": {"camp": "Libéral", "note": "x", "pos": [-8, 6]}},
        "schools": [{"id": "lib", "label": "Libéraux", "cx": -8, "cy": 6, "rx": 2, "ry": 2, "members": ["i1"]}],
    }
    assert validate_frame(frame, VOICE_IDS) is True


def test_validate_frame_rejects_unknown_voice():
    from analyze_debate import validate_frame
    frame = {
        "axes": {"x": {"leftLabel": "a", "rightLabel": "b", "anchors": ANCHORS_X},
                 "y": {"bottomLabel": "c", "topLabel": "d", "anchors": ANCHORS_Y},
                 "quadrants": {"topLeft": "a", "topRight": "b", "bottomLeft": "c", "bottomRight": "d"}},
        "personas_interp": {"i99": {"camp": "X", "note": "y", "pos": [0, 0]}},
        "schools": [],
    }
    assert validate_frame(frame, VOICE_IDS) is False


def test_validate_frame_rejects_out_of_bounds():
    from analyze_debate import validate_frame
    frame = {
        "axes": {"x": {"leftLabel": "a", "rightLabel": "b", "anchors": ANCHORS_X},
                 "y": {"bottomLabel": "c", "topLabel": "d", "anchors": ANCHORS_Y},
                 "quadrants": {"topLeft": "a", "topRight": "b", "bottomLeft": "c", "bottomRight": "d"}},
        "personas_interp": {"i1": {"camp": "X", "note": "y", "pos": [99, 0]}},
        "schools": [],
    }
    assert validate_frame(frame, VOICE_IDS) is False


def test_validate_frame_rejects_missing_anchors():
    from analyze_debate import validate_frame
    frame = {
        "axes": {
            "x": {"leftLabel": "a", "rightLabel": "b"},   # pas d'anchors
            "y": {"bottomLabel": "c", "topLabel": "d", "anchors": ANCHORS_Y},
            "quadrants": {"topLeft": "a", "topRight": "b", "bottomLeft": "c", "bottomRight": "d"},
        },
        "personas_interp": {},
        "schools": [],
    }
    assert validate_frame(frame, VOICE_IDS) is False
    # ancre vide → rejet aussi
    bad = {"left": ["ok", "  "], "right": ["a", "b"]}
    frame["axes"]["x"] = {"leftLabel": "a", "rightLabel": "b", "anchors": bad}
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


def test_validate_tension_rejects_nonnumeric():
    from analyze_debate import validate_tension
    assert validate_tension([[0, 40], ["x", 50]], 85) is False
    assert validate_tension([[0, 40], [10, None]], 85) is False


# Task 3: Helper Gemini tests

def test_parse_json_strips_fences():
    from analyze_debate import _parse_json
    assert _parse_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert _parse_json('{"b": 2}') == {"b": 2}
    assert _parse_json('pas du json') is None


def test_call_validated_retries_then_succeeds():
    from analyze_debate import _call_validated
    client = MagicMock()
    bad = MagicMock(); bad.text = "oops"
    good = MagicMock(); good.text = '{"ok": true}'
    client.models.generate_content.side_effect = [bad, good]
    result = _call_validated(client, "prompt", validator=lambda o: o.get("ok") is True)
    assert result == {"ok": True}
    assert client.models.generate_content.call_count == 2


def test_call_validated_uses_deterministic_config():
    from analyze_debate import _call_validated, GEN_CONFIG
    client = MagicMock()
    resp = MagicMock(); resp.text = '{"ok": true}'
    client.models.generate_content.return_value = resp
    _call_validated(client, "prompt", validator=lambda o: True)
    kwargs = client.models.generate_content.call_args.kwargs
    assert kwargs["config"]["temperature"] == 0.0
    assert "seed" in kwargs["config"]
    assert GEN_CONFIG["temperature"] == 0.0


def test_call_validated_gives_up_after_retries():
    from analyze_debate import _call_validated
    client = MagicMock()
    resp = MagicMock(); resp.text = '{"ok": false}'
    client.models.generate_content.return_value = resp
    result = _call_validated(client, "prompt", validator=lambda o: o.get("ok") is True, retries=2)
    assert result is None


def test_segments_to_text():
    from analyze_debate import _segments_to_text
    txt = _segments_to_text(SEGMENTS[:2])
    assert "[00:00] Modérateur:" in txt
    assert "[01:00] Interlocuteur 1:" in txt


# Task 4: Passe 1 — Cadre + voix

FRAME_RESPONSE = json.dumps({
    "axes": {
        "x": {"leftLabel": "Liberté", "rightLabel": "Égalité", "anchors": ANCHORS_X},
        "y": {"bottomLabel": "Technique", "topLabel": "Principes", "anchors": ANCHORS_Y},
        "quadrants": {"topLeft": "a", "topRight": "b", "bottomLeft": "c", "bottomRight": "d"},
    },
    "personas_interp": {
        "i1": {"camp": "Libéral", "note": "Constance", "pos": [-8, 6]},
        "i2": {"camp": "Solidariste", "note": "Égalité", "pos": [7, 2]},
        "anim": {"camp": "Méta", "note": "Protocole", "pos": [0, 4]},
    },
    "schools": [
        {"id": "lib", "label": "Libéraux", "cx": -8, "cy": 6, "rx": 2, "ry": 2, "members": ["i1"]},
        {"id": "sol", "label": "Solidaristes", "cx": 7, "cy": 2, "rx": 2, "ry": 2, "members": ["i2"]},
    ],
})


def test_run_frame_ok():
    from analyze_debate import run_frame, compute_voices
    voices = compute_voices(SEGMENTS)
    client = MagicMock()
    resp = MagicMock(); resp.text = FRAME_RESPONSE
    client.models.generate_content.return_value = resp
    frame = run_frame(client, "transcript", voices, {"topic": "Retraites"})
    assert frame["axes"]["x"]["leftLabel"] == "Liberté"
    assert "i1" in frame["personas_interp"]


def test_run_frame_rejects_invented_voice():
    from analyze_debate import run_frame, compute_voices
    voices = compute_voices(SEGMENTS)
    bad = json.dumps({
        "axes": {"x": {"leftLabel": "a", "rightLabel": "b", "anchors": ANCHORS_X},
                 "y": {"bottomLabel": "c", "topLabel": "d", "anchors": ANCHORS_Y},
                 "quadrants": {"topLeft": "a", "topRight": "b", "bottomLeft": "c", "bottomRight": "d"}},
        "personas_interp": {"i77": {"camp": "X", "note": "y", "pos": [0, 0]}},
        "schools": [],
    })
    client = MagicMock()
    resp = MagicMock(); resp.text = bad
    client.models.generate_content.return_value = resp
    assert run_frame(client, "transcript", voices, {"topic": "X"}) is None


# Task 5: Passe 2 — Events + tension

TIMELINE_RESPONSE = json.dumps({
    "events": [
        {"t": 1, "type": "cadrage", "magnitude": 2, "title": "Doxa", "desc": "Énoncé initial."},
        {"t": 6, "type": "dissensus", "magnitude": 3, "title": "Conflit", "desc": "Liberté vs égalité."},
    ],
    "tension": [[0, 40], [10, 50], [6, 75]],  # volontairement non trié pour tester le tri
})


def test_run_timeline_ok_and_sorts_tension():
    from analyze_debate import run_timeline
    client = MagicMock()
    resp = MagicMock(); resp.text = TIMELINE_RESPONSE
    client.models.generate_content.return_value = resp
    out = run_timeline(client, "transcript", {"totalDurationMinutes": 85})
    assert len(out["events"]) == 2
    # la tension doit être triée par t croissant avant validation/sortie
    ts = [p[0] for p in out["tension"]]
    assert ts == sorted(ts)


def test_run_timeline_rejects_bad_event_type():
    from analyze_debate import run_timeline
    bad = json.dumps({"events": [{"t": 1, "type": "zzz", "magnitude": 1, "title": "T", "desc": "D"}],
                      "tension": [[0, 40], [85, 30]]})
    client = MagicMock()
    resp = MagicMock(); resp.text = bad
    client.models.generate_content.return_value = resp
    assert run_timeline(client, "transcript", {"totalDurationMinutes": 85}) is None


# Assemblage + orchestration (3 passes)

SCORING_RESPONSE = json.dumps([
    {"i": 1, "x": -2, "y": 1, "stance": "Défend la primauté de la liberté individuelle.", "salience": 0.9},
    {"i": 2, "x": 2, "y": 0, "stance": "Oppose que l'égalité doit primer.", "salience": 0.8},
    {"i": 5, "x": -2, "y": 1, "stance": "Réaffirme sa position initiale.", "salience": 0.6},
])


def test_merge_personas_static_fallback_when_no_traj():
    from analyze_debate import compute_voices, merge_personas
    voices = compute_voices(SEGMENTS)
    interp = {"i1": {"camp": "Lib", "note": "n", "pos": [-8, 6]}}
    personas = merge_personas(voices, interp, traj_map={}, speech_map={}, duration=10.0)
    p = {x["id"]: x for x in personas}
    assert "i1" in p and "i2" not in p          # pas de position passe 1 → omise
    assert p["i1"]["kf"] == [[p["i1"]["entry"], -8, 6], [10.0, -8, 6]]
    assert p["i1"]["points"] == []
    assert p["i1"]["camp"] == "Lib"


def test_merge_personas_includes_points_and_speech():
    from analyze_debate import compute_voices, merge_personas
    voices = compute_voices(SEGMENTS)
    interp = {"i1": {"camp": "Lib", "note": "n", "pos": [-8, 6]}}
    traj = {"i1": {"points": [{"t": 2.0, "x": 0, "y": 0, "stance": "s", "salience": 1.0}],
                   "kf": [[1.0, 0.0, 0.0], [2.0, 0.0, 0.0]]}}
    speech = {"i1": [[1.0, 3.0], [5.33, 10.0]]}
    personas = merge_personas(voices, interp, traj, speech, 10.0)
    p = {x["id"]: x for x in personas}
    assert p["i1"]["points"][0]["stance"] == "s"
    assert p["i1"]["speech"] == [[1.0, 3.0], [5.33, 10.0]]
    assert p["i1"]["kf"][0] == [1.0, 0.0, 0.0]


def test_assemble_data_omits_failed_passes():
    from analyze_debate import assemble_data
    data = assemble_data(
        meta={"topic": "X", "totalDurationMinutes": 10, "totalRedactedMinutes": 1},
        frame={"axes": {"x": {}}, "schools": [], "personas_interp": {}},
        personas=[{"id": "i1", "kf": [[0, 0, 0]]}],
        timeline=None,          # passe 2 échouée
        refus=[[4.0, 5.3]],
    )
    assert "axes" in data
    assert "events" not in data and "tension" not in data
    assert "concepts" not in data
    assert data["refus"] == [[4.0, 5.3]]


def test_write_data_js(tmp_path):
    from analyze_debate import write_data_js
    path = tmp_path / "data.js"
    write_data_js({"meta": {"topic": "X"}}, path)
    content = path.read_text(encoding="utf-8")
    assert content.startswith("//")
    assert "window.DEBATE_DATA =" in content
    assert content.rstrip().endswith(";")


def test_viz_template_single_page():
    template = Path(__file__).parent.parent / "code python" / "viz_template" / "index.html"
    assert template.exists()
    html = template.read_text(encoding="utf-8")
    assert 'id="hdr-title"' in html
    # plus d'onglets ni de vues V1/V4/V5
    assert "nav.tabs" not in html and "data-tab" not in html
    assert "sankey" not in html.lower()
    assert "drawV1" not in html and "drawV4" not in html and "drawV5" not in html
    # page unique pilotée par les données
    assert "Comment lire cette carte" in html
    assert 'id="now-list"' in html
    assert "totalDurationMinutes" in html
    assert 'max="85"' not in html        # plus de durée en dur


def test_analyze_end_to_end_writes_viz(tmp_path):
    from analyze_debate import analyze
    debate_dir = tmp_path / "Retraites" / "0F6A9E"
    debate_dir.mkdir(parents=True)
    json_path = debate_dir / "0F6A9E_2026-05-28_corrected.json"
    json_path.write_text(json.dumps(SEGMENTS), encoding="utf-8")

    client = MagicMock()
    frame_r = MagicMock(); frame_r.text = FRAME_RESPONSE
    timeline_r = MagicMock(); timeline_r.text = TIMELINE_RESPONSE
    scoring_r = MagicMock(); scoring_r.text = SCORING_RESPONSE
    client.models.generate_content.side_effect = [frame_r, timeline_r, scoring_r]

    ok = analyze(json_path, "Retraites", "0F6A9E", "2026-05-28", client=client)
    assert ok is True
    viz = debate_dir / "viz"
    assert (viz / "data.js").exists() and (viz / "index.html").exists()
    content = (viz / "data.js").read_text(encoding="utf-8")
    assert "window.DEBATE_DATA" in content
    assert '"anchors"' in content        # passe 1 enrichie
    assert '"points"' in content and '"speech"' in content
    assert '"stance"' in content
    assert '"concepts"' not in content   # passe supprimée


def test_analyze_degrades_when_a_pass_fails(tmp_path):
    from analyze_debate import analyze
    debate_dir = tmp_path / "Retraites" / "0F6A9E"
    debate_dir.mkdir(parents=True)
    json_path = debate_dir / "0F6A9E_2026-05-28_corrected.json"
    json_path.write_text(json.dumps(SEGMENTS), encoding="utf-8")

    client = MagicMock()
    frame_r = MagicMock(); frame_r.text = FRAME_RESPONSE
    bad = MagicMock(); bad.text = "pas du json"     # timeline KO (2 tentatives)
    scoring_r = MagicMock(); scoring_r.text = SCORING_RESPONSE
    # frame(1), timeline(2 essais), scoring(1)
    client.models.generate_content.side_effect = [frame_r, bad, bad, scoring_r]

    ok = analyze(json_path, "Retraites", "0F6A9E", "2026-05-28", client=client)
    assert ok is True
    content = (debate_dir / "viz" / "data.js").read_text(encoding="utf-8")
    assert '"events"' not in content    # timeline omise
    assert '"axes"' in content          # frame présente
    assert '"points"' in content        # scoring OK malgré timeline KO


def test_analyze_hides_map_when_scoring_fully_fails(tmp_path):
    from analyze_debate import analyze
    debate_dir = tmp_path / "Retraites" / "0F6A9E"
    debate_dir.mkdir(parents=True)
    json_path = debate_dir / "0F6A9E_2026-05-28_corrected.json"
    json_path.write_text(json.dumps(SEGMENTS), encoding="utf-8")

    client = MagicMock()
    frame_r = MagicMock(); frame_r.text = FRAME_RESPONSE
    timeline_r = MagicMock(); timeline_r.text = TIMELINE_RESPONSE
    bad = MagicMock(); bad.text = "pas du json"     # scoring KO (2 tentatives, 1 seul lot)
    client.models.generate_content.side_effect = [frame_r, timeline_r, bad, bad]

    ok = analyze(json_path, "Retraites", "0F6A9E", "2026-05-28", client=client)
    assert ok is True
    content = (debate_dir / "viz" / "data.js").read_text(encoding="utf-8")
    assert '"personas": []' in content  # carte masquée
    assert '"tension"' in content       # frise seule


# Mesures sans LLM : speech + blocs scorables

def test_compute_speech_per_voice():
    from analyze_debate import compute_speech
    speech = compute_speech(SEGMENTS)
    # i1 parle 60-180 s et 320-600 s → deux intervalles disjoints (en minutes)
    assert speech["i1"] == [[1.0, 3.0], [5.33, 10.0]]
    assert speech["anim"] == [[0.0, 1.0]]
    assert "[REFUS]" not in speech and None not in speech


def test_compute_speech_merges_consecutive():
    from analyze_debate import compute_speech
    segs = [
        {"start": 0.0,  "end": 60.0,  "speaker": "Interlocuteur 1", "text": "a", "refused": False},
        {"start": 61.0, "end": 120.0, "speaker": "Interlocuteur 1", "text": "b", "refused": False},
    ]
    # écart 1 s ≤ 2 s → fusion en un seul intervalle
    assert compute_speech(segs) == {"i1": [[0.0, 2.0]]}


def test_select_scorable_blocks_filters_short_and_special():
    from analyze_debate import select_scorable_blocks
    blocks = select_scorable_blocks(SEGMENTS)
    # Modérateur (3 mots) exclu, [REFUS] exclus, les 3 blocs longs gardés
    assert [b["i"] for b in blocks] == [1, 2, 5]
    assert all(b["vid"] in ("i1", "i2") for b in blocks)


def test_select_scorable_blocks_index_and_time():
    from analyze_debate import select_scorable_blocks
    blocks = {b["i"]: b for b in select_scorable_blocks(SEGMENTS)}
    assert blocks[1]["t"] == 1.0
    assert blocks[5]["t"] == 5.33
    assert blocks[1]["label"] == "Interlocuteur 1"


# Validateur de la passe scoring

def test_validate_scores_ok():
    from analyze_debate import validate_scores
    scores = [
        {"i": 1, "x": -2, "y": 1, "stance": "Défend la primauté de la liberté.", "salience": 0.9},
        {"i": 2, "none": True},
    ]
    assert validate_scores(scores, {1, 2}) is True


def test_validate_scores_rejects_unknown_index():
    from analyze_debate import validate_scores
    scores = [{"i": 99, "x": 0, "y": 0, "stance": "s", "salience": 0.5},
              {"i": 1, "none": True}, {"i": 2, "none": True}]
    assert validate_scores(scores, {1, 2}) is False


def test_validate_scores_requires_all_indices():
    from analyze_debate import validate_scores
    scores = [{"i": 1, "none": True}]  # 2 manquant
    assert validate_scores(scores, {1, 2}) is False


def test_validate_scores_rejects_out_of_bounds():
    from analyze_debate import validate_scores
    scores = [{"i": 1, "x": 99, "y": 0, "stance": "s", "salience": 0.5}]
    assert validate_scores(scores, {1}) is False


def test_validate_scores_rejects_empty_or_quoted_stance():
    from analyze_debate import validate_scores
    empty = [{"i": 1, "x": 0, "y": 0, "stance": "  ", "salience": 0.5}]
    quoted = [{"i": 1, "x": 0, "y": 0, "stance": "Il dit « je refuse »", "salience": 0.5}]
    assert validate_scores(empty, {1}) is False
    assert validate_scores(quoted, {1}) is False


def test_validate_scores_ordinal_bounds():
    from analyze_debate import validate_scores
    ok = [{"i": 1, "x": -2, "y": 2, "stance": "Position.", "salience": 0.5}]
    too_big = [{"i": 1, "x": 5, "y": 0, "stance": "Position.", "salience": 0.5}]
    assert validate_scores(ok, {1}) is True
    assert validate_scores(too_big, {1}) is False


def test_run_scoring_remaps_ordinal_to_display_scale():
    from analyze_debate import run_scoring
    blocks = [{"i": 0, "vid": "i1", "label": "Interlocuteur 1", "t": 1.0, "text": "x " * 20}]
    resp = MagicMock(); resp.text = json.dumps(
        [{"i": 0, "x": -2, "y": 1.2, "stance": "Position.", "salience": 0.9}])
    client = MagicMock(); client.models.generate_content.return_value = resp
    out = run_scoring(client, blocks, AXES_ANCHORED_FIXT, {"topic": "X"})
    assert out[0]["x"] == -10      # -2 × 5
    assert out[0]["y"] == 5        # round(1.2)=1 × 5


def test_build_scoring_prompt_uses_ordinal_scale():
    from analyze_debate import build_scoring_prompt
    batch = [{"i": 1, "vid": "i1", "label": "Interlocuteur 1", "t": 1.0, "text": "Texte."}]
    prompt = build_scoring_prompt(batch, [], [], AXES_ANCHORED_FIXT, {"topic": "X"})
    assert "-2..2" in prompt or "entre -2 et 2" in prompt
    assert "nettement" in prompt          # échelle verbalisée
    assert "<-10..10>" not in prompt      # plus d'échelle continue demandée au LLM


def test_validate_scores_rejects_bad_salience_and_malformed():
    from analyze_debate import validate_scores
    assert validate_scores([{"i": 1, "x": 0, "y": 0, "stance": "s", "salience": 2}], {1}) is False
    assert validate_scores("pas une liste", {1}) is False
    assert validate_scores([{"x": 0}], {1}) is False


# Passe 3 — scoring par bloc

AXES_FIXT = {
    "x": {"leftLabel": "Liberté", "rightLabel": "Égalité"},
    "y": {"bottomLabel": "Technique", "topLabel": "Principes"},
}

AXES_ANCHORED_FIXT = {
    "x": {"leftLabel": "Liberté", "rightLabel": "Égalité", "anchors": ANCHORS_X},
    "y": {"bottomLabel": "Technique", "topLabel": "Principes", "anchors": ANCHORS_Y},
}


def test_build_scoring_prompt_includes_axes_and_payload():
    from analyze_debate import build_scoring_prompt
    batch = [{"i": 1, "vid": "i1", "label": "Interlocuteur 1", "t": 1.0, "text": "Texte du bloc."}]
    prompt = build_scoring_prompt(batch, [], [], AXES_FIXT, {"topic": "Retraites"})
    assert "Liberté" in prompt and "Égalité" in prompt
    assert "Texte du bloc." in prompt
    assert "reformulation" in prompt.lower()
    assert "prénom" in prompt.lower()


def test_build_scoring_prompt_includes_anchors_and_doubt_rule():
    from analyze_debate import build_scoring_prompt
    batch = [{"i": 1, "vid": "i1", "label": "Interlocuteur 1", "t": 1.0, "text": "Texte."}]
    prompt = build_scoring_prompt(batch, [], [], AXES_ANCHORED_FIXT, {"topic": "Retraites"})
    assert "La liberté individuelle passe avant tout." in prompt   # ancre gauche
    assert "positions-types" in prompt.lower()
    assert "none" in prompt and "doute" in prompt.lower()


def test_run_scoring_merges_batches():
    from analyze_debate import run_scoring
    import analyze_debate
    # 26 blocs → 2 lots (25 + 1)
    blocks = [{"i": n, "vid": "i1", "label": "Interlocuteur 1", "t": float(n), "text": "x " * 20}
              for n in range(26)]
    lot1 = json.dumps([{"i": n, "x": 0, "y": 0, "stance": "Position.", "salience": 0.5}
                       for n in range(25)])
    lot2 = json.dumps([{"i": 25, "none": True}])
    client = MagicMock()
    r1 = MagicMock(); r1.text = lot1
    r2 = MagicMock(); r2.text = lot2
    client.models.generate_content.side_effect = [r1, r2]
    out = run_scoring(client, blocks, AXES_FIXT, {"topic": "X"})
    assert client.models.generate_content.call_count == 2
    assert set(out.keys()) == set(range(25))          # le "none" (i=25) est exclu
    assert out[0]["stance"] == "Position."


def test_run_scoring_skips_failed_batch():
    from analyze_debate import run_scoring
    blocks = [{"i": n, "vid": "i1", "label": "Interlocuteur 1", "t": float(n), "text": "x " * 20}
              for n in range(26)]
    bad = MagicMock(); bad.text = "pas du json"
    lot2 = MagicMock(); lot2.text = json.dumps(
        [{"i": 25, "x": 1, "y": 1, "stance": "Position.", "salience": 0.7}])
    client = MagicMock()
    # lot 1 : 2 tentatives échouées ; lot 2 : OK
    client.models.generate_content.side_effect = [bad, bad, lot2]
    out = run_scoring(client, blocks, AXES_FIXT, {"topic": "X"})
    assert set(out.keys()) == {25}


def test_run_scoring_empty_blocks_no_call():
    from analyze_debate import run_scoring
    client = MagicMock()
    assert run_scoring(client, [], AXES_FIXT, {"topic": "X"}) == {}
    client.models.generate_content.assert_not_called()


# Trajectoires calculées (EWMA)

def _blocks_and_scores(specs):
    """specs: liste de (i, vid, t, x, y, salience). Retourne (blocks, scores)."""
    blocks, scores = [], {}
    for (i, vid, t, x, y, sal) in specs:
        blocks.append({"i": i, "vid": vid, "label": vid, "t": t, "text": "x " * 20})
        scores[i] = {"x": x, "y": y, "stance": f"Position {i}.", "salience": sal}
    return blocks, scores


def test_compute_trajectories_smooths_toward_new_score():
    from analyze_debate import compute_trajectories
    blocks, scores = _blocks_and_scores([
        (1, "i1", 2.0, 0, 0, 1.0),
        (2, "i1", 10.0, 10, 0, 1.0),
    ])
    out = compute_trajectories(blocks, scores, {"i1": 1.0})
    # EWMA : 0 + 0.35*1.0*(10-0) = 3.5 — pas un saut à 10
    assert out["i1"]["kf"] == [[1.0, 0.0, 0.0], [2.0, 0.0, 0.0], [10.0, 3.5, 0.0]]


def test_compute_trajectories_salience_is_floored():
    from analyze_debate import compute_trajectories
    blocks, scores = _blocks_and_scores([
        (1, "i1", 2.0, 0, 0, 1.0),
        (2, "i1", 10.0, 10, 0, 0.0),   # salience 0 → plancher 0.3 s'applique
    ])
    out = compute_trajectories(blocks, scores, {"i1": 1.0})
    # 0 + 0.35*max(0.3, 0)*(10-0) = 1.05 : un bloc réellement scoré pèse toujours un minimum
    assert out["i1"]["kf"][-1] == [10.0, 1.05, 0.0]


def test_compute_trajectories_single_block_fixed():
    from analyze_debate import compute_trajectories
    blocks, scores = _blocks_and_scores([(1, "i1", 2.0, -4, 5, 0.8)])
    out = compute_trajectories(blocks, scores, {"i1": 1.0})
    assert out["i1"]["kf"] == [[1.0, -4.0, 5.0], [2.0, -4.0, 5.0]]
    assert len(out["i1"]["points"]) == 1
    assert out["i1"]["points"][0]["stance"] == "Position 1."


def test_compute_trajectories_voice_without_scores_absent():
    from analyze_debate import compute_trajectories
    blocks, scores = _blocks_and_scores([(1, "i1", 2.0, 0, 0, 1.0)])
    # i2 a un bloc mais aucun score (lot échoué, ou "none")
    blocks.append({"i": 2, "vid": "i2", "label": "Interlocuteur 2", "t": 3.0, "text": "x " * 20})
    out = compute_trajectories(blocks, scores, {"i1": 1.0, "i2": 3.0})
    assert "i2" not in out


def test_compute_trajectories_kf_monotonic_and_entry_not_duplicated():
    from analyze_debate import compute_trajectories
    # premier bloc exactement à l'entrée → pas de doublon [entry, ...]
    blocks, scores = _blocks_and_scores([
        (1, "i1", 1.0, 2, 2, 1.0),
        (2, "i1", 5.0, 4, 4, 1.0),
    ])
    out = compute_trajectories(blocks, scores, {"i1": 1.0})
    ts = [p[0] for p in out["i1"]["kf"]]
    assert ts == sorted(ts) and len(ts) == len(set(ts))
    assert out["i1"]["kf"][0] == [1.0, 2.0, 2.0]
