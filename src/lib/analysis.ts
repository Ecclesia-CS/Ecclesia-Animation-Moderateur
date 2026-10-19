// =============================================================
// Analyse des camps d'opinion — logique de calcul
// Fonctions pures, aucune dépendance React.
// I/O Supabase uniquement dans les wrappers en bas de fichier.
//
// Chantier 171 — calcul aligné sur Polis (Small, Bjorkegren, Erkkilä, Shaw &
// Megill, « Polis: Scaling Deliberation by Mapping High Dimensional Opinion
// Spaces », Recerca 26(2), 2021, §1.1-1.4), et camps testés avant d'être crus.
// Les cinq écarts relevés par l'audit (transcription-debat/Visualisation prises
// de positions/audit_methodes_2026-10.md, § 4.1) sont corrigés :
//   1. un vote ABSENT est imputé par la moyenne de la colonne (la passe vaut 0) ;
//   2. la position est multipliée par √(C / Cp) (C assertions, Cp votées) ;
//   3. un votant n'est placé qu'à partir de MIN_VOTES_PER_MEMBER votes réels ;
//   4. assertions caractéristiques : P = (1 + N_v) / (2 + N), rapport camp/reste,
//      test exact de Fisher ;
//   5. consensus : produit des P(d'accord | camp).
// Et, hors Polis mais standard : test « un seul groupe » (silhouette comparée à
// des données sans structure, principe de la gap statistic — Tibshirani,
// Walther & Hastie, JRSS-B 2001) et stabilité des camps par sous-échantillonnage
// des votants (Hennig, CSDA 2007 ; indice de Rand ajusté, Hubert & Arabie 1985).
// =============================================================

import { PCA } from 'ml-pca'
import { kmeans } from 'ml-kmeans'
import type { SupabaseClient } from '@supabase/supabase-js'
import { extractErr } from './utils'
import type { VoteValue } from './types'

// ── Constantes ajustables ────────────────────────────────────
const MIN_VOTERS              = 6
const MIN_ASSERTIONS          = 5
const MIN_VOTES_PER_ASSERTION = 3  // assertions avec moins de N votes réels exclues
/**
 * Chantier 171 — votants avec moins de N votes réels (sur les assertions
 * retenues) exclus de la carte. Polis retire les participants sous 7 votes
 * (hyperparamètre, réglé pour des consultations à des dizaines ou centaines
 * d'assertions). Une séance Ecclesia en a 10 à 20 : 5 garde la même idée (pas
 * de point placé sur un ou deux votes, que la correction √(C/Cp) amplifierait)
 * sans exiger d'avoir tout voté. Plafonné au nombre d'assertions retenues, comme
 * Polis (`min(7, nombre d'assertions)`).
 * Était 1 jusqu'au chantier 171 (abaissé de 2 parce que des votes sur des
 * assertions rejetées ensuite faisaient disparaître des votants de la carte —
 * avec la correction de parcimonie, un point à 1 vote serait projeté loin du
 * centre sur une seule réponse).
 */
export const MIN_VOTES_PER_MEMBER = 5
/** Seuil du test exact de Fisher (unilatéral) des assertions caractéristiques : le 90 % de Polis. */
export const REPNESS_ALPHA        = 0.10
/** Seuil du test « un seul groupe ». */
export const STRUCTURE_ALPHA      = 0.05
/** Indice de Rand ajusté médian à partir duquel les camps sont dits stables. */
export const STABLE_ARI           = 0.75
const NULL_REPLICATES      = 200
const STABILITY_REPLICATES = 100
const STABILITY_SUBSAMPLE  = 0.8
const RANDOM_SEED          = 171

// ── Erreur typée ─────────────────────────────────────────────
export class AnalysisError extends Error {
  readonly code: 'INSUFFICIENT_DATA'
  constructor(code: 'INSUFFICIENT_DATA', message: string) {
    super(message)
    this.name = 'AnalysisError'
    this.code = code
  }
}

// ── Types publics ────────────────────────────────────────────

export interface VoteRow {
  member_id:           string
  assertion_id:        string
  vote:                VoteValue
  attending_in_person?: boolean
}

/** Valeur d'une case : +1 d'accord, −1 pas d'accord, 0 passe, null = pas d'avis exprimé. */
export type RawVote = number | null

export interface VoteMatrix {
  /** Votes bruts, `null` pour un absent ou un vote blanc. */
  raw:              RawVote[][]
  /** Matrice imputée (absents = moyenne de la colonne), celle que voit l'ACP. */
  matrix:           number[][]
  keptMemberIds:    string[]
  keptAssertionIds: string[]
}

/**
 * Chantier 171 — les camps se distinguent-ils du hasard, et reviennent-ils
 * quand on retire une partie des votants ?
 *   - `pValue` : part des jeux de données SANS structure (chaque colonne de
 *     votes permutée indépendamment : mêmes réponses par assertion, liens entre
 *     assertions détruits) où le même calcul trouve une silhouette au moins
 *     aussi bonne. Petite = camps plus nets que le hasard.
 *   - `stabilityAri` : indice de Rand ajusté médian entre les camps publiés et
 *     ceux recalculés sur 80 % des votants (1 = identiques, 0 = hasard).
 *   - `verdict` : 'absents' si p ≥ STRUCTURE_ALPHA (rien ne distingue ces camps
 *     d'un nuage sans groupes) ; sinon 'nets' si stabilité ≥ STABLE_ARI,
 *     'fragiles' en dessous.
 */
export interface ClusterValidity {
  silhouette:          number
  nullSilhouette95:    number
  pValue:              number
  replicates:          number
  stabilityAri:        number
  stabilityReplicates: number
  verdict:             'nets' | 'fragiles' | 'absents'
}

export interface AnalysisResult {
  kChosen:        number
  silhouette:     number
  pcaVariance:    [number, number]
  /**
   * assertion_id → { group_id → score }. Chantier 171 : score signé =
   * rapport P(vote | camp) / P(vote | reste), positif si le camp est plus
   * souvent d'accord, négatif s'il est plus souvent contre, 0 si l'écart n'est
   * pas significatif (voir computeRepness). Même forme qu'avant : les écrans
   * qui trient par score décroissant restent justes.
   */
  repness:        Record<string, Record<string, number>>
  /**
   * assertion_id → score dans [−1, 1] : 2·(∏ P(d'accord | camp))^(1/k) − 1.
   * Transformation monotone du produit de Polis (même classement), ramenée à
   * l'échelle de l'ancien score pour que le seuil 0,5 de `get_results_map` et de
   * l'onglet Analyse garde son sens (> 0,5 ⇔ moyenne géométrique > 0,75).
   */
  groupConsensus: Record<string, number>
  /** Produit brut des P(d'accord | camp), non enregistré en base. */
  consensusProduct: Record<string, number>
  /** Test « un seul groupe » et stabilité, enregistrés dans `session_analysis.cluster_validity` (chantier 171b). */
  validity:       ClusterValidity
  members: { member_id: string; pca_x: number; pca_y: number; group_id: number }[]
}

