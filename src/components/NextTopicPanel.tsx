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

  // Chantier 168 : même bloc que le bouton « sujet suivant » de la vue
  // participant (colonne verte w-14 et pouce), avec la part de la table qui
  // le souhaite en jauge sous le texte.
  const part = total > 0 ? Math.round((votes / total) * 100) : 0

  return (
    <div className={`flex items-stretch overflow-hidden rounded-[12px] border transition-colors duration-300 ${
      votes > 0 ? 'border-emerald-400/40 bg-emerald-500/[0.12]' : 'border-white/10 bg-slate-800/60'
    }`}>
      <span aria-hidden="true" className={`flex w-14 shrink-0 items-center justify-center text-lg transition-colors duration-300 ${
        votes > 0 ? 'bg-emerald-600' : 'bg-white/[0.06]'
      }`}>
        👍
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">Sujet suivant</p>
          <p className="mt-1 text-sm text-slate-200 tabular-nums">
            <span className={`text-base font-bold ${votes > 0 ? 'text-creme' : 'text-slate-300'}`}>{votes}</span>
            {' '}sur {total} {votes > 1 ? 'souhaitent' : 'souhaite'} passer au sujet suivant
          </p>
          <span aria-hidden="true" className="mt-2 block h-[3px] w-full max-w-[14rem] bg-white/10">
            <span className="block h-full bg-emerald-400 transition-[width] duration-500" style={{ width: `${part}%` }} />
          </span>
          {err && <p className="text-xs text-red-300 mt-1">{err}</p>}
        </div>
        <button
          onClick={handleReset}
          disabled={busy || votes === 0}
          className="inline-flex h-9 items-center rounded-[8px] text-xs font-semibold px-3.5 bg-white/5 border border-white/15 text-slate-200
          hover:bg-white/10 hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors
          focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair/60 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-800
          whitespace-nowrap"
      >
          Réinitialiser
        </button>
      </div>
    </div>
  )
}
