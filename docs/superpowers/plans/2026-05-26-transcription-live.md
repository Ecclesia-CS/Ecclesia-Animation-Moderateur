# Transcription Live Débat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Application web permettant la transcription en temps réel d'un débat depuis un micro unique, avec détection automatique des locuteurs et export `.txt`.

**Architecture:** Frontend React (Vite) capture l'audio en chunks de 12s et les envoie via WebSocket à un backend Python FastAPI. Le backend transcrit chaque chunk avec faster-whisper, diarise avec pyannote.audio, maintient des IDs locuteurs cohérents entre chunks via une logique de chevauchement (1s overlap), et renvoie les segments annotés en JSON.

**Tech Stack:** Python 3.10+, FastAPI, faster-whisper, pyannote.audio, React 18, Vite, TypeScript, Tailwind CSS v3

---

## Prérequis (à faire manuellement AVANT de commencer)

1. Créer un token HuggingFace gratuit sur https://huggingface.co/settings/tokens
2. Accepter la licence du modèle pyannote sur https://huggingface.co/pyannote/speaker-diarization-3.1 (bouton "Agree and access repository")
3. Accepter la licence du modèle pyannote/embedding sur https://huggingface.co/pyannote/embedding
4. Avoir Python 3.10+ et Node 18+ installés
5. Avoir ffmpeg installé (requis par pyannote) : `winget install ffmpeg` ou https://ffmpeg.org/download.html

---

## Structure des fichiers

```
C:\Users\maxre\Desktop\transcription-debat\
├── backend/
│   ├── main.py              # Serveur FastAPI, endpoint WebSocket /ws
│   ├── transcriber.py       # Wrapper faster-whisper
│   ├── diarizer.py          # Wrapper pyannote.audio
│   ├── speaker_tracker.py   # Mapping cohérent des IDs locuteurs entre chunks
│   ├── requirements.txt
│   ├── .env                 # HF_TOKEN=... (non commité)
│   └── tests/
│       ├── test_transcriber.py
│       └── test_speaker_tracker.py
└── frontend/
    ├── src/
    │   ├── App.tsx
    │   ├── types.ts
    │   ├── hooks/
    │   │   └── useWebSocket.ts
    │   └── components/
    │       ├── AudioCapture.tsx
    │       ├── TranscriptView.tsx
    │       └── ExportButton.tsx
    ├── index.html
    ├── package.json
    ├── vite.config.ts
    └── tailwind.config.js
```

---

## Task 1 : Scaffolding backend

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/.env`
- Create: `backend/.gitignore`

- [ ] **Step 1 : Créer le répertoire projet**

```bash
mkdir C:\Users\maxre\Desktop\transcription-debat
mkdir C:\Users\maxre\Desktop\transcription-debat\backend
mkdir C:\Users\maxre\Desktop\transcription-debat\backend\tests
cd C:\Users\maxre\Desktop\transcription-debat
git init
```

- [ ] **Step 2 : Créer `backend/requirements.txt`**

```
fastapi==0.111.0
uvicorn[standard]==0.29.0
faster-whisper==1.0.3
pyannote.audio==3.3.2
python-dotenv==1.0.1
soundfile==0.12.1
numpy==1.26.4
websockets==12.0
```

- [ ] **Step 3 : Créer `backend/.env`**

```
HF_TOKEN=<coller_votre_token_huggingface_ici>
```

- [ ] **Step 4 : Créer `backend/.gitignore`**

```
.env
__pycache__/
*.pyc
*.egg-info/
.venv/
/tmp/
```

- [ ] **Step 5 : Créer le virtualenv et installer les dépendances**

```bash
cd C:\Users\maxre\Desktop\transcription-debat\backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Attendu : installation sans erreur. Si pyannote.audio échoue, vérifier que ffmpeg est dans le PATH.

- [ ] **Step 6 : Créer `backend/tests/__init__.py` vide**

```bash
type nul > tests\__init__.py
```

- [ ] **Step 7 : Commit**

