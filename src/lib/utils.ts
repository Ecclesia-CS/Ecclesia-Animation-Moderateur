import type { Table, Participant, SpeakingTurn, QuestionnaireExportRow } from './types'

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

/** Génère un CSV UTF-8 (avec BOM pour Excel) exportant table, participants et tours. */
export function generateTableCSV(
  table: Table,
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
  rows.push([cell('Session'), cell(table.join_code), cell('Créé le'), cell(table.created_at)].join(','))
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

export const QUESTIONNAIRE_THEMES = [
  "L'IA : encadrer ou accélérer ?",
  "Faut-il envoyer plus de satellites dans l'espace ?",
  "Faut-il privatiser des services publics essentiels ?",
  "La publicité : quel rôle devrait-elle avoir dans notre société ?",
  "IA : un salaire universel pour compenser l'augmentation de la productivité et la destruction des emplois ?",
  "Quels sont les indicateurs pertinents pour les politiques publiques ? (PIB ?)",
  "Comment allier la production/exportation des produits qui participent au réchauffement climatique ?",
  "Quelles politiques par rapport aux substances addictives ?",
  "Avion : quel futur pour l'industrie du voyage ?",
  "Algorithme de recommandation : comment les réglementer pour lutter contre la polarisation et l'ingérence de puissances étrangères dans notre vie politique ?",
  "Médias traditionnels : quels financements pour assurer leur indépendance (états et milliardaires) ?",
  "Taxe carbone : quelles propriétés pour aider à la transition écologique et sociale ?",
  "Faut-il réquisitionner les logements inoccupés pour loger tout le monde ?",
  "Quelle responsabilité individuelle pour travailler dans l'armement ?",
  "Quel système de financement pour quel type de retraite ?",
  "Comment peut-on réformer le système éducatif ?",
  "Grande distribution : faut-il réglementer l'oligopole ?",
  "Agriculteurs : comment protéger une profession si vitale ?",
  "Comment réformer l'hôpital public ?",
  "Quelle place pour la laïcité ?",
  "Faut-il que la France mette en place une réparation historique ?",
  "Quelle place pour la souffrance animale dans notre relation au vivant ?",
  "Doit-on s'écarter de l'Europe ou au contraire s'en rapprocher ?",
  "Le nationalisme est-il une bonne chose ?",
  "Dépenses publiques / retraite : comment gérer leur évolution ?",
  "Quel multiculturalisme voulons-nous ?",
]

/** Génère un CSV UTF-8 (avec BOM pour Excel) exportant les réponses au questionnaire. */
export function generateQuestionnaireCSV(rows: QuestionnaireExportRow[]): string {
  function cell(v: string | number | null | undefined): string {
    if (v === null || v === undefined || v === '') return ''
    if (typeof v === 'number') return String(v)
    return `"${String(v).replace(/"/g, '""')}"`
  }

  const csvRows: string[] = []

  // En-tête
  const header = [
    cell('Date'),
    cell('Séance'),
    cell('Code table'),
    cell('Débat suivi'),
    cell('Note débat'),
    cell('Idées de thèmes'),
    cell('Intérêt staffing'),
    cell('Retour libre'),
    ...QUESTIONNAIRE_THEMES.map(t => cell(t)),
  ]
  csvRows.push(header.join(','))

  for (const r of rows) {
    const date = new Date(r.created_at).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
    const row = [
      cell(date),
      cell(r.session_title ?? '—'),
      cell(r.table_join_code ?? '—'),
      cell(r.debate_attended),
      r.debate_rating !== null ? r.debate_rating : '',
      cell(r.theme_ideas),
      cell(r.staff_interest),
      cell(r.feedback),
      ...QUESTIONNAIRE_THEMES.map(t => {
        const v = r.theme_ratings?.[t]
        return v !== undefined ? v : ''
      }),
    ]
    csvRows.push(row.join(','))
  }

  return '﻿' + csvRows.join('\n')
}
