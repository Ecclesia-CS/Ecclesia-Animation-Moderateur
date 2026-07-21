import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { castVote, getVoteResults, confirmAttendance, registerSessionMember } from '../lib/voting'
import { lastNameStore } from '../lib/storage'
import type { Assertion, AssertionVote, EntryResponse, Session, SessionMember, VoteResult } from '../lib/types'
import VoteResultsSummary from '../components/voting/VoteResultsSummary'
import PseudoForm from '../components/voting/PseudoForm'
import OnboardingForm from '../components/voting/OnboardingForm'
import AssertionCard from '../components/voting/AssertionCard'
import VoteProgress from '../components/voting/VoteProgress'
import SubmitAssertionModal from '../components/voting/SubmitAssertionModal'
import VoteTimerBadge from '../components/voting/VoteTimerBadge'
import NotesModal from '../components/NotesModal'
import AllocatingScreen from './AllocatingScreen'
import SessionQuestionnaireForm from '../components/voting/SessionQuestionnaireForm'
import QuitLink from '../components/QuitLink'
import JoinTableForm from '../components/JoinTableForm'

interface VoteScreenProps {
  sessionJoinCode: string
  onTableJoined?: (tableId: string, participantId: string, isModerator: boolean) => void
}

type Step = 'loading' | 'error' | 'pseudo' | 'reclaim_code' | 'confirm_attendance' | 'onboarding' | 'waiting' | 'vote' | 'allocating' | 'questionnaire' | 'closed' | 'ended'

