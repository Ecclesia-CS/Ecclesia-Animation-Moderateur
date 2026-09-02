import { useState } from 'react'
import type { TableAssignment } from '../../lib/types'
import type { Session } from '../../lib/types'

export interface AssignmentWithTable extends TableAssignment {
  tables: { join_code: string } | null
}

interface TableAssignmentCardProps {
  assignment: AssignmentWithTable | null
  loading: boolean
  phase: Session['phase']
  onJoin?: () => Promise<void>
  joinLoading?: boolean
  joinError?: string | null
  /**
   * Chantier 48 — rejoindre une autre table que celle assignée, par son code
   * (RPC `switch_table` : vérifie que le code appartient à la séance en
   * cours, et retire proprement le participant de ses tables précédentes —
   * contrairement à `join_table`, cf. JoinTableForm).
   * Chantier 62 — également utilisé comme sortie de secours quand
   * `assignment` est null : `switch_table` fonctionne à l'identique quand
   * il n'y a aucune table précédente à quitter (la boucle de nettoyage ne
   * trouve simplement rien à faire).
   */
  onSwitch?: (joinCode: string) => Promise<void>
  switchLoading?: boolean
  switchError?: string | null
}

/**
 * Chantier 62 — États possibles de (loading, assignment) selon la phase.
 *
 * Ce composant n'est monté que par `AllocatingScreen`, elle-même montée par
 * `VoteScreen` uniquement quand `session.phase === 'debating'` (cf.
 * `setStep('allocating')` dans VoteScreen.tsx — jamais déclenché par la
 * phase `allocating` elle-même, qui reste sur l'écran de vote avec une
 * bannière). Une fois montée, `phase` ne peut plus évoluer que vers
 * `closed`. En pratique donc :
 *
 *   loading=true                              → toujours en cours de fetch (bref, RPC `get_my_table_assignment`)
 *                                                → spinner légitime, quelle que soit la phase.
 *   loading=false, assignment=null,  debating  → l'allocation a déjà tourné (apply_allocation a été appliqué
 *                                                avant que le superadmin ouvre le débat) et n'a pas produit
 *                                                de ligne pour ce membre — typiquement un inscrit tardif
 *                                                (chantier 61 : inscription pendant `allocating`) resté hors
 *                                                du calcul. Cul-de-sac réel → sortie de secours (code à 6 car.).
 *   loading=false, assignment=null,  closed    → la séance a clôturé sans que ce membre n'ait jamais rejoint
 *                                                de table. Rejoindre n'a plus de sens : message neutre, pas de
 *                                                formulaire (la bannière de clôture d'AllocatingScreen prend
 *                                                le relais pour la suite).
 *   loading=false, assignment=null,  autre     → normalement inatteignable (draft/pre_voting/voting/allocating).
 *                                                Traité défensivement comme "en cours" plutôt que comme un
 *                                                cul-de-sac : si ce composant venait à être monté plus tôt un
 *                                                jour, proposer un formulaire de code alors que l'allocation
 *                                                n'a peut-être pas encore tourné serait pire que le spinner.
 *   loading=false, assignment!==null           → cas nominal, inchangé (carte + CTA rejoindre + bouton switch).
 */
