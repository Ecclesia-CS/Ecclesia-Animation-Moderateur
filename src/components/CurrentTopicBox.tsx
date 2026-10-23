import { useEffect, useState } from 'react'
import { useTable } from '../context/TableContext'
import { setTableCurrentTopic } from '../lib/tableTopics'
import { extractErr } from '../lib/utils'

// Chantier 173b : le sujet en cours est un texte que le modérateur saisit et valide.
// Les participants le voient en haut de leur écran ; un texte vide l'efface.
export default function CurrentTopicBox() {
  const { table, topics, refreshTopics, queueLong, myParticipant, addToQueue } = useTable()
  const courant = topics.find(t => t.statut === 'current')?.texte ?? ''
  const [texte, setTexte] = useState(courant)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Suit une mise à jour venue d'ailleurs (autre onglet, autre modérateur).
  useEffect(() => { setTexte(courant) }, [courant])

  const modifie = texte.trim() !== courant

  // Sujet ajouté par le modérateur : une ligne de la file « autre sujet » à son nom
  // (une seule à la fois, la file n'admet qu'une entrée par personne).
  const [aAjouter, setAAjouter] = useState('')
  const dejaEnFile = queueLong.some(e => e.participant_id === myParticipant.id)

  async function ajouterALaFile() {
    const v = aAjouter.trim()
    if (!v) return
    setBusy(true)
    setErr(null)
    try {
      await addToQueue(myParticipant.id, 'long', undefined, v)
      setAAjouter('')
    } catch (e) {
      setErr(extractErr(e))
    } finally {
      setBusy(false)
    }
  }

  async function valider() {
    setBusy(true)
    setErr(null)
    try {
      await setTableCurrentTopic(table.id, texte.trim())
      await refreshTopics()
    } catch (e) {
      setErr(extractErr(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="rounded-[12px] border border-white/10 bg-slate-800/60 p-4 space-y-2"
      onSubmit={e => { e.preventDefault(); if (modifie) valider() }}
    >
      <label htmlFor="sujet-en-cours" className="block text-sm font-semibold text-slate-100">Sujet en cours</label>
      <div className="flex gap-2">
        <input
          id="sujet-en-cours"
          value={texte}
          onChange={e => setTexte(e.target.value)}
          maxLength={200}
          placeholder="Écrire le sujet dont la table parle…"
          className="min-w-0 flex-1 rounded-[8px] border border-white/15 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-bleu-clair/50"
        />
        <button
          type="submit"
          disabled={busy || !modifie}
          className="rounded-[8px] bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
        >
          Valider
        </button>
      </div>
      <label htmlFor="sujet-file" className="block pt-2 text-sm font-semibold text-slate-100">Ajouter un sujet à la file</label>
      <div className="flex gap-2">
        <input
          id="sujet-file"
          value={aAjouter}
          onChange={e => setAAjouter(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (!dejaEnFile) ajouterALaFile() } }}
          maxLength={60}
          disabled={dejaEnFile}
          placeholder={dejaEnFile ? 'Votre sujet est déjà dans la file' : 'Un sujet à aborder ensuite…'}
          className="min-w-0 flex-1 rounded-[8px] border border-white/15 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-bleu-clair/50"
        />
        <button
          type="button"
          onClick={ajouterALaFile}
          disabled={busy || dejaEnFile || !aAjouter.trim()}
          className="rounded-[8px] bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
        >
          Ajouter
        </button>
      </div>
      {err && <p className="text-xs text-red-200">{err}</p>}
    </form>
  )
}
