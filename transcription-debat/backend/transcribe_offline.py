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


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Transcrit un fichier audio avec Whisper large-v3 en s'appuyant sur un log de tours de parole."
    )
    parser.add_argument("audio", help="Fichier audio source (mp3, wav, m4a, webm...)")
    parser.add_argument("log", help="log_anon.csv produit par anonymize_log.py")
    parser.add_argument(
        "--audio-start",
        default=None,
        help="Timestamp ISO du debut de l'enregistrement. Defaut : timestamp du premier tour.",
    )
    parser.add_argument("--group", default="debat", help="Nom du groupe pour les fichiers de sortie")
    args = parser.parse_args()

    if WhisperModel is None:
        print("Erreur : faster-whisper n'est pas installe. Installer avec: pip install faster-whisper", file=__import__('sys').stderr)
        __import__('sys').exit(1)

    # 1. Charger le log et calculer les offsets
    turns = load_anon_log(args.log)
    audio_start = datetime.datetime.fromisoformat(args.audio_start) if args.audio_start else None
    turns = compute_offsets(turns, audio_start)

    # 2. Transcrire avec Whisper large-v3 sur GPU
    print("Chargement de Whisper large-v3 (GPU)...")
    model = WhisperModel("large-v3", device="cuda", compute_type="float16")
    print(f"Transcription de {args.audio}...")
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

    # 3. Aligner, fusionner, ecrire
    segments = assign_speakers(whisper_segs, turns)
    segments = merge_same_speaker(segments)

    output_dir = Path(__file__).parent / "transcripts"
    output_dir.mkdir(parents=True, exist_ok=True)
    date_str = datetime.date.today().isoformat()
    base = output_dir / f"{args.group}_{date_str}"

    write_txt(segments, base.with_suffix(".txt"))
    write_json(segments, base.with_suffix(".json"))

    print(f"Transcript ecrit :\n  {base}.txt\n  {base}.json")


if __name__ == "__main__":
    main()
