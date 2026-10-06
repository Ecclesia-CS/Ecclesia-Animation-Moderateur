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
    <div className="bg-slate-800/60 border border-white/10 px-4 py-3 flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-creme">Sujet suivant</p>
        <p className="text-xs text-slate-300 tabular-nums">
          <span className={votes > 0 ? 'text-emerald-300 font-semibold' : ''}>{votes}</span>
          {' '}/ {total} d'accord pour passer au sujet suivant
        </p>
        {err && <p className="text-xs text-red-300 mt-1">{err}</p>}
      </div>
      <button
        onClick={handleReset}
        disabled={busy || votes === 0}
        className="text-xs px-3 py-1.5 bg-white/5 border border-white/15 text-slate-200
          hover:bg-white/10 hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors
          focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair/60 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-800
          whitespace-nowrap"
      >
        Réinitialiser
      </button>
    </div>
  )
}
