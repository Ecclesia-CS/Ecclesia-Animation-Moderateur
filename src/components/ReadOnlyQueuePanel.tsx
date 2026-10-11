import type { Participant, QueueEntry } from '../lib/types'
import { IconeAutreSujet, IconeSujetActuel } from './IconesFiles'

interface Props {
  title: string
  subtitle?: string
  entries: QueueEntry[]
  participants: Participant[]
  accent?: 'indigo' | 'teal'
  /** Participant qui regarde l'écran : sa ligne est surlignée. */
  selfId?: string
}

// Chantier 168 : la colonne de gauche (w-14) est celle des boutons de file de
// ParticipantView, au-dessus. Icônes, numéros et pastilles tombent ainsi sur un
// même axe vertical, et les textes commencent tous au même endroit.
export default function ReadOnlyQueuePanel({
  title, subtitle, entries, participants, accent = 'indigo', selfId,
}: Props) {
  const teal = accent === 'teal'

  return (
    <section className="overflow-hidden rounded-[12px] border border-bleu-fonce/10 bg-white shadow-sm">
      {/* Ligne de titre teintée de la couleur de la file (même couleur que son bouton) */}
      <div className={`flex items-stretch border-b ${teal ? 'border-teal-600/15 bg-teal-50' : 'border-bleu-fonce/10 bg-indigo-50'}`}>
        <span aria-hidden="true" className={`flex w-14 shrink-0 items-center justify-center ${teal ? 'text-teal-700' : 'text-bleu-fonce'}`}>
          {teal ? <IconeSujetActuel className="h-5 w-5" /> : <IconeAutreSujet className="h-5 w-5" />}
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-snug text-anthracite">{title}</p>
            {subtitle && (
              <p className="mt-0.5 text-xs leading-snug text-gray-600">{subtitle}</p>
            )}
          </div>
          {/* Chiffre seul, comme le compteur de « Présents » : le titre garde
              toute la largeur sur un petit téléphone. Le mot reste lu. */}
          <span className={`shrink-0 whitespace-nowrap rounded-[6px] px-2 py-1 text-xs font-semibold tabular-nums ${
            teal ? 'bg-white text-teal-800' : 'bg-white text-bleu-fonce'
          }`}>
            {entries.length}<span className="sr-only"> {entries.length !== 1 ? 'personnes' : 'personne'}</span>
          </span>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="py-3.5 pl-14 pr-4 text-sm italic text-gray-500">File vide</p>
      ) : (
        <ol className="divide-y divide-bleu-fonce/[0.06]">
          {entries.map((e, i) => {
            const p = participants.find(x => x.id === e.participant_id)
            const moi = !!selfId && e.participant_id === selfId
            return (
              <li key={e.id} className={`flex items-center animate-montee ${moi ? 'bg-bleu-clair/20' : ''}`}>
                {/* Chiffre simple, dans la couleur de la file pour le premier */}
                <span className={`flex w-14 shrink-0 justify-center py-2.5 text-sm font-bold tabular-nums ${
                  i === 0 ? teal ? 'text-teal-700' : 'text-bleu-fonce' : 'text-gray-500'
                }`}>
                  {i + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 py-2.5 pr-4">
                  <span className={`text-sm text-anthracite ${moi ? 'font-semibold' : 'font-medium'}`}>{p?.pseudo ?? '-'}</span>
                  {e.topic_tag && (
                    <span className="bg-sable px-1.5 py-0.5 text-xs text-anthracite/75">{e.topic_tag}</span>
                  )}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
