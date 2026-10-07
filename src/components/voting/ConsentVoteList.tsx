import { useState } from 'react'
import type { Assertion, AssertionVote } from '../../lib/types'

// Chantier 160 — sondage « vote par consentement » : toutes les options d'un
// coup, deux boutons par option (d'accord / pas d'accord), nombre de votes
// illimité. Pas de « Passer » : ne pas voter = pas d'avis. On peut changer de
// réponse à tout moment en touchant l'autre bouton.

interface ConsentVoteListProps {
  assertions: Assertion[]
  myVotes: Map<string, AssertionVote>
  onVote: (assertionId: string, vote: 'agree' | 'disagree') => Promise<void>
}

export default function ConsentVoteList({ assertions, myVotes, onVote }: ConsentVoteListProps) {
  // Envois en cours, par option : on peut enchaîner plusieurs options sans
  // attendre la réponse du serveur, mais pas double-cliquer la même.
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  async function handle(assertionId: string, vote: 'agree' | 'disagree') {
    if (pendingIds.has(assertionId)) return
    setPendingIds(prev => new Set(prev).add(assertionId))
    setError(null)
    try {
      await onVote(assertionId, vote)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ton vote n\'a pas pu être enregistré.')
    } finally {
      setPendingIds(prev => {
        const next = new Set(prev)
        next.delete(assertionId)
        return next
      })
    }
  }

  return (
    <div className="px-4 pb-6 space-y-3">
      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
      )}
      {assertions.map(a => {
        const current = myVotes.get(a.id)?.vote ?? null
        const busy = pendingIds.has(a.id)
        return (
          <div key={a.id} className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
            <p className="text-sm font-medium text-gray-900 leading-snug">{a.content}</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                aria-pressed={current === 'agree'}
                onClick={() => handle(a.id, 'agree')}
                className={`py-2.5 rounded-xl border-2 text-sm font-medium transition-all disabled:opacity-50 ${
                  current === 'agree'
                    ? 'bg-green-500 border-green-500 text-white'
                    : 'bg-white border-green-200 text-green-700 hover:bg-green-50'
                }`}
              >
                ✅ D'accord
              </button>
              <button
                type="button"
                disabled={busy}
                aria-pressed={current === 'disagree'}
                onClick={() => handle(a.id, 'disagree')}
                className={`py-2.5 rounded-xl border-2 text-sm font-medium transition-all disabled:opacity-50 ${
                  current === 'disagree'
                    ? 'bg-red-500 border-red-500 text-white'
                    : 'bg-white border-red-200 text-red-700 hover:bg-red-50'
                }`}
              >
                ❌ Pas d'accord
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
