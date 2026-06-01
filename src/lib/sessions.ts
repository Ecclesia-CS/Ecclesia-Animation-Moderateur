import { supabase } from './supabase'
import { Session, Table, QuestionnaireExportRow, CollabSource, GroupNameResult } from './types'
import { extractErr } from './utils'

export type SessionTableRow = {
  id: string
  join_code: string
  created_at: string
  moderator_pseudo: string | null
  participant_count: number
  is_active: boolean
  questionnaire_forced_at: string | null
  leaderless?: boolean
}

export type TableParticipantRow = {
  participant_id: string
  pseudo: string
  total_ms: number
  turn_count: number
  is_current_speaker: boolean
}

export type TableSpeakingTurnRow = {
  id: string
  participant_id: string
  started_at: string
  ended_at: string | null
  source: string
}

export async function verifyPassword(password: string): Promise<void> {
  const { error } = await supabase.rpc('check_superadmin_password', { p_password: password })
  if (error) throw new Error(extractErr(error))
}

export async function createSession(
  password: string,
  title: string,
  description?: string,
  scheduledAt?: string,
  docInfoUrl?: string,
  docSummaryUrl?: string,
  docCollabUrl?: string,
): Promise<Session> {
  const { data, error } = await supabase.rpc('create_session', {
    p_password: password,
    p_title: title,
    p_description: description ?? null,
    p_scheduled_at: scheduledAt ?? null,
    p_doc_info_url: docInfoUrl ?? null,
    p_doc_summary_url: docSummaryUrl ?? null,
    p_doc_collab_url: docCollabUrl ?? null,
  })
  if (error) throw new Error(extractErr(error))
  return data as Session
}

export async function updateSessionDocs(
  password: string,
  sessionId: string,
  docInfoUrl: string | null,
  docSummaryUrl: string | null,
  docCollabUrl: string | null,
): Promise<Session> {
  const { data, error } = await supabase.rpc('update_session_docs', {
    p_password: password,
    p_session_id: sessionId,
    p_doc_info_url: docInfoUrl,
    p_doc_summary_url: docSummaryUrl,
    p_doc_collab_url: docCollabUrl,
  })
  if (error) throw new Error(extractErr(error))
  return data as Session
}

export async function attachTableToSession(
  password: string,
  tableId: string,
  sessionId: string,
): Promise<Table> {
  const { data, error } = await supabase.rpc('attach_table_to_session', {
    p_password: password,
    p_table_id: tableId,
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))
  return data as Table
}

export async function detachTableFromSession(
  password: string,
  tableId: string,
): Promise<Table> {
  const { data, error } = await supabase.rpc('detach_table_from_session', {
    p_password: password,
    p_table_id: tableId,
  })
  if (error) throw new Error(extractErr(error))
  return data as Table
}

export async function getTableParticipants(
  password: string,
  tableId: string,
): Promise<TableParticipantRow[]> {
  const { data, error } = await supabase.rpc('get_table_participants', {
    p_password: password,
    p_table_id: tableId,
  })
  if (error) throw new Error(extractErr(error))
  return (data as TableParticipantRow[]) ?? []
}

export async function deleteTableAdmin(
  password: string,
  tableId: string,
): Promise<void> {
  const { error } = await supabase.rpc('delete_table_admin', {
    p_password: password,
    p_table_id: tableId,
  })
  if (error) throw new Error(extractErr(error))
}

export async function deleteSession(
  password: string,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase.rpc('delete_session', {
    p_password:   password,
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))
}

export async function closeSession(
  password: string,
  sessionId: string,
): Promise<Session> {
  const { data, error } = await supabase.rpc('close_session', {
    p_password: password,
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))
  return data as Session
}

export async function listSessionTables(
  password: string,
  sessionId: string,
): Promise<SessionTableRow[]> {
  const { data, error } = await supabase.rpc('list_session_tables', {
    p_password: password,
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))
  return (data as SessionTableRow[]) ?? []
}

export async function listAvailableTables(
  password: string,
  since?: Date | null,
): Promise<SessionTableRow[]> {
  const params: Record<string, unknown> = { p_password: password }
  if (since !== undefined) {
    params.p_since = since === null ? null : since.toISOString()
  }
  const { data, error } = await supabase.rpc('list_available_tables', params)
  if (error) throw new Error(extractErr(error))
  return (data as SessionTableRow[]) ?? []
}

export async function deleteQuestionnaireResponse(
  password: string,
  responseId: string,
): Promise<void> {
  const { error } = await supabase.rpc('delete_questionnaire_response', {
    p_password:    password,
    p_response_id: responseId,
  })
  if (error) throw new Error(extractErr(error))
}

