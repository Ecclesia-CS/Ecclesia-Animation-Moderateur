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

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 px-6 py-3 text-red-700 text-sm shrink-0">
          {error}
        </div>
      )}

      {/* Invisible audio capture component */}
      <AudioCapture
        isRecording={state === 'recording'}
        onChunk={handleChunk}
        onError={handleError}
      />

      {/* Transcript area */}
      <TranscriptView lines={lines} />
    </div>
  )
}
