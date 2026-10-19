// =============================================================
// Chantier 170 — Extraction des données pré-débat (superadmin, séance clôturée)
//
// Construit un fichier JSON destiné à la page de restitution de
// `transcription-debat/` (menu « Synthèse pré-débat », restée en blocs à
// compléter) et, plus largement, à une IA chargée d'en faire un rendu :
//   - les 3 assertions les plus consensuelles du vote d'avant débat ;
//   - les 3 plus dissensuelles ;
//   - la carte 2D des camps d'opinion (points anonymes) ;
//   - la description chiffrée de chaque camp.
//
// Fonctions pures, aucune I/O : l'appelant charge les votes « avant débat »
// (`loadVotesForAnalysis(..., 'pre_closure')`) et l'analyse des camps
// (`runOpinionAnalysis`), puis passe le tout ici.
//
// Anonymat : aucun pseudo ni identifiant de membre ne sort. Les points de la
// carte ne portent que leurs coordonnées et leur camp, triés par camp puis par
// position (l'ordre ne trahit pas l'ordre d'inscription).
// =============================================================

import type { AnalysisResult, VoteRow, LoadedAnalysis } from './analysis'
import { pairGroups } from './analysis'
import type { GroupNameResult } from './types'

export const PRE_DEBATE_FORMAT = 'ecclesia.pre_debat.v1'
export const TOP_N = 3
/** Au moins N votes pour/contre (tous camps confondus) pour qu'une assertion soit classée. */
export const MIN_DECIDED_VOTES = 3
/** Au moins N votes pour/contre d'un camp pour que sa part compte dans un calcul par camp. */
export const MIN_CAMP_VOTES = 2
// Mêmes couleurs que les camps de l'appli (AnalysisPanel, ResultsMapScreen).
const CAMP_COLORS = ['#2b4a86', '#b04a3c', '#3f8462', '#c8742a', '#6b4c8a']

export interface CampShare {
  camp:      number          // 1-indexé, comme `group_names[].table_number`
  pour:      number
  contre:    number
  part_pour: number | null   // pour / (pour + contre), null si moins de MIN_CAMP_VOTES
}

export interface RankedAssertion {
  rang:          number
  enonce:        string
  sens?:         'adhesion' | 'rejet'
  score:         number
  pour:          number
  contre:        number
  abstention:    number
  blanc:         number
  part_pour:     number
  par_camp:      CampShare[]
}

export interface PreDebateCamp {
  camp:        number
  couleur:     string
  taille:      number
  part:        number   // part des votants placés sur la carte
  centre:      { x: number; y: number }
  nom_ia?:          string
  description_ia?:  string
  enonces_caracteristiques: {
    enonce:          string
    sens:            'pour' | 'contre'
    part_pour_camp:  number
    part_pour_reste: number
  }[]
}

export interface PreDebateExport {
  format:        typeof PRE_DEBATE_FORMAT
  lisez_moi:     string[]
  seance:        { titre: string; date_seance: string | null; exporte_le: string; votes: string }
  participation: { votants_places: number; assertions_approuvees: number; assertions_analysees: number; votes: number }
  consensus:     RankedAssertion[]
  dissensus:     RankedAssertion[]
  camps:         PreDebateCamp[]
  carte: {
    axes:               string
    variance_expliquee: [number, number]
    points:             { x: number; y: number; camp: number }[]
  }
}

export interface PreDebateInput {
  title:          string
  sessionDate:    string | null
  exportedAt:     string
  votes:          VoteRow[]
  /** Assertions approuvées : id → texte. */
  assertions:     Map<string, string>
  analysis:       AnalysisResult
  /** Dernière analyse enregistrée et noms Gemini qui lui correspondent (facultatifs). */
  latestAnalysis?: LoadedAnalysis | null
  groupNames?:     GroupNameResult[]
}

const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d

interface Tally { pour: number; contre: number; abstention: number; blanc: number }
const emptyTally = (): Tally => ({ pour: 0, contre: 0, abstention: 0, blanc: 0 })

function addVote(t: Tally, vote: VoteRow['vote']) {
  if (vote === 'agree') t.pour++
  else if (vote === 'disagree') t.contre++
  else if (vote === 'pass') t.abstention++
  else t.blanc++
}

const share = (t: { pour: number; contre: number }, min: number) =>
  t.pour + t.contre >= min ? t.pour / (t.pour + t.contre) : null

