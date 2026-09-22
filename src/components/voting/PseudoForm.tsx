import { useState } from 'react'
import {
  registerSessionMember,
  reclaimPrevotingMember,
  tryClaimModeratorStatus,
  PSEUDO_TAKEN_MESSAGE,
  PSEUDO_PUBLIC_NOTICE,
} from '../../lib/voting'
import { lastNameStore } from '../../lib/storage'
import ModeratorDeclareField from './ModeratorDeclareField'
import type { Session, SessionMember } from '../../lib/types'

interface PseudoFormProps {
  session: Session
  onSuccess: (member: SessionMember) => void
  /**
   * Chantier B3 — reconquête réussie d'un profil déjà inscrit sous ce pseudo.
   * Distinct de `onSuccess` : saute l'écran d'affichage du code de rappel (le
   * code montré une fois à l'inscription reste le bon) et va directement au
   * vote.
   */
  onReclaimSuccess: (member: SessionMember) => void
}

export default function PseudoForm({ session, onSuccess, onReclaimSuccess }: PseudoFormProps) {
  const [pseudo, setPseudo] = useState(() => lastNameStore.get())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Chantier 73 — déclaration modérateur dès l'inscription : l'inscription se
  // fait d'abord, la déclaration ensuite, dans la foulée (voir tryClaimModeratorStatus).
  const [asModerator, setAsModerator] = useState(false)
  const [moderatorPassword, setModeratorPassword] = useState('')
  const [pendingMember, setPendingMember] = useState<SessionMember | null>(null)
  const [pendingIsReclaim, setPendingIsReclaim] = useState(false)
  const [moderatorError, setModeratorError] = useState<string | null>(null)

  // Chantier B3 — pseudo déjà inscrit en pré-vote : proposer une reconquête
  // plutôt que bloquer avec une simple erreur.
  const [showReclaim, setShowReclaim] = useState(false)
  const [reclaimCodeInput, setReclaimCodeInput] = useState('')
  const [reclaimError, setReclaimError] = useState<string | null>(null)
  const [reclaimLoading, setReclaimLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = pseudo.trim()
    if (!trimmed) return
    setError(null)
    setLoading(true)
    try {
      const member = await registerSessionMember(session.id, trimmed)
      lastNameStore.set(trimmed)
      if (asModerator && moderatorPassword.trim()) {
        const { member: updated, error: modErr } = await tryClaimModeratorStatus(session.id, moderatorPassword.trim(), member.pseudo)
        if (updated) {
          onSuccess(updated)
        } else {
          setModeratorError(modErr)
          setPendingMember(member)
        }
      } else {
        onSuccess(member)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inattendue'
      if (session.phase === 'pre_voting' && msg.includes('Pseudo déjà pris')) {
        setReclaimError(null)
        setShowReclaim(true)
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleReclaim(e: React.FormEvent) {
    e.preventDefault()
    // Chantier 93 — pseudo ET code, toujours les deux : le pseudo seul est le
    // nom réel, connu de toute la séance, il ne prouve rien.
    const trimmedPseudo = pseudo.trim()
    const code = reclaimCodeInput.trim()
    if (!trimmedPseudo || !code) return
    setReclaimError(null)
    setReclaimLoading(true)
    try {
      let member = await reclaimPrevotingMember(session.id, trimmedPseudo, code)
      lastNameStore.set(trimmedPseudo)
      // Chantier 108 (C1) — la déclaration modérateur cochée juste au-dessus
      // du formulaire de reconquête ne doit pas être perdue silencieusement :
      // rejouer tryClaimModeratorStatus après un reclaim réussi, comme le
      // fait déjà VotingEntryForm.
      if (asModerator && moderatorPassword.trim()) {
        const { member: updated, error: modErr } = await tryClaimModeratorStatus(session.id, moderatorPassword.trim(), member.pseudo)
        if (updated) {
          member = updated
        } else {
          setModeratorError(modErr)
          setPendingIsReclaim(true)
          setPendingMember(member)
          return
        }
      }
      onReclaimSuccess(member)
    } catch (err: unknown) {
      setReclaimError(err instanceof Error ? err.message : 'Erreur inattendue')
    } finally {
      setReclaimLoading(false)
    }
  }

  if (pendingMember) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-5">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100">
            <span className="text-3xl">⚠️</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Bienvenue {pendingMember.pseudo} !</h1>
            <p className="mt-2 text-sm text-gray-500">
              {pendingIsReclaim ? 'Tes votes ont bien été récupérés' : 'Ton inscription est bien enregistrée'}, mais la déclaration modérateur a échoué : {moderatorError}
            </p>
          </div>
          <button
            onClick={() => (pendingIsReclaim ? onReclaimSuccess(pendingMember) : onSuccess(pendingMember))}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Continuer →
          </button>
        </div>
      </div>
    )
  }

  if (showReclaim) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-100 mb-4">
              <span className="text-2xl">🔑</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Ce nom est déjà utilisé</h1>
            <p className="mt-2 text-sm text-gray-500">{PSEUDO_TAKEN_MESSAGE}</p>
          </div>

          <form onSubmit={handleReclaim} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prénom Nom
              </label>
              <input
                type="text"
                value={pseudo}
                onChange={e => setPseudo(e.target.value)}
                maxLength={40}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Code de rappel (4 chiffres)
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={reclaimCodeInput}
                onChange={e => setReclaimCodeInput(e.target.value.replace(/\D/g, ''))}
                placeholder="_ _ _ _"
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm font-mono text-center tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-400 mt-1.5">
                Le code à 4 chiffres affiché lors de ta première inscription à cette séance.
                Perdu ? L'organisateur peut t'en redonner un.
              </p>
            </div>

            {reclaimError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                {reclaimError}
              </div>
            )}

            <button
              type="submit"
              disabled={reclaimLoading || !pseudo.trim() || reclaimCodeInput.trim().length === 0}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-xl transition-colors"
            >
              {reclaimLoading ? 'Récupération…' : 'Récupérer mes votes →'}
            </button>
            <button
              type="button"
              onClick={() => { setShowReclaim(false); setReclaimError(null) }}
              className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Ce n'est pas moi — choisir un autre nom
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-100 mb-4">
            <span className="text-2xl">🗣️</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">{session.title}</h1>
          {session.description && (
            <p className="mt-1 text-sm text-gray-500">{session.description}</p>
          )}
        </div>

        {/* Contexte vote présentiel */}
        {session.phase === 'voting' && (
          <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-sm text-indigo-800 text-left">
            <strong>Vote présentiel ouvert.</strong>{' '}
            Tu as voté à distance avant le débat ? <strong>Entre le même nom et prénom</strong> pour retrouver tes votes et confirmer ta présence.
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Indique ton nom et prénom pour cette séance
            </label>
            <input
              type="text"
              value={pseudo}
              onChange={e => setPseudo(e.target.value)}
              placeholder="Prénom Nom"
              maxLength={40}
              required
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1.5">
              {PSEUDO_PUBLIC_NOTICE} Tu pourras le changer plus tard.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          <ModeratorDeclareField
            checked={asModerator}
            onCheckedChange={setAsModerator}
            password={moderatorPassword}
            onPasswordChange={setModeratorPassword}
          />

          <button
            type="submit"
            disabled={loading || !pseudo.trim()}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            {loading ? 'Connexion…' : 'Continuer →'}
          </button>

          {/* Chantier 125 — accès direct à la reconquête (pseudo + code),
              sans attendre l'échec « pseudo déjà pris ». */}
          <button
            type="button"
            onClick={() => { setReclaimError(null); setShowReclaim(true) }}
            className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            J'ai déjà un code de rappel →
          </button>
        </form>
      </div>
    </div>
  )
}
