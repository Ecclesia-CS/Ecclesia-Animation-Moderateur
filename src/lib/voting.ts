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
  ModerationPolicy,
  TableOpinionSummary,
} from './types'
import type { AllocationMember, AllocationResult } from './allocation'

export async function registerSessionMember(
  sessionId: string,
  pseudo: string,
  reclaimCode?: string
): Promise<SessionMember> {
  const { data, error } = await supabase.rpc('register_session_member', {
    p_session_id: sessionId,
    p_pseudo: pseudo,
    p_reclaim_code: reclaimCode ?? null,
  })
  if (error) throw new Error(extractErr(error))
  return data as SessionMember
}

export async function confirmAttendance(
  sessionId: string,
  pseudo?: string,
  code?: string
): Promise<SessionMember> {
  const { data, error } = await supabase.rpc('confirm_attendance', {
    p_session_id: sessionId,
    p_pseudo:     pseudo ?? null,
    p_code:       code   ?? null,
  })
  if (error) throw new Error(extractErr(error))
  return data as SessionMember
}

/**
 * Chantier B3 — reconquête d'un profil pré-vote déjà inscrit (pseudo pris),
 * par pseudo OU code de rappel. Contrairement à `confirmAttendance`, ne
 * touche jamais `attending_in_person` : le vote reste à distance. Phase-safe
 * côté serveur — n'agit que si la séance est encore en `pre_voting`.
 */
export async function reclaimPrevotingMember(
  sessionId: string,
  pseudo?: string,
  code?: string
): Promise<SessionMember> {
  const { data, error } = await supabase.rpc('reclaim_prevoting_member', {
    p_session_id: sessionId,
    p_pseudo:     pseudo ?? null,
    p_code:       code   ?? null,
  })
  if (error) throw new Error(extractErr(error))
  return data as SessionMember
}

/**
 * Chantier 19 (G3) — onboarding à 3 questions.
 * Nécessite la migration 20260725_1_onboarding_3_questions.sql (l'ancienne
 * signature à 7 paramètres est supprimée en base).
 */
