// =============================================================
// Chantier 19 (G1) — tests de l'algorithme d'allocation v2
// Chantier 91 — les passifs deviennent du public
// npm test  (vitest)
// =============================================================

import { describe, it, expect } from 'vitest'
import {
  runAllocation,
  diagnoseAllocation,
  veteranThreshold,
  TABLE_MIN,
  TABLE_MAX_ACTIVE,
  TABLE_TOTAL_MAX,
  UNMODERATED_TABLE_MIN,
  UNMODERATED_TABLE_MAX,
  CLUSTER_MAX,
  buildClusters,
  countBrokenClusters,
  type AllocationMember,
} from './allocation'

// ── Helpers de fabrication de population ─────────────────────

interface Spec {
  active?: boolean
  consent?: boolean
  veteran?: boolean
  camp?: number | null
}

function make(count: number, spec: Spec = {}, prefix = 'm'): AllocationMember[] {
  return Array.from({ length: count }, (_, i) => ({
    member_id: `${prefix}-${i}`,
    pseudo: `${prefix}${i}`,
    is_active: spec.active ?? true,
    consents: spec.consent ?? true,
    is_veteran: spec.veteran ?? true,
    group_id: spec.camp === undefined ? 0 : spec.camp,
  }))
}

/** Population équilibrée : moitié actifs, 40 % anciens, 3 camps, tous consentants. */
function balanced(n: number): AllocationMember[] {
  return Array.from({ length: n }, (_, i) => ({
    member_id: `b-${i}`,
    pseudo: `b${i}`,
    is_active: i % 2 === 0,
    consents: true,
    is_veteran: i % 5 < 2,
    group_id: i % 3,
  }))
}

/**
 * `a` actifs puis `p` passifs, attributs décorrélés par des rotations
 * (anciens ≈ 40 %, 3 camps) — plus proche d'une vraie salle que `balanced`.
 */
function mix(a: number, p: number, prefix = 'x'): AllocationMember[] {
  const n = a + p
  return Array.from({ length: n }, (_, i) => ({
    member_id: `${prefix}-${i}`,
    pseudo: `${prefix}${i}`,
    is_active: i < a,
    consents: true,
    is_veteran: (i * 7 + 3) % 5 < 2,
    group_id: (i * 11 + 4) % 3,
  }))
}

const totalSeats = (r: ReturnType<typeof runAllocation>) =>
  r.tables.reduce((s, t) => s + t.member_ids.length, 0)

/**
 * Profils de modérateurs — chantier 25b. `loadAllocationInputs` renvoie
 * **toujours** les attributs réels des modérateurs : les tests qui mettent un
 * surplus en jeu doivent en faire autant.
 */
function modProfiles(ids: string[]): AllocationMember[] {
  return ids.map((id, i) => ({
    member_id: id, pseudo: id,
    is_active: true, consents: true, is_veteran: true, group_id: i % 3,
  }))
}

// ── Seuils ───────────────────────────────────────────────────

describe('seuils', () => {
  it('règle 3 — ⌈2/5·actifs⌉ (sans plafond)', () => {
    expect(veteranThreshold(5)).toBe(2)
    expect(veteranThreshold(6)).toBe(3)
    expect(veteranThreshold(10)).toBe(4)
    expect(veteranThreshold(14)).toBe(6)
  })
})

// ── Chantier 91 — le public ──────────────────────────────────

