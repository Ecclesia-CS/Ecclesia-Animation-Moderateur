import argparse
import csv
import json
import re
import sys
import datetime
from pathlib import Path

from dotenv import load_dotenv

from boundaries import snap_turn_boundaries
from deduplicate import deduplicate
from quality import transcript_metrics
from voice import (
    change_points, fuse_word_speakers, holdout_agreement, load_diarization, map_clusters,
    refine_offset, save_diarization, shift_turns,
)

# Charge backend/.env (HF_TOKEN pour la diarisation, GEMINI_API_KEY pour la correction)
# dès l'import, avant tout os.getenv — sinon run_diarization ne voit pas le token.
load_dotenv()

# Attribution
MIN_OVERLAP_RATIO = 0.3      # un segment recouvrant un tour à moins de 30 % de sa durée → [?]
# Fusion (plafonds pour garder des segments lisibles)
MERGE_MAX_DURATION = 120.0   # ne pas fusionner au-delà de 2 min
MERGE_MAX_CHARS = 1400       # ni au-delà de ~1400 caractères
MERGE_MAX_GAP = 3.0          # ni par-dessus un silence > 3 s

# Sorties : backend/transcripts/<Thème>/<CODE>/ (le code vit dans backend/code python/)
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parent.parent / "transcripts"

# Paramètres Whisper (enregistrés dans le cache pour traçabilité)
WHISPER_MODEL = "large-v3"
WHISPER_PARAMS = {
    "language": "fr",
    "beam_size": 5,
    "vad_filter": True,
    "condition_on_previous_text": False,  # réduit les boucles de répétition / hallucinations
    "compression_ratio_threshold": 2.4,
    "log_prob_threshold": -1.0,
    "no_speech_threshold": 0.6,
    "word_timestamps": True,
}

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


def detect_audio_start(
    whisper_segs: list[dict],
    turns: list[dict],
    max_offset_sec: int = 600,
) -> datetime.datetime:
    """Trouve le décalage audio_start qui maximise le recouvrement Whisper↔tours Ecclesia.

    Teste des offsets de 0 à max_offset_sec secondes par pas de 1 s.
    Retourne le datetime correspondant au meilleur offset.
    """
    first_turn_dt = datetime.datetime.fromisoformat(turns[0]["debut_iso"])

    def total_overlap(offset_sec: float) -> float:
        total = 0.0
        for seg in whisper_segs:
            seg_start = seg["start"] - offset_sec
            seg_end = seg["end"] - offset_sec
            for turn in turns:
                t_start = (datetime.datetime.fromisoformat(turn["debut_iso"]) - first_turn_dt).total_seconds()
                t_end = (datetime.datetime.fromisoformat(turn["fin_iso"]) - first_turn_dt).total_seconds()
                overlap = min(seg_end, t_end) - max(seg_start, t_start)
                if overlap > 0:
                    total += overlap
        return total

    best_offset = 0
    best_score = total_overlap(0)
    for offset in range(1, max_offset_sec + 1):
        score = total_overlap(offset)
        if score > best_score:
            best_score = score
            best_offset = offset

    result = first_turn_dt - datetime.timedelta(seconds=best_offset)
    print(f"Auto-détection audio_start : offset={best_offset}s → {result.isoformat()}")
    return result


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
    """Attribue un locuteur à chaque segment Whisper par recouvrement maximal.

    Si le meilleur recouvrement couvre moins de MIN_OVERLAP_RATIO de la durée du
    segment, on préfère [?] à une attribution arbitraire (segment à cheval, brouhaha).
    """
    result = []
    for seg in segments:
        best_turn = None
        best_overlap = 0.0
        for turn in turns:
            overlap = min(seg["end"], turn["fin_sec"]) - max(seg["start"], turn["debut_sec"])
            if overlap > best_overlap:
                best_overlap = overlap
                best_turn = turn

        seg_dur = max(seg["end"] - seg["start"], 1e-9)
        if best_turn is not None and best_overlap < MIN_OVERLAP_RATIO * seg_dur:
            best_turn = None

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


_ATTACHED_START = re.compile(r"^(['’]|-[^\W\d_])")


