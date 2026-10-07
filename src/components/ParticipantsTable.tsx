import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { useTable } from '../context/TableContext'
import { useToast } from '../context/ToastContext'
import { useLiveMs } from '../hooks/useLiveMs'
import { formatDuration, extractErr } from '../lib/utils'
import SpeakerTimer from './SpeakerTimer'
import ConfirmModal from './ConfirmModal'
import type { Participant, Table } from '../lib/types'

export default function ParticipantsTable() {
  const {
    participants, speakingTurns, table, grantFloor,
    kickParticipant, myParticipant,
  } = useTable()
  const { showToast } = useToast()
  const now = useLiveMs()
  const [kickTarget, setKickTarget] = useState<Participant | null>(null)
  const [kickErr, setKickErr]       = useState<string | null>(null)

  function cumMs(participantId: string): number {
    return speakingTurns
      .filter(t => t.participant_id === participantId)
      .reduce((sum, t) => {
        const start = new Date(t.started_at).getTime()
        const end   = t.ended_at ? new Date(t.ended_at).getTime() : now
        return sum + Math.max(0, end - start)
      }, 0)
  }

  const totals      = participants.map(p => ({ id: p.id, ms: cumMs(p.id) }))
  const sessionTotal = totals.reduce((s, t) => s + t.ms, 0)

  async function doKick() {
    if (!kickTarget) return
    try {
      const pseudo = kickTarget.pseudo
      await kickParticipant(kickTarget.id)
      setKickTarget(null)
      setKickErr(null)
      showToast(`${pseudo} a été exclu·e de la table.`, 'success')
    } catch (e) {
      setKickErr(extractErr(e))
    }
  }

  return (
    <div className="overflow-hidden rounded-[12px] border border-white/10 bg-slate-800/60">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.05] px-4 py-3">
        <span className="font-semibold text-sm text-creme">Participants</span>
        <span className="rounded-[6px] bg-white/10 px-2 py-1 text-xs tabular-nums text-slate-300">
          Séance&nbsp;: <span className="font-semibold text-creme">{formatDuration(sessionTotal)}</span>
        </span>
      </div>
      {/* Sur téléphone, le tableau défile dans sa carte plutôt que d'élargir la page. */}
      <div className="overflow-x-auto">
      <table className="w-full min-w-[33rem] text-sm">
        <thead className="text-[11px] uppercase tracking-[0.12em] text-slate-300 border-b border-white/10">
          <tr>
            <th className="w-8" />
            <th className="px-3 py-2.5 text-left font-medium">Pseudo</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">Tour actuel</th>
            <th className="px-3 py-2.5 text-right font-medium">Total</th>
            <th className="px-3 py-2.5 text-right font-medium">%</th>
            <th className="px-3 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {participants.map(p => {
            const ms         = totals.find(t => t.id === p.id)?.ms ?? 0
            const pct        = sessionTotal > 0 ? Math.round((ms / sessionTotal) * 100) : 0
            const isSpeaking = table.current_speaker_id === p.id
            const isSelf     = p.id === myParticipant.id
            return (
              <DraggableRow
                key={p.id}
                p={p}
                ms={ms}
                pct={pct}
                isSpeaking={isSpeaking}
                isSelf={isSelf}
                table={table}
                onGrantFloor={() => grantFloor(p.id, 'manual')}
                onKick={() => setKickTarget(p)}
              />
            )
          })}
        </tbody>
        {participants.length > 0 && (
          <tfoot>
            <tr className="border-t border-white/15">
              <td colSpan={3} className="px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] text-slate-300 font-medium">
                Total séance
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-creme text-sm font-semibold">
                {formatDuration(sessionTotal)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        )}
      </table>
      </div>

      {kickTarget && (
        <ConfirmModal
          title={`Exclure ${kickTarget.pseudo} ?`}
          body="Cette personne sera retirée de la session et renvoyée à l'écran d'accueil. Son historique de parole sera supprimé."
          confirmLabel="Exclure"
          onConfirm={doKick}
          onCancel={() => { setKickTarget(null); setKickErr(null) }}
        />
      )}
      {kickErr && (
        <p className="px-4 pb-3 text-xs text-red-300">{kickErr}</p>
      )}
    </div>
  )
}

