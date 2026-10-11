import type { ReactNode } from 'react'
import FondQuadrille from './FondQuadrille'

interface Props {
  titre: ReactNode
  sousTitre?: ReactNode
  /** Sans `onClose`, pas de croix (fenêtre qu'on ferme par son propre bouton). */
  onClose?: () => void
}

/**
 * Bandeau marine quadrillé des petites fenêtres (chantier 168) : titre en
 * Archivo gras, croix de fermeture à droite. La fenêtre qui l'accueille porte
 * `overflow-hidden rounded-[12px]` (ou `rounded-t-[12px] sm:rounded-[12px]`
 * pour une feuille qui monte du bas sur téléphone).
 */
export default function EnTeteFenetre({ titre, sousTitre, onClose }: Props) {
  return (
    <div className="relative flex shrink-0 items-start justify-between gap-4 overflow-hidden bg-bleu-fonce px-5 py-4">
      <FondQuadrille cases={2} />
      <div className="relative min-w-0">
        <h2 className="font-sans text-lg font-bold leading-snug tracking-[-0.01em] text-creme">{titre}</h2>
        {sousTitre && <p className="mt-0.5 text-sm text-creme/75">{sousTitre}</p>}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="relative -m-1.5 shrink-0 p-2 text-creme/70 transition-colors hover:text-creme
            focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
          aria-label="Fermer"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}
