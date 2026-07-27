// =============================================================
// Chantier 19 (G1) — Algorithme d'allocation v2
//
// Répartit les participants présentiels en tables de débat selon
// 5 règles arbitrées en ordre lexicographique strict (spec :
// docs/chantier-5-allocation-v2-spec.md).
//
// Fonctions pures, aucune dépendance React ni Supabase — même
// pattern que src/lib/analysis.ts. Les wrappers d'I/O sont dans
// src/lib/voting.ts (loadAllocationInputs / applyAllocation).
//
// ── Les 5 règles (priorité décroissante) ─────────────────────
//   1. Assez d'actifs      : actifs   ≥ min(⌈2/5·taille⌉, 4)
//   2. Table enregistrable  : ≥1 table sans non-consentant ET non homogène
//   3. Hétérogénéité        : camp majoritaire ≤ 70 % ET 2e camp ≥ 2 personnes
//   4. Assez d'anciens      : anciens ≥ ⌈2/5·taille⌉
//   5. Nouveaux encadrés    : maximiser les nouveaux aux tables modérées
//
// L'algorithme ne peut jamais échouer : seules les bornes de taille
// sont dures, tout le reste dégrade (règle 5 sacrifiée en premier,
// règle 1 en dernier — comportement naturel de l'ordre lexicographique).
// =============================================================

// ── Constantes ───────────────────────────────────────────────

/** Taille minimale d'une table quand il y a allocation (N > 10). */
export const TABLE_MIN = 5
/** Taille maximale nominale d'une table. */
export const TABLE_MAX = 10
/** Plafond de dépassement, toléré seulement pour sauver la règle 1. */
export const TABLE_OVERFLOW_MAX = 20
/** N ≤ ce seuil → table unique, pas d'allocation. */
export const SINGLE_TABLE_MAX = 10
/** Règle 3 — part maximale du camp majoritaire dans une table. */
export const MAJORITY_SHARE_CAP = 0.70
/** Règle 3 — effectif minimal du 2ᵉ camp (nombre absolu, pas un %). */
export const MIN_SECOND_CAMP = 2
/** Graine par défaut — recherche locale déterministe (reproductibilité, §6). */
export const DEFAULT_SEED = 20260725

/**
 * Budget global d'évaluations de la recherche locale. Borne le temps de
 * calcul dans le navigateur ; l'ordre d'exploration étant fixe, atteindre
 * le budget reste déterministe (même entrée → même sortie).
 */
const MAX_EVALUATIONS = 400_000
/** Nombre de démarrages (le 1er déterministe, les suivants pseudo-aléatoires à graine fixe). */
const RESTARTS = 2
/** Garde-fou anti-boucle sur les passes de descente. */
const MAX_PASSES = 12

// ── Types publics ────────────────────────────────────────────

export interface AllocationMember {
  member_id: string
  pseudo: string
  /** `participation_style === 'active'`. Sans onboarding → false (conservateur, §6). */
  is_active: boolean
  /** `consent_transcript`. Sans onboarding → false : pas de consentement explicite = pas d'enregistrement. */
  consents: boolean
  /** A déjà fait un débat Ecclesia. Sans onboarding → false (compté nouveau). */
  is_veteran: boolean
  /** Camp d'opinion (`analysis_members.group_id`). null = n'a pas voté → neutre pour la règle 3. */
  group_id: number | null
}

export interface AllocationInput {
  /** Membres présentiels **hors modérateurs** — eux seuls occupent un siège. */
  members: AllocationMember[]
  /** Modérateurs déjà identifiés dans l'app (session_members.is_moderator). */
  moderatorIds: string[]
  /**
   * Chantier 25 (H17) — attributs des modérateurs, pour ceux qui devront être
   * assis comme participants ordinaires faute de table à animer. Facultatif :
   * un modérateur sans profil est assis avec les valeurs conservatrices
   * habituelles (non-actif, non-consentant, nouveau, sans camp), comme un
   * membre sans onboarding (§6).
   */
  moderatorProfiles?: AllocationMember[]
  /** Modérateurs annoncés par le superadmin mais pas encore inscrits (§3). */
  extraModerators?: number
  /** Nombre d'enregistreurs disponibles — si fourni, la règle 2 vise ce nombre de tables propres. */
  recorderCount?: number | null
  /** false → règle 3 désactivée proprement (analyse des camps indisponible, §5). */
  opinionsAvailable: boolean
  seed?: number
}

export interface AllocationTable {
  table_number: number
  moderated: boolean
  member_ids: string[]
  /** Modérateurs animant cette table (n'occupent pas de siège). */
  moderator_member_ids: string[]
}

