import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getVoteResults, getMyTableAssignment } from '../lib/voting'
import { tableStore } from '../lib/storage'
import { extractErr } from '../lib/utils'
import type { TableResult } from '../lib/supabase'
import type { GroupNameResult, Session, SessionMember, VoteResult } from '../lib/types'
import VoteResultsSummary from '../components/voting/VoteResultsSummary'
import VoteResultsList from '../components/voting/VoteResultsList'
import TableAssignmentCard from '../components/voting/TableAssignmentCard'
import type { AssignmentWithTable } from '../components/voting/TableAssignmentCard'
import SessionQuestionnaireForm from '../components/voting/SessionQuestionnaireForm'

interface AllocatingScreenProps {
  session: Session
  member: SessionMember
  onTableJoined?: (tableId: string, participantId: string, isModerator: boolean) => void
}

export default function AllocatingScreen({ session, member, onTableJoined }: AllocatingScreenProps) {
  const [currentSession,    setCurrentSession]    = useState<Session>(session)
  const [voteResults,       setVoteResults]       = useState<VoteResult[]>([])
  const [resultsLoading,    setResultsLoading]    = useState(true)
  const [assignment,        setAssignment]        = useState<AssignmentWithTable | null>(null)
  const [assignmentLoading, setAssignmentLoading] = useState(true)
  const [showAllResults,    setShowAllResults]    = useState(false)
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

  // ── Polling de secours — allocating ou debating sans join_code/assignment ──
  useEffect(() => {
    const phase = currentSession.phase
    if (phase !== 'allocating' && phase !== 'debating') return
    // Arrêter dès qu'on a un join_code (le cas debating+join_code est résolu)
    if (phase === 'debating' && assignment?.tables?.join_code) return
    // En allocating : arrêter dès qu'on a l'assignment (même sans join_code)
    if (phase === 'allocating' && assignment !== null) return

    const interval = setInterval(async () => {
      const data = await getMyTableAssignment(session.id).catch(() => null)
      if (data) setAssignment(data as AssignmentWithTable)
    }, 5_000)

    return () => clearInterval(interval)
  }, [currentSession.phase, assignment, session.id])

  // ── Polling de secours — phase de séance (allocating → debating) ──
  useEffect(() => {
    if (currentSession.phase !== 'allocating') return

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', session.id)
        .maybeSingle()
      if (!data) return
      const s = data as Session
      if (s.phase === currentSession.phase) return
      setCurrentSession(s)
      if (s.phase === 'questionnaire') setShowQuestionnaire(true)
      if (s.phase === 'closed')        setSessionClosed(true)
    }, 10_000)

    return () => clearInterval(interval)
  }, [currentSession.phase, session.id])

  // ── Nom du camp idéologique (localStorage superadmin) ─────────────
  const groupName = useMemo(() => {
    if (!assignment) return null
    try {
      const names = JSON.parse(
        localStorage.getItem(`group_names_${session.id}`) ?? '[]',
      ) as GroupNameResult[]
      const found = names.find(n => n.table_number === assignment.table_number)
      return found ?? null
    } catch {
      return null
    }
  }, [assignment, session.id])

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
      if (onTableJoined) {
        onTableJoined(r.id, r.participant_id, false)
      } else {
        window.location.href = window.location.pathname + window.location.search
      }
    } catch (err) {
      setJoinError(extractErr(err))
    } finally {
      setJoinLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────

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
            groupName={groupName}
          />
        </div>

        {/* Bannière clôture — affichée en-dessous de la carte */}
        {sessionClosed && (
          <div className="bg-gray-100 rounded-xl px-4 py-3 text-center text-sm text-gray-500">
            🔒 Cette séance est maintenant clôturée. Merci pour ta participation !
          </div>
        )}

        {/* Vote results */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ce que vous avez voté</p>
          <VoteResultsSummary results={voteResults} loading={resultsLoading} />
          {!resultsLoading && voteResults.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setShowAllResults(v => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-white border border-gray-200
                  rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <span>Voir toutes les assertions ({voteResults.length})</span>
                <span className="text-gray-400">{showAllResults ? '▲' : '▼'}</span>
              </button>
              {showAllResults && (
                <div className="mt-2 bg-white border border-gray-200 rounded-xl p-4">
                  <VoteResultsList results={voteResults} loading={false} />
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
