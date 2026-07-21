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
import { useTranscription } from '../hooks/useTranscription'
import { formatDuration, extractErr } from '../lib/utils'
import { supabase } from '../lib/supabase'
import type { QueueEntry, SpeakingTurn } from '../lib/types'
import SpeakerTimer from '../components/SpeakerTimer'
import QueuePanel from '../components/QueuePanel'
import ParticipantsTable from '../components/ParticipantsTable'
import ParticipantsSidebar from '../components/ParticipantsSidebar'
import CorrectTurnModal from '../components/CorrectTurnModal'
import QuestionnaireBtn from '../components/QuestionnaireFab'
import NotesButton from '../components/NotesButton'
import DocumentationButton from '../components/DocumentationButton'
import AssertionsButton from '../components/AssertionsButton'
import QrCodeButton from '../components/QrCodeButton'

export default function ModeratorView() {
  const {
    table,
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
    leaveTable,
    forceQuestionnaire,
    cancelForceQuestionnaire,
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
  const [showOutils,  setShowOutils]  = useState(false)
  const [err, setErr]               = useState<string | null>(null)

  // Session docs pour le bouton Documentation
  const [sessionDocs, setSessionDocs] = useState<{
    title: string | null
    doc_info_url: string | null
    doc_summary_url: string | null
    doc_collab_url: string | null
    session_join_code: string | null
  } | null>(null)

  useEffect(() => {
    if (!table.session_id) return
    supabase
      .from('sessions')
      .select('title, join_code, doc_info_url, doc_summary_url, doc_collab_url')
      .eq('id', table.session_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setSessionDocs({
          title:             data.title,
          doc_info_url:      data.doc_info_url,
          doc_summary_url:   data.doc_summary_url,
          doc_collab_url:    data.doc_collab_url,
          session_join_code: data.join_code,
        })
      })
  }, [table.session_id])

  // ── Pause persistence ────────────────────────────────────────
  // La pause est persistée dans localStorage avec une clé spécifique à la table
  // pour survivre à un rechargement de page du modérateur.
  const PAUSE_KEY = `ecclesia_pause_${table.id}`

  function clearPauseStorage() {
    localStorage.removeItem(PAUSE_KEY)
  }

  function readPauseStorage(): { pausedSpeakerId: string; timerOffset: number } | null {
    try {
      const raw = localStorage.getItem(PAUSE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }

  // Auto-advance state
  const [isGranting, setIsGranting]           = useState(false)
  const [pausedSpeakerId, setPausedSpeakerId] = useState<string | null>(
    () => readPauseStorage()?.pausedSpeakerId ?? null
  )
  // Ref mirrors pausedSpeakerId so the effect closure always reads the latest value
  const pausedRef = useRef<string | null>(null)
  pausedRef.current = pausedSpeakerId
  // Temps accumulé avant la pause (ms) — restitué au chrono à la reprise
  const [timerOffset, setTimerOffset] = useState<number>(
    () => readPauseStorage()?.timerOffset ?? 0
  )

  // Validation après chargement des données : invalider la pause restaurée si
  // quelqu'un d'autre a déjà la parole, ou si le participant n'existe plus.
  useEffect(() => {
    if (!pausedSpeakerId) return
    if (table.current_speaker_id !== null) {
      // Quelqu'un d'autre a obtenu la parole → pause obsolète
      setPausedSpeakerId(null)
      setTimerOffset(0)
      clearPauseStorage()
      return
    }
    if (!participants.some(p => p.id === pausedSpeakerId)) {
      // Participant n'existe plus (exclu ou parti)
      setPausedSpeakerId(null)
      setTimerOffset(0)
      clearPauseStorage()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table.current_speaker_id, participants])

  // Transcription
  const BACKEND_URL_KEY = 'ecclesia_transcription_url'
  const [backendUrl, setBackendUrl] = useState<string>(
    () => localStorage.getItem(BACKEND_URL_KEY) ?? ''
  )
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [urlDraft, setUrlDraft] = useState(backendUrl)

  const { isRecording, connected, start, stop } = useTranscription(
    backendUrl,
    table.join_code,
  )

  function saveBackendUrl() {
    const trimmed = urlDraft.trim().replace(/\/$/, '')
    setBackendUrl(trimmed)
    localStorage.setItem(BACKEND_URL_KEY, trimmed)
    setShowUrlInput(false)
  }

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
    const newOffset = currentElapsed + timerOffset // accumule en cas de double pause
    setTimerOffset(newOffset)
    setPausedSpeakerId(table.current_speaker_id)
    localStorage.setItem(PAUSE_KEY, JSON.stringify({
      pausedSpeakerId: table.current_speaker_id,
      timerOffset: newOffset,
    }))
    safe(endTurn)
  }

  function handleSkip() {
    setTimerOffset(0)
    setPausedSpeakerId(null)
    clearPauseStorage()
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
    clearPauseStorage()
    safe(() => grantFloor(id, 'manual'))
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">

      {/* ── Header ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-slate-950 border-b border-slate-700 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">

          {/* Left: session title + join code + live mini-speaker */}
          <div className="flex items-center gap-3 min-w-0">
            {sessionDocs?.title && (
              <span className="hidden sm:block text-sm font-medium text-slate-400 truncate max-w-[180px]"
                title={sessionDocs.title}>
                {sessionDocs.title}
              </span>
            )}
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
            <DocumentationButton
              session={sessionDocs}
              userPseudo={myParticipant?.pseudo}
              currentTableJoinCode={table.join_code}
              className="text-xs px-3 py-1.5 border border-slate-600 rounded-lg text-slate-300
                hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500"
            />
            <NotesButton
              className="p-1.5 border border-slate-600 rounded-lg text-slate-300
                hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500"
              label={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M16.862 4.487a2.1 2.1 0 1 1 2.97 2.97L7.5 19.79l-4 1 1-4 12.362-12.303z" />
                </svg>
              }
            />
            <AssertionsButton className="text-xs px-3 py-1.5 border border-slate-600 rounded-lg
              text-slate-300 hover:bg-slate-700 transition-colors focus:outline-none
              focus:ring-2 focus:ring-slate-500" />
            <QrCodeButton
              value={`${window.location.origin}${window.location.pathname}#join/${table.join_code}`}
              title={`Rejoindre la table ${table.join_code}`}
              label="QR"
              className="text-xs px-3 py-1.5 border border-slate-600 rounded-lg
                text-slate-300 hover:bg-slate-700 transition-colors focus:outline-none
                focus:ring-2 focus:ring-slate-500"
            />
            <QuestionnaireBtn className="text-xs px-3 py-1.5 border border-slate-600 rounded-lg
              text-slate-300 hover:bg-slate-700 transition-colors focus:outline-none
              focus:ring-2 focus:ring-slate-500" />
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

            {/* ── Outils Modo dropdown ─────────────────────────── */}
            {showUrlInput ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveBackendUrl() }}
                  placeholder="https://xxxx.ngrok.io"
                  className="text-xs px-2 py-1 rounded border border-slate-600 bg-slate-800
                    text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1
                    focus:ring-indigo-500 w-48"
                  autoFocus
                />
                <button
                  onClick={saveBackendUrl}
                  className="text-xs px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                >
                  OK
                </button>
                <button
                  onClick={() => setShowUrlInput(false)}
                  className="text-xs px-2 py-1 border border-slate-600 rounded text-slate-400
                    hover:bg-slate-700"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setShowOutils(v => !v)}
                  aria-expanded={showOutils}
                  className="text-xs px-3 py-1.5 border border-slate-600 rounded-lg text-slate-300
                    hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2
                    focus:ring-slate-500 flex items-center gap-1.5"
                >
                  {isRecording && (
                    <span className="inline-block w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
                  )}
                  Outils Modo
                </button>

                {showOutils && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowOutils(false)} />
                    <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-600
                      rounded-xl shadow-lg py-1 z-50 min-w-[200px]">

                      {/* Transcription */}
                      <button
                        onClick={() => {
                          setShowOutils(false)
                          if (!backendUrl) { setShowUrlInput(true); setUrlDraft(''); return }
                          isRecording ? stop() : start()
                        }}
                        className="flex items-center gap-2 w-full px-4 py-2 text-sm
                          text-slate-200 hover:bg-slate-700 text-left whitespace-nowrap"
                      >
                        {backendUrl ? (
                          <span className={`w-2 h-2 rounded-full shrink-0 ${connected ? 'bg-green-400' : 'bg-slate-500'}`} />
                        ) : (
                          <span className="text-base leading-none">🎙</span>
                        )}
                        {isRecording ? 'Arrêter la transcription' : 'Transcription'}
                      </button>
                      {backendUrl && (
                        <button
                          onClick={() => { setShowOutils(false); setUrlDraft(backendUrl); setShowUrlInput(true) }}
                          className="w-full px-4 py-1.5 text-xs text-slate-500 hover:bg-slate-700
                            hover:text-slate-300 text-left whitespace-nowrap"
                        >
                          Modifier l'URL
                        </button>
                      )}

                      <div className="my-1 border-t border-slate-700" />

                      {/* Historique */}
                      <button
                        onClick={() => { setShowOutils(false); setShowCorrect(true) }}
                        className="w-full px-4 py-2 text-sm text-slate-200 hover:bg-slate-700
                          text-left whitespace-nowrap"
                      >
                        Historique
                      </button>

                      <div className="my-1 border-t border-slate-700" />

                      {/* Forcer / Annuler forçage questionnaire — bouton unique */}
                      <button
                        onClick={() => {
                          setShowOutils(false)
                          if (table.questionnaire_forced_at) {
                            cancelForceQuestionnaire().catch(e => setErr(extractErr(e)))
                          } else {
                            forceQuestionnaire().catch(e => setErr(extractErr(e)))
                          }
                        }}
                        className="w-full px-4 py-2 text-sm text-slate-200 hover:bg-slate-700
                          text-left whitespace-nowrap"
                      >
                        {table.questionnaire_forced_at
                          ? 'Annuler forçage questionnaire'
                          : 'Forcer questionnaire'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            <button
              onClick={leaveTable}
              className="text-xs px-3 py-1.5 border border-slate-600 rounded-lg
                text-slate-300 hover:bg-slate-700 transition-colors focus:outline-none
                focus:ring-2 focus:ring-slate-500"
            >
              Quitter
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
                    onClick={() => { setTimerOffset(0); clearPauseStorage(); safe(endTurnAndAdvance) }}
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

      {/* Séance terminée */}
      {session?.phase === 'closed' && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white gap-4 px-6 text-center">
          <p className="text-2xl font-bold text-gray-800">La séance est terminée</p>
          <p className="text-gray-500">La séance a été clôturée par le superadmin.</p>
          {session.join_code && (
            <a
              href={`#session/${session.join_code}`}
              className="inline-flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700
                text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Voir les résultats →
            </a>
          )}
          <button
            onClick={leaveTable}
            className="inline-flex items-center gap-2 px-5 py-3 bg-gray-100 hover:bg-gray-200
              text-gray-700 text-sm font-semibold rounded-xl transition-colors"
          >
            ← Retour au menu
          </button>
        </div>
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
