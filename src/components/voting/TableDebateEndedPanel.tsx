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
      <div className="flex items-stretch overflow-hidden rounded-[12px] border border-bleu-fonce/10 bg-white shadow-sm animate-montee">
        <span aria-hidden="true" className="flex w-14 shrink-0 items-start justify-center bg-teal-600 pt-4 text-lg">🗣️</span>
        <div className="min-w-0 flex-1 space-y-3 px-4 py-3.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700">Débat de votre table</p>
          <p className="font-sans text-base font-bold leading-snug tracking-[-0.01em] text-bleu-fonce">Il a repris</p>
          <button
            onClick={goBackToTable}
            className="w-full rounded-[8px] h-10 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors
              focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2"
          >
            Revenir à la table
          </button>
        </div>
      </div>
    )
  }

  if (!isModerator) return null

  return (
    <div className="flex items-stretch overflow-hidden rounded-[12px] border border-bleu-fonce/10 bg-white shadow-sm animate-montee">
      <span aria-hidden="true" className="flex w-14 shrink-0 items-start justify-center bg-bleu-fonce pt-4 text-lg">🏁</span>
      <div className="min-w-0 flex-1 space-y-3 px-4 py-3.5">
        <p className="text-sm leading-relaxed text-gray-700">
          Votre table a terminé son débat. Tant que la séance est en débat, vous pouvez le rouvrir :
          toute la table pourra y revenir.
        </p>
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        {confirming ? (
          <div className="flex gap-2">
            <button
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="flex-1 rounded-[8px] h-10 text-sm font-semibold border border-bleu-fonce/20 text-bleu-fonce transition-colors hover:border-bleu-fonce/40 hover:bg-bleu-fonce/[0.04]
                focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              onClick={reopen}
              disabled={busy}
              className="flex-1 rounded-[8px] h-10 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors
                focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2"
            >
              {busy ? '…' : 'Rouvrir'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="w-full rounded-[8px] h-10 border border-bleu-fonce/20 text-bleu-fonce text-sm font-semibold transition-colors hover:border-bleu-fonce/40 hover:bg-bleu-fonce/[0.04]
              focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
          >
            Rouvrir le débat de ma table
          </button>
        )}
      </div>
    </div>
  )
}
