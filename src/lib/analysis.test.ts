import { describe, it, expect } from 'vitest'
import {
  pairGroups, computeMemberMovements, computeConsensusMovements, normalizeLoadedAnalysis, normalizeVoteChanges,
  imputeColumnMeans, sparsityScale, buildVoteMatrix, smoothedShare, fisherExactGreater,
  repnessFor, computeRepness, computeGroupConsensus, adjustedRandIndex, runOpinionAnalysis,
  MIN_VOTES_PER_MEMBER,
} from './analysis'
import type { LoadedAnalysis, VoteRow, RawVote } from './analysis'

function analysis(
  members: { member_id: string; group_id: number }[],
  groupConsensus: Record<string, number> = {},
): LoadedAnalysis {
  return {
    id: 'test',
    k_chosen: new Set(members.map(m => m.group_id)).size,
    silhouette_score: 0,
    pca_variance_explained: [0, 0],
    repness: {},
    group_consensus: groupConsensus,
    created_at: new Date().toISOString(),
    vote_scope: 'current',
    members: members.map(m => ({ ...m, pca_x: 0, pca_y: 0 })),
  }
}

describe('pairGroups', () => {
  it('apparie les groupes par composition même si la numérotation est inversée', () => {
    // a : groupe 0 = {m1,m2,m3}, groupe 1 = {m4,m5,m6}
    // b : mêmes personnes mais k-means a inversé les numéros
    const a = analysis([
      { member_id: 'm1', group_id: 0 }, { member_id: 'm2', group_id: 0 }, { member_id: 'm3', group_id: 0 },
      { member_id: 'm4', group_id: 1 }, { member_id: 'm5', group_id: 1 }, { member_id: 'm6', group_id: 1 },
    ])
    const b = analysis([
      { member_id: 'm1', group_id: 1 }, { member_id: 'm2', group_id: 1 }, { member_id: 'm3', group_id: 1 },
      { member_id: 'm4', group_id: 0 }, { member_id: 'm5', group_id: 0 }, { member_id: 'm6', group_id: 0 },
    ])

    const pairings = pairGroups(a, b)

    expect(pairings).toHaveLength(2)
    expect(pairings.find(p => p.aGroupId === 0)?.bGroupId).toBe(1)
    expect(pairings.find(p => p.aGroupId === 1)?.bGroupId).toBe(0)
    expect(pairings.find(p => p.aGroupId === 0)?.overlapCount).toBe(3)
  })

  it("laisse bGroupId null quand aucun membre du groupe n'a de vote après", () => {
    const a = analysis([{ member_id: 'm1', group_id: 0 }, { member_id: 'm2', group_id: 0 }])
    const b = analysis([{ member_id: 'm3', group_id: 0 }])

    const pairings = pairGroups(a, b)

    expect(pairings[0].bGroupId).toBeNull()
    expect(pairings[0].overlapCount).toBe(0)
  })
})

describe('computeMemberMovements', () => {
  it('distingue "resté dans son camp apparié", "changé de camp" et "absent après"', () => {
    const a = analysis([
      { member_id: 'stayer',  group_id: 0 },
      { member_id: 'mover',   group_id: 0 },
      { member_id: 'ghost',   group_id: 0 },
    ])
    const b = analysis([
      { member_id: 'stayer', group_id: 1 }, // camp 0 de a est apparié à camp 1 de b
      { member_id: 'mover',  group_id: 2 }, // change de camp
      // 'ghost' absent de b — n'a pas revoté
      { member_id: 'other1', group_id: 1 },
      { member_id: 'other2', group_id: 2 },
    ])

    const pairings = pairGroups(a, b)
    const movements = computeMemberMovements(a, b, pairings)

    const stayer = movements.find(m => m.memberId === 'stayer')!
    const mover  = movements.find(m => m.memberId === 'mover')!
    const ghost  = movements.find(m => m.memberId === 'ghost')!

    expect(stayer.stayed).toBe(true)
    expect(mover.bGroupId).not.toBeNull()
    expect(ghost.bGroupId).toBeNull()
    expect(ghost.stayed).toBe(false)
  })
})

describe('computeConsensusMovements', () => {
  it('calcule le delta uniquement pour les assertions présentes dans les deux analyses', () => {
    const a = analysis([], { a1: 0.2, a2: 0.8, a3: 0.5 })
    const b = analysis([], { a1: 0.6, a2: 0.75 }) // a3 absente de b (supprimée après coup)

    const movements = computeConsensusMovements(a, b)

    expect(movements).toHaveLength(2)
    const m1 = movements.find(m => m.assertionId === 'a1')!
    expect(m1.delta).toBeCloseTo(0.4)
    expect(movements.find(m => m.assertionId === 'a3')).toBeUndefined()
  })
})

