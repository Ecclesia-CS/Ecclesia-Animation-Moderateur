import { useState } from 'react'
import { useTable } from '../context/TableContext'
import { useTranscription } from '../hooks/useTranscription'
import { extractErr } from '../lib/utils'
import QrCodeModal from './QrCodeModal'
import CorrectTurnModal from './CorrectTurnModal'
import TableOpinionModal from './voting/TableOpinionModal'

interface Props {
  className?: string
  onError?: (message: string) => void
}

const BACKEND_URL_KEY = 'ecclesia_transcription_url'

// "Outils Modo" — menu unique regroupant tous les outils réservés au modérateur
// (chantier 27 / H22 : fusion de l'ancien bouton "Outils Modo" — qui ne contenait
// que le QR code, chantier 21/F7 — et du dropdown "Outils Modo" du header —
// transcription, historique, forçage questionnaire. Le bouton "Camps" séparé
// (chantier 20/G7) est intégré ici plutôt que de rester à part).
export default function ModeratorToolsButton({ className = '', onError }: Props) {
  const { table, forceQuestionnaire, cancelForceQuestionnaire } = useTable()
  const [panelOpen, setPanelOpen] = useState(false)
  const [qrOpen,      setQrOpen]      = useState(false)
  const [campsOpen,   setCampsOpen]   = useState(false)
  const [correctOpen, setCorrectOpen] = useState(false)

  const [backendUrl, setBackendUrl] = useState<string>(
    () => localStorage.getItem(BACKEND_URL_KEY) ?? ''
  )
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [urlDraft, setUrlDraft] = useState(backendUrl)

  const { isRecording, connected, start, stop } = useTranscription(backendUrl, table.join_code)

  function saveBackendUrl() {
    const trimmed = urlDraft.trim().replace(/\/$/, '')
    setBackendUrl(trimmed)
    localStorage.setItem(BACKEND_URL_KEY, trimmed)
    setShowUrlInput(false)
  }

  function handleError(e: unknown) {
    onError?.(extractErr(e))
  }

  const linkClass = 'flex items-center gap-3 px-5 py-3 w-full text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors'

  return (
    <>
      <button onClick={() => setPanelOpen(true)} className={className}>
        {isRecording && (
          <span className="inline-block w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse mr-1.5" />
        )}
        Outils Modo
      </button>

      {panelOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50"
          onMouseDown={e => { if (e.target === e.currentTarget) setPanelOpen(false) }}
        >
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xs shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Outils Modo</h2>
              <button
                onClick={() => setPanelOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-gray-300"
                aria-label="Fermer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {table.session_id && (
              <button onClick={() => { setPanelOpen(false); setCampsOpen(true) }} className={linkClass}>
                <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M3 12h18" />
                  <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Camps
              </button>
            )}

            <button onClick={() => { setPanelOpen(false); setQrOpen(true) }} className={linkClass}>
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="3" width="7" height="7" rx="1" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="14" y="3" width="7" height="7" rx="1" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="3" y="14" width="7" height="7" rx="1" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="14" y1="17.5" x2="21" y2="17.5" strokeLinecap="round" />
                <line x1="17.5" y1="14" x2="17.5" y2="21" strokeLinecap="round" />
              </svg>
              QR code de la table
            </button>

            <button onClick={() => { setPanelOpen(false); setCorrectOpen(true) }} className={linkClass}>
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" />
              </svg>
              Historique
            </button>

            <button
              onClick={() => {
                setPanelOpen(false)
                if (table.questionnaire_forced_at) {
                  cancelForceQuestionnaire().catch(handleError)
                } else {
                  forceQuestionnaire().catch(handleError)
                }
              }}
              className={linkClass}
            >
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l4.414 4.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z" />
              </svg>
              {table.questionnaire_forced_at
                ? 'Annuler forçage questionnaire'
                : 'Forcer questionnaire'}
            </button>

            <div className="my-1 border-t border-gray-100" />

            {showUrlInput ? (
              <div className="px-5 py-3 flex items-center gap-1.5">
                <input
                  type="text"
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveBackendUrl() }}
                  placeholder="https://xxxx.ngrok.io"
                  className="text-xs px-2 py-1 rounded border border-gray-300 bg-white
                    text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1
                    focus:ring-indigo-500 flex-1 min-w-0"
                  autoFocus
                />
                <button
                  onClick={saveBackendUrl}
                  className="text-xs px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 shrink-0"
                >
                  OK
                </button>
                <button
                  onClick={() => setShowUrlInput(false)}
                  className="text-xs px-2 py-1 border border-gray-300 rounded text-gray-500
                    hover:bg-gray-50 shrink-0"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  if (!backendUrl) { setShowUrlInput(true); setUrlDraft(''); return }
                  setPanelOpen(false)
                  isRecording ? stop() : start()
                }}
                className={linkClass}
              >
                {backendUrl ? (
                  <span className={`w-2 h-2 rounded-full shrink-0 ${connected ? 'bg-green-500' : 'bg-gray-300'}`} />
                ) : (
                  <span className="text-base leading-none w-4 text-center shrink-0">🎙</span>
                )}
                {isRecording ? 'Arrêter la transcription' : 'Transcription'}
              </button>
            )}
            {backendUrl && !showUrlInput && (
              <button
                onClick={() => { setUrlDraft(backendUrl); setShowUrlInput(true) }}
                className="w-full px-5 pb-3 text-xs text-gray-400 hover:text-gray-600 text-left"
              >
                Modifier l'URL
              </button>
            )}

            <div className="pb-2" />
          </div>
        </div>
      )}

      {qrOpen && (
        <QrCodeModal
          value={`${window.location.origin}${window.location.pathname}#table/${table.join_code}`}
          title={`Rejoindre la table ${table.join_code}`}
          onClose={() => setQrOpen(false)}
        />
      )}

      <TableOpinionModal isOpen={campsOpen} onClose={() => setCampsOpen(false)} />

      {correctOpen && <CorrectTurnModal onClose={() => setCorrectOpen(false)} />}
    </>
  )
}
