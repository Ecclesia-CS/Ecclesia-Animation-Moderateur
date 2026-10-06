import type { Participant, QueueEntry } from '../lib/types'

interface Props {
  title: string
  subtitle?: string
  entries: QueueEntry[]
  participants: Participant[]
  accent?: 'indigo' | 'teal'
}

export default function ReadOnlyQueuePanel({
  title, subtitle, entries, participants, accent = 'indigo',
}: Props) {
  const accentBorder = accent === 'teal' ? 'border-l-teal-600' : 'border-l-indigo-600'
  const accentText   = accent === 'teal' ? 'text-teal-700'  : 'text-indigo-500'

  return (
    <div className="overflow-hidden border border-bleu-fonce/10 bg-white">
      <div className={`px-4 py-3 border-b border-l-4 ${accentBorder} bg-gray-50 border-b-bleu-fonce/10`}>
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-sm text-anthracite">{title}</span>
          <span className={`text-xs font-medium tabular-nums whitespace-nowrap shrink-0 ${accentText}`}>
            {entries.length} {entries.length !== 1 ? 'personnes' : 'personne'}
          </span>
        </div>
        {subtitle && (
          <p className="text-xs mt-0.5 text-gray-500">{subtitle}</p>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="px-4 py-4 text-sm italic text-gray-500">File vide</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {entries.map((e, i) => {
              const p = participants.find(x => x.id === e.participant_id)
              return (
                <tr key={e.id} className="border-b last:border-0 border-bleu-fonce/[0.06]">
                  <td className={`px-4 py-2.5 w-8 tabular-nums font-mono text-sm ${
                    i === 0 ? `font-bold ${accentText}` : 'text-gray-500'
                  }`}>
                    {i + 1}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-anthracite">
                    {p?.pseudo ?? '-'}
                    {e.topic_tag && (
                      <span className="ml-2 text-xs font-normal text-gray-500 italic">· {e.topic_tag}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