// Régression — page blanche du 2026-09-18 (onglet Analyse du superadmin).
// Les RPC héritées run_clustering_v1/v2, toujours en base depuis le chantier 37,
// créent des lignes session_analysis dont silhouette_score, pca_variance_explained,
// repness et group_consensus sont NULL. Le cast `as LoadedAnalysis` laissait ces
// null filer jusqu'au rendu : Object.entries(null) et silhouette_score.toFixed().
describe('normalizeLoadedAnalysis — analyse issue des RPC héritées', () => {
  // Forme exacte renvoyée pour la séance « Test chantier 94 » : coordonnées et
  // groupes valides, mais les quatre colonnes calculées à NULL.
  const legacyRow = {
    id: '6b72b774',
    k_chosen: 3,
    silhouette_score: null,
    pca_variance_explained: null,
    repness: null,
    group_consensus: null,
    created_at: '2026-09-16T20:37:22Z',
    vote_scope: 'current',
    members: [{ member_id: 'm1', pca_x: -0.96, pca_y: 0.59, group_id: 0 }],
  }

  it('ramène les deux dictionnaires à un vide traversable sans garde', () => {
    const a = normalizeLoadedAnalysis(legacyRow)
    expect(a.repness).toEqual({})
    expect(a.group_consensus).toEqual({})
    expect(() => Object.entries(a.group_consensus)).not.toThrow()
  })

  it('laisse les deux métriques scalaires à null plutôt que d’inventer un 0', () => {
    const a = normalizeLoadedAnalysis(legacyRow)
    expect(a.silhouette_score).toBeNull()
    expect(a.pca_variance_explained).toBeNull()
    // Ce que fait l'affichage : « n/c » au lieu de planter.
    expect(a.silhouette_score?.toFixed(3) ?? 'n/c').toBe('n/c')
  })

  it('préserve les données réellement présentes', () => {
    const a = normalizeLoadedAnalysis(legacyRow)
    expect(a.k_chosen).toBe(3)
    expect(a.members).toHaveLength(1)
    expect(a.members[0].pca_x).toBeCloseTo(-0.96)
  })

  it('tolère un tableau de membres absent', () => {
    const a = normalizeLoadedAnalysis({ ...legacyRow, members: null })
    expect(a.members).toEqual([])
  })
})

describe('normalizeVoteChanges (chantier 167)', () => {
  it('lit une réponse complète de get_vote_changes_admin', () => {
    const r = normalizeVoteChanges({
      members_before: 4, members_changed: 1, pairs_total: 7, pairs_changed: 1,
      new_votes: 1, new_voters: 1,
      transitions: [{ from: 'agree', to: 'disagree', count: 1 }],
      assertions: [{
        assertion_id: 'x', changed: 1,
        before_agree: 3, before_disagree: 1, before_pass: 0,
        after_agree: 2, after_disagree: 2, after_pass: 0,
      }],
    })
    expect(r.membersChanged).toBe(1)
    expect(r.transitions).toEqual([{ from: 'agree', to: 'disagree', count: 1 }])
    expect(r.assertions[0]).toMatchObject({ assertionId: 'x', beforeAgree: 3, afterDisagree: 2 })
  })

  it('ne plante pas sur null, un objet vide ou des champs mal typés', () => {
    for (const bad of [null, undefined, {}, 'x', { transitions: 'oops', assertions: [null, { assertion_id: 3 }] }]) {
      const r = normalizeVoteChanges(bad)
      expect(r.membersBefore).toBe(0)
      expect(r.transitions).toEqual([])
      expect(r.assertions).toEqual([])
    }
  })

  it('écarte une transition avec une valeur de vote inconnue', () => {
    const r = normalizeVoteChanges({ transitions: [{ from: 'agree', to: 'maybe', count: 2 }] })
    expect(r.transitions).toEqual([])
  })
})

// ── Chantier 171 : formules Polis, test de structure, stabilité ───────────

/** Générateur déterministe pour fabriquer des votes de test. */
function lcg(seed: number) {
  let s = seed >>> 0
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
}

