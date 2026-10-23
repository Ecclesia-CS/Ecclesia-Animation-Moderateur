import { describe, it, expect } from 'vitest'
import { speakingShares } from './speakingTime'

describe('speakingShares', () => {
  it('cumule les tours, y compris le tour en cours, et calcule les parts', () => {
    const now = new Date('2026-01-01T00:10:00Z').getTime()
    const turns = [
      { participant_id: 'a', started_at: '2026-01-01T00:00:00Z', ended_at: '2026-01-01T00:03:00Z' },
      { participant_id: 'b', started_at: '2026-01-01T00:03:00Z', ended_at: '2026-01-01T00:04:00Z' },
      { participant_id: 'b', started_at: '2026-01-01T00:09:00Z', ended_at: null },
      { participant_id: 'parti', started_at: '2026-01-01T00:00:00Z', ended_at: '2026-01-01T00:05:00Z' },
    ]
    const { byId, total } = speakingShares([{ id: 'a' }, { id: 'b' }, { id: 'c' }], turns, now)
    expect(byId.get('a')).toEqual({ ms: 180000, pct: 60 })
    expect(byId.get('b')).toEqual({ ms: 120000, pct: 40 })
    expect(byId.get('c')).toEqual({ ms: 0, pct: 0 })
    expect(total).toBe(300000)
  })
})
