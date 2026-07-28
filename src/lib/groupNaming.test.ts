// =============================================================
// groupNaming — tests des fonctions pures (chantier 28 / H26 + H9)
//
// `generateGroupNames` n'est pas testée ici : elle appelle Gemini via
// l'Edge Function (quota). Seules les briques déterministes le sont.
// =============================================================

import { describe, it, expect } from 'vitest'
import {
  namingGroupsFromAnalysis,
  groupsFingerprint,
  discriminatingAssertions,
  deriveFallbackName,
} from './groupNaming'
import type { NamingVote, NamingAssertion } from './groupNaming'

describe('namingGroupsFromAnalysis (H26)', () => {
  it('mappe group_id 0-indexé → table_number 1-indexé, trié', () => {
    const groups = namingGroupsFromAnalysis([
      { member_id: 'a', group_id: 2 },
      { member_id: 'b', group_id: 0 },
      { member_id: 'c', group_id: 2 },
      { member_id: 'd', group_id: 1 },
    ])
    expect(groups.map(g => g.table_number)).toEqual([1, 2, 3])
    expect(groups.find(g => g.table_number === 3)!.member_ids.sort()).toEqual(['a', 'c'])
  })

  it('produit autant de groupes que de clusters, indépendamment du nombre de tables physiques', () => {
    // Le cœur de H26 : 5 clusters d'opinion pour 3 tables physiques.
    // Le nommage doit couvrir les 5, sinon les camps 4 et 5 restent anonymes
    // sur l'écran de résultats (qui indexe par group_id + 1).
    const members = Array.from({ length: 25 }, (_, i) => ({
      member_id: `m${i}`,
      group_id:  i % 5,
    }))
    expect(namingGroupsFromAnalysis(members).map(g => g.table_number)).toEqual([1, 2, 3, 4, 5])
  })

  it('retourne un tableau vide sans membres', () => {
    expect(namingGroupsFromAnalysis([])).toEqual([])
  })
})

describe('groupsFingerprint', () => {
  it('est stable quel que soit l’ordre des membres et des groupes', () => {
    const a = groupsFingerprint([
      { table_number: 2, member_ids: ['y', 'x'] },
      { table_number: 1, member_ids: ['a', 'b'] },
    ])
    const b = groupsFingerprint([
      { table_number: 1, member_ids: ['b', 'a'] },
      { table_number: 2, member_ids: ['x', 'y'] },
    ])
    expect(a).toBe(b)
  })

  it('change si la composition change', () => {
    const a = groupsFingerprint([{ table_number: 1, member_ids: ['a', 'b'] }])
    const b = groupsFingerprint([{ table_number: 1, member_ids: ['a', 'c'] }])
    expect(a).not.toBe(b)
  })

  it('distingue un nommage par clusters (5) d’un nommage par tables physiques (3)', () => {
    const clusters = namingGroupsFromAnalysis(
      Array.from({ length: 10 }, (_, i) => ({ member_id: `m${i}`, group_id: i % 5 })),
    )
    const tables = namingGroupsFromAnalysis(
      Array.from({ length: 10 }, (_, i) => ({ member_id: `m${i}`, group_id: i % 3 })),
    )
    expect(groupsFingerprint(clusters)).not.toBe(groupsFingerprint(tables))
  })
})

describe('discriminatingAssertions (H9)', () => {
  const assertions: NamingAssertion[] = [
    { id: 'a1', content: 'Interdire la publicité' },
    { id: 'a2', content: 'Tout le monde est d’accord là-dessus' },
    { id: 'a3', content: 'Assertion sans vote du camp cible' },
  ]

  // Camp cible = m1,m2 ; reste = m3,m4
  const votes: NamingVote[] = [
    // a1 : le camp cible est pour, les autres contre → très discriminante
    { member_id: 'm1', assertion_id: 'a1', vote: 'agree' },
    { member_id: 'm2', assertion_id: 'a1', vote: 'agree' },
    { member_id: 'm3', assertion_id: 'a1', vote: 'disagree' },
    { member_id: 'm4', assertion_id: 'a1', vote: 'disagree' },
    // a2 : tout le monde d'accord → non discriminante
    { member_id: 'm1', assertion_id: 'a2', vote: 'agree' },
    { member_id: 'm2', assertion_id: 'a2', vote: 'agree' },
    { member_id: 'm3', assertion_id: 'a2', vote: 'agree' },
    { member_id: 'm4', assertion_id: 'a2', vote: 'agree' },
    // a3 : personne du camp cible n'a voté → écartée
    { member_id: 'm3', assertion_id: 'a3', vote: 'agree' },
  ]

  it('remonte l’assertion clivante en tête', () => {
    const top = discriminatingAssertions(['m1', 'm2'], votes, assertions)
    expect(top[0].id).toBe('a1')
  })

  it('écarte les assertions consensuelles et celles sans vote du camp', () => {
    const top = discriminatingAssertions(['m1', 'm2'], votes, assertions)
    expect(top.map(a => a.id)).not.toContain('a2')
    expect(top.map(a => a.id)).not.toContain('a3')
  })

  it('respecte topN', () => {
    expect(discriminatingAssertions(['m1', 'm2'], votes, assertions, 1)).toHaveLength(1)
  })

  it('retourne une liste vide si le camp est toute la population (aucun « hors camp »)', () => {
    expect(discriminatingAssertions(['m1', 'm2', 'm3', 'm4'], votes, assertions)).toEqual([])
  })
})

describe('deriveFallbackName', () => {
  const assertions: NamingAssertion[] = [{ id: 'a1', content: 'Interdire la publicité en ville' }]

  it('ne retourne jamais « Groupe N »', () => {
    const r = deriveFallbackName(
      ['m1'],
      [{ member_id: 'm1', assertion_id: 'a1', vote: 'agree' }],
      assertions,
    )
    expect(r.name).not.toMatch(/^groupe\s*\d+$/i)
    expect(r.name).toContain('Plutôt pour')
  })

  it('bascule sur « Camp peu tranché » quand aucune position nette', () => {
    const r = deriveFallbackName(
      ['m1', 'm2'],
      [
        { member_id: 'm1', assertion_id: 'a1', vote: 'agree' },
        { member_id: 'm2', assertion_id: 'a1', vote: 'disagree' },
      ],
      assertions,
    )
    expect(r.name).toBe('Camp peu tranché')
  })
})
