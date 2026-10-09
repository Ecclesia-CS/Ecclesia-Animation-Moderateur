import { useEffect, useState } from 'react'
import { getVoteResults, loadTableOpinionSummary } from '../../lib/voting'
import { extractErr } from '../../lib/utils'
import type { VoteResult } from '../../lib/types'
import VoteResultsList from './VoteResultsList'

interface Props {
  sessionId: string
  tableId: string
  onClose(): void
}

type Scope = 'session' | 'table'

// Vue modérateur — « Assertions votées » : le résumé des votes de toute la
// séance (consensus décroissant, comme avant) et, au choix, les mêmes
// assertions restreintes aux votes des membres de SA table, triées par
// dissensus pour repérer là où la table est partagée.
// Les deux jeux de données sont relus à chaque ouverture : les votes bougent
// jusqu'en post-débat (revote), un cache de montage serait périmé.
export default function VotedAssertionsModal({ sessionId, tableId, onClose }: Props) {
  const [scope, setScope] = useState<Scope>('session')

  const [sessionResults, setSessionResults] = useState<VoteResult[]>([])
  const [sessionLoading, setSessionLoading] = useState(true)
  const [sessionError,   setSessionError]   = useState<string | null>(null)

  const [tableResults, setTableResults] = useState<VoteResult[]>([])
  const [tableLoading, setTableLoading] = useState(true)
  const [tableError,   setTableError]   = useState<string | null>(null)
  // false : la table n'est pas issue d'une allocation (aucune donnée par table).
  const [tableScoped,  setTableScoped]  = useState(true)

  useEffect(() => {
    let cancelled = false
    getVoteResults(sessionId)
      .then(r => { if (!cancelled) setSessionResults(r) })
      .catch(e => { if (!cancelled) setSessionError(extractErr(e)) })
      .finally(() => { if (!cancelled) setSessionLoading(false) })
    loadTableOpinionSummary(tableId)
      .then(s => {
        if (cancelled) return
        setTableResults(s?.votes ?? [])
        setTableScoped(s?.table_number != null)
      })
      .catch(e => { if (!cancelled) setTableError(extractErr(e)) })
      .finally(() => { if (!cancelled) setTableLoading(false) })
    return () => { cancelled = true }
  }, [sessionId, tableId])

  const tabClass = (active: boolean) =>
    `flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
      active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
    }`

  const error = scope === 'table' ? tableError : sessionError

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">Assertions votées</h2>
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

        <div className="px-5 pt-3 shrink-0">
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl" role="tablist">
            <button
              role="tab"
              aria-selected={scope === 'session'}
              onClick={() => setScope('session')}
              className={tabClass(scope === 'session')}
            >
              Toute la séance
            </button>
            <button
              role="tab"
              aria-selected={scope === 'table'}
              onClick={() => setScope('table')}
              className={tabClass(scope === 'table')}
            >
              Ma table
            </button>
          </div>
          {scope === 'table' && (
            <p className="text-xs text-gray-400 leading-snug pt-2">
              Votes des personnes de ta table uniquement, les assertions les plus clivantes en premier.
            </p>
          )}
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {error ? (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
          ) : scope === 'table' ? (
            !tableLoading && !tableScoped ? (
              <p className="text-sm text-gray-400 py-2">
                Cette table n'est pas issue de l'allocation : ses votes ne peuvent pas être isolés.
              </p>
            ) : (
              <VoteResultsList results={tableResults} loading={tableLoading} variant="table" />
            )
          ) : (
            <VoteResultsList results={sessionResults} loading={sessionLoading} />
          )}
        </div>
      </div>
    </div>
  )
}
