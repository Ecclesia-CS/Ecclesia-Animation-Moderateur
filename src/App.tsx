import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { tableStore } from './lib/storage'
import type { TableResult } from './lib/supabase'
import { TableProvider } from './context/TableContext'
import EntryScreen from './screens/EntryScreen'
import TableView from './screens/TableView'
import SuperadminScreen from './screens/SuperadminScreen'

type AppPhase =
  | { type: 'loading' }
  | { type: 'entry'; userId: string }
  | { type: 'table'; tableId: string; participantId: string; userId: string; isModerator: boolean }

export default function App() {
  const [phase, setPhase] = useState<AppPhase>({ type: 'loading' })

  useEffect(() => {
    async function init() {
      // Ensure anonymous auth session
      let session = (await supabase.auth.getSession()).data.session
      if (!session) {
        const { data } = await supabase.auth.signInAnonymously()
        session = data.session
      }
      if (!session) {
        setPhase({ type: 'entry', userId: '' })
        return
      }
      const userId = session.user.id

      // Try to restore a previous table from localStorage
      const stored = tableStore.get()
      if (stored) {
        const { data: pRow } = await supabase
          .from('participants')
          .select('id, user_id')
          .eq('id', stored.participantId)
          .maybeSingle()

        if (pRow && (pRow as { id: string; user_id: string }).user_id === userId) {
          // Même auth.uid → restauration directe sans RPC
          setPhase({ type: 'table', tableId: stored.tableId, participantId: stored.participantId, userId, isModerator: stored.isModerator ?? false })
          return
        }
        // Participant trouvé mais user_id différent (auth anonyme renouvelé), ou non trouvé →
        // join_table relie l'auth.uid() courant via ON CONFLICT DO UPDATE
        if (stored.pseudo && stored.joinCode) {
          try {
            const { data: rpcData } = await supabase.rpc('join_table', {
              p_join_code: stored.joinCode,
              p_pseudo: stored.pseudo,
            })
            if (rpcData) {
              const r = rpcData as TableResult
              const isMod = r.created_by === userId
              tableStore.set({ tableId: r.id, participantId: r.participant_id, joinCode: r.join_code, isModerator: isMod, pseudo: stored.pseudo })
              setPhase({ type: 'table', tableId: r.id, participantId: r.participant_id, userId, isModerator: isMod })
              return
            }
          } catch { /* table supprimée ou réseau mort → écran d'entrée */ }
        }

        tableStore.clear()
      }

      setPhase({ type: 'entry', userId })
    }
    init()
  }, [])

  function handleJoined(tableId: string, participantId: string, isModerator: boolean) {
    if (phase.type === 'entry') {
      setPhase({ type: 'table', tableId, participantId, userId: phase.userId, isModerator })
    }
  }

  function handleTableEnd() {
    tableStore.clear()
    const userId = phase.type === 'table' ? phase.userId : ''
    setPhase({ type: 'entry', userId })
  }

  // Route /superadmin via hash — indépendant du flow principal
  if (window.location.hash === '#superadmin') {
    return <SuperadminScreen />
  }

  if (phase.type === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-500">Connexion…</p>
      </div>
    )
  }

  if (phase.type === 'entry') {
    return <EntryScreen userId={phase.userId} onJoined={handleJoined} />
  }

  return (
    <TableProvider
      tableId={phase.tableId}
      participantId={phase.participantId}
      userId={phase.userId}
      initialIsModerator={phase.isModerator}
      onTableEnd={handleTableEnd}
    >
      <TableView />
    </TableProvider>
  )
}
