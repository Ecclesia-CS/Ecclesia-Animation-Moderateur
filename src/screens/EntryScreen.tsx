import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { tableStore, lastNameStore } from '../lib/storage'
import { extractErr } from '../lib/utils'
import type { TableResult } from '../lib/supabase'
import type { Session } from '../lib/types'

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

type Mode = 'join' | 'reclaim' | 'create' | 'vote'

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
  const [reclaimCode, setReclaimCode] = useState('')
  const [reclaimPseudo, setReclaimPseudo] = useState(() => lastNameStore.get())
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [leaderless, setLeaderless] = useState(false)
  const [availableSessions, setAvailableSessions] = useState<{
    id: string
    title: string
    join_code: string | null
  }[]>([])

  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([])

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
      .in('phase', ['draft', 'voting', 'debating'])
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setAvailableSessions(data) })
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
    if (!reclaimPseudo.trim()) {
      setError('Veuillez entrer votre pseudo.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const { data, error: err } = await supabase.rpc('reclaim_moderator', {
        p_join_code: joinCode,
        p_moderator_code: reclaimCode,
        p_pseudo: reclaimPseudo.trim(),
      })
      if (err) throw err
      const r = data as TableResult
      tableStore.set({ tableId: r.id, participantId: r.participant_id, joinCode: r.join_code, isModerator: true, pseudo: reclaimPseudo.trim() })
      lastNameStore.set(reclaimPseudo)
      onJoined(r.id, r.participant_id, true)
    } catch (err) {
      setError(extractErr(err))
    } finally {
      setLoading(false)
    }
  }

  const [voteCode, setVoteCode] = useState('')

  const tabs: { id: Mode; label: string }[] = [
    { id: 'vote',    label: '🗳️ Voter' },
    { id: 'join',    label: 'Rejoindre' },
    { id: 'reclaim', label: 'Reprendre' },
    { id: 'create',  label: 'Créer' },
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
                    <p className="text-sm font-semibold text-gray-900 truncate">{s.title}</p>
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
              onClick={() => { setMode(t.id); setError(null) }}
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
          {mode === 'vote' && (
            <form
              onSubmit={e => {
                e.preventDefault()
                if (voteCode.trim()) window.location.hash = `#vote/${voteCode.trim()}`
              }}
              className="space-y-4"
            >
              <p className="text-xs text-gray-500">
                Entre le code de ta séance pour accéder au vote et aux résultats.
              </p>
              <Field
                label="Code de la séance"
                value={voteCode}
                onChange={v => setVoteCode(v.toUpperCase())}
                placeholder="A1B2C3"
              />
              <Btn loading={false} label="Accéder au vote →" />
            </form>
          )}

          {mode === 'join' && (
            <form onSubmit={handleJoin} className="space-y-4">
              <Field label="Code de session" value={joinCode}
                onChange={v => setJoinCode(v.toUpperCase())} placeholder="A1B2C3" />
              <Field label="Nom Prénom" value={pseudo} onChange={setPseudo} placeholder="Alice Dupont" />
              <p className="text-xs text-gray-400 -mt-2.5">Retiens bien ce que tu inscris ici, il te permettra d'être reconnu·e.</p>
              <Btn loading={loading} label="Rejoindre" />
            </form>
          )}

          {mode === 'create' && (
            <form onSubmit={handleCreate} className="space-y-4">
              <Field label={leaderless ? 'Votre nom Prénom' : 'Nom Prénom (animateur)'} value={pseudo} onChange={setPseudo}
                placeholder="Alice Dupont" />
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
                <span className="text-sm text-gray-700">Table sans animateur</span>
              </label>
              <Btn
                loading={loading}
                label="Créer la session"
                disabled={availableSessions.length === 0 || !selectedSessionId}
              />
            </form>
          )}

          {mode === 'reclaim' && (
            <form onSubmit={handleReclaim} className="space-y-4">
              <Field label="Code de session" value={joinCode}
                onChange={v => setJoinCode(v.toUpperCase())} placeholder="A1B2C3" />
              <Field label="Votre nom Prénom" value={reclaimPseudo}
                onChange={setReclaimPseudo} placeholder="Alice Dupont" />
              <Field label="Code Ecclesia" value={reclaimCode}
                onChange={setReclaimCode} type="password" placeholder="••••••••" />
              <Btn loading={loading} label="Reprendre la main" />
            </form>
          )}

          {error && (
            <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}
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
