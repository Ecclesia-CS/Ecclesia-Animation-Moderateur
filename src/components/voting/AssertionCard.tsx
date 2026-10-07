import { useState } from 'react'
import type { Assertion, AssertionVote } from '../../lib/types'
import FondQuadrille from '../FondQuadrille'

interface AssertionCardProps {
  assertion: Assertion
  existingVote: AssertionVote | null
  onVote: (vote: 'agree' | 'disagree' | 'pass') => Promise<void>
  index: number
  total: number
}

export default function AssertionCard({
  assertion,
  existingVote,
  onVote,
  index,
  total,
}: AssertionCardProps) {
  const [voting, setVoting] = useState(false)
  const [fade, setFade] = useState(false)

  async function handleVote(vote: 'agree' | 'disagree' | 'pass') {
    if (voting) return
    setVoting(true)
    setFade(true)
    try {
      await onVote(vote)
    } finally {
      setVoting(false)
      setFade(false)
    }
  }

  const currentVote = existingVote?.vote ?? null

  return (
    <div
      className={`flex flex-col transition-opacity duration-200 ${fade ? 'opacity-0' : 'opacity-100'}`}
    >
      {/* Chantier 158 : l'assertion sur l'aplat marine quadrillé du site, les
          trois réponses en rangée attachée sous elle. */}
      <div className="mt-4 overflow-hidden rounded-[12px] bg-white shadow-[0_26px_54px_-26px_rgba(21,35,63,0.75)] animate-montee">
        <div className="relative flex min-h-[220px] flex-col justify-center overflow-hidden bg-bleu-fonce px-6 py-8 text-center">
          <FondQuadrille cases={3} />
          <p className="relative text-[11px] font-bold uppercase tracking-[0.2em] tabular-nums text-bleu-clair">
            Assertion {index + 1} sur {total}
          </p>
          {currentVote && (
            <div className="relative mt-3 flex justify-center">
              <span className="rounded-[6px] bg-white/10 px-3 py-1 text-xs font-semibold text-creme">
                {currentVote === 'agree'
                  ? '✅ Tu es d\'accord'
                  : currentVote === 'disagree'
                  ? '❌ Tu n\'es pas d\'accord'
                  : '⏭️ Tu as passé'}
                {' '}(changer ?)
              </span>
            </div>
          )}
          <p className="relative mt-4 font-sans text-xl font-bold leading-snug tracking-[-0.01em] text-creme sm:text-2xl">
            {assertion.content}
          </p>
        </div>

        {/* Réponses */}
        <div className="grid grid-cols-3 divide-x divide-bleu-fonce/10">
          <VoteBtn
            label="Pas d'accord"
            emoji="❌"
            color="red"
            active={currentVote === 'disagree'}
            disabled={voting}
            onClick={() => handleVote('disagree')}
          />
          <VoteBtn
            label="Passe"
            emoji="⏭️"
            color="gray"
            active={currentVote === 'pass'}
            disabled={voting}
            onClick={() => handleVote('pass')}
          />
          <VoteBtn
            label="D'accord"
            emoji="✅"
            color="green"
            active={currentVote === 'agree'}
            disabled={voting}
            onClick={() => handleVote('agree')}
          />
        </div>
      </div>
      {index === 0 && (
        <p className="mt-4 px-2 text-center text-xs leading-relaxed text-gray-600">
          💡 « Passe » veut dire ni l'un ni l'autre, ou que la question n'est pas claire. C'est un vrai choix, compté dans les résultats, pas pareil que de ne jamais répondre.
        </p>
      )}
    </div>
  )
}

function VoteBtn({
  label,
  emoji,
  color,
  active,
  disabled,
  onClick,
}: {
  label: string
  emoji: string
  color: 'green' | 'gray' | 'red'
  active: boolean
  disabled: boolean
  onClick: () => void
}) {
  const base =
    'group flex min-h-[84px] flex-col items-center justify-center gap-1.5 px-1 py-4 text-sm font-semibold transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bleu-clair'

  const colorMap = {
    green: active ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-800 hover:bg-emerald-50',
    red:   active ? 'bg-red-600 text-white'     : 'bg-white text-red-800 hover:bg-red-50',
    gray:  active ? 'bg-gray-600 text-white'    : 'bg-white text-gray-700 hover:bg-gray-50',
  }

  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${colorMap[color]}`}>
      <span className="text-2xl transition-transform duration-200 group-hover:scale-110">{emoji}</span>
      <span className="leading-tight text-center">{label}</span>
    </button>
  )
}
