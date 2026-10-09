import React from 'react'

/**
 * Chantier 149 — rendre visible « qui est lié à qui ».
 *
 * Les grappes d'appairage (chantier 92, liens réciproques, 3 personnes max)
 * n'étaient signalées que par un petit 🔗 sur chaque nom : impossible de voir d'un
 * coup d'œil quels noms vont ensemble. Les membres d'une même grappe présents à une
 * table sont donc regroupés dans un cadre commun, d'une couleur propre à la grappe.
 *
 * Palette volontairement distincte de celle des camps d'opinion
 * (`campColor`, `TableDiagnosticsList.tsx`) : le fond d'un nom est déjà teinté par
 * son camp, le cadre doit se lire sans se confondre avec lui.
 *
 * Chantier 165 — le modérateur d'une table n'est pas dans la liste de ses
 * participants (il s'affiche en tête de carte). Quand il est lié à l'un d'eux,
 * rien ne le montrait. `outside` désigne ces personnes présentes à la table mais
 * hors liste : elles comptent pour décider qu'un cadre existe (un participant
 * seul avec son modérateur est bien « lié »), et leur couleur est celle que
 * `clusterColorFor` donne au badge du modérateur.
 */
const LINK_COLORS = ['#0d9488', '#db2777', '#ea580c', '#2563eb', '#65a30d', '#9333ea']

export interface LinkSegment<T> {
  /** Couleur du cadre ; `null` = personne seule (ou seule de sa grappe à cette table). */
  color: string | null
  items: T[]
  /** Chantier 165 — pseudos des membres de la grappe présents à la table hors de la liste (modérateur). */
  outsideNames: string[]
}

function hashIndex(ids: string[]): number {
  const key = [...ids].sort().join('|')
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return h % LINK_COLORS.length
}

/** Chantier 165 — couleur propre à une grappe (badge du modérateur, cadre des participants). */
export function clusterColorFor(cluster: string[]): string {
  return LINK_COLORS[hashIndex(cluster)]
}

/**
 * Regroupe `items` par grappe d'appairage. Ordre conservé (un cadre prend la place
 * de son premier membre). La couleur découle de l'identité de la grappe, donc reste
 * la même d'une table à l'autre si une grappe est séparée ; sur une même table, deux
 * grappes ne partagent jamais la même couleur tant que la palette suffit.
 *
 * `outside` (chantier 165) : id → pseudo des personnes présentes à la table mais hors
 * de `items`. Les grappes qui en contiennent gardent leur couleur « naturelle », les
 * autres s'écartent en cas de collision.
 */
export function segmentByCluster<T>(
  items: T[],
  idOf: (item: T) => string | null | undefined,
  clusterOf: Map<string, string[]>,
  outside: Map<string, string> = new Map(),
): LinkSegment<T>[] {
  const byCluster = new Map<string[], T[]>()
  for (const item of items) {
    const id = idOf(item)
    const cluster = id ? clusterOf.get(id) : undefined
    if (cluster) byCluster.set(cluster, [...(byCluster.get(cluster) ?? []), item])
  }
  const outsideOf = (cluster: string[]): string[] =>
    cluster.filter(id => outside.has(id)).map(id => outside.get(id)!)

  // Grappes de la table : celles du modérateur d'abord (leur couleur doit rester celle du badge).
  const outsideClusters: string[][] = []
  for (const id of outside.keys()) {
    const c = clusterOf.get(id)
    if (c && !outsideClusters.includes(c)) outsideClusters.push(c)
  }
  const ordered = [
    ...outsideClusters,
    ...[...byCluster.keys()].filter(c => !outsideClusters.includes(c)),
  ]

  const used = new Set<number>()
  const colorOf = new Map<string[], string>()
  for (const cluster of ordered) {
    const present = (byCluster.get(cluster)?.length ?? 0) + outsideOf(cluster).length
    if (present < 2) continue
    let idx = hashIndex(cluster)
    for (let tries = 0; tries < LINK_COLORS.length && used.has(idx); tries++) {
      idx = (idx + 1) % LINK_COLORS.length
    }
    used.add(idx)
    colorOf.set(cluster, LINK_COLORS[idx])
  }

  const segments: LinkSegment<T>[] = []
  const placed = new Set<string[]>()
  for (const item of items) {
    const id = idOf(item)
    const cluster = id ? clusterOf.get(id) : undefined
    const color = cluster ? colorOf.get(cluster) : undefined
    if (!cluster || !color) {
      segments.push({ color: null, items: [item], outsideNames: [] })
    } else if (!placed.has(cluster)) {
      placed.add(cluster)
      segments.push({ color, items: byCluster.get(cluster)!, outsideNames: outsideOf(cluster) })
    }
  }
  return segments
}

export function LinkedMemberFrames<T>({
  items,
  idOf,
  clusterOf,
  renderItem,
  pseudoOf,
  outside,
}: {
  items: T[]
  idOf: (item: T) => string | null | undefined
  clusterOf: Map<string, string[]>
  renderItem: (item: T) => React.ReactNode
  /** Pour le titre du cadre (« 🔗 Liés entre eux : A, B »). */
  pseudoOf: (item: T) => string
  /** Chantier 165 — id → pseudo des liés présents à la table hors de `items` (le modérateur). */
  outside?: Map<string, string>
}) {
  return (
    <>
      {segmentByCluster(items, idOf, clusterOf, outside).map((seg, i) =>
        seg.color ? (
          <div
            key={`frame-${i}`}
            data-testid="linked-frame"
            title={`🔗 Liés entre eux : ${[...seg.items.map(pseudoOf), ...seg.outsideNames.map(n => `${n} (modérateur)`)].join(', ')}`}
            className="inline-flex flex-wrap items-center gap-1 rounded-lg border-2 p-1"
            style={{ borderColor: seg.color, background: `${seg.color}14` }}
          >
            {seg.items.map(renderItem)}
            {/* Chantier 165 — le lien avec le modérateur, dit dans le cadre même. */}
            {seg.outsideNames.length > 0 && (
              <span className="text-[10px] font-medium shrink-0" style={{ color: seg.color }}>
                🎙️ avec {seg.outsideNames.join(', ')}
              </span>
            )}
          </div>
        ) : (
          <React.Fragment key={`single-${i}`}>{seg.items.map(renderItem)}</React.Fragment>
        ),
      )}
    </>
  )
}

/**
 * Chantier 165 — le lien d'un modérateur avec ses binômes, à côté de son nom.
 * Même couleur que le cadre qui entoure ses binômes dans la liste de la table
 * (voir `segmentByCluster` / `outside`), pour que les deux se reconnaissent.
 */
export function ModeratorLinkBadge({
  memberId,
  clusterOf,
  pseudoOf,
}: {
  memberId: string | null
  clusterOf: Map<string, string[]>
  pseudoOf: (id: string) => string
}) {
  const cluster = memberId ? clusterOf.get(memberId) : undefined
  if (!memberId || !cluster) return null
  const others = cluster.filter(id => id !== memberId).map(pseudoOf)
  const color = clusterColorFor(cluster)
  return (
    <span
      data-testid="moderator-link-badge"
      title={`Lié à ${others.join(', ')} : ils se déplacent ensemble (le modérateur anime la table où va son binôme).`}
      className="inline-flex items-center gap-1 rounded-md border-2 px-1.5 py-0 text-[10px] font-semibold"
      style={{ borderColor: color, background: `${color}14`, color }}
    >
      🔗 lié à {others.join(', ')}
    </span>
  )
}