def join_words(words: list[dict]) -> str:
    """Recolle des mots Whisper en texte.

    faster-whisper fournit chaque mot avec son espace de tête (" l", "'état",
    " actuel") : concaténer ce texte brut ("raw") restitue l'orthographe exacte
    du décodeur. Les anciens caches n'ont que le texte nettoyé ("text") : on
    applique alors la règle équivalente — pas d'espace avant une apostrophe ni
    avant un trait d'union collé à une lettre (« qu'il », « est-ce »).
    """
    parts: list[str] = []
    for w in words:
        raw = w.get("raw")
        if isinstance(raw, str) and raw:
            parts.append(raw)
            continue
        text = w.get("text", "")
        if parts and not _ATTACHED_START.match(text):
            parts.append(" ")
        parts.append(text)
    return "".join(parts).strip()


_LEGACY_APOSTROPHE = re.compile(r"(\w) (['’])(?=\w)")
_LEGACY_HYPHEN = re.compile(r"(\w) -(?=[^\W\d_])")


def normalize_word_joins(text: str) -> str:
    """Répare le texte produit par l'ancien recollage (« l 'état », « est -ce »)."""
    text = _LEGACY_APOSTROPHE.sub(r"\1\2", text)
    return _LEGACY_HYPHEN.sub(r"\1-", text)


def _speaker_at(t: float, turns: list[dict]) -> tuple[str, bool]:
    """Locuteur dont le tour contient l'instant t. Retourne (label, refused)."""
    for turn in turns:
        if turn["debut_sec"] <= t <= turn["fin_sec"]:
            if turn["refuse"]:
                return "[REFUS]", True
            return turn["interlocuteur"], False
    return "[?]", False


LOW_CONF_PROB = 0.5  # un mot sous cette probabilité Whisper est signalé comme douteux


def group_words(
    words: list[dict],
    max_duration: float = MERGE_MAX_DURATION,
    max_chars: int = MERGE_MAX_CHARS,
    max_gap: float = MERGE_MAX_GAP,
) -> list[dict]:
    """Regroupe des mots déjà attribués (speaker, refused, source) en segments lisibles.

    Les mots consécutifs de même locuteur sont regroupés, sans dépasser
    max_duration / max_chars, ni franchir un silence > max_gap : on évite les
    méga-segments illisibles tout en gardant les vrais changements de tour.
    Chaque segment porte speaker_source (provenance majoritaire, en durée) et,
    s'il y en a, low_conf_words : les mots que Whisper a peu sûrement reconnus.
    """
    runs: list[dict] = []
    for w in words:
        speaker, refused = w["speaker"], w.get("refused", False)
        if runs:
            cur = runs[-1]
            can_merge = (
                cur["speaker"] == speaker
                and cur["refused"] == refused
                and (w["start"] - cur["end"]) <= max_gap
                and (cur["end"] - cur["start"]) < max_duration
                and cur["_chars"] < max_chars
            )
            if can_merge:
                cur["end"] = w["end"]
                cur["_words"].append(w)
                cur["_chars"] += len(w["text"]) + 1
                continue
        runs.append({
            "start": w["start"], "end": w["end"], "speaker": speaker, "refused": refused,
            "_words": [w], "_chars": len(w["text"]),
        })

    result = []
    for run in runs:
        src_dur: dict[str, float] = {}
        for w in run["_words"]:
            src = w.get("source", "log")
            src_dur[src] = src_dur.get(src, 0.0) + max(w["end"] - w["start"], 0.01)
        seg = {
            "start": run["start"],
            "end": run["end"],
            "speaker": run["speaker"],
            "text": "[N'a pas souhaité être enregistré(e)]" if run["refused"] else join_words(run["_words"]),
            "refused": run["refused"],
            "speaker_source": max(src_dur, key=src_dur.get),
        }
        if not run["refused"]:
            low = [w["text"] for w in run["_words"] if w.get("prob", 1.0) < LOW_CONF_PROB]
            if low:
                seg["low_conf_words"] = low
        result.append(seg)
    return result


def assign_speakers_words(
    words: list[dict],
    turns: list[dict],
    max_duration: float = MERGE_MAX_DURATION,
    max_chars: int = MERGE_MAX_CHARS,
    max_gap: float = MERGE_MAX_GAP,
) -> list[dict]:
    """Attribution au niveau du mot par le log seul, puis regroupement en segments.

    Chaque mot est attribué au tour qui contient son milieu — bien plus précis que
    l'attribution par segment Whisper (dont les frontières VAD ne coïncident pas avec
    les tours).
    """
    labeled = []
    for w in words:
        speaker, refused = _speaker_at((w["start"] + w["end"]) / 2, turns)
        labeled.append({**w, "speaker": speaker, "refused": refused,
                        "source": "aucune" if speaker == "[?]" else "log"})
    return group_words(labeled, max_duration, max_chars, max_gap)


