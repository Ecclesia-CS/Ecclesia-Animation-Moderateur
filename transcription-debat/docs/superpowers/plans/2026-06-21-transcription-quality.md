# Amélioration qualité transcription — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Éliminer les hallucinations Whisper (répétitions), améliorer l'attribution des `[?]`, et enrichir la correction Gemini avec fenêtre de contexte.

**Architecture:** (1) Nouveau module `deduplicate.py` — 3 passes algorithmiques pures sur les segments. (2) `transcribe_offline.py` appelle `deduplicate()` après `merge_same_speaker`. (3) `correct_transcript.py` appelle `deduplicate()` en entrée, envoie une fenêtre de contexte ±3 segments à Gemini, prompt enrichi pour attribution `[?]` et correction sémantique, validation assouplie pour permettre le changement de speaker `[?]` → label.

**Tech Stack:** Python 3.11+, `difflib.SequenceMatcher`, `re`, `pytest`

## Global Constraints

- Tests lancés depuis `backend/` : `python -m pytest tests/ -v`
- Aucun appel API réel dans les tests — toujours mocker `_make_client`
- `conftest.py` pose automatiquement `GEMINI_API_KEY=test-dummy-key`
- Tous les fichiers créés/modifiés sont dans `backend/`
- Les tests existants (27 au total) ne doivent pas régresser

---

### Task 1 : `deduplicate.py` + `tests/test_deduplicate.py`

**Files:**
- Create: `backend/deduplicate.py`
- Create: `backend/tests/test_deduplicate.py`

**Interfaces:**
- Produces: `deduplicate(segments: list[dict]) -> list[dict]` — fonction publique principale
- Produces: `_dedup_intra(text: str) -> str` — testable individuellement
- Produces: `_dedup_noise(text: str) -> str` — testable individuellement
- Produces: `_dedup_inter(segments: list[dict]) -> list[dict]` — testable individuellement

- [ ] **Étape 1 : Écrire les tests**

Créer `backend/tests/test_deduplicate.py` :

```python
import pytest
from deduplicate import deduplicate, _dedup_intra, _dedup_noise, _dedup_inter


def _seg(text, speaker="Interlocuteur 1", start=0.0, end=1.0, refused=False):
    return {"text": text, "speaker": speaker, "start": start, "end": end, "refused": refused}


# --- _dedup_intra ---

def test_intra_removes_exact_repeated_sentence():
    result = _dedup_intra("Est-ce que c'est vrai ? Est-ce que c'est vrai ?")
    assert result == "Est-ce que c'est vrai ?"


def test_intra_removes_sentence_repeated_four_times():
    result = _dedup_intra("Non. Non. Non. Non.")
    assert result.count("Non") == 1


def test_intra_keeps_distinct_sentences():
    text = "Bonjour. Comment allez-vous ?"
    assert _dedup_intra(text) == text


def test_intra_empty_string():
    assert _dedup_intra("") == ""


def test_intra_single_sentence_unchanged():
    assert _dedup_intra("Bonjour.") == "Bonjour."


# --- _dedup_noise ---

def test_noise_removes_short_repeated_tokens():
    assert _dedup_noise("ta ta ta ta ta") == "ta"


def test_noise_keeps_normal_text():
    text = "Bonjour à tous les participants"
    assert _dedup_noise(text) == text


def test_noise_removes_four_identical_short_words():
    result = _dedup_noise("non non non non")
    assert result.lower().count("non") == 1


# --- _dedup_inter ---

def test_inter_removes_exact_duplicate_consecutive_segments():
    segs = [
        _seg("Bonjour à tous, merci d'être là.", start=0.0, end=2.0),
        _seg("Bonjour à tous, merci d'être là.", start=2.0, end=4.0),
    ]
    result = _dedup_inter(segs)
    assert len(result) == 1
    assert result[0]["end"] == 4.0


def test_inter_keeps_distinct_segments():
    segs = [_seg("Bonjour.", start=0.0, end=1.0), _seg("Au revoir.", start=1.0, end=2.0)]
    assert len(_dedup_inter(segs)) == 2


def test_inter_keeps_longer_text_when_merging():
    segs = [
        _seg("Bonjour à tous.", start=0.0, end=2.0),
        _seg("Bonjour à tous, merci d'être là.", start=2.0, end=4.0),
    ]
    result = _dedup_inter(segs)
    assert len(result) == 1
    assert "merci" in result[0]["text"]
    assert result[0]["end"] == 4.0


def test_inter_does_not_merge_across_refused_segment():
    segs = [
        _seg("Bonjour.", start=0.0, end=1.0),
        {"text": "[N'a pas souhaité...]", "speaker": "[REFUS]", "start": 1.0, "end": 2.0, "refused": True},
        _seg("Bonjour.", start=2.0, end=3.0),
    ]
    result = _dedup_inter(segs)
    assert len(result) == 3


def test_inter_empty_list():
    assert _dedup_inter([]) == []


# --- deduplicate (end-to-end) ---

def test_deduplicate_noop_on_clean_segments():
    segs = [_seg("Bonjour.", start=0.0, end=1.0), _seg("Au revoir.", start=1.0, end=2.0)]
    result = deduplicate(segs)
    assert len(result) == 2
    assert result[0]["text"] == "Bonjour."


def test_deduplicate_preserves_refused_unchanged():
    segs = [{"text": "[N'a pas souhaité...]", "speaker": "[REFUS]", "start": 0.0, "end": 1.0, "refused": True}]
    result = deduplicate(segs)
    assert result[0]["refused"] is True
    assert result[0]["text"] == "[N'a pas souhaité...]"


def test_deduplicate_intra_then_inter_combined():
    segs = [
        _seg("Est-ce vrai ? Est-ce vrai ? Est-ce vrai ?", start=0.0, end=3.0),
        _seg("Est-ce vrai ?", start=3.0, end=4.0),
    ]
    result = deduplicate(segs)
    assert len(result) == 1
    assert result[0]["end"] == 4.0


def test_deduplicate_empty():
    assert deduplicate([]) == []


def test_deduplicate_does_not_mutate_input():
    original_text = "Non. Non. Non. Non."
    segs = [_seg(original_text)]
    deduplicate(segs)
    assert segs[0]["text"] == original_text
```

