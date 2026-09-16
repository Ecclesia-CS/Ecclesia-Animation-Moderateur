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
// ── Les 6 règles (priorité décroissante) ─────────────────────
//   1. Assez d'actifs      : actifs ≥ ⌊3/5·taille⌋ (chantier 91 — était min(⌈2/5·taille⌉, 4))
//   2. Passifs encadrés    : pas de passifs aux tables sans modérateur, puis
//                            le plus de tables animées possible (chantier 91)
//   3. Table enregistrable  : ≥1 table sans non-consentant ET non homogène
//   4. Hétérogénéité        : camp majoritaire ≤ 70 % ET 2e camp ≥ 2 personnes
//   5. Assez d'anciens      : anciens ≥ ⌈2/5·taille⌉
//   6. Nouveaux encadrés    : maximiser les nouveaux aux tables modérées
//
// ⚠️ Numérotation : jusqu'au chantier 90, les règles 3 à 6 ci-dessus
// s'appelaient 2 à 5. Les champs de `TableDiagnostics` gardent leur nom
// historique (`rule1_ok` = actifs, `rule3_ok` = hétérogénéité, `rule4_ok` =
// anciens) pour ne pas casser les écrans ; la règle des passifs est
// `passives_ok`.
//
// ── Chantier 91 : les passifs ne comptent pas dans la taille ──
// Une table animée est bornée à `TABLE_MAX_ACTIVE` **actifs** ; les passifs
// s'y ajoutent en plus, sur les plus grosses tables d'abord, pour observer.
// C'est la règle 1 (ratio 3/5 sur la taille totale) qui limite leur nombre,
// pas un plafond de taille. Les tables sans modérateur gardent leurs bornes
// 5-7 au total : on évite d'y asseoir des passifs (règle 2).
//
// Second terme de la règle 2 — « autant de tables animées que de
// modérateurs » : sans plafond de taille totale, le maximin d'hétérogénéité
// (règle 4) préfère toujours des tables plus grosses et laissait des
// modérateurs sans table (mesuré : 47 part. / 4 modé. → 3 tables de 22).
// Avant le chantier 91, le plafond de 12 personnes l'empêchait implicitement.
//
// Conséquence structurelle : une forme fixe le nombre d'actifs **et** de
// passifs de chaque table (`Shape.activeSizes` / `passiveSizes`). Les règles 1
// et 2 sont donc décidées au choix de la forme ; la recherche locale n'échange
// que des personnes de même statut et optimise les règles 3 à 6.
//
// L'algorithme ne peut jamais échouer : seules les bornes de taille
// sont dures, tout le reste dégrade (règle 6 sacrifiée en premier,
// règle 1 en dernier — comportement naturel de l'ordre lexicographique).
// =============================================================

// ── Constantes ───────────────────────────────────────────────

/** Taille minimale d'une table quand il y a allocation (N > 10), passifs compris. */
export const TABLE_MIN = 5
/**
 * Nombre maximal nominal d'**actifs** à une table animée — les passifs n'y
 * comptent pas (chantier 91, était `TABLE_MAX = 12` sur la taille totale).
 */
export const TABLE_MAX_ACTIVE = 14
/** Plafond de dépassement en actifs, toléré seulement pour sauver la règle 1. */
export const TABLE_OVERFLOW_MAX = 20
/**
 * Plafond **dur** de taille totale d'une table animée, passifs compris :
 * 14 actifs + 10 passifs, soit la plus grande table qui tient encore la règle 1
 * (`passiveHosting(14)`). Les passifs ne comptent pas dans la limite de 14,
 * mais sans ce garde-fou une salle où presque personne ne se déclare actif —
 * cas réel : un membre sans onboarding compte comme passif (§6) — produisait
 * une table unique de toute la salle (mesuré : 37 personnes).
 */
export const TABLE_TOTAL_MAX = 24
/** N ≤ ce seuil → table unique, pas d'allocation. */
export const SINGLE_TABLE_MAX = 10
/**
 * Tables **sans modérateur** : bornes resserrées par rapport aux tables
 * animées. L'auto-régulation par `claim_floor` (le premier en file prend la
 * parole) reste gérable dans cette plage ; au-delà, plus personne n'arbitre
 * les tours de parole. Demandé par Jules le 2026-08-01 (plage 4-6), resserré
 * à 5-7 le 2026-08-03, en complément du §4 (qui ne fixait qu'un minimum de 5,
 * commun aux deux types de table).
 */
export const UNMODERATED_TABLE_MIN = 5
export const UNMODERATED_TABLE_MAX = 7
/**
 * Anciens minimum dans une table sans modérateur — plancher dur qui remplace
 * la formule de la règle 4 quand elle donnerait moins (tailles 4 et 5 : 2).
 * Sans animateur, le groupe a besoin de plus d'expérience pour s'auto-réguler.
 */
export const UNMODERATED_VETERAN_FLOOR = 3
/**
 * Actifs minimum dans une table sans modérateur — plancher dur qui remplace
 * la formule de la règle 1 quand elle donnerait moins (taille 4 : 2). Sans
 * animateur, il faut plus de participants prêts à prendre la parole pour que
 * la discussion s'auto-alimente. Demandé par Jules le 2026-08-03.
 */
export const UNMODERATED_ACTIVE_FLOOR = 3
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

