import { useState } from 'react'
import { supabase, type TableResult } from '../lib/supabase'

type Mode = 'create' | 'join' | 'reclaim'

export default function TestScreen() {
  const [mode, setMode] = useState<Mode>('join')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<TableResult | null>(null)
  const [reclaimOk, setReclaimOk] = useState<boolean | null>(null)

  // Shared fields
  const [pseudo, setPseudo] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [creationCode, setCreationCode] = useState('')
  const [moderatorCode, setModeratorCode] = useState('')

  function reset() {
    setError(null)
    setResult(null)
    setReclaimOk(null)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    reset()
    setLoading(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('create_table', {
        p_pseudo: pseudo,
        p_creation_code: creationCode,
        p_moderator_code: moderatorCode,
      })
      if (rpcError) throw rpcError
      setResult(data as TableResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    reset()
    setLoading(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('join_table', {
        p_join_code: joinCode,
        p_pseudo: pseudo,
      })
      if (rpcError) throw rpcError
      setResult(data as TableResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleReclaim(e: React.FormEvent) {
    e.preventDefault()
    reset()
    setLoading(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('reclaim_moderator', {
        p_join_code: joinCode,
        p_moderator_code: moderatorCode,
      })
      if (rpcError) throw rpcError
      setReclaimOk(data as boolean)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const tabs: { id: Mode; label: string }[] = [
    { id: 'join', label: 'Rejoindre' },
    { id: 'reclaim', label: 'Reprendre la modération' },
    { id: 'create', label: 'Créer une session' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 pt-6 pb-2">
          <h1 className="text-xl font-semibold text-gray-900">Ecclesia</h1>
          <p className="text-sm text-gray-500 mt-0.5">Écran de test des fondations</p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mt-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setMode(t.id); reset() }}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                mode === t.id
                  ? 'border-b-2 border-indigo-600 text-indigo-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* ── CREATE ── */}
          {mode === 'create' && (
            <form onSubmit={handleCreate} className="space-y-4">
              <Field label="Pseudo (modérateur)" value={pseudo} onChange={setPseudo} placeholder="Alice" />
              <Field label="Code de création du club" value={creationCode} onChange={setCreationCode} type="password" placeholder="••••••••" />
              <Field label="Code modérateur (à retenir)" value={moderatorCode} onChange={setModeratorCode} type="password" placeholder="••••••••" />
              <SubmitButton loading={loading} label="Créer la session" />
            </form>
          )}

          {/* ── JOIN ── */}
          {mode === 'join' && (
            <form onSubmit={handleJoin} className="space-y-4">
              <Field label="Code de session" value={joinCode} onChange={setJoinCode} placeholder="A1B2C3" className="uppercase" />
              <Field label="Pseudo" value={pseudo} onChange={setPseudo} placeholder="Bob" />
              <SubmitButton loading={loading} label="Rejoindre" />
            </form>
          )}

          {/* ── RECLAIM ── */}
          {mode === 'reclaim' && (
            <form onSubmit={handleReclaim} className="space-y-4">
              <Field label="Code de session" value={joinCode} onChange={setJoinCode} placeholder="A1B2C3" className="uppercase" />
              <Field label="Code modérateur" value={moderatorCode} onChange={setModeratorCode} type="password" placeholder="••••••••" />
              <SubmitButton loading={loading} label="Reprendre la main" />
            </form>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Session result */}
          {result && (
            <div className="mt-4 p-4 rounded-lg bg-green-50 border border-green-200 text-sm space-y-1">
              <p className="font-semibold text-green-800">Session active</p>
              <ResultRow label="Code de session" value={result.join_code} mono />
              <ResultRow label="Session ID" value={result.id} mono small />
              <ResultRow label="Participant ID" value={result.participant_id} mono small />
            </div>
          )}

          {/* Reclaim result */}
          {reclaimOk !== null && (
            <div className={`mt-4 p-3 rounded-lg border text-sm ${
              reclaimOk
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              {reclaimOk ? 'Modération récupérée avec succès.' : 'Code modérateur incorrect ou session introuvable.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Small helpers ──────────────────────────────────────────────

function Field({
  label, value, onChange, type = 'text', placeholder, className = '',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  className?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${className}`}
      />
    </div>
  )
}

function SubmitButton({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-lg transition-colors"
    >
      {loading ? 'Chargement…' : label}
    </button>
  )
}

function ResultRow({ label, value, mono, small }: { label: string; value: string; mono?: boolean; small?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-500 shrink-0">{label} :</span>
      <span className={`${mono ? 'font-mono' : ''} ${small ? 'text-xs' : ''} text-gray-900 break-all`}>{value}</span>
    </div>
  )
}
