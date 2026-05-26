import { useEffect, useRef } from 'react'

const CHUNK_MS = 12_000
const INTERVAL_MS = 11_000  // starts a new recorder every 11s to create 1s overlap

interface Props {
  isRecording: boolean
  onChunk: (blob: Blob) => void
  onError: (message: string) => void
}

export function AudioCapture({ isRecording, onChunk, onError }: Props) {
  const streamRef = useRef<MediaStream | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    if (!isRecording) {
      intervalRef.current && clearInterval(intervalRef.current)
      timeoutsRef.current.forEach(clearTimeout)
      timeoutsRef.current = []
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      return
    }

    navigator.mediaDevices
      .getUserMedia({ audio: true, video: false })
      .then((stream) => {
        streamRef.current = stream

        const PREFERRED_MIME = 'audio/webm;codecs=opus'
        const mimeType = MediaRecorder.isTypeSupported(PREFERRED_MIME) ? PREFERRED_MIME : ''

        const startRecorder = () => {
          const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {})
          const chunks: Blob[] = []

          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data)
          }

          recorder.onstop = () => {
            if (chunks.length > 0) {
              onChunk(new Blob(chunks, { type: mimeType || 'audio/webm' }))
            }
          }

          recorder.start()

          const t = setTimeout(() => {
            if (recorder.state === 'recording') recorder.stop()
          }, CHUNK_MS)
          timeoutsRef.current.push(t)
        }

        startRecorder()
        intervalRef.current = setInterval(startRecorder, INTERVAL_MS)
      })
      .catch(() => {
        onError("Impossible d'accéder au microphone. Vérifiez les permissions.")
      })

    return () => {
      intervalRef.current && clearInterval(intervalRef.current)
      timeoutsRef.current.forEach(clearTimeout)
      timeoutsRef.current = []
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [isRecording, onChunk, onError])

  return null
}
