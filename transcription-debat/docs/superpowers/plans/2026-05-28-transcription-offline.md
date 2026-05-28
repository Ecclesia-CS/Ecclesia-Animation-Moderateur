# Transcription Offline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Créer deux scripts CLI — `anonymize_log.py` (anonymise le CSV Ecclesia) et `transcribe_offline.py` (transcrit un fichier audio complet avec Whisper large-v3 GPU en s'appuyant sur le log anonymisé pour l'attribution des locuteurs).

**Architecture:** `anonymize_log.py` parse le CSV multi-sections Ecclesia, assigne des labels `Interlocuteur N` dans l'ordre de première apparition, et produit un `log_anon.csv` avec un flag `refuse` pour les participants ayant refusé l'enregistrement. `transcribe_offline.py` charge ce log, transcrit l'audio en une passe Whisper large-v3, aligne chaque segment sur le tour qui le couvre le plus, puis écrit un `.txt` et un `.json`.

**Tech Stack:** Python stdlib (csv, argparse, json, datetime, pathlib), faster-whisper (déjà installé dans le venv)

---

## Fichiers

| Fichier | Rôle |
|---|---|
| `backend/anonymize_log.py` | Script CLI + fonctions de parsing et anonymisation |
| `backend/transcribe_offline.py` | Script CLI + fonctions d'alignement, fusion, écriture |
| `backend/tests/test_anonymize_log.py` | Tests de parse_ecclesia_csv et anonymize |
| `backend/tests/test_transcribe_offline.py` | Tests de compute_offsets, assign_speakers, merge, writers |

---

## Task 1 — Parser CSV Ecclesia

**Files:**
- Create: `backend/tests/test_anonymize_log.py`
- Create: `backend/anonymize_log.py`

- [ ] **Étape 1 : Écrire le test de parse_ecclesia_csv**

`backend/tests/test_anonymize_log.py` :

```python
import textwrap
from anonymize_log import parse_ecclesia_csv

FIXTURE_CSV = textwrap.dedent("""\
    "Ecclesia — Export débat"
    "Session","ABCDEF","Créé le","2026-05-28T10:00:00+00:00"

    "PARTICIPANTS"
    "Pseudo","Tours","Temps total (s)"
    "Alice",2,120
    "Bob",1,60

    "HISTORIQUE DES TOURS"
    "Tour","Participant","File","Démarré à","Terminé à","Durée (s)"
    1,"Alice","File longue","2026-05-28T11:00:00+00:00","2026-05-28T11:01:00+00:00",60
    2,"Bob","Coupe file","2026-05-28T11:01:00+00:00","2026-05-28T11:02:00+00:00",60
    3,"Alice","Manuel","2026-05-28T11:02:30+00:00","2026-05-28T11:03:00+00:00",30
""")


def test_parse_returns_tours_only(tmp_path):
    f = tmp_path / "test.csv"
    f.write_text(FIXTURE_CSV, encoding="utf-8")
    tours = parse_ecclesia_csv(str(f))
    assert len(tours) == 3


def test_parse_tour_fields(tmp_path):
    f = tmp_path / "test.csv"
    f.write_text(FIXTURE_CSV, encoding="utf-8")
    tours = parse_ecclesia_csv(str(f))
    assert tours[0]["participant"] == "Alice"
    assert tours[0]["debut_iso"] == "2026-05-28T11:00:00+00:00"
    assert tours[0]["fin_iso"] == "2026-05-28T11:01:00+00:00"


def test_parse_order_preserved(tmp_path):
    f = tmp_path / "test.csv"
    f.write_text(FIXTURE_CSV, encoding="utf-8")
    tours = parse_ecclesia_csv(str(f))
    assert [t["participant"] for t in tours] == ["Alice", "Bob", "Alice"]
```

- [ ] **Étape 2 : Lancer le test — vérifier qu'il échoue**

```
cd backend
.venv\Scripts\python -m pytest tests/test_anonymize_log.py -v
```
Attendu : `ImportError: cannot import name 'parse_ecclesia_csv'`

- [ ] **Étape 3 : Implémenter parse_ecclesia_csv**

Créer `backend/anonymize_log.py` :

