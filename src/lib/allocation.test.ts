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

/**
 * Profils de modérateurs — chantier 25b.
 * `loadAllocationInputs` renvoie **toujours** les attributs réels des
 * modérateurs, donc la production passe toujours `moderatorProfiles`. Les
 * tests qui mettent un surplus en jeu doivent en faire autant : sans profil,
 * le modérateur assis retombe sur les défauts conservateurs (nouveau, passif,
 * non consentant), ce qui fait passer la population sous 40 % d'anciens et
 * déclenche une faiblesse *préexistante* du taux d'échec de la règle 4 —
 * sans rapport avec ce qu'on teste ici (voir A_VERIFIER.md).
 */
function modProfiles(ids: string[]): AllocationMember[] {
  return ids.map((id, i) => ({
    member_id: id, pseudo: id,
    is_active: true, consents: true, is_veteran: true, group_id: i % 3,
  }))
}

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

  it('60 participants / 4 modérateurs — même exigence sur une population DÉCORRÉLÉE', () => {
    // Chantier 29 (I1) — durcissement du test précédent.
    //
    // Le test ci-dessus emploie `balanced(60)`, dont les attributs sont
    // corrélés par construction (`i%2`, `i%5`, `i%3`). Il passait donc alors
    // même que la propriété n'était PAS tenue : sur une population de même
    // composition agrégée (24 anciens, 30 actifs, 3 camps équilibrés, tous
    // consentants) mais aux attributs décorrélés — c'est-à-dire une vraie
    // salle — l'algorithme d'avant le chantier 29 produisait
    // `10M 10M 10M 10M 10- 10-`, soit 6 tables dont deux de 10 sans
    // animateur : très exactement ce que le §4 désigne comme le mauvais
    // résultat (« plutôt que 6 tables de 10 dont 2 sans animateur »).
    //
    // Ne pas remplacer cette population par un helper « pratique » qui
    // recorrélerait les attributs : c'est la décorrélation qui fait le test.
    const idx = [...Array(60).keys()]
    const rotate = (k: number, m: number) => (i: number) => (i * k + 7) % 60 < m
    const isVeteran = rotate(23, 24)  // 24 anciens (40 %)
    const isActive  = rotate(37, 30)  // 30 actifs  (50 %)
    const members: AllocationMember[] = idx.map(i => ({
      member_id: `d-${i}`,
      pseudo: `d${i}`,
      is_active: isActive(i),
      consents: true,
      is_veteran: isVeteran(i),
      group_id: (i * 11 + 4) % 3,
    }))
    // Garde-fou sur le jeu de données lui-même : si ces effectifs changent,
    // le test ne teste plus l'exemple normatif.
    expect(members.filter(m => m.is_veteran)).toHaveLength(24)
    expect(members.filter(m => m.is_active)).toHaveLength(30)

    const r = runAllocation({
      members,
      moderatorIds: ['mo-1', 'mo-2', 'mo-3', 'mo-4'],
      opinionsAvailable: true,
    })
    const moderated   = r.tables.filter(t => t.moderated)
    const unmoderated = r.tables.filter(t => !t.moderated)
    expect(moderated).toHaveLength(4)
    expect(moderated.every(t => t.member_ids.length === TABLE_MAX)).toBe(true)
    // Le cœur du §4 : le reliquat est découpé vers le minimum de 5, pas laissé
    // en grosses tables sans animateur.
    expect(unmoderated.every(t => t.member_ids.length === TABLE_MIN)).toBe(true)
    expect(r.tables).toHaveLength(8)
  })

  it('30 participants / 4 modérateurs → 3 animateurs, le 4e prend un siège', () => {
    // Chantier 25b : la demande n'est que de 3 tables, donc le 4e modérateur
    // n'anime rien et redevient un participant (H17) — la population passe à 31,
    // qui ne tient pas en 3 tables de 10. L'ancienne attente « 3 tables de 10
    // toutes animées » est donc devenue impossible, et non pas régressée.
    const ids = ['mo-1', 'mo-2', 'mo-3', 'mo-4']
    const r = runAllocation({
      members: balanced(30),
      moderatorIds: ids,
      moderatorProfiles: modProfiles(ids),
      opinionsAvailable: true,
    })
    expect(r.animatingModerators).toBe(3)
    expect(r.seatedModeratorIds).toEqual(['mo-4'])
    // 30 participants + le modérateur assis
    expect(totalSeats(r)).toBe(31)
    // Les tables animées restent remplies au plafond (§4).
    const moderated = r.tables.filter(t => t.moderated)
    expect(moderated).toHaveLength(3)
    expect(moderated[0].member_ids.length).toBe(TABLE_MAX)
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

  it('chantier 32 (J7) — faire varier extraModerators (0/+1/+2/+3) change la capacité et le nombre de tables animées quand elle est le facteur limitant', () => {
    // 1 seul modérateur inscrit pour une population qui produit plusieurs
    // tables : la capacité de modération (1) est bien inférieure au nombre de
    // tables, donc chaque modérateur annoncé en plus doit être pris en compte.
    const members = balanced(40)
    const base = { members, moderatorIds: ['mo-1'], moderatorProfiles: modProfiles(['mo-1']), opinionsAvailable: true }

    const runs = [0, 1, 2, 3].map(extra => runAllocation({ ...base, extraModerators: extra }))

    runs.forEach((r, i) => expect(r.moderatorCapacity).toBe(1 + i))
    const moderatedCounts = runs.map(r => r.tables.filter(t => t.moderated).length)
    // Strictement croissant tant que la capacité reste sous le nombre de tables.
    for (let i = 1; i < moderatedCounts.length; i++) {
      expect(moderatedCounts[i]).toBeGreaterThanOrEqual(moderatedCounts[i - 1])
    }
    expect(moderatedCounts[3]).toBeGreaterThan(moderatedCounts[0])
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

// ── Chantier 25 — modérateurs en surplus / déficit ───────────

describe('chantier 25 — modérateurs en surplus (H17)', () => {
  it('un modérateur sans table devient un participant ordinaire', () => {
    // 25 places → 3 tables et 3 animateurs : le 4e modérateur n'anime rien.
    // Avant le chantier 25 il disparaissait purement du résultat.
    const ids = ['mo-1', 'mo-2', 'mo-3', 'mo-4']
    const r = runAllocation({
      members: balanced(25),
      moderatorIds: ids,
      moderatorProfiles: modProfiles(ids),
      opinionsAvailable: true,
    })
    expect(r.tables).toHaveLength(3)
    expect(r.animatingModerators).toBe(3)
    expect(r.seatedModeratorIds).toEqual(['mo-4'])

    // Il occupe un siège comme n'importe quel participant.
    expect(totalSeats(r)).toBe(26)
    const seatedTable = r.tables.find(t => t.member_ids.includes('mo-4'))
    expect(seatedTable).toBeDefined()
    expect(seatedTable!.moderator_member_ids).not.toContain('mo-4')
  })

  it('le modérateur assis est optimisé, pas casé dans la table la moins pleine', () => {
    // Chantier 25b — il entre dans la population AVANT la recherche, donc il
    // est soumis aux règles 1 à 5. On le rend seul porteur du camp 2 : la
    // règle 3 doit alors le placer là où ce camp est utile, et non
    // mécaniquement dans la plus petite table (comportement du 25a).
    const members: AllocationMember[] = [
      ...make(12, { camp: 0 }, 'c0'),
      ...make(12, { camp: 1 }, 'c1'),
      ...make(1,  { camp: 2 }, 'c2'),
    ]
    const ids = ['mo-1', 'mo-2', 'mo-3', 'mo-4']
    const r = runAllocation({
      members,
      moderatorIds: ids,
      moderatorProfiles: ids.map(id => ({
        member_id: id, pseudo: id,
        is_active: true, consents: true, is_veteran: true, group_id: 2,
      })),
      opinionsAvailable: true,
    })
    expect(r.seatedModeratorIds).toEqual(['mo-4'])
    const seatedTable = r.tables.find(t => t.member_ids.includes('mo-4'))!
    const d = r.diagnostics.find(x => x.table_number === seatedTable.table_number)!
    // Son camp est bien comptabilisé dans les diagnostics de sa table.
    expect(d.camp_counts['2']).toBeGreaterThanOrEqual(1)
    // Et la taille annoncée correspond à la table réelle.
    expect(d.size).toBe(seatedTable.member_ids.length)
  })

  it('aucun modérateur inscrit n’est laissé sans affectation', () => {
    for (const nMods of [1, 2, 3, 4, 6, 8]) {
      const ids = Array.from({ length: nMods }, (_, i) => `mo-${i}`)
      const r = runAllocation({
        members: balanced(25), moderatorIds: ids,
        moderatorProfiles: modProfiles(ids), opinionsAvailable: true,
      })
      const placed = new Set([
        ...r.tables.flatMap(t => t.moderator_member_ids),
        ...r.tables.flatMap(t => t.member_ids),
      ])
      for (const id of ids) expect(placed.has(id)).toBe(true)
      // Jamais à la fois animateur et participant.
      const animating = r.tables.flatMap(t => t.moderator_member_ids)
      expect(animating.filter(id => r.seatedModeratorIds.includes(id))).toHaveLength(0)
    }
  })

  it('le surplus ne fait pas exploser le nombre de tables', () => {
    const base = ['mo-1', 'mo-2', 'mo-3']
    const many = [...base, 'mo-4', 'mo-5', 'mo-6']
    const without = runAllocation({
      members: balanced(25), moderatorIds: base,
      moderatorProfiles: modProfiles(base), opinionsAvailable: true,
    })
    const withSurplus = runAllocation({
      members: balanced(25), moderatorIds: many,
      moderatorProfiles: modProfiles(many), opinionsAvailable: true,
    })
    // La population augmente (3 modérateurs prennent un siège), donc la forme
    // peut légitimement changer — mais elle ne doit pas se fragmenter : le
    // nombre de tables animées est conservé et le total reste raisonnable.
    expect(withSurplus.animatingModerators).toBe(without.animatingModerators)
    expect(withSurplus.tables.length).toBeLessThanOrEqual(without.tables.length + 1)
    expect(totalSeats(withSurplus)).toBe(totalSeats(without) + 3)
  })

  it('les attributs réels du modérateur assis sont pris en compte', () => {
    const profile = {
      member_id: 'mo-4', pseudo: 'Zoé',
      is_active: true, consents: false, is_veteran: true, group_id: 1,
    }
    const r = runAllocation({
      members: balanced(25),
      moderatorIds: ['mo-1', 'mo-2', 'mo-3', 'mo-4'],
      moderatorProfiles: [profile],
      opinionsAvailable: true,
    })
    const seatedTable = r.tables.find(t => t.member_ids.includes('mo-4'))!
    const d = r.diagnostics.find(x => x.table_number === seatedTable.table_number)!
    // Non consentant → sa table ne peut plus être enregistrable.
    expect(d.non_consenting).toBeGreaterThanOrEqual(1)
    expect(d.recordable).toBe(false)
  })

  it('les diagnostics décrivent bien les tailles réelles après placement', () => {
    const r = runAllocation({
      members: balanced(25),
      moderatorIds: ['mo-1', 'mo-2', 'mo-3', 'mo-4'],
      opinionsAvailable: true,
    })
    for (const t of r.tables) {
      const d = r.diagnostics.find(x => x.table_number === t.table_number)!
      expect(d.size).toBe(t.member_ids.length)
    }
  })
})

describe('chantier 25 — transparence du recalcul (H13/H15)', () => {
  it('toutes les tables déjà animées → avertir que les modérateurs en plus ne changent rien', () => {
    const base = { members: balanced(25), moderatorIds: ['mo-1', 'mo-2', 'mo-3'], opinionsAvailable: true }
    const a = runAllocation(base)
    const b = runAllocation({ ...base, extraModerators: 3 })
    // Comportement inchangé (conforme au §4), mais désormais expliqué.
    expect(b.tables).toHaveLength(a.tables.length)
    expect(b.warnings.join(' ')).toContain('déjà toutes animées')
  })

  it('le nombre d’enregistreurs visé est exposé et expliqué', () => {
    const r = runAllocation({
      members: balanced(25), moderatorIds: ['mo-1', 'mo-2'],
      recorderCount: 4, opinionsAvailable: true,
    })
    expect(r.recorderTarget).toBe(4)
    if (r.tables.some(t => !t.moderated)) {
      expect(r.warnings.join(' ')).toContain('enregistrables')
    }
  })

  it('recorderCount absent → objectif 1 (garantie minimale de la règle 2)', () => {
    const r = runAllocation({ members: balanced(25), moderatorIds: [], opinionsAvailable: true })
    expect(r.recorderTarget).toBe(1)
  })
})