export async function getQuestionnaireResponses(
  password: string,
  sessionId?: string,
): Promise<QuestionnaireExportRow[]> {
  const { data, error } = await supabase.rpc('get_questionnaire_responses', {
    p_password:   password,
    p_session_id: sessionId ?? null,
  })
  if (error) throw new Error(extractErr(error))
  return (data as QuestionnaireExportRow[]) ?? []
}

// ── Collab sources ─────────────────────────────────────────────────

export async function registerCollabPseudo(
  sessionId: string,
  pseudo: string,
): Promise<void> {
  const { error } = await supabase.rpc('register_collab_pseudo', {
    p_session_id: sessionId,
    p_pseudo:     pseudo,
  })
  if (error) throw new Error(extractErr(error))
}

export async function addCollabSource(
  sessionId: string,
  title: string,
  url?: string | null,
  content?: string | null,
  tableJoinCode?: string | null,
): Promise<CollabSource> {
  const { data, error } = await supabase.rpc('add_collab_source', {
    p_session_id:       sessionId,
    p_title:            title,
    p_url:              url ?? null,
    p_content:          content ?? null,
    p_table_join_code:  tableJoinCode ?? null,
  })
  if (error) throw new Error(extractErr(error))
  return data as CollabSource
}

export async function updateCollabSource(
  sourceId: string,
  title: string,
  url?: string | null,
  content?: string | null,
): Promise<CollabSource> {
  const { data, error } = await supabase.rpc('update_collab_source', {
    p_source_id: sourceId,
    p_title:     title,
    p_url:       url ?? null,
    p_content:   content ?? null,
  })
  if (error) throw new Error(extractErr(error))
  return data as CollabSource
}

export async function deleteCollabSource(sourceId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_collab_source', {
    p_source_id: sourceId,
  })
  if (error) throw new Error(extractErr(error))
}

export async function deleteCollabSourceAdmin(password: string, sourceId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_collab_source_admin', {
    p_password:  password,
    p_source_id: sourceId,
  })
  if (error) throw new Error(extractErr(error))
}

export async function forceSessionQuestionnaire(
  password: string,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase.rpc('force_session_questionnaire', {
    p_password:   password,
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))
}

export async function cancelSessionQuestionnaire(
  password: string,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase.rpc('cancel_session_questionnaire', {
    p_password:   password,
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))
}

export async function getSessionTableCounts(
  password: string,
): Promise<{ session_id: string; cnt: number }[]> {
  const { data, error } = await supabase.rpc('get_session_table_counts', {
    p_password: password,
  })
  if (error) throw new Error(extractErr(error))
  return (data as { session_id: string; cnt: number }[]) ?? []
}

export async function getSessionMemberCounts(
  password: string,
): Promise<{ session_id: string; cnt: number }[]> {
  const { data, error } = await supabase.rpc('get_session_member_counts', {
    p_password: password,
  })
  if (error) throw new Error(extractErr(error))
  return (data as { session_id: string; cnt: number }[]) ?? []
}

export async function moveParticipant(
  password: string,
  participantId: string,
  targetTableId: string,
): Promise<void> {
  const { error } = await supabase.rpc('move_participant', {
    p_password:        password,
    p_participant_id:  participantId,
    p_target_table_id: targetTableId,
  })
  if (error) throw new Error(extractErr(error))
}

export async function getTableSpeakingTurnsAdmin(
  password: string,
  tableId: string,
): Promise<TableSpeakingTurnRow[]> {
  const { data, error } = await supabase.rpc('get_table_speaking_turns_admin', {
    p_password: password,
    p_table_id: tableId,
  })
  if (error) throw new Error(extractErr(error))
  return (data as TableSpeakingTurnRow[]) ?? []
}

export async function adminCreateTable(
  password: string,
  sessionId?: string,
  leaderless = false,
): Promise<{ table_id: string; join_code: string }> {
  const { data, error } = await supabase.rpc('admin_create_table', {
    p_password:   password,
    p_session_id: sessionId ?? null,
    p_leaderless: leaderless,
  })
  if (error) throw new Error(extractErr(error))
  return data as { table_id: string; join_code: string }
}

export async function updateGroupNames(
  password: string,
  sessionId: string,
  groupNames: GroupNameResult[],
): Promise<void> {
  const { error } = await supabase.rpc('update_group_names', {
    p_password:    password,
    p_session_id:  sessionId,
    p_group_names: groupNames,
  })
  if (error) throw new Error(extractErr(error))
}

export async function listSessionSources(sessionId: string): Promise<CollabSource[]> {
  const { data, error } = await supabase.rpc('list_session_sources', {
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))
  return (data as CollabSource[]) ?? []
}
