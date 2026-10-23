import { useState } from 'react'
import { useTable } from '../context/TableContext'
import { extractErr } from '../lib/utils'
import {
  addTableTopic, deleteTableTopic, reorderTableTopics, setTableTopicStatus,
  type TopicStatus,
} from '../lib/tableTopics'
import ModeratorVoteModal from './ModeratorVoteModal'

// Chantier 173 — « Sujets à venir » (vue modérateur). Le sujet en cours est marqué
// à la main, jamais automatiquement ; les propositions des participants (file « autre
// sujet ») arrivent ici toutes seules, sans doublon.
export default function TopicsPanel() {
  const { table, topics, refreshTopics } = useTable()
  const [texte, setTexte] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [voteOpen, setVoteOpen] = useState(false)

  const current = topics.find(t => t.statut === 'current')
  const pending = topics.filter(t => t.statut === 'pending')
  const done = topics.filter(t => t.statut === 'done')

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setErr(null)
    try {
      await fn()
      await refreshTopics()
    } catch (e) {
      setErr(extractErr(e))
    } finally {
      setBusy(false)
    }
  }

  const setStatus = (id: string, s: TopicStatus) => run(() => setTableTopicStatus(id, s))

  function move(index: number, delta: number) {
    const ids = pending.map(t => t.id)
    const j = index + delta
    if (j < 0 || j >= ids.length) return
    ;[ids[index], ids[j]] = [ids[j], ids[index]]
    return run(() => reorderTableTopics(table.id, ids))
  }

  const btn = 'rounded-[6px] px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair'

  return (
    <section className="rounded-[12px] border border-white/10 bg-slate-800/60 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-100">Sujets à venir</h3>

      {err && <p className="rounded-[8px] bg-red-500/10 px-3 py-2 text-xs text-red-200">{err}</p>}

      {current && (
        <div className="flex items-center justify-between gap-2 rounded-[8px] bg-emerald-500/15 px-3 py-2">
          <p className="text-sm text-emerald-100"><span className="font-semibold">En cours : </span>{current.texte}</p>
          <div className="flex shrink-0 gap-1">
            <button disabled={busy} onClick={() => setStatus(current.id, 'done')}
              className={`${btn} bg-emerald-600 text-white hover:bg-emerald-500`}>Traité</button>
            <button disabled={busy} onClick={() => setStatus(current.id, 'pending')}
              className={`${btn} bg-white/10 text-slate-200 hover:bg-white/20`}>Retirer</button>
          </div>
        </div>
      )}

      {pending.length === 0 && !current && (
        <p className="text-xs text-slate-300">Aucun sujet pour l'instant. Les sujets proposés par les participants apparaissent ici.</p>
      )}

      <ul className="space-y-1.5">
        {pending.map((t, i) => (
          <li key={t.id} className="flex items-center justify-between gap-2 rounded-[8px] bg-white/[0.06] px-3 py-2">
            <p className="min-w-0 break-words text-sm text-slate-100">
              {t.texte}
              {t.source === 'queue' && <span className="ml-2 text-[11px] text-slate-300">proposé par un participant</span>}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <button disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Monter"
                className={`${btn} bg-white/10 text-slate-200 hover:bg-white/20`}>Monter</button>
              <button disabled={busy || i === pending.length - 1} onClick={() => move(i, 1)} aria-label="Descendre"
                className={`${btn} bg-white/10 text-slate-200 hover:bg-white/20`}>Descendre</button>
              <button disabled={busy} onClick={() => setStatus(t.id, 'current')}
                className={`${btn} bg-indigo-600 text-white hover:bg-indigo-500`}>Marquer en cours</button>
              <button disabled={busy} onClick={() => run(() => deleteTableTopic(t.id))} aria-label="Supprimer ce sujet"
                className={`${btn} bg-white/10 text-red-200 hover:bg-red-500/20`}>Supprimer</button>
            </div>
          </li>
        ))}
      </ul>

      <form
        className="flex gap-2"
        onSubmit={e => {
          e.preventDefault()
          const v = texte.trim()
          if (!v) return
          run(async () => { await addTableTopic(table.id, v); setTexte('') })
        }}
      >
        <input
          value={texte}
          onChange={e => setTexte(e.target.value)}
          maxLength={200}
          placeholder="Ajouter un sujet…"
          className="min-w-0 flex-1 rounded-[8px] border border-white/15 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-bleu-clair/50"
        />
        <button type="submit" disabled={busy || !texte.trim()}
          className="rounded-[8px] bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair">
          Ajouter
        </button>
      </form>

      {pending.length >= 2 && (
        <button onClick={() => setVoteOpen(true)}
          className="w-full rounded-[8px] border border-white/15 bg-white/[0.06] px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair">
          Proposer un vote entre les sujets
        </button>
      )}

      {done.length > 0 && (
        <p className="text-xs text-slate-300">Traités : {done.map(d => d.texte).join(' · ')}</p>
      )}

      {voteOpen && (
        <ModeratorVoteModal
          onClose={() => setVoteOpen(false)}
          initialQuestion="Quel sujet voulez-vous aborder ensuite ?"
          initialOptions={pending.map(t => t.texte)}
        />
      )}
    </section>
  )
}
