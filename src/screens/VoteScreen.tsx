import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { castVote, getVoteResults } from '../lib/voting'
import type { Assertion, AssertionVote, EntryResponse, Session, SessionMember, VoteResult } from '../lib/types'
import VoteResultsSummary from '../components/voting/VoteResultsSummary'
import PseudoForm from '../components/voting/PseudoForm'
import OnboardingForm from '../components/voting/OnboardingForm'
import AssertionCard from '../components/voting/AssertionCard'
import VoteProgress from '../components/voting/VoteProgress'
import SubmitAssertionModal from '../components/voting/SubmitAssertionModal'
import VoteTimerBadge from '../components/voting/VoteTimerBadge'
import AllocatingScreen from './AllocatingScreen'
import SessionQuestionnaireForm from '../components/voting/SessionQuestionnaireForm'

interface VoteScreenProps {
  sessionJoinCode: string
}

type Step = 'loading' | 'error' | 'pseudo' | 'onboarding' | 'waiting' | 'vote' | 'allocating' | 'questionnaire' | 'closed' | 'ended'

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
  const [showSubmitModal,    setShowSubmitModal]    = useState(false)
  const [proposedCount,      setProposedCount]      = useState(0)
  const [showVoteIntro,      setShowVoteIntro]      = useState(false)
  const [showAllAssertions,  setShowAllAssertions]  = useState(false)
  const [allAssertionResults, setAllAssertionResults] = useState<VoteResult[]>([])
  const [allResultsLoading,  setAllResultsLoading]  = useState(false)

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

      // 3. Check if already a member
      const { data: existingMember } = await supabase
        .from('session_members')
        .select('*')
        .eq('session_id', s.id)
        .eq('user_id', authSession.user.id)
        .maybeSingle()

      if (!existingMember) {
        // Can't join if the vote phase is already over
        if (s.phase !== 'draft' && s.phase !== 'voting' && s.phase !== 'allocating') {
          setErrorMsg('Le vote est terminé, tu ne peux plus rejoindre cette séance.')
          setStep('ended')
          return
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
          if (updated.phase === 'voting' || updated.phase === 'allocating') {
            loadVoteData(updated, m)
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
          } else if (updated.phase !== 'voting' && updated.phase !== 'allocating') {
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
        .select('*')
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

  if (step === 'questionnaire' && session) {
    return (
      <SessionQuestionnaireForm
        sessionId={session.id}
        onDone={() => setStep('ended')}
      />
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

        {/* Allocating banner */}
        {session.phase === 'allocating' && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
            ⏳ Le classement des groupes est en cours. Tu peux encore voter, mais ton vote n'influencera plus la répartition des tables.
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
      </div>
    )
  }

  return null
}

// ── Helper screens ────────────────────────────────────────────────────────────

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
