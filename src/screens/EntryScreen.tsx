import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { tableStore, lastNameStore } from '../lib/storage'
import { extractErr } from '../lib/utils'
import { claimModeratorStatus } from '../lib/voting'
import type { TableResult } from '../lib/supabase'
import type { Session } from '../lib/types'

// ── Lien externe vers le site public Ecclesia (chantier 46) ────
const ALL_DEBATES_URL = 'https://ecclesia-centralesupelec.vercel.app/#debats'

// ── Séances en cours ────────────────────────────────────────────
const PHASE_BADGE: Record<string, string> = {
  pre_voting:    'bg-amber-100 text-amber-700',
  voting:        'bg-indigo-100 text-indigo-700',
  allocating:    'bg-amber-100 text-amber-700',
  debating:      'bg-green-100 text-green-700',
  questionnaire: 'bg-purple-100 text-purple-700',
}
const PHASE_LABEL: Record<string, string> = {
  pre_voting:    'Vote à distance ouvert',
  voting:        'Vote présentiel en cours',
  allocating:    'Formation des groupes',
  debating:      'Débat en cours',
  questionnaire: 'Questionnaire',
}
const PHASE_ACTION: Record<string, string> = {
  pre_voting:    'Voter →',
  voting:        'Participer →',
  allocating:    'Mon affectation →',
  debating:      'Rejoindre →',
  questionnaire: 'Répondre →',
}

type ActiveSession = Pick<Session, 'id' | 'title' | 'phase' | 'join_code'>

type Mode = 'join' | 'create' | 'moderator'

interface Props {
  userId: string
  onJoined(tableId: string, participantId: string, isModerator: boolean): void
}

