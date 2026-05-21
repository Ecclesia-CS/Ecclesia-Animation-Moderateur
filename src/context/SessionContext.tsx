import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  endTurnAndAdvance(): Promise<void>
  addToQueue(participantId: string, queueType: 'long' | 'interactive'): Promise<void>
  removeFromQueue(entryId: string): Promise<void>
  changeQueueType(entryId: string, participantId: string, targetQueueType: 'long' | 'interactive'): Promise<void>
  moveQueueEntry(entryId: string, direction: 'up' | 'down'): Promise<void>
  reorderQueueEntry(entryId: string, newPosition: number): Promise<void>
  correctTurn(turnId: string, params: CorrectTurnParams): Promise<void>
  kickParticipant(participantId: string): Promise<void>
  endSession(): Promise<void>
}

type TableName = 'sessions' | 'participants' | 'queue_entries' | 'speaking_turns'

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

  // Refs for Broadcast and WebSocket monitoring
  const channelRef      = useRef<RealtimeChannel | null>(null)
  const wasDisconnected = useRef(false)

  // ── Load (stable, reused for initial load, polling, reconnect) ──
  const load = useCallback(async () => {
    const [s, p, q, t] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', sessionId).single(),
      supabase.from('participants').select('*').eq('session_id', sessionId),
      supabase.from('queue_entries').select('*').eq('session_id', sessionId),
      supabase.from('speaking_turns').select('*').eq('session_id', sessionId),
    ])
    if (!s.data) { handleEnd(); return }
    setSession(s.data as Session)
    setParticipants((p.data ?? []) as Participant[])
    setQueueEntries((q.data ?? []) as QueueEntry[])
    setSpeakingTurns((t.data ?? []) as SpeakingTurn[])
    setReady(true)
  }, [sessionId, handleEnd])

  // ── Targeted refetch (called by broadcast listener) ───────────
  const refetch = useCallback(async (tables: TableName[]) => {
    await Promise.all(tables.map(async (table) => {
      if (table === 'sessions') {
        const { data } = await supabase.from('sessions').select('*').eq('id', sessionId).single()
        if (data) setSession(data as Session)
      } else if (table === 'participants') {
        const { data } = await supabase.from('participants').select('*').eq('session_id', sessionId)
        setParticipants((data ?? []) as Participant[])
      } else if (table === 'queue_entries') {
        const { data } = await supabase.from('queue_entries').select('*').eq('session_id', sessionId)
        setQueueEntries((data ?? []) as QueueEntry[])
      } else if (table === 'speaking_turns') {
        const { data } = await supabase.from('speaking_turns').select('*').eq('session_id', sessionId)
        setSpeakingTurns((data ?? []) as SpeakingTurn[])
      }
    }))
  }, [sessionId])

  // ── Broadcast helper (bypasses RLS check → instant delivery) ──
  const broadcast = useCallback((tables: TableName[]) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'refresh',
      payload: { tables },
    })
  }, [])

  // ── Initial load ──────────────────────────────────────────────
  useEffect(() => {
    load()
  }, [load])

  // ── Realtime subscriptions ────────────────────────────────────
  useEffect(() => {
    const ch: RealtimeChannel = supabase.channel(`session:${sessionId}`)
    channelRef.current = ch

    // sessions — UPDATE / DELETE
    ch.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
      ({ new: row, old: prev }) => {
        setSession(row as Session)
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

    // Broadcast — instant refresh signal (no RLS check)
    ch.on('broadcast', { event: 'refresh' }, ({ payload }) => {
      const tables = payload?.tables
      if (Array.isArray(tables)) refetch(tables as TableName[])
    })

    // WebSocket monitoring — re-sync on reconnect after dropout
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        if (wasDisconnected.current) {
          wasDisconnected.current = false
          load()
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        wasDisconnected.current = true
      }
    })

    return () => { supabase.removeChannel(ch) }
  }, [sessionId, handleEnd, refetch, load, userId])

  // ── Polling fallback (5 s) — catches missed broadcasts ────────
  useEffect(() => {
    if (!ready) return
    const id = setInterval(() => load(), 5000)
    return () => clearInterval(id)
  }, [ready, load])

  // ── Actions ───────────────────────────────────────────────────

  const rpc = useCallback(async (fn: string, args: object) => {
    const { error } = await supabase.rpc(fn, args)
    if (error) throw error
  }, [])

  const grantFloor = useCallback(
    async (pId: string, src: 'long' | 'interactive' | 'manual') => {
      await rpc('grant_floor', { p_session_id: sessionId, p_participant_id: pId, p_source: src })
      // Mise à jour locale immédiate du speaker (current_turn_started_at arrive via broadcast)
      setSession(prev => prev ? { ...prev, current_speaker_id: pId } : prev)
      if (src !== 'manual') {
        setQueueEntries(prev => prev.filter(
          e => !(e.participant_id === pId && e.queue_type === src)
        ))
      }
      broadcast(['sessions', 'queue_entries', 'speaking_turns'])
    },
    [rpc, sessionId, broadcast],
  )

  const endTurn = useCallback(
    async () => {
      await rpc('end_turn', { p_session_id: sessionId })
      // Mise à jour locale immédiate — l'useEffect d'auto-avancement se déclenche
      // sans attendre le rebond du broadcast (~50–200 ms gagnés)
      setSession(prev => prev
        ? { ...prev, current_speaker_id: null, current_turn_started_at: null }
        : prev)
      broadcast(['sessions', 'speaking_turns', 'queue_entries'])
    },
    [rpc, sessionId, broadcast],
  )

  const addToQueue = useCallback(
    async (pId: string, qt: 'long' | 'interactive') => {
      await rpc('add_to_queue', { p_session_id: sessionId, p_participant_id: pId, p_queue_type: qt })
      // Refetch local immédiat (fire-and-forget) — n'attend pas le rebond du broadcast
      refetch(['queue_entries'])
      broadcast(['queue_entries'])
    },
    [rpc, sessionId, broadcast, refetch],
  )

  const removeFromQueue = useCallback(async (entryId: string) => {
    const { error } = await supabase.from('queue_entries').delete().eq('id', entryId)
    if (error) throw error
    setQueueEntries(prev => prev.filter(e => e.id !== entryId))
    broadcast(['queue_entries'])
  }, [broadcast])

  const changeQueueType = useCallback(
    async (entryId: string, pId: string, targetQt: 'long' | 'interactive') => {
      const { error } = await supabase.from('queue_entries').delete().eq('id', entryId)
      if (error) throw error
      await rpc('add_to_queue', { p_session_id: sessionId, p_participant_id: pId, p_queue_type: targetQt })
      broadcast(['queue_entries'])
    },
    [rpc, sessionId, broadcast],
  )

  const endTurnAsSpeaker = useCallback(
    async () => {
      await rpc('end_turn_as_speaker', { p_session_id: sessionId })
      setSession(prev => prev
        ? { ...prev, current_speaker_id: null, current_turn_started_at: null }
        : prev)
      broadcast(['sessions', 'speaking_turns', 'queue_entries'])
    },
    [rpc, sessionId, broadcast],
  )

  const endTurnAndAdvance = useCallback(
    async () => {
      const { data, error } = await supabase.rpc('end_turn_and_advance', {
        p_session_id: sessionId,
      })
      if (error) throw error
      const result = data as {
        current_speaker_id: string | null
        current_turn_started_at: string | null
        removed_queue_entry_id: string | null
      }
      // Mise à jour locale immédiate avec le timestamp serveur exact (pas de skew timer)
      setSession(prev => prev
        ? { ...prev,
            current_speaker_id: result.current_speaker_id,
            current_turn_started_at: result.current_turn_started_at }
        : prev)
      if (result.removed_queue_entry_id) {
        setQueueEntries(prev => prev.filter(e => e.id !== result.removed_queue_entry_id))
      }
      broadcast(['sessions', 'speaking_turns', 'queue_entries'])
    },
    [sessionId, broadcast],
  )

  const moveQueueEntry = useCallback(
    async (entryId: string, dir: 'up' | 'down') => {
      await rpc('move_queue_entry', { p_entry_id: entryId, p_direction: dir })
      broadcast(['queue_entries'])
    },
    [rpc, broadcast],
  )

  const reorderQueueEntry = useCallback(
    async (entryId: string, newPosition: number) => {
      await rpc('reorder_queue_entry', { p_entry_id: entryId, p_new_position: newPosition })
      broadcast(['queue_entries'])
    },
    [rpc, broadcast],
  )

  const correctTurn = useCallback(
    async (turnId: string, params: CorrectTurnParams) => {
      await rpc('correct_turn', {
        p_turn_id:        turnId,
        p_started_at:     params.started_at     ?? null,
        p_ended_at:       params.ended_at        ?? null,
        p_participant_id: params.participant_id  ?? null,
      })
      broadcast(['speaking_turns'])
    },
    [rpc, broadcast],
  )

  const kickParticipant = useCallback(
    async (pId: string) => {
      await rpc('kick_participant', { p_session_id: sessionId, p_participant_id: pId })
      broadcast(['sessions', 'participants', 'queue_entries', 'speaking_turns'])
    },
    [rpc, sessionId, broadcast],
  )

  const endSession = useCallback(async () => {
    const { error } = await supabase.from('sessions').delete().eq('id', sessionId)
    if (error) throw error
    handleEnd()
  }, [sessionId, handleEnd])

  // ── Render ────────────────────────────────────────────────────

  const myParticipant = useMemo(
    () => participants.find(p => p.id === participantId),
    [participants, participantId],
  )

  const queueLong = useMemo(
    () => queueEntries.filter(e => e.queue_type === 'long').sort((a, b) => a.position - b.position),
    [queueEntries],
  )

  const queueInteractive = useMemo(
    () => queueEntries.filter(e => e.queue_type === 'interactive').sort((a, b) => a.position - b.position),
    [queueEntries],
  )

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
        Chargement de la session…
      </div>
    )
  }

  if (!myParticipant) {
    // Participant row disappeared — redirect to entry
    handleEnd()
    return null
  }

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
        endTurnAndAdvance,
        addToQueue,
        removeFromQueue,
        changeQueueType,
        moveQueueEntry,
        reorderQueueEntry,
        correctTurn,
        kickParticipant,
        endSession,
      }}
    >
      {children}
    </SessionCtx.Provider>
  )
}
