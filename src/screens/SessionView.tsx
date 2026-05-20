import { useSession } from '../context/SessionContext'
import ModeratorView from './ModeratorView'
import ParticipantView from './ParticipantView'

export default function SessionView() {
  const { isModerator } = useSession()
  return isModerator ? <ModeratorView /> : <ParticipantView />
}