/**
 * Noms Gemini : ils ont été donnés aux camps de la DERNIÈRE analyse enregistrée.
 * Ils ne valent pour les camps calculés ici que si les deux partitions sont
 * identiques (mêmes personnes dans chaque camp, numéros éventuellement
 * permutés). Sinon on n'invente pas de correspondance : pas de nom.
 * Renvoie camp calculé (0-indexé) → nom.
 */
export function matchGroupNames(
  analysis: AnalysisResult,
  latest: LoadedAnalysis | null | undefined,
  names: GroupNameResult[] | undefined,
): Map<number, GroupNameResult> {
  const out = new Map<number, GroupNameResult>()
  if (!latest || !names?.length) return out
  const mine: LoadedAnalysis = {
    id: 'export', k_chosen: analysis.kChosen, silhouette_score: analysis.silhouette,
    pca_variance_explained: analysis.pcaVariance, repness: analysis.repness,
    group_consensus: analysis.groupConsensus, created_at: '', vote_scope: 'pre_closure',
    members: analysis.members,
  }
  if (latest.members.length !== mine.members.length) return out
  const pairs = pairGroups(mine, latest)
  const identical = pairs.every(p => p.bGroupId !== null && p.overlapCount === p.aSize && p.aSize === p.bSize)
  if (!identical || new Set(latest.members.map(m => m.group_id)).size !== pairs.length) return out
  for (const p of pairs) {
    const n = names.find(g => g.table_number === (p.bGroupId as number) + 1)
    if (n) out.set(p.aGroupId, n)
  }
  return out
}