```bash
cd C:\Users\maxre\Desktop\transcription-debat
git add backend/requirements.txt backend/.gitignore backend/tests/__init__.py
git commit -m "chore: backend scaffolding"
```

---

## Task 2 : `transcriber.py`

**Files:**
- Create: `backend/transcriber.py`
- Create: `backend/tests/test_transcriber.py`

- [ ] **Step 1 : Écrire le test**

`backend/tests/test_transcriber.py` :

```python
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
```

- [ ] **Step 2 : Vérifier que le test échoue**

```bash
cd C:\Users\maxre\Desktop\transcription-debat\backend
.venv\Scripts\activate
pytest tests/test_transcriber.py -v
```

Attendu : `ModuleNotFoundError: No module named 'transcriber'`

- [ ] **Step 3 : Implémenter `backend/transcriber.py`**

```python
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

    def transcribe(self, audio_path: str) -> List[TranscriptSegment]:
        segments, _ = self._model.transcribe(
            audio_path,
            language="fr",
            beam_size=5,
            vad_filter=True,
        )
        return [
            TranscriptSegment(start=s.start, end=s.end, text=s.text.strip())
            for s in segments
            if s.text.strip()
        ]
```

- [ ] **Step 4 : Vérifier que le test passe**

```bash
pytest tests/test_transcriber.py -v
```

Attendu : `2 passed`. Note : le premier lancement télécharge le modèle Whisper (~1.5 GB), prévoir quelques minutes.

- [ ] **Step 5 : Commit**

```bash
cd C:\Users\maxre\Desktop\transcription-debat
git add backend/transcriber.py backend/tests/test_transcriber.py
git commit -m "feat: transcriber wrapper (faster-whisper medium, fr)"
```

---

## Task 3 : `diarizer.py`

**Files:**
- Create: `backend/diarizer.py`

Pas de test unitaire automatisé pour le diarizer (pyannote nécessite un vrai fichier audio non-silencieux pour produire des segments). Le test sera fait à l'intégration (Task 5).

- [ ] **Step 1 : Implémenter `backend/diarizer.py`**

```python
import os
from dataclasses import dataclass
from typing import List
from pyannote.audio import Pipeline


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
        except Exception:
            return []
```

Note : si pyannote renvoie une erreur (fichier trop court < 2s, silence total), on retourne une liste vide — le transcript sera affiché sans label locuteur (`[?]`).

- [ ] **Step 2 : Tester manuellement le téléchargement du modèle**

```bash
cd C:\Users\maxre\Desktop\transcription-debat\backend
.venv\Scripts\activate
python -c "
from dotenv import load_dotenv; import os; load_dotenv()
from diarizer import Diarizer
d = Diarizer(os.getenv('HF_TOKEN'))
print('Modele pyannote charge OK')
"
```

Attendu : `Modele pyannote charge OK`. Si erreur 401 : le token est invalide ou la licence n'a pas été acceptée sur HuggingFace.

- [ ] **Step 3 : Commit**

```bash
cd C:\Users\maxre\Desktop\transcription-debat
git add backend/diarizer.py
git commit -m "feat: diarizer wrapper (pyannote speaker-diarization-3.1)"
```

---

## Task 4 : `speaker_tracker.py`

**Files:**
- Create: `backend/speaker_tracker.py`
- Create: `backend/tests/test_speaker_tracker.py`

**Principe :** Chaque chunk est traité indépendamment par pyannote, qui assigne des IDs arbitraires (SPEAKER_00, SPEAKER_01…). Pour maintenir des IDs cohérents, on exploite le chevauchement de 1s entre chunks : le(s) locuteur(s) actif(s) dans la dernière seconde du chunk N doivent être les mêmes que dans la première seconde du chunk N+1.

- [ ] **Step 1 : Écrire les tests**

`backend/tests/test_speaker_tracker.py` :

