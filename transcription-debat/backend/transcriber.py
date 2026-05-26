from dataclasses import dataclass
from typing import List
from faster_whisper import WhisperModel


@dataclass
class TranscriptSegment:
    start: float
    end: float
    text: str


class Transcriber:
    def __init__(self):
        self._model = WhisperModel("medium", device="cpu", compute_type="int8")

    # Seuils de confiance : segments en dessous sont considérés comme des hallucinations.
    _NO_SPEECH_THRESHOLD = 0.6   # probabilité de silence au-dessus de laquelle on rejette
    _LOG_PROB_THRESHOLD = -1.0   # log-prob moyen en dessous duquel on rejette

    def transcribe(self, audio_path: str) -> List[TranscriptSegment]:
        segments, _ = self._model.transcribe(
            audio_path,
            language="fr",
            beam_size=5,
            vad_filter=True,
            # Désactiver le conditionnement sur le texte précédent : chaque chunk
            # est indépendant, laisser Whisper inventer un contexte crée des
            # hallucinations en cascade (chiffres fantaisistes, phrases répétées).
            condition_on_previous_text=False,
        )
        return [
            TranscriptSegment(start=s.start, end=s.end, text=s.text.strip())
            for s in segments
            if s.text.strip()
            and s.no_speech_prob < self._NO_SPEECH_THRESHOLD
            and s.avg_logprob > self._LOG_PROB_THRESHOLD
        ]
