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
      <div className="px-4 pt-2 pb-1 text-center">
        <span className="text-xs text-gray-400">
          {index + 1} / {total}
        </span>
      </div>

      {/* Card */}
      <div className="flex-1 flex items-center px-4 py-4">
        <div className="w-full bg-white rounded-3xl shadow-md border border-gray-100 p-6 min-h-[220px] flex flex-col justify-center">
          {currentVote && (
            <div className="mb-3 flex justify-center">
              <span
                className={`text-xs font-semibold px-3 py-1 rounded-full ${
                  currentVote === 'agree'
                    ? 'bg-green-100 text-green-700'
                    : currentVote === 'disagree'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-500'
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
          <p className="text-lg font-semibold text-gray-900 text-center leading-snug">
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
    'flex flex-col items-center justify-center gap-1 py-3 px-1 rounded-2xl border-2 transition-all min-h-[72px] font-medium text-xs disabled:opacity-50'

  const colorMap = {
    green: active
      ? 'bg-green-500 border-green-500 text-white'
      : 'bg-white border-green-200 text-green-700 hover:bg-green-50',
    red: active
      ? 'bg-red-500 border-red-500 text-white'
      : 'bg-white border-red-200 text-red-700 hover:bg-red-50',
    gray: active
      ? 'bg-gray-500 border-gray-500 text-white'
      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50',
  }

  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${colorMap[color]}`}>
      <span className="text-xl">{emoji}</span>
      <span className="leading-tight text-center">{label}</span>
    </button>
  )
}