/** n votants × m assertions ; `voteOf(i, j)` renvoie le vote ou null (absent). */
function makeVotes(n: number, m: number, voteOf: (i: number, j: number) => VoteRow['vote'] | null) {
  const votes: VoteRow[] = []
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const v = voteOf(i, j)
    if (v) votes.push({ member_id: `m${i}`, assertion_id: `a${j}`, vote: v })
  }
  return {
    votes,
    members:    Array.from({ length: n }, (_, i) => `m${i}`),
    assertions: Array.from({ length: m }, (_, j) => `a${j}`),
  }
}

describe('imputeColumnMeans (Polis : absent = moyenne de la colonne)', () => {
  it('remplace les absents par la moyenne des votes exprimés, la passe restant à 0', () => {
    const raw: RawVote[][] = [[1, 0], [1, null], [-1, 0], [null, 1]]
    const m = imputeColumnMeans(raw)
    expect(m[3][0]).toBeCloseTo(1 / 3)
    expect(m[1][1]).toBeCloseTo(1 / 3)
    expect(m[0][1]).toBe(0)
  })
  it('met 0 dans une colonne sans aucun vote', () => {
    expect(imputeColumnMeans([[null], [null]])).toEqual([[0], [0]])
  })
})

describe('sparsityScale (Polis : × √(C/Cp))', () => {
  it('vaut 1 pour qui a tout voté et √2 pour qui a voté la moitié', () => {
    const s = sparsityScale([[1, -1, 0, 1], [1, null, 0, null]])
    expect(s[0]).toBe(1)
    expect(s[1]).toBeCloseTo(Math.SQRT2)
  })
})

describe('buildVoteMatrix', () => {
  it(`retire les votants sous ${MIN_VOTES_PER_MEMBER} votes réels, et le blanc ne compte pas`, () => {
    // 8 assertions ; m0, m2, m3 votent tout (dont m2 en passant), m1 vote 4 fois + 1 blanc
    const { votes, members, assertions } = makeVotes(4, 8, (i, j) => {
      if (i === 1) return j < 4 ? 'disagree' : j === 4 ? 'blank' : null
      return i === 2 ? 'pass' : 'agree'
    })
    const vm = buildVoteMatrix(votes, members, assertions)
    expect(vm.keptAssertionIds).toHaveLength(8)
    expect(vm.keptMemberIds).toEqual(['m0', 'm2', 'm3'])
  })
  it("garde un blanc et un absent à null dans la matrice brute, imputés pour l'ACP", () => {
    const { votes, members, assertions } = makeVotes(6, 6, (i, j) =>
      i === 3 && j === 0 ? 'blank' : i === 2 && j === 0 ? null : j % 2 ? 'agree' : 'disagree')
    const vm = buildVoteMatrix(votes, members, assertions)
    const row3 = vm.keptMemberIds.indexOf('m3')
    expect(vm.raw[row3][0]).toBeNull()
    expect(vm.raw[vm.keptMemberIds.indexOf('m2')][0]).toBeNull()
    expect(vm.matrix[row3][0]).toBe(-1) // moyenne de la colonne a0 = -1
  })
})

describe('smoothedShare et test exact de Fisher', () => {
  it('lisse comme Polis : (1 + N_v) / (2 + N)', () => {
    expect(smoothedShare(0, 0)).toBe(0.5)
    expect(smoothedShare(3, 4)).toBeCloseTo(4 / 6)
  })
  it('donne la probabilité hypergéométrique exacte', () => {
    // 4/4 d'accord dans le camp, 2/10 dans le reste : C(6,4)/C(14,4) = 15/1001
    expect(fisherExactGreater(4, 4, 2, 10)).toBeCloseTo(15 / 1001, 10)
    // 3/4 contre 3/10 : (C(6,3)·C(8,1) + C(6,4)) / C(14,4) = 175/1001
    expect(fisherExactGreater(3, 4, 3, 10)).toBeCloseTo(175 / 1001, 10)
    expect(fisherExactGreater(0, 4, 5, 10)).toBeCloseTo(1, 10)
  })
})

