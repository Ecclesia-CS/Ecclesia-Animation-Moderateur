import { useCallback, useEffect, useRef, useState } from 'react'
import { Segment } from '../types'

const WS_URL = 'ws://localhost:8000/ws'
const MAX_RETRIES = 3

export function useWebSocket(onSegments: (segments: Segment[]) => void) {
  const wsRef = useRef<WebSocket | null>(null)
  const retriesRef = useRef(0)
  const onSegmentsRef = useRef(onSegments)
  const [connected, setConnected] = useState(false)

  // Keep ref up to date without recreating connect()
  useEffect(() => {
    onSegmentsRef.current = onSegments
  }, [onSegments])

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL)
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
  }, [])

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
