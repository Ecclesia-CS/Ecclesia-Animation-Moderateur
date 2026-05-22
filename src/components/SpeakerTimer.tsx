import { useLiveMs } from '../hooks/useLiveMs'
import { formatDuration } from '../lib/utils'

interface Props {
  startedAt: string
  offsetMs?: number
  className?: string
}

export default function SpeakerTimer({ startedAt, offsetMs = 0, className = '' }: Props) {
  const now = useLiveMs()
  const elapsed = now - new Date(startedAt).getTime() + offsetMs
  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {formatDuration(elapsed)}
    </span>
  )
}
