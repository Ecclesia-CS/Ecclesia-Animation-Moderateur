import type { Session } from '../lib/types'
import { participantPhaseStep } from '../lib/phaseLabels'

interface Props {
  phase: Session['phase'] | null | undefined
  /** Pill flottante façon QuitLink (coin opposé), pour les écrans sans en-tête propre. */
  floating?: boolean
}

/** Repère de parcours participant — chantier 39. Affiche "N · Libellé" selon
 *  la nomenclature PARTICIPANT_PHASE_STEPS. Ne rend rien en phase `draft`
 *  (jamais visible côté participant) ni si la phase est inconnue. */
export default function PhaseIndicator({ phase, floating = false }: Props) {
  const step = participantPhaseStep(phase)
  if (!step) return null

  const pill = (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-2.5 py-1 whitespace-nowrap">
      Étape {step.number} · {step.label}
    </span>
  )

  if (!floating) return pill

  return (
    <div className="fixed top-3 right-3 z-[100] bg-white/90 backdrop-blur rounded-full shadow-sm">
      {pill}
    </div>
  )
}