// ── Chantier 29 — réglages de la recherche (I1) ──────────────
//
// **Défaut en production : `STRATEGY_ABSOLUTE_STRONG`** (validé par Jules le
// 2026-07-29). Les autres constantes n'existent que pour le banc d'essai —
// aucune ne doit être passée par l'application.
//
// Le chantier 25b a mesuré que le score des règles 1 et 4 en **taux d'échec**
// (`-fail/T`) pousse à fragmenter la salle dès que la règle est globalement
// insatisfaisable : le nombre de tables en échec reste à peu près constant
// pendant que T augmente, donc le taux baisse sans que personne n'y gagne.
//
// Le chantier 29 a établi que corriger ce taux ne suffit pas, et surtout que
// l'exemple normatif du §4 n'était **pas** tenu par la version historique :
// son test de non-régression emploie une population aux attributs corrélés
// (`balanced()`), et sur une population décorrélée de même composition la
// version historique produisait 6 tables dont 2 de 10 sans animateur. La
// recherche elle-même était en cause. D'où deux correctifs indissociables :
// métrique absolue **et** recherche fiabilisée — mesuré, chacun pris seul est
// insuffisant, et « recherche seule » est même souvent pire que l'historique
// (elle applique plus efficacement un objectif biaisé).
//
// Les réglages restent découpés en champs indépendants pour permettre
// l'**ablation** (`bench/allocation-bench.ts`) : c'est ce qui a permis
// d'attribuer l'effet à chaque piste plutôt que de constater le résultat d'un
// correctif global. Ne pas les fusionner en un booléen.
export interface AllocationStrategy {
  /**
   * Terme principal des règles 1 et 4.
   *  · `rate`     — `-échecs / T` (comportement historique) ;
   *  · `absolute` — `-Σ(personnes manquantes)`, invariant au découpage.
   */
  shortfallMetric: 'rate' | 'absolute'
  /** Nombre de démarrages par forme. */
  restarts: number
  /**
   * Répartition du budget d'évaluations entre les formes candidates.
   *  · `null`   — pool global consommé dans l'ordre d'énumération
   *    (comportement historique : les formes explorées en dernier sont
   *    affamées, donc sous-optimisées, donc écartées pour une raison qui n'a
   *    rien à voir avec leur qualité) ;
   *  · `'fair'` — part équitable du budget restant entre les formes restantes,
   *    le reliquat d'une forme qui converge tôt profitant aux suivantes. Coût
   *    total du même ordre qu'en historique, sans le biais d'ordre ;
   *  · un nombre — plafond fixe par forme (coût total ∝ nombre de formes :
   *    ne passe pas l'échelle sur les grandes salles).
   */
  perShapeBudget: number | 'fair' | null
  /**
   * Voisinage dirigé : réparer d'abord les déficits des règles 1 et 4 par des
   * échanges **à camp constant** (neutres pour la règle 3, plus prioritaire).
   */
  targetedNeighborhood: boolean
  /**
   * Amorce par quotas : distribution exacte (greedy sur seuils croissants) des
   * actifs et des anciens avant toute descente — résolution exacte du
   * sous-problème d'affectation des anciens.
   */
  quotaSeeding: boolean
  /**
   * Élagage par borne : une forme dont l'**optimum théorique** est déjà
   * lexicographiquement battu par le meilleur résultat réalisé est ignorée.
   * Sépare « évaluer une forme à son optimum » de « guider la recherche ».
   */
  boundPruning: boolean
}

/**
 * Comportement historique (chantiers 19 à 25c). **Plus utilisé en
 * production** — conservé comme référence de comparaison pour le banc d'essai.
 */
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

/**
 * **Stratégie de production** (chantier 29) — métrique absolue + recherche
 * fiabilisée. Les deux moitiés sont nécessaires, aucune n'est suffisante :
 * voir le commentaire en tête de section et `A_VERIFIER.md`.
 */
export const STRATEGY_ABSOLUTE_STRONG: AllocationStrategy = {
  ...STRATEGY_STRONG_SEARCH_ONLY,
  shortfallMetric: 'absolute',
}

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
  /** Camp d'opinion (`analysis_members.group_id`). null = n'a pas voté → neutre pour la règle 4. */
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
  /** Nombre d'enregistreurs disponibles — si fourni, la règle 3 vise ce nombre de tables propres. */
  recorderCount?: number | null
  /** false → règle 4 désactivée proprement (analyse des camps indisponible, §5). */
  opinionsAvailable: boolean
  seed?: number
  /**
   * Chantier 29 (I1) — réglages de la recherche. Absent → `STRATEGY_LEGACY`.
   * Sert à l'ablation dans le bench ; la production n'a pas à le fournir.
   */
  strategy?: AllocationStrategy
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
  /** Chantier 91 — personnes non actives (`size − actives`). */
  passives: number
  /** Chantier 91, règle 2 — table animée, ou table sans modérateur sans aucun passif. */
  passives_ok: boolean
  veterans: number
  veterans_threshold: number
  rule4_ok: boolean
  newcomers: number
  non_consenting: number
  /** Règle 2 : aucune personne non consentante ET table non homogène. */
  recordable: boolean
  /** camp d'opinion → effectif. Clés = `group_id` d'origine. */
  camp_counts: Record<string, number>
  /** Membres sans camp (n'ont pas voté) — neutres pour la règle 4. */
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
  /** Objectif de tables enregistrables effectivement utilisé (règle 3). */
  recorderTarget: number
  /** true → une table dépasse TABLE_MAX_ACTIVE actifs pour sauver la règle 1. */
  overflowUsed: boolean
  /** Rappel : le résultat est reproductible à graine identique. */
  seed: number
}

// ── Seuils ───────────────────────────────────────────────────

/**
 * Règle 1 — `⌊3/5·taille⌋` : 3 à 5 et 6 pers., 4 à 7, 6 à 10, 7 à 12, 8 à 14.
 * Chantier 91 : l'ancien `min(⌈2/5·taille⌉, 4)` plafonnait à 4 actifs, ce qui
 * neutralisait le ratio au-delà de 10 personnes. Arrondi vers le bas : Jules
 * donne « au moins 8 » pour une table de 14 (8,4).
 */
export function activeThreshold(size: number): number {
  return Math.floor((3 * size) / 5)
}

/**
 * Plus grand nombre de passifs qu'une table de `actives` actifs peut accueillir
 * sans passer sous le seuil de la règle 1 : `⌊3(a+p)/5⌋ ≤ a ⟺ p ≤ ⌊(2a+4)/3⌋`.
 */
function passiveHosting(actives: number): number {
  return Math.floor((2 * actives + 4) / 3)
}

/**
 * Règle 4 — `⌈2/5·taille⌉`.
 * La spec écrit « anciens ≥ 2/5 × taille » sans préciser l'arrondi ; on
 * reprend le ⌈⌉ explicite de la règle 1 par cohérence (taille 6 → 3 anciens).
 */
export function veteranThreshold(size: number): number {
  return Math.ceil((2 / 5) * size)
}

/**
 * Seuil d'anciens réellement appliqué à une table donnée : la formule de la
 * règle 4, sauf pour une table **sans modérateur** où `UNMODERATED_VETERAN_FLOOR`
 * remplace la formule quand elle est plus basse. Ne change rien pour les
 * tables animées (la formule seule reste faisant foi).
 */
function resolvedVeteranThreshold(size: number, moderated: boolean): number {
  const base = veteranThreshold(size)
  return moderated ? base : Math.max(UNMODERATED_VETERAN_FLOOR, base)
}

/**
 * Seuil d'actifs réellement appliqué à une table donnée : la formule de la
 * règle 1, sauf pour une table **sans modérateur** où `UNMODERATED_ACTIVE_FLOOR`
 * remplace la formule quand elle est plus basse. Ne change rien pour les
 * tables animées.
 */
