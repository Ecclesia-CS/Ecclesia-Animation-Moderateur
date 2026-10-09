// Chantier 162a — parties pures du fil de partage (aucun accès réseau), séparées
// de lib/tableShare.ts pour être testables sans client Supabase.
import type { SessionShare, TableShare, TableShareKind, TableShareStatus } from './types'

/** Longueur maximale du titre d'un lien (miroir de request_table_share). */
export const SHARE_TITLE_MAX = 80

const KINDS: TableShareKind[] = ['collab_source', 'link']
const STATUSES: TableShareStatus[] = ['pending', 'accepted', 'refused']

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object'
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/** Valide la forme reçue d'une RPC : une ligne illisible est ignorée, jamais fatale. */
export function normalizeTableShares(data: unknown): TableShare[] {
  if (!Array.isArray(data)) return []
  const out: TableShare[] = []
  for (const r of data) {
    if (!isRecord(r)) continue
    if (typeof r.id !== 'string' || typeof r.title !== 'string') continue
    if (!KINDS.includes(r.kind as TableShareKind)) continue
    if (!STATUSES.includes(r.status as TableShareStatus)) continue
    out.push({
      id: r.id,
      kind: r.kind as TableShareKind,
      title: r.title,
      url: strOrNull(r.url),
      content: strOrNull(r.content),
      status: r.status as TableShareStatus,
      author_pseudo: typeof r.author_pseudo === 'string' ? r.author_pseudo : '',
      is_mine: r.is_mine === true,
      is_active: r.is_active === true,
      created_at: typeof r.created_at === 'string' ? r.created_at : '',
      decided_at: strOrNull(r.decided_at),
    })
  }
  return out
}

export function normalizeSessionShares(data: unknown): SessionShare[] {
  if (!Array.isArray(data)) return []
  const out: SessionShare[] = []
  for (const r of data) {
    if (!isRecord(r)) continue
    if (typeof r.id !== 'string' || typeof r.title !== 'string' || typeof r.table_id !== 'string') continue
    if (!KINDS.includes(r.kind as TableShareKind)) continue
    out.push({
      id: r.id,
      table_id: r.table_id,
      join_code: typeof r.join_code === 'string' ? r.join_code : '',
      table_number: typeof r.table_number === 'number' ? r.table_number : null,
      kind: r.kind as TableShareKind,
      title: r.title,
      url: strOrNull(r.url),
      author_pseudo: typeof r.author_pseudo === 'string' ? r.author_pseudo : '',
      decided_at: strOrNull(r.decided_at),
    })
  }
  return out
}

/**
 * Un lien tapé à la main commence souvent par « www. » ou le domaine seul :
 * on ajoute https:// plutôt que de refuser. Le serveur reste juge (http/https).
 */
export function withHttps(raw: string): string {
  const v = raw.trim()
  if (!v || /^[a-z][a-z0-9+.-]*:/i.test(v) || /\s/.test(v)) return v
  return `https://${v}`
}

/** Nom de domaine affiché sous un titre de lien ; chaîne vide si l'URL est illisible. */
export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}
