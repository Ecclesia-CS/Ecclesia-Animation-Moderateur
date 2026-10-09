// Chantier 162a — fil de partage de la table (liens et sources collaboratives).
// Modèle : chantier 132 (lib/tableVote.ts). Tout passe par des RPC : table_shares
// n'a aucune policy de lecture directe (une demande en attente n'est vue que de
// son auteur et du modérateur).
import { supabase } from './supabase'
import type { SessionShare, TableShare } from './types'
import { normalizeSessionShares, normalizeTableShares } from './tableShareFormat'

export { SHARE_TITLE_MAX, hostOf, withHttps } from './tableShareFormat'

export async function listTableShares(tableId: string): Promise<TableShare[]> {
  const { data, error } = await supabase.rpc('list_table_shares', { p_table_id: tableId })
  if (error) throw error
  return normalizeTableShares(data)
}

export type ShareRequest =
  | { kind: 'link'; title: string; url: string }
  | { kind: 'collab_source'; sourceId: string }

export async function requestTableShare(tableId: string, req: ShareRequest): Promise<string> {
  const { data, error } = await supabase.rpc('request_table_share', {
    p_table_id: tableId,
    p_kind: req.kind,
    p_title: req.kind === 'link' ? req.title : null,
    p_url: req.kind === 'link' ? req.url : null,
    p_source_id: req.kind === 'collab_source' ? req.sourceId : null,
  })
  if (error) throw error
  return String(data)
}

export async function decideTableShare(shareId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('decide_table_share', { p_share_id: shareId, p_accept: accept })
  if (error) throw error
}

export async function endTableShare(tableId: string): Promise<void> {
  const { error } = await supabase.rpc('end_table_share', { p_table_id: tableId })
  if (error) throw error
}

export async function withdrawTableShare(shareId: string): Promise<void> {
  const { error } = await supabase.rpc('withdraw_table_share', { p_share_id: shareId })
  if (error) throw error
}

export async function listSessionShares(sessionId: string): Promise<SessionShare[]> {
  const { data, error } = await supabase.rpc('list_session_shares', { p_session_id: sessionId })
  if (error) throw error
  return normalizeSessionShares(data)
}