/** Fisher-Yates shuffle — immutable */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function VoteScreen({ sessionJoinCode, onTableJoined }: VoteScreenProps) {
  const [step, setStep] = useState<Step>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  const [session, setSession] = useState<Session | null>(null)
  const [member, setMember] = useState<SessionMember | null>(null)
  const memberRef = useRef<SessionMember | null>(null)

  // Pré-vote : code de rappel généré côté client (montré une seule fois)
  const [reclaimCode, setReclaimCode] = useState<string | null>(null)
  // Confirmation présentielle
  const [confirmPseudo, setConfirmPseudo] = useState<string>('')
  // 'known_user' = membre identifié par user_id (même appareil, attending=false)
  // 'reclaim'    = nouvel appareil, reclaim par pseudo ou code
  const [confirmMode, setConfirmMode] = useState<'known_user' | 'reclaim'>('reclaim')

  // Vote step state
  const [assertions, setAssertions] = useState<Assertion[]>([]) // shuffled order
  const [myVotes, setMyVotes] = useState<Map<string, AssertionVote>>(new Map())
  const [assertionIndex, setAssertionIndex] = useState(0)
  const [showSubmitModal,    setShowSubmitModal]    = useState(false)
  const [proposedCount,      setProposedCount]      = useState(0)
  const [showVoteIntro,      setShowVoteIntro]      = useState(false)
  const [showAllAssertions,  setShowAllAssertions]  = useState(false)
  const [allAssertionResults, setAllAssertionResults] = useState<VoteResult[]>([])
  const [allResultsLoading,  setAllResultsLoading]  = useState(false)

  // Outils panel
  const [showToolsPanel,  setShowToolsPanel]  = useState(false)
  const [showNotesModal,  setShowNotesModal]  = useState(false)

  // Message d'intro affiché une fois par séance : explique les phases de l'app
  const [showAppIntro, setShowAppIntro] = useState(false)

  // Proposition nudge every 10 votes
  const [nextNudgeAt,      setNextNudgeAt]      = useState(10)
  const [showProposalNudge, setShowProposalNudge] = useState(false)

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Résultats consensus/dissensus (chargés quand tout est voté)
  const [voteResults,    setVoteResults]    = useState<VoteResult[]>([])
  const [resultsLoading, setResultsLoading] = useState(false)

  useEffect(() => {
    if (!session || assertions.length === 0) return
    const allVoted = assertions.every(a => myVotes.has(a.id))
    if (!allVoted) return
    setResultsLoading(true)
    getVoteResults(session.id)
      .then(setVoteResults)
      .catch(() => {})
      .finally(() => setResultsLoading(false))
  }, [assertions, myVotes, session])

  // Garde memberRef synchronisé pour les closures Realtime
  useEffect(() => { memberRef.current = member }, [member])

  // ── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      // 1. Auth
      let authSession = (await supabase.auth.getSession()).data.session
      if (!authSession) {
        const { data } = await supabase.auth.signInAnonymously()
        authSession = data.session
      }
      if (!authSession) {
        setErrorMsg('Impossible de créer une session anonyme.')
        setStep('error')
        return
      }

      // 2. Fetch session by join_code
      const { data: sess, error: sessErr } = await supabase
        .from('sessions')
        .select('*')
        .eq('join_code', sessionJoinCode)
        .maybeSingle()

      if (sessErr || !sess) {
        setErrorMsg('Séance introuvable.')
        setStep('error')
        return
      }
      const s = sess as Session
      setSession(s)

      // Message d'intro "comment fonctionne l'app" — une fois par séance
      if (!localStorage.getItem(`ecclesia_app_intro_${s.id}`)) {
        setShowAppIntro(true)
      }

      // 3. Check if already a member
      const { data: existingMember } = await supabase
        .from('session_members')
        .select('*')
        .eq('session_id', s.id)
        .eq('user_id', authSession.user.id)
        .maybeSingle()

      if (!existingMember) {
        // Can't join if the vote phase is already over
        if (s.phase !== 'draft' && s.phase !== 'pre_voting' && s.phase !== 'voting' && s.phase !== 'allocating') {
          setErrorMsg('Le vote est terminé, tu ne peux plus rejoindre cette séance.')
          setStep('ended')
          return
        }
        // En pré-vote : générer un code de rappel à afficher après inscription
        if (s.phase === 'pre_voting') {
          setReclaimCode(String(Math.floor(Math.random() * 10000)).padStart(4, '0'))
        }
        setStep('pseudo')
        return
      }
      const m = existingMember as SessionMember
      setMember(m)

      // 3b. Route based on phase — allocating: on reste sur le vote avec bannière
      if (s.phase === 'debating') {
        setStep('allocating')
        return
      }
      if (s.phase === 'questionnaire') {
        setStep('questionnaire')
        return
      }
      if (s.phase === 'closed') {
        setStep('closed')
        return
      }

      // 3c. En phase voting : si le membre n'a pas confirmé sa présence → confirmation
      if (s.phase === 'voting' && !m.attending_in_person) {
        setConfirmPseudo(m.pseudo)
        setConfirmMode('known_user')   // identifié par user_id, même appareil
        setStep('confirm_attendance')
        return
      }

      // 4. Check if already answered onboarding
      const { data: existingResponse } = await supabase
        .from('entry_responses')
        .select('id')
        .eq('session_id', s.id)
        .eq('member_id', m.id)
        .maybeSingle()

      if (!existingResponse) {
        // En pré-vote : pas d'onboarding — aller directement au vote
        if (s.phase === 'pre_voting') {
          await loadVoteData(s, m)
          return
        }
        setStep('onboarding')
        return
      }

      // 5. If session is in draft or pre_voting, show waiting screen
      if (s.phase === 'draft') {
        setStep('waiting')
        subscribeForWaiting(s, m)
        return
      }
      if (s.phase === 'pre_voting') {
        // Déjà inscrit et déjà onboardé (ou pré-vote) → vote
      }

      // 6. Load vote data
      await loadVoteData(s, m)
    }

    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionJoinCode])

  // ── Subscribe to phase changes while waiting (draft phase) ──────────────
  function subscribeForWaiting(s: Session, m: SessionMember) {
    if (channelRef.current) supabase.removeChannel(channelRef.current)

    const channel = supabase
      .channel(`vote-wait:${s.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${s.id}`,
        },
        payload => {
          const updated = payload.new as Session
          setSession(updated)
          if (updated.phase === 'pre_voting' || updated.phase === 'allocating') {
            loadVoteData(updated, m)
          } else if (updated.phase === 'voting') {
            // Transition pré-vote → vote : si le membre n'a pas confirmé sa présence,
            // lui demander avant de charger les votes
            if (!m.attending_in_person) {
              setConfirmPseudo(m.pseudo)
              setStep('confirm_attendance')
            } else {
              loadVoteData(updated, m)
            }
          } else if (updated.phase === 'debating') {
            setStep('allocating')
          } else if (updated.phase === 'questionnaire') {
            setStep('questionnaire')
          } else if (updated.phase === 'closed') {
            setStep('closed')
          } else if (updated.phase !== 'draft') {
            setStep('ended')
          }
          // draft → draft: stay on waiting
        },
      )
      .subscribe()

    channelRef.current = channel
  }

  // ── Load assertions + votes ───────────────────────────────────────────────
  async function loadVoteData(s: Session, m: SessionMember) {
    const [{ data: assertionRows }, { data: voteRows }, { data: myAssertions }] = await Promise.all([
      supabase
        .from('assertions')
        .select('id, session_id, content, status, created_at') // pas member_id (E2 — anonymat des auteurs)
        .eq('session_id', s.id)
        .eq('status', 'approved'),
      supabase
        .from('assertion_votes')
        .select('*')
        .eq('member_id', m.id),
      supabase
        .from('assertions')
        .select('id')
        .eq('session_id', s.id)
        .eq('member_id', m.id),
    ])

    const allAssertions = (assertionRows ?? []) as Assertion[]
    const allVotes = (voteRows ?? []) as AssertionVote[]

    // Build vote map
    const voteMap = new Map<string, AssertionVote>()
    for (const v of allVotes) voteMap.set(v.assertion_id, v)

    // Shuffle: unvoted first, then voted
    const unvoted = shuffle(allAssertions.filter(a => !voteMap.has(a.id)))
    const voted = shuffle(allAssertions.filter(a => voteMap.has(a.id)))
    const ordered = [...unvoted, ...voted]

    setAssertions(ordered)
    setMyVotes(voteMap)
    setProposedCount((myAssertions ?? []).length)
    setAssertionIndex(0)
    setShowVoteIntro(true)
    setStep('vote')

    // Subscribe Realtime
    subscribeRealtime(s, m, voteMap, ordered)
  }

  // ── Realtime ──────────────────────────────────────────────────────────────
  function subscribeRealtime(
    s: Session,
    m: SessionMember,
    initialVotes: Map<string, AssertionVote>,
    initialAssertions: Assertion[],
  ) {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }

    const channel = supabase
      .channel(`vote:${s.id}`)
      // New approved assertions
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'assertions',
          filter: `session_id=eq.${s.id}`,
        },
        payload => {
          const a = payload.new as Assertion
          if (a.status !== 'approved') return
          setAssertions(prev => {
            if (prev.some(x => x.id === a.id)) {
              // update existing (e.g. pending → approved)
              return prev.map(x => (x.id === a.id ? a : x))
            }
            // New assertion: append at end (already voted boundary)
            return [...prev, a]
          })
        },
      )
      // Session phase changes
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${s.id}`,
        },
        payload => {
          const updated = payload.new as Session
          setSession(updated)
          if (updated.phase === 'debating') {
            setStep('allocating')
          } else if (updated.phase === 'questionnaire') {
            setStep('questionnaire')
          } else if (updated.phase === 'closed') {
            setStep('closed')
          } else if (updated.phase === 'draft') {
            // Admin reverted to draft — go back to waiting
            setStep('waiting')
            subscribeForWaiting(updated, m)
          } else if (updated.phase === 'voting') {
            // Transition pré-vote → vote en cours de session
            const currentMember = memberRef.current
            if (currentMember && !currentMember.attending_in_person) {
              setConfirmPseudo(currentMember.pseudo)
              setConfirmMode('known_user')
              setStep('confirm_attendance')
            }
            // Si already attending : rester sur le step vote
          } else if (updated.phase !== 'allocating' && updated.phase !== 'pre_voting') {
            setStep('ended')
          }
        },
      )
      .subscribe()

    // Keep refs for cleanup
    channelRef.current = channel

    // Suppress unused warnings — these are captured in closures indirectly
    void initialVotes
    void initialAssertions
    void m
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [])

  // Polling fallback : récupère les assertions approuvées toutes les 10s
  useEffect(() => {
    if (step !== 'vote' || !session) return
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('assertions')
        .select('id, session_id, content, status, created_at') // pas member_id (E2 — anonymat des auteurs)
        .eq('session_id', session.id)
        .eq('status', 'approved')
      if (!data) return
      setAssertions(prev => {
        const incoming = data as Assertion[]
        const newOnes = incoming.filter(a => !prev.some(p => p.id === a.id))
        return newOnes.length > 0 ? [...prev, ...newOnes] : prev
      })
    }, 10000)
    return () => clearInterval(interval)
  }, [step, session])

  // ── Polling de secours phase (fallback Realtime — Messenger / WebSocket indisponible) ──
  useEffect(() => {
    if (step !== 'waiting' && step !== 'vote') return
    if (!session || !member) return

    const sessionId  = session.id
    const knownPhase = session.phase
    const m = member

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle()
      if (!data) return
      const s = data as Session
      if (s.phase === knownPhase) return

      setSession(s)
      if (s.phase === 'pre_voting' || s.phase === 'allocating') {
        if (step === 'waiting') loadVoteData(s, m)
      } else if (s.phase === 'voting') {
        if (step === 'waiting') {
          // Transition pré-vote → vote : vérifier si confirmation présentielle requise
          if (!m.attending_in_person) {
            setConfirmPseudo(m.pseudo)
            setConfirmMode('known_user')
            setStep('confirm_attendance')
          } else {
            loadVoteData(s, m)
          }
        } else if (step === 'vote' && !m.attending_in_person) {
          // Déjà en train de voter mais attending = false → demander confirmation
          setConfirmPseudo(m.pseudo)
          setConfirmMode('known_user')
          setStep('confirm_attendance')
        }
      } else if (s.phase === 'debating') {
        setStep('allocating')
      } else if (s.phase === 'questionnaire') {
        setStep('questionnaire')
      } else if (s.phase === 'closed') {
        setStep('closed')
      }
    }, 10_000)

    return () => clearInterval(interval)
  }, [step, session?.id, session?.phase, member?.id])

  // ── Nudge "Proposer" toutes les 10 assertions votées ─────────────────────
  useEffect(() => {
    if (step !== 'vote') return
    const votedCount = myVotes.size
    const allVoted = assertions.length > 0 && votedCount === assertions.length
    if (votedCount > 0 && votedCount >= nextNudgeAt && !allVoted) {
      setShowProposalNudge(true)
      setNextNudgeAt(n => n + 10)
    }
  }, [myVotes.size, nextNudgeAt, assertions.length, step])

  // ── Redirect vers SessionRouterScreen quand session clôturée ─────────────
  useEffect(() => {
    if (step === 'closed') {
      window.location.hash = '#session/' + sessionJoinCode
    }
  }, [step, sessionJoinCode])

  // ── Vote handler ──────────────────────────────────────────────────────────
  async function handleVote(assertionId: string, vote: 'agree' | 'disagree' | 'pass') {
    const voteRow = await castVote(assertionId, vote)
    // Add vote to map — the assertion disappears from unvotedAssertions automatically,
    // so the next unvoted one slides into view without needing to advance the index.
    setMyVotes(prev => {
      const next = new Map(prev)
      next.set(assertionId, voteRow)
      return next
    })
  }

  // ── Callbacks from children ───────────────────────────────────────────────
  async function handlePseudoSuccess(m: SessionMember) {
    setMember(m)
    if (session?.phase === 'pre_voting') {
      // Montrer le code de rappel, puis voter directement (pas d'onboarding)
      setStep('reclaim_code')
    } else {
      // Phase voting (nouveau membre) : questionnaire d'entrée avant le vote
      setStep('onboarding')
    }
  }

  async function handleConfirmAttendanceSuccess(m: SessionMember) {
    if (!session) return
    setMember(m)
    // Vérifier si l'onboarding est déjà fait (ex : reclaim depuis un pré-vote)
    const { data: existingResponse } = await supabase
      .from('entry_responses')
      .select('id')
      .eq('session_id', session.id)
      .eq('member_id', m.id)
      .maybeSingle()
    if (existingResponse) {
      await loadVoteData(session, m)
    } else {
      setStep('onboarding')
    }
  }

  async function handleOnboardingSuccess(_response: EntryResponse) {
    if (!session || !member) return
    // Re-fetch phase courante — peut avoir changé pendant l'onboarding
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', session.id)
      .maybeSingle()
    const current = (data as Session | null) ?? session
    setSession(current)

    if (current.phase === 'draft') {
      setStep('waiting')
      subscribeForWaiting(current, member)
    } else if (current.phase === 'debating') {
      setStep('allocating')
    } else {
      loadVoteData(current, member)
    }
  }

  function handleAssertionSubmitted() {
    setProposedCount(c => c + 1)
    // If moderation_policy = 'open', the assertion will arrive via Realtime
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-500">Chargement…</p>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
        <div className="text-center space-y-3 max-w-sm">
          <div className="text-5xl">😕</div>
          <h1 className="text-lg font-bold text-gray-900">Séance introuvable</h1>
          <p className="text-sm text-gray-500">{errorMsg}</p>
          <a
            href="#"
            onClick={() => (window.location.hash = '')}
            className="inline-block mt-2 text-sm text-indigo-600 hover:underline"
          >
            ← Retour à l'accueil
          </a>
        </div>
      </div>
    )
  }

  if (step === 'allocating' && session && member) {
    return <AllocatingScreen session={session} member={member} onTableJoined={onTableJoined} />
  }

  if (step === 'questionnaire' && session) {
    return (
      <>
        <QuitLink />
        <SessionQuestionnaireForm
          sessionId={session.id}
          onDone={() => setStep('ended')}
        />
      </>
    )
  }

  if (step === 'closed') {
    // useEffect ci-dessus redirige vers #session/<code>
    // Ce spinner s'affiche pendant la transition
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-6 h-6 animate-spin text-indigo-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <p className="text-sm text-gray-500">Chargement des résultats…</p>
        </div>
      </div>
    )
  }

  if (step === 'ended') {
    // Arrivé en retard pendant le débat, jamais inscrit au vote (D14) — formulaire de
    // rattrapage : rejoindre directement une table avec le code affiché en salle.
    if (session?.phase === 'debating') {
      return (
        <>
          <QuitLink />
          <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
              <div className="text-center mb-4">
                <div className="text-5xl mb-4">🗣️</div>
                <h1 className="text-lg font-bold text-gray-900">Débat en cours</h1>
                <p className="text-sm text-gray-500 mt-1">{session.title}</p>
                <p className="text-sm text-gray-400 mt-3">
                  Le vote est terminé, mais tu peux rejoindre une table directement avec le code affiché en salle.
                </p>
              </div>
              <JoinTableForm
                onJoined={(tableId, participantId, isModerator) => {
                  if (onTableJoined) onTableJoined(tableId, participantId, isModerator)
                }}
              />
            </div>
          </div>
        </>
      )
    }
    return (
      <>
        <QuitLink />
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
          <div className="text-center space-y-4 max-w-sm">
            <div className="text-5xl">🎉</div>
            <h1 className="text-xl font-bold text-gray-900">Phase de vote terminée</h1>
            <p className="text-sm text-gray-500">
              {errorMsg || 'Merci pour ta participation ! Les résultats vont être analysés pour former les groupes de débat.'}
            </p>
            <p className="text-xs text-gray-400">Attends les instructions de l'organisateur.</p>
          </div>
        </div>
      </>
    )
  }

  if (step === 'waiting' && session && member) {
    return (
      <>
        <QuitLink />
        {showAppIntro && <AppIntroModal session={session} onClose={() => setShowAppIntro(false)} />}
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
          <div className="text-center space-y-4 max-w-sm">
            <div className="text-5xl">⏳</div>
            <h1 className="text-xl font-bold text-gray-900">En attente de l'organisateur</h1>
            <p className="text-sm text-gray-500">
              Bienvenue <strong>{member.pseudo}</strong> ! L'organisateur va ouvrir le vote dans quelques instants.
            </p>
            <p className="text-xs text-gray-400">
              Tu seras automatiquement redirigé(e) quand le vote commencera.
            </p>
            <div className="flex justify-center pt-2">
              <span className="inline-block w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-xs text-gray-400 pt-1">
              Ça ne bouge pas ?{' '}
              <button onClick={() => window.location.reload()} className="text-indigo-500 hover:underline">
                Recharge la page
              </button>{' '}
              — c'est possible et parfois nécessaire pour voir les nouvelles infos.
            </p>
          </div>
        </div>
      </>
    )
  }

  if (step === 'pseudo' && session) {
    const intro = showAppIntro ? <AppIntroModal session={session} onClose={() => setShowAppIntro(false)} /> : null
    // En phase voting : formulaire combiné pseudo OU code (pas de double écran)
    if (session.phase === 'voting') {
      return (
        <>
          <QuitLink />
          {intro}
          <VotingEntryForm
            session={session}
            onNewMember={handlePseudoSuccess}
            onConfirmed={handleConfirmAttendanceSuccess}
          />
        </>
      )
    }
    return (
      <>
        <QuitLink />
        {intro}
        <PseudoForm
          session={session}
          onSuccess={handlePseudoSuccess}
          reclaimCode={session.phase === 'pre_voting' ? (reclaimCode ?? undefined) : undefined}
        />
      </>
    )
  }

  if (step === 'reclaim_code' && session && member && reclaimCode) {
    return (
      <>
        <QuitLink />
        <ReclaimCodeDisplay
          pseudo={member.pseudo}
          code={reclaimCode}
          onContinue={() => loadVoteData(session, member)}
        />
      </>
    )
  }

  if (step === 'confirm_attendance' && session) {
    return (
      <>
        <QuitLink />
        {showAppIntro && <AppIntroModal session={session} onClose={() => setShowAppIntro(false)} />}
        <AttendanceConfirmScreen
          session={session}
          pseudo={confirmPseudo}
          mode={confirmMode}
          onConfirmed={handleConfirmAttendanceSuccess}
          onSwitchToReclaim={() => setConfirmMode('reclaim')}
          onChangePseudo={() => {
            setConfirmPseudo('')
            setStep('pseudo')
          }}
        />
      </>
    )
  }

  if (step === 'onboarding' && session && member) {
    return (
      <>
        <QuitLink />
        <OnboardingForm sessionId={session.id} member={member} onSuccess={handleOnboardingSuccess} />
      </>
    )
  }

  if (step === 'vote' && session && member) {
    const votedCount = assertions.filter(a => myVotes.has(a.id)).length
    // Only show assertions that haven't been voted on yet
    const unvotedAssertions = assertions.filter(a => !myVotes.has(a.id))
    const allVoted = assertions.length > 0 && unvotedAssertions.length === 0
    // Clamp index in case the array shrank
    const safeIdx = unvotedAssertions.length > 0
      ? Math.min(assertionIndex, unvotedAssertions.length - 1)
      : 0
    const currentAssertion = unvotedAssertions[safeIdx] ?? null

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-sm font-bold text-gray-900 truncate max-w-[200px]">
              {session.title}
            </h1>
            <p className="text-xs text-gray-500">{member.pseudo}</p>
          </div>
          {session.vote_timer_minutes != null && session.phase_changed_at != null && (
            <VoteTimerBadge
              phaseChangedAt={session.phase_changed_at}
              timerMinutes={session.vote_timer_minutes}
            />
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => { window.location.hash = '' }}
              className="text-xs text-gray-500 font-medium py-1.5 px-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Quitter
            </button>
            <button
              onClick={() => setShowToolsPanel(true)}
              className="text-xs text-gray-500 font-medium py-1.5 px-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Outils
            </button>
            <button
              onClick={() => setShowSubmitModal(true)}
              className="text-xs text-indigo-600 font-medium py-1.5 px-3 rounded-lg border border-indigo-200 hover:bg-indigo-50 transition-colors"
            >
              ✏️ Proposer
            </button>
          </div>
        </div>

        {/* Allocating banner */}
        {session.phase === 'allocating' && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
            <p>⏳ L'organisateur forme les groupes de débat à partir des votes de tout le monde. Tu peux encore voter, mais ton vote n'influencera plus la répartition des tables.</p>
            <p>
              Si l'écran ne bouge pas quand ton groupe est prêt,{' '}
              <button onClick={() => window.location.reload()} className="underline hover:text-amber-900">
                recharge la page
              </button>.
            </p>
          </div>
        )}

        {/* Progress */}
        <VoteProgress voted={votedCount} total={assertions.length} proposed={proposedCount} />

        {/* Vote area */}
        {allVoted ? (
          <div className="flex-1 overflow-auto pb-6">
            {/* Header compact */}
            <div className="text-center py-5 px-6">
              <div className="text-4xl mb-2">🏆</div>
              <h2 className="text-lg font-bold text-gray-900">Tu as tout voté !</h2>
              {proposedCount > 0 && (
                <p className="text-xs text-indigo-600 mt-1">
                  ✏️ Tu as proposé {proposedCount} assertion{proposedCount > 1 ? 's' : ''}
                </p>
              )}
              <button
                onClick={() => setShowSubmitModal(true)}
                className="mt-3 py-2 px-5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
              >
                ✏️ Proposer une assertion
              </button>
            </div>

            {/* Nudge documentaire */}
            <div className="px-4 mb-4">
              <DocNudge session={session} memberPseudo={member.pseudo} />
            </div>

            {/* Résultats consensus / dissensus */}
            <div className="px-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Ce que vous avez voté
              </p>
              <VoteResultsSummary results={voteResults} loading={resultsLoading} />
            </div>

            {/* Liste des assertions votées + positions collectives */}
            <div className="px-4 mt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Tes votes ({assertions.length})
              </p>
              <div className="space-y-2">
                {assertions.map(a => {
                  const v = myVotes.get(a.id)
                  const icon = v?.vote === 'agree' ? '✅' : v?.vote === 'disagree' ? '❌' : '⏭'
                  const r = voteResults.find(x => x.id === a.id)
                  const total = r ? r.agree_count + r.disagree_count + r.pass_count : 0
                  return (
                    <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
                      <div className="flex items-start gap-3">
                        <span className="text-lg shrink-0">{icon}</span>
                        <p className="text-xs text-gray-700 leading-relaxed">{a.content}</p>
                      </div>
                      {r && total > 0 && (() => {
                        const agreePct    = Math.round((r.agree_count    / total) * 100)
                        const disagreePct = Math.round((r.disagree_count / total) * 100)
                        const passPct     = Math.round((r.pass_count     / total) * 100)
                        return (
                          <div className="space-y-1 pl-8">
                            <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100">
                              {agreePct    > 0 && <div className="bg-green-400" style={{ width: `${agreePct}%` }} />}
                              {disagreePct > 0 && <div className="bg-red-400"   style={{ width: `${disagreePct}%` }} />}
                              {passPct     > 0 && <div className="bg-gray-300"  style={{ width: `${passPct}%` }} />}
                            </div>
                            <p className="text-[10px] text-gray-400">
                              ✓ {r.agree_count} pour · ✗ {r.disagree_count} contre · → {r.pass_count} neutre
                            </p>
                          </div>
                        )
                      })()}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : assertions.length === 0 ? (
          <EmptyAssertions onPropose={() => setShowSubmitModal(true)} />
        ) : currentAssertion ? (
          <AssertionCard
            key={currentAssertion.id}
            assertion={currentAssertion}
            existingVote={myVotes.get(currentAssertion.id) ?? null}
            onVote={vote => handleVote(currentAssertion.id, vote)}
            index={safeIdx}
            total={unvotedAssertions.length}
          />
        ) : null}

        {/* Navigation dots — only unvoted */}
        {unvotedAssertions.length > 1 && !allVoted && (
          <div className="flex justify-center gap-1.5 pb-4 flex-wrap px-4">
            {unvotedAssertions.map((a, i) => (
              <button
                key={a.id}
                onClick={() => setAssertionIndex(i)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === safeIdx ? 'bg-indigo-600' : 'bg-gray-300'
                }`}
              />
            ))}
          </div>
        )}

        {/* Bouton "Voir toutes les assertions" */}
        {assertions.length > 0 && (
          <div className="flex justify-center pb-2">
            <button
              onClick={async () => {
                setAllResultsLoading(true)
                try {
                  const results = await getVoteResults(session.id)
                  setAllAssertionResults(results)
                } catch {
                  setAllAssertionResults([])
                } finally {
                  setAllResultsLoading(false)
                }
                setShowAllAssertions(true)
              }}
              className="text-xs text-indigo-500 hover:text-indigo-700 underline underline-offset-2"
            >
              📋 Voir toutes les assertions ({assertions.length})
            </button>
          </div>
        )}

        {/* Submit assertion modal */}
        {showSubmitModal && (
          <SubmitAssertionModal
            session={session}
            onClose={() => setShowSubmitModal(false)}
            onSubmitted={handleAssertionSubmitted}
          />
        )}

        {/* Modal intro vote */}
        {showVoteIntro && (
          <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4"
            onClick={() => setShowVoteIntro(false)}>
            <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}>
              <div className="bg-indigo-600 px-6 py-5 text-center">
                <p className="text-2xl mb-1">🗳️</p>
                <h2 className="text-lg font-bold text-white">Comment fonctionne le vote ?</h2>
              </div>
              <div className="px-6 py-5 space-y-4 text-sm text-gray-700">
                <div className="flex items-start gap-3">
                  <span className="text-xl shrink-0">👍</span>
                  <div>
                    <p className="font-semibold text-gray-900">Voter sur chaque assertion</p>
                    <p className="text-gray-500 text-xs mt-0.5">Pour chaque affirmation, indique si tu es d'accord, en désaccord, ou si tu préfères passer.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-xl shrink-0">✏️</span>
                  <div>
                    <p className="font-semibold text-gray-900">Proposer une assertion</p>
                    <p className="text-gray-500 text-xs mt-0.5">Le bouton <strong>Proposer</strong> en haut à droite te permet de soumettre ta propre affirmation.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-xl shrink-0">🔄</span>
                  <div>
                    <p className="font-semibold text-gray-900">Tu peux changer d'avis</p>
                    <p className="text-gray-500 text-xs mt-0.5">Reviens sur une assertion déjà votée en la retrouvant dans la liste des assertions.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-xl shrink-0">🔒</span>
                  <div>
                    <p className="font-semibold text-gray-900">Ton vote est anonyme</p>
                    <p className="text-gray-500 text-xs mt-0.5">Ni les autres participants ni les organisateurs ne peuvent voir comment tu as voté. Un lien technique existe dans notre base de données pour te permettre de voter, mais il n'est jamais consulté.</p>
                  </div>
                </div>
              </div>
              <div className="px-6 pb-6">
                <button
                  onClick={() => setShowVoteIntro(false)}
                  className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  Commencer →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal "Voir toutes les assertions" */}
        {showAllAssertions && (
          <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4"
            onClick={() => setShowAllAssertions(false)}>
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
                <h2 className="text-sm font-bold text-gray-900">Toutes les assertions ({assertions.length})</h2>
                <button
                  onClick={() => setShowAllAssertions(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
                  aria-label="Fermer"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
                {allResultsLoading ? (
                  <p className="text-sm text-gray-400 text-center py-4">Chargement…</p>
                ) : assertions.map(a => {
                  const myVote = myVotes.get(a.id)
                  const result = allAssertionResults.find(r => r.id === a.id)
                  const voteIcon = myVote?.vote === 'agree' ? '✅' : myVote?.vote === 'disagree' ? '❌' : myVote ? '⏭' : null
                  const unvotedIdx = unvotedAssertions.findIndex(u => u.id === a.id)
                  return (
                    <div key={a.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        {voteIcon
                          ? <span className="text-base shrink-0">{voteIcon}</span>
                          : (
                            <button
                              onClick={() => {
                                if (unvotedIdx >= 0) setAssertionIndex(unvotedIdx)
                                setShowAllAssertions(false)
                              }}
                              className="shrink-0 text-[10px] font-medium text-indigo-600 border border-indigo-200 rounded-full px-2 py-0.5 hover:bg-indigo-50 transition-colors"
                            >
                              Voter
                            </button>
                          )
                        }
                        <p className="text-sm text-gray-800 leading-snug flex-1">{a.content}</p>
                      </div>
                      {result && result.total_votes > 0 && (() => {
                        const total = result.total_votes
                        const agreePct    = Math.round((result.agree_count    / total) * 100)
                        const disagreePct = Math.round((result.disagree_count / total) * 100)
                        const passPct     = Math.round((result.pass_count     / total) * 100)
                        return (
                          <div className="space-y-1">
                            <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100">
                              {agreePct > 0    && <div className="bg-green-400" style={{ width: `${agreePct}%` }} />}
                              {disagreePct > 0 && <div className="bg-red-400"   style={{ width: `${disagreePct}%` }} />}
                              {passPct > 0     && <div className="bg-gray-300"  style={{ width: `${passPct}%` }} />}
                            </div>
                            <p className="text-[10px] text-gray-400">
                              ✓ {result.agree_count} · ✗ {result.disagree_count} · → {result.pass_count}
                            </p>
                          </div>
                        )
                      })()}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Panel Outils */}
        {showToolsPanel && (
          <VoteToolsPanel
            session={session}
            memberPseudo={member.pseudo}
            onClose={() => setShowToolsPanel(false)}
            onOpenNotes={() => setShowNotesModal(true)}
          />
        )}

        {/* Notes modal (ouvert depuis VoteToolsPanel) */}
        {showNotesModal && session && (
          <NotesModal sessionId={session.id} onClose={() => setShowNotesModal(false)} />
        )}

        {/* Nudge proposition toutes les 10 assertions */}
        {showProposalNudge && (
          <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4"
            onClick={() => setShowProposalNudge(false)}>
            <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}>
              <div className="px-6 pt-6 pb-2 text-center">
                <p className="text-3xl mb-2">✏️</p>
                <h2 className="text-base font-bold text-gray-900">Tu as voté sur {myVotes.size} assertions !</h2>
                <p className="text-sm text-gray-500 mt-1">Veux-tu en proposer une à ton tour ?</p>
              </div>
              <div className="px-6 pb-6 pt-4 flex flex-col gap-2">
                <button
                  onClick={() => { setShowProposalNudge(false); setShowSubmitModal(true) }}
                  className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  ✏️ Proposer une assertion
                </button>
                <button
                  onClick={() => setShowProposalNudge(false)}
                  className="w-full py-2.5 px-4 text-gray-500 text-sm hover:text-gray-700 transition-colors"
                >
                  Continuer à voter
                </button>
              </div>
            </div>
          </div>
        )}

        {showAppIntro && <AppIntroModal session={session} onClose={() => setShowAppIntro(false)} />}
      </div>
    )
  }

  return null
}

// ── Helper screens ────────────────────────────────────────────────────────────

// ── AppIntroModal ────────────────────────────────────────────────────────────
// Bref aperçu des phases de la séance, affiché une fois à la connexion (D5)

interface AppIntroModalProps {
  session: Session
  onClose: () => void
}

function AppIntroModal({ session, onClose }: AppIntroModalProps) {
  function handleClose() {
    localStorage.setItem(`ecclesia_app_intro_${session.id}`, '1')
    onClose()
  }

  const voteDuration = session.vote_timer_minutes
    ? `Les ${session.vote_timer_minutes} premières minutes sont dédiées au vote.`
    : "Prends le temps qu'il te faut pour voter sur les assertions."

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-[110] p-4"
      onClick={handleClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="bg-indigo-600 px-6 py-5 text-center">
          <p className="text-2xl mb-1">🧭</p>
          <h2 className="text-lg font-bold text-white">Comment se déroule la séance ?</h2>
          <p className="text-indigo-100 text-xs mt-1">{session.title}</p>
        </div>
        <div className="px-6 py-5 space-y-4 text-sm text-gray-700">
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">🗳️</span>
            <div>
              <p className="font-semibold text-gray-900">1. Vote</p>
              <p className="text-gray-500 text-xs mt-0.5">{voteDuration}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">🧩</span>
            <div>
              <p className="font-semibold text-gray-900">2. Répartition en groupes</p>
              <p className="text-gray-500 text-xs mt-0.5">L'app forme des groupes de débat variés à partir des votes de tout le monde.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">💬</span>
            <div>
              <p className="font-semibold text-gray-900">3. Débat</p>
              <p className="text-gray-500 text-xs mt-0.5">Tu rejoins ta table et débats avec ton groupe.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">📋</span>
            <div>
              <p className="font-semibold text-gray-900">4. Questionnaire</p>
              <p className="text-gray-500 text-xs mt-0.5">Un court retour sur la séance, à la fin.</p>
            </div>
          </div>
        </div>
        <div className="px-6 pb-6">
          <button
            onClick={handleClose}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Compris, c'est parti →
          </button>
        </div>
      </div>
    </div>
  )
}

function EmptyAssertions({ onPropose }: { onPropose: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center space-y-4">
      <div className="text-5xl">💭</div>
      <h2 className="text-lg font-bold text-gray-900">Aucune assertion pour l'instant</h2>
      <p className="text-sm text-gray-500">
        Les assertions apparaîtront ici dès qu'elles seront approuvées. Tu peux en proposer une !
      </p>
      <button
        onClick={onPropose}
        className="py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
      >
        ✏️ Proposer une assertion
      </button>
    </div>
  )
}

// ── VoteToolsPanel ────────────────────────────────────────────────────────────

const DOCS_PATH = '/Ecclesia-Animation-Moderateur/docs/'
const BASE_DOCS = 'https://ecclesia-cs.github.io/docs/'

function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.includes(DOCS_PATH)) {
    const filename = url.split(DOCS_PATH)[1] ?? ''
    return filename ? BASE_DOCS + filename : null
  }
  return url
}

interface VoteToolsPanelProps {
  session: Session
  memberPseudo: string
  onClose: () => void
  onOpenNotes: () => void
}

function VoteToolsPanel({ session, memberPseudo, onClose, onOpenNotes }: VoteToolsPanelProps) {

  const infoUrl    = normalizeUrl(session.doc_info_url)
  const summaryUrl = normalizeUrl(session.doc_summary_url)
  const collabUrl  = normalizeUrl(session.doc_collab_url)
  const hasCollab  = !!(session.join_code || collabUrl)
  const hasDocs    = !!(infoUrl || summaryUrl || hasCollab)

  function handleCollabClick() {
    onClose()
    sessionStorage.setItem('ecclesia_collab_return', `#vote/${session.join_code}`)
    if (session.join_code) {
      sessionStorage.setItem(`ecclesia_collab_pseudo_${session.join_code}`, memberPseudo)
      window.location.hash = `#collab/${session.join_code}`
    } else if (collabUrl) {
      window.open(collabUrl, '_blank', 'noopener,noreferrer')
    }
  }

  const subLinkClass = 'flex items-center gap-3 px-5 py-2.5 w-full text-left text-sm text-gray-600 hover:bg-gray-50 transition-colors'
  const linkClass    = 'flex items-center gap-3 px-5 py-3 w-full text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors'
  const ExternalIcon = () => (
    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline strokeLinecap="round" strokeLinejoin="round" points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" strokeLinecap="round" />
    </svg>
  )

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50"
        onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xs shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Outils</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
              aria-label="Fermer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Documentation */}
          <div className="pt-3 pb-1 px-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Documentation</p>
          </div>
          {hasDocs ? (
            <>
              {infoUrl && (
                <a href={infoUrl} target="_blank" rel="noopener noreferrer" className={subLinkClass} onClick={onClose}>
                  <ExternalIcon />
                  Fiche information
                </a>
              )}
              {summaryUrl && (
                <a href={summaryUrl} target="_blank" rel="noopener noreferrer" className={subLinkClass} onClick={onClose}>
                  <ExternalIcon />
                  Résumé fiche information
                </a>
              )}
              {hasCollab && (
                <button onClick={handleCollabClick} className={subLinkClass}>
                  <ExternalIcon />
                  Sources collaboratives
                </button>
              )}
            </>
          ) : (
            <p className="px-5 py-3 text-sm text-gray-400 italic">
              Aucune documentation disponible pour cette séance.
            </p>
          )}

          <div className="mt-2 border-t border-gray-100" />

          {/* Notes */}
          <button
            onClick={() => { onClose(); onOpenNotes() }}
            className={linkClass}
          >
            <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Mes notes
          </button>

          <div className="pb-2" />
        </div>
      </div>

    </>
  )
}

// ── DocNudge ──────────────────────────────────────────────────────────────────

interface DocNudgeProps {
  session: Session
  memberPseudo: string
}

function DocNudge({ session, memberPseudo }: DocNudgeProps) {
  const infoUrl    = normalizeUrl(session.doc_info_url)
  const summaryUrl = normalizeUrl(session.doc_summary_url)
  const collabUrl  = normalizeUrl(session.doc_collab_url)
  const hasDocs    = !!(infoUrl || summaryUrl || collabUrl || session.join_code)

  function handleCollabClick() {
    sessionStorage.setItem('ecclesia_collab_return', `#vote/${session.join_code}`)
    if (session.join_code) {
      sessionStorage.setItem(`ecclesia_collab_pseudo_${session.join_code}`, memberPseudo)
      window.location.hash = `#collab/${session.join_code}`
    } else if (collabUrl) {
      window.open(collabUrl, '_blank', 'noopener,noreferrer')
    }
  }

  const linkClass = 'flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors'

  return (
    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
      <p className="text-xs font-semibold text-indigo-700 mb-2">📄 Profites-en pour lire la documentation</p>
      {hasDocs ? (
        <div className="space-y-1.5">
          {infoUrl && (
            <a href={infoUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline strokeLinecap="round" strokeLinejoin="round" points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" strokeLinecap="round" />
              </svg>
              Fiche information
            </a>
          )}
          {summaryUrl && (
            <a href={summaryUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline strokeLinecap="round" strokeLinejoin="round" points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" strokeLinecap="round" />
              </svg>
              Résumé fiche information
            </a>
          )}
          {(collabUrl || session.join_code) && (
            <button onClick={handleCollabClick} className={linkClass}>
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline strokeLinecap="round" strokeLinejoin="round" points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" strokeLinecap="round" />
              </svg>
              Sources collaboratives
            </button>
          )}
        </div>
      ) : (
        <p className="text-xs text-indigo-400 italic">
          Aucune fiche d'information n'est disponible pour cette séance.
        </p>
      )}
    </div>
  )
}

// ── VotingEntryForm ───────────────────────────────────────────────────────────
// Formulaire unique pour la phase voting : pseudo OU code, en un seul écran.
// Si le pseudo est déjà pris → reclaim automatique sans étape supplémentaire.

interface VotingEntryFormProps {
  session: Session
  onNewMember:  (member: SessionMember) => void  // nouveau membre → onboarding
  onConfirmed:  (member: SessionMember) => void  // reclaim → vérif onboarding → vote
}

function VotingEntryForm({ session, onNewMember, onConfirmed }: VotingEntryFormProps) {
  const [tab,          setTab]          = useState<'pseudo' | 'code'>('pseudo')
  const [input,        setInput]        = useState(() => lastNameStore.get())
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [reclaimDone,  setReclaimDone]  = useState<SessionMember | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const val = input.trim()
    if (!val) return
    setError(null)
    setLoading(true)
    try {
      if (tab === 'code') {
        // Reclaim par code
        const member = await confirmAttendance(session.id, undefined, val)
        setReclaimDone(member)
      } else {
        // Pseudo : d'abord tenter l'inscription normale
        try {
          const member = await registerSessionMember(session.id, val)
          lastNameStore.set(val)
          onNewMember(member)
        } catch (regErr: unknown) {
          const msg = regErr instanceof Error ? regErr.message : ''
          if (msg.includes('Pseudo déjà pris')) {
            // Reclaim automatique par pseudo — pas de deuxième écran
            const member = await confirmAttendance(session.id, val)
            setReclaimDone(member)
          } else {
            throw regErr
          }
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue')
    } finally {
      setLoading(false)
    }
  }

  // Écran de succès du reclaim — s'affiche 1,5s avant de continuer
  if (reclaimDone) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-5">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100">
            <span className="text-3xl">✅</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Bienvenue {reclaimDone.pseudo} !</h1>
            <p className="mt-2 text-sm text-gray-500">Tes votes ont bien été récupérés.</p>
          </div>
          <button
            onClick={() => onConfirmed(reclaimDone)}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Continuer →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-100 mb-4">
            <span className="text-2xl">🏛️</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Vote présentiel</h1>
          <p className="mt-1 text-sm text-gray-500">{session.title}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Onglets pseudo / code */}
          <div className="flex rounded-xl border border-gray-200 overflow-hidden">
            {(['pseudo', 'code'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => { setTab(t); setInput(''); setError(null) }}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  tab === t ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                {t === 'pseudo' ? 'Mon nom' : 'Mon code de rappel'}
              </button>
            ))}
          </div>

          {tab === 'pseudo' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom Prénom
              </label>
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ex : Marie Dupont"
                maxLength={40}
                required
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-400 mt-1.5">
                Retiens bien ce que tu inscris ici. Tu avais voté à distance ? Entre le même nom et prénom pour récupérer tes votes.
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Code de rappel (4 chiffres)
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={input}
                onChange={e => setInput(e.target.value.replace(/\D/g, ''))}
                placeholder="_ _ _ _"
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm font-mono text-center tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-400 mt-1.5">
                Le code à 4 chiffres affiché lors de ton inscription au vote à distance.
              </p>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-xl transition-colors"
          >
            {loading ? 'Connexion…' : 'Continuer →'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── ReclaimCodeDisplay ────────────────────────────────────────────────────────

interface ReclaimCodeDisplayProps {
  pseudo: string
  code: string
  onContinue: () => void
}

function ReclaimCodeDisplay({ pseudo, code, onContinue }: ReclaimCodeDisplayProps) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard?.writeText(`Pseudo : ${pseudo} | Code : ${code}`).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-100">
          <span className="text-2xl">🔑</span>
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Note ton code de rappel</h1>
          <p className="mt-2 text-sm text-gray-500">
            Si tu viens au débat et changes d'appareil, entre ton nom et prénom <strong>ou</strong> ce code pour retrouver tes votes.
            <br />
            <span className="text-amber-600 font-medium">📸 Fais un screen de cet écran !</span>
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Nom Prénom</p>
            <p className="text-lg font-bold text-gray-900">{pseudo}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Code de rappel</p>
            <p className="text-4xl font-mono font-bold tracking-widest text-amber-600">{code}</p>
          </div>
          <button
            onClick={handleCopy}
            className="w-full py-2 text-sm text-indigo-600 border border-indigo-200 rounded-xl hover:bg-indigo-50 transition-colors"
          >
            {copied ? '✓ Copié !' : 'Copier pseudo + code'}
          </button>
        </div>

        <p className="text-xs text-gray-400">
          Il suffit de l'un ou de l'autre pour retrouver tes votes.
        </p>

        <button
          onClick={onContinue}
          className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
        >
          Continuer vers le vote →
        </button>
      </div>
    </div>
  )
}

// ── AttendanceConfirmScreen ───────────────────────────────────────────────────

interface AttendanceConfirmScreenProps {
  session: Session
  pseudo: string
  mode: 'known_user' | 'reclaim'
  onConfirmed: (member: SessionMember) => void
  onSwitchToReclaim: () => void
  onChangePseudo: () => void
}

function AttendanceConfirmScreen({
  session,
  pseudo,
  mode,
  onConfirmed,
  onSwitchToReclaim,
  onChangePseudo,
}: AttendanceConfirmScreenProps) {
  const [reclaimTab, setReclaimTab] = useState<'pseudo' | 'code'>('pseudo')
  const [reclaimInput, setReclaimInput] = useState(() => lastNameStore.get())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleKnownUserConfirm() {
    setError(null)
    setLoading(true)
    try {
      // L'identité est connue par user_id — pas besoin de pseudo ni code
      const member = await confirmAttendance(session.id)
      onConfirmed(member)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue')
    } finally {
      setLoading(false)
    }
  }

  async function handleReclaimConfirm() {
    const val = reclaimInput.trim()
    if (!val) return
    setError(null)
    setLoading(true)
    try {
      const member = reclaimTab === 'code'
        ? await confirmAttendance(session.id, undefined, val)
        : await confirmAttendance(session.id, val)
      if (reclaimTab === 'pseudo') lastNameStore.set(val)
      onConfirmed(member)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue')
    } finally {
      setLoading(false)
    }
  }

  const header = (
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-100 mb-4">
        <span className="text-2xl">🏛️</span>
      </div>
      <h1 className="text-xl font-bold text-gray-900">Vote présentiel</h1>
      <p className="mt-1 text-sm text-gray-500">{session.title}</p>
    </div>
  )

  // ── Mode known_user : identité connue sur cet appareil ───────────
  if (mode === 'known_user') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          {header}

          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3 text-center">
            <p className="text-sm text-gray-500">Tu avais voté à distance sous le nom</p>
            <p className="text-xl font-bold text-gray-900">{pseudo}</p>
            <p className="text-sm text-gray-600 font-medium">Es-tu présent(e) au débat aujourd'hui ?</p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
          )}

          <div className="space-y-2">
            <button
              onClick={handleKnownUserConfirm}
              disabled={loading}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-xl transition-colors"
            >
              {loading ? 'Confirmation…' : '✓ Oui, je suis présent(e)'}
            </button>
            <button
              onClick={onSwitchToReclaim}
              className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Ce n'est pas moi / utiliser un autre compte
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Mode reclaim : nouvel appareil, pseudo ou code ────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        {header}

        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-sm text-indigo-800 text-center">
          Retrouve ton profil pré-vote avec <strong>ton nom et prénom</strong> ou <strong>ton code de rappel</strong> — l'un ou l'autre suffit.
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          {/* Onglets pseudo / code */}
          <div className="flex rounded-xl border border-gray-200 overflow-hidden">
            {(['pseudo', 'code'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => { setReclaimTab(tab); setReclaimInput(tab === 'pseudo' ? lastNameStore.get() : '') }}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  reclaimTab === tab
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                {tab === 'pseudo' ? 'Mon nom' : 'Mon code de rappel'}
              </button>
            ))}
          </div>

          {reclaimTab === 'pseudo' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom Prénom pré-vote</label>
              <input
                type="text"
                value={reclaimInput}
                onChange={e => setReclaimInput(e.target.value)}
                placeholder="Ton nom et prénom…"
                maxLength={40}
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code de rappel (4 chiffres)</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={reclaimInput}
                onChange={e => setReclaimInput(e.target.value.replace(/\D/g, ''))}
                placeholder="_ _ _ _"
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm font-mono text-center tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
          )}
        </div>

        <div className="space-y-2">
          <button
            onClick={handleReclaimConfirm}
            disabled={loading || !reclaimInput.trim()}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-xl transition-colors"
          >
            {loading ? 'Recherche…' : 'Retrouver mes votes →'}
          </button>
          <button
            onClick={onChangePseudo}
            className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Je n'ai ni l'un ni l'autre — créer un nouveau profil
          </button>
        </div>
      </div>
    </div>
  )
}