describe('chantier 91 — les passifs sont placés en public', () => {
  it('exemple de Jules : 6 actifs, 1 modérateur, 24 passifs → une seule table, les passifs en public', () => {
    const members = mix(6, 24)
    const r = runAllocation({ members, moderatorIds: ['mo-1'], moderatorProfiles: modProfiles(['mo-1']), opinionsAvailable: true })
    expect(r.tables).toHaveLength(1)
    expect(r.tables[0].moderated).toBe(true)
    expect(r.diagnostics[0].actives).toBe(6)
    expect(r.diagnostics[0].audience).toBe(24)
    expect(r.tables[0].audience_member_ids).toHaveLength(24)
    expect(totalSeats(r)).toBe(30)
  })

  it('les passifs ne comptent pas pour former les tables : autant de tables qu’avec les seuls actifs', () => {
    const ids = ['mo-1', 'mo-2', 'mo-3']
    const base = { moderatorIds: ids, moderatorProfiles: modProfiles(ids), opinionsAvailable: true }
    const withAudience = runAllocation({ ...base, members: mix(36, 30) })
    const withoutAudience = runAllocation({ ...base, members: mix(36, 0) })
    expect(withAudience.tables.map(t => t.member_ids.length - t.audience_member_ids.length))
      .toEqual(withoutAudience.tables.map(t => t.member_ids.length))
  })

  it('public réparti uniformément sur les tables animées, jamais sans modérateur tant qu’il reste de la place', () => {
    const ids = ['mo-1', 'mo-2', 'mo-3']
    const r = runAllocation({ members: mix(45, 20), moderatorIds: ids, moderatorProfiles: modProfiles(ids), opinionsAvailable: true })
    const moderated = r.diagnostics.filter(d => d.moderated)
    const audiences = moderated.map(d => d.audience)
    expect(Math.max(...audiences) - Math.min(...audiences)).toBeLessThanOrEqual(1)
    expect(r.diagnostics.every(d => d.audience_ok)).toBe(true)
    expect(audiences.reduce((s, a) => s + a, 0)).toBe(20)
  })

  it(`limite physique de ${TABLE_TOTAL_MAX} personnes : le public déborde aux tables sans modérateur, annoncé`, () => {
    const ids = ['mo-1', 'mo-2']
    const r = runAllocation({ members: mix(38, 40), moderatorIds: ids, moderatorProfiles: modProfiles(ids), opinionsAvailable: true })
    expect(totalSeats(r)).toBe(78)
    expect(r.diagnostics.every(d => !d.over_capacity)).toBe(true)
    const overflow = r.diagnostics.filter(d => !d.moderated && d.audience > 0)
    if (overflow.length > 0) {
      // Le public ne va sans modérateur qu'une fois les tables animées pleines.
      expect(r.diagnostics.filter(d => d.moderated).every(d => d.size === TABLE_TOTAL_MAX)).toBe(true)
      expect(r.warnings.join(' ')).toContain('pleines')
    }
  })

  it('pas assez de place du tout → limite dépassée avec avertissement, jamais d’exception', () => {
    const r = runAllocation({ members: mix(8, 40), moderatorIds: ['mo-1'], moderatorProfiles: modProfiles(['mo-1']), opinionsAvailable: true })
    expect(totalSeats(r)).toBe(48)
    expect(r.warnings.join(' ')).toContain(`dépassent ${TABLE_TOTAL_MAX}`)
  })

  it('sans modérateur → public aux tables sans modérateur, annoncé', () => {
    const r = runAllocation({ members: mix(30, 10), moderatorIds: [], opinionsAvailable: true })
    expect(totalSeats(r)).toBe(40)
    expect(r.warnings.join(' ')).toContain('faute de table animée')
  })

  it('un passif non consentant rejoint de préférence une table déjà non enregistrable', () => {
    const ids = ['mo-1', 'mo-2']
    const actives = mix(24, 0)
    actives[0] = { ...actives[0], consents: false }
    const audience = [
      ...make(1, { active: false, consent: false, camp: null }, 'nc'),
      ...make(1, { active: false, consent: true, camp: null }, 'ok'),
    ]
    const r = runAllocation({ members: [...actives, ...audience], moderatorIds: ids, moderatorProfiles: modProfiles(ids), opinionsAvailable: true })
    const dirtyTable = r.tables.find(t => t.member_ids.includes(actives[0].member_id))!
    expect(dirtyTable.audience_member_ids).toContain('nc-0')
  })

  it('les tables enregistrables visées ne reçoivent pas de non-consentant du public', () => {
    const ids = ['mo-1', 'mo-2', 'mo-3']
    const audience = [
      ...make(3, { active: false, consent: false, camp: null }, 'nc'),
      ...make(9, { active: false, consent: true, camp: null }, 'ok'),
    ]
    const r = runAllocation({ members: [...mix(30, 0), ...audience], moderatorIds: ids, moderatorProfiles: modProfiles(ids), opinionsAvailable: true })
    expect(r.diagnostics.some(d => d.recordable)).toBe(true)
  })

  it('un modérateur assis faute de table compte comme actif, même si son profil dit passif', () => {
    const ids = ['mo-1', 'mo-2', 'mo-3', 'mo-4']
    const profiles = modProfiles(ids).map(p => ({ ...p, is_active: false }))
    const r = runAllocation({ members: mix(12, 5), moderatorIds: ids, moderatorProfiles: profiles, opinionsAvailable: true })
    expect(r.seatedModeratorIds.length).toBeGreaterThan(0)
    for (const id of r.seatedModeratorIds) {
      const t = r.tables.find(x => x.member_ids.includes(id))!
      expect(t.audience_member_ids).not.toContain(id)
    }
  })

  it('le public ne dépend pas de l’ordre des membres en entrée', () => {
    const members = mix(30, 17)
    const opts = { moderatorIds: ['mo-1', 'mo-2'], moderatorProfiles: modProfiles(['mo-1', 'mo-2']), opinionsAvailable: true }
    const a = runAllocation({ ...opts, members })
    const b = runAllocation({ ...opts, members: [...members].reverse() })
    expect(a.tables.map(t => t.audience_member_ids.length)).toEqual(b.tables.map(t => t.audience_member_ids.length))
  })
})

// ── Contraintes dures ────────────────────────────────────────

describe('contraintes dures de taille (en actifs)', () => {
  it('actifs ≤ 10 → table unique, tout le monde y est, pas d’allocation', () => {
    for (const n of [1, 5, 9, 20]) {
      const r = runAllocation({ members: balanced(n), moderatorIds: [], opinionsAvailable: true })
      expect(r.singleTable).toBe(true)
      expect(r.tables).toHaveLength(1)
      expect(r.tables[0].member_ids).toHaveLength(n)
    }
  })

  it('actifs > 10 → tables animées de 5 à 14 actifs, tables sans modérateur de 5 à 7 actifs', () => {
    for (const n of [23, 30, 47, 60, 83, 120]) {
      const r = runAllocation({ members: balanced(n), moderatorIds: ['mod-1', 'mod-2'], opinionsAvailable: true })
      if (r.singleTable) continue
      for (const d of r.diagnostics) {
        if (d.moderated) {
          expect(d.actives).toBeGreaterThanOrEqual(TABLE_MIN)
          expect(d.actives).toBeLessThanOrEqual(TABLE_MAX_ACTIVE)
        } else {
          expect(d.actives).toBeGreaterThanOrEqual(UNMODERATED_TABLE_MIN)
          expect(d.actives).toBeLessThanOrEqual(UNMODERATED_TABLE_MAX)
        }
      }
      expect(totalSeats(r)).toBe(n + r.seatedModeratorIds.length)
    }
  })

  it('aucun membre perdu ni dupliqué', () => {
    const r = runAllocation({ members: balanced(47), moderatorIds: ['mod-1'], opinionsAvailable: true })
    const ids = r.tables.flatMap(t => t.member_ids)
    expect(new Set(ids).size).toBe(47)
    expect(ids).toHaveLength(47)
  })

  it('population vide → résultat vide, pas d’exception', () => {
    const r = runAllocation({ members: [], moderatorIds: [], opinionsAvailable: true })
    expect(r.tables).toHaveLength(0)
    expect(r.warnings.join(' ')).toContain('Aucun participant')
  })
})

