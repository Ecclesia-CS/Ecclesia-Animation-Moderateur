import { useEffect, useRef, useState, type ReactNode } from 'react'
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
import { formatDuration, extractErr, titreSeance } from '../lib/utils'
import { getSessionById } from '../lib/sessions'
import type { QueueEntry, Session, SpeakingTurn } from '../lib/types'
import SpeakerTimer from '../components/SpeakerTimer'
import QueuePanel from '../components/QueuePanel'
import ParticipantsTable from '../components/ParticipantsTable'
import ParticipantsSidebar from '../components/ParticipantsSidebar'
import DocumentationButton from '../components/DocumentationButton'
import { useSessionOrganizationName } from '../lib/organizations'
import { sessionTypeOf } from '../lib/phaseLabels'
import ModeratorToolsButton from '../components/ModeratorToolsButton'
import CampSpeakingTimes from '../components/CampSpeakingTimes'
import NextTopicPanel from '../components/NextTopicPanel'
import FondQuadrille from '../components/FondQuadrille'
import PhaseIndicator from '../components/PhaseIndicator'
import ecclesiaLogo from '../assets/ecclesia-logo.webp'
import { IconeAutreSujet, IconeSujetActuel } from '../components/IconesFiles'
import ModeratorShareRequests from '../components/ModeratorShareRequests'
import TableShareCard from '../components/TableShareCard'

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
    effectivePhase,
  } = useTable()

  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 4 },
  }))

  const collisionDetectionStrategy: CollisionDetection = (args) => {
    // Pas de fallback closestCenter : si le curseur est hors de tout droppable,
    // on ne snap pas vers la première row (ce qui donnait "par défaut en premier").
    const hits = pointerWithin(args)
    // Quand le pointeur survole une ligne, pointerWithin renvoie AUSSI le panneau
    // conteneur (les deux contiennent le pointeur), et le « gagnant » oscille d'une
    // frame à l'autre. Quand le panneau l'emporte, la logique de drop retombe sur
    // « ajouter en dernier » (dstIdx = longueur de la file) → l'entrée arrive en
    // dernier au lieu de la position visée (bug A2). On privilégie donc toujours
    // une ligne (sortable) au panneau : le panneau ne gagne que si aucune ligne
    // n'est réellement sous le pointeur (file vide, ou zone sous la dernière ligne).
    const rowHit = hits.find(h => h.id !== 'queue-long' && h.id !== 'queue-interactive')
    return rowHit ? [rowHit] : hits
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

  const [err, setErr] = useState<string | null>(null)

  // H23 — panorama d'accueil modérateur, affiché une seule fois par table
  const [showModWelcome, setShowModWelcome] = useState(() => !localStorage.getItem('mod_welcome_' + table.id))
  // Chantier 135 — débat d'une association : pas de camps, d'assertions ni de questionnaire.
  const orgName = useSessionOrganizationName(table.session_id)

  // Session docs pour le bouton Documentation
  const [sessionDocs, setSessionDocs] = useState<{
    title: string | null
    doc_info_url: string | null
    doc_summary_url: string | null
    doc_collab_url: string | null
    session_join_code: string | null
    session_type: Session['session_type']
  } | null>(null)

  useEffect(() => {
    if (!table.session_id) return
    getSessionById(table.session_id)
      .then(data => {
        if (data) setSessionDocs({
          title:             data.title,
          doc_info_url:      data.doc_info_url,
          doc_summary_url:   data.doc_summary_url,
          doc_collab_url:    data.doc_collab_url,
          session_join_code: data.join_code,
          session_type:      data.session_type,
        })
      })
      .catch(() => {})
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

  const speaker     = participants.find(p => p.id === table.current_speaker_id)
  const pausedName  = pausedSpeakerId
    ? participants.find(p => p.id === pausedSpeakerId)?.pseudo ?? '…'
    : null

  const sourceLabel: Record<string, string> = {
    long:        'Prendre la parole sur un autre sujet',
    interactive: 'Demander la parole sur le sujet actuel',
    manual:      'Manuel',
  }
  // Icône de la file d'où vient la parole (aucune pour une parole donnée à la main).
  const sourceIcone: Record<string, ReactNode> = {
    long:        <IconeAutreSujet className="h-3.5 w-3.5" />,
    interactive: <IconeSujetActuel className="h-3.5 w-3.5" />,
  }

  // Chantier 168 : l'en-tête n'est plus collant. Quand la carte de l'orateur
  // sort de l'écran (on descend vers les présents ou les temps de parole), un
  // rappel se fixe en haut : nom, chrono et « Terminer ».
  const heroRef = useRef<HTMLDivElement>(null)
  const [heroVisible, setHeroVisible] = useState(true)
  useEffect(() => {
    const el = heroRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(([e]) => setHeroVisible(e.isIntersecting))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

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
        topic_tag:      null,
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

  const titre = session?.title ?? sessionDocs?.title ?? null
  const boutonVerre = `btn-verre rounded-[8px] inline-flex h-10 items-center px-3 text-xs font-semibold text-creme whitespace-nowrap sm:px-4
    focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2 focus-visible:ring-offset-bleu-fonce`
  // Libellés des colonnes de l'en-tête (surtitre du site, sur marine).
  const libelleEnTete = 'text-[10.5px] font-bold uppercase tracking-[0.2em] text-bleu-clair/80'
  const auMicro = !!(speaker && table.current_turn_started_at)

  return (
    <div className="min-h-screen bg-grain bg-slate-950 text-creme">

      {/* ── En-tête : bandeau marine quadrillé, comme la vue participant ── */}
      {/* Ni z-index ni isolation ici (voir FondQuadrille) : Documentation, Outils
          Modo et l'indicateur d'étape y ouvrent des fenêtres fixed. L'en-tête
          n'est plus collant : c'est le rappel de l'orateur, plus bas, qui se fixe
          en haut de l'écran quand on fait défiler la page. */}
      <header className="relative overflow-hidden bg-bleu-fonce">
        <FondQuadrille
          cases={6}
          bande={32}
          fondu="linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.45) 55%, #000 88%)"
        />
        {/* Même vague que la vue participant, dans le bleu plus profond de la page. */}
        <svg
          data-fond-libre
          aria-hidden="true"
          viewBox="0 0 800 40"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-3 w-full sm:h-4"
        >
          <path d="M0 0 Q400 80 800 0 V40 H0 Z" className="fill-slate-950" />
        </svg>
        <div className="relative mx-auto w-full max-w-6xl px-4 pb-8 pt-3 sm:px-6 sm:pt-4 md:pb-11">
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Emblème d'Ecclesia, sauf dans une séance d'association (chantier 135).
                Masqué sous 360 px : les trois boutons prennent toute la ligne. */}
            {!session?.organization_id && (
              <img
                src={ecclesiaLogo}
                alt=""
                aria-hidden="true"
                className="-ml-1 hidden h-10 w-10 drop-shadow-[0_8px_22px_rgba(155,187,226,0.35)] min-[360px]:block"
              />
            )}
            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <DocumentationButton
                session={sessionDocs}
                currentTableJoinCode={table.join_code}
                sessionId={table.session_id}
                className={boutonVerre}
              />
              <ModeratorToolsButton onError={setErr} className={boutonVerre} />
              <button onClick={leaveTable} className={boutonVerre}>
                Quitter
              </button>
            </div>
          </div>

          <div className="mt-5 animate-montee md:mt-6 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:gap-10">
            <div className="min-w-0">
              {session && (
                <PhaseIndicator phase={session.phase} sessionType={sessionTypeOf(session)} tone="marine" />
              )}
              <h1 className={`break-words font-sans font-bold text-creme ${session ? 'mt-3' : ''} ${
                titre
                  ? 'text-2xl leading-[1.15] tracking-[-0.02em] sm:text-3xl md:text-[2.25rem]'
                  : 'text-2xl tracking-[0.16em] sm:text-3xl'
              }`}>
                {titre ? titreSeance(titre) : table.join_code}
              </h1>
            </div>

            {/* Sur téléphone, sous un filet ; sur md+, à droite du titre. */}
            <dl className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-6 border-t border-white/10 pt-3 sm:gap-x-8 md:mt-0 md:min-w-[22rem]">
              <div className="min-w-0">
                <dt className={libelleEnTete}>Vous</dt>
                <dd className="mt-1.5 truncate text-[15px] font-semibold leading-tight text-creme">{myParticipant.pseudo}</dd>
              </div>
              <div>
                <dt className={libelleEnTete}>Rôle</dt>
                <dd className="mt-1.5 text-[15px] font-semibold leading-tight text-creme">Modérateur</dd>
              </div>
              {titre && (
                <div>
                  <dt className={libelleEnTete}>Table</dt>
                  <dd className="mt-1.5 text-[15px] font-semibold leading-tight tracking-[0.08em] text-creme">{table.join_code}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </header>

      {/* ── Rappel de l'orateur, fixé en haut quand sa carte sort de l'écran ── */}
      {auMicro && !heroVisible && (
        <div className="fixed inset-x-0 top-0 z-30 border-b border-amber-300/30 bg-amber-600 shadow-[0_14px_30px_-18px_rgba(0,0,0,0.6)] animate-montee">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2 sm:px-6">
            <BarresParole />
            <span className="min-w-0 truncate text-sm font-semibold text-creme">{speaker!.pseudo}</span>
            <SpeakerTimer
              startedAt={table.current_turn_started_at!}
              offsetMs={timerOffset}
              className="shrink-0 text-sm font-bold tabular-nums text-creme"
            />
            <button
              onClick={() => { setTimerOffset(0); clearPauseStorage(); safe(endTurnAndAdvance) }}
              className="ml-auto inline-flex h-9 shrink-0 items-center rounded-[8px] bg-creme px-3.5 text-xs font-bold text-amber-800 transition-colors hover:bg-white
                focus:outline-none focus-visible:ring-2 focus-visible:ring-creme focus-visible:ring-offset-2 focus-visible:ring-offset-amber-600"
            >
              Terminer
            </button>
          </div>
        </div>
      )}

      {/* ── Body ──────────────────────────────────────────────── */}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetectionStrategy}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleMasterDragEnd}
        onDragCancel={handleDragCancel}
      >
      <main className="relative mx-auto flex w-full max-w-6xl flex-col items-stretch gap-4 px-4 pb-12 pt-5 sm:px-6 lg:flex-row lg:items-start">

        {/* ── Colonne principale ─────────────────────────────── */}
        <div className="w-full flex-1 min-w-0 space-y-4">

        {err && (
          <div className="rounded-[8px] border border-red-400/50 bg-red-900/30 p-3 text-sm text-red-200">
            {err}
          </div>
        )}

        {/* Chantier 162a — sources proposées par la table : à valider avant que
            la table ne les voie, puis la carte actuellement montrée */}
        <ModeratorShareRequests />
        <TableShareCard dark />

        {/* ── Carte de l'orateur : ocre au micro, comme « Vous avez la parole ! » ── */}
        <div ref={heroRef}>
        {pausedSpeakerId && !speaker ? (
          <div className="relative overflow-hidden rounded-[12px] border border-amber-400/40 bg-slate-800/70 animate-montee">
            <FondQuadrille cases={3} grain={false} />
            <div className="relative flex flex-col items-center gap-4 px-5 py-7 text-center">
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300">
                <PauseIcon className="h-4 w-4" />
                Pause
              </p>
              <p className="break-words font-sans text-4xl font-bold leading-tight tracking-[-0.02em] text-creme">{pausedName}</p>
              <p className="-mt-2 text-sm text-slate-300">Le micro est en pause</p>
              <div className="flex flex-col items-center gap-1.5">
                <SessionTimerDisplay
                  speakingTurns={speakingTurns}
                  className="font-sans text-4xl font-bold leading-none tracking-[-0.02em] tabular-nums text-slate-200"
                />
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">Durée de séance</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={handleResume}
                  className="inline-flex h-12 items-center rounded-[8px] bg-amber-600 px-7 text-base font-semibold text-creme transition-colors hover:bg-amber-500
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-800"
                >
                  Reprendre la parole
                </button>
                <button
                  onClick={handleSkip}
                  className="btn-verre inline-flex h-12 items-center rounded-[8px] px-6 text-base font-semibold text-creme
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-800"
                >
                  Passer au suivant
                </button>
              </div>
            </div>
          </div>
        ) : auMicro ? (
          <div
            key={speaker!.id}
            className="relative overflow-hidden rounded-[12px] bg-amber-600 text-creme shadow-[0_30px_60px_-28px_rgba(154,99,18,0.9)] animate-montee"
          >
            <FondQuadrille cases={4} grain={false} traits={0.12} />
            <div className="relative flex flex-col items-center gap-3 px-5 py-7 text-center sm:py-8">
              <div className="flex items-center gap-3">
                <BarresParole />
                <span className="inline-flex items-center gap-2 rounded-[6px] bg-amber-800/45 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-creme">
                  {sourceIcone[currentTurn?.source ?? 'manual']}
                  {sourceLabel[currentTurn?.source ?? 'manual']}
                </span>
              </div>
              <p className="max-w-full break-words font-sans text-4xl font-bold leading-tight tracking-[-0.02em] sm:text-5xl">
                {speaker!.pseudo}
              </p>
              <div className="flex flex-wrap items-end justify-center gap-x-10 gap-y-3">
                <SpeakerTimer
                  startedAt={table.current_turn_started_at!}
                  offsetMs={timerOffset}
                  className="font-sans text-7xl font-bold leading-none tracking-[-0.03em] tabular-nums sm:text-8xl"
                />
                <div className="flex flex-col items-center gap-1.5 pb-1">
                  <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-creme">Séance</span>
                  <SessionTimerDisplay
                    speakingTurns={speakingTurns}
                    className="font-sans text-4xl font-bold leading-none tracking-[-0.02em] tabular-nums text-creme/90 sm:text-5xl"
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={handlePause}
                  className="inline-flex h-12 items-center gap-2 rounded-[8px] border border-creme/45 bg-creme/10 px-5 text-sm font-semibold text-creme transition-colors hover:bg-creme/20
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-creme focus-visible:ring-offset-2 focus-visible:ring-offset-amber-600"
                >
                  <PauseIcon className="h-4 w-4" />
                  Pause
                </button>
                <button
                  onClick={() => { setTimerOffset(0); clearPauseStorage(); safe(endTurnAndAdvance) }}
                  className="inline-flex h-12 items-center rounded-[8px] bg-creme px-7 text-base font-bold text-amber-800 transition-colors hover:bg-white
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-creme focus-visible:ring-offset-2 focus-visible:ring-offset-amber-600"
                >
                  Terminer la prise de parole
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-[12px] border border-white/10 bg-slate-800/50 animate-montee">
            <FondQuadrille cases={3} grain={false} />
            <div className="relative px-5 py-9 text-center">
              {isGranting ? (
                <p className="text-lg text-slate-300">Attribution en cours…</p>
              ) : (
                <>
                  <p className="font-sans text-3xl font-bold tracking-[-0.02em] text-slate-200 sm:text-4xl">Micro libre</p>
                  <p className="mt-1 text-sm text-slate-300">Aucun orateur en cours</p>
                </>
              )}
              <SessionTimerDisplay
                speakingTurns={speakingTurns}
                className="mt-5 block font-sans text-5xl font-bold leading-none tracking-[-0.02em] tabular-nums text-slate-300"
              />
              <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">Durée de séance</p>
            </div>
          </div>
        )}
        </div>

        {/* ── Files côte-à-côte ──────────────────────────────── */}
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          <div className="animate-montee [animation-delay:80ms]">
            <QueuePanel
              title="File d'attente : prendre la parole sur un autre sujet"
              entries={localLong}
              queueType="long"
              participants={participants}
              accent="indigo"
              droppableId="queue-long"
              ghostId={GHOST_ID}
            />
          </div>
          <div className="animate-montee [animation-delay:140ms]">
            <QueuePanel
              title="Demander la parole sur le sujet actuel"
              subtitle="Pour répondre à ce qui est dit actuellement uniquement"
              entries={localInteractive}
              queueType="interactive"
              participants={participants}
              accent="teal"
              droppableId="queue-interactive"
              ghostId={GHOST_ID}
            />
          </div>
        </div>

        {/* ── Sujet suivant (chantier 131) ───────────────────── */}
        <div className="animate-montee [animation-delay:200ms]">
          <NextTopicPanel />
        </div>

        {/* ── Temps de parole par camp idéologique (chantier 94) ── */}
        {table.session_id && (
          <CampSpeakingTimes tableId={table.id} isModerator={isModerator} />
        )}

        {/* ── Participants stats ─────────────────────────────── */}
        <div className="animate-montee [animation-delay:260ms]">
          <ParticipantsTable />
        </div>

        </div>{/* end colonne principale */}

        {/* ── Sidebar participants ───────────────────────────── */}
        <ParticipantsSidebar
          participants={participants}
          currentSpeakerId={table.current_speaker_id}
          queueLong={queueLong}
          queueInteractive={queueInteractive}
          tableId={table.id}
          isModerator={isModerator}
          className={auMicro && !heroVisible ? 'lg:top-[4.5rem]' : 'lg:top-4'}
        />

      </main>

      {/* ── DragOverlay : bulle qui suit le curseur pendant le drag ── */}
      <DragOverlay dropAnimation={null}>
        {activeDragPseudo && (
          <div className="rounded-[8px] px-4 py-2 bg-slate-700 text-creme shadow-xl
            text-sm font-semibold border border-bleu-clair/40 opacity-95 cursor-grabbing
            pointer-events-none select-none whitespace-nowrap">
            {activeDragPseudo}
          </div>
        )}
      </DragOverlay>

      </DndContext>

      {/* H23 — panorama d'accueil modérateur, affiché une seule fois par table */}
      {showModWelcome && (
        <div className="fixed inset-0 bg-bleu-fonce/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-sm shadow-2xl flex flex-col overflow-hidden rounded-[12px] text-gray-900 ring-1 ring-white/10 animate-entree">
            <div className="relative overflow-hidden bg-bleu-fonce px-6 py-5 text-center">
              <FondQuadrille cases={3} />
              <div className="relative">
                <p className="text-2xl mb-1">🧑‍⚖️</p>
                <h2 className="font-sans text-xl font-bold tracking-[-0.01em] text-creme">Bienvenue, modérateur</h2>
                <span aria-hidden="true" className="filet-spectre mx-auto mt-3 block w-12" />
              </div>
            </div>
            <div className="px-6 py-5 space-y-4 text-sm text-anthracite/80 max-h-[60vh] overflow-y-auto">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-indigo-50 text-lg">🖐️</span>
                <div>
                  <p className="font-semibold text-anthracite">Glisser-déposer</p>
                  <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">Fais glisser un participant dans une file pour lui donner la parole, ou réordonne les files en glissant les lignes.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-amber-50 text-lg">▶️</span>
                <div>
                  <p className="font-semibold text-anthracite">Donner ou retirer la parole</p>
                  <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">Les files « Prendre la parole sur un autre sujet » et « Demander la parole sur le sujet actuel » gèrent l'ordre. La parole passe automatiquement à la fin d'un tour.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-sable text-lg">🔧</span>
                <div>
                  <p className="font-semibold text-anthracite">Outils Modo</p>
                  <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">{orgName
                    ? "QR code de la table, ajout d'une personne sans téléphone, codes participants, historique et notes. Seule la documentation reste accessible depuis un bouton séparé, en haut de la page."
                    : 'Camps (composition idéologique de ta table et assertions représentatives des différents avis), assertions votées, QR code de la table, historique, forçage du questionnaire, notes et questionnaire post-débat. Seule la documentation reste accessible depuis un bouton séparé, en haut de la page.'}</p>
                </div>
              </div>
            </div>
            <div className="px-6 pb-6">
              <button
                onClick={() => {
                  localStorage.setItem('mod_welcome_' + table.id, '1')
                  setShowModWelcome(false)
                }}
                className="w-full rounded-[8px] py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2"
              >
                C'est parti !
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Séance terminée (chantier 89 : dès post_voting, le débat est fini).
          Chantier 112 — masqué tant que le questionnaire forcé est actif, sinon il
          recouvre "Outils Modo" (z-50 lui aussi) et le modérateur ne peut plus l'ouvrir.
          Chantier 168 : plein écran marine quadrillé, comme la vue participant. */}
      {/* Chantier 161 — fin de la table seule (« Terminer le débat de ma table ») :
          le modérateur sort avec les autres, tout de suite ; le masquage du 112 ne
          vaut que pour la fin de séance, où il peut encore devoir annuler le forçage. */}
      {session && (effectivePhase === 'closed' || effectivePhase === 'post_voting') &&
        (session.phase === 'debating' ||
          !(table.questionnaire_forced_at && new Date(table.questionnaire_forced_at).getTime() + 3600000 > Date.now())) && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-bleu-fonce px-6 text-center text-creme">
          <FondQuadrille cases={14} />
          <div className="relative flex flex-col items-center gap-5 animate-montee">
            <PhaseIndicator phase={effectivePhase} sessionType={sessionTypeOf(session)} tone="marine" />
            <p className="font-sans text-4xl font-bold tracking-[-0.02em] leading-[1.05] sm:text-5xl">{session.phase === 'debating' ? 'Le débat de votre table est terminé' : 'La séance est terminée'}</p>
            <span aria-hidden="true" className="filet-spectre block w-16" />
            <p className="text-base text-creme/75">{session.phase === 'debating'
                ? "Tant que la séance est en débat, vous pourrez le rouvrir depuis l'écran suivant."
                : 'La séance a été clôturée par le superadmin.'}</p>
            <div className="mt-3 flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
              {session.join_code && (
                <button
                  onClick={() => {
                    window.location.hash = `#session/${session.join_code}`
                    leaveTable()
                  }}
                  className="btn-verre btn-verre-primaire rounded-[8px] inline-flex items-center justify-center px-7 py-3.5 text-sm font-bold tracking-tight text-creme
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2 focus-visible:ring-offset-bleu-fonce"
                >
                  {/* Débat simple : pas de résultats, le routeur mène au questionnaire puis à l'écran de fin. */}
                  {sessionTypeOf(session) === 'debate' ? 'Continuer' : 'Voir les résultats'}
                </button>
              )}
              <button
                onClick={leaveTable}
                className="btn-verre rounded-[8px] inline-flex items-center justify-center px-7 py-3.5 text-sm font-bold tracking-tight text-creme
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2 focus-visible:ring-offset-bleu-fonce"
              >
                Retour au menu
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// ── Barres « au micro » (les mêmes que « Vous avez la parole ! ») ──

function BarresParole() {
  return (
    <span aria-hidden="true" className="flex h-5 shrink-0 items-end gap-[3px]">
      {[11, 18, 14, 20].map((h, i) => (
        <span
          key={i}
          className="block w-[3px] origin-bottom bg-creme animate-onde"
          style={{ height: h, animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
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
