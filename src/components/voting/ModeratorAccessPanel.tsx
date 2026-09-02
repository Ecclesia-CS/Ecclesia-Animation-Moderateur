import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { claimModeratorStatus } from '../../lib/voting'
import { tableStore, lastNameStore } from '../../lib/storage'
import { extractErr } from '../../lib/utils'
import type { TableResult } from '../../lib/supabase'
import type { Session, SessionMember } from '../../lib/types'

interface Props {
  session: Session
  member: SessionMember
  onMemberUpdated(member: SessionMember): void
  onTableJoined?: (tableId: string, participantId: string, isModerator: boolean) => void
}

type ModalState = null | 'claim' | 'create'

/**
 * Chantier 47 — déclaration modérateur "à l'heure" (pré-vote, vote, allocation),
 * pendant du chemin "en retard" déjà existant (JoinTableForm + reclaim_moderator,
 * proposé par SessionRouterScreen/VoteScreen une fois la séance en phase debating).
 * Même mot de passe que partout ailleurs dans l'app — le Code Ecclesia
 * (`app_config.creation_code_hash`), vérifié côté serveur par `claim_moderator_status`
 * et par `create_table`. Aucun mot de passe stocké ni comparé côté client.
 */
export default function ModeratorAccessPanel({ session, member, onMemberUpdated, onTableJoined }: Props) {
  const [modal, setModal] = useState<ModalState>(null)

  return (
    <>
      {member.is_moderator ? (
        <button
          type="button"
          onClick={() => setModal('create')}
          className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5 hover:bg-indigo-100 transition-colors"
        >
          ➕ Créer une table
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setModal('claim')}
          className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 border border-gray-200 rounded-full px-2 py-0.5 hover:bg-gray-50 transition-colors"
        >
          🎙️ Je suis modérateur
        </button>
      )}

      {modal === 'claim' && (
        <ClaimModeratorModal
          session={session}
          member={member}
          onClose={() => setModal(null)}
          onClaimed={m => { onMemberUpdated(m); setModal(null) }}
        />
      )}

      {modal === 'create' && (
        <CreateTableModal
          session={session}
          member={member}
          onClose={() => setModal(null)}
          onCreated={(tableId, participantId) => {
            if (onTableJoined) onTableJoined(tableId, participantId, true)
          }}
        />
      )}
    </>
  )
}

// ── Étape 1 : se déclarer modérateur pour la séance (session_members.is_moderator) ──

function ClaimModeratorModal({ session, member, onClose, onClaimed }: {
  session: Session
  member: SessionMember
  onClose(): void
  onClaimed(member: SessionMember): void
}) {
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const updated = await claimModeratorStatus(session.id, password, member.pseudo)
      onClaimed(updated)
    } catch (err) {
      setError(extractErr(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-[110] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-indigo-600 px-6 py-5 text-center">
          <p className="text-2xl mb-1">🎙️</p>
          <h2 className="text-lg font-bold text-white">Se déclarer modérateur</h2>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <p className="text-xs text-gray-500">
            Confirme avec le mot de passe Ecclesia que tu es bien modérateur pour cette séance.
            Une fois confirmé, tu pourras créer une nouvelle table à tout moment.
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Code Ecclesia</label>
            <input
              type="password"
              required
              autoFocus
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-3 text-sm border border-gray-300 rounded-xl
                focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                placeholder:text-gray-300 transition-shadow"
            />
          </div>
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 text-gray-600 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-xl transition-colors"
            >
              {loading ? 'Vérification…' : 'Confirmer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Étape 2 : créer une nouvelle table dans la séance, une fois modérateur ──

function CreateTableModal({ session, member, onClose, onCreated }: {
  session: Session
  member: SessionMember
  onClose(): void
  onCreated(tableId: string, participantId: string): void
}) {
  const [pseudo, setPseudo]     = useState(member.pseudo)
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { data, error: err } = await supabase.rpc('create_table', {
        p_pseudo: pseudo.trim(),
        p_creation_code: password,
        p_session_id: session.id,
        p_leaderless: false,
      })
      if (err) throw err
      const r = data as TableResult
      tableStore.set({
        tableId: r.id,
        participantId: r.participant_id,
        joinCode: r.join_code,
        isModerator: true,
        pseudo: pseudo.trim(),
      })
      lastNameStore.set(pseudo.trim())
      onCreated(r.id, r.participant_id)
    } catch (err) {
      setError(extractErr(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-[110] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-indigo-600 px-6 py-5 text-center">
          <p className="text-2xl mb-1">➕</p>
          <h2 className="text-lg font-bold text-white">Créer une table</h2>
          <p className="text-indigo-100 text-xs mt-1">{session.title}</p>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Prénom Nom (modérateur)</label>
            <input
              type="text"
              required
              autoFocus
              value={pseudo}
              onChange={e => setPseudo(e.target.value)}
              placeholder="Prénom Nom"
              className="w-full px-3 py-3 text-sm border border-gray-300 rounded-xl
                focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                placeholder:text-gray-300 transition-shadow"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Code Ecclesia</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-3 text-sm border border-gray-300 rounded-xl
                focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                placeholder:text-gray-300 transition-shadow"
            />
          </div>
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 text-gray-600 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-xl transition-colors"
            >
              {loading ? 'Création…' : 'Créer la table'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
