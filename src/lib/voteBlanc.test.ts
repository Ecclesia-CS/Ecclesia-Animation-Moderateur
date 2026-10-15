// Chantier 169 — vote blanc (question mal formulée) ≠ abstention (pas d'avis).
import { describe, it, expect } from 'vitest'
import { buildVoteMatrix } from './analysis'
import type { VoteRow } from './analysis'
import { canProposeAssertion } from './voting'

const v = (m: string, a: string, vote: VoteRow['vote']): VoteRow => ({ member_id: m, assertion_id: a, vote })

describe('buildVoteMatrix — vote blanc', () => {
  // Seuil actuel : 3 votes réels par assertion, 1 par membre.
  it("n'est pas un vote réel : un membre qui n'a voté que blanc est exclu", () => {
    const votes = [v('m1', 'a1', 'agree'), v('m2', 'a1', 'disagree'), v('m3', 'a1', 'pass'), v('m4', 'a1', 'blank')]
    const r = buildVoteMatrix(votes, ['m1', 'm2', 'm3', 'm4'], ['a1'])
    expect(r.keptMemberIds).toEqual(['m1', 'm2', 'm3'])
  })

  it("l'abstention, elle, reste un vote réel, encodé 0", () => {
    const votes = [v('m1', 'a1', 'agree'), v('m2', 'a1', 'disagree'), v('m3', 'a1', 'pass')]
    const r = buildVoteMatrix(votes, ['m1', 'm2', 'm3'], ['a1'])
    expect(r.keptMemberIds).toEqual(['m1', 'm2', 'm3'])
    expect(r.matrix).toEqual([[1], [-1], [0]])
  })

  it("les blancs ne comptent pas dans le seuil de l'assertion", () => {
    const votes = [v('m1', 'a1', 'agree'), v('m2', 'a1', 'blank'), v('m3', 'a1', 'blank'),
                   v('m1', 'a2', 'agree'), v('m2', 'a2', 'agree'), v('m3', 'a2', 'disagree')]
    const r = buildVoteMatrix(votes, ['m1', 'm2', 'm3'], ['a1', 'a2'])
    expect(r.keptAssertionIds).toEqual(['a2'])
  })
})

describe('canProposeAssertion — vote blanc', () => {
  const base = { assertions_locked: false, assertions_vote_first: true, max_assertions_per_member: null }
  it("lève « voter d'abord »", () => {
    expect(canProposeAssertion(base, { unvotedCount: 3, proposedCount: 0 })).toBe(false)
    expect(canProposeAssertion(base, { unvotedCount: 3, proposedCount: 0, blankCount: 1 })).toBe(true)
  })
  it('ne lève ni le verrou ni le plafond', () => {
    expect(canProposeAssertion({ ...base, assertions_locked: true }, { unvotedCount: 3, proposedCount: 0, blankCount: 1 })).toBe(false)
    expect(canProposeAssertion({ ...base, max_assertions_per_member: 1 }, { unvotedCount: 3, proposedCount: 1, blankCount: 1 })).toBe(false)
  })
})
