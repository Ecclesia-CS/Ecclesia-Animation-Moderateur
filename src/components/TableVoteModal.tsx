import { useEffect, useRef, useState } from 'react'
import { extractErr } from '../lib/utils'
import {
  getTableVoteWithOptions,
  getTableVoteResults,
  getMyTableVoteAnswers,
  submitTableVoteResponse,
} from '../lib/tableVote'
import type { TableVote, TableVoteOption, TableVoteResult } from '../lib/types'
import FondQuadrille from './FondQuadrille'

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
      className="fixed inset-0 bg-bleu-fonce/60 flex items-end sm:items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col overflow-hidden rounded-[12px] ring-1 ring-white/10 animate-entree"
        onClick={e => e.stopPropagation()}
      >
        <div className="relative flex items-start justify-between overflow-hidden bg-bleu-fonce px-6 pt-5 pb-4 flex-shrink-0">
          <FondQuadrille cases={2} />
          <div className="relative">
            <h2 className="font-sans text-xl font-bold tracking-[-0.01em] text-creme">🗳️ Vote du modérateur</h2>
            <p className="text-sm text-creme/75 mt-0.5">
              {isClosed ? 'Vote clôturé : résultats' : 'Dis si tu es pour ou contre chaque option.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="relative ml-4 flex-shrink-0 text-creme/70 hover:text-creme transition-colors
              focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair -m-1.5 p-2"
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
            <p className="text-sm text-gray-500 text-center py-6">Chargement…</p>
          ) : !vote ? (
            <p className="text-sm text-gray-500 text-center py-6">Ce vote n'existe plus.</p>
          ) : (
            <>
              <p className="font-sans text-lg font-bold tracking-[-0.01em] text-anthracite leading-snug">{vote.question}</p>

              {err && (
                <p className="rounded-[8px] text-sm text-red-700 bg-red-50 px-4 py-2.5 border border-red-200">
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
                      <div key={opt.id} className="rounded-[12px] border border-bleu-fonce/15 px-4 py-3">
                        <p className="text-sm font-medium text-anthracite mb-2">{opt.label}</p>
                        {isClosed ? (
                          <p className="text-xs text-gray-500 tabular-nums">
                            <span className="text-emerald-700 font-semibold">{result?.yes_count ?? 0} pour</span>
                            {' · '}
                            <span className="text-red-600 font-semibold">{result?.no_count ?? 0} contre</span>
                            {' · '}
                            {result?.total_count ?? 0} réponse{(result?.total_count ?? 0) !== 1 ? 's' : ''}
                          </p>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAnswer(opt.id, true)}
                              disabled={pendingId === opt.id}
                              className={`flex-1 rounded-[8px] py-2.5 border text-sm font-semibold transition-colors
                                disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                                myAnswers[opt.id] === true
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'bg-white border-bleu-fonce/15 text-gray-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800'
                              }`}
                            >
                              👍 Pour
                            </button>
                            <button
                              onClick={() => handleAnswer(opt.id, false)}
                              disabled={pendingId === opt.id}
                              className={`flex-1 rounded-[8px] py-2.5 border text-sm font-semibold transition-colors
                                disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 ${
                                myAnswers[opt.id] === false
                                  ? 'bg-red-600 border-red-600 text-white'
                                  : 'bg-white border-bleu-fonce/15 text-gray-700 hover:border-red-300 hover:bg-red-50 hover:text-red-800'
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
