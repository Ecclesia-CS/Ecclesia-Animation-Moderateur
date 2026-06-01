import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { extractErr } from '../lib/utils'
import {
  registerCollabPseudo,
  addCollabSource,
  updateCollabSource,
  deleteCollabSource,
  listSessionSources,
} from '../lib/sessions'
import type { CollabSource } from '../lib/types'
import ConfirmModal from '../components/ConfirmModal'

interface Props {
  sessionJoinCode: string
}

type SessionInfo = {
  id: string
  title: string
  phase: string
}

export default function CollabDocScreen({ sessionJoinCode }: Props) {
  const [session,          setSession]          = useState<SessionInfo | null>(null)
  const [notFound,         setNotFound]         = useState(false)
  const [myPseudo,         setMyPseudo]         = useState<string | null>(null)
  const [myUserId,         setMyUserId]         = useState<string | null>(null)
  const [myTableJoinCode,  setMyTableJoinCode]  = useState<string | null>(null)
  const [sources,          setSources]          = useState<CollabSource[]>([])
  const [loading,          setLoading]          = useState(true)
  const [error,            setError]            = useState<string | null>(null)

  // ── Registration state ─────────────────────────────────────────
  const [registerPseudo,  setRegisterPseudo]  = useState('')
  const [registering,     setRegistering]     = useState(false)
  const [registerErr,     setRegisterErr]     = useState<string | null>(null)

  // ── Add / Edit source state ────────────────────────────────────
  const [showAddForm,   setShowAddForm]   = useState(false)
  const [editingSource, setEditingSource] = useState<CollabSource | null>(null)
  const [formTitle,     setFormTitle]     = useState('')
  const [formUrl,       setFormUrl]       = useState('')
  const [formContent,   setFormContent]   = useState('')
  const [formLoading,   setFormLoading]   = useState(false)
  const [formErr,       setFormErr]       = useState<string | null>(null)

  // ── Delete confirm state ───────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState<CollabSource | null>(null)
  const [deleting,      setDeleting]      = useState<string | null>(null)
  const [returnHash,    setReturnHash]    = useState('')

  // ── Init : load session + user + sources ───────────────────────
  useEffect(() => {
    async function init() {
      setLoading(true)
      setError(null)

      // Ensure anonymous auth
      let session = (await supabase.auth.getSession()).data.session
      if (!session) {
        const { data } = await supabase.auth.signInAnonymously()
        session = data.session
      }
      const uid = session?.user.id ?? null
      setMyUserId(uid)

      // Fetch session by join_code
      const { data: sessData, error: sessErr } = await supabase
        .from('sessions')
        .select('id, title, phase')
        .eq('join_code', sessionJoinCode)
        .maybeSingle()

      if (sessErr) { setError(extractErr(sessErr)); setLoading(false); return }
      if (!sessData) { setNotFound(true); setLoading(false); return }
      setSession(sessData as SessionInfo)

      // Check registration
      let alreadyRegistered = false
      if (uid) {
        const { data: regData } = await supabase
          .from('collab_session_users')
          .select('pseudo')
          .eq('session_id', sessData.id)
          .eq('user_id', uid)
          .maybeSingle()
        if (regData) {
          setMyPseudo((regData as { pseudo: string }).pseudo)
          alreadyRegistered = true
        }
      }

      // Destination de retour transmise par l'écran appelant
      const storedReturn = sessionStorage.getItem('ecclesia_collab_return')
      if (storedReturn) {
        sessionStorage.removeItem('ecclesia_collab_return')
        setReturnHash(storedReturn)
      }

      // Lire le table_join_code transmis via sessionStorage (si navigation depuis une vue table)
      const storedTable = sessionStorage.getItem(`ecclesia_collab_table_${sessionJoinCode}`)
      if (storedTable) {
        sessionStorage.removeItem(`ecclesia_collab_table_${sessionJoinCode}`)
        setMyTableJoinCode(storedTable)
      }

      // Auto-enregistrement si pseudo transmis depuis la vue table (via sessionStorage)
      if (!alreadyRegistered && uid) {
        const storedPseudo = sessionStorage.getItem(`ecclesia_collab_pseudo_${sessionJoinCode}`)
        if (storedPseudo) {
          sessionStorage.removeItem(`ecclesia_collab_pseudo_${sessionJoinCode}`)
          try {
            await registerCollabPseudo(sessData.id, storedPseudo)
            setMyPseudo(storedPseudo)
          } catch { /* silencieux — l'utilisateur pourra s'enregistrer manuellement */ }
        }
      }

      // Load sources
      try {
        const rows = await listSessionSources(sessData.id)
        setSources(rows)
      } catch (e) {
        setError(extractErr(e))
      }

      setLoading(false)
    }
    init()
  }, [sessionJoinCode])

  // ── Realtime : session_sources ─────────────────────────────────
  useEffect(() => {
    if (!session) return
    const ch = supabase
      .channel(`collab:${session.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'session_sources', filter: `session_id=eq.${session.id}` },
        async () => {
          try {
            const rows = await listSessionSources(session.id)
            setSources(rows)
          } catch { /* non-bloquant */ }
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [session])

  // ── Registration ───────────────────────────────────────────────
  const handleRegister = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session) return
    setRegistering(true)
    setRegisterErr(null)
    try {
      await registerCollabPseudo(session.id, registerPseudo.trim())
      setMyPseudo(registerPseudo.trim())
      // Re-fetch sources to update table_join_code after potential transfer
      const rows = await listSessionSources(session.id)
      setSources(rows)
    } catch (e) {
      setRegisterErr(extractErr(e))
    } finally {
      setRegistering(false)
    }
  }, [session, registerPseudo])

  // ── Open add form ──────────────────────────────────────────────
  // Les champs formTitle/formUrl/formContent sont intentionnellement préservés
  // pour que l'utilisateur retrouve son brouillon s'il a fermé sans soumettre.
  function openAdd() {
    setEditingSource(null)
    setFormErr(null)
    setShowAddForm(true)
  }

  // ── Open edit form ─────────────────────────────────────────────
  function openEdit(src: CollabSource) {
    setEditingSource(src)
    setFormTitle(src.title)
    setFormUrl(src.url ?? '')
    setFormContent(src.content ?? '')
    setFormErr(null)
    setShowAddForm(true)
  }

  // ── Submit source form ─────────────────────────────────────────
  const handleFormSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session) return
    setFormLoading(true)
    setFormErr(null)
    try {
      const title   = formTitle.trim()
      const url     = formUrl.trim() || null
      const content = formContent.trim() || null
      if (editingSource) {
        const updated = await updateCollabSource(editingSource.id, title, url, content)
        setSources(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s))
      } else {
        const created = await addCollabSource(session.id, title, url, content, myTableJoinCode)
        setSources(prev => [...prev, { ...created, table_join_code: myTableJoinCode }])
        // Vide le brouillon après soumission réussie
        setFormTitle('')
        setFormUrl('')
        setFormContent('')
      }
      setShowAddForm(false)
    } catch (e) {
      setFormErr(extractErr(e))
    } finally {
      setFormLoading(false)
    }
  }, [session, editingSource, formTitle, formUrl, formContent])

  // ── Delete source ──────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) return
    const target = deleteConfirm
    setDeleteConfirm(null)
    setDeleting(target.id)
    try {
      await deleteCollabSource(target.id)
      setSources(prev => prev.filter(s => s.id !== target.id))
    } catch (e) {
      setError(extractErr(e))
    } finally {
      setDeleting(null)
    }
  }, [deleteConfirm])

  // ── Render ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400">Chargement…</p>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-sm text-gray-500">Séance introuvable ou lien invalide.</p>
        <button
          onClick={() => { window.location.hash = '' }}
          className="text-sm text-indigo-600 hover:underline"
        >
          ← Retour à l'accueil
        </button>
      </div>
    )
  }

  // Group sources by table_join_code
  const grouped = groupByTable(sources)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ───────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button
            onClick={() => { window.location.hash = returnHash || '' }}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 -ml-1 shrink-0"
            title="Retour"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-gray-900 truncate">
              Sources collaboratives
            </h1>
            {session && (
              <p className="text-xs text-gray-400 truncate">{session.title}</p>
            )}
          </div>
          {myPseudo && (
            <div className="shrink-0 flex items-center gap-2">
              <span className="text-xs text-gray-400">
                <span className="font-medium text-gray-600">{myPseudo}</span>
                {' '}
                <button
                  onClick={() => setMyPseudo(null)}
                  className="text-gray-400 hover:text-gray-600 underline"
                >
                  Changer
                </button>
              </span>
              <button
                onClick={openAdd}
                className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white
                  text-xs font-medium rounded-lg transition-colors focus:outline-none
                  focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
              >
                + Ajouter
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-6">
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between gap-2">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 shrink-0">✕</button>
          </div>
        )}

        {/* ── Registration panel ────────────────────────────── */}
        {!myPseudo && (
          <section className="bg-white rounded-2xl border border-indigo-200 px-5 py-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 mb-1">
                Ajouter vos sources
              </h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Choisissez un pseudo pour contribuer au document. Vous pourrez ensuite
                ajouter, modifier et supprimer vos propres sources.
              </p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-xs text-amber-700 leading-relaxed">
                <strong>Important :</strong> retenez bien votre pseudo. Il vous permet de
                retrouver vos sources depuis un autre appareil ou après fermeture du navigateur.
                Quiconque connaît votre pseudo peut reprendre votre identité sur ce document.
              </p>
            </div>
            <form onSubmit={handleRegister} className="flex gap-2">
              <input
                type="text"
                required
                value={registerPseudo}
                onChange={e => setRegisterPseudo(e.target.value)}
                placeholder="Votre pseudo"
                className="flex-1 px-3 py-2.5 text-sm border border-gray-300 rounded-xl
                  focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                  placeholder:text-gray-300 transition-shadow"
              />
              <button
                type="submit"
                disabled={registering || !registerPseudo.trim()}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400
                  text-white text-sm font-medium rounded-xl transition-colors focus:outline-none
                  focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 flex items-center gap-2"
              >
                {registering && <SmallSpinner />}
                {registering ? 'Connexion…' : 'Rejoindre'}
              </button>
            </form>
            {registerErr && (
              <p className="text-xs text-red-600">{registerErr}</p>
            )}
            <p className="text-xs text-gray-400">
              Vous pouvez parcourir les sources sans pseudo.
            </p>
          </section>
        )}

        {/* ── Source list ───────────────────────────────────── */}
        {sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p className="text-sm text-gray-400">Aucune source partagée pour l'instant.</p>
            {myPseudo && (
              <button
                onClick={openAdd}
                className="text-sm text-indigo-600 hover:underline"
              >
                Ajouter la première source
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(group => (
              <section key={group.tableJoinCode ?? '__none__'}>
                {/* Group header */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-px flex-1 bg-gray-200" />
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-2">
                    {group.tableJoinCode
                      ? `Table ${group.tableJoinCode}`
                      : 'Non assigné à une table'}
                  </span>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>

                {/* Sources in this group */}
                <div className="space-y-3">
                  {group.sources.map(src => (
                    <SourceCard
                      key={src.id}
                      source={src}
                      isOwn={src.user_id === myUserId}
                      deleting={deleting === src.id}
                      onEdit={() => openEdit(src)}
                      onDelete={() => setDeleteConfirm(src)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* ── Add / Edit modal ──────────────────────────────────── */}
      {showAddForm && (
        <div
          className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4"
          onClick={() => setShowAddForm(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-0">
              <h2 className="text-sm font-semibold text-gray-900">
                {editingSource ? 'Modifier la source' : 'Ajouter une source'}
              </h2>
              <button
                onClick={() => setShowAddForm(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <form onSubmit={handleFormSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Titre <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="Ex : Rapport sur le thème X"
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl
                    focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                    placeholder:text-gray-300 transition-shadow"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Lien <span className="text-gray-400 font-normal">(optionnel)</span>
                </label>
                <input
                  type="url"
                  value={formUrl}
                  onChange={e => setFormUrl(e.target.value)}
                  placeholder="https://…"
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl
                    focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                    placeholder:text-gray-300 transition-shadow"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Notes <span className="text-gray-400 font-normal">(optionnel)</span>
                </label>
                <textarea
                  value={formContent}
                  onChange={e => setFormContent(e.target.value)}
                  rows={3}
                  placeholder="Résumé, extraits pertinents, commentaire…"
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl resize-none
                    focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                    placeholder:text-gray-300 transition-shadow"
                />
              </div>
              {formErr && (
                <p className="text-xs text-red-600">{formErr}</p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 py-2.5 text-sm border border-gray-200 rounded-xl
                    text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400
                    text-white text-sm font-medium rounded-xl transition-colors
                    flex items-center justify-center gap-2"
                >
                  {formLoading && <SmallSpinner />}
                  {formLoading ? 'Enregistrement…' : (editingSource ? 'Modifier' : 'Ajouter')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete confirm ────────────────────────────────────── */}
      {deleteConfirm && (
        <ConfirmModal
          title="Supprimer la source"
          body={`Supprimer définitivement "${deleteConfirm.title}" ? Cette action est irréversible.`}
          confirmLabel="Supprimer"
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  )
}

// ── SourceCard ─────────────────────────────────────────────────────

function SourceCard({
  source, isOwn, deleting, onEdit, onDelete,
}: {
  source: CollabSource
  isOwn: boolean
  deleting: boolean
  onEdit(): void
  onDelete(): void
}) {
  const date = new Date(source.created_at).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <div className={`bg-white rounded-xl border px-4 py-3.5 space-y-2 transition-colors ${
      isOwn ? 'border-indigo-200' : 'border-gray-200'
    }`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-indigo-600">{source.pseudo}</span>
            <span className="text-xs text-gray-300">·</span>
            <span className="text-xs text-gray-400">{date}</span>
          </div>
          <p className="text-sm font-medium text-gray-900 mt-0.5 leading-snug">{source.title}</p>
        </div>
        {isOwn && (
          <div className="shrink-0 flex items-center gap-1">
            <button
              onClick={onEdit}
              title="Modifier"
              className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button
              onClick={onDelete}
              disabled={deleting}
              title="Supprimer"
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50
                transition-colors disabled:opacity-40"
            >
              {deleting ? (
                <SmallSpinner className="text-red-400" />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              )}
            </button>
          </div>
        )}
      </div>

      {/* URL */}
      {source.url && (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-indigo-600 hover:underline truncate"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          {source.url}
        </a>
      )}

      {/* Content */}
      {source.content && (
        <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">
          {source.content}
        </p>
      )}
    </div>
  )
}

// ── groupByTable ───────────────────────────────────────────────────

type SourceGroup = { tableJoinCode: string | null; sources: CollabSource[] }

function groupByTable(sources: CollabSource[]): SourceGroup[] {
  const map = new Map<string, CollabSource[]>()
  const order: (string | null)[] = []

  for (const src of sources) {
    const key = src.table_join_code ?? '__none__'
    if (!map.has(key)) {
      map.set(key, [])
      order.push(src.table_join_code)
    }
    map.get(key)!.push(src)
  }

  // Sort: tables first (alphabetically), then "non assigné"
  const withTable   = order.filter((k): k is string => k !== null).sort()
  const withoutTable = order.includes(null) ? [null] : []

  return [...withTable, ...withoutTable].map(key => ({
    tableJoinCode: key,
    sources: map.get(key ?? '__none__') ?? [],
  }))
}

// ── SmallSpinner ───────────────────────────────────────────────────

function SmallSpinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`w-3.5 h-3.5 animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  )
}
