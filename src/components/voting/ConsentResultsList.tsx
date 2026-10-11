// Chantier 160 — résultats d'un sondage « vote par consentement » : des décomptes
// seuls (X d'accord, Y pas d'accord) par option, triés par nombre d'accords.
// Aucune notion d'« adopté » (ni zéro opposant, ni seuil) et aucun camp. Partagé
// par l'écran participant, la page publique et l'écran superadmin/association.

export interface ConsentCount {
  content: string
  agree_count: number
  disagree_count: number
}

interface ConsentResultsListProps {
  results: ConsentCount[]
  loading?: boolean
}

/** Plus d'accords d'abord ; à égalité, moins de désaccords, puis l'ordre d'origine (tri stable). */
function sortByAgreement<T extends ConsentCount>(results: T[]): T[] {
  return [...results].sort(
    (a, b) => b.agree_count - a.agree_count || a.disagree_count - b.disagree_count,
  )
}

export default function ConsentResultsList({ results, loading = false }: ConsentResultsListProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Résultats du vote</h2>
        <p className="text-sm text-gray-400">Chargement…</p>
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Résultats du vote</h2>
        <p className="text-sm text-gray-400">Aucune option pour l'instant.</p>
      </div>
    )
  }

  const sorted = sortByAgreement(results)
  const totalVotes = results.reduce((sum, r) => sum + r.agree_count + r.disagree_count, 0)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Résultats du vote</h2>
        <p className="text-xs text-gray-400 mt-1">Classées par nombre d'accords.</p>
      </div>
      <div className="space-y-4">
        {sorted.map((r, i) => {
          const total = r.agree_count + r.disagree_count
          const agreePct = total > 0 ? (r.agree_count / total) * 100 : 0
          const disagreePct = total > 0 ? (r.disagree_count / total) * 100 : 0
          return (
            <div key={i} className="space-y-2">
              <p className="text-sm text-gray-800 leading-snug">{r.content}</p>
              <div className="flex rounded-full h-1.5 overflow-hidden bg-gray-100">
                {agreePct > 0 && <div className="bg-green-400 h-full" style={{ width: `${agreePct}%` }} />}
                {disagreePct > 0 && <div className="bg-red-400 h-full" style={{ width: `${disagreePct}%` }} />}
              </div>
              <div className="flex gap-4 text-xs">
                <span className="text-green-600 font-medium">
                  {r.agree_count} d'accord
                </span>
                <span className="text-red-500 font-medium">
                  {r.disagree_count} pas d'accord
                </span>
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-gray-400 text-center">
        {results.length} option{results.length > 1 ? 's' : ''} · {totalVotes} vote{totalVotes > 1 ? 's' : ''} au total
      </p>
    </div>
  )
}
