import type { VoteResult } from '../../lib/types'

interface VoteResultsListProps {
  results: VoteResult[]
  loading: boolean
  /** 'session' (défaut) : tri par consensus décroissant. 'table' (vue modérateur,
   * votes de sa seule table) : tri par dissensus — les assertions où la table
   * est le plus partagée d'abord. */
  variant?: 'session' | 'table'
}

/** Part des « contre » (ou des « pour ») la moins nombreuse parmi les votes
 * exprimés : 0 = unanimité, 0,5 = table coupée en deux. -1 si personne n'a tranché. */
function splitRatio(r: VoteResult): number {
  const decisive = r.agree_count + r.disagree_count
  return decisive > 0 ? Math.min(r.agree_count, r.disagree_count) / decisive : -1
}

function compareByDissensus(a: VoteResult, b: VoteResult): number {
  const diff = splitRatio(b) - splitRatio(a)
  if (Math.abs(diff) > 1e-9) return diff
  // À partage égal, la plus votée d'abord (4 contre 4 pèse plus que 1 contre 1).
  return (b.agree_count + b.disagree_count) - (a.agree_count + a.disagree_count)
}

export default function VoteResultsList({ results, loading, variant = 'session' }: VoteResultsListProps) {
  if (loading) {
    return <p className="text-sm text-gray-400 py-2">Chargement…</p>
  }

  if (results.length === 0) {
    return <p className="text-sm text-gray-400 py-2">Aucune assertion approuvée pour cette séance.</p>
  }

  const sorted = variant === 'table'
    ? [...results].sort(compareByDissensus)
    : [...results].sort((a, b) => (b.consensus_score ?? -1) - (a.consensus_score ?? -1))

  return (
    <div className="space-y-4">
      {sorted.map(r => (
        <AssertionRow key={r.id} result={r} variant={variant} />
      ))}
      <p className="text-xs text-gray-400 text-center pt-1">
        {results.length} assertion{results.length > 1 ? 's' : ''} approuvée{results.length > 1 ? 's' : ''}
      </p>
    </div>
  )
}

// Fort taux de "passe" : signal d'ambiguïté distinct du consensus/désaccord (cf. notes pol.is C4)
const UNCERTAIN_PASS_RATE = 0.35
const UNCERTAIN_MIN_VOTES = 5

function AssertionRow({ result, variant }: { result: VoteResult; variant: 'session' | 'table' }) {
  const total = result.agree_count + result.disagree_count + result.pass_count
  const agreePct    = total > 0 ? (result.agree_count    / total) * 100 : 0
  const disagreePct = total > 0 ? (result.disagree_count / total) * 100 : 0
  const passPct     = total > 0 ? (result.pass_count     / total) * 100 : 0
  const score = result.consensus_score
  const isUncertain = result.total_votes >= UNCERTAIN_MIN_VOTES && passPct / 100 >= UNCERTAIN_PASS_RATE

  let badge: { label: string; className: string }
  if (variant === 'table') {
    // Vue locale : le badge décrit le partage de la table, pas le consensus de la séance.
    const split = splitRatio(result)
    if (total === 0) {
      badge = { label: 'Aucun vote', className: 'bg-gray-100 text-gray-500' }
    } else if (isUncertain) {
      badge = { label: 'Beaucoup de passes', className: 'bg-gray-200 text-gray-600' }
    } else if (split < 0) {
      badge = { label: 'Que des passes', className: 'bg-gray-200 text-gray-600' }
    } else if (split >= 0.35) {
      badge = { label: 'Clivant', className: 'bg-red-100 text-red-700' }
    } else if (split >= 0.15) {
      badge = { label: 'Partagé', className: 'bg-yellow-100 text-yellow-700' }
    } else if (result.agree_count >= result.disagree_count) {
      badge = { label: 'D\'accord', className: 'bg-green-100 text-green-700' }
    } else {
      badge = { label: 'Pas d\'accord', className: 'bg-orange-100 text-orange-700' }
    }
  } else if (isUncertain) {
    badge = { label: 'Beaucoup de passes', className: 'bg-gray-200 text-gray-600' }
  } else if (score != null && score >= 50) {
    badge = { label: 'Fort consensus', className: 'bg-green-100 text-green-700' }
  } else if (score != null && score >= 20) {
    badge = { label: 'Consensus partiel', className: 'bg-yellow-100 text-yellow-700' }
  } else {
    badge = { label: 'Divergent', className: 'bg-red-100 text-red-700' }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <p className="flex-1 text-sm text-gray-800 leading-snug">{result.content}</p>
        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${badge.className}`}>
          {badge.label}
        </span>
      </div>
      <div className="flex rounded-full h-1.5 overflow-hidden bg-gray-100">
        {agreePct > 0 && (
          <div className="bg-green-400 h-full" style={{ width: `${agreePct}%` }} />
        )}
        {disagreePct > 0 && (
          <div className="bg-red-400 h-full" style={{ width: `${disagreePct}%` }} />
        )}
        {passPct > 0 && (
          <div className="bg-gray-300 h-full" style={{ width: `${passPct}%` }} />
        )}
      </div>
      <div className="flex gap-3 text-xs text-gray-400">
        <span className="text-green-600">✓ {result.agree_count}</span>
        <span className="text-red-500">✗ {result.disagree_count}</span>
        <span>⏭ {result.pass_count}</span>
      </div>
    </div>
  )
}
