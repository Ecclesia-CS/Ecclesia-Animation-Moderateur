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
  groupName?: { name: string; description: string } | null
}

export default function TableAssignmentCard({ assignment, loading, phase, onJoin, joinLoading, joinError, groupName }: TableAssignmentCardProps) {
  if (loading || assignment === null) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col items-center justify-center gap-3 min-h-[140px]">
        <svg className="w-6 h-6 animate-spin text-indigo-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        <p className="text-sm text-gray-500 text-center">Formation des groupes en cours…</p>
        <p className="text-xs text-gray-400 text-center">Tu seras notifié(e) dès que ton groupe est prêt.</p>
      </div>
    )
  }

  const joinCode = assignment.tables?.join_code ?? null
  const isDebating = phase === 'debating'

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Table number */}
      <div className="bg-indigo-600 px-6 py-5 text-center">
        <p className="text-indigo-200 text-sm font-medium mb-1">Tu es à la</p>
        <p className="text-white text-5xl font-black tracking-tight">
          Table {assignment.table_number}
        </p>
      </div>

      {groupName && (
        <div className="px-6 pt-4 pb-0 text-center space-y-0.5">
          <p className="text-sm font-semibold text-indigo-700">{groupName.name}</p>
          <p className="text-xs text-gray-500">{groupName.description}</p>
        </div>
      )}

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
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <p className="text-sm text-amber-700 text-center">
                  Ta table n'est pas encore créée.<br />
                  Rends-toi à la <strong>Table {assignment.table_number}</strong> en salle.
                </p>
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
