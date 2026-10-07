import { useState } from 'react'
import { renameSessionMember, regenerateReclaimCodeSelf, PSEUDO_PUBLIC_NOTICE, PSEUDO_POLL_NOTICE } from '../../lib/voting'
import FondQuadrille from '../FondQuadrille'

interface RenamePseudoModalProps {
  sessionId: string
  currentPseudo: string
  onClose: () => void
  onRenamed?: (newPseudo: string) => void
  /** Chantier 134 — adapte la mention d'usage du nom (sondage : pas de débat). */
  isPoll?: boolean
}

/**
 * Chantier 93 — changement de nom, à tout moment. Le serveur refuse un nom déjà
 * pris dans la séance, et refuse aussi pendant une prise de parole ou une place
 * en file d'attente (le nom changerait sous les yeux du modérateur en plein
 * tour). Le renommage est propagé côté base aux deux copies du pseudo
 * (`participants`, `session_sources`) — rien à faire ici.
 *
 * Chantier 116 — cette même modale permet aussi de faire réapparaître son
 * code de rappel. Le code étant haché depuis le chantier 93, il ne peut pas
 * être relu : le bouton en émet un nouveau (`regenerateReclaimCodeSelf`), qui
 * invalide l'ancien — la personne doit le noter à nouveau.
 */
export default function RenamePseudoModal({
  sessionId,
  currentPseudo,
  onClose,
  onRenamed,
  isPoll = false,
}: RenamePseudoModalProps) {
  const [value,   setValue]   = useState(currentPseudo)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [done,    setDone]    = useState(false)

  const [codeLoading, setCodeLoading] = useState(false)
  const [codeError,   setCodeError]   = useState<string | null>(null)
  const [newCode,     setNewCode]     = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const next = value.trim()
    if (!next || next === currentPseudo) return
    setError(null)
    setLoading(true)
    try {
      const member = await renameSessionMember(sessionId, next)
      setDone(true)
      onRenamed?.(member.pseudo)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue')
    } finally {
      setLoading(false)
    }
  }

  async function handleRegenerateCode() {
    setCodeError(null)
    setCodeLoading(true)
    try {
      const result = await regenerateReclaimCodeSelf(sessionId)
      setNewCode(result.new_reclaim_code)
    } catch (err: unknown) {
      setCodeError(err instanceof Error ? err.message : 'Erreur inattendue')
    } finally {
      setCodeLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-bleu-fonce/50 flex items-end sm:items-center justify-center z-50 px-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white w-full sm:max-w-sm shadow-2xl overflow-hidden rounded-t-[12px] sm:rounded-[12px]">
        <div className="relative overflow-hidden bg-bleu-fonce px-5 py-4">
          <FondQuadrille cases={2} />
          <h2 className="relative font-serif text-lg font-semibold text-creme">Nom et code de rappel</h2>
        </div>
        <div className="p-5 space-y-4">

        {done ? (
          <>
            <p className="text-sm text-gray-600">
              C'est fait, tu t'appelles désormais <strong>{value.trim()}</strong>.
              Ton code de rappel, lui, ne change pas.
            </p>
            <button
              onClick={onClose}
              className="w-full py-3 px-4 rounded-[8px] bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2"
            >
              Fermer
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-anthracite mb-1.5">Prénom Nom</label>
              <input
                type="text"
                value={value}
                onChange={e => setValue(e.target.value)}
                maxLength={40}
                autoFocus
                className="w-full px-4 py-3 rounded-[8px] bg-white border border-bleu-fonce/20 text-sm text-anthracite placeholder:text-anthracite/40 focus:outline-none focus:border-bleu-fonce focus:ring-2 focus:ring-bleu-clair/40"
              />
              <p className="text-xs text-gray-500 mt-1.5">{isPoll ? PSEUDO_POLL_NOTICE : PSEUDO_PUBLIC_NOTICE}</p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <button
                type="submit"
                disabled={loading || !value.trim() || value.trim() === currentPseudo}
                className="w-full py-3 px-4 rounded-[8px] bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2"
              >
                {loading ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Annuler
              </button>
            </div>
          </form>
        )}

        <div className="border-t border-bleu-fonce/10 pt-4 space-y-2">
          <p className="text-sm font-medium text-gray-700">Code de rappel oublié ?</p>

          {newCode ? (
            <div className="p-3 bg-indigo-50 border border-indigo-200 text-center">
              <p className="text-xs text-gray-500 mb-1">Ton nouveau code, à noter tout de suite :</p>
              <p className="text-2xl font-bold tracking-widest text-indigo-700">{newCode}</p>
              <p className="text-xs text-gray-500 mt-1">L'ancien code ne fonctionne plus.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500">
                Ton code est chiffré : on ne peut pas le relire, seulement t'en donner un nouveau. L'ancien cessera de fonctionner.
              </p>
              {codeError && (
                <div className="p-3 bg-red-50 border border-red-200 text-sm text-red-700">
                  {codeError}
                </div>
              )}
              <button
                type="button"
                onClick={handleRegenerateCode}
                disabled={codeLoading}
                className="w-full py-2.5 px-4 rounded-[8px] bg-gray-100 hover:bg-gray-200 disabled:opacity-60 text-gray-700 text-sm font-medium transition-colors"
              >
                {codeLoading ? 'Génération…' : 'Faire réapparaître mon code'}
              </button>
            </>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}
