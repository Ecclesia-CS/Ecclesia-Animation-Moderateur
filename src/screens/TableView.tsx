import { useTable } from '../context/TableContext'
import ModeratorView from './ModeratorView'
import ParticipantView from './ParticipantView'

export default function TableView() {
  const { isModerator } = useTable()
  return isModerator ? <ModeratorView /> : <ParticipantView />
}
