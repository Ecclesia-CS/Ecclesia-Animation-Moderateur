import { useState } from 'react'
import { useSession, type CorrectTurnParams } from '../context/SessionContext'
import { toDateTimeLocal, fromDateTimeLocal, formatDuration } from '../lib/utils'
import type { SpeakingTurn } from '../lib/types'

interface Props {
  onClose(): void
}

export default function CorrectTurnModal({ onClose }: Props) {
  const { speakingTurns, participants, correctTurn } = useSession()
  const [editing, setEditing] = useState<SpeakingTurn | null>(null)
  const [startedAt, setStartedAt] = useState('')
  const [endedAt, setEndedAt] = useState('')
  const [participantId, setParticipantId] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const sorted = [...speakingTurns].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
  )

  const getP = (id: string) => participants.find(p => p.id === id)

  function openEdit(t: SpeakingTurn) {
    setEditing(t)
    setStartedAt(toDateTimeLocal(t.started_at))
    setEndedAt(t.ended_at ? toDateTimeLocal(t.ended_at) : '')
    setParticipantId(t.participant_id)
    setErr(null)
  }

  async function save() {
    if (!editing) return
    setLoading(true)
    setErr(null)
    try {
      const params: CorrectTurnParams = {
        started_at:     fromDateTimeLocal(startedAt),
        participant_id: participantId,
      }
      if (endedAt) params.ended_at = fromDateTimeLocal(endedAt)
      await correctTurn(editing.id, params)
      setEditing(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <h2 className="font-semibold text-gray-900">
            {editing ? 'Modifier le tour de parole' : 'Historique des tours'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        {/* List view */}
        {!editing && (
          <div className="overflow-y-auto flex-1">
            {sorted.length === 0 && (
              <p className="px-5 py-4 text-sm text-gray-400">Aucun tour de parole enregistré.</p>
            )}
            {sorted.map(t => (
              <div
                key={t.id}
                className="flex items-center justify-between px-5 py-3 border-b border-gray-50 last:border-0 text-sm"
              >
                <div className="min-w-0">
                  <span className="font-medium text-gray-900">
                    {getP(t.participant_id)?.pseudo ?? '—'}
                  </span>
                  <span className="ml-2 text-gray-400 text-xs">
                    {new Date(t.started_at).toLocaleTimeString()}
                    {t.ended_at
                      ? ` → ${new Date(t.ended_at).toLocaleTimeString()}`
                      : <span className="ml-1 bg-indigo-50 text-indigo-700 rounded px-1 text-xs"> en cours</span>
                    }
                  </span>
                  <span className="ml-2 text-xs text-gray-300 capitalize">{t.source}</span>
                  {t.ended_at ? (
                    <span className="ml-2 font-mono text-xs text-indigo-600 bg-indigo-50 rounded px-1">
                      {formatDuration(new Date(t.ended_at).getTime() - new Date(t.started_at).getTime())}
                    </span>
                  ) : null}
                </div>
                <button
                  onClick={() => openEdit(t)}
                  className="ml-3 shrink-0 text-xs px-3 py-1 border border-gray-200 rounded-lg
                    text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Corriger
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Edit form */}
        {editing && (
          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Début</label>
              <input
                type="datetime-local"
                value={startedAt}
                onChange={e => setStartedAt(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2
                  focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Fin <span className="text-gray-400 font-normal">(laisser vide = tour encore ouvert)</span>
              </label>
              <input
                type="datetime-local"
                value={endedAt}
                onChange={e => setEndedAt(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2
                  focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Participant</label>
              <select
                value={participantId}
                onChange={e => setParticipantId(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2
                  focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {participants.map(p => (
                  <option key={p.id} value={p.id}>{p.pseudo}</option>
                ))}
              </select>
            </div>

            {err && <p className="text-xs text-red-600">{err}</p>}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setEditing(null)}
                className="flex-1 py-2 text-sm border border-gray-200 rounded-lg
                  text-gray-700 hover:bg-gray-50"
              >
                ← Retour
              </button>
              <button
                onClick={save}
                disabled={loading}
                className="flex-1 py-2 text-sm bg-indigo-600 text-white rounded-lg
                  disabled:opacity-50 hover:bg-indigo-700"
              >
                {loading ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