- [ ] **Étape 2 : Lancer les tests — vérifier qu'ils échouent**

```
cd backend
python -m pytest tests/test_deduplicate.py -v
```

Résultat attendu : `ImportError: No module named 'deduplicate'`

- [ ] **Étape 3 : Créer `backend/deduplicate.py`**

```python
import re
from difflib import SequenceMatcher

INTRA_THRESHOLD = 0.85
INTER_THRESHOLD = 0.90
NOISE_MIN_REPS = 3
NOISE_MAX_TOKEN_LEN = 5


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio()


def _split_sentences(text: str) -> list[str]:
    parts = re.split(r'(?<=[.?!…])\s+', text)
    return [p.strip() for p in parts if p.strip()]


def _dedup_intra(text: str) -> str:
    """Supprime les phrases quasi-identiques consécutives au sein d'un segment."""
    sentences = _split_sentences(text)
    if not sentences:
        return text
    result = [sentences[0]]
    for sent in sentences[1:]:
        if _similarity(sent, result[-1]) < INTRA_THRESHOLD:
            result.append(sent)
    return " ".join(result)


def _dedup_noise(text: str) -> str:
    """Supprime les tokens courts répétés >= 3 fois (ex : 'ta ta ta ta ta')."""
    pattern = rf'\b(\S{{1,{NOISE_MAX_TOKEN_LEN}}}[.!?]?)\s+(?:\1\s+){{{NOISE_MIN_REPS - 1},}}\1?'
    cleaned = re.sub(pattern, r'\1', text, flags=re.IGNORECASE)
    return re.sub(r'\s{{2,}}', ' ', cleaned).strip()


def _dedup_inter(segments: list[dict]) -> list[dict]:
    """Fusionne les segments consécutifs quasi-identiques (hallucinations inter-segments)."""
    if not segments:
        return []
    result = [dict(segments[0])]
    for seg in segments[1:]:
        if seg.get("refused"):
            result.append(dict(seg))
            continue
        prev = result[-1]
        if prev.get("refused"):
            result.append(dict(seg))
            continue
        if _similarity(seg["text"], prev["text"]) >= INTER_THRESHOLD:
            if len(seg["text"]) > len(prev["text"]):
                result[-1] = {**result[-1], "text": seg["text"], "end": seg["end"]}
            else:
                result[-1] = {**result[-1], "end": seg["end"]}
        else:
            result.append(dict(seg))
    return result


def deduplicate(segments: list[dict]) -> list[dict]:
    """Applique les 3 passes de déduplication. Non-mutant — retourne une nouvelle liste."""
    result = []
    for seg in segments:
        if seg.get("refused"):
            result.append(dict(seg))
            continue
        text = _dedup_intra(seg["text"])
        text = _dedup_noise(text)
        result.append({**seg, "text": text})
    return _dedup_inter(result)
```

