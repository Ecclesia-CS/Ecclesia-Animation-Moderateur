import { useState } from 'react'
import type { Session } from '../lib/types'
import { PARTICIPANT_PHASE_STEPS, participantPhaseStep } from '../lib/phaseLabels'

interface Props {
  phase: Session['phase'] | null | undefined
  /** Pill flottante façon QuitLink (coin opposé), pour les écrans sans en-tête propre. */
  floating?: boolean
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
export default function PhaseIndicator({ phase, floating = false }: Props) {
  const [open, setOpen] = useState(false)
  const step = participantPhaseStep(phase)
  if (!step) return null

  const pill = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-2.5 py-1 whitespace-nowrap hover:bg-indigo-100 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-300"
    >
      Étape {step.number} · {step.label}
    </button>
  )

  return (
    <>
      {floating ? (
        <div className="fixed top-3 right-3 z-[100] bg-white/90 backdrop-blur rounded-full shadow-sm">
          {pill}
        </div>
      ) : pill}

      {open && (
        <div
          className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-[110] p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm shadow-2xl flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-indigo-600 px-6 py-5 text-center">
              <p className="text-2xl mb-1">🧭</p>
              <h2 className="text-lg font-bold text-white">Où en est la séance ?</h2>
            </div>
            <div className="px-6 py-5 space-y-2">
              {PARTICIPANT_PHASE_STEPS.map(s => {
                const isCurrent = s.number === step.number
                const isPast    = s.number < step.number
                return (
                  <div
                    key={s.phase}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                      isCurrent ? 'bg-indigo-50 border border-indigo-200' : ''
                    }`}
                  >
                    <span
                      className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        isCurrent
                          ? 'bg-indigo-600 text-white'
                          : isPast
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {isPast ? '✓' : s.number}
                    </span>
                    <span
                      className={`text-sm ${
                        isCurrent
                          ? 'font-semibold text-indigo-900'
                          : isPast
                            ? 'text-gray-500'
                            : 'text-gray-400'
                      }`}
                    >
                      {s.label}
                    </span>
                    {isCurrent && (
                      <span className="ml-auto text-[10px] font-semibold text-indigo-600 uppercase tracking-wide">
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
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors"
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
