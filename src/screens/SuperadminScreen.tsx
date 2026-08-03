import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { supabase } from '../lib/supabase'
import { extractErr, fromDateTimeLocal, formatDuration, generateQuestionnaireCSV, generateTableCSV, QUESTIONNAIRE_THEMES } from '../lib/utils'
import {
  verifyPassword, createSession, closeSession, deleteSession,
  attachTableToSession, detachTableFromSession,
  listSessionTables, listAvailableTables, updateSessionDocs,
  getQuestionnaireResponses, deleteQuestionnaireResponse,
  getTableParticipants, deleteTableAdmin, forceSessionQuestionnaire,
  cancelSessionQuestionnaire,
  listSessionSources, deleteCollabSourceAdmin,
  getSessionTableCounts, getSessionMemberCounts, moveParticipant, getTableSpeakingTurnsAdmin,
  adminCreateTable, updateGroupNames,
} from '../lib/sessions'
import type { SessionTableRow, TableParticipantRow, TableSpeakingTurnRow } from '../lib/sessions'
import type { Session, QuestionnaireExportRow, CollabSource, GroupNameResult, ModerationPolicy } from '../lib/types'
import {
  setSessionPhase, approveAssertion, rejectAssertion, deleteAssertionsAdmin, applyAssertionMerge,
  listAssertionsAdmin, getSessionVotingStats, updateSessionConfig,
  getVoteCountsAdmin, getThemeStatsAll, assignTableToGroup,
  listSessionMembersAdmin, adminSubmitAssertion, moveMemberToGroup,
  loadAllocationInputs, setMemberModerator, assignModeratorToTable,
} from '../lib/voting'
import type { AssertionAdmin, SessionVotingStats, SessionMemberAdmin, AllocationInputs } from '../lib/voting'
import type { VoteResult } from '../lib/types'
import AllocationPanel from '../components/voting/AllocationPanel'
import TableDiagnosticsList, { CampCompositionBar, campColor } from '../components/voting/TableDiagnosticsList'
import { diagnoseAllocation, type AllocationMember } from '../lib/allocation'
import ConfirmModal from '../components/ConfirmModal'
import VoteResultsSummary from '../components/voting/VoteResultsSummary'
import AnalysisPanel from '../components/AnalysisPanel'
import LLMModerationPanel from '../components/voting/LLMModerationPanel'
import { mergeAssertions } from '../lib/gemini'
import { loadVotesForAnalysis, loadLatestAnalysis } from '../lib/analysis'
import type { LoadedAnalysis } from '../lib/analysis'
import { generateGroupNames, groupsFingerprint, namingGroupsFromAnalysis } from '../lib/groupNaming'
import type { NamingGroup } from '../lib/groupNaming'

const PWD_KEY = 'ecclesia_superadmin_pwd'

const getPwd = () => sessionStorage.getItem(PWD_KEY)
const setPwd = (p: string) => sessionStorage.setItem(PWD_KEY, p)
const clearPwd = () => sessionStorage.removeItem(PWD_KEY)

type SessionRow = Session & { tableCount: number; memberCount: number }

type AdminView = { type: 'list' } | { type: 'detail'; session: SessionRow }

// ── Phase labels & badge colours ─────────────────────────────────

const PHASE_LABEL: Record<string, string> = {
  draft:         'Brouillon',
  pre_voting:    'Pré-vote',
  voting:        'Vote présentiel',
  allocating:    'Allocation',
  debating:      'Débat',
  questionnaire: 'Questionnaire',
  closed:        'Clôturée',
}

const PHASE_CLASS: Record<string, string> = {
  draft:         'bg-gray-100 text-gray-600',
  pre_voting:    'bg-amber-100 text-amber-700',
  voting:        'bg-purple-100 text-purple-700',
  allocating:    'bg-orange-100 text-orange-700',
  debating:      'bg-indigo-100 text-indigo-700',
  questionnaire: 'bg-teal-100 text-teal-700',
  closed:        'bg-slate-100 text-slate-500',
}

const PHASE_ORDER: Record<string, number> = {
  draft: 0, voting: 1, allocating: 1, debating: 1, questionnaire: 1, closed: 2,
}

function sortSessions(list: SessionRow[]): SessionRow[] {
  return [...list].sort((a, b) => {
    const po = (PHASE_ORDER[a.phase] ?? 1) - (PHASE_ORDER[b.phase] ?? 1)
    if (po !== 0) return po
    if (!a.scheduled_at && !b.scheduled_at) return 0
    if (!a.scheduled_at) return 1
    if (!b.scheduled_at) return -1
    return new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()
  })
}

// ── Main screen ───────────────────────────────────────────────────

