import argparse
import csv
import json
import datetime
from pathlib import Path

try:
    from faster_whisper import WhisperModel
except ImportError:  # pragma: no cover — optionnel, non requis pour les tests
    WhisperModel = None  # type: ignore


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


def main():
    parser = argparse.ArgumentParser(description="Transcription hors-ligne avec attribution des locuteurs")
    parser.add_argument("audio", help="Fichier audio à transcrire")
    parser.add_argument("log_anon", help="Fichier log_anon.csv produit par anonymize_log.py")
    parser.add_argument("--model", default="large-v3", help="Modèle Whisper (défaut: large-v3)")
    parser.add_argument("--language", default="fr", help="Langue (défaut: fr)")
    parser.add_argument("--audio-start", default=None, help="Heure de début de l'audio (ISO 8601)")
    parser.add_argument("--out-txt", default="transcription.txt", help="Fichier de sortie TXT")
    parser.add_argument("--out-json", default="transcription.json", help="Fichier de sortie JSON")
    args = parser.parse_args()

    audio_start = None
    if args.audio_start:
        audio_start = datetime.datetime.fromisoformat(args.audio_start)

    turns = load_anon_log(args.log_anon)
    turns_with_offsets = compute_offsets(turns, audio_start)

    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    segments_raw, _ = model.transcribe(args.audio, language=args.language, word_timestamps=False)
    segments = [{"start": s.start, "end": s.end, "text": s.text.strip()} for s in segments_raw]

    assigned = assign_speakers(segments, turns_with_offsets)
    merged = merge_same_speaker(assigned)

    write_txt(merged, Path(args.out_txt))
    write_json(merged, Path(args.out_json))
    print(f"Transcription écrite dans {args.out_txt} et {args.out_json}")


if __name__ == "__main__":
    main()
