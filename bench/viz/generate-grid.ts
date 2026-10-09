// =============================================================
// Outil d'exploration — chantier 93 (allocation v2, bornes 7-11)
//
// Précalcule une grille de scénarios avec le VRAI runAllocation (aucune
// réimplémentation) et écrit un JSON consommé par l'artefact HTML.
// Usage : npx vite-node bench/viz/generate-grid.ts > bench/viz/grid.json
//
// Contraintes opérationnelles (Jules, 21/09) :
//  - au plus 6 modérateurs par séance ;
//  - au plus 70 participants au total, modérateurs compris ;
//  - jamais de table sans modérateur — chaque scénario est vérifié après
//    coup contre le vrai résultat, et le nombre de modérateurs est augmenté
//    (jusqu'à 6) si le premier essai laisse une table ∅. Un scénario qui n'y
//    arrive toujours pas à 6 modérateurs est conservé mais marqué comme tel,
//    plutôt que masqué.
// =============================================================

import { runAllocation, TABLE_TOTAL_MAX } from '../../src/lib/allocation'
import { buildPopulation, buildModerators, type ConfigSpec } from '../allocation-bench'

const MAX_MODERATORS = 6
const MAX_ROOM = 70

interface Scenario extends ConfigSpec {
  id: string
  sizeCat: 'petite' | 'moyenne' | 'grande'
  activeCat: 'très faible' | 'faible' | 'moitié' | 'forte'
  modCat: string
  note?: string
}

// ── Recherche du nombre de modérateurs minimal qui évite les tables ∅ ──
// Part de `startMods`, monte jusqu'à MAX_MODERATORS. Si aucun palier ne
// marche, retourne le dernier essai (6 modérateurs) avec `ok = false`.
function solveNoUnmoderated(cfg: Omit<ConfigSpec, 'moderators'>, startMods: number) {
  let last: ReturnType<typeof runAllocation> | null = null
  let usedMods = startMods
  for (let m = startMods; m <= MAX_MODERATORS; m++) {
    const full: ConfigSpec = { ...cfg, moderators: m }
    const members = buildPopulation(full)
    const mods = buildModerators(full)
    const r = runAllocation({
      members, moderatorIds: mods.ids, moderatorProfiles: mods.profiles,
      opinionsAvailable: full.opinions ?? true, recorderCount: full.recorders ?? 1,
    })
    last = r
    usedMods = m
    if (r.tables.every(t => t.moderated)) return { r, moderators: m, ok: true }
  }
  return { r: last!, moderators: usedMods, ok: false }
}

// ── Grille curatée, bornée à 70 participants et 6 modérateurs ────────

const specs: (Omit<Scenario, 'moderators'> & { startMods: number })[] = []
function add(s: Omit<Scenario, 'moderators'> & { startMods: number }) { specs.push(s) }

// -- Petites salles (15-25 participants hors modérateurs) --
add({ id: 'p1', label: 'Petite salle · 20 part. · 80% actifs', n: 20, vetRatio: 0.45, activeRatio: 0.8, consentRatio: 0.9, camps: [1, 1, 1], sizeCat: 'petite', activeCat: 'forte', modCat: '', startMods: 2 })
add({ id: 'p2', label: 'Petite salle · 22 part. · 50% actifs', n: 22, vetRatio: 0.4, activeRatio: 0.5, consentRatio: 0.9, camps: [1, 1, 1], sizeCat: 'petite', activeCat: 'moitié', modCat: '', startMods: 1 })
add({ id: 'p3', label: 'Petite salle · 24 part. · 40% actifs (table unique)', n: 24, vetRatio: 0.4, activeRatio: 0.4, consentRatio: 0.9, camps: [1, 1, 1], sizeCat: 'petite', activeCat: 'faible', modCat: '', startMods: 1, note: 'Actifs ≤ 10 : table unique, quel que soit le nombre de modérateurs.' })
add({ id: 'p4', label: 'Petite salle · 25 part. · 20% actifs (table unique)', n: 25, vetRatio: 0.4, activeRatio: 0.2, consentRatio: 0.9, camps: [1, 1, 1], sizeCat: 'petite', activeCat: 'très faible', modCat: '', startMods: 1, note: 'Peu d’actifs : une seule table, le reste en public.' })
add({ id: 'p5', label: 'Petite salle · 18 part. · 100% actifs', n: 18, vetRatio: 0.4, activeRatio: 1, consentRatio: 0.9, camps: [1, 1, 1], sizeCat: 'petite', activeCat: 'forte', modCat: '', startMods: 2 })
add({ id: 'p6', label: 'Petite salle · 20 part. · 20% actifs · modérateurs en surplus', n: 20, vetRatio: 0.4, activeRatio: 0.2, consentRatio: 0.9, camps: [1, 1, 1], sizeCat: 'petite', activeCat: 'très faible', modCat: '', startMods: 6, note: 'Peu d’actifs mais 6 modérateurs déclarés : la plupart siègent comme participants actifs.' })

