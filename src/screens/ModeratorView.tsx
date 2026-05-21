import { useEffect, useRef, useState } from 'react'
import {
  DndContext,
  closestCenter,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type CollisionDetection,
} from '@dnd-kit/core'
import { useSession } from '../context/SessionContext'
import { useLiveMs } from '../hooks/useLiveMs'
import { formatDuration, extractErr } from '../lib/utils'
import type { SpeakingTurn } from '../lib/types'
import SpeakerTimer from '../components/SpeakerTimer'
import QueuePanel from '../components/QueuePanel'
import ParticipantsTable from '../components/ParticipantsTable'
import ParticipantsSidebar from '../components/ParticipantsSidebar'
import CorrectTurnModal from '../components/CorrectTurnModal'
import ConfirmModal from '../components/ConfirmModal'

export default function ModeratorView() {
  const {
    session,
    participants,
    queueLong,
    queueInteractive,
    speakingTurns,
    myParticipant,
    isModerator,
    grantFloor,
    endTurn,
    endTurnAndAdvance,
    addToQueue,
    reorderQueueEntry,
    changeQueueType,
    endSession,
    leaveSession,
  } = useSession()

  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 4 },
  }))

  const collisionDetectionStrategy: CollisionDetection = (args) => {
    const pw = pointerWithin(args)
    if (pw.length > 0) return pw
    return closestCenter(args)
  }

  const [showCorrect, setShowCorrect] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [err, setErr]               = useState<string | null>(null)

  // Auto-advance state
  const [isGranting, setIsGranting]         = useState(false)
  const [pausedSpeakerId, setPausedSpeakerId] = useState<string | null>(null)
  // Ref mirrors pausedSpeakerId so the effect closure always reads the latest value
  const pausedRef = useRef<string | null>(null)
  pausedRef.current = pausedSpeakerId

  const speaker     = participants.find(p => p.id === session.current_speaker_id)
  const pausedName  = pausedSpeakerId
    ? participants.find(p => p.id === pausedSpeakerId)?.pseudo ?? '…'
    : null

  const sourceLabel: Record<string, string> = {
    long:        "File d'attente",
    interactive: 'Coupe file',
    manual:      'Manuel',
  }
  const sourceBadge: Record<string, string> = {
    long:        'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    interactive: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
    manual:      'bg-slate-600 text-slate-300 border-slate-500',
  }

  const currentTurn = speakingTurns.find(t => t.ended_at === null) ?? null

  async function safe(fn: () => Promise<void>) {
    setErr(null)
    try { await fn() } catch (e) { setErr(extractErr(e)) }
  }

  // ── Auto-advance (fallback) ──────────────────────────────────
  // Chemin principal : endTurnAndAdvance() gère l'avancement côté serveur.
  // Cet effet ne se déclenche que si la file était vide au moment de la fin
  // du tour mais qu'une entrée arrive juste après (condition de course).
  useEffect(() => {
    if (!isModerator || isGranting || pausedRef.current !== null) return
    if (session.current_speaker_id !== null) return

    // Interactive has priority over long
    const next = queueInteractive[0] ?? queueLong[0]
    if (!next) return

    setIsGranting(true)
    grantFloor(next.participant_id, next.queue_type as 'long' | 'interactive')
      .catch(e => setErr(extractErr(e)))
      .finally(() => setIsGranting(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.current_speaker_id, queueInteractive, queueLong, isModerator, isGranting])

  // ── Pause / Resume ──────────────────────────────────────────
  function handlePause() {
    if (!session.current_speaker_id) return
    setPausedSpeakerId(session.current_speaker_id)
    safe(endTurn)
  }

  function handleMasterDragEnd({ active, over }: DragEndEvent) {
    if (!over) return
    const activeData = active.data.current as
      { type: string; participantId?: string; queueType?: string } | undefined
    const overData = over.data.current as
      { type?: string; queueType?: 'long' | 'interactive' } | undefined

    if (activeData?.type === 'queue-entry') {
      const activeQueueType = activeData.queueType as 'long' | 'interactive'
      const overQueueType   = overData?.queueType as 'long' | 'interactive' | undefined

      // Déplacement cross-queue
      if (overQueueType && overQueueType !== activeQueueType) {
        const participantId = (activeData as { participantId?: string }).participantId
        if (participantId) safe(() => changeQueueType(active.id as string, participantId, overQueueType))
        return
      }

      // Réordonnancement dans la même file
      const queue = activeQueueType === 'long' ? queueLong : queueInteractive
      const oldIndex = queue.findIndex(e => e.id === active.id)
      const newIndex = queue.findIndex(e => e.id === over.id)
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return
      safe(() => reorderQueueEntry(active.id as string, newIndex + 1))
    }

    if (activeData?.type === 'participant') {
      const queueType = overData?.queueType
      if (!queueType) return
      safe(() => addToQueue(activeData.participantId!, queueType))
    }
  }

  function handleResume() {
    if (!pausedSpeakerId) return
    const id = pausedSpeakerId
    setPausedSpeakerId(null)
    safe(() => grantFloor(id, 'manual'))
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">

      {/* ── Header ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-slate-950 border-b border-slate-700 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">

          {/* Left: join code + live mini-speaker */}
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-mono text-xl font-bold text-indigo-400 shrink-0 tracking-widest">
              {session.join_code}
            </span>
            {speaker && session.current_turn_started_at && (
              <>
                <span className="text-slate-700 shrink-0">|</span>
                <span className="flex items-center gap-2 text-sm min-w-0">
                  <span className="text-slate-300 truncate">{speaker.pseudo}</span>
                  <SpeakerTimer
                    startedAt={session.current_turn_started_at}
                    className="text-indigo-400 shrink-0 font-mono tabular-nums"
                  />
                </span>
              </>
            )}
          </div>

          {/* Right: moderator badge + actions */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden md:flex items-center gap-1.5 text-sm text-slate-300">
              <span className="truncate max-w-[120px]">{myParticipant.pseudo}</span>
              <span className="bg-indigo-500/20 text-indigo-300 text-xs px-2 py-0.5
                rounded-full border border-indigo-500/30 whitespace-nowrap">
                Modérateur
              </span>
            </div>
            <span
              className="md:hidden text-slate-400"
              title={`${myParticipant.pseudo} — Modérateur`}
              aria-label={`${myParticipant.pseudo} — Modérateur`}
            >
              🔑
            </span>

            <button
              onClick={() => setShowCorrect(true)}
              className="text-xs px-3 py-1.5 border border-slate-600 rounded-lg
                text-slate-300 hover:bg-slate-700 transition-colors focus:outline-none
                focus:ring-2 focus:ring-slate-500"
            >
              Historique
            </button>

            <button
              onClick={leaveSession}
              className="text-xs px-3 py-1.5 border border-slate-600 rounded-lg
                text-slate-300 hover:bg-slate-700 transition-colors focus:outline-none
                focus:ring-2 focus:ring-slate-500"
            >
              Quitter
            </button>

            <button
              onClick={() => setConfirmEnd(true)}
              className="text-xs px-3 py-1.5 bg-red-600/10 border border-red-700/50
                text-red-400 rounded-lg hover:bg-red-600/20 transition-colors focus:outline-none
                focus:ring-2 focus:ring-red-500"
            >
              Terminer session
            </button>
          </div>
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────────── */}
      <DndContext sensors={sensors} collisionDetection={collisionDetectionStrategy} onDragEnd={handleMasterDragEnd}>
      <main className="max-w-6xl mx-auto p-4 flex flex-col lg:flex-row gap-4 items-start">

        {/* ── Colonne principale ─────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-4">

        {err && (
          <div className="p-3 rounded-xl bg-red-900/30 border border-red-700 text-sm text-red-300">
            {err}
          </div>
        )}

        {/* ── Hero : orateur en cours ────────────────────────── */}

        {/* Pause state */}
        {pausedSpeakerId && !speaker ? (
          <div className="rounded-2xl border bg-amber-900/20 border-amber-600/40 p-6 flex flex-col items-center gap-4 text-center">
            <div className="flex items-center gap-2">
              <PauseIcon className="w-5 h-5 text-amber-400" />
              <span className="text-amber-300 font-semibold text-lg">Pause</span>
            </div>
            <p className="text-3xl font-bold text-white">{pausedName}</p>
            <p className="text-sm text-slate-400">Le micro est en pause</p>
            <SessionTimerDisplay
              speakingTurns={speakingTurns}
              className="text-4xl font-mono tabular-nums text-slate-400 leading-none"
            />
            <p className="text-xs text-slate-600 -mt-2">durée de séance</p>
            <button
              onClick={handleResume}
              className="px-8 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl
                text-base font-medium transition-colors focus:outline-none
                focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-slate-900"
            >
              Reprendre la parole
            </button>
          </div>
        ) : (
          <div className={`rounded-2xl border transition-all duration-300 ${
            speaker
              ? 'bg-slate-800 border-indigo-500/40'
              : 'bg-slate-800/60 border-slate-700'
          }`}>
            {speaker && session.current_turn_started_at ? (
              <div className="p-6 flex flex-col items-center text-center gap-3">
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2.5 py-1 rounded-full border font-medium
                    ${sourceBadge[currentTurn?.source ?? 'manual']}`}>
                    {sourceLabel[currentTurn?.source ?? 'manual']}
                  </span>
                </div>
                <p className="text-5xl font-bold text-white animate-speaking leading-tight">
                  {speaker.pseudo}
                </p>
                <div className="flex items-center justify-center gap-8 flex-wrap">
                  <SpeakerTimer
                    startedAt={session.current_turn_started_at}
                    className="text-8xl font-mono tabular-nums text-indigo-300 leading-none"
                  />
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs text-slate-500 uppercase tracking-widest">Séance</span>
                    <SessionTimerDisplay
                      speakingTurns={speakingTurns}
                      className="text-5xl font-mono tabular-nums text-slate-400 leading-none"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <button
                    onClick={handlePause}
                    className="px-5 py-2.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300
                      border border-amber-600/40 rounded-xl text-sm font-medium transition-colors
                      focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2
                      focus:ring-offset-slate-800 flex items-center gap-2"
                  >
                    <PauseIcon className="w-4 h-4" />
                    Pause
                  </button>
                  <button
                    onClick={() => safe(endTurnAndAdvance)}
                    className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white
                      rounded-xl text-base font-medium transition-colors focus:outline-none
                      focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2
                      focus:ring-offset-slate-800"
                  >
                    Terminer la prise de parole
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-10 text-center">
                {isGranting ? (
                  <p className="text-lg text-slate-500">Attribution en cours…</p>
                ) : (
                  <>
                    <p className="text-3xl font-semibold text-slate-600">Micro libre</p>
                    <p className="mt-1 text-sm text-slate-600">Aucun orateur en cours</p>
                  </>
                )}
                <SessionTimerDisplay
                  speakingTurns={speakingTurns}
                  className="text-5xl font-mono tabular-nums text-slate-500 mt-4 leading-none block"
                />
                <p className="text-xs text-slate-600 mt-1">durée de séance</p>
              </div>
            )}
          </div>
        )}

        {/* ── Files côte-à-côte ──────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <QueuePanel
            title="File d'attente : demander la parole"
            entries={queueLong}
            queueType="long"
            participants={participants}
            variant="dark"
            accent="indigo"
            droppableId="queue-long"
          />
          <QueuePanel
            title="Coupe file"
            entries={queueInteractive}
            queueType="interactive"
            participants={participants}
            variant="dark"
            accent="teal"
            droppableId="queue-interactive"
          />
        </div>

        {/* ── Participants stats ─────────────────────────────── */}
        <ParticipantsTable />

        </div>{/* end colonne principale */}

        {/* ── Sidebar participants ───────────────────────────── */}
        <ParticipantsSidebar
          participants={participants}
          currentSpeakerId={session.current_speaker_id}
          queueLong={queueLong}
          queueInteractive={queueInteractive}
        />

      </main>
      </DndContext>

      {/* ── Modals ────────────────────────────────────────────── */}
      {showCorrect && <CorrectTurnModal onClose={() => setShowCorrect(false)} />}

      {confirmEnd && (
        <ConfirmModal
          title="Terminer la session ?"
          body="Cette action est irréversible. Tous les participants seront déconnectés et les données de la session supprimées."
          confirmLabel="Terminer"
          onConfirm={() => safe(endSession)}
          onCancel={() => setConfirmEnd(false)}
        />
      )}
    </div>
  )
}

// ── Session timer (isolated so useLiveMs ne re-rend pas tout ModeratorView) ──

function SessionTimerDisplay({
  speakingTurns,
  className,
}: {
  speakingTurns: SpeakingTurn[]
  className: string
}) {
  const now = useLiveMs()
  const total = speakingTurns.reduce((sum, t) => {
    const start = new Date(t.started_at).getTime()
    const end   = t.ended_at ? new Date(t.ended_at).getTime() : now
    return sum + Math.max(0, end - start)
  }, 0)
  return <span className={className}>{formatDuration(total)}</span>
}

// ── Inline icons ───────────────────────────────────────────────

function PauseIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="4" width="4" height="16"/>
      <rect x="14" y="4" width="4" height="16"/>
    </svg>
  )
}
