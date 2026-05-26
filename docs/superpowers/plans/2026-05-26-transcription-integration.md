# Transcription Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Intégrer la capture audio dans la vue modérateur Ecclesia et écrire la transcription sur le disque local de l'admin, un fichier `.txt` par groupe.

**Architecture:** Chaque modérateur clique un bouton dans `ModeratorView` → le navigateur capture l'audio en chunks WebM via `MediaRecorder` → les chunks sont envoyés via WebSocket au backend Python local (exposé via ngrok) → le backend transcrit + écrit dans `transcripts/<joinCode>_<date>.txt`. Un hook `useTranscription` isole toute la logique audio/WebSocket. L'URL ngrok est saisie une fois dans l'UI et stockée en localStorage.

**Tech Stack:** Python/FastAPI (backend existant), faster-whisper + pyannote (existant), React 18 + TypeScript + Tailwind (frontend Ecclesia existant), `MediaRecorder` API (natif navigateur)

---

## Fichiers

| Fichier | Action |
|---|---|
| `transcription-debat/backend/main.py` | Modifier : paramètre `?group`, écriture disque |
| `transcription-debat/backend/.env` | Modifier : ajouter `OUTPUT_DIR` |
| `src/hooks/useTranscription.ts` | Créer |
| `src/screens/ModeratorView.tsx` | Modifier : champ URL + bouton transcription |

---

## Task 1 — Backend : écriture disque par groupe

**Files:**
- Modify: `transcription-debat/backend/main.py`
- Modify: `transcription-debat/backend/.env` (ou créer si absent)

- [ ] **Step 1 : Ajouter `OUTPUT_DIR` dans `.env`**

Dans `transcription-debat/backend/.env`, ajouter la ligne :
```
OUTPUT_DIR=./transcripts
```

- [ ] **Step 2 : Modifier `main.py` — import + helper d'écriture**

Remplacer le début de `main.py` (après les imports existants, avant `app = FastAPI()`) pour ajouter :

```python
import os
import uuid
import tempfile
import logging
import datetime
from pathlib import Path

# ... (patches lightning existants inchangés) ...

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware

from transcriber import Transcriber
from diarizer import Diarizer
from speaker_tracker import SpeakerTracker

load_dotenv()
HF_TOKEN = os.getenv("HF_TOKEN")
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "./transcripts"))

logger = logging.getLogger(__name__)


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
```

- [ ] **Step 3 : Modifier le endpoint WebSocket pour accepter `group`**

Remplacer la signature du endpoint WebSocket :

```python
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, group: str = Query(default="unknown")):
    await ws.accept()
    tracker = SpeakerTracker()
    chunk_index = 0

    try:
        while True:
            data = await ws.receive_bytes()

            if len(data) < 1024:
                continue

            tmp_path = os.path.join(tempfile.gettempdir(), f"chunk_{uuid.uuid4().hex}.webm")
            chunk_offset = chunk_index * (CHUNK_DURATION - OVERLAP)
            chunk_index += 1

            try:
                with open(tmp_path, "wb") as f:
                    f.write(data)

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

                payload = [
                    {
                        "start": seg.start,
                        "end": seg.end,
                        "speaker": seg.speaker_label,
                        "text": seg.text,
                    }
                    for seg in tracked
                    if seg.text
                ]

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
```

- [ ] **Step 4 : Tester manuellement**

```bash
cd transcription-debat/backend
uvicorn main:app --reload --port 8000
```

Ouvrir un client WebSocket (ex: `wscat -c "ws://localhost:8000/ws?group=TEST42"`) et envoyer un fichier audio WebM. Vérifier que `transcripts/TEST42_<date>.txt` est créé et contient des lignes `[HH:MM:SS] Locuteur 1: texte`.

- [ ] **Step 5 : Commit**

```bash
cd transcription-debat/backend
git add main.py .env
git commit -m "feat(backend): écriture transcription sur disque par groupe (?group= param)"
```

---

