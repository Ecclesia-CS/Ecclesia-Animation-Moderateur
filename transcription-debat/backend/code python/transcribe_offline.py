import argparse
import csv
import json
import re
import sys
import datetime
from pathlib import Path

from dotenv import load_dotenv

from deduplicate import deduplicate

# Charge backend/.env (HF_TOKEN pour la diarisation, GEMINI_API_KEY pour la correction)
# dès l'import, avant tout os.getenv — sinon run_diarization ne voit pas le token.
load_dotenv()

# Attribution
MIN_OVERLAP_RATIO = 0.3      # un segment recouvrant un tour à moins de 30 % de sa durée → [?]
# Fusion (plafonds pour garder des segments lisibles)
MERGE_MAX_DURATION = 120.0   # ne pas fusionner au-delà de 2 min
MERGE_MAX_CHARS = 1400       # ni au-delà de ~1400 caractères
MERGE_MAX_GAP = 3.0          # ni par-dessus un silence > 3 s

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


def _speaker_at(t: float, turns: list[dict]) -> tuple[str, bool]:
    """Locuteur dont le tour contient l'instant t. Retourne (label, refused)."""
    for turn in turns:
        if turn["debut_sec"] <= t <= turn["fin_sec"]:
            if turn["refuse"]:
                return "[REFUS]", True
            return turn["interlocuteur"], False
    return "[?]", False


def assign_speakers_words(
    words: list[dict],
    turns: list[dict],
    max_duration: float = MERGE_MAX_DURATION,
    max_chars: int = MERGE_MAX_CHARS,
    max_gap: float = MERGE_MAX_GAP,
) -> list[dict]:
    """Attribution au niveau du mot puis regroupement en segments.

    Chaque mot est attribué au tour qui contient son milieu — bien plus précis que
    l'attribution par segment Whisper (dont les frontières VAD ne coïncident pas avec
    les tours). Les mots consécutifs de même locuteur sont regroupés, sans dépasser
    max_duration / max_chars, ni franchir un silence > max_gap : on évite ainsi les
    méga-segments illisibles tout en gardant les vrais changements de tour.
    """
    if not words:
        return []

    runs: list[dict] = []
    for w in words:
        mid = (w["start"] + w["end"]) / 2
        speaker, refused = _speaker_at(mid, turns)
        if runs:
            cur = runs[-1]
            can_merge = (
                cur["speaker"] == speaker
                and cur["refused"] == refused
                and (w["start"] - cur["end"]) <= max_gap
                and (cur["end"] - cur["start"]) < max_duration
                and len(cur["_text"]) < max_chars
            )
            if can_merge:
                cur["end"] = w["end"]
                if not refused:
                    cur["_text"] += " " + w["text"]
                continue
        runs.append({
            "start": w["start"],
            "end": w["end"],
            "speaker": speaker,
            "refused": refused,
            "_text": "" if refused else w["text"],
        })

    result = []
    for run in runs:
        text = "[N'a pas souhaité être enregistré(e)]" if run["refused"] else run["_text"].strip()
        result.append({
            "start": run["start"],
            "end": run["end"],
            "speaker": run["speaker"],
            "text": text,
            "refused": run["refused"],
        })
    return result


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
    pairs = sorted(
        ((n, lbl) for n, lbl in name_map.items() if len(n) >= 3),
        key=lambda kv: len(kv[0]),
        reverse=True,
    )
    if not pairs:
        return segments
    patterns = [(re.compile(rf"\b{re.escape(n)}\b", re.IGNORECASE), lbl) for n, lbl in pairs]
    result = []
    for seg in segments:
        if seg.get("refused"):
            result.append(dict(seg))
            continue
        text = seg["text"]
        for pat, lbl in patterns:
            text = pat.sub(lbl, text)
        result.append({**seg, "text": text})
    return result


def split_turns_by_diarization(turns: list[dict], diar_turns: list[dict]) -> list[dict]:
    """Croise le log de tours avec une diarisation acoustique (§2).

    diar_turns : [{"start": float, "end": float, "speaker": str}] produit par pyannote.
    Là où la diarisation indique un locuteur différent du détenteur officiel de la
    parole (brouhaha, interruption), le sous-intervalle est marqué [?] plutôt que
    faussement attribué. On ne tente pas de mapper les clusters pyannote vers les
    labels — on s'en sert uniquement pour invalider les attributions douteuses.
    """
    if not diar_turns:
        return turns

    # Locuteur acoustique dominant de chaque tour (celui qui parle le plus pendant le tour).
    def dominant(turn) -> str | None:
        acc: dict[str, float] = {}
        for d in diar_turns:
            ov = min(turn["fin_sec"], d["end"]) - max(turn["debut_sec"], d["start"])
            if ov > 0:
                acc[d["speaker"]] = acc.get(d["speaker"], 0.0) + ov
        return max(acc, key=acc.get) if acc else None

    refined: list[dict] = []
    for turn in turns:
        if turn["refuse"]:
            refined.append(turn)
            continue
        dom = dominant(turn)
        if dom is None:
            refined.append(turn)
            continue
        # Découpe le tour aux frontières de diarisation ; sous-intervalle d'un autre
        # locuteur acoustique que le dominant → [?].
        cuts = sorted({turn["debut_sec"], turn["fin_sec"]} | {
            b for d in diar_turns for b in (d["start"], d["end"])
            if turn["debut_sec"] < b < turn["fin_sec"]
        })
        for a, b in zip(cuts, cuts[1:]):
            mid = (a + b) / 2
            spk_here = next(
                (d["speaker"] for d in diar_turns if d["start"] <= mid <= d["end"]),
                None,
            )
            same = spk_here == dom
            refined.append({
                **turn,
                "debut_sec": a,
                "fin_sec": b,
                "interlocuteur": turn["interlocuteur"] if same else "[?]",
                "refuse": False,
            })
    return refined


