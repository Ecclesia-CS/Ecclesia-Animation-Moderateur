import type { Session, SessionType } from './types'

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

/**
 * Chantier 134 — chaque mode de séance n'emprunte qu'une partie des phases.
 * Miroir exact de `session_type_allows_phase` (SQL, migration
 * 20260926_chantier134a_modes_de_seance.sql), qui refuse côté serveur toute
 * phase hors séquence : modifier l'un sans l'autre désynchronise la barre
 * de phases du superadmin et la garde de `set_session_phase`.
 */
const PHASE_SEQUENCES: Record<SessionType, Session['phase'][]> = {
  full:   ['draft', 'pre_voting', 'voting', 'allocating', 'debating', 'post_voting', 'closed'],
  debate: ['draft', 'debating', 'closed'],
  poll:   ['draft', 'pre_voting', 'closed'],
}

const PARTICIPANT_STEPS_BY_TYPE: Record<SessionType, Array<{ phase: Session['phase']; number: number; label: string }>> = {
  full: PARTICIPANT_PHASE_STEPS,
  debate: [
    { phase: 'debating', number: 1, label: 'Débat' },
    { phase: 'closed',   number: 2, label: 'Terminé' },
  ],
  poll: [
    { phase: 'pre_voting', number: 1, label: 'Vote' },
    { phase: 'closed',     number: 2, label: 'Résultats' },
  ],
}

export const SESSION_TYPE_LABEL: Record<SessionType, string> = {
  full:   'Séance complète',
  debate: 'Débat simple',
  poll:   'Sondage',
}

/** Frontière DB → front : une ligne sans `session_type` (ancien cache, RPC non migrée) est une séance complète. */
export function sessionTypeOf(session: { session_type?: SessionType | null } | null | undefined): SessionType {
  const t = session?.session_type
  return t === 'debate' || t === 'poll' ? t : 'full'
}

export function phaseSequenceFor(type: SessionType): Session['phase'][] {
  return PHASE_SEQUENCES[type]
}

export function participantPhaseSteps(type: SessionType = 'full') {
  return PARTICIPANT_STEPS_BY_TYPE[type]
}

export function participantPhaseStep(phase: Session['phase'] | null | undefined, type: SessionType = 'full') {
  if (!phase) return null
  return PARTICIPANT_STEPS_BY_TYPE[type].find(s => s.phase === phase) ?? null
}
