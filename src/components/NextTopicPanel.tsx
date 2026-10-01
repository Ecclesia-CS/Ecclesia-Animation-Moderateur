import { useState } from 'react'
import { useTable } from '../context/TableContext'
import { extractErr } from '../lib/utils'

// Chantier 131 — compteur "d'accord pour passer au sujet suivant", lu directement
// sur `participants` (déjà répliqué en Realtime, aucun nouveau canal). Pas de
// notion de "sujet courant" dans le modèle de données : la remise à zéro est
// manuelle, déclenchée par le modérateur quand il décide de passer au sujet suivant.
export default function NextTopicPanel() {
  const { participants, resetNextTopicVotes } = useTable()
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState<string | null>(null)

  const votes = participants.filter(p => p.wants_next_topic).length
  const total = participants.length

  async function handleReset() {
    setBusy(true)
    setErr(null)
    try {
      await resetNextTopicVotes()
    } catch (e) {
      setErr(extractErr(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-slate-100">Sujet suivant</p>
        <p className="text-xs text-slate-400">
          <span className={votes > 0 ? 'text-emerald-400 font-semibold' : ''}>{votes}</span>
          {' '}/ {total} d'accord pour passer au sujet suivant
        </p>
        {err && <p className="text-xs text-red-400 mt-1">{err}</p>}
      </div>
      <button
        onClick={handleReset}
        disabled={busy || votes === 0}
        className="text-xs px-3 py-1.5 bg-slate-700 border border-slate-600 text-slate-200 rounded-lg
          hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors
          focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-1 focus:ring-offset-slate-800
          whitespace-nowrap"
      >
        Réinitialiser
      </button>
    </div>
  )
}
