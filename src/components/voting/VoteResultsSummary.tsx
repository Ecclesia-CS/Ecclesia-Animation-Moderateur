import type { VoteResult } from '../../lib/types'

interface VoteResultsSummaryProps {
  results: VoteResult[]
  loading: boolean
}

export default function VoteResultsSummary({ results, loading }: VoteResultsSummaryProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Résultats du vote</h2>
        <p className="text-sm text-gray-400">Chargement…</p>
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Résultats du vote</h2>
        <p className="text-sm text-gray-400">Aucune assertion approuvée pour cette séance.</p>
      </div>
    )
  }

  // consensus_score (from DB): |agree-disagree|/(agree+disagree) × participation → high = one side dominates
  // dissensus_score (client): balanced split with ≥3 non-pass votes → high = true disagreement
  function dissensusScore(r: VoteResult): number {
    const nonPass = r.agree_count + r.disagree_count
    if (nonPass < 3) return 0
    const dominance = Math.abs(r.agree_count - r.disagree_count) / nonPass
    return (1 - dominance) * Math.min(nonPass / 3, 1) * 100
  }

  const byConsensus = [...results].sort((a, b) => (b.consensus_score ?? -1) - (a.consensus_score ?? -1))
  const topCount = Math.min(3, byConsensus.length)
  const top = byConsensus.slice(0, topCount)
  const topIds = new Set(top.map(r => r.id))
  // dissensus: exclude top consensus picks, sort by split score, min 3 non-pass votes
  const bottom = results.length >= 4
    ? [...results]
        .filter(r => !topIds.has(r.id) && (r.agree_count + r.disagree_count) >= 3)
        .sort((a, b) => dissensusScore(b) - dissensusScore(a))
        .slice(0, 2)
    : []

  const totalVotes = results.reduce((sum, r) => sum + r.total_votes, 0)

  return (
    <div className="space-y-3">
      {/* Top consensus */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Points de consensus
        </h2>
        <div className="space-y-3">
          {top.map(r => (
            <ResultCard key={r.id} result={r} variant="consensus" />
          ))}
        </div>
      </div>

      {/* Bottom dissensus */}
      {bottom.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Points de désaccord
          </h2>
          <div className="space-y-3">
            {bottom.map(r => (
              <ResultCard key={r.id} result={r} variant="dissensus" />
            ))}
          </div>
        </div>
      )}

      {/* Global stats */}
      <p className="text-xs text-gray-400 text-center">
        {results.length} assertion{results.length > 1 ? 's' : ''} approuvée{results.length > 1 ? 's' : ''} · {totalVotes} vote{totalVotes > 1 ? 's' : ''} au total
      </p>
    </div>
  )
}

function ResultCard({ result, variant }: { result: VoteResult; variant: 'consensus' | 'dissensus' }) {
  const total = result.agree_count + result.disagree_count + result.pass_count
  const agreePct    = total > 0 ? (result.agree_count    / total) * 100 : 0
  const disagreePct = total > 0 ? (result.disagree_count / total) * 100 : 0
  const passPct     = total > 0 ? (result.pass_count     / total) * 100 : 0

  const score = result.consensus_score

  // consensus_score: high = one side dominates × participation
  // threshold 50 ≈ ≥50% non-pass votes on one side
  let badge: { label: string; className: string }
  if (variant === 'dissensus') {
    badge = { label: 'Point de désaccord', className: 'bg-red-100 text-red-700' }
  } else if (score != null && score >= 50) {
    badge = { label: 'Fort consensus', className: 'bg-green-100 text-green-700' }
  } else {
    badge = { label: 'Consensus partiel', className: 'bg-yellow-100 text-yellow-700' }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <p className="flex-1 text-sm text-gray-800 leading-snug">{result.content}</p>
        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${badge.className}`}>
          {badge.label}
        </span>
      </div>
      {/* Vote bar */}
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
        <span>→ {result.pass_count}</span>
      </div>
    </div>
  )
}
