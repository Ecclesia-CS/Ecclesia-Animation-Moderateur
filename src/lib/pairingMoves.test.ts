import { describe, expect, it } from 'vitest'
import { planLinkedMove, isEmptyPlan, type MovableGroup } from './pairingMoves'

const mk = (clusters: string[][]) => {
  const m = new Map<string, string[]>()
  for (const c of clusters) for (const id of c) m.set(id, c)
  return m
}
const part = (id: string) => ({ member_id: id, pseudo: id, is_moderator: false, active: false })
const animator = (id: string) => ({ member_id: id, pseudo: id, is_moderator: true, active: true })
const surplus = (id: string) => ({ member_id: id, pseudo: id, is_moderator: true, active: false })

// Table 1 animée par M1 avec P1 (lié à M1) ; table 2 animée par M2 avec P2.
const groups: MovableGroup[] = [
  { table_number: 1, members: [animator('M1'), part('P1'), part('X1')] },
  { table_number: 2, members: [animator('M2'), part('P2'), part('X2')] },
]

describe('planLinkedMove — participant déposé sur une table (chantier 165)', () => {
  it('son modérateur lié le suit et anime la table d\'arrivée, l\'animateur en place est remplacé', () => {
    const plan = planLinkedMove(groups, mk([['M1', 'P1']]), 'P1', 2, 'drop')
    expect(plan.animatorId).toBe('M1')
    expect(plan.moveIds).toEqual(['P1'])
    expect(plan.replacedIds).toEqual(['M2'])
    expect(plan.animatorFromTable).toBe(1)
  })

  it('sans lien avec un modérateur : il bouge seul, personne n\'est remplacé', () => {
    const plan = planLinkedMove(groups, mk([]), 'X1', 2, 'drop')
    expect(plan.animatorId).toBeNull()
    expect(plan.moveIds).toEqual(['X1'])
    expect(plan.replacedIds).toEqual([])
  })

  it('lié à un autre participant : les deux bougent, aucune désignation', () => {
    const plan = planLinkedMove(groups, mk([['P1', 'X1']]), 'P1', 2, 'drop')
    expect(plan.animatorId).toBeNull()
    expect([...plan.moveIds].sort()).toEqual(['P1', 'X1'])
  })

  it('trio modérateur + deux participants : tout le trio part, le modérateur anime', () => {
    const plan = planLinkedMove(groups, mk([['M1', 'P1', 'X1']]), 'X1', 2, 'drop')
    expect(plan.animatorId).toBe('M1')
    expect([...plan.moveIds].sort()).toEqual(['P1', 'X1'])
  })

  it('le modérateur lié est déjà animateur de la table d\'arrivée : on ne désigne personne', () => {
    // P1 est assis table 1 mais son modérateur M2 anime la table 2.
    const plan = planLinkedMove(groups, mk([['M2', 'P1']]), 'P1', 2, 'drop')
    expect(plan.animatorId).toBeNull()
    expect(plan.moveIds).toEqual(['P1'])
    expect(plan.replacedIds).toEqual([])
  })

  it('table d\'arrivée sans animateur : rien à remplacer', () => {
    const g: MovableGroup[] = [...groups, { table_number: 3, members: [part('X3')] }]
    const plan = planLinkedMove(g, mk([['M1', 'P1']]), 'P1', 3, 'drop')
    expect(plan.animatorId).toBe('M1')
    expect(plan.replacedIds).toEqual([])
  })

  it('un modérateur en surplus lié suit comme un simple participant', () => {
    const g: MovableGroup[] = [
      { table_number: 1, members: [part('P1'), surplus('S1')] },
      { table_number: 2, members: [animator('M2')] },
    ]
    const plan = planLinkedMove(g, mk([['P1', 'S1']]), 'P1', 2, 'drop')
    expect(plan.animatorId).toBeNull()
    expect([...plan.moveIds].sort()).toEqual(['P1', 'S1'])
    expect(plan.replacedIds).toEqual([])
  })

  it('deux animateurs dans la grappe : celui qu\'on déplace l\'emporte', () => {
    const plan = planLinkedMove(groups, mk([['M1', 'M2']]), 'M2', 1, 'drop')
    expect(plan.animatorId).toBe('M2')
    expect(plan.moveIds).toEqual([])
  })

  it('les membres de la grappe qui ne sont assis nulle part sont ignorés', () => {
    const plan = planLinkedMove(groups, mk([['P1', 'GHOST']]), 'P1', 2, 'drop')
    expect(plan.moveIds).toEqual(['P1'])
  })

  it('déjà à la table cible : plan vide', () => {
    const plan = planLinkedMove(groups, mk([]), 'X2', 2, 'drop')
    expect(isEmptyPlan(plan)).toBe(true)
  })
})

describe('planLinkedMove — modérateur désigné animateur d\'une table (chantier 165)', () => {
  it('ses binômes assis ailleurs viennent avec lui', () => {
    const plan = planLinkedMove(groups, mk([['M1', 'P1']]), 'M1', 2, 'assign')
    expect(plan.animatorId).toBe('M1')
    expect(plan.moveIds).toEqual(['P1'])
    expect(plan.replacedIds).toEqual(['M2'])
  })

  it('un binôme déjà à la table cible ne bouge pas', () => {
    const plan = planLinkedMove(groups, mk([['M1', 'P2']]), 'M1', 2, 'assign')
    expect(plan.moveIds).toEqual([])
    expect(plan.animatorId).toBe('M1')
  })

  it('un participant désigné modérateur, jusque-là non assis : il n\'est pas « déplacé », seulement désigné', () => {
    const plan = planLinkedMove(groups, mk([['NEW', 'P1']]), 'NEW', 2, 'assign')
    expect(plan.animatorId).toBe('NEW')
    expect(plan.moveIds).toEqual(['P1'])
    expect(plan.animatorFromTable).toBeNull()
  })

  it('déjà animateur de cette table : plan vide', () => {
    const plan = planLinkedMove(groups, mk([]), 'M2', 2, 'assign')
    expect(isEmptyPlan(plan)).toBe(true)
  })
})
