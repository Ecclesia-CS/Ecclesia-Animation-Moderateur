import { useEffect, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DragCancelEvent,
  type CollisionDetection,
} from '@dnd-kit/core'

import { useTable } from '../context/TableContext'
import { useLiveMs } from '../hooks/useLiveMs'
import { formatDuration, extractErr, generateTableCSV } from '../lib/utils'
import type { QueueEntry, SpeakingTurn } from '../lib/types'
import SpeakerTimer from '../components/SpeakerTimer'
import QueuePanel from '../components/QueuePanel'
import ParticipantsTable from '../components/ParticipantsTable'
import ParticipantsSidebar from '../components/ParticipantsSidebar'
import CorrectTurnModal from '../components/CorrectTurnModal'
import ConfirmModal from '../components/ConfirmModal'

export default function ModeratorView() {
  const {
    table,
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
    endTable,
    leaveTable,
  } = useTable()

  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 4 },
  }))

  const collisionDetectionStrategy: CollisionDetection = (args) => {
    // Pas de fallback closestCenter : si le curseur est hors de tout droppable,
    // on ne snap pas vers la première row (ce qui donnait "par défaut en premier").
    return pointerWithin(args)
  }

  // ── Ghost entry ID pour le drag participant → file ─────────────
  const GHOST_ID = '__ghost__'

  // ── Copies locales des files pour le preview drag ──────────────
  const [localLong, _setLocalLong]               = useState<QueueEntry[]>([])
  const [localInteractive, _setLocalInteractive] = useState<QueueEntry[]>([])
  const [isDragging, setIsDragging]              = useState(false)
  const [activeDragPseudo, setActiveDragPseudo]  = useState<string | null>(null)

  // Refs : toujours à jour même entre les renders (évite les stale closures dans les handlers)
  const localLongRef        = useRef<QueueEntry[]>([])
  const localInteractiveRef = useRef<QueueEntry[]>([])
  // Queue type ORIGINAL de l'entrée au moment du dragStart (immuable pendant le drag).
  // Ne pas lire active.data.current.queueType dans handleDragEnd : dnd-kit le met à jour
  // quand le composant re-render après handleDragOver, ce qui casse la détection cross-queue.
  const activeOriginalQTRef    = useRef<'long' | 'interactive' | null>(null)
  // Dernier over.id valide (row UUID, pas panel) pendant un drag intra-queue.
  // Évite le cas où over.id = panel ID au drop → newIndex = -1 → réordonnancement silencieusement ignoré.
  const intraQueueLastOverRef  = useRef<string | null>(null)

  function setLocalLong(val: QueueEntry[]) {
    localLongRef.current = val
    _setLocalLong(val)
  }
  function setLocalInteractive(val: QueueEntry[]) {
    localInteractiveRef.current = val
    _setLocalInteractive(val)
  }

  // Synchronisation local ← serveur quand on ne drague pas
  useEffect(() => {
    if (!isDragging) {
      setLocalLong(queueLong)
      setLocalInteractive(queueInteractive)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueLong, queueInteractive, isDragging])

  const [showCorrect, setShowCorrect] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [err, setErr]               = useState<string | null>(null)

  // Auto-advance state
  const [isGranting, setIsGranting]           = useState(false)
  const [pausedSpeakerId, setPausedSpeakerId] = useState<string | null>(null)
  // Ref mirrors pausedSpeakerId so the effect closure always reads the latest value
  const pausedRef = useRef<string | null>(null)
  pausedRef.current = pausedSpeakerId
  // Temps accumulé avant la pause (ms) — restitué au chrono à la reprise
  const [timerOffset, setTimerOffset] = useState(0)

  const speaker     = participants.find(p => p.id === table.current_speaker_id)
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
    if (table.current_speaker_id !== null) return

    // Interactive has priority over long
    const next = queueInteractive[0] ?? queueLong[0]
    if (!next) return

    setIsGranting(true)
    grantFloor(next.participant_id, next.queue_type as 'long' | 'interactive')
      .catch(e => setErr(extractErr(e)))
      .finally(() => setIsGranting(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table.current_speaker_id, queueInteractive, queueLong, isModerator, isGranting])

  // ── Pause / Resume / Skip ────────────────────────────────────
  function handlePause() {
    if (!table.current_speaker_id || !table.current_turn_started_at) return
    const currentElapsed = Date.now() - new Date(table.current_turn_started_at).getTime()
    setTimerOffset(currentElapsed + timerOffset) // accumule en cas de double pause
    setPausedSpeakerId(table.current_speaker_id)
    safe(endTurn)
  }

  function handleSkip() {
    setTimerOffset(0)
    setPausedSpeakerId(null)
    const next = queueInteractive[0] ?? queueLong[0]
    if (!next) return
    setIsGranting(true)
    grantFloor(next.participant_id, next.queue_type as 'long' | 'interactive')
      .catch(e => setErr(extractErr(e)))
      .finally(() => setIsGranting(false))
  }

  function handleDragStart({ active }: DragStartEvent) {
    const d = active.data.current as { type?: string; participantId?: string; queueType?: string } | undefined
    // Capturer le queueType ORIGINAL avant tout re-render causé par handleDragOver.
    // active.data.current est un ref mutable dans dnd-kit : il change quand le composant
    // re-render avec de nouvelles data (ex: queue_type: 'interactive' après un déplacement).
    activeOriginalQTRef.current   = (d?.queueType as 'long' | 'interactive') ?? null
    intraQueueLastOverRef.current = null
    // Initialise les copies locales depuis l'état serveur courant
    setLocalLong(queueLong)
    setLocalInteractive(queueInteractive)
    setIsDragging(true)
    const pseudo = participants.find(p => p.id === d?.participantId)?.pseudo ?? '…'
    setActiveDragPseudo(pseudo)
  }

  function handleDragOver({ active, over, delta }: DragOverEvent) {
    if (!over) return
    const activeData = active.data.current as { type?: string; participantId?: string; queueType?: string } | undefined
    const overData   = over.data.current   as { queueType?: 'long' | 'interactive' } | undefined
    const overQT     = overData?.queueType
    if (!overQT) return

    // ── Entrée de file cross-queue ────────────────────────────────
    if (activeData?.type === 'queue-entry') {
      const currentLong        = localLongRef.current
      const currentInteractive = localInteractiveRef.current

      // Trouver l'entrée dans l'une ou l'autre file locale
      const moving = currentLong.find(e => e.id === active.id)
                  ?? currentInteractive.find(e => e.id === active.id)
      if (!moving) return

      // Déterminer la file locale actuelle de l'entrée
      const entryInLong = currentLong.some(e => e.id === active.id)
      const currentQT   = entryInLong ? 'long' : 'interactive'

      // Skip UNIQUEMENT si l'item est dans sa file d'ORIGINE et survole cette même file.
      // Quand il a déjà traversé (currentQT ≠ activeOriginalQTRef.current),
      // on continue à tracker la position même à l'intérieur de la file cible.
      if (currentQT === overQT && currentQT === activeOriginalQTRef.current) {
        // Tracker le dernier over.id valide (row UUID, pas panel) pour l'intra-queue.
        const isPanelOver = over.id === 'queue-long' || over.id === 'queue-interactive'
        if (!isPanelOver && over.id !== active.id) {
          intraQueueLastOverRef.current = over.id as string
        }
        return
      }

      // Si on survole l'item actif lui-même (rendu à opacity 0.5 dans la file cible),
      // ne pas recalculer : active.id est absent de targetBase → dstIdx = -1 → erreur.
      if (over.id === active.id) return

      // Retirer l'entrée des deux files
      const newLong        = currentLong.filter(e => e.id !== active.id)
      const newInteractive = currentInteractive.filter(e => e.id !== active.id)

      // Insérer dans la file cible à la position survolée (haut = avant, bas = après)
      const targetBase  = overQT === 'long' ? newLong : newInteractive
      const overIsPanel = over.id === 'queue-long' || over.id === 'queue-interactive'
      let dstIdx: number
      if (overIsPanel) {
        dstIdx = targetBase.length
      } else {
        const foundIdx = targetBase.findIndex(e => e.id === over.id)
        if (foundIdx === -1) {
          dstIdx = targetBase.length
        } else {
          const midY = over.rect.top + over.rect.height / 2
          const initialRect = active.rect.current.initial
          const cursorY = initialRect
            ? (initialRect.top + initialRect.height / 2) + delta.y
            : 0
          dstIdx = cursorY > midY ? foundIdx + 1 : foundIdx
        }
      }
      const targetArr = [...targetBase]
      targetArr.splice(dstIdx, 0, { ...moving, queue_type: overQT })

      setLocalLong(overQT === 'long' ? targetArr : newLong)
      setLocalInteractive(overQT === 'interactive' ? targetArr : newInteractive)
      return
    }

    // ── Participant → file : déplacer / insérer le ghost ─────────
    if (activeData?.type === 'participant') {
      const currentLong        = localLongRef.current
      const currentInteractive = localInteractiveRef.current

      // Retirer tout ghost existant des deux files
      const longWithoutGhost        = currentLong.filter(e => e.id !== GHOST_ID)
      const interactiveWithoutGhost = currentInteractive.filter(e => e.id !== GHOST_ID)

      const ghost: QueueEntry = {
        id:             GHOST_ID,
        table_id:       table.id,
        participant_id: activeData.participantId ?? '',
        queue_type:     overQT,
        position:       0,
        created_at:     '',
      }

      // Insérer le ghost à la position survolée (haut = avant, bas = après)
      const targetBase  = overQT === 'long' ? longWithoutGhost : interactiveWithoutGhost
      const overIsPanel = over.id === 'queue-long' || over.id === 'queue-interactive'
      let dstIdx: number
      if (overIsPanel || over.id === GHOST_ID) {
        dstIdx = targetBase.length
      } else {
        const foundIdx = targetBase.findIndex(e => e.id === over.id)
        if (foundIdx === -1) {
          dstIdx = targetBase.length
        } else {
          const midY = over.rect.top + over.rect.height / 2
          const initialRect = active.rect.current.initial
          const cursorY = initialRect
            ? (initialRect.top + initialRect.height / 2) + delta.y
            : 0
          dstIdx = cursorY > midY ? foundIdx + 1 : foundIdx
        }
      }
      const targetArr = [...targetBase]
      targetArr.splice(dstIdx, 0, ghost)

      setLocalLong(overQT === 'long' ? targetArr : longWithoutGhost)
      setLocalInteractive(overQT === 'interactive' ? targetArr : interactiveWithoutGhost)
    }
  }

  function handleDragCancel(_e: DragCancelEvent) {
    setIsDragging(false)
    setActiveDragPseudo(null)
    intraQueueLastOverRef.current = null
    // Le useEffect de sync va restaurer l'état serveur automatiquement
  }

  function handleMasterDragEnd({ active, over }: DragEndEvent) {
    setIsDragging(false)
    setActiveDragPseudo(null)
    if (!over) return

    const activeData = active.data.current as
      { type: string; participantId?: string; queueType?: string } | undefined
    const overData = over.data.current as
      { type?: string; queueType?: 'long' | 'interactive' } | undefined

    if (activeData?.type === 'queue-entry') {
      // Utiliser le queueType capturé au dragStart (immuable).
      // Ne PAS lire activeData.queueType ici : dnd-kit le met à jour quand le
      // composant re-render après handleDragOver, ce qui ferait rater la détection cross-queue.
      const activeOriginalQT = activeOriginalQTRef.current ?? (activeData.queueType as 'long' | 'interactive')
      const overQT           = overData?.queueType as 'long' | 'interactive' | undefined

      // ── Cross-queue ───────────────────────────────────────────
      if (overQT && overQT !== activeOriginalQT) {
        const participantId = activeData.participantId
        if (!participantId) return
        // Position finale lue depuis localRef, tenu à jour par handleDragOver
        // (y compris les mouvements intra-target-queue grâce au changement ci-dessus).
        // Même principe que le ghost pour participant→queue : on lit l'index dans le state local.
        const targetQueue = overQT === 'long' ? localLongRef.current : localInteractiveRef.current
        const idx      = targetQueue.findIndex(e => e.id === active.id)
        const position = idx === -1 ? undefined : idx + 1
        safe(() => changeQueueType(active.id as string, participantId, overQT, position))
        return
      }

      // ── Intra-queue : réordonnancement ────────────────────────
      // Utilise le dernier over.id valide capturé par handleDragOver (évite le panel ID
      // qui donne newIndex = -1 et fait rater silencieusement le réordonnancement).
      const overId   = intraQueueLastOverRef.current ?? (over.id as string)
      intraQueueLastOverRef.current = null
      const queue    = activeOriginalQT === 'long' ? queueLong : queueInteractive
      const oldIndex = queue.findIndex(e => e.id === active.id)
      const newIndex = queue.findIndex(e => e.id === overId)
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return
      safe(() => reorderQueueEntry(active.id as string, newIndex + 1))
    }

    if (activeData?.type === 'participant') {
      const overQT = overData?.queueType
      if (!overQT) return
      // La position est celle du ghost dans la file locale (mis à jour à chaque onDragOver)
      const finalQueue = overQT === 'long' ? localLongRef.current : localInteractiveRef.current
      const ghostIdx   = finalQueue.findIndex(e => e.id === GHOST_ID)
      const position   = ghostIdx === -1 ? undefined : ghostIdx + 1
      safe(() => addToQueue(activeData.participantId!, overQT, position))
    }
  }

  function handleResume() {
    if (!pausedSpeakerId) return
    const id = pausedSpeakerId
    setPausedSpeakerId(null)
    safe(() => grantFloor(id, 'manual'))
  }

  function handleExport() {
    const csv = generateTableCSV(table, participants, speakingTurns)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ecclesia_${table.join_code}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">

      {/* ── Header ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-slate-950 border-b border-slate-700 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">

          {/* Left: join code + live mini-speaker */}
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-mono text-xl font-bold text-indigo-400 shrink-0 tracking-widest">
              {table.join_code}
            </span>
            {speaker && table.current_turn_started_at && (
              <>
                <span className="text-slate-700 shrink-0">|</span>
                <span className="flex items-center gap-2 text-sm min-w-0">
                  <span className="text-slate-300 truncate">{speaker.pseudo}</span>
                  <SpeakerTimer
                    startedAt={table.current_turn_started_at}
                    offsetMs={timerOffset}
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
              onClick={handleExport}
              className="text-xs px-3 py-1.5 border border-slate-600 rounded-lg
                text-slate-300 hover:bg-slate-700 transition-colors focus:outline-none
                focus:ring-2 focus:ring-slate-500"
            >
              Exporter
            </button>

            <button
              onClick={() => setShowCorrect(true)}
              className="text-xs px-3 py-1.5 border border-slate-600 rounded-lg
                text-slate-300 hover:bg-slate-700 transition-colors focus:outline-none
                focus:ring-2 focus:ring-slate-500"
            >
              Historique
            </button>

            <button
              onClick={leaveTable}
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
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetectionStrategy}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleMasterDragEnd}
        onDragCancel={handleDragCancel}
      >
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
            <div className="flex items-center gap-3 flex-wrap justify-center">
              <button
                onClick={handleResume}
                className="px-8 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl
                  text-base font-medium transition-colors focus:outline-none
                  focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-slate-900"
              >
                Reprendre la parole
              </button>
              <button
                onClick={handleSkip}
                className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl
                  text-base font-medium transition-colors focus:outline-none
                  focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-900"
              >
                Passer au suivant
              </button>
            </div>
          </div>
        ) : (
          <div className={`rounded-2xl border transition-all duration-300 ${
            speaker
              ? 'bg-slate-800 border-indigo-500/40'
              : 'bg-slate-800/60 border-slate-700'
          }`}>
            {speaker && table.current_turn_started_at ? (
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
                    startedAt={table.current_turn_started_at}
                    offsetMs={timerOffset}
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
                    onClick={() => { setTimerOffset(0); safe(endTurnAndAdvance) }}
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
            entries={localLong}
            queueType="long"
            participants={participants}
            variant="dark"
            accent="indigo"
            droppableId="queue-long"
            ghostId={GHOST_ID}
          />
          <QueuePanel
            title="Coupe file"
            subtitle="Pour répondre à ce qui est dit actuellement uniquement"
            entries={localInteractive}
            queueType="interactive"
            participants={participants}
            variant="dark"
            accent="teal"
            droppableId="queue-interactive"
            ghostId={GHOST_ID}
          />
        </div>

        {/* ── Participants stats ─────────────────────────────── */}
        <ParticipantsTable />

        </div>{/* end colonne principale */}

        {/* ── Sidebar participants ───────────────────────────── */}
        <ParticipantsSidebar
          participants={participants}
          currentSpeakerId={table.current_speaker_id}
          queueLong={queueLong}
          queueInteractive={queueInteractive}
        />

      </main>

      {/* ── DragOverlay : bulle qui suit le curseur pendant le drag ── */}
      <DragOverlay dropAnimation={null}>
        {activeDragPseudo && (
          <div className="px-4 py-2 bg-slate-700 text-slate-100 rounded-lg shadow-xl
            text-sm font-medium border border-slate-500/80 opacity-90 cursor-grabbing
            pointer-events-none select-none whitespace-nowrap">
            {activeDragPseudo}
          </div>
        )}
      </DragOverlay>

      </DndContext>

      {/* ── Modals ────────────────────────────────────────────── */}
      {showCorrect && <CorrectTurnModal onClose={() => setShowCorrect(false)} />}

      {confirmEnd && (
        <ConfirmModal
          title="Terminer la session ?"
          body="Cette action est irréversible. Tous les participants seront déconnectés et les données de la session supprimées."
          confirmLabel="Terminer"
          onConfirm={() => safe(endTable)}
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
