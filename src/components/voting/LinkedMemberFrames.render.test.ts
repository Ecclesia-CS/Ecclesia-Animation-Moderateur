import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LinkedMemberFrames, ModeratorLinkBadge, clusterColorFor } from './LinkedMemberFrames'

// Chantier 165 — rendu réel (sans navigateur) de ce que voit le superadmin :
// le cadre autour d'un participant lié au modérateur de sa table, et le badge
// « lié à … » sur le modérateur. Le superadmin se connecte par mot de passe, que
// la session de développement n'a pas : ce rendu statique couvre le balisage.

const mk = (clusters: string[][]) => {
  const m = new Map<string, string[]>()
  for (const c of clusters) for (const id of c) m.set(id, c)
  return m
}

describe('rendu du lien participant ↔ modérateur (chantier 165)', () => {
  it('le participant lié au modérateur de sa table est encadré, avec la mention « avec <modérateur> »', () => {
    const html = renderToStaticMarkup(createElement(LinkedMemberFrames<{ id: string; pseudo: string }>, {
      items: [{ id: 'p', pseudo: 'Paul' }, { id: 'x', pseudo: 'Xavier' }],
      idOf: m => m.id,
      pseudoOf: m => m.pseudo,
      clusterOf: mk([['mod', 'p']]),
      outside: new Map([['mod', 'Marc']]),
      renderItem: m => createElement('span', { key: m.id }, m.pseudo),
    }))
    expect(html).toContain('data-testid="linked-frame"')
    expect(html).toContain('🎙️ avec Marc')
    expect(html).toContain('Marc (modérateur)')
    // Xavier n'est lié à personne : il reste hors cadre.
    expect(html.indexOf('Xavier')).toBeGreaterThan(html.indexOf('</div>'))
  })

  it('sans la mention du modérateur à la table, aucun cadre n\'apparaît', () => {
    const html = renderToStaticMarkup(createElement(LinkedMemberFrames<{ id: string; pseudo: string }>, {
      items: [{ id: 'p', pseudo: 'Paul' }],
      idOf: m => m.id,
      pseudoOf: m => m.pseudo,
      clusterOf: mk([['mod', 'p']]),
      renderItem: m => createElement('span', { key: m.id }, m.pseudo),
    }))
    expect(html).not.toContain('linked-frame')
  })

  it('le badge du modérateur nomme ses binômes et porte la couleur du cadre', () => {
    const cluster = ['mod', 'p', 'q']
    const html = renderToStaticMarkup(createElement(ModeratorLinkBadge, {
      memberId: 'mod',
      clusterOf: mk([cluster]),
      pseudoOf: id => ({ p: 'Paul', q: 'Quentin' } as Record<string, string>)[id] ?? '?',
    }))
    expect(html).toContain('data-testid="moderator-link-badge"')
    expect(html).toContain('lié à Paul, Quentin')
    expect(html).toContain(clusterColorFor(cluster))
  })

  it('pas de badge pour un modérateur sans binôme', () => {
    const html = renderToStaticMarkup(createElement(ModeratorLinkBadge, {
      memberId: 'mod', clusterOf: new Map(), pseudoOf: () => '?',
    }))
    expect(html).toBe('')
  })
})
