import { useState } from 'react'
import { useTable } from '../context/TableContext'
import { extractErr, isSafeUrl } from '../lib/utils'
import { hostOf } from '../lib/tableShare'
import type { TableShare } from '../lib/types'
import ShareImage from './ShareImage'

// Chantier 162a — ce que la table voit du fil de partage : la source acceptée en
// dernier en grande carte, puis le fil des sources déjà montrées pendant ce débat.
// Les demandes en attente (modérateur) et « mes demandes » (participant) ont leurs
// propres blocs plus bas. Aucune saisie libre dans cette zone : un lien et un
// titre court, c'est ce qui l'empêche de devenir un chat.

interface Skin {
  card: string
  title: string
  meta: string
  link: string
  body: string
  muted: string
  btn: string
  row: string
}

const LIGHT: Skin = {
  card:  'bg-white border-indigo-200',
  title: 'text-gray-900',
  meta:  'text-gray-500',
  link:  'text-indigo-600 hover:underline',
  body:  'text-gray-700',
  muted: 'text-gray-500',
  btn:   'border-gray-300 text-gray-500 hover:bg-gray-100',
  row:   'border-gray-200',
}

const DARK: Skin = {
  card:  'bg-slate-800 border-indigo-500/40',
  title: 'text-white',
  meta:  'text-slate-400',
  link:  'text-indigo-300 hover:underline',
  body:  'text-slate-300',
  muted: 'text-slate-400',
  btn:   'border-slate-600 text-slate-300 hover:bg-slate-700',
  row:   'border-slate-700',
}

export function skinFor(dark: boolean): Skin {
  return dark ? DARK : LIGHT
}

/** Lien cliquable (http/https seulement) ; un schéma non autorisé n'est jamais rendu en <a>. */
export function ShareLink({ url, skin }: { url: string; skin: Skin }) {
  if (!isSafeUrl(url)) {
    return <p className="text-xs text-red-500 truncate" title={url}>⚠ Lien non affiché</p>
  }
  const host = hostOf(url)
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 text-sm font-medium break-all ${skin.link}`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
      </svg>
      {host || url}
    </a>
  )
}

interface Props {
  /** Fond sombre (écran modérateur). */
  dark?: boolean
}

export default function TableShareCard({ dark = false }: Props) {
  const { table, shares, isModerator, endShare } = useTable()
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const skin = skinFor(dark)

  const accepted = shares.filter(s => s.status === 'accepted')
  const active: TableShare | undefined = table.active_share_id
    ? accepted.find(s => s.id === table.active_share_id)
    : undefined
  const history = accepted.filter(s => s.id !== active?.id)

  if (!active && history.length === 0) return null

  async function handleRemove() {
    setErr(null)
    setBusy(true)
    try { await endShare() } catch (e) { setErr(extractErr(e)) } finally { setBusy(false) }
  }

  return (
    <div className="w-full space-y-2">
      {active && (
        <div className={`rounded-2xl border-2 p-4 space-y-2 ${skin.card}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={`text-xs ${skin.meta}`}>
                Source montrée par <span className="font-semibold">{active.author_pseudo}</span>
              </p>
              <p className={`text-base font-semibold leading-snug break-words ${skin.title}`}>{active.title}</p>
            </div>
            {isModerator && (
              <button
                onClick={handleRemove}
                disabled={busy}
                className={`shrink-0 text-xs px-2.5 py-1 border rounded-lg transition-colors disabled:opacity-50 ${skin.btn}`}
              >
                Retirer
              </button>
            )}
          </div>
          {active.kind === 'image' && (
            <ShareImage path={active.image_path} purged={active.image_purged} alt={active.title} dark={dark} />
          )}
          {active.url && <ShareLink url={active.url} skin={skin} />}
          {active.content && (
            <p className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${skin.body}`}>{active.content}</p>
          )}
          {err && <p className="text-xs text-red-500">{err}</p>}
        </div>
      )}

      {history.length > 0 && (
        <details className={`rounded-xl border px-3 py-2 ${skin.row}`}>
          <summary className={`cursor-pointer text-xs font-medium select-none ${skin.muted}`}>
            Sources déjà montrées ({history.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {history.map(s => (
              <li key={s.id} className={`border-t pt-2 first:border-t-0 first:pt-0 ${skin.row}`}>
                <p className={`text-sm font-medium break-words ${skin.title}`}>{s.title}</p>
                <p className={`text-xs ${skin.meta}`}>{s.author_pseudo}</p>
                {s.kind === 'image' && (
                  <div className="mt-1">
                    <ShareImage path={s.image_path} purged={s.image_purged} alt={s.title} compact dark={dark} />
                  </div>
                )}
                {s.url && <ShareLink url={s.url} skin={skin} />}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
