import { useState } from 'react'
import type { Session, SessionType } from '../lib/types'
import { participantPhaseStep, participantPhaseSteps } from '../lib/phaseLabels'
import FondQuadrille from './FondQuadrille'

interface Props {
  phase: Session['phase'] | null | undefined
  /** Pill flottante façon QuitLink (coin opposé), pour les écrans sans en-tête propre. */
  floating?: boolean
  /** Chantier 134 — numérotation propre au mode de séance (défaut : séance complète). */
  sessionType?: SessionType
  /** Chantier 158 : `marine`, puce de verre du site, pour un bandeau bleu marine. */
  tone?: 'clair' | 'marine'
}

/**
 * Repère de parcours participant — chantier 39. Affiche "N · Libellé" selon
 * la nomenclature PARTICIPANT_PHASE_STEPS. Ne rend rien en phase `draft`
 * (jamais visible côté participant) ni si la phase est inconnue.
 *
 * Chantier 74 — la pill est un bouton qui ouvre une modale listant toutes les
 * étapes de PARTICIPANT_PHASE_STEPS (celle en cours marquée, les passées
 * distinguées des suivantes).
 * La modale est entièrement autonome dans ce composant (état `open` local) :
 * aucun des 5 écrans qui affichent `PhaseIndicator` n'a besoin d'être modifié.
 * Piège évité (cf. CLAUDE.md, VoteToolsPanel + NotesModal) : l'état d'ouverture
 * ne vit jamais dans un composant que sa propre fermeture pourrait démonter —
 * ici il n'y a qu'un seul composant, donc pas de risque de ce genre.
 */
export default function PhaseIndicator({ phase, floating = false, sessionType = 'full', tone = 'clair' }: Props) {
  const [open, setOpen] = useState(false)
  const step = participantPhaseStep(phase, sessionType)
  if (!step) return null

  const pill = tone === 'marine' ? (
    // Surtitre du site sur marine : la progression des étapes tient lieu de
    // trait d'accent (barres de 3 px, l'étape en cours allongée, comme la
    // pagination du carrousel du site), puis « Étape N · Libellé ». Sans
    // cadre ni marge à gauche : il s'aligne sur le titre qu'il surmonte.
    <button
      type="button"
      onClick={() => setOpen(true)}
      // -my-3 py-3 : zone de toucher de 41 px sans décaler la mise en page
      className="group -my-3 inline-flex items-center gap-3 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-bleu-clair whitespace-nowrap transition-colors hover:text-creme focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-4 focus-visible:ring-offset-bleu-fonce"
    >
      <span aria-hidden="true" className="flex items-center gap-1">
        {participantPhaseSteps(sessionType).map(s => (
          <span
            key={s.phase}
            className={`block h-[3px] transition-[width,background-color] duration-500 ${
              s.number === step.number
                ? 'w-7 bg-gradient-to-r from-bleu-clair to-creme'
                : s.number < step.number
                  ? 'w-2 bg-bleu-clair'
                  : 'w-2 bg-creme/25 group-hover:bg-creme/40'
            }`}
          />
        ))}
      </span>
      Étape {step.number} · {step.label}
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex items-center gap-2 border border-bleu-fonce/15 bg-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-bleu-fonce whitespace-nowrap hover:border-bleu-fonce/30 hover:bg-indigo-50/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-bleu-clair shadow-[0_0_6px_1px_rgba(155,187,226,0.9)]" />
      Étape {step.number} · {step.label}
    </button>
  )

  return (
    <>
      {floating ? (
        <div className="fixed top-3 right-3 z-[100] bg-white/90 backdrop-blur shadow-sm">
          {pill}
        </div>
      ) : pill}

      {open && (
        <div
          className="fixed inset-0 bg-bleu-fonce/60 flex items-end sm:items-center justify-center z-[110] p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white w-full max-w-sm shadow-2xl flex flex-col overflow-hidden rounded-[12px] ring-1 ring-white/10 animate-entree"
            onClick={e => e.stopPropagation()}
          >
            <div className="relative overflow-hidden bg-bleu-fonce px-6 py-5 text-center">
              <FondQuadrille cases={3} />
              <div className="relative">
                <p className="text-2xl mb-1">🧭</p>
                <h2 className="font-sans text-xl font-bold tracking-[-0.01em] text-creme">Où en est la séance ?</h2>
                <span aria-hidden="true" className="filet-spectre mx-auto mt-3 block w-12" />
              </div>
            </div>
            <div className="px-6 py-5 space-y-1.5">
              {participantPhaseSteps(sessionType).map(s => {
                const isCurrent = s.number === step.number
                const isPast    = s.number < step.number
                return (
                  <div
                    key={s.phase}
                    className={`flex items-center gap-3 rounded-[8px] px-3 py-2.5 border ${
                      isCurrent ? 'bg-indigo-50 border-indigo-200' : 'border-transparent'
                    }`}
                  >
                    <span
                      className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold tabular-nums ${
                        isCurrent
                          ? 'bg-bleu-fonce text-creme ring-4 ring-bleu-clair/40'
                          : isPast
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {isPast ? '✓' : s.number}
                    </span>
                    <span
                      className={`text-sm ${
                        isCurrent
                          ? 'font-semibold text-bleu-fonce'
                          : isPast
                            ? 'text-gray-600'
                            : 'text-gray-500'
                      }`}
                    >
                      {s.label}
                    </span>
                    {isCurrent && (
                      <span className="ml-auto text-[10px] font-bold text-bleu-fonce/70 uppercase tracking-[0.14em]">
                        En cours
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="px-6 pb-6">
              <button
                onClick={() => setOpen(false)}
                className="w-full rounded-[8px] py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