def merge_same_speaker(
    segments: list[dict],
    max_duration: float = MERGE_MAX_DURATION,
    max_chars: int = MERGE_MAX_CHARS,
    max_gap: float = MERGE_MAX_GAP,
) -> list[dict]:
    """Fusionne les segments consécutifs du même locuteur, dans la limite des plafonds.

    On ne fusionne pas au-delà de max_duration / max_chars, ni par-dessus un silence
    > max_gap : un même locuteur qui monologue longtemps est découpé en blocs lisibles
    plutôt que collé en un mur de texte.
    """
    if not segments:
        return []
    merged = [dict(segments[0])]
    for seg in segments[1:]:
        prev = merged[-1]
        can_merge = (
            seg["speaker"] == prev["speaker"]
            and not seg.get("refused")
            and not prev.get("refused")
            and (seg["start"] - prev["end"]) <= max_gap
            and (prev["end"] - prev["start"]) < max_duration
            and len(prev["text"]) < max_chars
        )
        if can_merge:
            prev["text"] += " " + seg["text"]
            prev["end"] = seg["end"]
        else:
            merged.append(dict(seg))
    return merged


def coverage_report(segments: list[dict], audio_end: float) -> dict:
    """Quantifie la part d'audio non attribuée ([?]) — symptôme d'un log incomplet."""
    unknown = sum(
        s["end"] - s["start"] for s in segments if s["speaker"] == "[?]"
    )
    total = audio_end if audio_end > 0 else sum(s["end"] - s["start"] for s in segments)
    ratio = unknown / total if total else 0.0
    return {"unknown_sec": unknown, "total_sec": total, "unknown_ratio": ratio}


def load_name_map(log_path: str, extra_names: list[str] | None = None) -> dict[str, str]:
    """Charge la correspondance prénom réel → label (name_map.json à côté du log).

    Permet de masquer dans le CORPS du texte les prénoms réellement prononcés, que
    l'anonymisation des labels ne couvre pas. extra_names (prénoms sans label connu)
    sont mappés vers le jeton neutre [prénom].
    """
    mapping: dict[str, str] = {}
    sidecar = Path(log_path).parent / "name_map.json"
    if sidecar.exists():
        try:
            raw = json.loads(sidecar.read_text(encoding="utf-8"))
            mapping.update({str(k): str(v) for k, v in raw.items()})
        except (json.JSONDecodeError, OSError) as exc:
            print(f"name_map.json illisible ({exc}) — rédaction des prénoms partielle.", file=sys.stderr)
    for name in extra_names or []:
        mapping.setdefault(name, "[prénom]")
    return mapping


def redact_names(segments: list[dict], name_map: dict[str, str]) -> list[dict]:
    """Remplace dans le texte les prénoms réels par leur label (RGPD).

    Casse-insensible, sur frontières de mot, prénoms de 3 caractères minimum pour
    éviter les collisions avec des mots courants.
    """
    patterns = _name_patterns(name_map)
    if not patterns:
        return segments
    result = []
    for seg in segments:
        if seg.get("refused"):
            result.append(dict(seg))
            continue
        out = {**seg, "text": _redact_text(seg["text"], patterns)}
        if seg.get("low_conf_words"):
            out["low_conf_words"] = [_redact_text(w, patterns) for w in seg["low_conf_words"]]
        result.append(out)
    return result


def _name_patterns(name_map: dict[str, str]) -> list:
    pairs = sorted(
        ((n, lbl) for n, lbl in name_map.items() if len(n) >= 3),
        key=lambda kv: len(kv[0]),
        reverse=True,
    )
    return [(re.compile(rf"\b{re.escape(n)}\b", re.IGNORECASE), lbl) for n, lbl in pairs]


def _redact_text(text: str, patterns) -> str:
    for pat, lbl in patterns:
        text = pat.sub(lbl, text)
    return text


