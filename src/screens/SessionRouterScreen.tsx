import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Session } from '../lib/types'

interface SessionRouterScreenProps {
  sessionJoinCode: string
}

type Status =
  | 'loading'
  | 'redirecting'
  | 'not_found'
  | 'draft'
  | 'debating_no_member'
  | 'questionnaire'
  | 'closed'

export default function SessionRouterScreen({ sessionJoinCode }: SessionRouterScreenProps) {
  const [status, setStatus] = useState<Status>('loading')
  const [sessionTitle, setSessionTitle] = useState<string | null>(null)

  useEffect(() => {
    async function route() {
      // 1. Ensure anonymous auth
      let authSession = (await supabase.auth.getSession()).data.session
      if (!authSession) {
        const { data } = await supabase.auth.signInAnonymously()
        authSession = data.session
      }
      const userId = authSession?.user.id ?? null

      // 2. Fetch session by join_code
      const { data: session } = await supabase
        .from('sessions')
        .select('*')
        .eq('join_code', sessionJoinCode)
        .maybeSingle()

      if (!session) {
        setStatus('not_found')
        return
      }

      const s = session as Session
      setSessionTitle(s.title)

      // 3. Branch per phase
      switch (s.phase) {
        case 'draft':
          setStatus('draft')
          return

        case 'voting':
        case 'allocating':
          setStatus('redirecting')
          window.location.hash = '#vote/' + sessionJoinCode
          return

        case 'debating': {
          if (!userId) {
            setStatus('debating_no_member')
            return
          }
          const { data: member } = await supabase
            .from('session_members')
            .select('id')
            .eq('session_id', s.id)
            .eq('user_id', userId)
            .maybeSingle()

          if (member) {
            setStatus('redirecting')
            window.location.hash = '#vote/' + sessionJoinCode
          } else {
            setStatus('debating_no_member')
          }
          return
        }

        case 'questionnaire':
          setStatus('questionnaire')
          return

        case 'closed':
          setStatus('closed')
          return

        default:
          setStatus('not_found')
      }
    }

    route()
  }, [sessionJoinCode])

  // ── Render ────────────────────────────────────────────────────
  if (status === 'loading' || status === 'redirecting') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-6 h-6 animate-spin text-indigo-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <p className="text-sm text-gray-500">Chargement…</p>
        </div>
      </div>
    )
  }

  const CONFIG: Record<Exclude<Status, 'loading' | 'redirecting'>, {
    icon: string
    title: string
    subtitle: string
  }> = {
    not_found: {
      icon: '❓',
      title: 'Séance introuvable',
      subtitle: 'Vérifie le lien ou scanne à nouveau le QR code.',
    },
    draft: {
      icon: '🕐',
      title: 'Séance pas encore ouverte',
      subtitle: "L'organisateur n'a pas encore lancé la séance.",
    },
    debating_no_member: {
      icon: '🗣️',
      title: 'Débat en cours',
      subtitle: 'Rejoins ta table avec le code affiché en salle.',
    },
    questionnaire: {
      icon: '📋',
      title: 'Questionnaire',
      subtitle: 'Réponds au questionnaire pour cette séance.',
    },
    closed: {
      icon: '✅',
      title: 'Séance terminée',
      subtitle: 'Merci pour ta participation.',
    },
  }

  const cfg = CONFIG[status]

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
        <div className="text-5xl mb-4">{cfg.icon}</div>
        <h1 className="text-lg font-bold text-gray-900">{cfg.title}</h1>
        {sessionTitle && (
          <p className="text-sm text-gray-500 mt-1">{sessionTitle}</p>
        )}
        <p className="text-sm text-gray-400 mt-3">{cfg.subtitle}</p>
        <button
          onClick={() => { window.location.hash = '' }}
          className="mt-6 text-xs text-indigo-600 hover:underline"
        >
          ← Retour à l'accueil
        </button>
      </div>
    </div>
  )
}
