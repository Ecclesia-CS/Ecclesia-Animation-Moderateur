import os
import uuid
import tempfile
import logging
import datetime
from dataclasses import dataclass, field
from pathlib import Path

# Patch lightning inspect.stack() incompatible avec Python 3.13 + speechbrain lazy imports
import lightning.pytorch.utilities.model_helpers as _mh
_mh._IS_SCRIPTING_FN = lambda: False  # type: ignore[attr-defined]
import inspect as _inspect
_orig_stack = _inspect.stack
def _safe_stack(*a, **kw):
    try:
        return _orig_stack(*a, **kw)
    except Exception:
        return []
_inspect.stack = _safe_stack

import asyncio

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware

from transcriber import Transcriber
from diarizer import Diarizer
from speaker_tracker import SpeakerTracker

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

load_dotenv()
HF_TOKEN = os.getenv("HF_TOKEN")
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "./transcripts"))

DEDUP_WINDOW = 30.0


class SegmentDeduplicator:
    """Filtre les segments dupliqués ou dans le passé avant écriture."""

    def __init__(self):
        self._recent: list[tuple[str, float]] = []
        self._cursor: float = 0.0

    def should_skip(self, text: str, global_start: float, global_end: float) -> bool:
        if global_start < self._cursor - OVERLAP:
            return True
        cutoff = global_start - DEDUP_WINDOW
        self._recent = [(t, s) for t, s in self._recent if s > cutoff]
        normalized = text.strip().lower()
        if any(t == normalized for t, _ in self._recent):
            return True
        self._recent.append((normalized, global_start))
        self._cursor = max(self._cursor, global_end)
        return False


@dataclass
class GroupState:
    """État persistant par groupe, survit aux reconnexions WebSocket."""
    tracker: SpeakerTracker = field(default_factory=SpeakerTracker)
    deduplicator: SegmentDeduplicator = field(default_factory=SegmentDeduplicator)
    chunk_index: int = 0
    webm_header: bytes | None = None


logger = logging.getLogger(__name__)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logger.info("Chargement du modèle Whisper…")
transcriber = Transcriber()
logger.info("Whisper prêt.")

logger.info("Chargement du modèle de diarisation (HF_TOKEN=%s)…", "présent" if HF_TOKEN else "ABSENT")
diarizer = Diarizer(HF_TOKEN)
logger.info("Diariseur prêt.")

CHUNK_DURATION = 12.0
OVERLAP = 1.0

# État global par groupe — persiste entre les reconnexions WebSocket
_group_states: dict[str, GroupState] = {}


def get_group_state(group: str) -> GroupState:
    if group not in _group_states:
        _group_states[group] = GroupState()
    return _group_states[group]


def get_transcript_path(group: str) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    date_str = datetime.date.today().isoformat()
    return OUTPUT_DIR / f"{group}_{date_str}.txt"


def merge_same_speaker(segments: list) -> list:
    """Fusionne les segments consécutifs du même locuteur en une seule ligne."""
    if not segments:
        return segments
    merged = [segments[0].copy()]
    for seg in segments[1:]:
        if seg["speaker"] == merged[-1]["speaker"]:
            merged[-1]["text"] += " " + seg["text"]
            merged[-1]["end"] = seg["end"]
        else:
            merged.append(seg.copy())
    return merged


def append_segments(group: str, segments: list) -> None:
    path = get_transcript_path(group)
    with open(path, "a", encoding="utf-8") as f:
        for seg in segments:
            h = int(seg["start"] // 3600)
            m = int((seg["start"] % 3600) // 60)
            s = int(seg["start"] % 60)
            timestamp = f"[{h:02d}:{m:02d}:{s:02d}]"
            f.write(f"{timestamp} {seg['speaker']}: {seg['text']}\n")


async def _keepalive(ws: WebSocket) -> None:
    """Envoie un ping toutes les 30 s pour éviter le timeout ngrok."""
    try:
        while True:
            await asyncio.sleep(30)
            await ws.send_json({"ping": True})
    except Exception:
        pass


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, group: str = Query(default="unknown")):
    await ws.accept()
    state = get_group_state(group)
    logger.info("Groupe '%s' connecté (chunk_index=%d)", group, state.chunk_index)
    ping_task = asyncio.create_task(_keepalive(ws))

    try:
        while True:
            data = await ws.receive_bytes()

            if len(data) < 1024:
                continue

            if state.webm_header is None:
                state.webm_header = data

            tmp_path = os.path.join(tempfile.gettempdir(), f"chunk_{uuid.uuid4().hex}.webm")
            chunk_offset = state.chunk_index * (CHUNK_DURATION - OVERLAP)
            state.chunk_index += 1

            try:
                chunk_data = state.webm_header + data if state.chunk_index > 1 else data
                with open(tmp_path, "wb") as f:
                    f.write(chunk_data)

                try:
                    transcript_segs = transcriber.transcribe(tmp_path)
                    diarization_segs = diarizer.diarize(tmp_path)
                except Exception as exc:
                    logger.warning("Erreur traitement chunk %d: %s", state.chunk_index, exc)
                    transcript_segs = []
                    diarization_segs = []

                tracked = state.tracker.resolve(
                    diarization_segs,
                    transcript_segs,
                    chunk_duration=CHUNK_DURATION,
                    chunk_offset=chunk_offset,
                )

                payload = merge_same_speaker(sorted(
                    [
                        {
                            "start": seg.start,
                            "end": seg.end,
                            "speaker": seg.speaker_label,
                            "text": seg.text,
                        }
                        for seg in tracked
                        if seg.text and not state.deduplicator.should_skip(seg.text, seg.start, seg.end)
                    ],
                    key=lambda s: s["start"],
                ))

                if payload:
                    append_segments(group, payload)

                await ws.send_json({"segments": payload})

            finally:
                try:
                    os.unlink(tmp_path)
                except FileNotFoundError:
                    pass

    except WebSocketDisconnect:
        logger.info("Groupe '%s' déconnecté (chunk_index=%d)", group, state.chunk_index)
    finally:
        ping_task.cancel()
