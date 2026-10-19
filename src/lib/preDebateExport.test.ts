import { describe, it, expect } from 'vitest'
import { buildPreDebateExport, matchGroupNames, PRE_DEBATE_FORMAT } from './preDebateExport'
import type { AnalysisResult, LoadedAnalysis, VoteRow } from './analysis'

// Deux camps de 3 : m1-m3 (camp 0) et m4-m6 (camp 1).
const members = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']
const camp = (m: string) => (members.indexOf(m) < 3 ? 0 : 1)

function analysis(groupOf: (m: string) => number = camp): AnalysisResult {
  return {
    kChosen: 2, silhouette: 0.5, pcaVariance: [0.4, 0.2], repness: {}, groupConsensus: {}, consensusProduct: {},
    validity: { silhouette: 0.5, nullSilhouette95: 0.4, pValue: 0.01, replicates: 200, stabilityAri: 0.9, stabilityReplicates: 100, verdict: 'nets' },
    members: members.map((m, i) => ({ member_id: m, pca_x: groupOf(m) === 0 ? -1 - i / 10 : 1 + i / 10, pca_y: i / 10, group_id: groupOf(m) })),
  }
}

/** votes('a1', 'aaa ddd') : m1..m6 votent dans l'ordre (a = agree, d = disagree, p = pass, b = blank, - = rien). */
function votes(aid: string, pattern: string): VoteRow[] {
  const code = { a: 'agree', d: 'disagree', p: 'pass', b: 'blank' } as const
  return pattern.replace(/ /g, '').split('').flatMap((c, i) =>
    c === '-' ? [] : [{ member_id: members[i], assertion_id: aid, vote: code[c as keyof typeof code] }])
}

const texts = new Map([
  ['tous_pour', 'Tout le monde est pour'],
  ['tous_contre', 'Tout le monde est contre'],
  ['clivant', 'Un camp pour, l’autre contre'],
  ['mou', 'Assez partagé'],
  ['rare', 'Trop peu de votes'],
])

function build(extra: Partial<Parameters<typeof buildPreDebateExport>[0]> = {}) {
  return buildPreDebateExport({
    title: 'Séance test', sessionDate: '2026-10-01', exportedAt: '2026-10-19T10:00:00Z',
    votes: [
      ...votes('tous_pour', 'aaa aaa'),
      ...votes('tous_contre', 'ddd ddp'),
      ...votes('clivant', 'aaa ddd'),
      ...votes('mou', 'aad add'),
      ...votes('rare', 'a-- ---'),
    ],
    assertions: texts, analysis: analysis(), ...extra,
  })
}

describe('buildPreDebateExport', () => {
  it('classe adhésion et rejet unanimes en tête des consensus', () => {
    const out = build()
    expect(out.format).toBe(PRE_DEBATE_FORMAT)
    expect(out.consensus.map(c => [c.enonce, c.sens])).toEqual([
      ['Tout le monde est pour', 'adhesion'],
      ['Tout le monde est contre', 'rejet'],
      ['Assez partagé', 'adhesion'],
    ])
    expect(out.consensus[1]).toMatchObject({ pour: 0, contre: 5, abstention: 1, score: 1 })
  })

  it('met en tête des dissensus ce qui oppose les camps, pas ce qui est partagé', () => {
    const out = build()
    expect(out.dissensus[0]).toMatchObject({ enonce: 'Un camp pour, l’autre contre', score: 1 })
    expect(out.dissensus.map(d => d.enonce)).not.toContain('Tout le monde est pour')
  })

  it('ignore les assertions avec trop peu de votes pour ou contre', () => {
    const out = build()
    expect([...out.consensus, ...out.dissensus].map(x => x.enonce)).not.toContain('Trop peu de votes')
    expect(out.participation).toMatchObject({ votants_places: 6, assertions_approuvees: 5, assertions_analysees: 4 })
  })

  it('décrit chaque camp et produit une carte anonyme', () => {
    const out = build()
    expect(out.camps.map(c => [c.camp, c.taille])).toEqual([[1, 3], [2, 3]])
    expect(out.camps[0].enonces_caracteristiques[0]).toMatchObject({ enonce: 'Un camp pour, l’autre contre', sens: 'pour' })
    expect(out.carte.points).toHaveLength(6)
    expect(JSON.stringify(out)).not.toMatch(/m[1-6]/)
  })

  it('un vote blanc ou une abstention ne compte pas dans les parts', () => {
    const out = build()
    const contre = out.consensus.find(c => c.enonce === 'Tout le monde est contre')!
    expect(contre.part_pour).toBe(0)
  })
})

describe('matchGroupNames', () => {
  const names = [
    { table_number: 1, name: 'Camp A', description: 'desc A' },
    { table_number: 2, name: 'Camp B', description: 'desc B' },
  ]
  const latest = (groupOf: (m: string) => number): LoadedAnalysis => ({
    id: 'x', k_chosen: 2, silhouette_score: 0, pca_variance_explained: [0, 0], repness: {}, group_consensus: {},
    created_at: '', vote_scope: 'current', members: members.map(m => ({ member_id: m, pca_x: 0, pca_y: 0, group_id: groupOf(m) })),
  })

  it('reprend les noms quand les camps sont les mêmes, numéros permutés', () => {
    const map = matchGroupNames(analysis(), latest(m => 1 - camp(m)), names)
    expect(map.get(0)?.name).toBe('Camp B')
    expect(map.get(1)?.name).toBe('Camp A')
  })

  it('ne donne aucun nom si une seule personne a changé de camp', () => {
    const moved = (m: string) => (m === 'm3' ? 1 : camp(m))
    expect(matchGroupNames(analysis(), latest(moved), names).size).toBe(0)
  })

  it('ne donne aucun nom sans analyse enregistrée', () => {
    expect(matchGroupNames(analysis(), null, names).size).toBe(0)
  })
})
