import { useState } from 'react'
import { useTable } from '../context/TableContext'
import { extractErr, isSafeUrl } from '../lib/utils'
import { hostOf } from '../lib/tableShare'
import type { TableShare } from '../lib/types'
import ShareImage from './ShareImage'
import FondQuadrille from './FondQuadrille'

// Chantier 162a — ce que la table voit du fil de partage : la source acceptée en
// dernier en grande carte, puis le fil des sources déjà montrées pendant ce débat.
// Les demandes en attente (modérateur) et « mes demandes » (participant) ont leurs
// propres blocs plus bas. Aucune saisie libre dans cette zone : un lien et un
// titre court, c'est ce qui l'empêche de devenir un chat.
// Chantier 168 — la source montrée est sur l'aplat marine quadrillé du site, sur
// fond clair comme sur la nuit de l'écran modérateur.

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
  card:  'bg-white border-bleu-fonce/10',
  title: 'text-gray-900',
  meta:  'text-gray-600',
  link:  'text-bleu-fonce underline decoration-bleu-fonce/30 underline-offset-2 hover:decoration-bleu-clair',
  body:  'text-gray-700',
  muted: 'text-gray-600',
  btn:   'border-bleu-fonce/20 text-bleu-fonce hover:bg-bleu-fonce/[0.04]',
  row:   'border-bleu-fonce/10',
}

const DARK: Skin = {
  card:  'bg-white/5 border-white/10',
  title: 'text-creme',
  meta:  'text-slate-300',
  link:  'text-bleu-clair underline decoration-bleu-clair/40 underline-offset-2 hover:decoration-bleu-clair',
  body:  'text-slate-300',
  muted: 'text-slate-300',
  btn:   'border-white/20 text-creme hover:bg-white/10',
  row:   'border-white/10',
}

export function skinFor(dark: boolean): Skin {
  return dark ? DARK : LIGHT
}

/** Lien cliquable (http/https seulement) ; un schéma non autorisé n'est jamais rendu en <a>. */
export function ShareLink({ url, skin }: { url: string; skin: Skin }) {
  if (!isSafeUrl(url)) {
    return <p className="text-xs text-red-600 truncate" title={url}>Lien non affiché</p>
  }
  const host = hostOf(url)
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 text-sm font-semibold break-all focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair ${skin.link}`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
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
  // La source montrée est toujours marine : même rendu sur fond clair et sur la nuit.
  const marine = DARK

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
    <div className="w-full space-y-2.5">
      {active && (
        <div className="relative overflow-hidden rounded-[12px] bg-bleu-fonce text-creme ring-1 ring-white/10 shadow-[0_26px_54px_-26px_rgba(21,35,63,0.75)] animate-montee">
          <FondQuadrille cases={3} />
          <div className="relative space-y-2.5 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-bleu-clair">Source montrée à la table</p>
                <p className={`mt-1 text-xs ${marine.meta}`}>
                  par <span className="font-semibold text-creme">{active.author_pseudo}</span>
                </p>
                <p className="mt-1 text-lg font-bold leading-snug tracking-[-0.01em] break-words text-creme">{active.title}</p>
              </div>
              {isModerator && (
                <button
                  onClick={handleRemove}
                  disabled={busy}
                  className="btn-verre rounded-[8px] inline-flex h-8 shrink-0 items-center px-3 text-xs font-semibold text-creme disabled:opacity-50
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2 focus-visible:ring-offset-bleu-fonce"
                >
                  Retirer
                </button>
              )}
            </div>
            {active.kind === 'image' && (
              <ShareImage path={active.image_path} purged={active.image_purged} alt={active.title} dark />
            )}
            {active.url && <ShareLink url={active.url} skin={marine} />}
            {active.content && (
              <p className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${marine.body}`}>{active.content}</p>
            )}
            {err && <p className="text-xs text-red-300">{err}</p>}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <details className={`rounded-[12px] border px-4 py-2.5 shadow-sm ${skin.card}`}>
          <summary className={`cursor-pointer text-xs font-semibold select-none rounded-[6px] focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair ${skin.muted}`}>
            Sources déjà montrées ({history.length})
          </summary>
          <ul className="mt-2.5 space-y-2.5">
            {history.map(s => (
              <li key={s.id} className={`border-t pt-2.5 first:border-t-0 first:pt-0 ${skin.row}`}>
                <p className={`text-sm font-semibold break-words ${skin.title}`}>{s.title}</p>
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
