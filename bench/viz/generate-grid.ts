// =============================================================
// Outil d'exploration — chantier 91 (allocation v2, passifs)
//
// Précalcule une grille de scénarios avec le VRAI runAllocation (aucune
// réimplémentation) et écrit un JSON consommé par l'artefact HTML.
// Usage : npx vite-node bench/viz/generate-grid.ts > bench/viz/grid.json
// =============================================================

import { runAllocation, TABLE_TOTAL_MAX } from '../../src/lib/allocation'
import { buildPopulation, buildModerators, type ConfigSpec } from '../allocation-bench'

interface Scenario extends ConfigSpec {
  id: string
  sizeCat: 'petite' | 'moyenne' | 'grande'
  activeCat: 'très faible' | 'faible' | 'moitié' | 'forte'
  modCat: string
  note?: string
}

// ── Grille curatée (pas de produit cartésien complet) ─────────
const scenarios: Scenario[] = []

function add(s: Scenario) { scenarios.push(s) }

// -- Petites salles (15-25), en variant part d'actifs et modérateurs --
add({ id: 'p1', label: 'Petite salle · 18 part. · 80% actifs · 1 modé.', n: 18, vetRatio: 0.45, activeRatio: 0.8, consentRatio: 0.9, camps: [1, 1, 1], moderators: 1, sizeCat: 'petite', activeCat: 'forte', modCat: '1' })
add({ id: 'p2', label: 'Petite salle · 20 part. · 50% actifs · 2 modé.', n: 20, vetRatio: 0.4, activeRatio: 0.5, consentRatio: 0.9, camps: [1, 1, 1], moderators: 2, sizeCat: 'petite', activeCat: 'moitié', modCat: '2-3' })
add({ id: 'p3', label: 'Petite salle · 22 part. · 40% actifs · 2 modé.', n: 22, vetRatio: 0.4, activeRatio: 0.4, consentRatio: 0.9, camps: [1, 1, 1], moderators: 2, sizeCat: 'petite', activeCat: 'faible', modCat: '2-3' })
add({ id: 'p4', label: 'Petite salle · 24 part. · 20% actifs · 3 modé.', n: 24, vetRatio: 0.4, activeRatio: 0.2, consentRatio: 0.9, camps: [1, 1, 1], moderators: 3, sizeCat: 'petite', activeCat: 'très faible', modCat: '2-3' })
add({ id: 'p5', label: 'Petite salle · 15 part. · 100% actifs · 1 modé. (table unique)', n: 15, vetRatio: 0.4, activeRatio: 1, consentRatio: 0.9, camps: [1, 1, 1], moderators: 1, sizeCat: 'petite', activeCat: 'forte', modCat: '1', note: 'Sous ou proche du seuil de table unique (≤10 actifs).' })
add({ id: 'p6', label: 'Petite salle · 25 part. · 24% actifs · 4 modé. (surplus)', n: 25, vetRatio: 0.4, activeRatio: 0.24, consentRatio: 0.9, camps: [1, 1, 1], moderators: 4, sizeCat: 'petite', activeCat: 'très faible', modCat: 'surplus', note: 'Plus de modérateurs que de tables possibles : surplus attendu.' })

// -- Salles moyennes (30-60) --
add({ id: 'm1', label: 'Salle moyenne · 30 part. · 20% actifs · 3 modé.', n: 30, vetRatio: 0.4, activeRatio: 0.2, consentRatio: 0.9, camps: [1, 1, 1], moderators: 3, sizeCat: 'moyenne', activeCat: 'très faible', modCat: '2-3', note: 'Cas cité au chantier 91 : une table unique, mais modérateurs en surplus → dépassement de 30.' })
add({ id: 'm2', label: 'Salle moyenne · 40 part. · 40% actifs · 4 modé.', n: 40, vetRatio: 0.4, activeRatio: 0.4, consentRatio: 0.9, camps: [1, 1, 1], moderators: 4, sizeCat: 'moyenne', activeCat: 'faible', modCat: '4-6' })
add({ id: 'm3', label: 'Salle moyenne · 47 part. · 60% actifs · 4 modé.', n: 47, vetRatio: 0.4, activeRatio: 0.6, consentRatio: 0.9, camps: [1, 1, 1], moderators: 4, sizeCat: 'moyenne', activeCat: 'moitié', modCat: '4-6' })
add({ id: 'm4', label: 'Salle moyenne · 50 part. · 80% actifs · 3 modé.', n: 50, vetRatio: 0.4, activeRatio: 0.8, consentRatio: 0.9, camps: [0.5, 0.3, 0.2], moderators: 3, sizeCat: 'moyenne', activeCat: 'forte', modCat: '2-3' })
add({ id: 'm5', label: 'Salle moyenne · 60 part. · 50% actifs · 4 modé.', n: 60, vetRatio: 0.4, activeRatio: 0.5, consentRatio: 1, camps: [1, 1, 1], moderators: 4, sizeCat: 'moyenne', activeCat: 'moitié', modCat: '4-6' })
add({ id: 'm6', label: 'Salle moyenne · 60 part. · 80% actifs · 4 modé.', n: 60, vetRatio: 0.4, activeRatio: 0.8, consentRatio: 0.9, camps: [0.45, 0.35, 0.2], moderators: 4, sizeCat: 'moyenne', activeCat: 'forte', modCat: '4-6' })
add({ id: 'm7', label: 'Salle moyenne · 60 part. · 40% actifs · 2 modé.', n: 60, vetRatio: 0.3, activeRatio: 0.4, consentRatio: 0.9, camps: [0.45, 0.35, 0.2], moderators: 2, sizeCat: 'moyenne', activeCat: 'faible', modCat: '1' })
add({ id: 'm8', label: 'Salle moyenne · 38 part. · 60% actifs · 0 modé. (leaderless)', n: 38, vetRatio: 0.35, activeRatio: 0.6, consentRatio: 0.9, camps: [1, 1, 1], moderators: 0, sizeCat: 'moyenne', activeCat: 'moitié', modCat: '0', note: "Cas non représentatif (Jules, 18/09 : il y a toujours au moins 1-2 modérateurs) — conservé pour illustrer le trou du plancher à 6 sans modérateur du tout, voir le commentaire sur UNMODERATED_TABLE_MIN." })
add({ id: 'm9', label: 'Salle moyenne · 45 part. · 50% actifs · 6 modé. (surplus)', n: 45, vetRatio: 0.4, activeRatio: 0.5, consentRatio: 0.9, camps: [1, 1, 1], moderators: 6, sizeCat: 'moyenne', activeCat: 'moitié', modCat: 'surplus' })

