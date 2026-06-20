import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

MODEL = "gemini-2.5-flash"
BATCH_SIZE = 25  # segments par appel Gemini (limite tokens output)

BASE_SYSTEM_PROMPT = """Tu es un correcteur de transcription de débat oral.
Corrige uniquement les erreurs évidentes de transcription Whisper :
- mots mal reconnus (homophonie, confusion lexicale)
- ponctuation manquante ou absurde
- noms propres déformés

Ne reformule PAS. Ne supprime PAS les "euh", hésitations, répétitions.
Ne modifie PAS le sens ni le style de chaque interlocuteur.
Les segments avec "refused": true : ne pas toucher, laisser tels quels.
Les segments avec speaker "[?]" : corriger le texte normalement.

Réponds UNIQUEMENT avec le JSON corrigé, même structure exacte, aucun commentaire."""


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
        if (
            abs(corr.get("start", -1) - orig["start"]) > 0.1
            or abs(corr.get("end", -1) - orig["end"]) > 0.1
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


def _correct_batch(client, system_prompt: str, batch: list[dict]) -> list[dict] | None:
    """Envoie un batch à Gemini et retourne les segments corrigés, ou None si échec."""
    try:
        prompt = system_prompt + "\n\n" + json.dumps(batch, ensure_ascii=False)
        response = client.models.generate_content(model=MODEL, contents=prompt)
        raw = response.text.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        corrected = json.loads(raw)
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
    api_key = _load_api_key()
    if not api_key:
        print("GEMINI_API_KEY absent — correction Gemini skippée.", file=sys.stderr)
        return False

    client = _make_client(api_key)
    system_prompt = _build_system_prompt(topic, participants)
    batches = [segments[i:i + BATCH_SIZE] for i in range(0, len(segments), BATCH_SIZE)]
    corrected_segments = []

    for i, batch in enumerate(batches, 1):
        print(f"Correction Gemini batch {i}/{len(batches)} ({len(batch)} segments)...")
        result = None
        for attempt in range(1, 3):
            result = _correct_batch(client, system_prompt, batch)
            if result is not None:
                break
            print(f"  Retry {attempt}/2...")
        if result is None:
            print(f"Batch {i} abandonné après 2 tentatives — segments bruts conservés.", file=sys.stderr)
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
