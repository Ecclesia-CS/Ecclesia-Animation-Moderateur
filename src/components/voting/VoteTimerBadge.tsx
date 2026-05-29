import { useLiveMs } from '../../hooks/useLiveMs'

interface VoteTimerBadgeProps {
  phaseChangedAt: string
  timerMinutes: number
}

export default function VoteTimerBadge({ phaseChangedAt, timerMinutes }: VoteTimerBadgeProps) {
  const now = useLiveMs()
  const deadline = new Date(phaseChangedAt).getTime() + timerMinutes * 60 * 1000
  const remainingMs = deadline - now

  if (remainingMs <= 0) {
    return (
      <span className="text-xs text-orange-600 bg-orange-50 rounded-full px-2 py-0.5">
        Vote bientôt clôturé
      </span>
    )
  }

  const remainingMin = Math.ceil(remainingMs / 60000)

  return (
    <span className="text-xs text-orange-600 bg-orange-50 rounded-full px-2 py-0.5">
      Vote ouvert encore ~{remainingMin} min
    </span>
  )
}
