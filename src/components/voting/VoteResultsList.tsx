import type { VoteResult } from '../../lib/types'

interface VoteResultsListProps {
  results: VoteResult[]
  loading: boolean
}

export default function VoteResultsList({ results, loading }: VoteResultsListProps) {
  if (loading) {
    return <p className="text-sm text-gray-400 py-2">Chargement…</p>
  }

  if (results.length === 0) {
    return <p className="text-sm text-gray-400 py-2">Aucune assertion approuvée pour cette séance.</p>
  }

  const sorted = [...results].sort((a, b) => (b.consensus_score ?? -1) - (a.consensus_score ?? -1))

  return (
    <div className="space-y-4">
      {sorted.map(r => (
        <AssertionRow key={r.id} result={r} />
      ))}
      <p className="text-xs text-gray-400 text-center pt-1">
        {results.length} assertion{results.length > 1 ? 's' : ''} approuvée{results.length > 1 ? 's' : ''}
      </p>
    </div>
  )
}

function AssertionRow({ result }: { result: VoteResult }) {
  const total = result.agree_count + result.disagree_count + result.pass_count
  const agreePct    = total > 0 ? (result.agree_count    / total) * 100 : 0
  const disagreePct = total > 0 ? (result.disagree_count / total) * 100 : 0
  const passPct     = total > 0 ? (result.pass_count     / total) * 100 : 0
  const score = result.consensus_score

  let badge: { label: string; className: string }
  if (score != null && score >= 50) {
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
        <span>→ {result.pass_count}</span>
      </div>
    </div>
  )
}
