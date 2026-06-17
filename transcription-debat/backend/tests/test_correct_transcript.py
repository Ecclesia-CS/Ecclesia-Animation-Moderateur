import json
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock

SAMPLE_SEGMENTS = [
    {"start": 0.0, "end": 45.3, "speaker": "Interlocuteur 1", "text": "Donc en 1960 le ratio actifs sur rétrait", "refused": False},
    {"start": 45.3, "end": 90.0, "speaker": "[REFUS]", "text": "[N'a pas souhaité être enregistré(e)]", "refused": True},
    {"start": 90.0, "end": 120.0, "speaker": "Interlocuteur 2", "text": "Oui mais il faut noter que", "refused": False},
]

CORRECTED_SEGMENTS = [
    {"start": 0.0, "end": 45.3, "speaker": "Interlocuteur 1", "text": "Donc en 1960, le ratio actifs sur retraités", "refused": False},
    {"start": 45.3, "end": 90.0, "speaker": "[REFUS]", "text": "[N'a pas souhaité être enregistré(e)]", "refused": True},
    {"start": 90.0, "end": 120.0, "speaker": "Interlocuteur 2", "text": "Oui, mais il faut noter que", "refused": False},
]


def _mock_client(response_text: str) -> MagicMock:
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.text = response_text
    mock_client.models.generate_content.return_value = mock_response
    return mock_client


def test_correct_writes_files_on_success(tmp_path):
    from correct_transcript import correct
    stem = tmp_path / "debat"
    with patch("correct_transcript._make_client", return_value=_mock_client(json.dumps(CORRECTED_SEGMENTS))):
        result = correct(SAMPLE_SEGMENTS, stem)
    assert result is True
    assert (tmp_path / "debat_corrected.json").exists()
    assert (tmp_path / "debat_corrected.txt").exists()


def test_correct_json_content(tmp_path):
    from correct_transcript import correct
    stem = tmp_path / "debat"
    with patch("correct_transcript._make_client", return_value=_mock_client(json.dumps(CORRECTED_SEGMENTS))):
        correct(SAMPLE_SEGMENTS, stem)
    data = json.loads((tmp_path / "debat_corrected.json").read_text(encoding="utf-8"))
    assert data[0]["text"] == "Donc en 1960, le ratio actifs sur retraités"
    assert data[1]["text"] == "[N'a pas souhaité être enregistré(e)]"


def test_correct_txt_format(tmp_path):
    from correct_transcript import correct
    stem = tmp_path / "debat"
    with patch("correct_transcript._make_client", return_value=_mock_client(json.dumps(CORRECTED_SEGMENTS))):
        correct(SAMPLE_SEGMENTS, stem)
    txt = (tmp_path / "debat_corrected.txt").read_text(encoding="utf-8")
    assert txt.startswith("[00:00:00] Interlocuteur 1:")
    assert "[REFUS]" in txt


def test_correct_returns_false_on_invalid_json(tmp_path):
    from correct_transcript import correct
    stem = tmp_path / "debat"
    with patch("correct_transcript._make_client", return_value=_mock_client("ce n'est pas du JSON")):
        result = correct(SAMPLE_SEGMENTS, stem)
    assert result is False
    assert not (tmp_path / "debat_corrected.json").exists()


def test_correct_returns_false_on_wrong_segment_count(tmp_path):
    from correct_transcript import correct
    stem = tmp_path / "debat"
    too_few = CORRECTED_SEGMENTS[:2]
    with patch("correct_transcript._make_client", return_value=_mock_client(json.dumps(too_few))):
        result = correct(SAMPLE_SEGMENTS, stem)
    assert result is False
    assert not (tmp_path / "debat_corrected.json").exists()


def test_correct_returns_false_on_modified_structural_fields(tmp_path):
    from correct_transcript import correct
    stem = tmp_path / "debat"
    tampered = json.loads(json.dumps(CORRECTED_SEGMENTS))
    tampered[0]["start"] = 99.0  # start modifié
    with patch("correct_transcript._make_client", return_value=_mock_client(json.dumps(tampered))):
        result = correct(SAMPLE_SEGMENTS, stem)
    assert result is False


def test_correct_returns_false_when_api_key_missing(tmp_path, monkeypatch):
    from correct_transcript import correct
    stem = tmp_path / "debat"
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with patch("correct_transcript._load_api_key", return_value=None):
        result = correct(SAMPLE_SEGMENTS, stem)
    assert result is False
    assert not (tmp_path / "debat_corrected.json").exists()


def test_cli_standalone(tmp_path):
    import subprocess, sys
    json_path = tmp_path / "debat.json"
    json_path.write_text(json.dumps(SAMPLE_SEGMENTS), encoding="utf-8")
    corrected_response = json.dumps(CORRECTED_SEGMENTS)

    # On ne peut pas mocker proprement en subprocess — on vérifie juste que le script
    # ne crashe pas quand la clé est absente (retourne False silencieusement)
    result = subprocess.run(
        [sys.executable, "correct_transcript.py", str(json_path)],
        capture_output=True,
        text=True,
        cwd=str(Path(__file__).parent.parent),
        env={**__import__("os").environ, "GEMINI_API_KEY": ""},
    )
    assert result.returncode == 0  # ne doit pas crasher
