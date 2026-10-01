// =============================================================
// Chantier 19 (G1) — Algorithme d'allocation v2
// Chantier 91 — les passifs deviennent du public
//
// Répartit les participants présentiels en tables de débat selon des
// règles arbitrées en ordre lexicographique strict (spec d'origine :
// docs/chantier-5-allocation-v2-spec.md, amendée par le chantier 91).
//
// Fonctions pures, aucune dépendance React ni Supabase — même
// pattern que src/lib/analysis.ts. Les wrappers d'I/O sont dans
// src/lib/voting.ts (loadAllocationInputs / applyAllocation).
//
// ── Deux populations (chantier 91) ───────────────────────────
// Les **actifs** débattent : eux seuls forment les tables et entrent dans
// les règles. Les **passifs** ne prennent a priori pas la parole : ils sont
// placés ensuite, **en public**, répartis uniformément sur les tables
// animées (décision de Jules, 16/09 : « pourquoi avoir un ratio à respecter,
// si on ne veut plus considérer les actifs dans la création des tables ? »).
// Il n'y a donc plus de règle « assez d'actifs ».
//
// ── Les 4 règles (priorité décroissante, sur les actifs) ─────
//   1. Table enregistrable  : ≥1 table sans non-consentant ET non homogène
//   2. Hétérogénéité        : camp majoritaire ≤ 70 % ET 2e camp ≥ 2 personnes
//   3. Assez d'anciens      : anciens ≥ ⌈2/5·actifs⌉ (plancher 3 sans modérateur)
//   4. Nouveaux encadrés    : maximiser les nouveaux aux tables modérées
//
// ⚠️ Numérotation : jusqu'au chantier 90, ces règles portaient les numéros
// 2 à 5 (la règle 1 était « assez d'actifs », supprimée).
//
// Contraintes dures : 5 à 14 actifs par table animée, 5 à 7 par table sans
// modérateur, 30 personnes au plus par table public compris. L'algorithme ne
// peut jamais échouer : tout le reste dégrade (règle 4 sacrifiée en premier).
//
// ── Chantier 98 — interdire les tables sans modérateur (option) ──
// `AllocationInput.forbidUnmoderatedTables` restreint les formes explorées
// à celles où **toutes** les tables sont animées, avant même d'évaluer les
// 4 règles ci-dessus (Jules, 19/09 : « on laisse d'autres critères être
// brisés, bien sûr »). Désactivée par défaut (comportement inchangé). Ce
// n'est pas une 5ᵉ règle lexicographique : c'est un filtre sur l'ensemble
// des formes candidates (`enumerateShapes`), qui peut donc réduire le nombre
// de tables en dessous de ce que la population permettrait autrement.
// =============================================================

// ── Constantes ───────────────────────────────────────────────

/** Nombre minimal d'actifs d'une table quand il y a allocation. */
export const TABLE_MIN = 5
/**
 * Nombre maximal d'**actifs** d'une table animée (chantier 91 — était
 * `TABLE_MAX = 12` personnes, passifs compris).
 */
export const TABLE_MAX_ACTIVE = 14
/**
 * Limite physique d'une table, public compris (chantier 91, Jules : « une
 * sorte de limite physique pour placer les gens »). Le public qui ne tient
 * plus aux tables animées déborde, avec avertissement ; au pire la limite est
 * dépassée plutôt que de lever une exception.
 */
export const TABLE_TOTAL_MAX = 30
/** Actifs ≤ ce seuil → table unique, pas d'allocation. */
export const SINGLE_TABLE_MAX = 10
/**
 * Tables **sans modérateur** : bornes resserrées, en actifs. L'auto-régulation
 * par `claim_floor` (le premier en file prend la parole) reste gérable dans
 * cette plage. Demandé par Jules le 2026-08-01, resserré à 5-7 le 2026-08-03.
 */
export const UNMODERATED_TABLE_MIN = 5
export const UNMODERATED_TABLE_MAX = 7
/**
 * Anciens minimum dans une table sans modérateur — plancher dur qui remplace
 * la formule de la règle 3 quand elle donnerait moins. Conservé au chantier 91.
 */
export const UNMODERATED_VETERAN_FLOOR = 3
/** Règle 2 — part maximale du camp majoritaire dans une table. */
export const MAJORITY_SHARE_CAP = 0.70
/** Règle 2 — effectif minimal du 2ᵉ camp (nombre absolu, pas un %). */
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

// ── Chantier 29 — réglages de la recherche (I1) ──────────────
//
// **Défaut en production : `STRATEGY_ABSOLUTE_STRONG`** (validé par Jules le
// 2026-07-29). Les autres constantes n'existent que pour le banc d'essai —
// aucune ne doit être passée par l'application.
//
// Le chantier 29 a établi que la métrique « taux d'échec » (`-fail/T`) pousse
// à fragmenter la salle dès qu'une règle de seuil est globalement
// insatisfaisable, et que la recherche elle-même était en cause (budget
// consommé dans l'ordre d'énumération des formes). D'où deux correctifs
// indissociables : métrique absolue **et** recherche fiabilisée.
//
// Les réglages restent découpés en champs indépendants pour permettre
// l'**ablation** (`bench/allocation-bench.ts`). Ne pas les fusionner en un booléen.
export interface AllocationStrategy {
  /**
   * Terme principal de la règle des anciens.
   *  · `rate`     — `-échecs / T` (comportement historique) ;
   *  · `absolute` — `-Σ(personnes manquantes)`, invariant au découpage.
   */
  shortfallMetric: 'rate' | 'absolute'
  /** Nombre de démarrages par forme. */
  restarts: number
  /**
   * Répartition du budget d'évaluations entre les formes candidates.
   *  · `null`   — pool global consommé dans l'ordre d'énumération (historique) ;
   *  · `'fair'` — part équitable du budget restant entre les formes restantes ;
   *  · un nombre — plafond fixe par forme.
   */
  perShapeBudget: number | 'fair' | null
  /**
   * Voisinage dirigé : réparer d'abord les déficits d'anciens par des
   * échanges **à camp constant** (neutres pour l'hétérogénéité, plus prioritaire).
   */
  targetedNeighborhood: boolean
  /** Amorce par quotas : distribution exacte des anciens avant toute descente. */
  quotaSeeding: boolean
  /** Élagage par borne : une forme dont l'optimum théorique est déjà battu est ignorée. */
  boundPruning: boolean
}

/** Comportement historique (chantiers 19 à 25c) — référence du banc d'essai. */
export const STRATEGY_LEGACY: AllocationStrategy = {
  shortfallMetric: 'rate',
  restarts: RESTARTS,
  perShapeBudget: null,
  targetedNeighborhood: false,
  quotaSeeding: false,
  boundPruning: false,
}

/** Piste « corriger la formule seule » — le correctif naïf du 25b. */
export const STRATEGY_ABSOLUTE_ONLY: AllocationStrategy = {
  ...STRATEGY_LEGACY,
  shortfallMetric: 'absolute',
}

/** Piste « fiabiliser la recherche seule » — métrique historique conservée. */
export const STRATEGY_STRONG_SEARCH_ONLY: AllocationStrategy = {
  shortfallMetric: 'rate',
  restarts: 6,
  perShapeBudget: 'fair',
  targetedNeighborhood: true,
  quotaSeeding: true,
  boundPruning: true,
}

/** **Stratégie de production** (chantier 29) — métrique absolue + recherche fiabilisée. */
export const STRATEGY_ABSOLUTE_STRONG: AllocationStrategy = {
  ...STRATEGY_STRONG_SEARCH_ONLY,
  shortfallMetric: 'absolute',
}

// ── Types publics ────────────────────────────────────────────

export interface AllocationMember {
  member_id: string
  pseudo: string
  /**
   * `participation_style === 'active'`. Sans onboarding → false (conservateur,
   * §6). Chantier 91 : un passif est placé **en public**, hors des règles.
   */
  is_active: boolean
  /** `consent_transcript`. Sans onboarding → false : pas de consentement explicite = pas d'enregistrement. */
  consents: boolean
  /** A déjà fait un débat Ecclesia. Sans onboarding → false (compté nouveau). */
  is_veteran: boolean
  /** Camp d'opinion (`analysis_members.group_id`). null = n'a pas voté → neutre pour l'hétérogénéité. */
  group_id: number | null
}

