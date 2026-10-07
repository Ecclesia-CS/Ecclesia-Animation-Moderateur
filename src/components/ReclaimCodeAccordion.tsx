import { forwardRef } from 'react'

interface Props {
  open: boolean
  onToggle(): void
  code: string
  onCodeChange(code: string): void
}

/**
 * Chantier 140 — la ligne « J'ai déjà un code de rappel » (patron « mot de
 * passe oublié »), présente sur toutes les portes d'entrée. Repliée par
 * défaut ; la porte l'ouvre elle-même (et donne le focus via la ref) quand le
 * nom tapé est déjà pris. Même rendu que celle de `DebateEntryForm`
 * (chantier 134).
 */
const ReclaimCodeAccordion = forwardRef<HTMLInputElement, Props>(function ReclaimCodeAccordion(
  { open, onToggle, code, onCodeChange },
  ref,
) {
  return (
    <div className="rounded-[8px] border border-bleu-fonce/10">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="rounded-[8px] w-full px-3 py-2.5 text-left text-xs font-semibold text-gray-600 hover:text-bleu-fonce flex items-center justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
      >
        J'ai déjà un code de rappel
        <span aria-hidden="true" className={`text-base leading-none text-bleu-fonce/60 transition-transform ${open ? 'rotate-45' : ''}`}>+</span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          <input
            ref={ref}
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={code}
            onChange={e => onCodeChange(e.target.value.replace(/\D/g, ''))}
            placeholder="Code à 4 chiffres"
            className="rounded-[8px] w-full px-3 py-3 text-sm border border-bleu-fonce/20 font-bold tabular-nums text-center tracking-[0.3em]
              focus:outline-none focus:ring-2 focus:ring-bleu-clair/40 focus:border-bleu-fonce
              placeholder:text-anthracite/40 placeholder:tracking-normal placeholder:font-sans transition-shadow"
          />
          <p className="text-xs text-gray-600 mt-1.5">
            Le code à 4 chiffres reçu à ta première inscription à cette séance, avec le même nom.
          </p>
        </div>
      )}
    </div>
  )
})

export default ReclaimCodeAccordion
