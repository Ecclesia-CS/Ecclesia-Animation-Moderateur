import { useSession } from '../context/SessionContext'
import { useLiveMs } from '../hooks/useLiveMs'
import { formatDuration } from '../lib/utils'
import SpeakerTimer from './SpeakerTimer'

export default function ParticipantsTable() {
  const { participants, speakingTurns, session, grantFloor } = useSession()
  const now = useLiveMs()

  function cumMs(participantId: string): number {
    return speakingTurns
      .filter(t => t.participant_id === participantId)
      .reduce((sum, t) => {
        const start = new Date(t.started_at).getTime()
        const end   = t.ended_at ? new Date(t.ended_at).getTime() : now
        return sum + Math.max(0, end - start)
      }, 0)
  }

  const totals = participants.map(p => ({ id: p.id, ms: cumMs(p.id) }))
  const sessionTotal = totals.reduce((s, t) => s + t.ms, 0)

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
        <span className="font-semibold text-sm text-slate-100">Participants</span>
        <span className="text-xs text-slate-400 font-mono tabular-nums">
          Séance&nbsp;: <span className="text-slate-200">{formatDuration(sessionTotal)}</span>
        </span>
      </div>
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-500 border-b border-slate-700">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium">Pseudo</th>
            <th className="px-4 py-2.5 text-right font-medium">Tour actuel</th>
            <th className="px-4 py-2.5 text-right font-medium">Total</th>
            <th className="px-4 py-2.5 text-right font-medium pr-6">%</th>
            <th className="px-4 py-2.5 w-24" />
          </tr>
        </thead>
        <tbody>
          {participants.map(p => {
            const ms         = cumMs(p.id)
            const pct        = sessionTotal > 0 ? Math.round((ms / sessionTotal) * 100) : 0
            const isSpeaking = session.current_speaker_id === p.id

            return (
              <tr
                key={p.id}
                className={`border-t border-slate-700/60 transition-colors ${
                  isSpeaking ? 'bg-indigo-900/40' : 'hover:bg-slate-700/30'
                }`}
              >
                {/* Pseudo */}
                <td className="px-4 py-3">
                  <span className={`font-medium ${
                    isSpeaking ? 'text-white animate-speaking' : 'text-slate-100'
                  }`}>
                    {p.pseudo}
                  </span>
                  {isSpeaking && (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs
                      text-amber-400 font-semibold">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                        <line x1="12" y1="19" x2="12" y2="23"/>
                        <line x1="8" y1="23" x2="16" y2="23"/>
                      </svg>
                      parle
                    </span>
                  )}
                </td>

                {/* Current turn duration */}
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  {isSpeaking && session.current_turn_started_at ? (
                    <SpeakerTimer
                      startedAt={session.current_turn_started_at}
                      className="text-amber-400 text-sm"
                    />
                  ) : (
                    <span className="text-slate-700">—</span>
                  )}
                </td>

                {/* Cumulative total */}
                <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-300">
                  {formatDuration(ms)}
                </td>

                {/* Percentage */}
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-1.5 bg-slate-600 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-400 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="tabular-nums text-slate-400 text-xs w-8 text-right">{pct}%</span>
                  </div>
                </td>

                {/* Manual floor grant */}
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => grantFloor(p.id, 'manual')}
                    disabled={isSpeaking}
                    className="text-xs px-2.5 py-1 bg-slate-700 border border-slate-600
                      text-slate-200 rounded-lg hover:bg-slate-600 disabled:opacity-30
                      transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500
                      focus:ring-offset-1 focus:ring-offset-slate-800"
                  >
                    Manuel
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
        {participants.length > 0 && (
          <tfoot>
            <tr className="border-t border-slate-600">
              <td colSpan={2} className="px-4 py-2.5 text-xs text-slate-500 font-medium">
                Total séance
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-300 text-sm font-semibold">
                {formatDuration(sessionTotal)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
