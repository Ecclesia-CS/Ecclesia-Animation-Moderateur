import { useEffect, useState } from 'react'
import { getVoteResults, loadTableOpinionSummary } from '../../lib/voting'
import { extractErr } from '../../lib/utils'
import type { VoteResult } from '../../lib/types'
import VoteResultsList from './VoteResultsList'
import EnTeteFenetre from '../EnTeteFenetre'

interface Props {
  sessionId: string
  tableId: string
  /** Titre de la modale (« Assertions votées » côté modérateur, « Résultats du vote » côté participant). */
  title?: string
  onClose(): void
}

type Scope = 'session' | 'table'

// Vue modérateur et participant — « Assertions votées » / « Résultats du vote » : le résumé des votes de toute la
// séance (consensus décroissant, comme avant) et, au choix, les mêmes
// assertions restreintes aux votes des membres de SA table, triées par
// dissensus pour repérer là où la table est partagée.
// Les deux jeux de données sont relus à chaque ouverture : les votes bougent
// jusqu'en post-débat (revote), un cache de montage serait périmé.
export default function VotedAssertionsModal({ sessionId, tableId, title = 'Assertions votées', onClose }: Props) {
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
    `flex-1 py-2 text-xs font-semibold rounded-[6px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair ${
      active ? 'bg-white text-bleu-fonce shadow-sm' : 'text-gray-600 hover:text-bleu-fonce'
    }`

  const error = scope === 'table' ? tableError : sessionError

  return (
    <div
      className="fixed inset-0 bg-bleu-fonce/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center z-50"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white w-full sm:max-w-sm shadow-2xl flex flex-col max-h-[85vh] overflow-hidden rounded-t-[12px] sm:rounded-[12px] ring-1 ring-white/10 animate-entree">
        <EnTeteFenetre titre={title} onClose={onClose} />

        <div className="px-5 pt-3 shrink-0">
          <div className="flex gap-1 p-1 bg-gray-100 rounded-[8px]" role="tablist">
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
            <p className="text-xs text-gray-600 leading-snug pt-2">
              Votes des personnes de ta table uniquement, les assertions les plus partagées en premier.
            </p>
          )}
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {error ? (
            <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-[8px] px-3 py-2">{error}</p>
          ) : scope === 'table' ? (
            !tableLoading && !tableScoped ? (
              <p className="text-sm text-gray-600 py-2">
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
