import type { Participant, QueueEntry } from '../lib/types'

interface Props {
  participants: Participant[]
  currentSpeakerId: string | null
  queueLong: QueueEntry[]
  queueInteractive: QueueEntry[]
  variant?: 'dark' | 'light'
}

export default function ParticipantsSidebar({
  participants,
  currentSpeakerId,
  queueLong,
  queueInteractive,
  variant = 'dark',
}: Props) {
  const dark = variant === 'dark'
  const longIds        = new Set(queueLong.map(e => e.participant_id))
  const interactiveIds = new Set(queueInteractive.map(e => e.participant_id))

  const sorted = [...participants].sort((a, b) => {
    if (a.id === currentSpeakerId) return -1
    if (b.id === currentSpeakerId) return  1
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })

  return (
    <aside className={`w-52 shrink-0 border rounded-2xl p-3 flex flex-col gap-2 self-start sticky top-20 ${
      dark
        ? 'bg-slate-800/50 border-slate-700'
        : 'bg-white border-gray-200 shadow-sm'
    }`}>

      <div className="flex items-center justify-between px-1">
        <span className={`text-xs font-semibold uppercase tracking-wider ${
          dark ? 'text-slate-400' : 'text-gray-500'
        }`}>
          Présents
        </span>
        <span className={`text-xs font-mono px-1.5 py-0.5 rounded-full ${
          dark ? 'text-slate-500 bg-slate-700' : 'text-gray-400 bg-gray-100'
        }`}>
          {participants.length}
        </span>
      </div>

      <ul className="flex flex-col gap-1">
        {sorted.map(p => {
          const isSpeaking    = p.id === currentSpeakerId
          const inInteractive = interactiveIds.has(p.id)
          const inLong        = longIds.has(p.id)

          return (
            <li
              key={p.id}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-xl transition-colors ${
                isSpeaking
                  ? 'bg-amber-500/15 border border-amber-500/30'
                  : dark ? 'hover:bg-slate-700/40' : 'hover:bg-gray-50'
              }`}
            >
              {isSpeaking ? (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
              ) : (
                <span className={`w-2 h-2 rounded-full shrink-0 ${dark ? 'bg-slate-600' : 'bg-gray-300'}`} />
              )}

              <span className={`text-sm truncate flex-1 ${
                isSpeaking
                  ? 'text-amber-200 font-semibold'
                  : dark ? 'text-slate-300' : 'text-gray-700'
              }`}>
                {p.pseudo}
              </span>

              {inInteractive && !isSpeaking && (
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" title="File interactive" />
              )}
              {inLong && !isSpeaking && (
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" title="File longue" />
              )}
            </li>
          )
        })}
      </ul>

      {participants.length === 0 && (
        <p className={`text-xs text-center py-2 ${dark ? 'text-slate-600' : 'text-gray-400'}`}>
          Aucun participant
        </p>
      )}
    </aside>
  )
}
