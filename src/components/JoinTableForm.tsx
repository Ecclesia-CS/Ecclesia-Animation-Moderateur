import { useRef, useState } from 'react'
import {
  assignLeastFilledTable, claimTableAsModerator, confirmAttendance, joinTable,
  PseudoTakenError, PSEUDO_TAKEN_MESSAGE,
} from '../lib/voting'
import ReclaimCodeAccordion from './ReclaimCodeAccordion'
import { tableStore, lastNameStore } from '../lib/storage'
import { extractErr } from '../lib/utils'
import type { TableResult } from '../lib/supabase'
import ReclaimCodeDisplay from './voting/ReclaimCodeDisplay'
import PasswordInput from './PasswordInput'

interface Props {
  /** Code pré-rempli (ex: venu d'un lien #table/<code>). Si fourni, le champ est verrouillé. */
  initialJoinCode?: string
  /**
   * Chantier 68 — séance en cours, si connue (ex : `SessionRouterScreen`,
   * état `debating_no_member`). Transmise à `claim_table_as_moderator` pour
   * refuser un code de table appartenant à une autre séance. Omise par les
   * appelants qui n'ont aucune séance en contexte (ex : `JoinTableScreen`,
   * lien `#table/<code>` d'un ami).
   */
  sessionId?: string
  onJoined(tableId: string, participantId: string, isModerator: boolean): void
  submitLabel?: string
  /**
   * Chantier 143 — propose, au-dessus du code de table, « Assignez-moi une
   * table » (chantier 111 : placement sur la table animée la moins remplie).
   * Ce bouton partage le champ « Prénom Nom » et la ligne « code de rappel » du
   * formulaire : avant, `SessionRouterScreen` les dupliquait au-dessus, et le
   * retardataire tapait son nom deux fois. Exige `sessionId`.
   */
  offerAutoAssign?: boolean
}

/** Formulaire de rattrapage : rejoindre une table de débat directement par son code,
 *  indépendamment de la séance de vote (D14 — rejoindre en retard, D8 — via un code distribué). */
