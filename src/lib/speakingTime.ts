import type { Participant, SpeakingTurn } from './types'

export interface SpeakingShare { ms: number; pct: number }

/**
 * Temps de parole cumulé de chaque participant et sa part du total de la table.
 * Source unique : ParticipantsTable et les files (QueuePanel) l'appellent, pour
 * que les chiffres soient identiques. `now` sert au tour en cours (non terminé).
 */
export function speakingShares(
  participants: Pick<Participant, 'id'>[],
  speakingTurns: Pick<SpeakingTurn, 'participant_id' | 'started_at' | 'ended_at'>[],
  now: number,
): { byId: Map<string, SpeakingShare>; total: number } {
  const ms = new Map<string, number>(participants.map(p => [p.id, 0]))
  for (const t of speakingTurns) {
    if (!ms.has(t.participant_id)) continue
    const start = new Date(t.started_at).getTime()
    const end = t.ended_at ? new Date(t.ended_at).getTime() : now
    ms.set(t.participant_id, ms.get(t.participant_id)! + Math.max(0, end - start))
  }
  let total = 0
  ms.forEach(v => { total += v })
  const byId = new Map<string, SpeakingShare>()
  ms.forEach((v, id) => byId.set(id, { ms: v, pct: total > 0 ? Math.round((v / total) * 100) : 0 }))
  return { byId, total }
}
