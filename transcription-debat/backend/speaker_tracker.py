from dataclasses import dataclass
from typing import Dict, List
from transcriber import TranscriptSegment
from diarizer import DiarizationSegment

OVERLAP_DURATION = 1.0  # seconds of overlap between chunks


@dataclass
class TrackedSegment:
    start: float
    end: float
    speaker_label: str
    text: str


class SpeakerTracker:
    def __init__(self):
        self._next_id = 1
        # label -> duration active in the end-overlap of the last chunk
        self._last_overlap: Dict[str, float] = {}

    def resolve(
        self,
        diarization_segments: List[DiarizationSegment],
        transcript_segments: List[TranscriptSegment],
        chunk_duration: float,
        chunk_offset: float,
    ) -> List[TrackedSegment]:
        local_mapping = self._build_mapping(diarization_segments, chunk_duration)
        self._update_overlap(diarization_segments, local_mapping, chunk_duration)
        return self._merge(transcript_segments, diarization_segments, local_mapping, chunk_offset)

    def _build_mapping(
        self, d_segs: List[DiarizationSegment], chunk_duration: float
    ) -> Dict[str, str]:
        mapping: Dict[str, str] = {}

        # Durées dans la zone d'overlap entrant (premières OVERLAP_DURATION secondes)
        overlap_in: Dict[str, float] = {}
        for seg in d_segs:
            start = max(seg.start, 0.0)
            end = min(seg.end, OVERLAP_DURATION)
            if end > start:
                overlap_in[seg.speaker] = overlap_in.get(seg.speaker, 0.0) + (end - start)

        # Matching bijectif greedy par produit de durées (cross-chunk)
        # _last_overlap = {label_stable: durée} dans fin du chunk précédent
        candidates = []
        for raw_id, dur_in in overlap_in.items():
            for label, dur_prev in self._last_overlap.items():
                candidates.append((dur_in * dur_prev, raw_id, label))
        candidates.sort(key=lambda x: -x[0])

        used_raw: set = set()
        used_labels: set = set()
        for _, raw_id, label in candidates:
            if raw_id not in used_raw and label not in used_labels:
                mapping[raw_id] = label
                used_raw.add(raw_id)
                used_labels.add(label)

        # Assigner de nouveaux labels aux speakers non matchés
        for seg in d_segs:
            if seg.speaker not in mapping:
                mapping[seg.speaker] = f"Locuteur {self._next_id}"
                self._next_id += 1

        return mapping

    def _update_overlap(
        self,
        d_segs: List[DiarizationSegment],
        mapping: Dict[str, str],
        chunk_duration: float,
    ) -> None:
        """Remember speakers active in the end-overlap of this chunk (outgoing overlap)."""
        overlap_start = chunk_duration - OVERLAP_DURATION
        self._last_overlap = {}
        for seg in d_segs:
            start = max(seg.start, overlap_start)
            end = seg.end
            if end > start:
                label = mapping.get(seg.speaker, "[?]")
                self._last_overlap[label] = self._last_overlap.get(label, 0.0) + (end - start)

    def _merge(
        self,
        t_segs: List[TranscriptSegment],
        d_segs: List[DiarizationSegment],
        mapping: Dict[str, str],
        chunk_offset: float,
    ) -> List[TrackedSegment]:
        """Assign speaker label to each transcript segment by maximum overlap."""
        # Quand la diarisation n'a rien produit, utiliser le dernier locuteur connu
        # (ou "Locuteur 1" si c'est le tout premier chunk).
        if not d_segs:
            fallback = (
                max(self._last_overlap, key=self._last_overlap.get)
                if self._last_overlap
                else "Locuteur 1"
            )
            return [
                TrackedSegment(
                    start=chunk_offset + t_seg.start,
                    end=chunk_offset + t_seg.end,
                    speaker_label=fallback,
                    text=t_seg.text,
                )
                for t_seg in t_segs
            ]

        results = []
        for t_seg in t_segs:
            best_speaker = "[?]"
            best_overlap = 0.0
            for d_seg in d_segs:
                overlap = min(t_seg.end, d_seg.end) - max(t_seg.start, d_seg.start)
                if overlap > best_overlap:
                    best_overlap = overlap
                    best_speaker = mapping.get(d_seg.speaker, "[?]")
            results.append(TrackedSegment(
                start=chunk_offset + t_seg.start,
                end=chunk_offset + t_seg.end,
                speaker_label=best_speaker,
                text=t_seg.text,
            ))
        return results