// ── Politique de dimensionnement (§4) ────────────────────────

describe('politique de dimensionnement', () => {
  it('tables animées de taille équilibrée (chantier 91)', () => {
    const ids = ['mo-1', 'mo-2', 'mo-3']
    const r = runAllocation({ members: mix(31, 0), moderatorIds: ids, moderatorProfiles: modProfiles(ids), opinionsAvailable: true })
    const sizes = r.diagnostics.filter(d => d.moderated).map(d => d.actives)
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
  })

  it('60 participants / 4 modérateurs, population DÉCORRÉLÉE → aucune grosse table sans animateur', () => {
    // Chantier 29 (I1) : sur une population décorrélée, l'algorithme d'avant
    // produisait 6 tables dont deux de 10 sans animateur — ce que le §4
    // désigne comme le mauvais résultat. Ne pas remplacer cette population par
    // un helper qui recorrélerait les attributs : c'est la décorrélation qui
    // fait le test.
    const idx = [...Array(60).keys()]
    const rotate = (k: number, m: number) => (i: number) => (i * k + 7) % 60 < m
    const isVeteran = rotate(23, 24)
    const isActive  = rotate(37, 30)
    const members: AllocationMember[] = idx.map(i => ({
      member_id: `d-${i}`, pseudo: `d${i}`,
      is_active: isActive(i), consents: true, is_veteran: isVeteran(i),
      group_id: (i * 11 + 4) % 3,
    }))
    expect(members.filter(m => m.is_active)).toHaveLength(30)

    const r = runAllocation({ members, moderatorIds: ['mo-1', 'mo-2', 'mo-3', 'mo-4'], opinionsAvailable: true })
    expect(r.diagnostics.filter(d => !d.moderated).every(d => d.actives <= UNMODERATED_TABLE_MAX)).toBe(true)
    expect(r.diagnostics.every(d => d.audience_ok)).toBe(true)
  })

  it('chantier 91 — maximin d’hétérogénéité plafonné : une grande salle ne se fragmente pas en tables de 5', () => {
    // Mesuré avant le plafonnement : 120 part. / 6 modé. → 11 tables dont 5
    // sans modérateur, et deux tables de 14 avec 0 et 1 ancien sur 6 requis.
    const ids = ['mo-1', 'mo-2', 'mo-3', 'mo-4', 'mo-5', 'mo-6']
    const r = runAllocation({ members: mix(72, 48), moderatorIds: ids, moderatorProfiles: modProfiles(ids), opinionsAvailable: true })
    expect(r.tables.length).toBeLessThanOrEqual(7)
    expect(r.animatingModerators).toBe(6)
  })

  it('sans modérateur → toutes les tables non animées, de 5 à 7 actifs', () => {
    const r = runAllocation({ members: mix(30, 0), moderatorIds: [], opinionsAvailable: true })
    expect(r.tables.every(t => !t.moderated)).toBe(true)
    expect(r.diagnostics.every(d => d.actives >= UNMODERATED_TABLE_MIN && d.actives <= UNMODERATED_TABLE_MAX)).toBe(true)
    expect(r.warnings.join(' ')).toContain('Aucun modérateur')
  })

  it('sans modérateur et sans discrimination par les règles → tables de 5', () => {
    const members = make(30, { active: true, consent: true, veteran: true, camp: null }, 's')
    const r = runAllocation({ members, moderatorIds: [], opinionsAvailable: false })
    expect(r.tables.every(t => !t.moderated)).toBe(true)
    expect(r.tables.every(t => t.member_ids.length === TABLE_MIN)).toBe(true)
    expect(r.tables).toHaveLength(6)
  })

  it('les modérateurs annoncés (extraModerators) comptent dans la capacité', () => {
    const r = runAllocation({ members: mix(30, 0), moderatorIds: [], extraModerators: 3, opinionsAvailable: true })
    expect(r.moderatorCapacity).toBe(3)
    expect(r.tables.filter(t => t.moderated).length).toBeGreaterThan(0)
    expect(r.warnings.join(' ')).toContain('pas encore inscrit')
  })

  it('chantier 32 (J7) — faire varier extraModerators (0/+1/+2/+3) fait croître le nombre de tables animées', () => {
    const members = mix(40, 10)
    const base = { members, moderatorIds: ['mo-1'], moderatorProfiles: modProfiles(['mo-1']), opinionsAvailable: true }
    const runs = [0, 1, 2, 3].map(extra => runAllocation({ ...base, extraModerators: extra }))
    runs.forEach((r, i) => expect(r.moderatorCapacity).toBe(1 + i))
    const moderatedCounts = runs.map(r => r.tables.filter(t => t.moderated).length)
    for (let i = 1; i < moderatedCounts.length; i++) {
      expect(moderatedCounts[i]).toBeGreaterThanOrEqual(moderatedCounts[i - 1])
    }
    expect(moderatedCounts[3]).toBeGreaterThan(moderatedCounts[0])
  })
})