// -- Grandes salles (80-150) --
add({ id: 'g1', label: 'Grande salle · 90 part. · 40% actifs · 5 modé.', n: 90, vetRatio: 0.35, activeRatio: 0.4, consentRatio: 0.9, camps: [0.4, 0.35, 0.25], moderators: 5, sizeCat: 'grande', activeCat: 'faible', modCat: '4-6' })
add({ id: 'g2', label: 'Grande salle · 120 part. · 60% actifs · 6 modé.', n: 120, vetRatio: 0.3, activeRatio: 0.6, consentRatio: 0.9, camps: [0.4, 0.35, 0.25], moderators: 6, sizeCat: 'grande', activeCat: 'moitié', modCat: '4-6' })
add({ id: 'g3', label: 'Grande salle · 120 part. · 20% actifs · 4 modé.', n: 120, vetRatio: 0.4, activeRatio: 0.2, consentRatio: 0.9, camps: [1, 1, 1], moderators: 4, sizeCat: 'grande', activeCat: 'très faible', modCat: '4-6', note: 'Beaucoup de public à répartir sur peu de tables animées.' })
add({ id: 'g4', label: 'Grande salle · 150 part. · 80% actifs · 8 modé.', n: 150, vetRatio: 0.4, activeRatio: 0.8, consentRatio: 0.9, camps: [0.45, 0.35, 0.2], moderators: 8, sizeCat: 'grande', activeCat: 'forte', modCat: '4-6' })
add({ id: 'g5', label: 'Grande salle · 200 part. · 60% actifs · 8 modé.', n: 200, vetRatio: 0.35, activeRatio: 0.6, consentRatio: 0.9, camps: [0.4, 0.35, 0.25], moderators: 8, sizeCat: 'grande', activeCat: 'moitié', modCat: '4-6' })
add({ id: 'g6', label: 'Grande salle · 100 part. · 50% actifs · 1 modé.', n: 100, vetRatio: 0.4, activeRatio: 0.5, consentRatio: 0.9, camps: [1, 1, 1], moderators: 1, sizeCat: 'grande', activeCat: 'moitié', modCat: '1' })

// -- Variations secondaires --
add({ id: 's1', label: 'Peu d\'anciens · 40 part. · 10% anciens · 4 modé.', n: 40, vetRatio: 0.1, activeRatio: 0.5, consentRatio: 0.9, camps: [1, 1, 1], moderators: 4, sizeCat: 'moyenne', activeCat: 'moitié', modCat: '4-6', note: 'Règle 3 (anciens) structurellement insatisfaisable — dégradation attendue.' })
add({ id: 's2', label: 'Camp dominant · 35 part. · camps 80/15/5 · 3 modé.', n: 35, vetRatio: 0.4, activeRatio: 0.5, consentRatio: 0.9, camps: [0.8, 0.15, 0.05], moderators: 3, sizeCat: 'petite', activeCat: 'moitié', modCat: '2-3', note: 'Règle 2 (hétérogénéité) difficilement atteignable.' })
add({ id: 's3', label: 'Beaucoup de non-consentants · 33 part. · 60% consentants · 3 modé.', n: 33, vetRatio: 0.4, activeRatio: 0.5, consentRatio: 0.6, camps: [1, 1, 1], moderators: 3, sizeCat: 'petite', activeCat: 'moitié', modCat: '2-3', note: 'Règle 1 (table enregistrable) sous tension.' })
add({ id: 's4', label: '2 enregistreurs demandés · 45 part. · 3 modé.', n: 45, vetRatio: 0.4, activeRatio: 0.5, consentRatio: 0.85, camps: [1, 1, 1], moderators: 3, recorders: 2, sizeCat: 'moyenne', activeCat: 'moitié', modCat: '2-3' })
add({ id: 's5', label: '3 enregistreurs demandés · 90 part. · 60% actifs · 5 modé.', n: 90, vetRatio: 0.4, activeRatio: 0.6, consentRatio: 0.85, camps: [0.45, 0.35, 0.2], moderators: 5, recorders: 3, sizeCat: 'grande', activeCat: 'moitié', modCat: '4-6' })
add({ id: 's6', label: 'Analyse des camps indisponible · 34 part. · 3 modé.', n: 34, vetRatio: 0.4, activeRatio: 0.5, consentRatio: 0.9, camps: [1], moderators: 3, opinions: false, sizeCat: 'moyenne', activeCat: 'moitié', modCat: '2-3', note: 'Pas de vote préalable : règle 2 désactivée.' })
add({ id: 's7', label: 'Juste au-dessus du seuil de table unique · 25 part. · 44% actifs · 1 modé.', n: 25, vetRatio: 0.36, activeRatio: 0.44, consentRatio: 0.9, camps: [1, 1, 1], moderators: 1, sizeCat: 'petite', activeCat: 'faible', modCat: '1' })