```python
import csv
import argparse
from pathlib import Path


def parse_ecclesia_csv(path: str) -> list[dict]:
    """Extrait les tours de HISTORIQUE DES TOURS du CSV Ecclesia multi-sections."""
    with open(path, encoding="utf-8") as f:
        reader = csv.reader(f)
        rows = list(reader)

    # Trouver la ligne "HISTORIQUE DES TOURS"
    history_idx = next(
        i for i, row in enumerate(rows)
        if row and row[0].strip() == "HISTORIQUE DES TOURS"
    )
    # La ligne suivante est l'en-tête des colonnes, on commence après
    data_rows = rows[history_idx + 2:]

    tours = []
    for row in data_rows:
        if len(row) < 6:
            continue
        tours.append({
            "participant": row[1].strip(),
            "debut_iso": row[3].strip(),
            "fin_iso": row[4].strip(),
        })
    return tours
```

- [ ] **Étape 4 : Lancer le test — vérifier qu'il passe**

```
cd backend
.venv\Scripts\python -m pytest tests/test_anonymize_log.py -v
```
Attendu : 3 PASSED

- [ ] **Étape 5 : Commit**

```
git add transcription-debat/backend/anonymize_log.py transcription-debat/backend/tests/test_anonymize_log.py
git commit -m "feat(offline): parse CSV Ecclesia multi-sections"
```

---

## Task 2 — Anonymisation et CLI de anonymize_log.py

**Files:**
- Modify: `backend/anonymize_log.py`
- Modify: `backend/tests/test_anonymize_log.py`

- [ ] **Étape 1 : Ajouter les tests d'anonymisation**

Ajouter à `backend/tests/test_anonymize_log.py` :

```python
from anonymize_log import anonymize, write_anon_log


def _make_tours():
    return [
        {"participant": "Alice", "debut_iso": "2026-05-28T11:00:00+00:00", "fin_iso": "2026-05-28T11:01:00+00:00"},
        {"participant": "Bob",   "debut_iso": "2026-05-28T11:01:00+00:00", "fin_iso": "2026-05-28T11:02:00+00:00"},
        {"participant": "Alice", "debut_iso": "2026-05-28T11:02:30+00:00", "fin_iso": "2026-05-28T11:03:00+00:00"},
        {"participant": "Carol", "debut_iso": "2026-05-28T11:03:00+00:00", "fin_iso": "2026-05-28T11:04:00+00:00"},
    ]


def test_anonymize_labels_in_first_appearance_order():
    anon, mapping = anonymize(_make_tours(), refused=[])
    assert mapping["Alice"] == "Interlocuteur 1"
    assert mapping["Bob"] == "Interlocuteur 2"
    assert mapping["Carol"] == "Interlocuteur 3"


def test_anonymize_refused_gets_refus_label():
    anon, mapping = anonymize(_make_tours(), refused=["Bob"])
    assert mapping["Bob"] == "[REFUS]"
    # Les autres ne sont pas décalés
    assert mapping["Alice"] == "Interlocuteur 1"
    assert mapping["Carol"] == "Interlocuteur 2"


def test_anonymize_refused_flag_in_output():
    anon, _ = anonymize(_make_tours(), refused=["Bob"])
    bob_tours = [t for t in anon if t["interlocuteur"] == "[REFUS]"]
    assert all(t["refuse"] is True for t in bob_tours)
    alice_tours = [t for t in anon if t["interlocuteur"] == "Interlocuteur 1"]
    assert all(t["refuse"] is False for t in alice_tours)


def test_write_anon_log_produces_valid_csv(tmp_path):
    anon, _ = anonymize(_make_tours(), refused=["Bob"])
    out = tmp_path / "log_anon.csv"
    write_anon_log(anon, str(out))
    import csv
    with open(out, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    assert rows[0]["interlocuteur"] == "Interlocuteur 1"
    assert rows[1]["interlocuteur"] == "[REFUS]"
    assert rows[1]["refuse"] == "true"
    assert rows[0]["debut_iso"] == "2026-05-28T11:00:00+00:00"
```

- [ ] **Étape 2 : Lancer le test — vérifier qu'il échoue**

```
cd backend
.venv\Scripts\python -m pytest tests/test_anonymize_log.py -v
```
Attendu : `ImportError: cannot import name 'anonymize'`

- [ ] **Étape 3 : Implémenter anonymize, write_anon_log et main**

Ajouter à la fin de `backend/anonymize_log.py` :