// ── Règle 1 ──────────────────────────────────────────────────

describe('règle 1 — au moins une table enregistrable', () => {
  it('garantit une table sans non-consentant et non homogène', () => {
    const members = [
      ...make(8, { consent: false, camp: 0 }, 'nc'),
      ...make(12, { consent: true, camp: 1 }, 'c1'),
      ...make(12, { consent: true, camp: 2 }, 'c2'),
    ]
    const r = runAllocation({ members, moderatorIds: [], opinionsAvailable: true })
    expect(r.diagnostics.some(d => d.recordable)).toBe(true)
  })

  it('recorderCount = 3 → vise 3 tables propres', () => {
    const members = [
      ...make(6, { consent: false, camp: 0 }, 'nc'),
      ...make(15, { consent: true, camp: 1 }, 'c1'),
      ...make(15, { consent: true, camp: 2 }, 'c2'),
    ]
    const r = runAllocation({ members, moderatorIds: [], recorderCount: 3, opinionsAvailable: true })
    expect(r.recorderTarget).toBe(3)
    expect(r.diagnostics.filter(d => d.recordable).length).toBeGreaterThanOrEqual(3)
  })

  it('aucun consentant → règle abandonnée, pas d’échec', () => {
    const r = runAllocation({ members: make(30, { consent: false }), moderatorIds: [], opinionsAvailable: true })
    expect(totalSeats(r)).toBe(30)
    expect(r.diagnostics.every(d => !d.recordable)).toBe(true)
  })

  it('une table homogène et consentante n’est pas comptée enregistrable', () => {
    const members = make(6, { consent: true, camp: 0 })
    const diags = diagnoseAllocation([{ table_number: 1, moderated: true, member_ids: members.map(m => m.member_id) }], members, true)
    expect(diags[0].recordable).toBe(false)
  })

  it('chantier 91 — un non-consentant du public rend la table non enregistrable', () => {
    const actives = [...make(3, { camp: 0 }, 'a'), ...make(3, { camp: 1 }, 'b')]
    const audience = make(1, { active: false, consent: false }, 'p')
    const members = [...actives, ...audience]
    const [d] = diagnoseAllocation([{ table_number: 1, moderated: true, member_ids: members.map(m => m.member_id) }], members, true)
    expect(d.recordable).toBe(false)
    expect(d.audience).toBe(1)
  })
})

// ── Règle 2 ──────────────────────────────────────────────────

describe('règle 2 — hétérogénéité des opinions (sur les actifs)', () => {
  it('camps équilibrés → toutes les tables viables', () => {
    const members = [0, 1, 2].flatMap(c => make(12, { camp: c }, `c${c}`))
    const r = runAllocation({ members, moderatorIds: [], opinionsAvailable: true })
    expect(r.diagnostics.every(d => d.heterogeneity_ok)).toBe(true)
  })

  it('analyse indisponible → règle 2 désactivée, pas d’exception, avertissement', () => {
    const members = mix(30, 6).map(m => ({ ...m, group_id: null }))
    const r = runAllocation({ members, moderatorIds: ['mo-1'], opinionsAvailable: false })
    expect(totalSeats(r)).toBe(36)
    expect(r.warnings.join(' ')).toContain('règle 2')
    expect(r.diagnostics.every(d => d.heterogeneity_ok === false)).toBe(true)
  })

  it('un seul camp → avertissement, allocation quand même', () => {
    const r = runAllocation({ members: make(30, { camp: 0 }), moderatorIds: [], opinionsAvailable: true })
    expect(totalSeats(r)).toBe(30)
    expect(r.warnings.join(' ')).toContain('Un seul camp')
  })

  it('non-votants (camp null) neutres : ils ne cassent pas la viabilité', () => {
    const members = [
      ...make(10, { camp: 0 }, 'c0'),
      ...make(10, { camp: 1 }, 'c1'),
      ...make(10, { camp: null }, 'nv'),
    ]
    const r = runAllocation({ members, moderatorIds: [], opinionsAvailable: true })
    expect(r.diagnostics.every(d => d.heterogeneity_ok)).toBe(true)
    expect(r.diagnostics.reduce((s, d) => s + d.neutral_count, 0)).toBe(10)
  })

  it('le camp du public n’entre pas dans l’hétérogénéité', () => {
    const actives = [...make(3, { camp: 0 }, 'a'), ...make(3, { camp: 1 }, 'b')]
    const audience = make(20, { active: false, camp: 0 }, 'p')
    const members = [...actives, ...audience]
    const [d] = diagnoseAllocation([{ table_number: 1, moderated: true, member_ids: members.map(m => m.member_id) }], members, true)
    expect(d.majority_share).toBe(0.5)
    expect(d.heterogeneity_ok).toBe(true)
  })
})

// ── Règle 3 ──────────────────────────────────────────────────