// ── Calcul ─────────────────────────────────────────────────────

function run(cfg: ConfigSpec) {
  const members = buildPopulation(cfg)
  const mods = buildModerators(cfg)
  const t0 = performance.now()
  const r = runAllocation({
    members,
    moderatorIds: mods.ids,
    moderatorProfiles: mods.profiles,
    opinionsAvailable: cfg.opinions ?? true,
    recorderCount: cfg.recorders ?? 1,
  })
  const ms = Math.round(performance.now() - t0)
  return { r, ms, members, mods }
}

function explain(cfg: Scenario, r: ReturnType<typeof run>['r']): string {
  const bits: string[] = []
  if (r.singleTable) {
    bits.push(`Une seule table : ${r.diagnostics[0]?.actives ?? 0} actif(s) au total, sous ou proche du seuil de 10 qui déclenche l'allocation.`)
  } else {
    const T = r.tables.length
    const moderatedN = r.tables.filter(t => t.moderated).length
    bits.push(`${T} table(s), dont ${moderatedN} animée(s) et ${T - moderatedN} sans modérateur.`)
  }
  if (r.seatedModeratorIds.length > 0) {
    bits.push(`${r.seatedModeratorIds.length} modérateur(s) en surplus assis comme participants actifs (aucune table à animer pour eux).`)
  }
  const failHet = r.diagnostics.filter(d => !d.heterogeneity_ok).length
  const failVet = r.diagnostics.filter(d => !d.veterans_ok).length
  const okRecord = r.diagnostics.filter(d => d.recordable).length
  if (failHet === 0 && r.diagnostics.some(d => d.majority_share !== null)) {
    bits.push(`Règle 2 (hétérogénéité) tenue sur toutes les tables.`)
  } else if (failHet > 0) {
    bits.push(`Règle 2 (hétérogénéité) non tenue sur ${failHet} table(s) — camp trop dominant dans la population.`)
  }
  if (failVet === 0) {
    bits.push(`Règle 3 (anciens) tenue partout.`)
  } else {
    bits.push(`Règle 3 (anciens) non tenue sur ${failVet} table(s) — pas assez d'anciens dans la salle pour la satisfaire partout.`)
  }
  bits.push(`${okRecord} table(s) enregistrable(s) sur un objectif de ${r.recorderTarget}.`)
  const over = r.diagnostics.filter(d => d.over_capacity)
  if (over.length > 0) {
    bits.push(`⚠️ ${over.length} table(s) dépassent ${TABLE_TOTAL_MAX} personnes (limite physique).`)
  }
  return bits.join(' ')
}

const out = scenarios.map(cfg => {
  const { r, ms } = run(cfg)
  return {
    id: cfg.id,
    label: cfg.label,
    sizeCat: cfg.sizeCat,
    activeCat: cfg.activeCat,
    modCat: cfg.modCat,
    note: cfg.note ?? null,
    input: {
      n: cfg.n, vetRatio: cfg.vetRatio, activeRatio: cfg.activeRatio,
      consentRatio: cfg.consentRatio, camps: cfg.camps, moderators: cfg.moderators,
      recorders: cfg.recorders ?? 1, opinions: cfg.opinions ?? true,
    },
    result: {
      tables: r.tables.map((t, i) => ({
        table_number: t.table_number,
        moderated: t.moderated,
        moderator_count: t.moderator_member_ids.length,
        member_count: t.member_ids.length,
        audience_count: t.audience_member_ids.length,
        diag: r.diagnostics[i],
      })),
      warnings: r.warnings,
      singleTable: r.singleTable,
      moderatorCapacity: r.moderatorCapacity,
      animatingModerators: r.animatingModerators,
      seatedModerators: r.seatedModeratorIds.length,
      recorderTarget: r.recorderTarget,
    },
    explanation: explain(cfg, r),
    ms,
  }
})

process.stdout.write(JSON.stringify(out, null, 1))
