import argparse
import json
import os
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")  # quota free tier plus large que 2.5-flash
BATCH_SIZE = 25  # segments par appel Gemini (limite tokens output)
CONTEXT_WINDOW = 3  # segments de contexte avant/après chaque batch

# Garde-fous de fidélité : Gemini corrige SANS entendre l'audio. Une correction qui
# modifie trop de mots, ajoute/retire une négation ou masque un mot qui n'a pas
# l'air d'un prénom est rejetée : on garde le texte Whisper (en y reportant les
# prénoms masqués par Gemini) et la proposition reste disponible (texte_gemini).
MAX_EDIT_RATIO = 0.2   # part maximale de mots modifiés…
MIN_EDITS_FLOOR = 4    # …au-delà d'un plancher de 4 mots (segments courts)
NEGATORS = {"pas", "jamais", "rien", "aucun", "aucune", "non", "guère", "nullement"}
_MASKISH = re.compile(r"\[prénom\]|\[nom\]|Interlocuteur|Modérateur", re.IGNORECASE)
_NAME_LIKE = re.compile(r"^[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’-]{2,}[.,;:!?…]*$")
_PAYLOAD_KEYS = ("start", "end", "speaker", "text", "refused")

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

Mots douteux : un segment peut contenir "mots_douteux", la liste des mots que la
reconnaissance vocale a entendus avec peu de confiance. Corrige-les en priorité. Les
autres mots ont été reconnus avec confiance : ne les modifie que s'ils sont manifestement
faux. Ne retourne pas "mots_douteux".

Attribution [?] : si context_avant ou context_apres permet d'identifier le locuteur
avec confiance (interpellation directe, continuité de phrase, réponse explicite),
remplace speaker "[?]" par un label EXACTEMENT pris dans la liste des labels autorisés
fournie ci-dessus. N'invente JAMAIS un nouveau label ni un prénom réel. Pour le meneur
de séance / animateur, utilise "Modérateur". Si incertain, laisse "[?]".

Anonymat : ne JAMAIS écrire de prénom ou nom réel d'un participant dans le texte. Si un
prénom réel apparaît (mal masqué par Whisper), remplace-le par "[prénom]". Les personnes
publiques citées (auteurs, philosophes, artistes, responsables politiques…) ne sont pas
des participants : ne les masque pas.

Hors-débat : si un segment est manifestement logistique ou hors-sujet (réglages d'appli,
chahut, interlude sans rapport avec le thème), préfixe son texte par "[HORS-DÉBAT] ".

Correction sémantique : si un segment contient une assertion qui contredit directement
une affirmation du même segment (même phrase avec sujet substitué), corrige la version
manifestement erronée en t'appuyant sur la logique du propos — sans jamais ajouter ni
retirer une négation.

Répétitions résiduelles : si des phrases quasi-identiques subsistent dans un segment,
n'en garde qu'une.

Ne reformule PAS. Ne supprime JAMAIS une phrase entière (sauf répétition quasi identique).
Ne supprime PAS les "euh", hésitations, répétitions naturelles.
Ne modifie PAS le sens ni le style.
Les segments "refused": true : ne pas toucher.
Les segments speaker "[?]" : corriger le texte normalement ET tenter l'attribution.