```python
import csv
import argparse
from pathlib import Path


def anonymize(tours: list[dict], refused: list[str]) -> tuple[list[dict], dict[str, str]]:
    """Assigne Interlocuteur N (ordre d'apparition) ; refused → [REFUS]."""
    mapping: dict[str, str] = {}
    counter = 1
    for t in tours:
        name = t["participant"]
        if name in mapping:
            continue
        if name in refused:
            mapping[name] = "[REFUS]"
        else:
            mapping[name] = f"Interlocuteur {counter}"
            counter += 1

    anon = []
    for t in tours:
        label = mapping[t["participant"]]
        anon.append({
            "interlocuteur": label,
            "debut_iso": t["debut_iso"],
            "fin_iso": t["fin_iso"],
            "refuse": label == "[REFUS]",
        })
    return anon, mapping


def write_anon_log(tours: list[dict], output_path: str) -> None:
    with open(output_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["interlocuteur", "debut_iso", "fin_iso", "refuse"])
        writer.writeheader()
        for t in tours:
            writer.writerow({**t, "refuse": "true" if t["refuse"] else "false"})


def main() -> None:
    parser = argparse.ArgumentParser(description="Anonymise un export CSV Ecclesia.")
    parser.add_argument("csv", help="Chemin vers le fichier CSV Ecclesia")
    parser.add_argument("--refuse", action="append", default=[], metavar="NOM",
                        help="Nom exact d'un participant ayant refusé l'enregistrement (répétable)")
    parser.add_argument("--output", default=None, help="Chemin de sortie (défaut: log_anon.csv à côté du CSV)")
    args = parser.parse_args()

    tours = parse_ecclesia_csv(args.csv)
    anon, mapping = anonymize(tours, refused=args.refuse)

    output_path = args.output or str(Path(args.csv).parent / "log_anon.csv")
    write_anon_log(anon, output_path)

    print("Correspondance nom → label (à conserver) :")
    for name, label in mapping.items():
        print(f"  {name:30s} → {label}")
    print(f"\nLog anonymisé écrit : {output_path}")


if __name__ == "__main__":
    main()
```

**Important :** Le fichier `anonymize_log.py` contient maintenant deux fois l'import de `csv` et `argparse`. Supprimer les doublons : les imports `import csv`, `import argparse`, `from pathlib import Path` doivent apparaître **une seule fois en haut du fichier**. Le fichier final doit ressembler à :

```python
import csv
import argparse
from pathlib import Path


def parse_ecclesia_csv(path: str) -> list[dict]:
    # ... (code de Task 1)


def anonymize(tours: list[dict], refused: list[str]) -> tuple[list[dict], dict[str, str]]:
    # ...


def write_anon_log(tours: list[dict], output_path: str) -> None:
    # ...


def main() -> None:
    # ...


if __name__ == "__main__":
    main()
```

- [ ] **Étape 4 : Lancer tous les tests — vérifier qu'ils passent**

```
cd backend
.venv\Scripts\python -m pytest tests/test_anonymize_log.py -v
```
Attendu : 7 PASSED

- [ ] **Étape 5 : Tester manuellement avec le vrai CSV**

```
cd backend
.venv\Scripts\python anonymize_log.py "logs_prise_paroles\ecclesia_0F6A9E_2026-05-28.csv" --refuse "Faustin" --output "logs_prise_paroles\log_anon.csv"
```
Attendu dans le terminal :
```
Correspondance nom → label (à conserver) :
  Jules                          → Interlocuteur 1
  Ilyès                          → Interlocuteur 2
  Emilien                        → Interlocuteur 3
  Faustin                        → [REFUS]
  Maxence Reinaudo               → Interlocuteur 4
  Mathis L                       → Interlocuteur 5
Log anonymisé écrit : logs_prise_paroles\log_anon.csv
```
Vérifier que `log_anon.csv` a bien 56 lignes de données + 1 ligne d'en-tête.

- [ ] **Étape 6 : Commit**

```
git add transcription-debat/backend/anonymize_log.py transcription-debat/backend/tests/test_anonymize_log.py transcription-debat/backend/logs_prise_paroles/log_anon.csv
git commit -m "feat(offline): anonymize_log.py — anonymisation + CLI"
```

---

## Task 3 — Chargement du log et calcul des offsets (transcribe_offline)

**Files:**
- Create: `backend/tests/test_transcribe_offline.py`
- Create: `backend/transcribe_offline.py`

