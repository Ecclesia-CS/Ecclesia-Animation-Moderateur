import logging
import os
import tempfile
from dataclasses import dataclass
from typing import List

import av
from pyannote.audio import Pipeline

logger = logging.getLogger(__name__)


@dataclass
class DiarizationSegment:
    start: float
    end: float
    speaker: str  # ex: "SPEAKER_00"


class Diarizer:
    def __init__(self, hf_token: str | None):
        if not hf_token:
            logger.error(
                "HF_TOKEN absent — le modèle pyannote ne peut pas être chargé. "
                "Définir HF_TOKEN dans le fichier .env."
            )
            self._pipeline = None
            return
        try:
            self._pipeline = Pipeline.from_pretrained(
                "pyannote/speaker-diarization-3.1",
                use_auth_token=hf_token,
            )
        except Exception as exc:
            logger.error("Impossible de charger le modèle de diarisation : %s", exc)
            self._pipeline = None

    @staticmethod
    def _to_wav(audio_path: str) -> str:
        """Convertit n'importe quel format audio en WAV 16 kHz mono (requis par pyannote)."""
        wav_fd, wav_path = tempfile.mkstemp(suffix='.wav')
        os.close(wav_fd)
        with av.open(audio_path) as src:
            with av.open(wav_path, 'w', format='wav') as dst:
                out_stream = dst.add_stream('pcm_s16le', rate=16000, layout='mono')
                for frame in src.decode(audio=0):
                    frame.pts = None
                    for packet in out_stream.encode(frame):
                        dst.mux(packet)
                for packet in out_stream.encode(None):
                    dst.mux(packet)
        return wav_path

    def diarize(self, audio_path: str) -> List[DiarizationSegment]:
        if self._pipeline is None:
            return []
        wav_path = None
        try:
            wav_path = self._to_wav(audio_path)
            diarization = self._pipeline(wav_path)
            return [
                DiarizationSegment(start=turn.start, end=turn.end, speaker=speaker)
                for turn, _, speaker in diarization.itertracks(yield_label=True)
            ]
        except Exception as exc:
            logger.warning("Diarisation échouée : %s", exc)
            return []
        finally:
            if wav_path:
                try:
                    os.unlink(wav_path)
                except FileNotFoundError:
                    pass
