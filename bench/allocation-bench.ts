// =============================================================
// Chantier 29 (I1) — banc d'essai comparatif de l'allocation v2
//
// Objectif : mesurer chaque piste de fiabilisation de la recherche sur de
// nombreuses configurations synthétiques, et produire un rapport lisible
// permettant de juger **au cas par cas** si les répartitions produites sont
// satisfaisantes (méthode de validation demandée par Jules).
//
// Ce fichier ne contient aucun test : il est piloté par
// `bench/allocation-bench.test.ts`, ignoré par `npm test` sauf si
// ALLOC_BENCH=1. Voir le README en tête de ce dossier.
// =============================================================

import {
  runAllocation,
  activeThreshold,
  veteranThreshold,
  TABLE_MIN,
  TABLE_OVERFLOW_MAX,
  STRATEGY_LEGACY,
  STRATEGY_ABSOLUTE_ONLY,
  STRATEGY_STRONG_SEARCH_ONLY,
  STRATEGY_ABSOLUTE_STRONG,
  type AllocationMember,
  type AllocationStrategy,
  type AllocationResult,
} from '../src/lib/allocation'

// ── PRNG déterministe (identique à celui de l'algo) ──────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ── Génération de populations synthétiques ───────────────────

export interface ConfigSpec {
  label: string
  /** Nombre de participants présentiels (hors modérateurs). */
  n: number
  /** Part d'anciens (« a déjà fait un débat Ecclesia »). */
  vetRatio: number
  /** Part d'actifs (« je compte participer activement »). */
  activeRatio: number
  /** Part de consentants à l'enregistrement. */
  consentRatio: number
  /** Poids relatifs des camps d'opinion issus du k-means. */
  camps: number[]
  /** Modérateurs inscrits. */
  moderators: number
  /** Enregistreurs disponibles (règle 2). */
  recorders?: number
  /** false → règle 3 désactivée (analyse des camps indisponible). */
  opinions?: boolean
  seed?: number
}

/**
 * Population aux effectifs **exacts** (et non tirés au sort membre par membre) :
 * les ratios demandés sont respectés au participant près, ce qui rend les
 * comparaisons entre stratégies interprétables. Les attributs sont décorrélés
 * entre eux par des permutations indépendantes à graine fixe.
 */
export function buildPopulation(cfg: ConfigSpec): AllocationMember[] {
  const rand = mulberry32((cfg.seed ?? 1) * 2654435761 + cfg.n * 97 + cfg.moderators)
  const idx = [...Array(cfg.n).keys()]

  const vets = new Set(shuffle(idx, rand).slice(0, Math.round(cfg.n * cfg.vetRatio)))
  const actives = new Set(shuffle(idx, rand).slice(0, Math.round(cfg.n * cfg.activeRatio)))
  const consenting = new Set(shuffle(idx, rand).slice(0, Math.round(cfg.n * cfg.consentRatio)))

  // Camps : effectifs proportionnels aux poids, reliquat sur le premier camp.
  const weights = cfg.camps
  const sum = weights.reduce((s, w) => s + w, 0)
  const counts = weights.map(w => Math.floor((cfg.n * w) / sum))
  counts[0] += cfg.n - counts.reduce((s, c) => s + c, 0)
  const campOrder = shuffle(idx, rand)
  const campOf = new Map<number, number>()
  let cursor = 0
  counts.forEach((c, g) => {
    for (let k = 0; k < c; k++) campOf.set(campOrder[cursor++], g)
  })

  return idx.map(i => ({
    member_id: `p-${i}`,
    pseudo: `P${i}`,
    is_active: actives.has(i),
    consents: consenting.has(i),
    is_veteran: vets.has(i),
    group_id: campOf.get(i) ?? 0,
  }))
}

/** Profils des modérateurs — la production les fournit toujours. */
export function buildModerators(cfg: ConfigSpec): { ids: string[]; profiles: AllocationMember[] } {
  const ids = Array.from({ length: cfg.moderators }, (_, i) => `mo-${i}`)
  const profiles = ids.map((id, i) => ({
    member_id: id,
    pseudo: id,
    // Un modérateur est par construction quelqu'un d'expérimenté et engagé.
    is_active: true,
    consents: true,
    is_veteran: true,
    group_id: i % Math.max(1, cfg.camps.length),
  }))
  return { ids, profiles }
}

// ── Mesures ──────────────────────────────────────────────────