export interface TableDiagnostics {
  table_number: number
  size: number
  moderated: boolean
  actives: number
  actives_threshold: number
  rule1_ok: boolean
  veterans: number
  veterans_threshold: number
  rule4_ok: boolean
  newcomers: number
  non_consenting: number
  /** Règle 2 : aucune personne non consentante ET table non homogène. */
  recordable: boolean
  /** camp d'opinion → effectif. Clés = `group_id` d'origine. */
  camp_counts: Record<string, number>
  /** Membres sans camp (n'ont pas voté) — neutres pour la règle 3. */
  neutral_count: number
  /** Part du camp majoritaire parmi les membres ayant un camp. null si aucun. */
  majority_share: number | null
  /** Règle 3 : seuil de viabilité atteint. */
  rule3_ok: boolean
  /** Degré d'hétérogénéité = 1 − part du camp majoritaire. */
  heterogeneity_degree: number | null
}

export interface AllocationResult {
  tables: AllocationTable[]
  diagnostics: TableDiagnostics[]
  /** Vecteur lexicographique retenu (à maximiser composante par composante). */
  score: number[]
  /** Messages destinés au superadmin (règle désactivée, seuil non atteignable…). */
  warnings: string[]
  /** true → N ≤ 10, table unique, aucune règle appliquée. */
  singleTable: boolean
  /** Capacité de modération retenue (modérateurs inscrits + annoncés). */
  moderatorCapacity: number
  /**
   * Chantier 25 (H17) — modérateurs inscrits qui n'animent aucune table et ont
   * donc été placés comme participants ordinaires. Ils figurent dans
   * `member_ids` de leur table, jamais dans `moderator_member_ids`.
   */
  seatedModeratorIds: string[]
  /** Nombre de modérateurs qui animent réellement une table. */
  animatingModerators: number
  /** Objectif de tables enregistrables effectivement utilisé (règle 2). */
  recorderTarget: number
  /** true → une table dépasse 10 personnes pour sauver la règle 1. */
  overflowUsed: boolean
  /** Rappel : le résultat est reproductible à graine identique. */
  seed: number
}

// ── Seuils ───────────────────────────────────────────────────

/** Règle 1 — `min(⌈2/5·taille⌉, 4)` : 2 à 5 pers., 3 à 6, 4 dès 10. */
export function activeThreshold(size: number): number {
  return Math.min(Math.ceil((2 / 5) * size), 4)
}

/**
 * Règle 4 — `⌈2/5·taille⌉`.
 * La spec écrit « anciens ≥ 2/5 × taille » sans préciser l'arrondi ; on
 * reprend le ⌈⌉ explicite de la règle 1 par cohérence (taille 6 → 3 anciens).
 */
export function veteranThreshold(size: number): number {
  return Math.ceil((2 / 5) * size)
}

// ── PRNG déterministe (mulberry32) ───────────────────────────

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

// ── Représentation interne ───────────────────────────────────

interface Prepared {
  n: number
  ids: string[]
  active: Uint8Array
  consent: Uint8Array
  veteran: Uint8Array
  /** camp remappé sur 0..campCount-1 ; -1 = neutre (pas de vote). */
  camp: Int32Array
  campCount: number
  /** index remappé → group_id d'origine. */
  campLabels: number[]
}

function prepare(members: AllocationMember[]): Prepared {
  const n = members.length
  const labels = [...new Set(members.map(m => m.group_id).filter((g): g is number => g !== null))]
    .sort((a, b) => a - b)
  const labelIdx = new Map(labels.map((g, i) => [g, i]))

  const prep: Prepared = {
    n,
    ids: members.map(m => m.member_id),
    active: new Uint8Array(n),
    consent: new Uint8Array(n),
    veteran: new Uint8Array(n),
    camp: new Int32Array(n),
    campCount: labels.length,
    campLabels: labels,
  }
  members.forEach((m, i) => {
    prep.active[i] = m.is_active ? 1 : 0
    prep.consent[i] = m.consents ? 1 : 0
    prep.veteran[i] = m.is_veteran ? 1 : 0
    prep.camp[i] = m.group_id === null ? -1 : labelIdx.get(m.group_id)!
  })
  return prep
}

/** Forme candidate : tailles fixées, les `moderatedCount` premières tables sont animées. */
interface Shape {
  sizes: number[]
  moderatedCount: number
}

/**
 * Politique de dimensionnement (§4) :
 *  - les tables **modérées** sont remplies jusqu'au plafond en priorité ;
 *  - le reliquat est réparti **uniformément** sur les tables non modérées,
 *    pour les garder aussi près que possible du minimum de 5 (« deux tables
 *    de 5 sont préférables à une table de 10 sans animateur »).
 * Retourne null si aucune répartition valide n'existe pour ce nombre de tables.
 */
