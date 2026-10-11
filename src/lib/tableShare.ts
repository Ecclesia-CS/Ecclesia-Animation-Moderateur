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
  | { kind: 'image'; title: string; blob: Blob }

const IMAGE_BUCKET = 'table-shares'

/** Durée de validité d'une URL signée d'image (la RLS de stockage a déjà filtré qui peut la demander). */
const SIGNED_URL_TTL_SECONDS = 3600

export async function requestTableShare(tableId: string, req: ShareRequest): Promise<string> {
  // Image : le fichier part d'abord dans le bucket privé (politique de dépôt =
  // assis à une table modérée, débat en cours), puis la demande l'annonce. Si
  // l'annonce échoue, on retire le fichier pour ne pas laisser d'orphelin.
  let shareId: string | null = null
  let imagePath: string | null = null
  if (req.kind === 'image') {
    shareId = crypto.randomUUID()
    imagePath = `${tableId}/${shareId}`
    const { error: upErr } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(imagePath, req.blob, { contentType: req.blob.type || 'image/webp', upsert: false })
    if (upErr) throw upErr
  }

  const { data, error } = await supabase.rpc('request_table_share', {
    p_table_id: tableId,
    p_kind: req.kind,
    p_title: req.kind === 'collab_source' ? null : req.title,
    p_url: req.kind === 'link' ? req.url : null,
    p_source_id: req.kind === 'collab_source' ? req.sourceId : null,
    p_share_id: shareId,
  })
  if (error) {
    if (imagePath) await supabase.storage.from(IMAGE_BUCKET).remove([imagePath]).catch(() => {})
    throw error
  }
  return String(data)
}

/** URL signée (privée, temporaire) d'une image de partage ; null si illisible ou non autorisée. */
export async function signShareImageUrl(imagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .createSignedUrl(imagePath, SIGNED_URL_TTL_SECONDS)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

/**
 * Efface les captures des séances closes (Edge Function `purge-share-images`).
 * À appeler après un passage en `closed`. Jamais bloquant : l'échec est journalisé,
 * la prochaine clôture (n'importe quelle séance) rattrapera.
 */
export async function purgeShareImages(password: string, sessionId: string): Promise<void> {
  try {
    const { data, error } = await supabase.functions.invoke('purge-share-images', {
      body: { session_id: sessionId, password },
    })
    if (error || data?.error) console.error('purge-share-images :', error ?? data?.error)
  } catch (e) {
    console.error('purge-share-images :', e)
  }
}

export async function decideTableShare(shareId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('decide_table_share', { p_share_id: shareId, p_accept: accept })
  if (error) throw error
}

export async function endTableShare(tableId: string): Promise<void> {
  const { error } = await supabase.rpc('end_table_share', { p_table_id: tableId })
  if (error) throw error
}

export async function withdrawTableShare(shareId: string, imagePath?: string | null): Promise<void> {
  const { error } = await supabase.rpc('withdraw_table_share', { p_share_id: shareId })
  if (error) throw error
  // Le fichier d'une demande retirée n'a plus de raison d'exister (au mieux : sinon la purge s'en charge).
  if (imagePath) await supabase.storage.from(IMAGE_BUCKET).remove([imagePath]).catch(() => {})
}

export async function listSessionShares(sessionId: string): Promise<SessionShare[]> {
  const { data, error } = await supabase.rpc('list_session_shares', { p_session_id: sessionId })
  if (error) throw error
  return normalizeSessionShares(data)
}
