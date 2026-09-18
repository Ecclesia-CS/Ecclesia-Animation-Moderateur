import { useState } from 'react'
import { renameSessionMember, PSEUDO_PUBLIC_NOTICE } from '../../lib/voting'

interface RenamePseudoModalProps {
  sessionId: string
  currentPseudo: string
  onClose: () => void
  onRenamed?: (newPseudo: string) => void
}

/**
 * Chantier 93 — changement de nom, à tout moment. Le serveur refuse un nom déjà
 * pris dans la séance, et refuse aussi pendant une prise de parole ou une place
 * en file d'attente (le nom changerait sous les yeux du modérateur en plein
 * tour). Le renommage est propagé côté base aux deux copies du pseudo
 * (`participants`, `session_sources`) — rien à faire ici.
 */
export default function RenamePseudoModal({
  sessionId,
  currentPseudo,
  onClose,
  onRenamed,
}: RenamePseudoModalProps) {
  const [value,   setValue]   = useState(currentPseudo)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [done,    setDone]    = useState(false)

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

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 px-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Changer mon nom</h2>

        {done ? (
          <>
            <p className="text-sm text-gray-600">
              C'est fait, tu t'appelles désormais <strong>{value.trim()}</strong>.
              Ton code de rappel, lui, ne change pas.
            </p>
            <button
              onClick={onClose}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
            >
              Fermer
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prénom Nom</label>
              <input
                type="text"
                value={value}
                onChange={e => setValue(e.target.value)}
                maxLength={40}
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-400 mt-1.5">{PSEUDO_PUBLIC_NOTICE}</p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <button
                type="submit"
                disabled={loading || !value.trim() || value.trim() === currentPseudo}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-xl transition-colors"
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
      </div>
    </div>
  )
}
