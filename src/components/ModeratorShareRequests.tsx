import { useState } from 'react'
import { useTable } from '../context/TableContext'
import { extractErr } from '../lib/utils'
import { ShareLink, skinFor } from './TableShareCard'

// Chantier 162a — côté modérateur : les demandes de partage en attente, avec leur
// contenu COMPLET (lien cliquable, extrait de la source) pour juger de sa
// pertinence avant que la table ne le voie. Accepter remplace la carte de la
// table ; refuser ne laisse aucune trace chez les autres participants.
export default function ModeratorShareRequests() {
  const { shares, decideShare } = useTable()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const skin = skinFor(true)

  const pending = shares.filter(s => s.status === 'pending')
  if (pending.length === 0) return null

  async function decide(id: string, accept: boolean) {
    setErr(null)
    setBusyId(id)
    try { await decideShare(id, accept) } catch (e) { setErr(extractErr(e)) } finally { setBusyId(null) }
  }

  return (
    <section className="rounded-2xl border border-amber-600/50 bg-amber-900/20 p-4 space-y-3">
      <h2 className="text-sm font-semibold text-amber-300">
        {pending.length === 1 ? 'Une source à valider' : `${pending.length} sources à valider`}
      </h2>
      <ul className="space-y-3">
        {pending.map(s => (
          <li key={s.id} className="rounded-xl bg-slate-800 border border-slate-700 p-3 space-y-2">
            <div>
              <p className={`text-xs ${skin.meta}`}>
                Proposée par <span className="font-semibold">{s.author_pseudo}</span>
                {s.kind === 'collab_source' && ' · source du document collaboratif'}
              </p>
              <p className={`text-sm font-semibold break-words ${skin.title}`}>{s.title}</p>
            </div>
            {s.url && <ShareLink url={s.url} skin={skin} />}
            {s.content && (
              <p className={`text-xs leading-relaxed whitespace-pre-wrap break-words max-h-32 overflow-y-auto ${skin.body}`}>
                {s.content}
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => decide(s.id, true)}
                disabled={busyId === s.id}
                className="flex-1 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl
                  transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                Montrer à la table
              </button>
              <button
                onClick={() => decide(s.id, false)}
                disabled={busyId === s.id}
                className="flex-1 py-2 text-sm font-medium border border-slate-600 text-slate-300 hover:bg-slate-700
                  rounded-xl transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-slate-500"
              >
                Refuser
              </button>
            </div>
          </li>
        ))}
      </ul>
      {err && <p className="text-xs text-red-400">{err}</p>}
    </section>
  )
}
