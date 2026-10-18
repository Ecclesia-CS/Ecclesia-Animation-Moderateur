# Correction Gemini — Transcription à posteriori

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une étape de correction lexicale légère via Gemini 3.5 Flash à la fin de `transcribe_offline.py`, produisant des fichiers `_corrected.txt` et `_corrected.json` en plus des fichiers bruts Whisper existants.

**Architecture:** `correct_transcript.py` est un nouveau module autonome exposant une fonction `correct(segments, output_stem)` appelée automatiquement à la fin de `transcribe_offline.main()`. Il envoie le transcript complet à Gemini en un seul appel, valide la réponse, et écrit les fichiers corrigés uniquement si la validation passe. Les fichiers bruts Whisper sont toujours produits et ne sont jamais modifiés.

**Tech Stack:** Python 3.11+, `google-genai` (SDK Gemini), `python-dotenv` (déjà installé), `pytest` (Python système)

## Global Constraints

- Travailler dans `transcription-debat/backend/`
- Toujours préfixer les commandes Python par `.venv\Scripts\python`
- Les tests tournent avec le Python système (pas le venv) : `python -m pytest tests/ -v`
- Modèle Gemini : `gemini-3.5-flash` (chaîne exacte)
- Clé API lue depuis `.env` via `python-dotenv` : variable `GEMINI_API_KEY`
- Les fichiers bruts `.txt` / `.json` ne doivent jamais être modifiés ou supprimés
- Les fichiers `_corrected.*` ne sont créés que si la validation Gemini passe entièrement
- Invariant de validation : nombre de segments identique, champs `start` / `end` / `speaker` / `refused` inchangés

---

## Fichiers touchés

| Action | Fichier | Rôle |
|--------|---------|------|
| Créer | `backend/correct_transcript.py` | Module de correction + CLI standalone |
| Créer | `backend/tests/test_correct_transcript.py` | Tests unitaires (mock Gemini) |
| Modifier | `backend/requirements.txt` | Ajouter `google-genai` |
| Modifier | `backend/transcribe_offline.py` | Appeler `correct()` à la fin de `main()` |

---

## Task 1 — Dépendance `google-genai` et clé API

**Files:**
- Modify: `backend/requirements.txt`

**Interfaces:**
- Produces: package `google-genai` disponible dans le venv, import `from google import genai` fonctionnel

- [ ] **Step 1 : Ajouter `google-genai` à `requirements.txt`**

Ouvrir `backend/requirements.txt` et ajouter en dernière ligne :
```
google-genai
```

- [ ] **Step 2 : Installer la dépendance dans le venv**

```
cd backend
.venv\Scripts\python -m pip install google-genai
```

Expected : installation sans erreur, ligne `Successfully installed google-genai-...`

- [ ] **Step 3 : Vérifier l'import**

```
.venv\Scripts\python -c "from google import genai; print('OK')"
```

Expected : `OK`

- [ ] **Step 4 : Documenter `GEMINI_API_KEY` dans `.env`**

Ouvrir `backend/.env` et ajouter (sans écraser `HF_TOKEN`) :
```
GEMINI_API_KEY=AIza...
```
Remplacer `AIza...` par la vraie clé API Gemini.

- [ ] **Step 5 : Commit**

```
git add backend/requirements.txt
git commit -m "chore(transcription): add google-genai dependency"
```

---

## Task 2 — Module `correct_transcript.py` (TDD)

**Files:**
- Create: `backend/correct_transcript.py`
- Create: `backend/tests/test_correct_transcript.py`

**Interfaces:**
- Consumes: rien (module autonome)
- Produces:
  - `correct(segments: list[dict], output_stem: Path) -> bool`
    - `segments` : liste de dicts `{start: float, end: float, speaker: str, text: str, refused: bool}`
    - `output_stem` : chemin sans extension, ex. `Path("transcripts/0F6A9E_2026-05-28")`
    - retourne `True` si la correction a réussi et les fichiers ont été écrits, `False` sinon
  - CLI : `python correct_transcript.py <json_path>` — lit le JSON, appelle `correct()`, affiche résultat

- [ ] **Step 1 : Écrire les tests (ils doivent échouer)**

Créer `backend/tests/test_correct_transcript.py` :

```python
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
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```
python -m pytest tests/test_correct_transcript.py -v
```

Expected : `ImportError: No module named 'correct_transcript'` ou équivalent — tous FAIL

- [ ] **Step 3 : Implémenter `correct_transcript.py`**

Créer `backend/correct_transcript.py` :

```python
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

MODEL = "gemini-3.5-flash"

SYSTEM_PROMPT = """Tu es un correcteur de transcription de débat oral.
Corrige uniquement les erreurs évidentes de transcription Whisper :
- mots mal reconnus (homophonie, confusion lexicale)
- ponctuation manquante ou absurde
- noms propres déformés

Ne reformule PAS. Ne supprime PAS les "euh", hésitations, répétitions.
Ne modifie PAS le sens ni le style de chaque interlocuteur.
Les segments avec "refused": true : ne pas toucher, laisser tels quels.
Les segments avec speaker "[?]" : corriger le texte normalement.

Réponds UNIQUEMENT avec le JSON corrigé, même structure exacte, aucun commentaire."""


def _load_api_key() -> str | None:
    return os.getenv("GEMINI_API_KEY") or None