function buildShape(n: number, tableCount: number, moderatorCapacity: number, maxSize: number): Shape | null {
  if (tableCount < 1) return null
  if (tableCount * TABLE_MIN > n) return null
  if (tableCount * maxSize < n) return null

  const moderatedCount = Math.min(tableCount, moderatorCapacity)
  const sizes = new Array<number>(tableCount).fill(TABLE_MIN)
  let rem = n - tableCount * TABLE_MIN

  // 1. Tables modérées : remplies jusqu'au plafond, dans l'ordre.
  for (let t = 0; t < moderatedCount && rem > 0; t++) {
    const add = Math.min(rem, maxSize - TABLE_MIN)
    sizes[t] += add
    rem -= add
  }

  // 2. Reliquat : réparti au tour par tour sur les tables non modérées.
  while (rem > 0) {
    let progressed = false
    for (let t = moderatedCount; t < tableCount && rem > 0; t++) {
      if (sizes[t] < maxSize) { sizes[t] += 1; rem -= 1; progressed = true }
    }
    if (!progressed) break
  }

  if (rem > 0) return null
  return { sizes, moderatedCount }
}

function enumerateShapes(n: number, moderatorCapacity: number, maxSize: number): Shape[] {
  const shapes: Shape[] = []
  const minTables = Math.max(1, Math.ceil(n / maxSize))
  const maxTables = Math.floor(n / TABLE_MIN)
  for (let t = minTables; t <= maxTables; t++) {
    const s = buildShape(n, t, moderatorCapacity, maxSize)
    if (s) shapes.push(s)
  }
  return shapes
}

/**
 * Préférence de forme — appliquée **seulement** à égalité parfaite sur les
 * règles 1 à 5 (§4). À comparer en décroissant, composante par composante.
 */
function shapePreference(shape: Shape): number[] {
  const T = shape.sizes.length
  const allModerated = shape.moderatedCount >= T ? 1 : 0
  let maxUnmoderated = 0
  for (let t = shape.moderatedCount; t < T; t++) {
    if (shape.sizes[t] > maxUnmoderated) maxUnmoderated = shape.sizes[t]
  }
  // 1. tout le monde animé > 2. petites tables non animées > 3. peu de tables
  return [allModerated, -maxUnmoderated, -T]
}

// ── Compteurs par table (mis à jour de façon incrémentale) ───

interface Counters {
  actives: Int32Array
  veterans: Int32Array
  nonConsent: Int32Array
  /** matrice plate T × campCount */
  campMat: Int32Array
  campTotal: Int32Array
}

function makeCounters(T: number, campCount: number): Counters {
  return {
    actives: new Int32Array(T),
    veterans: new Int32Array(T),
    nonConsent: new Int32Array(T),
    campMat: new Int32Array(T * Math.max(1, campCount)),
    campTotal: new Int32Array(T),
  }
}

function addMember(ctr: Counters, prep: Prepared, i: number, t: number): void {
  ctr.actives[t] += prep.active[i]
  ctr.veterans[t] += prep.veteran[i]
  ctr.nonConsent[t] += prep.consent[i] ? 0 : 1
  const c = prep.camp[i]
  if (c >= 0) {
    ctr.campMat[t * prep.campCount + c] += 1
    ctr.campTotal[t] += 1
  }
}

function removeMember(ctr: Counters, prep: Prepared, i: number, t: number): void {
  ctr.actives[t] -= prep.active[i]
  ctr.veterans[t] -= prep.veteran[i]
  ctr.nonConsent[t] -= prep.consent[i] ? 0 : 1
  const c = prep.camp[i]
  if (c >= 0) {
    ctr.campMat[t * prep.campCount + c] -= 1
    ctr.campTotal[t] -= 1
  }
}

function buildCounters(assign: Int32Array, prep: Prepared, T: number): Counters {
  const ctr = makeCounters(T, prep.campCount)
  for (let i = 0; i < prep.n; i++) addMember(ctr, prep, i, assign[i])
  return ctr
}

// ── Évaluation lexicographique ───────────────────────────────

interface Evaluation {
  /** À maximiser composante par composante, dans l'ordre. */
  score: number[]
  /**
   * Métrique de plateau (à minimiser) : somme hiérarchisée des manques.
   * Sert **uniquement** de départage quand `score` est identique — elle donne
   * un gradient là où le maximin est plat (une table qui passe de 2 à 1
   * non-consentant n'améliore aucune règle mais rapproche de la règle 2).
   * Elle ne peut jamais faire préférer un `score` inférieur.
   */
  plateau: number
}

