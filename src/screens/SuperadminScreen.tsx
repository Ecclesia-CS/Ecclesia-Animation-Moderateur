import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { extractErr, fromDateTimeLocal, formatDuration, generateQuestionnaireCSV, QUESTIONNAIRE_THEMES } from '../lib/utils'
import {
  verifyPassword, createSession, closeSession, deleteSession,
  attachTableToSession, detachTableFromSession,
  listSessionTables, listAvailableTables, updateSessionDocs,
  getQuestionnaireResponses, deleteQuestionnaireResponse,
  getTableParticipants, deleteTableAdmin, forceSessionQuestionnaire,
  cancelSessionQuestionnaire,
  listSessionSources, deleteCollabSourceAdmin,
} from '../lib/sessions'
import type { SessionTableRow, TableParticipantRow } from '../lib/sessions'
import type { Session, QuestionnaireExportRow, CollabSource } from '../lib/types'
import ConfirmModal from '../components/ConfirmModal'

const PWD_KEY = 'ecclesia_superadmin_pwd'

const getPwd = () => sessionStorage.getItem(PWD_KEY)
const setPwd = (p: string) => sessionStorage.setItem(PWD_KEY, p)
const clearPwd = () => sessionStorage.removeItem(PWD_KEY)

type SessionRow = Session & { tableCount: number }

type AdminView = { type: 'list' } | { type: 'detail'; session: SessionRow }

// ── Phase labels & badge colours ─────────────────────────────────

const PHASE_LABEL: Record<string, string> = {
  draft:         'Brouillon',
  voting:        'Vote',
  allocating:    'Allocation',
  debating:      'Débat',
  questionnaire: 'Questionnaire',
  closed:        'Clôturée',
}