def run_diarization(audio_path: str):
    """Diarisation pyannote (best-effort). Retourne des diar_turns ou None.

    Chargé paresseusement : nécessite pyannote.audio + HF_TOKEN. Toute erreur
    (dépendance absente, modèle, GPU) dégrade gracieusement vers None.
    """
    import os
    token = os.getenv("HF_TOKEN")
    if not token:
        print("HF_TOKEN absent — diarisation acoustique ignorée.", file=sys.stderr)
        return None
    try:
        from pyannote.audio import Pipeline  # type: ignore
        pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1", use_auth_token=token
        )
        if pipeline is None:
            print("Pipeline pyannote introuvable (accès au modèle gated ?) — on continue sans.", file=sys.stderr)
            return None
        # CPU par défaut (le GPU de cette machine a un cuDNN incompatible qui crashe
        # nativement, non rattrapable). Forcer le GPU via PYANNOTE_DEVICE=cuda si dispo.
        device = os.getenv("PYANNOTE_DEVICE", "cpu")
        try:
            import torch  # type: ignore
            pipeline.to(torch.device(device))
        except Exception as dev_exc:
            print(f"pyannote .to({device}) échoué ({dev_exc}) — CPU.", file=sys.stderr)
        diarization = pipeline(audio_path)
        return [
            {"start": seg.start, "end": seg.end, "speaker": label}
            for seg, _, label in diarization.itertracks(yield_label=True)
        ]
    except Exception as exc:  # pragma: no cover — dépend de l'environnement
        print(f"Diarisation pyannote échouée ({exc}) — on continue sans.", file=sys.stderr)
        return None


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
    parser.add_argument("--diarize", action="store_true", help="Active la diarisation acoustique pyannote pour désambiguïser le brouhaha (nécessite HF_TOKEN)")
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

    print("Chargement de Whisper large-v3 (GPU)...")
    model = WhisperModel("large-v3", device="cuda", compute_type="float16")
    print(f"Transcription de {args.audio}...")
    raw_segments, _ = model.transcribe(
        args.audio,
        language="fr",
        beam_size=5,
        vad_filter=True,
        condition_on_previous_text=False,  # réduit les boucles de répétition / hallucinations
        compression_ratio_threshold=2.4,
        log_prob_threshold=-1.0,
        no_speech_threshold=0.6,
        word_timestamps=True,
        initial_prompt=initial_prompt,
    )
    whisper_segs_raw = []
    whisper_words_raw = []
    for s in raw_segments:
        txt = s.text.strip()
        if not txt:
            continue
        whisper_segs_raw.append({"start": s.start, "end": s.end, "text": txt})
        words = getattr(s, "words", None)
        if isinstance(words, (list, tuple)):
            for w in words:
                wt = (getattr(w, "word", "") or "").strip()
                ws, we = getattr(w, "start", None), getattr(w, "end", None)
                if wt and isinstance(ws, (int, float)) and isinstance(we, (int, float)):
                    whisper_words_raw.append({"start": ws, "end": we, "text": wt})
    print(f"{len(whisper_segs_raw)} segments Whisper, {len(whisper_words_raw)} mots horodatés.")

    # 3. Détecter ou utiliser audio_start
    if args.audio_start:
        audio_start = datetime.datetime.fromisoformat(args.audio_start)
        print(f"audio_start fourni : {audio_start.isoformat()}")
    else:
        print("Détection automatique de l'offset audio_start...")
        audio_start = detect_audio_start(whisper_segs_raw, turns)
    turns = compute_offsets(turns, audio_start)

    # 3 bis. Diarisation acoustique optionnelle pour désambiguïser le brouhaha
    if args.diarize:
        diar_turns = run_diarization(args.audio)
        if diar_turns:
            turns = split_turns_by_diarization(turns, diar_turns)
            print(f"Diarisation appliquée : {len(diar_turns)} segments acoustiques.")

    # 4. Aligner (au mot si possible, sinon par segment), fusionner, anonymiser, dédupliquer
    if whisper_words_raw:
        segments = assign_speakers_words(whisper_words_raw, turns)
    else:
        segments = assign_speakers(whisper_segs_raw, turns)
        segments = merge_same_speaker(segments)

    audio_end = max((s["end"] for s in whisper_segs_raw), default=0.0)
    cov = coverage_report(segments, audio_end)
    if cov["unknown_ratio"] > 0.15:
        print(
            f"⚠ Couverture du log incomplète : {cov['unknown_ratio']*100:.0f}% de l'audio "
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

    base_dir = Path(__file__).parent / "transcripts"
    if args.topic:
        output_dir = base_dir / args.topic / args.group
    else:
        output_dir = base_dir / args.group
    output_dir.mkdir(parents=True, exist_ok=True)
    date_str = datetime.date.today().isoformat()
    base = output_dir / f"{args.group}_{date_str}"

    write_txt(segments, base.with_suffix(".txt"))
    write_json(segments, base.with_suffix(".json"))

    print(f"Transcript ecrit :\n  {base}.txt\n  {base}.json")

    try:
        from correct_transcript import correct
        correct(segments, base, topic=args.topic, participants=participants)
    except ImportError as exc:
        print(f"Module correct_transcript indisponible : {exc}", file=sys.stderr)


if __name__ == "__main__":
    main()
