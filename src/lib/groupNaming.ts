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

import { nameSingleGroup } from './gemini'
import { recordAiUsage } from './aiUsage'
import type { GroupNameResult } from './types'

// ── Types ─────────────────────────────────────────────────────

export interface NamingGroup {
  table_number: number
  member_ids:   string[]
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
    divisive_assertions: divisiveAssertions,
  }

  const allNames: GroupNameResult[] = []
  let totalTokens = 0
  let geminiCount = 0

  for (const g of groups) {
    let named: GroupNameResult | null = null
    for (let attempt = 0; attempt < 2 && !named; attempt++) {
      try {
        const { result, tokens_used } = await nameSingleGroup({
          ...commonPayload,
          target_table_number: g.table_number,
        })
        named = result
        totalTokens += tokens_used
        geminiCount += 1
      } catch {
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

  if (geminiCount > 0) {
    recordAiUsage(sessionId, 'name_groups', `${geminiCount} camp(s) nommé(s) par IA`, totalTokens)
  }

  return allNames.sort((a, b) => a.table_number - b.table_number)
}
