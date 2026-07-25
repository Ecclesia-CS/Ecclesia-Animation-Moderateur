// =============================================================
// Chantier 19 (G1) — tests de l'algorithme d'allocation v2
// npm test  (vitest)
// =============================================================

import { describe, it, expect } from 'vitest'
import {
  runAllocation,
  diagnoseAllocation,
  activeThreshold,
  veteranThreshold,
  TABLE_MIN,
  TABLE_MAX,
  MAJORITY_SHARE_CAP,
  MIN_SECOND_CAMP,
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

const totalSeats = (r: ReturnType<typeof runAllocation>) =>
  r.tables.reduce((s, t) => s + t.member_ids.length, 0)

// ── Seuils ───────────────────────────────────────────────────

describe('seuils', () => {
  it('règle 1 — min(⌈2/5·taille⌉, 4)', () => {
    expect(activeThreshold(5)).toBe(2)
    expect(activeThreshold(6)).toBe(3)
    expect(activeThreshold(7)).toBe(3)
    expect(activeThreshold(10)).toBe(4)
    expect(activeThreshold(20)).toBe(4)
  })

  it('règle 4 — ⌈2/5·taille⌉ (sans plafond)', () => {
    expect(veteranThreshold(5)).toBe(2)
    expect(veteranThreshold(6)).toBe(3)
    expect(veteranThreshold(10)).toBe(4)
    expect(veteranThreshold(20)).toBe(8)
  })
})

// ── Contraintes dures ────────────────────────────────────────

describe('contraintes dures de taille', () => {
  it('N ≤ 10 → table unique, pas d’allocation', () => {
    for (const n of [1, 5, 9, 10]) {
      const r = runAllocation({ members: balanced(n), moderatorIds: [], opinionsAvailable: true })
      expect(r.singleTable).toBe(true)
      expect(r.tables).toHaveLength(1)
      expect(r.tables[0].member_ids).toHaveLength(n)
    }
  })

  it('N > 10 → toutes les tables entre 5 et 10', () => {
    for (const n of [11, 12, 17, 23, 40, 57, 60, 83]) {
      const r = runAllocation({ members: balanced(n), moderatorIds: ['mod-1', 'mod-2'], opinionsAvailable: true })
      expect(r.singleTable).toBe(false)
      for (const t of r.tables) {
        expect(t.member_ids.length).toBeGreaterThanOrEqual(TABLE_MIN)
        expect(t.member_ids.length).toBeLessThanOrEqual(TABLE_MAX)
      }
      expect(totalSeats(r)).toBe(n)
    }
  })

  it('aucun membre perdu ni dupliqué', () => {
    const r = runAllocation({ members: balanced(47), moderatorIds: ['mod-1'], opinionsAvailable: true })
    const ids = r.tables.flatMap(t => t.member_ids)
    expect(new Set(ids).size).toBe(47)
  })

  it('population vide → résultat vide, pas d’exception', () => {
    const r = runAllocation({ members: [], moderatorIds: [], opinionsAvailable: true })
    expect(r.tables).toHaveLength(0)
    expect(r.warnings.join(' ')).toContain('Aucun participant')
  })
})

// ── Politique de dimensionnement (§4) ────────────────────────

describe('politique de dimensionnement', () => {
  it('60 participants / 4 modérateurs → 4 tables de 10 animées + 4 de 5 non animées', () => {
    const r = runAllocation({
      members: balanced(60),
      moderatorIds: ['mo-1', 'mo-2', 'mo-3', 'mo-4'],
      opinionsAvailable: true,
    })
    const moderated   = r.tables.filter(t => t.moderated)
    const unmoderated = r.tables.filter(t => !t.moderated)
    expect(moderated).toHaveLength(4)
    expect(moderated.every(t => t.member_ids.length === TABLE_MAX)).toBe(true)
    expect(unmoderated.every(t => t.member_ids.length === TABLE_MIN)).toBe(true)
    expect(r.tables).toHaveLength(8)
  })

  it('30 participants / 4 modérateurs → 3 tables de 10, toutes animées', () => {
    const r = runAllocation({
      members: balanced(30),
      moderatorIds: ['mo-1', 'mo-2', 'mo-3', 'mo-4'],
      opinionsAvailable: true,
    })
    expect(r.tables).toHaveLength(3)
    expect(r.tables.every(t => t.moderated)).toBe(true)
  })

  it('sans modérateur → toutes les tables non animées et proches du minimum', () => {
    const r = runAllocation({ members: balanced(30), moderatorIds: [], opinionsAvailable: true })
    expect(r.tables.every(t => !t.moderated)).toBe(true)
    // La politique pousse vers 5, mais la règle 3 (plus prioritaire) peut
    // préférer 6 : avec 3 camps, une table de 6 (2/2/2) est plus hétérogène
    // qu'une table de 5 (2/2/1). §4 le prévoit explicitement.
    expect(Math.max(...r.tables.map(t => t.member_ids.length))).toBeLessThanOrEqual(6)
    expect(r.warnings.join(' ')).toContain('Aucun modérateur')
  })

  it('sans modérateur et sans discrimination par la règle 3 → tables de 5', () => {
    // Règle 3 désactivée et population homogène sur les règles 1/2/4 : plus
    // rien ne discrimine les formes, la politique de dimensionnement décide
    // seule → découper le reliquat en petites tables (5) plutôt qu'en grandes.
    const members = make(30, { active: true, consent: true, veteran: true, camp: null }, 's')
    const r = runAllocation({ members, moderatorIds: [], opinionsAvailable: false })
    expect(r.tables.every(t => !t.moderated)).toBe(true)
    expect(r.tables.every(t => t.member_ids.length === TABLE_MIN)).toBe(true)
    expect(r.tables).toHaveLength(6)
  })

  it('les modérateurs annoncés (extraModerators) comptent dans la capacité', () => {
    const r = runAllocation({
      members: balanced(30),
      moderatorIds: [],
      extraModerators: 3,
      opinionsAvailable: true,
    })
    expect(r.moderatorCapacity).toBe(3)
    expect(r.tables.filter(t => t.moderated).length).toBeGreaterThan(0)
    // Table annoncée sans modérateur inscrit → avertissement explicite
    expect(r.warnings.join(' ')).toContain('pas encore inscrit')
  })
})

// ── Règle 1 ──────────────────────────────────────────────────

describe('règle 1 — assez de participants actifs', () => {
  it('population moitié active → toutes les tables conformes', () => {
    const r = runAllocation({ members: balanced(40), moderatorIds: ['mo-1'], opinionsAvailable: true })
    expect(r.diagnostics.every(d => d.rule1_ok)).toBe(true)
  })

  it('actifs rares → concentration, jamais d’échec, avertissement', () => {
    const members = [
      ...make(3, { active: true,  camp: 0 }, 'a'),
      ...make(27, { active: false, camp: 1 }, 'p'),
    ]
    const r = runAllocation({ members, moderatorIds: ['mo-1'], opinionsAvailable: true })
    expect(r.tables.length).toBeGreaterThan(0)
    expect(totalSeats(r)).toBe(30)
    expect(r.warnings.join(' ')).toContain('actifs')
    // Les 3 actifs sont regroupés là où ils peuvent atteindre un seuil
    const conform = r.diagnostics.filter(d => d.rule1_ok).length
    expect(conform).toBeGreaterThanOrEqual(1)
  })

  it('règle 1 prime sur la règle 4 (ordre lexicographique)', () => {
    // 20 personnes : 8 actifs-nouveaux, 12 passifs-anciens.
    // Placer les actifs ensemble casse la règle 4 sur cette table,
    // mais la règle 1 est plus prioritaire.
    const members = [
      ...make(8,  { active: true,  veteran: false, camp: 0 }, 'an'),
      ...make(12, { active: false, veteran: true,  camp: 1 }, 'pa'),
    ]
    const r = runAllocation({ members, moderatorIds: [], opinionsAvailable: true })
    const failing1 = r.diagnostics.filter(d => !d.rule1_ok).length
    // 2 tables de 10 → 4 actifs requis chacune, on en a 8 : faisable
    expect(failing1).toBe(0)
  })
})

// ── Règle 2 ──────────────────────────────────────────────────

describe('règle 2 — au moins une table enregistrable', () => {
  it('garantit une table sans non-consentant et non homogène', () => {
    const members = [
      ...make(10, { consent: true,  camp: 0 }, 'c0'),
      ...make(10, { consent: true,  camp: 1 }, 'c1'),
      ...make(10, { consent: false, camp: 2 }, 'nc'),
    ]
    const r = runAllocation({ members, moderatorIds: ['mo-1'], opinionsAvailable: true })
    expect(r.diagnostics.some(d => d.recordable)).toBe(true)
  })

  it('recorderCount = 3 → vise 3 tables propres', () => {
    const members = [
      ...make(24, { consent: true, camp: 0 }, 'c0'),
      ...make(24, { consent: true, camp: 1 }, 'c1'),
      ...make(6,  { consent: false, camp: 2 }, 'nc'),
    ]
    const r = runAllocation({
      members, moderatorIds: ['mo-1', 'mo-2', 'mo-3'], recorderCount: 3, opinionsAvailable: true,
    })
    expect(r.diagnostics.filter(d => d.recordable).length).toBeGreaterThanOrEqual(3)
  })

  it('aucun consentant → règle 2 abandonnée, pas d’échec', () => {
    const members = balanced(30).map(m => ({ ...m, consents: false }))
    const r = runAllocation({ members, moderatorIds: ['mo-1'], opinionsAvailable: true })
    expect(r.diagnostics.every(d => !d.recordable)).toBe(true)
    expect(totalSeats(r)).toBe(30)
  })

  it('une table homogène et consentante n’est pas comptée enregistrable', () => {
    const diags = diagnoseAllocation(
      [{ table_number: 1, moderated: false, member_ids: ['h-0', 'h-1', 'h-2', 'h-3', 'h-4'] }],
      make(5, { consent: true, camp: 0 }, 'h'),
      true,
    )
    expect(diags[0].recordable).toBe(false)
  })
})

// ── Règle 3 ──────────────────────────────────────────────────

describe('règle 3 — hétérogénéité des opinions', () => {
  it('camps équilibrés → toutes les tables viables', () => {
    const r = runAllocation({ members: balanced(45), moderatorIds: ['mo-1'], opinionsAvailable: true })
    expect(r.diagnostics.every(d => d.rule3_ok)).toBe(true)
    for (const d of r.diagnostics) {
      expect(d.majority_share!).toBeLessThanOrEqual(MAJORITY_SHARE_CAP + 1e-9)
    }
  })

  it('dissidents rares → concentrés (seuil), pas étalés à 1 par table', () => {
    // 4 dissidents pour 26 majoritaires : le maximin seul les étalerait.
    const members = [
      ...make(26, { camp: 0 }, 'maj'),
      ...make(4,  { camp: 1 }, 'dis'),
    ]
    const r = runAllocation({ members, moderatorIds: [], opinionsAvailable: true })
    const tablesWithDissidents = r.diagnostics.filter(d => (d.camp_counts['1'] ?? 0) > 0)
    // Concentration : au plus 2 tables reçoivent des dissidents (2 par table),
    // et aucune table n'en reçoit exactement 1 alors qu'un regroupement est possible.
    expect(tablesWithDissidents.every(d => (d.camp_counts['1'] ?? 0) >= MIN_SECOND_CAMP)).toBe(true)
    expect(tablesWithDissidents.length).toBeLessThanOrEqual(2)
  })

  it('analyse indisponible → règle 3 désactivée, pas d’exception, avertissement', () => {
    const members = balanced(30).map(m => ({ ...m, group_id: null }))
    const r = runAllocation({ members, moderatorIds: ['mo-1'], opinionsAvailable: false })
    expect(totalSeats(r)).toBe(30)
    expect(r.warnings.join(' ')).toContain('règle 3')
    expect(r.diagnostics.every(d => d.rule3_ok === false)).toBe(true)
  })

  it('un seul camp → avertissement, allocation quand même', () => {
    const r = runAllocation({ members: make(30, { camp: 0 }), moderatorIds: [], opinionsAvailable: true })
    expect(totalSeats(r)).toBe(30)
    expect(r.warnings.join(' ')).toContain("Un seul camp")
  })

  it('non-votants (camp null) neutres : ils ne cassent pas la viabilité', () => {
    const members = [
      ...make(10, { camp: 0 }, 'c0'),
      ...make(10, { camp: 1 }, 'c1'),
      ...make(10, { camp: null }, 'nv'),
    ]
    const r = runAllocation({ members, moderatorIds: [], opinionsAvailable: true })
    expect(r.diagnostics.every(d => d.rule3_ok)).toBe(true)
    expect(r.diagnostics.reduce((s, d) => s + d.neutral_count, 0)).toBe(10)
  })
})

// ── Règle 4 ──────────────────────────────────────────────────

describe('règle 4 — assez d’anciens', () => {
  it('≥ 40 % d’anciens → toutes les tables conformes', () => {
    const members = [
      ...make(20, { veteran: true,  camp: 0 }, 'v'),
      ...make(20, { veteran: false, camp: 1 }, 'n'),
    ]
    const r = runAllocation({ members, moderatorIds: [], opinionsAvailable: true })
    expect(r.diagnostics.every(d => d.rule4_ok)).toBe(true)
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

// ── Règle 5 ──────────────────────────────────────────────────

describe('règle 5 — les nouveaux avec un modérateur', () => {
  it('à qualité égale, les nouveaux vont aux tables modérées', () => {
    // 20 personnes, tous actifs/consentants, 2 camps équilibrés :
    // les règles 1-3 sont satisfaites quelle que soit la répartition
    // anciens/nouveaux, la règle 4 est saturée (50 % d'anciens) → la
    // règle 5 devient le critère discriminant.
    const members = Array.from({ length: 20 }, (_, i) => ({
      member_id: `x-${i}`,
      pseudo: `x${i}`,
      is_active: true,
      consents: true,
      is_veteran: i % 2 === 0,
      group_id: i % 2,
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
    const members = balanced(53)
    const a = runAllocation({ members, moderatorIds: ['mo-1', 'mo-2'], opinionsAvailable: true })
    const b = runAllocation({ members, moderatorIds: ['mo-1', 'mo-2'], opinionsAvailable: true })
    expect(JSON.stringify(a.tables)).toBe(JSON.stringify(b.tables))
  })

  it('l’ordre des membres en entrée ne change pas la qualité du résultat', () => {
    const members = balanced(40)
    const reversed = [...members].reverse()
    const a = runAllocation({ members, moderatorIds: ['mo-1'], opinionsAvailable: true })
    const b = runAllocation({ members: reversed, moderatorIds: ['mo-1'], opinionsAvailable: true })
    expect(a.score.slice(0, 7)).toEqual(b.score.slice(0, 7))
  })
})

// ── Dégradation : l’algorithme ne peut jamais échouer ─────────

describe('robustesse — jamais d’échec', () => {
  const hostile: [string, AllocationMember[]][] = [
    ['tous passifs',            make(37, { active: false })],
    ['tous non consentants',    make(37, { consent: false })],
    ['tous nouveaux',           make(37, { veteran: false })],
    ['aucun vote',              make(37, { camp: null })],
    ['tout dégradé',            make(41, { active: false, consent: false, veteran: false, camp: null })],
    ['un seul camp, 11 pers.',  make(11, { camp: 0 })],
    ['12 personnes',            balanced(12)],
    ['200 personnes',           balanced(200)],
  ]

  for (const [label, members] of hostile) {
    it(`${label} → allocation produite, tous les membres placés`, () => {
      const r = runAllocation({ members, moderatorIds: ['mo-1'], opinionsAvailable: true })
      expect(totalSeats(r)).toBe(members.length)
      const ids = r.tables.flatMap(t => t.member_ids)
      expect(new Set(ids).size).toBe(members.length)
      if (!r.singleTable) {
        for (const t of r.tables) {
          expect(t.member_ids.length).toBeGreaterThanOrEqual(TABLE_MIN)
        }
      }
    })
  }

  it('200 personnes → calcul sous 5 s (budget d’évaluations borné)', () => {
    const start = Date.now()
    runAllocation({ members: balanced(200), moderatorIds: ['a', 'b', 'c', 'd'], opinionsAvailable: true })
    expect(Date.now() - start).toBeLessThan(5000)
  })
})

// ── Dépassement du plafond de 10 ─────────────────────────────

describe('dépassement toléré jusqu’à 20', () => {
  it('non utilisé quand la règle 1 est satisfaisable sous 10', () => {
    const r = runAllocation({ members: balanced(40), moderatorIds: ['mo-1'], opinionsAvailable: true })
    expect(r.overflowUsed).toBe(false)
    expect(Math.max(...r.tables.map(t => t.member_ids.length))).toBeLessThanOrEqual(TABLE_MAX)
  })

  it('déclenché seulement s’il améliore strictement la règle 1', () => {
    // 24 personnes dont 4 actifs : sous 10 il faut ≥ 3 tables (24/10 → 3),
    // soit 3×4 = 10 actifs requis, impossible. En agrandissant on réduit
    // le nombre de tables et donc le total d'actifs exigé.
    const members = [
      ...make(4,  { active: true,  camp: 0 }, 'a'),
      ...make(20, { active: false, camp: 1 }, 'p'),
    ]
    const r = runAllocation({ members, moderatorIds: ['mo-1'], opinionsAvailable: true })
    expect(totalSeats(r)).toBe(24)
    if (r.overflowUsed) {
      expect(Math.max(...r.tables.map(t => t.member_ids.length))).toBeGreaterThan(TABLE_MAX)
      expect(r.warnings.join(' ')).toContain('règle 1')
      // Le dépassement n'est retenu que s'il améliore strictement la règle 1 :
      // au moins une table conforme, sans garantie que toutes le soient.
      expect(r.diagnostics.some(d => d.rule1_ok)).toBe(true)
    } else {
      expect(Math.max(...r.tables.map(t => t.member_ids.length))).toBeLessThanOrEqual(TABLE_MAX)
    }
  })
})

// ── diagnoseAllocation (retouches manuelles) ─────────────────

describe('diagnoseAllocation', () => {
  it('recalcule les seuils sur une répartition arbitraire', () => {
    const members = [
      ...make(5, { active: true,  veteran: true,  consent: true,  camp: 0 }, 'A'),
      ...make(5, { active: false, veteran: false, consent: false, camp: 0 }, 'B'),
    ]
    const diags = diagnoseAllocation(
      [
        { table_number: 1, moderated: true,  member_ids: members.slice(0, 5).map(m => m.member_id) },
        { table_number: 2, moderated: false, member_ids: members.slice(5).map(m => m.member_id) },
      ],
      members,
      true,
    )
    expect(diags).toHaveLength(2)
    expect(diags[0].actives).toBe(5)
    expect(diags[0].rule1_ok).toBe(true)
    expect(diags[0].moderated).toBe(true)
    expect(diags[1].actives).toBe(0)
    expect(diags[1].rule1_ok).toBe(false)
    expect(diags[1].non_consenting).toBe(5)
    expect(diags[1].recordable).toBe(false)
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
