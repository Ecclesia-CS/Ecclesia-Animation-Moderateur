import { describe, expect, it } from 'vitest'
import { isConsentPoll } from './phaseLabels'

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