// ── Draggable row ──────────────────────────────────────────────

function DraggableRow({
  p, ms, pct, isSpeaking, isSelf, table, onGrantFloor, onKick,
}: {
  p: Participant
  ms: number
  pct: number
  isSpeaking: boolean
  isSelf: boolean
  table: Table
  onGrantFloor(): void
  onKick(): void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: 'p-' + p.id,
    data: { type: 'participant', participantId: p.id },
    disabled: isSpeaking,
  })

  return (
    <tr
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className={`border-t border-white/[0.06] transition-colors ${
        isSpeaking ? 'bg-amber-400/10' : 'hover:bg-white/[0.04]'
      }`}
    >
      {/* Drag handle */}
      <td className="pl-3 w-8">
        <button
          {...attributes}
          {...listeners}
          disabled={isSpeaking}
          title="Glisser vers une file"
          className="flex h-8 w-8 items-center justify-center rounded-[6px] text-slate-400 hover:bg-white/10 hover:text-creme cursor-grab
            active:cursor-grabbing disabled:opacity-20 disabled:cursor-not-allowed
            transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair/60"
        >
          <DragHandleIcon />
        </button>
      </td>

      {/* Pseudo */}
      <td className="px-3 py-3 max-w-[180px]">
        <span className={`font-medium truncate block ${isSpeaking ? 'font-semibold text-amber-200' : 'text-creme'}`}>
          {p.pseudo}
        </span>
        {isSpeaking && (
          <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-amber-300 font-semibold">
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

      {/* Current turn */}
      <td className="px-3 py-3 text-right tabular-nums">
        {isSpeaking && table.current_turn_started_at ? (
          <SpeakerTimer startedAt={table.current_turn_started_at} className="font-semibold text-amber-300 text-sm" />
        ) : (
          <span className="text-slate-500">-</span>
        )}
      </td>

      {/* Cumulative */}
      <td className="px-3 py-3 text-right tabular-nums text-slate-200">
        {formatDuration(ms)}
      </td>

      {/* Percentage */}
      <td className="px-3 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <div className="w-12 h-1.5 bg-white/10 overflow-hidden">
            <div
              className="h-full bg-bleu-clair transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="tabular-nums text-slate-300 text-xs w-8 text-right">{pct}%</span>
        </div>
      </td>

      {/* Actions */}
      <td className="py-3 pl-3 pr-4 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={onGrantFloor}
            disabled={isSpeaking}
            title="Donner le micro directement"
            className="inline-flex h-8 items-center rounded-[6px] text-xs font-semibold px-3 bg-white/5 border border-white/15
              text-slate-200 hover:bg-bleu-clair/15 hover:border-bleu-clair/50 hover:text-creme disabled:opacity-30
              transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair/60
              focus-visible:ring-offset-1 focus-visible:ring-offset-slate-800 whitespace-nowrap"
          >
            Donner la parole
          </button>
          {!isSelf ? (
            <button
              onClick={onKick}
              title="Bannir"
              aria-label="Bannir ce participant"
              className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-red-400/30 text-red-300
                hover:bg-red-500/15 hover:border-red-400/60 transition-colors focus:outline-none
                focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-800"
            >
              <TrashIcon />
            </button>
          ) : (
            // Même largeur que le bouton d'exclusion : les « Donner la parole » restent alignés.
            <span aria-hidden="true" className="h-8 w-8" />
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Icons ──────────────────────────────────────────────────────

function DragHandleIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 10 16" fill="currentColor">
      <circle cx="2.5" cy="3"  r="1.5"/>
      <circle cx="7.5" cy="3"  r="1.5"/>
      <circle cx="2.5" cy="8"  r="1.5"/>
      <circle cx="7.5" cy="8"  r="1.5"/>
      <circle cx="2.5" cy="13" r="1.5"/>
      <circle cx="7.5" cy="13" r="1.5"/>
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6"/>
      <path d="M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  )
}
