import { describe, expect, it } from 'vitest'
import { segmentByCluster, clusterColorFor } from './LinkedMemberFrames'

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

describe('segmentByCluster — modérateur lié, hors de la liste (chantier 165)', () => {
  const outside = new Map([['mod', 'Marc']])

  it('un participant seul avec son modérateur est bien encadré', () => {
    const segs = segmentByCluster(['a', 'x'], id => id, mk([['a', 'mod']]), outside)
    expect(segs[0].color).not.toBeNull()
    expect(segs[0].items).toEqual(['a'])
    expect(segs[0].outsideNames).toEqual(['Marc'])
    expect(segs[1].color).toBeNull()
  })

  it("sans le modérateur à la table, le même participant n'est pas encadré", () => {
    const segs = segmentByCluster(['a', 'x'], id => id, mk([['a', 'mod']]))
    expect(segs.every(s => s.color === null)).toBe(true)
  })

  it('le trio modérateur + 2 participants : un seul cadre pour les deux participants', () => {
    const segs = segmentByCluster(['a', 'b', 'x'], id => id, mk([['a', 'b', 'mod']]), outside)
    expect(segs).toHaveLength(2)
    expect(segs[0].items).toEqual(['a', 'b'])
    expect(segs[0].outsideNames).toEqual(['Marc'])
  })

  it('la couleur du cadre est celle du badge du modérateur', () => {
    const cluster = ['a', 'mod']
    const segs = segmentByCluster(['a'], id => id, mk([cluster]), outside)
    expect(segs[0].color).toBe(clusterColorFor(cluster))
  })

  it("deux grappes sur la table : celle du modérateur garde sa couleur naturelle, l'autre s'écarte", () => {
    const modCluster = ['a', 'mod']
    const other = ['c', 'd']
    const segs = segmentByCluster(['a', 'c', 'd'], id => id, mk([modCluster, other]), outside)
    const modSeg = segs.find(s => s.items.includes('a'))!
    const otherSeg = segs.find(s => s.items.includes('c'))!
    expect(modSeg.color).toBe(clusterColorFor(modCluster))
    expect(otherSeg.color).not.toBe(modSeg.color)
  })
})