```python
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
    # Chunk 1 : SPEAKER_01 parle dans l'overlap [11-12s]
    d1 = [d(0, 5, "SPEAKER_00"), d(5, 12, "SPEAKER_01")]
    t1 = [t(0, 5, "Bonjour"), t(5, 12, "Au revoir")]
    result1 = tracker.resolve(d1, t1, chunk_duration=12.0, chunk_offset=0.0)
    label_in_overlap = result1[1].speaker_label  # SPEAKER_01 → ex: "Locuteur 2"

    # Chunk 2 : SPEAKER_00 est dans l'overlap [0-1s] → doit mapper sur label_in_overlap
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


import pytest
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
pytest tests/test_speaker_tracker.py -v
```

Attendu : `ModuleNotFoundError: No module named 'speaker_tracker'`

- [ ] **Step 3 : Implémenter `backend/speaker_tracker.py`**

```python
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
from transcriber import TranscriptSegment
from diarizer import DiarizationSegment

OVERLAP_DURATION = 1.0  # secondes de chevauchement entre chunks


@dataclass
class TrackedSegment:
    start: float
    end: float
    speaker_label: str
    text: str


class SpeakerTracker:
    def __init__(self):
        self._next_id = 1
        # label -> durée dans l'overlap de la fin du dernier chunk
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
        """Associe chaque raw speaker ID à un label "Locuteur N" stable."""
        mapping: Dict[str, str] = {}

        # Locuteurs présents dans l'overlap entrant (premières OVERLAP_DURATION secondes)
        overlap_in: Dict[str, float] = {}
        for seg in d_segs:
            start = max(seg.start, 0.0)
            end = min(seg.end, OVERLAP_DURATION)
            if end > start:
                overlap_in[seg.speaker] = overlap_in.get(seg.speaker, 0.0) + (end - start)

        # Trier par durée décroissante pour le matching greedy
        curr_sorted: List[Tuple[str, float]] = sorted(overlap_in.items(), key=lambda x: -x[1])
        prev_sorted: List[Tuple[str, float]] = sorted(self._last_overlap.items(), key=lambda x: -x[1])

        used_labels = set()
        for i, (raw_id, _) in enumerate(curr_sorted):
            if i < len(prev_sorted):
                label = prev_sorted[i][0]
                if label not in used_labels:
                    mapping[raw_id] = label
                    used_labels.add(label)

        # Attribuer de nouveaux labels aux locuteurs non matchés
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
        """Mémorise les locuteurs actifs dans la fin du chunk (zone d'overlap sortant)."""
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
        """Associe chaque segment de transcript au locuteur par chevauchement maximal."""
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
```

- [ ] **Step 4 : Vérifier que les tests passent**

```bash
pytest tests/test_speaker_tracker.py -v
```

Attendu : `4 passed`

- [ ] **Step 5 : Commit**

```bash
cd C:\Users\maxre\Desktop\transcription-debat
git add backend/speaker_tracker.py backend/tests/test_speaker_tracker.py
git commit -m "feat: speaker tracker (overlap-based consistent IDs)"
```

---

## Task 5 : `main.py` — Serveur FastAPI WebSocket

**Files:**
- Create: `backend/main.py`

- [ ] **Step 1 : Implémenter `backend/main.py`**

```python
import os
import uuid
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from transcriber import Transcriber
from diarizer import Diarizer
from speaker_tracker import SpeakerTracker

load_dotenv()
HF_TOKEN = os.getenv("HF_TOKEN")

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


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    tracker = SpeakerTracker()
    chunk_index = 0

    try:
        while True:
            data = await ws.receive_bytes()

            tmp_path = f"/tmp/chunk_{uuid.uuid4().hex}.webm"
            # Sur Windows, utiliser le dossier temp système
            import tempfile
            tmp_path = os.path.join(tempfile.gettempdir(), f"chunk_{uuid.uuid4().hex}.webm")

            try:
                with open(tmp_path, "wb") as f:
                    f.write(data)

                # Chunk trop petit → ignorer silencieusement
                if os.path.getsize(tmp_path) < 1024:
                    continue

                transcript_segs = transcriber.transcribe(tmp_path)
                diarization_segs = diarizer.diarize(tmp_path)

                chunk_offset = chunk_index * (CHUNK_DURATION - OVERLAP)
                tracked = tracker.resolve(
                    diarization_segs,
                    transcript_segs,
                    chunk_duration=CHUNK_DURATION,
                    chunk_offset=chunk_offset,
                )
                chunk_index += 1

                await ws.send_json({
                    "segments": [
                        {
                            "start": seg.start,
                            "end": seg.end,
                            "speaker": seg.speaker_label,
                            "text": seg.text,
                        }
                        for seg in tracked
                        if seg.text
                    ]
                })
            finally:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)

    except WebSocketDisconnect:
        pass
```

