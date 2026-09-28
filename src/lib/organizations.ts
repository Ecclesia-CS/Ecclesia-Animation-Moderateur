/**
 * Chantier 135 — comptes associations externes.
 *
 * Une association se connecte par nom + mot de passe (`org_login`) et reçoit
 * un jeton opaque `org_…` (24 h). Côté front, ce jeton prend la place du mot
 * de passe superadmin : il est passé tel quel dans `p_password` des RPC
 * d'administration, et le serveur n'accepte que la liste blanche du débat
 * simple et du sondage, limitée aux séances de l'association
 * (`check_session_admin`, migration 20260926_chantier135_comptes_associations.sql).
 */
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { extractErr } from './utils'

export interface OrgInfo {
  id: string
  name: string
  expires_at: string | null
  max_open_sessions: number
  open_sessions?: number
}

export interface OrganizationAdminRow {
  id: string
  name: string
  active: boolean
  expires_at: string | null
  max_open_sessions: number
  note: string | null
  created_at: string
  open_sessions: number
  total_sessions: number
}

/** Préfixe des jetons d'association — distingue un jeton d'un mot de passe. */
export const ORG_TOKEN_PREFIX = 'org_'

export async function orgLogin(name: string, password: string): Promise<{ token: string; organization: OrgInfo }> {
  const { data, error } = await supabase.rpc('org_login', { p_name: name, p_password: password })
  if (error) throw new Error(extractErr(error))
  const res = data as { token?: string; organization?: OrgInfo; error?: string } | null
  if (!res || res.error || !res.token || !res.organization) {
    throw new Error(res?.error ?? 'Connexion impossible')
  }
  return { token: res.token, organization: res.organization }
}

export async function orgWhoami(token: string): Promise<OrgInfo> {
  const { data, error } = await supabase.rpc('org_whoami', { p_token: token })
  if (error) throw new Error(extractErr(error))
  return data as OrgInfo
}

export async function orgLogout(token: string): Promise<void> {
  await supabase.rpc('org_logout', { p_token: token })
}

export async function orgChangePassword(token: string, oldPassword: string, newPassword: string): Promise<void> {
  const { error } = await supabase.rpc('org_change_password', {
    p_token: token, p_old_password: oldPassword, p_new_password: newPassword,
  })
  if (error) throw new Error(extractErr(error))
}

// ── Superadmin ──────────────────────────────────────────────────────────────

export async function listOrganizationsAdmin(password: string): Promise<OrganizationAdminRow[]> {
  const { data, error } = await supabase.rpc('list_organizations_admin', { p_password: password })
  if (error) throw new Error(extractErr(error))
  return Array.isArray(data) ? (data as OrganizationAdminRow[]) : []
}

export async function createOrganization(
  password: string,
  input: { name: string; orgPassword: string; expiresAt: string | null; maxOpenSessions: number; note: string | null },
): Promise<void> {
  const { error } = await supabase.rpc('create_organization', {
    p_password:          password,
    p_name:              input.name,
    p_org_password:      input.orgPassword,
    p_expires_at:        input.expiresAt,
    p_max_open_sessions: input.maxOpenSessions,
    p_note:              input.note,
  })
  if (error) throw new Error(extractErr(error))
}

export async function updateOrganization(
  password: string,
  org: Pick<OrganizationAdminRow, 'id' | 'name' | 'active' | 'expires_at' | 'max_open_sessions' | 'note'>,
): Promise<void> {
  const { error } = await supabase.rpc('update_organization', {
    p_password:          password,
    p_org_id:            org.id,
    p_name:              org.name,
    p_active:            org.active,
    p_expires_at:        org.expires_at,
    p_max_open_sessions: org.max_open_sessions,
    p_note:              org.note,
  })
  if (error) throw new Error(extractErr(error))
}

export async function setOrganizationPassword(password: string, orgId: string, orgPassword: string): Promise<void> {
  const { error } = await supabase.rpc('set_organization_password', {
    p_password: password, p_org_id: orgId, p_org_password: orgPassword,
  })
  if (error) throw new Error(extractErr(error))
}

/**
 * Chantier 135 — nommage IA des camps : 5 par jour et par association.
 * À appeler juste avant l'appel Gemini (chaque appel autorisé consomme une
 * unité). Superadmin : toujours autorisé, `remaining = null`.
 */
export async function orgConsumeNamingQuota(
  password: string, sessionId: string,
): Promise<{ allowed: boolean; remaining: number | null; max?: number }> {
  const { data, error } = await supabase.rpc('org_consume_naming_quota', { p_password: password, p_session_id: sessionId })
  if (error) throw new Error(extractErr(error))
  const r = data as { allowed?: boolean; remaining?: number | null; max?: number } | null
  return { allowed: r?.allowed === true, remaining: r?.remaining ?? null, max: r?.max }
}

// ── Participant ─────────────────────────────────────────────────────────────

/** Nom de l'association organisatrice, `null` pour une séance Ecclesia. */
export async function getSessionOrganizationName(sessionId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_session_organization_name', { p_session_id: sessionId })
  if (error) return null
  return typeof data === 'string' && data ? data : null
}

/**
 * Hook : nom de l'association organisatrice d'une séance (`null` pendant le
 * chargement et pour une séance Ecclesia). Sert à adapter les libellés côté
 * participant — « mot de passe de l'association » au lieu de « Code
 * Ecclesia », pas de document collaboratif, « Organisé par … ».
 */
export function useSessionOrganizationName(sessionId: string | null | undefined): string | null {
  const [name, setName] = useState<string | null>(null)
  useEffect(() => {
    setName(null)
    if (!sessionId) return
    let cancelled = false
    getSessionOrganizationName(sessionId).then(n => { if (!cancelled) setName(n) })
    return () => { cancelled = true }
  }, [sessionId])
  return name
}

/** Le serveur répond « Code Ecclesia … » quel que soit le code attendu. */
export function orgCodeError(msg: string, orgName: string | null): string {
  return orgName && /code ecclesia/i.test(msg) ? "Mot de passe de l'association incorrect" : msg
}
