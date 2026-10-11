import { describe, it, expect, vi, beforeEach } from 'vitest'

// Chantier 158 — le code de rappel d'une inscription ne doit pas être perdu quand
// la déclaration « Je suis modérateur » est jouée juste après.
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { rpc } }))

import { tryClaimModeratorStatus } from './voting'
import type { SessionMember } from './types'

const registered = { id: 'm1', pseudo: 'Alice Test', is_moderator: false, new_reclaim_code: '4321' } as SessionMember

describe('tryClaimModeratorStatus', () => {
  beforeEach(() => rpc.mockReset())

  it('reporte le code de l\'inscription quand le profil existait déjà (claim → new_reclaim_code null)', async () => {
    rpc.mockResolvedValue({ data: { id: 'm1', pseudo: 'Alice Test', is_moderator: true, new_reclaim_code: null }, error: null })
    const { member, error } = await tryClaimModeratorStatus('s1', 'code', 'Alice Test', registered)
    expect(error).toBeNull()
    expect(member?.is_moderator).toBe(true)
    expect(member?.new_reclaim_code).toBe('4321')
  })

  it('garde le code du claim quand c\'est lui qui a créé le profil', async () => {
    rpc.mockResolvedValue({ data: { id: 'm2', pseudo: 'Bob', is_moderator: true, new_reclaim_code: '9999' }, error: null })
    const { member } = await tryClaimModeratorStatus('s1', 'code', 'Bob', registered)
    expect(member?.new_reclaim_code).toBe('9999')
  })

  it('sans membre précédent, pas de code inventé', async () => {
    rpc.mockResolvedValue({ data: { id: 'm1', pseudo: 'Alice Test', is_moderator: true }, error: null })
    const { member } = await tryClaimModeratorStatus('s1', 'code', 'Alice Test')
    expect(member?.new_reclaim_code).toBeNull()
  })

  it('un mot de passe refusé ne renvoie aucun membre', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Code Ecclesia incorrect' } })
    const { member, error } = await tryClaimModeratorStatus('s1', 'x', 'Alice Test', registered)
    expect(member).toBeNull()
    expect(error).toBeTruthy()
  })
})
