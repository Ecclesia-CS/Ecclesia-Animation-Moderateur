// =============================================================
// PostVoteScreen — Chantier 69 : revoter après le débat
// =============================================================
// Atteint depuis ResultsMapScreen ("↻ Revoter"). Trois actions, dans l'ordre
// demandé par Jules : 1) revoter sur ses propres assertions, 2) proposer une
// nouvelle assertion, 3) voter sur les assertions jamais vues. Aucune des
// trois n'est obligatoire — un participant qui revient directement en
// arrière (onBack) n'a rien à valider.
//
// castVote/submitAssertion n'ont aucun garde de phase côté serveur (vérifié
// dans 20260528_voting_app.sql) : voter et proposer après la clôture
// fonctionne déjà sans changement SQL. La modération d'une assertion
// proposée ici suit exactement le même circuit qu'en vote/prévote —
// SubmitAssertionModal est réutilisé tel quel, sans branche postvote.
//
// ⚠️ cast_vote fait un UPSERT (ON CONFLICT DO UPDATE) sur (assertion_id,
// member_id) : revoter ÉCRASE le vote initial, sans trace de l'ancienne
// valeur ni d'horodatage de la modification. La comparaison avant/après
// débat n'est donc pas mesurable en base avec le schéma actuel — signalé à
// Jules, pas corrigé ici (décision produit).
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { castVote, getMyAssertionIds } from '../lib/voting'
import { extractErr } from '../lib/utils'
import type { Assertion, AssertionVote, Session } from '../lib/types'
import AssertionCard from '../components/voting/AssertionCard'
import SubmitAssertionModal from '../components/voting/SubmitAssertionModal'
import VoteProgress from '../components/voting/VoteProgress'

interface PostVoteScreenProps {
  session: Session
  memberId: string
  onBack: () => void
}

/** Fisher-Yates shuffle — immutable (même logique que VoteScreen). */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <svg className="w-6 h-6 animate-spin text-indigo-400" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  )
}

