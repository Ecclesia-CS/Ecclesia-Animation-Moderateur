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
  const accentBorder = accent === 'teal' ? 'border-teal-500' : 'border-indigo-500'
  const accentText   = accent === 'teal' ? 'text-teal-600'  : 'text-indigo-600'

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 bg-white">
      <div className={`px-4 py-3 border-b border-l-4 ${accentBorder} bg-gray-50 border-b-gray-100`}>
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm text-gray-900">{title}</span>
          <span className={`text-xs ${accentText}`}>
            {entries.length} {entries.length !== 1 ? 'personnes' : 'personne'}
          </span>
        </div>
        {subtitle && (
          <p className="text-xs mt-0.5 text-gray-400">{subtitle}</p>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="px-4 py-4 text-sm italic text-gray-400">File vide</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {entries.map((e, i) => {
              const p = participants.find(x => x.id === e.participant_id)
              return (
                <tr key={e.id} className="border-b last:border-0 border-gray-50">
                  <td className={`px-4 py-2.5 w-8 tabular-nums font-mono text-sm ${
                    i === 0 ? `font-bold ${accentText}` : 'text-gray-400'
                  }`}>
                    {i + 1}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">
                    {p?.pseudo ?? '—'}
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
