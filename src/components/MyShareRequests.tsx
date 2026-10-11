import { useState } from 'react'
import { useTable } from '../context/TableContext'
import { extractErr } from '../lib/utils'

// Chantier 162a — côté participant : l'état de SES demandes. « En attente »
// (retirable), puis « montrée » (la carte apparaît chez toute la table, rien à
// ajouter ici) ou « non retenue ». Une demande refusée se masque d'un clic.
export default function MyShareRequests() {
  const { shares, withdrawShare } = useTable()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const mine = shares.filter(s =>
    s.is_mine && (s.status === 'pending' || (s.status === 'refused' && !dismissed.has(s.id))),
  )
  if (mine.length === 0) return null

  async function withdraw(id: string) {
    setErr(null)
    setBusyId(id)
    try { await withdrawShare(id) } catch (e) { setErr(extractErr(e)) } finally { setBusyId(null) }
  }

  const bouton = `rounded-[8px] inline-flex h-8 shrink-0 items-center border border-bleu-fonce/20 bg-white px-3 text-xs font-semibold text-bleu-fonce
    transition-colors hover:border-bleu-fonce/40 hover:bg-bleu-fonce/[0.04] disabled:opacity-50
    focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair`

  return (
    <ul className="w-full space-y-2">
      {mine.map(s => (
        <li
          key={s.id}
          className={`flex items-center justify-between gap-3 rounded-[12px] border px-4 py-2.5 text-sm shadow-sm animate-montee ${
            s.status === 'pending'
              ? 'bg-white border-amber-600/30 text-anthracite'
              : 'bg-gray-100 border-bleu-fonce/10 text-gray-700'
          }`}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            {s.status === 'pending' && (
              <span aria-hidden="true" className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inset-0 rounded-full bg-amber-600 animate-pouls" />
                <span className="relative h-2 w-2 rounded-full bg-amber-600" />
              </span>
            )}
            <span className="min-w-0 truncate">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-600">
                {s.status === 'pending' ? 'En attente du modérateur' : 'Non retenue'}
              </span>
              <span className="block truncate font-semibold text-bleu-fonce">{s.title}</span>
            </span>
          </span>
          {s.status === 'pending' ? (
            <button onClick={() => withdraw(s.id)} disabled={busyId === s.id} className={bouton}>
              Retirer
            </button>
          ) : (
            <button onClick={() => setDismissed(prev => new Set(prev).add(s.id))} className={bouton}>
              Masquer
            </button>
          )}
        </li>
      ))}
      {err && <li className="text-xs text-red-600">{err}</li>}
    </ul>
  )
}
