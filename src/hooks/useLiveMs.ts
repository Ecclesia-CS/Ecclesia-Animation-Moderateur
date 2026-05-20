import { useEffect, useState } from 'react'

/**
 * Returns Date.now() and refreshes every 500 ms.
 * Use it to compute elapsed time as: now - new Date(startedAt).getTime()
 * Never increment a variable — always read the real clock.
 */
export function useLiveMs(): number {
  const [ms, setMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setMs(Date.now()), 500)
    return () => clearInterval(id)
  }, [])
  return ms
}