describe('règle 3 — assez d’anciens (sur les actifs)', () => {
  it('≥ 40 % d’anciens, tables animées → conformes', () => {
    const members = [
      ...make(20, { veteran: true,  camp: 0 }, 'v'),
      ...make(20, { veteran: false, camp: 1 }, 'n'),
    ]
    const ids = ['mod-1', 'mod-2', 'mod-3']
    const r = runAllocation({ members, moderatorIds: ids, moderatorProfiles: modProfiles(ids), opinionsAvailable: true })
    const moderated = r.diagnostics.filter(d => d.moderated)
    expect(moderated.length).toBeGreaterThan(0)
    expect(moderated.every(d => d.veterans_ok)).toBe(true)
  })

  it('tables sans modérateur : plancher dur de 3 anciens', () => {
    const members = [
      ...make(20, { veteran: true,  camp: 0 }, 'v'),
      ...make(20, { veteran: false, camp: 1 }, 'n'),
    ]
    const r = runAllocation({ members, moderatorIds: [], opinionsAvailable: true })
    expect(r.diagnostics.every(d => !d.moderated)).toBe(true)
    expect(r.diagnostics.every(d => d.veterans_threshold >= 3)).toBe(true)
  })

  it('les anciens du public ne comptent pas', () => {
    const actives = make(6, { veteran: false }, 'a')
    const audience = make(10, { active: false, veteran: true }, 'p')
    const members = [...actives, ...audience]
    const [d] = diagnoseAllocation([{ table_number: 1, moderated: true, member_ids: members.map(m => m.member_id) }], members, true)
    expect(d.veterans).toBe(0)
    expect(d.veterans_ok).toBe(false)
  })

  it('< 40 % d’anciens → dégradation annoncée, jamais d’échec', () => {
    const members = [
      ...make(6,  { veteran: true,  camp: 0 }, 'v'),
      ...make(24, { veteran: false, camp: 1 }, 'n'),
    ]
    const r = runAllocation({ members, moderatorIds: [], opinionsAvailable: true })
    expect(totalSeats(r)).toBe(30)
    expect(r.warnings.join(' ')).toContain("d'anciens")
  })
})

// ── Règle 4 ──────────────────────────────────────────────────

describe('règle 4 — les nouveaux avec un modérateur', () => {
  it('à qualité égale, les nouveaux vont aux tables modérées', () => {
    const members = Array.from({ length: 20 }, (_, i) => ({
      member_id: `x-${i}`, pseudo: `x${i}`,
      is_active: true, consents: true, is_veteran: i < 14, group_id: i % 2,
    }))
    const r = runAllocation({ members, moderatorIds: ['mo-1'], opinionsAvailable: true })
    const moderated   = r.diagnostics.filter(d => d.moderated)
    const unmoderated = r.diagnostics.filter(d => !d.moderated)
    expect(moderated.length).toBeGreaterThan(0)
    expect(unmoderated.length).toBeGreaterThan(0)
    const newsModerated   = moderated.reduce((s, d) => s + d.newcomers, 0)
    const newsUnmoderated = unmoderated.reduce((s, d) => s + d.newcomers, 0)
    expect(newsModerated).toBeGreaterThanOrEqual(newsUnmoderated)
  })
})

// ── Reproductibilité ─────────────────────────────────────────

describe('reproductibilité', () => {
  it('même entrée + même graine → même sortie', () => {
    const members = mix(53, 21)
    const a = runAllocation({ members, moderatorIds: ['mo-1', 'mo-2'], opinionsAvailable: true })
    const b = runAllocation({ members, moderatorIds: ['mo-1', 'mo-2'], opinionsAvailable: true })
    expect(JSON.stringify(a.tables)).toBe(JSON.stringify(b.tables))
  })

  it('l’ordre des membres en entrée ne change pas la qualité du résultat', () => {
    const members = mix(40, 12)
    const a = runAllocation({ members, moderatorIds: ['mo-1'], opinionsAvailable: true })
    const b = runAllocation({ members: [...members].reverse(), moderatorIds: ['mo-1'], opinionsAvailable: true })
    expect(a.score).toEqual(b.score)
  })
})

// ── Dégradation : l’algorithme ne peut jamais échouer ─────────

describe('robustesse — jamais d’échec', () => {
  const hostile: [string, AllocationMember[]][] = [
    ['tous passifs',            make(37, { active: false })],
    ['3 actifs seulement',      [...make(3, {}, 'a'), ...make(30, { active: false }, 'p')]],
    ['tous non consentants',    make(37, { consent: false })],
    ['tous nouveaux',           make(37, { veteran: false })],
    ['aucun vote',              make(37, { camp: null })],
    ['tout dégradé',            make(41, { consent: false, veteran: false, camp: null })],
    ['un seul camp, 11 pers.',  make(11, { camp: 0 })],
    ['200 personnes',           balanced(200)],
  ]

  for (const [label, members] of hostile) {
    it(`${label} → allocation produite, tous les membres placés`, () => {
      const r = runAllocation({ members, moderatorIds: ['mo-1'], opinionsAvailable: true })
      expect(totalSeats(r)).toBe(members.length)
      const ids = r.tables.flatMap(t => t.member_ids)
      expect(new Set(ids).size).toBe(members.length)
      if (!r.singleTable) {
        for (const d of r.diagnostics) {
          expect(d.actives).toBeGreaterThanOrEqual(d.moderated ? TABLE_MIN : UNMODERATED_TABLE_MIN)
        }
      }
    })
  }

  it('moins de 5 actifs → table unique, annoncée', () => {
    const r = runAllocation({ members: [...make(3, {}, 'a'), ...make(12, { active: false }, 'p')], moderatorIds: ['mo-1'], opinionsAvailable: true })
    expect(r.tables).toHaveLength(1)
    expect(r.warnings.join(' ')).toContain('actif')
  })

  it('200 personnes → calcul sous 5 s (budget d’évaluations borné)', () => {
    const start = Date.now()
    runAllocation({ members: balanced(200), moderatorIds: ['a', 'b', 'c', 'd'], opinionsAvailable: true })
    expect(Date.now() - start).toBeLessThan(5000)
  })
})

