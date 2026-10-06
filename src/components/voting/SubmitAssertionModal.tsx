import { useState } from 'react'
import { submitAssertion } from '../../lib/voting'
import type { Session } from '../../lib/types'

interface SubmitAssertionModalProps {
  session: Session
  onClose: () => void
  onSubmitted: () => void
}

export default function SubmitAssertionModal({
  session,
  onClose,
  onSubmitted,
}: SubmitAssertionModalProps) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = content.trim()
    if (!trimmed) return
    setError(null)
    setLoading(true)
    try {
      await submitAssertion(session.id, trimmed)
      setSubmitted(true)
      onSubmitted()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-bleu-fonce/60 flex items-end sm:items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md bg-white shadow-xl p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-bleu-fonce">Proposer une assertion</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            ✕
          </button>
        </div>

        {session.assertions_locked ? (
          <div className="py-4 text-center space-y-3">
            <div className="text-4xl">🔒</div>
            <p className="text-sm font-semibold text-gray-900">
              Propositions désactivées
            </p>
            <p className="text-sm text-gray-500">
              Le superadmin a désactivé la proposition de nouvelles assertions pour cette séance.
            </p>
            <button
              onClick={onClose}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2"
            >
              Fermer
            </button>
          </div>
        ) : submitted ? (
          <div className="py-4 text-center space-y-3">
            <div className="text-4xl">🎉</div>
            <p className="text-sm font-semibold text-gray-900">
              Assertion soumise !
            </p>
            {session.moderation_policy !== 'open' ? (
              <p className="text-sm text-gray-500">
                Ton assertion sera visible après validation.
              </p>
            ) : (
              <p className="text-sm text-gray-500">
                Ton assertion est maintenant visible pour tous les participants.
              </p>
            )}
            <button
              onClick={onClose}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2"
            >
              Fermer
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-anthracite/80 mb-1.5">
                Formule une affirmation que tu voudrais soumettre au vote
              </label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Ex : « La transition écologique doit être une priorité absolue »"
                rows={4}
                maxLength={500}
                required
                autoFocus
                className="w-full px-4 py-3 resize-none bg-white border border-bleu-fonce/20 text-sm text-anthracite placeholder:text-anthracite/40 focus:outline-none focus:border-bleu-fonce focus:ring-2 focus:ring-bleu-clair/40"
              />
              <p className="text-right text-xs text-gray-500 mt-0.5">{content.length}/500</p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-sm text-red-700">
                {error}
              </div>
            )}

            {session.moderation_policy !== 'open' && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 p-3">
                ℹ️ Cette séance utilise la modération {session.moderation_policy === 'ai' ? 'automatique' : 'fermée'}. Ton assertion sera visible après validation.
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !content.trim()}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2"
            >
              {loading ? 'Envoi…' : 'Soumettre →'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