Aucun commentaire, aucune clé supplémentaire."""


def _build_system_prompt(
    topic: str | None,
    participants: list[str] | None,
    allowed_labels: set[str] | None = None,
) -> str:
    context_lines = []
    if topic:
        context_lines.append(f"Thème du débat : {topic}.")
    if participants:
        context_lines.append(f"Participants : {', '.join(participants)}.")
    if allowed_labels:
        labels = ", ".join(sorted(allowed_labels))
        context_lines.append(f"Labels de locuteur autorisés (n'en utilise aucun autre) : {labels}.")
    if participants:
        context_lines.append("Corrige les noms propres en priorité en t'appuyant sur cette liste.")
    if not context_lines:
        return BASE_SYSTEM_PROMPT
    return "\n".join(context_lines) + "\n\n" + BASE_SYSTEM_PROMPT


def _load_api_key() -> str | None:
    return os.getenv("GEMINI_API_KEY") or None


def _make_client(api_key: str):
    from google import genai
    return genai.Client(api_key=api_key)


def _validate(
    original: list[dict],
    corrected: list[dict],
    allowed_labels: set[str] | None = None,
) -> bool:
    if len(corrected) != len(original):
        return False
    return all(_segment_ok(o, c, allowed_labels) for o, c in zip(original, corrected))


def _segment_ok(orig: dict, corr: dict, allowed_labels: set[str] | None = None) -> bool:
    """Structure d'un segment corrigé : horodatage, orateur, refus et texte intacts."""
    if not isinstance(corr, dict) or not isinstance(corr.get("text"), str):
        return False
    speaker_ok = corr.get("speaker") == orig["speaker"] or orig["speaker"] == "[?]"
    # Si le segment était [?] et qu'on a une whitelist, le nouveau label doit en faire partie
    # (empêche Gemini d'inventer un prénom réel ou un label inconnu).
    if (
        allowed_labels is not None
        and orig["speaker"] == "[?]"
        and corr.get("speaker") != "[?]"
        and corr.get("speaker") not in allowed_labels
    ):
        return False
    try:
        times_ok = abs(corr.get("start", -1) - orig["start"]) <= 0.1 and abs(corr.get("end", -1) - orig["end"]) <= 0.1
    except TypeError:
        return False
    return times_ok and speaker_ok and corr.get("refused") == orig["refused"]


