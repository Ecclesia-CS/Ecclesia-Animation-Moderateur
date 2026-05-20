import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Participant, QueueEntry, Session, SpeakingTurn } from '../lib/types'

// ── Public types ───────────────────────────────────────────────

export interface CorrectTurnParams {
  started_at?: string
  ended_at?: string
  participant_id?: string
}

interface SessionCtxValue {
  session: Session
  participants: Participant[]
  queueLong: QueueEntry[]
  queueInteractive: QueueEntry[]
  speakingTurns: SpeakingTurn[]
  myParticipant: Participant
  isModerator: boolean

  leaveSession(): void
  grantFloor(participantId: string, source: 'long' | 'interactive' | 'manual'): Promise<void>
  endTurn(): Promise<void>
  endTurnAsSpeaker(): Promise<void>
  addToQueue(participantId: string, queueType: 'long' | 'interactive'): Promise<void>
  removeFromQueue(entryId: string): Promise<void>
  moveQueueEntry(entryId: string, direction: 'up' | 'down'): Promise<void>
  reorderQueueEntry(entryId: string, newPosition: number): Promise<void>
  correctTurn(turnId: string, params: CorrectTurnParams): Promise<void>
  endSession(): Promise<void>
}

// ── Context ────────────────────────────────────────────────────

const SessionCtx = createContext<SessionCtxValue | null>(null)

export function useSession(): SessionCtxValue {
  const ctx = useContext(SessionCtx)
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>')
  return ctx
}

// ── Provider ───────────────────────────────────────────────────

interface Props {
  sessionId: string
  participantId: string
  userId: string
  initialIsModerator: boolean
  onSessionEnd(): void
  children: ReactNode
}

