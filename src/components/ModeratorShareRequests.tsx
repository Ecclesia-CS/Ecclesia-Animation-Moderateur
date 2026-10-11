import { useState } from 'react'
import { useTable } from '../context/TableContext'
import { extractErr } from '../lib/utils'
import { ShareLink, skinFor } from './TableShareCard'
import ShareImage from './ShareImage'

// Chantier 162a — côté modérateur : les demandes de partage en attente, avec leur
// contenu COMPLET (lien cliquable, extrait de la source) pour juger de sa
// pertinence avant que la table ne le voie. Accepter remplace la carte de la
// table ; refuser ne laisse aucune trace chez les autres participants.
// Chantier 168 — ocre de la nuit modérateur : c'est une demande qui attend, comme
// la parole en cours.
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
    <section className="rounded-[12px] border border-amber-500/40 bg-amber-500/10 p-4 space-y-3 animate-montee">
      <h2 className="flex items-center gap-2.5 font-sans text-[11px] font-bold uppercase tracking-[0.18em] text-amber-300">
        <span aria-hidden="true" className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inset-0 rounded-full bg-amber-400 animate-pouls" />
          <span className="relative h-2 w-2 rounded-full bg-amber-400" />
        </span>
        {pending.length === 1 ? 'Une source à valider' : `${pending.length} sources à valider`}
      </h2>
      <ul className="space-y-3">
        {pending.map(s => (
          <li key={s.id} className="rounded-[8px] bg-white/5 ring-1 ring-white/10 p-3 space-y-2">
            <div>
              <p className={`text-xs ${skin.meta}`}>
                Proposée par <span className="font-semibold text-creme">{s.author_pseudo}</span>
                {s.kind === 'collab_source' && ' · source du document collaboratif'}
                {s.kind === 'image' && ' · capture d’écran'}
              </p>
              <p className={`text-sm font-semibold break-words ${skin.title}`}>{s.title}</p>
            </div>
            {s.kind === 'image' && (
              <ShareImage path={s.image_path} purged={s.image_purged} alt={s.title} dark />
            )}
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
                className="rounded-[8px] flex-1 h-10 text-sm font-bold bg-creme hover:bg-white text-bleu-fonce transition-colors disabled:opacity-50
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                Montrer à la table
              </button>
              <button
                onClick={() => decide(s.id, false)}
                disabled={busyId === s.id}
                className="btn-verre rounded-[8px] flex-1 h-10 text-sm font-semibold text-creme disabled:opacity-50
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                Refuser
              </button>
            </div>
          </li>
        ))}
      </ul>
      {err && <p className="text-xs text-red-300">{err}</p>}
    </section>
  )
}