- [ ] **Step 2 : Lancer le serveur et vérifier qu'il démarre**

```bash
cd C:\Users\maxre\Desktop\transcription-debat\backend
.venv\Scripts\activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Attendu dans les logs :
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```
Les modèles se chargent au démarrage (30-60s la première fois). Ctrl+C pour arrêter.

- [ ] **Step 3 : Commit**

```bash
cd C:\Users\maxre\Desktop\transcription-debat
git add backend/main.py
git commit -m "feat: FastAPI WebSocket endpoint — orchestrates transcriber + diarizer + tracker"
```

---

## Task 6 : Scaffolding frontend

**Files:**
- Create: `frontend/` (projet Vite)
- Create: `frontend/src/types.ts`

- [ ] **Step 1 : Créer le projet Vite**

```bash
cd C:\Users\maxre\Desktop\transcription-debat
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

- [ ] **Step 2 : Configurer Tailwind**

Remplacer `frontend/tailwind.config.js` :

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

Remplacer `frontend/src/index.css` :

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 3 : Créer `frontend/src/types.ts`**

```typescript
export interface Segment {
  start: number
  end: number
  speaker: string
  text: string
}

export interface TranscriptLine {
  timestamp: string
  speaker: string
  text: string
}
```

- [ ] **Step 4 : Vérifier que le dev server démarre**

```bash
cd C:\Users\maxre\Desktop\transcription-debat\frontend
npm run dev
```

Attendu : `VITE ready in ... ms  ➜  Local: http://localhost:5173/`. Ouvrir dans le navigateur — page Vite par défaut.

- [ ] **Step 5 : Commit**

```bash
cd C:\Users\maxre\Desktop\transcription-debat
git add frontend/
git commit -m "chore: frontend scaffolding (Vite + React + TypeScript + Tailwind)"
```

---

## Task 7 : `useWebSocket.ts`

**Files:**
- Create: `frontend/src/hooks/useWebSocket.ts`

- [ ] **Step 1 : Créer `frontend/src/hooks/useWebSocket.ts`**

```typescript
import { useCallback, useEffect, useRef, useState } from 'react'
import { Segment } from '../types'

const WS_URL = 'ws://localhost:8000/ws'
const MAX_RETRIES = 3

export function useWebSocket(onSegments: (segments: Segment[]) => void) {
  const wsRef = useRef<WebSocket | null>(null)
  const retriesRef = useRef(0)
  const onSegmentsRef = useRef(onSegments)
  const [connected, setConnected] = useState(false)

  // Garder la ref à jour sans recréer connect()
  useEffect(() => {
    onSegmentsRef.current = onSegments
  }, [onSegments])

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      retriesRef.current = 0
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string)
        if (Array.isArray(data.segments)) {
          onSegmentsRef.current(data.segments)
        }
      } catch {
        // message malformé, ignoré
      }
    }

    ws.onclose = () => {
      setConnected(false)
      if (retriesRef.current < MAX_RETRIES) {
        retriesRef.current++
        setTimeout(connect, 1000 * retriesRef.current)
      }
    }

    ws.onerror = () => ws.close()
  }, [])

  useEffect(() => {
    connect()
    return () => {
      retriesRef.current = MAX_RETRIES // empêche le retry au démontage
      wsRef.current?.close()
    }
  }, [connect])

  const send = useCallback((data: Blob) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data)
    }
  }, [])

  return { send, connected }
}
```

