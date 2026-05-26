import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { extractErr, fromDateTimeLocal } from '../lib/utils'
import {
  verifyPassword, createSession, closeSession,
  attachTableToSession, detachTableFromSession,
  listSessionTables, listAvailableTables,
} from '../lib/sessions'
import type { SessionTableRow } from '../lib/sessions'
import type { Session } from '../lib/types'
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
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
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
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
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
    </div>
  )
}

// ── SessionCard ───────────────────────────────────────────────────

function SessionCard({ session, onClose, onClick }: { session: SessionRow; onClose(): void; onClick(): void }) {
  const isClosed = session.phase === 'closed'

  return (
    <div
      className="bg-white rounded-2xl border border-gray-200 px-5 py-4 flex items-start gap-4 cursor-pointer hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors"
      onClick={onClick}
    >
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

      {/* Close button */}
      {!isClosed && (
        <button
          onClick={e => { e.stopPropagation(); onClose() }}
          className="shrink-0 py-1.5 px-3 text-xs font-medium border border-gray-200 rounded-lg
            text-gray-600 hover:border-red-200 hover:text-red-600 hover:bg-red-50 transition-colors"
        >
          Fermer
        </button>
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
  const [title, setTitle]             = useState('')
  const [description, setDescription] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)

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

  const load = useCallback(async () => {
    const password = getPwd()!
    setLoading(true)
    setError(null)
    try {
      const [attached, available] = await Promise.all([
        listSessionTables(password, session.id),
        listAvailableTables(password),
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
  }, [session.id, onAuthError])

  useEffect(() => { load() }, [load])

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
            <section>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Tables rattachées
              </h2>
              {attachedTables.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">Aucune table rattachée</p>
              ) : (
                <div className="space-y-2">
                  {attachedTables.map(t => (
                    <TableRow
                      key={t.id}
                      table={t}
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
              <p className="text-xs text-gray-400 mb-3">Créées dans les dernières 48h, non rattachées</p>
              {availableTables.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">Aucune table disponible</p>
              ) : (
                <div className="space-y-2">
                  {availableTables.map(t => (
                    <TableRow
                      key={t.id}
                      table={t}
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
          </>
        )}
      </main>

      {detachConfirm && (
        <ConfirmModal
          title="Détacher la table"
          body={`Détacher la table ${detachConfirm.join_code} de cette séance ?`}
          confirmLabel="Détacher"
          onConfirm={handleDetach}
          onCancel={() => setDetachConfirm(null)}
        />
      )}
    </div>
  )
}

function TableRow({ table, action }: { table: SessionTableRow; action: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 px-5 py-3 flex items-center gap-4">
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
      {action}
    </div>
  )
}