def _write_txt(segments: list[dict], path: Path) -> None:
    with open(path, "w", encoding="utf-8") as f:
        for seg in segments:
            h = int(seg["start"] // 3600)
            m = int((seg["start"] % 3600) // 60)
            s = int(seg["start"] % 60)
            speaker = seg["speaker"]
            if seg.get("speaker_suggestion"):
                speaker += f" (suggestion IA : {seg['speaker_suggestion']} ?)"
            f.write(f"[{h:02d}:{m:02d}:{s:02d}] {speaker}: {seg['text']}\n")


def _payload(seg: dict) -> dict:
    """Ce que Gemini reçoit : l'essentiel du segment (+ mots douteux), rien d'autre."""
    out = {k: seg[k] for k in _PAYLOAD_KEYS if k in seg}
    if seg.get("low_conf_words") and not seg.get("refused"):
        out["mots_douteux"] = seg["low_conf_words"]
    return out


def _tokens(text: str) -> list[str]:
    from quality import normalize_tokens
    from transcribe_offline import normalize_word_joins
    return normalize_tokens(normalize_word_joins(text))


def _raw_diff(orig: str, corr: str):
    """Opcodes entre les mots (séparés par des espaces) des deux textes."""
    a, b = orig.split(), corr.split()
    key = lambda t: re.sub(r"[^\w']", "", t.lower())
    sm = SequenceMatcher(None, [key(t) for t in a], [key(t) for t in b], autojunk=False)
    return a, b, sm.get_opcodes()


def _correction_risk(orig: str, corr: str) -> str | None:
    """Motif de rejet d'une correction Gemini, ou None si elle est acceptable."""
    ta, tb = _tokens(orig), _tokens(corr)
    if sum(t in NEGATORS for t in ta) != sum(t in NEGATORS for t in tb):
        return "négation modifiée"
    a, b, ops = _raw_diff(orig, corr)
    for op, i1, i2, j1, j2 in ops:
        if op in ("replace", "insert") and any(_MASKISH.search(t) for t in b[j1:j2]):
            src = a[i1:i2]
            if not any(_NAME_LIKE.match(t) or _MASKISH.search(t) for t in src):
                return "masque sans prénom"
    from quality import align
    edits = sum(op != "ok" for op, _, _ in align(ta, tb))
    if edits > max(MIN_EDITS_FLOOR, MAX_EDIT_RATIO * len(ta)):
        return "réécriture trop importante"
    return None


def _transfer_masks(orig: str, corr: str) -> str:
    """Reporte sur le texte Whisper les prénoms que Gemini a masqués (RGPD)."""
    a, b, ops = _raw_diff(orig, corr)
    out: list[str] = []
    for op, i1, i2, j1, j2 in ops:
        src, dst = a[i1:i2], b[j1:j2]
        is_mask = (
            op == "replace" and 0 < len(src) <= 2
            and all(_NAME_LIKE.match(t) for t in src)
            and all(_MASKISH.search(t) or t.strip(".,;:!?…").isdigit() for t in dst)
        )
        if is_mask:
            masked = list(dst)
            tail = re.search(r"[.,;:!?…]+$", src[-1])
            if tail and not masked[-1].endswith(tail.group()):
                masked[-1] += tail.group()
            out.extend(masked)
        else:
            out.extend(src)
    return " ".join(out)


def _merge_segment(orig: dict, corr: dict) -> dict:
    """Applique la correction de Gemini à un segment, sous garde-fous."""
    out = dict(orig)
    if orig.get("refused"):
        out["correction"] = "aucune"
        return out
    new_speaker = corr.get("speaker", orig["speaker"])
    if orig["speaker"] == "[?]" and new_speaker != "[?]":
        # Deviné à partir du texte seul : suggestion, jamais une attribution.
        out["speaker_suggestion"] = new_speaker
    motif = _correction_risk(orig["text"], corr["text"])
    if motif is None:
        out["text"] = corr["text"]
        out["correction"] = "gemini"
    else:
        out["text"] = _transfer_masks(orig["text"], corr["text"])
        out["correction"] = "rejetee"
        out["correction_motif"] = motif
        out["texte_gemini"] = corr["text"]
    return out


def _correct_batch(
    client,
    system_prompt: str,
    batch: list[dict],
    context_before: list[dict] | None = None,
    context_after: list[dict] | None = None,
    allowed_labels: set[str] | None = None,
) -> list[dict | None] | None:
    """Envoie un batch à Gemini avec contexte.

    Retourne la liste alignée sur le batch (None pour un segment dont la structure
    a été altérée — il gardera son texte brut), ou None si la réponse est
    inexploitable (JSON invalide, nombre de segments différent) → nouvel essai.
    """
    batch = [_payload(s) for s in batch]
    payload = {
        "context_avant": [_payload(s) for s in context_before or []],
        "segments": batch,
        "context_apres": [_payload(s) for s in context_after or []],
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
    except Exception as exc:
        print(f"Correction Gemini échouée (batch) : {exc}", file=sys.stderr)
        return None
    if not isinstance(corrected, list) or not corrected:
        return None
    if len(corrected) != len(batch):
        # Gemini a fusionné ou omis des segments : on retrouve chaque segment par son
        # horodatage de début ; ceux qui n'ont pas été rendus intacts gardent leur brut.
        print(f"  Gemini a rendu {len(corrected)} segments pour {len(batch)} — réalignement par horodatage.",
              file=sys.stderr)
        by_start = [c for c in corrected if isinstance(c, dict) and isinstance(c.get("start"), (int, float))]
        corrected = [
            next((c for c in by_start if abs(c["start"] - o["start"]) <= 0.1), None) for o in batch
        ]
    for orig, corr in zip(batch, corrected):
        if isinstance(corr, dict) and "refused" not in corr:
            corr["refused"] = orig["refused"]
    checked = [c if c is not None and _segment_ok(o, c, allowed_labels) else None for o, c in zip(batch, corrected)]
    bad = sum(c is None for c in checked)
    if bad:
        print(f"  {bad} segment(s) à la structure altérée par Gemini — texte brut conservé pour eux.", file=sys.stderr)
    return checked


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

    # Labels autorisés : ceux déjà présents + Modérateur (jamais de prénom réel inventé).
    allowed_labels = {s["speaker"] for s in segments} | {"Modérateur", "[?]", "[REFUS]"}

    client = _make_client(api_key)
    system_prompt = _build_system_prompt(topic, participants, allowed_labels)
    batches = [segments[i:i + BATCH_SIZE] for i in range(0, len(segments), BATCH_SIZE)]
    corrected_segments = []

    for i, batch in enumerate(batches):
        context_before = corrected_segments[-CONTEXT_WINDOW:] if corrected_segments else []
        context_after = batches[i + 1][:CONTEXT_WINDOW] if i + 1 < len(batches) else []
        print(f"Correction Gemini batch {i + 1}/{len(batches)} ({len(batch)} segments)...")
        result = None
        for attempt in range(1, 3):
            result = _correct_batch(client, system_prompt, batch, context_before, context_after, allowed_labels)
            if result is not None:
                break
            print(f"  Retry {attempt}/2...")
        if result is None:
            print(f"Batch {i + 1} abandonné après 2 tentatives — segments bruts conservés.", file=sys.stderr)
            corrected_segments.extend({**seg, "correction": "aucune"} for seg in batch)
        else:
            corrected_segments.extend(
                _merge_segment(o, c) if c is not None else {**o, "correction": "aucune"}
                for o, c in zip(batch, result)
            )

    corrected = corrected_segments
    rejected = [s for s in corrected if s.get("correction") == "rejetee"]
    suggested = [s for s in corrected if s.get("speaker_suggestion")]
    print(f"Corrections Gemini : {sum(s.get('correction') == 'gemini' for s in corrected)} acceptées, "
          f"{len(rejected)} rejetées par les garde-fous, "
          f"{sum(s.get('correction') == 'aucune' for s in corrected)} non corrigées ; "
          f"{len(suggested)} suggestion(s) d'orateur pour des [?].")
    if not _validate(segments, corrected, allowed_labels):
        print("Correction Gemini rejetée : structure invalide (segments manquants ou champs modifiés).", file=sys.stderr)
        return False

    json_path = Path(str(output_stem) + "_corrected.json")
    txt_path = Path(str(output_stem) + "_corrected.txt")

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(corrected, f, ensure_ascii=False, indent=2)
    _write_txt(corrected, txt_path)

    print(f"Correction Gemini écrite :\n  {txt_path}\n  {json_path}")
    _update_report(output_stem, corrected)
    return True


def _update_report(output_stem: Path, corrected: list[dict]) -> None:
    """Complète <stem>_rapport.json (s'il existe) : bilan de la correction + noms propres à relire."""
    from quality import proper_noun_candidates
    motifs: dict[str, int] = {}
    for s in corrected:
        if s.get("correction_motif"):
            motifs[s["correction_motif"]] = motifs.get(s["correction_motif"], 0) + 1
    names = proper_noun_candidates(corrected)
    section = {
        "modele": MODEL,
        "acceptees": sum(s.get("correction") == "gemini" for s in corrected),
        "rejetees": sum(s.get("correction") == "rejetee" for s in corrected),
        "non_corrigees": sum(s.get("correction") == "aucune" and not s.get("refused") for s in corrected),
        "motifs_rejet": motifs,
        "suggestions_orateur": sum(bool(s.get("speaker_suggestion")) for s in corrected),
        "noms_propres_a_verifier": [[n, c] for n, c in names],
    }
    if names:
        print("Noms propres à relire (prénom de participant non masqué ?) : "
              + ", ".join(f"{n} ({c})" for n, c in names[:40]))
    report_path = Path(f"{output_stem}_rapport.json")
    if not report_path.exists():
        return
    try:
        report = json.loads(report_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return
    report["correction"] = section
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass

    parser = argparse.ArgumentParser(description="Correction Gemini d'un transcript (.json) déjà produit.")
    parser.add_argument("json_path", help="<CODE>_<date>.json produit par transcribe_offline.py")
    parser.add_argument("--topic", default=None, help="Thème du débat (contexte pour Gemini)")
    args = parser.parse_args()

    json_path = Path(args.json_path)
    if not json_path.exists():
        print(f"Fichier introuvable : {json_path}", file=sys.stderr)
        sys.exit(1)

    segments = json.loads(json_path.read_text(encoding="utf-8"))
    output_stem = json_path.with_suffix("")
    result = correct(segments, output_stem, topic=args.topic)
    sys.exit(0 if result else 1)


if __name__ == "__main__":
    main()