export default function EntryScreen({ onJoined }: Props) {
  const [mode, setMode] = useState<Mode>('join')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [pseudo, setPseudo] = useState(() => lastNameStore.get())
  const [joinCode, setJoinCode] = useState('')
  const [creationCode, setCreationCode] = useState('')
  const [asModerator, setAsModerator] = useState(false)
  const [reclaimCode, setReclaimCode] = useState('')
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [leaderless, setLeaderless] = useState(false)
  const [availableSessions, setAvailableSessions] = useState<{
    id: string
    title: string
    join_code: string | null
  }[]>([])

  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([])

  // ── Anciennes séances aux résultats publics (chantier 46) ───────
  const [showPastSessions, setShowPastSessions] = useState(false)

  // ── Onglet Modérateur (G8) ──────────────────────────────────────
  const [moderatorSessions, setModeratorSessions] = useState<{
    id: string
    title: string
    join_code: string | null
  }[]>([])
  const [moderatorSessionId, setModeratorSessionId] = useState('')
  const [moderatorPassword, setModeratorPassword] = useState('')
  const [moderatorLoading, setModeratorLoading] = useState(false)
  const [moderatorError, setModeratorError] = useState<string | null>(null)

  useEffect(() => {
    function fetchActiveSessions() {
      supabase
        .from('sessions')
        .select('id, title, phase, join_code')
        .in('phase', ['pre_voting', 'voting', 'allocating', 'debating', 'questionnaire'])
        .order('created_at', { ascending: false })
        .then(({ data }) => { if (data) setActiveSessions(data as ActiveSession[]) })
    }
    fetchActiveSessions()
    const interval = setInterval(fetchActiveSessions, 30_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (mode !== 'create') return
    supabase
      .from('sessions')
      .select('id, title, join_code')
      .in('phase', ['draft', 'pre_voting', 'voting', 'debating'])
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setAvailableSessions(data) })
  }, [mode])

  // Séances où l'auto-déclaration modérateur a un sens : jusqu'à la formation
  // des groupes, et aussi pendant le débat (chantier 33, point 4) — une table
  // animée peut encore attendre son modérateur une fois le débat commencé.
  useEffect(() => {
    if (mode !== 'moderator') return
    supabase
      .from('sessions')
      .select('id, title, join_code')
      .in('phase', ['pre_voting', 'voting', 'allocating', 'debating'])
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setModeratorSessions(data) })
  }, [mode])

  function store(tableId: string, participantId: string, jCode: string, isMod: boolean) {
    tableStore.set({ tableId, participantId, joinCode: jCode, isModerator: isMod, pseudo })
    lastNameStore.set(pseudo)
    onJoined(tableId, participantId, isMod)
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { data, error: err } = await supabase.rpc('join_table', {
        p_join_code: joinCode,
        p_pseudo: pseudo,
      })
      if (err) throw err
      const r = data as TableResult
      store(r.id, r.participant_id, r.join_code, false)
    } catch (err) {
      setError(extractErr(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedSessionId) {
      setError('Veuillez sélectionner une séance.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const { data, error: err } = await supabase.rpc('create_table', {
        p_pseudo:        pseudo,
        p_creation_code: leaderless ? '' : creationCode,
        p_session_id:    selectedSessionId,
        p_leaderless:    leaderless,
      })
      if (err) throw err
      const r = data as TableResult
      store(r.id, r.participant_id, r.join_code, !leaderless)
    } catch (err) {
      setError(extractErr(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleReclaim(e: React.FormEvent) {
    e.preventDefault()
    if (!pseudo.trim()) {
      setError('Veuillez entrer votre nom prénom.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const { data, error: err } = await supabase.rpc('reclaim_moderator', {
        p_join_code: joinCode,
        p_moderator_code: reclaimCode,
        p_pseudo: pseudo.trim(),
      })
      if (err) throw err
      const r = data as TableResult
      tableStore.set({ tableId: r.id, participantId: r.participant_id, joinCode: r.join_code, isModerator: true, pseudo: pseudo.trim() })
      lastNameStore.set(pseudo)
      onJoined(r.id, r.participant_id, true)
    } catch (err) {
      setError(extractErr(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleClaimModerator(e: React.FormEvent) {
    e.preventDefault()
    if (!moderatorSessionId) {
      setModeratorError('Veuillez sélectionner une séance.')
      return
    }
    setModeratorError(null)
    setModeratorLoading(true)
    try {
      await claimModeratorStatus(moderatorSessionId, moderatorPassword, pseudo)
      lastNameStore.set(pseudo)
      const sel = moderatorSessions.find(s => s.id === moderatorSessionId)
      if (sel?.join_code) {
        window.location.hash = '#vote/' + sel.join_code
      } else {
        setModeratorError('Séance sans code — contactez le superadmin.')
      }
    } catch (err) {
      setModeratorError(extractErr(err))
    } finally {
      setModeratorLoading(false)
    }
  }

  const tabs: { id: Mode; label: string }[] = [
    { id: 'moderator', label: '🎙️ Modérateur' },
    { id: 'join',      label: 'Rejoindre ou reprendre une table' },
    { id: 'create',    label: 'Créer' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">

        {/* Brand header */}
        <div className="px-6 pt-7 pb-2 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 leading-tight">Ecclesia</h1>
            <p className="text-xs text-gray-400 leading-tight">Modération de débat</p>
          </div>
        </div>

        {/* Séances en cours */}
        {activeSessions.length > 0 && (
          <section className="px-6 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Séances en cours
            </p>
            <div className="space-y-2">
              {activeSessions.filter(s => s.join_code).map(s => (
                <div key={s.id}
                  className="bg-gray-50 rounded-xl border border-gray-200 p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 break-words">{s.title}</p>
                    <span className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${PHASE_BADGE[s.phase] ?? 'bg-gray-100 text-gray-600'}`}>
                      {PHASE_LABEL[s.phase] ?? s.phase}
                    </span>
                  </div>
                  <button
                    onClick={() => { window.location.hash = '#session/' + s.join_code! }}
                    className="shrink-0 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-colors"
                  >
                    {PHASE_ACTION[s.phase] ?? 'Accéder →'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mt-4">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => { setMode(t.id); setError(null); setAsModerator(false) }}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors focus:outline-none ${
                mode === t.id
                  ? 'border-b-2 border-indigo-600 text-indigo-600'
                  : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {mode === 'moderator' && (
            <form onSubmit={handleClaimModerator} className="space-y-4">
              <p className="text-xs text-gray-500">
                Déclare-toi modérateur d'une séance en cours (vote à distance, vote présentiel, formation des groupes ou débat déjà commencé) avec le mot de passe Ecclesia.
                Si tu es déjà inscrit·e sur cet appareil (tu as voté ou tu t'es déjà inscrit·e), on ajoute juste le badge modérateur à ton profil.
                Sinon, ton profil est créé avec le nom ci-dessous, comme une inscription normale.
                Si une table animée attend encore son modérateur, tu y seras assigné automatiquement.
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Séance <span className="text-red-500">*</span>
                </label>
                {moderatorSessions.length === 0 ? (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                    Aucune séance en vote, en formation des groupes ou en débat actuellement.
                  </p>
                ) : (
                  <select
                    value={moderatorSessionId}
                    onChange={e => setModeratorSessionId(e.target.value)}
                    required
                    className="w-full px-3 py-3 text-sm border border-gray-300 rounded-xl
                      focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                      bg-white transition-shadow"
                  >
                    <option value="" disabled>— Sélectionner une séance —</option>
                    {moderatorSessions.map(s => (
                      <option key={s.id} value={s.id}>{s.title}</option>
                    ))}
                  </select>
                )}
              </div>
              <Field label="Prénom Nom" value={pseudo} onChange={setPseudo} placeholder="Prénom Nom" />
              <p className="text-xs text-gray-400 -mt-2.5">
                Retiens bien ce que tu inscris ici — utilisé seulement si tu n'as pas encore de profil sur cette séance.
              </p>
              <Field label="Code Ecclesia" value={moderatorPassword}
                onChange={setModeratorPassword} type="password" placeholder="••••••••" />
              {moderatorError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                  {moderatorError}
                </div>
              )}
              <Btn
                loading={moderatorLoading}
                label="Rejoindre en tant que modérateur"
                disabled={moderatorSessions.length === 0}
              />
            </form>
          )}

          {mode === 'join' && !asModerator && (
            <form onSubmit={handleJoin} className="space-y-4">
              <Field label="Code de table" value={joinCode}
                onChange={v => setJoinCode(v.toUpperCase())} placeholder="A1B2C3" />
              <Field label="Prénom Nom" value={pseudo} onChange={setPseudo} placeholder="Prénom Nom" />
              <p className="text-xs text-gray-400 -mt-2.5">Retiens bien ce que tu inscris ici, il te permettra d'être reconnu·e.</p>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => { setAsModerator(true); setError(null) }}
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-gray-700">Je suis modérateur de cette table</span>
              </label>
              <Btn loading={loading} label="Rejoindre" />
            </form>
          )}

          {mode === 'join' && asModerator && (
            <form onSubmit={handleReclaim} className="space-y-4">
              <Field label="Code de table" value={joinCode}
                onChange={v => setJoinCode(v.toUpperCase())} placeholder="A1B2C3" />
              <Field label="Votre Prénom Nom" value={pseudo}
                onChange={setPseudo} placeholder="Prénom Nom" />
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={true}
                  onChange={() => { setAsModerator(false); setError(null) }}
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-gray-700">Je suis modérateur de cette table</span>
              </label>
              <Field label="Code Ecclesia" value={reclaimCode}
                onChange={setReclaimCode} type="password" placeholder="••••••••" />
              <Btn loading={loading} label="Reprendre la main" />
            </form>
          )}

          {mode === 'create' && (
            <form onSubmit={handleCreate} className="space-y-4">
              <Field label={leaderless ? 'Votre Prénom Nom' : 'Prénom Nom (modérateur)'} value={pseudo} onChange={setPseudo}
                placeholder="Prénom Nom" />
              <p className="text-xs text-gray-400 -mt-2.5">Retiens bien ce que tu inscris ici, il te permettra d'être reconnu·e.</p>
              {!leaderless && (
                <Field label="Code Ecclesia" value={creationCode}
                  onChange={setCreationCode} type="password" placeholder="••••••••" />
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Séance <span className="text-red-500">*</span>
                </label>
                {availableSessions.length === 0 ? (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                    Aucune séance active — créez d'abord une séance dans l'Administration.
                  </p>
                ) : (
                  <>
                    <select
                      value={selectedSessionId}
                      onChange={e => setSelectedSessionId(e.target.value)}
                      required
                      className="w-full px-3 py-3 text-sm border border-gray-300 rounded-xl
                        focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                        bg-white transition-shadow"
                    >
                      <option value="" disabled>— Sélectionner une séance —</option>
                      {availableSessions.map(s => (
                        <option key={s.id} value={s.id}>{s.title}</option>
                      ))}
                    </select>
                    {(() => {
                      const sel = availableSessions.find(s => s.id === selectedSessionId)
                      if (!sel?.join_code) return null
                      return (
                        <a
                          href={`#collab/${sel.join_code}`}
                          className="mt-2 flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                            <circle cx="9" cy="7" r="4"/>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                          </svg>
                          Sources collaboratives de cette séance
                        </a>
                      )
                    })()}
                  </>
                )}
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={leaderless}
                  onChange={e => setLeaderless(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">Table sans modérateur</span>
              </label>
              <Btn
                loading={loading}
                label="Créer la session"
                disabled={availableSessions.length === 0 || !selectedSessionId}
              />
            </form>
          )}

          {mode !== 'moderator' && error && (
            <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="pb-5 px-6 flex flex-col items-center gap-2">
          <a
            href={ALL_DEBATES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full text-center py-2.5 px-4 border border-gray-200 rounded-xl
              text-sm font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
          >
            Voir tous les débats ↗
          </a>
          <button
            onClick={() => setShowPastSessions(true)}
            className="text-xs text-gray-400 hover:text-indigo-600 transition-colors"
          >
            Voir les votes des anciennes séances
          </button>
        </div>

        <div className="pb-4 text-center">
          <a
            href="#superadmin"
            className="text-xs text-gray-300 hover:text-gray-400 transition-colors"
          >
            Administration
          </a>
        </div>
      </div>

      {showPastSessions && (
        <PastSessionsModal onClose={() => setShowPastSessions(false)} />
      )}
    </div>
  )
}

// ── PastSessionsModal — anciennes séances aux résultats publics ────
function PastSessionsModal({ onClose }: { onClose(): void }) {
  const [sessions, setSessions] = useState<Pick<Session, 'id' | 'title' | 'description' | 'scheduled_at'>[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('sessions')
      .select('id, title, description, scheduled_at')
      .eq('phase', 'closed')
      .eq('results_public', true)
      .order('scheduled_at', { ascending: false, nullsFirst: false })
      .then(({ data, error: err }) => {
        if (err) { setError(extractErr(err)); return }
        setSessions(data ?? [])
      })
  }, [])

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">Anciennes séances</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>
        <div className="overflow-y-auto px-5 py-4 space-y-2">
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          {!error && sessions === null && (
            <p className="text-sm text-gray-400 text-center py-6">Chargement…</p>
          )}
          {!error && sessions !== null && sessions.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">
              Aucune séance aux résultats publics pour l'instant.
            </p>
          )}
          {!error && sessions?.map(s => (
            <button
              key={s.id}
              onClick={() => { window.location.hash = '#results/' + s.id }}
              className="w-full text-left bg-gray-50 hover:bg-indigo-50 rounded-xl border border-gray-200
                hover:border-indigo-200 px-4 py-3 transition-colors"
            >
              <p className="text-sm font-semibold text-gray-900">{s.title}</p>
              {s.scheduled_at && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(s.scheduled_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              )}
              {s.description && (
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{s.description}</p>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────

function Field({
  label, value, onChange, type = 'text', placeholder, className = '',
}: {
  label: string
  value: string
  onChange(v: string): void
  type?: string
  placeholder?: string
  className?: string
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
            ${isPassword ? 'pr-10' : ''} ${className}`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPwd(v => !v)}
            tabIndex={-1}
            title={showPwd ? 'Masquer' : 'Afficher'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400
              hover:text-gray-600 transition-colors"
          >
            {showPwd ? <EyeOff /> : <Eye />}
          </button>
        )}
      </div>
    </div>
  )
}

function Eye() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOff() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function Btn({ loading, label, disabled = false }: { loading: boolean; label: string; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400
        text-white text-sm font-medium rounded-xl transition-colors focus:outline-none
        focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 flex items-center justify-center gap-2"
    >
      {loading ? (
        <>
          <Spinner />
          Chargement…
        </>
      ) : label}
    </button>
  )
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  )
}
