import { useState } from 'react'
import { claimModeratorStatus } from '../../lib/voting'
import { extractErr } from '../../lib/utils'
import type { SessionMember } from '../../lib/types'

interface Props {
  sessionId: string
  pseudo: string
  /** Affiche une note informative si l'appelant sait déjà que ce membre est modérateur. */
  alreadyModerator?: boolean
  onClose(): void
  onClaimed(member: SessionMember): void
}

/**
 * Chantier 73 — remplace le bouton "Je suis modérateur" du header de VoteScreen
 * (ex `ModeratorAccessPanel`, trop apparent) : accessible depuis le panneau
 * Outils (VoteScreen "vote" step et ParticipantView en débat, via
 * ParticipantToolsButton), sous le libellé "Me déclarer modérateur". Reste
 * proposé même à quelqu'un déjà modérateur — un second appel est sans effet
 * côté serveur, jamais bloqué côté UI. La fonction "créer une table" de
 * l'ancien panneau n'est PAS reprise ici : elle a été retirée (aucune utilité
 * pour un modérateur en cours de séance).
 */
export default function ModeratorClaimModal({ sessionId, pseudo, alreadyModerator, onClose, onClaimed }: Props) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const updated = await claimModeratorStatus(sessionId, password, pseudo)
      onClaimed(updated)
      setDone(true)
    } catch (err) {
      setError(extractErr(err))
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-[110] p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden p-6 text-center space-y-4" onClick={e => e.stopPropagation()}>
          <p className="text-3xl">✅</p>
          <p className="text-sm text-gray-700">Tu es marqué·e modérateur pour cette séance.</p>
          <button
            onClick={onClose}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-[110] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-indigo-600 px-6 py-5 text-center">
          <p className="text-2xl mb-1">🎙️</p>
          <h2 className="text-lg font-bold text-white">Me déclarer modérateur</h2>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <p className="text-xs text-gray-500">
            {alreadyModerator
              ? 'Tu es déjà marqué·e modérateur pour cette séance — reconfirmer ici n\'aura aucun effet.'
              : 'Confirme avec le mot de passe Ecclesia que tu es bien modérateur pour cette séance.'}
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Code Ecclesia</label>
            <input
              type="password"
              required
              autoFocus
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-3 text-sm border border-gray-300 rounded-xl
                focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                placeholder:text-gray-300 transition-shadow"
            />
          </div>
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 text-gray-600 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-xl transition-colors"
            >
              {loading ? 'Vérification…' : 'Confirmer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
