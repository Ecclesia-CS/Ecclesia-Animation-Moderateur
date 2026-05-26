import { useEffect, useRef } from 'react'
import { TranscriptLine } from '../types'

interface Props {
  lines: TranscriptLine[]
}

export function TranscriptView({ lines }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines.length])

  if (lines.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        La transcription apparaîtra ici une fois l'enregistrement démarré…
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-1 font-mono text-sm bg-white">
      {lines.map((line, i) => (
        <div key={i} className="flex gap-2 leading-relaxed">
          <span className="text-gray-400 shrink-0 select-none">{line.timestamp}</span>
          <span className="text-indigo-600 font-semibold shrink-0">{line.speaker} :</span>
          <span className="text-gray-800">{line.text}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