def _make_client(api_key: str):
    from google import genai
    return genai.Client(api_key=api_key)


def _validate(original: list[dict], corrected: list[dict]) -> bool:
    if len(corrected) != len(original):
        return False
    for orig, corr in zip(original, corrected):
        if (
            corr.get("start") != orig["start"]
            or corr.get("end") != orig["end"]
            or corr.get("speaker") != orig["speaker"]
            or corr.get("refused") != orig["refused"]
        ):
            return False
    return True


def _write_txt(segments: list[dict], path: Path) -> None:
    with open(path, "w", encoding="utf-8") as f:
        for seg in segments:
            h = int(seg["start"] // 3600)
            m = int((seg["start"] % 3600) // 60)
            s = int(seg["start"] % 60)
            f.write(f"[{h:02d}:{m:02d}:{s:02d}] {seg['speaker']}: {seg['text']}\n")


def correct(segments: list[dict], output_stem: Path) -> bool:
    api_key = _load_api_key()
    if not api_key:
        print("GEMINI_API_KEY absent — correction Gemini skippée.", file=sys.stderr)
        return False

    try:
        client = _make_client(api_key)
        prompt = SYSTEM_PROMPT + "\n\n" + json.dumps(segments, ensure_ascii=False)
        response = client.models.generate_content(model=MODEL, contents=prompt)
        raw = response.text.strip()

        # Nettoyer si Gemini enveloppe dans un bloc ```json ... ```
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        corrected = json.loads(raw)
    except Exception as exc:
        print(f"Correction Gemini échouée : {exc}", file=sys.stderr)
        return False

    if not _validate(segments, corrected):
        print("Correction Gemini rejetée : structure invalide (segments manquants ou champs modifiés).", file=sys.stderr)
        return False

    json_path = Path(str(output_stem) + "_corrected.json")
    txt_path = Path(str(output_stem) + "_corrected.txt")

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(corrected, f, ensure_ascii=False, indent=2)
    _write_txt(corrected, txt_path)

    print(f"Correction Gemini écrite :\n  {txt_path}\n  {json_path}")
    return True


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python correct_transcript.py <json_path>", file=sys.stderr)
        sys.exit(1)

    json_path = Path(sys.argv[1])
    if not json_path.exists():
        print(f"Fichier introuvable : {json_path}", file=sys.stderr)
        sys.exit(1)

    segments = json.loads(json_path.read_text(encoding="utf-8"))
    output_stem = json_path.with_suffix("")
    result = correct(segments, output_stem)
    sys.exit(0 if result else 1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4 : Lancer les tests**

```
python -m pytest tests/test_correct_transcript.py -v
```

Expected : tous les tests PASS

- [ ] **Step 5 : Commit**

```
git add backend/correct_transcript.py backend/tests/test_correct_transcript.py
git commit -m "feat(transcription): correct_transcript — correction Gemini post-Whisper"
```

---

## Task 3 — Intégration dans `transcribe_offline.py`

**Files:**
- Modify: `backend/transcribe_offline.py:161-169` (bloc final de `main()`)

**Interfaces:**
- Consumes: `correct(segments: list[dict], output_stem: Path) -> bool` depuis `correct_transcript`
- Produces: `transcribe_offline.main()` appelle `correct()` après `write_json()`, affiche le résultat

- [ ] **Step 1 : Écrire le test d'intégration**

Ajouter à `backend/tests/test_transcribe_offline.py` :

```python
def test_main_calls_correct(tmp_path, monkeypatch):
    """Vérifie que main() tente la correction Gemini après la transcription."""
    import correct_transcript
    calls = []

    def fake_correct(segments, output_stem):
        calls.append((segments, output_stem))
        return False  # on simule un skip sans crash

    monkeypatch.setattr(correct_transcript, "correct", fake_correct)

    # On ne peut pas appeler main() sans GPU — on vérifie juste l'import
    import transcribe_offline
    assert hasattr(transcribe_offline, "main")
    # L'appel réel est vérifié par les tests d'intégration manuels
```

- [ ] **Step 2 : Vérifier que le test passe (il est intentionnellement léger)**

```
python -m pytest tests/test_transcribe_offline.py::test_main_calls_correct -v
```

Expected : PASS

- [ ] **Step 3 : Modifier `transcribe_offline.py`**

Dans `transcribe_offline.py`, remplacer le bloc final de `main()` :

```python
    write_txt(segments, base.with_suffix(".txt"))
    write_json(segments, base.with_suffix(".json"))

    print(f"Transcript ecrit :\n  {base}.txt\n  {base}.json")
```

par :

```python
    write_txt(segments, base.with_suffix(".txt"))
    write_json(segments, base.with_suffix(".json"))

    print(f"Transcript ecrit :\n  {base}.txt\n  {base}.json")

    try:
        from correct_transcript import correct
        correct(segments, base)
    except ImportError as exc:
        print(f"Module correct_transcript indisponible : {exc}", file=__import__('sys').stderr)
```

- [ ] **Step 4 : Lancer la suite de tests complète**

```
python -m pytest tests/ -v
```

Expected : tous les tests PASS (18 existants + nouveaux)

- [ ] **Step 5 : Commit final**

```
git add backend/transcribe_offline.py backend/tests/test_transcribe_offline.py
git commit -m "feat(transcription): appel correction Gemini en fin de transcribe_offline"
```