function resolvedActiveThreshold(size: number, moderated: boolean): number {
  const base = activeThreshold(size)
  return moderated ? base : Math.max(UNMODERATED_ACTIVE_FLOOR, base)
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
  /** Totaux population — bornes exactes par forme (chantier 29). */
  totalActive: number
  totalVeteran: number
  totalNonConsent: number
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
    totalActive: 0,
    totalVeteran: 0,
    totalNonConsent: 0,
  }
  members.forEach((m, i) => {
    prep.active[i] = m.is_active ? 1 : 0
    prep.consent[i] = m.consents ? 1 : 0
    prep.veteran[i] = m.is_veteran ? 1 : 0
    prep.camp[i] = m.group_id === null ? -1 : labelIdx.get(m.group_id)!
    if (prep.active[i]) prep.totalActive++
    if (prep.veteran[i]) prep.totalVeteran++
    if (!prep.consent[i]) prep.totalNonConsent++
  })
  return prep
}

/**
 * Forme candidate : effectifs fixés, les `moderatedCount` premières tables sont
 * animées. Chantier 91 : la forme fixe aussi le **statut** des places
 * (`sizes[t] = activeSizes[t] + passiveSizes[t]`).
 */
interface Shape {
  sizes: number[]
  activeSizes: number[]
  passiveSizes: number[]
  moderatedCount: number
}

function makeShape(activeSizes: number[], passiveSizes: number[], moderatedCount: number): Shape {
  return {
    sizes: activeSizes.map((a, t) => a + passiveSizes[t]),
    activeSizes, passiveSizes, moderatedCount,
  }
}

/**
 * Règle 1 exacte d'une forme : manque d'actifs aux tables sans modérateur, manque
 * total, et nombre de tables en manque.
 *
 * Le manque **sans modérateur** passe en premier (chantier 91) : à manque total
 * égal ou presque, concentrer les passifs dans une table sans animateur (mesuré :
 * une table de 0 actif + 5 passifs sur 60 part. / 4 modé.) produit une table qui
 * ne démarre pas, là où un modérateur relance une table en léger manque.
 */
function shapeActiveShortfall(shape: Shape): { unmoderated: number; total: number; fails: number } {
  let unmoderated = 0
  let total = 0
  let fails = 0
  shape.sizes.forEach((s, t) => {
    const moderated = t < shape.moderatedCount
    const miss = resolvedActiveThreshold(s, moderated) - shape.activeSizes[t]
    if (miss > 0) {
      total += miss
      fails++
      if (!moderated) unmoderated += miss
    }
  })
  return { unmoderated, total, fails }
}

/** Règle 2 exacte d'une forme : passifs assis à une table sans modérateur. */
function shapeUnmoderatedPassives(shape: Shape): number {
  let p = 0
  for (let t = shape.moderatedCount; t < shape.sizes.length; t++) p += shape.passiveSizes[t]
  return p
}

/**
 * Tables sans modérateur : `total` personnes dont `actives` actifs, réparties
 * aussi également que possible (tailles dans [5, 7] garanties par l'appelant),
 * les actifs couvrant d'abord les seuils de la règle 1.
 */
function splitUnmoderated(u: number, total: number, actives: number): { a: number[]; p: number[] } {
  if (u === 0) return { a: [], p: [] }
  const sizes = Array.from({ length: u }, (_, i) => Math.floor(total / u) + (i < total % u ? 1 : 0))
  const a = quotas(sizes.map(s => resolvedActiveThreshold(s, false)), sizes, actives)
  return { a, p: sizes.map((s, i) => s - a[i]) }
}

/**
 * Tables animées : actifs répartis également, puis passifs.
 *  1. complément jusqu'à `TABLE_MIN` ;
 *  2. accueil sans casser la règle 1, **les tables les plus fournies en actifs
 *     d'abord** (« les grosses tables à modérateurs, pour qu'ils puissent
 *     observer tranquillement » — Jules, 16/09) ;
 *  3. reliquat réparti au tour par tour (dégrade la règle 1 le moins possible).
 * Aucun plafond de taille : les passifs n'y comptent pas.
 */
function splitModerated(m: number, actives: number, passives: number): { a: number[]; p: number[] } {
  const room = (i: number) => TABLE_TOTAL_MAX - a[i] - p[i]
  const a = Array.from({ length: m }, (_, i) => Math.floor(actives / m) + (i < actives % m ? 1 : 0))
  const p = new Array<number>(m).fill(0)
  let left = passives
  for (let i = 0; i < m && left > 0; i++) {
    const give = Math.min(Math.max(0, TABLE_MIN - a[i]), left)
    p[i] += give
    left -= give
  }
  const order = [...Array(m).keys()].sort((x, y) => a[y] - a[x] || x - y)
  for (const i of order) {
    if (left <= 0) break
    const give = Math.min(Math.max(0, passiveHosting(a[i]) - p[i]), room(i), left)
    p[i] += give
    left -= give
  }
  // L'appelant garantit `actives + passives ≤ m · TABLE_TOTAL_MAX` : la boucle termine.
  for (let k = 0; left > 0; k = (k + 1) % m) {
    if (room(order[k]) > 0) { p[order[k]] += 1; left-- }
  }
  return { a, p }
}

/**
 * Politique de dimensionnement (chantier 91), pour un nombre de tables donné :
 *  - tables **animées** : au plus `maxActive` actifs chacune, passifs en sus,
 *    dans la limite dure de `TABLE_TOTAL_MAX` personnes ;
 *  - tables **sans modérateur** : `[UNMODERATED_TABLE_MIN, UNMODERATED_TABLE_MAX]`
 *    au total (auto-régulation par `claim_floor`), aussi petites que possible.
 * Le seul degré de liberté est le nombre `x` d'actifs envoyés aux tables sans
 * modérateur ; on l'énumère et on retient, dans l'ordre : manque d'actifs
 * minimal (règle 1), passifs sans modérateur minimaux (règle 2), puis tables
 * sans modérateur les plus petites.
 * Retourne null si aucune répartition valide n'existe pour ce nombre de tables
 * (dégradation gérée par l'appelant : l'algorithme ne lève jamais).
 */
