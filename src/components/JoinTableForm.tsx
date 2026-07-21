import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { tableStore, lastNameStore } from '../lib/storage'
import { extractErr } from '../lib/utils'
import type { TableResult } from '../lib/supabase'

interface Props {
  /** Code pré-rempli (ex: venu d'un lien #table/<code>). Si fourni, le champ est verrouillé. */
  initialJoinCode?: string
  onJoined(tableId: string, participantId: string, isModerator: boolean): void
  submitLabel?: string
}

/** Formulaire de rattrapage : rejoindre une table de débat directement par son code,
 *  indépendamment de la séance de vote (D14 — rejoindre en retard, D8 — via un code distribué). */
export default function JoinTableForm({ initialJoinCode = '', onJoined, submitLabel = 'Rejoindre' }: Props) {
  const locked = !!initialJoinCode
  const [joinCode, setJoinCode] = useState(initialJoinCode)
  const [pseudo, setPseudo] = useState(() => lastNameStore.get())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { data, error: err } = await supabase.rpc('join_table', {
        p_join_code: joinCode.trim().toUpperCase(),
        p_pseudo: pseudo.trim(),
      })
      if (err) throw err
      const r = data as TableResult
      tableStore.set({
        tableId:       r.id,
        participantId: r.participant_id,
        joinCode:      r.join_code,
        isModerator:   false,
        pseudo:        pseudo.trim(),
      })
      lastNameStore.set(pseudo.trim())
      onJoined(r.id, r.participant_id, false)
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
        <label className="block text-xs font-medium text-gray-700 mb-1.5">Nom Prénom</label>
        <input
          type="text"
          required
          value={pseudo}
          onChange={e => setPseudo(e.target.value)}
          placeholder="Alice Dupont"
          className="w-full px-3 py-3 text-sm border border-gray-300 rounded-xl
            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
            placeholder:text-gray-300 transition-shadow"
        />
      </div>
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
