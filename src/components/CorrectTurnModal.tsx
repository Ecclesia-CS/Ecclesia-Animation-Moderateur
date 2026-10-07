import { useState } from 'react'
import { useTable, type CorrectTurnParams } from '../context/TableContext'
import { toDateTimeLocal, fromDateTimeLocal, formatDuration } from '../lib/utils'
import type { SpeakingTurn } from '../lib/types'
import EnTeteFenetre from './EnTeteFenetre'

interface Props {
  onClose(): void
}

// Origine du tour, en clair (la base stocke long / interactive / manual).
const SOURCE: Record<string, string> = {
  long:        'Autre sujet',
  interactive: 'Sujet actuel',
  manual:      'Manuel',
}

export default function CorrectTurnModal({ onClose }: Props) {
  const { speakingTurns, participants, correctTurn } = useTable()
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
    <div className="fixed inset-0 bg-bleu-fonce/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden rounded-[12px] shadow-2xl ring-1 ring-white/10 animate-entree">
        {/* Header */}
        <EnTeteFenetre titre={editing ? 'Modifier le tour de parole' : 'Historique des tours'} onClose={onClose} />

        {/* List view */}
        {!editing && (
          <div className="overflow-y-auto flex-1">
            {sorted.length === 0 && (
              <p className="px-5 py-4 text-sm text-gray-500">Aucun tour de parole enregistré.</p>
            )}
            {sorted.map(t => (
              <div
                key={t.id}
                className="flex items-center justify-between px-5 py-3 border-b border-bleu-fonce/[0.06] last:border-0 text-sm"
              >
                <div className="min-w-0">
                  <span className="font-medium text-gray-900">
                    {getP(t.participant_id)?.pseudo ?? '-'}
                  </span>
                  <span className="ml-2 text-gray-500 text-xs">
                    {new Date(t.started_at).toLocaleTimeString()}
                    {t.ended_at
                      ? ` à ${new Date(t.ended_at).toLocaleTimeString()}`
                      : <span className="ml-1 rounded-[6px] bg-indigo-50 px-1.5 py-0.5 text-xs font-semibold text-bleu-fonce">en cours</span>
                    }
                  </span>
                  <span className="ml-2 text-xs text-gray-500">{SOURCE[t.source] ?? t.source}</span>
                  {t.ended_at ? (
                    <span className="ml-2 rounded-[6px] bg-indigo-50 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-bleu-fonce">
                      {formatDuration(new Date(t.ended_at).getTime() - new Date(t.started_at).getTime())}
                    </span>
                  ) : null}
                </div>
                <button
                  onClick={() => openEdit(t)}
                  className="ml-3 shrink-0 rounded-[8px] text-xs font-semibold px-3 py-2 border border-bleu-fonce/15
                    text-bleu-fonce hover:border-bleu-fonce/35 hover:bg-indigo-50/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
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
              <label className="block text-xs font-semibold text-anthracite/80 mb-1.5">Début</label>
              <input
                type="datetime-local"
                value={startedAt}
                onChange={e => setStartedAt(e.target.value)}
                className="w-full rounded-[8px] text-sm border border-bleu-fonce/20 px-3 py-2.5
                  focus:outline-none focus:ring-2 focus:border-bleu-fonce focus:ring-bleu-clair/40"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-anthracite/80 mb-1.5">
                Fin <span className="text-gray-500 font-normal">(laisser vide = tour encore ouvert)</span>
              </label>
              <input
                type="datetime-local"
                value={endedAt}
                onChange={e => setEndedAt(e.target.value)}
                className="w-full rounded-[8px] text-sm border border-bleu-fonce/20 px-3 py-2.5
                  focus:outline-none focus:ring-2 focus:border-bleu-fonce focus:ring-bleu-clair/40"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-anthracite/80 mb-1.5">Participant</label>
              <select
                value={participantId}
                onChange={e => setParticipantId(e.target.value)}
                className="w-full rounded-[8px] text-sm border border-bleu-fonce/20 px-3 py-2.5
                  focus:outline-none focus:ring-2 focus:border-bleu-fonce focus:ring-bleu-clair/40"
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
                className="flex-1 rounded-[8px] py-2.5 text-sm font-semibold border border-bleu-fonce/20
                  text-bleu-fonce hover:border-bleu-fonce/40 hover:bg-bleu-fonce/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
              >
                Retour
              </button>
              <button
                onClick={save}
                disabled={loading}
                className="flex-1 rounded-[8px] py-2.5 text-sm font-semibold bg-indigo-600 text-white
                  disabled:opacity-50 hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2"
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
