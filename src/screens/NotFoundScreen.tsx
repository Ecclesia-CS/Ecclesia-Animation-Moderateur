interface Props {
  title?: string
  subtitle?: string
}

/** Page 404 générique — lien cassé, table/séance expirée, ou route inconnue.
 *  Chantier 88. Reprend le style déjà utilisé par les états "introuvable"
 *  de SessionRouterScreen/VoteScreen plutôt que d'introduire un style concurrent. */
export default function NotFoundScreen({
  title = 'Page introuvable',
  subtitle = "Ce lien n'est plus valide, ou la page que tu cherches n'existe pas.",
}: Props) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white border border-bleu-fonce/10 shadow-sm p-8 text-center">
        <div className="text-5xl mb-4">🧭</div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-bleu-fonce">{title}</h1>
        <p className="text-sm text-gray-500 mt-3">{subtitle}</p>
        <button
          onClick={() => { window.location.hash = '' }}
          className="mt-6 inline-block pb-0.5 text-sm font-semibold text-bleu-fonce border-b border-bleu-fonce/40 hover:border-bleu-clair transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
        >
          Retour à l'accueil
        </button>
      </div>
    </div>
  )
}
