import FondQuadrille from '../components/FondQuadrille'
import { BOUTON_VERRE_PARCOURS } from '../components/PageParcours'

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
    <div className="relative min-h-screen overflow-hidden bg-bleu-fonce text-creme flex flex-col items-center justify-center px-6 text-center">
      <FondQuadrille cases={10} />
      <div className="relative flex max-w-sm flex-col items-center gap-4 animate-montee">
        <div className="text-5xl" aria-hidden="true">🧭</div>
        <h1 className="font-sans text-3xl font-bold tracking-[-0.02em]">{title}</h1>
        <p className="text-sm text-creme/75">{subtitle}</p>
        <button onClick={() => { window.location.hash = '' }} className={`mt-2 ${BOUTON_VERRE_PARCOURS}`}>
          Retour à l'accueil
        </button>
      </div>
    </div>
  )
}
