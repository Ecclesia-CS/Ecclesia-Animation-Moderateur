// Chantier 132 — outil "proposer un vote" côté modérateur (table-scoped,
// totalement séparé du système d'assertions/vote du Bloc C, cf. lib/voting.ts).
import { supabase } from './supabase'
import type { TableVote, TableVoteOption, TableVoteResult, TableVoteHistoryEntry } from './types'

export async function getTableVoteWithOptions(
  voteId: string,
): Promise<(TableVote & { table_vote_options: TableVoteOption[] }) | null> {
  const { data, error } = await supabase
    .from('table_votes')
    .select('*, table_vote_options(*)')
    .eq('id', voteId)
    .maybeSingle()
  if (error) throw error
  return data as (TableVote & { table_vote_options: TableVoteOption[] }) | null
}

export async function getTableVoteResults(voteId: string): Promise<TableVoteResult[]> {
  const { data, error } = await supabase.rpc('get_table_vote_results', { p_vote_id: voteId })
  if (error) throw error
  return (data ?? []) as TableVoteResult[]
}

export async function listTableVotes(tableId: string): Promise<TableVoteHistoryEntry[]> {
  const { data, error } = await supabase.rpc('list_table_votes', { p_table_id: tableId })
  if (error) throw error
  return (data ?? []) as TableVoteHistoryEntry[]
}

export async function submitTableVoteResponse(optionId: string, answer: boolean): Promise<void> {
  const { error } = await supabase.rpc('submit_table_vote_response', {
    p_option_id: optionId,
    p_answer: answer,
  })
  if (error) throw error
}

export async function getMyTableVoteAnswers(voteId: string): Promise<Record<string, boolean>> {
  const { data, error } = await supabase
    .from('table_vote_responses')
    .select('option_id, answer')
    .eq('vote_id', voteId)
  if (error) throw error
  const map: Record<string, boolean> = {}
  for (const row of (data ?? []) as { option_id: string; answer: boolean }[]) {
    map[row.option_id] = row.answer
  }
  return map
}