export interface AllocationInput {
  /** Membres présentiels **hors modérateurs** — actifs et passifs mêlés. */
  members: AllocationMember[]
  /** Modérateurs déjà identifiés dans l'app (session_members.is_moderator). */
  moderatorIds: string[]
  /**
   * Chantier 25 (H17) — attributs des modérateurs, pour ceux qui devront être
   * assis faute de table à animer. Un modérateur assis compte toujours comme
   * **actif** (chantier 91) ; sans profil, les autres attributs prennent les
   * valeurs conservatrices habituelles.
   */
  moderatorProfiles?: AllocationMember[]
  /** Modérateurs annoncés par le superadmin mais pas encore inscrits (§3). */
  extraModerators?: number
  /** Nombre d'enregistreurs disponibles — si fourni, la règle 1 vise ce nombre de tables propres. */
  recorderCount?: number | null
  /** false → règle 2 désactivée proprement (analyse des camps indisponible, §5). */
  opinionsAvailable: boolean
  /**
   * Chantier 98 — interdit toute table sans modérateur : l'algorithme ne
   * retient que des formes où `moderatedCount === tableCount`. Rang haut,
   * au-dessus des 4 règles habituelles (Jules, 19/09 : « on laisse d'autres
   * critères être brisés, bien sûr ») — quand aucune forme entièrement animée
   * n'existe (capacité de modération insuffisante), l'algorithme se replie
   * sur le filet de sécurité existant (table unique), qui dégrade déjà toutes
   * les autres règles sans jamais lever d'exception.
   */
  forbidUnmoderatedTables?: boolean
  seed?: number
  /** Chantier 29 (I1) — réglages de la recherche. Absent → production. Sert au banc d'essai. */
  strategy?: AllocationStrategy
  /**
   * Chantier 92 — liens d'appairage **réciproques** (`member_id`, `member_id`),
   * dans l'ordre de déclaration (le plus ancien d'abord). Règle 1 : les grappes
   * qu'ils forment (3 personnes max) ne sont pas séparées.
   */
  pairs?: [string, string][]
}

export interface AllocationTable {
  table_number: number
  moderated: boolean
  /** Tout le monde assis à la table, public compris — c'est ce qu'écrit `apply_allocation`. */
  member_ids: string[]
  /** Chantier 91 — sous-ensemble de `member_ids` placé en public (passifs). */
  audience_member_ids: string[]
  /** Modérateurs animant cette table (n'occupent pas de siège). */
  moderator_member_ids: string[]
}

export interface TableDiagnostics {
  table_number: number
  /** Nombre total de personnes, public compris. */
  size: number
  moderated: boolean
  /** Actifs — ceux sur qui portent les règles. */
  actives: number
  /** Chantier 91 — passifs placés en public. */
  audience: number
  /** Chantier 91 — du public n'est admis qu'aux tables animées. */
  audience_ok: boolean
  /** Chantier 91 — `size > TABLE_TOTAL_MAX`. */
  over_capacity: boolean
  veterans: number
  veterans_threshold: number
  /** Règle 3 — assez d'anciens parmi les actifs. */
  veterans_ok: boolean
  newcomers: number
  /** Non-consentants à la table, public compris. */
  non_consenting: number
  /** Règle 1 : aucune personne non consentante (public compris) ET actifs non homogènes. */
  recordable: boolean
  /** camp d'opinion → effectif parmi les actifs. Clés = `group_id` d'origine. */
  camp_counts: Record<string, number>
  /** Actifs sans camp (n'ont pas voté) — neutres pour l'hétérogénéité. */
  neutral_count: number
  /** Part du camp majoritaire parmi les actifs ayant un camp. null si aucun. */
  majority_share: number | null
  /** Règle 2 : seuil de viabilité atteint. */
  heterogeneity_ok: boolean
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
  /** true → actifs ≤ 10, table unique, aucune règle appliquée. */
  singleTable: boolean
  /** Capacité de modération retenue (modérateurs inscrits + annoncés). */
  moderatorCapacity: number
  /**
   * Chantier 25 (H17) — modérateurs inscrits qui n'animent aucune table et ont
   * donc été placés comme participants actifs. Ils figurent dans `member_ids`
   * de leur table, jamais dans `moderator_member_ids`.
   */
  seatedModeratorIds: string[]
  /** Nombre de modérateurs qui animent réellement une table. */
  animatingModerators: number
  /** Objectif de tables enregistrables effectivement utilisé (règle 1). */
  recorderTarget: number
  /** Rappel : le résultat est reproductible à graine identique. */
  seed: number
  /** Chantier 92 — grappes retenues (≥ 2 personnes), après plafonnement à 3. */
  clusters: string[][]
  /** Chantier 92 — grappes dont les membres ont fini sur des tables différentes (règle 1). */
  brokenClusters: number
}

// ── Chantier 92 — grappes d'appairage ────────────────────────

/** Taille maximale d'une grappe (décision de Jules, 16/09). */
export const CLUSTER_MAX = 3

/**
 * Construit les grappes à partir des liens réciproques, **dans l'ordre fourni**
 * (ordre de déclaration). Un lien qui ferait dépasser `CLUSTER_MAX` est
 * ignoré : les liens les plus anciens l'emportent, sans aucun hasard — le
 * résultat reste déterministe. Les identifiants inconnus sont ignorés.
 */
export function buildClusters(
  pairs: [string, string][] | undefined,
  knownIds: Iterable<string>,
): { clusters: string[][]; droppedLinks: number } {
  const known = new Set(knownIds)
  const parent = new Map<string, string>()
  const size = new Map<string, number>()
  const find = (x: string): string => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)!
    parent.set(x, r)
    return r
  }
  const ensure = (x: string) => { if (!parent.has(x)) { parent.set(x, x); size.set(x, 1) } }

  let droppedLinks = 0
  for (const [a, b] of pairs ?? []) {
    if (a === b || !known.has(a) || !known.has(b)) continue
    ensure(a); ensure(b)
    const ra = find(a)
    const rb = find(b)
    if (ra === rb) continue
    const merged = size.get(ra)! + size.get(rb)!
    if (merged > CLUSTER_MAX) { droppedLinks++; continue }
    const [root, child] = ra < rb ? [ra, rb] : [rb, ra]
    parent.set(child, root)
    size.set(root, merged)
  }

  const groups = new Map<string, string[]>()
  for (const x of parent.keys()) {
    const r = find(x)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r)!.push(x)
  }
  const clusters = [...groups.values()]
    .filter(g => g.length >= 2)
    .map(g => g.sort())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
  return { clusters, droppedLinks }
}

/** Nombre de grappes réparties sur plusieurs tables (membres absents ignorés). */
export function countBrokenClusters(
  tables: { member_ids: string[] }[],
  clusters: string[][],
): number {
  const tableOf = new Map<string, number>()
  tables.forEach((t, idx) => t.member_ids.forEach(id => tableOf.set(id, idx)))
  let broken = 0
  for (const c of clusters) {
    const seen = new Set(c.map(id => tableOf.get(id)).filter((t): t is number => t !== undefined))
    if (seen.size > 1) broken++
  }
  return broken
}

// ── Seuils ───────────────────────────────────────────────────

/**
 * Règle 3 — `⌈2/5·actifs⌉`.
 * La spec écrit « anciens ≥ 2/5 × taille » sans préciser l'arrondi ; on
 * retient l'arrondi supérieur (6 actifs → 3 anciens).
 */
export function veteranThreshold(size: number): number {
  return Math.ceil((2 / 5) * size)
}

/**
 * Seuil d'anciens réellement appliqué : la formule, sauf pour une table
 * **sans modérateur** où `UNMODERATED_VETERAN_FLOOR` la remplace quand elle
 * est plus basse.
 */