## Task 2 — Hook `useTranscription`

**Files:**
- Create: `src/hooks/useTranscription.ts`

- [ ] **Step 1 : Créer le fichier**

```typescript
// src/hooks/useTranscription.ts
import { useCallback, useEffect, useRef, useState } from 'react'

const CHUNK_DURATION_MS = 12_000

interface UseTranscriptionReturn {
  isRecording: boolean
  connected: boolean
  start: () => Promise<void>
  stop: () => void
}

export function useTranscription(
  backendUrl: string,
  group: string,
): UseTranscriptionReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [connected, setConnected] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Nettoyer proprement WebSocket + MediaRecorder
  const cleanup = useCallback(() => {
    recorderRef.current?.stop()
    recorderRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    wsRef.current?.close()
    wsRef.current = null
    setIsRecording(false)
    setConnected(false)
  }, [])

  // Fermer proprement quand le composant est démonté
  useEffect(() => cleanup, [cleanup])

  const start = useCallback(async () => {
    if (!backendUrl || !group) return

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      alert("Accès au microphone refusé.")
      return
    }
    streamRef.current = stream

    const wsUrl = `${backendUrl.replace(/^http/, 'ws')}/ws?group=${group}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => {
      setConnected(false)
      setIsRecording(false)
    }
    ws.onerror = () => {
      setConnected(false)
      setIsRecording(false)
    }

    // Attendre que le WebSocket soit ouvert avant de démarrer le recorder
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => { setConnected(true); resolve() }
      ws.onerror = () => reject(new Error('WebSocket connection failed'))
    })

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    const recorder = new MediaRecorder(stream, { mimeType })
    recorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
        ws.send(e.data)
      }
    }

    recorder.start(CHUNK_DURATION_MS)
    setIsRecording(true)
  }, [backendUrl, group])

  const stop = useCallback(() => {
    cleanup()
  }, [cleanup])

  return { isRecording, connected, start, stop }
}
```

- [ ] **Step 2 : Vérifier que TypeScript compile sans erreur**

```bash
npm run build 2>&1 | grep -E "error|Error"
```

Résultat attendu : aucune ligne d'erreur.

- [ ] **Step 3 : Commit**

```bash
git add src/hooks/useTranscription.ts
git commit -m "feat: hook useTranscription (MediaRecorder + WebSocket par groupe)"
```

---

## Task 3 — Intégration dans `ModeratorView`

**Files:**
- Modify: `src/screens/ModeratorView.tsx`

- [ ] **Step 1 : Ajouter les imports et les états en haut du composant**

Après les imports existants de `ModeratorView.tsx`, ajouter :

```typescript
import { useTranscription } from '../hooks/useTranscription'
```

Dans le corps du composant `ModeratorView` (après les états existants), ajouter :

```typescript
// Transcription
const BACKEND_URL_KEY = 'ecclesia_transcription_url'
const [backendUrl, setBackendUrl] = useState<string>(
  () => localStorage.getItem(BACKEND_URL_KEY) ?? ''
)
const [showUrlInput, setShowUrlInput] = useState(false)
const [urlDraft, setUrlDraft] = useState(backendUrl)

const { isRecording, connected, start, stop } = useTranscription(
  backendUrl,
  session.join_code,
)

