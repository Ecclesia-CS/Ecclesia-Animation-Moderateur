import { supabase } from './supabase'
import { extractErr } from './utils'
import type {
  Session,
  SessionMember,
  EntryResponse,
  Assertion,
  AssertionVote,
  VoteResult,
  TableAssignment,
} from './types'

export async function registerSessionMember(
  sessionId: string,
  pseudo: string
): Promise<SessionMember> {
  const { data, error } = await supabase.rpc('register_session_member', {
    p_session_id: sessionId,
    p_pseudo: pseudo,
  })
  if (error) throw new Error(extractErr(error))
  return data as SessionMember
}

export async function submitEntryResponse(
  sessionId: string,
  consentTranscript: boolean,
  groupSizePref: 'small' | 'medium' | 'large',
  moderatorPref: boolean,
  opennessToDiff: number,
  participationStyle: 'listener' | 'active'
): Promise<EntryResponse> {
  const { data, error } = await supabase.rpc('submit_entry_response', {
    p_session_id: sessionId,
    p_consent_transcript: consentTranscript,
    p_group_size_pref: groupSizePref,
    p_moderator_pref: moderatorPref,
    p_openness_to_diff: opennessToDiff,
    p_participation_style: participationStyle,
  })
  if (error) throw new Error(extractErr(error))
  return data as EntryResponse
}

export async function submitAssertion(
  sessionId: string,
  content: string
): Promise<Assertion> {
  const { data, error } = await supabase.rpc('submit_assertion', {
    p_session_id: sessionId,
    p_content: content,
  })
  if (error) throw new Error(extractErr(error))
  return data as Assertion
}

export async function castVote(
  assertionId: string,
  vote: 'agree' | 'disagree' | 'pass'
): Promise<AssertionVote> {
  const { data, error } = await supabase.rpc('cast_vote', {
    p_assertion_id: assertionId,
    p_vote: vote,
  })
  if (error) throw new Error(extractErr(error))
  return data as AssertionVote
}

export async function getVoteResults(sessionId: string): Promise<VoteResult[]> {
  const { data, error } = await supabase.rpc('get_vote_results', {
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))
  return (data as VoteResult[]) ?? []
}

export async function approveAssertion(
  password: string,
  assertionId: string
): Promise<Assertion> {
  const { data, error } = await supabase.rpc('approve_assertion', {
    p_password: password,
    p_assertion_id: assertionId,
  })
  if (error) throw new Error(extractErr(error))
  return data as Assertion
}

export async function rejectAssertion(
  password: string,
  assertionId: string
): Promise<Assertion> {
  const { data, error } = await supabase.rpc('reject_assertion', {
    p_password: password,
    p_assertion_id: assertionId,
  })
  if (error) throw new Error(extractErr(error))
  return data as Assertion
}

export async function setSessionPhase(
  password: string,
  sessionId: string,
  phase: Session['phase']
): Promise<Session> {
  const { data, error } = await supabase.rpc('set_session_phase', {
    p_password: password,
    p_session_id: sessionId,
    p_phase: phase,
  })
  if (error) throw new Error(extractErr(error))
  return data as Session
}

export async function runClusteringV1(
  password: string,
  sessionId: string,
  targetSize = 7
): Promise<number> {
  const { data, error } = await supabase.rpc('run_clustering_v1', {
    p_password: password,
    p_session_id: sessionId,
    p_target_size: targetSize,
  })
  if (error) throw new Error(extractErr(error))
  return (data as { table_count: number }).table_count
}

// Re-export types for convenience
export type { SessionMember, EntryResponse, Assertion, AssertionVote, VoteResult, TableAssignment }