// ── diagnoseAllocation (retouches manuelles) ─────────────────

describe('diagnoseAllocation', () => {
  it('recalcule les seuils sur une répartition arbitraire', () => {
    const members = [
      ...make(5, { active: true,  veteran: true,  consent: true,  camp: 0 }, 'A'),
      ...make(5, { active: true,  veteran: false, consent: false, camp: 0 }, 'B'),
    ]
    const diags = diagnoseAllocation(
      [
        { table_number: 2, moderated: false, member_ids: members.slice(5).map(m => m.member_id) },
        { table_number: 1, moderated: true,  member_ids: members.slice(0, 5).map(m => m.member_id) },
      ],
      members,
      true,
    )
    expect(diags.map(d => d.table_number)).toEqual([1, 2])
    expect(diags[0].veterans_ok).toBe(true)
    expect(diags[1].veterans).toBe(0)
    expect(diags[1].veterans_ok).toBe(false)
    expect(diags[1].non_consenting).toBe(5)
    expect(diags[1].recordable).toBe(false)
  })

  it('signale le public sans modérateur et le dépassement de la limite physique', () => {
    const members = [...make(6, {}, 'a'), ...make(26, { active: false }, 'p')]
    const [d] = diagnoseAllocation([{ table_number: 1, moderated: false, member_ids: members.map(m => m.member_id) }], members, true)
    expect(d.audience).toBe(26)
    expect(d.audience_ok).toBe(false)
    expect(d.over_capacity).toBe(true)
  })

  it('ignore silencieusement un member_id inconnu', () => {
    const members = make(5, {}, 'A')
    const diags = diagnoseAllocation(
      [{ table_number: 1, moderated: false, member_ids: [...members.map(m => m.member_id), 'fantome'] }],
      members,
      true,
    )
    expect(diags[0].size).toBe(5)
  })
})

// ── Chantier 25 — modérateurs en surplus / déficit ───────────

describe('chantier 25 — modérateurs en surplus (H17)', () => {
  it('un modérateur sans table devient un participant ordinaire', () => {
    // 19 actifs → au plus 3 tables : le 4e modérateur n'anime rien.
    const ids = ['mo-1', 'mo-2', 'mo-3', 'mo-4']
    const r = runAllocation({ members: mix(19, 6), moderatorIds: ids, moderatorProfiles: modProfiles(ids), opinionsAvailable: true })
    expect(r.animatingModerators).toBeLessThan(4)
    expect(r.seatedModeratorIds.length).toBeGreaterThan(0)
    expect(totalSeats(r)).toBe(25 + r.seatedModeratorIds.length)
    for (const id of r.seatedModeratorIds) {
      const seatedTable = r.tables.find(t => t.member_ids.includes(id))
      expect(seatedTable).toBeDefined()
      expect(seatedTable!.moderator_member_ids).not.toContain(id)
    }
  })

  it('le modérateur assis est optimisé : son camp est comptabilisé dans sa table', () => {
    const members: AllocationMember[] = [
      ...make(9, { camp: 0 }, 'c0'),
      ...make(9, { camp: 1 }, 'c1'),
      ...make(1, { camp: 2 }, 'c2'),
    ]
    const ids = ['mo-1', 'mo-2', 'mo-3', 'mo-4']
    const r = runAllocation({
      members, moderatorIds: ids,
      moderatorProfiles: ids.map(id => ({ member_id: id, pseudo: id, is_active: true, consents: true, is_veteran: true, group_id: 2 })),
      opinionsAvailable: true,
    })
    expect(r.seatedModeratorIds.length).toBeGreaterThan(0)
    const id = r.seatedModeratorIds[0]
    const seatedTable = r.tables.find(t => t.member_ids.includes(id))!
    const d = r.diagnostics.find(x => x.table_number === seatedTable.table_number)!
    expect(d.camp_counts['2']).toBeGreaterThanOrEqual(1)
    expect(d.size).toBe(seatedTable.member_ids.length)
  })

  it('aucun modérateur inscrit n’est laissé sans affectation', () => {
    for (const nMods of [1, 2, 3, 4, 6, 8]) {
      const ids = Array.from({ length: nMods }, (_, i) => `mo-${i}`)
      const r = runAllocation({ members: mix(25, 8), moderatorIds: ids, moderatorProfiles: modProfiles(ids), opinionsAvailable: true })
      const placed = new Set([
        ...r.tables.flatMap(t => t.moderator_member_ids),
        ...r.tables.flatMap(t => t.member_ids),
      ])
      for (const id of ids) expect(placed.has(id)).toBe(true)
      const animating = r.tables.flatMap(t => t.moderator_member_ids)
      expect(animating.filter(id => r.seatedModeratorIds.includes(id))).toHaveLength(0)
    }
  })

  it('le surplus ne fait pas exploser le nombre de tables', () => {
    const base = ['mo-1', 'mo-2', 'mo-3']
    const many = [...base, 'mo-4', 'mo-5', 'mo-6']
    const without = runAllocation({ members: mix(25, 8), moderatorIds: base, moderatorProfiles: modProfiles(base), opinionsAvailable: true })
    const withSurplus = runAllocation({ members: mix(25, 8), moderatorIds: many, moderatorProfiles: modProfiles(many), opinionsAvailable: true })
    // Chantier 91 : la boucle retient désormais vraiment le plus grand nombre
    // de modérateurs animants cohérent (§4) — plus de modérateurs peut donc
    // donner plus de tables, mais toutes animées, et jamais plus que les
    // actifs ne le permettent (5 par table).
    expect(withSurplus.animatingModerators).toBeGreaterThanOrEqual(without.animatingModerators)
    expect(withSurplus.tables.every(t => t.moderated)).toBe(true)
    expect(withSurplus.tables.length).toBeLessThanOrEqual(Math.floor((25 + withSurplus.seatedModeratorIds.length) / TABLE_MIN))
    expect(totalSeats(withSurplus)).toBe(33 + withSurplus.seatedModeratorIds.length)
  })

  it('les attributs réels du modérateur assis sont pris en compte', () => {
    const profile = { member_id: 'mo-4', pseudo: 'Zoé', is_active: true, consents: false, is_veteran: true, group_id: 1 }
    const r = runAllocation({
      members: mix(15, 4),
      moderatorIds: ['mo-1', 'mo-2', 'mo-3', 'mo-4'],
      moderatorProfiles: [profile],
      opinionsAvailable: true,
    })
    expect(r.seatedModeratorIds).toContain('mo-4')
    const seatedTable = r.tables.find(t => t.member_ids.includes('mo-4'))!
    const d = r.diagnostics.find(x => x.table_number === seatedTable.table_number)!
    expect(d.non_consenting).toBeGreaterThanOrEqual(1)
    expect(d.recordable).toBe(false)
  })
})