// ── Encodage et matrice ───────────────────────────────────────

const encodeVote = (v: VoteValue): RawVote =>
  v === 'agree' ? 1 : v === 'disagree' ? -1 : v === 'pass' ? 0 : null

/**
 * Chantier 171 — absents imputés par la moyenne de la colonne (Polis §1.1).
 * La moyenne est prise sur les votes exprimés (passe comprise, à 0). Une fois
 * l'ACP centrée, une case imputée ne tire le votant dans aucune direction sur
 * cette assertion : un absent ne compte plus comme un avis neutre.
 */
export function imputeColumnMeans(raw: RawVote[][]): number[][] {
  if (raw.length === 0) return []
  const nCols = raw[0].length
  const means = Array.from({ length: nCols }, (_, j) => {
    let s = 0, n = 0
    for (const row of raw) {
      const v = row[j]
      if (v !== null) { s += v; n++ }
    }
    return n === 0 ? 0 : s / n
  })
  return raw.map(row => row.map((v, j) => (v === null ? means[j] : v)))
}

// ── buildVoteMatrix ───────────────────────────────────────────
/**
 * Construit la matrice membres × assertions.
 * Encodage : agree=+1, disagree=-1, pass (abstention)=0, absent=moyenne de la
 * colonne (chantier 171 ; était 0 avant).
 *
 * Chantier 169 — le VOTE BLANC (`blank`, « la question est mal formulée ») n'est
 * pas une opinion et ne compte pas comme vote réel dans les seuils de sparsité.
 * Chantier 171 : il est traité comme une absence (imputé), pas comme une passe —
 * il ne dit rien du fond de l'assertion. L'abstention (`pass`) reste un vote
 * réel, à 0 fixe. pol.is n'a pas de vote blanc.
 *
 * Filtrage de sparsité en deux passes :
 *   1. Exclure les assertions avec < MIN_VOTES_PER_ASSERTION votes réels
 *   2. Exclure les membres avec < min(MIN_VOTES_PER_MEMBER, assertions retenues)
 *      votes réels sur les assertions restantes
 */
export function buildVoteMatrix(
  votes:      VoteRow[],
  members:    string[],
  assertions: string[],
): VoteMatrix {
  const voteMap = new Map<string, RawVote>()
  for (const v of votes) {
    voteMap.set(`${v.member_id}::${v.assertion_id}`, encodeVote(v.vote))
  }

  // Comptage des votes réels par assertion (≠ absent, ≠ blanc, mais pass compte)
  const realVotesByAssertion = new Map<string, number>()
  for (const v of votes) {
    if (v.vote === 'blank') continue
    realVotesByAssertion.set(v.assertion_id, (realVotesByAssertion.get(v.assertion_id) ?? 0) + 1)
  }

  // Passe 1 : filtrer les assertions sous-votées
  const filteredAssertions = assertions.filter(
    aid => (realVotesByAssertion.get(aid) ?? 0) >= MIN_VOTES_PER_ASSERTION,
  )
  const keptSet = new Set(filteredAssertions)

  // Comptage des votes réels par membre sur les assertions retenues
  const realVotesByMember = new Map<string, number>()
  for (const v of votes) {
    if (v.vote === 'blank') continue
    if (!keptSet.has(v.assertion_id)) continue
    realVotesByMember.set(v.member_id, (realVotesByMember.get(v.member_id) ?? 0) + 1)
  }

  // Passe 2 : filtrer les membres sous-votants
  const minVotes = Math.max(1, Math.min(MIN_VOTES_PER_MEMBER, filteredAssertions.length))
  const filteredMembers = members.filter(
    mid => (realVotesByMember.get(mid) ?? 0) >= minVotes,
  )

  const raw: RawVote[][] = filteredMembers.map(mid =>
    filteredAssertions.map(aid => voteMap.get(`${mid}::${aid}`) ?? null),
  )

  return {
    raw,
    matrix:           imputeColumnMeans(raw),
    keptMemberIds:    filteredMembers,
    keptAssertionIds: filteredAssertions,
  }
}

// ── runPCA ───────────────────────────────────────────────────
/**
 * Projette la matrice sur les 2 premières composantes principales.
 * matrix : rows = membres, cols = assertions.
 */
export function runPCA(matrix: number[][]): {
  coords:           [number, number][]
  varianceExplained: [number, number]
} {
  const pca        = new PCA(matrix)
  const projected  = pca.predict(matrix, { nComponents: 2 }).to2DArray()
  const ev         = pca.getExplainedVariance()

  const v0 = ev[0] ?? 0
  const v1 = ev[1] ?? 0

  return {
    coords:            projected.map(row => [row[0] ?? 0, row[1] ?? 0] as [number, number]),
    varianceExplained: [isNaN(v0) ? 0 : v0, isNaN(v1) ? 0 : v1],
  }
}

/**
 * Chantier 171 — correction de parcimonie de Polis (§1.2) : la position d'un
 * votant est multipliée par √(C / Cp), C = assertions retenues, Cp = celles
 * qu'il a votées. Sans elle, quelqu'un qui a peu voté est attiré vers le
 * centre (ses cases imputées valent la moyenne), où il se confond avec les
 * vrais modérés.
 */
export function sparsityScale(raw: RawVote[][]): number[] {
  return raw.map(row => {
    const c  = row.length
    const cp = row.filter(v => v !== null).length
    return cp === 0 ? 1 : Math.sqrt(c / cp)
  })
}

/** Imputation → ACP → correction de parcimonie : la carte. */
export function projectOpinions(raw: RawVote[][]): {
  coords:            [number, number][]
  varianceExplained: [number, number]
} {
  const { coords, varianceExplained } = runPCA(imputeColumnMeans(raw))
  const scale = sparsityScale(raw)
  return {
    coords: coords.map((c, i) => [c[0] * scale[i], c[1] * scale[i]] as [number, number]),
    varianceExplained,
  }
}

