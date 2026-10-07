import type { ReactNode } from 'react'
import type { Session } from '../lib/types'
import { sessionTypeOf } from '../lib/phaseLabels'
import { titreSeance } from '../lib/utils'
import FondQuadrille from './FondQuadrille'
import PhaseIndicator from './PhaseIndicator'
import ecclesiaLogo from '../assets/ecclesia-logo.webp'

export const BOUTON_VERRE_PARCOURS = `btn-verre rounded-[8px] inline-flex h-10 shrink-0 items-center px-3 text-xs font-semibold text-creme whitespace-nowrap sm:px-4
  focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2 focus-visible:ring-offset-bleu-fonce`

interface Props {
  /** Séance du parcours : son étape, son titre, et l'emblème (masqué pour une association). */
  session: Pick<Session, 'title' | 'phase' | 'organization_id'> & Partial<Pick<Session, 'session_type'>>
  /** Ligne sous le titre (pseudo de la personne, par exemple). */
  sousTitre?: ReactNode
  /** Boutons de verre ajoutés avant « Menu » (Outils, Proposer…). */
  actions?: ReactNode
  /** Contenu ajouté au bas de l'en-tête (progression du vote, par exemple). */
  basEnTete?: ReactNode
  /** Sans « Menu » (l'écran a son propre bouton pour quitter). */
  sansMenu?: boolean
  /** Sans l'étape en surtitre (page publique, hors parcours). */
  sansEtape?: boolean
  /** Largeur du contenu : `etroit` pour un formulaire, `large` pour le vote. */
  largeur?: 'etroit' | 'large'
  children: ReactNode
}

/**
 * Page du parcours participant hors table (chantier 158) : vote, inscription,
 * questionnaire d'entrée, attente, allocation, résultats. Même en-tête que la
 * vue participant d'une table : bandeau marine quadrillé, étape en surtitre,
 * titre de la séance en Archivo, vague au bas ; le contenu vient dessous sur
 * fond crème. Ni z-index ni isolation sur l'en-tête (voir FondQuadrille) :
 * l'indicateur d'étape et les boutons y ouvrent des fenêtres `fixed`.
 */
export default function PageParcours({ session, sousTitre, actions, basEnTete, sansMenu = false, sansEtape = false, largeur = 'etroit', children }: Props) {
  const conteneur = largeur === 'large' ? 'max-w-2xl' : 'max-w-md'
  return (
    <div className="min-h-screen bg-creme flex flex-col">
      <header className="relative overflow-hidden bg-bleu-fonce text-creme">
        <FondQuadrille
          cases={6}
          bande={32}
          fondu="linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.45) 55%, #000 88%)"
        />
        <svg
          data-fond-libre
          aria-hidden="true"
          viewBox="0 0 800 40"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-3 w-full sm:h-4"
        >
          <path d="M0 0 Q400 80 800 0 V40 H0 Z" className="fill-creme" />
        </svg>

        <div className={`relative mx-auto w-full ${conteneur} px-4 pb-8 pt-3 sm:pt-4 md:pb-10`}>
          <div className="flex items-center gap-2">
            {!session.organization_id && (
              <img
                src={ecclesiaLogo}
                alt=""
                aria-hidden="true"
                className="-ml-1 hidden h-10 w-10 drop-shadow-[0_8px_22px_rgba(155,187,226,0.35)] min-[360px]:block"
              />
            )}
            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              {actions}
              {!sansMenu && (
                <button onClick={() => { window.location.hash = '' }} className={BOUTON_VERRE_PARCOURS}>
                  Menu
                </button>
              )}
            </div>
          </div>

          <div className="mt-5 animate-montee">
            {!sansEtape && <PhaseIndicator phase={session.phase} sessionType={sessionTypeOf(session)} tone="marine" />}
            <h1 className={`${sansEtape ? '' : 'mt-3 '}break-words font-sans text-[1.625rem] font-bold leading-[1.15] tracking-[-0.02em] text-creme sm:text-3xl`}>
              {titreSeance(session.title)}
            </h1>
            {sousTitre && <p className="mt-1.5 text-sm text-creme/75">{sousTitre}</p>}
          </div>
          {basEnTete && <div className="mt-4">{basEnTete}</div>}
        </div>
      </header>

      <main className="flex-1 bg-gradient-to-b from-creme to-sable">
        <div className={`mx-auto w-full ${conteneur} px-4 pb-12 pt-5`}>
          {children}
        </div>
      </main>
    </div>
  )
}

/** Carte d'un état d'attente ou d'information du parcours (vote fermé, attente…). */
export function CarteMessage({ icone, titre, note, children }: {
  icone: string
  titre: string
  /** Petite ligne sous le texte. */
  note?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[12px] border border-bleu-fonce/10 bg-white px-6 py-8 text-center shadow-sm animate-montee">
      <div className="text-5xl" aria-hidden="true">{icone}</div>
      <h2 className="font-sans text-2xl font-bold tracking-[-0.01em] text-bleu-fonce">{titre}</h2>
      <p className="text-sm leading-relaxed text-gray-600">{children}</p>
      {note && <p className="text-xs text-gray-600">{note}</p>}
    </div>
  )
}

/** Carte de contenu du parcours (résultats, revote…). */
export const CARTE_PARCOURS = 'rounded-[12px] border border-bleu-fonce/10 bg-white px-5 py-5 shadow-sm animate-montee'

/** Surtitre d'une carte du parcours. */
export const SURTITRE_PARCOURS = 'font-sans text-[11px] font-bold uppercase tracking-[0.16em] text-bleu-fonce/70'

/** Chargement dans le contenu d'une page du parcours : les trois cases du site. */
export function ChargementParcours({ texte = 'Chargement…' }: { texte?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12" role="status">
      <span aria-hidden="true" className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <span key={i} className="block h-2.5 w-2.5 bg-bleu-fonce animate-speaking" style={{ animationDelay: `${i * 0.25}s` }} />
        ))}
      </span>
      <p className="text-sm font-semibold text-anthracite">{texte}</p>
    </div>
  )
}

/** Message d'erreur dans le contenu d'une page du parcours. */
export function ErreurParcours({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {children}
    </div>
  )
}