- [ ] **Étape 1 : Écrire les tests de load_anon_log et compute_offsets**

Créer `backend/tests/test_transcribe_offline.py` :

```python
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
    # Sans audio_start fourni, la fonction doit inférer depuis le premier tour
    result = compute_offsets(turns, audio_start=None)
    assert result[0]["debut_sec"] == 0.0
```

- [ ] **Étape 2 : Lancer le test — vérifier qu'il échoue**

```
cd backend
.venv\Scripts\python -m pytest tests/test_transcribe_offline.py::test_load_anon_log_fields tests/test_transcribe_offline.py::test_compute_offsets_basic tests/test_transcribe_offline.py::test_compute_offsets_default_audio_start -v
```
Attendu : `ImportError: cannot import name 'load_anon_log'`

- [ ] **Étape 3 : Implémenter load_anon_log et compute_offsets**

Créer `backend/transcribe_offline.py` :

```python
import argparse
import csv
import json
import datetime
from pathlib import Path
from faster_whisper import WhisperModel


def load_anon_log(path: str) -> list[dict]:
    """Charge log_anon.csv produit par anonymize_log.py."""
    with open(path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return [
            {
                "interlocuteur": row["interlocuteur"],
                "debut_iso": row["debut_iso"],
                "fin_iso": row["fin_iso"],
                "refuse": row["refuse"].strip().lower() == "true",
            }
            for row in reader
        ]


def compute_offsets(turns: list[dict], audio_start: datetime.datetime | None) -> list[dict]:
    """Ajoute debut_sec et fin_sec (secondes depuis audio_start) à chaque tour."""
    def parse_iso(s: str) -> datetime.datetime:
        return datetime.datetime.fromisoformat(s)

    if audio_start is None:
        audio_start = parse_iso(turns[0]["debut_iso"])

    result = []
    for t in turns:
        debut = parse_iso(t["debut_iso"])
        fin = parse_iso(t["fin_iso"])
        result.append({
            **t,
            "debut_sec": (debut - audio_start).total_seconds(),
            "fin_sec": (fin - audio_start).total_seconds(),
        })
    return result
```

- [ ] **Étape 4 : Lancer les tests — vérifier qu'ils passent**

```
cd backend
.venv\Scripts\python -m pytest tests/test_transcribe_offline.py::test_load_anon_log_fields tests/test_transcribe_offline.py::test_compute_offsets_basic tests/test_transcribe_offline.py::test_compute_offsets_default_audio_start -v
```
Attendu : 3 PASSED

- [ ] **Étape 5 : Commit**

```
git add transcription-debat/backend/transcribe_offline.py transcription-debat/backend/tests/test_transcribe_offline.py
git commit -m "feat(offline): load_anon_log + compute_offsets"
```

---

## Task 4 — Alignement des segments sur les tours

**Files:**
- Modify: `backend/transcribe_offline.py`
- Modify: `backend/tests/test_transcribe_offline.py`

- [ ] **Étape 1 : Ajouter les tests d'assign_speakers**

Ajouter à `backend/tests/test_transcribe_offline.py` :

```python
def _turns_with_offsets():
    # Tour 1 : Interlocuteur 1, 0–60s
    # Tour 2 : [REFUS], 60–120s
    # Tour 3 : Interlocuteur 2, 150–180s  (gap entre 120 et 150)
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
    segs = [{"start": 65.0, "end": 90.0, "text": "Ce texte ne doit pas apparaître"}]
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
    # Segment 50–80 : 10s dans tour 1 (0–60), 20s dans tour 2 (60–120) → [REFUS]
    segs = [{"start": 50.0, "end": 80.0, "text": "Chevauchement"}]
    result = assign_speakers(segs, _turns_with_offsets())
    assert result[0]["speaker"] == "[REFUS]"
```

- [ ] **Étape 2 : Lancer les tests — vérifier qu'ils échouent**

```
cd backend
.venv\Scripts\python -m pytest tests/test_transcribe_offline.py::test_assign_normal_segment tests/test_transcribe_offline.py::test_assign_refused_segment tests/test_transcribe_offline.py::test_assign_gap_segment tests/test_transcribe_offline.py::test_assign_segment_spanning_two_turns_takes_majority -v
```
Attendu : `ImportError` ou `FAILED`

- [ ] **Étape 3 : Implémenter assign_speakers**

