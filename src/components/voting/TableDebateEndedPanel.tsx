import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { getSessionById } from '../../lib/sessions'
import { getMyTableAssignment, reopenTableDebate } from '../../lib/voting'
import { sessionTypeOf } from '../../lib/phaseLabels'
import type { Session } from '../../lib/types'
import { extractErr } from '../../lib/utils'

/**
 * Chantier 161 — encadré affiché à qui a quitté une table dont le débat est
 * terminé alors que la séance débat encore (écran de résultats en séance
 * complète, écran de fin en débat simple).
 *
 * - Le modérateur titulaire (is_table_moderator) peut rouvrir le débat de sa
 *   table tant que la séance est en débat (garde serveur reopen_table_debate).
 * - Tout le monde surveille (polling 10 s, même filet que VoteScreen /
 *   AllocatingScreen) : si le débat de la table reprend, un bandeau propose
 *   d'y revenir — jamais de retour automatique, quelqu'un en train de revoter
 *   ne doit pas être arraché de son écran.
 *
 * Ne rend rien hors de ce cas (séance passée en post-vote ou close : le
 * modérateur n'a plus aucun pouvoir de retour en arrière, arbitrage de Jules).
 */
interface Props {
  session: Session
  /** Table du membre, telle que renvoyée par get_my_table_assignment. */
  tableId: string | null
  /** Débat de la table terminé au chargement de l'écran. */
  initiallyEnded: boolean
  /** Appelé quand le polling voit le débat de la table reprendre (ou se terminer de nouveau). */
  onEndedChange?: (ended: boolean) => void
}

const POLL_MS = 10_000

export default function TableDebateEndedPanel({ session, tableId, initiallyEnded, onEndedChange }: Props) {
  const [sessionPhase, setSessionPhase] = useState(session.phase)
  const [ended,        setEnded]        = useState(initiallyEnded)
  const [isModerator,  setIsModerator]  = useState(false)
  const [confirming,   setConfirming]   = useState(false)
  const [busy,         setBusy]         = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  const isSimpleDebate = sessionTypeOf(session) === 'debate'
  const watching = sessionPhase === 'debating' && !!tableId && initiallyEnded

  useEffect(() => {
    if (!tableId || !initiallyEnded) return
    supabase.rpc('is_table_moderator', { p_table_id: tableId })
      .then(({ data }) => setIsModerator(data === true))
  }, [tableId, initiallyEnded])

  useEffect(() => {
    if (!watching) return
    const id = setInterval(async () => {
      const [s, a] = await Promise.all([
        getSessionById(session.id).catch(() => null),
        getMyTableAssignment(session.id).catch(() => null),
      ])
      if (s) setSessionPhase(s.phase)
      if (a) setEnded(!!a.debate_ended_at)
    }, POLL_MS)
    return () => clearInterval(id)
  }, [watching, session.id])

  useEffect(() => { onEndedChange?.(ended) }, [ended, onEndedChange])

  if (!watching) return null

  // Revenir à la table : on repasse par les entrées habituelles, qui savent
  // déjà rasseoir un membre affecté (débat simple : join_simple_debate ;
  // séance complète : l'écran de vote en phase débat propose « Rejoindre »).
  function goBackToTable() {
    window.location.hash = (isSimpleDebate ? '#session/' : '#vote/') + session.join_code
    window.location.reload()
  }

  async function reopen() {
    if (!tableId) return
    setBusy(true)
    setError(null)
    try {
      await reopenTableDebate(tableId)
      goBackToTable()
    } catch (e) {
      setError(extractErr(e))
      setBusy(false)
      setConfirming(false)
    }
  }

  if (!ended) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center space-y-3">
        <p className="text-sm font-semibold text-emerald-800">Le débat de votre table a repris</p>
        <button
          onClick={goBackToTable}
          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          Revenir à la table →
        </button>
      </div>
    )
  }

  if (!isModerator) return null

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
      <p className="text-sm text-gray-600">
        Votre table a terminé son débat. Tant que la séance est en débat, vous pouvez le rouvrir :
        toute la table pourra y revenir.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {confirming ? (
        <div className="flex gap-2">
          <button
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="flex-1 py-2.5 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            onClick={reopen}
            disabled={busy}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl"
          >
            {busy ? '…' : 'Rouvrir'}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-semibold rounded-xl transition-colors"
        >
          ↺ Rouvrir le débat de ma table
        </button>
      )}
    </div>
  )
}
