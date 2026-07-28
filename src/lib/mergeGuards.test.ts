import { describe, it, expect } from 'vitest'
import { isPartialInclusion, significantWords, normalize } from './mergeGuards'

// Les cas ci-dessous viennent directement de docs/calibrage-fusion-assertions.md
// (arbitrages de Jules du 2026-07-28). Ils font office de non-régression : si
// l'un d'eux casse, c'est le garde-fou qui s'écarte des verdicts, pas l'inverse.

describe('normalisation', () => {
  it('retire accents, ponctuation et casse', () => {
    expect(normalize('La publicité, c\'est pas bien.')).toBe('la publicite c est pas bien')
  })

  it('ne garde que les mots porteurs de sens', () => {
    expect(significantWords('La publicité est envahissante')).toEqual(['publicite', 'envahissante'])
  })
})

describe('isPartialInclusion — DOIT bloquer (verdict 21 du calibrage)', () => {
  it('bloque le cas 21 : deux adjectifs coordonnés vs un seul', () => {
    expect(isPartialInclusion(
      'La publicité est envahissante et manipulatrice',
      'La publicité est envahissante',
    )).toBe(true)
  })

  it('bloque le cas resté ouvert depuis le chantier 7 (CONSTAT coordonné)', () => {
    expect(isPartialInclusion(
      'La publicité permet de générer des revenus et de financer des projets.',
      'La pub permet de financer des projets',
    )).toBe(true)
  })

  it('est symétrique : l\'ordre des arguments ne change rien', () => {
    expect(isPartialInclusion(
      'La publicité est envahissante',
      'La publicité est envahissante et manipulatrice',
    )).toBe(true)
  })
})

describe('isPartialInclusion — NE DOIT PAS bloquer les 5 fusions validées', () => {
  it('cas 3 — reformulation verbe/adjectif', () => {
    expect(isPartialInclusion(
      'La publicité manipule les gens',
      'La publicité est manipulatrice',
    )).toBe(false)
  })

  it('cas 12 — actif/passif', () => {
    expect(isPartialInclusion(
      'Il faut taxer la publicité',
      'La publicité devrait être taxée',
    )).toBe(false)
  })

  it('cas 13 — registre familier/soutenu', () => {
    expect(isPartialInclusion(
      'La pub, faut arrêter ça',
      'Il faut mettre fin à la publicité',
    )).toBe(false)
  })

  it('cas 15 — double négation', () => {
    expect(isPartialInclusion(
      'La publicité ne devrait pas être interdite',
      'La publicité doit rester autorisée',
    )).toBe(false)
  })

  it('cas 22 — cadrage personnel vs général', () => {
    expect(isPartialInclusion(
      'Je trouve la publicité agaçante',
      'La publicité est agaçante',
    )).toBe(false)
  })
})

describe('isPartialInclusion — cas limites', () => {
  it('ne bloque pas deux assertions identiques', () => {
    expect(isPartialInclusion(
      'La publicité est envahissante et manipulatrice',
      'La publicité est envahissante et manipulatrice',
    )).toBe(false)
  })

  it('ne bloque pas sans coordination, même si une assertion est plus longue', () => {
    expect(isPartialInclusion(
      'Il faut réglementer la publicité car elle est mensongère',
      'Il faut réglementer la publicité',
    )).toBe(false)
  })

  it('ne bloque pas quand le supplément est réparti des deux côtés du « et »', () => {
    expect(isPartialInclusion(
      'La publicité manipule les enfants et détruit la planète',
      'La publicité est un problème',
    )).toBe(false)
  })

  it('gère une assertion vide sans planter', () => {
    expect(isPartialInclusion('La publicité est envahissante et manipulatrice', '')).toBe(false)
  })
})
