import { describe, expect, it } from 'vitest'
import { effectiveTablePhase, isConsentPoll, tableDebateEnded } from './phaseLabels'

// Chantier 160 — le mode consentement n'existe que pour un sondage ; tout le reste
// (colonne absente d'un blob relu d'avant, autre type) garde le comportement historique.
describe('isConsentPoll', () => {
  it('vrai pour un sondage en consentement', () => {
    expect(isConsentPoll({ session_type: 'poll', poll_mode: 'consent' })).toBe(true)
  })

  it('faux pour un sondage à camps, explicite ou par défaut', () => {
    expect(isConsentPoll({ session_type: 'poll', poll_mode: 'camps' })).toBe(false)
    expect(isConsentPoll({ session_type: 'poll' })).toBe(false)
  })

  it('faux hors sondage, même si la colonne dit consentement', () => {
    expect(isConsentPoll({ session_type: 'full', poll_mode: 'consent' })).toBe(false)
    expect(isConsentPoll({ session_type: 'debate', poll_mode: 'consent' })).toBe(false)
    expect(isConsentPoll({ poll_mode: 'consent' })).toBe(false)
  })

  it('faux pour une valeur inconnue ou une séance absente', () => {
    expect(isConsentPoll({ session_type: 'poll', poll_mode: 'autre' })).toBe(false)
    expect(isConsentPoll(null)).toBe(false)
    expect(isConsentPoll(undefined)).toBe(false)
  })
})

// Chantier 161 — miroir de table_effective_phase (SQL) : la séance l'emporte
// dès qu'elle quitte 'debating' ; une table terminée passe en post-vote
// (séance complète) ou en fin (débat simple).
describe('effectiveTablePhase', () => {
  const ended = { debate_ended_at: '2026-10-08T10:00:00Z' }
  const open = { debate_ended_at: null }

  it('table qui débat : phase de séance', () => {
    expect(effectiveTablePhase({ phase: 'debating', session_type: 'full' }, open)).toBe('debating')
    expect(effectiveTablePhase({ phase: 'debating', session_type: 'full' }, null)).toBe('debating')
  })

  it('table terminée en séance complète : post-vote', () => {
    expect(effectiveTablePhase({ phase: 'debating', session_type: 'full' }, ended)).toBe('post_voting')
    expect(effectiveTablePhase({ phase: 'debating' }, ended)).toBe('post_voting')
  })

  it('table terminée en débat simple : fin', () => {
    expect(effectiveTablePhase({ phase: 'debating', session_type: 'debate' }, ended)).toBe('closed')
  })

  it('la séance l\'emporte hors débat', () => {
    expect(effectiveTablePhase({ phase: 'post_voting', session_type: 'full' }, ended)).toBe('post_voting')
    expect(effectiveTablePhase({ phase: 'closed', session_type: 'full' }, ended)).toBe('closed')
    expect(effectiveTablePhase({ phase: 'allocating', session_type: 'full' }, ended)).toBe('allocating')
  })

  it('sans séance : null', () => {
    expect(effectiveTablePhase(null, ended)).toBeNull()
  })

  it('tableDebateEnded seulement pendant le débat de séance', () => {
    expect(tableDebateEnded({ phase: 'debating' }, ended)).toBe(true)
    expect(tableDebateEnded({ phase: 'debating' }, open)).toBe(false)
    expect(tableDebateEnded({ phase: 'post_voting' }, ended)).toBe(false)
  })
})
