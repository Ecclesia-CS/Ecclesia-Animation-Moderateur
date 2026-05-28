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

// --- Admin wrappers (C2) ---

export interface AssertionWithPseudo extends Assertion {
  member_pseudo: string
}

export interface SessionVotingStats {
  member_count: number
  onboarded_count: number
  voter_count: number
  approved_assertion_count: number
  total_votes: number
}

export async function listAssertionsAdmin(
  password: string,
  sessionId: string
): Promise<AssertionWithPseudo[]> {
  const { data, error } = await supabase.rpc('list_assertions_admin', {
    p_password: password,
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))
  return (data as AssertionWithPseudo[]) ?? []
}

export async function getSessionVotingStats(
  password: string,
  sessionId: string
): Promise<SessionVotingStats> {
  const { data, error } = await supabase.rpc('get_session_voting_stats', {
    p_password: password,
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))
  return data as SessionVotingStats
}

export async function updateSessionConfig(
  password: string,
  sessionId: string,
  moderationPolicy: 'open' | 'closed',
  voteTimerMinutes: number | null,
  voteThresholdPercent: number | null
): Promise<Session> {
  const { data, error } = await supabase.rpc('update_session_config', {
    p_password: password,
    p_session_id: sessionId,
    p_moderation_policy: moderationPolicy,
    p_vote_timer_minutes: voteTimerMinutes,
    p_vote_threshold_percent: voteThresholdPercent,
  })
  if (error) throw new Error(extractErr(error))
  return data as Session
}

// Re-export types for convenience
export type { SessionMember, EntryResponse, Assertion, AssertionVote, VoteResult, TableAssignment }