// -- Salles moyennes (30-50) --
add({ id: 'm1', label: 'Salle moyenne · 40 part. · 20% actifs (table unique) · modérateurs en surplus', n: 40, vetRatio: 0.4, activeRatio: 0.2, consentRatio: 0.9, camps: [1, 1, 1], sizeCat: 'moyenne', activeCat: 'très faible', modCat: '', startMods: 3 })
add({ id: 'm2', label: 'Salle moyenne · 42 part. · 40% actifs', n: 42, vetRatio: 0.4, activeRatio: 0.4, consentRatio: 0.9, camps: [1, 1, 1], sizeCat: 'moyenne', activeCat: 'faible', modCat: '', startMods: 2 })
add({ id: 'm3', label: 'Salle moyenne · 47 part. · 60% actifs', n: 47, vetRatio: 0.4, activeRatio: 0.6, consentRatio: 0.9, camps: [1, 1, 1], sizeCat: 'moyenne', activeCat: 'moitié', modCat: '', startMods: 3 })
add({ id: 'm4', label: 'Salle moyenne · 50 part. · 80% actifs', n: 50, vetRatio: 0.4, activeRatio: 0.8, consentRatio: 0.9, camps: [0.5, 0.3, 0.2], sizeCat: 'moyenne', activeCat: 'forte', modCat: '', startMods: 4 })
add({ id: 'm5', label: 'Salle moyenne · 50 part. · 50% actifs', n: 50, vetRatio: 0.4, activeRatio: 0.5, consentRatio: 1, camps: [1, 1, 1], sizeCat: 'moyenne', activeCat: 'moitié', modCat: '', startMods: 3 })
add({ id: 'm6', label: 'Salle moyenne · 45 part. · 50% actifs · modérateurs en surplus', n: 45, vetRatio: 0.4, activeRatio: 0.5, consentRatio: 0.9, camps: [1, 1, 1], sizeCat: 'moyenne', activeCat: 'moitié', modCat: '', startMods: 6 })

// -- Grandes salles (55-70, plafond opérationnel) --
add({ id: 'g1', label: 'Grande salle · 60 part. · 40% actifs', n: 60, vetRatio: 0.35, activeRatio: 0.4, consentRatio: 0.9, camps: [0.4, 0.35, 0.25], sizeCat: 'grande', activeCat: 'faible', modCat: '', startMods: 4 })
add({ id: 'g2', label: 'Grande salle · 64 part. · 80% actifs', n: 64, vetRatio: 0.4, activeRatio: 0.8, consentRatio: 0.9, camps: [0.45, 0.35, 0.2], sizeCat: 'grande', activeCat: 'forte', modCat: '', startMods: 5 })
add({ id: 'g3', label: 'Grande salle · 64 part. · 60% actifs', n: 64, vetRatio: 0.35, activeRatio: 0.6, consentRatio: 0.9, camps: [0.4, 0.35, 0.25], sizeCat: 'grande', activeCat: 'moitié', modCat: '', startMods: 4 })
add({ id: 'g4', label: 'Grande salle · 64 part. · 20% actifs · modérateurs en surplus', n: 64, vetRatio: 0.4, activeRatio: 0.2, consentRatio: 0.9, camps: [1, 1, 1], sizeCat: 'grande', activeCat: 'très faible', modCat: '', startMods: 6, note: 'Salle proche du plafond de 70 mais peu d’actifs : test de la limite haute avec 6 modérateurs.' })
add({ id: 'g5', label: 'Grande salle · 64 part. · 50% actifs · plafond des deux limites', n: 64, vetRatio: 0.4, activeRatio: 0.5, consentRatio: 0.9, camps: [1, 1, 1], sizeCat: 'grande', activeCat: 'moitié', modCat: '', startMods: 6, note: '64 + 6 modérateurs = 70 : les deux plafonds opérationnels atteints en même temps.' })
add({ id: 'g6', label: 'Grande salle · 64 part. · 30% actifs', n: 64, vetRatio: 0.35, activeRatio: 0.3, consentRatio: 0.9, camps: [0.4, 0.35, 0.25], sizeCat: 'grande', activeCat: 'faible', modCat: '', startMods: 4 })

