import os
import uuid
import tempfile
import logging
import datetime
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

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware

from transcriber import Transcriber
from diarizer import Diarizer
from speaker_tracker import SpeakerTracker

load_dotenv()
HF_TOKEN = os.getenv("HF_TOKEN")
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "./transcripts"))

# Fenêtre de déduplication : si le même texte (normalisé) a déjà été émis dans
# les DEDUP_WINDOW dernières secondes (temps global), le segment est ignoré.
DEDUP_WINDOW = 30.0


class SegmentDeduplicator:
    """Filtre les segments dupliqués ou dans le passé avant écriture."""

    def __init__(self):
        # liste de (texte_normalisé, global_start) pour la déduplication textuelle
        self._recent: list[tuple[str, float]] = []
        # plus grand global_end écrit jusqu'ici (monotonicity guard)
        self._cursor: float = 0.0

    def should_skip(self, text: str, global_start: float, global_end: float) -> bool:
        """Retourne True si le segment doit être ignoré (doublon ou dans le passé)."""
        # Segment trop en retard : son start est avant la fin du dernier segment écrit,
        # au-delà de la marge d'overlap légitimement chevauchante.
        if global_start < self._cursor - OVERLAP:
            return True

        # Déduplication textuelle dans la fenêtre glissante
        cutoff = global_start - DEDUP_WINDOW
        self._recent = [(t, s) for t, s in self._recent if s > cutoff]
        normalized = text.strip().lower()
        if any(t == normalized for t, _ in self._recent):
            return True

        # Segment accepté — mettre à jour l'état
        self._recent.append((normalized, global_start))
        self._cursor = max(self._cursor, global_end)
        return False

logger = logging.getLogger(__name__)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialisation une seule fois au démarrage (téléchargement des modèles)
transcriber = Transcriber()
diarizer = Diarizer(HF_TOKEN)

CHUNK_DURATION = 12.0
OVERLAP = 1.0


def get_transcript_path(group: str) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    date_str = datetime.date.today().isoformat()
    return OUTPUT_DIR / f"{group}_{date_str}.txt"


def append_segments(group: str, segments: list) -> None:
    path = get_transcript_path(group)
    with open(path, "a", encoding="utf-8") as f:
        for seg in segments:
            h = int(seg["start"] // 3600)
            m = int((seg["start"] % 3600) // 60)
            s = int(seg["start"] % 60)
            timestamp = f"[{h:02d}:{m:02d}:{s:02d}]"
            f.write(f"{timestamp} {seg['speaker']}: {seg['text']}\n")


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, group: str = Query(default="unknown")):
    await ws.accept()
    tracker = SpeakerTracker()
    deduplicator = SegmentDeduplicator()
    chunk_index = 0
    # Premier chunk = headers WebM. On le conserve pour le préfixer aux suivants.
    webm_header: bytes | None = None

    try:
        while True:
            data = await ws.receive_bytes()

            # Ignorer les chunks trop petits avant toute écriture
            if len(data) < 1024:
                continue

            # Sauvegarder le premier chunk (contient les headers WebM)
            if webm_header is None:
                webm_header = data

            tmp_path = os.path.join(tempfile.gettempdir(), f"chunk_{uuid.uuid4().hex}.webm")
            chunk_offset = chunk_index * (CHUNK_DURATION - OVERLAP)
            chunk_index += 1

            try:
                # Préfixer avec les headers du premier chunk pour que chaque
                # chunk soit un fichier WebM autonome décodable
                chunk_data = webm_header + data if chunk_index > 1 else data
                with open(tmp_path, "wb") as f:
                    f.write(chunk_data)

                try:
                    transcript_segs = transcriber.transcribe(tmp_path)
                    diarization_segs = diarizer.diarize(tmp_path)
                except Exception as exc:
                    logger.warning("Erreur traitement chunk %d: %s", chunk_index, exc)
                    transcript_segs = []
                    diarization_segs = []

                tracked = tracker.resolve(
                    diarization_segs,
                    transcript_segs,
                    chunk_duration=CHUNK_DURATION,
                    chunk_offset=chunk_offset,
                )

                payload = sorted(
                    [
                        {
                            "start": seg.start,
                            "end": seg.end,
                            "speaker": seg.speaker_label,
                            "text": seg.text,
                        }
                        for seg in tracked
                        if seg.text and not deduplicator.should_skip(seg.text, seg.start, seg.end)
                    ],
                    key=lambda s: s["start"],
                )

                if payload:
                    append_segments(group, payload)

                await ws.send_json({"segments": payload})

            finally:
                try:
                    os.unlink(tmp_path)
                except FileNotFoundError:
                    pass

    except WebSocketDisconnect:
        pass
