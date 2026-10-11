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
      <div className="rounded-[12px] bg-white border border-bleu-fonce/10 p-5 shadow-sm">
        <h2 className="font-sans text-[11px] font-bold text-bleu-fonce/70 uppercase tracking-[0.16em] mb-2">Résultats du vote</h2>
        <p className="text-sm text-gray-600" role="status">Chargement…</p>
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="rounded-[12px] bg-white border border-bleu-fonce/10 p-5 shadow-sm">
        <h2 className="font-sans text-[11px] font-bold text-bleu-fonce/70 uppercase tracking-[0.16em] mb-2">Résultats du vote</h2>
        <p className="text-sm text-gray-600">Aucune option pour l'instant.</p>
      </div>
    )
  }

  const sorted = sortByAgreement(results)
  const totalVotes = results.reduce((sum, r) => sum + r.agree_count + r.disagree_count, 0)

  return (
    <div className="rounded-[12px] bg-white border border-bleu-fonce/10 p-5 space-y-4 shadow-sm animate-montee">
      <div>
        <h2 className="font-sans text-[11px] font-bold text-bleu-fonce/70 uppercase tracking-[0.16em]">Résultats du vote</h2>
        <p className="text-xs text-gray-600 mt-1">Classées par nombre d'accords.</p>
      </div>
      <div className="divide-y divide-bleu-fonce/10">
        {sorted.map((r, i) => {
          const total = r.agree_count + r.disagree_count
          const agreePct = total > 0 ? (r.agree_count / total) * 100 : 0
          const disagreePct = total > 0 ? (r.disagree_count / total) * 100 : 0
          return (
            <div key={i} className="space-y-2 py-4 first:pt-0 last:pb-0">
              <p className="text-sm text-gray-800 leading-snug">{r.content}</p>
              <div className="flex h-2 overflow-hidden bg-gray-100">
                {agreePct > 0 && <div className="bg-green-400 h-full" style={{ width: `${agreePct}%` }} />}
                {disagreePct > 0 && <div className="bg-red-400 h-full" style={{ width: `${disagreePct}%` }} />}
              </div>
              <div className="flex gap-4 text-xs font-semibold tabular-nums">
                <span className="text-green-700">
                  {r.agree_count} d'accord
                </span>
                <span className="text-red-700">
                  {r.disagree_count} pas d'accord
                </span>
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-gray-600 text-center">
        {results.length} option{results.length > 1 ? 's' : ''} · {totalVotes} vote{totalVotes > 1 ? 's' : ''} au total
      </p>
    </div>
  )
}
