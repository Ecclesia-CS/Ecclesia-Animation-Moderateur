import { TranscriptLine } from '../types'

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}min` : `${m}min`
}

interface Props {
  lines: TranscriptLine[]
  disabled: boolean
  speakerCount: number
  totalDurationSeconds: number
}

export function ExportButton({ lines, disabled, speakerCount, totalDurationSeconds }: Props) {
  const handleExport = () => {
    const now = new Date()
    const dateStr = now.toLocaleDateString('fr-FR')
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

    const header = [
      `Transcription — ${dateStr} ${timeStr}`,
      `Durée totale : ${formatDuration(totalDurationSeconds)}`,
      `Locuteurs détectés : ${speakerCount}`,
      '─'.repeat(50),
      '',
    ].join('\n')

    const body = lines.map((l) => `${l.timestamp} ${l.speaker} : ${l.text}`).join('\n')

    const content = '﻿' + header + body  // BOM for Excel compatibility
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transcription_${now.toISOString().slice(0, 10)}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <button
      onClick={handleExport}
      disabled={disabled}
      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
    >
      Exporter .txt
    </button>
  )
}