export interface RunMetrics {
  tables: number
  /** Tables sans animateur. */
  unmoderated: number
  /**
   * Personnes assises à une table sans animateur. C'est **la** mesure de
   * dégradation pertinente : le §4 préfère explicitement découper la capacité
   * non animée en tables de 5 (« deux tables de 5 valent mieux qu'une de 10
   * sans animateur »), donc compter les *tables* non animées pénaliserait à
   * tort un comportement voulu. Ce sont les *sièges* non encadrés qui comptent.
   */
  unmoderatedSeats: number
  /** Plus grande table sans animateur — le §4 la veut au plus proche de 5. */
  maxUnmoderatedSize: number
  sizes: number[]
  /** Rendu compact : `10M` = table de 10 animée, `5-` = table de 5 sans animateur. */
  shapeLabel: string
  /** Manque **réel** en personnes, règle 1 (actifs) et règle 4 (anciens). */
  short1: number
  short4: number
  /** Manque **théoriquement minimal** pour la forme retenue (borne exacte). */
  optShort1: number
  optShort4: number
  /** Écart recherche = réel − optimum de la forme. > 0 → la recherche a échoué. */
  gap1: number
  gap4: number
  tablesFailingRule1: number
  tablesFailingRule4: number
  tablesFailingRule3: number
  recordable: number
  seatedModerators: number
  totalSeats: number
  ms: number
}

function optimumShortfall(sizes: number[], threshold: (s: number) => number, supply: number): number {
  const sum = sizes.reduce((s, x) => s + threshold(x), 0)
  return Math.max(0, sum - supply)
}

export function measure(
  cfg: ConfigSpec,
  strategy: AllocationStrategy,
): RunMetrics {
  const members = buildPopulation(cfg)
  const { ids, profiles } = buildModerators(cfg)

  const t0 = Date.now()
  const r: AllocationResult = runAllocation({
    members,
    moderatorIds: ids,
    moderatorProfiles: profiles,
    recorderCount: cfg.recorders ?? null,
    opinionsAvailable: cfg.opinions ?? true,
    strategy,
  })
  const ms = Date.now() - t0

  const sizes = r.tables.map(t => t.member_ids.length)
  // Population réellement assise = participants + modérateurs en surplus.
  const seated = [...members, ...profiles.filter(p => r.seatedModeratorIds.includes(p.member_id))]
  const supplyA = seated.filter(m => m.is_active).length
  const supplyV = seated.filter(m => m.is_veteran).length

  const short1 = r.diagnostics.reduce((s, d) => s + Math.max(0, d.actives_threshold - d.actives), 0)
  const short4 = r.diagnostics.reduce((s, d) => s + Math.max(0, d.veterans_threshold - d.veterans), 0)
  const optShort1 = optimumShortfall(sizes, activeThreshold, supplyA)
  const optShort4 = optimumShortfall(sizes, veteranThreshold, supplyV)

  const unmodSizes = r.tables.filter(t => !t.moderated).map(t => t.member_ids.length)

  return {
    tables: r.tables.length,
    unmoderated: unmodSizes.length,
    unmoderatedSeats: unmodSizes.reduce((s, x) => s + x, 0),
    maxUnmoderatedSize: unmodSizes.length ? Math.max(...unmodSizes) : 0,
    sizes,
    shapeLabel: r.tables.map(t => `${t.member_ids.length}${t.moderated ? 'M' : '-'}`).join(' '),
    short1,
    short4,
    optShort1,
    optShort4,
    gap1: short1 - optShort1,
    gap4: short4 - optShort4,
    tablesFailingRule1: r.diagnostics.filter(d => !d.rule1_ok).length,
    tablesFailingRule4: r.diagnostics.filter(d => !d.rule4_ok).length,
    tablesFailingRule3: r.diagnostics.filter(d => !d.rule3_ok).length,
    recordable: r.diagnostics.filter(d => d.recordable).length,
    seatedModerators: r.seatedModeratorIds.length,
    totalSeats: r.tables.reduce((s, t) => s + t.member_ids.length, 0),
    ms,
  }
}

// ── Stratégies comparées ─────────────────────────────────────

export const STRATEGIES: { key: string; label: string; strategy: AllocationStrategy }[] = [
  { key: 'A', label: 'A · actuel (taux)', strategy: STRATEGY_LEGACY },
  { key: 'B', label: 'B · formule absolue seule', strategy: STRATEGY_ABSOLUTE_ONLY },
  { key: 'C', label: 'C · recherche fiabilisée seule', strategy: STRATEGY_STRONG_SEARCH_ONLY },
  { key: 'D', label: 'D · absolue + recherche fiabilisée', strategy: STRATEGY_ABSOLUTE_STRONG },
]

// ── Matrice de configurations ────────────────────────────────

/** Les deux cas de référence explicitement demandés par le chantier. */
export const NORMATIVE: ConfigSpec[] = [
  {
    label: 'NORMATIF §4 — 60 part. / 4 modé. (attendu : 8 tables, 4 animées de 10 + 4 de 5)',
    n: 60, vetRatio: 0.4, activeRatio: 0.5, consentRatio: 1,
    camps: [1, 1, 1], moderators: 4,
  },
  {
    label: 'RÉGRESSION 25b — 31 part. / 3 modé. / 12 anciens (39 %) — attendu : ne pas fragmenter',
    n: 31, vetRatio: 12 / 31, activeRatio: 0.5, consentRatio: 1,
    camps: [1, 1, 1], moderators: 3,
  },
  {
    label: 'TÉMOIN 25b — 31 part. / 3 modé. / 13 anciens (42 %) — déjà correct avant le chantier',
    n: 31, vetRatio: 13 / 31, activeRatio: 0.5, consentRatio: 1,
    camps: [1, 1, 1], moderators: 3,
  },
]