def sanitize_cache_words(words: list[dict], labeled: list[dict], name_map: dict[str, str]) -> list[dict]:
    """Version du cache Whisper sûre à conserver (RGPD).

    Les mots attribués à une personne qui a refusé l'enregistrement sont vidés
    (seuls les horodatages restent), et les prénoms réels sont masqués.
    """
    patterns = _name_patterns(name_map)
    out = []
    for w, lab in zip(words, labeled):
        if lab.get("refused"):
            out.append({**w, "text": "", "raw": ""})
            continue
        clean = {**w, "text": _redact_text(w["text"], patterns)}
        if isinstance(w.get("raw"), str):
            clean["raw"] = _redact_text(w["raw"], patterns)
        out.append(clean)
    return out


DIARIZATION_PIPELINE = "pyannote/speaker-diarization-3.1"


def run_diarization(audio_path: str) -> list[dict] | None:
    """Diarisation pyannote 3.1 (best-effort). Retourne [{start, end, speaker}] ou None.

    Chargé paresseusement : nécessite pyannote.audio + HF_TOKEN. L'audio est décodé
    par faster-whisper (16 kHz mono, comme Whisper) pour accepter tous les formats.
    GPU si disponible (≈ 7 min pour 2 h d'audio sur RTX 3070), sinon CPU ;
    PYANNOTE_DEVICE=cpu|cuda force le choix. Toute erreur dégrade vers None.
    """
    import os
    token = os.getenv("HF_TOKEN")
    if not token:
        print("HF_TOKEN absent — identification des voix ignorée.", file=sys.stderr)
        return None
    try:
        import torch  # type: ignore
        from faster_whisper.audio import decode_audio
        from pyannote.audio import Pipeline  # type: ignore
        pipeline = Pipeline.from_pretrained(DIARIZATION_PIPELINE, use_auth_token=token)
        if pipeline is None:
            print("Pipeline pyannote introuvable (accès au modèle gated ?) — on continue sans.", file=sys.stderr)
            return None
        device = os.getenv("PYANNOTE_DEVICE") or ("cuda" if torch.cuda.is_available() else "cpu")
        pipeline.to(torch.device(device))
        print(f"Diarisation pyannote ({device})...")
        waveform = torch.from_numpy(decode_audio(audio_path, sampling_rate=16000)).unsqueeze(0)
        diarization = pipeline({"waveform": waveform, "sample_rate": 16000})
        return [
            {"start": float(seg.start), "end": float(seg.end), "speaker": label}
            for seg, _, label in diarization.itertracks(yield_label=True)
        ]
    except Exception as exc:  # pragma: no cover — dépend de l'environnement
        print(f"Diarisation pyannote échouée ({exc}) — on continue sans.", file=sys.stderr)
        return None


def run_whisper(audio_path: str, initial_prompt: str | None) -> tuple[list[dict], list[dict]]:
    """Transcrit l'audio (Whisper large-v3, GPU). Retourne (segments, mots horodatés).

    Chaque mot garde son texte brut ("raw", avec l'espace de tête que faster-whisper
    fournit — nécessaire au recollage exact) et sa probabilité ("prob").
    """
    print("Chargement de Whisper large-v3 (GPU)...")
    model = WhisperModel(WHISPER_MODEL, device="cuda", compute_type="float16")
    print(f"Transcription de {audio_path}...")
    raw_segments, _ = model.transcribe(audio_path, initial_prompt=initial_prompt, **WHISPER_PARAMS)
    segments: list[dict] = []
    words_out: list[dict] = []
    for s in raw_segments:
        txt = s.text.strip()
        if not txt:
            continue
        segments.append({"start": float(s.start), "end": float(s.end), "text": txt})
        words = getattr(s, "words", None)
        if isinstance(words, (list, tuple)):
            for w in words:
                raw = getattr(w, "word", "") or ""
                wt = raw.strip()
                ws, we = getattr(w, "start", None), getattr(w, "end", None)
                if wt and isinstance(ws, (int, float)) and isinstance(we, (int, float)):
                    word = {"start": float(ws), "end": float(we), "text": wt, "raw": raw}
                    prob = getattr(w, "probability", None)
                    if isinstance(prob, (int, float)):
                        word["prob"] = float(prob)
                    words_out.append(word)
    return segments, words_out


