import FondQuadrille from './FondQuadrille'

/**
 * Écran d'attente plein écran (chantier 158) : aplat marine quadrillé du
 * site, trois carrés qui s'allument tour à tour (le motif des cases de la
 * trame) et un libellé. Pas d'emblème : l'écran s'affiche avant de savoir si
 * la séance appartient à une association (chantier 135).
 */
export default function EcranChargement({ texte }: { texte: string }) {
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
    </div>
  )
}
