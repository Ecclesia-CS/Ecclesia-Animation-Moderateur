import type { Session } from './types'

/**
 * Chantier 39 — nomenclature des phases côté participant, distincte des
 * libellés internes utilisés par le superadmin (PHASE_LABEL dans
 * SuperadminScreen.tsx). `draft` n'apparaît pas ici : une séance en
 * brouillon n'est jamais accessible aux participants.
 *
 * Chantier 89 — `post_voting` insérée entre `debating` et `closed` : le
 * débat terminé n'est plus directement "closed", c'est une phase à part où
 * le participant voit ses résultats et peut revoter (PostVoteScreen). Le
 * passage en `closed` (bouton superadmin dédié) coupe l'accès au revote.
 */
export const PARTICIPANT_PHASE_STEPS: Array<{ phase: Session['phase']; number: number; label: string }> = [
  { phase: 'pre_voting',   number: 1, label: 'Distanciel' },
  { phase: 'voting',       number: 2, label: 'Vote en présentiel' },
  { phase: 'allocating',   number: 3, label: 'Allocation' },
  { phase: 'debating',     number: 4, label: 'Débat' },
  { phase: 'post_voting',  number: 5, label: 'Post-débat' },
  { phase: 'closed',       number: 6, label: 'Résultats' },
]

export function participantPhaseStep(phase: Session['phase'] | null | undefined) {
  if (!phase) return null
  return PARTICIPANT_PHASE_STEPS.find(s => s.phase === phase) ?? null
}
