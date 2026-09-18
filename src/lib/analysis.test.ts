import { describe, it, expect } from 'vitest'
import { pairGroups, computeMemberMovements, computeConsensusMovements, normalizeLoadedAnalysis } from './analysis'
import type { LoadedAnalysis } from './analysis'

function analysis(
  members: { member_id: string; group_id: number }[],
  groupConsensus: Record<string, number> = {},
): LoadedAnalysis {
  return {
    id: 'test',
    k_chosen: new Set(members.map(m => m.group_id)).size,
    silhouette_score: 0,
    pca_variance_explained: [0, 0],
    repness: {},
    group_consensus: groupConsensus,
    created_at: new Date().toISOString(),
    vote_scope: 'current',
    members: members.map(m => ({ ...m, pca_x: 0, pca_y: 0 })),
  }
}

describe('pairGroups', () => {
  it('apparie les groupes par composition même si la numérotation est inversée', () => {
    // a : groupe 0 = {m1,m2,m3}, groupe 1 = {m4,m5,m6}
    // b : mêmes personnes mais k-means a inversé les numéros
    const a = analysis([
      { member_id: 'm1', group_id: 0 }, { member_id: 'm2', group_id: 0 }, { member_id: 'm3', group_id: 0 },
      { member_id: 'm4', group_id: 1 }, { member_id: 'm5', group_id: 1 }, { member_id: 'm6', group_id: 1 },
    ])
    const b = analysis([
      { member_id: 'm1', group_id: 1 }, { member_id: 'm2', group_id: 1 }, { member_id: 'm3', group_id: 1 },
      { member_id: 'm4', group_id: 0 }, { member_id: 'm5', group_id: 0 }, { member_id: 'm6', group_id: 0 },
    ])

    const pairings = pairGroups(a, b)

    expect(pairings).toHaveLength(2)
    expect(pairings.find(p => p.aGroupId === 0)?.bGroupId).toBe(1)
    expect(pairings.find(p => p.aGroupId === 1)?.bGroupId).toBe(0)
    expect(pairings.find(p => p.aGroupId === 0)?.overlapCount).toBe(3)
  })

  it("laisse bGroupId null quand aucun membre du groupe n'a de vote après", () => {
    const a = analysis([{ member_id: 'm1', group_id: 0 }, { member_id: 'm2', group_id: 0 }])
    const b = analysis([{ member_id: 'm3', group_id: 0 }])

    const pairings = pairGroups(a, b)

    expect(pairings[0].bGroupId).toBeNull()
    expect(pairings[0].overlapCount).toBe(0)
  })
})

describe('computeMemberMovements', () => {
  it('distingue "resté dans son camp apparié", "changé de camp" et "absent après"', () => {
    const a = analysis([
      { member_id: 'stayer',  group_id: 0 },
      { member_id: 'mover',   group_id: 0 },
      { member_id: 'ghost',   group_id: 0 },
    ])
    const b = analysis([
      { member_id: 'stayer', group_id: 1 }, // camp 0 de a est apparié à camp 1 de b
      { member_id: 'mover',  group_id: 2 }, // change de camp
      // 'ghost' absent de b — n'a pas revoté
      { member_id: 'other1', group_id: 1 },
      { member_id: 'other2', group_id: 2 },
    ])

    const pairings = pairGroups(a, b)
    const movements = computeMemberMovements(a, b, pairings)

    const stayer = movements.find(m => m.memberId === 'stayer')!
    const mover  = movements.find(m => m.memberId === 'mover')!
    const ghost  = movements.find(m => m.memberId === 'ghost')!

    expect(stayer.stayed).toBe(true)
    expect(mover.bGroupId).not.toBeNull()
    expect(ghost.bGroupId).toBeNull()
    expect(ghost.stayed).toBe(false)
  })
})

describe('computeConsensusMovements', () => {
  it('calcule le delta uniquement pour les assertions présentes dans les deux analyses', () => {
    const a = analysis([], { a1: 0.2, a2: 0.8, a3: 0.5 })
    const b = analysis([], { a1: 0.6, a2: 0.75 }) // a3 absente de b (supprimée après coup)

    const movements = computeConsensusMovements(a, b)

    expect(movements).toHaveLength(2)
    const m1 = movements.find(m => m.assertionId === 'a1')!
    expect(m1.delta).toBeCloseTo(0.4)
    expect(movements.find(m => m.assertionId === 'a3')).toBeUndefined()
  })
})

// Régression — page blanche du 2026-09-18 (onglet Analyse du superadmin).
// Les RPC héritées run_clustering_v1/v2, toujours en base depuis le chantier 37,
// créent des lignes session_analysis dont silhouette_score, pca_variance_explained,
// repness et group_consensus sont NULL. Le cast `as LoadedAnalysis` laissait ces
// null filer jusqu'au rendu : Object.entries(null) et silhouette_score.toFixed().
describe('normalizeLoadedAnalysis — analyse issue des RPC héritées', () => {
  // Forme exacte renvoyée pour la séance « Test chantier 94 » : coordonnées et
  // groupes valides, mais les quatre colonnes calculées à NULL.
  const legacyRow = {
    id: '6b72b774',
    k_chosen: 3,
    silhouette_score: null,
    pca_variance_explained: null,
    repness: null,
    group_consensus: null,
    created_at: '2026-09-16T20:37:22Z',
    vote_scope: 'current',
    members: [{ member_id: 'm1', pca_x: -0.96, pca_y: 0.59, group_id: 0 }],
  }

  it('ramène les deux dictionnaires à un vide traversable sans garde', () => {
    const a = normalizeLoadedAnalysis(legacyRow)
    expect(a.repness).toEqual({})
    expect(a.group_consensus).toEqual({})
    expect(() => Object.entries(a.group_consensus)).not.toThrow()
  })

  it('laisse les deux métriques scalaires à null plutôt que d’inventer un 0', () => {
    const a = normalizeLoadedAnalysis(legacyRow)
    expect(a.silhouette_score).toBeNull()
    expect(a.pca_variance_explained).toBeNull()
    // Ce que fait l'affichage : « n/c » au lieu de planter.
    expect(a.silhouette_score?.toFixed(3) ?? 'n/c').toBe('n/c')
  })

  it('préserve les données réellement présentes', () => {
    const a = normalizeLoadedAnalysis(legacyRow)
    expect(a.k_chosen).toBe(3)
    expect(a.members).toHaveLength(1)
    expect(a.members[0].pca_x).toBeCloseTo(-0.96)
  })

  it('tolère un tableau de membres absent', () => {
    const a = normalizeLoadedAnalysis({ ...legacyRow, members: null })
    expect(a.members).toEqual([])
  })
})
