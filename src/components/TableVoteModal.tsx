import { useEffect, useRef, useState } from 'react'
import { extractErr } from '../lib/utils'
import {
  getTableVoteWithOptions,
  getTableVoteResults,
  getMyTableVoteAnswers,
  submitTableVoteResponse,
} from '../lib/tableVote'
import type { TableVote, TableVoteOption, TableVoteResult } from '../lib/types'

const POLL_MS = 4000

interface Props {
  voteId: string
  onClose: () => void
}

// Popup participant du vote "outil modérateur" (chantier 132) — dismissible (pas
// forcé comme le questionnaire). Tant que le vote est actif : formulaire oui/non
// par option, indépendant, éditable. Une fois clôturé : résultats agrégés
// uniquement (jamais qui a voté quoi), affichés automatiquement au prochain
// polling — pas de nouveau canal Realtime, cf. migration chantier132.
export default function TableVoteModal({ voteId, onClose }: Props) {
  const [vote,        setVote]        = useState<(TableVote & { table_vote_options: TableVoteOption[] }) | null>(null)
  const [myAnswers,   setMyAnswers]   = useState<Record<string, boolean>>({})
  const [results,     setResults]     = useState<TableVoteResult[] | null>(null)
  const [pendingId,   setPendingId]   = useState<string | null>(null)
  const [err,         setErr]         = useState<string | null>(null)
  const [loading,     setLoading]     = useState(true)
  const cancelledRef = useRef(false)

  useEffect(() => {
    cancelledRef.current = false
    let timer: ReturnType<typeof setInterval> | null = null

    async function load() {
      try {
        const v = await getTableVoteWithOptions(voteId)
        if (cancelledRef.current || !v) return
        setVote(v)
        if (v.status === 'closed') {
          const res = await getTableVoteResults(voteId)
          if (!cancelledRef.current) setResults(res)
          if (timer) { clearInterval(timer); timer = null }
        }
      } catch (e) {
        if (!cancelledRef.current) setErr(extractErr(e))
      } finally {
        if (!cancelledRef.current) setLoading(false)
      }
    }

    getMyTableVoteAnswers(voteId)
      .then(m => { if (!cancelledRef.current) setMyAnswers(m) })
      .catch(() => {})
    load()
    timer = setInterval(load, POLL_MS)

    return () => {
      cancelledRef.current = true
      if (timer) clearInterval(timer)
    }
  }, [voteId])

  async function handleAnswer(optionId: string, answer: boolean) {
    setErr(null)
    setPendingId(optionId)
    try {
      await submitTableVoteResponse(optionId, answer)
      setMyAnswers(prev => ({ ...prev, [optionId]: answer }))
    } catch (e) {
      setErr(extractErr(e))
    } finally {
      setPendingId(null)
    }
  }

  const isClosed = vote?.status === 'closed'

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">🗳️ Vote du modérateur</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {isClosed ? 'Vote clôturé — résultats' : 'Dis si tu es pour ou contre chaque option.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors
              focus:outline-none focus:ring-2 focus:ring-gray-300 rounded-lg p-1"
            aria-label="Fermer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {loading && !vote ? (
            <p className="text-sm text-gray-400 text-center py-6">Chargement…</p>
          ) : !vote ? (
            <p className="text-sm text-gray-400 text-center py-6">Ce vote n'existe plus.</p>
          ) : (
            <>
              <p className="text-base font-semibold text-gray-900 leading-snug">{vote.question}</p>

              {err && (
                <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-xl border border-red-200">
                  {err}
                </p>
              )}

              <div className="space-y-2.5">
                {vote.table_vote_options
                  .slice()
                  .sort((a, b) => a.position - b.position)
                  .map(opt => {
                    const result = results?.find(r => r.option_id === opt.id)
                    return (
                      <div key={opt.id} className="rounded-xl border border-gray-200 px-4 py-3">
                        <p className="text-sm font-medium text-gray-800 mb-2">{opt.label}</p>
                        {isClosed ? (
                          <p className="text-xs text-gray-500">
                            <span className="text-emerald-600 font-semibold">{result?.yes_count ?? 0} pour</span>
                            {' · '}
                            <span className="text-red-500 font-semibold">{result?.no_count ?? 0} contre</span>
                            {' · '}
                            {result?.total_count ?? 0} réponse{(result?.total_count ?? 0) !== 1 ? 's' : ''}
                          </p>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAnswer(opt.id, true)}
                              disabled={pendingId === opt.id}
                              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors
                                disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
                                myAnswers[opt.id] === true
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-gray-100 text-gray-600 hover:bg-emerald-100 hover:text-emerald-700'
                              }`}
                            >
                              👍 Pour
                            </button>
                            <button
                              onClick={() => handleAnswer(opt.id, false)}
                              disabled={pendingId === opt.id}
                              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors
                                disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-400 ${
                                myAnswers[opt.id] === false
                                  ? 'bg-red-500 text-white'
                                  : 'bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-700'
                              }`}
                            >
                              👎 Contre
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
