import os
import numpy as np
import soundfile as sf
import pytest
from transcriber import Transcriber, TranscriptSegment


@pytest.fixture
def silent_wav(tmp_path):
    path = str(tmp_path / "test.wav")
    data = np.zeros(3 * 16000, dtype=np.float32)
    sf.write(path, data, 16000)
    return path


def test_transcribe_returns_list(silent_wav):
    t = Transcriber()
    result = t.transcribe(silent_wav)
    assert isinstance(result, list)


def test_transcribe_segments_have_correct_fields(silent_wav):
    t = Transcriber()
    result = t.transcribe(silent_wav)
    for seg in result:
        assert isinstance(seg, TranscriptSegment)
        assert isinstance(seg.start, float)
        assert isinstance(seg.end, float)
        assert isinstance(seg.text, str)
        assert seg.end >= seg.start
