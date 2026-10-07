import { useState } from 'react'
import { confirmAttendance } from '../lib/voting'
import FondQuadrille from './FondQuadrille'

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
    <div className="relative min-h-screen overflow-hidden bg-bleu-fonce flex flex-col items-center justify-center px-4 py-8">
      <FondQuadrille cases={10} />
      <div className="relative w-full max-w-sm space-y-6 rounded-[12px] bg-white ring-1 ring-white/10 shadow-2xl px-6 py-8 animate-montee">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-50 border border-amber-200 mb-4">
            <span className="text-2xl">🔑</span>
          </div>
          <h1 className="font-sans text-2xl font-bold tracking-[-0.01em] text-bleu-fonce">Reconnexion nécessaire</h1>
          <span aria-hidden="true" className="filet-spectre mx-auto mt-3 block w-12" />
          <p className="mt-3 text-sm text-gray-600 leading-relaxed">
            Ta connexion s'est réinitialisée (mise en veille prolongée, ou navigateur qui a coupé la session).
            Pour te remettre exactement où tu en étais, confirme ton code de rappel.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-anthracite/80 mb-1.5">
              Prénom Nom
            </label>
            <div className="rounded-[8px] w-full px-3.5 py-2.5 border border-bleu-fonce/10 bg-gray-100 text-sm font-semibold text-gray-700">
              {pseudo}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-anthracite/80 mb-1.5">
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
              className="rounded-[8px] w-full px-4 py-3 bg-white border border-bleu-fonce/20 text-lg tabular-nums font-bold text-bleu-fonce text-center tracking-[0.5em] placeholder:text-anthracite/30 focus:outline-none focus:border-bleu-fonce focus:ring-2 focus:ring-bleu-clair/40"
            />
            <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
              Le code à 4 chiffres affiché lors de ta première inscription à cette séance.
              Perdu ? Le modérateur de ta table ou l'organisateur peut t'en redonner un.
            </p>
          </div>

          {error && (
            <div role="alert" className="rounded-[8px] px-3.5 py-2.5 bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || code.trim().length === 0}
            className="rounded-[8px] w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors
              focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2"
          >
            {loading ? 'Vérification…' : 'Me reconnecter'}
          </button>
          <button
            type="button"
            onClick={onGiveUp}
            className="rounded-[8px] w-full py-2.5 text-sm font-semibold text-gray-600 hover:text-bleu-fonce transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
          >
            Je ne connais plus mon code
          </button>
        </form>
      </div>
    </div>
  )
}
