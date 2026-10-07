import JoinTableForm from '../components/JoinTableForm'
import PageParcours from '../components/PageParcours'

interface Props {
  tableJoinCode: string
  onTableJoined(tableId: string, participantId: string, isModerator: boolean): void
}

/** Écran atteint via un lien #table/<join_code> partagé par un ami déjà en débat (D8). */
export default function JoinTableScreen({ tableJoinCode, onTableJoined }: Props) {
  return (
    <PageParcours
      session={{ title: "Un ami t'invite à le rejoindre", phase: 'debating', organization_id: null }}
      sansEtape
      sousTitre="Entre ton nom pour rejoindre sa table de débat."
    >
      <div className="w-full rounded-[12px] border border-bleu-fonce/10 bg-white shadow-sm p-6 animate-montee">
        <JoinTableForm
          initialJoinCode={tableJoinCode}
          onJoined={onTableJoined}
          submitLabel="Rejoindre la table"
        />
      </div>
    </PageParcours>
  )
}