// ── silhouetteScore ───────────────────────────────────────────
/**
 * Calcule le score de silhouette moyen (implémentation manuelle,
 * ml-kmeans ne le fournit pas).
 */
export function silhouetteScore(
  coords: [number, number][],
  labels: number[],
): number {
  const n = coords.length
  if (n < 2) return 0

  // Chantier 171 — une seule passe O(n²) sans allocation : la silhouette est
  // recalculée des centaines de fois par le test de structure.
  const uniqueClusters = [...new Set(labels)]
  if (uniqueClusters.length < 2) return 0
  const k = uniqueClusters.length
  const idx = new Map(uniqueClusters.map((c, i) => [c, i]))
  const lab = labels.map(l => idx.get(l)!)
  const size = new Array<number>(k).fill(0)
  for (const l of lab) size[l]++

  // sums[i * k + c] = somme des distances de i aux points du cluster c
  const sums = new Float64Array(n * k)
  for (let i = 0; i < n; i++) {
    const [xi, yi] = coords[i]
    for (let j = i + 1; j < n; j++) {
      const d = Math.sqrt((xi - coords[j][0]) ** 2 + (yi - coords[j][1]) ** 2)
      sums[i * k + lab[j]] += d
      sums[j * k + lab[i]] += d
    }
  }

  let total = 0
  for (let i = 0; i < n; i++) {
    const own = lab[i]
    // a(i) : distance moyenne intra-cluster (hors i)
    const a = size[own] > 1 ? sums[i * k + own] / (size[own] - 1) : 0
    // b(i) : distance moyenne minimum inter-cluster
    let b = Infinity
    for (let c = 0; c < k; c++) {
      if (c !== own) b = Math.min(b, sums[i * k + c] / size[c])
    }
    const denom = Math.max(a, b)
    total += denom === 0 ? 0 : (b - a) / denom
  }
  return total / n
}

// ── runKMeans ─────────────────────────────────────────────────
/**
 * Teste k-means pour k de 2 à kMax (plafonné à 5, min 3 points par cluster).
 * Retient le k avec le meilleur silhouette score.
 */
export function runKMeans(coords: [number, number][]): {
  groups:    number[]
  kChosen:   number
  silhouette: number
} {
  const kMax = Math.min(5, Math.floor(coords.length / 3))

  if (kMax < 2) {
    throw new AnalysisError(
      'INSUFFICIENT_DATA',
      `Analyse impossible : ${coords.length} participant(s) après filtrage, minimum ${2 * 3} requis pour k-means.`,
    )
  }

  let bestGroups: number[]   = []
  let bestK                  = 2
  let bestScore              = -Infinity

  for (let k = 2; k <= kMax; k++) {
    const result = kmeans(coords, k, { initialization: 'kmeans++', seed: 42 })
    const score  = silhouetteScore(coords, result.clusters)
    if (score > bestScore) {
      bestScore  = score
      bestK      = k
      bestGroups = result.clusters
    }
  }

  return { groups: bestGroups, kChosen: bestK, silhouette: bestScore }
}

// ── Outils statistiques ───────────────────────────────────────

/** PRNG déterministe (mulberry32, comme allocation.ts) : mêmes votes ⇒ même verdict. */
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

function shuffled<T>(arr: T[], rand: () => number): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const logFactCache: number[] = [0]
function logFact(n: number): number {
  for (let i = logFactCache.length; i <= n; i++) logFactCache[i] = logFactCache[i - 1] + Math.log(i)
  return logFactCache[n]
}
const logChoose = (n: number, k: number) => logFact(n) - logFact(k) - logFact(n - k)

/**
 * Test exact de Fisher, unilatéral : probabilité, sous l'hypothèse « le camp ne
 * se distingue pas du reste », d'observer au moins `a` cas parmi les `n` du
 * camp, quand il y a `a + b` cas sur `n + m` votants en tout (loi
 * hypergéométrique). Exact à tout effectif, donc adapté aux camps de 3 ou 4
 * personnes où le test z de Polis n'est pas fiable.
 */
export function fisherExactGreater(a: number, n: number, b: number, m: number): number {
  const N = n + m, K = a + b
  const hi = Math.min(K, n)
  const denom = logChoose(N, n)
  let p = 0
  for (let i = a; i <= hi; i++) {
    if (K - i > m) continue
    p += Math.exp(logChoose(K, i) + logChoose(N - K, n - i) - denom)
  }
  return Math.min(1, p)
}

/** Indice de Rand ajusté (Hubert & Arabie 1985) : 1 = partitions identiques, ≈ 0 = hasard. */
export function adjustedRandIndex(a: number[], b: number[]): number {
  const n = a.length
  if (n < 2) return 1
  const c2 = (x: number) => (x * (x - 1)) / 2
  const cells = new Map<string, number>()
  const rows  = new Map<number, number>()
  const cols  = new Map<number, number>()
  for (let i = 0; i < n; i++) {
    const key = `${a[i]}|${b[i]}`
    cells.set(key, (cells.get(key) ?? 0) + 1)
    rows.set(a[i], (rows.get(a[i]) ?? 0) + 1)
    cols.set(b[i], (cols.get(b[i]) ?? 0) + 1)
  }
  let index = 0
  for (const v of cells.values()) index += c2(v)
  let sumA = 0, sumB = 0
  for (const v of rows.values()) sumA += c2(v)
  for (const v of cols.values()) sumB += c2(v)
  const expected = (sumA * sumB) / c2(n)
  const max = (sumA + sumB) / 2
  return max === expected ? 1 : (index - expected) / (max - expected)
}

// ── computeRepness ────────────────────────────────────────────

interface VoteTally { n: number; agree: number; disagree: number }

function tallyColumn(raw: RawVote[][], rows: number[], j: number): VoteTally {
  const t = { n: 0, agree: 0, disagree: 0 }
  for (const i of rows) {
    const v = raw[i][j]
    if (v === null) continue
    t.n++
    if (v > 0) t.agree++
    else if (v < 0) t.disagree++
  }
  return t
}

/** Estimateur de Polis avec lissage de Laplace : (1 + N_v) / (2 + N). */
export const smoothedShare = (nv: number, n: number) => (1 + nv) / (2 + n)

export interface RepnessDetail {
  direction: 'agree' | 'disagree'
  /** P(vote | camp), lissée. */
  pGroup:    number
  /** P(vote | reste), lissée. */
  pRest:     number
  ratio:     number
  pValue:    number
  significant: boolean
}

