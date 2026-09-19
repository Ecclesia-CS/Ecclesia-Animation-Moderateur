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


def test_correct_wrong_segment_count_salvages_by_timestamps(tmp_path):
    """Gemini omet un segment : les segments retrouvés (même horodatage) sont corrigés,
    le segment manquant garde son texte brut — le lot n'est plus perdu en entier."""
    from correct_transcript import correct
    stem = tmp_path / "debat"
    too_few = CORRECTED_SEGMENTS[:2]
    with patch("correct_transcript._make_client", return_value=_mock_client(json.dumps(too_few))):
        result = correct(SAMPLE_SEGMENTS, stem)
    assert result is True
    data = json.loads((tmp_path / "debat_corrected.json").read_text(encoding="utf-8"))
    assert data[0]["text"] == CORRECTED_SEGMENTS[0]["text"]
    assert data[2]["text"] == SAMPLE_SEGMENTS[2]["text"] and data[2]["correction"] == "aucune"


def test_merged_segments_keep_raw_text(tmp_path):
    """Gemini fusionne deux segments en un : aucun des deux n'est retrouvé intact → brut."""
    segs = [{**_seg("j'ai"), "start": 0.0, "end": 1.0}, {**_seg("aussi une question"), "start": 1.0, "end": 3.0}]
    merged = [{**_seg("J'ai aussi une question."), "start": 0.0, "end": 3.0}]
    data, _, _ = _run_correct(tmp_path, segs, merged)
    assert [d["text"] for d in data] == ["j'ai", "aussi une question"]
    assert all(d["correction"] == "aucune" for d in data)


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


# ---- Garde-fous de fidélité (zéro hallucination) ----

def _run_correct(tmp_path, segs, gemini_segs):
    from correct_transcript import correct
    stem = tmp_path / "debat"
    client = _mock_client(json.dumps(gemini_segs))
    with patch("correct_transcript._make_client", return_value=client):
        assert correct(segs, stem) is True
    data = json.loads((tmp_path / "debat_corrected.json").read_text(encoding="utf-8"))
    txt = (tmp_path / "debat_corrected.txt").read_text(encoding="utf-8")
    return data, txt, client


def _seg(text, speaker="Interlocuteur 1", **kw):
    return {"start": 0.0, "end": 5.0, "speaker": speaker, "text": text, "refused": False, **kw}


def test_unknown_speaker_attribution_is_only_a_suggestion(tmp_path):
    """Gemini devine un orateur à partir du texte seul : c'est une suggestion, pas une attribution."""
    segs = [_seg("Bonjour", "[?]"), _seg("Salut", "Interlocuteur 1")]
    data, txt, _ = _run_correct(tmp_path, segs, [_seg("Bonjour", "Interlocuteur 1"), _seg("Salut", "Interlocuteur 1")])
    assert data[0]["speaker"] == "[?]"
    assert data[0]["speaker_suggestion"] == "Interlocuteur 1"
    assert "[?] (suggestion IA : Interlocuteur 1 ?)" in txt


def test_extra_fields_preserved_and_only_essentials_sent(tmp_path):
    seg = _seg("je trouve que la limite du multi-période", speaker_source="log+voix", low_conf_words=["multi-période"])
    corr = _seg("je trouve que la limite du multiculturalisme")
    data, _, client = _run_correct(tmp_path, [seg], [corr])
    assert data[0]["speaker_source"] == "log+voix"
    assert data[0]["text"] == "je trouve que la limite du multiculturalisme"
    assert data[0]["correction"] == "gemini"
    sent = client.models.generate_content.call_args.kwargs["contents"]
    assert '"mots_douteux": ["multi-période"]' in sent
    assert "speaker_source" not in sent


def test_negation_flip_is_rejected(tmp_path):
    seg = _seg("avant que tu passes la parole je ne le remarque pas, on va le rappeler")
    corr = _seg("avant que tu passes la parole je le remarque, on va le rappeler")
    data, _, _ = _run_correct(tmp_path, [seg], [corr])
    assert data[0]["text"] == seg["text"]
    assert data[0]["correction"] == "rejetee"
    assert data[0]["correction_motif"] == "négation modifiée"
    assert data[0]["texte_gemini"] == corr["text"]


