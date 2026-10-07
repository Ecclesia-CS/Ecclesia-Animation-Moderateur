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
  accent?: 'indigo' | 'teal'
  droppableId: string
  ghostId?: string
}

// Chantier 158 : même construction que les files de la vue participant
// (ReadOnlyQueuePanel), sur le fond nuit de la vue modérateur. Carte arrondie,
// ligne de titre teintée de la couleur de la file, et une colonne de gauche
// (w-14) où tombent le repère de couleur et les numéros.
const TONS = {
  indigo: {
    titre:   'border-b-bleu-clair/20 bg-bleu-clair/[0.12]',
    repere:  'bg-bleu-clair',
    premier: 'bg-bleu-clair text-bleu-fonce',
    anneau:  'ring-bleu-clair/70',
  },
  teal: {
    titre:   'border-b-teal-300/20 bg-teal-400/[0.16]',
    repere:  'bg-teal-300',
    premier: 'bg-teal-300 text-bleu-fonce',
    anneau:  'ring-teal-300/70',
  },
} as const

export default function QueuePanel({
  title, subtitle, entries, queueType, participants,
  accent = 'indigo', droppableId, ghostId,
}: Props) {
  const { removeFromQueue } = useTable()
  const [err, setErr] = useState<string | null>(null)
  const t = TONS[accent]

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
    <section
      ref={setDropRef}
      className={`overflow-hidden rounded-[12px] border border-white/10 bg-slate-800/60 transition-shadow ${
        isOver ? `ring-2 ${t.anneau}` : ''
      }`}
    >
      <div className={`flex items-stretch border-b ${t.titre}`}>
        <span aria-hidden="true" className="flex w-14 shrink-0 items-center justify-center">
          <span className={`h-2.5 w-2.5 ${t.repere}`} />
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-snug text-creme">{title}</p>
            {subtitle && <p className="mt-0.5 text-xs leading-snug text-slate-300">{subtitle}</p>}
          </div>
          <span className="shrink-0 whitespace-nowrap rounded-[6px] bg-white/10 px-2 py-1 text-xs font-semibold tabular-nums text-creme">
            {visibleCount}<span className="sr-only"> {visibleCount !== 1 ? 'personnes' : 'personne'}</span>
          </span>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className={`py-3.5 pl-14 pr-4 text-sm italic transition-colors ${isOver ? 'text-creme' : 'text-slate-400'}`}>
          {isOver ? 'Déposer ici' : 'File vide'}
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
                  pseudo={getP(e.participant_id)?.pseudo ?? '-'}
                  premier={t.premier}
                  isGhost={e.id === ghostId}
                  onRemove={() => safe(() => removeFromQueue(e.id))}
                />
              ))}
            </tbody>
          </table>
        </SortableContext>
      )}

      {err && <p className="px-4 pb-3 text-xs text-red-300">{err}</p>}
    </section>
  )
}

// ── Sortable row ───────────────────────────────────────────────

function SortableRow({
  entry, index, pseudo, premier, isGhost = false, onRemove,
}: {
  entry: QueueEntry
  index: number
  pseudo: string
  /** Couleurs de la pastille du premier de la file. */
  premier: string
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

  const numero = (classes: string) => (
    <td className="w-14 py-2">
      <span className={`mx-auto flex h-7 w-7 items-center rounded-full justify-center text-xs font-bold tabular-nums ${classes}`}>
        {index + 1}
      </span>
    </td>
  )

  if (isGhost) {
    return (
      <tr ref={setNodeRef} style={style} className="border-b border-dashed border-white/25 last:border-0">
        {numero('border border-dashed border-white/30 text-slate-300')}
        <td className="py-2.5 pr-4 font-medium italic text-slate-300">{pseudo}</td>
        <td className="py-2.5 pr-3" />
      </tr>
    )
  }

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className="border-b border-white/[0.06] transition-colors last:border-0 hover:bg-white/[0.04]"
    >
      {numero(index === 0 ? premier : 'bg-white/[0.07] text-slate-300')}

      <td className="py-2.5 pr-4">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-creme">{pseudo}</span>
          {entry.topic_tag && (
            <span className="rounded-[6px] bg-white/10 px-1.5 py-0.5 text-xs text-slate-200">{entry.topic_tag}</span>
          )}
        </span>
      </td>

      <td className="py-2 pr-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            {...attributes}
            {...listeners}
            aria-label="Déplacer"
            title="Glisser pour réordonner"
            className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-white/15 text-slate-300
              cursor-grab active:cursor-grabbing transition-colors hover:bg-white/10 hover:text-creme
              focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair/60"
          >
            <DragHandleIcon />
          </button>

          <button
            onClick={onRemove}
            aria-label="Retirer de la file"
            title="Retirer de la file"
            className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-red-400/30 text-red-300
              transition-colors hover:border-red-400/60 hover:bg-red-500/15
              focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
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
