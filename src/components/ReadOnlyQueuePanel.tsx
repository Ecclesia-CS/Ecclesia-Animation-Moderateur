import type { Participant, QueueEntry } from '../lib/types'

interface Props {
  title: string
  subtitle?: string
  entries: QueueEntry[]
  participants: Participant[]
  accent?: 'indigo' | 'teal'
  /** Participant qui regarde l'écran : sa ligne est surlignée. */
  selfId?: string
}

// Chantier 158 : la colonne de gauche (w-14) est celle des boutons de file de
// ParticipantView, au-dessus. Pastilles, numéros et icônes tombent ainsi sur un
// même axe vertical, et les textes commencent tous au même endroit.
export default function ReadOnlyQueuePanel({
  title, subtitle, entries, participants, accent = 'indigo', selfId,
}: Props) {
  const teal = accent === 'teal'

  return (
    <section className="overflow-hidden border border-bleu-fonce/10 bg-white shadow-sm">
      <div className="flex items-stretch border-b border-bleu-fonce/10">
        <span aria-hidden="true" className="flex w-14 shrink-0 items-center justify-center">
          <span className={`h-2.5 w-2.5 ${teal ? 'bg-teal-600' : 'bg-bleu-fonce'}`} />
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-snug text-anthracite">{title}</p>
            {subtitle && (
              <p className="mt-0.5 text-xs leading-snug text-gray-500">{subtitle}</p>
            )}
          </div>
          {/* Chiffre seul, comme le compteur de « Présents » : le titre garde
              toute la largeur sur un petit téléphone. Le mot reste lu. */}
          <span className={`shrink-0 whitespace-nowrap px-2 py-1 text-xs font-semibold tabular-nums ${
            teal ? 'bg-teal-50 text-teal-800' : 'bg-indigo-50 text-bleu-fonce'
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
                <span className="flex w-14 shrink-0 justify-center py-2.5">
                  <span className={`flex h-6 w-6 items-center justify-center text-xs font-bold tabular-nums ${
                    i === 0
                      ? teal ? 'bg-teal-600 text-white' : 'bg-bleu-fonce text-creme'
                      : 'bg-bleu-fonce/[0.06] text-bleu-fonce/70'
                  }`}>
                    {i + 1}
                  </span>
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
