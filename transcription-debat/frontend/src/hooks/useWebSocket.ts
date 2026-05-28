import { useCallback, useEffect, useRef, useState } from 'react'
import { Segment } from '../types'

const MAX_RETRIES = 3

export function useWebSocket(onSegments: (segments: Segment[]) => void, group: string) {
  const wsRef = useRef<WebSocket | null>(null)
  const retriesRef = useRef(0)
  const onSegmentsRef = useRef(onSegments)
  const [connected, setConnected] = useState(false)

  // Keep ref up to date without recreating connect()
  useEffect(() => {
    onSegmentsRef.current = onSegments
  }, [onSegments])

  const connect = useCallback(() => {
    const encodedGroup = encodeURIComponent(group)
    const ws = new WebSocket(`ws://localhost:8000/ws?group=${encodedGroup}`)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      retriesRef.current = 0
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string)
        if (Array.isArray(data.segments)) {
          onSegmentsRef.current(data.segments)
        }
      } catch {
        // malformed message, ignored
      }
    }

    ws.onclose = () => {
      setConnected(false)
      if (retriesRef.current < MAX_RETRIES) {
        retriesRef.current++
        setTimeout(connect, 1000 * retriesRef.current)
      }
    }

    ws.onerror = () => ws.close()
  }, [group])

  useEffect(() => {
    connect()
    return () => {
      retriesRef.current = MAX_RETRIES // prevent retry on unmount
      wsRef.current?.close()
    }
  }, [connect])

  const send = useCallback((data: Blob) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data)
    }
  }, [])

  return { send, connected }
}
