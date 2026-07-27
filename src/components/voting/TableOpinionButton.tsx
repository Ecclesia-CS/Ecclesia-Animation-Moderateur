import { useState, type ReactNode } from 'react'
import { useTable } from '../../context/TableContext'
import { loadTableOpinionSummary } from '../../lib/voting'
import type { TableOpinionSummary } from '../../lib/types'
import { campColor } from './TableDiagnosticsList'
import VoteResultsList from './VoteResultsList'
import { extractErr } from '../../lib/utils'

interface Props {
  className?: string
  label?: ReactNode
}

// Chantier 20 (G7) — vue modérateur : composition idéologique de sa table +
// assertions représentatives par camp + clivantes/consensuelles au sein de
// la table (docs/VAGUE3-amendements-allocation.md).
export default function TableOpinionButton({ className = '', label = 'Camps' }: Props) {
  const { table } = useTable()
  const [isOpen, setIsOpen]   = useState(false)
  const [summary, setSummary] = useState<TableOpinionSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  if (!table.session_id) return null

  function open() {
    setIsOpen(true)
    if (summary || loading) return
    setLoading(true)
    setError(null)
    loadTableOpinionSummary(table.id)
      .then(setSummary)
      .catch(e => setError(extractErr(e)))
      .finally(() => setLoading(false))
  }

  return (
    <>
      <button onClick={open} className={className} title="Composition idéologique de la table">
        {label}
      </button>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50"
          onMouseDown={e => { if (e.target === e.currentTarget) setIsOpen(false) }}
        >
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <h2 className="text-sm font-semibold text-gray-900">Composition idéologique de la table</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-gray-300"
                aria-label="Fermer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4 space-y-5">
              {loading && <p className="text-sm text-gray-400 py-2">Chargement…</p>}
              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
              )}
              {!loading && !error && summary && (
                <>
                  {!summary.opinions_available ? (
                    <p className="text-sm text-gray-400 py-2">
                      Aucune analyse des camps d'opinion disponible pour cette séance.
                    </p>
                  ) : summary.camps.length === 0 ? (
                    <p className="text-sm text-gray-400 py-2">
                      Aucune donnée d'opinion pour les membres de cette table.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Camps présents à cette table
                      </h3>
                      {summary.camps.map(c => (
                        <div key={c.group_id} className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ background: campColor(c.group_id) }}
                            />
                            <span className="text-sm font-semibold text-gray-800">
                              {c.name ?? `Camp ${c.group_id + 1}`}
                            </span>
                            <span className="text-xs text-gray-400">
                              {c.count} personne{c.count > 1 ? 's' : ''}
                            </span>
                          </div>
                          {c.description && (
                            <p className="text-xs text-gray-400 pl-4.5 leading-snug">{c.description}</p>
                          )}
                          {c.top_assertions.length > 0 && (
                            <ul className="pl-4.5 space-y-1">
                              {c.top_assertions.map((a, i) => (
                                <li key={i} className="text-xs text-gray-600 leading-snug">
                                  « {a.content} »
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {summary.votes.length > 0 && (
                    <div className="border-t border-gray-100 pt-4">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                        Assertions clivantes / consensuelles dans cette table
                      </h3>
                      <VoteResultsList results={summary.votes} loading={false} />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