function evaluate(
  shape: Shape,
  ctr: Counters,
  prep: Prepared,
  opinionsAvailable: boolean,
  recorderTarget: number,
): Evaluation {
  const T = shape.sizes.length
  const C = prep.campCount

  let fail1 = 0
  let minMargin1 = Infinity
  let sumShort1 = 0

  let cleanCount = 0

  let fail3 = 0
  let minHet = Infinity
  let hetSeen = false
  let sumShort3 = 0

  let fail4 = 0
  let minMargin4 = Infinity
  let sumShort4 = 0

  let newcomersModerated = 0

  const nonConsentList: number[] = []

  for (let t = 0; t < T; t++) {
    const size = shape.sizes[t]

    // Règle 1
    const thr1 = activeThreshold(size)
    const margin1 = ctr.actives[t] - thr1
    if (margin1 < 0) { fail1++; sumShort1 += -margin1 }
    if (margin1 < minMargin1) minMargin1 = margin1

    // Règle 4
    const thr4 = veteranThreshold(size)
    const margin4 = ctr.veterans[t] - thr4
    if (margin4 < 0) { fail4++; sumShort4 += -margin4 }
    if (margin4 < minMargin4) minMargin4 = margin4

    // Règle 5 — nouveaux placés à une table modérée
    if (t < shape.moderatedCount) newcomersModerated += size - ctr.veterans[t]

    // Camps
    const total = ctr.campTotal[t]
    let first = 0
    let second = 0
    for (let c = 0; c < C; c++) {
      const v = ctr.campMat[t * C + c]
      if (v > first) { second = first; first = v }
      else if (v > second) { second = v }
    }

    // Règle 3 — désactivée si l'analyse des camps est indisponible
    if (opinionsAvailable) {
      const viable = total > 0 && first <= MAJORITY_SHARE_CAP * total && second >= MIN_SECOND_CAMP
      if (!viable) {
        fail3++
        sumShort3 += Math.max(0, MIN_SECOND_CAMP - second)
                   + Math.max(0, first - MAJORITY_SHARE_CAP * total)
      }
      // Maximin du degré d'hétérogénéité — seules les tables où au moins
      // 2 personnes ont voté portent une information exploitable.
      if (total >= 2) {
        hetSeen = true
        const het = 1 - first / total
        if (het < minHet) minHet = het
      }
    }

    // Règle 2 — table enregistrable : zéro non-consentant ET non homogène.
    // Si l'analyse des camps est indisponible, seul le consentement compte.
    const nonHomogeneous = opinionsAvailable ? (total > 0 && first < total) : true
    if (ctr.nonConsent[t] === 0 && nonHomogeneous) cleanCount++
    nonConsentList.push(ctr.nonConsent[t])
  }

  if (!Number.isFinite(minMargin1)) minMargin1 = 0
  if (!Number.isFinite(minMargin4)) minMargin4 = 0
  const het = opinionsAvailable && hetSeen ? minHet : 0

  const r2main = Math.min(cleanCount, recorderTarget)

  // ── Choix d'implémentation : normalisation des règles de comptage ────
  // La spec écrit « maximiser le nombre de tables qui atteignent le seuil ».
  // Prise au pied de la lettre, cette formulation n'est pas comparable entre
  // deux formes ayant un nombre de tables différent — or l'algorithme doit
  // justement choisir ce nombre. On utilise donc le **taux d'échec**
  // (échecs / nombre de tables) :
  //   · toutes les tables conformes → 0 quel que soit le nombre de tables,
  //     ce qui laisse la politique de dimensionnement du §4 arbitrer ;
  //   · règle insatisfaisable partout → le taux favorise bien la forme qui
  //     maximise le nombre de tables conformes (§5, angle mort règle 1) ;
  //   · repli de la règle 1 (« agrandir les tables ») → réduire le nombre de
  //     tables fait baisser le taux d'échec, donc s'applique naturellement.
  //
  // Les maximin des règles 1 et 4 portent sur la marge **plafonnée à 0**
  // (`min(marge, 0)`) : un surplus d'actifs ou d'anciens au-delà du seuil ne
  // doit pas départager deux solutions toutes deux conformes, sinon la marge
  // absolue (mécaniquement plus grande sur les grosses tables) écraserait la
  // politique de dimensionnement — l'exemple normatif du §4 (60 participants,
  // 4 modérateurs → 8 tables et non 6) ne serait alors pas reproduit.
  // La règle 3, dont le degré d'hétérogénéité est déjà normalisé (part du camp
  // majoritaire), conserve un maximin plein comme le décrit la spec.
  const T_ = T || 1
  const score = [
    -fail1 / T_, Math.min(minMargin1, 0),   // règle 1
    r2main,                                 // règle 2 (garantie ; le surplus de
                                            //   tables propres est « sans priorité »
                                            //   → volontairement hors du vecteur)
    -fail3 / T_, het,                       // règle 3
    -fail4 / T_, Math.min(minMargin4, 0),   // règle 4
    newcomersModerated,                     // règle 5
  ]

  // Plateau : poids hiérarchiques pour ne jamais inverser l'ordre des règles.
  nonConsentList.sort((a, b) => a - b)
  let r2Short = 0
  for (let k = 0; k < Math.min(recorderTarget, nonConsentList.length); k++) r2Short += nonConsentList[k]

  const plateau = 1e6 * sumShort1 + 1e4 * r2Short + 1e2 * sumShort3 + sumShort4

  return { score, plateau }
}

/** Compare deux évaluations. > 0 si `a` est meilleure. */
function compareEval(a: Evaluation, b: Evaluation): number {
  for (let i = 0; i < a.score.length; i++) {
    if (a.score[i] !== b.score[i]) return a.score[i] - b.score[i]
  }
  // Égalité stricte sur les règles → départage par le gradient de plateau.
  return b.plateau - a.plateau
}