Ajouter dans `backend/transcribe_offline.py` (après `compute_offsets`) :

```python
def assign_speakers(segments: list[dict], turns: list[dict]) -> list[dict]:
    """Attribue un locuteur à chaque segment Whisper par recouvrement maximal."""
    result = []
    for seg in segments:
        best_turn = None
        best_overlap = 0.0
        for turn in turns:
            overlap = min(seg["end"], turn["fin_sec"]) - max(seg["start"], turn["debut_sec"])
            if overlap > best_overlap:
                best_overlap = overlap
                best_turn = turn

        if best_turn is None:
            # Segment entièrement dans un gap
            result.append({
                "start": seg["start"],
                "end": seg["end"],
                "speaker": "[?]",
                "text": seg["text"],
                "refused": False,
            })
        elif best_turn["refuse"]:
            result.append({
                "start": seg["start"],
                "end": seg["end"],
                "speaker": "[REFUS]",
                "text": "[N'a pas souhaité être enregistré(e)]",
                "refused": True,
            })
        else:
            result.append({
                "start": seg["start"],
                "end": seg["end"],
                "speaker": best_turn["interlocuteur"],
                "text": seg["text"],
                "refused": False,
            })
    return result
```

- [ ] **Étape 4 : Lancer les tests — vérifier qu'ils passent**

```
cd backend
.venv\Scripts\python -m pytest tests/test_transcribe_offline.py -v
```
Attendu : tous PASSED

- [ ] **Étape 5 : Commit**

```
git add transcription-debat/backend/transcribe_offline.py transcription-debat/backend/tests/test_transcribe_offline.py
git commit -m "feat(offline): assign_speakers — alignement segments/tours"
```

---

## Task 5 — Fusion et writers (.txt + .json)

**Files:**
- Modify: `backend/transcribe_offline.py`
- Modify: `backend/tests/test_transcribe_offline.py`

- [ ] **Étape 1 : Ajouter les tests de merge_same_speaker, write_txt, write_json**

Ajouter à `backend/tests/test_transcribe_offline.py` :

```python
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
        {"start": 0.0,    "end": 60.0,  "speaker": "Interlocuteur 1", "text": "Bonjour",                              "refused": False},
        {"start": 60.0,   "end": 120.0, "speaker": "[REFUS]",          "text": "[N'a pas souhaité être enregistré(e)]","refused": True},
        {"start": 3661.0, "end": 3700.0,"speaker": "Interlocuteur 2",  "text": "Au revoir",                           "refused": False},
    ]
    out = tmp_path / "out.txt"
    write_txt(segs, out)
    lines = out.read_text(encoding="utf-8").splitlines()
    assert lines[0] == "[00:00:00] Interlocuteur 1: Bonjour"
    assert lines[1] == "[00:01:00] [REFUS]: [N'a pas souhaité être enregistré(e)]"
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
```

- [ ] **Étape 2 : Lancer les tests — vérifier qu'ils échouent**

```
cd backend
.venv\Scripts\python -m pytest tests/test_transcribe_offline.py::test_merge_same_speaker_consecutive tests/test_transcribe_offline.py::test_write_txt_format tests/test_transcribe_offline.py::test_write_json_structure -v
```
Attendu : `ImportError` ou `FAILED`

- [ ] **Étape 3 : Implémenter merge_same_speaker, write_txt, write_json**

Ajouter dans `backend/transcribe_offline.py` (après `assign_speakers`) :

```python
def merge_same_speaker(segments: list[dict]) -> list[dict]:
    """Fusionne les segments consécutifs du même locuteur."""
    if not segments:
        return []
    merged = [dict(segments[0])]
    for seg in segments[1:]:
        if seg["speaker"] == merged[-1]["speaker"]:
            merged[-1]["text"] += " " + seg["text"]
            merged[-1]["end"] = seg["end"]
        else:
            merged.append(dict(seg))
    return merged


def write_txt(segments: list[dict], path: Path) -> None:
    with open(path, "w", encoding="utf-8") as f:
        for seg in segments:
            h = int(seg["start"] // 3600)
            m = int((seg["start"] % 3600) // 60)
            s = int(seg["start"] % 60)
            f.write(f"[{h:02d}:{m:02d}:{s:02d}] {seg['speaker']}: {seg['text']}\n")


def write_json(segments: list[dict], path: Path) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(segments, f, ensure_ascii=False, indent=2)
```

