import { useState } from 'react'
import { registerSessionMember } from '../../lib/voting'
import type { Session, SessionMember } from '../../lib/types'

interface PseudoFormProps {
  session: Session
  onSuccess: (member: SessionMember) => void
}

export default function PseudoForm({ session, onSuccess }: PseudoFormProps) {
  const [pseudo, setPseudo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = pseudo.trim()
    if (!trimmed) return
    setError(null)
    setLoading(true)
    try {
      const member = await registerSessionMember(session.id, trimmed)
      onSuccess(member)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-100 mb-4">
            <span className="text-2xl">🗣️</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">{session.title}</h1>
          {session.description && (
            <p className="mt-1 text-sm text-gray-500">{session.description}</p>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Choisis ton pseudo pour cette séance
            </label>
            <input
              type="text"
              value={pseudo}
              onChange={e => setPseudo(e.target.value)}
              placeholder="Ton prénom ou un pseudonyme…"
              maxLength={40}
              required
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !pseudo.trim()}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            {loading ? 'Connexion…' : 'Continuer →'}
          </button>
        </form>
      </div>
    </div>
  )
}
