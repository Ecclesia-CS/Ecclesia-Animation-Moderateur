import { useState } from 'react'
import type { Assertion, AssertionVote } from '../../lib/types'

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
      className={`flex flex-col flex-1 transition-opacity duration-200 ${fade ? 'opacity-0' : 'opacity-100'}`}
    >
      {/* Position indicator */}
      <div className="px-4 pt-3 pb-1 text-center">
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] tabular-nums text-bleu-fonce/70">
          {index + 1} / {total}
        </span>
      </div>

      {/* Card */}
      <div className="flex-1 flex items-center px-4 py-4">
        <div className="w-full bg-white shadow-lg border border-bleu-fonce/10 border-t-2 border-t-bleu-fonce px-6 py-7 min-h-[220px] flex flex-col justify-center">
          {currentVote && (
            <div className="mb-3 flex justify-center">
              <span
                className={`text-xs font-semibold px-3 py-1 border ${
                  currentVote === 'agree'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : currentVote === 'disagree'
                    ? 'border-red-200 bg-red-50 text-red-800'
                    : 'border-bleu-fonce/10 bg-gray-100 text-gray-600'
                }`}
              >
                {currentVote === 'agree'
                  ? '✅ Tu es d\'accord'
                  : currentVote === 'disagree'
                  ? '❌ Tu n\'es pas d\'accord'
                  : '⏭ Tu as passé'}
                {' '}&mdash; changer ?
              </span>
            </div>
          )}
          <p className="font-serif text-xl sm:text-2xl font-medium text-bleu-fonce text-center leading-snug">
            {assertion.content}
          </p>
        </div>
      </div>

      {/* Vote buttons */}
      <div className="px-4 pb-6">
        <div className="grid grid-cols-3 gap-3">
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
            emoji="⏭"
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
        {index === 0 && (
          <p className="text-center text-[11px] leading-relaxed text-gray-500 mt-4 px-4">
            💡 « Passe » veut dire ni l'un ni l'autre, ou que la question n'est pas claire. C'est un vrai choix, compté dans les résultats, pas pareil que de ne jamais répondre.
          </p>
        )}
      </div>
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
    'flex flex-col items-center justify-center gap-1 py-3 px-1 border transition-colors min-h-[72px] font-semibold text-xs disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2 focus-visible:ring-offset-creme'

  const colorMap = {
    green: active
      ? 'bg-emerald-600 border-emerald-600 text-white shadow-md'
      : 'bg-white border-emerald-200 text-emerald-800 hover:bg-emerald-50 hover:border-emerald-300',
    red: active
      ? 'bg-red-600 border-red-600 text-white shadow-md'
      : 'bg-white border-red-200 text-red-800 hover:bg-red-50 hover:border-red-300',
    gray: active
      ? 'bg-gray-600 border-gray-600 text-white shadow-md'
      : 'bg-white border-bleu-fonce/15 text-gray-700 hover:bg-gray-50 hover:border-bleu-fonce/30',
  }

  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${colorMap[color]}`}>
      <span className="text-xl">{emoji}</span>
      <span className="leading-tight text-center">{label}</span>
    </button>
  )
}