function compareArraysDesc(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

// ── Solution initiale ────────────────────────────────────────

/**
 * Distribution « serpentin » sur une liste triée : répartit les attributs
 * entre les tables pour partir d'une solution déjà raisonnable.
 */
function initialAssignment(shape: Shape, prep: Prepared, order: number[]): Int32Array {
  const T = shape.sizes.length
  const assign = new Int32Array(prep.n)
  const remaining = [...shape.sizes]

  let t = 0
  let dir = 1
  for (const i of order) {
    // Avance jusqu'à une table qui a encore de la place (serpentin)
    let guard = 0
    while (remaining[t] === 0 && guard <= 2 * T) {
      t += dir
      if (t >= T) { t = T - 1; dir = -1 }
      else if (t < 0) { t = 0; dir = 1 }
      guard++
    }
    if (remaining[t] === 0) {
      // Sécurité : plus de place au bout du serpentin → première table libre
      t = remaining.findIndex(r => r > 0)
    }
    assign[i] = t
    remaining[t] -= 1
    t += dir
    if (t >= T) { t = T - 1; dir = -1 }
    else if (t < 0) { t = 0; dir = 1 }
  }
  return assign
}

function sortedOrder(prep: Prepared): number[] {
  const idx = [...Array(prep.n).keys()]
  return idx.sort((a, b) =>
    prep.camp[a] - prep.camp[b] ||
    prep.active[b] - prep.active[a] ||
    prep.veteran[b] - prep.veteran[a] ||
    prep.consent[b] - prep.consent[a] ||
    (prep.ids[a] < prep.ids[b] ? -1 : prep.ids[a] > prep.ids[b] ? 1 : 0),
  )
}

function shuffled(order: number[], rand: () => number): number[] {
  const out = [...order]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ── Recherche locale (échanges par paires, première amélioration) ──

interface Budget { left: number }

function localSearch(
  shape: Shape,
  prep: Prepared,
  opinionsAvailable: boolean,
  recorderTarget: number,
  order: number[],
  budget: Budget,
): { assign: Int32Array; evaluation: Evaluation } {
  const T = shape.sizes.length
  const assign = initialAssignment(shape, prep, order)
  const ctr = buildCounters(assign, prep, T)
  let current = evaluate(shape, ctr, prep, opinionsAvailable, recorderTarget)

  if (T < 2) return { assign, evaluation: current }

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let improved = false

    for (let i = 0; i < prep.n && budget.left > 0; i++) {
      for (let j = i + 1; j < prep.n; j++) {
        const ti = assign[i]
        const tj = assign[j]
        if (ti === tj) continue
        // Deux membres indiscernables : l'échange ne change rien.
        if (prep.active[i] === prep.active[j] &&
            prep.consent[i] === prep.consent[j] &&
            prep.veteran[i] === prep.veteran[j] &&
            prep.camp[i] === prep.camp[j]) continue

        if (budget.left <= 0) break
        budget.left--

        removeMember(ctr, prep, i, ti); removeMember(ctr, prep, j, tj)
        addMember(ctr, prep, i, tj);    addMember(ctr, prep, j, ti)

        const candidate = evaluate(shape, ctr, prep, opinionsAvailable, recorderTarget)
        if (compareEval(candidate, current) > 0) {
          assign[i] = tj
          assign[j] = ti
          current = candidate
          improved = true
        } else {
          // revert
          removeMember(ctr, prep, i, tj); removeMember(ctr, prep, j, ti)
          addMember(ctr, prep, i, ti);    addMember(ctr, prep, j, tj)
        }
      }
    }

    if (!improved) break
  }

  return { assign, evaluation: current }
}

// ── Diagnostics ──────────────────────────────────────────────

function buildDiagnostics(
  shape: Shape,
  assign: Int32Array,
  prep: Prepared,
  opinionsAvailable: boolean,
): TableDiagnostics[] {
  const T = shape.sizes.length
  const ctr = buildCounters(assign, prep, T)
  const C = prep.campCount
  const out: TableDiagnostics[] = []

  for (let t = 0; t < T; t++) {
    const size = shape.sizes[t]
    const campCounts: Record<string, number> = {}
    let first = 0
    let second = 0
    for (let c = 0; c < C; c++) {
      const v = ctr.campMat[t * C + c]
      if (v > 0) campCounts[String(prep.campLabels[c])] = v
      if (v > first) { second = first; first = v }
      else if (v > second) { second = v }
    }
    const total = ctr.campTotal[t]
    const thr1 = activeThreshold(size)
    const thr4 = veteranThreshold(size)
    const nonHomogeneous = opinionsAvailable ? (total > 0 && first < total) : true

    out.push({
      table_number: t + 1,
      size,
      moderated: t < shape.moderatedCount,
      actives: ctr.actives[t],
      actives_threshold: thr1,
      rule1_ok: ctr.actives[t] >= thr1,
      veterans: ctr.veterans[t],
      veterans_threshold: thr4,
      rule4_ok: ctr.veterans[t] >= thr4,
      newcomers: size - ctr.veterans[t],
      non_consenting: ctr.nonConsent[t],
      recordable: ctr.nonConsent[t] === 0 && nonHomogeneous,
      camp_counts: campCounts,
      neutral_count: size - total,
      majority_share: total > 0 ? first / total : null,
      rule3_ok: opinionsAvailable
        ? total > 0 && first <= MAJORITY_SHARE_CAP * total && second >= MIN_SECOND_CAMP
        : false,
      heterogeneity_degree: total > 0 ? 1 - first / total : null,
    })
  }
  return out
}

// ── Orchestrateur ────────────────────────────────────────────

/** Résultat d'une passe de recherche pour une population et une capacité données. */
interface SolveOutcome {
  prep: Prepared
  shape: Shape
  assign: Int32Array
  score: number[]
  overflowUsed: boolean
  overflowNote: string | null
  singleTable: boolean
}

/**
 * Recherche la meilleure forme + affectation pour une population figée.
 * Isolée de `runAllocation` pour pouvoir être rejouée par la boucle de
 * résolution du surplus de modérateurs (chantier 25 / H17).
 */
function solveFor(
  members: AllocationMember[],
  moderatorCapacity: number,
  opinionsAvailable: boolean,
  recorderTarget: number,
  seed: number,
): SolveOutcome {
  const prep = prepare(members)
  const n = prep.n

  // ── Cas N ≤ 10 : table unique, aucune règle appliquée (§4) ──
  if (n <= SINGLE_TABLE_MAX) {
    const shape: Shape = { sizes: [n], moderatedCount: moderatorCapacity > 0 ? 1 : 0 }
    const assign = new Int32Array(n) // tous en table 0
    return {
      prep, shape, assign,
      score: evaluate(shape, buildCounters(assign, prep, 1), prep, opinionsAvailable, recorderTarget).score,
      overflowUsed: false, overflowNote: null, singleTable: true,
    }
  }

  const budget: Budget = { left: MAX_EVALUATIONS }
  const baseOrder = sortedOrder(prep)

  function searchOver(shapes: Shape[]): { shape: Shape; assign: Int32Array; evaluation: Evaluation } | null {
    let best: { shape: Shape; assign: Int32Array; evaluation: Evaluation } | null = null
    for (const shape of shapes) {
      for (let r = 0; r < RESTARTS; r++) {
        // Restart 0 = ordre trié déterministe ; suivants = mélange à graine fixe.
        const order = r === 0 ? baseOrder : shuffled(baseOrder, mulberry32(seed + r * 7919 + shape.sizes.length))
        const res = localSearch(shape, prep, opinionsAvailable, recorderTarget, order, budget)
        if (!best) { best = { shape, assign: res.assign, evaluation: res.evaluation }; continue }
        const cmp = compareEval(res.evaluation, best.evaluation)
        if (cmp > 0) { best = { shape, assign: res.assign, evaluation: res.evaluation }; continue }
        if (cmp === 0 && compareArraysDesc(shapePreference(shape), shapePreference(best.shape)) > 0) {
          best = { shape, assign: res.assign, evaluation: res.evaluation }
        }
      }
    }
    return best
  }

  // 1re passe : tables de 5 à 10 (contrainte dure nominale)
  let best = searchOver(enumerateShapes(n, moderatorCapacity, TABLE_MAX))
  let overflowUsed = false
  let overflowNote: string | null = null

  // 2e passe : dépassement jusqu'à 20 — toléré **uniquement** si cela améliore
  // strictement la règle 1 (première composante du vecteur). §4.
  if (best && best.evaluation.score[0] < 0 && budget.left > 0) {
    const overflowShapes = enumerateShapes(n, moderatorCapacity, TABLE_OVERFLOW_MAX)
      .filter(s => Math.max(...s.sizes) > TABLE_MAX)
    const alt = searchOver(overflowShapes)
    if (alt && alt.evaluation.score[0] > best.evaluation.score[0]) {
      best = alt
      overflowUsed = true
      overflowNote =
        `Des tables dépassent ${TABLE_MAX} personnes (jusqu'à ${Math.max(...alt.shape.sizes)}) : ` +
        `c'était la seule façon de satisfaire la règle 1 (assez de participants actifs par table).`
    }
  }

  if (!best) {
    // Ne devrait pas arriver (n > 10 ⇒ au moins une forme valide existe),
    // mais l'algorithme ne doit jamais échouer : repli sur une table unique.
    const shape: Shape = { sizes: [n], moderatedCount: moderatorCapacity > 0 ? 1 : 0 }
    const assign = new Int32Array(n)
    return {
      prep, shape, assign, score: [],
      overflowUsed: false,
      overflowNote: 'Aucune répartition valide trouvée — repli sur une table unique.',
      singleTable: true,
    }
  }

  return {
    prep,
    shape: best.shape,
    assign: best.assign,
    score: best.evaluation.score,
    overflowUsed, overflowNote,
    singleTable: false,
  }
}

/**
 * Calcule l'allocation. Ne lève jamais d'exception liée à la qualité des
 * données : au pire elle retourne une table unique avec des avertissements.
 */
export function runAllocation(input: AllocationInput): AllocationResult {
  const seed = input.seed ?? DEFAULT_SEED
  const warnings: string[] = []

  const allModeratorIds = [...input.moderatorIds]
  const extras = Math.max(0, input.extraModerators ?? 0)
  const moderatorCapacity = allModeratorIds.length + extras
  const opinionsAvailable = input.opinionsAvailable
  const recorderTarget = Math.max(1, input.recorderCount ?? 1)

  if (!opinionsAvailable) {
    warnings.push(
      "Analyse des camps d'opinion indisponible : la règle 3 (hétérogénéité) est désactivée. " +
      "L'allocation est faite sur les seules règles 1, 2, 4 et 5.",
    )
  }

  const members = [...input.members]
  const n = members.length

  if (n === 0) {
    warnings.push('Aucun participant présentiel à répartir.')
    return {
      tables: [], diagnostics: [], score: [], warnings,
      singleTable: false, moderatorCapacity, seatedModeratorIds: [],
      animatingModerators: 0, recorderTarget, overflowUsed: false, seed,
    }
  }

  if (moderatorCapacity === 0) {
    warnings.push("Aucun modérateur identifié : toutes les tables seront sans animateur (leaderless).")
  }

  // Profils des modérateurs — nécessaires pour asseoir ceux qui n'animent rien.
  const profileById = new Map(input.moderatorProfiles?.map(p => [p.member_id, p]) ?? [])
  const seatProfile = (id: string): AllocationMember =>
    profileById.get(id) ?? {
      // Mêmes valeurs conservatrices qu'un membre sans onboarding (§6).
      member_id: id, pseudo: id,
      is_active: false, consents: false, is_veteran: false, group_id: null,
    }

  const solved = solveFor(members, moderatorCapacity, opinionsAvailable, recorderTarget, seed)
  const { prep, shape, assign, score, overflowUsed, overflowNote, singleTable } = solved
  const T = shape.sizes.length

  // ── Surplus de modérateurs (chantier 25 / H17) ──
  // Un modérateur qui n'anime aucune table n'est pas « perdu » : il redevient
  // un participant ordinaire et prend un siège. Le placement est fait **après**
  // la recherche, sur la forme retenue : réinjecter ces personnes dans la
  // population avant le calcul rend le problème circulaire (asseoir quelqu'un
  // change le nombre de tables, donc le surplus, donc la population…) et
  // dégradait fortement la répartition. Ici la forme optimisée est préservée ;
  // seul un siège est ajouté à la table la moins remplie.
  const animatingIds       = allModeratorIds.slice(0, shape.moderatedCount)
  const seatedModeratorIds = allModeratorIds.slice(shape.moderatedCount)

  // Avertissements sur la population initiale (hors modérateurs assis).
  const seatedPop = prep.n
  if (opinionsAvailable && prep.campCount < 2) {
    warnings.push(
      "Un seul camp d'opinion détecté : la règle 3 ne peut pas être satisfaite (aucune table ne peut être hétérogène).",
    )
  }
  const totalActives = prep.active.reduce((s, v) => s + v, 0)
  if (totalActives < 4) {
    warnings.push(
      `Seulement ${totalActives} participant(s) se déclarent actifs : la règle 1 ne peut pas être pleinement satisfaite. ` +
      `L'algorithme maximise le nombre de tables conformes.`,
    )
  }
  const veteranShare = prep.veteran.reduce((s, v) => s + v, 0) / seatedPop
  if (veteranShare < 0.4) {
    warnings.push(
      `${Math.round(veteranShare * 100)} % d'anciens (< 40 %) : la règle 4 sera partiellement dégradée.`,
    )
  }
  if (singleTable && seatedPop <= SINGLE_TABLE_MAX) {
    warnings.unshift(`${seatedPop} participants (≤ ${SINGLE_TABLE_MAX}) : une table unique, pas d'allocation.`)
  }
  if (overflowNote) warnings.push(overflowNote)

  const memberIdsByTable: string[][] = Array.from({ length: T }, () => [])
  for (let i = 0; i < prep.n; i++) memberIdsByTable[assign[i]].push(prep.ids[i])

  // Répartition des modérateurs : un par table modérée, dans l'ordre.
  const moderatorsByTable: string[][] = Array.from({ length: T }, () => [])
  animatingIds.forEach((mid, k) => { moderatorsByTable[k].push(mid) })

  // Les modérateurs en surplus rejoignent la table la moins remplie (à égalité,
  // la première). Aucune table n'est créée : on comble les sièges libres.
  const seatedProfiles: AllocationMember[] = []
  for (const mid of seatedModeratorIds) {
    let target = 0
    for (let t = 1; t < T; t++) {
      if (memberIdsByTable[t].length < memberIdsByTable[target].length) target = t
    }
    memberIdsByTable[target].push(mid)
    seatedProfiles.push(seatProfile(mid))
  }

  // ── Retours explicites au superadmin (chantier 25 / H13, H15, H17) ──
  if (seatedModeratorIds.length > 0) {
    warnings.push(
      `${seatedModeratorIds.length} modérateur(s) de plus que de tables animées : ils sont placés comme ` +
      `participants ordinaires (ils occupent un siège et comptent dans les seuils de leur table). ` +
      `S'ils ne viennent pas, décoche-les dans la liste des modérateurs avant de relancer le calcul.`,
    )
  }
  if (shape.moderatedCount > animatingIds.length) {
    warnings.push(
      `${shape.moderatedCount - animatingIds.length} table(s) comptent sur un modérateur annoncé mais pas encore inscrit — ` +
      `à rattacher à la main dès son arrivée.`,
    )
  }
  // H13 — pourquoi ajouter des modérateurs ne change parfois rien.
  if (extras > 0 && shape.moderatedCount >= T && animatingIds.length >= T) {
    warnings.push(
      `Les ${T} tables sont déjà toutes animées : les ${extras} modérateur(s) annoncés en plus ne modifient pas ` +
      `la répartition (la règle §4 « préférer un nombre de tables ≤ nombre de modérateurs » est déjà satisfaite). ` +
      `À leur arrivée, ils seront placés comme participants.`,
    )
  }
  // H15 — le nombre d'enregistreurs pilote le nombre de tables.
  const unmoderatedCount = T - shape.moderatedCount
  if (recorderTarget > 1 && unmoderatedCount > 0) {
    warnings.push(
      `Objectif de ${recorderTarget} tables enregistrables (règle 2, prioritaire sur le dimensionnement) : ` +
      `il a fallu ${T} tables, dont ${unmoderatedCount} sans animateur. ` +
      `Avec moins d'enregistreurs, l'algorithme ferait des tables plus grosses et toutes animées.`,
    )
  }

  const tables = memberIdsByTable.map((ids, t) => ({
    table_number: t + 1,
    moderated: t < shape.moderatedCount,
    member_ids: ids,
    moderator_member_ids: moderatorsByTable[t],
  }))

  return {
    tables,
    // Avec des modérateurs assis, les tailles de `shape` ne décrivent plus les
    // tables réelles → on rediagnostique la répartition finale, exactement
    // comme le fait le tableau de bord après un glisser-déposer.
    diagnostics: seatedProfiles.length > 0
      ? diagnoseAllocation(tables, [...members, ...seatedProfiles], opinionsAvailable)
      : buildDiagnostics(shape, assign, prep, opinionsAvailable),
    score,
    warnings,
    singleTable,
    moderatorCapacity,
    seatedModeratorIds,
    animatingModerators: animatingIds.length,
    recorderTarget,
    overflowUsed,
    seed,
  }
}

// ── Recalcul de diagnostics après retouche manuelle ──────────

/**
 * Recalcule les diagnostics d'une répartition arbitraire (après drag & drop
 * du superadmin). Ne réoptimise rien — donne juste le statut de chaque seuil,
 * pour le tableau de bord « mise à jour en direct » (§7).
 */
export function diagnoseAllocation(
  tables: { table_number: number; moderated: boolean; member_ids: string[] }[],
  members: AllocationMember[],
  opinionsAvailable: boolean,
): TableDiagnostics[] {
  const byId = new Map(members.map(m => [m.member_id, m]))
  const ordered = [...tables].sort((a, b) => a.table_number - b.table_number)

  // On reconstruit une population limitée aux membres réellement placés,
  // afin que le remap des camps reste cohérent avec l'affichage.
  const placed: AllocationMember[] = []
  const assignList: number[] = []
  ordered.forEach((t, tIdx) => {
    for (const id of t.member_ids) {
      const m = byId.get(id)
      if (!m) continue
      placed.push(m)
      assignList.push(tIdx)
    }
  })

  const prep = prepare(placed)
  const shape: Shape = {
    sizes: ordered.map((_, tIdx) => assignList.filter(a => a === tIdx).length),
    // Les tables modérées ne sont pas forcément les premières après retouche :
    // on aligne `moderatedCount` sur le préfixe modéré, et on corrige ensuite
    // le champ `moderated` table par table.
    moderatedCount: 0,
  }
  const diags = buildDiagnostics(shape, Int32Array.from(assignList), prep, opinionsAvailable)
  return diags.map((d, tIdx) => ({
    ...d,
    table_number: ordered[tIdx].table_number,
    moderated: ordered[tIdx].moderated,
  }))
}
