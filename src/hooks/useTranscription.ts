// src/hooks/useTranscription.ts
import { useCallback, useEffect, useRef, useState } from 'react'

const CHUNK_DURATION_MS = 12_000
const RECONNECT_DELAY_MS = 2_000
const CONNECT_TIMEOUT_MS = 8_000

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
  // true tant que l'utilisateur n'a pas cliqué "stop"
  const activeRef = useRef(false)

  const cleanup = useCallback(() => {
    activeRef.current = false
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

  // Ouvre (ou rouvre) uniquement le WebSocket, sans toucher au MediaRecorder.
  const connectWs = useCallback(() => {
    if (!activeRef.current) return

    const wsUrl = `${backendUrl.replace(/^http/, 'ws')}/ws?group=${group}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      if (!activeRef.current) { ws.close(); return }
      setConnected(true)
      // Rewire le MediaRecorder vers ce nouveau WebSocket
      if (recorderRef.current) {
        recorderRef.current.ondataavailable = (e) => {
          if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(e.data)
        }
      }
    }

    ws.onclose = () => {
      setConnected(false)
      if (activeRef.current) {
        setTimeout(connectWs, RECONNECT_DELAY_MS)
      } else {
        setIsRecording(false)
      }
    }

    ws.onerror = () => {
      setConnected(false)
    }
  }, [backendUrl, group])

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
    activeRef.current = true

    // Connexion initiale avec timeout
    const wsUrl = `${backendUrl.replace(/^http/, 'ws')}/ws?group=${group}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    try {
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          ws.onopen = () => { setConnected(true); resolve() }
          ws.onerror = () => reject(new Error('WebSocket connection failed'))
        }),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('WebSocket connection timeout')), CONNECT_TIMEOUT_MS)
        ),
      ])
    } catch {
      cleanup()
      return
    }

    ws.onclose = () => {
      setConnected(false)
      if (activeRef.current) setTimeout(connectWs, RECONNECT_DELAY_MS)
      else setIsRecording(false)
    }
    ws.onerror = () => { setConnected(false) }

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    const recorder = new MediaRecorder(stream, { mimeType })
    recorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(e.data)
    }

    recorder.start(CHUNK_DURATION_MS)
    setIsRecording(true)
  }, [backendUrl, group, cleanup, connectWs])

  const stop = useCallback(() => {
    cleanup()
  }, [cleanup])

  return { isRecording, connected, start, stop }
}
