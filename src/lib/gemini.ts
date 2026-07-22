// =============================================================
// Client Gemini — toutes les fonctions passent par l'Edge Function
// gemini-proxy. Jamais d'appel direct à api.google.com.
// =============================================================

import { supabase } from './supabase'
import { extractErr } from './utils'
import type { ModerationResult, MergeResult, GroupNameResult } from './types'

// ── Type de retour commun ─────────────────────────────────────

export interface GeminiResponse<T> {
  results: T[]
  tokens_used: number
}

function extractResponse<T>(data: unknown): GeminiResponse<T> {
  const d = data as { results: T[]; usage?: { total_tokens?: number } }
  return {
    results:     d.results,
    tokens_used: d.usage?.total_tokens ?? 0,
  }
}

// ── moderateAssertions ────────────────────────────────────────

export async function moderateAssertions(payload: {
  session_id: string
  session_title: string
  session_description: string | null
  assertions: { id: string; content: string }[]
}): Promise<GeminiResponse<ModerationResult>> {
  const { data, error } = await supabase.functions.invoke('gemini-proxy', {
    body: { action: 'moderate', payload },
  })
  if (error) throw new Error(extractErr(error))
  if (data?.error) throw new Error(data.error)
  return extractResponse<ModerationResult>(data)
}

// ── mergeAssertions ───────────────────────────────────────────

export async function mergeAssertions(payload: {
  session_id: string
  session_title: string
  session_description: string | null
  assertions: { id: string; content: string }[]
}): Promise<GeminiResponse<MergeResult>> {
  const { data, error } = await supabase.functions.invoke('gemini-proxy', {
    body: { action: 'merge', payload },
  })
  if (error) throw new Error(extractErr(error))
  if (data?.error) throw new Error(data.error)
  return extractResponse<MergeResult>(data)
}

// ── nameIdeologicalGroups ─────────────────────────────────────

export async function nameIdeologicalGroups(payload: {
  session_id: string
  session_title: string
  session_description: string | null
  groups: { table_number: number; member_ids: string[] }[]
  assertions: { id: string; content: string }[]
  votes: { member_id: string; assertion_id: string; vote: 'agree' | 'disagree' | 'pass' }[]
  divisive_assertions?: { id: string; content: string }[]
}): Promise<GeminiResponse<GroupNameResult>> {
  const { session_title, session_description, groups, assertions, votes, divisive_assertions } = payload

  // Transformer les données plates en profils agrégés par groupe
  // avant d'envoyer à l'Edge Function.
  const enrichedGroups = groups.map(group => ({
    table_number: group.table_number,
    member_count: group.member_ids.length,
    votes_by_assertion: assertions.map(assertion => {
      const assertionVotes = votes.filter(
        v => v.assertion_id === assertion.id && group.member_ids.includes(v.member_id)
      )
      return {
        assertion_id:      assertion.id,
        assertion_content: assertion.content,
        agree:    assertionVotes.filter(v => v.vote === 'agree').length,
        disagree: assertionVotes.filter(v => v.vote === 'disagree').length,
        pass:     assertionVotes.filter(v => v.vote === 'pass').length,
      }
    }),
  }))

  const edgePayload = {
    session_title,
    session_description,
    assertions,
    divisive_assertions,
    groups: enrichedGroups,
  }

  const { data, error } = await supabase.functions.invoke('gemini-proxy', {
    body: { action: 'name_groups', payload: edgePayload },
  })
  if (error) throw new Error(extractErr(error))
  if (data?.error) throw new Error(data.error)
  return extractResponse<GroupNameResult>(data)
}

// ── nameSingleGroup ───────────────────────────────────────────
// Nomme UN SEUL groupe en utilisant l'action name_single_group.
// Contrairement à nameIdeologicalGroups, la réponse edge est un objet
// unique { name, description } (pas un tableau) — élimine le bug
// où Gemini retourne moins d'entrées que demandé avec ≥3 groupes.

export async function nameSingleGroup(payload: {
  session_id: string
  session_title: string
  session_description: string | null
  target_table_number: number
  groups: { table_number: number; member_ids: string[] }[]
  assertions: { id: string; content: string }[]
  votes: { member_id: string; assertion_id: string; vote: 'agree' | 'disagree' | 'pass' }[]
  divisive_assertions?: { id: string; content: string }[]
}): Promise<{ result: GroupNameResult; tokens_used: number }> {
  const { session_title, session_description, target_table_number, groups, assertions, votes, divisive_assertions } = payload

  const enrichedGroups = groups.map(group => ({
    table_number: group.table_number,
    member_count: group.member_ids.length,
    votes_by_assertion: assertions.map(assertion => {
      const assertionVotes = votes.filter(
        v => v.assertion_id === assertion.id && group.member_ids.includes(v.member_id)
      )
      return {
        assertion_id:      assertion.id,
        assertion_content: assertion.content,
        agree:    assertionVotes.filter(v => v.vote === 'agree').length,
        disagree: assertionVotes.filter(v => v.vote === 'disagree').length,
        pass:     assertionVotes.filter(v => v.vote === 'pass').length,
      }
    }),
  }))

  const edgePayload = {
    session_title,
    session_description,
    assertions,
    divisive_assertions,
    groups: enrichedGroups,
    target_table_number,
  }

  const { data, error } = await supabase.functions.invoke('gemini-proxy', {
    body: { action: 'name_single_group', payload: edgePayload },
  })
  if (error) throw new Error(extractErr(error))
  if (data?.error) throw new Error(data.error)

  const d = data as { result: { name: string; description: string }; usage?: { total_tokens?: number } }
  // Rejette les identifiants techniques : "Groupe 3", "Camp 2" (numéro) et
  // "Camp A", "Groupe B" ou une lettre seule (labels neutres du fix A1) →
  // déclenche le retry, puis le fallback descriptif côté appelant.
  if (/^(groupe|camp)\s*([0-9]+|[a-z])$/i.test(d.result.name.trim())) {
    throw new Error('generic_name')
  }
  return {
    result: {
      table_number: target_table_number,
      name:         d.result.name,
      description:  d.result.description,
    },
    tokens_used: d.usage?.total_tokens ?? 0,
  }
}
