import { useDroppable } from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTable } from '../context/TableContext'
import { extractErr } from '../lib/utils'
import { useState } from 'react'
import type { Participant, QueueEntry } from '../lib/types'

interface Props {
  title: string
  subtitle?: string
  entries: QueueEntry[]
  queueType: 'long' | 'interactive'
  participants: Participant[]
  variant?: 'dark' | 'light'
  accent?: 'indigo' | 'teal'
  droppableId: string
  ghostId?: string
}

export default function QueuePanel({
  title, subtitle, entries, queueType, participants,
  variant = 'light', accent = 'indigo', droppableId, ghostId,
}: Props) {
  const { removeFromQueue } = useTable()
  const [err, setErr] = useState<string | null>(null)

  const dark = variant === 'dark'
  const accentBorder = accent === 'teal' ? 'border-l-teal-400' : 'border-l-bleu-clair'
  const accentText   = accent === 'teal' ? 'text-teal-300'  : 'text-bleu-clair'
  const ringColor    = accent === 'teal' ? 'ring-teal-400/60' : 'ring-bleu-clair/60'

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: droppableId,
    data: { queueType },
  })

  const getP = (id: string) => participants.find(p => p.id === id)
  // Don't count the ghost entry in the header
  const visibleCount = ghostId ? entries.filter(e => e.id !== ghostId).length : entries.length

  async function safe(fn: () => Promise<void>) {
    setErr(null)
    try { await fn() } catch (e) { setErr(extractErr(e)) }
  }

  return (
    <div
      ref={setDropRef}
      className={`overflow-hidden border transition-all ${
        dark ? 'bg-slate-800/60 border-white/10' : 'bg-white border-bleu-fonce/10'
      } ${isOver ? `ring-2 ${ringColor}` : ''}`}
    >
      {/* Header */}
      <div className={`px-4 py-3 border-b border-l-4 ${accentBorder} ${
        dark ? 'bg-white/[0.03] border-b-white/10' : 'bg-gray-50 border-b-bleu-fonce/10'
      }`}>
        <div className="flex items-center justify-between gap-3">
          <span className={`font-semibold text-sm ${dark ? 'text-creme' : 'text-anthracite'}`}>
            {title}
          </span>
          <span className={`text-xs font-medium tabular-nums whitespace-nowrap shrink-0 ${accentText}`}>
            {visibleCount} {visibleCount !== 1 ? 'personnes' : 'personne'}
          </span>
        </div>
        {subtitle && (
          <p className={`text-xs mt-0.5 ${dark ? 'text-slate-300' : 'text-gray-500'}`}>
            {subtitle}
          </p>
        )}
      </div>

      {entries.length === 0 ? (
        <p className={`px-4 py-4 text-sm italic transition-colors ${
          isOver
            ? dark ? 'text-creme' : 'text-gray-700'
            : dark ? 'text-slate-400' : 'text-gray-500'
        }`}>
          {isOver ? '↓ Déposer ici' : 'File vide'}
        </p>
      ) : (
        <SortableContext items={entries.map(e => e.id)} strategy={verticalListSortingStrategy}>
          <table className="w-full text-sm">
            <tbody>
              {entries.map((e, i) => (
                <SortableRow
                  key={e.id}
                  entry={e}
                  index={i}
                  pseudo={getP(e.participant_id)?.pseudo ?? '—'}
                  dark={dark}
                  accentText={accentText}
                  isGhost={e.id === ghostId}
                  onRemove={() => safe(() => removeFromQueue(e.id))}
                />
              ))}
            </tbody>
          </table>
        </SortableContext>
      )}

      {err && (
        <p className={`px-4 pb-3 text-xs ${dark ? 'text-red-300' : 'text-red-600'}`}>{err}</p>
      )}
    </div>
  )
}

// ── Sortable row ───────────────────────────────────────────────

function SortableRow({
  entry, index, pseudo, dark, accentText, isGhost = false, onRemove,
}: {
  entry: QueueEntry
  index: number
  pseudo: string
  dark: boolean
  accentText: string
  isGhost?: boolean
  onRemove(): void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entry.id, data: { type: 'queue-entry', queueType: entry.queue_type, participantId: entry.participant_id } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isGhost ? 0.45 : isDragging ? 0.5 : 1,
  }

  if (isGhost) {
    return (
      <tr
        ref={setNodeRef}
        style={style}
        className={`border-b border-dashed last:border-0 ${
          dark ? 'border-white/25' : 'border-bleu-fonce/20'
        }`}
      >
        <td className={`px-4 py-2.5 w-8 tabular-nums font-mono text-sm ${
          dark ? 'text-slate-400' : 'text-gray-500'
        }`}>
          {index + 1}
        </td>
        <td className={`px-4 py-2.5 font-medium italic ${dark ? 'text-slate-300' : 'text-gray-500'}`}>
          {pseudo}
        </td>
        <td className="px-4 py-2.5" />
      </tr>
    )
  }

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b last:border-0 transition-colors ${
        dark
          ? 'border-white/[0.06] hover:bg-white/[0.04]'
          : 'border-bleu-fonce/[0.06] hover:bg-gray-50'
      }`}
    >
      {/* Position */}
      <td className={`px-4 py-2.5 w-8 tabular-nums font-mono text-sm ${
        index === 0
          ? `font-bold ${accentText}`
          : dark ? 'text-slate-400' : 'text-gray-500'
      }`}>
        {index + 1}
      </td>

      {/* Pseudo */}
      <td className={`px-4 py-2.5 font-medium ${dark ? 'text-creme' : 'text-anthracite'}`}>
        {pseudo}
        {entry.topic_tag && (
          <span className={`ml-2 text-xs font-normal italic ${dark ? 'text-slate-300' : 'text-gray-500'}`}>
            — {entry.topic_tag}
          </span>
        )}
      </td>

      {/* Actions */}
      <td className="px-4 py-2.5 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            {...attributes}
            {...listeners}
            aria-label="Déplacer"
            title="Glisser pour réordonner"
            className={`p-1.5 border cursor-grab active:cursor-grabbing
              transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${
              dark
                ? 'border-white/15 text-slate-300 hover:bg-white/10 hover:text-creme focus:ring-bleu-clair/60 focus:ring-offset-slate-800'
                : 'border-bleu-fonce/15 text-gray-500 hover:bg-gray-100 focus:ring-bleu-clair'
            }`}
          >
            <DragHandleIcon />
          </button>

          <button
            onClick={onRemove}
            aria-label="Retirer de la file"
            title="Retirer de la file"
            className={`p-1.5 border transition-colors focus:outline-none
              focus:ring-2 focus:ring-offset-1 ${
              dark
                ? 'border-red-400/30 text-red-300 hover:bg-red-500/15 hover:border-red-400/60 focus:ring-red-400 focus:ring-offset-slate-800'
                : 'border-red-200 text-red-600 hover:bg-red-50 focus:ring-red-300'
            }`}
          >
            <XIcon />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Inline SVG icons ───────────────────────────────────────────

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

function XIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}
