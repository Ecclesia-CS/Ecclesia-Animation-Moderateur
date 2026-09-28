import { useEffect, useRef, useState } from 'react'
import { useTable } from '../context/TableContext'
import { extractErr } from '../lib/utils'
import {
  getTableVoteWithOptions,
  getTableVoteResults,
  listTableVotes,
} from '../lib/tableVote'
import type { TableVote, TableVoteOption, TableVoteResult, TableVoteHistoryEntry } from '../lib/types'

const POLL_MS = 4000

interface Props {
  onClose: () => void
}

// Outil "proposer un vote" côté modérateur (chantier 132). Trois écrans dans une
// même modale : formulaire de création (aucun vote actif/pointé), suivi en direct
// d'un vote en cours (décompte agrégé uniquement, jamais nominatif), et historique.
export default function ModeratorVoteModal({ onClose }: Props) {
  const { table, openTableVote, closeActiveTableVote } = useTable()
  const activeVoteId = table.active_vote_id

  const [vote,    setVote]    = useState<(TableVote & { table_vote_options: TableVoteOption[] }) | null>(null)
  const [results, setResults] = useState<TableVoteResult[]>([])
  const [loading, setLoading] = useState(!!activeVoteId)
  const [err,     setErr]     = useState<string | null>(null)

  const [creating,  setCreating]  = useState(false)
  const [question,  setQuestion]  = useState('')
  const [options,   setOptions]   = useState(['', ''])
  const [closing,   setClosing]   = useState(false)

  const [historyOpen,    setHistoryOpen]    = useState(false)
  const [history,        setHistory]        = useState<TableVoteHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const cancelledRef = useRef(false)

  useEffect(() => {
    cancelledRef.current = false
    if (!activeVoteId) { setVote(null); setLoading(false); return }
    let timer: ReturnType<typeof setInterval> | null = null

    async function load() {
      try {
        const v = await getTableVoteWithOptions(activeVoteId!)
        if (cancelledRef.current) return
        setVote(v)
        const res = await getTableVoteResults(activeVoteId!)
        if (!cancelledRef.current) setResults(res)
        if (v?.status === 'closed' && timer) { clearInterval(timer); timer = null }
      } catch (e) {
        if (!cancelledRef.current) setErr(extractErr(e))
      } finally {
        if (!cancelledRef.current) setLoading(false)
      }
    }

    load()
    timer = setInterval(load, POLL_MS)
    return () => {
      cancelledRef.current = true
      if (timer) clearInterval(timer)
    }
  }, [activeVoteId])

  function loadHistory() {
    setHistoryOpen(true)
    setHistoryLoading(true)
    listTableVotes(table.id)
      .then(setHistory)
      .catch(e => setErr(extractErr(e)))
      .finally(() => setHistoryLoading(false))
  }

  function updateOption(i: number, value: string) {
    setOptions(prev => prev.map((o, idx) => idx === i ? value : o))
  }

  function addOption() {
    setOptions(prev => [...prev, ''])
  }

  function removeOption(i: number) {
    setOptions(prev => prev.filter((_, idx) => idx !== i))
  }

  const validOptions = options.map(o => o.trim()).filter(Boolean)
  const canSubmit = question.trim().length > 0 && validOptions.length >= 2

  async function handleCreate() {
    setErr(null)
    setCreating(true)
    try {
      await openTableVote(question.trim(), validOptions)
      setQuestion('')
      setOptions(['', ''])
    } catch (e) {
      setErr(extractErr(e))
    } finally {
      setCreating(false)
    }
  }

  async function handleClose() {
    if (!activeVoteId) return
    setErr(null)
    setClosing(true)
    try {
      await closeActiveTableVote(activeVoteId)
    } catch (e) {
      setErr(extractErr(e))
    } finally {
      setClosing(false)
    }
  }

  const showCreateForm = !activeVoteId || vote?.status === 'closed'

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">🗳️ Proposer un vote</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-gray-300"
            aria-label="Fermer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4">
          {err && (
            <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-xl border border-red-200">{err}</p>
          )}

          {loading ? (
            <p className="text-sm text-gray-400 text-center py-6">Chargement…</p>
          ) : (
            <>
              {/* Vote en cours ou dernier vote clôturé */}
              {vote && (
                <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900 leading-snug">{vote.question}</p>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
                      vote.status === 'active'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {vote.status === 'active' ? 'En cours' : 'Clôturé'}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {vote.table_vote_options
                      .slice()
                      .sort((a, b) => a.position - b.position)
                      .map(opt => {
                        const r = results.find(x => x.option_id === opt.id)
                        return (
                          <div key={opt.id} className="text-sm">
                            <p className="text-gray-700">{opt.label}</p>
                            <p className="text-xs text-gray-500">
                              <span className="text-emerald-600 font-semibold">{r?.yes_count ?? 0} pour</span>
                              {' · '}
                              <span className="text-red-500 font-semibold">{r?.no_count ?? 0} contre</span>
                              {' · '}
                              {r?.total_count ?? 0} réponse{(r?.total_count ?? 0) !== 1 ? 's' : ''}
                            </p>
                          </div>
                        )
                      })}
                  </div>

                  {vote.status === 'active' && (
                    <button
                      onClick={handleClose}
                      disabled={closing}
                      className="w-full py-2.5 text-sm font-semibold bg-gray-800 text-white rounded-xl
                        hover:bg-gray-900 transition-colors disabled:opacity-50"
                    >
                      {closing ? 'Clôture…' : 'Clôturer le vote'}
                    </button>
                  )}
                </div>
              )}

              {/* Formulaire de création — visible sans vote actif, ou après clôture */}
              {showCreateForm && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    {vote ? 'Proposer un nouveau vote' : 'Nouveau vote'}
                  </p>
                  <textarea
                    value={question}
                    onChange={e => setQuestion(e.target.value)}
                    placeholder="Question à poser à la table…"
                    rows={2}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900
                      placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2
                      focus:ring-indigo-500 focus:border-transparent"
                  />
                  <div className="space-y-2">
                    {options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={opt}
                          onChange={e => updateOption(i, e.target.value)}
                          placeholder={`Option ${i + 1}`}
                          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900
                            placeholder:text-gray-400 focus:outline-none focus:ring-2
                            focus:ring-indigo-500 focus:border-transparent"
                        />
                        {options.length > 2 && (
                          <button
                            onClick={() => removeOption(i)}
                            className="text-gray-400 hover:text-red-500 p-1"
                            aria-label="Retirer cette option"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={addOption}
                    className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline
                      focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded"
                  >
                    + Ajouter une option
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={!canSubmit || creating}
                    className="w-full py-2.5 text-sm font-semibold bg-indigo-600 text-white rounded-xl
                      hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {creating ? 'Lancement…' : 'Lancer le vote'}
                  </button>
                </div>
              )}
            </>
          )}

          {/* Historique */}
          <div className="pt-2 border-t border-gray-100">
            {!historyOpen ? (
              <button
                onClick={loadHistory}
                className="text-xs text-gray-500 hover:text-gray-700 hover:underline
                  focus:outline-none focus:ring-2 focus:ring-gray-300 rounded"
              >
                Voir l'historique des votes de cette table
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Historique</p>
                {historyLoading ? (
                  <p className="text-sm text-gray-400">Chargement…</p>
                ) : history.length === 0 ? (
                  <p className="text-sm text-gray-400">Aucun vote pour l'instant.</p>
                ) : (
                  history.map(h => (
                    <div key={h.id} className="rounded-lg bg-gray-50 border border-gray-100 p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-800">{h.question}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                          h.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'
                        }`}>
                          {h.status === 'active' ? 'En cours' : 'Clôturé'}
                        </span>
                      </div>
                      {h.options.map(o => (
                        <p key={o.option_id} className="text-xs text-gray-500">
                          {o.label} — <span className="text-emerald-600">{o.yes_count} pour</span>
                          {' · '}<span className="text-red-500">{o.no_count} contre</span>
                        </p>
                      ))}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
