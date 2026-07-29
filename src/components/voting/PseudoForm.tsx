import { useState } from 'react'
import { registerSessionMember, reclaimPrevotingMember } from '../../lib/voting'
import { lastNameStore } from '../../lib/storage'
import type { Session, SessionMember } from '../../lib/types'

interface PseudoFormProps {
  session: Session
  onSuccess: (member: SessionMember) => void
  /**
   * Chantier B3 — reconquête réussie d'un profil pré-vote déjà inscrit sous
   * ce pseudo. Distinct de `onSuccess` : saute l'écran d'affichage du code
   * de rappel (le code montré une fois à l'inscription reste le bon, celui
   * généré côté client pour CETTE tentative ne sert à rien ici) et va
   * directement au vote.
   */
  onReclaimSuccess: (member: SessionMember) => void
  /** Code de rappel pré-généré (phase pre_voting). Passé à registerSessionMember. */
  reclaimCode?: string
}

export default function PseudoForm({ session, onSuccess, onReclaimSuccess, reclaimCode }: PseudoFormProps) {
  const [pseudo, setPseudo] = useState(() => lastNameStore.get())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Chantier B3 — pseudo déjà inscrit en pré-vote : proposer une reconquête
  // plutôt que bloquer avec une simple erreur.
  const [showReclaim, setShowReclaim] = useState(false)
  const [reclaimTab, setReclaimTab] = useState<'pseudo' | 'code'>('pseudo')
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
      const member = await registerSessionMember(session.id, trimmed, reclaimCode)
      lastNameStore.set(trimmed)
      onSuccess(member)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inattendue'
      if (session.phase === 'pre_voting' && msg.includes('Pseudo déjà pris')) {
        setReclaimTab('pseudo')
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
    const trimmedPseudo = pseudo.trim()
    const val = reclaimTab === 'pseudo' ? trimmedPseudo : reclaimCodeInput.trim()
    if (!val) return
    setReclaimError(null)
    setReclaimLoading(true)
    try {
      const member = reclaimTab === 'code'
        ? await reclaimPrevotingMember(session.id, undefined, val)
        : await reclaimPrevotingMember(session.id, val)
      lastNameStore.set(trimmedPseudo)
      onReclaimSuccess(member)
    } catch (err: unknown) {
      setReclaimError(err instanceof Error ? err.message : 'Erreur inattendue')
    } finally {
      setReclaimLoading(false)
    }
  }

  if (showReclaim) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-100 mb-4">
              <span className="text-2xl">🔑</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Ce pseudo est déjà inscrit</h1>
            <p className="mt-2 text-sm text-gray-500">
              Quelqu'un est déjà inscrit sous <strong>{pseudo.trim()}</strong> pour cette séance.
              Si c'est toi (nouvel appareil ou navigateur), confirme-le ou utilise ton code de rappel pour retrouver tes votes.
            </p>
          </div>

          <form onSubmit={handleReclaim} className="space-y-4">
            <div className="flex rounded-xl border border-gray-200 overflow-hidden">
              {(['pseudo', 'code'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setReclaimTab(t); setReclaimError(null) }}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                    reclaimTab === t ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {t === 'pseudo' ? "C'est bien moi" : 'Mon code de rappel'}
                </button>
              ))}
            </div>

            {reclaimTab === 'code' && (
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
                </p>
              </div>
            )}

            {reclaimError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                {reclaimError}
              </div>
            )}

            <button
              type="submit"
              disabled={reclaimLoading || (reclaimTab === 'code' && reclaimCodeInput.trim().length === 0)}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-xl transition-colors"
            >
              {reclaimLoading ? 'Récupération…' : 'Récupérer mes votes →'}
            </button>
            <button
              type="button"
              onClick={() => { setShowReclaim(false); setReclaimError(null) }}
              className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Ce n'est pas moi — choisir un autre pseudo
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
              Retiens bien ce que tu inscris ici : ça te permettra d'être reconnu·e et de retrouver tes votes.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !pseudo.trim()}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            {loading ? 'Connexion…' : 'Continuer →'}
          </button>
        </form>
      </div>
    </div>
  )
}
