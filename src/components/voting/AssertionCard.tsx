import { useState } from 'react'
import type { Assertion, AssertionVote, VoteValue } from '../../lib/types'
import FondQuadrille from '../FondQuadrille'

interface AssertionCardProps {
  assertion: Assertion
  existingVote: AssertionVote | null
  onVote: (vote: VoteValue) => Promise<void>
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

  async function handleVote(vote: VoteValue) {
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
      {/* Chantier 168 : l'assertion sur l'aplat marine quadrillé du site, les
          trois réponses en rangée attachée sous elle. */}
      <div className="mt-3 overflow-hidden rounded-[12px] bg-white shadow-[0_26px_54px_-26px_rgba(21,35,63,0.75)] animate-montee">
        <div className="relative flex min-h-[150px] flex-col justify-center overflow-hidden bg-bleu-fonce px-6 py-6 text-center sm:min-h-[220px] sm:py-8">
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
                  : currentVote === 'blank'
                  ? '⬜ Tu as voté blanc'
                  : '⏭️ Tu t\'es abstenu'}
                {' '}(changer ?)
              </span>
            </div>
          )}
          <p className="relative mt-3 font-sans text-xl font-bold leading-snug tracking-[-0.01em] text-creme sm:text-2xl">
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
            label="Abstention"
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
        {/* Chantier 169 — vote blanc, distinct de l'abstention. */}
        <button
          onClick={() => handleVote('blank')}
          disabled={voting}
          className={`flex w-full items-center justify-center gap-2 border-t border-bleu-fonce/10 px-3 py-3 text-sm font-semibold transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bleu-clair ${
            currentVote === 'blank' ? 'bg-slate-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <span className="text-lg">⬜</span>
          <span>Vote blanc : la question est mal formulée</span>
        </button>
      </div>
      {index === 0 && (
        <p className="mt-3 px-2 text-center text-xs leading-relaxed text-gray-600">
          💡 « Abstention » veut dire que tu n'as pas d'avis. « Vote blanc » veut dire que la phrase est mal formulée ou ambiguë : tu ne peux pas y répondre. Ce sont deux vrais choix, différents de ne jamais répondre.
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
    'group flex min-h-[72px] flex-col items-center justify-center gap-1 px-1 py-3 text-sm sm:min-h-[84px] sm:gap-1.5 sm:py-4 font-semibold transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bleu-clair'

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