export function buildPreDebateExport(input: PreDebateInput): PreDebateExport {
  const { analysis, assertions } = input
  const campOf = new Map(analysis.members.map(m => [m.member_id, m.group_id]))
  const campIds = [...new Set(analysis.members.map(m => m.group_id))].sort((a, b) => a - b)

  // Décomptes par assertion, globaux et par camp (seuls les votants placés comptent par camp)
  const global = new Map<string, Tally>()
  const perCamp = new Map<string, Map<number, Tally>>()
  let nVotes = 0
  for (const v of input.votes) {
    if (!assertions.has(v.assertion_id)) continue
    nVotes++
    if (!global.has(v.assertion_id)) global.set(v.assertion_id, emptyTally())
    addVote(global.get(v.assertion_id)!, v.vote)
    const c = campOf.get(v.member_id)
    if (c === undefined) continue
    if (!perCamp.has(v.assertion_id)) perCamp.set(v.assertion_id, new Map())
    const m = perCamp.get(v.assertion_id)!
    if (!m.has(c)) m.set(c, emptyTally())
    addVote(m.get(c)!, v.vote)
  }

  const rows = [...global.entries()]
    .filter(([, t]) => t.pour + t.contre >= MIN_DECIDED_VOTES)
    .map(([aid, t]) => {
      const camps = campIds.map(c => {
        const ct = perCamp.get(aid)?.get(c) ?? emptyTally()
        const s = share(ct, MIN_CAMP_VOTES)
        return { camp: c + 1, pour: ct.pour, contre: ct.contre, part_pour: s === null ? null : round(s) }
      })
      const known = camps.map(c => c.part_pour).filter((s): s is number => s !== null)
      return { aid, t, camps, known }
    })

  const base = (r: (typeof rows)[number]) => ({
    enonce: assertions.get(r.aid)!, pour: r.t.pour, contre: r.t.contre, abstention: r.t.abstention,
    blanc: r.t.blanc, part_pour: round(r.t.pour / (r.t.pour + r.t.contre)), par_camp: r.camps,
  })

  // Consensus : la part d'accord (ou de rejet) du camp le MOINS convaincu — une
  // assertion n'est consensuelle que si chaque camp la soutient (ou la rejette).
  // Tous les camps doivent avoir assez de votes : sinon un camp muet ferait un faux consensus.
  const consensus = rows
    .filter(r => r.known.length === campIds.length && campIds.length > 0)
    .map(r => {
      const adh = Math.min(...r.known), rej = Math.min(...r.known.map(s => 1 - s))
      return { r, sens: adh >= rej ? 'adhesion' as const : 'rejet' as const, score: Math.max(adh, rej) }
    })
    .sort((a, b) => b.score - a.score || (b.r.t.pour + b.r.t.contre) - (a.r.t.pour + a.r.t.contre))
    .slice(0, TOP_N)
    .map((x, i) => ({ rang: i + 1, ...base(x.r), sens: x.sens, score: round(x.score) }))

  // Dissensus : l'écart d'accord entre le camp le plus pour et le camp le plus contre.
  const dissensus = rows
    .filter(r => r.known.length >= 2)
    .map(r => ({ r, score: Math.max(...r.known) - Math.min(...r.known) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.r.t.pour + b.r.t.contre) - (a.r.t.pour + a.r.t.contre))
    .slice(0, TOP_N)
    .map((x, i) => ({ rang: i + 1, ...base(x.r), score: round(x.score) }))

  // Camps : taille, centre, énoncés qui les distinguent le plus du reste des votants
  const names = matchGroupNames(analysis, input.latestAnalysis, input.groupNames)
  const total = analysis.members.length
  const camps: PreDebateCamp[] = campIds.map(c => {
    const pts = analysis.members.filter(m => m.group_id === c)
    const carac = rows.map(r => {
      const inT = perCamp.get(r.aid)?.get(c) ?? emptyTally()
      const out = { pour: r.camps.filter(x => x.camp !== c + 1).reduce((s, x) => s + x.pour, 0),
                    contre: r.camps.filter(x => x.camp !== c + 1).reduce((s, x) => s + x.contre, 0) }
      const sIn = share(inT, MIN_CAMP_VOTES), sOut = share(out, MIN_CAMP_VOTES)
      return sIn === null || sOut === null ? null : { aid: r.aid, sIn, sOut, gap: sIn - sOut }
    }).filter((x): x is NonNullable<typeof x> => x !== null && x.gap !== 0)
      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
      .slice(0, TOP_N)
      .map(x => ({ enonce: assertions.get(x.aid)!, sens: x.gap > 0 ? 'pour' as const : 'contre' as const,
                   part_pour_camp: round(x.sIn), part_pour_reste: round(x.sOut) }))
    const n = names.get(c)
    return {
      camp: c + 1, couleur: CAMP_COLORS[c % CAMP_COLORS.length], taille: pts.length,
      part: round(pts.length / total),
      centre: { x: round(pts.reduce((s, p) => s + p.pca_x, 0) / pts.length),
                y: round(pts.reduce((s, p) => s + p.pca_y, 0) / pts.length) },
      ...(n ? { nom_ia: n.name, description_ia: n.description } : {}),
      enonces_caracteristiques: carac,
    }
  })

  const points = analysis.members
    .map(m => ({ x: round(m.pca_x), y: round(m.pca_y), camp: m.group_id + 1 }))
    .sort((a, b) => a.camp - b.camp || a.x - b.x || a.y - b.y)

  return {
    format: PRE_DEBATE_FORMAT,
    lisez_moi: [
      "Données du vote d'AVANT le débat (pré-vote à distance et vote en présentiel), reconstituées telles qu'elles étaient avant tout revote du post-débat.",
      "Parts (part_pour, part_pour_camp…) entre 0 et 1 : pour / (pour + contre). Abstentions et votes blancs sont comptés à part et n'entrent pas dans les parts.",
      `consensus : les ${TOP_N} assertions que chaque camp soutient (sens = adhesion) ou rejette (sens = rejet) le plus ; score = part du camp le moins convaincu. Une assertion n'est classée que si chaque camp a au moins ${MIN_CAMP_VOTES} votes pour ou contre.`,
      `dissensus : les ${TOP_N} assertions qui opposent le plus les camps ; score = écart de part_pour entre le camp le plus pour et le camp le plus contre.`,
      `Seules les assertions avec au moins ${MIN_DECIDED_VOTES} votes pour ou contre sont classées.`,
      "camps : groupes d'opinion calculés sur les votes (analyse en composantes principales puis k-means, comme l'onglet Analyse). enonces_caracteristiques = ce qui distingue le plus le camp du reste des votants. nom_ia et description_ia ne sont présents que si les camps sont exactement ceux nommés par l'IA dans l'appli.",
      "carte : un point par votant placé, anonyme. x et y sont les deux premières composantes principales des votes : les axes n'ont pas de libellé, seules les distances et les regroupements ont un sens.",
      "Aucun nom ni identifiant de participant n'est inclus.",
    ],
    seance: { titre: input.title, date_seance: input.sessionDate, exporte_le: input.exportedAt, votes: 'avant débat (pre_closure)' },
    participation: { votants_places: total, assertions_approuvees: assertions.size, assertions_analysees: rows.length, votes: nVotes },
    consensus,
    dissensus,
    camps,
    carte: {
      axes: 'composantes principales 1 (x) et 2 (y) des votes, sans unité',
      variance_expliquee: [round(analysis.pcaVariance[0]), round(analysis.pcaVariance[1])],
      points,
    },
  }
}
