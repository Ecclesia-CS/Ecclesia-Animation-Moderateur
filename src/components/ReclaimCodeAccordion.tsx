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
    <div className="border border-gray-100 rounded-xl">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full px-3 py-2 text-left text-xs text-gray-500 hover:text-gray-700 flex items-center justify-between"
      >
        J'ai déjà un code de rappel
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
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
            className="w-full px-3 py-3 text-sm border border-gray-300 rounded-xl font-mono text-center tracking-[0.3em]
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
              placeholder:text-gray-300 placeholder:tracking-normal placeholder:font-sans transition-shadow"
          />
          <p className="text-xs text-gray-400 mt-1.5">
            Le code à 4 chiffres reçu à ta première inscription à cette séance, avec le même nom.
          </p>
        </div>
      )}
    </div>
  )
})

export default ReclaimCodeAccordion