function buildShape(
  nActive: number, nPassive: number, tableCount: number, moderatorCapacity: number, maxActive: number,
): Shape | null {
  if (tableCount < 1) return null
  const n = nActive + nPassive
  const m = Math.min(tableCount, moderatorCapacity)
  const u = tableCount - m
  if (n < m * TABLE_MIN + u * UNMODERATED_TABLE_MIN) return null

  let best: Shape | null = null
  let bestKey: number[] = []
  for (let x = 0; x <= Math.min(nActive, u * UNMODERATED_TABLE_MAX); x++) {
    const aM = nActive - x
    if (aM > m * maxActive) continue
    // Sans table animée, tout le monde va aux tables sans modérateur ; sinon
    // elles prennent au moins ce que les tables animées ne peuvent pas asseoir.
    const sU = m === 0 ? n : Math.max(u * UNMODERATED_TABLE_MIN, x, n - m * TABLE_TOTAL_MAX)
    if (sU > u * UNMODERATED_TABLE_MAX) continue
    const pU = sU - x
    if (pU > nPassive || n - sU < m * TABLE_MIN) continue

    const unmod = splitUnmoderated(u, sU, x)
    const mod = m > 0 ? splitModerated(m, aM, nPassive - pU) : { a: [], p: [] }
    const shape = makeShape([...mod.a, ...unmod.a], [...mod.p, ...unmod.p], m)
    const e1 = shapeActiveShortfall(shape)
    const key = [-e1.unmoderated, -e1.total, -e1.fails, -pU, -sU]
    if (!best || compareArraysDesc(key, bestKey) > 0) { best = shape; bestKey = key }
  }
  return best
}

/**
 * Plus grand nombre de tables pour lequel une forme peut exister : les
 * premières `moderatorCapacity` tables restent bornées à `TABLE_MIN`, les
 * suivantes peuvent descendre à `UNMODERATED_TABLE_MIN`. Borne **exacte**
 * (pas seulement large) — une borne trop généreuse ferait enumerer et
 * rechercher des formes non gagnantes pour rien, ce qui coûte le budget de
 * latence navigateur (§6, < 5 s à 200 personnes).
 */
function maxTableCount(n: number, moderatorCapacity: number): number {
  const capacity = Math.max(0, moderatorCapacity)
  if (capacity * TABLE_MIN > n) return Math.floor(n / TABLE_MIN)
  const remaining = n - capacity * TABLE_MIN
  return capacity + Math.floor(remaining / UNMODERATED_TABLE_MIN)
}

