interface VoteProgressProps {
  voted: number
  total: number
  proposed: number
}

export default function VoteProgress({ voted, total, proposed }: VoteProgressProps) {
  const pct = total === 0 ? 0 : Math.round((voted / total) * 100)

  return (
    <div className="px-4 pt-4 pb-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-indigo-700">
          {voted}/{total} assertions votées
        </span>
        {proposed > 0 && (
          <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
            ✏️ {proposed} proposée{proposed > 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
