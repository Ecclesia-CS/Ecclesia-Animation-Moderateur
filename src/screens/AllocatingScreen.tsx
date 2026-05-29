import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getVoteResults, getMyTableAssignment } from '../lib/voting'
import { tableStore } from '../lib/storage'
import { extractErr } from '../lib/utils'
import type { TableResult } from '../lib/supabase'
import type { Session, SessionMember, VoteResult } from '../lib/types'
import VoteResultsSummary from '../components/voting/VoteResultsSummary'
import TableAssignmentCard from '../components/voting/TableAssignmentCard'
import type { AssignmentWithTable } from '../components/voting/TableAssignmentCard'

interface AllocatingScreenProps {
  session: Session
  member: SessionMember
}

export default function AllocatingScreen({ session, member }: AllocatingScreenProps) {
  const [currentSession,    setCurrentSession]    = useState<Session>(session)
  const [voteResults,       setVoteResults]       = useState<VoteResult[]>([])
  const [resultsLoading,    setResultsLoading]    = useState(true)
  const [assignment,        setAssignment]        = useState<AssignmentWithTable | null>(null)
  const [assignmentLoading, setAssignmentLoading] = useState(true)
  const [joinLoading,       setJoinLoading]       = useState(false)
  const [joinError,         setJoinError]         = useState<string | null>(null)
  const [joined,            setJoined]            = useState(false)

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // ── Fetch on mount ────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      // Fetch vote results + table assignment in parallel
      const [resultsRes, assignmentRes] = await Promise.allSettled([
        getVoteResults(session.id),
        getMyTableAssignment(session.id),
      ])

      if (resultsRes.status === 'fulfilled') {
        setVoteResults(resultsRes.value)
      }
      setResultsLoading(false)

      if (assignmentRes.status === 'fulfilled' && assignmentRes.value) {
        setAssignment(assignmentRes.value as AssignmentWithTable)
      }
      setAssignmentLoading(false)
    }

    load()
  }, [session.id, member.id])

  // ── Realtime ──────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`allocating:${session.id}`)
      // Watch for table assignment INSERT for this member
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'table_assignments',
          filter: `session_id=eq.${session.id}`,
        },
        payload => {
          const row = payload.new as { member_id: string }
          if (row.member_id !== member.id) return
          getMyTableAssignment(session.id)
            .then(data => { if (data) setAssignment(data as AssignmentWithTable) })
            .catch(() => { /* ignore */ })
        },
      )
      // Watch for table assignment UPDATE (e.g. table_id set when table is created)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'table_assignments',
          filter: `session_id=eq.${session.id}`,
        },
        payload => {
          const row = payload.new as { member_id: string }
          if (row.member_id !== member.id) return
          getMyTableAssignment(session.id)
            .then(data => { if (data) setAssignment(data as AssignmentWithTable) })
            .catch(() => { /* ignore */ })
        },
      )
      // Watch for session phase changes (allocating → debating, etc.)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${session.id}`,
        },
        payload => {
          setCurrentSession(payload.new as Session)
        },
      )
      .subscribe()

    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [session.id, member.id])

  // ── Re-fetch assignment when phase → debating ────────────────────
  // Safety net : if the Realtime UPDATE on table_assignments was missed
  // (e.g. before REPLICA IDENTITY FULL was applied), the transition to
  // debating is the last chance to pull fresh data.
  useEffect(() => {
    if (currentSession.phase !== 'debating') return
    getMyTableAssignment(session.id)
      .then(data => { if (data) setAssignment(data as AssignmentWithTable) })
      .catch(() => { /* ignore */ })
  }, [currentSession.phase, session.id])

  // ── Polling de secours quand debating + pas encore de join_code ──
  // Si Realtime a été manqué et que la table n'est toujours pas rattachée,
  // on re-fetch toutes les 5 s jusqu'à obtenir le code.
  useEffect(() => {
    if (currentSession.phase !== 'debating') return
    if (assignment?.tables?.join_code) return

    const interval = setInterval(async () => {
      const data = await getMyTableAssignment(session.id).catch(() => null)
      if (data) setAssignment(data as AssignmentWithTable)
    }, 5000)

    return () => clearInterval(interval)
  }, [currentSession.phase, assignment?.tables?.join_code, session.id])

  // ── Join table ───────────────────────────────────────────────────
  async function handleJoin() {
    const joinCode = assignment?.tables?.join_code
    if (!joinCode) return
    setJoinLoading(true)
    setJoinError(null)
    try {
      const { data, error } = await supabase.rpc('join_table', {
        p_join_code: joinCode,
        p_pseudo: member.pseudo,
      })
      if (error) throw error
      const r = data as TableResult
      tableStore.set({
        tableId: r.id,
        participantId: r.participant_id,
        joinCode: r.join_code,
        isModerator: false,
        pseudo: member.pseudo,
      })
      setJoined(true) // affiche l'écran d'attente — ne navigue pas encore
    } catch (err) {
      setJoinError(extractErr(err))
    } finally {
      setJoinLoading(false)
    }
  }

  function handleArrived() {
    window.location.reload()
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-5 text-center">
        <div className="text-3xl mb-1">🎉</div>
        <h1 className="text-lg font-bold text-gray-900">Vote terminé !</h1>
        <p className="text-sm text-gray-500 mt-0.5">{session.title}</p>
        <p className="text-xs text-gray-400 mt-1">
          Connecté en tant que <span className="font-medium text-gray-600">{member.pseudo}</span>
        </p>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-lg mx-auto w-full p-4 space-y-4 pb-8">
        {/* Table assignment — always first, most important */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ton groupe</p>
          <TableAssignmentCard
            assignment={assignment}
            loading={assignmentLoading}
            phase={currentSession.phase}
            onJoin={handleJoin}
            joinLoading={joinLoading}
            joinError={joinError}
            joined={joined}
            onArrived={handleArrived}
          />
        </div>

        {/* Vote results summary */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ce que vous avez voté</p>
          <VoteResultsSummary results={voteResults} loading={resultsLoading} />
        </div>
      </main>
    </div>
  )
}
