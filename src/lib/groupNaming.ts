// =============================================================
// groupNaming — Orchestration du nommage des camps (Gemini)
//
// Centralise la logique auparavant inline dans SuperadminScreen :
//   - appel séquentiel nameSingleGroup (1 par groupe, retry ×2)
//   - fallback DESCRIPTIF basé sur les votes réels du groupe quand
//     Gemini échoue ou retourne un nom générique "Groupe N" (bug A1)
//   - comptabilisation des tokens consommés (C6) via recordAiUsage
//
// Réutilisé par le nommage en phase `allocating` (groupes issus des
// table_assignments) ET par le nommage systématique après analyse en
// phase `voting`/`pre_voting` (groupes issus des clusters k-means) — E3.
// =============================================================

import { nameSingleGroup, GenericNameError } from './gemini'
import { recordAiUsage } from './aiUsage'
import type { GroupNameResult } from './types'
import type { AiUsageDetail } from './aiUsage'

// ── Types ─────────────────────────────────────────────────────

/**
 * ⚠️ INVARIANT (chantier 28 / H26) — `table_number` désigne TOUJOURS un
 * **camp d'opinion** (cluster k-means), soit `analysis_members.group_id + 1`.
 * Ce n'est JAMAIS un numéro de table physique (`table_assignments.table_number`).
 *
 * Sous l'allocation v2 (chantier 19) une table physique est volontairement
 * hétérogène : elle mélange plusieurs camps. Nommer une table physique n'a donc
 * aucun sens, et écrire un tel nommage dans `sessions.group_names` écrasait le
 * référentiel des camps par un jeu incomplet (autant d'entrées que de tables,
 * pas de camps) → les camps au-delà du nombre de tables devenaient anonymes sur
 * l'écran de résultats, qui indexe par `group_id + 1`.
 *
 * Tous les lecteurs de `group_names` (ResultsMapScreen, AnalysisPanel,
 * get_table_opinion_summary) indexent par `group_id + 1` — ne pas déroger.
 */
export interface NamingGroup {
  table_number: number
  member_ids:   string[]
}

/**
 * Dérive les groupes à nommer depuis les membres d'une analyse k-means.
 * Seule façon autorisée de construire un `NamingGroup[]` (cf. invariant ci-dessus).
 */
export function namingGroupsFromAnalysis(
  members: { member_id: string; group_id: number }[],
): NamingGroup[] {
  const byGroup = new Map<number, string[]>()
  for (const m of members) {
    const tn = m.group_id + 1
    if (!byGroup.has(tn)) byGroup.set(tn, [])
    byGroup.get(tn)!.push(m.member_id)
  }
  return [...byGroup.entries()]
    .map(([table_number, member_ids]) => ({ table_number, member_ids }))
    .sort((a, b) => a.table_number - b.table_number)
}

export interface NamingVote {
  member_id:    string
  assertion_id: string
  vote:         'agree' | 'disagree' | 'pass'
}

export interface NamingAssertion {
  id:      string
  content: string
}

// ── Empreinte des groupes ─────────────────────────────────────
/**
 * Empreinte stable de la composition des groupes (indépendante de l'ordre).
 * Sert à ne rappeler Gemini que si la répartition a réellement changé.
 */
export function groupsFingerprint(groups: NamingGroup[]): string {
  return JSON.stringify(
    groups
      .map(g => ({ t: g.table_number, m: [...g.member_ids].sort() }))
      .sort((a, b) => a.t - b.t),
  )
}

// ── Fallback descriptif (fix A1) ──────────────────────────────

function truncateWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/)
  if (words.length <= maxWords) return text.trim()
  return words.slice(0, maxWords).join(' ') + '…'
}

/**
 * Construit un nom de camp DESCRIPTIF à partir des votes réels du groupe,
 * utilisé quand Gemini échoue ou retourne un identifiant technique "Groupe N".
 * On choisit l'assertion sur laquelle le groupe est le plus tranché
 * (max |agree − disagree|) et on en dérive une étiquette de position.
 * Ne retourne JAMAIS "Groupe N" — c'est précisément le symptôme de A1.
 */
export function deriveFallbackName(
  memberIds:  string[],
  votes:      NamingVote[],
  assertions: NamingAssertion[],
): { name: string; description: string } {
  const memberSet = new Set(memberIds)

  let bestAid = ''
  let bestNet = 0
  for (const a of assertions) {
    let agree = 0
    let disagree = 0
    for (const v of votes) {
      if (v.assertion_id !== a.id || !memberSet.has(v.member_id)) continue
      if (v.vote === 'agree') agree++
      else if (v.vote === 'disagree') disagree++
    }
    const net = agree - disagree
    if (Math.abs(net) > Math.abs(bestNet)) {
      bestNet = net
      bestAid = a.id
    }
  }

  if (!bestAid || bestNet === 0) {
    return {
      name:        'Camp peu tranché',
      description:
        "Nom généré automatiquement : les votes de ce camp ne dégagent pas de position distinctive nette.",
    }
  }

  const content = assertions.find(a => a.id === bestAid)?.content ?? ''
  const snippet = truncateWords(content, 6)
  const favorable = bestNet > 0
  return {
    name: `${favorable ? 'Plutôt pour' : 'Plutôt contre'} : « ${snippet} »`,
    description:
      `Nom généré automatiquement à partir des votes (l'IA n'a pas fourni de nom exploitable). ` +
      `Ce camp se distingue surtout par sa position ${favorable ? 'favorable' : 'défavorable'} sur : « ${content} ».`,
  }
}

