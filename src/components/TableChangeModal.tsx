import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { privateChannel } from '../lib/realtime'
import { getMyTableAssignment } from '../lib/voting'
import { tableStore } from '../lib/storage'
import { extractErr } from '../lib/utils'
import type { TableResult } from '../lib/supabase'

/**
 * Chantier 95 — le superadmin peut déplacer quelqu'un d'une table à l'autre
 * pendant le débat (glisser-déposer de la vue Groupes). Ce déplacement ne
 * réécrit que `table_assignments` : la personne reste physiquement assise à sa
 * table précédente, et rien dans `ParticipantView` ne relisait son affectation.
 * Elle ne voyait donc strictement rien, même après rechargement.
 *
 * Ce composant surveille l'affectation du participant et lui propose de
 * rejoindre sa nouvelle table, ou une autre s'il s'est installé ailleurs.
 */
export default function TableChangeModal({
  sessionId,
  currentTableId,
  pseudo,
}: {
  sessionId: string
  currentTableId: string
  pseudo: string
}) {
  const [target, setTarget] = useState<{ tableNumber: number; joinCode: string } | null>(null)
  const [otherCode, setOtherCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Table dont le participant a explicitement refusé le déplacement. */
  const dismissedRef = useRef<string | null>(null)

  const check = useCallback(async () => {
    try {
      const a = await getMyTableAssignment(sessionId)
      const joinCode = a?.tables?.join_code
      if (!a || !a.table_id || !joinCode) return
      if (a.table_id === currentTableId || a.table_id === dismissedRef.current) {
        setTarget(null)
        return
      }
      setTarget({ tableNumber: a.table_number, joinCode })
    } catch {
      // non bloquant : le prochain passage réessaiera
    }
  }, [sessionId, currentTableId])

  useEffect(() => {
    check()
    // Secours, comme partout ailleurs sur les états asynchrones de séance :
    // Realtime seul est coupé dans les navigateurs in-app.
    const interval = setInterval(check, 10_000)
    const ch = privateChannel(`allocating:${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'table_assignments', filter: `session_id=eq.${sessionId}` },
        () => { void check() },
      )
      .subscribe()
    return () => {
      clearInterval(interval)
      supabase.removeChannel(ch)
    }
  }, [sessionId, check])

  async function join(code: string) {
    setJoining(true)
    setError(null)
    try {
      const { data, error: err } = await supabase.rpc('join_table', {
        p_join_code: code.toUpperCase(),
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
      // de `TableContext` (participants, file, tours de parole, canal Realtime)
      // est montée sur l'ancienne table.
      window.location.reload()
    } catch (e) {
      setError(extractErr(e))
      setJoining(false)
    }
  }

  if (!target) return null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
        <div className="text-center mb-4">
          <div className="text-4xl mb-3">🔀</div>
          <h2 className="text-lg font-bold text-gray-900">Changement de table</h2>
          <p className="text-sm text-gray-500 mt-2">
            L'organisateur t'a placé·e à la <strong>table N°{target.tableNumber}</strong>.
            Rejoins-la, ou saisis le code d'une autre table si tu es déjà installé·e ailleurs.
          </p>
        </div>

        {error && (
          <div className="mb-3 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          onClick={() => join(target.joinCode)}
          disabled={joining}
          className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400
            text-white text-sm font-medium rounded-xl transition-colors"
        >
          {joining ? 'Changement…' : `Rejoindre la table N°${target.tableNumber}`}
        </button>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Ou rejoindre une autre table avec son code
          </label>
          <div className="flex gap-2">
            <input
              value={otherCode}
              onChange={e => setOtherCode(e.target.value.toUpperCase())}
              placeholder="A1B2C3"
              className="flex-1 px-3 py-2.5 text-sm border border-gray-300 rounded-xl
                focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                placeholder:text-gray-300"
            />
            <button
              onClick={() => join(otherCode)}
              disabled={joining || otherCode.trim().length === 0}
              className="py-2.5 px-4 border border-indigo-200 text-indigo-600 text-sm font-medium
                rounded-xl hover:bg-indigo-50 transition-colors disabled:opacity-50"
            >
              Aller
            </button>
          </div>
        </div>

        <button
          onClick={() => {
            dismissedRef.current = null
            setTarget(null)
            // Mémorise le refus pour ne pas rouvrir à chaque vérification.
            getMyTableAssignment(sessionId)
              .then(a => { dismissedRef.current = a?.table_id ?? null })
              .catch(() => { /* la fenêtre réapparaîtra, ce n'est pas grave */ })
          }}
          disabled={joining}
          className="mt-4 w-full text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Rester à ma table
        </button>
      </div>
    </div>
  )
}
