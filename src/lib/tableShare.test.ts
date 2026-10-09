import { describe, expect, it } from 'vitest'
import { hostOf, normalizeSessionShares, normalizeTableShares, withHttps } from './tableShareFormat'

describe('withHttps', () => {
  it('ajoute https:// à un domaine nu', () => {
    expect(withHttps('www.exemple.fr/page')).toBe('https://www.exemple.fr/page')
    expect(withHttps('  exemple.fr ')).toBe('https://exemple.fr')
  })
  it('garde un schéma déjà présent (le serveur reste juge)', () => {
    expect(withHttps('http://exemple.fr')).toBe('http://exemple.fr')
    expect(withHttps('javascript:alert(1)')).toBe('javascript:alert(1)')
  })
  it('ne touche pas à un texte avec espaces', () => {
    expect(withHttps('pas un lien')).toBe('pas un lien')
    expect(withHttps('')).toBe('')
  })
})

describe('hostOf', () => {
  it('renvoie le domaine sans www', () => {
    expect(hostOf('https://www.lemonde.fr/article')).toBe('lemonde.fr')
  })
  it('renvoie une chaîne vide si illisible', () => {
    expect(hostOf('pas une url')).toBe('')
  })
})

describe('normalizeTableShares', () => {
  const ok = {
    id: 'a', kind: 'link', title: 'Titre', url: 'https://x.fr', content: null,
    status: 'accepted', author_pseudo: 'Marie', is_mine: true, is_active: false,
    created_at: '2026-10-09T10:00:00Z', decided_at: null,
  }
  it('garde une ligne valide', () => {
    expect(normalizeTableShares([ok])).toHaveLength(1)
  })
  it('ignore les lignes illisibles au lieu de planter', () => {
    expect(normalizeTableShares([null, 3, { ...ok, kind: 'ecran' }, { ...ok, status: 'x' }, { ...ok, title: 4 }])).toEqual([])
    expect(normalizeTableShares(null)).toEqual([])
  })
  it('lit une image (chemin) et une image effacée', () => {
    const [a, b] = normalizeTableShares([
      { ...ok, kind: 'image', url: null, image_path: 't/s' },
      { ...ok, id: 'b', kind: 'image', url: null, image_path: null, image_purged: true },
    ])
    expect(a.image_path).toBe('t/s')
    expect(a.image_purged).toBe(false)
    expect(b.image_path).toBeNull()
    expect(b.image_purged).toBe(true)
  })
  it('tolère les champs nullables absents', () => {
    const [r] = normalizeTableShares([{ ...ok, url: undefined, content: undefined, decided_at: undefined }])
    expect(r.url).toBeNull()
    expect(r.content).toBeNull()
    expect(r.decided_at).toBeNull()
  })
})

describe('normalizeSessionShares', () => {
  it('ignore ce qui n’a pas de table', () => {
    expect(normalizeSessionShares([{ id: 'a', title: 't', kind: 'link' }])).toEqual([])
  })
})
