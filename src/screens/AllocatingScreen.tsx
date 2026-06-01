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
import SessionQuestionnaireForm from '../components/voting/SessionQuestionnaireForm'

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
  const [showQuestionnaire, setShowQuestionnaire] = useState(false)
  const [sessionClosed,     setSessionClosed]     = useState(false)

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // ── Fetch on mount ────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
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
  }, [session.id])

  // ── Realtime ──────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`allocating:${session.id}`)
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
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${session.id}`,
        },
        payload => {
          const updated = payload.new as Session
          setCurrentSession(updated)
          if (updated.phase === 'questionnaire') setShowQuestionnaire(true)
          if (updated.phase === 'closed')        setSessionClosed(true)
        },
      )
      .subscribe()

    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [session.id, member.id])

  // ── Re-fetch assignment when phase → debating ────────────────────
  useEffect(() => {
    if (currentSession.phase !== 'debating') return
    getMyTableAssignment(session.id)
      .then(data => { if (data) setAssignment(data as AssignmentWithTable) })
      .catch(() => { /* ignore */ })
  }, [currentSession.phase, session.id])

  // ── Polling de secours quand debating + pas encore de join_code ──
  useEffect(() => {
    if (currentSession.phase !== 'debating') return
    if (assignment?.tables?.join_code) return

    const interval = setInterval(async () => {
      const data = await getMyTableAssignment(session.id).catch(() => null)
      if (data) setAssignment(data as AssignmentWithTable)
    }, 5000)

    return () => clearInterval(interval)
  }, [currentSession.phase, assignment?.tables?.join_code, session.id])

  // ── Join table (bouton cliquable) ─────────────────────────────────
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
        tableId:       r.id,
        participantId: r.participant_id,
        joinCode:      r.join_code,
        isModerator:   false,
        pseudo:        member.pseudo,
      })
      window.location.href = window.location.pathname + window.location.search
    } catch (err) {
      setJoinError(extractErr(err))
    } finally {
      setJoinLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────

  if (sessionClosed) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">🔒</div>
          <h1 className="text-xl font-bold text-gray-900">Séance terminée</h1>
          <p className="text-sm text-gray-500">
            Cette séance est maintenant clôturée. Merci pour ta participation !
          </p>
        </div>
      </div>
    )
  }

  if (showQuestionnaire) {
    return (
      <SessionQuestionnaireForm
        sessionId={currentSession.id}
        onDone={() => setShowQuestionnaire(false)}
      />
    )
  }

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
        {/* Table assignment */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ton groupe</p>
          <TableAssignmentCard
            assignment={assignment}
            loading={assignmentLoading}
            phase={currentSession.phase}
            onJoin={handleJoin}
            joinLoading={joinLoading}
            joinError={joinError}
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