describe('chantier 25 — transparence du recalcul (H13/H15)', () => {
  it('toutes les tables déjà animées → avertir que les modérateurs en plus ne changent rien', () => {
    // 17 actifs : trois tables au plus (17/5), capacité déjà épuisée par 3 modérateurs.
    const base = { members: mix(17, 5), moderatorIds: ['mo-1', 'mo-2', 'mo-3'], opinionsAvailable: true }
    const a = runAllocation(base)
    const b = runAllocation({ ...base, extraModerators: 3 })
    expect(b.tables).toHaveLength(a.tables.length)
    expect(b.warnings.join(' ')).toContain('déjà toutes animées')
  })

  it('le nombre d’enregistreurs visé est exposé et expliqué', () => {
    const r = runAllocation({ members: mix(25, 5), moderatorIds: ['mo-1', 'mo-2'], recorderCount: 4, opinionsAvailable: true })
    expect(r.recorderTarget).toBe(4)
    if (r.tables.some(t => !t.moderated)) {
      expect(r.warnings.join(' ')).toContain('enregistrables')
    }
  })

  it('recorderCount absent → objectif 1 (garantie minimale de la règle 1)', () => {
    const r = runAllocation({ members: mix(25, 5), moderatorIds: [], opinionsAvailable: true })
    expect(r.recorderTarget).toBe(1)
  })
})

// ── Chantier 92 — appairage (règle 1) ─────────────────────────

describe('chantier 92 — grappes d’appairage', () => {
  const tableOf = (r: ReturnType<typeof runAllocation>, id: string) =>
    r.tables.findIndex(t => t.member_ids.includes(id))

  it('buildClusters : union des liens, plafond à 3, les liens les plus anciens gagnent', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    const { clusters, droppedLinks } = buildClusters(
      [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e']], ids,
    )
    expect(clusters).toEqual([['a', 'b', 'c'], ['d', 'e']])
    expect(droppedLinks).toBe(1)
    expect(clusters.every(c => c.length <= CLUSTER_MAX)).toBe(true)
  })

  it('buildClusters ignore les identifiants inconnus et les auto-liens', () => {
    const { clusters } = buildClusters([['a', 'zz'], ['a', 'a']], ['a', 'b'])
    expect(clusters).toEqual([])
  })

  it('les grappes d’actifs ne sont jamais séparées (60 actifs, 12 grappes)', () => {
    const members = mix(60, 20)
    const pairs: [string, string][] = []
    for (let k = 0; k < 12; k++) {
      pairs.push([`x-${k * 4}`, `x-${k * 4 + 1}`])
      if (k % 3 === 0) pairs.push([`x-${k * 4 + 1}`, `x-${k * 4 + 2}`])
    }
    const r = runAllocation({ members, moderatorIds: ['mo-1', 'mo-2', 'mo-3', 'mo-4', 'mo-5'], opinionsAvailable: true, pairs })
    expect(r.clusters).toHaveLength(12)
    expect(r.brokenClusters).toBe(0)
    for (const c of r.clusters) {
      expect(new Set(c.map(id => tableOf(r, id))).size).toBe(1)
    }
    expect(totalSeats(r)).toBe(80)
  })

  it('un passif appairé à un actif rejoint la table de cet actif', () => {
    const members = mix(30, 10)
    const pairs: [string, string][] = [['x-3', 'x-35'], ['x-36', 'x-37']]
    const r = runAllocation({ members, moderatorIds: ['mo-1', 'mo-2', 'mo-3'], opinionsAvailable: true, pairs })
    expect(tableOf(r, 'x-35')).toBe(tableOf(r, 'x-3'))
    expect(tableOf(r, 'x-36')).toBe(tableOf(r, 'x-37'))
    expect(r.brokenClusters).toBe(0)
  })

  it('reste déterministe avec des grappes', () => {
    const input = {
      members: mix(45, 10), moderatorIds: ['mo-1', 'mo-2', 'mo-3'], opinionsAvailable: true,
      pairs: [['x-0', 'x-9'], ['x-9', 'x-20'], ['x-5', 'x-6']] as [string, string][],
    }
    expect(JSON.stringify(runAllocation(input).tables)).toBe(JSON.stringify(runAllocation(input).tables))
  })

  it('sans liens, le résultat est identique à celui d’avant le chantier', () => {
    const base = { members: mix(40, 8), moderatorIds: ['mo-1', 'mo-2', 'mo-3'], opinionsAvailable: true }
    expect(JSON.stringify(runAllocation(base).tables)).toBe(JSON.stringify(runAllocation({ ...base, pairs: [] }).tables))
  })

  it('countBrokenClusters compte une grappe répartie sur deux tables', () => {
    const tables = [{ member_ids: ['a', 'b'] }, { member_ids: ['c'] }]
    expect(countBrokenClusters(tables, [['a', 'b'], ['b', 'c']])).toBe(1)
  })
})

