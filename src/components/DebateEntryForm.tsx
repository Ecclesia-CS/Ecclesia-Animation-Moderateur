import { useRef, useState } from 'react'
import { confirmAttendance, joinSimpleDebate, PSEUDO_TAKEN_MESSAGE } from '../lib/voting'
import { tableStore, lastNameStore } from '../lib/storage'
import { extractErr } from '../lib/utils'
import ReclaimCodeDisplay from './voting/ReclaimCodeDisplay'
import PasswordInput from './PasswordInput'
import { useSessionOrganizationName, orgCodeError } from '../lib/organizations'
import PageParcours from './PageParcours'
import type { Session } from '../lib/types'

type JoinResult = Awaited<ReturnType<typeof joinSimpleDebate>>

interface Props {
  sessionId: string
  /** Séance du débat, pour l'en-tête de la page. */
  session: Pick<Session, 'title' | 'phase' | 'organization_id' | 'session_type'>
  onJoined(tableId: string, participantId: string, isModerator: boolean): void
}

/**
 * Chantier 134 — entrée dans un débat simple (`session_type = 'debate'`,
 * phase `debating`). Pas de vote, pas de code de table à taper : nom +
 * prénom suffit, `join_simple_debate` inscrit et place à table.
 *
 * Trois chemins, tous par la même RPC :
 *   - participant : table la moins remplie ;
 *   - « Je suis le modérateur » + Code Ecclesia : prend l'animation d'une
 *     table sans modérateur (sinon refus explicite, la reprise d'une table
 *     déjà tenue passe par Outils une fois assis — chantier 110) ;
 *   - « J'ai déjà un code de rappel » : reconnexion depuis un autre appareil
 *     (`confirm_attendance`, pseudo + code), puis retour à sa table.
 */
export default function DebateEntryForm({ sessionId, session, onJoined }: Props) {
  // Chantier 135 — débat d'une association : son mot de passe tient lieu de
  // Code Ecclesia pour prendre l'animation (check_moderator_code).
  const orgName = useSessionOrganizationName(sessionId)
  const [pseudo, setPseudo]             = useState(() => lastNameStore.get())
  const [asModerator, setAsModerator]   = useState(false)
  const [creationCode, setCreationCode] = useState('')
  const [reclaimOpen, setReclaimOpen]   = useState(false)
  const [reclaimCode, setReclaimCode]   = useState('')
  const reclaimInputRef                 = useRef<HTMLInputElement>(null)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [pending, setPending]           = useState<JoinResult | null>(null)

  function finish(r: JoinResult) {
    tableStore.set({
      tableId:       r.id,
      participantId: r.participant_id,
      joinCode:      r.join_code,
      isModerator:   r.is_moderator,
      pseudo:        r.pseudo,
    })
    lastNameStore.set(r.pseudo)
    onJoined(r.id, r.participant_id, r.is_moderator)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const name = pseudo.trim()
    if (!name) return
    setError(null)
    setLoading(true)
    try {
      if (reclaimOpen) {
        await confirmAttendance(sessionId, name, reclaimCode.trim())
      }
      const r = await joinSimpleDebate(sessionId, name, asModerator ? creationCode : undefined)
      if (r.new_reclaim_code) setPending(r)
      else finish(r)
    } catch (err) {
      const msg = extractErr(err)
      // Chantier 140 — nom déjà pris : ouvrir l'accordéon du code plutôt que
      // laisser l'utilisateur dans une impasse.
      if (!reclaimOpen && msg.includes('déjà utilisé')) {
        setError(PSEUDO_TAKEN_MESSAGE)
        setReclaimOpen(true)
        requestAnimationFrame(() => reclaimInputRef.current?.focus())
        return
      }
      setError(orgCodeError(msg, orgName))
    } finally {
      setLoading(false)
    }
  }

  if (pending && pending.new_reclaim_code) {
    return (
      <ReclaimCodeDisplay
        pseudo={pending.pseudo}
        code={pending.new_reclaim_code}
        continueLabel="Rejoindre le débat"
        onContinue={() => finish(pending)}
      />
    )
  }

  const inputCls = `rounded-[8px] w-full px-3 py-3 text-sm border border-bleu-fonce/20
    focus:outline-none focus:ring-2 focus:ring-bleu-clair/40 focus:border-bleu-fonce
    placeholder:text-anthracite/40 transition-shadow`

  return (
    <PageParcours session={session} sousTitre={orgName ? <>Organisé par {orgName}</> : undefined}>
      <div className="w-full rounded-[12px] border border-bleu-fonce/10 bg-white shadow-sm p-6 animate-montee">
        <div className="text-center mb-5">
          <div className="text-5xl mb-4" aria-hidden="true">🗣️</div>
          <h2 className="font-sans text-2xl font-bold tracking-[-0.01em] text-bleu-fonce">Rejoindre le débat</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-anthracite/80 mb-1.5">Prénom Nom</label>
            <input
              type="text"
              required
              value={pseudo}
              onChange={e => { setPseudo(e.target.value); setError(null) }}
              placeholder="Prénom Nom"
              className={inputCls}
            />
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={asModerator}
              onChange={e => { setAsModerator(e.target.checked); setError(null) }}
              className="w-4 h-4 border-bleu-fonce/20 text-indigo-600 focus:border-bleu-fonce focus:ring-bleu-clair/40"
            />
            Je suis le modérateur
          </label>
          {asModerator && (
            <PasswordInput
              value={creationCode}
              onChange={v => { setCreationCode(v); setError(null) }}
              placeholder={orgName ? "Mot de passe de l'association" : 'Code Ecclesia'}
            />
          )}

          <div className="rounded-[8px] border border-bleu-fonce/10">
            <button
              type="button"
              onClick={() => { setReclaimOpen(o => !o); setError(null) }}
              aria-expanded={reclaimOpen}
              className="rounded-[8px] w-full px-3 py-2.5 text-left text-xs font-semibold text-gray-600 hover:text-bleu-fonce flex items-center justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
            >
              J'ai déjà un code de rappel
              <span aria-hidden="true" className={`text-base leading-none text-bleu-fonce/60 transition-transform ${reclaimOpen ? 'rotate-45' : ''}`}>+</span>
            </button>
            {reclaimOpen && (
              <div className="px-3 pb-3">
                <input
                  ref={reclaimInputRef}
                  type="text"
                  inputMode="numeric"
                  required
                  value={reclaimCode}
                  onChange={e => { setReclaimCode(e.target.value); setError(null) }}
                  placeholder="Code à 4 chiffres"
                  className={inputCls}
                />
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-600 text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || !pseudo.trim() || (asModerator && !creationCode) || (reclaimOpen && !reclaimCode.trim())}
            className="rounded-[8px] w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40
              text-white text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2"
          >
            {loading ? 'Connexion…' : 'Rejoindre le débat'}
          </button>
        </form>
      </div>
    </PageParcours>
  )
}