- [ ] **Step 2 : Vérifier la compilation TypeScript**

```bash
cd C:\Users\maxre\Desktop\transcription-debat\frontend
npx tsc --noEmit
```

Attendu : aucune erreur.

- [ ] **Step 3 : Commit**

```bash
cd C:\Users\maxre\Desktop\transcription-debat
git add frontend/src/hooks/useWebSocket.ts
git commit -m "feat: useWebSocket hook (retry x3, message parsing)"
```

---

## Task 8 : `AudioCapture.tsx`

**Files:**
- Create: `frontend/src/components/AudioCapture.tsx`

**Principe du chevauchement :** on démarre un nouveau `MediaRecorder` toutes les 11s (= 12s - 1s overlap). Chaque recorder enregistre pendant 12s. La dernière seconde du chunk N est donc ré-enregistrée en début du chunk N+1.

- [ ] **Step 1 : Créer `frontend/src/components/AudioCapture.tsx`**

```typescript
import { useEffect, useRef } from 'react'

const CHUNK_MS = 12_000
const INTERVAL_MS = 11_000  // démarre un nouveau recorder toutes les 11s

interface Props {
  isRecording: boolean
  onChunk: (blob: Blob) => void
  onError: (message: string) => void
}

export function AudioCapture({ isRecording, onChunk, onError }: Props) {
  const streamRef = useRef<MediaStream | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    if (!isRecording) {
      intervalRef.current && clearInterval(intervalRef.current)
      timeoutsRef.current.forEach(clearTimeout)
      timeoutsRef.current = []
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      return
    }

    navigator.mediaDevices
      .getUserMedia({ audio: true, video: false })
      .then((stream) => {
        streamRef.current = stream

        const startRecorder = () => {
          const recorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm;codecs=opus',
          })
          const chunks: Blob[] = []

          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data)
          }

          recorder.onstop = () => {
            if (chunks.length > 0) {
              onChunk(new Blob(chunks, { type: 'audio/webm;codecs=opus' }))
            }
          }

          recorder.start()

          const t = setTimeout(() => {
            if (recorder.state === 'recording') recorder.stop()
          }, CHUNK_MS)
          timeoutsRef.current.push(t)
        }

        startRecorder()
        intervalRef.current = setInterval(startRecorder, INTERVAL_MS)
      })
      .catch(() => {
        onError('Impossible d\'accéder au microphone. Vérifiez les permissions.')
      })

    return () => {
      intervalRef.current && clearInterval(intervalRef.current)
      timeoutsRef.current.forEach(clearTimeout)
      timeoutsRef.current = []
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [isRecording, onChunk, onError])

  return null
}
```

- [ ] **Step 2 : Vérifier la compilation**

```bash
npx tsc --noEmit
```

Attendu : aucune erreur.

- [ ] **Step 3 : Commit**

```bash
cd C:\Users\maxre\Desktop\transcription-debat
git add frontend/src/components/AudioCapture.tsx
git commit -m "feat: AudioCapture component (12s chunks, 1s overlap)"
```

---

## Task 9 : `TranscriptView.tsx` et `ExportButton.tsx`

**Files:**
- Create: `frontend/src/components/TranscriptView.tsx`
- Create: `frontend/src/components/ExportButton.tsx`

- [ ] **Step 1 : Créer `frontend/src/components/TranscriptView.tsx`**

```typescript
import { useEffect, useRef } from 'react'
import { TranscriptLine } from '../types'

interface Props {
  lines: TranscriptLine[]
}

export function TranscriptView({ lines }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines.length])

  if (lines.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        La transcription apparaîtra ici une fois l'enregistrement démarré…
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-1 font-mono text-sm bg-white">
      {lines.map((line, i) => (
        <div key={i} className="flex gap-2 leading-relaxed">
          <span className="text-gray-400 shrink-0 select-none">{line.timestamp}</span>
          <span className="text-indigo-600 font-semibold shrink-0">{line.speaker} :</span>
          <span className="text-gray-800">{line.text}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
```

