// Chantier 173 — sujets de table (file « sujets à venir »). Tout passe par RPC.
import { supabase } from './supabase'

export type TopicStatus = 'pending' | 'current' | 'done'

export interface TableTopic {
  id: string
  table_id: string
  texte: string
  rang: number
  statut: TopicStatus
  source: 'manual' | 'queue'
  created_at: string
}

export interface UnaddressedTopic {
  id: string
  table_id: string
  table_number: number | null
  texte: string
  source: 'manual' | 'queue'
  created_at: string
}

// Colonne `norm` (générée en base) exclue : le front n'en a pas besoin.
function clean(rows: unknown): TableTopic[] {
  if (!Array.isArray(rows)) return []
  return rows
    .filter((r): r is TableTopic => !!r && typeof r.id === 'string' && typeof r.texte === 'string')
    .map(r => ({
      id: r.id, table_id: r.table_id, texte: r.texte, rang: r.rang ?? 0,
      statut: r.statut, source: r.source, created_at: r.created_at,
    }))
}

export async function listTableTopics(tableId: string): Promise<TableTopic[]> {
  const { data, error } = await supabase.rpc('list_table_topics', { p_table_id: tableId })
  if (error) throw error
  return clean(data)
}

export async function addTableTopic(tableId: string, texte: string): Promise<void> {
  const { error } = await supabase.rpc('add_table_topic', { p_table_id: tableId, p_texte: texte })
  if (error) throw error
}

export async function setTableTopicStatus(topicId: string, statut: TopicStatus): Promise<void> {
  const { error } = await supabase.rpc('set_table_topic_status', { p_topic_id: topicId, p_statut: statut })
  if (error) throw error
}

export async function setTableCurrentTopic(tableId: string, texte: string): Promise<void> {
  const { error } = await supabase.rpc('set_table_current_topic', { p_table_id: tableId, p_texte: texte })
  if (error) throw error
}

export async function deleteTableTopic(topicId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_table_topic', { p_topic_id: topicId })
  if (error) throw error
}

export async function reorderTableTopics(tableId: string, ids: string[]): Promise<void> {
  const { error } = await supabase.rpc('reorder_table_topics', { p_table_id: tableId, p_ids: ids })
  if (error) throw error
}

export async function listUnaddressedTopicsAdmin(password: string, sessionId: string): Promise<UnaddressedTopic[]> {
  const { data, error } = await supabase.rpc('list_unaddressed_topics_admin', {
    p_password: password, p_session_id: sessionId,
  })
  if (error) throw error
  return (Array.isArray(data) ? data : []) as UnaddressedTopic[]
}
