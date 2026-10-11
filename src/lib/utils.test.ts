import { describe, it, expect } from 'vitest'
import { initiales, titreSeance } from './utils'

// Chantier 168 : aucun tiret cadratin à l'écran, même dans un titre saisi
// avec (« QA Vérifs — Débat ») ; le titre en base reste tel quel.
describe('titreSeance', () => {
  it('remplace le tiret cadratin par un point médian', () => {
    expect(titreSeance('QA Vérifs — Débat')).toBe('QA Vérifs · Débat')
    expect(titreSeance('Débat—Énergie')).toBe('Débat · Énergie')
  })
  it('remplace le demi-cadratin employé comme séparateur', () => {
    expect(titreSeance('Héritage – Table ronde')).toBe('Héritage · Table ronde')
  })
  it('laisse les intervalles et les traits d\'union', () => {
    expect(titreSeance('Saison 2025–2026')).toBe('Saison 2025–2026')
    expect(titreSeance('Débat Sainte-Geneviève')).toBe('Débat Sainte-Geneviève')
  })
})

describe('initiales', () => {
  it('prend la première lettre des deux premiers mots', () => {
    expect(initiales('Antoine DOUMAS')).toBe('AD')
    expect(initiales('Jean-Pierre Martin')).toBe('JP')
    expect(initiales('  léa  ')).toBe('L')
  })
  it('garde un caractère entier hors du plan de base', () => {
    expect(initiales('🙂 Zoé')).toBe('🙂Z')
  })
  it('ne renvoie jamais une pastille vide', () => {
    expect(initiales('   ')).toBe('?')
  })
})