// ── Chantier 98 — interdire les tables sans modérateur ───────

describe('chantier 98 — option « interdire les tables sans modérateur »', () => {
  it('désactivée par défaut : le comportement est inchangé', () => {
    const base = { members: mix(30, 0), moderatorIds: ['mo-1'], moderatorProfiles: modProfiles(['mo-1']), opinionsAvailable: true }
    expect(JSON.stringify(runAllocation(base).tables))
      .toBe(JSON.stringify(runAllocation({ ...base, forbidUnmoderatedTables: false }).tables))
  })

  it('capacité suffisante : plus de tables sans modérateur, sans dégrader les contraintes dures', () => {
    // 60 actifs / 5 tables (≤ 14 par table animée) exige au moins 5 modérateurs.
    const ids = ['mo-1', 'mo-2', 'mo-3', 'mo-4', 'mo-5']
    const base = { members: mix(60, 0), moderatorIds: ids, moderatorProfiles: modProfiles(ids), opinionsAvailable: true }
    const r = runAllocation({ ...base, forbidUnmoderatedTables: true })
    expect(r.tables.every(t => t.moderated)).toBe(true)
    for (const d of r.diagnostics) {
      expect(d.actives).toBeGreaterThanOrEqual(TABLE_MIN)
      expect(d.actives).toBeLessThanOrEqual(TABLE_MAX_ACTIVE)
    }
    expect(totalSeats(r)).toBe(60 + r.seatedModeratorIds.length)
  })

  it('change effectivement le résultat par rapport au comportement par défaut', () => {
    // 60 actifs / 4 modérateurs : par défaut l'algorithme dégrade en une table
    // sans modérateur plutôt que de renoncer au découpage en petites tables.
    const ids = ['mo-1', 'mo-2', 'mo-3', 'mo-4']
    const base = { members: mix(60, 0), moderatorIds: ids, moderatorProfiles: modProfiles(ids), opinionsAvailable: true }
    const withoutOption = runAllocation(base)
    expect(withoutOption.tables.some(t => !t.moderated)).toBe(true)

    const r = runAllocation({ ...base, forbidUnmoderatedTables: true })
    expect(r.tables.every(t => t.moderated)).toBe(true)
  })

  it('capacité insuffisante pour animer toutes les tables → repli sur une table unique, pas d’exception', () => {
    // 60 actifs, 1 seul modérateur : aucune forme n'a moderatedCount === tableCount
    // dès que tableCount > 1 (capacité de modération = 1).
    const r = runAllocation({
      members: mix(60, 0), moderatorIds: ['mo-1'], moderatorProfiles: modProfiles(['mo-1']),
      opinionsAvailable: true, forbidUnmoderatedTables: true,
    })
    expect(r.tables).toHaveLength(1)
    expect(r.tables[0].moderated).toBe(true)
    expect(r.tables[0].member_ids).toHaveLength(60)
  })

  it('aucun modérateur du tout → repli sur une table unique sans animateur, avec avertissement dédié', () => {
    const r = runAllocation({
      members: mix(30, 0), moderatorIds: [], opinionsAvailable: true, forbidUnmoderatedTables: true,
    })
    expect(r.tables).toHaveLength(1)
    expect(r.tables[0].moderated).toBe(false)
    expect(r.warnings.join(' ')).toContain('interdire les tables sans modérateur')
  })

  it('ne lève jamais d’exception, même sur un grand nombre d’actifs avec peu de modérateurs', () => {
    for (const n of [11, 25, 60, 120]) {
      for (const nMods of [0, 1, 2]) {
        const ids = Array.from({ length: nMods }, (_, i) => `mo-${i}`)
        expect(() => runAllocation({
          members: mix(n, Math.floor(n / 5)), moderatorIds: ids, moderatorProfiles: modProfiles(ids),
          opinionsAvailable: true, forbidUnmoderatedTables: true,
        })).not.toThrow()
      }
    }
  })
})