- [ ] **Étape 4 : Lancer les tests — vérifier qu'ils passent**

```
python -m pytest tests/test_deduplicate.py -v
```

Résultat attendu : tous les tests PASS

- [ ] **Étape 5 : Vérifier que les tests existants ne régressent pas**

```
python -m pytest tests/ -v
```

Résultat attendu : tous les tests PASS (les tests live `test_transcriber.py` et `test_speaker_tracker.py` nécessitent du matériel spécifique et peuvent être skippés)

- [ ] **Étape 6 : Commit**

```
git add backend/deduplicate.py backend/tests/test_deduplicate.py
git commit -m "feat(transcription): module deduplicate — 3 passes anti-hallucinations Whisper"
```

---

### Task 2 : Intégrer `deduplicate` dans `transcribe_offline.py`

**Files:**
- Modify: `backend/transcribe_offline.py` (lignes 1-5 imports, ligne ~219 après merge_same_speaker)

**Interfaces:**
- Consumes: `deduplicate(segments: list[dict]) -> list[dict]` depuis Task 1

- [ ] **Étape 1 : Écrire le test d'intégration**

Ajouter à la fin de `backend/tests/test_transcribe_offline.py` :

```python
def test_main_deduplicates_before_correct(tmp_path, monkeypatch):
    """Vérifie que deduplicate() est appelé avant correct() dans main()."""
    import sys
    import correct_transcript
    import deduplicate as dedup_module
    from unittest.mock import MagicMock, patch
    import transcribe_offline

    log_file = tmp_path / "log_anon.csv"
    log_file.write_text(FIXTURE_LOG, encoding="utf-8")

    fake_segment = MagicMock()
    fake_segment.start = 0.0
    fake_segment.end = 5.0
    fake_segment.text = "Bonjour. Bonjour. Bonjour."  # sera dédupliqué

    mock_model = MagicMock()
    mock_model.transcribe.return_value = ([fake_segment], None)

    dedup_calls = []
    original_dedup = dedup_module.deduplicate

    def tracking_dedup(segments):
        result = original_dedup(segments)
        dedup_calls.append(result)
        return result

    correct_calls = []

    def fake_correct(segments, output_stem, topic=None, participants=None):
        correct_calls.append(segments)
        return True

    monkeypatch.setattr(correct_transcript, "correct", fake_correct)
    monkeypatch.setattr(dedup_module, "deduplicate", tracking_dedup)

    with patch("transcribe_offline.WhisperModel", return_value=mock_model), \
         patch("transcribe_offline.deduplicate", tracking_dedup), \
         patch("sys.argv", ["transcribe_offline.py", "fake_audio.mp3", str(log_file), "--group", "TEST"]):
        transcribe_offline.main()

    assert len(dedup_calls) == 1
    assert len(correct_calls) == 1
    # Le texte passé à correct() est le résultat de deduplicate()
    assert correct_calls[0] is dedup_calls[0]
```

- [ ] **Étape 2 : Lancer le test — vérifier qu'il échoue**

```
python -m pytest tests/test_transcribe_offline.py::test_main_deduplicates_before_correct -v
```

