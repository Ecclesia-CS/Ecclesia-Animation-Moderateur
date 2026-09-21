import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { tableStore } from '../../lib/storage'
import { extractErr } from '../../lib/utils'
import type { TableResult } from '../../lib/supabase'

/**
 * Chantier 113 — remplace le mécanisme de rattachement par binôme en débat
 * (chantier 92) : plutôt que de deviner qui veut être assis avec qui,
 * le participant demande le code de la table visée et le saisit lui-même.
 * Reprend le bloc « code manuel » déjà écrit dans TableChangeModal.tsx.
 */
export default function ChangeTableModal({
  pseudo,
  onClose,
}: {
  pseudo: string
  onClose: () => void
}) {
  const [code, setCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function join() {
    if (code.trim().length === 0) return
    setJoining(true)
    setError(null)
    try {
      const { data, error: err } = await supabase.rpc('join_table', {
        p_join_code: code.trim().toUpperCase(),
        p_pseudo: pseudo,
      })
      if (err) throw err
      const r = data as TableResult
      tableStore.set({
        tableId: r.id,
        participantId: r.participant_id,
        joinCode: r.join_code,
        isModerator: false,
        pseudo,
      })
      // Rechargement plutôt qu'un changement d'état local : toute l'arborescence
      // de TableContext (participants, file, tours de parole, canal Realtime)
      // est montée sur l'ancienne table — même choix que TableChangeModal.
      window.location.reload()
    } catch (e) {
      setError(extractErr(e))
      setJoining(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-gray-200 p-6" onClick={e => e.stopPropagation()}>
        <div className="text-center mb-4">
          <div className="text-4xl mb-3">🔀</div>
          <h2 className="text-lg font-bold text-gray-900">Changer de table</h2>
          <p className="text-sm text-gray-500 mt-2">
            Demande le code à la table que tu veux rejoindre, et saisis-le ici.
          </p>
        </div>

        {error && (
          <div className="mb-3 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="A1B2C3"
            className="flex-1 px-3 py-2.5 text-sm border border-gray-300 rounded-xl
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
              placeholder:text-gray-300"
          />
          <button
            onClick={join}
            disabled={joining || code.trim().length === 0}
            className="py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300
              text-white text-sm font-medium rounded-xl transition-colors"
          >
            {joining ? 'Changement…' : 'Rejoindre'}
          </button>
        </div>

        <button
          onClick={onClose}
          disabled={joining}
          className="mt-4 w-full text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Annuler
        </button>
      </div>
    </div>
  )
}