/**
 * Pour une assertion et un camp, le sens (d'accord / contre) qui distingue le
 * plus le camp du reste. Polis §1.3 : P(v | camp) = (1 + N_v) / (2 + N) où N
 * compte les votes exprimés (passe comprise, absents et blancs exclus), puis
 * rapport R = P(v | camp) / P(v | reste). Retenu si :
 *   - R > 1 et la part du camp dépasse 1/2 (une majorité du camp vote ainsi —
 *     Polis teste aussi P(v | camp) contre 1/2) ;
 *   - le test exact de Fisher unilatéral donne p < REPNESS_ALPHA.
 */
export function repnessFor(
  inGroup: VoteTally,
  rest:    VoteTally,
): RepnessDetail {
  const candidates = (['agree', 'disagree'] as const).map(direction => {
    const a = inGroup[direction], b = rest[direction]
    const pGroup = smoothedShare(a, inGroup.n)
    const pRest  = smoothedShare(b, rest.n)
    const ratio  = pGroup / pRest
    const pValue = fisherExactGreater(a, inGroup.n, b, rest.n)
    const significant = ratio > 1 && pGroup > 0.5 && pValue < REPNESS_ALPHA
    return { direction, pGroup, pRest, ratio, pValue, significant }
  })
  const sig = candidates.filter(c => c.significant).sort((x, y) => y.ratio - x.ratio)
  if (sig.length > 0) return sig[0]
  return candidates.sort((x, y) => y.ratio - x.ratio)[0]
}

/** Détail des tests, pour chaque assertion et chaque camp. */
export function computeRepnessDetails(
  raw:              RawVote[][],
  groups:           number[],
  keptAssertionIds: string[],
): Record<string, Record<string, RepnessDetail>> {
  const uniqueGroups = [...new Set(groups)]
  const rowsOf = new Map(uniqueGroups.map(g => [g, groups.flatMap((x, i) => (x === g ? [i] : []))]))
  const restOf = new Map(uniqueGroups.map(g => [g, groups.flatMap((x, i) => (x !== g ? [i] : []))]))
  const result: Record<string, Record<string, RepnessDetail>> = {}
  keptAssertionIds.forEach((aid, j) => {
    result[aid] = {}
    for (const g of uniqueGroups) {
      result[aid][String(g)] = repnessFor(tallyColumn(raw, rowsOf.get(g)!, j), tallyColumn(raw, restOf.get(g)!, j))
    }
  })
  return result
}

/**
 * Score enregistré (`session_analysis.repness`) : +R si le camp est
 * significativement plus souvent d'accord, −R s'il est significativement plus
 * souvent contre, 0 sinon. Avant le chantier 171 : (moyenne camp − moyenne
 * reste) × votes du camp, sans test.
 */
export function computeRepness(
  raw:              RawVote[][],
  groups:           number[],
  keptAssertionIds: string[],
): Record<string, Record<string, number>> {
  const details = computeRepnessDetails(raw, groups, keptAssertionIds)
  const result: Record<string, Record<string, number>> = {}
  for (const [aid, byGroup] of Object.entries(details)) {
    result[aid] = {}
    for (const [g, d] of Object.entries(byGroup)) {
      result[aid][g] = d.significant ? (d.direction === 'agree' ? d.ratio : -d.ratio) : 0
    }
  }
  return result
}

// ── computeGroupConsensus ─────────────────────────────────────
/**
 * Polis §1.4 : consensus d'une assertion = ∏ sur les camps de
 * P(d'accord | camp), lissée (1 + N_agree) / (2 + N). Un camp où personne n'a
 * voté compte pour 1/2 (ni pour ni contre), ce qui évite qu'un petit camp muet
 * fabrique un consensus. Renvoie le produit brut et le score enregistré
 * 2·produit^(1/k) − 1 (voir AnalysisResult.groupConsensus).
 */
export function computeGroupConsensus(
  raw:              RawVote[][],
  groups:           number[],
  keptAssertionIds: string[],
): { scores: Record<string, number>; products: Record<string, number> } {
  const uniqueGroups = [...new Set(groups)]
  const rowsOf = uniqueGroups.map(g => groups.flatMap((x, i) => (x === g ? [i] : [])))
  const scores: Record<string, number> = {}
  const products: Record<string, number> = {}

  keptAssertionIds.forEach((aid, j) => {
    const ps = rowsOf.map(rows => {
      const t = tallyColumn(raw, rows, j)
      return smoothedShare(t.agree, t.n)
    })
    const product = ps.reduce((acc, p) => acc * p, 1)
    products[aid] = product
    scores[aid]   = 2 * product ** (1 / Math.max(1, ps.length)) - 1
  })

  return { scores, products }
}

// ── Test « un seul groupe » et stabilité ──────────────────────

function kmeansFixed(coords: [number, number][], k: number): number[] {
  return kmeans(coords, k, { initialization: 'kmeans++', seed: 42 }).clusters
}

/** Chaque colonne permutée indépendamment : mêmes réponses par assertion, aucun lien entre assertions. */
function permuteColumns(raw: RawVote[][], rand: () => number): RawVote[][] {
  const n = raw.length
  if (n === 0) return []
  const out: RawVote[][] = raw.map(row => row.slice())
  for (let j = 0; j < raw[0].length; j++) {
    const col = shuffled(raw.map(row => row[j]), rand)
    for (let i = 0; i < n; i++) out[i][j] = col[i]
  }
  return out
}

/**
 * Chantier 171 — le k-means trouve toujours des camps, même dans un nuage sans
 * groupes : on mesure la silhouette que le MÊME calcul (imputation, ACP,
 * correction, choix de k par silhouette) obtient sur des votes sans structure,
 * et la stabilité des camps quand on retire 20 % des votants. Sur la matrice
 * complète, pas sur la carte 2D (limite relevée par l'audit, § 3.1).
 * Déterministe : graine fixe.
 */