def save_whisper_cache(path: Path, segments: list[dict], words: list[dict], **meta) -> None:
    """Sauvegarde la sortie Whisper pour pouvoir refaire l'attribution sans GPU."""
    payload = {
        "version": 1,
        "model": WHISPER_MODEL,
        "params": WHISPER_PARAMS,
        **meta,
        "segments": segments,
        "words": words,
    }
    Path(path).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def load_whisper_cache(path: str | Path) -> tuple[list[dict], list[dict]]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    segments = [{"text": "", **seg} for seg in data["segments"]]
    return segments, data["words"]


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
    parser.add_argument("--topic", default=None, help="Thème du débat (ex: 'Retraite') — améliore la reconnaissance Whisper et la correction Gemini")
    parser.add_argument("--participants", default=None, help="Pseudos séparés par des virgules (ex: 'Jules,Ilyès,Emilien') — améliore la reconnaissance des noms propres")
    parser.add_argument("--redact-names", default=None, help="Prénoms réels supplémentaires à masquer dans le texte (séparés par des virgules) — complète name_map.json")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Dossier racine des sorties (défaut : backend/transcripts)")
    parser.add_argument("--whisper-cache", default=None, help="Réutilise un <CODE>_whisper.json au lieu de relancer Whisper (évite ~20 min de GPU)")
    parser.add_argument("--no-diarize", action="store_true", help="Désactive l'identification des voix (pyannote) : attribution par le log seul")
    parser.add_argument("--diarize", action="store_true", help=argparse.SUPPRESS)  # compatibilité : c'est le défaut
    parser.add_argument("--diarization-cache", default=None, help="Réutilise un <CODE>_diarization.json au lieu de relancer pyannote")
    args = parser.parse_args()

    # Console Windows (cp1252) : éviter les UnicodeEncodeError sur les caractères non-ASCII
    # des messages de progression (→, ⚠, accents) quand stdout est redirigé.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass

    if WhisperModel is None:
        print("Erreur : faster-whisper n'est pas installe. Installer avec: pip install faster-whisper", file=sys.stderr)
        sys.exit(1)

    participants = [p.strip() for p in args.participants.split(",")] if args.participants else None

    # 1. Charger le log
    turns = load_anon_log(args.log)

    # 2. Transcrire avec Whisper large-v3 sur GPU
    initial_prompt = None
    if args.topic or participants:
        parts = []
        if args.topic:
            parts.append(f"Débat sur le thème : {args.topic}.")
        if participants:
            parts.append(f"Participants : {', '.join(participants)}.")
        initial_prompt = " ".join(parts)
        print(f"Initial prompt Whisper : {initial_prompt}")

    if args.whisper_cache:
        whisper_segs_raw, whisper_words_raw = load_whisper_cache(args.whisper_cache)
        print(f"Cache Whisper réutilisé : {args.whisper_cache}")
    else:
        whisper_segs_raw, whisper_words_raw = run_whisper(args.audio, initial_prompt)
    print(f"{len(whisper_segs_raw)} segments Whisper, {len(whisper_words_raw)} mots horodatés.")

    output_dir = Path(args.output_dir) / args.topic / args.group if args.topic else Path(args.output_dir) / args.group
    output_dir.mkdir(parents=True, exist_ok=True)
    if not args.whisper_cache:
        cache_path = output_dir / f"{args.group}_whisper.json"
        save_whisper_cache(cache_path, whisper_segs_raw, whisper_words_raw, audio=args.audio, initial_prompt=initial_prompt)
        print(f"Cache Whisper écrit : {cache_path}")

    # 3. Détecter ou utiliser audio_start
    if args.audio_start:
        audio_start = datetime.datetime.fromisoformat(args.audio_start)
        print(f"audio_start fourni : {audio_start.isoformat()}")
    else:
        print("Détection automatique de l'offset audio_start...")
        audio_start = detect_audio_start(whisper_segs_raw, turns)
    turns = compute_offsets(turns, audio_start)

    report: dict = {"audio_start": audio_start.isoformat()}

    # 3 bis. Identification des voix (diarisation pyannote croisée avec le log)
    diar = None
    if args.diarization_cache:
        diar = load_diarization(args.diarization_cache)
        print(f"Diarisation réutilisée : {args.diarization_cache}")
    elif not args.no_diarize:
        diar = run_diarization(args.audio)
        if diar:
            diar_path = output_dir / f"{args.group}_diarization.json"
            save_diarization(diar_path, diar, pipeline=DIARIZATION_PIPELINE)
            print(f"Diarisation écrite : {diar_path}")
    mapping = None
    cps: list[float] = []
    if diar:
        shift, _curve = refine_offset(turns, diar)
        turns = shift_turns(turns, shift)
        mapping = map_clusters(turns, diar)
        holdout = holdout_agreement(turns, diar)
        identified = [{**d, "speaker": mapping[d["speaker"]]["label"]} for d in diar if mapping[d["speaker"]]["label"]]
        cps = change_points(identified)
        report["voix"] = {"decalage_affine_sec": shift, "rattachement": mapping, "validation_croisee": holdout}
        print(f"Voix : décalage affiné {shift:+.1f} s ; accord voix/log en validation croisée "
              f"{holdout['agreement'] * 100:.1f} % (couverture {holdout['coverage'] * 100:.0f} %).")
        for v, info in sorted(mapping.items(), key=lambda kv: -kv[1]["support"]):
            print(f"  {v:>12} -> {info['label'] or '-':<16} ({info['kind']}, pureté {info['purity']:.2f}, {info['support']:.0f} s)")

    # 4. Recaler les frontières, attribuer au mot (log x voix), regrouper
    labeled_words: list[dict] = []
    if whisper_words_raw:
        turns = snap_turn_boundaries(turns, whisper_words_raw, change_points=cps)
        moved = sorted(abs(t["fin_sec"] - t["fin_sec_log"]) for t in turns if t["fin_sec"] != t["fin_sec_log"])
        report["frontieres"] = {"tours": len(turns), "fins_recalees": len(moved),
                                "decalage_median_sec": moved[len(moved) // 2] if moved else 0.0}
        if mapping:
            labeled_words = fuse_word_speakers(whisper_words_raw, turns, diar, mapping)
        else:
            for w in whisper_words_raw:
                spk, refused = _speaker_at((w["start"] + w["end"]) / 2, turns)
                labeled_words.append({**w, "speaker": spk, "refused": refused,
                                      "source": "aucune" if spk == "[?]" else "log"})
        segments = group_words(labeled_words)
    else:
        segments = assign_speakers(whisper_segs_raw, turns)
        segments = merge_same_speaker(segments)

    audio_end = max((s["end"] for s in whisper_segs_raw), default=0.0)
    cov = coverage_report(segments, audio_end)
    if cov["unknown_ratio"] > 0.15:
        print(
            f"⚠ Couverture incomplète : {cov['unknown_ratio'] * 100:.0f}% de l'audio "
            f"non attribué ([?], {cov['unknown_sec']:.0f}s). Vérifier le log et l'offset.",
            file=sys.stderr,
        )

    name_map = load_name_map(
        args.log,
        [n.strip() for n in args.redact_names.split(",")] if args.redact_names else None,
    )
    if name_map:
        segments = redact_names(segments, name_map)
        print(f"Rédaction des prénoms dans le texte : {len(name_map)} entrée(s).")

    segments = deduplicate(segments)

    date_str = datetime.date.today().isoformat()
    base = output_dir / f"{args.group}_{date_str}"

    write_txt(segments, base.with_suffix(".txt"))
    write_json(segments, base.with_suffix(".json"))
    print(f"Transcript ecrit :\n  {base}.txt\n  {base}.json")

    # Cache Whisper assaini (RGPD) : mots des refus vidés, prénoms masqués.
    if labeled_words:
        save_whisper_cache(
            output_dir / f"{args.group}_whisper.json",
            [{"start": s["start"], "end": s["end"]} for s in whisper_segs_raw],
            sanitize_cache_words(whisper_words_raw, labeled_words, name_map),
            audio=args.audio,
        )

    report["metriques"] = transcript_metrics(segments)
    report_path = Path(f"{base}_rapport.json")
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    m = report["metriques"]
    sources = {k: round(v) for k, v in m["by_source_sec"].items()}
    print(f"Rapport : {report_path}")
    print(f"  non attribué [?] : {m['unknown_ratio'] * 100:.1f} % ; phrases coupées : "
          f"{m['mid_sentence_cuts']}/{m['speaker_changes']} changements ; provenance (s) : {sources}")

    try:
        from correct_transcript import correct
        # Les prénoms réels (participants) servent à Whisper, en local : ils ne sont
        # jamais envoyés à Gemini, qui ne reçoit que les labels anonymisés.
        correct(segments, base, topic=args.topic)
    except ImportError as exc:
        print(f"Module correct_transcript indisponible : {exc}", file=sys.stderr)


if __name__ == "__main__":
    main()