// ── Assertions discriminantes (H9) ────────────────────────────

const VOTE_VALUE: Record<NamingVote['vote'], number> = { agree: 1, disagree: -1, pass: 0 }

/**
 * Assertions sur lesquelles un camp se démarque le plus du reste de la
 * population — proxy client du score `repness` de l'analyse.
 *
 * Sert à alimenter `divisive_assertions` du prompt Gemini : sans ça le modèle
 * reçoit le profil de vote complet de tous les camps et doit trouver seul ce
 * qui distingue sa cible. Quand les camps se ressemblent, il n'y arrive pas,
 * retourne un identifiant technique ("Camp A") et déclenche le repli
 * générique (H9). Lui pointer les 3 assertions les plus discriminantes lui
 * donne directement la matière du nom.
 *
 * Score = |moyenne_dans_le_camp − moyenne_hors_camp| × √(votes du camp) — la
 * pondération par l'effectif évite qu'une assertion votée par 1 seul membre
 * du camp remonte en tête.
 */
export function discriminatingAssertions(
  memberIds:  string[],
  votes:      NamingVote[],
  assertions: NamingAssertion[],
  topN = 3,
): NamingAssertion[] {
  const memberSet = new Set(memberIds)

  const scored = assertions.map(a => {
    let inSum = 0, inN = 0, outSum = 0, outN = 0
    for (const v of votes) {
      if (v.assertion_id !== a.id) continue
      if (memberSet.has(v.member_id)) { inSum += VOTE_VALUE[v.vote]; inN++ }
      else                            { outSum += VOTE_VALUE[v.vote]; outN++ }
    }
    if (inN === 0 || outN === 0) return { a, score: 0 }
    return { a, score: Math.abs(inSum / inN - outSum / outN) * Math.sqrt(inN) }
  })

  return scored
    .filter(s => s.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, topN)
    .map(s => s.a)
}

// ── Orchestration ─────────────────────────────────────────────

export interface GenerateGroupNamesParams {
  sessionId:          string
  sessionTitle:       string
  sessionDescription: string | null
  groups:             NamingGroup[]
  assertions:         NamingAssertion[]
  votes:              NamingVote[]
  divisiveAssertions?: NamingAssertion[]
}

/**
 * Nomme tous les groupes via Gemini (appels séquentiels + retry), avec
 * fallback descriptif basé sur les votes. Comptabilise les tokens (C6).
 * Retourne les noms triés par table_number. Ne persiste rien — c'est au
 * caller de sauvegarder (localStorage + DB) et de gérer l'empreinte.
 */
export async function generateGroupNames(
  params: GenerateGroupNamesParams,
): Promise<GroupNameResult[]> {
  const {
    sessionId, sessionTitle, sessionDescription,
    groups, assertions, votes, divisiveAssertions,
  } = params

  const commonPayload = {
    session_id:          sessionId,
    session_title:       sessionTitle,
    session_description: sessionDescription,
    assertions,
    votes,
    groups,
  }

  const allNames: GroupNameResult[] = []
  let geminiCount = 0
  // F21 : agrégat de TOUTES les tentatives (y compris rejetées par la regex
  // anti-générique) — ces tokens sont réellement consommés côté API et ne
  // doivent pas être jetés silencieusement au retry.
  const usageAgg: AiUsageDetail = {
    prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, thoughts_tokens: 0, model: '',
  }

  function addUsage(u: AiUsageDetail) {
    usageAgg.prompt_tokens     += u.prompt_tokens
    usageAgg.completion_tokens += u.completion_tokens
    usageAgg.total_tokens      += u.total_tokens
    usageAgg.thoughts_tokens   += u.thoughts_tokens
    if (u.model) usageAgg.model = u.model
  }

  for (const g of groups) {
    // H9 — assertions les plus discriminantes POUR CE CAMP (recalculées à
    // chaque itération : une liste globale ne dirait rien de spécifique).
    // Un override explicite via `divisiveAssertions` reste prioritaire.
    const divisive = divisiveAssertions ?? discriminatingAssertions(g.member_ids, votes, assertions)

    let named: GroupNameResult | null = null
    for (let attempt = 0; attempt < 2 && !named; attempt++) {
      try {
        const { result, usage } = await nameSingleGroup({
          ...commonPayload,
          divisive_assertions: divisive,
          target_table_number: g.table_number,
        })
        named = result
        addUsage(usage)
        geminiCount += 1
      } catch (e) {
        if (e instanceof GenericNameError) addUsage(e.usage)
        // retry silencieux (inclut le rejet des noms génériques "Groupe N")
      }
    }

    if (named) {
      allNames.push(named)
    } else {
      // Fallback descriptif (fix A1) — jamais "Groupe N"
      const { name, description } = deriveFallbackName(g.member_ids, votes, assertions)
      allNames.push({ table_number: g.table_number, name, description })
    }
  }

  if (usageAgg.total_tokens > 0) {
    recordAiUsage(sessionId, 'name_groups', `${geminiCount} camp(s) nommé(s) par IA`, usageAgg)
  }

  return allNames.sort((a, b) => a.table_number - b.table_number)
}
