// =============================================================
// Chantier 91 — mesure avant/après de l'allocation
//
//   C91_OUT=<fichier.json> npx vitest run bench/chantier-91-compare.test.ts
//
// Ignoré sans la variable. Les critères sont recalculés ICI, indépendamment
// des seuils de `allocation.ts`, pour juger l'ancien et le nouvel algorithme
// sur la même grille : seuil d'actifs ⌊3/5·taille⌋ (plancher 3 sans
// modérateur), passifs assis à une table sans modérateur.
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
  let short1 = 0, fail1 = 0, passUnmod = 0
  const tables = r.diagnostics.map(d => {
    const thr = Math.max(d.moderated ? 0 : 3, Math.floor((3 / 5) * d.size))
    if (d.actives < thr) { fail1++; short1 += thr - d.actives }
    const passives = d.size - d.actives
    if (!d.moderated) passUnmod += passives
    return `${d.moderated ? 'M' : 'L'}${d.actives}+${passives}`
  })
  return {
    label: cfg.label,
    tables: tables.join(' '),
    count: r.tables.length,
    short1, fail1, passUnmod,
    fail3: r.diagnostics.filter(d => !d.rule3_ok).length,
    fail4: r.diagnostics.filter(d => !d.rule4_ok).length,
    recordable: r.diagnostics.filter(d => d.recordable).length,
    ms,
  }
}

describe.skipIf(!OUT)('chantier 91 — mesure', () => {
  it('écrit les mesures', () => {
    writeFileSync(OUT!, JSON.stringify(C91_SCENARIOS.map(measure), null, 2))
  }, 120_000)
})