- [ ] **Step 2 : Créer `frontend/src/components/ExportButton.tsx`**

```typescript
import { TranscriptLine } from '../types'

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}min` : `${m}min`
}

interface Props {
  lines: TranscriptLine[]
  disabled: boolean
  speakerCount: number
  totalDurationSeconds: number
}

export function ExportButton({ lines, disabled, speakerCount, totalDurationSeconds }: Props) {
  const handleExport = () => {
    const now = new Date()
    const dateStr = now.toLocaleDateString('fr-FR')
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

    const header = [
      `Transcription — ${dateStr} ${timeStr}`,
      `Durée totale : ${formatDuration(totalDurationSeconds)}`,
      `Locuteurs détectés : ${speakerCount}`,
      '─'.repeat(50),
      '',
    ].join('\n')

    const body = lines.map((l) => `${l.timestamp} ${l.speaker} : ${l.text}`).join('\n')

    const content = '﻿' + header + body  // BOM pour Excel
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transcription_${now.toISOString().slice(0, 10)}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <button
      onClick={handleExport}
      disabled={disabled}
      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
    >
      Exporter .txt
    </button>
  )
}
```

- [ ] **Step 3 : Vérifier la compilation**

```bash
npx tsc --noEmit
```

Attendu : aucune erreur.

- [ ] **Step 4 : Commit**

```bash
cd C:\Users\maxre\Desktop\transcription-debat
git add frontend/src/components/TranscriptView.tsx frontend/src/components/ExportButton.tsx
git commit -m "feat: TranscriptView + ExportButton components"
```

---

## Task 10 : `App.tsx` — assemblage final

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/index.html`

- [ ] **Step 1 : Remplacer `frontend/src/App.tsx`**

