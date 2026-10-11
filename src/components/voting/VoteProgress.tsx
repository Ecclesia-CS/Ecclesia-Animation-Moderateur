interface VoteProgressProps {
  voted: number
  total: number
  proposed: number
  /** Libellé après « X/Y » — défaut « assertions votées » ; le vote par consentement dit « options avec ton avis ». */
  label?: string
}

export default function VoteProgress({ voted, total, proposed, label = 'assertions votées' }: VoteProgressProps) {
  const pct = total === 0 ? 0 : Math.round((voted / total) * 100)

  return (
    <div className="rounded-[12px] border border-bleu-fonce/10 bg-white px-4 py-3.5 shadow-sm animate-montee">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-sm font-semibold tabular-nums text-bleu-fonce">
          {voted}/{total} {label}
        </span>
        {proposed > 0 && (
          <span className="rounded-[6px] text-xs text-gray-600 bg-white border border-bleu-fonce/10 px-2 py-0.5">
            ✏️ {proposed} proposée{proposed > 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="w-full bg-bleu-fonce/10 h-1.5 overflow-hidden">
        <div
          className="bg-gradient-to-r from-bleu-fonce to-bleu-clair h-1.5 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