export function assessClusterValidity(
  raw:        RawVote[][],
  groups:     number[],
  kChosen:    number,
  silhouette: number,
  options:    { replicates?: number; stabilityReplicates?: number; seed?: number } = {},
): ClusterValidity {
  const replicates          = options.replicates ?? NULL_REPLICATES
  const stabilityReplicates = options.stabilityReplicates ?? STABILITY_REPLICATES
  const rand = mulberry32(options.seed ?? RANDOM_SEED)
  const n = raw.length

  // 1. Silhouettes sous l'hypothèse « aucune structure »
  const nullScores: number[] = []
  for (let r = 0; r < replicates; r++) {
    const { coords } = projectOpinions(permuteColumns(raw, rand))
    nullScores.push(runKMeans(coords).silhouette)
  }
  nullScores.sort((a, b) => a - b)
  const atLeast = nullScores.filter(s => s >= silhouette).length
  const pValue  = (1 + atLeast) / (1 + replicates)
  const nullSilhouette95 = nullScores.length === 0
    ? 0
    : nullScores[Math.min(nullScores.length - 1, Math.floor(0.95 * nullScores.length))]

  // 2. Stabilité : camps recalculés (même k) sur 80 % des votants
  const m = Math.max(kChosen * 2, Math.round(STABILITY_SUBSAMPLE * n))
  const aris: number[] = []
  const indices = raw.map((_, i) => i)
  for (let r = 0; r < stabilityReplicates && m < n; r++) {
    const pick = shuffled(indices, rand).slice(0, m).sort((a, b) => a - b)
    const { coords } = projectOpinions(pick.map(i => raw[i]))
    const sub = kmeansFixed(coords, kChosen)
    aris.push(adjustedRandIndex(pick.map(i => groups[i]), sub))
  }
  aris.sort((a, b) => a - b)
  const stabilityAri = aris.length === 0 ? 1 : aris[Math.floor(aris.length / 2)]

  const verdict: ClusterValidity['verdict'] =
    pValue >= STRUCTURE_ALPHA ? 'absents' : stabilityAri >= STABLE_ARI ? 'nets' : 'fragiles'

  return {
    silhouette,
    nullSilhouette95,
    pValue,
    replicates,
    stabilityAri,
    stabilityReplicates: aris.length,
    verdict,
  }
}

// ── runOpinionAnalysis ────────────────────────────────────────
/**
 * Orchestrateur : buildVoteMatrix → imputation + ACP + √(C/Cp) → k-means →
 * repness → consensus → test de structure et stabilité.
 * Lève AnalysisError('INSUFFICIENT_DATA') si les données sont insuffisantes.
 *
 * Sert à la séance complète et au sondage en mode camps (même calcul). Le
 * sondage en consentement n'appelle jamais cette fonction (aucun camp), le
 * débat simple non plus (aucun vote).
 */
export function runOpinionAnalysis(
  votes:      VoteRow[],
  members:    string[],
  assertions: string[],
  options:    { replicates?: number; stabilityReplicates?: number } = {},
): AnalysisResult {
  // 1. Construire la matrice filtrée
  const { raw, keptMemberIds, keptAssertionIds } = buildVoteMatrix(votes, members, assertions)

  // 2. Gardes post-filtrage
  if (keptMemberIds.length < MIN_VOTERS) {
    throw new AnalysisError(
      'INSUFFICIENT_DATA',
      `Analyse impossible : ${keptMemberIds.length} votant(s) avec au moins ${MIN_VOTES_PER_MEMBER} votes, minimum ${MIN_VOTERS} requis.`,
    )
  }
  if (keptAssertionIds.length < MIN_ASSERTIONS) {
    throw new AnalysisError(
      'INSUFFICIENT_DATA',
      `Analyse impossible : ${keptAssertionIds.length} assertion(s) après filtrage, minimum ${MIN_ASSERTIONS} requises.`,
    )
  }

  // 3. Carte : imputation, ACP, correction de parcimonie
  const { coords, varianceExplained } = projectOpinions(raw)

  // 4. k-means (peut lever INSUFFICIENT_DATA si trop peu de points)
  const { groups, kChosen, silhouette } = runKMeans(coords)

  // 5. Métriques d'opinion (sur les votes bruts : absents et blancs exclus)
  const repness = computeRepness(raw, groups, keptAssertionIds)
  const { scores: groupConsensus, products: consensusProduct } =
    computeGroupConsensus(raw, groups, keptAssertionIds)

  // 6. Les camps sont-ils réels ?
  const validity = assessClusterValidity(raw, groups, kChosen, silhouette, options)

  return {
    kChosen,
    silhouette,
    pcaVariance: varianceExplained,
    repness,
    groupConsensus,
    consensusProduct,
    validity,
    members: keptMemberIds.map((mid, i) => ({
      member_id: mid,
      pca_x:     coords[i][0],
      pca_y:     coords[i][1],
      group_id:  groups[i],
    })),
  }
}

// ── LoadedAnalysis ────────────────────────────────────────────

/**
 * Chantier 70 — quels votes ont nourri l'analyse : 'current' = tels qu'ils
 * sont au moment du calcul (comportement historique, avant ce chantier) ;
 * 'pre_closure' = reconstitués juste avant le premier revote du post-vote
 * (phases 'post_voting' et 'closed', via assertion_vote_history), pour comparer
 * l'opinion avant/après débat. Une analyse 'current' lancée avant le débat est
 * aussi un « avant » valable — l'écran de comparaison accepte n'importe quelle paire.
 */
export type VoteScope = 'current' | 'pre_closure'

export interface LoadedAnalysis {
  id:                     string
  k_chosen:               number
  /**
   * ⚠️ Nullable — les deux colonnes le sont en base, et les RPC héritées
   * `run_clustering_v1`/`v2` (laissées en base au chantier 37, plus appelées par
   * le frontend mais toujours invocables) créent des lignes `session_analysis`
   * sans jamais les renseigner. Une analyse produite par ce chemin faisait une
   * page blanche sur l'onglet Analyse (`silhouette_score.toFixed()` sur `null`,
   * constaté en prod le 2026-09-18). Ne pas réécrire ces deux types en
   * non-nullable : le type doit refléter la base, pas le cas favorable.
   */
  silhouette_score:       number | null
  pca_variance_explained: [number, number] | null
  repness:                Record<string, Record<string, number>>
  group_consensus:        Record<string, number>
  created_at:             string
  vote_scope:             VoteScope
  members: { member_id: string; pca_x: number; pca_y: number; group_id: number }[]
  /**
   * Chantier 171 — test « un seul groupe » et stabilité. Chantier 171b : relu
   * depuis `session_analysis.cluster_validity`. Absent pour les analyses
   * antérieures au 171b (colonne NULL) ou dont le blob ne passe pas
   * `parseClusterValidity` — l'onglet Analyse affiche alors « relancer ».
   */
  validity?:              ClusterValidity
}

/** Résumé d'une analyse, sans le détail des membres — pour lister les analyses d'une séance. */
export interface SessionAnalysisSummary {
  id:           string
  created_at:   string
  status:       'pending' | 'done' | 'error'
  k_chosen:     number | null
  vote_scope:   VoteScope
  member_count: number
}

