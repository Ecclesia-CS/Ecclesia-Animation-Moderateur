// =============================================================
// Analyse des camps d'opinion — logique de calcul
// Fonctions pures, aucune dépendance React.
// I/O Supabase uniquement dans les deux wrappers en bas de fichier.
// =============================================================

import { PCA } from 'ml-pca'
import { kmeans } from 'ml-kmeans'
import type { SupabaseClient } from '@supabase/supabase-js'
import { extractErr } from './utils'

// ── Constantes ajustables ────────────────────────────────────
const MIN_VOTERS              = 6
const MIN_ASSERTIONS          = 5
const MIN_VOTES_PER_ASSERTION = 3  // assertions avec moins de N votes réels exclues
const MIN_VOTES_PER_MEMBER    = 1  // membres avec moins de N votes après filtrage exclus

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
  member_id:    string
  assertion_id: string
  vote:         'agree' | 'disagree' | 'pass'
}

export interface VoteMatrix {
  matrix:           number[][]
  keptMemberIds:    string[]
  keptAssertionIds: string[]
}

export interface AnalysisResult {
  kChosen:        number
  silhouette:     number
  pcaVariance:    [number, number]
  repness:        Record<string, Record<string, number>>
  groupConsensus: Record<string, number>
  members: { member_id: string; pca_x: number; pca_y: number; group_id: number }[]
}

// ── buildVoteMatrix ───────────────────────────────────────────
/**
 * Construit la matrice membres × assertions.
 * Encodage : agree=+1, disagree=-1, pass=0, absent=0.
 * Applique le filtrage sparsité en deux passes :
 *   1. Exclure les assertions avec < MIN_VOTES_PER_ASSERTION votes réels
 *   2. Exclure les membres avec < MIN_VOTES_PER_MEMBER votes sur les assertions restantes
 */
