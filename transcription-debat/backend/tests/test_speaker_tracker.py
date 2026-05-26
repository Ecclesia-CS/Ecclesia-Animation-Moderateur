import pytest
from speaker_tracker import SpeakerTracker, TrackedSegment
from transcriber import TranscriptSegment
from diarizer import DiarizationSegment


def d(start, end, speaker):
    return DiarizationSegment(start=start, end=end, speaker=speaker)


def t(start, end, text):
    return TranscriptSegment(start=start, end=end, text=text)


def test_first_chunk_assigns_locuteur_labels():
    tracker = SpeakerTracker()
    d_segs = [d(0, 5, "SPEAKER_00"), d(5, 12, "SPEAKER_01")]
    t_segs = [t(0, 5, "Bonjour"), t(5, 12, "Merci")]
    result = tracker.resolve(d_segs, t_segs, chunk_duration=12.0, chunk_offset=0.0)
    assert len(result) == 2
    assert result[0].speaker_label.startswith("Locuteur")
    assert result[1].speaker_label.startswith("Locuteur")
    assert result[0].speaker_label != result[1].speaker_label


def test_chunk_offset_applied_to_timestamps():
    tracker = SpeakerTracker()
    d_segs = [d(0, 12, "SPEAKER_00")]
    t_segs = [t(2, 5, "Texte")]
    result = tracker.resolve(d_segs, t_segs, chunk_duration=12.0, chunk_offset=11.0)
    assert result[0].start == pytest.approx(13.0)  # 2 + offset 11


def test_consistent_labels_across_chunks():
    tracker = SpeakerTracker()
    # Chunk 1 : SPEAKER_01 talks in overlap [11-12s]
    d1 = [d(0, 5, "SPEAKER_00"), d(5, 12, "SPEAKER_01")]
    t1 = [t(0, 5, "Bonjour"), t(5, 12, "Au revoir")]
    result1 = tracker.resolve(d1, t1, chunk_duration=12.0, chunk_offset=0.0)
    label_in_overlap = result1[1].speaker_label  # SPEAKER_01 → ex: "Locuteur 2"

    # Chunk 2 : SPEAKER_00 is in overlap [0-1s] → should map to label_in_overlap
    d2 = [d(0, 1, "SPEAKER_00"), d(1, 12, "SPEAKER_01")]
    t2 = [t(0, 1, "Suite"), t(1, 12, "Autre chose")]
    result2 = tracker.resolve(d2, t2, chunk_duration=12.0, chunk_offset=11.0)
    assert result2[0].speaker_label == label_in_overlap


def test_unknown_speaker_returns_question_mark():
    tracker = SpeakerTracker()
    d_segs = []
    t_segs = [t(0, 5, "Quelqu'un parle")]
    result = tracker.resolve(d_segs, t_segs, chunk_duration=12.0, chunk_offset=0.0)
    assert result[0].speaker_label == "[?]"
