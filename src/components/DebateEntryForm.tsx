import { useState } from 'react'
import { confirmAttendance, joinSimpleDebate } from '../lib/voting'
import { tableStore, lastNameStore } from '../lib/storage'
import { extractErr } from '../lib/utils'
import ReclaimCodeDisplay from './voting/ReclaimCodeDisplay'
import PasswordInput from './PasswordInput'

type JoinResult = Awaited<ReturnType<typeof joinSimpleDebate>>

interface Props {
  sessionId: string
  sessionTitle: string | null
  onJoined(tableId: string, participantId: string, isModerator: boolean): void
}

/**
 * Chantier 134 — entrée dans un débat simple (`session_type = 'debate'`,
 * phase `debating`). Pas de vote, pas de code de table à taper : nom +
 * prénom suffit, `join_simple_debate` inscrit et place à table.
 *
 * Trois chemins, tous par la même RPC :
 *   - participant : table la moins remplie ;
 *   - « Je suis le modérateur » + Code Ecclesia : prend l'animation d'une
 *     table sans modérateur (sinon refus explicite, la reprise d'une table
 *     déjà tenue passe par Outils une fois assis — chantier 110) ;
 *   - « J'ai déjà un code de rappel » : reconnexion depuis un autre appareil
 *     (`confirm_attendance`, pseudo + code), puis retour à sa table.
 */
export default function DebateEntryForm({ sessionId, sessionTitle, onJoined }: Props) {
  const [pseudo, setPseudo]             = useState(() => lastNameStore.get())
  const [asModerator, setAsModerator]   = useState(false)
  const [creationCode, setCreationCode] = useState('')
  const [reclaimOpen, setReclaimOpen]   = useState(false)
  const [reclaimCode, setReclaimCode]   = useState('')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [pending, setPending]           = useState<JoinResult | null>(null)

  function finish(r: JoinResult) {
    tableStore.set({
      tableId:       r.id,
      participantId: r.participant_id,
      joinCode:      r.join_code,
      isModerator:   r.is_moderator,
      pseudo:        r.pseudo,
    })
    lastNameStore.set(r.pseudo)
    onJoined(r.id, r.participant_id, r.is_moderator)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const name = pseudo.trim()
    if (!name) return
    setError(null)
    setLoading(true)
    try {
      if (reclaimOpen) {
        await confirmAttendance(sessionId, name, reclaimCode.trim())
      }
      const r = await joinSimpleDebate(sessionId, name, asModerator ? creationCode : undefined)
      if (r.new_reclaim_code) setPending(r)
      else finish(r)
    } catch (err) {
      setError(extractErr(err))
    } finally {
      setLoading(false)
    }
  }

  if (pending && pending.new_reclaim_code) {
    return (
      <ReclaimCodeDisplay
        pseudo={pending.pseudo}
        code={pending.new_reclaim_code}
        continueLabel="Rejoindre le débat →"
        onContinue={() => finish(pending)}
      />
    )
  }

  const inputCls = `w-full px-3 py-3 text-sm border border-gray-300 rounded-xl
    focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
    placeholder:text-gray-300 transition-shadow`

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
        <div className="text-center mb-5">
          <div className="text-5xl mb-4">🗣️</div>
          <h1 className="text-lg font-bold text-gray-900">Rejoindre le débat</h1>
          {sessionTitle && <p className="text-sm text-gray-500 mt-1">{sessionTitle}</p>}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Prénom Nom</label>
            <input
              type="text"
              required
              value={pseudo}
              onChange={e => { setPseudo(e.target.value); setError(null) }}
              placeholder="Prénom Nom"
              className={inputCls}
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={asModerator}
              onChange={e => { setAsModerator(e.target.checked); setError(null) }}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Je suis le modérateur
          </label>
          {asModerator && (
            <PasswordInput
              value={creationCode}
              onChange={v => { setCreationCode(v); setError(null) }}
              placeholder="Code Ecclesia"
            />
          )}

          <div className="border border-gray-100 rounded-xl">
            <button
              type="button"
              onClick={() => { setReclaimOpen(o => !o); setError(null) }}
              className="w-full px-3 py-2 text-left text-xs text-gray-500 hover:text-gray-700 flex items-center justify-between"
            >
              J'ai déjà un code de rappel
              <span className={`transition-transform ${reclaimOpen ? 'rotate-90' : ''}`}>›</span>
            </button>
            {reclaimOpen && (
              <div className="px-3 pb-3">
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={reclaimCode}
                  onChange={e => { setReclaimCode(e.target.value); setError(null) }}
                  placeholder="Code à 4 chiffres"
                  className={inputCls}
                />
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-600 text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || !pseudo.trim() || (asModerator && !creationCode) || (reclaimOpen && !reclaimCode.trim())}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400
              text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {loading ? 'Connexion…' : 'Rejoindre le débat'}
          </button>
        </form>

        <button
          onClick={() => { window.location.hash = '' }}
          className="mt-4 w-full text-xs text-indigo-600 hover:underline"
        >
          ← Retour à l'accueil
        </button>
      </div>
    </div>
  )
}
