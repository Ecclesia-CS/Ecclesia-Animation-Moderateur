import type { PairingResult } from './voting'

// Chantier 165 — règles de binôme sans réseau (testables).

/**
 * Chantier 165 — « déclarer en retour » : ajoute `pseudo` à mes choix actuels
 * (2 au plus). Si mes deux places sont prises, le plus ancien choix **non
 * réciproque** est remplacé ; sinon `null` (rien à remplacer sans casser un lien).
 */
export function pairingChoicesWith(current: Pick<PairingResult, 'pseudo' | 'reciprocal'>[], pseudo: string): string[] | null {
  const kept = current.filter(p => p.pseudo.trim().toLowerCase() !== pseudo.trim().toLowerCase())
  if (kept.length < 2) return [...kept.map(p => p.pseudo), pseudo]
  const replaceIdx = kept.findIndex(p => !p.reciprocal)
  if (replaceIdx === -1) return null
  const next = kept.filter((_, i) => i !== replaceIdx).map(p => p.pseudo)
  return [...next, pseudo]
}
