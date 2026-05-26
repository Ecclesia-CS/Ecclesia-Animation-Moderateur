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

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => { setConnected(true); resolve() }
      ws.onerror = () => reject(new Error('WebSocket connection failed'))
    })

    ws.onclose = () => {
      setConnected(false)
      setIsRecording(false)
    }
    ws.onerror = () => {
      setConnected(false)
      setIsRecording(false)
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
  }, [backendUrl, group])

  const stop = useCallback(() => {
    cleanup()
  }, [cleanup])

  return { isRecording, connected, start, stop }
}
