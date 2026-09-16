// =============================================================
// Chantier 92 — coût de l'appairage sur les autres règles
//
//   C92_BENCH=1 npx vitest run bench/chantier-92-compare.test.ts
//
// Ignoré sans la variable. Pour chaque scénario du 91, on appaire 0 %, 20 %
// puis 40 % des actifs, en binômes **du même camp** (cas le plus défavorable à
// l'hétérogénéité, et le plus probable en vrai), et on mesure : grappes
// cassées, tables viables (règle d'hétérogénéité), degré minimal, manque
// d'anciens.
// =============================================================

import { describe, it } from 'vitest'
import { runAllocation, type AllocationMember } from '../src/lib/allocation'
import { buildPopulation, buildModerators } from './allocation-bench'
import { C91_SCENARIOS } from './chantier-91-compare.test'

const RUN = process.env.C92_BENCH === '1'

function sameCampPairs(members: AllocationMember[], ratio: number): [string, string][] {
  const actives = members.filter(m => m.is_active)
  const target = Math.floor((actives.length * ratio) / 2)
  const byCamp = new Map<number | null, AllocationMember[]>()
  for (const m of actives) {
    if (!byCamp.has(m.group_id)) byCamp.set(m.group_id, [])
    byCamp.get(m.group_id)!.push(m)
  }
  const pairs: [string, string][] = []
  for (const list of byCamp.values()) {
    for (let i = 0; i + 1 < list.length && pairs.length < target; i += 2) {
      pairs.push([list[i].member_id, list[i + 1].member_id])
    }
  }
  return pairs
}

describe.skipIf(!RUN)('chantier 92 — comparatif appairage', () => {
  it('tableau', () => {
    const rows: string[] = ['| Scénario | Appairés | Grappes | Cassées | Tables viables | Degré min | Manque anciens |', '|---|---|---|---|---|---|---|']
    for (const cfg of C91_SCENARIOS) {
      const members = buildPopulation(cfg)
      const mods = buildModerators(cfg)
      for (const ratio of [0, 0.2, 0.4]) {
        const r = runAllocation({ moderatorIds: mods.ids, moderatorProfiles: mods.profiles, members, opinionsAvailable: true, pairs: sameCampPairs(members, ratio) })
        const viable = r.diagnostics.filter(d => d.heterogeneity_ok).length
        const degrees = r.diagnostics.map(d => d.heterogeneity_degree).filter((x): x is number => x !== null)
        const minDeg = degrees.length ? Math.min(...degrees) : 0
        const short = r.diagnostics.reduce((s, d) => s + Math.max(0, d.veterans_threshold - d.veterans), 0)
        rows.push(`| ${cfg.label} | ${Math.round(ratio * 100)} % | ${r.clusters.length} | ${r.brokenClusters} | ${viable}/${r.tables.length} | ${minDeg.toFixed(2)} | ${short} |`)
      }
    }
    console.log('\n' + rows.join('\n'))
  })
})
