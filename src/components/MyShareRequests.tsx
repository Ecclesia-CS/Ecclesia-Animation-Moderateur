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

  return (
    <ul className="w-full space-y-2">
      {mine.map(s => (
        <li
          key={s.id}
          className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm ${
            s.status === 'pending'
              ? 'bg-indigo-50 border-indigo-200 text-indigo-800'
              : 'bg-gray-100 border-gray-200 text-gray-600'
          }`}
        >
          <span className="min-w-0 truncate">
            {s.status === 'pending' ? 'En attente du modérateur' : 'Non retenue'} · <span className="font-medium">{s.title}</span>
          </span>
          {s.status === 'pending' ? (
            <button
              onClick={() => withdraw(s.id)}
              disabled={busyId === s.id}
              className="shrink-0 text-xs underline disabled:opacity-50"
            >
              Retirer
            </button>
          ) : (
            <button
              onClick={() => setDismissed(prev => new Set(prev).add(s.id))}
              className="shrink-0 text-xs underline"
            >
              Masquer
            </button>
          )}
        </li>
      ))}
      {err && <li className="text-xs text-red-600">{err}</li>}
    </ul>
  )
}