export async function submitEntryResponse(
  sessionId: string,
  consentTranscript: boolean,
  participationStyle: 'listener' | 'active',
  ecclesiaExperience: boolean
): Promise<EntryResponse> {
  const { data, error } = await supabase.rpc('submit_entry_response', {
    p_session_id: sessionId,
    p_consent_transcript: consentTranscript,
    p_participation_style: participationStyle,
    p_ecclesia_experience: ecclesiaExperience,
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

export async function mergeAssertionVotes(
  password: string,
  keepId: string,
  rejectId: string
): Promise<void> {
  const { error } = await supabase.rpc('merge_assertion_votes', {
    p_password:  password,
    p_keep_id:   keepId,
    p_reject_id: rejectId,
  })
  if (error) throw new Error(extractErr(error))
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

// Chantier 20 (G7) — vue modérateur : composition idéologique de sa table +
// assertions représentatives par camp + clivantes/consensuelles au sein de
// la table. Aucun mot de passe : auth par participation à la table (RPC
// vérifie is_table_participant côté serveur). Retourne null si l'appelant
// n'est pas participant de cette table.
export async function loadTableOpinionSummary(tableId: string): Promise<TableOpinionSummary | null> {
  const { data, error } = await supabase.rpc('get_table_opinion_summary', {
    p_table_id: tableId,
  })
  if (error) throw new Error(extractErr(error))
  return (data as TableOpinionSummary) ?? null
}

export async function getVoteCountsAdmin(password: string, sessionId: string): Promise<VoteResult[]> {
  const { data, error } = await supabase.rpc('get_vote_counts_admin', {
    p_password: password,
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))
  return (data as VoteResult[]) ?? []
}

export type AllSessionVoteResult = VoteResult & {
  session_id: string
  session_title: string
}

export async function getAllVoteResults(password: string): Promise<AllSessionVoteResult[]> {
  const { data, error } = await supabase.rpc('get_vote_results_all', {
    p_password: password,
  })
  if (error) throw new Error(extractErr(error))
  return (data as AllSessionVoteResult[]) ?? []
}

export type ThemeStat = { theme: string; avg: number; count: number }

export async function getThemeStatsAll(password: string): Promise<ThemeStat[]> {
  const { data, error } = await supabase.rpc('get_theme_stats_all', {
    p_password: password,
  })
  if (error) throw new Error(extractErr(error))
  return (data as ThemeStat[]) ?? []
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
): Promise<{ table_count: number; member_count: number }> {
  const { data, error } = await supabase.rpc('run_clustering_v1', {
    p_password: password,
    p_session_id: sessionId,
    p_target_size: targetSize,
  })
  if (error) throw new Error(extractErr(error))
  return data as { table_count: number; member_count: number }
}

export async function runClusteringV2(
  password:   string,
  sessionId:  string,
  targetSize = 6,
): Promise<{ table_count: number; member_count: number }> {
  const { data, error } = await supabase.rpc('run_clustering_v2', {
    p_password:    password,
    p_session_id:  sessionId,
    p_target_size: targetSize,
  })
  if (error) throw new Error(extractErr(error))
  return data as { table_count: number; member_count: number }
}

// Chantier 19 (G5) — `runClusteringV3` (« allocation avancée ») et
// `getModeratorResponses` supprimés : remplacés par l'allocation v2
// ci-dessous. `runClusteringV1`/`V2` sont conservées le temps de valider
// l'algorithme v2 en production.

// ── Chantier 19 — Allocation v2 ───────────────────────────────

/** Ligne retournée par get_allocation_inputs. */
interface AllocationInputRow {
  member_id: string
  pseudo: string
  is_moderator: boolean
  is_active: boolean
  consents: boolean
  is_veteran: boolean
  group_id: number | null
}

export interface AllocationInputs {
  /** Membres présentiels **hors modérateurs** — les sièges à pourvoir. */
  members: AllocationMember[]
  /** `member_id` des modérateurs de cette séance (n'occupent pas de siège). */
  moderatorIds: string[]
  /**
   * Chantier 25 — profils complets des modérateurs (mêmes ids que
   * `moderatorIds`). Nécessaires pour qu'un modérateur en surplus, replacé
   * comme participant ordinaire, compte correctement dans les seuils de sa
   * table, et pour l'afficher par son pseudo dans la sélection du superadmin.
   */
  moderators: AllocationMember[]
  /** false → règle 3 désactivée (aucune analyse des camps status='done'). */
  opinionsAvailable: boolean
}

/**
 * Charge les entrées de l'algorithme d'allocation (G1).
 * Bypass de la RLS owner-only d'`entry_responses` via le mot de passe
 * superadmin. Ne retourne que les membres présentiels (§2 de la spec).
 */
export async function loadAllocationInputs(
  password: string,
  sessionId: string
): Promise<AllocationInputs> {
  const { data, error } = await supabase.rpc('get_allocation_inputs', {
    p_password: password,
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))

  const raw = (data ?? {}) as { members?: AllocationInputRow[]; opinions_available?: boolean }
  const rows = raw.members ?? []

  const toMember = (r: AllocationInputRow): AllocationMember => ({
    member_id:  r.member_id,
    pseudo:     r.pseudo,
    is_active:  r.is_active,
    consents:   r.consents,
    is_veteran: r.is_veteran,
    group_id:   r.group_id,
  })
  const moderators = rows.filter(r => r.is_moderator).map(toMember)

  return {
    members:           rows.filter(r => !r.is_moderator).map(toMember),
    moderatorIds:      moderators.map(m => m.member_id),
    moderators,
    opinionsAvailable: raw.opinions_available === true,
  }
}

export interface ApplyAllocationResult {
  table_count: number
  member_count: number
  tables_created: number
  tables_reused: number
  /** Chantier 25 (H18) — tables reliquats détachées de la séance. */
  tables_detached?: number
  /** Reliquats conservés car des participants les ont déjà rejointes. */
  tables_orphaned?: number
}

/**
 * Persiste le résultat de l'allocation : crée/réutilise les tables physiques,
 * remplace `table_assignments`, passe la séance en phase `allocating`.
 */
export async function applyAllocation(
  password: string,
  sessionId: string,
  result: Pick<AllocationResult, 'tables'>
): Promise<ApplyAllocationResult> {
  const { data, error } = await supabase.rpc('apply_allocation', {
    p_password: password,
    p_session_id: sessionId,
    p_tables: result.tables,
  })
  if (error) throw new Error(extractErr(error))
  return data as ApplyAllocationResult
}

/**
 * G2 — crée N tables vides rattachées à la séance. Un booléen `leaderless`
 * par table. Utilisée hors allocation (pré-création manuelle) ; l'allocation
 * elle-même passe par `applyAllocation`, qui crée ce qui manque.
 */
export async function createTablesBatch(
  password: string,
  sessionId: string,
  leaderless: boolean[]
): Promise<{ table_id: string; join_code: string; leaderless: boolean }[]> {
  const { data, error } = await supabase.rpc('create_tables_batch', {
    p_password: password,
    p_session_id: sessionId,
    p_leaderless: leaderless,
  })
  if (error) throw new Error(extractErr(error))
  return (data as { table_id: string; join_code: string; leaderless: boolean }[]) ?? []
}

/**
 * Chantier 33 — assigne manuellement un membre comme modérateur d'une table
 * précise (superadmin) : pose `is_moderator = true` et (dé)place sa ligne
 * `table_assignments` sur cette table. Pour retirer un modérateur d'une
 * table, réutiliser `setMemberModerator(..., false)` — il redevient un
 * participant ordinaire, toujours assis à la même table.
 */
export async function assignModeratorToTable(
  password: string,
  sessionId: string,
  tableNumber: number,
  memberId: string,
): Promise<void> {
  const { error } = await supabase.rpc('assign_moderator_to_table', {
    p_password: password,
    p_session_id: sessionId,
    p_table_number: tableNumber,
    p_member_id: memberId,
  })
  if (error) throw new Error(extractErr(error))
}

/** G4 — marque/démarque un membre comme modérateur de cette séance. */
export async function setMemberModerator(
  password: string,
  sessionId: string,
  memberId: string,
  isModerator: boolean
): Promise<SessionMember> {
  const { data, error } = await supabase.rpc('set_member_moderator', {
    p_password: password,
    p_session_id: sessionId,
    p_member_id: memberId,
    p_is_moderator: isModerator,
  })
  if (error) throw new Error(extractErr(error))
  return data as SessionMember
}

/**
 * G4/H4 — auto-déclaration de statut modérateur via le mot de passe Ecclesia.
 * Si l'appareil n'a pas encore de profil pour cette séance (n'a jamais voté/
 * inscrit), `pseudo` sert à en créer un à la volée (attending_in_person=true) ;
 * sinon le profil existant est simplement marqué is_moderator=true et `pseudo`
 * est ignoré côté serveur.
 */
export async function claimModeratorStatus(
  sessionId: string,
  creationCode: string,
  pseudo?: string
): Promise<SessionMember> {
  const { data, error } = await supabase.rpc('claim_moderator_status', {
    p_session_id: sessionId,
    p_creation_code: creationCode,
    p_pseudo: pseudo ?? null,
  })
  if (error) throw new Error(extractErr(error))
  return data as SessionMember
}

// --- Admin wrappers (C2) ---

// Note (E2) : pas de member_pseudo / member_id — l'identité de l'auteur
// n'est jamais exposée au superadmin, cf. list_assertions_admin.
export interface AssertionAdmin {
  id: string
  session_id: string
  content: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

export interface SessionVotingStats {
  member_count: number
  attending_count: number
  remote_count: number
  onboarded_count: number
  voter_count: number
  approved_assertion_count: number
  total_votes: number
}

export async function listAssertionsAdmin(
  password: string,
  sessionId: string
): Promise<AssertionAdmin[]> {
  const { data, error } = await supabase.rpc('list_assertions_admin', {
    p_password: password,
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))
  return (data as AssertionAdmin[]) ?? []
}

export async function deleteAssertionsAdmin(
  password: string,
  sessionId: string,
  assertionIds: string[]
): Promise<number> {
  const { data, error } = await supabase.rpc('delete_assertions_admin', {
    p_password: password,
    p_session_id: sessionId,
    p_assertion_ids: assertionIds,
  })
  if (error) throw new Error(extractErr(error))
  return data as number
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
  moderationPolicy: ModerationPolicy
): Promise<Session> {
  const { data, error } = await supabase.rpc('update_session_config', {
    p_password: password,
    p_session_id: sessionId,
    p_moderation_policy: moderationPolicy,
  })
  if (error) throw new Error(extractErr(error))
  return data as Session
}

export async function assignTableToGroup(
  password: string,
  sessionId: string,
  tableNumber: number,
  tableId: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('assign_table_to_group', {
    p_password:     password,
    p_session_id:   sessionId,
    p_table_number: tableNumber,
    p_table_id:     tableId,
  })
  if (error) throw new Error(extractErr(error))
}

export interface SessionMemberAdmin {
  id: string
  pseudo: string
  created_at: string
  joined_phase: string | null
  has_entry_response: boolean
  has_voted: boolean
  /** Chantier 19 (G4) — nécessite la migration 20260725_2_allocation_v2.sql. */
  attending_in_person?: boolean
  is_moderator?: boolean
}

export async function listSessionMembersAdmin(
  password: string,
  sessionId: string
): Promise<SessionMemberAdmin[]> {
  const { data, error } = await supabase.rpc('list_session_members_admin', {
    p_password: password,
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))
  return (data as SessionMemberAdmin[]) ?? []
}

export async function adminSubmitAssertion(
  password: string,
  sessionId: string,
  content: string
): Promise<Assertion> {
  const { data, error } = await supabase.rpc('admin_submit_assertion', {
    p_password: password,
    p_session_id: sessionId,
    p_content: content,
  })
  if (error) throw new Error(extractErr(error))
  return data as Assertion
}

// Chantier 7 / B4 — réécrit le contenu d'une assertion (formulation combinée).
// Nécessite la migration 20260722_update_assertion_content.sql déployée en base.
export async function updateAssertionContent(
  password: string,
  assertionId: string,
  content: string
): Promise<void> {
  const { error } = await supabase.rpc('update_assertion_content', {
    p_password: password,
    p_assertion_id: assertionId,
    p_content: content,
  })
  if (error) throw new Error(extractErr(error))
}

// ── Chantier 18 / F24 — fusion annulable ──────────────────────
// Remplace la séquence updateAssertionContent → mergeAssertionVotes →
// rejectAssertion : une seule RPC atomique qui enregistre au passage de
// quoi revenir en arrière (voir 20260728_chantier18_merge_undo.sql).

export interface AssertionMergeRecord {
  id:                  string
  keep_id:             string
  reject_id:           string
  keep_content_before: string
  keep_content_after:  string
  reject_content:      string
  reason:              string | null
  created_at:          string
  reverted_at:         string | null
}

export interface RevertMergeResult {
  content_restored: boolean
  votes_removed:    number
  votes_restored:   number
}

export async function applyAssertionMerge(
  password: string,
  keepId: string,
  rejectId: string,
  newContent?: string | null,
  reason?: string | null
): Promise<string> {
  const { data, error } = await supabase.rpc('apply_assertion_merge', {
    p_password:    password,
    p_keep_id:     keepId,
    p_reject_id:   rejectId,
    p_new_content: newContent ?? null,
    p_reason:      reason ?? null,
  })
  if (error) throw new Error(extractErr(error))
  return data as string
}

export async function revertAssertionMerge(
  password: string,
  mergeId: string
): Promise<RevertMergeResult> {
  const { data, error } = await supabase.rpc('revert_assertion_merge', {
    p_password: password,
    p_merge_id: mergeId,
  })
  if (error) throw new Error(extractErr(error))
  return data as RevertMergeResult
}

export async function listAssertionMerges(
  password: string,
  sessionId: string
): Promise<AssertionMergeRecord[]> {
  const { data, error } = await supabase.rpc('list_assertion_merges', {
    p_password:   password,
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))
  return (data ?? []) as AssertionMergeRecord[]
}

export async function getMyTableAssignment(
  sessionId: string
): Promise<AssignmentWithJoinCode | null> {
  const { data, error } = await supabase.rpc('get_my_table_assignment', {
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))
  if (!data) return null
  const raw = data as {
    id: string
    session_id: string
    member_id: string
    table_number: number
    table_id: string | null
    join_code: string | null
    created_at: string
  }
  return {
    id:           raw.id,
    session_id:   raw.session_id,
    member_id:    raw.member_id,
    table_number: raw.table_number,
    table_id:     raw.table_id,
    created_at:   raw.created_at,
    tables:       raw.join_code ? { join_code: raw.join_code } : null,
  }
}

export interface AssignmentWithJoinCode {
  id: string
  session_id: string
  member_id: string
  table_number: number
  table_id: string | null
  created_at: string
  tables: { join_code: string } | null
}

export async function moveMemberToGroup(
  password: string,
  sessionId: string,
  memberId: string,
  targetTableNumber: number,
): Promise<void> {
  const { error } = await supabase.rpc('move_member_to_group', {
    p_password:            password,
    p_session_id:          sessionId,
    p_member_id:           memberId,
    p_target_table_number: targetTableNumber,
  })
  if (error) throw new Error(extractErr(error))
}

// Re-export types for convenience
export type { SessionMember, EntryResponse, Assertion, AssertionVote, VoteResult, TableAssignment }
