import { useLiveMs } from '../hooks/useLiveMs'
import { formatDuration } from '../lib/utils'

interface Props {
  startedAt: string
  className?: string
}

/**
 * Live elapsed timer.
 * Always computed as Date.now() - new Date(startedAt).getTime() — never
 * an incrementing variable.
 */
export default function SpeakerTimer({ startedAt, className = '' }: Props) {
  const now = useLiveMs()
  const elapsed = now - new Date(startedAt).getTime()
  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {formatDuration(elapsed)}
    </span>
  )
}
