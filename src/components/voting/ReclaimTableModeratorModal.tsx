import { useState } from 'react'
import { reclaimTableAsModerator } from '../../lib/voting'
import { extractErr } from '../../lib/utils'

interface Props {
  tableId: string
  onClose(): void
  onClaimed(): void
}

/**
 * Chantier 110 — filet d'identité : si le jeton anonyme est renouvelé en
 * séance (veille longue, navigateur in-app, purge Safari ITP), plus aucun
 * chemin automatique ne rend l'écran modérateur à qui l'animait. Ce bouton,
 * dans le panneau Outils, reprend l'animation de la table courante avec le
 * Code Ecclesia — y compris si quelqu'un (potentiellement soi-même, sous une
 * autre identité) l'anime déjà : c'est un transfert volontaire assumé, pas
 * réservé au seul cas « identité perdue » (indétectable côté serveur).
 */
export default function ReclaimTableModeratorModal({ tableId, onClose, onClaimed }: Props) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await reclaimTableAsModerator(tableId, password)
      onClaimed()
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
          <p className="text-3xl">🎙️</p>
          <p className="text-sm text-gray-700">Tu animes maintenant cette table.</p>
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
          <h2 className="text-lg font-bold text-white">Reprendre l'animation de cette table</h2>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <p className="text-xs text-gray-500">
            Si tu animais déjà cette table (ex. téléphone verrouillé longtemps, navigateur qui a perdu ta
            connexion), confirme avec le Code Ecclesia pour reprendre la main. Si quelqu'un d'autre anime
            actuellement, il basculera automatiquement en vue participant — son statut de modérateur pour la
            séance n'est pas perdu pour autant.
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
              {loading ? 'Vérification…' : 'Reprendre la main'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
