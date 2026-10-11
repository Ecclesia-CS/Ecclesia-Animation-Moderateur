import { describe, expect, it } from 'vitest'
import { buildClusters, CLUSTER_MAX } from './allocation'
import { pairingChoicesWith } from './pairings'

// Chantier 165 — duos et trios : ce que l'allocation fait des liens réciproques,
// et la règle « déclarer en retour ». (Les règles de saisie — trio plein refusé,
// nom à venir — vivent en SQL : voir supabase/tests/chantier165_binomes.sql.)

describe('grappes : deux liens qui partagent une personne = un trio', () => {
  it('A–B et A–C forment d\'office le trio {A,B,C}', () => {
    const { clusters, droppedLinks } = buildClusters([['A', 'B'], ['A', 'C']], ['A', 'B', 'C'])
    expect(clusters).toEqual([['A', 'B', 'C']])
    expect(droppedLinks).toBe(0)
  })

  it('une chaîne A–B, B–C est aussi un trio (la personne commune relie les deux liens)', () => {
    const { clusters } = buildClusters([['A', 'B'], ['B', 'C']], ['A', 'B', 'C'])
    expect(clusters).toEqual([['A', 'B', 'C']])
  })

  it('un trio est plein : un quatrième lien est écarté, les plus anciens l\'emportent', () => {
    const { clusters, droppedLinks } = buildClusters(
      [['A', 'B'], ['A', 'C'], ['A', 'D']], ['A', 'B', 'C', 'D'],
    )
    expect(clusters).toEqual([['A', 'B', 'C']])
    expect(droppedLinks).toBe(1)
    expect(CLUSTER_MAX).toBe(3)
  })

  it('deux duos ne fusionnent pas en un groupe de 4', () => {
    const { clusters, droppedLinks } = buildClusters(
      [['A', 'B'], ['C', 'D'], ['B', 'C']], ['A', 'B', 'C', 'D'],
    )
    expect(clusters).toEqual([['A', 'B'], ['C', 'D']])
    expect(droppedLinks).toBe(1)
  })

  it('un modérateur est une personne comme une autre dans une grappe', () => {
    // 'M' (modérateur) n'est pas dans la liste des participants mais dans celle des connus.
    const { clusters } = buildClusters([['M', 'P']], ['P', 'M'])
    expect(clusters).toEqual([['M', 'P']])
  })
})

describe('pairingChoicesWith (déclarer en retour)', () => {
  it('ajoute la personne quand une place est libre', () => {
    expect(pairingChoicesWith([], 'Marie')).toEqual(['Marie'])
    expect(pairingChoicesWith([{ pseudo: 'Paul', reciprocal: true }], 'Marie')).toEqual(['Paul', 'Marie'])
  })

  it('ne duplique pas un choix déjà fait (casse et espaces ignorés)', () => {
    expect(pairingChoicesWith([{ pseudo: 'Marie', reciprocal: false }], ' marie ')).toEqual([' marie '])
  })

  it('deux places prises : remplace le plus ancien choix sans retour', () => {
    const current = [
      { pseudo: 'Paul', reciprocal: true },
      { pseudo: 'Luc', reciprocal: false },
    ]
    expect(pairingChoicesWith(current, 'Marie')).toEqual(['Paul', 'Marie'])
  })

  it('deux liens confirmés : refuse (null) plutôt que d\'en casser un', () => {
    const current = [
      { pseudo: 'Paul', reciprocal: true },
      { pseudo: 'Luc', reciprocal: true },
    ]
    expect(pairingChoicesWith(current, 'Marie')).toBeNull()
  })
})