- [ ] **Étape 4 : Lancer tous les tests — vérifier qu'ils passent**

```
cd backend
.venv\Scripts\python -m pytest tests/test_transcribe_offline.py -v
```
Attendu : tous PASSED (10+ tests)

- [ ] **Étape 5 : Commit**

```
git add transcription-debat/backend/transcribe_offline.py transcription-debat/backend/tests/test_transcribe_offline.py
git commit -m "feat(offline): merge_same_speaker + write_txt + write_json"
```

---

## Task 6 — CLI principal transcribe_offline.py (Whisper + glue)

**Files:**
- Modify: `backend/transcribe_offline.py`

- [ ] **Étape 1 : Ajouter la fonction main() et le point d'entrée**

Ajouter à la fin de `backend/transcribe_offline.py` :

```python
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Transcrit un fichier audio avec Whisper large-v3 en s'appuyant sur un log de tours de parole."
    )
    parser.add_argument("audio", help="Fichier audio source (mp3, wav, m4a, webm…)")
    parser.add_argument("log", help="log_anon.csv produit par anonymize_log.py")
    parser.add_argument(
        "--audio-start",
        default=None,
        help="Timestamp ISO du début de l'enregistrement (ex: 2026-05-28T11:28:50+00:00). "
             "Défaut : timestamp du premier tour dans le log.",
    )
    parser.add_argument("--group", default="debat", help="Nom du groupe pour nommer les fichiers de sortie")
    args = parser.parse_args()

    # 1. Charger le log et calculer les offsets
    turns = load_anon_log(args.log)
    audio_start = datetime.datetime.fromisoformat(args.audio_start) if args.audio_start else None
    turns = compute_offsets(turns, audio_start)

    # 2. Transcrire avec Whisper large-v3 sur GPU
    print("Chargement de Whisper large-v3 (GPU)…")
    model = WhisperModel("large-v3", device="cuda", compute_type="float16")
    print(f"Transcription de {args.audio}…")
    raw_segments, _ = model.transcribe(
        args.audio,
        language="fr",
        beam_size=5,
        vad_filter=True,
        condition_on_previous_text=True,
        word_timestamps=True,
    )
    whisper_segs = [
        {"start": s.start, "end": s.end, "text": s.text.strip()}
        for s in raw_segments
        if s.text.strip()
    ]
    print(f"{len(whisper_segs)} segments Whisper produits.")

    # 3. Aligner, fusionner, écrire
    segments = assign_speakers(whisper_segs, turns)
    segments = merge_same_speaker(segments)

    output_dir = Path(__file__).parent / "transcripts"
    output_dir.mkdir(parents=True, exist_ok=True)
    date_str = datetime.date.today().isoformat()
    base = output_dir / f"{args.group}_{date_str}"

    write_txt(segments, base.with_suffix(".txt"))
    write_json(segments, base.with_suffix(".json"))

    print(f"Transcript écrit :\n  {base}.txt\n  {base}.json")


if __name__ == "__main__":
    main()
```

- [ ] **Étape 2 : Vérifier que tous les tests passent encore**

```
cd backend
.venv\Scripts\python -m pytest tests/ -v
```
Attendu : tous PASSED (aucune régression)

- [ ] **Étape 3 : Vérifier que le script démarre (import uniquement, sans lancer Whisper)**

```
cd backend
.venv\Scripts\python -c "import transcribe_offline; print('import ok')"
```
Attendu : `import ok`

- [ ] **Étape 4 : Commit**

```
git add transcription-debat/backend/transcribe_offline.py
git commit -m "feat(offline): transcribe_offline.py — CLI Whisper large-v3 GPU"
```

- [ ] **Étape 5 : Test de bout en bout (quand un fichier audio est disponible)**

```
cd backend
.venv\Scripts\python transcribe_offline.py "chemin\vers\debat.mp3" "logs_prise_paroles\log_anon.csv" --group 0F6A9E
```
Attendu après ~15-20 min :
- `transcripts/0F6A9E_2026-05-28.txt` créé, lisible, locuteurs cohérents
- `transcripts/0F6A9E_2026-05-28.json` créé, tableau JSON valide
- Tours de Faustin affichent `[N'a pas souhaité être enregistré(e)]`
- Segments hors tour affichent `[?]`

- [ ] **Étape 6 : Push final**

```
git push
```
