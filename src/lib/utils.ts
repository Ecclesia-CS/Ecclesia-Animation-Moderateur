import type { Session, Participant, SpeakingTurn } from './types'

/** Extracts a human-readable message from any thrown value (Error, PostgrestError, string…). */
export function extractErr(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** ISO timestamp → value suitable for <input type="datetime-local"> (local time) */
export function toDateTimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** <input type="datetime-local"> value → ISO timestamp */
export function fromDateTimeLocal(dtl: string): string {
  return new Date(dtl).toISOString()
}

/** Génère un CSV UTF-8 (avec BOM pour Excel) exportant session, participants et tours. */
export function generateSessionCSV(
  session: Session,
  participants: Participant[],
  speakingTurns: SpeakingTurn[],
): string {
  const sourceLabel: Record<string, string> = {
    long: 'File longue',
    interactive: 'Coupe file',
    manual: 'Manuel',
  }

  function cell(v: string | number): string {
    if (typeof v === 'number') return String(v)
    return `"${String(v).replace(/"/g, '""')}"`
  }

  const rows: string[] = []

  // En-tête de session
  rows.push(cell('Ecclesia — Export débat'))
  rows.push([cell('Session'), cell(session.join_code), cell('Créé le'), cell(session.created_at)].join(','))
  rows.push('')

  // Résumé participants
  rows.push(cell('PARTICIPANTS'))
  rows.push([cell('Pseudo'), cell('Tours'), cell('Temps total (s)')].join(','))
  for (const p of participants) {
    const turns = speakingTurns.filter(t => t.participant_id === p.id)
    const totalMs = turns.reduce((sum, t) => {
      const start = new Date(t.started_at).getTime()
      const end   = t.ended_at ? new Date(t.ended_at).getTime() : Date.now()
      return sum + Math.max(0, end - start)
    }, 0)
    rows.push([cell(p.pseudo), turns.length, Math.round(totalMs / 1000)].join(','))
  }
  rows.push('')

  // Historique des tours
  rows.push(cell('HISTORIQUE DES TOURS'))
  rows.push([cell('Tour'), cell('Participant'), cell('File'), cell('Démarré à'), cell('Terminé à'), cell('Durée (s)')].join(','))
  const sorted = [...speakingTurns].sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
  )
  sorted.forEach((t, i) => {
    const pseudo = participants.find(p => p.id === t.participant_id)?.pseudo ?? '—'
    const durSec = t.ended_at
      ? Math.round((new Date(t.ended_at).getTime() - new Date(t.started_at).getTime()) / 1000)
      : ''
    rows.push([
      i + 1,
      cell(pseudo),
      cell(sourceLabel[t.source] ?? t.source),
      cell(t.started_at),
      t.ended_at ? cell(t.ended_at) : '',
      durSec,
    ].join(','))
  })

  return '﻿' + rows.join('\n')
}