```typescript
import { useCallback, useState } from 'react'
import { AudioCapture } from './components/AudioCapture'
import { TranscriptView } from './components/TranscriptView'
import { ExportButton } from './components/ExportButton'
import { useWebSocket } from './hooks/useWebSocket'
import { Segment, TranscriptLine } from './types'

type AppState = 'idle' | 'recording' | 'stopped'

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `[${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}]`
}

export default function App() {
  const [state, setState] = useState<AppState>('idle')
  const [lines, setLines] = useState<TranscriptLine[]>([])
  const [error, setError] = useState<string | null>(null)

  const handleSegments = useCallback((segments: Segment[]) => {
    setLines((prev) => [
      ...prev,
      ...segments.map((seg) => ({
        timestamp: formatTimestamp(seg.start),
        speaker: seg.speaker,
        text: seg.text,
      })),
    ])
  }, [])

  const { send, connected } = useWebSocket(handleSegments)

  const handleChunk = useCallback((blob: Blob) => send(blob), [send])

  const handleError = useCallback((msg: string) => {
    setError(msg)
    setState('idle')
  }, [])

  const speakerCount = new Set(
    lines.map((l) => l.speaker).filter((s) => s !== '[?]')
  ).size

  const totalDurationSeconds =
    lines.length > 0
      ? (() => {
          const ts = lines[lines.length - 1].timestamp
          const [h, m, s] = ts.replace(/[\[\]]/g, '').split(':').map(Number)
          return h * 3600 + m * 60 + s
        })()
      : 0

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Transcription débat</h1>
          {state === 'recording' && (
            <p className="text-xs text-red-500 mt-0.5 flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              Enregistrement en cours…
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium ${connected ? 'text-green-600' : 'text-red-500'}`}>
            {connected ? '● Backend connecté' : '● Backend déconnecté'}
          </span>

          {state === 'idle' && (
            <button
              onClick={() => { setState('recording'); setLines([]); setError(null) }}
              disabled={!connected}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              ● Démarrer
            </button>
          )}

          {state === 'recording' && (
            <button
              onClick={() => setState('stopped')}
              className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-800 transition-colors text-sm font-medium"
            >
              ■ Arrêter
            </button>
          )}

          <ExportButton
            lines={lines}
            disabled={lines.length === 0}
            speakerCount={speakerCount}
            totalDurationSeconds={totalDurationSeconds}
          />
        </div>
      </header>

      {/* Bandeau d'erreur */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 px-6 py-3 text-red-700 text-sm shrink-0">
          {error}
        </div>
      )}

      {/* Composant invisible de capture audio */}
      <AudioCapture
        isRecording={state === 'recording'}
        onChunk={handleChunk}
        onError={handleError}
      />

      {/* Zone de transcription */}
      <TranscriptView lines={lines} />
    </div>
  )
}
```

- [ ] **Step 2 : Mettre à jour `frontend/index.html` (titre)**

Remplacer `<title>Vite + React + TS</title>` par :

```html
<title>Transcription débat</title>
```

- [ ] **Step 3 : Supprimer les fichiers Vite par défaut inutiles**

```bash
cd C:\Users\maxre\Desktop\transcription-debat\frontend
del src\App.css
del public\vite.svg
del src\assets\react.svg
```

- [ ] **Step 4 : Vérifier la compilation TypeScript complète**

```bash
npx tsc --noEmit
```

Attendu : aucune erreur.

- [ ] **Step 5 : Lancer le frontend et vérifier l'UI**

```bash
npm run dev
```

Ouvrir http://localhost:5173 dans Chrome.

Vérifier :
- Le header affiche "● Backend déconnecté" si le backend n'est pas lancé
- Lancer le backend (`uvicorn main:app --port 8000`) → "● Backend connecté" apparaît
- Le bouton "Démarrer" est grisé si backend déconnecté
- Bouton "Démarrer" accessible quand connecté

- [ ] **Step 6 : Test d'intégration complet**

Avec le backend lancé (`uvicorn main:app --port 8000`) :

1. Ouvrir http://localhost:5173 dans Chrome
2. Cliquer "Démarrer" → accepter la permission micro
3. Parler pendant ~30s en alternant avec une autre voix (ou utiliser une vidéo sur un autre appareil)
4. Attendre 12-15s → les premières lignes de transcription apparaissent
5. Continuer ~1 minute
6. Cliquer "Arrêter"
7. Cliquer "Exporter .txt" → vérifier le fichier téléchargé

Attendu dans le .txt :
```
Transcription — 26/05/2026 14:32
Durée totale : 1min
Locuteurs détectés : 2
──────────────────────────────────────────────────
[00:00:08] Locuteur 1 : Bonjour à tous.
[00:00:15] Locuteur 2 : Merci de m'avoir invité.
```

- [ ] **Step 7 : Commit final**

```bash
cd C:\Users\maxre\Desktop\transcription-debat
git add frontend/src/App.tsx frontend/index.html
git commit -m "feat: App assembly — transcription live complete"
```

---

## Notes de déploiement local

**Lancer le backend :**
```bash
cd C:\Users\maxre\Desktop\transcription-debat\backend
.venv\Scripts\activate
uvicorn main:app --host 0.0.0.0 --port 8000
```

**Lancer le frontend :**
```bash
cd C:\Users\maxre\Desktop\transcription-debat\frontend
npm run dev
```

**Navigateur requis :** Chrome ou Edge (Firefox ne supporte pas `audio/webm;codecs=opus` pour `MediaRecorder` dans toutes les versions).

---

## Limites connues

- Latence 15-25s sur CPU (acceptable pour compte-rendu, pas pour sous-titrage live)
- La diarisation peut être imprécise si les locuteurs ont des voix similaires ou si les tours de parole sont très courts (<2s)
- Si un seul locuteur parle en continu sur toute la durée, pyannote peut créer des segments "SPEAKER_00" fragmentés qui seront tous mappés sur "Locuteur 1" — comportement correct