// ── PublicResultsData ─────────────────────────────────────────
// Chantier 46 — get_public_results() ne retourne plus un résumé filtré
// (top-3 par camp / consensus > seuil) mais la liste complète des
// assertions approuvées avec leurs compteurs, et le nuage de points
// anonyme (sans member_id) — même esprit que ResultsMapData mais sans
// aucun identifiant, gate en base sur phase='closed' ET results_public=true.

export interface PublicResultsData {
  k_chosen:   number | null
  points:     { pca_x: number; pca_y: number; group_id: number }[]
  assertions: { content: string; agree_count: number; disagree_count: number; pass_count: number }[]
}

// ── ResultsMapData ────────────────────────────────────────────

export interface ResultsMapData {
  k_chosen:       number
  points:         { pca_x: number; pca_y: number; group_id: number; is_self: boolean }[]
  consensus:      { content: string; score: number }[] | null
  repness?:        Record<string, Record<string, number>>  // assertion_id → {group_id → score}
  group_consensus?: Record<string, number>                 // assertion_id → score
  all_assertions?: Record<string, string>                  // assertion_id → content
  /** Chantier 171b — absent avant la migration, null pour une analyse ancienne. */
  pca_variance_explained?: [number, number] | null
  /** Chantier 171b — validé par `normalizeResultsMap` ; null si absent ou illisible. */
  cluster_validity?:       ClusterValidity | null
}

// ── Wrappers Supabase ─────────────────────────────────────────

/**
 * Charge tous les votes d'une session via RPC get_all_votes_for_analysis.
 * Contourne la RLS (vérification mot de passe superadmin côté SQL).
 *
 * Chantier 70 — `voteScope`: 'current' (défaut, comportement historique) lit
 * les votes tels qu'ils sont maintenant ; 'pre_closure' les reconstitue tels
 * qu'ils étaient juste avant le premier revote du post-vote (via
 * assertion_vote_history côté serveur) — permet de relancer l'analyse sur
 * l'état d'avant-débat pour la comparer à l'état courant.
 */
export async function loadVotesForAnalysis(
  supabase:      SupabaseClient,
  password:      string,
  sessionId:     string,
  attendingOnly: boolean = false,
  voteScope:     VoteScope = 'current',
): Promise<VoteRow[]> {
  const { data, error } = await supabase.rpc('get_all_votes_for_analysis', {
    p_password:       password,
    p_session_id:     sessionId,
    p_attending_only: attendingOnly,
    p_vote_scope:     voteScope,
  })
  if (error) throw new Error(extractErr(error))
  return (data as VoteRow[]) ?? []
}

/**
 * Charge le résumé public d'une session clôturée via RPC get_public_results.
 * Accessible à tous (aucune auth requise), retourne null si pas d'analyse ou session non closed.
 */
export async function loadPublicResults(
  supabase:  SupabaseClient,
  sessionId: string,
): Promise<PublicResultsData | null> {
  const { data, error } = await supabase.rpc('get_public_results', {
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))
  if (!data) return null
  return data as PublicResultsData
}

/**
 * Charge la carte d'opinion anonymisée d'une session closed via RPC get_results_map.
 * Retourne null si la session n'est pas closed, si le membre ne correspond pas
 * à auth.uid(), ou si aucune analyse n'existe.
 */
export async function loadResultsMap(
  supabase:  SupabaseClient,
  sessionId: string,
  memberId:  string,
): Promise<ResultsMapData | null> {
  const { data, error } = await supabase.rpc('get_results_map', {
    p_session_id: sessionId,
    p_member_id:  memberId,
  })
  if (error) throw new Error(extractErr(error))
  if (!data) return null
  return normalizeResultsMap(data)
}

/**
 * Chantier 171b — frontière de get_results_map pour les deux champs ajoutés :
 * `cluster_validity` est un jsonb libre écrit par une version du front et relu
 * par une autre (même piège que le localStorage, CLAUDE.md « Ne jamais
 * faire ») ; `pca_variance_explained` est nullable en base.
 */
export function normalizeResultsMap(data: unknown): ResultsMapData {
  const r = data as ResultsMapData & { pca_variance_explained?: unknown; cluster_validity?: unknown }
  return {
    ...r,
    pca_variance_explained: parsePcaVariance(r.pca_variance_explained),
    cluster_validity:       parseClusterValidity(r.cluster_validity),
  }
}

/** `[x, y]` fini, sinon null (colonne nullable, RPC héritées). */
export function parsePcaVariance(v: unknown): [number, number] | null {
  return Array.isArray(v) && v.length >= 2 && v.slice(0, 2).every(x => typeof x === 'number' && Number.isFinite(x))
    ? [v[0] as number, v[1] as number]
    : null
}

const VERDICTS: readonly ClusterValidity['verdict'][] = ['nets', 'fragiles', 'absents']

/**
 * Chantier 171b — valide un `cluster_validity` relu de la base. Null pour une
 * analyse antérieure au chantier (colonne NULL) ou pour toute forme
 * inattendue : mieux vaut « non mesurée » qu'un verdict inventé.
 */
export function parseClusterValidity(v: unknown): ClusterValidity | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const num = (k: string) => typeof o[k] === 'number' && Number.isFinite(o[k] as number)
  if (!['silhouette', 'nullSilhouette95', 'pValue', 'replicates', 'stabilityAri', 'stabilityReplicates'].every(num)) return null
  if (!VERDICTS.includes(o.verdict as ClusterValidity['verdict'])) return null
  return {
    silhouette:          o.silhouette as number,
    nullSilhouette95:    o.nullSilhouette95 as number,
    pValue:              o.pValue as number,
    replicates:          o.replicates as number,
    stabilityAri:        o.stabilityAri as number,
    stabilityReplicates: o.stabilityReplicates as number,
    verdict:             o.verdict as ClusterValidity['verdict'],
  }
}

/**
 * Charge la dernière analyse (status='done') d'une session via RPC get_latest_analysis.
 * Retourne null si aucune analyse n'existe encore.
 */
/**
 * Frontière DB → front. `repness` et `group_consensus` sont **nullables en
 * base**, et toute analyse créée par les RPC héritées `run_clustering_v1`/`v2`
 * (laissées en base au chantier 37) les laisse à `NULL`. Un `as LoadedAnalysis`
 * brut laissait ces `null` filer jusqu'au rendu, où `Object.entries(null)` et
 * `silhouette_score.toFixed()` faisaient une page blanche (constaté en prod le
 * 2026-09-18 sur une séance d'essai analysée par ce chemin).
 *
 * Les deux dictionnaires sont ramenés à `{}` — un vide honnête, que tous les
 * consommateurs traversent sans garde. Les deux métriques scalaires restent
 * `null` : elles sont réellement inconnues, et l'affichage le dit (« n/c »)
 * plutôt que d'inventer un 0 qui se lirait comme un vrai score.
 */