export default function TableAssignmentCard({
  assignment, loading, phase, onJoin, joinLoading, joinError,
  onSwitch, switchLoading, switchError,
}: TableAssignmentCardProps) {
  const [showSwitchForm, setShowSwitchForm] = useState(false)
  const [switchCode, setSwitchCode] = useState('')
  const [localSwitchError, setLocalSwitchError] = useState<string | null>(null)

  async function handleRescueSubmit() {
    const code = switchCode.trim().toUpperCase()
    if (!code) return
    setLocalSwitchError(null)
    await onSwitch?.(code)
  }

  const waitingSpinner = (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col items-center justify-center gap-3 min-h-[140px]">
      <svg className="w-6 h-6 animate-spin text-indigo-400" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      <p className="text-sm text-gray-500 text-center">Formation des groupes en cours…</p>
      <p className="text-xs text-gray-400 text-center max-w-[240px]">
        L'organisateur répartit tous les participants en groupes aux avis variés à partir des votes.
        Tu seras notifié(e) dès que ton groupe est prêt.
      </p>
      <p className="text-xs text-gray-400 text-center pt-1">
        Ça ne bouge pas ?{' '}
        <button onClick={() => window.location.reload()} className="text-indigo-500 hover:underline">
          Recharge la page
        </button>
      </p>
    </div>
  )

  if (loading) {
    return waitingSpinner
  }

  if (assignment === null) {
    // Chantier 62 — sortie de secours : phase de débat sans aucune affectation.
    if (phase === 'debating') {
      return (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3">
          <p className="text-sm text-gray-700 text-center font-medium">
            Le débat a commencé, mais tu n'as pas encore de table.
          </p>
          <p className="text-xs text-gray-500 text-center max-w-[280px] mx-auto">
            Ça arrive si tu t'es inscrit(e) pendant que l'organisateur répartissait les groupes.
            Demande le code à 6 caractères d'une table à un ami déjà installé là-bas, ou à son
            modérateur, pour la rejoindre.
          </p>
          <div className="pt-1 space-y-2">
            <input
              type="text"
              value={switchCode}
              onChange={e => { setSwitchCode(e.target.value.toUpperCase()); setLocalSwitchError(null) }}
              placeholder="A1B2C3"
              maxLength={6}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono
                tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-indigo-500
                placeholder:text-gray-300"
            />
            {(localSwitchError || switchError) && (
              <p className="text-xs text-red-600 text-center">{localSwitchError || switchError}</p>
            )}
            <button
              onClick={handleRescueSubmit}
              disabled={switchLoading || switchCode.trim().length === 0}
              className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400
                text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {switchLoading ? 'Connexion…' : 'Rejoindre cette table'}
            </button>
          </div>
        </div>
      )
    }

    // Chantier 62 — séance clôturée sans qu'aucune table n'ait jamais été rejointe :
    // rejoindre n'a plus de sens, message neutre (la bannière de clôture
    // d'AllocatingScreen prend le relais juste en dessous).
    if (phase === 'closed') {
      return (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col items-center justify-center gap-2 min-h-[140px]">
          <p className="text-sm text-gray-500 text-center">Le débat est terminé.</p>
          <p className="text-xs text-gray-400 text-center max-w-[240px]">
            Tu n'as rejoint aucune table pendant cette séance.
          </p>
        </div>
      )
    }

    // Autre phase (théoriquement inatteignable, cf. commentaire au-dessus du composant) :
    // même traitement que le chargement, jamais un cul-de-sac.
    return waitingSpinner
  }

  const joinCode = assignment.tables?.join_code ?? null
  const isDebating = phase === 'debating'

  async function handleSwitchSubmit() {
    const code = switchCode.trim().toUpperCase()
    if (!code) return
    if (joinCode && code === joinCode.toUpperCase()) {
      setLocalSwitchError('Tu es déjà à cette table.')
      return
    }
    setLocalSwitchError(null)
    await onSwitch?.(code)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Table number */}
      <div className="bg-indigo-600 px-6 py-5 text-center">
        <p className="text-indigo-200 text-sm font-medium mb-1">Tu es à la</p>
        <p className="text-white text-5xl font-black tracking-tight">
          Table {assignment.table_number}
        </p>
      </div>

      {/* Chantier 28 (H26) — plus de nom de camp ici : cette table réunit
          volontairement plusieurs camps d'opinion (allocation v2), aucun nom de
          camp ne la décrit. On explique le principe à la place. */}
      <div className="px-6 pt-4 pb-0 text-center">
        <p className="text-xs text-gray-500">
          Ta table réunit volontairement des personnes aux avis différents.
        </p>
      </div>

      <div className="px-6 py-5 space-y-4">
        {/* Join code */}
        {joinCode ? (
          <div className="text-center space-y-1">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Code de ta table</p>
            <p className="text-3xl font-mono font-bold text-gray-800 tracking-widest">{joinCode}</p>
          </div>
        ) : !isDebating ? (
          <p className="text-sm text-gray-400 text-center">
            Tu recevras le code quand ta table sera créée.
          </p>
        ) : null}

        {/* Debating phase CTA */}
        {isDebating && (
          <div className="pt-1">
            {joinCode ? (
              <>
                <button
                  onClick={onJoin}
                  disabled={joinLoading}
                  className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400
                    text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {joinLoading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Connexion…
                    </>
                  ) : 'Accéder à la table →'}
                </button>
                {joinError && (
                  <p className="text-xs text-red-600 text-center mt-2">{joinError}</p>
                )}
              </>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1">
                <p className="text-sm text-amber-700 text-center">
                  Ta table n'est pas encore créée.<br />
                  Rends-toi à la <strong>Table {assignment.table_number}</strong> en salle.
                </p>
                <p className="text-xs text-amber-600 text-center">
                  Le code apparaît ici automatiquement, mais tu peux aussi{' '}
                  <button onClick={() => window.location.reload()} className="underline hover:text-amber-800">
                    recharger la page
                  </button>.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Chantier 48 — rejoindre une autre table que celle assignée */}
        {isDebating && onSwitch && (
          <div className="pt-2 text-center">
            {!showSwitchForm ? (
              <button
                onClick={() => { setShowSwitchForm(true); setLocalSwitchError(null) }}
                className="text-xs text-gray-500 hover:text-indigo-600 underline"
              >
                Je veux rejoindre une autre table
              </button>
            ) : (
              <div className="mt-1 p-3 bg-gray-50 rounded-xl border border-gray-200 text-left space-y-2">
                <p className="text-xs text-gray-500">
                  Demande le code à 6 caractères de la table visée à un ami déjà installé
                  là-bas, ou à son modérateur.
                </p>
                <input
                  type="text"
                  value={switchCode}
                  onChange={e => { setSwitchCode(e.target.value.toUpperCase()); setLocalSwitchError(null) }}
                  placeholder="A1B2C3"
                  maxLength={6}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono
                    tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-indigo-500
                    placeholder:text-gray-300"
                />
                {(localSwitchError || switchError) && (
                  <p className="text-xs text-red-600">{localSwitchError || switchError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleSwitchSubmit}
                    disabled={switchLoading || switchCode.trim().length === 0}
                    className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400
                      text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    {switchLoading ? 'Connexion…' : 'Rejoindre cette table'}
                  </button>
                  <button
                    onClick={() => { setShowSwitchForm(false); setSwitchCode(''); setLocalSwitchError(null) }}
                    disabled={switchLoading}
                    className="py-2 px-3 text-xs text-gray-500 hover:text-gray-700"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Allocating phase — waiting message */}
        {!isDebating && joinCode && (
          <p className="text-xs text-gray-400 text-center">
            Le débat n'a pas encore démarré. Attends le signal de l'organisateur.
          </p>
        )}
      </div>
    </div>
  )
}
