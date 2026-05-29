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
import type { Participant, QueueEntry, Table, SpeakingTurn, Session } from '../lib/types'

// ── Public types ───────────────────────────────────────────────

export interface CorrectTurnParams {
  started_at?: string
  ended_at?: string
  participant_id?: string
}

interface TableCtxValue {
  table: Table
  session: Session | null
  participants: Participant[]
  queueLong: QueueEntry[]
  queueInteractive: QueueEntry[]
  speakingTurns: SpeakingTurn[]
  myParticipant: Participant
  isModerator: boolean

  leaveTable(): void
  grantFloor(participantId: string, source: 'long' | 'interactive' | 'manual'): Promise<void>
  endTurn(): Promise<void>
  endTurnAsSpeaker(): Promise<void>
  endTurnAndAdvance(): Promise<void>
  addToQueue(participantId: string, queueType: 'long' | 'interactive', position?: number): Promise<void>
  removeFromQueue(entryId: string): Promise<void>
  changeQueueType(entryId: string, participantId: string, targetQueueType: 'long' | 'interactive', position?: number): Promise<void>
  moveQueueEntry(entryId: string, direction: 'up' | 'down'): Promise<void>
  reorderQueueEntry(entryId: string, newPosition: number): Promise<void>
  correctTurn(turnId: string, params: CorrectTurnParams): Promise<void>
  kickParticipant(participantId: string): Promise<void>
  endTable(): Promise<void>
  forceQuestionnaire(): Promise<void>
  cancelForceQuestionnaire(): Promise<void>
}

type TableName = 'tables' | 'participants' | 'queue_entries' | 'speaking_turns'

// ── Context ────────────────────────────────────────────────────

const TableCtx = createContext<TableCtxValue | null>(null)

export function useTable(): TableCtxValue {
  const ctx = useContext(TableCtx)
  if (!ctx) throw new Error('useTable must be used inside <TableProvider>')
  return ctx
}

// ── Provider ───────────────────────────────────────────────────

interface Props {
  tableId: string
  participantId: string
  userId: string
  initialIsModerator: boolean
  onTableEnd(): void
  children: ReactNode
}