export function normalizeLoadedAnalysis(data: unknown): LoadedAnalysis {
  const { cluster_validity, ...a } = data as LoadedAnalysis & { cluster_validity?: unknown }
  const validity = parseClusterValidity(cluster_validity)
  return {
    ...a,
    repness:         a.repness         ?? {},
    group_consensus: a.group_consensus ?? {},
    members:         Array.isArray(a.members) ? a.members : [],
    ...(validity ? { validity } : {}),
  }
}

export async function loadLatestAnalysis(
  supabase:  SupabaseClient,
  password:  string,
  sessionId: string,
): Promise<LoadedAnalysis | null> {
  const { data, error } = await supabase.rpc('get_latest_analysis', {
    p_password:   password,
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))
  if (!data) return null
  return normalizeLoadedAnalysis(data)
}

/**
 * Chantier 70 — liste toutes les analyses d'une session (pas seulement la
 * dernière), triées de la plus récente à la plus ancienne, avec leur
 * `vote_scope` ('current'/'pre_closure') et le nombre de membres placés.
 * Sert à bâtir un futur écran de comparaison avant/après débat — ce module
 * n'en fournit que les données, pas l'affichage.
 */
export async function listSessionAnalyses(
  supabase:  SupabaseClient,
  password:  string,
  sessionId: string,
): Promise<SessionAnalysisSummary[]> {
  const { data, error } = await supabase.rpc('list_session_analyses', {
    p_password:   password,
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))
  return (data as SessionAnalysisSummary[]) ?? []
}

/**
 * Chantier 70 — charge une analyse précise par son id (pas seulement "la
 * dernière", contrairement à `loadLatestAnalysis`). Retourne null si l'id
 * n'existe pas ou si son statut n'est pas 'done'.
 */
export async function loadAnalysisById(
  supabase:   SupabaseClient,
  password:   string,
  analysisId: string,
): Promise<LoadedAnalysis | null> {
  const { data, error } = await supabase.rpc('get_analysis_by_id', {
    p_password:    password,
    p_analysis_id: analysisId,
  })
  if (error) throw new Error(extractErr(error))
  if (!data) return null
  return normalizeLoadedAnalysis(data)
}

// ── Qui a changé d'avis (chantier 167) ───────────────────────
//
// Lecture directe de l'historique des votes (assertion_vote_history), sans
// passer par les analyses : "avant" = vote en vigueur juste avant le premier
// revote fait en post-vote, "après" = vote courant. Voir la migration
// 20261009_chantier166_resume_changements_de_vote.sql. Ne dépend donc pas du moment où l'animateur a
// lancé ses analyses.

export type { VoteValue }

export interface VoteTransition {
  from:  VoteValue
  to:    VoteValue
  count: number
}

export interface AssertionVoteChange {
  assertionId:    string
  changed:        number
  beforeAgree:    number
  beforeDisagree: number
  beforePass:     number
  afterAgree:     number
  afterDisagree:  number
  afterPass:      number
}

export interface VoteChangesSummary {
  /** Membres ayant au moins un vote d'avant-débat. */
  membersBefore:  number
  /** Dont ceux qui ont changé au moins un vote. */
  membersChanged: number
  pairsTotal:     number
  pairsChanged:   number
  /** Votes posés pour la première fois en post-vote (pas d'« avant »). */
  newVotes:       number
  newVoters:      number
  transitions:    VoteTransition[]
  /** Uniquement les assertions dont au moins un vote a changé, les plus bougées d'abord. */
  assertions:     AssertionVoteChange[]
}

const VOTE_VALUES: readonly string[] = ['agree', 'disagree', 'pass']

