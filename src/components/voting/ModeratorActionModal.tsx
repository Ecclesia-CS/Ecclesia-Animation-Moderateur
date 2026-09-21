import { useState } from 'react'
import { claimModeratorStatus, reclaimTableAsModerator } from '../../lib/voting'
import { extractErr } from '../../lib/utils'

interface Props {
  tableId: string
  sessionId: string | null
  pseudo: string
  isModerator: boolean
  onClose(): void
}

type Action = 'session' | 'table'
type Step = 'choice' | 'form' | 'done'

/**
 * Chantier 113 — fusionne les deux entrées "Me déclarer modérateur" (chantier
 * 73) et "Je suis le modérateur de cette table" (chantier 110) du panneau
 * Outils en un seul point d'entrée. Les libellés et l'icône identiques ne
 * laissaient rien deviner de leur différence ; cette modale l'explique avant
 * de choisir, plutôt que de faire deviner à l'utilisateur lequel des deux
 * boutons il lui faut. Les deux RPC (`claim_moderator_status`,
 * `reclaim_table_as_moderator`) et leurs conditions d'affichage respectives
 * sont inchangées — seule la présentation est fusionnée.
 */
export default function ModeratorActionModal({ tableId, sessionId, pseudo, isModerator, onClose }: Props) {
  const [step, setStep] = useState<Step>('choice')
  const [action, setAction] = useState<Action | null>(null)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canClaimSession = !!sessionId
  const canReclaimTable = !isModerator

  function pick(a: Action) {
    setAction(a)
    setError(null)
    setPassword('')
    setStep('form')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (action === 'session' && sessionId) {
        await claimModeratorStatus(sessionId, password, pseudo)
      } else if (action === 'table') {
        await reclaimTableAsModerator(tableId, password)
      }
      setStep('done')
    } catch (err) {
      setError(extractErr(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-[110] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-indigo-600 px-6 py-5 text-center">
          <p className="text-2xl mb-1">🎙️</p>
          <h2 className="text-lg font-bold text-white">
            {step === 'choice' && 'Modérateur'}
            {step === 'form' && action === 'session' && 'Me déclarer modérateur'}
            {step === 'form' && action === 'table' && 'Reprendre l\'animation de cette table'}
            {step === 'done' && (action === 'session' ? 'Me déclarer modérateur' : 'Reprendre l\'animation de cette table')}
          </h2>
        </div>

        {step === 'choice' && (
          <div className="px-6 py-5 space-y-3">
            <p className="text-xs text-gray-500">
              Deux actions différentes se cachent derrière « modérateur » — choisis celle qui correspond à ta situation.
            </p>

            {canClaimSession && (
              <button
                onClick={() => pick('session')}
                className="w-full text-left p-4 rounded-xl border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
              >
                <p className="text-sm font-medium text-gray-900">Me déclarer modérateur de la séance</p>
                <p className="text-xs text-gray-500 mt-1">
                  Enregistre que tu es modérateur pour cette séance. Si tu es assis à une table qui attend
                  encore son modérateur, tu en prends l'animation dans la foulée. Si tu es assis ailleurs
                  (table déjà animée, ou aucune table), ça ne change que ton statut de séance — sans te
                  déplacer ni déloger personne.
                </p>
              </button>
            )}

            {canReclaimTable && (
              <button
                onClick={() => pick('table')}
                className="w-full text-left p-4 rounded-xl border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
              >
                <p className="text-sm font-medium text-gray-900">Reprendre l'animation de cette table</p>
                <p className="text-xs text-gray-500 mt-1">
                  Si tu animais déjà cette table et que tu as perdu la main (téléphone en veille, navigateur
                  qui a coupé), reprends-la ici. Si quelqu'un d'autre l'anime actuellement, il basculera en
                  participant — sans perdre son statut de modérateur de séance.
                </p>
              </button>
            )}

            <button
              onClick={onClose}
              className="w-full py-3 px-4 text-gray-600 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
          </div>
        )}

        {step === 'form' && (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            <p className="text-xs text-gray-500">
              {action === 'session'
                ? 'Confirme avec le mot de passe Ecclesia que tu es bien modérateur pour cette séance.'
                : 'Confirme avec le Code Ecclesia pour reprendre la main sur cette table.'}
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
                onClick={() => setStep('choice')}
                className="flex-1 py-3 px-4 text-gray-600 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Retour
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {loading ? 'Vérification…' : (action === 'session' ? 'Confirmer' : 'Reprendre la main')}
              </button>
            </div>
          </form>
        )}

        {step === 'done' && (
          <div className="p-6 text-center space-y-4">
            <p className="text-3xl">{action === 'session' ? '✅' : '🎙️'}</p>
            <p className="text-sm text-gray-700">
              {action === 'session'
                ? 'Tu es marqué·e modérateur pour cette séance.'
                : 'Tu animes maintenant cette table.'}
            </p>
            <button
              onClick={onClose}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
            >
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
