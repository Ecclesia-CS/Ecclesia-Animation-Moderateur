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