function asCount(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/**
 * Remet à la forme attendue la réponse de `get_vote_changes_admin` — un champ
 * absent ou mal typé devient 0 / [] plutôt qu'un plantage de rendu.
 */
export function normalizeVoteChanges(data: unknown): VoteChangesSummary {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  const transitions: VoteTransition[] = []
  if (Array.isArray(d.transitions)) {
    for (const t of d.transitions as Record<string, unknown>[]) {
      if (t && VOTE_VALUES.includes(String(t.from)) && VOTE_VALUES.includes(String(t.to))) {
        transitions.push({ from: t.from as VoteValue, to: t.to as VoteValue, count: asCount(t.count) })
      }
    }
  }
  const assertions: AssertionVoteChange[] = []
  if (Array.isArray(d.assertions)) {
    for (const a of d.assertions as Record<string, unknown>[]) {
      if (a && typeof a.assertion_id === 'string') {
        assertions.push({
          assertionId:    a.assertion_id,
          changed:        asCount(a.changed),
          beforeAgree:    asCount(a.before_agree),
          beforeDisagree: asCount(a.before_disagree),
          beforePass:     asCount(a.before_pass),
          afterAgree:     asCount(a.after_agree),
          afterDisagree:  asCount(a.after_disagree),
          afterPass:      asCount(a.after_pass),
        })
      }
    }
  }
  return {
    membersBefore:  asCount(d.members_before),
    membersChanged: asCount(d.members_changed),
    pairsTotal:     asCount(d.pairs_total),
    pairsChanged:   asCount(d.pairs_changed),
    newVotes:       asCount(d.new_votes),
    newVoters:      asCount(d.new_voters),
    transitions,
    assertions,
  }
}

export async function loadVoteChanges(
  supabase:      SupabaseClient,
  password:      string,
  sessionId:     string,
  attendingOnly: boolean = false,
): Promise<VoteChangesSummary> {
  const { data, error } = await supabase.rpc('get_vote_changes_admin', {
    p_password:       password,
    p_session_id:     sessionId,
    p_attending_only: attendingOnly,
  })
  if (error) throw new Error(extractErr(error))
  return normalizeVoteChanges(data)
}

// ── Comparaison avant / après débat (chantier 79) ────────────
//
// Piège central (voir docs/chantiers-a-faire.md, chantier 79) : deux calculs
// k-means successifs ne numérotent pas les camps pareil — `group_id` est un
// artefact de l'exécution (ordre d'initialisation kmeans++, k peut même
// différer). Comparer deux analyses en supposant que "groupe 0" désigne le
// même camp des deux côtés produirait un résultat FAUX ET CONVAINCANT.
// On apparie donc les groupes de deux analyses sur leur COMPOSITION réelle
// (chevauchement de member_id), jamais sur leur numéro.

export interface GroupPairing {
  aGroupId:     number
  bGroupId:     number | null  // null si aucun groupe de b ne partage de membre avec aGroupId
  overlapCount: number
  aSize:        number
  bSize:        number
}

/**
 * Apparie les groupes de `a` à ceux de `b` par chevauchement maximal de
 * membres (glouton : pour chaque groupe de `a`, dans l'ordre, choisit le
 * groupe de `b` encore disponible avec le plus de membres en commun).
 * Heuristique volontairement simple (pas d'appariement optimal global type
 * Hongrois) — suffisant pour k ≤ 5, et le nombre de membres en commun est
 * affiché à côté de chaque paire pour que l'appariement reste vérifiable
 * à l'œil plutôt que de se fier aveuglément à l'algorithme.
 */
export function pairGroups(a: LoadedAnalysis, b: LoadedAnalysis): GroupPairing[] {
  const aGroupIds = [...new Set(a.members.map(m => m.group_id))].sort((x, y) => x - y)

  const bMembersByGroup = new Map<number, Set<string>>()
  for (const m of b.members) {
    if (!bMembersByGroup.has(m.group_id)) bMembersByGroup.set(m.group_id, new Set())
    bMembersByGroup.get(m.group_id)!.add(m.member_id)
  }

  const usedB: Set<number> = new Set()
  const pairings: GroupPairing[] = []

  for (const ag of aGroupIds) {
    const aMembers = new Set(a.members.filter(m => m.group_id === ag).map(m => m.member_id))

    let bestB: number | null = null
    let bestOverlap = 0
    for (const [bg, bMembers] of bMembersByGroup) {
      if (usedB.has(bg)) continue
      let overlap = 0
      for (const mid of aMembers) if (bMembers.has(mid)) overlap++
      if (overlap > bestOverlap) {
        bestOverlap = overlap
        bestB = bg
      }
    }
    if (bestB !== null) usedB.add(bestB)

    pairings.push({
      aGroupId:     ag,
      bGroupId:     bestB,
      overlapCount: bestOverlap,
      aSize:        aMembers.size,
      bSize:        bestB !== null ? (bMembersByGroup.get(bestB)?.size ?? 0) : 0,
    })
  }

  return pairings
}

export interface MemberMovement {
  memberId:  string
  aGroupId:  number
  bGroupId:  number | null  // null = membre absent de b (n'a pas revoté / exclu du second calcul)
  stayed:    boolean        // bGroupId est bien le groupe apparié à aGroupId
}

/**
 * Pour chaque membre présent dans `a`, dit s'il est resté dans le camp
 * apparié (`pairGroups`) ou s'il en a changé entre les deux analyses.
 * `bGroupId: null` distingue explicitement "n'a pas de vote dans b" de
 * "a changé de camp" — un membre qui n'a pas revoté au postvote ne doit
 * pas apparaître comme ayant quitté son camp.
 */
export function computeMemberMovements(
  a:         LoadedAnalysis,
  b:         LoadedAnalysis,
  pairings:  GroupPairing[],
): MemberMovement[] {
  const bGroupByMember = new Map(b.members.map(m => [m.member_id, m.group_id]))
  const expectedB = new Map(pairings.map(p => [p.aGroupId, p.bGroupId]))

  return a.members.map(m => {
    const bGroupId = bGroupByMember.get(m.member_id) ?? null
    return {
      memberId: m.member_id,
      aGroupId: m.group_id,
      bGroupId,
      stayed:   bGroupId !== null && bGroupId === expectedB.get(m.group_id),
    }
  })
}

export interface ConsensusMovement {
  assertionId: string
  scoreA:      number
  scoreB:      number
  delta:       number  // scoreB - scoreA ; positif = plus consensuelle après
}

/**
 * Écart de `group_consensus` par assertion entre deux analyses. Contrairement
 * à `repness` (clé par group_id, donc sujet au même piège de numérotation que
 * pairGroups ci-dessus), `group_consensus` est un score par assertion
 * indépendant du numéro de groupe — comparable directement sans appariement.
 * Ne retourne que les assertions présentes dans les deux analyses.
 */
export function computeConsensusMovements(
  a: LoadedAnalysis,
  b: LoadedAnalysis,
): ConsensusMovement[] {
  const result: ConsensusMovement[] = []
  for (const [aid, scoreA] of Object.entries(a.group_consensus)) {
    const scoreB = b.group_consensus[aid]
    if (scoreB === undefined) continue
    result.push({ assertionId: aid, scoreA, scoreB, delta: scoreB - scoreA })
  }
  return result
}

/**
 * Sauvegarde le résultat de l'analyse via RPC save_analysis (transaction atomique).
 * Retourne l'uuid de la nouvelle ligne session_analysis. N'écrase jamais une
 * analyse précédente — save_analysis fait un INSERT, jamais un upsert ; chaque
 * appel crée une nouvelle ligne `session_analysis`, consultable ensuite via
 * `listSessionAnalyses`/`loadAnalysisById`.
 *
 * Chantier 70 — `voteScope` tague l'analyse selon les votes utilisés pour la
 * calculer (voir `loadVotesForAnalysis`). Par défaut 'current', comme avant
 * ce chantier.
 */
export async function saveAnalysisResult(
  supabase:  SupabaseClient,
  password:  string,
  sessionId: string,
  result:    AnalysisResult,
  voteScope: VoteScope = 'current',
): Promise<string> {
  const params = {
    p_password:        password,
    p_session_id:      sessionId,
    p_k_chosen:        result.kChosen,
    p_silhouette:      result.silhouette,
    p_pca_variance:    result.pcaVariance,
    p_repness:         result.repness,
    p_group_consensus: result.groupConsensus,
    p_members:         result.members,
    p_vote_scope:      voteScope,
  }
  // Chantier 171b — le verdict de fiabilité part avec l'analyse.
  let { data, error } = await supabase.rpc('save_analysis', { ...params, p_cluster_validity: result.validity })
  // Base pas encore migrée (save_analysis à 9 arguments) : PostgREST ne trouve
  // aucune fonction à cette signature (PGRST202). On enregistre l'analyse sans
  // le verdict plutôt que de faire échouer tout le calcul.
  if (error?.code === 'PGRST202') {
    ;({ data, error } = await supabase.rpc('save_analysis', params))
  }
  if (error) throw new Error(extractErr(error))
  return data as string
}
