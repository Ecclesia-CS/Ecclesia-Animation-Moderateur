import textwrap, csv, json
from pathlib import Path
from datetime import datetime, timezone
from transcribe_offline import load_anon_log, compute_offsets, assign_speakers, merge_same_speaker, write_txt, write_json

FIXTURE_LOG = textwrap.dedent("""\
    interlocuteur,debut_iso,fin_iso,refuse
    Interlocuteur 1,2026-05-28T11:00:00+00:00,2026-05-28T11:01:00+00:00,false
    [REFUS],2026-05-28T11:01:00+00:00,2026-05-28T11:02:00+00:00,true
    Interlocuteur 2,2026-05-28T11:02:30+00:00,2026-05-28T11:03:00+00:00,false
""")


def _write_log(tmp_path):
    f = tmp_path / "log_anon.csv"
    f.write_text(FIXTURE_LOG, encoding="utf-8")
    return str(f)


def test_load_anon_log_fields(tmp_path):
    turns = load_anon_log(_write_log(tmp_path))
    assert len(turns) == 3
    assert turns[0]["interlocuteur"] == "Interlocuteur 1"
    assert turns[1]["refuse"] is True
    assert turns[2]["refuse"] is False


def test_compute_offsets_basic(tmp_path):
    turns = load_anon_log(_write_log(tmp_path))
    audio_start = datetime(2026, 5, 28, 11, 0, 0, tzinfo=timezone.utc)
    result = compute_offsets(turns, audio_start)
    assert result[0]["debut_sec"] == 0.0
    assert result[0]["fin_sec"] == 60.0
    assert result[1]["debut_sec"] == 60.0
    assert result[2]["debut_sec"] == 150.0


def test_compute_offsets_default_audio_start(tmp_path):
    turns = load_anon_log(_write_log(tmp_path))
    result = compute_offsets(turns, audio_start=None)
    assert result[0]["debut_sec"] == 0.0


def _turns_with_offsets():
    return [
        {"interlocuteur": "Interlocuteur 1", "debut_sec": 0.0,   "fin_sec": 60.0,  "refuse": False},
        {"interlocuteur": "[REFUS]",          "debut_sec": 60.0,  "fin_sec": 120.0, "refuse": True},
        {"interlocuteur": "Interlocuteur 2",  "debut_sec": 150.0, "fin_sec": 180.0, "refuse": False},
    ]


def test_assign_normal_segment():
    segs = [{"start": 10.0, "end": 30.0, "text": "Bonjour tout le monde"}]
    result = assign_speakers(segs, _turns_with_offsets())
    assert result[0]["speaker"] == "Interlocuteur 1"
    assert result[0]["text"] == "Bonjour tout le monde"
    assert result[0]["refused"] is False


def test_assign_refused_segment():
    segs = [{"start": 65.0, "end": 90.0, "text": "Ce texte ne doit pas apparaitre"}]
    result = assign_speakers(segs, _turns_with_offsets())
    assert result[0]["speaker"] == "[REFUS]"
    assert result[0]["text"] == "[N'a pas souhaité être enregistré(e)]"
    assert result[0]["refused"] is True


def test_assign_gap_segment():
    segs = [{"start": 125.0, "end": 145.0, "text": "Quelqu'un hors tour"}]
    result = assign_speakers(segs, _turns_with_offsets())
    assert result[0]["speaker"] == "[?]"
    assert result[0]["refused"] is False


def test_assign_segment_spanning_two_turns_takes_majority():
    segs = [{"start": 50.0, "end": 80.0, "text": "Chevauchement"}]
    result = assign_speakers(segs, _turns_with_offsets())
    assert result[0]["speaker"] == "[REFUS]"


def test_merge_same_speaker_consecutive():
    segs = [
        {"start": 0.0,  "end": 10.0, "speaker": "A", "text": "Bonjour",  "refused": False},
        {"start": 10.0, "end": 20.0, "speaker": "A", "text": "le monde", "refused": False},
        {"start": 20.0, "end": 30.0, "speaker": "B", "text": "Salut",    "refused": False},
    ]
    result = merge_same_speaker(segs)
    assert len(result) == 2
    assert result[0]["text"] == "Bonjour le monde"
    assert result[0]["end"] == 20.0
    assert result[1]["speaker"] == "B"


def test_merge_does_not_merge_different_speakers():
    segs = [
        {"start": 0.0, "end": 5.0,  "speaker": "A", "text": "Oui", "refused": False},
        {"start": 5.0, "end": 10.0, "speaker": "B", "text": "Non", "refused": False},
        {"start": 10.0,"end": 15.0, "speaker": "A", "text": "Si",  "refused": False},
    ]
    result = merge_same_speaker(segs)
    assert len(result) == 3


def test_write_txt_format(tmp_path):
    segs = [
        {"start": 0.0,    "end": 60.0,  "speaker": "Interlocuteur 1", "text": "Bonjour",     "refused": False},
        {"start": 60.0,   "end": 120.0, "speaker": "[REFUS]",          "text": "[Non enreg]", "refused": True},
        {"start": 3661.0, "end": 3700.0,"speaker": "Interlocuteur 2",  "text": "Au revoir",   "refused": False},
    ]
    out = tmp_path / "out.txt"
    write_txt(segs, out)
    lines = out.read_text(encoding="utf-8").splitlines()
    assert lines[0] == "[00:00:00] Interlocuteur 1: Bonjour"
    assert lines[1] == "[00:01:00] [REFUS]: [Non enreg]"
    assert lines[2] == "[01:01:01] Interlocuteur 2: Au revoir"


def test_write_json_structure(tmp_path):
    segs = [
        {"start": 0.0, "end": 10.0, "speaker": "Interlocuteur 1", "text": "Test", "refused": False},
    ]
    out = tmp_path / "out.json"
    write_json(segs, out)
    data = json.loads(out.read_text(encoding="utf-8"))
    assert isinstance(data, list)
    assert data[0]["speaker"] == "Interlocuteur 1"
    assert data[0]["start"] == 0.0
    assert data[0]["refused"] is False


def test_main_calls_correct(tmp_path, monkeypatch):
    """Vérifie que main() appelle correct() avec les segments et le chemin de base."""
    import sys
    import correct_transcript
    from unittest.mock import MagicMock, patch
    import transcribe_offline

    # Préparer un CSV log minimal
    log_file = tmp_path / "log_anon.csv"
    log_file.write_text(FIXTURE_LOG, encoding="utf-8")

    # Mock WhisperModel — retourne un segment factice
    fake_segment = MagicMock()
    fake_segment.start = 0.0
    fake_segment.end = 5.0
    fake_segment.text = "Bonjour."

    mock_model = MagicMock()
    mock_model.transcribe.return_value = ([fake_segment], None)

    correct_calls = []

    def fake_correct(segments, output_stem):
        correct_calls.append((segments, output_stem))
        return True

    monkeypatch.setattr(correct_transcript, "correct", fake_correct)

    with patch("transcribe_offline.WhisperModel", return_value=mock_model), \
         patch("sys.argv", ["transcribe_offline.py", "fake_audio.mp3", str(log_file), "--group", "TEST"]):
        transcribe_offline.main()

    assert len(correct_calls) == 1
    segments, output_stem = correct_calls[0]
    assert isinstance(segments, list)
    assert "TEST" in str(output_stem)
