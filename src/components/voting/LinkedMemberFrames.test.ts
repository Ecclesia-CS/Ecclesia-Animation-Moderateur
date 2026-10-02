import { describe, expect, it } from 'vitest'
import { segmentByCluster } from './LinkedMemberFrames'

const mk = (clusters: string[][]) => {
  const m = new Map<string, string[]>()
  for (const c of clusters) for (const id of c) m.set(id, c)
  return m
}

describe('segmentByCluster (chantier 149)', () => {
  it('regroupe les membres d\'une même grappe dans un cadre, ordre conservé', () => {
    const items = ['a', 'x', 'b', 'y']
    const segs = segmentByCluster(items, id => id, mk([['a', 'b']]))
    expect(segs.map(s => s.items)).toEqual([['a', 'b'], ['x'], ['y']])
    expect(segs[0].color).not.toBeNull()
    expect(segs[1].color).toBeNull()
  })

  it('pas de cadre pour une personne seule de sa grappe à cette table', () => {
    const segs = segmentByCluster(['a', 'x'], id => id, mk([['a', 'b']]))
    expect(segs.every(s => s.color === null)).toBe(true)
  })

  it('deux grappes d\'une même table ont des couleurs différentes', () => {
    const segs = segmentByCluster(
      ['a', 'b', 'c', 'd'], id => id, mk([['a', 'b'], ['c', 'd']]),
    )
    expect(segs).toHaveLength(2)
    expect(segs[0].color).not.toBe(segs[1].color)
  })

  it('même grappe, même couleur d\'une table à l\'autre', () => {
    const map = mk([['a', 'b', 'c']])
    const t1 = segmentByCluster(['a', 'b'], id => id, map)
    const t2 = segmentByCluster(['b', 'c'], id => id, map)
    expect(t1[0].color).toBe(t2[0].color)
  })

  it('ignore les membres sans identifiant (modérateur physique)', () => {
    const segs = segmentByCluster([null, 'a'], id => id, mk([['a', 'b']]))
    expect(segs.map(s => s.items)).toEqual([[null], ['a']])
  })
})