Résultat attendu : FAIL (deduplicate n'est pas encore appelé)

- [ ] **Étape 3 : Modifier `backend/transcribe_offline.py`**

Ajouter l'import en tête de fichier (après les imports existants, ligne ~7) :

```python
from deduplicate import deduplicate
```

Modifier le bloc après `merge_same_speaker` (actuellement ligne ~219) :

```python
    segments = assign_speakers(whisper_segs_raw, turns)
    segments = merge_same_speaker(segments)
    segments = deduplicate(segments)          # <-- AJOUT
```

- [ ] **Étape 4 : Lancer les tests — vérifier que tout passe**

```
python -m pytest tests/test_transcribe_offline.py -v
```

Résultat attendu : tous les tests PASS

- [ ] **Étape 5 : Commit**

```
git add backend/transcribe_offline.py backend/tests/test_transcribe_offline.py
git commit -m "feat(transcription): appel deduplicate() dans transcribe_offline après merge"
```

---

### Task 3 : Enrichir `correct_transcript.py`

**Files:**
- Modify: `backend/correct_transcript.py` (prompt, `_validate`, `_correct_batch`, `correct`)
- Modify: `backend/tests/test_correct_transcript.py` (ajouter 2 tests pour `_validate`)

**Interfaces:**
- Consumes: `deduplicate(segments: list[dict]) -> list[dict]` depuis Task 1
- `_correct_batch(client, system_prompt, batch, context_before=None, context_after=None) -> list[dict] | None`
- `_validate(original, corrected) -> bool` — accepte désormais speaker `[?]` → label

- [ ] **Étape 1 : Écrire les nouveaux tests**

Ajouter à la fin de `backend/tests/test_correct_transcript.py` :

```python
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
```

- [ ] **Étape 2 : Lancer les nouveaux tests — vérifier qu'ils échouent**

```
python -m pytest tests/test_correct_transcript.py::test_validate_allows_speaker_attribution_for_unknown tests/test_correct_transcript.py::test_validate_rejects_speaker_change_for_known_speaker tests/test_correct_transcript.py::test_correct_batch_handles_segments_key_response -v
```

Résultat attendu : FAIL pour les 3

- [ ] **Étape 3 : Remplacer `backend/correct_transcript.py` en entier**

```python
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

MODEL = "gemini-2.5-flash"
BATCH_SIZE = 25  # segments par appel Gemini (limite tokens output)
CONTEXT_WINDOW = 3  # segments de contexte avant/après chaque batch

BASE_SYSTEM_PROMPT = """Tu es un correcteur de transcription de débat oral.

Format d'entrée : JSON avec trois clés :
- "context_avant" : segments précédents (lecture seule, ne pas retourner)
- "segments" : segments à corriger
- "context_apres" : segments suivants (lecture seule, ne pas retourner)

Réponds UNIQUEMENT avec la liste JSON des "segments" corrigés — pas d'objet englobant, juste le tableau.

Corrections autorisées :
- mots mal reconnus (homophonie, confusion lexicale)
- ponctuation manquante ou absurde
- noms propres déformés

Attribution [?] : si context_avant ou context_apres permet d'identifier le locuteur
avec confiance (interpellation directe, continuité de phrase, réponse explicite),
remplace speaker "[?]" par le label approprié parmi les participants connus.
Si incertain, laisse "[?]".

Correction sémantique : si un segment contient une assertion qui contredit directement
une affirmation du même segment (même phrase avec sujet substitué), corrige la version
manifestement erronée en t'appuyant sur la logique du propos.

Répétitions résiduelles : si des phrases quasi-identiques subsistent dans un segment,
n'en garde qu'une.

Ne reformule PAS. Ne supprime PAS les "euh", hésitations, répétitions naturelles.
Ne modifie PAS le sens ni le style.
Les segments "refused": true : ne pas toucher.
Les segments speaker "[?]" : corriger le texte normalement ET tenter l'attribution.

Aucun commentaire, aucune clé supplémentaire."""


def _build_system_prompt(topic: str | None, participants: list[str] | None) -> str:
    if not topic and not participants:
        return BASE_SYSTEM_PROMPT
    context_lines = []
    if topic:
        context_lines.append(f"Thème du débat : {topic}.")
    if participants:
        context_lines.append(f"Participants : {', '.join(participants)}.")
    context_lines.append("Corrige les noms propres en priorité en t'appuyant sur cette liste.")
    return "\n".join(context_lines) + "\n\n" + BASE_SYSTEM_PROMPT


def _load_api_key() -> str | None:
    return os.getenv("GEMINI_API_KEY") or None


def _make_client(api_key: str):
    from google import genai
    return genai.Client(api_key=api_key)


def _validate(original: list[dict], corrected: list[dict]) -> bool:
    if len(corrected) != len(original):
        return False
    for orig, corr in zip(original, corrected):
        speaker_ok = (
            corr.get("speaker") == orig["speaker"]
            or orig["speaker"] == "[?]"
        )
        if (
            abs(corr.get("start", -1) - orig["start"]) > 0.1
            or abs(corr.get("end", -1) - orig["end"]) > 0.1
            or not speaker_ok
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


def _correct_batch(
    client,
    system_prompt: str,
    batch: list[dict],
    context_before: list[dict] | None = None,
    context_after: list[dict] | None = None,
) -> list[dict] | None:
    """Envoie un batch à Gemini avec contexte et retourne les segments corrigés, ou None si échec."""
    payload = {
        "context_avant": context_before or [],
        "segments": batch,
        "context_apres": context_after or [],
    }
    try:
        prompt = system_prompt + "\n\n" + json.dumps(payload, ensure_ascii=False)
        response = client.models.generate_content(model=MODEL, contents=prompt)
        raw = response.text.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        parsed = json.loads(raw)
        if isinstance(parsed, dict) and "segments" in parsed:
            corrected = parsed["segments"]
        elif isinstance(parsed, list):
            corrected = parsed
        else:
            print("Correction Gemini : format de réponse inattendu.", file=sys.stderr)
            return None
        for orig, corr in zip(batch, corrected):
            if "refused" not in corr:
                corr["refused"] = orig["refused"]
    except Exception as exc:
        print(f"Correction Gemini échouée (batch) : {exc}", file=sys.stderr)
        return None
    if not _validate(batch, corrected):
        print("Correction Gemini rejetée : structure invalide dans un batch.", file=sys.stderr)
        return None
    return corrected


def correct(
    segments: list[dict],
    output_stem: Path,
    topic: str | None = None,
    participants: list[str] | None = None,
) -> bool:
    from deduplicate import deduplicate as _dedup
    segments = _dedup(segments)

    api_key = _load_api_key()
    if not api_key:
        print("GEMINI_API_KEY absent — correction Gemini skippée.", file=sys.stderr)
        return False

    client = _make_client(api_key)
    system_prompt = _build_system_prompt(topic, participants)
    batches = [segments[i:i + BATCH_SIZE] for i in range(0, len(segments), BATCH_SIZE)]
    corrected_segments = []

    for i, batch in enumerate(batches):
        context_before = corrected_segments[-CONTEXT_WINDOW:] if corrected_segments else []
        context_after = batches[i + 1][:CONTEXT_WINDOW] if i + 1 < len(batches) else []
        print(f"Correction Gemini batch {i + 1}/{len(batches)} ({len(batch)} segments)...")
        result = None
        for attempt in range(1, 3):
            result = _correct_batch(client, system_prompt, batch, context_before, context_after)
            if result is not None:
                break
            print(f"  Retry {attempt}/2...")
        if result is None:
            print(f"Batch {i + 1} abandonné après 2 tentatives — segments bruts conservés.", file=sys.stderr)
            corrected_segments.extend(batch)
        else:
            corrected_segments.extend(result)

    corrected = corrected_segments
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

- [ ] **Étape 4 : Lancer tous les tests — vérifier que tout passe**

```
python -m pytest tests/test_correct_transcript.py tests/test_deduplicate.py tests/test_transcribe_offline.py tests/test_anonymize_log.py -v
```

Résultat attendu : tous les tests PASS

> **Note :** Les mocks existants retournent `json.dumps(CORRECTED_SEGMENTS)` (liste brute). La nouvelle logique dans `_correct_batch` gère les deux formats : liste directe (`isinstance(parsed, list)`) ou objet `{"segments": [...]}`. Les tests existants continuent donc à passer sans modification.

- [ ] **Étape 5 : Commit**

```
git add backend/correct_transcript.py backend/tests/test_correct_transcript.py
git commit -m "feat(transcription): correct_transcript enrichi — contexte ±3, attribution [?], correction sémantique"
```

---

## Self-Review

**Spec coverage :**
- ✅ Prob 1 répétitions Whisper → Passes A (intra), B (bruit), C (inter) dans `deduplicate.py`
- ✅ Prob 2 attribution `[?]` → prompt enrichi + fenêtre contexte + validation assouplie
- ✅ Prob 3 erreur sémantique → instruction "correction sémantique" dans le prompt
- ✅ Prob 4 (bruit de début) → couvert par Passe B (noise patterns) + Passe C (inter)
- ✅ `correct_transcript.py` standalone → `correct()` appelle `_dedup()` en entrée

**Placeholders :** Aucun.

**Type consistency :**
- `deduplicate(segments: list[dict]) -> list[dict]` — utilisé identiquement dans Task 2 et Task 3
- `_correct_batch(client, system_prompt, batch, context_before, context_after)` — signature complète dans Task 3
- `_validate(original, corrected)` — même signature, comportement étendu