const PHASE_CLASS: Record<string, string> = {
  draft:         'bg-gray-100 text-gray-600',
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

  // ── Load sessions ──────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    setListLoad(true)
    setListErr(null)
    try {
      const [{ data: sessData, error: sessErr }, { data: tableData, error: tableErr }] =
        await Promise.all([
          supabase.from('sessions').select('*').order('created_at', { ascending: false }),
          supabase.from('tables').select('session_id').not('session_id', 'is', null),
        ])
      if (sessErr) throw sessErr
      if (tableErr) throw tableErr

      const counts: Record<string, number> = {}
      for (const t of tableData ?? []) {
        if (t.session_id) counts[t.session_id] = (counts[t.session_id] ?? 0) + 1
      }

      setSessions(sortSessions(
        (sessData ?? []).map(s => ({ ...s, tableCount: counts[s.id] ?? 0 }))
      ))
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
    setSessions(prev => sortSessions([{ ...s, tableCount: 0 }, ...prev]))
    setShowCreate(false)
  }

  // ── Auth error (called from child) ────────────────────────────
  function handleAuthError() { clearPwd(); setAuthed(false) }

  // ── Render ────────────────────────────────────────────────────

  if (authed && view.type === 'detail') {
    return (
      <SessionDetail
        session={view.session}
        onBack={() => { setView({ type: 'list' }); loadSessions() }}
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
                onClick={() => setView({ type: 'detail', session: s })}
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
                    {/* Moderator */}
                    <span className="text-gray-500 truncate flex-1">
                      {t.moderator_pseudo ?? <span className="italic text-gray-300">—</span>}
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
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-0">
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
              <DocFileField label="Fiche information" placeholder="fiche-info.html" value={docInfoUrl} onChange={setDocInfoUrl} />
              <DocFileField label="Résumé" placeholder="résumé-info.html" value={docSummaryUrl} onChange={setDocSummaryUrl} />
            </div>
            <p className="mt-3 text-xs text-gray-400">
              Le document de sources collaboratives est disponible automatiquement pour chaque séance
              avec un code de rejoindre.
            </p>
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
  const [exporting,          setExporting]          = useState(false)
  const [isQForced,    setIsQForced]    = useState(false)
  const [showQConfirm, setShowQConfirm] = useState(false)
  const [qActing,      setQActing]      = useState(false)

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

  // ── Collab sources data ────────────────────────────────────────
  const [sources,             setSources]             = useState<CollabSource[]>([])
  const [sourcesLoading,      setSourcesLoading]      = useState(false)
  const [sourcesOpen,         setSourcesOpen]         = useState(false)
  const [deleteSourceConfirm, setDeleteSourceConfirm] = useState<CollabSource | null>(null)
  const [deletingSourceId,    setDeletingSourceId]    = useState<string | null>(null)

  // ── Documentation editing state ────────────────────────────
  const [editingDocs,    setEditingDocs]    = useState(false)
  const [docInfoUrl,     setDocInfoUrl]     = useState(session.doc_info_url ?? '')
  const [docSummaryUrl,  setDocSummaryUrl]  = useState(session.doc_summary_url ?? '')
  const [docsLoading,    setDocsLoading]    = useState(false)
  const [docsErr,        setDocsErr]        = useState<string | null>(null)
  const [sessionDocs,    setSessionDocs]    = useState({
    doc_info_url:    session.doc_info_url,
    doc_summary_url: session.doc_summary_url,
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
      await load()
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
      await load()
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

  async function handleExportQuestionnaires() {
    const password = getPwd()!
    setExporting(true)
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
      setExporting(false)
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
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PHASE_CLASS[session.phase] ?? 'bg-gray-100 text-gray-600'}`}>
              {PHASE_LABEL[session.phase] ?? session.phase}
            </span>
            {session.join_code && (
              <span className="font-mono text-xs tracking-widest text-gray-500">{session.join_code}</span>
            )}
          </div>
          <button
            onClick={() => setShowQConfirm(true)}
            disabled={qActing}
            className="shrink-0 py-1.5 px-3 text-xs font-medium border rounded-lg
              transition-colors disabled:opacity-50 disabled:cursor-not-allowed
              border-indigo-200 text-indigo-700 hover:bg-indigo-50"
            title={isQForced
              ? 'Réinitialiser le forçage du questionnaire pour toutes les tables'
              : 'Forcer l\'affichage du questionnaire chez tous les participants'}
          >
            {qActing ? '…' : isQForced ? 'Annuler forçage questionnaire' : 'Forcer questionnaire'}
          </button>
          <button
            onClick={handleExportQuestionnaires}
            disabled={exporting}
            className="shrink-0 flex items-center gap-1.5 py-1.5 px-3 text-xs font-medium
              border border-teal-200 rounded-lg text-teal-700 hover:bg-teal-50
              transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Télécharger les réponses au questionnaire (CSV)"
          >
            {exporting ? (
              <Spinner />
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            )}
            {exporting ? 'Export…' : 'Questionnaires'}
          </button>
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

        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">Chargement…</div>
        ) : (
          <>
            {/* ── Documentation ───────────────────────────── */}
            <section className="bg-white rounded-2xl border border-gray-200 px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Documentation
                </h2>
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
            </section>

            <section>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Tables rattachées
              </h2>
              {attachedTables.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">Aucune table rattachée</p>
              ) : (
                <div className="space-y-2">
                  {attachedTables.map(t => (
                    <ExpandableTableRow
                      key={t.id}
                      table={t}
                      onDelete={() => setDeleteTableConfirm(t)}
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
            </section>

            <section>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Tables disponibles à rattacher
              </h2>
              {/* Contrôles de filtre */}
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
            </section>
            {/* ── Tableau de bord thèmes (accordéon) ─────── */}
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

            {/* ── Liste des réponses (accordéon) ──────────── */}
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

            {/* ── Sources collaboratives (accordéon) ──────── */}
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
  const baseUrl = `https://ecclesia-cs.github.io${import.meta.env.BASE_URL}docs/`
  const docsPath = `${import.meta.env.BASE_URL}docs/`
  const filename = value.includes(docsPath) ? value.split(docsPath)[1] ?? '' : value

  function handleChange(raw: string) {
    const trimmed = raw.trim()
    onChange(trimmed ? baseUrl + trimmed : '')
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1.5">{label}</label>
      <div className="flex items-center gap-0 border border-gray-300 rounded-xl overflow-hidden
        focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent transition-shadow">
        <span className="px-3 py-2.5 text-xs text-gray-400 bg-gray-50 border-r border-gray-200 shrink-0 select-none whitespace-nowrap">
          docs/
        </span>
        <input
          type="text"
          value={filename}
          onChange={e => handleChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-3 py-2.5 text-sm focus:outline-none placeholder:text-gray-300 bg-white"
        />
      </div>
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
  table, action, onDelete,
}: {
  table: SessionTableRow
  action: React.ReactNode
  onDelete(): void
}) {
  const [expanded, setExpanded]           = useState(false)
  const [participants, setParticipants]   = useState<TableParticipantRow[] | null>(null)
  const [partLoading, setPartLoading]     = useState(false)
  const [partErr, setPartErr]             = useState<string | null>(null)

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

        {/* Trash + action */}
        <div className="shrink-0 flex items-center gap-1.5">
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
                  <div key={p.pseudo} className={`flex items-center gap-3 text-xs ${p.is_current_speaker ? 'text-amber-700 font-medium' : 'text-gray-600'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.is_current_speaker ? 'bg-amber-400' : 'bg-gray-300'}`} />
                    <span className="truncate flex-1">{p.pseudo}</span>
                    <span className={p.is_current_speaker ? 'text-amber-600' : 'text-gray-400'}>
                      {formatDuration(p.total_ms)}
                    </span>
                    <span className="text-gray-300 shrink-0">
                      {p.turn_count} tour{Number(p.turn_count) !== 1 ? 's' : ''}
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
