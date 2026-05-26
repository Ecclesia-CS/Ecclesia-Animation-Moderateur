import logging
from dataclasses import dataclass
from typing import List
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

    def diarize(self, audio_path: str) -> List[DiarizationSegment]:
        if self._pipeline is None:
            return []
        try:
            diarization = self._pipeline(audio_path)
            return [
                DiarizationSegment(start=turn.start, end=turn.end, speaker=speaker)
                for turn, _, speaker in diarization.itertracks(yield_label=True)
            ]
        except Exception as exc:
            logger.warning("Diarisation échouée : %s", exc)
            return []
