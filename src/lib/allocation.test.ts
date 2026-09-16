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
  TABLE_MAX_ACTIVE,
  TABLE_OVERFLOW_MAX,
  TABLE_TOTAL_MAX,
  UNMODERATED_TABLE_MIN,
  UNMODERATED_TABLE_MAX,
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
  it('règle 1 — ⌊3/5·taille⌋, sans plafond (chantier 91)', () => {
    expect(activeThreshold(4)).toBe(2)
    expect(activeThreshold(5)).toBe(3)
    expect(activeThreshold(6)).toBe(3)
    expect(activeThreshold(7)).toBe(4)
    expect(activeThreshold(10)).toBe(6)
    expect(activeThreshold(12)).toBe(7)
    // Valeur donnée par Jules : « sur une table à 14, au moins 8 actifs » (arrondi bas).
    expect(activeThreshold(14)).toBe(8)
    // L'ancien min(…, 4) neutralisait le ratio au-delà de 10 personnes.
    expect(activeThreshold(20)).toBe(12)
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

  it('N > 10 → tables animées ≥ 5 et ≤ TABLE_OVERFLOW_MAX actifs, tables sans modérateur entre UNMODERATED_TABLE_MIN et MAX', () => {
    for (const n of [11, 12, 17, 23, 40, 57, 60, 83]) {
      const r = runAllocation({ members: balanced(n), moderatorIds: ['mod-1', 'mod-2'], opinionsAvailable: true })
      expect(r.singleTable).toBe(false)
      for (const t of r.tables) {
        if (t.moderated) {
          expect(t.member_ids.length).toBeGreaterThanOrEqual(TABLE_MIN)
          // Chantier 91 : le plafond porte sur les actifs seulement, les
          // passifs s'ajoutent en plus. TABLE_OVERFLOW_MAX (pas
          // TABLE_MAX_ACTIVE) : le dépassement reste toléré s'il sauve la règle 1.
          const d = r.diagnostics.find(x => x.table_number === t.table_number)!
          expect(d.actives).toBeLessThanOrEqual(TABLE_OVERFLOW_MAX)
          expect(t.member_ids.length).toBeLessThanOrEqual(TABLE_TOTAL_MAX)
        } else {
          expect(t.member_ids.length).toBeGreaterThanOrEqual(UNMODERATED_TABLE_MIN)
          expect(t.member_ids.length).toBeLessThanOrEqual(UNMODERATED_TABLE_MAX)
        }
      }
      // Un modérateur en surplus (capacité > tables réellement animées, ex.
      // une seule table animée suffit) est réintégré
      // comme participant ordinaire (H17) — il s'ajoute donc à la population.
      expect(totalSeats(r)).toBe(n + r.seatedModeratorIds.length)
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
  it('60 participants / 4 modérateurs → 4 tables animées accueillent tout le monde, aucune table sans modérateur', () => {
    // Historique : 4×10 + 4×5 (spec), puis 4×12 animées + reliquat de 12 sans
    // modérateur (2026-08-03). Chantier 91 : les passifs ne comptent plus dans
    // la taille et vont aux tables animées — avec 50 % d'actifs, aucun reste
    // n'est envoyé à une table sans animateur, où il manquerait d'actifs.
    const r = runAllocation({
      members: balanced(60),
      moderatorIds: ['mo-1', 'mo-2', 'mo-3', 'mo-4'],
      opinionsAvailable: true,
    })
    const moderated = r.diagnostics.filter(d => d.moderated)
    expect(moderated).toHaveLength(4)
    expect(r.tables).toHaveLength(4)
    expect(moderated.every(d => d.actives <= TABLE_MAX_ACTIVE)).toBe(true)
    expect(r.diagnostics.every(d => d.passives_ok)).toBe(true)
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
    // Le cœur du §4 : pas de grosses tables sans animateur (ex. deux tables de
    // 10, ce que ce test avait vocation à empêcher). Depuis le chantier 91,
    // les passifs vont aux tables animées : il n'en reste aucune sans modérateur.
    expect(unmoderated).toHaveLength(0)
    expect(r.diagnostics.every(d => d.passives_ok)).toBe(true)
  })

  it('30 participants / 4 modérateurs → les 4 animent (chantier 91)', () => {
    // Chantier 25b : 3 tables seulement, le 4e modérateur prenait un siège.
    // Chantier 91 : sans plafond de taille totale, rien n'obligeait plus à
    // utiliser tous les modérateurs — le second terme de la règle 2 (le plus
    // de tables animées possible) le rétablit. Le surplus réel reste couvert
    // par les tests du chantier 25 ci-dessous (19 participants).
    const ids = ['mo-1', 'mo-2', 'mo-3', 'mo-4']
    const r = runAllocation({
      members: balanced(30),
      moderatorIds: ids,
      moderatorProfiles: modProfiles(ids),
      opinionsAvailable: true,
    })
    expect(r.animatingModerators).toBe(4)
    expect(r.seatedModeratorIds).toEqual([])
    expect(totalSeats(r)).toBe(30)
    expect(r.tables.every(t => t.moderated)).toBe(true)
  })

  it('chantier 91 — tous les modérateurs animent quand la population le permet', () => {
    // Garde-fou contre la régression mesurée pendant le chantier : 47
    // participants / 4 modérateurs donnaient 3 tables de ~22 et un modérateur
    // assis, faute de plafond de taille totale.
    const ids = ['mo-1', 'mo-2', 'mo-3', 'mo-4']
    const r = runAllocation({
      members: balanced(47), moderatorIds: ids, moderatorProfiles: modProfiles(ids), opinionsAvailable: true,
    })
    expect(r.animatingModerators).toBe(4)
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
  it('population à 60 % active → toutes les tables conformes', () => {
    // Chantier 91 : le seuil passe à 3/5 — une salle à 50 % d'actifs ne peut
    // plus le tenir partout, par construction.
    const members = [
      ...make(24, { active: true }, 'a'),
      ...make(16, { active: false }, 'p'),
    ].map((m, i) => ({ ...m, group_id: i % 3 }))
    const r = runAllocation({ members, moderatorIds: ['mo-1'], opinionsAvailable: true })
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
    // Chantier 91 : aucune table ne peut atteindre 3/5 d'actifs ; les passifs
    // restent à la table animée jusqu'au plafond dur, seul l'excédent part
    // sans animateur, et c'est annoncé.
    const unmoderatedPassives = r.diagnostics.filter(d => !d.moderated).reduce((s, d) => s + d.passives, 0)
    expect(unmoderatedPassives).toBeLessThanOrEqual(30 - TABLE_TOTAL_MAX)
    expect(r.warnings.join(' ')).toContain('passif')
  })

  it('2026-08-03 — tables sans modérateur : plancher dur de 3 actifs (la formule seule donnerait 2)', () => {
    // Chantier 91 : avec ⌊3/5·taille⌋ la formule donne déjà 3 dès 5 personnes,
    // le plancher ne mord plus que sur une table de 4 — possible seulement
    // après retouche manuelle, d'où la démonstration via diagnoseAllocation.
    const members = [
      ...make(2, { active: true,  veteran: true }, 'a'),
      ...make(2, { active: false, veteran: true }, 'p'),
    ]
    const diags = diagnoseAllocation(
      [{ table_number: 1, moderated: false, member_ids: members.map(m => m.member_id) }],
      members,
      true,
    )
    expect(diags[0].actives_threshold).toBe(3)
    expect(diags[0].rule1_ok).toBe(false)

    // La même table, animée : la formule seule s'applique (2), satisfaite.
    const diagsModerated = diagnoseAllocation(
      [{ table_number: 1, moderated: true, member_ids: members.map(m => m.member_id) }],
      members,
      true,
    )
    expect(diagsModerated[0].actives_threshold).toBe(2)
    expect(diagsModerated[0].rule1_ok).toBe(true)
  })

  it('60 % d’actifs, sans modérateur → le plancher de 3 est tenu', () => {
    const members = [
      ...make(12, { active: true,  veteran: true, camp: 0 }, 'a'),
      ...make(8,  { active: false, veteran: true, camp: 1 }, 'p'),
    ]
    const r = runAllocation({ members, moderatorIds: [], opinionsAvailable: true })
    expect(r.diagnostics.every(d => !d.moderated)).toBe(true)
    expect(r.diagnostics.every(d => d.rule1_ok)).toBe(true)
  })

  it('règle 1 prime sur la règle des anciens (ordre lexicographique)', () => {
    // 20 personnes : 12 actifs-nouveaux, 8 passifs-anciens (chantier 91 : 60 %
    // d'actifs, pour que le seuil de 3/5 soit atteignable). Les anciens étant
    // tous passifs, la répartition des actifs dicte celle des anciens ; la
    // règle 1 est servie d'abord.
    const members = [
      ...make(12, { active: true,  veteran: false, camp: 0 }, 'an'),
      ...make(8,  { active: false, veteran: true,  camp: 1 }, 'pa'),
    ]
    const moderatorIds = ['mo-1', 'mo-2']
    const r = runAllocation({
      members, moderatorIds, moderatorProfiles: modProfiles(moderatorIds), opinionsAvailable: true,
    })
    const failing1 = r.diagnostics.filter(d => !d.rule1_ok).length
    expect(failing1).toBe(0)
  })
})

// ── Chantier 91 — passifs ────────────────────────────────────

describe('chantier 91 — passifs hors des limites de taille', () => {
  /** `a` actifs puis `p` passifs, camps et anciens alternés. */
  const mix = (a: number, p: number): AllocationMember[] =>
    [...make(a, { active: true }, 'a'), ...make(p, { active: false }, 'p')]
      .map((m, i) => ({ ...m, group_id: i % 3, is_veteran: i % 2 === 0 }))

  it('une table animée plafonne à 14 actifs, les passifs s’ajoutent au-delà', () => {
    const r = runAllocation({ members: mix(28, 18), moderatorIds: ['mo-1', 'mo-2'], opinionsAvailable: true })
    expect(r.diagnostics.every(d => d.actives <= TABLE_MAX_ACTIVE)).toBe(true)
    expect(Math.max(...r.diagnostics.map(d => d.size))).toBeGreaterThan(TABLE_MAX_ACTIVE)
    expect(r.diagnostics.every(d => d.rule1_ok)).toBe(true)
  })

  it('pas de passif à une table sans modérateur tant que les tables animées peuvent les accueillir', () => {
    const r = runAllocation({ members: mix(30, 8), moderatorIds: ['mo-1', 'mo-2'], opinionsAvailable: true })
    expect(r.diagnostics.some(d => !d.moderated)).toBe(true)
    expect(r.diagnostics.every(d => d.passives_ok)).toBe(true)
    expect(r.warnings.join(' ')).not.toContain('passif')
  })

  it('les passifs vont d’abord aux tables animées les plus fournies en actifs', () => {
    const r = runAllocation({ members: mix(30, 8), moderatorIds: ['mo-1', 'mo-2'], opinionsAvailable: true })
    const moderated = r.diagnostics.filter(d => d.moderated).sort((x, y) => y.actives - x.actives)
    expect(moderated[0].passives).toBeGreaterThanOrEqual(moderated[moderated.length - 1].passives)
  })

  it('passifs sans table animée pour les accueillir → dégradation annoncée, jamais d’échec', () => {
    const r = runAllocation({ members: mix(12, 30), moderatorIds: [], opinionsAvailable: true })
    expect(totalSeats(r)).toBe(42)
    expect(r.warnings.join(' ')).toContain('passif')
    expect(r.diagnostics.some(d => !d.passives_ok)).toBe(true)
  })

  it('salle entièrement passive (onboarding sauté) → aucune table au-delà de TABLE_TOTAL_MAX', () => {
    const r = runAllocation({ members: make(37, { active: false }), moderatorIds: ['mo-1'], opinionsAvailable: true })
    expect(totalSeats(r)).toBe(37)
    expect(Math.max(...r.tables.map(t => t.member_ids.length))).toBeLessThanOrEqual(TABLE_TOTAL_MAX)
  })

  it('diagnoseAllocation expose les passifs et la règle des passifs après retouche', () => {
    const members = mix(3, 2)
    const ids = members.map(m => m.member_id)
    const [unmod] = diagnoseAllocation([{ table_number: 1, moderated: false, member_ids: ids }], members, true)
    expect(unmod.passives).toBe(2)
    expect(unmod.passives_ok).toBe(false)
    const [mod] = diagnoseAllocation([{ table_number: 1, moderated: true, member_ids: ids }], members, true)
    expect(mod.passives_ok).toBe(true)
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
    expect(r.warnings.join(' ')).toContain('règle 4')
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
  it('≥ 40 % d’anciens, tables animées → conformes (formule inchangée)', () => {
    const members = [
      ...make(20, { veteran: true,  camp: 0 }, 'v'),
      ...make(20, { veteran: false, camp: 1 }, 'n'),
    ]
    const moderatorIds = ['mod-1']
    const r = runAllocation({
      members, moderatorIds, moderatorProfiles: modProfiles(moderatorIds), opinionsAvailable: true,
    })
    const moderated = r.diagnostics.filter(d => d.moderated)
    expect(moderated.length).toBeGreaterThan(0)
    expect(moderated.every(d => d.rule4_ok)).toBe(true)
  })

  it('2026-08-01 — tables sans modérateur : plancher dur de 3 anciens (40 % ne suffit plus)', () => {
    // Même population que le test précédent, sans modérateur cette fois :
    // 50 % d'anciens ne suffit pas partout (une table de 4 avec le plancher 3
    // demande 75 %) — la formule seule (40 %) l'aurait laissé passer.
    const members = [
      ...make(20, { veteran: true,  camp: 0 }, 'v'),
      ...make(20, { veteran: false, camp: 1 }, 'n'),
    ]
    const r = runAllocation({ members, moderatorIds: [], opinionsAvailable: true })
    expect(r.diagnostics.every(d => !d.moderated)).toBe(true)
    expect(r.diagnostics.every(d => d.veterans_threshold >= 3)).toBe(true)
  })

  it('60 % d’anciens, sans modérateur → le plancher de 3 est tenu', () => {
    const members = [
      ...make(24, { veteran: true,  camp: 0 }, 'v'),
      ...make(16, { veteran: false, camp: 1 }, 'n'),
    ]
    const r = runAllocation({ members, moderatorIds: [], opinionsAvailable: true })
    expect(r.diagnostics.every(d => !d.moderated)).toBe(true)
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
    // 20 personnes, tous actifs/consentants, 2 camps équilibrés, 70 % d'anciens
    // (14/20) — large excédent par rapport aux seuils des deux types de table
    // (y compris le plancher dur des tables sans modérateur, chantier
    // 2026-08-01), pour que la règle 4 soit satisfaite quelle que soit la
    // répartition anciens/nouveaux et que la règle 5 reste le seul critère
    // discriminant. Un ratio pile à la limite (comme 50 %) fait intervenir le
    // plancher des tables sans modérateur et brouille ce que ce test vérifie.
    const members = Array.from({ length: 20 }, (_, i) => ({
      member_id: `x-${i}`,
      pseudo: `x${i}`,
      is_active: true,
      consents: true,
      is_veteran: i < 14,
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
          expect(t.member_ids.length).toBeGreaterThanOrEqual(t.moderated ? TABLE_MIN : UNMODERATED_TABLE_MIN)
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

describe('dépassement toléré jusqu’à 20 actifs', () => {
  const maxActives = (r: ReturnType<typeof runAllocation>) => Math.max(...r.diagnostics.map(d => d.actives))

  it('non utilisé quand il n’apporte rien à la règle 1', () => {
    const r = runAllocation({ members: balanced(40), moderatorIds: ['mo-1'], opinionsAvailable: true })
    expect(r.overflowUsed).toBe(false)
    expect(maxActives(r)).toBeLessThanOrEqual(TABLE_MAX_ACTIVE)
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
      expect(maxActives(r)).toBeGreaterThan(TABLE_MAX_ACTIVE)
      expect(r.warnings.join(' ')).toContain('règle 1')
      // Le dépassement n'est retenu que s'il améliore strictement la règle 1 :
      // au moins une table conforme, sans garantie que toutes le soient.
      expect(r.diagnostics.some(d => d.rule1_ok)).toBe(true)
    } else {
      expect(maxActives(r)).toBeLessThanOrEqual(TABLE_MAX_ACTIVE)
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
    // 19 places → 3 tables et 3 animateurs : le 4e modérateur n'anime rien.
    // Avant le chantier 25 il disparaissait purement du résultat.
    // 2026-08-03 : TABLE_MAX relevé à 12 rend 4 tables coherentes dès 20
    // personnes pour 4 modérateurs (5×4=20) — la population est donc réduite
    // à 19 pour continuer à démontrer un vrai surplus.
    const ids = ['mo-1', 'mo-2', 'mo-3', 'mo-4']
    const r = runAllocation({
      members: balanced(19),
      moderatorIds: ids,
      moderatorProfiles: modProfiles(ids),
      opinionsAvailable: true,
    })
    expect(r.tables).toHaveLength(3)
    expect(r.animatingModerators).toBe(3)
    expect(r.seatedModeratorIds).toEqual(['mo-4'])

    // Il occupe un siège comme n'importe quel participant.
    expect(totalSeats(r)).toBe(20)
    const seatedTable = r.tables.find(t => t.member_ids.includes('mo-4'))
    expect(seatedTable).toBeDefined()
    expect(seatedTable!.moderator_member_ids).not.toContain('mo-4')
  })

  it('le modérateur assis est optimisé, pas casé dans la table la moins pleine', () => {
    // Chantier 25b — il entre dans la population AVANT la recherche, donc il
    // est soumis aux règles 1 à 5. On le rend seul porteur du camp 2 : la
    // règle 3 doit alors le placer là où ce camp est utile, et non
    // mécaniquement dans la plus petite table (comportement du 25a).
    // Chantier 91 : population ramenée de 25 à 19 — à 25, les 4 modérateurs
    // animent désormais tous, il n'y avait plus de surplus à observer.
    const members: AllocationMember[] = [
      ...make(9, { camp: 0 }, 'c0'),
      ...make(9, { camp: 1 }, 'c1'),
      ...make(1, { camp: 2 }, 'c2'),
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
    // La population augmente (les modérateurs en surplus prennent un siège),
    // donc la forme peut légitimement changer — mais elle ne doit pas se
    // fragmenter. Chantier 91 : un modérateur de plus peut désormais animer
    // une table de plus (les passifs n'étant plus bornés par la taille).
    expect(withSurplus.animatingModerators).toBeGreaterThanOrEqual(without.animatingModerators)
    expect(withSurplus.tables.length).toBeLessThanOrEqual(without.tables.length + 1)
    expect(totalSeats(withSurplus)).toBe(totalSeats(without) + withSurplus.seatedModeratorIds.length)
  })

  it('les attributs réels du modérateur assis sont pris en compte', () => {
    const profile = {
      member_id: 'mo-4', pseudo: 'Zoé',
      is_active: true, consents: false, is_veteran: true, group_id: 1,
    }
    const r = runAllocation({
      members: balanced(19), // cf. test précédent : population réduite pour garder un vrai surplus
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
    // 2026-08-03 : TABLE_MAX relevé à 12 rend une 4e table coherente à 25
    // personnes avec la capacité annoncée — population portée à 30 pour que
    // la capacité soit réellement déjà épuisée par les 3 tables existantes.
    const base = { members: balanced(17), moderatorIds: ['mo-1', 'mo-2', 'mo-3'], opinionsAvailable: true }
    const a = runAllocation(base)
    const b = runAllocation({ ...base, extraModerators: 3 })
    // Chantier 91 : population ramenée à 17 — au-delà, les modérateurs annoncés
    // animent désormais des tables supplémentaires (règle 2) ; à 17, trois
    // tables sont le maximum possible (17/5), la capacité est donc déjà épuisée.
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