export default function JoinTableForm({ initialJoinCode = '', sessionId, onJoined, submitLabel = 'Rejoindre', offerAutoAssign = false }: Props) {
  const canAutoAssign = offerAutoAssign && !!sessionId && !initialJoinCode
  const locked = !!initialJoinCode
  const [joinCode, setJoinCode] = useState(initialJoinCode)
  const [pseudo, setPseudo] = useState(() => lastNameStore.get())
  const [asModerator, setAsModerator] = useState(false)
  const [moderatorCode, setModeratorCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Chantier 140 — ligne « J'ai déjà un code de rappel », toujours présente.
  const [reclaimOpen, setReclaimOpen] = useState(false)
  const [reclaimCode, setReclaimCode] = useState('')
  const reclaimInputRef = useRef<HTMLInputElement>(null)
  // Chantier 119 — présent uniquement si cet appel a créé la ligne
  // session_members (première inscription) : on montre le code avant de
  // continuer, comme VoteScreen le fait déjà pour l'inscription via le vote.
  const [pendingReclaim, setPendingReclaim] = useState<{ r: TableResult; pseudo: string; isModerator: boolean } | null>(null)

  function finishJoin(r: TableResult, name: string, isModerator: boolean) {
    tableStore.set({
      tableId:       r.id,
      participantId: r.participant_id,
      joinCode:      r.join_code,
      isModerator,
      pseudo:        name,
    })
    lastNameStore.set(name)
    onJoined(r.id, r.participant_id, isModerator)
  }

  function openReclaim() {
    setReclaimOpen(true)
    requestAnimationFrame(() => reclaimInputRef.current?.focus())
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const code = joinCode.trim().toUpperCase()
      const name = pseudo.trim()
      const reclaim = reclaimOpen ? reclaimCode.trim() : ''
      // Chantier 68 — "Je suis modérateur de cette table" ne reprend plus
      // la main sans condition (reclaim_moderator) : on passe par
      // claim_table_as_moderator, qui refuse une table déjà modérée par
      // quelqu'un d'autre.
      const attempt = () => asModerator
        ? claimTableAsModerator(code, moderatorCode, name, sessionId)
        : joinTable(code, name)

      // Chantier 140 — code saisi et séance connue : prouver l'identité
      // d'abord, pour ne jamais créer d'inscription sous un nom mal tapé.
      if (reclaim && sessionId) await confirmAttendance(sessionId, name, reclaim)

      let r: TableResult
      try {
        r = await attempt()
      } catch (err) {
        // Chantier 140 — nom déjà pris par un autre membre : le serveur n'a
        // rien écrit. Sans code, on ouvre l'accordéon ; avec un code (porte
        // sans séance en contexte, lien #table/), on le vérifie sur la
        // séance de la table puis on réessaie.
        if (!(err instanceof PseudoTakenError)) throw err
        if (!reclaim) { setError(PSEUDO_TAKEN_MESSAGE); openReclaim(); return }
        await confirmAttendance(err.sessionId, name, reclaim)
        r = await attempt()
      }
      const effective = r.pseudo ?? name
      if (r.new_reclaim_code) {
        setPendingReclaim({ r, pseudo: effective, isModerator: asModerator })
      } else {
        finishJoin(r, effective, asModerator)
      }
    } catch (err) {
      setError(extractErr(err))
    } finally {
      setLoading(false)
    }
  }

  // Chantier 143 — « Assignez-moi une table », sur le même nom et le même code
  // de rappel que le bouton principal (reconnexion d'abord, puis placement).
  async function handleAutoAssign() {
    const name = pseudo.trim()
    if (!sessionId) return
    if (!name) { setError('Indique ton prénom et ton nom.'); return }
    const reclaim = reclaimOpen ? reclaimCode.trim() : ''
    if (reclaimOpen && !reclaim) { setError('Entre ton code de rappel, ou referme cette ligne.'); return }
    setError(null)
    setLoading(true)
    try {
      if (reclaim) await confirmAttendance(sessionId, name, reclaim)
      const r = await assignLeastFilledTable(sessionId, name)
      if (r.new_reclaim_code) setPendingReclaim({ r, pseudo: name, isModerator: false })
      else finishJoin(r, name, false)
    } catch (err) {
      const msg = extractErr(err)
      if (!reclaim && msg.includes('déjà utilisé')) { setError(PSEUDO_TAKEN_MESSAGE); openReclaim() }
      else setError(msg)
    } finally {
      setLoading(false)
    }
  }

  if (pendingReclaim && pendingReclaim.r.new_reclaim_code) {
    return (
      <ReclaimCodeDisplay
        pseudo={pendingReclaim.pseudo}
        code={pendingReclaim.r.new_reclaim_code}
        continueLabel="Rejoindre la table →"
        onContinue={() => finishJoin(pendingReclaim.r, pendingReclaim.pseudo, pendingReclaim.isModerator)}
      />
    )
  }

  const codeField = locked ? (
    <div className="text-center">
      <p className="text-xs text-gray-400">Code de table</p>
      <p className="font-mono text-xl font-bold tracking-widest text-indigo-600">{joinCode}</p>
    </div>
  ) : (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1.5">Code de table</label>
      <input
        type="text"
        required
        value={joinCode}
        onChange={e => setJoinCode(e.target.value.toUpperCase())}
        placeholder="A1B2C3"
        className="w-full px-3 py-3 text-sm border border-gray-300 rounded-xl
          focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
          placeholder:text-gray-300 transition-shadow"
      />
    </div>
  )

  const errorBox = error && (
    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
      {error}
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Avec l'assignation automatique, le nom passe avant le code : il sert
          aux deux actions. Sans elle, ordre historique (code puis nom). */}
      {!canAutoAssign && codeField}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">Prénom Nom</label>
        <input
          type="text"
          required
          value={pseudo}
          onChange={e => { setPseudo(e.target.value); setError(null) }}
          placeholder="Prénom Nom"
          className="w-full px-3 py-3 text-sm border border-gray-300 rounded-xl
            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
            placeholder:text-gray-300 transition-shadow"
        />
      </div>
      <ReclaimCodeAccordion
        ref={reclaimInputRef}
        open={reclaimOpen}
        onToggle={() => { setReclaimOpen(o => !o); setError(null) }}
        code={reclaimCode}
        onCodeChange={c => { setReclaimCode(c); setError(null) }}
      />
      {canAutoAssign && (
        <>
          {errorBox}
          <button
            type="button"
            onClick={handleAutoAssign}
            disabled={loading}
            className="w-full py-3 px-4 bg-white border border-indigo-300 hover:bg-indigo-50
              disabled:opacity-60 text-indigo-700 text-sm font-semibold rounded-xl transition-colors"
          >
            {loading ? 'Placement…' : 'Assignez-moi une table'}
          </button>
          <p className="text-xs text-gray-400 text-center">— ou, si tu as un code de table —</p>
          {codeField}
        </>
      )}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={asModerator}
          onChange={e => { setAsModerator(e.target.checked); setError(null) }}
          className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
        />
        <span className="text-sm font-medium text-gray-700">Je suis modérateur de cette table</span>
      </label>
      {asModerator && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Code Ecclesia</label>
          <PasswordInput
            value={moderatorCode}
            onChange={setModeratorCode}
            placeholder="••••••••"
          />
        </div>
      )}
      {!canAutoAssign && errorBox}
      <button
        type="submit"
        disabled={loading || (reclaimOpen && !reclaimCode.trim())}
        className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400
          text-white text-sm font-medium rounded-xl transition-colors focus:outline-none
          focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
        {loading ? 'Chargement…' : submitLabel}
      </button>
    </form>
  )
}
