import { useDroppable } from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useSession } from '../context/SessionContext'
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
}

export default function QueuePanel({
  title, subtitle, entries, queueType, participants,
  variant = 'light', accent = 'indigo', droppableId,
}: Props) {
  const { removeFromQueue } = useSession()
  const [err, setErr] = useState<string | null>(null)

  const dark = variant === 'dark'
  const accentBorder = accent === 'teal' ? 'border-teal-500' : 'border-indigo-500'
  const accentText   = accent === 'teal' ? 'text-teal-400'  : 'text-indigo-400'
  const ringColor    = accent === 'teal' ? 'ring-teal-500/50' : 'ring-indigo-500/50'

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: droppableId,
    data: { queueType },
  })

  const getP = (id: string) => participants.find(p => p.id === id)

  async function safe(fn: () => Promise<void>) {
    setErr(null)
    try { await fn() } catch (e) { setErr(extractErr(e)) }
  }

  return (
    <div
      ref={setDropRef}
      className={`rounded-xl overflow-hidden border transition-all ${
        dark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
      } ${isOver ? `ring-2 ${ringColor}` : ''}`}
    >
      {/* Header */}
      <div className={`px-4 py-3 border-b border-l-4 ${accentBorder} ${
        dark ? 'bg-slate-700/50 border-b-slate-700' : 'bg-gray-50 border-b-gray-100'
      }`}>
        <div className="flex items-center justify-between">
          <span className={`font-semibold text-sm ${dark ? 'text-slate-100' : 'text-gray-900'}`}>
            {title}
          </span>
          <span className={`text-xs ${accentText}`}>
            {entries.length} {entries.length !== 1 ? 'personnes' : 'personne'}
          </span>
        </div>
        {subtitle && (
          <p className={`text-xs mt-0.5 ${dark ? 'text-slate-400' : 'text-gray-400'}`}>
            {subtitle}
          </p>
        )}
      </div>

      {entries.length === 0 ? (
        <p className={`px-4 py-4 text-sm italic transition-colors ${
          isOver
            ? dark ? 'text-slate-300' : 'text-gray-600'
            : dark ? 'text-slate-500' : 'text-gray-400'
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
                  onRemove={() => safe(() => removeFromQueue(e.id))}
                />
              ))}
            </tbody>
          </table>
        </SortableContext>
      )}

      {err && (
        <p className={`px-4 pb-3 text-xs ${dark ? 'text-red-400' : 'text-red-600'}`}>{err}</p>
      )}
    </div>
  )
}

// ── Sortable row ───────────────────────────────────────────────

function SortableRow({
  entry, index, pseudo, dark, accentText, onRemove,
}: {
  entry: QueueEntry
  index: number
  pseudo: string
  dark: boolean
  accentText: string
  onRemove(): void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entry.id, data: { type: 'queue-entry', queueType: entry.queue_type, participantId: entry.participant_id } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b last:border-0 transition-colors ${
        dark
          ? 'border-slate-700 hover:bg-slate-700/50'
          : 'border-gray-50 hover:bg-gray-50'
      }`}
    >
      {/* Position */}
      <td className={`px-4 py-2.5 w-8 tabular-nums font-mono text-sm ${
        index === 0
          ? `font-bold ${accentText}`
          : dark ? 'text-slate-500' : 'text-gray-400'
      }`}>
        {index + 1}
      </td>

      {/* Pseudo */}
      <td className={`px-4 py-2.5 font-medium ${dark ? 'text-slate-100' : 'text-gray-900'}`}>
        {pseudo}
      </td>

      {/* Actions */}
      <td className="px-4 py-2.5 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            {...attributes}
            {...listeners}
            aria-label="Déplacer"
            title="Glisser pour réordonner"
            className={`p-1.5 rounded-lg border cursor-grab active:cursor-grabbing
              transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${
              dark
                ? 'border-slate-600 text-slate-400 hover:bg-slate-600 focus:ring-slate-400 focus:ring-offset-slate-800'
                : 'border-gray-200 text-gray-500 hover:bg-gray-100 focus:ring-gray-300'
            }`}
          >
            <DragHandleIcon />
          </button>

          <button
            onClick={onRemove}
            aria-label="Retirer de la file"
            title="Retirer de la file"
            className={`p-1.5 rounded-lg border transition-colors focus:outline-none
              focus:ring-2 focus:ring-offset-1 ${
              dark
                ? 'border-red-700 text-red-400 hover:bg-red-900/40 focus:ring-red-500 focus:ring-offset-slate-800'
                : 'border-red-200 text-red-500 hover:bg-red-50 focus:ring-red-300'
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
