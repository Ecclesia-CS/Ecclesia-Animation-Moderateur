// src/hooks/useTranscription.ts
import { useCallback, useEffect, useRef, useState } from 'react'

const CHUNK_DURATION_MS = 12_000

interface UseTranscriptionReturn {
  isRecording: boolean
  connected: boolean
  start: () => Promise<void>
  stop: () => void
}

export function useTranscription(
  backendUrl: string,
  group: string,
): UseTranscriptionReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [connected, setConnected] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const cleanup = useCallback(() => {
    recorderRef.current?.stop()
    recorderRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    wsRef.current?.close()
    wsRef.current = null
    setIsRecording(false)
    setConnected(false)
  }, [])

  useEffect(() => cleanup, [cleanup])

  const start = useCallback(async () => {
    if (!backendUrl || !group) return

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      alert("Accès au microphone refusé.")
      return
    }
    streamRef.current = stream

    const wsUrl = `${backendUrl.replace(/^http/, 'ws')}/ws?group=${group}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    // Reconnexion automatique si la connexion est perdue en cours d'enregistrement
    ws.onclose = () => {
      setConnected(false)
      if (recorderRef.current) {
        setTimeout(() => start(), 2000)
      } else {
        setIsRecording(false)
      }
    }
    ws.onerror = () => {
      setConnected(false)
    }

    // Wait for connection — use a connection-specific timeout
    try {
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          const origOnOpen = ws.onopen
          const origOnError = ws.onerror
          ws.onopen = () => {
            ws.onopen = origOnOpen
            ws.onerror = origOnError
            setConnected(true)
            resolve()
          }
          ws.onerror = () => {
            ws.onopen = origOnOpen
            ws.onerror = origOnError
            reject(new Error('WebSocket connection failed'))
          }
        }),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('WebSocket connection timeout')), 8000)
        ),
      ])
    } catch {
      cleanup()
      return
    }

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    const recorder = new MediaRecorder(stream, { mimeType })
    recorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
        ws.send(e.data)
      }
    }

    recorder.start(CHUNK_DURATION_MS)
    setIsRecording(true)
  }, [backendUrl, group, cleanup])

  const stop = useCallback(() => {
    cleanup()
  }, [cleanup])

  return { isRecording, connected, start, stop }
}