def test_heavy_rewrite_is_rejected(tmp_path):
    seg = _seg("non mais c'est pour moi notre décompte et moi c'est le cas mais c'est pas le cas nos droits")
    corr = _seg("non mais pour moi nos systèmes sont fondés sur des valeurs, c'est pas le cas")
    data, _, _ = _run_correct(tmp_path, [seg], [corr])
    assert data[0]["correction"] == "rejetee"
    assert data[0]["correction_motif"] == "réécriture trop importante"


def test_rejected_segment_keeps_gemini_name_masks(tmp_path):
    """RGPD : même si la correction est rejetée, un prénom masqué par Gemini reste masqué."""
    seg = _seg("sinon donne la parole à Zélie qui est une culturelle ?")
    corr = _seg("sinon, on donne la parole à Interlocuteur 3 qui est interculturelle ?")
    data, _, _ = _run_correct(tmp_path, [seg], [corr])
    assert data[0]["correction"] == "rejetee"
    assert data[0]["text"] == "sinon donne la parole à Interlocuteur 3 qui est une culturelle ?"


def test_mask_on_non_name_is_rejected(tmp_path):
    seg = _seg("vous pensez directement ? B5.")
    corr = _seg("Vous pensez directement ? [Interlocuteur 5].")
    data, _, _ = _run_correct(tmp_path, [seg], [corr])
    assert data[0]["text"] == "vous pensez directement ? B5."
    assert data[0]["correction_motif"] == "masque sans prénom"


def test_hors_debat_prefix_is_not_a_rewrite(tmp_path):
    seg = _seg("c'est une zone où il y a une réunion et après j'ai pas relancé")
    corr = _seg("[HORS-DÉBAT] c'est une zone où il y a une réunion, et après j'ai pas relancé")
    data, _, _ = _run_correct(tmp_path, [seg], [corr])
    assert data[0]["correction"] == "gemini"
    assert data[0]["text"].startswith("[HORS-DÉBAT]")


def test_failed_batch_is_marked(tmp_path):
    from correct_transcript import correct
    stem = tmp_path / "debat"
    with patch("correct_transcript._make_client", return_value=_mock_client("pas du JSON")):
        correct([_seg("bonjour")], stem)
    data = json.loads((tmp_path / "debat_corrected.json").read_text(encoding="utf-8"))
    assert data[0]["correction"] == "aucune"


def test_correct_updates_report_with_counts_and_proper_nouns(tmp_path):
    (tmp_path / "debat_rapport.json").write_text(json.dumps({"metriques": {}}), encoding="utf-8")
    segs = [_seg("merci Zélie pour ça"), _seg("je ne sais pas", "[?]")]
    corr = [_seg("merci Zélie pour ça."), _seg("je sais", "Interlocuteur 1")]
    _run_correct(tmp_path, segs, corr)
    rapport = json.loads((tmp_path / "debat_rapport.json").read_text(encoding="utf-8"))
    c = rapport["correction"]
    assert c["acceptees"] == 1 and c["rejetees"] == 1 and c["non_corrigees"] == 0
    assert c["suggestions_orateur"] == 1
    assert c["motifs_rejet"] == {"négation modifiée": 1}
    assert ["Zélie", 1] in c["noms_propres_a_verifier"]
    assert "metriques" in rapport


def test_one_invalid_segment_does_not_discard_the_whole_batch(tmp_path):
    """Un segment dont Gemini change l'orateur est rejeté seul ; les autres corrections restent."""
    segs = [_seg("bonjour a tous"), _seg("oui mais", "Interlocuteur 2")]
    corr = [_seg("Bonjour à tous."), _seg("Oui, mais", "Interlocuteur 1")]   # orateur changé : interdit
    data, _, _ = _run_correct(tmp_path, segs, corr)
    assert data[0]["text"] == "Bonjour à tous." and data[0]["correction"] == "gemini"
    assert data[1]["text"] == "oui mais" and data[1]["speaker"] == "Interlocuteur 2"
    assert data[1]["correction"] == "aucune"