export function SessionProvider({
  sessionId,
  participantId,
  userId,
  initialIsModerator,
  onSessionEnd,
  children,
}: Props) {
  const [session, setSession] = useState<Session | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [queueEntries, setQueueEntries] = useState<QueueEntry[]>([])
  const [speakingTurns, setSpeakingTurns] = useState<SpeakingTurn[]>([])
  const [ready, setReady] = useState(false)
  const [isModerator, setIsModerator] = useState(initialIsModerator)

  // Guard against double-calling onSessionEnd
  const endedRef = useRef(false)
  const handleEnd = useCallback(() => {
    if (endedRef.current) return
    endedRef.current = true
    onSessionEnd()
  }, [onSessionEnd])

  // ── Initial load ─────────────────────────────────────────────
  useEffect(() => {
    let mounted = true
    async function load() {
      const [s, p, q, t] = await Promise.all([
        supabase.from('sessions').select('*').eq('id', sessionId).single(),
        supabase.from('participants').select('*').eq('session_id', sessionId),
        supabase.from('queue_entries').select('*').eq('session_id', sessionId),
        supabase.from('speaking_turns').select('*').eq('session_id', sessionId),
      ])
      if (!mounted) return
      if (!s.data) { handleEnd(); return }
      setSession(s.data as Session)
      setParticipants((p.data ?? []) as Participant[])
      setQueueEntries((q.data ?? []) as QueueEntry[])
      setSpeakingTurns((t.data ?? []) as SpeakingTurn[])
      setReady(true)
    }
    load()
    return () => { mounted = false }
  }, [sessionId, handleEnd])

  // ── Realtime subscriptions ────────────────────────────────────
  useEffect(() => {
    const ch: RealtimeChannel = supabase.channel(`session:${sessionId}`)

    // sessions — UPDATE / DELETE
    ch.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
      ({ new: row, old: prev }) => {
        setSession(row as Session)
        // Detect moderator reclaim: created_by changed (REPLICA IDENTITY FULL provides old row)
        if ((prev as Session).created_by !== (row as Session).created_by) {
          setIsModerator((row as Session).created_by === userId)
        }
      },
    )
    ch.on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
      () => handleEnd(),
    )

    // participants
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'participants', filter: `session_id=eq.${sessionId}` },
      ({ eventType, new: n, old: o }) => {
        if (eventType === 'INSERT')
          setParticipants(prev => [...prev, n as Participant])
        else if (eventType === 'UPDATE')
          setParticipants(prev => prev.map(x => x.id === (n as Participant).id ? n as Participant : x))
        else if (eventType === 'DELETE')
          setParticipants(prev => prev.filter(x => x.id !== (o as Participant).id))
      },
    )

    // queue_entries
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'queue_entries', filter: `session_id=eq.${sessionId}` },
      ({ eventType, new: n, old: o }) => {
        if (eventType === 'INSERT')
          setQueueEntries(prev => [...prev, n as QueueEntry])
        else if (eventType === 'UPDATE')
          setQueueEntries(prev => prev.map(x => x.id === (n as QueueEntry).id ? n as QueueEntry : x))
        else if (eventType === 'DELETE')
          setQueueEntries(prev => prev.filter(x => x.id !== (o as QueueEntry).id))
      },
    )

    // speaking_turns (INSERT + UPDATE only; no DELETE expected)
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'speaking_turns', filter: `session_id=eq.${sessionId}` },
      ({ eventType, new: n }) => {
        if (eventType === 'INSERT')
          setSpeakingTurns(prev => [...prev, n as SpeakingTurn])
        else if (eventType === 'UPDATE')
          setSpeakingTurns(prev => prev.map(x => x.id === (n as SpeakingTurn).id ? n as SpeakingTurn : x))
      },
    )

    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [sessionId, handleEnd])

  // ── Actions ───────────────────────────────────────────────────

  const rpc = useCallback(async (fn: string, args: object) => {
    const { error } = await supabase.rpc(fn, args)
    if (error) throw error
  }, [])

  const grantFloor = useCallback(
    (pId: string, src: 'long' | 'interactive' | 'manual') =>
      rpc('grant_floor', { p_session_id: sessionId, p_participant_id: pId, p_source: src }),
    [rpc, sessionId],
  )

  const endTurn = useCallback(
    () => rpc('end_turn', { p_session_id: sessionId }),
    [rpc, sessionId],
  )

  const addToQueue = useCallback(
    (pId: string, qt: 'long' | 'interactive') =>
      rpc('add_to_queue', { p_session_id: sessionId, p_participant_id: pId, p_queue_type: qt }),
    [rpc, sessionId],
  )

  const removeFromQueue = useCallback(async (entryId: string) => {
    const { error } = await supabase.from('queue_entries').delete().eq('id', entryId)
    if (error) throw error
  }, [])

  const endTurnAsSpeaker = useCallback(
    () => rpc('end_turn_as_speaker', { p_session_id: sessionId }),
    [rpc, sessionId],
  )

  const moveQueueEntry = useCallback(
    (entryId: string, dir: 'up' | 'down') =>
      rpc('move_queue_entry', { p_entry_id: entryId, p_direction: dir }),
    [rpc],
  )

  const reorderQueueEntry = useCallback(
    (entryId: string, newPosition: number) =>
      rpc('reorder_queue_entry', { p_entry_id: entryId, p_new_position: newPosition }),
    [rpc],
  )

  const correctTurn = useCallback(
    (turnId: string, params: CorrectTurnParams) =>
      rpc('correct_turn', {
        p_turn_id:        turnId,
        p_started_at:     params.started_at     ?? null,
        p_ended_at:       params.ended_at        ?? null,
        p_participant_id: params.participant_id  ?? null,
      }),
    [rpc],
  )

  const endSession = useCallback(async () => {
    const { error } = await supabase.from('sessions').delete().eq('id', sessionId)
    if (error) throw error
    handleEnd()
  }, [sessionId, handleEnd])

  // ── Render ────────────────────────────────────────────────────

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
        Chargement de la session…
      </div>
    )
  }

  const myParticipant = participants.find(p => p.id === participantId)
  if (!myParticipant) {
    // Participant row disappeared — redirect to entry
    handleEnd()
    return null
  }

  const queueLong = queueEntries
    .filter(e => e.queue_type === 'long')
    .sort((a, b) => a.position - b.position)

  const queueInteractive = queueEntries
    .filter(e => e.queue_type === 'interactive')
    .sort((a, b) => a.position - b.position)

  return (
    <SessionCtx.Provider
      value={{
        session: session!,
        participants,
        queueLong,
        queueInteractive,
        speakingTurns,
        myParticipant,
        isModerator,
        leaveSession: handleEnd,
        grantFloor,
        endTurn,
        endTurnAsSpeaker,
        addToQueue,
        removeFromQueue,
        moveQueueEntry,
        reorderQueueEntry,
        correctTurn,
        endSession,
      }}
    >
      {children}
    </SessionCtx.Provider>
  )
}