describe('repnessFor / computeRepness', () => {
  it('retient un camp unanime face à un reste opposé, avec le rapport des P lissées', () => {
    const d = repnessFor({ n: 4, agree: 4, disagree: 0 }, { n: 10, agree: 2, disagree: 8 })
    expect(d.direction).toBe('agree')
    expect(d.significant).toBe(true)
    expect(d.ratio).toBeCloseTo((5 / 6) / (3 / 12))
  })
  it('ne retient pas un écart que le hasard explique (3/4 contre 3/10)', () => {
    const d = repnessFor({ n: 4, agree: 3, disagree: 1 }, { n: 10, agree: 3, disagree: 7 })
    expect(d.significant).toBe(false)
  })
  it("signe le score : + si plus souvent d'accord, − si plus souvent contre, 0 sinon", () => {
    // 2 camps de 5 : a0 tranché, a1 identique dans les deux camps
    const raw: RawVote[][] = [
      ...Array.from({ length: 5 }, () => [1, 1] as RawVote[]),
      ...Array.from({ length: 5 }, () => [-1, 1] as RawVote[]),
    ]
    const groups = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1]
    const r = computeRepness(raw, groups, ['a0', 'a1'])
    expect(r.a0['0']).toBeGreaterThan(1)
    expect(r.a0['1']).toBeLessThan(-1)
    expect(r.a1['0']).toBe(0)
    expect(r.a1['1']).toBe(0)
  })
})

describe("computeGroupConsensus (Polis : produit des P(d'accord | camp))", () => {
  it('multiplie les parts lissées et les ramène sur [−1, 1] par la moyenne géométrique', () => {
    const raw: RawVote[][] = [[1], [1], [1], [1], [-1], [null]]
    const groups = [0, 0, 0, 1, 1, 1]
    const { products, scores } = computeGroupConsensus(raw, groups, ['a'])
    const p0 = (1 + 3) / (2 + 3), p1 = (1 + 1) / (2 + 2)
    expect(products.a).toBeCloseTo(p0 * p1)
    expect(scores.a).toBeCloseTo(2 * Math.sqrt(p0 * p1) - 1)
  })
})

describe('adjustedRandIndex', () => {
  it('vaut 1 pour deux partitions identiques à la numérotation près', () => {
    expect(adjustedRandIndex([0, 0, 1, 1, 2], [2, 2, 0, 0, 1])).toBeCloseTo(1)
  })
  it('est nul ou négatif pour des partitions sans rapport', () => {
    expect(adjustedRandIndex([0, 0, 1, 1], [0, 1, 0, 1])).toBeLessThanOrEqual(0)
  })
})

describe('runOpinionAnalysis : les camps sont-ils réels ?', () => {
  const opts = { replicates: 60, stabilityReplicates: 30 }

  it('reconnaît deux camps nets quand les votes en contiennent', () => {
    const rnd = lcg(7)
    const { votes, members, assertions } = makeVotes(18, 10, (i, j) => {
      if (rnd() < 0.1) return null
      const camp = i < 9 ? 1 : -1
      const side = j < 5 ? camp : -camp
      if (rnd() < 0.1) return side > 0 ? 'disagree' : 'agree'
      return side > 0 ? 'agree' : 'disagree'
    })
    const r = runOpinionAnalysis(votes, members, assertions, opts)
    expect(r.validity.pValue).toBeLessThan(0.05)
    expect(r.validity.verdict).not.toBe('absents')
    expect(r.validity.silhouette).toBeGreaterThan(r.validity.nullSilhouette95)
    // Aucun camp calculé ne mélange les deux camps réels (le choix de k par
    // silhouette peut, lui, couper un camp réel en plusieurs : limite connue).
    for (const g of new Set(r.members.map(m => m.group_id))) {
      const real = new Set(r.members.filter(m => m.group_id === g).map(m => Number(m.member_id.slice(1)) < 9))
      expect(real.size).toBe(1)
    }
    const sig = Object.values(r.repness).flatMap(byG => Object.values(byG)).filter(s => s !== 0)
    expect(sig.length).toBeGreaterThan(0)
  })

  it('dit « absents » sur des votes tirés au hasard (le k-means, lui, trouve quand même des camps)', () => {
    const rnd = lcg(3)
    const { votes, members, assertions } = makeVotes(14, 12, () => {
      const u = rnd()
      return u < 0.45 ? 'agree' : u < 0.9 ? 'disagree' : 'pass'
    })
    const r = runOpinionAnalysis(votes, members, assertions, opts)
    expect(r.kChosen).toBeGreaterThanOrEqual(2)
    expect(r.validity.verdict).toBe('absents')
  })

  it('est déterministe : deux calculs sur les mêmes votes donnent le même résultat', () => {
    const rnd = lcg(11)
    const { votes, members, assertions } = makeVotes(12, 8, () => (rnd() < 0.5 ? 'agree' : 'disagree'))
    const a = runOpinionAnalysis(votes, members, assertions, opts)
    const b = runOpinionAnalysis(votes, members, assertions, opts)
    expect(b).toEqual(a)
  })
})
