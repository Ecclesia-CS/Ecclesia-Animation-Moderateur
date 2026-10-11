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
    <div className="pb-6 space-y-3">
      {error && (
        <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-[8px] px-3 py-2">{error}</p>
      )}
      {assertions.map(a => {
        const current = myVotes.get(a.id)?.vote ?? null
        const busy = pendingIds.has(a.id)
        return (
          <div key={a.id} className="overflow-hidden rounded-[12px] bg-white border border-bleu-fonce/10 shadow-sm animate-montee">
            <p className="px-4 py-4 text-[15px] font-semibold text-gray-900 leading-snug">{a.content}</p>
            <div className="grid grid-cols-2 divide-x divide-bleu-fonce/10 border-t border-bleu-fonce/10">
              <button
                type="button"
                disabled={busy}
                aria-pressed={current === 'agree'}
                onClick={() => handle(a.id, 'agree')}
                className={`min-h-[52px] text-sm font-semibold transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bleu-clair ${
                  current === 'agree'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white text-emerald-800 hover:bg-emerald-50'
                }`}
              >
                <span aria-hidden="true">✅</span> D'accord
              </button>
              <button
                type="button"
                disabled={busy}
                aria-pressed={current === 'disagree'}
                onClick={() => handle(a.id, 'disagree')}
                className={`min-h-[52px] text-sm font-semibold transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bleu-clair ${
                  current === 'disagree'
                    ? 'bg-red-600 text-white'
                    : 'bg-white text-red-800 hover:bg-red-50'
                }`}
              >
                <span aria-hidden="true">❌</span> Pas d'accord
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
