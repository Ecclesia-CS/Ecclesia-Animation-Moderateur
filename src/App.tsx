import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { sessionStore } from './lib/storage'
import type { SessionResult } from './lib/supabase'
import { SessionProvider } from './context/SessionContext'
import EntryScreen from './screens/EntryScreen'
import SessionView from './screens/SessionView'

type AppPhase =
  | { type: 'loading' }
  | { type: 'entry'; userId: string }
  | { type: 'session'; sessionId: string; participantId: string; userId: string; isModerator: boolean }

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

      // Try to restore a previous session from localStorage
      const stored = sessionStore.get()
      if (stored) {
        const { data: pRow } = await supabase
          .from('participants')
          .select('id, user_id')
          .eq('id', stored.participantId)
          .maybeSingle()

        if (pRow && (pRow as { id: string; user_id: string }).user_id === userId) {
          // Même auth.uid → restauration directe sans RPC
          setPhase({ type: 'session', sessionId: stored.sessionId, participantId: stored.participantId, userId, isModerator: stored.isModerator ?? false })
          return
        }
        // Participant trouvé mais user_id différent (auth anonyme renouvelé), ou non trouvé →
        // join_session relie l'auth.uid() courant via ON CONFLICT DO UPDATE
        if (stored.pseudo && stored.joinCode) {
          try {
            const { data: rpcData } = await supabase.rpc('join_session', {
              p_join_code: stored.joinCode,
              p_pseudo: stored.pseudo,
            })
            if (rpcData) {
              const r = rpcData as SessionResult
              const isMod = r.created_by === userId
              sessionStore.set({ sessionId: r.id, participantId: r.participant_id, joinCode: r.join_code, isModerator: isMod, pseudo: stored.pseudo })
              setPhase({ type: 'session', sessionId: r.id, participantId: r.participant_id, userId, isModerator: isMod })
              return
            }
          } catch { /* session supprimée ou réseau mort → écran d'entrée */ }
        }

        sessionStore.clear()
      }

      setPhase({ type: 'entry', userId })
    }
    init()
  }, [])

  function handleJoined(sessionId: string, participantId: string, isModerator: boolean) {
    if (phase.type === 'entry') {
      setPhase({ type: 'session', sessionId, participantId, userId: phase.userId, isModerator })
    }
  }

  function handleSessionEnd() {
    sessionStore.clear()
    const userId = phase.type === 'session' ? phase.userId : ''
    setPhase({ type: 'entry', userId })
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
    <SessionProvider
      sessionId={phase.sessionId}
      participantId={phase.participantId}
      userId={phase.userId}
      initialIsModerator={phase.isModerator}
      onSessionEnd={handleSessionEnd}
    >
      <SessionView />
    </SessionProvider>
  )
}
