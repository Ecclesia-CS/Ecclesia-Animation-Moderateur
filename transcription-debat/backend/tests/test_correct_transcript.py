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


def test_correct_falls_back_to_raw_on_invalid_json(tmp_path):
    """Si Gemini retourne du JSON invalide, le batch brut est conservé et le fichier est quand même écrit."""
    from correct_transcript import correct
    stem = tmp_path / "debat"
    with patch("correct_transcript._make_client", return_value=_mock_client("ce n'est pas du JSON")):
        result = correct(SAMPLE_SEGMENTS, stem)
    assert result is True
    data = json.loads((tmp_path / "debat_corrected.json").read_text(encoding="utf-8"))
    assert data[0]["text"] == SAMPLE_SEGMENTS[0]["text"]  # brut conservé


def test_correct_falls_back_to_raw_on_wrong_segment_count(tmp_path):
    """Si Gemini retourne un nombre incorrect de segments, le batch brut est conservé."""
    from correct_transcript import correct
    stem = tmp_path / "debat"
    too_few = CORRECTED_SEGMENTS[:2]
    with patch("correct_transcript._make_client", return_value=_mock_client(json.dumps(too_few))):
        result = correct(SAMPLE_SEGMENTS, stem)
    assert result is True
    data = json.loads((tmp_path / "debat_corrected.json").read_text(encoding="utf-8"))
    assert data[0]["text"] == SAMPLE_SEGMENTS[0]["text"]


def test_correct_rejects_grossly_modified_timestamps(tmp_path):
    """Un timestamp modifié de plus de 0.1s est rejeté et le batch brut est conservé."""
    from correct_transcript import correct
    stem = tmp_path / "debat"
    tampered = json.loads(json.dumps(CORRECTED_SEGMENTS))
    tampered[0]["start"] = 99.0  # décalage de 99s — clairement invalide
    with patch("correct_transcript._make_client", return_value=_mock_client(json.dumps(tampered))):
        result = correct(SAMPLE_SEGMENTS, stem)
    assert result is True
    data = json.loads((tmp_path / "debat_corrected.json").read_text(encoding="utf-8"))
    assert data[0]["text"] == SAMPLE_SEGMENTS[0]["text"]  # brut conservé car batch rejeté


def test_correct_returns_false_when_api_key_missing(tmp_path, monkeypatch):
    from correct_transcript import correct
    stem = tmp_path / "debat"
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with patch("correct_transcript._load_api_key", return_value=None):
        result = correct(SAMPLE_SEGMENTS, stem)
    assert result is False
    assert not (tmp_path / "debat_corrected.json").exists()


def test_validate_allows_speaker_attribution_for_unknown():
    """_validate accepte qu'un segment [?] reçoive un speaker identifié."""
    from correct_transcript import _validate
    original = [{"start": 0.0, "end": 5.0, "speaker": "[?]", "text": "Bonjour", "refused": False}]
    corrected = [{"start": 0.0, "end": 5.0, "speaker": "Interlocuteur 1", "text": "Bonjour", "refused": False}]
    assert _validate(original, corrected) is True


def test_validate_rejects_speaker_change_for_known_speaker():
    """_validate rejette le changement de speaker d'un segment déjà attribué."""
    from correct_transcript import _validate
    original = [{"start": 0.0, "end": 5.0, "speaker": "Interlocuteur 1", "text": "Bonjour", "refused": False}]
    corrected = [{"start": 0.0, "end": 5.0, "speaker": "Interlocuteur 2", "text": "Bonjour", "refused": False}]
    assert _validate(original, corrected) is False


def test_validate_rejects_invented_label_for_unknown():
    """Avec whitelist, un [?] réattribué à un label hors-liste (prénom inventé) est rejeté."""
    from correct_transcript import _validate
    original = [{"start": 0.0, "end": 5.0, "speaker": "[?]", "text": "Bonjour", "refused": False}]
    corrected = [{"start": 0.0, "end": 5.0, "speaker": "Claude", "text": "Bonjour", "refused": False}]
    allowed = {"Interlocuteur 1", "Modérateur", "[?]", "[REFUS]"}
    assert _validate(original, corrected, allowed) is False
    assert _validate(original, corrected, None) is True  # sans whitelist : permissif


def test_validate_allows_moderateur_label():
    from correct_transcript import _validate
    original = [{"start": 0.0, "end": 5.0, "speaker": "[?]", "text": "Bonjour", "refused": False}]
    corrected = [{"start": 0.0, "end": 5.0, "speaker": "Modérateur", "text": "Bonjour", "refused": False}]
    allowed = {"Interlocuteur 1", "Modérateur", "[?]", "[REFUS]"}
    assert _validate(original, corrected, allowed) is True


def test_correct_rejects_invented_name_keeps_raw(tmp_path):
    """Bout en bout : Gemini invente 'Claude' sur un [?] → batch rejeté, brut conservé."""
    from correct_transcript import correct
    segs = [{"start": 0.0, "end": 5.0, "speaker": "[?]", "text": "Bonjour", "refused": False}]
    tampered = [{"start": 0.0, "end": 5.0, "speaker": "Claude", "text": "Bonjour", "refused": False}]
    stem = tmp_path / "debat"
    with patch("correct_transcript._make_client", return_value=_mock_client(json.dumps(tampered))):
        result = correct(segs, stem)
    assert result is True
    data = json.loads((tmp_path / "debat_corrected.json").read_text(encoding="utf-8"))
    assert data[0]["speaker"] == "[?]"  # attribution inventée rejetée


def test_correct_batch_handles_segments_key_response(tmp_path):
    """_correct_batch accepte une réponse Gemini { segments: [...] } en plus d'une liste brute."""
    from correct_transcript import correct
    stem = tmp_path / "debat"
    wrapped = {"segments": CORRECTED_SEGMENTS}
    with patch("correct_transcript._make_client", return_value=_mock_client(json.dumps(wrapped))):
        result = correct(SAMPLE_SEGMENTS, stem)
    assert result is True
    data = json.loads((tmp_path / "debat_corrected.json").read_text(encoding="utf-8"))
    assert data[0]["text"] == CORRECTED_SEGMENTS[0]["text"]


def test_cli_standalone(tmp_path):
    import subprocess, sys
    json_path = tmp_path / "debat.json"
    json_path.write_text(json.dumps(SAMPLE_SEGMENTS), encoding="utf-8")

    # On ne peut pas mocker proprement en subprocess — on vérifie juste que le script
    # exit 1 quand la clé est absente (retourne False)
    result = subprocess.run(
        [sys.executable, "correct_transcript.py", str(json_path)],
        capture_output=True,
        text=True,
        cwd=str(Path(__file__).parent.parent / "code python"),
        env={**__import__("os").environ, "GEMINI_API_KEY": ""},
    )
    assert result.returncode == 1  # exit 1 quand correction échoue
