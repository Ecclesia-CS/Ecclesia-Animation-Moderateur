// =============================================================
// Chantier 29 — garde-fous applicables à CHAQUE stratégie candidate.
//
// Ces contrôles doivent tenir avant même de discuter du choix : une piste qui
// les casse est éliminée d'office, quel que soit son comportement sur les
// scénarios. Ils tournent avec `npm test` (contrairement au banc d'essai).
// =============================================================

import { describe, it, expect } from 'vitest'
import {
  runAllocation,
  STRATEGY_LEGACY,
  STRATEGY_ABSOLUTE_ONLY,
  STRATEGY_STRONG_SEARCH_ONLY,
  STRATEGY_ABSOLUTE_STRONG,
  TABLE_MIN,
  TABLE_OVERFLOW_MAX,
  type AllocationMember,
  type AllocationStrategy,
} from '../src/lib/allocation'

const CANDIDATES: [string, AllocationStrategy][] = [
  ['A · actuel', STRATEGY_LEGACY],
  ['B · absolue seule', STRATEGY_ABSOLUTE_ONLY],
  ['C · recherche fiabilisée', STRATEGY_STRONG_SEARCH_ONLY],
  ['D · absolue + recherche', STRATEGY_ABSOLUTE_STRONG],
]

function population(n: number): AllocationMember[] {
  return Array.from({ length: n }, (_, i) => ({
    member_id: `b-${i}`,
    pseudo: `b${i}`,
    is_active: i % 2 === 0,
    consents: i % 11 !== 0,
    is_veteran: i % 5 < 2,
    group_id: i % 3,
  }))
}

describe.each(CANDIDATES)('garde-fous — %s', (_label, strategy) => {
  it('déterministe : deux exécutions identiques donnent la même répartition (§6)', () => {
    const members = population(53)
    const opts = { members, moderatorIds: ['mo-1', 'mo-2'], opinionsAvailable: true, strategy }
    const a = runAllocation(opts)
    const b = runAllocation(opts)
    expect(JSON.stringify(a.tables)).toBe(JSON.stringify(b.tables))
  })

  it('ne lève jamais, place tout le monde, respecte les bornes de taille', () => {
    const hostile: AllocationMember[][] = [
      population(11),
      population(37).map(m => ({ ...m, is_active: false })),
      population(37).map(m => ({ ...m, is_veteran: false })),
      population(41).map(m => ({ ...m, group_id: null, consents: false })),
      population(120),
    ]
    for (const members of hostile) {
      const r = runAllocation({ members, moderatorIds: ['mo-1'], opinionsAvailable: true, strategy })
      const ids = r.tables.flatMap(t => t.member_ids)
      expect(new Set(ids).size).toBe(members.length)
      if (!r.singleTable) {
        for (const t of r.tables) {
          expect(t.member_ids.length).toBeGreaterThanOrEqual(TABLE_MIN)
          expect(t.member_ids.length).toBeLessThanOrEqual(TABLE_OVERFLOW_MAX)
        }
      }
    }
  })

  it('200 personnes : calcul sous 5 s (contrainte de latence navigateur)', () => {
    const start = Date.now()
    runAllocation({
      members: population(200),
      moderatorIds: ['a', 'b', 'c', 'd'],
      opinionsAvailable: true,
      strategy,
    })
    const ms = Date.now() - start
    // eslint-disable-next-line no-console
    console.log(`    ${_label} — 200 personnes : ${ms} ms`)
    expect(ms).toBeLessThan(5000)
  })
})
