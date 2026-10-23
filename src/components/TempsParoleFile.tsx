import { useTable } from '../context/TableContext'
import { useLiveMs } from '../hooks/useLiveMs'
import { speakingShares } from '../lib/speakingTime'
import { formatDuration } from '../lib/utils'

/** Temps de parole d'une personne dans la table (même calcul que ParticipantsTable).
 *  Composant feuille : c'est lui seul qui se rafraîchit toutes les 500 ms. */
export default function TempsParoleFile({ participantId }: { participantId: string }) {
  const { participants, speakingTurns } = useTable()
  const now = useLiveMs()
  const s = speakingShares(participants, speakingTurns, now).byId.get(participantId) ?? { ms: 0, pct: 0 }
  return (
    <span
      className="flex shrink-0 items-center gap-2"
      title="Temps de parole à la table"
    >
      <span className="sr-only">Temps de parole à la table : </span>
      <span className="text-xs tabular-nums text-slate-200">{formatDuration(s.ms)}</span>
      <span aria-hidden="true" className="hidden h-1.5 w-10 overflow-hidden bg-white/10 sm:block">
        <span className="block h-full bg-bleu-clair transition-all duration-500" style={{ width: `${s.pct}%` }} />
      </span>
      <span className="w-8 text-right text-xs tabular-nums text-slate-300">{s.pct}%</span>
    </span>
  )
}
