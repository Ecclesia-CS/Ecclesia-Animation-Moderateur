import { supabase } from './supabase'
import { Session, Table } from './types'
import { extractErr } from './utils'

export type SessionTableRow = {
  id: string
  join_code: string
  created_at: string
  moderator_pseudo: string | null
  participant_count: number
  is_active: boolean
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
): Promise<SessionTableRow[]> {
  const { data, error } = await supabase.rpc('list_available_tables', {
    p_password: password,
  })
  if (error) throw new Error(extractErr(error))
  return (data as SessionTableRow[]) ?? []
}