export function buildVoteMatrix(
  votes:      VoteRow[],
  members:    string[],
  assertions: string[],
): VoteMatrix {
  // Index vote → valeur numérique
  const encode = (v: VoteRow['vote']): number =>
    v === 'agree' ? 1 : v === 'disagree' ? -1 : 0

  // Table de lookup vote : memberIdx × assertionIdx
  const voteMap = new Map<string, number>()
  for (const v of votes) {
    voteMap.set(`${v.member_id}::${v.assertion_id}`, encode(v.vote))
  }

  // Comptage des votes réels par assertion (≠ absent, mais pass compte)
  const realVotesByAssertion = new Map<string, number>()
  for (const v of votes) {
    realVotesByAssertion.set(
      v.assertion_id,
      (realVotesByAssertion.get(v.assertion_id) ?? 0) + 1,
    )
  }

  // Passe 1 : filtrer les assertions sous-votées
  const filteredAssertions = assertions.filter(
    aid => (realVotesByAssertion.get(aid) ?? 0) >= MIN_VOTES_PER_ASSERTION,
  )

  // Comptage des votes réels par membre sur les assertions retenues
  const realVotesByMember = new Map<string, number>()
  for (const v of votes) {
    if (!filteredAssertions.includes(v.assertion_id)) continue
    realVotesByMember.set(
      v.member_id,
      (realVotesByMember.get(v.member_id) ?? 0) + 1,
    )
  }

  // Passe 2 : filtrer les membres sous-votants
  const filteredMembers = members.filter(
    mid => (realVotesByMember.get(mid) ?? 0) >= MIN_VOTES_PER_MEMBER,
  )

  // Construction de la matrice
  const matrix: number[][] = filteredMembers.map(mid =>
    filteredAssertions.map(aid => voteMap.get(`${mid}::${aid}`) ?? 0),
  )

  return {
    matrix,
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

  const dist = (a: [number, number], b: [number, number]): number =>
    Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)

  const uniqueClusters = [...new Set(labels)]

  const scores = coords.map((_, i) => {
    const myCluster = labels[i]

    // Points du même cluster (hors i)
    const sameCluster = coords.filter((__, j) => j !== i && labels[j] === myCluster)

    // a(i) : distance moyenne intra-cluster
    const a = sameCluster.length === 0
      ? 0
      : sameCluster.reduce((sum, c) => sum + dist(coords[i], c), 0) / sameCluster.length

    // b(i) : distance moyenne minimum inter-cluster
    const otherClusters = uniqueClusters.filter(c => c !== myCluster)
    if (otherClusters.length === 0) return 0

    const b = Math.min(
      ...otherClusters.map(c => {
        const pts = coords.filter((__, j) => labels[j] === c)
        if (pts.length === 0) return Infinity
        return pts.reduce((sum, p) => sum + dist(coords[i], p), 0) / pts.length
      }),
    )

    const denom = Math.max(a, b)
    return denom === 0 ? 0 : (b - a) / denom
  })

  return scores.reduce((sum, s) => sum + s, 0) / scores.length
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

// ── computeRepness ────────────────────────────────────────────
/**
 * Pour chaque assertion a et groupe g :
 * repness(a,g) = (mean_vote(a,g) − mean_vote(a, not_g)) × n_votes_réels(a,g)
 */
export function computeRepness(
  matrix:           number[][],
  groups:           number[],
  keptAssertionIds: string[],
): Record<string, Record<string, number>> {
  const uniqueGroups = [...new Set(groups)]
  const result: Record<string, Record<string, number>> = {}

  keptAssertionIds.forEach((aid, j) => {
    result[aid] = {}
    for (const g of uniqueGroups) {
      const inGroup  = matrix.filter((_, i) => groups[i] === g).map(row => row[j])
      const outGroup = matrix.filter((_, i) => groups[i] !== g).map(row => row[j])

      const mean = (arr: number[]) =>
        arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length

      const meanIn  = mean(inGroup)
      const meanOut = mean(outGroup)
      const nVotes  = inGroup.filter(v => v !== 0).length

      result[aid][String(g)] = (meanIn - meanOut) * nVotes
    }
  })

  return result
}

// ── computeGroupConsensus ─────────────────────────────────────
/**
 * Pour chaque assertion : score = min des moyennes par groupe.
 * Une assertion consensuelle est approuvée par tous les groupes en moyenne.
 */
export function computeGroupConsensus(
  matrix:           number[][],
  groups:           number[],
  keptAssertionIds: string[],
): Record<string, number> {
  const uniqueGroups = [...new Set(groups)]
  const result: Record<string, number> = {}

  keptAssertionIds.forEach((aid, j) => {
    const means = uniqueGroups.map(g => {
      const col = matrix.filter((_, i) => groups[i] === g).map(row => row[j])
      return col.length === 0 ? 0 : col.reduce((s, v) => s + v, 0) / col.length
    })
    result[aid] = Math.min(...means)
  })

  return result
}

// ── runOpinionAnalysis ────────────────────────────────────────
/**
 * Orchestrateur : enchaîne buildVoteMatrix → PCA → k-means → repness → consensus.
 * Lève AnalysisError('INSUFFICIENT_DATA') si les données sont insuffisantes.
 */
export function runOpinionAnalysis(
  votes:      VoteRow[],
  members:    string[],
  assertions: string[],
): AnalysisResult {
  // 1. Construire la matrice filtrée
  const { matrix, keptMemberIds, keptAssertionIds } = buildVoteMatrix(votes, members, assertions)

  // 2. Gardes post-filtrage
  if (keptMemberIds.length < MIN_VOTERS) {
    throw new AnalysisError(
      'INSUFFICIENT_DATA',
      `Analyse impossible : ${keptMemberIds.length} votant(s) après filtrage, minimum ${MIN_VOTERS} requis.`,
    )
  }
  if (keptAssertionIds.length < MIN_ASSERTIONS) {
    throw new AnalysisError(
      'INSUFFICIENT_DATA',
      `Analyse impossible : ${keptAssertionIds.length} assertion(s) après filtrage, minimum ${MIN_ASSERTIONS} requises.`,
    )
  }

  // 3. PCA
  const { coords, varianceExplained } = runPCA(matrix)

  // 4. k-means (peut lever INSUFFICIENT_DATA si trop peu de points)
  const { groups, kChosen, silhouette } = runKMeans(coords)

  // 5. Métriques d'opinion
  const repness       = computeRepness(matrix, groups, keptAssertionIds)
  const groupConsensus = computeGroupConsensus(matrix, groups, keptAssertionIds)

  // 6. Résultat final
  return {
    kChosen,
    silhouette,
    pcaVariance: varianceExplained,
    repness,
    groupConsensus,
    members: keptMemberIds.map((mid, i) => ({
      member_id: mid,
      pca_x:     coords[i][0],
      pca_y:     coords[i][1],
      group_id:  groups[i],
    })),
  }
}

// ── LoadedAnalysis ────────────────────────────────────────────

export interface LoadedAnalysis {
  id:                     string
  k_chosen:               number
  silhouette_score:       number
  pca_variance_explained: [number, number]
  repness:                Record<string, Record<string, number>>
  group_consensus:        Record<string, number>
  created_at:             string
  members: { member_id: string; pca_x: number; pca_y: number; group_id: number }[]
}

// ── PublicResultsData ─────────────────────────────────────────

export interface PublicResultsData {
  k_chosen:  number
  groups:    { group_id: number; top_assertions: { content: string; score: number }[] }[]
  consensus: { content: string; score: number }[] | null
}

// ── ResultsMapData ────────────────────────────────────────────

export interface ResultsMapData {
  k_chosen:       number
  points:         { pca_x: number; pca_y: number; group_id: number; is_self: boolean }[]
  consensus:      { content: string; score: number }[] | null
  repness?:        Record<string, Record<string, number>>  // assertion_id → {group_id → score}
  group_consensus?: Record<string, number>                 // assertion_id → score
  all_assertions?: Record<string, string>                  // assertion_id → content
}

// ── Wrappers Supabase ─────────────────────────────────────────

/**
 * Charge tous les votes d'une session via RPC get_all_votes_for_analysis.
 * Contourne la RLS (vérification mot de passe superadmin côté SQL).
 */
export async function loadVotesForAnalysis(
  supabase:  SupabaseClient,
  password:  string,
  sessionId: string,
): Promise<VoteRow[]> {
  const { data, error } = await supabase.rpc('get_all_votes_for_analysis', {
    p_password:   password,
    p_session_id: sessionId,
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
  return data as ResultsMapData
}

/**
 * Charge la dernière analyse (status='done') d'une session via RPC get_latest_analysis.
 * Retourne null si aucune analyse n'existe encore.
 */
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
  return data as LoadedAnalysis
}

/**
 * Sauvegarde le résultat de l'analyse via RPC save_analysis (transaction atomique).
 * Retourne l'uuid de la nouvelle ligne session_analysis.
 */
export async function saveAnalysisResult(
  supabase:  SupabaseClient,
  password:  string,
  sessionId: string,
  result:    AnalysisResult,
): Promise<string> {
  const { data, error } = await supabase.rpc('save_analysis', {
    p_password:        password,
    p_session_id:      sessionId,
    p_k_chosen:        result.kChosen,
    p_silhouette:      result.silhouette,
    p_pca_variance:    result.pcaVariance,
    p_repness:         result.repness,
    p_group_consensus: result.groupConsensus,
    p_members:         result.members,
  })
  if (error) throw new Error(extractErr(error))
  return data as string
}
