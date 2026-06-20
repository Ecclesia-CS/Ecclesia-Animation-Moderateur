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