export default function PostVoteScreen({ session, memberId, onBack }: PostVoteScreenProps) {
  const [assertions, setAssertions] = useState<Assertion[]>([])
  const [myVotes, setMyVotes] = useState<Map<string, AssertionVote>>(new Map())
  const [myAssertionIds, setMyAssertionIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [revoteAssertion, setRevoteAssertion] = useState<Assertion | null>(null)
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [proposedJustNow, setProposedJustNow] = useState(0)

  async function load() {
    setError(null)
    try {
      const [assertionsRes, votesRes, ids] = await Promise.all([
        supabase
          .from('assertions')
          .select('id, session_id, content, status, created_at') // pas member_id (E2 — anonymat des auteurs)
          .eq('session_id', session.id)
          .eq('status', 'approved'),
        supabase
          .from('assertion_votes')
          .select('*')
          .eq('member_id', memberId),
        getMyAssertionIds(session.id).catch(() => [] as string[]),
      ])
      if (assertionsRes.error) throw new Error(extractErr(assertionsRes.error))
      if (votesRes.error) throw new Error(extractErr(votesRes.error))

      setAssertions(shuffle((assertionsRes.data ?? []) as Assertion[]))
      const voteMap = new Map<string, AssertionVote>()
      for (const v of (votesRes.data ?? []) as AssertionVote[]) voteMap.set(v.assertion_id, v)
      setMyVotes(voteMap)
      setMyAssertionIds(ids)
    } catch (e) {
      setError(extractErr(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, memberId])

  // Realtime — une assertion proposée pendant la consultation de cet écran
  // (par ce participant ou un autre) peut passer pending → approved sans
  // rechargement de page ; sans ça, la section 3 resterait figée sur
  // l'instantané du chargement initial.
  useEffect(() => {
    const channel = supabase
      .channel(`postvote:${session.id}:${memberId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'assertions', filter: `session_id=eq.${session.id}` },
        payload => {
          const a = payload.new as Assertion
          if (a.status !== 'approved') return
          setAssertions(prev =>
            prev.some(x => x.id === a.id) ? prev.map(x => (x.id === a.id ? a : x)) : [...prev, a]
          )
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [session.id, memberId])

  async function handleVote(assertionId: string, vote: 'agree' | 'disagree' | 'pass') {
    const voteRow = await castVote(assertionId, vote)
    setMyVotes(prev => {
      const next = new Map(prev)
      next.set(assertionId, voteRow)
      return next
    })
  }

  const myOwnAssertions = useMemo(
    () => assertions.filter(a => myAssertionIds.includes(a.id)),
    [assertions, myAssertionIds],
  )
  const unvotedAssertions = useMemo(
    () => assertions.filter(a => !myVotes.has(a.id)),
    [assertions, myVotes],
  )
  // Un vote fait sortir l'assertion de cette liste (myVotes.has devient vrai) —
  // la suivante glisse automatiquement en position 0, pas besoin d'index à avancer.
  const currentUnvoted = unvotedAssertions[0] ?? null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Revoter</h1>
          <p className="text-sm text-gray-500 mt-1">{session.title}</p>
          <p className="text-sm text-gray-400 mt-2">
            Le débat a peut-être fait bouger tes positions — c'est le moment de le vérifier.
          </p>
          <button
            onClick={onBack}
            className="mt-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            ← Retour aux résultats
          </button>
        </div>

        {loading && <Spinner />}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* ── 1. Revoter sur ses propres assertions ─────────── */}
            <section className="bg-white rounded-2xl border border-gray-200 px-5 py-5">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                1 · Tes assertions
              </h2>
              <p className="text-xs text-gray-400 mb-3">
                Ton avis a-t-il changé sur ce que tu as toi-même proposé ?
              </p>
              {myOwnAssertions.length === 0 ? (
                <p className="text-sm text-gray-400">
                  Aucune de tes assertions n'a été approuvée dans cette séance.
                </p>
              ) : (
                <ul className="space-y-2">
                  {myOwnAssertions.map(a => {
                    const v = myVotes.get(a.id)
                    const icon = v?.vote === 'agree' ? '✅' : v?.vote === 'disagree' ? '❌' : v ? '⏭' : null
                    return (
                      <li key={a.id} className="flex items-start gap-2">
                        <button
                          onClick={() => setRevoteAssertion(a)}
                          className="shrink-0 flex items-center gap-1 text-[10px] font-medium text-indigo-600 border border-indigo-200 rounded-full pl-1.5 pr-2 py-0.5 hover:bg-indigo-50 transition-colors mt-0.5"
                        >
                          {icon && <span className="text-sm leading-none">{icon}</span>}
                          <span>{icon ? 'Changer' : 'Voter'}</span>
                        </button>
                        <p className="text-sm text-gray-800 leading-snug flex-1">{a.content}</p>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {/* ── 2. Proposer une nouvelle assertion ─────────────── */}
            <section className="bg-white rounded-2xl border border-gray-200 px-5 py-5">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                2 · Proposer une nouvelle assertion
              </h2>
              <p className="text-xs text-gray-400 mb-3">
                Une idée t'est venue pendant le débat ? Elle suit le même circuit de modération
                que pendant le vote.
              </p>
              <button
                onClick={() => setShowSubmitModal(true)}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
              >
                ✏️ Proposer une assertion
              </button>
              {proposedJustNow > 0 && (
                <p className="text-xs text-gray-400 mt-2">
                  {proposedJustNow} assertion{proposedJustNow > 1 ? 's' : ''} proposée
                  {proposedJustNow > 1 ? 's' : ''} depuis cet écran.
                </p>
              )}
            </section>

            {/* ── 3. Voter sur les assertions non vues ───────────── */}
            <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-5 pt-5 pb-1">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  3 · Assertions non vues
                </h2>
                <p className="text-xs text-gray-400">
                  D'autres participants ont peut-être proposé de nouvelles idées depuis ton dernier vote.
                </p>
              </div>
              {unvotedAssertions.length === 0 ? (
                <p className="text-sm text-gray-400 px-5 pb-5 pt-2">
                  Tu as déjà voté sur toutes les assertions disponibles.
                </p>
              ) : currentUnvoted ? (
                <>
                  <VoteProgress
                    voted={assertions.length - unvotedAssertions.length}
                    total={assertions.length}
                    proposed={0}
                  />
                  <AssertionCard
                    key={currentUnvoted.id}
                    assertion={currentUnvoted}
                    existingVote={null}
                    onVote={vote => handleVote(currentUnvoted.id, vote)}
                    index={0}
                    total={unvotedAssertions.length}
                  />
                </>
              ) : null}
            </section>
          </>
        )}
      </div>

      {/* Modal "Changer mon vote" — même pattern que VoteScreen (D16) */}
      {revoteAssertion && (
        <div
          className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4"
          onClick={() => setRevoteAssertion(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm shadow-2xl flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-1 flex-shrink-0">
              <h2 className="text-sm font-bold text-gray-900">Changer mon vote</h2>
              <button
                onClick={() => setRevoteAssertion(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
                aria-label="Fermer"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <AssertionCard
              assertion={revoteAssertion}
              existingVote={myVotes.get(revoteAssertion.id) ?? null}
              onVote={async vote => {
                await handleVote(revoteAssertion.id, vote)
                setRevoteAssertion(null)
              }}
              index={0}
              total={1}
            />
          </div>
        </div>
      )}

      {showSubmitModal && (
        <SubmitAssertionModal
          session={session}
          onClose={() => { setShowSubmitModal(false); load() }}
          onSubmitted={() => setProposedJustNow(c => c + 1)}
        />
      )}
    </div>
  )
}