function enumerateShapes(prep: Prepared, moderatorCapacity: number, maxActive: number): Shape[] {
  const shapes: Shape[] = []
  const nPassive = prep.n - prep.totalActive
  // Les passifs n'ayant pas de plafond aux tables animées, le nombre minimal de
  // tables ne se déduit plus de la population : buildShape écarte les formes
  // impossibles.
  const maxTables = maxTableCount(prep.n, moderatorCapacity)
  for (let t = 1; t <= maxTables; t++) {
    const s = buildShape(prep.totalActive, nPassive, t, moderatorCapacity, maxActive)
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

// ── Chantier 29 — optimum théorique d'une forme (piste « exact ») ──
//
// Le sous-problème « répartir S personnes portant un attribut sur des tables de
// seuils `thr_t` » a une solution exacte immédiate, indépendante de la
// recherche locale :
//   · manque total minimal   = max(0, Σthr − S)   (car thr_t ≤ taille_t, donc
//     aucune table ne sature avant d'avoir absorbé son seuil) ;
//   · nombre minimal de tables en échec = T − (plus grand k tel que la somme
//     des k plus petits seuils ≤ S).
// C'est vrai pour la règle 1 (actifs) comme pour la règle 4 (anciens).

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
 *
 * Sépare « évaluer une forme à son optimum » de « guider la recherche » : une
 * forme dont l'optimum est déjà battu n'a pas à consommer de budget.
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
  const thr4 = shape.sizes.map((s, t) => resolvedVeteranThreshold(s, t < shape.moderatedCount))
  // Chantier 91 : les règles 1 et 2 sont fixées par la forme — valeurs exactes.
  const e1 = shapeActiveShortfall(shape)
  const r6 = -shapeUnmoderatedPassives(shape)
  const e4 = exactShortfall(thr4, prep.totalVeteran)

  // Règle 2 — au mieux, tous les non-consentants sont entassés dans les plus
  // grandes tables ; les autres tables sont alors « propres ».
  const desc = [...shape.sizes].sort((a, b) => b - a)
  let absorbed = 0
  let dirty = 0
  while (absorbed < prep.totalNonConsent && dirty < T) { absorbed += desc[dirty]; dirty++ }
  const r2Bound = Math.min(T - dirty, recorderTarget)

  // Règle 5 — au mieux, toutes les places modérées sont occupées par des nouveaux.
  let moderatedSeats = 0
  for (let t = 0; t < shape.moderatedCount; t++) moderatedSeats += shape.sizes[t]
  const r5Bound = Math.min(prep.n - prep.totalVeteran, moderatedSeats)

  const hetBound = opinionsAvailable ? 1 : 0

  return metric === 'absolute'
    ? [-e1.unmoderated, -e1.total, -e1.fails, 0, r6, shape.moderatedCount, r2Bound, 0, hetBound, -e4.total, -e4.fails, 0, r5Bound]
    : [-e1.unmoderated, -e1.fails / T_, 0, r6, shape.moderatedCount, r2Bound, 0, hetBound, -e4.fails / T_, 0, r5Bound]
}

/**
 * Test de dominance lexicographique : la forme peut-elle être écartée sans
 * être explorée ? Vrai seulement si sa borne est **strictement** battue à la
 * première composante où elle diffère du meilleur score déjà réalisé.
 */
function boundIsDominated(bound: number[], best: number[]): boolean {
  for (let i = 0; i < bound.length && i < best.length; i++) {
    if (bound[i] !== best[i]) return bound[i] < best[i]
  }
  return false
}

// ── Chantier 29 — amorce par quotas (piste « résolution exacte ») ──

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
  // Reliquat : tout le monde doit être placé, on remplit les tables restantes.
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
 * Amorce constructive : réalise les quotas d'anciens (règle des anciens) dans
 * les places actives/passives fixées par la forme, en équilibrant les camps au
 * passage. La descente locale n'a plus qu'à polir l'enregistrabilité et
 * l'hétérogénéité au lieu de devoir d'abord découvrir une distribution
 * correcte des attributs.
 */
function quotaAssignment(shape: Shape, prep: Prepared): Int32Array {
  const T = shape.sizes.length
  const sizes = shape.sizes
  const qV = quotas(sizes.map((s, t) => resolvedVeteranThreshold(s, t < shape.moderatedCount)), sizes, prep.totalVeteran)

  const assign = new Int32Array(prep.n).fill(-1)
  const roomA = [...shape.activeSizes]
  const roomP = [...shape.passiveSizes]
  const needV = [...qV]
  const campSeen: number[][] = Array.from({ length: T }, () => new Array(Math.max(1, prep.campCount)).fill(0))
  const nonConsentSeen = new Array<number>(T).fill(0)

  const place = (i: number, t: number) => {
    assign[i] = t
    if (prep.active[i]) roomA[t]--
    else roomP[t]--
    if (prep.veteran[i]) needV[t]--
    const c = prep.camp[i]
    if (c >= 0) campSeen[t][c]++
    if (!prep.consent[i]) nonConsentSeen[t]++
  }

  /**
   * Choisit, dans `pool`, la personne la plus utile à la table `t` :
   * camp le moins représenté d'abord (hétérogénéité), puis regroupement des
   * non-consentants (enregistrabilité : concentrer la « saleté » libère des tables
   * propres), puis index pour rester déterministe.
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

  const bucket = (v: number, a: number) => {
    const out: number[] = []
    for (let i = 0; i < prep.n; i++) if (prep.veteran[i] === v && prep.active[i] === a) out.push(i)
    return out
  }
  const vetActive = bucket(1, 1)
  const vetPassive = bucket(1, 0)
  const newActive = bucket(0, 1)
  const newPassive = bucket(0, 0)

  const byNeed = (need: number[]) => [...Array(T).keys()].sort((a, b) => need[b] - need[a] || a - b)

  // 1. Anciens — les tables les plus exigeantes d'abord, dans une place du
  //    statut disponible (actif ou passif).
  for (const t of byNeed(needV)) {
    while (needV[t] > 0) {
      const pool = roomP[t] > 0 && vetPassive.length ? vetPassive
                 : roomA[t] > 0 && vetActive.length ? vetActive
                 : null
      if (!pool) break
      place(pick(pool, t), t)
    }
  }
  // 2. Reliquat — toutes les places restantes, dans l'ordre des tables.
  const restA = [...newActive, ...vetActive]
  const restP = [...newPassive, ...vetPassive]
  for (let t = 0; t < T; t++) {
    while (roomA[t] > 0 && restA.length) place(pick(restA, t), t)
    while (roomP[t] > 0 && restP.length) place(pick(restP, t), t)
  }
  // Filet de sécurité : personne ne doit rester sans table.
  for (let i = 0; i < prep.n; i++) {
    if (assign[i] === -1) {
      const room = prep.active[i] ? roomA : roomP
      const t = room.findIndex(r => r > 0)
      place(i, t >= 0 ? t : 0)
    }
  }
  return assign
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
  metric: AllocationStrategy['shortfallMetric'] = 'rate',
): Evaluation {
  const T = shape.sizes.length
  const C = prep.campCount

  let fail1 = 0
  let minMargin1 = Infinity
  let sumShort1 = 0
  let sumShort1Unmoderated = 0

  let cleanCount = 0

  let fail3 = 0
  let minHet = Infinity
  let hetSeen = false
  let sumShort3 = 0

  let fail4 = 0
  let minMargin4 = Infinity
  let sumShort4 = 0

  let newcomersModerated = 0
  let unmoderatedPassives = 0

  const nonConsentList: number[] = []

  for (let t = 0; t < T; t++) {
    const size = shape.sizes[t]

    // Règle 1
    const thr1 = resolvedActiveThreshold(size, t < shape.moderatedCount)
    const margin1 = ctr.actives[t] - thr1
    if (margin1 < 0) {
      fail1++
      sumShort1 += -margin1
      if (t >= shape.moderatedCount) sumShort1Unmoderated += -margin1
    }
    if (margin1 < minMargin1) minMargin1 = margin1

    // Règle 4
    const thr4 = resolvedVeteranThreshold(size, t < shape.moderatedCount)
    const margin4 = ctr.veterans[t] - thr4
    if (margin4 < 0) { fail4++; sumShort4 += -margin4 }
    if (margin4 < minMargin4) minMargin4 = margin4

    // Règle 6 — nouveaux placés à une table modérée ; règle 2 — passifs sans modérateur
    if (t < shape.moderatedCount) newcomersModerated += size - ctr.veterans[t]
    else unmoderatedPassives += size - ctr.actives[t]

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
  //
  // ⚠️ Faiblesse connue du taux, mesurée au chantier 25b, **instruite au
  // chantier 29 (I1) et toujours active par défaut** : l'adoption du correctif
  // attend l'arbitrage de Jules (A_VERIFIER.md + rapport comparatif
  // `docs/chantier-29-comparatif-allocation.md`).
  //
  // Symptôme : quand la règle 4 est globalement insatisfaisable (anciens
  // < 40 %, que le §5 désigne pourtant comme le cas *normal* d'une association
  // qui grandit), le nombre de tables en échec reste à peu près constant
  // pendant que T augmente — découper la salle fait donc baisser le taux sans
  // rien améliorer.
  //
  // Ce que le chantier 29 a établi **en plus**, et qui corrige la conclusion du
  // 25b : passer au manque total ne « casse » pas l'exemple normatif du §4.
  // Cet exemple n'était en réalité **pas tenu**. Le test qui le protège emploie
  // une population aux attributs corrélés (`balanced()`) ; sur une population
  // décorrélée de même composition agrégée, le code ci-dessous produit déjà
  // 6 tables dont 2 de 10 sans animateur — précisément le résultat que le §4
  // désigne comme mauvais. La cause est la **recherche** (budget global
  // consommé dans l'ordre d'énumération des formes, et maximin
  // d'hétérogénéité de la règle 3 qui fige la descente juste avant la règle 4),
  // pas la formule. Cf. `STRATEGY_ABSOLUTE_STRONG` : métrique absolue et
  // recherche fiabilisée sont chacune nécessaires, aucune n'est suffisante.
  //
  // ── Chantier 29 (I1) : `shortfallMetric = 'absolute'` ────────────────
  // Remplace le taux par le **manque total en personnes** pour les règles 1 et
  // 4. Ce terme est invariant au découpage (⌈2/5·taille⌉ sommé sur une salle
  // donnée bouge de ±2 quel que soit le nombre de tables), donc fragmenter ne
  // le fait plus baisser artificiellement. Le choix du nombre de tables
  // redevient alors l'affaire de la politique de dimensionnement du §4
  // (`shapePreference`) et de la règle 5, comme la spec le prévoit.
  // Le taux d'échec reste utilisé comme second terme : à manque total égal, on
  // préfère concentrer le manque sur peu de tables plutôt que l'étaler.
  const T_ = T || 1
  const absolute = metric === 'absolute'
  // ⚠️ Les termes secondaires sont des **comptes absolus** (`-fail`), surtout
  // pas des taux : réintroduire `-fail/T` ici ramènerait très exactement le
  // biais de fragmentation qu'on retire au premier terme. À manque total égal
  // (cas fréquent, le manque total étant quasi invariant au découpage), c'est
  // ce terme qui départage — et `1/5 < 1/6` ferait à nouveau préférer six
  // petites tables à cinq. Mesuré : 31 participants / 12 anciens.
  const score = absolute
    ? [
        -sumShort1Unmoderated,                         // règle 1 (actifs) — sans modérateur d'abord
        -sumShort1, -fail1, Math.min(minMargin1, 0),   //   puis partout
        -unmoderatedPassives, shape.moderatedCount,    // règle 2 (passifs encadrés, chantier 91)
        r2main,                                        // règle 3 (enregistrable)
        -fail3 / T_, het,                              // règle 4 (hétérogénéité)
        -sumShort4, -fail4, Math.min(minMargin4, 0),   // règle 5 (anciens)
        newcomersModerated,                            // règle 6 (nouveaux encadrés)
      ]
    : [
        -sumShort1Unmoderated,                  // règle 1 — sans modérateur d'abord
        -fail1 / T_, Math.min(minMargin1, 0),   //   puis partout
        -unmoderatedPassives, shape.moderatedCount,  // règle 2 (passifs encadrés, chantier 91)
        r2main,                                 // règle 3 (garantie ; le surplus de
                                                //   tables propres est « sans priorité »
                                                //   → volontairement hors du vecteur)
        -fail3 / T_, het,                       // règle 4
        -fail4 / T_, Math.min(minMargin4, 0),   // règle 5
        newcomersModerated,                     // règle 6
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

  // Chantier 91 : un serpentin par statut, dans les places que la forme lui réserve.
  const serpentine = (members: number[], capacity: number[]) => {
    const remaining = [...capacity]
    let t = 0
    let dir = 1
    for (const i of members) {
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
        t = Math.max(0, remaining.findIndex(r => r > 0))
      }
      assign[i] = t
      remaining[t] -= 1
      t += dir
      if (t >= T) { t = T - 1; dir = -1 }
      else if (t < 0) { t = 0; dir = 1 }
    }
  }
  serpentine(order.filter(i => prep.active[i]), shape.activeSizes)
  serpentine(order.filter(i => !prep.active[i]), shape.passiveSizes)
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
  strategy: AllocationStrategy = STRATEGY_LEGACY,
  seedAssign?: Int32Array,
): { assign: Int32Array; evaluation: Evaluation } {
  const T = shape.sizes.length
  const metric = strategy.shortfallMetric
  const assign = seedAssign ?? initialAssignment(shape, prep, order)
  const ctr = buildCounters(assign, prep, T)
  let current = evaluate(shape, ctr, prep, opinionsAvailable, recorderTarget, metric)

  if (T < 2) return { assign, evaluation: current }

  /** Tente l'échange i↔j ; le conserve s'il améliore. */
  const trySwap = (i: number, j: number): boolean => {
    const ti = assign[i]
    const tj = assign[j]
    if (ti === tj) return false
    // Chantier 91 : la forme fixe les places actives et passives de chaque
    // table — seul un échange de même statut la respecte.
    if (prep.active[i] !== prep.active[j]) return false
    // Deux membres indiscernables : l'échange ne change rien.
    if (prep.active[i] === prep.active[j] &&
        prep.consent[i] === prep.consent[j] &&
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
   * Chantier 29 — voisinage dirigé.
   *
   * Le vecteur lexicographique place le maximin d'hétérogénéité (règle 3) juste
   * **avant** la règle 4. Toute réparation d'un déficit d'anciens qui déplace
   * ne serait-ce qu'une personne d'un camp à l'autre dégrade potentiellement ce
   * maximin, et se fait donc refuser : la descente se fige sur un plateau alors
   * qu'une solution meilleure existe. On explore donc d'abord les échanges
   * **à camp constant**, structurellement neutres pour la règle 3, entre une
   * table en excédent et une table en déficit.
   */
  const repair = (attr: Uint8Array, threshold: (s: number, t: number) => number, campPreserving: boolean): boolean => {
    let improved = false
    const byTable: number[][] = Array.from({ length: T }, () => [])
    for (let i = 0; i < prep.n; i++) byTable[assign[i]].push(i)

    const surplus: number[] = []
    const deficit: number[] = []
    for (let t = 0; t < T; t++) {
      let have = 0
      for (const i of byTable[t]) have += attr[i]
      const margin = have - threshold(shape.sizes[t], t)
      if (margin > 0) surplus.push(t)
      else if (margin < 0) deficit.push(t)
    }

    for (const t of deficit) {
      for (const u of surplus) {
        if (budget.left <= 0) return improved
        for (const i of byTable[u]) {
          if (!attr[i]) continue
          for (const j of byTable[t]) {
            if (attr[j]) continue
            if (prep.active[i] !== prep.active[j]) continue
            if (campPreserving && prep.camp[i] !== prep.camp[j]) continue
            if (trySwap(i, j)) { improved = true }
            if (budget.left <= 0) return improved
          }
        }
      }
    }
    return improved
  }

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let improved = false

    if (strategy.targetedNeighborhood) {
      // Camp constant d'abord. Les actifs ne se réparent plus ici : leur
      // nombre par table est fixé par la forme (chantier 91).
      for (const preserve of [true, false]) {
        if (repair(prep.veteran, (s, t) => resolvedVeteranThreshold(s, t < shape.moderatedCount), preserve)) improved = true
      }
    }

    for (let i = 0; i < prep.n && budget.left > 0; i++) {
      for (let j = i + 1; j < prep.n; j++) {
        if (budget.left <= 0) break
        if (trySwap(i, j)) improved = true
      }
    }

    if (!improved) break
  }

  return { assign, evaluation: current }
}

// ── Diagnostics ──────────────────────────────────────────────

/**
 * `moderatedAt` découple « table modérée » de la convention interne
 * `t < shape.moderatedCount` (vraie pendant la recherche, où les tables
 * modérées sont toujours le préfixe) : `diagnoseAllocation` retouche des
 * tables dans un ordre arbitraire après glisser-déposer et doit pouvoir
 * indiquer le vrai statut de chacune indépendamment de sa position.
 */
function buildDiagnostics(
  shape: Shape,
  assign: Int32Array,
  prep: Prepared,
  opinionsAvailable: boolean,
  moderatedAt: (t: number) => boolean = (t) => t < shape.moderatedCount,
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
    const moderated = moderatedAt(t)
    const thr1 = resolvedActiveThreshold(size, moderated)
    const thr4 = resolvedVeteranThreshold(size, moderated)
    const nonHomogeneous = opinionsAvailable ? (total > 0 && first < total) : true

    out.push({
      table_number: t + 1,
      size,
      moderated,
      actives: ctr.actives[t],
      actives_threshold: thr1,
      rule1_ok: ctr.actives[t] >= thr1,
      passives: size - ctr.actives[t],
      passives_ok: moderated || size === ctr.actives[t],
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
  strategy: AllocationStrategy = STRATEGY_LEGACY,
): SolveOutcome {
  const prep = prepare(members)
  const n = prep.n
  const metric = strategy.shortfallMetric

  // ── Cas N ≤ 10 : table unique, aucune règle appliquée (§4) ──
  if (n <= SINGLE_TABLE_MAX) {
    const shape = makeShape([prep.totalActive], [n - prep.totalActive], moderatorCapacity > 0 ? 1 : 0)
    const assign = new Int32Array(n) // tous en table 0
    return {
      prep, shape, assign,
      score: evaluate(shape, buildCounters(assign, prep, 1), prep, opinionsAvailable, recorderTarget, metric).score,
      overflowUsed: false, overflowNote: null, singleTable: true,
    }
  }

  // Plafond global — garde-fou de latence dans le navigateur du superadmin.
  // En mode `'fair'` il reste du même ordre qu'en historique : ce qui change
  // n'est pas la quantité de calcul, c'est sa **répartition** entre les formes.
  const budget: Budget = {
    left: typeof strategy.perShapeBudget === 'number'
      ? Math.max(MAX_EVALUATIONS, strategy.perShapeBudget * 30)
      : MAX_EVALUATIONS,
  }
  const baseOrder = sortedOrder(prep)

  function searchOver(shapes: Shape[]): { shape: Shape; assign: Int32Array; evaluation: Evaluation } | null {
    let best: { shape: Shape; assign: Int32Array; evaluation: Evaluation } | null = null
    let shapesLeft = shapes.length
    for (const shape of shapes) {
      const remainingShapes = shapesLeft--
      // Élagage : optimum théorique déjà battu → forme ignorée, budget préservé
      // pour les formes qui peuvent encore gagner.
      if (strategy.boundPruning && best) {
        const bound = shapeBound(shape, prep, opinionsAvailable, recorderTarget, metric)
        if (boundIsDominated(bound, best.evaluation.score)) continue
      }
      // Part équitable : chaque forme reçoit `restant / formes restantes`. Une
      // forme qui converge avant d'épuiser sa part rend le solde aux suivantes,
      // et l'élagage ci-dessus en libère davantage encore. Le budget total est
      // donc borné comme avant, mais aucune forme n'est affamée par sa seule
      // position dans l'énumération.
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
        } else if (r > 0) {
          order = shuffled(baseOrder, mulberry32(seed + r * 7919 + shape.sizes.length))
        }
        const res = localSearch(
          shape, prep, opinionsAvailable, recorderTarget, order, shapeBudget, strategy, seedAssign,
        )
        if (!best) { best = { shape, assign: res.assign, evaluation: res.evaluation }; continue }
        const cmp = compareEval(res.evaluation, best.evaluation)
        if (cmp > 0) { best = { shape, assign: res.assign, evaluation: res.evaluation }; continue }
        if (cmp === 0 && compareArraysDesc(shapePreference(shape), shapePreference(best.shape)) > 0) {
          best = { shape, assign: res.assign, evaluation: res.evaluation }
        }
      }
      // Décompte du plafond global une fois la forme traitée.
      if (strategy.perShapeBudget !== null) budget.left -= shapeStart - shapeBudget.left
    }
    return best
  }

  // 1re passe : au plus TABLE_MAX_ACTIVE actifs par table animée (contrainte dure nominale)
  let best = searchOver(enumerateShapes(prep, moderatorCapacity, TABLE_MAX_ACTIVE))
  let overflowUsed = false
  let overflowNote: string | null = null

  // 2e passe : dépassement jusqu'à 20 actifs — toléré **uniquement** si cela améliore
  // strictement la règle 1 (deux premières composantes du vecteur). §4.
  // Les deux premières composantes du vecteur portent la règle 1.
  const rule1 = (score: number[]) => score.slice(0, 2)
  if (best && (best.evaluation.score[0] < 0 || best.evaluation.score[1] < 0) && budget.left > 0) {
    const overflowShapes = enumerateShapes(prep, moderatorCapacity, TABLE_OVERFLOW_MAX)
      .filter(s => Math.max(...s.activeSizes) > TABLE_MAX_ACTIVE)
    const alt = searchOver(overflowShapes)
    if (alt && compareArraysDesc(rule1(alt.evaluation.score), rule1(best.evaluation.score)) > 0) {
      best = alt
      overflowUsed = true
      overflowNote =
        `Des tables dépassent ${TABLE_MAX_ACTIVE} actifs (jusqu'à ${Math.max(...alt.shape.activeSizes)}) : ` +
        `c'était la seule façon de satisfaire la règle 1 (assez de participants actifs par table).`
    }
  }

  if (!best) {
    // Rare depuis le resserrement des tables sans modérateur à [4, 6] :
    // un reliquat non modéré qui ne se découpe en aucune combinaison de
    // tables de 4 à 6 (ex. un reste de 7 avec 0 modérateur) peut ne trouver
    // aucune forme valide pour un `n` donné. L'algorithme ne doit jamais
    // échouer pour autant : repli sur une table unique, quelle que soit sa
    // taille, avec avertissement.
    const shape = makeShape([prep.totalActive], [n - prep.totalActive], moderatorCapacity > 0 ? 1 : 0)
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
  const strategy = input.strategy ?? STRATEGY_ABSOLUTE_STRONG
  const warnings: string[] = []

  const allModeratorIds = [...input.moderatorIds]
  const extras = Math.max(0, input.extraModerators ?? 0)
  const moderatorCapacity = allModeratorIds.length + extras
  const opinionsAvailable = input.opinionsAvailable
  const recorderTarget = Math.max(1, input.recorderCount ?? 1)

  if (!opinionsAvailable) {
    warnings.push(
      "Analyse des camps d'opinion indisponible : la règle 4 (hétérogénéité) est désactivée. " +
      "L'allocation est faite sur les seules règles 1, 2, 3, 5 et 6.",
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

  // ── Surplus de modérateurs (chantier 25b / H17) ──
  // Un modérateur qui n'anime aucune table redevient un participant ordinaire.
  // Il est alors soumis aux règles 1 à 5 **comme n'importe quel autre
  // participant** : il entre dans la population passée à la recherche, pas
  // dans une table choisie après coup.
  //
  // La difficulté est que le problème est circulaire : la population dépend du
  // nombre de modérateurs en surplus, qui dépend du nombre de tables, qui
  // dépend de la population. On le lève en **énumérant** le nombre `k` de
  // modérateurs qui animent réellement, au lieu d'itérer vers un point fixe
  // (l'itération naïve diverge : elle transformait `[10, 10, 10]` en 6 tables).
  //
  // Un candidat `k` est **cohérent** si la répartition qu'il produit compte au
  // moins `k` tables — sinon un animateur se retrouverait sans table, ce qui
  // est exactement le bug qu'on corrige. On part de `k = M` (aucun surplus,
  // cas courant : une seule recherche, coût inchangé) et, tant que le candidat
  // est incohérent, on redescend `k` au nombre de tables effectivement produit.
  // `k` décroît strictement à chaque tour, la boucle termine ; `k = 0` est
  // toujours cohérent. On retient le plus grand `k` cohérent, c'est-à-dire le
  // maximum de tables animées — conforme au §4.
  const M = allModeratorIds.length
  let k = M
  let solved = solveFor(members, k + extras, opinionsAvailable, recorderTarget, seed, strategy)
  for (let guard = 0; guard <= M && k > solved.shape.sizes.length; guard++) {
    k = solved.shape.sizes.length
    const pool = [...members, ...allModeratorIds.slice(k).map(seatProfile)]
    solved = solveFor(pool, k + extras, opinionsAvailable, recorderTarget, seed, strategy)
  }

  const { prep, shape, assign, score, overflowUsed, overflowNote, singleTable } = solved
  const T = shape.sizes.length
  const animatingIds       = allModeratorIds.slice(0, Math.min(k, shape.moderatedCount))
  const seatedModeratorIds = allModeratorIds.slice(k)

  // Avertissements sur la population initiale (hors modérateurs assis).
  const seatedPop = prep.n
  if (opinionsAvailable && prep.campCount < 2) {
    warnings.push(
      "Un seul camp d'opinion détecté : la règle 4 ne peut pas être satisfaite (aucune table ne peut être hétérogène).",
    )
  }
  const activeShort = singleTable ? { unmoderated: 0, total: 0, fails: 0 } : shapeActiveShortfall(shape)
  if (activeShort.fails > 0) {
    warnings.push(
      `Pas assez de participants actifs (${prep.totalActive} sur ${seatedPop}) : ${activeShort.fails} table(s) ` +
      `n'atteignent pas 3/5 d'actifs, il manque ${activeShort.total} actif(s) au total (règle 1). ` +
      `L'algorithme réduit ce manque autant que possible.`,
    )
  }
  const unmoderatedPassives = singleTable ? 0 : shapeUnmoderatedPassives(shape)
  if (unmoderatedPassives > 0) {
    warnings.push(
      `${unmoderatedPassives} participant(s) passif(s) placé(s) à une table sans modérateur (règle 2) : ` +
      `les tables animées ne pouvaient pas tous les accueillir sans manquer d'actifs.`,
    )
  }
  const veteranShare = prep.veteran.reduce((s, v) => s + v, 0) / seatedPop
  if (veteranShare < 0.4) {
    warnings.push(
      `${Math.round(veteranShare * 100)} % d'anciens (< 40 %) : la règle 5 sera partiellement dégradée.`,
    )
  }
  if (singleTable && seatedPop <= SINGLE_TABLE_MAX) {
    warnings.unshift(`${seatedPop} participants (≤ ${SINGLE_TABLE_MAX}) : une table unique, pas d'allocation.`)
  }
  if (overflowNote) warnings.push(overflowNote)

  const memberIdsByTable: string[][] = Array.from({ length: T }, () => [])
  for (let i = 0; i < prep.n; i++) memberIdsByTable[assign[i]].push(prep.ids[i])

  // Répartition des modérateurs : un par table modérée, dans l'ordre.
  // Les modérateurs en surplus ne sont PAS traités ici : ils font déjà partie
  // de la population répartie par la recherche, donc de `memberIdsByTable`.
  const moderatorsByTable: string[][] = Array.from({ length: T }, () => [])
  animatingIds.forEach((mid, idx) => { moderatorsByTable[idx].push(mid) })

  // ── Retours explicites au superadmin (chantier 25 / H13, H15, H17) ──
  if (seatedModeratorIds.length > 0) {
    warnings.push(
      `${seatedModeratorIds.length} modérateur(s) de plus que de tables animées : ils ont été répartis comme ` +
      `des participants ordinaires, en tenant compte de leurs réponses d'onboarding et de leur camp ` +
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
      `Objectif de ${recorderTarget} tables enregistrables (règle 3, prioritaire sur le dimensionnement) : ` +
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
    // `shape`/`assign`/`prep` décrivent la population complète, modérateurs en
    // surplus compris (ils ont été réintégrés en amont de la recherche) : les
    // diagnostics directs sont exacts, sans recalcul.
    diagnostics: buildDiagnostics(shape, assign, prep, opinionsAvailable),
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
  const sizes = ordered.map((_, tIdx) => assignList.filter(a => a === tIdx).length)
  const activeSizes = ordered.map((_, tIdx) => assignList.filter((a, k) => a === tIdx && prep.active[k]).length)
  const shape: Shape = {
    sizes,
    activeSizes,
    passiveSizes: sizes.map((s, t) => s - activeSizes[t]),
    // Les tables modérées ne sont pas forcément les premières après retouche —
    // `moderatedCount` (convention « préfixe ») ne peut donc pas s'appliquer
    // ici. `moderatedAt` ci-dessous donne le vrai statut table par table
    // (utilisé pour le seuil d'anciens resserré des tables sans modérateur).
    moderatedCount: 0,
  }
  const diags = buildDiagnostics(
    shape, Int32Array.from(assignList), prep, opinionsAvailable,
    (tIdx) => ordered[tIdx].moderated,
  )
  return diags.map((d, tIdx) => ({
    ...d,
    table_number: ordered[tIdx].table_number,
  }))
}