export default function SuperadminScreen() {
  const [authed, setAuthed]         = useState(false)
  const [pwd, setPwdState]          = useState('')
  const [authLoading, setAuthLoad]  = useState(false)
  const [authErr, setAuthErr]       = useState<string | null>(null)

  const [sessions, setSessions]     = useState<SessionRow[]>([])
  const [listLoading, setListLoad]  = useState(false)
  const [listErr, setListErr]       = useState<string | null>(null)

  const [view, setView]             = useState<AdminView>({ type: 'list' })
  const [showCreate, setShowCreate] = useState(false)
  const [toClose, setToClose]       = useState<SessionRow | null>(null)
  const [toDelete, setToDelete]     = useState<SessionRow | null>(null)

  const [allVotesOpen,    setAllVotesOpen]    = useState(false)
  const [allThemeStats,   setAllThemeStats]   = useState<ThemeStat[]>([])
  const [allVotesLoading, setAllVotesLoading] = useState(false)
  const [allVotesErr,     setAllVotesErr]     = useState<string | null>(null)

  // ── Load sessions ──────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    setListLoad(true)
    setListErr(null)
    try {
      const pwd = getPwd()!
      const [{ data: sessData, error: sessErr }, countRows, memberRows] =
        await Promise.all([
          supabase.from('sessions').select('*').order('created_at', { ascending: false }),
          getSessionTableCounts(pwd),
          getSessionMemberCounts(pwd),
        ])
      if (sessErr) throw sessErr

      const counts: Record<string, number> = {}
      for (const row of countRows) {
        counts[row.session_id] = row.cnt
      }
      const memberCounts: Record<string, number> = {}
      for (const row of memberRows) {
        memberCounts[row.session_id] = row.cnt
      }

      const sorted = sortSessions(
        (sessData ?? []).map(s => ({ ...s, tableCount: counts[s.id] ?? 0, memberCount: memberCounts[s.id] ?? 0 }))
      )
      setSessions(sorted)

      const storedSessionId = sessionStorage.getItem('ecclesia_superadmin_session')
      if (storedSessionId) {
        const found = sorted.find(s => s.id === storedSessionId)
        if (found) setView({ type: 'detail', session: found })
      }

      setAllVotesLoading(true)
      setAllVotesErr(null)
      getThemeStatsAll(pwd)
        .then(rows => setAllThemeStats(rows))
        .catch(e => setAllVotesErr(extractErr(e)))
        .finally(() => setAllVotesLoading(false))
    } catch (e) {
      setListErr(extractErr(e))
    } finally {
      setListLoad(false)
    }
  }, [])

  // ── Auto-login from sessionStorage ────────────────────────────
  useEffect(() => {
    const stored = getPwd()
    if (!stored) return
    setAuthLoad(true)
    verifyPassword(stored)
      .then(() => { setAuthed(true); loadSessions() })
      .catch(() => { clearPwd(); setAuthErr(null) })
      .finally(() => setAuthLoad(false))
  }, [loadSessions])

  // ── Auth submit ────────────────────────────────────────────────
  async function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    setAuthErr(null)
    setAuthLoad(true)
    try {
      await verifyPassword(pwd)
      setPwd(pwd)
      setAuthed(true)
      loadSessions()
    } catch (e) {
      setAuthErr(extractErr(e))
    } finally {
      setAuthLoad(false)
    }
  }

  // ── Close session ──────────────────────────────────────────────
  async function handleClose() {
    if (!toClose) return
    const password = getPwd()!
    const target = toClose
    setToClose(null)
    try {
      await closeSession(password, target.id)
      setSessions(prev =>
        sortSessions(prev.map(s => s.id === target.id ? { ...s, phase: 'closed' as const } : s))
      )
    } catch (e) {
      const msg = extractErr(e)
      if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) {
        clearPwd(); setAuthed(false)
      }
      setListErr(msg)
    }
  }

  // ── Delete session ─────────────────────────────────────────────
  async function handleDelete() {
    if (!toDelete) return
    const password = getPwd()!
    const target = toDelete
    setToDelete(null)
    try {
      await deleteSession(password, target.id)
      setSessions(prev => prev.filter(s => s.id !== target.id))
    } catch (e) {
      const msg = extractErr(e)
      if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) {
        clearPwd(); setAuthed(false)
      }
      setListErr(msg)
    }
  }

  // ── Session created ────────────────────────────────────────────
  function handleCreated(s: Session) {
    setSessions(prev => sortSessions([{ ...s, tableCount: 0, memberCount: 0 }, ...prev]))
    setShowCreate(false)
  }

  // ── Auth error (called from child) ────────────────────────────
  function handleAuthError() { clearPwd(); setAuthed(false) }

  // ── Render ────────────────────────────────────────────────────

  if (authed && view.type === 'detail') {
    return (
      <SessionDetail
        session={view.session}
        onBack={() => { sessionStorage.removeItem('ecclesia_superadmin_session'); setView({ type: 'list' }); loadSessions() }}
        onAuthError={handleAuthError}
      />
    )
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <button
            onClick={() => { window.location.hash = '' }}
            className="mb-3 text-sm text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Retour
          </button>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 pt-7 pb-2 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 leading-tight">Ecclesia · Superadmin</h1>
              <p className="text-xs text-gray-400 leading-tight">Accès restreint</p>
            </div>
          </div>

          <form onSubmit={handleAuth} className="p-6 space-y-4">
            <Field
              label="Mot de passe superadmin"
              value={pwd}
              onChange={setPwdState}
              type="password"
              placeholder="••••••••"
            />
            <SubmitBtn loading={authLoading} label="Accéder" />
            {authErr && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                {authErr}
              </div>
            )}
          </form>
        </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <button
            onClick={() => { window.location.hash = '' }}
            className="shrink-0 text-sm text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Retour
          </button>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-gray-900 leading-tight truncate">Ecclesia · Superadmin</h1>
              <p className="text-xs text-gray-400 leading-tight">Gestion des séances</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="shrink-0 py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white
              text-sm font-medium rounded-xl transition-colors focus:outline-none
              focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            + Nouvelle séance
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-3xl mx-auto p-4">
        {listErr && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between gap-2">
            <span>{listErr}</span>
            <button onClick={() => setListErr(null)} className="shrink-0 text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {/* ── Votes toutes séances ───────────────────────────── */}
        <div className="mb-4 bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => setAllVotesOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
          >
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Thèmes — toutes séances
              {allVotesLoading ? (
                <span className="ml-2 font-normal normal-case text-gray-400">Chargement…</span>
              ) : allThemeStats.length > 0 ? (
                <span className="ml-2 font-normal normal-case text-gray-400">
                  ({allThemeStats.length} thème{allThemeStats.length !== 1 ? 's' : ''})
                </span>
              ) : null}
            </span>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${allVotesOpen ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          {allVotesOpen && (
            <div className="border-t border-gray-100">
              {allVotesErr ? (
                <p className="px-5 py-4 text-xs text-red-600">{allVotesErr}</p>
              ) : allVotesLoading ? (
                <p className="px-5 py-4 text-sm text-gray-400">Chargement…</p>
              ) : allThemeStats.length === 0 ? (
                <p className="px-5 py-4 text-sm text-gray-400 text-center">Aucune réponse au questionnaire</p>
              ) : (
                <div className="px-5 py-4 space-y-2.5">
                  {allThemeStats.map(s => (
                    <div key={s.theme} className="flex items-center gap-3 text-xs">
                      <span className="w-48 shrink-0 text-gray-700 truncate" title={s.theme}>{s.theme}</span>
                      <div className="flex-1 flex h-2 rounded-full overflow-hidden bg-gray-100">
                        <div
                          className="bg-teal-400 h-full rounded-full"
                          style={{ width: `${(s.avg / 5) * 100}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-gray-500 font-medium w-8 text-right">{s.avg}/5</span>
                      <span className="shrink-0 text-gray-400 w-14 text-right">{s.count} rép.</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {listLoading ? (
          <div className="flex items-center justify-center py-20 text-sm text-gray-400">
            Chargement…
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <p className="text-sm text-gray-400">Aucune séance pour l'instant</p>
            <button
              onClick={() => setShowCreate(true)}
              className="text-sm text-indigo-600 hover:underline"
            >
              Créer la première séance
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map(s => (
              <SessionCard
                key={s.id}
                session={s}
                onClose={() => setToClose(s)}
                onDelete={() => setToDelete(s)}
                onClick={() => { sessionStorage.setItem('ecclesia_superadmin_session', s.id); setView({ type: 'detail', session: s }) }}
              />
            ))}
          </div>
        )}
      </main>

      {/* Modals */}
      {showCreate && (
        <CreateModal
          onCreated={handleCreated}
          onClose={() => setShowCreate(false)}
          onAuthError={handleAuthError}
        />
      )}

      {toClose && (
        <ConfirmModal
          title="Fermer la séance"
          body={`Fermer "${toClose.title}" ? La séance passera en phase "Clôturée".`}
          confirmLabel="Fermer la séance"
          onConfirm={handleClose}
          onCancel={() => setToClose(null)}
        />
      )}

      {toDelete && (
        <ConfirmModal
          title="Supprimer la séance"
          body={`Supprimer définitivement "${toDelete.title}" ? Les tables rattachées seront détachées mais pas supprimées.`}
          confirmLabel="Supprimer"
          onConfirm={handleDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  )
}

// ── SessionCard ───────────────────────────────────────────────────

function SessionCard({
  session, onClose, onDelete, onClick,
}: {
  session: SessionRow
  onClose(): void
  onDelete(): void
  onClick(): void
}) {
  const isClosed = session.phase === 'closed'
  const [expanded, setExpanded]   = useState(false)
  const [tables, setTables]       = useState<SessionTableRow[] | null>(null)
  const [tablesErr, setTablesErr] = useState<string | null>(null)
  const [tablesLoading, setTablesLoading] = useState(false)

  async function toggleExpand(e: React.MouseEvent) {
    e.stopPropagation()
    if (!expanded && tables === null) {
      setTablesLoading(true)
      setTablesErr(null)
      try {
        const rows = await listSessionTables(getPwd()!, session.id)
        setTables(rows)
      } catch (err) {
        setTablesErr(extractErr(err))
      } finally {
        setTablesLoading(false)
      }
    }
    setExpanded(v => !v)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden transition-colors hover:border-indigo-200">
      {/* ── Header row ── */}
      <div
        className="px-5 py-4 flex items-start gap-3 cursor-pointer hover:bg-indigo-50/30 transition-colors"
        onClick={onClick}
      >
        {/* Expand chevron */}
        <button
          onClick={toggleExpand}
          title={expanded ? 'Réduire' : 'Voir les tables'}
          className="shrink-0 mt-0.5 text-gray-400 hover:text-indigo-600 transition-colors"
        >
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className={`transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
          >
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>

        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Title + badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 truncate">{session.title}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PHASE_CLASS[session.phase] ?? 'bg-gray-100 text-gray-600'}`}>
              {PHASE_LABEL[session.phase] ?? session.phase}
            </span>
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
            {session.scheduled_at && (
              <span>{new Date(session.scheduled_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            )}
            {session.join_code && (
              <span className="font-mono tracking-widest text-gray-700">{session.join_code}</span>
            )}
            <span>{session.tableCount} table{session.tableCount !== 1 ? 's' : ''}</span>
            {session.memberCount > 0 && (
              <span>{session.memberCount} membre{session.memberCount !== 1 ? 's' : ''}</span>
            )}
          </div>

          {/* Description */}
          {session.description && (
            <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">{session.description}</p>
          )}
        </div>

        {/* Action buttons */}
        <div className="shrink-0 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
          {!isClosed && (
            <button
              onClick={onClose}
              className="py-1.5 px-3 text-xs font-medium border border-gray-200 rounded-lg
                text-gray-600 hover:border-red-200 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              Fermer
            </button>
          )}
          <button
            onClick={onDelete}
            title="Supprimer la séance"
            className="p-1.5 rounded-lg border border-transparent text-gray-300
              hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Expanded tables panel ── */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 py-3 bg-gray-50/60">
          {tablesLoading && (
            <p className="text-xs text-gray-400 py-2">Chargement…</p>
          )}
          {tablesErr && (
            <p className="text-xs text-red-500 py-2">{tablesErr}</p>
          )}
          {!tablesLoading && !tablesErr && tables !== null && (
            tables.length === 0 ? (
              <p className="text-xs text-gray-400 py-2 text-center">Aucune table rattachée</p>
            ) : (
              <div className="space-y-1.5">
                {tables.map(t => (
                  <div key={t.id} className="flex items-center gap-3 text-xs">
                    {/* Active indicator */}
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.is_active ? 'bg-teal-400' : 'bg-gray-300'}`} />
                    {/* Join code */}
                    <span className="font-mono tracking-widest text-gray-700 w-14 shrink-0">{t.join_code}</span>
                    {/* Leaderless badge */}
                    {t.leaderless && (
                      <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 shrink-0">
                        Sans modérateur
                      </span>
                    )}
                    {/* Moderator */}
                    <span className="text-gray-500 truncate flex-1">
                      {t.leaderless ? null : (t.moderator_pseudo ?? <span className="italic text-gray-300">—</span>)}
                    </span>
                    {/* Participants */}
                    <span className="text-gray-400 shrink-0">
                      {t.participant_count} participant{Number(t.participant_count) !== 1 ? 's' : ''}
                    </span>
                    {/* Created at */}
                    <span className="text-gray-300 shrink-0 hidden sm:block">
                      {new Date(t.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}

// ── CreateModal ───────────────────────────────────────────────────

function CreateModal({
  onCreated,
  onClose,
  onAuthError,
}: {
  onCreated(s: Session): void
  onClose(): void
  onAuthError(): void
}) {
  const [title, setTitle]               = useState('')
  const [description, setDescription]   = useState('')
  const [scheduledAt, setScheduledAt]   = useState('')
  const [docInfoUrl, setDocInfoUrl]     = useState('')
  const [docSummaryUrl, setDocSummaryUrl] = useState('')
  const [moderationPolicy, setModerationPolicy] = useState<ModerationPolicy>('closed')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const password = getPwd()!
    try {
      const session = await createSession(
        password,
        title,
        description || undefined,
        scheduledAt ? fromDateTimeLocal(scheduledAt) : undefined,
        docInfoUrl || undefined,
        docSummaryUrl || undefined,
      )
      // Apply moderation policy if not the default
      if (moderationPolicy !== 'closed') {
        await updateSessionConfig(password, session.id, moderationPolicy)
      }
      onCreated(session)
    } catch (e) {
      const msg = extractErr(e)
      if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) {
        onAuthError()
        return
      }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-0 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Nouvelle séance</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <Field label="Titre" value={title} onChange={setTitle} placeholder="Assemblée générale — mai 2026" />

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Description <span className="text-gray-400 font-normal">(optionnel)</span></label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Thème, lieu, organisateurs…"
              className="w-full px-3 py-3 text-sm border border-gray-300 rounded-xl resize-none
                focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                placeholder:text-gray-300 transition-shadow"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Date prévue <span className="text-gray-400 font-normal">(optionnel)</span></label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              className="w-full px-3 py-3 text-sm border border-gray-300 rounded-xl
                focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                transition-shadow"
            />
          </div>

          <div className="pt-1 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Documentation <span className="font-normal normal-case text-gray-400">(optionnel)</span>
            </p>
            <div className="space-y-3">
              <DocFileField label="Fiche information" placeholder="https://…" value={docInfoUrl} onChange={setDocInfoUrl} />
              <DocFileField label="Résumé" placeholder="https://…" value={docSummaryUrl} onChange={setDocSummaryUrl} />
            </div>
            <p className="mt-3 text-xs text-gray-400">
              Le document de sources collaboratives est disponible automatiquement pour chaque séance
              avec un code de rejoindre.
            </p>
          </div>

          <div className="pt-1 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Configuration du vote <span className="font-normal normal-case text-gray-400">(optionnel)</span>
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Modération des assertions</label>
              <div className="grid grid-cols-3 gap-2">
                {(['closed', 'open', 'ai'] as const).map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setModerationPolicy(val)}
                    className={`py-2 px-3 rounded-xl border-2 text-xs font-medium transition-all ${
                      moderationPolicy === val
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 text-gray-600 hover:border-indigo-200'
                    }`}
                  >
                    {val === 'closed' ? '🔒 Fermée (validation requise)' : val === 'open' ? '🔓 Ouverte (immédiat)' : '🤖 Gérée par IA'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 text-sm font-medium border border-gray-200 rounded-xl
                text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none
                focus:ring-2 focus:ring-gray-300"
            >
              Annuler
            </button>
            <SubmitBtn loading={loading} label="Créer la séance" className="flex-1" />
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Shared helpers ────────────────────────────────────────────────

function Field({
  label, value, onChange, type = 'text', placeholder,
}: {
  label: string
  value: string
  onChange(v: string): void
  type?: string
  placeholder?: string
}) {
  const [showPwd, setShowPwd] = useState(false)
  const isPassword = type === 'password'
  const inputType  = isPassword ? (showPwd ? 'text' : 'password') : type

  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={inputType}
          required
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full px-3 py-3 text-sm border border-gray-300 rounded-xl
            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
            placeholder:text-gray-300 transition-shadow
            ${isPassword ? 'pr-10' : ''}`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPwd(v => !v)}
            tabIndex={-1}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            {showPwd ? <EyeOff /> : <Eye />}
          </button>
        )}
      </div>
    </div>
  )
}

function SubmitBtn({ loading, label, className = 'w-full' }: { loading: boolean; label: string; className?: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className={`${className} py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400
        text-white text-sm font-medium rounded-xl transition-colors focus:outline-none
        focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 flex items-center justify-center gap-2`}
    >
      {loading ? <><Spinner />Chargement…</> : label}
    </button>
  )
}

function Eye() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

function EyeOff() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  )
}

// ── SessionDetail ─────────────────────────────────────────────────

// ── Types C5 ─────────────────────────────────────────────────────

interface GroupRow {
  table_number: number
  /** Chantier 26 (H21) — `is_moderator` vient de `session_members`, posé au chargement. */
  members: { pseudo: string; member_id: string; is_moderator: boolean }[]
  table_id: string | null
  join_code: string | null
  /** Chantier 19 — dérivé de `tables.leaderless` (false quand aucune table rattachée). */
  moderated: boolean
}

type AdminTab = 'live' | 'tables' | 'prep' | 'analysis'

function defaultTab(phase: Session['phase']): AdminTab {
  if (phase === 'draft') return 'prep'
  if (phase === 'pre_voting' || phase === 'voting' || phase === 'allocating' || phase === 'debating') return 'live'
  return 'analysis'
}

// ── SessionDetail ─────────────────────────────────────────────────

function SessionDetail({
  session,
  onBack,
  onAuthError,
}: {
  session: SessionRow
  onBack(): void
  onAuthError(): void
}) {
  const [attachedTables,  setAttachedTables]  = useState<SessionTableRow[]>([])
  const [availableTables, setAvailableTables] = useState<SessionTableRow[]>([])
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState<string | null>(null)
  const [detachConfirm,   setDetachConfirm]   = useState<SessionTableRow | null>(null)
  const [deleteTableConfirm, setDeleteTableConfirm] = useState<SessionTableRow | null>(null)
  const [exportingType,      setExportingType]      = useState<null | 'questionnaire' | 'speaking' | 'history'>(null)
  const [isQForced,    setIsQForced]    = useState(false)
  const [showQConfirm, setShowQConfirm] = useState(false)
  const [qActing,      setQActing]      = useState(false)

  const [rattacheesOpen,  setRattacheesOpen]  = useState(true)
  const [disponiblesOpen, setDisponiblesOpen] = useState(false)
  const [docsOpen,        setDocsOpen]        = useState(false)

  const adminTabKey = `ecclesia_admin_tab_${session.id}`
  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    const stored = sessionStorage.getItem(`ecclesia_admin_tab_${session.id}`)
    if (stored === 'live' || stored === 'tables' || stored === 'prep' || stored === 'analysis') return stored
    return defaultTab(session.phase)
  })
  const [postSessionOpen, setPostSessionOpen] = useState(false)
  const [synthOpen,       setSynthOpen]       = useState(false)

  // ── Filtre "Tables disponibles" ────────────────────────────
  type TableFilter = '48h' | 'all' | 'custom'
  const [tableFilter,  setTableFilter]  = useState<TableFilter>('48h')
  const [customSince,  setCustomSince]  = useState('')

  // ── Questionnaire data ─────────────────────────────────────────
  const [responses,          setResponses]          = useState<QuestionnaireExportRow[]>([])
  const [responsesLoading,   setResponsesLoading]   = useState(false)
  const [expandedResponseId, setExpandedResponseId] = useState<string | null>(null)
  const [deleteRespConfirm,  setDeleteRespConfirm]  = useState<QuestionnaireExportRow | null>(null)
  const [deletingRespId,     setDeletingRespId]     = useState<string | null>(null)
  const [themesOpen,         setThemesOpen]         = useState(false)
  const [responsesOpen,      setResponsesOpen]      = useState(false)
  const [staffOpen,          setStaffOpen]          = useState(false)
  // F15 — zoom recrutement : réponses où staff_interest est renseigné (texte libre)
  const staffInterestResponses = React.useMemo(
    () => responses.filter(r => r.staff_interest),
    [responses],
  )

  // ── Collab sources data ────────────────────────────────────────
  const [sources,             setSources]             = useState<CollabSource[]>([])
  const [sourcesLoading,      setSourcesLoading]      = useState(false)
  const [sourcesOpen,         setSourcesOpen]         = useState(false)
  const [deleteSourceConfirm, setDeleteSourceConfirm] = useState<CollabSource | null>(null)
  const [deletingSourceId,    setDeletingSourceId]    = useState<string | null>(null)

  // ── Current session state (mutable for phase changes) ──────
  const [currentSession, setCurrentSession] = useState<SessionRow>(session)

  // ── Phase transitions ──────────────────────────────────────
  const PHASE_SEQUENCE: Session['phase'][] = ['draft', 'pre_voting', 'voting', 'allocating', 'debating', 'questionnaire', 'closed']
  const phaseIdx = PHASE_SEQUENCE.indexOf(currentSession.phase)
  const nextPhase = phaseIdx < PHASE_SEQUENCE.length - 1 ? PHASE_SEQUENCE[phaseIdx + 1] : null
  const prevPhase = phaseIdx > 0 ? PHASE_SEQUENCE[phaseIdx - 1] : null
  const [phaseConfirm, setPhaseConfirm] = useState<{ phase: Session['phase']; label: string; isBack: boolean } | null>(null)
  const [phaseActing, setPhaseActing]   = useState(false)

  /**
   * Chantier 37 — fusion IA « en fin de vote » (toggle du panneau de
   * modération, clé localStorage `ai_auto_merge_<id>`). Elle ne déclenchait
   * auparavant que depuis la modale héritée « Répartir en tables »
   * (chantier 19, RPC run_clustering_v1/v2) — supprimée ici (plus aucun
   * usage réel depuis l'allocation v2, cf. AllocationPanel). Rattachée au
   * seul point de sortie de la phase voting qui reste : le passage manuel
   * en allocating, pour ne pas perdre le toggle.
   */
  async function runAutoMergeIfEnabled(password: string) {
    const autoMerge = localStorage.getItem(`ai_auto_merge_${currentSession.id}`) === 'true'
    if (!autoMerge) return
    const allAssertions = await listAssertionsAdmin(password, currentSession.id)
    const approved = allAssertions.filter(a => a.status === 'approved')
    if (approved.length < 2) return
    const { results: merges } = await mergeAssertions({
      session_id:          currentSession.id,
      session_title:       currentSession.title,
      session_description: currentSession.description ?? null,
      assertions:          approved.map(a => ({ id: a.id, content: a.content })),
    })
    for (const merge of merges) {
      for (const rejectId of merge.reject_ids) {
        // RPC atomique : transfère les votes (sinon perte des votes
        // portés sur l'assertion fusionnée — bug B4), rejette
        // l'assertion absorbée et enregistre de quoi annuler la
        // fusion depuis le panneau IA (chantier 18 / F24).
        await applyAssertionMerge(password, merge.keep_id, rejectId, null, merge.reason ?? null)
      }
    }
  }

  async function handlePhaseChange(targetPhase: Session['phase']) {
    const password = getPwd()!
    setPhaseActing(true)
    setPhaseConfirm(null)
    try {
      if (targetPhase === 'allocating' && currentSession.phase === 'voting') {
        await runAutoMergeIfEnabled(password)
      }
      const updated = await setSessionPhase(password, currentSession.id, targetPhase)
      setCurrentSession(prev => ({ ...prev, phase: updated.phase }))
      if (targetPhase === 'questionnaire') {
        await forceSessionQuestionnaire(password, currentSession.id)
        setIsQForced(true)
      }
    } catch (e) {
      const msg = extractErr(e)
      if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) { onAuthError(); return }
      setError(msg)
    } finally {
      setPhaseActing(false)
    }
  }

  // ── Assertions (C2) ────────────────────────────────────────
  const VOTE_PHASES: Session['phase'][] = ['draft', 'pre_voting', 'voting', 'allocating', 'debating', 'questionnaire', 'closed']
  const showVotingSections = VOTE_PHASES.includes(currentSession.phase)

  const [assertions,        setAssertions]        = useState<AssertionAdmin[]>([])
  const [assertionsLoading, setAssertionsLoading] = useState(false)
  const [assertionsErr,     setAssertionsErr]     = useState<string | null>(null)
  const [assertionsTab,     setAssertionsTab]     = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [assertionsOpen,    setAssertionsOpen]    = useState(true)
  const [actingAssertionId, setActingAssertionId] = useState<string | null>(null)
  const [voteResults,       setVoteResults]       = useState<VoteResult[]>([])

  const loadAssertions = useCallback(async () => {
    const password = getPwd()!
    setAssertionsLoading(true)
    setAssertionsErr(null)
    try {
      const [rowsResult, resultsResult] = await Promise.allSettled([
        listAssertionsAdmin(password, session.id),
        getVoteCountsAdmin(password, session.id),
      ])
      if (rowsResult.status === 'fulfilled') {
        setAssertions(rowsResult.value)
      } else {
        const msg = extractErr(rowsResult.reason)
        if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) { onAuthError(); return }
        setAssertionsErr(msg)
      }
      if (resultsResult.status === 'fulfilled') {
        const assertionMap = rowsResult.status === 'fulfilled'
          ? new Map(rowsResult.value.map(a => [a.id, a.content]))
          : new Map<string, string>()
        setVoteResults(resultsResult.value.map(vr => ({
          ...vr,
          content: assertionMap.get(vr.id) ?? vr.content ?? '',
        })))
      }
      // getVoteCountsAdmin failure is non-blocking — assertions still display without vote bars
    } finally {
      setAssertionsLoading(false)
    }
  }, [session.id, onAuthError])

  useEffect(() => {
    if (!showVotingSections) return
    loadAssertions()
    const interval = setInterval(loadAssertions, 10000)
    return () => clearInterval(interval)
  }, [loadAssertions, showVotingSections])

  async function handleApprove(assertionId: string) {
    const password = getPwd()!
    setActingAssertionId(assertionId)
    try {
      const updated = await approveAssertion(password, assertionId)
      setAssertions(prev => prev.map(a => a.id === assertionId ? { ...a, status: updated.status } : a))
    } catch (e) {
      const msg = extractErr(e)
      if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) { onAuthError(); return }
      setError(msg)
    } finally {
      setActingAssertionId(null)
    }
  }

  async function handleReject(assertionId: string) {
    const password = getPwd()!
    setActingAssertionId(assertionId)
    try {
      const updated = await rejectAssertion(password, assertionId)
      setAssertions(prev => prev.map(a => a.id === assertionId ? { ...a, status: updated.status } : a))
    } catch (e) {
      const msg = extractErr(e)
      if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) { onAuthError(); return }
      setError(msg)
    } finally {
      setActingAssertionId(null)
    }
  }

  async function handleApproveAll() {
    const pending = assertions.filter(a => a.status === 'pending')
    for (const a of pending) await handleApprove(a.id)
  }

  async function handleDeleteAssertions(ids: string[]) {
    if (ids.length === 0) return
    const password = getPwd()!
    setActingAssertionId(ids[0])
    try {
      await deleteAssertionsAdmin(password, session.id, ids)
      const idSet = new Set(ids)
      setAssertions(prev => prev.filter(a => !idSet.has(a.id)))
      setVoteResults(prev => prev.filter(v => !idSet.has(v.id)))
    } catch (e) {
      const msg = extractErr(e)
      if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) { onAuthError(); return }
      setError(msg)
    } finally {
      setActingAssertionId(null)
    }
  }

  // ── Voting stats (C2) ──────────────────────────────────────
  const [votingStats,    setVotingStats]    = useState<SessionVotingStats | null>(null)
  const [statsLoading,   setStatsLoading]   = useState(false)
  const [statsOpen,      setStatsOpen]      = useState(true)
  // ── Chantier 19 — entrées de l'allocation v2 (attributs des membres) ──
  // Chargées avec les groupes : servent au recalcul en direct des
  // diagnostics quand le superadmin déplace quelqu'un (§7).
  const [allocInputs,    setAllocInputs]    = useState<AllocationInputs | null>(null)

  // ── C5 : groupes et assignation ───────────────────────────
  const [groups,          setGroups]          = useState<GroupRow[]>([])
  const [groupNames,      setGroupNames]      = useState<GroupNameResult[]>(() => {
    try { return JSON.parse(localStorage.getItem(`group_names_${session.id}`) ?? '[]') as GroupNameResult[] }
    catch { return [] }
  })
  const [groupsLoading,   setGroupsLoading]   = useState(false)
  // Chantier 20 (G6) — horodatage du dernier rafraîchissement, affiché à
  // côté de « Groupes » pour matérialiser l'état « à jour » du tableau de bord.
  const [groupsSyncedAt,  setGroupsSyncedAt]  = useState<Date | null>(null)
  const [dropdownTables,  setDropdownTables]  = useState<SessionTableRow[]>([])
  const [assigningGroup,  setAssigningGroup]  = useState<number | null>(null)
  const [assignError,     setAssignError]     = useState<string | null>(null)
  const [selectedTableId, setSelectedTableId] = useState<Record<number, string>>({})
  const [showDebateConfirm, setShowDebateConfirm] = useState(false)
  // Chantier 30 (J8) — vue récapitulative en lecture seule, prête à capturer.
  const [rosterOpen, setRosterOpen] = useState(false)

  // ── DnD déplacement membres entre groupes ─────────────────
  const [draggingMember, setDraggingMember] = useState<{ pseudo: string; member_id: string } | null>(null)
  const [movingMember,   setMovingMember]   = useState(false)
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  async function handleGroupDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setDraggingMember(null)
    if (!over) return

    const memberId   = active.id as string
    const overIdStr  = over.id as string

    // Chantier 33 (point 2) — déposer un membre sur la zone "Ajouter un
    // modérateur" d'une table l'y assied comme modérateur (glisser-déposer).
    if (overIdStr.startsWith('add-moderator-')) {
      const targetTableNumber = parseInt(overIdStr.replace('add-moderator-', ''), 10)
      await handleAssignTableModerator(targetTableNumber, memberId)
      return
    }

    if (!overIdStr.startsWith('group-')) return

    const targetTableNumber = parseInt(overIdStr.replace('group-', ''), 10)
    const currentGroup = groups.find(g => g.members.some(m => m.member_id === memberId))
    if (!currentGroup || currentGroup.table_number === targetTableNumber) return

    const password = getPwd()!
    setMovingMember(true)
    try {
      await moveMemberToGroup(password, currentSession.id, memberId, targetTableNumber)
      await loadGroups()
    } catch (e) {
      const msg = extractErr(e)
      if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) {
        onAuthError(); return
      }
      setAssignError(msg)
    } finally {
      setMovingMember(false)
    }
  }

  // ── Membres inscrits ──────────────────────────────────────
  const [members,         setMembers]         = useState<SessionMemberAdmin[]>([])
  const [membersLoading,  setMembersLoading]  = useState(false)
  const [membersOpen,     setMembersOpen]     = useState(false)

  const loadMembers = useCallback(async () => {
    const password = getPwd()!
    setMembersLoading(true)
    try {
      const data = await listSessionMembersAdmin(password, session.id)
      setMembers(data)
    } catch {
      // non-bloquant
    } finally {
      setMembersLoading(false)
    }
  }, [session.id])

  useEffect(() => {
    if (!showVotingSections) return
    loadMembers()
    const interval = setInterval(loadMembers, 15000)
    return () => clearInterval(interval)
  }, [loadMembers, showVotingSections])

  /**
   * Chantier 19 (G4) — marquage « modérateur pour cette séance ».
   * Moyen minimal de renseigner le signal pour que l'algorithme puisse le
   * lire avant l'allocation. Le flow complet (onglet « Modérateur » de
   * l'accueil + mot de passe Ecclesia) est le chantier 21.
   */
  const handleToggleModerator = useCallback(async (memberId: string, next: boolean) => {
    const password = getPwd()!
    // Mise à jour optimiste : la liste est rechargée toutes les 15 s de toute façon.
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, is_moderator: next } : m))
    try {
      await setMemberModerator(password, session.id, memberId, next)
    } catch (e) {
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, is_moderator: !next } : m))
      const msg = extractErr(e)
      if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) { onAuthError(); return }
      setError(msg)
    }
  }, [session.id, onAuthError])

  // ── Création de table admin ────────────────────────────────
  const [creatingTable, setCreatingTable] = useState(false)
  const [newTableCode,  setNewTableCode]  = useState<string | null>(null)

  async function handleCreateTable(leaderless = false) {
    const password = getPwd()!
    setCreatingTable(true)
    setError(null)
    try {
      const result = await adminCreateTable(password, session.id, leaderless)
      setNewTableCode(result.join_code)
      const newRow: SessionTableRow = {
        id: result.table_id,
        join_code: result.join_code,
        created_at: new Date().toISOString(),
        moderator_pseudo: null,
        participant_count: 0,
        is_active: false,
        questionnaire_forced_at: null,
        leaderless,
      }
      setAttachedTables(prev => [...prev, newRow])
    } catch (e) {
      const msg = extractErr(e)
      if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) { onAuthError(); return }
      setError(msg)
    } finally {
      setCreatingTable(false)
    }
  }

  // ── Assertions admin ───────────────────────────────────────
  async function handleAdminSubmitAssertion(content: string) {
    const password = getPwd()!
    const newAssertion = await adminSubmitAssertion(password, session.id, content)
    setAssertions(prev => {
      if (prev.some(a => a.id === newAssertion.id)) return prev
      return [...prev, newAssertion]
    })
    return newAssertion
  }

  const loadStats = useCallback(async () => {
    const password = getPwd()!
    setStatsLoading(true)
    try {
      const stats = await getSessionVotingStats(password, session.id)
      setVotingStats(stats)
    } catch {
      // non-bloquant
    } finally {
      setStatsLoading(false)
    }
  }, [session.id])

  useEffect(() => {
    if (!showVotingSections) return
    loadStats()
    const interval = setInterval(loadStats, 15000)
    return () => clearInterval(interval)
  }, [loadStats, showVotingSections])

  // ── C5 : loadGroups ──────────────────────────────────────────
  const loadGroups = useCallback(async () => {
    setGroupsLoading(true)
    try {
      const [{ data: rows }, sessionTbls, availTbls] = await Promise.all([
        supabase
          .from('table_assignments')
          .select('table_number, member_id, table_id, session_members!member_id(pseudo, is_moderator)')
          .eq('session_id', session.id)
          .order('table_number'),
        listSessionTables(getPwd()!, session.id).catch(() => [] as Awaited<ReturnType<typeof listSessionTables>>),
        listAvailableTables(getPwd()!).catch(() => [] as Awaited<ReturnType<typeof listAvailableTables>>),
      ])

      const joinCodeMap = new Map<string, string>(sessionTbls.map(t => [t.id, t.join_code]))
      const leaderlessMap = new Map<string, boolean>(sessionTbls.map(t => [t.id, t.leaderless === true]))

      const map = new Map<number, GroupRow>()
      for (const row of rows ?? []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = row as any
        const tableNum = r.table_number as number
        if (!map.has(tableNum)) {
          map.set(tableNum, {
            table_number: tableNum,
            members: [],
            table_id: r.table_id ?? null,
            join_code: r.table_id ? (joinCodeMap.get(r.table_id) ?? null) : null,
            // Chantier 19 — une table est « animée » si elle n'est pas leaderless.
            moderated: r.table_id ? leaderlessMap.get(r.table_id) === false : false,
          })
        }
        const g = map.get(tableNum)!
        g.members.push({
          pseudo: r.session_members?.pseudo ?? '?',
          member_id: r.member_id,
          is_moderator: r.session_members?.is_moderator === true,
        })
      }
      setGroups([...map.values()].sort((a, b) => a.table_number - b.table_number))

      const sessionPhys = sessionTbls
      const avail       = availTbls
      const linkedIds   = new Set([...map.values()].map(g => g.table_id).filter((id): id is string => id !== null))
      setDropdownTables([
        ...sessionPhys.filter(t => !linkedIds.has(t.id)),
        ...avail,
      ])

      // Chantier 19 — attributs des membres pour le recalcul des seuils.
      // Non bloquant : si la migration n'est pas appliquée, le tableau de
      // bord des seuils est simplement masqué.
      try {
        setAllocInputs(await loadAllocationInputs(getPwd()!, session.id))
      } catch {
        setAllocInputs(null)
      }
      setGroupsSyncedAt(new Date())
    } finally {
      setGroupsLoading(false)
    }
  }, [session.id])

  /**
   * Chantier 33 (point 2) — assigne un membre comme modérateur d'une table
   * précise (drag & drop ou saisie de nom). Réutilisable par les deux
   * entrées : `assign_moderator_to_table` pose `is_moderator` et (dé)place
   * la ligne `table_assignments` en une seule transaction.
   */
  const handleAssignTableModerator = useCallback(async (tableNumber: number, memberId: string) => {
    const password = getPwd()!
    setMovingMember(true)
    try {
      await assignModeratorToTable(password, currentSession.id, tableNumber, memberId)
      await loadGroups()
      await loadMembers()
    } catch (e) {
      const msg = extractErr(e)
      if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) {
        onAuthError(); return
      }
      setAssignError(msg)
    } finally {
      setMovingMember(false)
    }
  }, [currentSession.id, onAuthError, loadGroups, loadMembers])

  /**
   * Chantier 33 (point 2) — « retirer » un modérateur d'une table : il
   * redevient un participant ordinaire, toujours assis à la même table.
   * Réutilise `set_member_moderator`, déjà existante (chantier 19/25c).
   */
  const handleRemoveTableModerator = useCallback(async (memberId: string) => {
    const password = getPwd()!
    setMovingMember(true)
    try {
      await setMemberModerator(password, currentSession.id, memberId, false)
      await loadGroups()
      await loadMembers()
    } catch (e) {
      const msg = extractErr(e)
      if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) {
        onAuthError(); return
      }
      setAssignError(msg)
    } finally {
      setMovingMember(false)
    }
  }, [currentSession.id, onAuthError, loadGroups, loadMembers])

  useEffect(() => {
    const p = currentSession.phase
    if (p === 'allocating' || p === 'debating') loadGroups()
  }, [currentSession.phase, loadGroups])

  // Chantier 20 (G6) — état « live » : un déplacement de membre fait par un
  // autre onglet/superadmin (ou l'auto-fusion, etc.) doit se refléter ici
  // sans réaction manuelle. `table_assignments` est déjà en REPLICA IDENTITY
  // FULL (migration 20260530) — un seul channel, comme partout ailleurs dans
  // l'app (cf. règle « plusieurs .on() chaînés, jamais plusieurs channels »).
  useEffect(() => {
    const p = currentSession.phase
    if (p !== 'allocating' && p !== 'debating') return
    const channel = supabase
      .channel(`table_assignments:${session.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'table_assignments', filter: `session_id=eq.${session.id}` },
        () => { loadGroups() },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentSession.phase, session.id, loadGroups])

  // Chantier 19 (§7) — diagnostics recalculés à chaque changement de `groups`,
  // donc mis à jour en direct après un glisser-déposer.
  const groupDiagnostics = React.useMemo(() => {
    if (!allocInputs || groups.length === 0) return []
    return diagnoseAllocation(
      groups.map(g => ({
        table_number: g.table_number,
        moderated:    g.moderated,
        member_ids:   g.members.map(m => m.member_id),
      })),
      allocInputs.members,
      allocInputs.opinionsAvailable,
    )
  }, [groups, allocInputs])

  // Chantier 26 (H20) — attributs individuels (actif / consentant / ancien /
  // camp) pour l'affichage par lettres + couleur sur chaque carte membre.
  // `allocInputs.moderators` couvre aussi un modérateur en surplus assis
  // comme participant ordinaire (chantier 25 / H17).
  const memberProfiles = React.useMemo(() => {
    const map = new Map<string, AllocationMember>()
    for (const m of allocInputs?.members ?? [])    map.set(m.member_id, m)
    for (const m of allocInputs?.moderators ?? []) map.set(m.member_id, m)
    return map
  }, [allocInputs])

  // Nommage des camps (Gemini + fallback descriptif) — logique partagée.
  //
  // ⚠️ Chantier 28 (H26) — `namingGroups` doit TOUJOURS être dérivé des clusters
  // k-means de l'analyse (`namingGroupsFromAnalysis`), jamais des tables
  // physiques de `table_assignments`. Voir l'invariant documenté sur
  // `NamingGroup` dans lib/groupNaming.ts : nommer les tables physiques écrasait
  // `sessions.group_names` par un jeu tronqué (autant d'entrées que de tables),
  // laissant anonymes les camps au-delà et changeant les noms déjà affichés.
  //
  // ⚠️ Chantier 28 — les appels sont SÉRIALISÉS, jamais abandonnés. L'ancien
  // garde-fou (`if (namingInFlightRef.current) return`) laissait tomber
  // silencieusement toute demande arrivant pendant un nommage en cours : une
  // seconde analyse lancée pendant les appels Gemini de la première ne voyait
  // jamais ses camps nommés, et `group_names` restait indexé sur le clustering
  // précédent — noms qui ne correspondent plus, nouveaux camps anonymes.
  // Ré-enfiler est sans coût : le court-circuit d'empreinte ci-dessous rend une
  // demande redondante gratuite (aucun appel Gemini).
  const namingChainRef = useRef<Promise<void>>(Promise.resolve())

  const doNaming = useCallback(async (namingGroups: NamingGroup[]) => {
    if (namingGroups.length === 0) return
    const pwd = getPwd()
    if (!pwd) return

    // Empreinte relue au moment de l'exécution (pas de l'empilement) : une
    // demande devenue redondante entre-temps sort ici sans appeler Gemini.
    const fp       = groupsFingerprint(namingGroups)
    const storedFp = localStorage.getItem(`group_names_fp_${currentSession.id}`)
    let storedNames: GroupNameResult[] = []
    try { storedNames = JSON.parse(localStorage.getItem(`group_names_${currentSession.id}`) ?? '[]') } catch { /* ignore */ }
    const allNamed = namingGroups.every(g => storedNames.some(n => n.table_number === g.table_number))

    // Répartition inchangée ET tous les camps déjà nommés → ne pas rappeler Gemini
    if (allNamed && storedFp === fp) {
      if (storedNames.length > 0) setGroupNames(storedNames)
      return
    }

    try {
      const allAssertions = await listAssertionsAdmin(pwd, currentSession.id)
      const approved = allAssertions.filter(a => a.status === 'approved')
      const votes = await loadVotesForAnalysis(supabase, pwd, currentSession.id)

      const names = await generateGroupNames({
        sessionId:          currentSession.id,
        sessionTitle:       currentSession.title,
        sessionDescription: currentSession.description ?? null,
        groups:             namingGroups,
        assertions:         approved.map(a => ({ id: a.id, content: a.content })),
        votes:              votes.map(v => ({ member_id: v.member_id, assertion_id: v.assertion_id, vote: v.vote })),
      })

      setGroupNames(names)
      localStorage.setItem(`group_names_${currentSession.id}`, JSON.stringify(names))
      localStorage.setItem(`group_names_fp_${currentSession.id}`, fp)
      updateGroupNames(pwd, currentSession.id, names).catch(() => {})
    } catch {
      // silencieux — les camps restent sans nom
    }
  }, [currentSession.id, currentSession.title, currentSession.description])

  const runNaming = useCallback((namingGroups: NamingGroup[]): Promise<void> => {
    const next = namingChainRef.current
      .catch(() => {})
      .then(() => doNaming(namingGroups))
    namingChainRef.current = next
    return next
  }, [doNaming])

  // Phases post-vote : rattrapage de nommage.
  //
  // Chantier 28 (H26) — les camps sont ceux de la DERNIÈRE ANALYSE, pas les
  // tables physiques : entrer en `allocating` ne doit rien écraser. En pratique
  // E3 a déjà nommé ces mêmes clusters pendant le vote → même empreinte → aucun
  // appel Gemini. L'effet ne sert donc qu'aux séances analysées avant E3, à
  // celles dont le superadmin n'a jamais ouvert l'onglet Analyse, et aux séances
  // dont `group_names` a été corrompu par l'ancien nommage par table physique —
  // d'où l'inclusion de `closed`, seule voie de réparation d'une séance déjà
  // terminée (l'écran de résultats participant en dépend).
  useEffect(() => {
    const p = currentSession.phase
    if (p !== 'allocating' && p !== 'debating' && p !== 'closed') return
    let cancelled = false
    ;(async () => {
      const pwd = getPwd()
      if (!pwd) return
      try {
        const analysis = await loadLatestAnalysis(supabase, pwd, currentSession.id)
        if (cancelled || !analysis || analysis.members.length === 0) return
        runNaming(namingGroupsFromAnalysis(analysis.members))
      } catch { /* silencieux — les camps restent sans nom */ }
    })()
    return () => { cancelled = true }
  }, [currentSession.phase, currentSession.id, runNaming])

  // E3 — Nommage systématique après une analyse en phase vote/pré-vote.
  // Déclenché par AnalysisPanel après un calcul manuel.
  // Retourne la promesse : `AnalysisPanel.handleAnalyze` l'attend pour garder le
  // bouton verrouillé pendant les appels Gemini (chantier 28).
  const handleAnalysisNaming = useCallback((analysis: LoadedAnalysis): Promise<void> => {
    if (!['voting', 'pre_voting'].includes(currentSession.phase)) return Promise.resolve()
    return runNaming(namingGroupsFromAnalysis(analysis.members))
  }, [currentSession.phase, runNaming])

  async function handleAssignGroup(tableNumber: number, tableId: string | null) {
    const password = getPwd()!
    setAssigningGroup(tableNumber)
    setAssignError(null)
    try {
      await assignTableToGroup(password, session.id, tableNumber, tableId)
      if (tableId) {
        setSelectedTableId(prev => { const next = { ...prev }; delete next[tableNumber]; return next })
      }
      await loadGroups()
    } catch (e) {
      const msg = extractErr(e)
      if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) {
        onAuthError(); return
      }
      setAssignError(msg)
    } finally {
      setAssigningGroup(null)
    }
  }

  // ── Documentation editing state ────────────────────────────
  const [editingDocs,    setEditingDocs]    = useState(false)
  const [docInfoUrl,     setDocInfoUrl]     = useState(() => session.doc_info_url ?? '')
  const [docSummaryUrl,  setDocSummaryUrl]  = useState(() => session.doc_summary_url ?? '')
  const [docsLoading,    setDocsLoading]    = useState(false)
  const [docsErr,        setDocsErr]        = useState<string | null>(null)
  const [sessionDocs,    setSessionDocs]    = useState({
    doc_info_url:    session.doc_info_url ?? null,
    doc_summary_url: session.doc_summary_url ?? null,
    doc_collab_url:  session.doc_collab_url,
  })

  async function handleSaveDocs(e: React.FormEvent) {
    e.preventDefault()
    const password = getPwd()!
    setDocsLoading(true)
    setDocsErr(null)
    try {
      const updated = await updateSessionDocs(
        password,
        session.id,
        docInfoUrl || null,
        docSummaryUrl || null,
        sessionDocs.doc_collab_url,
      )
      setSessionDocs({
        doc_info_url:    updated.doc_info_url,
        doc_summary_url: updated.doc_summary_url,
        doc_collab_url:  updated.doc_collab_url,
      })
      setEditingDocs(false)
    } catch (e) {
      const msg = extractErr(e)
      if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) {
        onAuthError()
        return
      }
      setDocsErr(msg)
    } finally {
      setDocsLoading(false)
    }
  }

  const load = useCallback(async (filter: TableFilter = tableFilter, sinceDateStr: string = customSince) => {
    const password = getPwd()!
    setLoading(true)
    setError(null)
    try {
      let since: Date | null | undefined
      if (filter === 'all') since = null
      else if (filter === 'custom' && sinceDateStr) since = new Date(sinceDateStr)
      else since = undefined // défaut 48h

      const [attached, available] = await Promise.all([
        listSessionTables(password, session.id),
        listAvailableTables(password, since),
      ])
      setAttachedTables(attached)
      setIsQForced(attached.some(t => t.questionnaire_forced_at != null))
      setAvailableTables(available)
    } catch (e) {
      const msg = extractErr(e)
      if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) {
        onAuthError()
        return
      }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [session.id, onAuthError, tableFilter, customSince])

  useEffect(() => { load() }, [load])

  const loadResponses = useCallback(async () => {
    const password = getPwd()!
    setResponsesLoading(true)
    try {
      const rows = await getQuestionnaireResponses(password, session.id)
      setResponses(rows)
    } catch {
      // non-bloquant : on affiche juste une liste vide
    } finally {
      setResponsesLoading(false)
    }
  }, [session.id])

  useEffect(() => { loadResponses() }, [loadResponses])

  const loadSources = useCallback(async () => {
    setSourcesLoading(true)
    try {
      const rows = await listSessionSources(session.id)
      setSources(rows)
    } catch {
      // non-bloquant
    } finally {
      setSourcesLoading(false)
    }
  }, [session.id])

  useEffect(() => { loadSources() }, [loadSources])

  async function handleDeleteSource() {
    if (!deleteSourceConfirm) return
    const password = getPwd()!
    const target = deleteSourceConfirm
    setDeleteSourceConfirm(null)
    setDeletingSourceId(target.id)
    try {
      await deleteCollabSourceAdmin(password, target.id)
      setSources(prev => prev.filter(s => s.id !== target.id))
    } catch (e) {
      const msg = extractErr(e)
      if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) {
        onAuthError(); return
      }
      setError(msg)
    } finally {
      setDeletingSourceId(null)
    }
  }

  async function handleDeleteResponse() {
    if (!deleteRespConfirm) return
    const password = getPwd()!
    const target = deleteRespConfirm
    setDeleteRespConfirm(null)
    setDeletingRespId(target.id)
    try {
      await deleteQuestionnaireResponse(password, target.id)
      setResponses(prev => prev.filter(r => r.id !== target.id))
      if (expandedResponseId === target.id) setExpandedResponseId(null)
    } catch (e) {
      const msg = extractErr(e)
      if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) {
        onAuthError(); return
      }
      setError(msg)
    } finally {
      setDeletingRespId(null)
    }
  }

  async function handleAttach(tableId: string) {
    const password = getPwd()!
    try {
      await attachTableToSession(password, tableId, session.id)
      const table = availableTables.find(t => t.id === tableId)
      if (table) {
        setAvailableTables(prev => prev.filter(t => t.id !== tableId))
        setAttachedTables(prev => [...prev, table])
        setIsQForced(prev => prev || table.questionnaire_forced_at != null)
      }
    } catch (e) {
      const msg = extractErr(e)
      if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) {
        onAuthError()
        return
      }
      setError(msg)
    }
  }

  async function handleDetach() {
    if (!detachConfirm) return
    const password = getPwd()!
    const target = detachConfirm
    setDetachConfirm(null)
    try {
      await detachTableFromSession(password, target.id)
      const nextAttached = attachedTables.filter(t => t.id !== target.id)
      setAttachedTables(nextAttached)
      setIsQForced(nextAttached.some(t => t.questionnaire_forced_at != null))
      setAvailableTables(prev => [...prev, target])
    } catch (e) {
      const msg = extractErr(e)
      if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) {
        onAuthError()
        return
      }
      setError(msg)
    }
  }

  async function handleDeleteTable() {
    if (!deleteTableConfirm) return
    const password = getPwd()!
    const target = deleteTableConfirm
    setDeleteTableConfirm(null)
    try {
      await deleteTableAdmin(password, target.id)
      setAttachedTables(prev => prev.filter(t => t.id !== target.id))
      setAvailableTables(prev => prev.filter(t => t.id !== target.id))
    } catch (e) {
      const msg = extractErr(e)
      if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) {
        onAuthError()
        return
      }
      setError(msg)
    }
  }

  function csvCell(v: string | number | null | undefined): string {
    if (v === null || v === undefined || v === '') return ''
    if (typeof v === 'number') return String(v)
    return `"${String(v).replace(/"/g, '""')}"`
  }

  async function handleExportQuestionnaires() {
    const password = getPwd()!
    setExportingType('questionnaire')
    setError(null)
    try {
      const rows = await getQuestionnaireResponses(password, session.id)
      const csv  = generateQuestionnaireCSV(rows)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      const slug = session.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)
      a.download = `ecclesia_questionnaires_${slug}_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      const msg = extractErr(e)
      if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) {
        onAuthError()
        return
      }
      setError(msg)
    } finally {
      setExportingType(null)
    }
  }

  async function handleExportSpeakingTimes() {
    const password = getPwd()!
    setExportingType('speaking')
    setError(null)
    try {
      const results = await Promise.all(
        attachedTables.map(t =>
          getTableParticipants(password, t.id).then(parts => ({ table: t, parts }))
        )
      )
      const rows: string[] = [
        '﻿',
        [csvCell('Table'), csvCell('Code'), csvCell('Participant'), csvCell('Tours'), csvCell('Temps total (s)')].join(','),
      ]
      for (const { table: t, parts } of results) {
        for (const p of parts) {
          rows.push([
            csvCell(t.moderator_pseudo ?? `Table ${t.join_code}`),
            csvCell(t.join_code),
            csvCell(p.pseudo),
            p.turn_count,
            Math.round(p.total_ms / 1000),
          ].join(','))
        }
      }
      const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      const slug = session.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)
      a.download = `ecclesia_temps_parole_${slug}_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      const msg = extractErr(e)
      if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) {
        onAuthError()
        return
      }
      setError(msg)
    } finally {
      setExportingType(null)
    }
  }

  async function handleExportHistory() {
    const password = getPwd()!
    setExportingType('history')
    setError(null)
    try {
      const sourceLabel: Record<string, string> = {
        long: 'File longue',
        interactive: 'Coupe file',
        manual: 'Manuel',
      }
      const results = await Promise.all(
        attachedTables.map(t =>
          Promise.all([
            getTableSpeakingTurnsAdmin(password, t.id),
            getTableParticipants(password, t.id),
          ]).then(([turns, parts]) => ({ table: t, turns, parts }))
        )
      )
      const rows: string[] = [
        '﻿',
        [csvCell('Table'), csvCell('Code'), csvCell('Tour'), csvCell('Participant'), csvCell('File'), csvCell('Démarré à'), csvCell('Terminé à'), csvCell('Durée (s)')].join(','),
      ]
      for (const { table: t, turns, parts } of results) {
        const sorted = [...turns].sort(
          (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
        )
        sorted.forEach((turn: TableSpeakingTurnRow, i: number) => {
          const pseudo = parts.find(p => p.participant_id === turn.participant_id)?.pseudo ?? '—'
          const durSec = turn.ended_at
            ? Math.round((new Date(turn.ended_at).getTime() - new Date(turn.started_at).getTime()) / 1000)
            : ''
          rows.push([
            csvCell(t.moderator_pseudo ?? `Table ${t.join_code}`),
            csvCell(t.join_code),
            i + 1,
            csvCell(pseudo),
            csvCell(sourceLabel[turn.source] ?? turn.source),
            csvCell(turn.started_at),
            turn.ended_at ? csvCell(turn.ended_at) : '',
            durSec,
          ].join(','))
        })
      }
      const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      const slug = session.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)
      a.download = `ecclesia_historique_${slug}_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      const msg = extractErr(e)
      if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) {
        onAuthError()
        return
      }
      setError(msg)
    } finally {
      setExportingType(null)
    }
  }

  async function handleToggleQuestionnaire() {
    const password = getPwd()!
    setQActing(true)
    setError(null)
    try {
      if (isQForced) {
        await cancelSessionQuestionnaire(password, session.id)
        setIsQForced(false)
      } else {
        await forceSessionQuestionnaire(password, session.id)
        setIsQForced(true)
      }
    } catch (e) {
      const msg = extractErr(e)
      if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) {
        onAuthError()
        return
      }
      setError(msg)
    } finally {
      setQActing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 -ml-1"
            title="Retour"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 truncate">{session.title}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PHASE_CLASS[currentSession.phase] ?? 'bg-gray-100 text-gray-600'}`}>
              {PHASE_LABEL[currentSession.phase] ?? currentSession.phase}
            </span>
            {session.join_code && (
              <span className="font-mono text-xs tracking-widest text-gray-500">{session.join_code}</span>
            )}
          </div>
        </div>
        {(session.description || session.scheduled_at) && (
          <div className="max-w-3xl mx-auto mt-1.5 pl-9 text-xs text-gray-400 space-y-0.5">
            {session.scheduled_at && (
              <div>{new Date(session.scheduled_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            )}
            {session.description && <div>{session.description}</div>}
          </div>
        )}
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-6">
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between gap-2">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="shrink-0 text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {/* ── Phase bar ───────────────────────────────────── */}
        <PhaseBar
          currentPhase={currentSession.phase}
          nextPhase={nextPhase}
          prevPhase={prevPhase}
          acting={phaseActing}
          onNext={() => nextPhase && setPhaseConfirm({ phase: nextPhase, label: PHASE_LABEL[nextPhase] ?? nextPhase, isBack: false })}
          onPrev={() => prevPhase && setPhaseConfirm({ phase: prevPhase, label: PHASE_LABEL[prevPhase] ?? prevPhase, isBack: true })}
          onPhaseSelect={(phase) => {
            const isBack = PHASE_SEQUENCE.indexOf(phase) < phaseIdx
            setPhaseConfirm({ phase, label: PHASE_LABEL[phase] ?? phase, isBack })
          }}
        />

        {/* ── Barre d'onglets ─────────────────────────────── */}
        <div className="flex gap-1 bg-white rounded-2xl border border-gray-200 p-1">
          {([
            { id: 'live',     label: '🟢 En direct' },
            { id: 'tables',   label: '🪑 Tables' },
            { id: 'prep',     label: '⚙️ Préparation' },
            { id: 'analysis', label: '📊 Analyse' },
          ] as { id: AdminTab; label: string }[]).map(tab => (
            <button
              key={tab.id}
              onClick={() => { sessionStorage.setItem(adminTabKey, tab.id); setActiveTab(tab.id) }}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">Chargement…</div>
        ) : (
          <>
            {/* ── Onglet En direct ─────────────────────────── */}
            {activeTab === 'live' && (
              <div className="space-y-6">
                {showVotingSections && (
                  <SectionAccordion
                    title="Statistiques de vote"
                    open={statsOpen}
                    onToggle={() => setStatsOpen(o => !o)}
                    badge={votingStats ? (
                      votingStats.remote_count > 0
                        ? `${votingStats.voter_count}/${votingStats.member_count} ont voté · ${votingStats.attending_count} présentiels / ${votingStats.remote_count} à distance`
                        : `${votingStats.voter_count}/${votingStats.member_count} ont voté`
                    ) : undefined}
                  >
                    {statsLoading && !votingStats ? (
                      <p className="text-sm text-gray-400 py-2">Chargement…</p>
                    ) : votingStats ? (
                      <VotingStatsPanel stats={votingStats} />
                    ) : null}
                  </SectionAccordion>
                )}

                <ModerationPolicyEditor
                  currentPolicy={currentSession.moderation_policy}
                  onSave={async (policy) => {
                    const pwd = getPwd()!
                    await updateSessionConfig(pwd, currentSession.id, policy)
                    setCurrentSession(prev => ({ ...prev, moderation_policy: policy }))
                    if (policy === 'open') {
                      const pending = assertions.filter(a => a.status === 'pending')
                      for (const a of pending) {
                        try { await approveAssertion(pwd, a.id) } catch {}
                      }
                      await loadAssertions()
                    }
                  }}
                />

                {showVotingSections && (
                  <SectionAccordion
                    title="Assertions"
                    open={assertionsOpen}
                    onToggle={() => setAssertionsOpen(o => !o)}
                    badge={assertionsLoading ? '…' : `${assertions.filter(a => a.status === 'pending').length} en attente`}
                    onRefresh={loadAssertions}
                  >
                    {assertionsErr && (
                      <p className="text-sm text-red-600 mb-2">{assertionsErr}</p>
                    )}
                    <AssertionsPanel
                      assertions={assertions}
                      voteResults={voteResults}
                      tab={assertionsTab}
                      onTabChange={setAssertionsTab}
                      session={currentSession}
                      actingId={actingAssertionId}
                      onApprove={handleApprove}
                      onReject={handleReject}
                      onApproveAll={handleApproveAll}
                      onReapprove={handleApprove}
                      onAdminSubmit={handleAdminSubmitAssertion}
                      onDelete={handleDeleteAssertions}
                    />
                  </SectionAccordion>
                )}

                {showVotingSections && (
                  <LLMModerationPanel session={currentSession} password={getPwd()!} />
                )}

                {showVotingSections && (
                  <AnalysisPanel
                    sessionId={session.id}
                    password={getPwd()!}
                    assertions={assertions}
                    onAuthError={onAuthError}
                    onAnalysisComplete={handleAnalysisNaming}
                    groupNames={groupNames}
                    totalMembers={members.length > 0 ? members.length : undefined}
                    sessionPhase={session.phase}
                  />
                )}

                {showVotingSections && (
                  <SectionAccordion
                    title="Participants inscrits"
                    open={membersOpen}
                    onToggle={() => setMembersOpen(o => !o)}
                    badge={membersLoading ? '…' : `${members.length}`}
                    onRefresh={loadMembers}
                  >
                    <MembersPanel
                      members={members}
                      loading={membersLoading}
                      onToggleModerator={handleToggleModerator}
                    />
                  </SectionAccordion>
                )}

                {showVotingSections && voteResults.length > 0 && (
                  <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    <button
                      onClick={() => setSynthOpen(o => !o)}
                      className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                    >
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Synthèse des votes
                        <span className="ml-2 font-normal normal-case text-gray-400">
                          ({voteResults.length} assertion{voteResults.length !== 1 ? 's' : ''} approuvée{voteResults.length !== 1 ? 's' : ''})
                        </span>
                      </span>
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${synthOpen ? 'rotate-180' : ''}`}
                        viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      >
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>
                    {synthOpen && (
                      <div className="border-t border-gray-100 px-5 py-4">
                        <VoteResultsSummary results={voteResults} loading={false} />
                      </div>
                    )}
                  </section>
                )}
              </div>
            )}

            {/* ── Onglet Tables ────────────────────────────── */}
            {activeTab === 'tables' && (
              <div className="space-y-4">
                {/* Chantier 19 — Allocation v2 : déclenchement manuel en phase
                    `allocating` (§7). Le panneau « Réponses modérateur » (E4)
                    a été supprimé : la demande d'encadrement est traitée par
                    la règle 5 de l'algorithme.
                    Chantier 33 — déplacé depuis l'onglet « En direct » : sa
                    place est ici, avec le reste de la gestion des tables. */}
                {currentSession.phase === 'allocating' && (
                  <AllocationPanel
                    // Chantier 25 (H14) — l'état de travail du panneau est
                    // restauré depuis sessionStorage au montage : la clé garantit
                    // un remontage si la séance change sans démontage du parent.
                    key={currentSession.id}
                    sessionId={currentSession.id}
                    password={getPwd()!}
                    onApplied={loadGroups}
                    onAuthError={onAuthError}
                  />
                )}

                {/* Groupes (allocating/debating) */}
                {(currentSession.phase === 'allocating' || currentSession.phase === 'debating') && (
                  <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden px-5 py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Groupes</h3>
                      <div className="flex items-center gap-2">
                        {groups.length > 0 && (
                          <button
                            onClick={() => setRosterOpen(true)}
                            className="text-xs text-gray-400 hover:text-indigo-600 transition-colors"
                            title="Vue récapitulative, prête à capturer en screenshot"
                          >
                            🖨️ Récapitulatif
                          </button>
                        )}
                        {groupsLoading ? (
                          <Spinner />
                        ) : groupsSyncedAt ? (
                          <span
                            className="flex items-center gap-1 text-xs text-gray-400"
                            title="Se met à jour automatiquement (glisser-déposer local ou changement fait ailleurs)"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                            à jour à {groupsSyncedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {assignError && (
                      <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between gap-2">
                        <span>{assignError}</span>
                        <button onClick={() => setAssignError(null)} className="text-red-400 hover:text-red-600">✕</button>
                      </div>
                    )}
                    {groups.length > 0 && <MemberBadgeLegend />}
                    {groups.length === 0 && !groupsLoading ? (
                      <p className="text-sm text-gray-400 py-4 text-center">Aucun groupe créé</p>
                    ) : (
                      <DndContext
                        sensors={dndSensors}
                        onDragStart={(e: DragStartEvent) => {
                          const member = groups.flatMap(g => g.members).find(m => m.member_id === e.active.id)
                          if (member) setDraggingMember(member)
                        }}
                        onDragEnd={handleGroupDragEnd}
                        onDragCancel={() => setDraggingMember(null)}
                      >
                      <div className="space-y-3">
                        {groups.map(g => (
                          <DroppableGroupCard key={g.table_number} tableNumber={g.table_number}>
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-sm font-bold text-indigo-700">Table N°{g.table_number}</span>
                              <span className="text-xs text-gray-400">({g.members.length} membre{g.members.length !== 1 ? 's' : ''})</span>
                              {/* Chantier 19 — statut des seuils, recalculé en direct */}
                              {(() => {
                                const d = groupDiagnostics.find(x => x.table_number === g.table_number)
                                if (!d) return null
                                const broken = [
                                  !d.rule1_ok && `actifs ${d.actives}/${d.actives_threshold}`,
                                  !d.rule3_ok && allocInputs?.opinionsAvailable && 'hétérogénéité',
                                  !d.rule4_ok && `anciens ${d.veterans}/${d.veterans_threshold}`,
                                ].filter(Boolean) as string[]
                                return (
                                  <span
                                    title={broken.length === 0
                                      ? 'Tous les seuils atteints'
                                      : `Seuils non atteints : ${broken.join(', ')}`}
                                    className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                                      broken.length === 0
                                        ? 'bg-green-50 text-green-700'
                                        : 'bg-amber-100 text-amber-700'
                                    }`}
                                  >
                                    {broken.length === 0 ? '✓ seuils OK' : `⚠️ ${broken.join(' · ')}`}
                                  </span>
                                )
                              })()}
                              {(() => {
                                const d = groupDiagnostics.find(x => x.table_number === g.table_number)
                                if (!d) return null
                                return d.recordable ? (
                                  <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded shrink-0"
                                    title="Aucun non-consentant et table non homogène">
                                    🎙️ enregistrable
                                  </span>
                                ) : (
                                  <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded shrink-0"
                                    title={d.non_consenting > 0
                                      ? `${d.non_consenting} personne(s) non consentante(s)`
                                      : "Table homogène en opinion — un enregistrement n'y apporterait rien"}>
                                    non enregistrable
                                  </span>
                                )
                              })()}
                              {movingMember && <span className="text-xs text-indigo-400 animate-pulse">…</span>}
                            </div>
                            {/* Chantier 26 (H21) — nom du modérateur affecté à cette table, ou
                                attente explicite si la table doit être animée mais que le
                                modérateur annoncé n'est pas encore inscrit. Chantier 36 : un
                                membre `is_moderator` ne doit apparaître qu'ici, jamais en plus
                                dans la liste de puces ci-dessous (cf. filtre sur `g.members`). */}
                            {(() => {
                              const mods = g.members.filter(m => m.is_moderator)
                              if (mods.length > 0) {
                                return (
                                  <div className="mb-2 flex items-center gap-1.5 flex-wrap">
                                    {mods.map(mod => (
                                      <span key={mod.member_id}
                                        className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg border border-indigo-100 inline-flex items-center gap-1">
                                        🎙️ Modérateur : <strong>{mod.pseudo}</strong>
                                        <button
                                          onClick={() => handleRemoveTableModerator(mod.member_id)}
                                          disabled={movingMember}
                                          className="text-gray-400 hover:text-red-600 underline disabled:opacity-50"
                                          title="Redevient un participant ordinaire de cette table"
                                        >
                                          Retirer
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                )
                              }
                              if (g.moderated) {
                                return (
                                  <div className="mb-2">
                                    <AddModeratorControl
                                      tableNumber={g.table_number}
                                      candidates={members}
                                      onAssign={memberId => handleAssignTableModerator(g.table_number, memberId)}
                                      disabled={movingMember}
                                    />
                                  </div>
                                )
                              }
                              return null
                            })()}
                            {/* Chantier 20 (G6) — composition par camp visible directement sur la
                                carte, sans avoir à déplier « Santé des tables » plus bas. */}
                            {(() => {
                              const d = groupDiagnostics.find(x => x.table_number === g.table_number)
                              return d ? (
                                <div className="mb-2">
                                  <CampCompositionBar d={d} />
                                </div>
                              ) : null
                            })()}
                            {/* Chantier 28 (H26) — le nom de camp Gemini indexé sur le numéro de
                                table physique a été retiré : sous l'allocation v2 la table mélange
                                volontairement plusieurs camps, ce nom était donc faux. La barre de
                                composition ci-dessus donne l'information exacte. */}
                            <div className="flex flex-wrap gap-1.5 mb-3">
                              {g.members.filter(m => !m.is_moderator).map(m => (
                                <DraggableMemberChip
                                  key={m.member_id}
                                  memberId={m.member_id}
                                  pseudo={m.pseudo}
                                  profile={memberProfiles.get(m.member_id)}
                                />
                              ))}
                            </div>
                            <div className="border-t border-gray-100 pt-3">
                              {g.join_code ? (
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-lg border border-green-200">
                                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                                      <span className="font-mono tracking-widest">{g.join_code}</span>
                                    </span>
                                    <span className="text-xs text-gray-400">rattachée</span>
                                  </div>
                                  <button
                                    onClick={() => handleAssignGroup(g.table_number, null)}
                                    disabled={assigningGroup === g.table_number}
                                    className="py-1 px-2.5 text-xs border border-gray-200 rounded-lg text-gray-500
                                      hover:border-red-200 hover:text-red-600 hover:bg-red-50 transition-colors
                                      disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {assigningGroup === g.table_number ? '…' : 'Détacher'}
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <select
                                    value={selectedTableId[g.table_number] ?? ''}
                                    onChange={e => setSelectedTableId(prev => ({ ...prev, [g.table_number]: e.target.value }))}
                                    className="flex-1 text-xs px-2 py-1.5 border border-gray-300 rounded-lg
                                      focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                                  >
                                    <option value="">— Sélectionner une table —</option>
                                    {dropdownTables.map(t => (
                                      <option key={t.id} value={t.id}>
                                        {t.join_code}{t.moderator_pseudo ? ` (${t.moderator_pseudo})` : ''}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={() => {
                                      const tableId = selectedTableId[g.table_number]
                                      if (tableId) handleAssignGroup(g.table_number, tableId)
                                    }}
                                    disabled={!selectedTableId[g.table_number] || assigningGroup === g.table_number}
                                    className="py-1.5 px-3 text-xs font-medium border border-indigo-200 rounded-lg
                                      text-indigo-600 hover:bg-indigo-50 transition-colors
                                      disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {assigningGroup === g.table_number ? '…' : 'Rattacher'}
                                  </button>
                                </div>
                              )}
                            </div>
                          </DroppableGroupCard>
                        ))}
                      </div>
                      <DragOverlay dropAnimation={null}>
                        {draggingMember && (
                          <div className="px-2.5 py-1 bg-indigo-600 text-white text-xs font-medium rounded-lg shadow-lg opacity-90">
                            {draggingMember.pseudo}
                          </div>
                        )}
                      </DragOverlay>
                      </DndContext>
                    )}
                    {/* Chantier 19 (§7) — santé des tables, recalculée en
                        direct après chaque glisser-déposer. */}
                    {groupDiagnostics.length > 0 && (
                      <details className="border-t border-gray-100 pt-3">
                        <summary className="text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:text-indigo-600 transition-colors">
                          Santé des tables ({groupDiagnostics.filter(d => d.rule1_ok && d.rule4_ok).length}/{groupDiagnostics.length} conformes)
                        </summary>
                        <div className="mt-3">
                          <TableDiagnosticsList diagnostics={groupDiagnostics} compact />
                          {!allocInputs?.opinionsAvailable && (
                            <p className="text-xs text-gray-400 mt-2 leading-snug">
                              Règle 3 (hétérogénéité) non évaluable : aucune analyse des camps d'opinion.
                            </p>
                          )}
                        </div>
                      </details>
                    )}

                    {currentSession.phase === 'allocating' && (
                      <div className="space-y-2">
                        {groups.some(g => !g.join_code) && (
                          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                            ⚠️ {groups.filter(g => !g.join_code).length} groupe(s) sans table rattachée —
                            les participants concernés ne pourront pas rejoindre directement.
                          </p>
                        )}
                        <button
                          onClick={() => setShowDebateConfirm(true)}
                          className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white
                            text-sm font-semibold rounded-xl transition-colors"
                        >
                          Ouvrir le débat →
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Notification table créée */}
                {newTableCode && (
                  <div className="px-5 py-3 bg-green-50 rounded-2xl border border-green-200 flex items-center justify-between gap-2 text-sm text-green-800">
                    <span>Table créée ! Code : <strong className="font-mono tracking-widest">{newTableCode}</strong></span>
                    <button onClick={() => setNewTableCode(null)} className="shrink-0 text-green-500 hover:text-green-700">✕</button>
                  </div>
                )}

                {/* Tables rattachées (sous-accordion) */}
                <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setRattacheesOpen(o => !o)}
                    className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      Tables rattachées
                      {attachedTables.length > 0 && (
                        <span className="ml-2 font-normal normal-case">({attachedTables.length})</span>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={e => { e.stopPropagation(); handleCreateTable(false) }}
                        disabled={creatingTable}
                        className="py-1 px-2.5 text-xs font-medium border border-indigo-200 rounded-lg
                          text-indigo-600 hover:bg-indigo-50 transition-colors
                          disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {creatingTable ? '…' : '+ Créer une table'}
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleCreateTable(true) }}
                        disabled={creatingTable}
                        className="py-1 px-2.5 text-xs font-medium border border-gray-200 rounded-lg
                          text-gray-600 hover:bg-gray-50 transition-colors
                          disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {creatingTable ? '…' : '+ Sans admin'}
                      </button>
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${rattacheesOpen ? 'rotate-180' : ''}`}
                        viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      >
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </div>
                  </button>
                  {rattacheesOpen && (
                    <div className="border-t border-gray-50 px-5 py-3">
                      {attachedTables.length === 0 ? (
                        <p className="text-sm text-gray-400 py-4 text-center">Aucune table rattachée</p>
                      ) : (
                        <div className="space-y-2">
                          {attachedTables.map(t => (
                            <ExpandableTableRow
                              key={t.id}
                              table={t}
                              onDelete={() => setDeleteTableConfirm(t)}
                              otherTables={attachedTables.filter(ot => ot.id !== t.id)}
                              onParticipantMoved={load}
                              action={
                                <button
                                  onClick={() => setDetachConfirm(t)}
                                  className="shrink-0 py-1.5 px-3 text-xs font-medium border border-gray-200 rounded-lg
                                    text-gray-600 hover:border-red-200 hover:text-red-600 hover:bg-red-50 transition-colors"
                                >
                                  Détacher
                                </button>
                              }
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>

                {/* Tables disponibles à rattacher (sous-accordion) */}
                <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setDisponiblesOpen(o => !o)}
                    className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      Tables disponibles à rattacher
                      {availableTables.length > 0 && (
                        <span className="ml-2 font-normal normal-case">({availableTables.length})</span>
                      )}
                    </span>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${disponiblesOpen ? 'rotate-180' : ''}`}
                      viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  {disponiblesOpen && (
                    <div className="border-t border-gray-50 px-5 py-3">
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        {(['48h', 'all', 'custom'] as const).map(f => (
                          <button
                            key={f}
                            onClick={() => {
                              setTableFilter(f)
                              load(f, customSince)
                            }}
                            className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                              tableFilter === f
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'text-gray-500 border-gray-300 hover:border-indigo-400 hover:text-indigo-600'
                            }`}
                          >
                            {f === '48h' ? 'Dernières 48h' : f === 'all' ? 'Tout afficher' : 'Depuis…'}
                          </button>
                        ))}
                        {tableFilter === 'custom' && (
                          <input
                            type="datetime-local"
                            value={customSince}
                            onChange={e => {
                              setCustomSince(e.target.value)
                              if (e.target.value) load('custom', e.target.value)
                            }}
                            className="px-2 py-1 text-xs border border-gray-300 rounded-lg
                              focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        )}
                      </div>
                      {availableTables.length === 0 ? (
                        <p className="text-sm text-gray-400 py-4 text-center">Aucune table disponible</p>
                      ) : (
                        <div className="space-y-2">
                          {availableTables.map(t => (
                            <ExpandableTableRow
                              key={t.id}
                              table={t}
                              onDelete={() => setDeleteTableConfirm(t)}
                              otherTables={[]}
                              onParticipantMoved={() => {}}
                              action={
                                <button
                                  onClick={() => handleAttach(t.id)}
                                  className="shrink-0 py-1.5 px-3 text-xs font-medium border border-indigo-200 rounded-lg
                                    text-indigo-600 hover:bg-indigo-50 transition-colors"
                                >
                                  Rattacher
                                </button>
                              }
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* ── Onglet Préparation ───────────────────────── */}
            {activeTab === 'prep' && (
              <div className="space-y-6">
                {session.join_code && <ShareLinkBanner joinCode={session.join_code} />}

                {/* Documentation (accordion) */}
                <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setDocsOpen(o => !o)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Documentation
                    </span>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${docsOpen ? 'rotate-180' : ''}`}
                      viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  {docsOpen && (
                    <div className="border-t border-gray-100 px-5 py-4">
                      <div className="flex items-center justify-between mb-3">
                        {!editingDocs && (
                          <button
                            onClick={() => {
                              setDocInfoUrl(sessionDocs.doc_info_url ?? '')
                              setDocSummaryUrl(sessionDocs.doc_summary_url ?? '')
                              setDocsErr(null)
                              setEditingDocs(true)
                            }}
                            className="text-xs text-indigo-600 hover:underline"
                          >
                            Modifier
                          </button>
                        )}
                      </div>
                      {editingDocs ? (
                        <form onSubmit={handleSaveDocs} className="space-y-3">
                          <DocFileField label="Fiche information" placeholder="fiche-info.html" value={docInfoUrl} onChange={setDocInfoUrl} />
                          <DocFileField label="Résumé" placeholder="résumé-info.html" value={docSummaryUrl} onChange={setDocSummaryUrl} />
                          {docsErr && (
                            <p className="text-xs text-red-600">{docsErr}</p>
                          )}
                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setEditingDocs(false)}
                              className="flex-1 py-2 text-xs border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                              Annuler
                            </button>
                            <button
                              type="submit"
                              disabled={docsLoading}
                              className="flex-1 py-2 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400
                                text-white rounded-xl transition-colors"
                            >
                              {docsLoading ? 'Enregistrement…' : 'Enregistrer'}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="space-y-2 text-sm">
                          <DocLink label="Fiche information" url={sessionDocs.doc_info_url} />
                          <DocLink label="Résumé" url={sessionDocs.doc_summary_url} />
                          {!sessionDocs.doc_info_url && !sessionDocs.doc_summary_url && (
                            <p className="text-xs text-gray-400">Aucun document PDF configuré</p>
                          )}
                          {session.join_code && (
                            <div className="flex items-center gap-2 pt-1 border-t border-gray-100 mt-2">
                              <span className="text-gray-500 text-xs shrink-0">Sources collaboratives</span>
                              <a
                                href={`#collab/${session.join_code}`}
                                className="text-indigo-600 hover:underline text-xs"
                              >
                                Ouvrir le document →
                              </a>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* ── Onglet Analyse ───────────────────────────── */}
            {activeTab === 'analysis' && (
              <div className="space-y-6">
                {/* Synthèse des votes */}
                {showVotingSections && voteResults.length > 0 && (
                  <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    <button
                      onClick={() => setSynthOpen(o => !o)}
                      className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                    >
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Synthèse des votes
                        <span className="ml-2 font-normal normal-case text-gray-400">
                          ({voteResults.length} assertion{voteResults.length !== 1 ? 's' : ''} approuvée{voteResults.length !== 1 ? 's' : ''})
                        </span>
                      </span>
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${synthOpen ? 'rotate-180' : ''}`}
                        viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      >
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>
                    {synthOpen && (
                      <div className="border-t border-gray-100 px-5 py-4">
                        <VoteResultsSummary results={voteResults} loading={false} />
                      </div>
                    )}
                  </section>
                )}

                {/* Thèmes */}
                <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setThemesOpen(o => !o)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left
                      hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Thèmes — classement par moyenne
                      {responses.length > 0 && (
                        <span className="ml-2 font-normal normal-case text-gray-400">
                          ({responses.length} réponse{responses.length > 1 ? 's' : ''})
                        </span>
                      )}
                    </span>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${themesOpen ? 'rotate-180' : ''}`}
                      viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  {themesOpen && (
                    <div className="px-5 pb-5 border-t border-gray-100">
                      <ThemeDashboard responses={responses} loading={responsesLoading} />
                    </div>
                  )}
                </section>

                {/* Réponses au questionnaire */}
                <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setResponsesOpen(o => !o)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left
                      hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Réponses au questionnaire
                      {responses.length > 0 && (
                        <span className="ml-2 font-normal normal-case text-gray-400">
                          ({responses.length})
                        </span>
                      )}
                    </span>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${responsesOpen ? 'rotate-180' : ''}`}
                      viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  {responsesOpen && (
                    <div className="border-t border-gray-100">
                      <ResponsesList
                        responses={responses}
                        loading={responsesLoading}
                        expandedId={expandedResponseId}
                        deletingId={deletingRespId}
                        onToggle={id => setExpandedResponseId(prev => prev === id ? null : id)}
                        onDeleteRequest={r => setDeleteRespConfirm(r)}
                      />
                    </div>
                  )}
                </section>

                {/* Recrutement modérateurs — F15 : zoom sur qui a répondu vouloir
                    staffer au questionnaire de fin de séance (staff_interest, texte
                    libre). Signal de recrutement pur, indépendant de session_members.
                    is_moderator (modérateur POUR cette séance, utilisé par l'algo
                    d'allocation) — voir CLAUDE.md. */}
                <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setStaffOpen(o => !o)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left
                      hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      🙋 Recrutement modérateurs
                      {staffInterestResponses.length > 0 && (
                        <span className="ml-2 font-normal normal-case text-gray-400">
                          ({staffInterestResponses.length})
                        </span>
                      )}
                    </span>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${staffOpen ? 'rotate-180' : ''}`}
                      viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  {staffOpen && (
                    <div className="border-t border-gray-100 px-5 py-4">
                      <p className="text-xs text-gray-400 mb-3">
                        Personnes ayant répondu vouloir aider (modérer, préparer les fiches, communication…)
                        au questionnaire de fin de séance — à solliciter pour de futures séances. Sans lien
                        avec « modérateur pour cette séance » (onglet Participants).
                      </p>
                      <StaffInterestList responses={staffInterestResponses} loading={responsesLoading} />
                    </div>
                  )}
                </section>

                {/* Sources collaboratives */}
                <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setSourcesOpen(o => !o)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left
                      hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Sources collaboratives
                      {sources.length > 0 && (
                        <span className="ml-2 font-normal normal-case text-gray-400">
                          ({sources.length} source{sources.length > 1 ? 's' : ''})
                        </span>
                      )}
                    </span>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${sourcesOpen ? 'rotate-180' : ''}`}
                      viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  {sourcesOpen && (
                    <div className="border-t border-gray-100 px-5 py-4">
                      <CollabSourcesList
                        sources={sources}
                        loading={sourcesLoading}
                        deletingId={deletingSourceId}
                        onDeleteRequest={s => setDeleteSourceConfirm(s)}
                      />
                    </div>
                  )}
                </section>

                {/* Actions post-séance */}
                <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setPostSessionOpen(o => !o)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Actions post-séance
                    </span>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${postSessionOpen ? 'rotate-180' : ''}`}
                      viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  {postSessionOpen && (
                    <div className="border-t border-gray-100 px-5 py-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">Questionnaire forcé</span>
                        <button
                          onClick={() => setShowQConfirm(true)}
                          disabled={qActing}
                          className="py-1.5 px-3 text-xs font-medium border rounded-lg transition-colors
                            disabled:opacity-50 disabled:cursor-not-allowed
                            border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                        >
                          {qActing ? '…' : isQForced ? 'Annuler forçage' : 'Forcer questionnaire'}
                        </button>
                      </div>
                      <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
                        <span className="text-xs font-medium text-gray-500">Exports CSV</span>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={handleExportQuestionnaires}
                            disabled={exportingType !== null}
                            className="py-1.5 px-3 text-xs font-medium border border-teal-200 rounded-lg
                              text-teal-700 hover:bg-teal-50 transition-colors
                              disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {exportingType === 'questionnaire' ? <><Spinner /> Export…</> : 'Questionnaire'}
                          </button>
                          <button
                            onClick={handleExportSpeakingTimes}
                            disabled={exportingType !== null}
                            className="py-1.5 px-3 text-xs font-medium border border-teal-200 rounded-lg
                              text-teal-700 hover:bg-teal-50 transition-colors
                              disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {exportingType === 'speaking' ? <><Spinner /> Export…</> : 'Temps de parole'}
                          </button>
                          <button
                            onClick={handleExportHistory}
                            disabled={exportingType !== null}
                            className="py-1.5 px-3 text-xs font-medium border border-teal-200 rounded-lg
                              text-teal-700 hover:bg-teal-50 transition-colors
                              disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {exportingType === 'history' ? <><Spinner /> Export…</> : 'Historique'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              </div>
            )}
          </>
        )}
      </main>

      {deleteSourceConfirm && (
        <ConfirmModal
          title="Supprimer cette source"
          body={`Supprimer définitivement "${deleteSourceConfirm.title}" (${deleteSourceConfirm.pseudo}) ? Cette action est irréversible.`}
          confirmLabel="Supprimer"
          onConfirm={handleDeleteSource}
          onCancel={() => setDeleteSourceConfirm(null)}
        />
      )}

      {detachConfirm && (
        <ConfirmModal
          title="Détacher la table"
          body={`Détacher la table ${detachConfirm.join_code} de cette séance ?`}
          confirmLabel="Détacher"
          onConfirm={handleDetach}
          onCancel={() => setDetachConfirm(null)}
        />
      )}

      {deleteTableConfirm && (
        <ConfirmModal
          title="Supprimer la table"
          body={`Supprimer définitivement la table ${deleteTableConfirm.join_code} ? Tous les participants, tours et files seront supprimés.`}
          confirmLabel="Supprimer"
          onConfirm={handleDeleteTable}
          onCancel={() => setDeleteTableConfirm(null)}
        />
      )}

      {deleteRespConfirm && (
        <ConfirmModal
          title="Supprimer cette réponse"
          body="Supprimer définitivement cette réponse au questionnaire ? Cette action est irréversible."
          confirmLabel="Supprimer"
          onConfirm={handleDeleteResponse}
          onCancel={() => setDeleteRespConfirm(null)}
        />
      )}

      {showQConfirm && (
        <ConfirmModal
          title={isQForced ? 'Annuler le forçage' : 'Forcer le questionnaire'}
          body={isQForced
            ? "Réinitialiser le forçage du questionnaire ? Les participants qui se reconnecteront n'auront plus le modal ouvert automatiquement."
            : "Ouvrir automatiquement le questionnaire chez tous les participants actuellement connectés aux tables de cette séance ?"}
          confirmLabel={isQForced ? 'Annuler le forçage' : 'Forcer'}
          onConfirm={() => { setShowQConfirm(false); handleToggleQuestionnaire() }}
          onCancel={() => setShowQConfirm(false)}
        />
      )}

      {showDebateConfirm && (
        <ConfirmModal
          title="Ouvrir le débat"
          body="Passer la séance en phase « Débat » ? Les participants verront le code de leur table et pourront rejoindre immédiatement."
          confirmLabel="Ouvrir le débat →"
          onConfirm={() => { setShowDebateConfirm(false); handlePhaseChange('debating') }}
          onCancel={() => setShowDebateConfirm(false)}
        />
      )}

      {rosterOpen && (
        <TableRosterModal groups={groups} onClose={() => setRosterOpen(false)} />
      )}

      {phaseConfirm && (
        <ConfirmModal
          title={phaseConfirm.isBack ? '← Revenir à la phase précédente' : `Passer en phase « ${phaseConfirm.label} »`}
          body={phaseConfirm.isBack
            ? `Revenir à « ${phaseConfirm.label} » ? Les participants verront leur écran changer immédiatement.`
            : `Passer la séance en phase « ${phaseConfirm.label} » ? Les participants verront leur écran changer immédiatement.`}
          confirmLabel={phaseConfirm.isBack ? '← Revenir' : 'Confirmer →'}
          onConfirm={() => handlePhaseChange(phaseConfirm.phase)}
          onCancel={() => setPhaseConfirm(null)}
        />
      )}
    </div>
  )
}

// ── ModerationPolicyEditor ────────────────────────────────────────

function ModerationPolicyEditor({
  currentPolicy,
  onSave,
}: {
  currentPolicy: ModerationPolicy
  onSave(policy: ModerationPolicy): Promise<void>
}) {
  const [selected, setSelected] = useState<ModerationPolicy>(currentPolicy)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const dirty = selected !== currentPolicy

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(selected)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      // silencieux — l'erreur est gérée par le parent
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 px-5 py-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Politique de modération
      </p>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {(['closed', 'open', 'ai'] as const).map(val => (
          <button
            key={val}
            type="button"
            onClick={() => setSelected(val)}
            className={`py-2 px-3 rounded-xl border-2 text-xs font-medium transition-all ${
              selected === val
                ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                : 'border-gray-200 text-gray-600 hover:border-indigo-200'
            }`}
          >
            {val === 'closed' ? '🔒 Fermée' : val === 'open' ? '🔓 Ouverte' : '🤖 IA'}
          </button>
        ))}
      </div>
      {dirty && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Enregistrement…' : saved ? '✅ Enregistré' : 'Enregistrer'}
        </button>
      )}
    </section>
  )
}

// ── PhaseBar ──────────────────────────────────────────────────────

const PHASE_SEQUENCE_LABELS: { phase: Session['phase']; short: string }[] = [
  { phase: 'draft',         short: 'Brouillon' },
  { phase: 'pre_voting',    short: 'Pré-vote' },
  { phase: 'voting',        short: 'Vote présentiel' },
  { phase: 'allocating',    short: 'Allocation' },
  { phase: 'debating',      short: 'Débat' },
  { phase: 'questionnaire', short: 'Questionnaire' },
  { phase: 'closed',        short: 'Clôturée' },
]

function PhaseBar({
  currentPhase,
  nextPhase,
  prevPhase,
  acting,
  onNext,
  onPrev,
  onPhaseSelect,
}: {
  currentPhase: Session['phase']
  nextPhase: Session['phase'] | null
  prevPhase: Session['phase'] | null
  acting: boolean
  onNext(): void
  onPrev(): void
  onPhaseSelect(phase: Session['phase']): void
}) {
  const currentIdx = PHASE_SEQUENCE_LABELS.findIndex(p => p.phase === currentPhase)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4 space-y-4">
      {/* Step indicators */}
      <div className="flex items-center gap-0">
        {PHASE_SEQUENCE_LABELS.map((p, i) => {
          const isPast    = i < currentIdx
          const isCurrent = i === currentIdx
          const isFuture  = i > currentIdx
          return (
            <div key={p.phase} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center flex-shrink-0">
                {isCurrent ? (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-indigo-600 text-white ring-2 ring-indigo-200">
                    {i + 1}
                  </div>
                ) : (
                  <button
                    onClick={() => onPhaseSelect(p.phase)}
                    disabled={acting}
                    title={`Aller en ${p.short}`}
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors disabled:cursor-not-allowed ${
                      isPast
                        ? 'bg-indigo-200 text-indigo-700 hover:bg-indigo-300 hover:ring-2 hover:ring-indigo-300 hover:ring-offset-1'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:ring-2 hover:ring-gray-300 hover:ring-offset-1'
                    }`}
                  >
                    {isPast ? '✓' : i + 1}
                  </button>
                )}
                <span className={`mt-1 text-[10px] font-medium text-center leading-tight hidden sm:block ${
                  isCurrent ? 'text-indigo-700' : isFuture ? 'text-gray-400' : 'text-indigo-400'
                }`}>
                  {p.short}
                </span>
              </div>
              {i < PHASE_SEQUENCE_LABELS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 ${i < currentIdx ? 'bg-indigo-300' : 'bg-gray-200'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {prevPhase && (
          <button
            onClick={onPrev}
            disabled={acting}
            className="text-xs text-gray-400 hover:text-gray-600 py-1.5 px-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors disabled:opacity-50"
          >
            ← {PHASE_LABEL[prevPhase]}
          </button>
        )}
        <div className="flex-1" />
        {nextPhase && (
          <button
            onClick={onNext}
            disabled={acting}
            className="text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 py-1.5 px-4 rounded-lg transition-colors disabled:opacity-50"
          >
            {acting ? '…' : `Passer en ${PHASE_LABEL[nextPhase]} →`}
          </button>
        )}
        {!nextPhase && currentPhase !== 'closed' && (
          <span className="text-xs text-gray-400">Phase finale</span>
        )}
      </div>
    </div>
  )
}

// ── SectionAccordion ──────────────────────────────────────────────

function SectionAccordion({
  title,
  open,
  onToggle,
  badge,
  onRefresh,
  children,
}: {
  title: string
  open: boolean
  onToggle(): void
  badge?: string
  onRefresh?: () => void
  children: React.ReactNode
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 px-5 py-4">
      <div className="flex items-center justify-between mb-0">
        <button onClick={onToggle} className="flex items-center gap-2 flex-1 text-left">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</h2>
          {badge && (
            <span className="text-xs font-medium bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{badge}</span>
          )}
          <svg
            className={`ml-auto w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          ><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="ml-2 p-1 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            title="Rafraîchir"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
        )}
      </div>
      {open && <div className="mt-3">{children}</div>}
    </section>
  )
}

// ── VotingStatsPanel ──────────────────────────────────────────────

function VotingStatsPanel({ stats }: { stats: SessionVotingStats }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {[
          { emoji: '👥', label: 'Participants inscrits',    val: stats.member_count },
          { emoji: '📋', label: 'Onboarding complété',      val: stats.onboarded_count },
          { emoji: '🗳️', label: 'Ont voté au moins 1 fois', val: stats.voter_count },
          { emoji: '💬', label: 'Assertions approuvées',    val: stats.approved_assertion_count },
        ].map(item => (
          <div key={item.label} className="bg-gray-50 rounded-xl p-3 flex items-center gap-2">
            <span className="text-xl">{item.emoji}</span>
            <div>
              <p className="text-lg font-bold text-gray-900">{item.val}</p>
              <p className="text-xs text-gray-500 leading-tight">{item.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Répartition présentiel / distance (si des votants à distance existent) */}
      {stats.remote_count > 0 && (
        <div className="flex gap-2">
          <div className="flex-1 bg-indigo-50 rounded-xl px-3 py-2 text-center">
            <p className="text-lg font-bold text-indigo-700">{stats.attending_count}</p>
            <p className="text-xs text-indigo-500">Présentiels</p>
          </div>
          <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2 text-center">
            <p className="text-lg font-bold text-gray-700">{stats.remote_count}</p>
            <p className="text-xs text-gray-500">À distance</p>
          </div>
        </div>
      )}
    </div>
  )
}

// Chantier 19 (G5) — `ModeratorResponsesPanel` / `ModeratorTableRow`
// supprimés avec get_moderator_responses : la question « tiens-tu à être avec
// un modérateur ? » n'est plus posée (onboarding réduit à 3 questions) et le
// besoin d'encadrement est traité par la règle 5 de l'allocation v2.

// ── DnD primitives pour les groupes ──────────────────────────────

/** H20 — tooltip récapitulant les attributs d'un membre derrière ses lettres. */
function memberProfileTitle(p: AllocationMember): string {
  const parts = [
    p.is_active ? 'Actif' : 'Plutôt passif',
    p.consents  ? 'Consentant à l\'enregistrement' : 'Non consentant à l\'enregistrement',
    p.is_veteran ? 'A déjà fait un débat Ecclesia' : 'Nouveau',
    p.group_id !== null ? `Camp ${p.group_id + 1}` : 'N\'a pas voté (camp inconnu)',
  ]
  return parts.join(' · ')
}

function DraggableMemberChip({
  memberId, pseudo, profile,
}: {
  memberId: string
  pseudo: string
  /** Chantier 26 (H20) — attributs de l'allocation (actif/consentant/ancien/camp). */
  profile?: AllocationMember
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: memberId })
  const color = profile && profile.group_id !== null ? campColor(profile.group_id) : null
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        ...(transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : {}),
        ...(color ? { borderColor: color, background: `${color}1a` } : {}),
      }}
      title={profile ? memberProfileTitle(profile) : undefined}
      className={`px-2 py-0.5 rounded-md text-xs font-medium border cursor-grab active:cursor-grabbing select-none
        transition-opacity inline-flex items-center gap-1 ${
        isDragging
          ? 'opacity-0'
          : color ? 'text-gray-700 hover:brightness-95' : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
      }`}
    >
      <span>{pseudo}</span>
      {profile && (
        <span className="text-[10px] font-mono tracking-tight opacity-60 shrink-0">
          <span className={profile.is_active ? '' : 'line-through'}>a</span>
          <span className={profile.consents ? '' : 'line-through'}>e</span>
          <span className={!profile.is_veteran ? '' : 'line-through'}>n</span>
        </span>
      )}
    </div>
  )
}

/** H20 — légende des lettres et de la couleur, affichée une fois au-dessus des tables. */
function MemberBadgeLegend() {
  return (
    <details className="text-xs text-gray-500 bg-gray-50/60 border border-gray-100 rounded-lg px-3 py-1.5">
      <summary className="cursor-pointer select-none font-medium text-gray-600">
        Légende des cartes participant
      </summary>
      <div className="pt-1.5 space-y-1 leading-snug">
        <p><span className="font-mono">a</span> actif · <span className="font-mono line-through">a</span> plutôt passif</p>
        <p><span className="font-mono">e</span> consentant à l'enregistrement · <span className="font-mono line-through">e</span> non consentant</p>
        <p><span className="font-mono">n</span> nouveau · <span className="font-mono line-through">n</span> a déjà fait un débat Ecclesia</p>
        <p>Couleur du cadre = camp d'opinion (mêmes couleurs que l'onglet Analyse) · pas de couleur = n'a pas voté</p>
      </div>
    </details>
  )
}

function DroppableGroupCard({ tableNumber, children }: { tableNumber: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `group-${tableNumber}` })
  return (
    <div
      ref={setNodeRef}
      className={`bg-white rounded-xl border p-4 transition-colors ${
        isOver ? 'border-indigo-400 bg-indigo-50/30' : 'border-gray-200'
      }`}
    >
      {children}
    </div>
  )
}

/**
 * Chantier 33 (point 2) — table animée en attente d'un modérateur : le
 * superadmin peut soit glisser-déposer un `DraggableMemberChip` dessus
 * (zone droppable `add-moderator-<table_number>`, gérée par
 * `handleGroupDragEnd`), soit taper un nom.
 *
 * Choix d'implémentation : autocomplete (datalist native sur les pseudos
 * déjà inscrits à la séance) plutôt qu'un champ libre, pour éviter les
 * fautes de frappe qui échoueraient silencieusement à retrouver le bon
 * membre. La résolution nom → member_id se fait côté client (correspondance
 * exacte insensible à la casse) ; `session_members` a une contrainte
 * UNIQUE(session_id, pseudo), donc un pseudo désigne au plus un membre.
 */
function AddModeratorControl({
  tableNumber, candidates, onAssign, disabled,
}: {
  tableNumber: number
  candidates: SessionMemberAdmin[]
  onAssign(memberId: string): void
  disabled?: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `add-moderator-${tableNumber}` })
  const [name,  setName]  = useState('')
  const [error, setError] = useState<string | null>(null)
  const datalistId = `moderator-candidates-${tableNumber}`

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim().toLowerCase()
    const match = candidates.find(c => c.pseudo.trim().toLowerCase() === trimmed)
    if (!match) {
      setError('Aucun participant inscrit avec ce nom — vérifie l\'orthographe.')
      return
    }
    setError(null)
    setName('')
    onAssign(match.id)
  }

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border px-2.5 py-2 transition-colors ${
        isOver ? 'border-indigo-400 bg-indigo-50/50' : 'border-amber-200 bg-amber-50/60'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-xs text-amber-800 inline-flex items-center gap-1">
          ⏳ En attente de modérateur
        </span>
        <span className="text-xs text-gray-400">glisse un participant ici, ou :</span>
      </div>
      <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
        <input
          list={datalistId}
          value={name}
          onChange={e => { setName(e.target.value); setError(null) }}
          disabled={disabled}
          placeholder="Nom prénom du modérateur…"
          className="flex-1 min-w-0 text-xs px-2 py-1.5 border border-gray-300 rounded-lg
            focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white disabled:opacity-50"
        />
        <datalist id={datalistId}>
          {candidates.map(c => <option key={c.id} value={c.pseudo} />)}
        </datalist>
        <button
          type="submit"
          disabled={disabled || !name.trim()}
          className="shrink-0 py-1.5 px-2.5 text-xs font-medium border border-indigo-200 rounded-lg
            text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ➕ Ajouter
        </button>
      </form>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}

// ── TableRosterModal (chantier 30 / J8) ────────────────────────────
// Vue en lecture seule, pensée pour être capturée en screenshot : liste
// simple table virtuelle → modérateur → table physique, sans les éléments
// d'interaction (glisser-déposer, boutons rattacher/détacher…) de l'onglet
// Tables qui l'encombreraient sur une capture.

function TableRosterModal({ groups, onClose }: { groups: GroupRow[]; onClose(): void }) {
  const sorted = [...groups].sort((a, b) => a.table_number - b.table_number)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="px-6 pt-6 pb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">🖨️ Récapitulatif des tables</h2>
            <p className="text-xs text-gray-500 mt-0.5">Prêt à capturer en screenshot</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="px-6 pb-6">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="py-2 pr-3">Table</th>
                <th className="py-2 pr-3">Modérateur</th>
                <th className="py-2">Table physique</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(g => {
                const mod = g.members.find(m => m.is_moderator)
                return (
                  <tr key={g.table_number} className="border-b border-gray-100 last:border-0">
                    <td className="py-2.5 pr-3 font-semibold text-gray-900">N°{g.table_number}</td>
                    <td className="py-2.5 pr-3 text-gray-700">
                      {mod ? mod.pseudo : (g.moderated ? '⏳ en attente' : '— sans animateur —')}
                    </td>
                    <td className="py-2.5 font-mono tracking-widest text-gray-700">
                      {g.join_code ?? '—'}
                    </td>
                  </tr>
                )
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-gray-400">Aucune table.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── AssertionsPanel ───────────────────────────────────────────────

function AssertionsPanel({
  assertions,
  voteResults,
  tab,
  onTabChange,
  session,
  actingId,
  onApprove,
  onReject,
  onApproveAll,
  onReapprove,
  onAdminSubmit,
  onDelete,
}: {
  assertions: AssertionAdmin[]
  voteResults: VoteResult[]
  tab: 'pending' | 'approved' | 'rejected'
  onTabChange(t: 'pending' | 'approved' | 'rejected'): void
  session: SessionRow
  actingId: string | null
  onApprove(id: string): void
  onReject(id: string): void
  onApproveAll(): void
  onReapprove(id: string): void
  onAdminSubmit?: (content: string) => Promise<{ id: string }>
  onDelete(ids: string[]): Promise<void>
}) {
  const aiLabelMap = React.useMemo(() => {
    const rejIds     = new Set<string>(JSON.parse(localStorage.getItem(`ai_rejected_ids_${session.id}`) ?? '[]'))
    const approvedIds = new Set<string>(JSON.parse(localStorage.getItem(`ai_approved_ids_${session.id}`) ?? '[]'))
    const mergeLog   = JSON.parse(localStorage.getItem(`merge_log_${session.id}`) ?? '[]') as Array<{ reject_ids: string[] }>
    const mergedIds  = new Set<string>(mergeLog.flatMap(m => m.reject_ids))
    return { rejIds, approvedIds, mergedIds }
  }, [session.id])

  const [adminText,      setAdminText]      = useState('')
  const [adminAdding,    setAdminAdding]    = useState(false)
  const [csvImporting,   setCsvImporting]   = useState(false)
  const [csvProgress,    setCsvProgress]    = useState<{ done: number; total: number } | null>(null)
  const [adminFormOpen,  setAdminFormOpen]  = useState(false)
  const [lastImportIds,  setLastImportIds]  = useState<string[] | null>(null)
  const [selectedRejected, setSelectedRejected] = useState<Set<string>>(new Set())
  const [deleteConfirm,  setDeleteConfirm]  = useState<{ ids: string[]; body: string } | null>(null)
  const [deleting,       setDeleting]       = useState(false)
  const csvInputRef = useRef<HTMLInputElement>(null)

  function toggleRejectedSelection(id: string) {
    setSelectedRejected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleConfirmDelete() {
    if (!deleteConfirm) return
    setDeleting(true)
    try {
      await onDelete(deleteConfirm.ids)
      const deletedIds = new Set(deleteConfirm.ids)
      setSelectedRejected(prev => {
        const next = new Set(prev)
        deletedIds.forEach(id => next.delete(id))
        return next
      })
      setLastImportIds(prev => (prev && prev.every(id => deletedIds.has(id))) ? null : prev)
    } finally {
      setDeleting(false)
      setDeleteConfirm(null)
    }
  }

  async function handleAdminAdd() {
    if (!onAdminSubmit || !adminText.trim()) return
    setAdminAdding(true)
    try {
      await onAdminSubmit(adminText.trim())
      setAdminText('')
    } finally {
      setAdminAdding(false)
    }
  }

  async function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    if (!onAdminSubmit) return
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const buf   = await file.arrayBuffer()
    const bytes = new Uint8Array(buf)
    const enc   = (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) ? 'utf-8' : 'windows-1252'
    const text  = new TextDecoder(enc).decode(buf)
    const lines = text.split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0 && l.toLowerCase() !== 'content')

    setCsvImporting(true)
    setCsvProgress({ done: 0, total: lines.length })
    setLastImportIds(null)
    const importedIds: string[] = []
    let done = 0
    for (const line of lines) {
      try {
        const created = await onAdminSubmit(line)
        importedIds.push(created.id)
      } catch {
        // ignorer les erreurs individuelles
      }
      done++
      setCsvProgress({ done, total: lines.length })
    }
    setCsvImporting(false)
    setCsvProgress(null)
    if (importedIds.length > 0) setLastImportIds(importedIds)
  }

  const pending  = assertions.filter(a => a.status === 'pending')
  const approved = assertions.filter(a => a.status === 'approved')
  const rejected = assertions.filter(a => a.status === 'rejected')

  const voteMap = new Map(voteResults.map(v => [v.id, v]))

  const tabs: { key: 'pending' | 'approved' | 'rejected'; label: string; count: number }[] = [
    ...(session.moderation_policy !== 'open' ? [{ key: 'pending' as const, label: 'En attente', count: pending.length }] : []),
    { key: 'approved', label: 'Approuvées', count: approved.length },
    { key: 'rejected', label: 'Rejetées',   count: rejected.length },
  ]

  // Default to approved tab if no closed moderation
  const effectiveTab = session.moderation_policy === 'open' && tab === 'pending' ? 'approved' : tab

  return (
    <div className="space-y-3">
      {/* ── Formulaire admin ── */}
      {onAdminSubmit && (
        <div className="border border-indigo-100 rounded-xl bg-indigo-50/40 overflow-hidden">
          <button
            onClick={() => setAdminFormOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-indigo-50 transition-colors"
          >
            <span className="text-xs font-semibold text-indigo-700">+ Ajouter des assertions (animateur)</span>
            <svg className={`w-3.5 h-3.5 text-indigo-400 transition-transform shrink-0 ${adminFormOpen ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          {adminFormOpen && (
            <div className="px-4 pb-4 space-y-2 border-t border-indigo-100">
              <textarea
                value={adminText}
                onChange={e => setAdminText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdminAdd() } }}
                placeholder="Saisir une assertion… (Entrée pour valider)"
                rows={2}
                disabled={adminAdding}
                className="w-full mt-3 px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none
                  focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
              />
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={handleAdminAdd}
                  disabled={adminAdding || !adminText.trim()}
                  className="py-1.5 px-4 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl
                    transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {adminAdding ? '…' : 'Ajouter'}
                </button>
                <button
                  onClick={() => csvInputRef.current?.click()}
                  disabled={csvImporting}
                  className="py-1.5 px-4 text-xs font-medium border border-indigo-200 text-indigo-700 rounded-xl
                    hover:bg-indigo-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {csvImporting
                    ? `Import… ${csvProgress ? `${csvProgress.done}/${csvProgress.total}` : ''}`
                    : 'Importer CSV'}
                </button>
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={handleCsvImport}
                />
                {lastImportIds && lastImportIds.length > 0 && (
                  <button
                    onClick={() => setDeleteConfirm({
                      ids: lastImportIds,
                      body: `Supprimer les ${lastImportIds.length} assertion${lastImportIds.length > 1 ? 's' : ''} du dernier import CSV ? Cette action est irréversible.`,
                    })}
                    className="py-1.5 px-4 text-xs font-medium border border-red-200 text-red-700 rounded-xl
                      hover:bg-red-50 transition-colors"
                  >
                    ↩ Annuler l'import ({lastImportIds.length})
                  </button>
                )}
              </div>
              <p className="text-[10px] text-gray-400">
                CSV : une assertion par ligne, colonne optionnelle <code>content</code> en en-tête.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => onTabChange(t.key)}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors ${
              effectiveTab === t.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${
                t.key === 'pending' ? 'bg-amber-100 text-amber-700' :
                t.key === 'approved' ? 'bg-green-100 text-green-700' :
                'bg-gray-200 text-gray-500'
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Pending tab */}
      {effectiveTab === 'pending' && (
        <div className="space-y-2">
          {pending.length > 1 && (
            <button
              onClick={onApproveAll}
              disabled={actingId !== null}
              className="w-full py-2 px-3 text-xs font-medium bg-green-50 border border-green-200 text-green-700 rounded-xl hover:bg-green-100 transition-colors disabled:opacity-50"
            >
              ✅ Tout approuver ({pending.length})
            </button>
          )}
          {pending.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">Aucune assertion en attente</p>
          )}
          {pending.map(a => (
            <AssertionRow key={a.id} assertion={a} acting={actingId === a.id}>
              <button
                onClick={() => onApprove(a.id)}
                disabled={actingId !== null}
                className="py-1 px-2.5 text-xs font-medium bg-green-50 border border-green-200 text-green-700 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
              >✅ Approuver</button>
              <button
                onClick={() => onReject(a.id)}
                disabled={actingId !== null}
                className="py-1 px-2.5 text-xs font-medium bg-red-50 border border-red-200 text-red-700 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
              >❌ Rejeter</button>
            </AssertionRow>
          ))}
        </div>
      )}

      {/* Approved tab */}
      {effectiveTab === 'approved' && (
        <div className="space-y-2">
          {approved.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">Aucune assertion approuvée</p>
          )}
          {[...approved]
            .sort((a, b) => {
              const scoreDiff = (voteMap.get(b.id)?.consensus_score ?? 0) - (voteMap.get(a.id)?.consensus_score ?? 0)
              if (scoreDiff !== 0) return scoreDiff
              return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            })
            .map(a => {
              const v = voteMap.get(a.id)
              return (
                <AssertionRow key={a.id} assertion={a} acting={actingId === a.id} aiLabels={{
                  isMerged: false,
                  isAiRejected: false,
                  isAiApproved: aiLabelMap.approvedIds.has(a.id),
                }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    {v && v.total_votes > 0 ? (
                      <VoteBar agree={v.agree_count} disagree={v.disagree_count} pass={v.pass_count} total={v.total_votes} score={v.consensus_score} />
                    ) : (
                      <span className="text-xs text-gray-400">Pas encore de votes</span>
                    )}
                    <button
                      onClick={() => onReject(a.id)}
                      disabled={actingId !== null}
                      className="py-1 px-2.5 text-xs font-medium bg-red-50 border border-red-200 text-red-700 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                    >❌ Refuser</button>
                  </div>
                </AssertionRow>
              )
            })}
        </div>
      )}

      {/* Rejected tab */}
      {effectiveTab === 'rejected' && (
        <div className="space-y-2">
          {rejected.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">Aucune assertion rejetée</p>
          )}
          {rejected.length > 0 && (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selectedRejected.size === rejected.length}
                  ref={el => { if (el) el.indeterminate = selectedRejected.size > 0 && selectedRejected.size < rejected.length }}
                  onChange={() => setSelectedRejected(prev =>
                    prev.size === rejected.length ? new Set() : new Set(rejected.map(a => a.id))
                  )}
                  className="w-3.5 h-3.5 accent-red-600"
                />
                {selectedRejected.size === rejected.length ? 'Tout désélectionner' : 'Tout sélectionner'}
              </label>
              {selectedRejected.size > 0 && (
                <button
                  onClick={() => setDeleteConfirm({
                    ids: [...selectedRejected],
                    body: `Supprimer définitivement ${selectedRejected.size} assertion${selectedRejected.size > 1 ? 's' : ''} ? Cette action est irréversible.`,
                  })}
                  disabled={actingId !== null}
                  className="py-1 px-2.5 text-xs font-medium bg-red-50 border border-red-200 text-red-700 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                >🗑 Supprimer la sélection ({selectedRejected.size})</button>
              )}
            </div>
          )}
          {rejected.map(a => (
            <AssertionRow
              key={a.id}
              assertion={a}
              acting={actingId === a.id}
              selectable
              selected={selectedRejected.has(a.id)}
              onToggleSelect={() => toggleRejectedSelection(a.id)}
              aiLabels={{
                isMerged:    aiLabelMap.mergedIds.has(a.id),
                isAiRejected: aiLabelMap.rejIds.has(a.id),
                isAiApproved: false,
              }}
            >
              <button
                onClick={() => onReapprove(a.id)}
                disabled={actingId !== null}
                className="py-1 px-2.5 text-xs font-medium bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
              >↩ Réapprouver</button>
              <button
                onClick={() => setDeleteConfirm({ ids: [a.id], body: 'Supprimer définitivement cette assertion ? Cette action est irréversible.' })}
                disabled={actingId !== null}
                className="py-1 px-2.5 text-xs font-medium bg-red-50 border border-red-200 text-red-700 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
              >🗑 Supprimer</button>
            </AssertionRow>
          ))}
        </div>
      )}

      {deleteConfirm && (
        <ConfirmModal
          title="Suppression définitive"
          body={deleteConfirm.body}
          confirmLabel={deleting ? '…' : 'Supprimer'}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  )
}

// ── ShareLinkBanner ──────────────────────────────────────────────

function ShareLinkBanner({ joinCode }: { joinCode: string }) {
  const [copied, setCopied] = useState(false)
  const url = `https://ecclesia-cs.github.io/Ecclesia-Animation-Moderateur/#session/${joinCode}`

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wide mb-0.5">
          Lien de partage
        </p>
        <p className="text-xs font-mono text-gray-700 truncate">{url}</p>
      </div>
      <button
        onClick={handleCopy}
        className="shrink-0 py-1.5 px-3 text-xs font-medium border border-indigo-200 rounded-lg
          text-indigo-700 hover:bg-indigo-100 transition-colors"
      >
        {copied ? '✓ Copié' : 'Copier'}
      </button>
    </div>
  )
}

// ── MembersPanel ─────────────────────────────────────────────────

const PHASE_LABEL_MEMBER: Record<string, string> = {
  draft:   'Brouillon',
  voting:  'Vote',
  admin:   'Animateur',
}

/** H10 — colonnes triables de `MembersPanel`, chacune avec un comparateur dédié. */
type MembersSortKey = 'pseudo' | 'created_at' | 'joined_phase' | 'has_entry_response' | 'has_voted' | 'is_moderator'

const MEMBERS_SORTERS: Record<MembersSortKey, (a: SessionMemberAdmin, b: SessionMemberAdmin) => number> = {
  pseudo:             (a, b) => a.pseudo.localeCompare(b.pseudo, 'fr'),
  created_at:         (a, b) => a.created_at.localeCompare(b.created_at),
  joined_phase:       (a, b) => (a.joined_phase ?? '').localeCompare(b.joined_phase ?? ''),
  has_entry_response: (a, b) => Number(a.has_entry_response) - Number(b.has_entry_response),
  has_voted:          (a, b) => Number(a.has_voted) - Number(b.has_voted),
  is_moderator:       (a, b) => Number(!!a.is_moderator) - Number(!!b.is_moderator),
}

/** Petites flèches ▲▼ à côté du nom de colonne (H10). */
function SortArrows({ active, direction }: { active: boolean; direction: 'asc' | 'desc' }) {
  return (
    <span className="inline-flex flex-col leading-none ml-1 -space-y-0.5 align-middle">
      <span className={`text-[8px] ${active && direction === 'asc' ? 'text-indigo-600' : 'text-gray-300'}`}>▲</span>
      <span className={`text-[8px] ${active && direction === 'desc' ? 'text-indigo-600' : 'text-gray-300'}`}>▼</span>
    </span>
  )
}

function SortableTh({
  label, title, sortKey, sort, onSort, className,
}: {
  label: React.ReactNode
  title?: string
  sortKey: MembersSortKey
  sort: { key: MembersSortKey; direction: 'asc' | 'desc' }
  onSort: (key: MembersSortKey) => void
  className?: string
}) {
  const active = sort.key === sortKey
  return (
    <th className={`font-medium ${className ?? 'text-left py-2 pr-3'}`} title={title}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center hover:text-indigo-600 transition-colors"
      >
        {label}
        <SortArrows active={active} direction={active ? sort.direction : 'asc'} />
      </button>
    </th>
  )
}

function MembersPanel({
  members,
  loading,
  onToggleModerator,
}: {
  members: SessionMemberAdmin[]
  loading: boolean
  /** Chantier 19 (G4) — absent si la migration n'est pas appliquée. */
  onToggleModerator?: (memberId: string, next: boolean) => Promise<void>
}) {
  // H10 — tri par colonne, alphabétique ou ordre d'arrivée, croissant/décroissant.
  const [sort, setSort] = useState<{ key: MembersSortKey; direction: 'asc' | 'desc' }>(
    { key: 'created_at', direction: 'asc' },
  )
  const handleSort = useCallback((key: MembersSortKey) => {
    setSort(prev => prev.key === key
      ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'asc' })
  }, [])
  const sortedMembers = React.useMemo(() => {
    const cmp = MEMBERS_SORTERS[sort.key]
    const sorted = [...members].sort(cmp)
    return sort.direction === 'asc' ? sorted : sorted.reverse()
  }, [members, sort])

  if (loading && members.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">Chargement…</p>
  }
  if (members.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">Aucun participant inscrit</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-400 border-b border-gray-100">
            <SortableTh label="Pseudo" sortKey="pseudo" sort={sort} onSort={handleSort} />
            <SortableTh label="Heure" sortKey="created_at" sort={sort} onSort={handleSort} />
            <SortableTh label="Phase" sortKey="joined_phase" sort={sort} onSort={handleSort} />
            <SortableTh
              label="Q."
              title="Questionnaire d'entrée rempli"
              sortKey="has_entry_response"
              sort={sort} onSort={handleSort}
              className="text-center py-2 pr-3"
            />
            <SortableTh
              label="V."
              title="A voté"
              sortKey="has_voted"
              sort={sort} onSort={handleSort}
              className="text-center py-2 pr-3"
            />
            <SortableTh
              label="🎙️"
              title="Modérateur pour cette séance (utilisé par l'allocation)"
              sortKey="is_moderator"
              sort={sort} onSort={handleSort}
              className="text-center py-2"
            />
          </tr>
        </thead>
        <tbody>
          {sortedMembers.map(m => (
            <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
              <td className="py-2 pr-3 font-medium text-gray-900">{m.pseudo}</td>
              <td className="py-2 pr-3 text-gray-500">
                {new Date(m.created_at).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
              </td>
              <td className="py-2 pr-3">
                {m.joined_phase ? (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                    m.joined_phase === 'voting' ? 'bg-purple-100 text-purple-700' :
                    m.joined_phase === 'draft'  ? 'bg-gray-100 text-gray-600' :
                    'bg-indigo-100 text-indigo-700'
                  }`}>
                    {PHASE_LABEL_MEMBER[m.joined_phase] ?? m.joined_phase}
                  </span>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
              <td className="py-2 pr-3 text-center">
                {m.has_entry_response ? '✅' : '⬜'}
              </td>
              <td className="py-2 pr-3 text-center">
                {m.has_voted ? '✅' : '⬜'}
              </td>
              {/* Chantier 19 (G4) — marquage modérateur. Critère dur de
                  l'allocation : à poser AVANT de lancer la répartition. */}
              <td className="py-2 text-center">
                {onToggleModerator ? (
                  <button
                    onClick={() => onToggleModerator(m.id, !m.is_moderator)}
                    title={m.is_moderator
                      ? 'Modérateur de cette séance — cliquer pour retirer'
                      : 'Marquer comme modérateur de cette séance'}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                      m.is_moderator
                        ? 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700'
                        : 'bg-white border-gray-200 text-gray-400 hover:border-indigo-300 hover:text-indigo-600'
                    }`}
                  >
                    {m.is_moderator ? 'modérateur' : '+ modérateur'}
                  </button>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AssertionRow({
  assertion,
  acting,
  aiLabels,
  selectable,
  selected,
  onToggleSelect,
  children,
}: {
  assertion: AssertionAdmin
  acting: boolean
  aiLabels?: { isMerged: boolean; isAiRejected: boolean; isAiApproved: boolean }
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: () => void
  children: React.ReactNode
}) {
  return (
    <div className={`border rounded-xl p-3 space-y-2 transition-colors ${acting ? 'opacity-50' : ''} ${selected ? 'border-red-300 bg-red-50/50' : 'border-gray-200'}`}>
      <div className="flex items-start gap-2">
        {selectable && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={onToggleSelect}
            className="mt-0.5 shrink-0 w-3.5 h-3.5 accent-red-600"
            aria-label="Sélectionner cette assertion"
          />
        )}
        <p className="text-sm text-gray-900 flex-1">{assertion.content}</p>
      </div>
      {aiLabels && (aiLabels.isMerged || aiLabels.isAiRejected || aiLabels.isAiApproved) && (
        <div className="flex gap-1.5 flex-wrap">
          {aiLabels.isMerged    && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">fusionnée</span>}
          {aiLabels.isAiRejected && !aiLabels.isMerged && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">modérée par IA</span>}
          {aiLabels.isAiApproved && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">acceptée par IA</span>}
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs text-gray-400">{new Date(assertion.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
        <div className="flex gap-2 flex-wrap">{children}</div>
      </div>
    </div>
  )
}

function VoteBar({ agree, disagree, pass, total, score }: { agree: number; disagree: number; pass: number; total: number; score: number | null }) {
  const agreePct    = Math.round((agree    / total) * 100)
  const disagreePct = Math.round((disagree / total) * 100)
  const passPct     = Math.round((pass     / total) * 100)
  // Fort taux de "passe" (≥35 %, sur au moins 5 votes) : signal qu'une assertion pourrait
  // être mal formulée/ambiguë (cf. notes pol.is C4) — actionnable ici par le modérateur.
  const manyPasses  = total >= 5 && pass / total >= 0.35

  return (
    <div className="w-full space-y-1">
      <div className="flex h-2 rounded-full overflow-hidden gap-px">
        <div className="bg-green-400 transition-all" style={{ width: `${agreePct}%` }} />
        <div className="bg-red-400 transition-all"   style={{ width: `${disagreePct}%` }} />
        <div className="bg-gray-300 transition-all"  style={{ width: `${passPct}%` }} />
      </div>
      <div className="flex items-center justify-between text-[10px] text-gray-500">
        <span>✅ {agree} · ❌ {disagree} · ⏭ {pass} ({total} votes)</span>
        {score !== null && <span className="font-semibold text-indigo-600">Score : {score}%</span>}
      </div>
      {manyPasses && (
        <p className="text-[10px] text-amber-600">⚠️ Beaucoup de passes — formulation peut-être à revoir</p>
      )}
    </div>
  )
}

// ── CollabSourcesList ─────────────────────────────────────────────

function CollabSourcesList({
  sources,
  loading,
  deletingId,
  onDeleteRequest,
}: {
  sources: CollabSource[]
  loading: boolean
  deletingId: string | null
  onDeleteRequest(s: CollabSource): void
}) {
  if (loading) {
    return <p className="text-sm text-gray-400 text-center py-4">Chargement…</p>
  }
  if (sources.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">Aucune source collaborative</p>
  }

  // Grouper par pseudo
  const groups = sources.reduce<Record<string, CollabSource[]>>((acc, s) => {
    const key = s.pseudo || '(anonyme)'
    if (!acc[key]) acc[key] = []
    acc[key].push(s)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([pseudo, items]) => (
        <div key={pseudo}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-gray-700">{pseudo}</span>
            {items[0].table_join_code && (
              <span className="text-xs text-gray-400">— table {items[0].table_join_code}</span>
            )}
          </div>
          <div className="space-y-2 pl-3 border-l-2 border-gray-100">
            {items.map(s => (
              <div
                key={s.id}
                className="flex items-start justify-between gap-3 py-2 px-3
                  bg-gray-50 rounded-xl"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">{s.title}</p>
                  {s.url && (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-600 hover:underline truncate block"
                    >
                      {s.url}
                    </a>
                  )}
                  {s.content && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{s.content}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(s.created_at).toLocaleDateString('fr-FR', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
                <button
                  onClick={() => onDeleteRequest(s)}
                  disabled={deletingId === s.id}
                  className="shrink-0 py-1 px-2.5 text-xs font-medium border border-red-200 rounded-lg
                    text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
                >
                  {deletingId === s.id ? '…' : 'Supprimer'}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function DocLink({ label, url }: { label: string; url: string | null }) {
  if (!url) return null
  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-500 text-xs shrink-0">{label}</span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-indigo-600 hover:underline text-xs truncate"
      >
        {url}
      </a>
    </div>
  )
}

function DocFileField({ label, placeholder, value, onChange }: {
  label: string
  placeholder: string
  value: string
  onChange(v: string): void
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1.5">{label}</label>
      <input
        type="url"
        value={value}
        onChange={e => onChange(e.target.value.trim())}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl
          focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
          placeholder:text-gray-300 bg-white transition-shadow"
      />
    </div>
  )
}

// ── ThemeDashboard ────────────────────────────────────────────────

type ThemeStat = { theme: string; avg: number; count: number }

function computeThemeStats(responses: QuestionnaireExportRow[]): ThemeStat[] {
  return QUESTIONNAIRE_THEMES
    .map(theme => {
      const ratings = responses
        .map(r => r.theme_ratings?.[theme])
        .filter((v): v is number => v !== undefined)
      if (ratings.length === 0) return null
      const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length
      return { theme, avg, count: ratings.length }
    })
    .filter((s): s is ThemeStat => s !== null)
    .sort((a, b) => b.avg - a.avg)
}

function ThemeDashboard({ responses, loading }: { responses: QuestionnaireExportRow[]; loading: boolean }) {
  const stats = computeThemeStats(responses)
  if (loading) return (
    <div className="flex justify-center py-6">
      <span className="w-5 h-5 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
    </div>
  )
  if (stats.length === 0) return (
    <p className="text-xs text-gray-400 py-2">Aucune note de thème pour l'instant.</p>
  )
  return (
    <div className="space-y-2.5 pt-4">
      {stats.map((s, i) => {
        const pct = (s.avg / 5) * 100
        const barColor = s.avg >= 3.5 ? 'bg-teal-500' : s.avg >= 2 ? 'bg-indigo-400' : 'bg-amber-400'
        return (
          <div key={s.theme} className="flex items-center gap-3">
            <span className="w-5 text-xs text-gray-400 text-right shrink-0">{i + 1}.</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs text-gray-700 truncate leading-snug">{s.theme}</span>
                <span className="text-xs font-semibold text-gray-900 shrink-0 tabular-nums">
                  {s.avg.toFixed(1)}<span className="text-gray-400 font-normal">/5</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
            <span className="text-xs text-gray-400 shrink-0 w-12 text-right">
              {s.count} vote{s.count > 1 ? 's' : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── StaffInterestList (F15) ────────────────────────────────────────
// Zoom recrutement : liste des réponses où staff_interest (texte libre,
// nom + contact) est renseigné. Signal indépendant de session_members.
// is_moderator — voir CLAUDE.md.

function StaffInterestList({
  responses, loading,
}: {
  responses: QuestionnaireExportRow[]
  loading: boolean
}) {
  if (loading) return (
    <div className="flex justify-center py-6">
      <span className="w-5 h-5 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
    </div>
  )
  if (responses.length === 0) return (
    <p className="text-xs text-gray-400">Personne n'a manifesté d'intérêt pour l'instant.</p>
  )
  return (
    <div className="divide-y divide-gray-100">
      {responses.map(r => {
        const date = new Date(r.created_at).toLocaleDateString('fr-FR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })
        return (
          <div key={r.id} className="py-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-semibold text-gray-900">{r.pseudo ?? 'Pseudo inconnu'}</span>
                <span className="text-xs text-gray-400 tabular-nums">{date}</span>
                {r.table_join_code && (
                  <span className="font-mono text-xs text-indigo-600 tracking-widest">
                    {r.table_join_code}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{r.staff_interest}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── ResponsesList ─────────────────────────────────────────────────

function ResponsesList({
  responses, loading, expandedId, deletingId, onToggle, onDeleteRequest,
}: {
  responses: QuestionnaireExportRow[]
  loading: boolean
  expandedId: string | null
  deletingId: string | null
  onToggle(id: string): void
  onDeleteRequest(r: QuestionnaireExportRow): void
}) {
  if (loading) return (
    <div className="flex justify-center py-6">
      <span className="w-5 h-5 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
    </div>
  )
  if (responses.length === 0) return (
    <p className="text-xs text-gray-400 px-5 py-4">Aucune réponse pour l'instant.</p>
  )
  return (
    <div className="divide-y divide-gray-100 px-5">
      {responses.map(r => (
        <ResponseRow
          key={r.id}
          response={r}
          expanded={expandedId === r.id}
          deleting={deletingId === r.id}
          onToggle={() => onToggle(r.id)}
          onDeleteRequest={() => onDeleteRequest(r)}
        />
      ))}
    </div>
  )
}

function ResponseRow({
  response: r, expanded, deleting, onToggle, onDeleteRequest,
}: {
  response: QuestionnaireExportRow
  expanded: boolean
  deleting: boolean
  onToggle(): void
  onDeleteRequest(): void
}) {
  const date = new Date(r.created_at).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  const ratedThemes = QUESTIONNAIRE_THEMES.filter(t => r.theme_ratings?.[t] !== undefined)

  return (
    <div className="py-3">
      {/* ── Ligne résumé (cliquable) ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggle}
          className="flex-1 min-w-0 flex items-center gap-3 text-left group"
        >
          {/* Chevron */}
          <svg
            className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          <span className="text-xs text-gray-400 shrink-0 tabular-nums">{date}</span>
          {r.table_join_code && (
            <span className="font-mono text-xs text-indigo-600 tracking-widest shrink-0">
              {r.table_join_code}
            </span>
          )}
          {r.debate_attended && (
            <span className="text-xs text-gray-700 truncate">{r.debate_attended}</span>
          )}
          {r.debate_rating !== null && (
            <span className="shrink-0 text-xs font-semibold text-amber-600">
              {r.debate_rating}/5
            </span>
          )}
          {ratedThemes.length > 0 && (
            <span className="shrink-0 text-xs text-gray-400">
              {ratedThemes.length} thème{ratedThemes.length > 1 ? 's' : ''}
            </span>
          )}
        </button>

        {/* Bouton supprimer */}
        <button
          onClick={e => { e.stopPropagation(); onDeleteRequest() }}
          disabled={deleting}
          title="Supprimer cette réponse"
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg
            text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {deleting ? (
            <span className="w-3.5 h-3.5 rounded-full border-2 border-red-400 border-t-transparent animate-spin" />
          ) : (
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          )}
        </button>
      </div>

      {/* ── Détail expandé ── */}
      {expanded && (
        <div className="mt-3 ml-6 space-y-3 text-xs text-gray-600 bg-gray-50 rounded-xl p-4">
          {r.theme_ideas && (
            <div>
              <p className="font-semibold text-gray-500 mb-0.5">Idées de thèmes</p>
              <p className="leading-relaxed">{r.theme_ideas}</p>
            </div>
          )}
          {r.staff_interest && (
            <div>
              <p className="font-semibold text-gray-500 mb-0.5">Intérêt pour staffer</p>
              <p className="leading-relaxed">{r.staff_interest}</p>
            </div>
          )}
          {r.feedback && (
            <div>
              <p className="font-semibold text-gray-500 mb-0.5">Retour libre</p>
              <p className="leading-relaxed">{r.feedback}</p>
            </div>
          )}
          {ratedThemes.length > 0 && (
            <div>
              <p className="font-semibold text-gray-500 mb-1.5">Notes par thème</p>
              <div className="space-y-1">
                {ratedThemes.map(t => (
                  <div key={t} className="flex items-center gap-2">
                    <span className="flex-1 truncate text-gray-600">{t}</span>
                    <span className="font-semibold tabular-nums text-indigo-600 shrink-0">
                      {r.theme_ratings[t]}/5
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!r.theme_ideas && !r.staff_interest && !r.feedback && ratedThemes.length === 0 && (
            <p className="text-gray-400 italic">Aucun détail renseigné.</p>
          )}
        </div>
      )}
    </div>
  )
}

function ExpandableTableRow({
  table, action, onDelete, otherTables, onParticipantMoved,
}: {
  table: SessionTableRow
  action: React.ReactNode
  onDelete(): void
  otherTables: SessionTableRow[]
  onParticipantMoved(): void
}) {
  const [expanded, setExpanded]           = useState(false)
  const [participants, setParticipants]   = useState<TableParticipantRow[] | null>(null)
  const [partLoading, setPartLoading]     = useState(false)
  const [partErr, setPartErr]             = useState<string | null>(null)
  const [movingId, setMovingId]           = useState<string | null>(null)
  const [moveMenuId, setMoveMenuId]       = useState<string | null>(null)
  const [csvLoading, setCsvLoading]       = useState(false)
  const moveMenuRef                       = useRef<HTMLDivElement>(null)

  async function toggleExpand(e: React.MouseEvent) {
    e.stopPropagation()
    if (!expanded && participants === null) {
      setPartLoading(true)
      setPartErr(null)
      try {
        const rows = await getTableParticipants(getPwd()!, table.id)
        setParticipants(rows)
      } catch (err) {
        setPartErr(extractErr(err))
      } finally {
        setPartLoading(false)
      }
    }
    setExpanded(v => !v)
  }

  async function handleMove(participantId: string, targetTableId: string) {
    const pwd = getPwd()!
    setMovingId(participantId)
    setMoveMenuId(null)
    try {
      await moveParticipant(pwd, participantId, targetTableId)
      setParticipants(prev => prev ? prev.filter(p => p.participant_id !== participantId) : prev)
      onParticipantMoved()
    } catch (err) {
      setPartErr(extractErr(err))
    } finally {
      setMovingId(null)
    }
  }

  async function handleExportCsv() {
    const pwd = getPwd()!
    setCsvLoading(true)
    try {
      const [turns, parts] = await Promise.all([
        getTableSpeakingTurnsAdmin(pwd, table.id),
        participants ?? getTableParticipants(pwd, table.id),
      ])
      const fakeTable = {
        id: table.id,
        join_code: table.join_code,
        created_at: table.created_at,
        created_by: '',
        current_speaker_id: null,
        current_turn_started_at: null,
        session_id: null,
      } as import('../lib/types').Table
      const fakeParticipants = parts.map(p => ({
        id: p.participant_id,
        table_id: table.id,
        user_id: '',
        pseudo: p.pseudo,
        created_at: '',
      } as import('../lib/types').Participant))
      const fakeTurns = turns.map(t => ({
        id: t.id,
        table_id: table.id,
        participant_id: t.participant_id,
        started_at: t.started_at,
        ended_at: t.ended_at ?? null,
        source: t.source as import('../lib/types').SpeakingTurn['source'],
      }))
      const csv  = generateTableCSV(fakeTable, fakeParticipants, fakeTurns)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `ecclesia_table_${table.join_code}_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setPartErr(extractErr(err))
    } finally {
      setCsvLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* ── Header ── */}
      <div className="px-4 py-3 flex items-center gap-3">
        {/* Chevron expand */}
        <button
          onClick={toggleExpand}
          title={expanded ? 'Réduire' : 'Voir les participants'}
          className="shrink-0 text-gray-400 hover:text-indigo-600 transition-colors"
        >
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className={`transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
          >
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>

        {/* Table info */}
        <div className="flex-1 min-w-0 flex items-center gap-4 flex-wrap text-sm">
          <span className="font-mono font-bold text-indigo-600 tracking-widest">{table.join_code}</span>
          {table.leaderless && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 shrink-0">
              Sans modérateur
            </span>
          )}
          {table.moderator_pseudo && (
            <span className="text-gray-600 truncate">{table.moderator_pseudo}</span>
          )}
          <span className="text-gray-400 text-xs">
            {table.participant_count} participant{table.participant_count !== 1 ? 's' : ''}
          </span>
          {table.is_active && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              En cours
            </span>
          )}
        </div>

        {/* CSV + Trash + action */}
        <div className="shrink-0 flex items-center gap-1.5">
          <button
            onClick={e => { e.stopPropagation(); handleExportCsv() }}
            disabled={csvLoading}
            title="Télécharger les temps de parole et l'historique (CSV)"
            className="p-1.5 rounded-lg border border-transparent text-gray-300
              hover:border-teal-200 hover:text-teal-600 hover:bg-teal-50 transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {csvLoading ? (
              <Spinner />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            )}
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            title="Supprimer la table"
            className="p-1.5 rounded-lg border border-transparent text-gray-300
              hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
          {action}
        </div>
      </div>

      {/* ── Expanded participants ── */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/60">
          {partLoading && <p className="text-xs text-gray-400">Chargement…</p>}
          {partErr && <p className="text-xs text-red-500">{partErr}</p>}
          {!partLoading && !partErr && participants !== null && (
            participants.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-1">Aucun participant</p>
            ) : (
              <div className="space-y-1">
                {participants.map(p => (
                  <div key={p.pseudo} className="relative">
                    <div className={`flex items-center gap-3 text-xs ${p.is_current_speaker ? 'text-amber-700 font-medium' : 'text-gray-600'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.is_current_speaker ? 'bg-amber-400' : 'bg-gray-300'}`} />
                      <span className="truncate flex-1">{p.pseudo}</span>
                      <span className={p.is_current_speaker ? 'text-amber-600' : 'text-gray-400'}>
                        {formatDuration(p.total_ms)}
                      </span>
                      <span className="text-gray-300 shrink-0">
                        {p.turn_count} tour{Number(p.turn_count) !== 1 ? 's' : ''}
                      </span>
                      {otherTables.length > 0 && (
                        <div className="relative shrink-0" ref={moveMenuId === p.participant_id ? moveMenuRef : undefined}>
                          <button
                            onClick={() => setMoveMenuId(prev => prev === p.participant_id ? null : p.participant_id)}
                            disabled={movingId === p.participant_id}
                            title="Déplacer vers une autre table"
                            className="p-0.5 rounded text-gray-300 hover:text-indigo-500 hover:bg-indigo-50
                              transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {movingId === p.participant_id ? (
                              <Spinner />
                            ) : (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="9 18 15 12 9 6"/>
                              </svg>
                            )}
                          </button>
                          {moveMenuId === p.participant_id && (
                            <div className="absolute right-0 top-5 z-20 bg-white border border-gray-200
                              rounded-xl shadow-lg py-1 min-w-[120px]">
                              <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                                Déplacer vers
                              </p>
                              {otherTables.map(ot => (
                                <button
                                  key={ot.id}
                                  onClick={() => handleMove(p.participant_id, ot.id)}
                                  className="w-full text-left px-3 py-1.5 text-xs text-gray-700
                                    hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                                >
                                  <span className="font-mono tracking-widest text-indigo-600 mr-2">{ot.join_code}</span>
                                  {ot.moderator_pseudo && (
                                    <span className="text-gray-400">{ot.moderator_pseudo}</span>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