// -- Variations secondaires --
add({ id: 's1', label: 'Peu d’anciens · 40 part. · 10% anciens · 50% actifs', n: 40, vetRatio: 0.1, activeRatio: 0.5, consentRatio: 0.9, camps: [1, 1, 1], sizeCat: 'moyenne', activeCat: 'moitié', modCat: '', startMods: 4, note: 'Règle 3 (anciens) structurellement insatisfaisable — dégradation attendue.' })
add({ id: 's2', label: 'Camp dominant · 35 part. · camps 80/15/5', n: 35, vetRatio: 0.4, activeRatio: 0.5, consentRatio: 0.9, camps: [0.8, 0.15, 0.05], sizeCat: 'petite', activeCat: 'moitié', modCat: '', startMods: 3, note: 'Règle 2 (hétérogénéité) difficilement atteignable.' })
add({ id: 's3', label: 'Beaucoup de non-consentants · 33 part. · 60% consentants', n: 33, vetRatio: 0.4, activeRatio: 0.5, consentRatio: 0.6, camps: [1, 1, 1], sizeCat: 'petite', activeCat: 'moitié', modCat: '', startMods: 3, note: 'Règle 1 (table enregistrable) sous tension.' })
add({ id: 's4', label: '2 enregistreurs demandés · 45 part.', n: 45, vetRatio: 0.4, activeRatio: 0.5, consentRatio: 0.85, camps: [1, 1, 1], recorders: 2, sizeCat: 'moyenne', activeCat: 'moitié', modCat: '', startMods: 3 })
add({ id: 's5', label: '3 enregistreurs demandés · 64 part. · 60% actifs', n: 64, vetRatio: 0.4, activeRatio: 0.6, consentRatio: 0.85, camps: [0.45, 0.35, 0.2], recorders: 3, sizeCat: 'grande', activeCat: 'moitié', modCat: '', startMods: 5 })
add({ id: 's6', label: 'Analyse des camps indisponible · 34 part.', n: 34, vetRatio: 0.4, activeRatio: 0.5, consentRatio: 0.9, camps: [1], opinions: false, sizeCat: 'moyenne', activeCat: 'moitié', modCat: '', startMods: 3 })
add({ id: 's7', label: 'Juste au-dessus du seuil de table unique · 22 part.', n: 22, vetRatio: 0.36, activeRatio: 0.5, consentRatio: 0.9, camps: [1, 1, 1], sizeCat: 'petite', activeCat: 'moitié', modCat: '', startMods: 1 })

// ── Résolution : trouve le nombre de modérateurs (≤ 6) qui évite les
// tables sans modérateur, en partant de `startMods` ────────────────────

for (const s of specs) {
  if (s.n + MAX_MODERATORS > MAX_ROOM) {
    throw new Error(`${s.id} : ${s.n} participants + ${MAX_MODERATORS} modérateurs dépasserait ${MAX_ROOM} au palier maximal.`)
  }
}

function modCatOf(m: number): string {
  if (m <= 1) return '1'
  if (m <= 3) return '2-3'
  return '4-6'
}

// ── Calcul ─────────────────────────────────────────────────────

function explain(r: ReturnType<typeof runAllocation>): string {
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

const out = specs.map(spec => {
  const { n, startMods, id, label, sizeCat, activeCat, note, ...cfgRest } = spec
  const { r, moderators, ok } = solveNoUnmoderated({ n, ...cfgRest, label }, startMods)
  const finalNote = ok
    ? note ?? null
    : [note, `⚠️ Aucun nombre de modérateurs jusqu'à ${MAX_MODERATORS} n'a permis d'éviter une table sans modérateur sur ce scénario — contrainte non tenable dans cette limite.`]
      .filter(Boolean).join(' ')
  return {
    id,
    label,
    sizeCat,
    activeCat,
    modCat: modCatOf(moderators),
    note: finalNote,
    roomTotal: n + moderators,
    unmoderatedOk: ok,
    input: {
      n, vetRatio: cfgRest.vetRatio, activeRatio: cfgRest.activeRatio,
      consentRatio: cfgRest.consentRatio, camps: cfgRest.camps, moderators,
      recorders: cfgRest.recorders ?? 1, opinions: cfgRest.opinions ?? true,
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
    explanation: explain(r),
    ms: 0,
  }
})

const failures = out.filter(s => !s.unmoderatedOk)
if (failures.length > 0) {
  process.stderr.write(`⚠️ ${failures.length} scénario(s) n'atteignent pas "zéro table sans modérateur" même à ${MAX_MODERATORS} modérateurs : ${failures.map(s => s.id).join(', ')}\n`)
}

process.stdout.write(JSON.stringify(out, null, 1))
