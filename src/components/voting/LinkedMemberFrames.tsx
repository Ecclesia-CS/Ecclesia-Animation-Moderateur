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
 */
const LINK_COLORS = ['#0d9488', '#db2777', '#ea580c', '#2563eb', '#65a30d', '#9333ea']

export interface LinkSegment<T> {
  /** Couleur du cadre ; `null` = personne seule (ou seule de sa grappe à cette table). */
  color: string | null
  items: T[]
}

function hashIndex(ids: string[]): number {
  const key = [...ids].sort().join('|')
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return h % LINK_COLORS.length
}

/**
 * Regroupe `items` par grappe d'appairage. Ordre conservé (un cadre prend la place
 * de son premier membre). La couleur découle de l'identité de la grappe, donc reste
 * la même d'une table à l'autre si une grappe est séparée ; sur une même table, deux
 * grappes ne partagent jamais la même couleur tant que la palette suffit.
 */
export function segmentByCluster<T>(
  items: T[],
  idOf: (item: T) => string | null | undefined,
  clusterOf: Map<string, string[]>,
): LinkSegment<T>[] {
  const byCluster = new Map<string[], T[]>()
  for (const item of items) {
    const id = idOf(item)
    const cluster = id ? clusterOf.get(id) : undefined
    if (cluster) byCluster.set(cluster, [...(byCluster.get(cluster) ?? []), item])
  }
  const used = new Set<number>()
  const colorOf = new Map<string[], string>()
  for (const [cluster, members] of byCluster) {
    if (members.length < 2) continue
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
      segments.push({ color: null, items: [item] })
    } else if (!placed.has(cluster)) {
      placed.add(cluster)
      segments.push({ color, items: byCluster.get(cluster)! })
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
}: {
  items: T[]
  idOf: (item: T) => string | null | undefined
  clusterOf: Map<string, string[]>
  renderItem: (item: T) => React.ReactNode
  /** Pour le titre du cadre (« 🔗 Liés entre eux : A, B »). */
  pseudoOf: (item: T) => string
}) {
  return (
    <>
      {segmentByCluster(items, idOf, clusterOf).map((seg, i) =>
        seg.color ? (
          <div
            key={`frame-${i}`}
            data-testid="linked-frame"
            title={`🔗 Liés entre eux : ${seg.items.map(pseudoOf).join(', ')}`}
            className="inline-flex flex-wrap items-center gap-1 rounded-lg border-2 p-1"
            style={{ borderColor: seg.color, background: `${seg.color}14` }}
          >
            {seg.items.map(renderItem)}
          </div>
        ) : (
          <React.Fragment key={`single-${i}`}>{seg.items.map(renderItem)}</React.Fragment>
        ),
      )}
    </>
  )
}
