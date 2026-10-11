// =============================================================
// ConsentResultsScreen — résultats d'un sondage « vote par consentement »
// (chantier 160). Remplace la carte des camps de ResultsMapScreen : des
// décomptes par option (X d'accord, Y pas d'accord), rien d'autre — pas de
// camp, pas de carte, pas d'« adopté ». Visible pendant le vote (bouton du
// vote) et après la clôture (route #session/<code>).
// =============================================================

import { useEffect, useState } from 'react'
import { getVoteResults } from '../lib/voting'
import { extractErr } from '../lib/utils'
import { sessionTypeOf } from '../lib/phaseLabels'
import type { Session, VoteResult } from '../lib/types'
import PhaseIndicator from '../components/PhaseIndicator'
import ConsentResultsList from '../components/voting/ConsentResultsList'

interface ConsentResultsScreenProps {
  session: Session
  /** Présent quand l'écran est ouvert depuis le vote : « ← Retour au vote ». */
  onBack?: () => void
}

export default function ConsentResultsScreen({ session, onBack }: ConsentResultsScreenProps) {
  const [results, setResults] = useState<VoteResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getVoteResults(session.id)
      .then(r => { if (alive) setResults(r) })
      .catch(e => { if (alive) setError(extractErr(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [session.id])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        <div>
          <div className="mb-2"><PhaseIndicator phase={session.phase} sessionType={sessionTypeOf(session)} /></div>
          <h1 className="text-xl font-bold text-gray-900">Résultats du sondage</h1>
          <p className="text-sm text-gray-500 mt-1">{session.title}</p>
          <button
            onClick={() => { if (onBack) onBack(); else window.location.hash = '' }}
            className="mt-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            {onBack ? '← Retour au vote' : '← Retour au menu'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!error && <ConsentResultsList results={results} loading={loading} />}
      </div>
    </div>
  )
}
