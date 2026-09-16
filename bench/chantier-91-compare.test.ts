// =============================================================
// Chantier 91 — mesure avant/après de l'allocation
//
//   C91_OUT=<fichier.json> npx vitest run bench/chantier-91-compare.test.ts
//
// Ignoré sans la variable. Tables décrites en « actifs+passifs » recalculés
// ici, pour comparer l'ancien et le nouvel algorithme sur la même grille.
// =============================================================

import { describe, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { runAllocation } from '../src/lib/allocation'
import { buildPopulation, buildModerators, type ConfigSpec } from './allocation-bench'

const OUT = process.env.C91_OUT

export const C91_SCENARIOS: ConfigSpec[] = [
  { label: '30 part. · 50 % actifs · 3 modé.', n: 30, vetRatio: 0.4, activeRatio: 0.5, consentRatio: 0.9, camps: [1, 1, 1], moderators: 3 },
  { label: '47 part. · 60 % actifs · 4 modé.', n: 47, vetRatio: 0.4, activeRatio: 0.6, consentRatio: 0.9, camps: [1, 1, 1], moderators: 4 },
  { label: '60 part. · 50 % actifs · 4 modé.', n: 60, vetRatio: 0.4, activeRatio: 0.5, consentRatio: 1, camps: [1, 1, 1], moderators: 4 },
  { label: '60 part. · 80 % actifs · 4 modé.', n: 60, vetRatio: 0.4, activeRatio: 0.8, consentRatio: 0.9, camps: [0.45, 0.35, 0.2], moderators: 4 },
  { label: '60 part. · 40 % actifs · 2 modé.', n: 60, vetRatio: 0.3, activeRatio: 0.4, consentRatio: 0.9, camps: [0.45, 0.35, 0.2], moderators: 2 },
  { label: '38 part. · 60 % actifs · 0 modé.', n: 38, vetRatio: 0.35, activeRatio: 0.6, consentRatio: 0.9, camps: [1, 1, 1], moderators: 0 },
  { label: '30 part. · 20 % actifs · 3 modé.', n: 30, vetRatio: 0.4, activeRatio: 0.2, consentRatio: 0.9, camps: [1, 1, 1], moderators: 3 },
  { label: '120 part. · 60 % actifs · 6 modé.', n: 120, vetRatio: 0.3, activeRatio: 0.6, consentRatio: 0.9, camps: [0.4, 0.35, 0.25], moderators: 6 },
  { label: '200 part. · 60 % actifs · 8 modé.', n: 200, vetRatio: 0.35, activeRatio: 0.6, consentRatio: 0.9, camps: [0.4, 0.35, 0.25], moderators: 8 },
]

function measure(cfg: ConfigSpec) {
  const members = buildPopulation(cfg)
  const mods = buildModerators(cfg)
  const t0 = performance.now()
  const r = runAllocation({
    members, moderatorIds: mods.ids, moderatorProfiles: mods.profiles,
    opinionsAvailable: cfg.opinions ?? true, recorderCount: cfg.recorders ?? 1,
  })
  const ms = Math.round(performance.now() - t0)
  // Diagnostics recalculés à l'identique pour « avant » et « après » : actifs
  // = is_active (un modérateur assis compte comme actif), public = le reste.
  const byId = new Map([...members, ...mods.profiles].map(m => [m.member_id, m]))
  let passUnmod = 0
  let over = 0
  const tables = r.tables.map(t => {
    const a = t.member_ids.filter(id => byId.get(id)?.is_active).length
    const p = t.member_ids.length - a
    if (!t.moderated) passUnmod += p
    if (t.member_ids.length > 30) over++
    return `${t.moderated ? 'M' : 'L'}${a}+${p}`
  })
  const d = r.diagnostics as unknown as Record<string, unknown>[]
  const ko = (newKey: string, oldKey: string) => d.filter(x => (x[newKey] ?? x[oldKey]) === false).length
  return {
    label: cfg.label,
    tables: tables.join(' '),
    count: r.tables.length,
    passUnmod, over,
    fail3: ko('heterogeneity_ok', 'rule3_ok'),
    fail4: ko('veterans_ok', 'rule4_ok'),
    recordable: r.diagnostics.filter(x => x.recordable).length,
    ms,
  }
}

describe.skipIf(!OUT)('chantier 91 — mesure', () => {
  it('écrit les mesures', () => {
    writeFileSync(OUT!, JSON.stringify(C91_SCENARIOS.map(measure), null, 2))
  }, 120_000)
})
