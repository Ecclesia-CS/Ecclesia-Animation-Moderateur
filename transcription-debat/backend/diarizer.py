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
    def __init__(self, hf_token: str):
        self._pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=hf_token,
        )

    def diarize(self, audio_path: str) -> List[DiarizationSegment]:
        try:
            diarization = self._pipeline(audio_path)
            return [
                DiarizationSegment(start=turn.start, end=turn.end, speaker=speaker)
                for turn, _, speaker in diarization.itertracks(yield_label=True)
            ]
        except Exception as exc:
            logger.warning("Diarisation échouée : %s", exc)
            return []