function saveBackendUrl() {
  const trimmed = urlDraft.trim().replace(/\/$/, '')
  setBackendUrl(trimmed)
  localStorage.setItem(BACKEND_URL_KEY, trimmed)
  setShowUrlInput(false)
}
```

- [ ] **Step 2 : Ajouter le bouton transcription dans le header**

Dans le JSX du header de `ModeratorView`, dans le `<div>` "Right: moderator badge + actions" (ligne ~404), **avant** le bouton "Exporter", insérer :

```tsx
{/* Transcription */}
{showUrlInput ? (
  <div className="flex items-center gap-1">
    <input
      type="text"
      value={urlDraft}
      onChange={(e) => setUrlDraft(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') saveBackendUrl() }}
      placeholder="https://xxxx.ngrok.io"
      className="text-xs px-2 py-1 rounded border border-slate-600 bg-slate-800
        text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1
        focus:ring-indigo-500 w-48"
      autoFocus
    />
    <button
      onClick={saveBackendUrl}
      className="text-xs px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
    >
      OK
    </button>
    <button
      onClick={() => setShowUrlInput(false)}
      className="text-xs px-2 py-1 border border-slate-600 rounded text-slate-400
        hover:bg-slate-700"
    >
      ✕
    </button>
  </div>
) : (
  <div className="flex items-center gap-1.5">
    {backendUrl && (
      <span className={`text-xs font-medium ${connected ? 'text-green-400' : 'text-slate-500'}`}>
        {connected ? '● live' : '○'}
      </span>
    )}
    {isRecording ? (
      <button
        onClick={stop}
        className="text-xs px-3 py-1.5 bg-red-600 border border-red-500 rounded-lg
          text-white hover:bg-red-700 transition-colors focus:outline-none
          focus:ring-2 focus:ring-red-500 flex items-center gap-1.5"
      >
        <span className="inline-block w-2 h-2 bg-white rounded-full animate-pulse" />
        Arrêter
      </button>
    ) : (
      <button
        onClick={() => {
          if (!backendUrl) { setShowUrlInput(true); setUrlDraft(''); return }
          start()
        }}
        disabled={isRecording}
        className="text-xs px-3 py-1.5 border border-slate-600 rounded-lg
          text-slate-300 hover:bg-slate-700 transition-colors focus:outline-none
          focus:ring-2 focus:ring-slate-500 flex items-center gap-1.5"
      >
        🎙 Transcription
      </button>
    )}
    {backendUrl && (
      <button
        onClick={() => { setUrlDraft(backendUrl); setShowUrlInput(true) }}
        title="Changer l'URL du backend"
        className="text-slate-500 hover:text-slate-300 text-xs px-1"
      >
        ✎
      </button>
    )}
  </div>
)}
```

- [ ] **Step 3 : Vérifier que TypeScript compile**

```bash
npm run build 2>&1 | grep -E "error|Error"
```

Résultat attendu : aucune ligne d'erreur.

- [ ] **Step 4 : Tester le flux complet manuellement**

1. Lancer le backend : `cd transcription-debat/backend && uvicorn main:app --port 8000`
2. Lancer le frontend dev : `npm run dev`
3. Créer une session Ecclesia (modérateur)
4. Dans le header, cliquer "🎙 Transcription" → saisir `http://localhost:8000` → OK
5. Cliquer "🎙 Transcription" → autoriser le micro → vérifier que le bouton passe en rouge pulsant "Arrêter" et que l'indicateur affiche "● live"
6. Parler quelques secondes, attendre 12s que le premier chunk parte
7. Vérifier que `transcription-debat/backend/transcripts/<joinCode>_<date>.txt` est créé avec des lignes
8. Cliquer "Arrêter" → vérifier que le bouton revient à "🎙 Transcription"

- [ ] **Step 5 : Commit**

```bash
git add src/screens/ModeratorView.tsx
git commit -m "feat: bouton transcription dans ModeratorView (URL ngrok + start/stop)"
```

---

## Task 4 — Push et vérification déploiement

**Files:** aucun fichier modifié — push uniquement

- [ ] **Step 1 : Vérifier le build de production**

```bash
npm run build
```

Résultat attendu : `dist/` généré sans erreur, `✓ built in Xs`.

- [ ] **Step 2 : Push sur `main`**

```bash
git push origin main
```

Le workflow GitHub Actions `.github/workflows/deploy.yml` se déclenche automatiquement.

- [ ] **Step 3 : Vérifier le déploiement**

Attendre ~2 min puis ouvrir https://ecclesia-cs.github.io/Ecclesia-Animation-Moderateur/ et confirmer que le bouton "🎙 Transcription" apparaît dans le header modérateur.
