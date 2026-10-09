/**
 * Chantier 165 — déplacer une personne liée déplace sa grappe, modérateur compris.
 *
 * Une grappe d'appairage (liens réciproques, 3 personnes au plus) ne se sépare
 * pas à la main : quand le superadmin déplace l'un de ses membres, les autres
 * suivent (chantier 92). Jusqu'ici le modérateur faisait exception — il n'est
 * pas dans la liste de puces d'une table, il est désigné par
 * `assign_moderator_to_table` — si bien que déplacer son binôme le laissait seul,
 * et que le désigner ailleurs laissait son binôme derrière.
 *
 * Règle (arbitrage de Jules, 2026-10-09) :
 *  - un modérateur lié qui suit sa grappe **devient l'animateur de la table
 *    d'arrivée** ; l'animateur déjà en place est remplacé (il reste assis là, en
 *    surplus), après confirmation du superadmin ;
 *  - inversement, désigner un modérateur animateur d'une table y amène ses
 *    binômes.
 *
 * Module pur (aucun appel réseau) : le plan est calculé ici, exécuté par
 * l'écran superadmin, et testé sans navigateur.
 */

export interface MovableMember {
  member_id: string | null
  pseudo: string
  is_moderator: boolean
  /** Anime réellement sa table (≠ modérateur en surplus assis là). */
  active: boolean
}

export interface MovableGroup {
  table_number: number
  members: MovableMember[]
}

export interface LinkedMovePlan {
  targetTable: number
  /** Modérateur lié qui animera la table d'arrivée (`assign_moderator_to_table`), ou null. */
  animatorId: string | null
  /** Autres membres de la grappe à déplacer comme simples participants (`move_member_to_group`). */
  moveIds: string[]
  /** Animateurs actuels de la table d'arrivée, remplacés par `animatorId`. */
  replacedIds: string[]
  /** Table que l'animateur quitte (qui perd donc son animateur), si elle diffère de la cible. */
  animatorFromTable: number | null
}

/**
 * @param memberId  la personne déplacée (déposée sur la table) ou désignée animatrice
 * @param mode      'drop' : déposée sur une table — un modérateur lié suit et anime ;
 *                  'assign' : `memberId` est désigné animateur de la table cible
 */
export function planLinkedMove(
  groups: MovableGroup[],
  clusterOf: Map<string, string[]>,
  memberId: string,
  targetTable: number,
  mode: 'drop' | 'assign',
): LinkedMovePlan {
  const location = new Map<string, { table: number; member: MovableMember }>()
  for (const g of groups) {
    for (const m of g.members) {
      if (m.member_id) location.set(m.member_id, { table: g.table_number, member: m })
    }
  }

  // La grappe, restreinte aux personnes réellement assises quelque part.
  const cluster = (clusterOf.get(memberId) ?? [memberId]).filter(id => location.has(id))

  let animatorId: string | null = null
  if (mode === 'assign') {
    animatorId = memberId
  } else {
    // Le déplacé d'abord (s'il anime), sinon le premier animateur de la grappe, par ordre stable.
    const animators = cluster
      .filter(id => {
        const loc = location.get(id)!
        return loc.member.is_moderator && loc.member.active
      })
      .sort((a, b) => (a === memberId ? -1 : b === memberId ? 1 : a < b ? -1 : 1))
    animatorId = animators[0] ?? null
  }

  // Déjà animateur de la table d'arrivée : rien à (re)désigner.
  const animatorLoc = animatorId ? location.get(animatorId) : undefined
  if (animatorId && animatorLoc && animatorLoc.table === targetTable
      && animatorLoc.member.is_moderator && animatorLoc.member.active) {
    animatorId = null
  }

  const moveIds = cluster.filter(id => id !== animatorId && location.get(id)!.table !== targetTable)

  const target = groups.find(g => g.table_number === targetTable)
  const replacedIds = animatorId
    ? (target?.members ?? [])
        .filter(m => m.member_id && m.is_moderator && m.active && m.member_id !== animatorId)
        .map(m => m.member_id!)
    : []

  return {
    targetTable,
    animatorId,
    moveIds,
    replacedIds,
    animatorFromTable: animatorId && animatorLoc && animatorLoc.table !== targetTable ? animatorLoc.table : null,
  }
}

/** Le plan ne change rien (déplacé déjà à destination, personne à suivre). */
export function isEmptyPlan(plan: LinkedMovePlan): boolean {
  return plan.animatorId === null && plan.moveIds.length === 0
}