/** Grille synthétique : tailles, ratios d'anciens et nombres de modérateurs variables. */
export function buildGrid(): ConfigSpec[] {
  const out: ConfigSpec[] = []
  const sizes = [13, 18, 22, 25, 28, 31, 36, 42, 50, 60, 75, 90]
  const vetRatios = [0.15, 0.25, 0.32, 0.39, 0.45, 0.6]
  const moderators = [0, 1, 2, 3, 4, 6]

  for (const n of sizes) {
    for (const v of vetRatios) {
      for (const m of moderators) {
        // Échantillonnage : on ne garde qu'un sous-ensemble régulier et
        // déterministe de la grille complète, pour un rapport lisible.
        if ((n + Math.round(v * 100) + m) % 3 !== 0) continue
        out.push({
          label: `${n} part. · ${Math.round(v * 100)} % anciens · ${m} modé.`,
          n, vetRatio: v, activeRatio: 0.5, consentRatio: 0.9,
          camps: [0.45, 0.35, 0.2], moderators: m,
        })
      }
    }
  }
  return out
}

/** Cas particuliers : populations hostiles ou dégradées. */
export const EDGE_CASES: ConfigSpec[] = [
  {
    label: 'Salle très passive — 30 part., 20 % actifs, 3 modé.',
    n: 30, vetRatio: 0.4, activeRatio: 0.2, consentRatio: 0.9, camps: [1, 1, 1], moderators: 3,
  },
  {
    label: 'Salle quasi neuve — 40 part., 10 % anciens, 4 modé.',
    n: 40, vetRatio: 0.1, activeRatio: 0.5, consentRatio: 0.9, camps: [1, 1, 1], moderators: 4,
  },
  {
    label: 'Camp ultra-dominant — 35 part., camps 80/15/5, 3 modé.',
    n: 35, vetRatio: 0.4, activeRatio: 0.5, consentRatio: 0.9, camps: [0.8, 0.15, 0.05], moderators: 3,
  },
  {
    label: 'Beaucoup de non-consentants — 33 part., 60 % consentants, 3 modé.',
    n: 33, vetRatio: 0.4, activeRatio: 0.5, consentRatio: 0.6, camps: [1, 1, 1], moderators: 3,
  },
  {
    label: 'Analyse des camps indisponible — 34 part., 3 modé.',
    n: 34, vetRatio: 0.4, activeRatio: 0.5, consentRatio: 0.9, camps: [1], moderators: 3, opinions: false,
  },
  {
    label: '4 enregistreurs demandés — 45 part., 3 modé.',
    n: 45, vetRatio: 0.4, activeRatio: 0.5, consentRatio: 0.85, camps: [1, 1, 1], moderators: 3, recorders: 4,
  },
  {
    label: 'Aucun modérateur — 38 part.',
    n: 38, vetRatio: 0.35, activeRatio: 0.5, consentRatio: 0.9, camps: [1, 1, 1], moderators: 0,
  },
  {
    label: 'Modérateurs en surplus — 22 part., 6 modé.',
    n: 22, vetRatio: 0.4, activeRatio: 0.5, consentRatio: 0.9, camps: [1, 1, 1], moderators: 6,
  },
  {
    label: 'Grande salle — 120 part., 6 modé., 30 % anciens',
    n: 120, vetRatio: 0.3, activeRatio: 0.5, consentRatio: 0.9, camps: [0.4, 0.35, 0.25], moderators: 6,
  },
  {
    label: 'Juste au-dessus du seuil — 11 part., 1 modé.',
    n: 11, vetRatio: 0.36, activeRatio: 0.5, consentRatio: 0.9, camps: [1, 1, 1], moderators: 1,
  },
]

// ── Invariants — doivent tenir quelle que soit la stratégie ───

export function checkInvariants(cfg: ConfigSpec, m: RunMetrics): string[] {
  const problems: string[] = []
  const expectedSeats = cfg.n + m.seatedModerators
  if (m.totalSeats !== expectedSeats) {
    problems.push(`places ${m.totalSeats} ≠ population ${expectedSeats}`)
  }
  if (m.tables > 1) {
    for (const s of m.sizes) {
      if (s < TABLE_MIN) problems.push(`table de ${s} < ${TABLE_MIN}`)
      // Le dépassement de TABLE_MAX est licite (jusqu'à 20) pour sauver la
      // règle 1 : seul le franchissement du plafond absolu est une anomalie.
      if (s > TABLE_OVERFLOW_MAX) problems.push(`table de ${s} > ${TABLE_OVERFLOW_MAX}`)
    }
  }
  if (m.gap1 < 0 || m.gap4 < 0) problems.push('borne théorique violée (bug de mesure)')
  return problems
}
