import JoinTableForm from '../components/JoinTableForm'
import QuitLink from '../components/QuitLink'

interface Props {
  tableJoinCode: string
  onTableJoined(tableId: string, participantId: string, isModerator: boolean): void
}

/** Écran atteint via un lien #table/<join_code> partagé par un ami déjà en débat (D8). */
export default function JoinTableScreen({ tableJoinCode, onTableJoined }: Props) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <QuitLink />
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 pt-7 pb-2 text-center">
          <h1 className="text-lg font-semibold text-gray-900">Un ami t'invite à le rejoindre</h1>
          <p className="text-xs text-gray-400 mt-1">Entre ton nom pour rejoindre sa table de débat.</p>
        </div>
        <div className="p-6">
          <JoinTableForm
            initialJoinCode={tableJoinCode}
            onJoined={onTableJoined}
            submitLabel="Rejoindre la table"
          />
        </div>
      </div>
    </div>
  )
}
