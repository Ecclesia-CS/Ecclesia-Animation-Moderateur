import { useState } from 'react'
import { confirmAttendance } from '../lib/voting'

interface ReconnectPromptProps {
  sessionId: string
  pseudo: string
  /** Confirmation réussie — le client peut rappeler join_table/switch_table sans risque de reconnect_required. */
  onConfirmed: () => void
  /** "Je ne connais plus mon code" — abandonne la restauration, retour à l'écran d'entrée. */
  onGiveUp: () => void
}

/**
 * Chantier 120 — affiché quand le jeton anonyme a été renouvelé (veille
 * longue, navigateur in-app, purge Safari ITP) et qu'`App.tsx` a détecté
 * qu'un membre existe déjà sous ce pseudo pour un autre user_id
 * (`sync_table_assignment` a répondu `reconnect_required`). Décision de
 * Jules : ne jamais réassigner l'identité par simple pseudo — exiger le
 * code de rappel, comme toute reconnexion depuis un nouvel appareil.
 */
export default function ReconnectPrompt({ sessionId, pseudo, onConfirmed, onGiveUp }: ReconnectPromptProps) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = code.trim()
    if (!trimmed) return
    setError(null)
    setLoading(true)
    try {
      await confirmAttendance(sessionId, pseudo, trimmed)
      onConfirmed()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-100 mb-4">
            <span className="text-2xl">🔑</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Reconnexion nécessaire</h1>
          <p className="mt-2 text-sm text-gray-500">
            Ta connexion s'est réinitialisée (mise en veille prolongée, ou navigateur qui a coupé la session).
            Pour te remettre exactement où tu en étais, confirme ton code de rappel.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Prénom Nom
            </label>
            <div className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-100 text-sm text-gray-600">
              {pseudo}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Code de rappel (4 chiffres)
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="_ _ _ _"
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm font-mono text-center tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-gray-400 mt-1.5">
              Le code à 4 chiffres affiché lors de ta première inscription à cette séance.
              Perdu ? Le modérateur de ta table ou l'organisateur peut t'en redonner un.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || code.trim().length === 0}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-xl transition-colors"
          >
            {loading ? 'Vérification…' : 'Me reconnecter →'}
          </button>
          <button
            type="button"
            onClick={onGiveUp}
            className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Je ne connais plus mon code
          </button>
        </form>
      </div>
    </div>
  )
}
