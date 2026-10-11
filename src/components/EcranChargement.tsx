import { useEffect, useState } from 'react'
import FondQuadrille from './FondQuadrille'

/** Au-delà de ce délai, l'écran dit que c'est long et propose de recharger. */
const DELAI_INDICE_MS = 8000

/**
 * Écran d'attente plein écran (chantier 168) : aplat marine quadrillé du
 * site, trois carrés qui s'allument tour à tour (le motif des cases de la
 * trame) et un libellé. Pas d'emblème : l'écran s'affiche avant de savoir si
 * la séance appartient à une association (chantier 135).
 */
export default function EcranChargement({ texte }: { texte: string }) {
  // Retour de Jules : sur un réseau lent, l'écran restait chargé sans rien dire.
  const [long, setLong] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setLong(true), DELAI_INDICE_MS)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-5 overflow-hidden bg-bleu-fonce text-creme">
      <FondQuadrille cases={10} />
      <span aria-hidden="true" className="relative flex gap-1.5">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="block h-2.5 w-2.5 bg-bleu-clair animate-speaking"
            style={{ animationDelay: `${i * 0.25}s` }}
          />
        ))}
      </span>
      <p role="status" className="relative text-sm font-semibold tracking-[0.02em] text-creme/80">{texte}</p>
      {long && (
        <div className="relative flex max-w-xs flex-col items-center gap-3 px-6 text-center animate-montee">
          <p className="text-sm leading-relaxed text-creme/75">
            La connexion est plus lente que d'habitude. Si rien ne s'affiche dans quelques secondes, recharge la page.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn-verre rounded-[8px] inline-flex h-10 items-center px-4 text-xs font-semibold text-creme
              focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2 focus-visible:ring-offset-bleu-fonce"
          >
            Recharger la page
          </button>
        </div>
      )}
    </div>
  )
}