export function TableProvider({
  tableId,
  participantId,
  userId,
  initialIsModerator,
  onTableEnd,
  children,
}: Props) {
  const [table, setTable] = useState<Table | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [queueEntries, setQueueEntries] = useState<QueueEntry[]>([])
  const [speakingTurns, setSpeakingTurns] = useState<SpeakingTurn[]>([])
  const [ready, setReady] = useState(false)
  const [isModerator, setIsModerator] = useState(initialIsModerator)

  // Guard against double-calling onTableEnd
  const endedRef = useRef(false)
  const handleEnd = useCallback(() => {
    if (endedRef.current) return
    endedRef.current = true
    onTableEnd()
  }, [onTableEnd])

  // Refs for Broadcast and WebSocket monitoring
  const channelRef      = useRef<RealtimeChannel | null>(null)
  const wasDisconnected = useRef(false)

  // ── Load (stable, reused for initial load, polling, reconnect) ──
  const load = useCallback(async () => {
    const [s, p, q, t] = await Promise.all([
      supabase.from('tables').select('*').eq('id', tableId).single(),
      supabase.from('participants').select('*').eq('table_id', tableId),
      supabase.from('queue_entries').select('*').eq('table_id', tableId),
      supabase.from('speaking_turns').select('*').eq('table_id', tableId),
    ])
    if (!s.data) { handleEnd(); return }
    const tbl = s.data as Table
    setTable(tbl)
    setParticipants((p.data ?? []) as Participant[])
    setQueueEntries((q.data ?? []) as QueueEntry[])
    setSpeakingTurns((t.data ?? []) as SpeakingTurn[])
    if (tbl.session_id) {
      const { data: sess } = await supabase.from('sessions').select('*').eq('id', tbl.session_id).maybeSingle()
      setSession(sess as Session | null)
    } else {
      setSession(null)
    }
    setReady(true)
  }, [tableId, handleEnd])

  // ── Targeted refetch (called by broadcast listener) ───────────
  const refetch = useCallback(async (tables: TableName[]) => {
    await Promise.all(tables.map(async (tbl) => {
      if (tbl === 'tables') {
        const { data } = await supabase.from('tables').select('*').eq('id', tableId).single()
        if (data) setTable(data as Table)
      } else if (tbl === 'participants') {
        const { data } = await supabase.from('participants').select('*').eq('table_id', tableId)
        setParticipants((data ?? []) as Participant[])
      } else if (tbl === 'queue_entries') {
        const { data } = await supabase.from('queue_entries').select('*').eq('table_id', tableId)
        setQueueEntries((data ?? []) as QueueEntry[])
      } else if (tbl === 'speaking_turns') {
        const { data } = await supabase.from('speaking_turns').select('*').eq('table_id', tableId)
        setSpeakingTurns((data ?? []) as SpeakingTurn[])
      }
    }))
  }, [tableId])

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
    const ch: RealtimeChannel = supabase.channel(`table:${tableId}`)
    channelRef.current = ch

    // tables — UPDATE / DELETE
    ch.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'tables', filter: `id=eq.${tableId}` },
      ({ new: row, old: prev }) => {
        setTable(row as Table)
        if ((prev as Table).created_by !== (row as Table).created_by) {
          setIsModerator((row as Table).created_by === userId)
        }
      },
    )
    ch.on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'tables', filter: `id=eq.${tableId}` },
      () => handleEnd(),
    )

    // participants
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'participants', filter: `table_id=eq.${tableId}` },
      ({ eventType, new: n, old: o }) => {
        if (eventType === 'INSERT')
          // Dédoublonner : un INSERT Realtime peut arriver pour un upsert (ON CONFLICT DO UPDATE)
          setParticipants(prev =>
            prev.some(p => p.id === (n as Participant).id)
              ? prev.map(p => p.id === (n as Participant).id ? n as Participant : p)
              : [...prev, n as Participant]
          )
        else if (eventType === 'UPDATE')
          setParticipants(prev => prev.map(x => x.id === (n as Participant).id ? n as Participant : x))
        else if (eventType === 'DELETE')
          setParticipants(prev => prev.filter(x => x.id !== (o as Participant).id))
      },
    )

    // queue_entries
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'queue_entries', filter: `table_id=eq.${tableId}` },
      ({ eventType, new: n, old: o }) => {
        if (eventType === 'INSERT')
          setQueueEntries(prev =>
            prev.some(e => e.id === (n as QueueEntry).id)
              ? prev.map(e => e.id === (n as QueueEntry).id ? n as QueueEntry : e)
              : [...prev, n as QueueEntry]
          )
        else if (eventType === 'UPDATE')
          setQueueEntries(prev => prev.map(x => x.id === (n as QueueEntry).id ? n as QueueEntry : x))
        else if (eventType === 'DELETE')
          setQueueEntries(prev => prev.filter(x => x.id !== (o as QueueEntry).id))
      },
    )

    // speaking_turns (INSERT + UPDATE only; no DELETE expected)
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'speaking_turns', filter: `table_id=eq.${tableId}` },
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
  }, [tableId, handleEnd, refetch, load, userId])

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
      await rpc('grant_floor', { p_table_id: tableId, p_participant_id: pId, p_source: src })
      // Mise à jour locale immédiate du speaker (current_turn_started_at arrive via broadcast)
      setTable(prev => prev ? { ...prev, current_speaker_id: pId } : prev)
      if (src !== 'manual') {
        setQueueEntries(prev => prev.filter(
          e => !(e.participant_id === pId && e.queue_type === src)
        ))
      }
      broadcast(['tables', 'queue_entries', 'speaking_turns'])
    },
    [rpc, tableId, broadcast],
  )

  const endTurn = useCallback(
    async () => {
      await rpc('end_turn', { p_table_id: tableId })
      // Mise à jour locale immédiate — l'useEffect d'auto-avancement se déclenche
      // sans attendre le rebond du broadcast (~50–200 ms gagnés)
      setTable(prev => prev
        ? { ...prev, current_speaker_id: null, current_turn_started_at: null }
        : prev)
      broadcast(['tables', 'speaking_turns', 'queue_entries'])
    },
    [rpc, tableId, broadcast],
  )

  const addToQueue = useCallback(
    async (pId: string, qt: 'long' | 'interactive', position?: number) => {
      const args = position !== undefined
        ? { p_table_id: tableId, p_participant_id: pId, p_queue_type: qt, p_position: position }
        : { p_table_id: tableId, p_participant_id: pId, p_queue_type: qt }
      await rpc('add_to_queue', args)
      // Refetch local immédiat (fire-and-forget) — n'attend pas le rebond du broadcast
      refetch(['queue_entries'])
      broadcast(['queue_entries'])
    },
    [rpc, tableId, broadcast, refetch],
  )

  const removeFromQueue = useCallback(async (entryId: string) => {
    const { error } = await supabase.from('queue_entries').delete().eq('id', entryId)
    if (error) throw error
    setQueueEntries(prev => prev.filter(e => e.id !== entryId))
    broadcast(['queue_entries'])
  }, [broadcast])

  const changeQueueType = useCallback(
    async (entryId: string, pId: string, targetQt: 'long' | 'interactive', position?: number) => {
      const { error } = await supabase.from('queue_entries').delete().eq('id', entryId)
      if (error) throw error
      const args = position !== undefined
        ? { p_table_id: tableId, p_participant_id: pId, p_queue_type: targetQt, p_position: position }
        : { p_table_id: tableId, p_participant_id: pId, p_queue_type: targetQt }
      await rpc('add_to_queue', args)
      broadcast(['queue_entries'])
    },
    [rpc, tableId, broadcast],
  )

  const endTurnAsSpeaker = useCallback(
    async () => {
      await rpc('end_turn_as_speaker', { p_table_id: tableId })
      setTable(prev => prev
        ? { ...prev, current_speaker_id: null, current_turn_started_at: null }
        : prev)
      broadcast(['tables', 'speaking_turns', 'queue_entries'])
    },
    [rpc, tableId, broadcast],
  )

  const endTurnAndAdvance = useCallback(
    async () => {
      const { data, error } = await supabase.rpc('end_turn_and_advance', {
        p_table_id: tableId,
      })
      if (error) throw error
      const result = data as {
        current_speaker_id: string | null
        current_turn_started_at: string | null
        removed_queue_entry_id: string | null
      }
      // Mise à jour locale immédiate avec le timestamp serveur exact (pas de skew timer)
      setTable(prev => prev
        ? { ...prev,
            current_speaker_id: result.current_speaker_id,
            current_turn_started_at: result.current_turn_started_at }
        : prev)
      if (result.removed_queue_entry_id) {
        setQueueEntries(prev => prev.filter(e => e.id !== result.removed_queue_entry_id))
      }
      broadcast(['tables', 'speaking_turns', 'queue_entries'])
    },
    [tableId, broadcast],
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
      await rpc('kick_participant', { p_table_id: tableId, p_participant_id: pId })
      broadcast(['tables', 'participants', 'queue_entries', 'speaking_turns'])
    },
    [rpc, tableId, broadcast],
  )

  const endTable = useCallback(async () => {
    const { error } = await supabase.from('tables').delete().eq('id', tableId)
    if (error) throw error
    handleEnd()
  }, [tableId, handleEnd])

  const forceQuestionnaire = useCallback(async () => {
    const { error } = await supabase
      .from('tables')
      .update({ questionnaire_forced_at: new Date().toISOString() })
      .eq('id', tableId)
    if (error) throw error
    broadcast(['tables'])
  }, [tableId, broadcast])

  const cancelForceQuestionnaire = useCallback(async () => {
    const { error } = await supabase
      .from('tables')
      .update({ questionnaire_forced_at: null })
      .eq('id', tableId)
    if (error) throw error
    broadcast(['tables'])
  }, [tableId, broadcast])

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
    <TableCtx.Provider
      value={{
        table: table!,
        session,
        participants,
        queueLong,
        queueInteractive,
        speakingTurns,
        myParticipant,
        isModerator,
        leaveTable: handleEnd,
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
        endTable,
        forceQuestionnaire,
        cancelForceQuestionnaire,
      }}
    >
      {children}
    </TableCtx.Provider>
  )
}
