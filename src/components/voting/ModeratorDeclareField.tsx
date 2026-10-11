import PasswordInput from '../PasswordInput'

interface Props {
  checked: boolean
  onCheckedChange(v: boolean): void
  password: string
  onPasswordChange(v: string): void
  className?: string
}

/**
 * Chantier 73 — case à cocher "Je suis modérateur" sur les formulaires
 * d'inscription à une séance (pré-vote, vote, allocation). Déplie le champ
 * mot de passe (Code Ecclesia) une fois cochée. La tentative de déclaration
 * elle-même (via `tryClaimModeratorStatus`) est menée par l'écran appelant
 * APRÈS l'inscription — un mot de passe erroné ne doit jamais bloquer
 * l'inscription, seulement la déclaration modérateur.
 */
export default function ModeratorDeclareField({
  checked, onCheckedChange, password, onPasswordChange, className = '',
}: Props) {
  return (
    <div className={className}>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onCheckedChange(e.target.checked)}
          className="w-4 h-4 text-indigo-600 border-bleu-fonce/20 focus:border-bleu-fonce focus:ring-bleu-clair/40"
        />
        <span className="text-sm font-medium text-gray-700">Je suis modérateur de cette séance</span>
      </label>
      {checked && (
        <div className="mt-2">
          <label className="block text-xs font-semibold text-anthracite/80 mb-1.5">Code Ecclesia</label>
          <PasswordInput
            value={password}
            onChange={onPasswordChange}
            placeholder="••••••••"
            className="rounded-[8px] w-full px-4 py-3 pr-10 bg-white border border-bleu-fonce/20 text-sm text-anthracite placeholder:text-anthracite/40 focus:outline-none focus:border-bleu-fonce focus:ring-2 focus:ring-bleu-clair/40"
          />
        </div>
      )}
    </div>
  )
}
