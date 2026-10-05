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
        <span className="text-sm font-semibold tabular-nums text-bleu-fonce">
          {voted}/{total} assertions votées
        </span>
        {proposed > 0 && (
          <span className="text-xs text-gray-600 bg-white border border-bleu-fonce/10 px-2 py-0.5">
            ✏️ {proposed} proposée{proposed > 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="w-full bg-bleu-fonce/10 h-1.5">
        <div
          className="bg-indigo-600 h-1.5 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