function resolvedVeteranThreshold(size: number, moderated: boolean): number {
  const base = veteranThreshold(size)
  return moderated ? base : Math.max(UNMODERATED_VETERAN_FLOOR, base)
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

// ── Représentation interne (actifs seulement) ────────────────

interface Prepared {
  n: number
  ids: string[]
  consent: Uint8Array
  veteran: Uint8Array
  /** camp remappé sur 0..campCount-1 ; -1 = neutre (pas de vote). */
  camp: Int32Array
  campCount: number
  /** Totaux population — bornes exactes par forme (chantier 29). */
  totalVeteran: number
  totalNonConsent: number
  /** Chantier 92 — indice de grappe (dans `blocks`), -1 = personne seule. */
  blockOf: Int32Array
  /** Chantier 92 — grappes d'au moins 2 personnes présentes dans cette population. */
  blocks: number[][]
}

function prepare(members: AllocationMember[], clusterOfId?: Map<string, number>): Prepared {
  const n = members.length
  const labels = [...new Set(members.map(m => m.group_id).filter((g): g is number => g !== null))]
    .sort((a, b) => a - b)
  const labelIdx = new Map(labels.map((g, i) => [g, i]))

  const prep: Prepared = {
    n,
    ids: members.map(m => m.member_id),
    consent: new Uint8Array(n),
    veteran: new Uint8Array(n),
    camp: new Int32Array(n),
    campCount: labels.length,
    totalVeteran: 0,
    totalNonConsent: 0,
    blockOf: new Int32Array(n).fill(-1),
    blocks: [],
  }
  members.forEach((m, i) => {
    prep.consent[i] = m.consents ? 1 : 0
    prep.veteran[i] = m.is_veteran ? 1 : 0
    prep.camp[i] = m.group_id === null ? -1 : labelIdx.get(m.group_id)!
    if (prep.veteran[i]) prep.totalVeteran++
    if (!prep.consent[i]) prep.totalNonConsent++
  })
  if (clusterOfId) {
    const byCluster = new Map<number, number[]>()
    members.forEach((m, i) => {
      const c = clusterOfId.get(m.member_id)
      if (c === undefined) return
      if (!byCluster.has(c)) byCluster.set(c, [])
      byCluster.get(c)!.push(i)
    })
    for (const c of [...byCluster.keys()].sort((a, b) => a - b)) {
      const idx = byCluster.get(c)!
      if (idx.length < 2) continue
      const b = prep.blocks.length
      prep.blocks.push(idx)
      for (const i of idx) prep.blockOf[i] = b
    }
  }
  return prep
}

/**
 * Chantier 92 — règle 1. Regroupe chaque grappe sur une seule table, par
 * échanges avec des personnes seules (les tailles de table sont préservées).
 * Table visée : celle qui contient déjà le plus de membres de la grappe, puis
 * la première. Si aucune table n'a assez de personnes seules à échanger, la
 * grappe reste séparée : la règle se dégrade, elle ne lève pas.
 */
function gatherClusters(assign: Int32Array, T: number, prep: Prepared): void {
  if (prep.blocks.length === 0 || T < 2) return
  for (const block of prep.blocks) {
    const here = new Array<number>(T).fill(0)
    for (const i of block) here[assign[i]]++
    const targets = [...Array(T).keys()].sort((a, b) => here[b] - here[a] || a - b)
    for (const t of targets) {
      const movers = block.filter(i => assign[i] !== t)
      if (movers.length === 0) break
      const singles: number[] = []
      for (let j = 0; j < prep.n && singles.length < movers.length; j++) {
        if (assign[j] === t && prep.blockOf[j] === -1) singles.push(j)
      }
      if (singles.length < movers.length) continue
      movers.forEach((i, k) => {
        const j = singles[k]
        assign[j] = assign[i]
        assign[i] = t
      })
      break
    }
  }
}

function blockIsWhole(assign: Int32Array, block: number[]): boolean {
  return block.every(i => assign[i] === assign[block[0]])
}

/** Combinaisons de `k` éléments de `items`, au plus `cap`, dans l'ordre lexicographique. */
function combinations(items: number[], k: number, cap: number): number[][] {
  const out: number[][] = []
  const pick: number[] = []
  const rec = (start: number) => {
    if (out.length >= cap) return
    if (pick.length === k) { out.push([...pick]); return }
    for (let x = start; x < items.length; x++) {
      pick.push(items[x]); rec(x + 1); pick.pop()
      if (out.length >= cap) return
    }
  }
  rec(0)
  return out
}

/** Chantier 92 — nombre maximal d'ensembles de personnes seules essayés par (grappe, table). */
const BLOCK_SWAP_CAP = 60

/** Forme candidate : nombre d'actifs fixé par table, les `moderatedCount` premières sont animées. */
interface Shape {
  sizes: number[]
  moderatedCount: number
}

/**
 * Politique de dimensionnement (§4, en actifs depuis le chantier 91) :
 *  - les tables **modérées** prennent en priorité autant de monde que leur
 *    plafond `maxSize` le permet — le moins possible reste sans modérateur —,
 *    réparti **également** entre elles (chantier 91 : le remplissage dans
 *    l'ordre donnait 14/12/5 une fois le plafond porté à 14) ;
 *  - les tables **sans modérateur** restent dans `[UNMODERATED_TABLE_MIN,
 *    UNMODERATED_TABLE_MAX]` — le reliquat s'y répartit uniformément.
 * Retourne null si aucune répartition valide n'existe pour ce nombre de tables
 * (dégradation gérée par l'appelant : l'algorithme ne lève jamais).
 */
function buildShape(n: number, tableCount: number, moderatorCapacity: number, maxSize: number): Shape | null {
  if (tableCount < 1) return null

  const moderatedCount = Math.min(tableCount, moderatorCapacity)
  const unmoderatedCount = tableCount - moderatedCount
  const minSum = moderatedCount * TABLE_MIN + unmoderatedCount * UNMODERATED_TABLE_MIN
  const maxSum = moderatedCount * maxSize + unmoderatedCount * UNMODERATED_TABLE_MAX
  if (n < minSum || n > maxSum) return null

  const spread = (total: number, count: number) =>
    Array.from({ length: count }, (_, i) => Math.floor(total / count) + (i < total % count ? 1 : 0))

  // 1. Tables modérées : le plus de monde possible, également réparti.
  const moderatedTotal = Math.min(n - unmoderatedCount * UNMODERATED_TABLE_MIN, moderatedCount * maxSize)
  // 2. Reliquat : réparti uniformément sur les tables non modérées.
  const unmoderatedTotal = n - moderatedTotal
  if (unmoderatedTotal > unmoderatedCount * UNMODERATED_TABLE_MAX) return null
  if (unmoderatedCount === 0 && unmoderatedTotal > 0) return null

  const sizes = [
    ...(moderatedCount > 0 ? spread(moderatedTotal, moderatedCount) : []),
    ...(unmoderatedCount > 0 ? spread(unmoderatedTotal, unmoderatedCount) : []),
  ]
  return { sizes, moderatedCount }
}

/**
 * Plus grand nombre de tables pour lequel une forme peut exister. Borne
 * **exacte** — une borne trop généreuse ferait rechercher des formes non
 * gagnantes pour rien (budget de latence navigateur, §6).
 */
function maxTableCount(n: number, moderatorCapacity: number, forbidUnmoderated: boolean): number {
  const capacity = Math.max(0, moderatorCapacity)
  // Chantier 98 — aucune table sans modérateur : une table de plus exige un
  // modérateur de plus, la capacité de modération borne donc directement le
  // nombre de tables.
  if (forbidUnmoderated) return Math.min(capacity, Math.floor(n / TABLE_MIN))
  if (capacity * TABLE_MIN > n) return Math.floor(n / TABLE_MIN)
  const remaining = n - capacity * TABLE_MIN
  return capacity + Math.floor(remaining / UNMODERATED_TABLE_MIN)
}

function enumerateShapes(
  n: number,
  moderatorCapacity: number,
  maxSize: number,
  forbidUnmoderated = false,
): Shape[] {
  const shapes: Shape[] = []
  const minTables = Math.max(1, Math.ceil(n / maxSize))
  const maxTables = maxTableCount(n, moderatorCapacity, forbidUnmoderated)
  for (let t = minTables; t <= maxTables; t++) {
    const s = buildShape(n, t, moderatorCapacity, maxSize)
    if (!s) continue
    // Filet de sécurité : `buildShape` ne peut normalement pas laisser de
    // table non animée sous ce plafond, mais on ne retient jamais une forme
    // qui violerait la contrainte si l'arithmétique changeait un jour.
    if (forbidUnmoderated && s.moderatedCount < t) continue
    shapes.push(s)
  }
  return shapes
}

/**
 * Préférence de forme — appliquée **seulement** à égalité parfaite sur les
 * règles (§4). À comparer en décroissant, composante par composante.
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

// ── Chantier 29 — optimum théorique d'une forme ──────────────

/** Somme des seuils + plus petit nombre de tables en échec, pour une offre `supply`. */
function exactShortfall(thresholds: number[], supply: number): { total: number; fails: number } {
  let sum = 0
  for (const t of thresholds) sum += t
  const asc = [...thresholds].sort((a, b) => a - b)
  let acc = 0
  let satisfied = 0
  for (const t of asc) {
    if (acc + t > supply) break
    acc += t
    satisfied++
  }
  return { total: Math.max(0, sum - supply), fails: thresholds.length - satisfied }
}

/**
 * Borne supérieure (optimiste, composante par composante) du score atteignable
 * par une forme. Les composantes qu'on ne sait pas borner finement prennent
 * leur maximum trivial — la borne reste valide, seulement moins tranchante.
 */
function shapeBound(
  shape: Shape,
  prep: Prepared,
  opinionsAvailable: boolean,
  recorderTarget: number,
  metric: AllocationStrategy['shortfallMetric'],
): number[] {
  const T = shape.sizes.length
  const T_ = T || 1
  const thr3 = shape.sizes.map((s, t) => resolvedVeteranThreshold(s, t < shape.moderatedCount))
  const e3 = exactShortfall(thr3, prep.totalVeteran)

  // Règle 1 — au mieux, tous les non-consentants sont entassés dans les plus
  // grandes tables ; les autres tables sont alors « propres ».
  const desc = [...shape.sizes].sort((a, b) => b - a)
  let absorbed = 0
  let dirty = 0
  while (absorbed < prep.totalNonConsent && dirty < T) { absorbed += desc[dirty]; dirty++ }
  const r1Bound = Math.min(T - dirty, recorderTarget)

  // Règle 4 — au mieux, toutes les places modérées sont occupées par des nouveaux.
  let moderatedSeats = 0
  for (let t = 0; t < shape.moderatedCount; t++) moderatedSeats += shape.sizes[t]
  const r4Bound = Math.min(prep.n - prep.totalVeteran, moderatedSeats)

  const hetBound = opinionsAvailable ? 1 : 0

  return metric === 'absolute'
    ? [r1Bound, 0, hetBound, -e3.total, -e3.fails, 0, r4Bound]
    : [r1Bound, 0, hetBound, -e3.fails / T_, 0, r4Bound]
}

/** La forme peut-elle être écartée sans être explorée ? (dominance lexicographique stricte) */
function boundIsDominated(bound: number[], best: number[]): boolean {
  for (let i = 0; i < bound.length && i < best.length; i++) {
    if (bound[i] !== best[i]) return bound[i] < best[i]
  }
  return false
}

// ── Chantier 29 — amorce par quotas ──────────────────────────

/** Répartit `supply` unités sur les tables : seuils croissants d'abord, reliquat ensuite. */
function quotas(thresholds: number[], sizes: number[], supply: number): number[] {
  const T = thresholds.length
  const q = new Array<number>(T).fill(0)
  const order = [...Array(T).keys()].sort((a, b) => thresholds[a] - thresholds[b] || a - b)
  let left = supply
  for (const t of order) {
    const give = Math.min(thresholds[t], left)
    q[t] = give
    left -= give
  }
  for (const t of order) {
    if (left <= 0) break
    const room = sizes[t] - q[t]
    const give = Math.min(room, left)
    q[t] += give
    left -= give
  }
  return q
}

/**
 * Amorce constructive : réalise exactement les quotas d'anciens (règle 3), en
 * équilibrant les camps au passage. La descente locale n'a plus qu'à polir les
 * règles 1 et 2.
 */
function quotaAssignment(shape: Shape, prep: Prepared): Int32Array {
  const T = shape.sizes.length
  const sizes = shape.sizes
  const qV = quotas(sizes.map((s, t) => resolvedVeteranThreshold(s, t < shape.moderatedCount)), sizes, prep.totalVeteran)

  const assign = new Int32Array(prep.n).fill(-1)
  const room = [...sizes]
  const needV = [...qV]
  const campSeen: number[][] = Array.from({ length: T }, () => new Array(Math.max(1, prep.campCount)).fill(0))
  const nonConsentSeen = new Array<number>(T).fill(0)

  const place = (i: number, t: number) => {
    assign[i] = t
    room[t]--
    if (prep.veteran[i]) needV[t]--
    const c = prep.camp[i]
    if (c >= 0) campSeen[t][c]++
    if (!prep.consent[i]) nonConsentSeen[t]++
  }

  /**
   * Choisit, dans `pool`, la personne la plus utile à la table `t` : camp le
   * moins représenté d'abord (règle 2), puis regroupement des non-consentants
   * (règle 1 : concentrer la « saleté » libère des tables propres).
   */
  const pick = (pool: number[], t: number): number => {
    let bestIdx = -1
    let bestKey = Infinity
    for (let k = 0; k < pool.length; k++) {
      const i = pool[k]
      const c = prep.camp[i]
      const campLoad = c >= 0 ? campSeen[t][c] : 0
      const dirtyPref = prep.consent[i] ? 0 : (nonConsentSeen[t] > 0 ? 0 : 1)
      const key = campLoad * 4 + dirtyPref
      if (key < bestKey) { bestKey = key; bestIdx = k }
    }
    const i = pool[bestIdx]
    pool.splice(bestIdx, 1)
    return i
  }

  const veterans: number[] = []
  const newcomers: number[] = []
  for (let i = 0; i < prep.n; i++) (prep.veteran[i] ? veterans : newcomers).push(i)

  const byNeed = [...Array(T).keys()].sort((a, b) => needV[b] - needV[a] || a - b)
  // 1. Anciens — les tables les plus exigeantes d'abord.
  for (const t of byNeed) {
    while (needV[t] > 0 && room[t] > 0 && veterans.length) place(pick(veterans, t), t)
  }
  // 2. Reliquat — toutes les places restantes, dans l'ordre des tables.
  const rest = [...newcomers, ...veterans]
  for (let t = 0; t < T; t++) {
    while (room[t] > 0 && rest.length) place(pick(rest, t), t)
  }
  // Filet de sécurité : personne ne doit rester sans table.
  for (let i = 0; i < prep.n; i++) {
    if (assign[i] === -1) {
      const t = room.findIndex(r => r > 0)
      place(i, t >= 0 ? t : 0)
    }
  }
  return assign
}

// ── Compteurs par table (mis à jour de façon incrémentale) ───

interface Counters {
  veterans: Int32Array
  nonConsent: Int32Array
  /** matrice plate T × campCount */
  campMat: Int32Array
  campTotal: Int32Array
}

function makeCounters(T: number, campCount: number): Counters {
  return {
    veterans: new Int32Array(T),
    nonConsent: new Int32Array(T),
    campMat: new Int32Array(T * Math.max(1, campCount)),
    campTotal: new Int32Array(T),
  }
}

function addMember(ctr: Counters, prep: Prepared, i: number, t: number): void {
  ctr.veterans[t] += prep.veteran[i]
  ctr.nonConsent[t] += prep.consent[i] ? 0 : 1
  const c = prep.camp[i]
  if (c >= 0) {
    ctr.campMat[t * prep.campCount + c] += 1
    ctr.campTotal[t] += 1
  }
}

function removeMember(ctr: Counters, prep: Prepared, i: number, t: number): void {
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
   * Métrique de plateau (à minimiser) : somme hiérarchisée des manques. Sert
   * **uniquement** de départage quand `score` est identique — elle donne un
   * gradient là où le maximin est plat. Elle ne peut jamais faire préférer un
   * `score` inférieur.
   */
  plateau: number
}

function evaluate(
  shape: Shape,
  ctr: Counters,
  prep: Prepared,
  opinionsAvailable: boolean,
  recorderTarget: number,
  metric: AllocationStrategy['shortfallMetric'] = 'rate',
): Evaluation {
  const T = shape.sizes.length
  const C = prep.campCount

  let cleanCount = 0

  let fail2 = 0
  let minHet = Infinity
  let hetSeen = false
  let sumShort2 = 0

  let fail3 = 0
  let minMargin3 = Infinity
  let sumShort3 = 0

  let newcomersModerated = 0

  const nonConsentList: number[] = []

  for (let t = 0; t < T; t++) {
    const size = shape.sizes[t]

    // Règle 3 — anciens
    const thr3 = resolvedVeteranThreshold(size, t < shape.moderatedCount)
    const margin3 = ctr.veterans[t] - thr3
    if (margin3 < 0) { fail3++; sumShort3 += -margin3 }
    if (margin3 < minMargin3) minMargin3 = margin3

    // Règle 4 — nouveaux placés à une table modérée
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

    // Règle 2 — désactivée si l'analyse des camps est indisponible
    if (opinionsAvailable) {
      const viable = total > 0 && first <= MAJORITY_SHARE_CAP * total && second >= MIN_SECOND_CAMP
      if (!viable) {
        fail2++
        sumShort2 += Math.max(0, MIN_SECOND_CAMP - second)
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

    // Règle 1 — table enregistrable : zéro non-consentant ET non homogène.
    const nonHomogeneous = opinionsAvailable ? (total > 0 && first < total) : true
    if (ctr.nonConsent[t] === 0 && nonHomogeneous) cleanCount++
    nonConsentList.push(ctr.nonConsent[t])
  }

  if (!Number.isFinite(minMargin3)) minMargin3 = 0
  // Chantier 91 — maximin plafonné au seuil de viabilité (1 − 70 %), comme la
  // marge de la règle 3 est plafonnée à 0. Non plafonné, il départageait deux
  // répartitions toutes deux viables et l'emportait sur la règle des anciens :
  // découper en tables de 5 (2/2/1, degré 0,6) battait des tables de 14 à peine
  // moins mélangées. Mesuré : 120 part. / 6 modé. → 11 tables dont 5 sans
  // modérateur, les deux grosses tables avec 0 et 1 ancien sur 6 requis.
  const het = opinionsAvailable && hetSeen ? Math.min(minHet, 1 - MAJORITY_SHARE_CAP) : 0
  const r1main = Math.min(cleanCount, recorderTarget)

  // Chantier 29 — la métrique absolue (manque total d'anciens) est invariante
  // au découpage, contrairement au taux d'échec qui pousse à fragmenter. Les
  // termes secondaires sont des **comptes absolus** (`-fail`), surtout pas des
  // taux : réintroduire `-fail/T` ramènerait le biais de fragmentation. Le
  // maximin de la règle 3 porte sur la marge plafonnée à 0, pour qu'un surplus
  // d'anciens ne départage pas deux solutions conformes.
  const T_ = T || 1
  const score = metric === 'absolute'
    ? [
        r1main,                                        // règle 1 (enregistrable)
        -fail2 / T_, het,                              // règle 2 (hétérogénéité)
        -sumShort3, -fail3, Math.min(minMargin3, 0),   // règle 3 (anciens)
        newcomersModerated,                            // règle 4 (nouveaux encadrés)
      ]
    : [
        r1main,
        -fail2 / T_, het,
        -fail3 / T_, Math.min(minMargin3, 0),
        newcomersModerated,
      ]

  // Plateau : poids hiérarchiques pour ne jamais inverser l'ordre des règles.
  nonConsentList.sort((a, b) => a - b)
  let r1Short = 0
  for (let k = 0; k < Math.min(recorderTarget, nonConsentList.length); k++) r1Short += nonConsentList[k]

  const plateau = 1e4 * r1Short + 1e2 * sumShort2 + sumShort3

  return { score, plateau }
}

/** Compare deux évaluations. > 0 si `a` est meilleure. */
function compareEval(a: Evaluation, b: Evaluation): number {
  for (let i = 0; i < a.score.length; i++) {
    if (a.score[i] !== b.score[i]) return a.score[i] - b.score[i]
  }
  return b.plateau - a.plateau
}

function compareArraysDesc(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

// ── Solution initiale ────────────────────────────────────────

/** Distribution « serpentin » sur une liste triée. */
function initialAssignment(shape: Shape, prep: Prepared, order: number[]): Int32Array {
  const T = shape.sizes.length
  const assign = new Int32Array(prep.n)
  const remaining = [...shape.sizes]

  let t = 0
  let dir = 1
  for (const i of order) {
    let guard = 0
    while (remaining[t] === 0 && guard <= 2 * T) {
      t += dir
      if (t >= T) { t = T - 1; dir = -1 }
      else if (t < 0) { t = 0; dir = 1 }
      guard++
    }
    if (remaining[t] === 0) {
      t = Math.max(0, remaining.findIndex(r => r > 0))
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
  strategy: AllocationStrategy = STRATEGY_LEGACY,
  seedAssign?: Int32Array,
): { assign: Int32Array; evaluation: Evaluation } {
  const T = shape.sizes.length
  const metric = strategy.shortfallMetric
  const assign = seedAssign ?? initialAssignment(shape, prep, order)
  gatherClusters(assign, T, prep)
  const ctr = buildCounters(assign, prep, T)
  let current = evaluate(shape, ctr, prep, opinionsAvailable, recorderTarget, metric)

  if (T < 2) return { assign, evaluation: current }

  /** Tente l'échange i↔j ; le conserve s'il améliore. */
  const trySwap = (i: number, j: number): boolean => {
    const ti = assign[i]
    const tj = assign[j]
    if (ti === tj) return false
    // Chantier 92 — un membre de grappe ne bouge qu'avec sa grappe.
    if (prep.blockOf[i] !== -1 || prep.blockOf[j] !== -1) return false
    if (prep.consent[i] === prep.consent[j] &&
        prep.veteran[i] === prep.veteran[j] &&
        prep.camp[i] === prep.camp[j]) return false
    if (budget.left <= 0) return false
    budget.left--

    removeMember(ctr, prep, i, ti); removeMember(ctr, prep, j, tj)
    addMember(ctr, prep, i, tj);    addMember(ctr, prep, j, ti)

    const candidate = evaluate(shape, ctr, prep, opinionsAvailable, recorderTarget, metric)
    if (compareEval(candidate, current) > 0) {
      assign[i] = tj
      assign[j] = ti
      current = candidate
      return true
    }
    removeMember(ctr, prep, i, tj); removeMember(ctr, prep, j, ti)
    addMember(ctr, prep, i, ti);    addMember(ctr, prep, j, tj)
    return false
  }

  /**
   * Chantier 29 — voisinage dirigé. Répare les déficits d'anciens par des
   * échanges **à camp constant** d'abord (neutres pour l'hétérogénéité, plus
   * prioritaire), entre une table en excédent et une table en déficit.
   */
  const repairVeterans = (campPreserving: boolean): boolean => {
    let improved = false
    const byTable: number[][] = Array.from({ length: T }, () => [])
    for (let i = 0; i < prep.n; i++) byTable[assign[i]].push(i)

    const surplus: number[] = []
    const deficit: number[] = []
    for (let t = 0; t < T; t++) {
      let have = 0
      for (const i of byTable[t]) have += prep.veteran[i]
      const margin = have - resolvedVeteranThreshold(shape.sizes[t], t < shape.moderatedCount)
      if (margin > 0) surplus.push(t)
      else if (margin < 0) deficit.push(t)
    }

    for (const t of deficit) {
      for (const u of surplus) {
        if (budget.left <= 0) return improved
        for (const i of byTable[u]) {
          if (!prep.veteran[i]) continue
          for (const j of byTable[t]) {
            if (prep.veteran[j]) continue
            if (campPreserving && prep.camp[i] !== prep.camp[j]) continue
            if (trySwap(i, j)) { improved = true }
            if (budget.left <= 0) return improved
          }
        }
      }
    }
    return improved
  }

  /** Chantier 92 — échange d'ensembles de même taille entre deux tables (grappe ↔ personnes seules ou grappe). */
  const tryGroupSwap = (A: number[], B: number[]): boolean => {
    const ta = assign[A[0]]
    const tb = assign[B[0]]
    if (ta === tb || budget.left <= 0) return false
    budget.left--
    for (const i of A) { removeMember(ctr, prep, i, ta); addMember(ctr, prep, i, tb) }
    for (const j of B) { removeMember(ctr, prep, j, tb); addMember(ctr, prep, j, ta) }
    const candidate = evaluate(shape, ctr, prep, opinionsAvailable, recorderTarget, metric)
    if (compareEval(candidate, current) > 0) {
      for (const i of A) assign[i] = tb
      for (const j of B) assign[j] = ta
      current = candidate
      return true
    }
    for (const i of A) { removeMember(ctr, prep, i, tb); addMember(ctr, prep, i, ta) }
    for (const j of B) { removeMember(ctr, prep, j, ta); addMember(ctr, prep, j, tb) }
    return false
  }

  const moveBlocks = (): boolean => {
    let improved = false
    for (const block of prep.blocks) {
      if (!blockIsWhole(assign, block)) continue
      for (let tb = 0; tb < T && budget.left > 0; tb++) {
        if (tb === assign[block[0]]) continue
        const singles: number[] = []
        for (let j = 0; j < prep.n; j++) if (assign[j] === tb && prep.blockOf[j] === -1) singles.push(j)
        let moved = false
        for (const B of combinations(singles, block.length, BLOCK_SWAP_CAP)) {
          if (tryGroupSwap(block, B)) { moved = true; break }
          if (budget.left <= 0) break
        }
        if (!moved) {
          for (const other of prep.blocks) {
            if (other === block || other.length !== block.length || assign[other[0]] !== tb) continue
            if (!blockIsWhole(assign, other)) continue
            if (tryGroupSwap(block, other)) { moved = true; break }
          }
        }
        if (moved) { improved = true; break }
      }
    }
    return improved
  }

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let improved = false

    if (strategy.targetedNeighborhood) {
      for (const preserve of [true, false]) {
        if (repairVeterans(preserve)) improved = true
      }
    }

    for (let i = 0; i < prep.n && budget.left > 0; i++) {
      for (let j = i + 1; j < prep.n; j++) {
        if (budget.left <= 0) break
        if (trySwap(i, j)) improved = true
      }
    }

    if (prep.blocks.length > 0 && moveBlocks()) improved = true

    if (!improved) break
  }

  return { assign, evaluation: current }
}

// ── Recherche sur les actifs ─────────────────────────────────

interface SolveOutcome {
  prep: Prepared
  shape: Shape
  assign: Int32Array
  score: number[]
  singleTable: boolean
  note: string | null
}

/**
 * Recherche la meilleure forme + affectation pour une population d'**actifs**
 * figée. Isolée de `runAllocation` pour pouvoir être rejouée par la boucle de
 * résolution du surplus de modérateurs (chantier 25 / H17).
 */
function solveFor(
  actives: AllocationMember[],
  moderatorCapacity: number,
  opinionsAvailable: boolean,
  recorderTarget: number,
  seed: number,
  strategy: AllocationStrategy = STRATEGY_LEGACY,
  clusterOfId?: Map<string, number>,
  forbidUnmoderated = false,
): SolveOutcome {
  const prep = prepare(actives, clusterOfId)
  const n = prep.n
  const metric = strategy.shortfallMetric
  const single = (note: string | null): SolveOutcome => {
    const shape: Shape = { sizes: [n], moderatedCount: moderatorCapacity > 0 ? 1 : 0 }
    const assign = new Int32Array(n)
    return {
      prep, shape, assign,
      score: evaluate(shape, buildCounters(assign, prep, 1), prep, opinionsAvailable, recorderTarget, metric).score,
      singleTable: true, note,
    }
  }

  // ── Actifs ≤ 10 : table unique, aucune règle appliquée (§4) ──
  if (n <= SINGLE_TABLE_MAX) return single(null)

  const budget: Budget = {
    left: typeof strategy.perShapeBudget === 'number'
      ? Math.max(MAX_EVALUATIONS, strategy.perShapeBudget * 30)
      : MAX_EVALUATIONS,
  }
  const baseOrder = sortedOrder(prep)

  let best: { shape: Shape; assign: Int32Array; evaluation: Evaluation } | null = null
  const shapes = enumerateShapes(n, moderatorCapacity, TABLE_MAX_ACTIVE, forbidUnmoderated)
  let shapesLeft = shapes.length
  for (const shape of shapes) {
    const remainingShapes = shapesLeft--
    if (strategy.boundPruning && best) {
      const bound = shapeBound(shape, prep, opinionsAvailable, recorderTarget, metric)
      if (boundIsDominated(bound, best.evaluation.score)) continue
    }
    const shapeBudget: Budget =
      strategy.perShapeBudget === null
        ? budget
        : strategy.perShapeBudget === 'fair'
          ? { left: Math.max(1, Math.floor(budget.left / remainingShapes)) }
          : { left: Math.min(strategy.perShapeBudget, budget.left) }
    const shapeStart = shapeBudget.left

    for (let r = 0; r < strategy.restarts; r++) {
      if (shapeBudget.left <= 0) break
      // Restart 0 = ordre trié déterministe ; 1 = amorce par quotas ;
      // suivants = mélanges à graine fixe (reproductibilité, §6).
      let seedAssign: Int32Array | undefined
      let order = baseOrder
      if (r === 1 && strategy.quotaSeeding) {
        seedAssign = quotaAssignment(shape, prep)
        gatherClusters(seedAssign, shape.sizes.length, prep)
      } else if (r > 0) {
        order = shuffled(baseOrder, mulberry32(seed + r * 7919 + shape.sizes.length))
      }
      const res = localSearch(shape, prep, opinionsAvailable, recorderTarget, order, shapeBudget, strategy, seedAssign)
      if (!best) { best = { shape, assign: res.assign, evaluation: res.evaluation }; continue }
      const cmp = compareEval(res.evaluation, best.evaluation)
      if (cmp > 0) { best = { shape, assign: res.assign, evaluation: res.evaluation }; continue }
      if (cmp === 0 && compareArraysDesc(shapePreference(shape), shapePreference(best.shape)) > 0) {
        best = { shape, assign: res.assign, evaluation: res.evaluation }
      }
    }
    if (strategy.perShapeBudget !== null) budget.left -= shapeStart - shapeBudget.left
  }

  // Un reliquat non découpable (ex. 11 actifs sans modérateur : ni une table
  // de 5 à 7, ni deux) ne trouve aucune forme : repli sur une table unique.
  if (!best) {
    return single(
      forbidUnmoderated
        ? "Capacité de modération insuffisante pour animer toutes les tables (option « interdire les tables " +
          'sans modérateur » active) — repli sur une table unique.'
        : 'Aucune répartition valide trouvée — repli sur une table unique.',
    )
  }

  return { prep, shape: best.shape, assign: best.assign, score: best.evaluation.score, singleTable: false, note: null }
}

// ── Chantier 91 — placement du public ────────────────────────

/**
 * Place les passifs en public, de façon déterministe (indépendante de l'ordre
 * d'entrée) :
 *  1. tables animées, **uniformément** (on sert toujours la table qui a le
 *     moins de public), dans la limite de `TABLE_TOTAL_MAX` personnes ;
 *  2. si elles sont pleines, tables sans modérateur, même principe ;
 *  3. en dernier recours, au-delà de la limite — jamais d'exception.
 *
 * Règle 1 : les tables `protectedTables` (les tables enregistrables visées) ne
 * reçoivent un non-consentant qu'en l'absence de toute autre place, et à
 * public égal un non-consentant rejoint une table déjà non enregistrable. Les
 * non-consentants sont placés en premier, les consentants rééquilibrent
 * ensuite : la répartition reste uniforme à une personne près tant que les
 * non-consentants ne sont pas trop nombreux.
 */
function placeAudience(
  activeCounts: number[],
  moderated: boolean[],
  nonConsentActive: number[],
  protectedTables: boolean[],
  audience: AllocationMember[],
  clusterOfId: Map<string, number> = new Map(),
  clusterTable: Map<number, number> = new Map(),
): { byTable: string[][]; unmoderatedUsed: boolean; overCapacity: boolean } {
  const T = activeCounts.length
  const byTable: string[][] = Array.from({ length: T }, () => [])
  const nonConsent = [...nonConsentActive]
  let unmoderatedUsed = false
  let overCapacity = false
  // Chantier 92 — règle 1 : un passif appairé suit sa grappe (table de ses
  // actifs, ou du premier passif de sa grappe déjà placé), avant toute autre
  // considération de répartition.
  const anchors = new Map(clusterTable)

  const ordered = [...audience].sort((a, b) =>
    Number(a.consents) - Number(b.consents) ||
    (a.member_id < b.member_id ? -1 : a.member_id > b.member_id ? 1 : 0))

  for (const m of ordered) {
    const cluster = clusterOfId.get(m.member_id)
    const anchor = cluster === undefined ? undefined : anchors.get(cluster)
    if (anchor !== undefined && T > 0) {
      byTable[anchor].push(m.member_id)
      if (!m.consents) nonConsent[anchor]++
      continue
    }
    const hasRoom = (t: number) => activeCounts[t] + byTable[t].length < TABLE_TOTAL_MAX
    let candidates = [...Array(T).keys()].filter(t => moderated[t] && hasRoom(t))
    if (candidates.length === 0) {
      candidates = [...Array(T).keys()].filter(t => !moderated[t] && hasRoom(t))
      if (candidates.length > 0) unmoderatedUsed = true
    }
    if (candidates.length === 0) {
      const anyModerated = moderated.some(Boolean)
      candidates = [...Array(T).keys()].filter(t => !anyModerated || moderated[t])
      overCapacity = true
    }
    if (!m.consents) {
      const unprotected = candidates.filter(t => !protectedTables[t])
      if (unprotected.length > 0) candidates = unprotected
    }
    let best = candidates[0]
    for (const t of candidates) {
      const d = byTable[t].length - byTable[best].length
      if (d < 0) { best = t; continue }
      if (d === 0 && !m.consents && nonConsent[t] > 0 && nonConsent[best] === 0) best = t
    }
    byTable[best].push(m.member_id)
    if (!m.consents) nonConsent[best]++
    if (cluster !== undefined) anchors.set(cluster, best)
  }
  return { byTable, unmoderatedUsed, overCapacity }
}

// ── Diagnostics ──────────────────────────────────────────────

/**
 * Diagnostics d'une répartition quelconque. Les règles portent sur les
 * **actifs** de chaque table (`is_active`) ; le public compte seulement pour
 * le consentement (règle 1), la limite physique et la règle « pas de public
 * sans modérateur ». Un `member_id` inconnu est ignoré.
 */
function diagnoseTables(
  tables: { table_number: number; moderated: boolean; member_ids: string[] }[],
  byId: Map<string, AllocationMember>,
  opinionsAvailable: boolean,
): TableDiagnostics[] {
  return tables.map(t => {
    const people = t.member_ids.map(id => byId.get(id)).filter((m): m is AllocationMember => !!m)
    const actives = people.filter(m => m.is_active)
    const audience = people.length - actives.length

    const campCounts: Record<string, number> = {}
    let campTotal = 0
    for (const m of actives) {
      if (m.group_id === null) continue
      campCounts[String(m.group_id)] = (campCounts[String(m.group_id)] ?? 0) + 1
      campTotal++
    }
    const counts = Object.values(campCounts).sort((a, b) => b - a)
    const first = counts[0] ?? 0
    const second = counts[1] ?? 0

    const veterans = actives.filter(m => m.is_veteran).length
    const thr = resolvedVeteranThreshold(actives.length, t.moderated)
    const nonConsenting = people.filter(m => !m.consents).length
    const nonHomogeneous = opinionsAvailable ? (campTotal > 0 && first < campTotal) : true

    return {
      table_number: t.table_number,
      size: people.length,
      moderated: t.moderated,
      actives: actives.length,
      audience,
      audience_ok: t.moderated || audience === 0,
      over_capacity: people.length > TABLE_TOTAL_MAX,
      veterans,
      veterans_threshold: thr,
      veterans_ok: veterans >= thr,
      newcomers: actives.length - veterans,
      non_consenting: nonConsenting,
      recordable: nonConsenting === 0 && nonHomogeneous,
      camp_counts: campCounts,
      neutral_count: actives.length - campTotal,
      majority_share: campTotal > 0 ? first / campTotal : null,
      heterogeneity_ok: opinionsAvailable
        ? campTotal > 0 && first <= MAJORITY_SHARE_CAP * campTotal && second >= MIN_SECOND_CAMP
        : false,
      heterogeneity_degree: campTotal > 0 ? 1 - first / campTotal : null,
    }
  })
}

// ── Orchestrateur ────────────────────────────────────────────

/**
 * Calcule l'allocation. Ne lève jamais d'exception liée à la qualité des
 * données : au pire elle retourne une table unique avec des avertissements.
 */
export function runAllocation(input: AllocationInput): AllocationResult {
  const seed = input.seed ?? DEFAULT_SEED
  const strategy = input.strategy ?? STRATEGY_ABSOLUTE_STRONG
  const warnings: string[] = []

  const allModeratorIds = [...input.moderatorIds]
  const extras = Math.max(0, input.extraModerators ?? 0)
  const moderatorCapacity = allModeratorIds.length + extras
  const opinionsAvailable = input.opinionsAvailable
  const recorderTarget = Math.max(1, input.recorderCount ?? 1)

  if (!opinionsAvailable) {
    warnings.push(
      "Analyse des camps d'opinion indisponible : la règle 2 (hétérogénéité) est désactivée. " +
      "L'allocation est faite sur les seules règles 1, 3 et 4.",
    )
  }

  const members = [...input.members]
  if (members.length === 0) {
    warnings.push('Aucun participant présentiel à répartir.')
    return {
      tables: [], diagnostics: [], score: [], warnings,
      singleTable: false, moderatorCapacity, seatedModeratorIds: [],
      animatingModerators: 0, recorderTarget, seed, clusters: [], brokenClusters: 0,
    }
  }

  // ── Chantier 92 — grappes d'appairage (règle 1) ──
  const { clusters, droppedLinks } = buildClusters(
    input.pairs, [...members.map(m => m.member_id), ...allModeratorIds],
  )
  const clusterOfId = new Map<string, number>()
  clusters.forEach((c, idx) => c.forEach(id => clusterOfId.set(id, idx)))
  if (droppedLinks > 0) {
    warnings.push(
      `${droppedLinks} lien(s) d'appairage ignoré(s) : ils auraient formé une grappe de plus de ` +
      `${CLUSTER_MAX} personnes. Les liens déclarés en premier ont été retenus.`,
    )
  }

  if (moderatorCapacity === 0) {
    warnings.push("Aucun modérateur identifié : toutes les tables seront sans animateur (leaderless).")
  }

  const actives = members.filter(m => m.is_active)
  const audience = members.filter(m => !m.is_active)

  // Un modérateur assis faute de table redevient participant — **actif** par
  // nature (chantier 91), les autres attributs viennent de son profil.
  const profileById = new Map(input.moderatorProfiles?.map(p => [p.member_id, p]) ?? [])
  const seatProfile = (id: string): AllocationMember => ({
    ...(profileById.get(id) ?? {
      member_id: id, pseudo: id, consents: false, is_veteran: false, group_id: null,
    }),
    is_active: true,
  })

  // ── Surplus de modérateurs (chantier 25b / H17) ──
  // Problème circulaire (asseoir un modérateur change le nombre de tables,
  // donc le surplus) levé par **énumération** du nombre `k` de modérateurs qui
  // animent, au lieu d'itérer vers un point fixe (qui diverge). On retient le
  // plus grand `k` **cohérent** (la répartition compte au moins `k` tables) ;
  // `k = 0` l'est toujours.
  //
  // Chantier 91 : `k` descend d'un cran à la fois. La version précédente
  // sautait directement au nombre de tables produit et pouvait manquer le bon
  // `k` — mesuré : 30 actifs / 4 modé. passait de k = 4 (2 tables) à k = 2,
  // soit 2 tables animées + 1 sans modérateur et 2 modérateurs assis, alors que
  // k = 3 donnait 3 tables toutes animées.
  const forbidUnmoderated = input.forbidUnmoderatedTables ?? false
  const M = allModeratorIds.length
  const solveWith = (kk: number) => solveFor(
    [...actives, ...allModeratorIds.slice(kk).map(seatProfile)],
    kk + extras, opinionsAvailable, recorderTarget, seed, strategy, clusterOfId, forbidUnmoderated,
  )
  let k = M
  let solved = solveWith(k)
  while (k > 0 && solved.shape.sizes.length < k) {
    k--
    solved = solveWith(k)
  }

  const { prep, shape, assign, score, singleTable, note } = solved
  const T = shape.sizes.length
  const animatingIds       = allModeratorIds.slice(0, Math.min(k, shape.moderatedCount))
  const seatedModeratorIds = allModeratorIds.slice(k)
  const seated = seatedModeratorIds.map(seatProfile)

  // ── Avertissements sur la population ──
  if (opinionsAvailable && prep.campCount < 2) {
    warnings.push(
      "Un seul camp d'opinion détecté parmi les actifs : la règle 2 ne peut pas être satisfaite.",
    )
  }
  if (prep.n > 0 && prep.totalVeteran / prep.n < 0.4) {
    warnings.push(
      `${Math.round((prep.totalVeteran / prep.n) * 100)} % d'anciens parmi les actifs (< 40 %) : ` +
      `la règle 3 sera partiellement dégradée.`,
    )
  }
  if (singleTable && prep.n < TABLE_MIN) {
    warnings.push(
      `Seulement ${prep.n} participant(s) actif(s) : une table unique, tout le monde y est placé.`,
    )
  } else if (singleTable && prep.n <= SINGLE_TABLE_MAX) {
    warnings.unshift(`${prep.n} participants actifs (≤ ${SINGLE_TABLE_MAX}) : une table unique, pas d'allocation.`)
  }
  if (note) warnings.push(note)

  const activeIdsByTable: string[][] = Array.from({ length: T }, () => [])
  for (let i = 0; i < prep.n; i++) activeIdsByTable[assign[i]].push(prep.ids[i])
  const moderated = Array.from({ length: T }, (_, t) => t < shape.moderatedCount)

  // ── Public ──
  const nonConsentActive = Array.from({ length: T }, () => 0)
  for (let i = 0; i < prep.n; i++) if (!prep.consent[i]) nonConsentActive[assign[i]]++
  // Tables enregistrables à préserver : les `recorderTarget` premières qui le
  // sont déjà sur leurs seuls actifs.
  const byIdActive = new Map([...actives, ...seated].map(m => [m.member_id, m]))
  let toProtect = recorderTarget
  const protectedTables = diagnoseTables(
    activeIdsByTable.map((ids, t) => ({ table_number: t + 1, moderated: moderated[t], member_ids: ids })),
    byIdActive, opinionsAvailable,
  ).map(d => d.recordable && toProtect-- > 0)
  const clusterTable = new Map<number, number>()
  for (let i = 0; i < prep.n; i++) {
    const c = clusterOfId.get(prep.ids[i])
    if (c !== undefined && !clusterTable.has(c)) clusterTable.set(c, assign[i])
  }
  const placed = placeAudience(
    activeIdsByTable.map(a => a.length), moderated, nonConsentActive, protectedTables, audience,
    clusterOfId, clusterTable,
  )
  if (audience.length > 0) {
    if (!moderated.some(Boolean)) {
      warnings.push(
        `${audience.length} participant(s) passif(s) placé(s) en public à des tables sans modérateur, ` +
        `faute de table animée.`,
      )
    } else if (placed.unmoderatedUsed) {
      warnings.push(
        `Les tables animées sont pleines (${TABLE_TOTAL_MAX} personnes) : une partie du public a été ` +
        `placée à des tables sans modérateur.`,
      )
    }
    if (placed.overCapacity) {
      warnings.push(
        `Des tables dépassent ${TABLE_TOTAL_MAX} personnes : il n'y avait pas assez de place pour tout le public.`,
      )
    }
  }

  // Répartition des modérateurs : un par table modérée.
  //
  // Chantier 123 — l'affectation était `animatingIds.forEach((mid, idx) => …)`,
  // soit un placement par simple ordre d'index, HORS du solveur : un modérateur
  // qui anime n'entre jamais dans `assign[]`, donc `clusterOfId` ne le concerne
  // pas et son binôme était placé sans lui, structurellement (bug rapporté par
  // Jules le 22/09 : « un participant n'est pas mis à la même table que celui
  // avec qui il est affilié par le binôme »). Un modérateur en SURPLUS, lui,
  // repasse par le pool (`seatProfile`) et son appairage était déjà respecté —
  // d'où le fait que le recalcul suivant « le remettait » à la bonne table.
  //
  // Correctif (arbitrage de Jules, option a) : le binôme du modérateur est
  // assigné à SA table. On ne peut pas déplacer le modérateur dans le solveur
  // sans revoir tout le dimensionnement ; on choisit donc l'ORDRE d'affectation
  // des modérateurs aux tables animées de façon à maximiser le nombre de
  // grappes respectées. Glouton stable, départage par plus petit indice de
  // table : entièrement déterministe, aucun `Math.random()` (invariant §6).
  const moderatorsByTable: string[][] = Array.from({ length: T }, () => [])
  {
    const membersOfTable = activeIdsByTable.map((ids, t) => [...ids, ...placed.byTable[t]])
    const freeTables = new Set(animatingIds.map((_, idx) => idx))
    // Les modérateurs appairés passent d'abord : ce sont les seuls dont le choix
    // de table porte une information. Les autres prennent ce qui reste.
    const ranked = animatingIds
      .map((mid, idx) => ({ mid, idx, cluster: clusterOfId.get(mid) }))
      .sort((a, b) => {
        const pa = a.cluster === undefined ? 1 : 0
        const pb = b.cluster === undefined ? 1 : 0
        return pa - pb || a.idx - b.idx
      })
    for (const { mid, cluster } of ranked) {
      let best = -1
      let bestScore = -1
      for (const t of freeTables) {
        const score = cluster === undefined
          ? 0
          : membersOfTable[t].filter(id => clusterOfId.get(id) === cluster).length
        if (score > bestScore || (score === bestScore && (best === -1 || t < best))) {
          best = t; bestScore = score
        }
      }
      if (best === -1) continue
      freeTables.delete(best)
      moderatorsByTable[best].push(mid)
    }

    // Réparation : le choix de table ci-dessus ne suffit pas quand le binôme du
    // modérateur a atterri sur une table non animée, ou sur une table déjà prise
    // par un autre modérateur. On tire alors le binôme vers la table de son
    // modérateur, par ÉCHANGE à effectif constant (les tailles de table, donc la
    // forme retenue par le solveur, sont préservées). Le partenaire d'échange est
    // choisi parmi les non-appairés, pour ne pas casser une grappe en en
    // réparant une autre. Ordre de parcours fixe → déterministe.
    //
    // La règle 1 (appairage) prime sur l'hétérogénéité et les seuils d'actifs
    // (chantier 92) : l'échange peut les dégrader, et les diagnostics recalculés
    // plus bas le montrent honnêtement. S'il n'existe aucun partenaire
    // échangeable, on renonce — l'algorithme ne lève jamais (invariant §6).
    const tableOfAnimator = new Map<string, number>()
    moderatorsByTable.forEach((mods, t) => mods.forEach(mid => tableOfAnimator.set(mid, t)))
    for (const cluster of clusters) {
      const mid = cluster.find(id => tableOfAnimator.has(id))
      if (mid === undefined) continue
      const target = tableOfAnimator.get(mid)!
      for (const id of cluster) {
        if (id === mid) continue
        const pool = activeIdsByTable.some(ids => ids.includes(id)) ? activeIdsByTable : placed.byTable
        const from = pool.findIndex(ids => ids.includes(id))
        if (from === -1 || from === target) continue
        const swapIdx = pool[target].findIndex(other =>
          clusterOfId.get(other) === undefined && !tableOfAnimator.has(other))
        if (swapIdx === -1) continue
        const swapped = pool[target][swapIdx]
        pool[target][swapIdx] = id
        pool[from][pool[from].indexOf(id)] = swapped
      }
    }
  }

  // ── Retours explicites au superadmin (chantier 25 / H13, H15, H17) ──
  if (seatedModeratorIds.length > 0) {
    warnings.push(
      `${seatedModeratorIds.length} modérateur(s) de plus que de tables animées : ils ont été répartis comme ` +
      `des participants actifs, en tenant compte de leurs réponses d'onboarding et de leur camp ` +
      `(ils comptent donc dans les seuils de leur table). S'ils ne viennent pas, décoche-les dans la ` +
      `liste des modérateurs avant de relancer le calcul.`,
    )
  }
  if (shape.moderatedCount > animatingIds.length) {
    warnings.push(
      `${shape.moderatedCount - animatingIds.length} table(s) comptent sur un modérateur annoncé mais pas encore inscrit — ` +
      `à rattacher à la main dès son arrivée.`,
    )
  }
  if (extras > 0 && shape.moderatedCount >= T && animatingIds.length >= T) {
    warnings.push(
      `Les ${T} tables sont déjà toutes animées : les ${extras} modérateur(s) annoncés en plus ne modifient pas ` +
      `la répartition (la règle §4 « préférer un nombre de tables ≤ nombre de modérateurs » est déjà satisfaite). ` +
      `À leur arrivée, ils seront placés comme participants.`,
    )
  }
  const unmoderatedCount = T - shape.moderatedCount
  if (recorderTarget > 1 && unmoderatedCount > 0) {
    warnings.push(
      `Objectif de ${recorderTarget} tables enregistrables (règle 1, prioritaire sur le dimensionnement) : ` +
      `il a fallu ${T} tables, dont ${unmoderatedCount} sans animateur. ` +
      `Avec moins d'enregistreurs, l'algorithme ferait des tables plus grosses et toutes animées.`,
    )
  }
  // Chantier 98 — l'option ne peut échouer que faute de modérateurs (capacité
  // nulle) : le filet de sécurité produit alors une table unique sans
  // animateur, seul cas où elle reste théoriquement violée après coup.
  if (forbidUnmoderated && unmoderatedCount > 0) {
    warnings.push(
      `Option « interdire les tables sans modérateur » active, mais aucun modérateur n'est disponible : ` +
      `impossible à respecter. Toutes les autres règles ont été sacrifiées en priorité.`,
    )
  }

  const tables: AllocationTable[] = activeIdsByTable.map((ids, t) => ({
    table_number: t + 1,
    moderated: moderated[t],
    member_ids: [...ids, ...placed.byTable[t]],
    audience_member_ids: placed.byTable[t],
    moderator_member_ids: moderatorsByTable[t],
  }))

  // Chantier 123 — `member_ids` n'inclut PAS les modérateurs qui animent : sans
  // la fusion ci-dessous, un modérateur séparé de son binôme était compté comme
  // « absent » et sa grappe cassée n'apparaissait dans aucun compteur. La règle 1
  // se dégradait donc en silence, seul l'avertissement `involvesAnimator` en
  // parlait.
  const brokenClusters = countBrokenClusters(
    tables.map(t => ({ member_ids: [...t.member_ids, ...t.moderator_member_ids] })),
    clusters,
  )
  if (brokenClusters > 0) {
    warnings.push(
      `${brokenClusters} grappe(s) d'appairage n'ont pas pu être gardées ensemble (règle 1 dégradée).`,
    )
  }
  // Chantier 123 — l'avertissement ne se déclenche plus dès qu'une grappe
  // comprend un modérateur animant (c'est désormais le cas NOMINAL : il est
  // assis avec ses binômes), mais seulement quand elle n'a pas pu être tenue.
  const brokenWithAnimator = clusters.filter(c => {
    if (!c.some(id => animatingIds.includes(id))) return false
    return countBrokenClusters(
      tables.map(t => ({ member_ids: [...t.member_ids, ...t.moderator_member_ids] })),
      [c],
    ) > 0
  }).length
  if (brokenWithAnimator > 0) {
    warnings.push(
      `${brokenWithAnimator} grappe(s) d'appairage comprennent un modérateur qui anime et n'ont pas pu être ` +
      `tenues : une seule table peut lui être confiée, ses binômes sont placés sans lui.`,
    )
  }

  const byId = new Map([...members, ...seated].map(m => [m.member_id, m]))
  return {
    tables,
    diagnostics: diagnoseTables(tables, byId, opinionsAvailable),
    score,
    warnings,
    singleTable,
    moderatorCapacity,
    seatedModeratorIds,
    animatingModerators: animatingIds.length,
    recorderTarget,
    seed,
    clusters,
    brokenClusters,
  }
}

// ── Recalcul de diagnostics après retouche manuelle ──────────

/**
 * Recalcule les diagnostics d'une répartition arbitraire (après glisser-déposer
 * du superadmin). Ne réoptimise rien — donne juste le statut de chaque seuil,
 * pour le tableau de bord « mise à jour en direct » (§7).
 */
export function diagnoseAllocation(
  tables: { table_number: number; moderated: boolean; member_ids: string[] }[],
  members: AllocationMember[],
  opinionsAvailable: boolean,
): TableDiagnostics[] {
  const ordered = [...tables].sort((a, b) => a.table_number - b.table_number)
  return diagnoseTables(ordered, new Map(members.map(m => [m.member_id, m])), opinionsAvailable)
}
