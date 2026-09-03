import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { claimTableAsModerator } from '../lib/voting'
import { tableStore, lastNameStore } from '../lib/storage'
import { extractErr } from '../lib/utils'
import type { TableResult } from '../lib/supabase'

interface Props {
  /** Code pré-rempli (ex: venu d'un lien #table/<code>). Si fourni, le champ est verrouillé. */
  initialJoinCode?: string
  /**
   * Chantier 68 — séance en cours, si connue (ex : `SessionRouterScreen`,
   * état `debating_no_member`). Transmise à `claim_table_as_moderator` pour
   * refuser un code de table appartenant à une autre séance. Omise par les
   * appelants qui n'ont aucune séance en contexte (ex : `JoinTableScreen`,
   * lien `#table/<code>` d'un ami).
   */
  sessionId?: string
  onJoined(tableId: string, participantId: string, isModerator: boolean): void
  submitLabel?: string
}

/** Formulaire de rattrapage : rejoindre une table de débat directement par son code,
 *  indépendamment de la séance de vote (D14 — rejoindre en retard, D8 — via un code distribué). */
export default function JoinTableForm({ initialJoinCode = '', sessionId, onJoined, submitLabel = 'Rejoindre' }: Props) {
  const locked = !!initialJoinCode
  const [joinCode, setJoinCode] = useState(initialJoinCode)
  const [pseudo, setPseudo] = useState(() => lastNameStore.get())
  const [asModerator, setAsModerator] = useState(false)
  const [moderatorCode, setModeratorCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const code = joinCode.trim().toUpperCase()
      const name = pseudo.trim()
      let r: TableResult
      if (asModerator) {
        // Chantier 68 — "Je suis modérateur de cette table" ne reprend plus
        // la main sans condition (reclaim_moderator) : on passe par
        // claim_table_as_moderator, qui refuse une table déjà modérée par
        // quelqu'un d'autre.
        r = await claimTableAsModerator(code, moderatorCode, name, sessionId)
      } else {
        const { data, error: err } = await supabase.rpc('join_table', {
          p_join_code: code,
          p_pseudo: name,
        })
        if (err) throw err
        r = data as TableResult
      }
      tableStore.set({
        tableId:       r.id,
        participantId: r.participant_id,
        joinCode:      r.join_code,
        isModerator:   asModerator,
        pseudo:        name,
      })
      lastNameStore.set(name)
      onJoined(r.id, r.participant_id, asModerator)
    } catch (err) {
      setError(extractErr(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {locked ? (
        <div className="text-center">
          <p className="text-xs text-gray-400">Code de table</p>
          <p className="font-mono text-xl font-bold tracking-widest text-indigo-600">{joinCode}</p>
        </div>
      ) : (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Code de table</label>
          <input
            type="text"
            required
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            placeholder="A1B2C3"
            className="w-full px-3 py-3 text-sm border border-gray-300 rounded-xl
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
              placeholder:text-gray-300 transition-shadow"
          />
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">Prénom Nom</label>
        <input
          type="text"
          required
          value={pseudo}
          onChange={e => setPseudo(e.target.value)}
          placeholder="Prénom Nom"
          className="w-full px-3 py-3 text-sm border border-gray-300 rounded-xl
            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
            placeholder:text-gray-300 transition-shadow"
        />
      </div>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={asModerator}
          onChange={e => { setAsModerator(e.target.checked); setError(null) }}
          className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
        />
        <span className="text-sm font-medium text-gray-700">Je suis modérateur de cette table</span>
      </label>
      {asModerator && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Code Ecclesia</label>
          <input
            type="password"
            required
            value={moderatorCode}
            onChange={e => setModeratorCode(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3 py-3 text-sm border border-gray-300 rounded-xl
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
              placeholder:text-gray-300 transition-shadow"
          />
        </div>
      )}
      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400
          text-white text-sm font-medium rounded-xl transition-colors focus:outline-none
          focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
        {loading ? 'Chargement…' : submitLabel}
      </button>
    </form>
  )
}
