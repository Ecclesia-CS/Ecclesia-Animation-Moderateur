import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { castVote } from '../lib/voting'
import type { Assertion, AssertionVote, EntryResponse, Session, SessionMember } from '../lib/types'
import PseudoForm from '../components/voting/PseudoForm'
import OnboardingForm from '../components/voting/OnboardingForm'
import AssertionCard from '../components/voting/AssertionCard'
import VoteProgress from '../components/voting/VoteProgress'
import SubmitAssertionModal from '../components/voting/SubmitAssertionModal'
import VoteTimerBadge from '../components/voting/VoteTimerBadge'
import AllocatingScreen from './AllocatingScreen'

interface VoteScreenProps {
  sessionJoinCode: string
}

type Step = 'loading' | 'error' | 'pseudo' | 'onboarding' | 'waiting' | 'vote' | 'allocating' | 'ended'

/** Fisher-Yates shuffle — immutable */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function VoteScreen({ sessionJoinCode }: VoteScreenProps) {
  const [step, setStep] = useState<Step>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  const [session, setSession] = useState<Session | null>(null)
  const [member, setMember] = useState<SessionMember | null>(null)

  // Vote step state
  const [assertions, setAssertions] = useState<Assertion[]>([]) // shuffled order
  const [myVotes, setMyVotes] = useState<Map<string, AssertionVote>>(new Map())
  const [assertionIndex, setAssertionIndex] = useState(0)
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [proposedCount, setProposedCount] = useState(0)

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

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

      // 2. Fetch session by join_code (must not be closed)
      const { data: sess, error: sessErr } = await supabase
        .from('sessions')
        .select('*')
        .eq('join_code', sessionJoinCode)
        .neq('phase', 'closed')
        .maybeSingle()

      if (sessErr || !sess) {
        setErrorMsg('Séance introuvable ou déjà fermée.')
        setStep('error')
        return
      }
      const s = sess as Session
      setSession(s)

      // 3. Check if already a member
      const { data: existingMember } = await supabase
        .from('session_members')
        .select('*')
        .eq('session_id', s.id)
        .eq('user_id', authSession.user.id)
        .maybeSingle()

      if (!existingMember) {
        setStep('pseudo')
        return
      }
      const m = existingMember as SessionMember
      setMember(m)

      // 3b. If session is past voting phase, go directly to allocating screen
      if (s.phase === 'allocating' || s.phase === 'debating') {
        setStep('allocating')
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
        setStep('onboarding')
        return
      }

      // 5. If session is in draft, show waiting screen
      if (s.phase === 'draft') {
        setStep('waiting')
        subscribeForWaiting(s, m)
        return
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
          if (updated.phase === 'voting') {
            loadVoteData(updated, m)
          } else if (updated.phase === 'allocating' || updated.phase === 'debating') {
            setStep('allocating')
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
        .select('*')
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
          if (updated.phase === 'allocating' || updated.phase === 'debating') {
            setStep('allocating')
          } else if (updated.phase === 'draft') {
            // Admin reverted to draft — go back to waiting
            setStep('waiting')
            subscribeForWaiting(updated, m)
          } else if (updated.phase !== 'voting') {
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
  function handlePseudoSuccess(m: SessionMember) {
    setMember(m)
    setStep('onboarding')
  }

  function handleOnboardingSuccess(_response: EntryResponse) {
    if (!session || !member) return
    if (session.phase === 'draft') {
      setStep('waiting')
      subscribeForWaiting(session, member)
    } else {
      loadVoteData(session, member)
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
    return <AllocatingScreen session={session} member={member} />
  }

  if (step === 'ended') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">🎉</div>
          <h1 className="text-xl font-bold text-gray-900">Phase de vote terminée</h1>
          <p className="text-sm text-gray-500">
            Merci pour ta participation ! Les résultats vont être analysés pour former les groupes de débat.
          </p>
          <p className="text-xs text-gray-400">Attends les instructions de l'organisateur.</p>
        </div>
      </div>
    )
  }

  if (step === 'waiting' && session && member) {
    return (
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
        </div>
      </div>
    )
  }

  if (step === 'pseudo' && session) {
    return <PseudoForm session={session} onSuccess={handlePseudoSuccess} />
  }

  if (step === 'onboarding' && session && member) {
    return (
      <OnboardingForm sessionId={session.id} member={member} onSuccess={handleOnboardingSuccess} />
    )
  }

  if (step === 'vote' && session && member) {
    const votedCount = myVotes.size
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
          <button
            onClick={() => setShowSubmitModal(true)}
            className="text-xs text-indigo-600 font-medium py-1.5 px-3 rounded-lg border border-indigo-200 hover:bg-indigo-50 transition-colors"
          >
            ✏️ Proposer
          </button>
        </div>

        {/* Progress */}
        <VoteProgress voted={votedCount} total={assertions.length} proposed={proposedCount} />

        {/* Vote area */}
        {allVoted ? (
          <AllVotedMessage
            proposedCount={proposedCount}
            onPropose={() => setShowSubmitModal(true)}
          />
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

        {/* Submit assertion modal */}
        {showSubmitModal && (
          <SubmitAssertionModal
            session={session}
            onClose={() => setShowSubmitModal(false)}
            onSubmitted={handleAssertionSubmitted}
          />
        )}
      </div>
    )
  }

  return null
}

// ── Helper screens ────────────────────────────────────────────────────────────

function AllVotedMessage({
  proposedCount,
  onPropose,
}: {
  proposedCount: number
  onPropose: () => void
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center space-y-4">
      <div className="text-5xl">🏆</div>
      <h2 className="text-xl font-bold text-gray-900">Tu as tout voté !</h2>
      <p className="text-sm text-gray-500">
        Tu peux proposer de nouvelles assertions ou attendre la suite de la séance.
      </p>
      {proposedCount > 0 && (
        <p className="text-xs text-indigo-600">
          ✏️ Tu as proposé {proposedCount} assertion{proposedCount > 1 ? 's' : ''}
        </p>
      )}
      <button
        onClick={onPropose}
        className="py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
      >
        ✏️ Proposer une assertion
      </button>
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
