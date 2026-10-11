// =============================================================
// PostVoteScreen — Chantier 69 : revoter après le débat
// =============================================================
// Atteint depuis ResultsMapScreen ("↻ Revoter"). Trois actions, dans l'ordre
// demandé par Jules : 1) revoter sur ses propres assertions, 2) proposer une
// nouvelle assertion, 3) voter sur les assertions jamais vues. Aucune des
// trois n'est obligatoire — un participant qui revient directement en
// arrière (onBack) n'a rien à valider.
//
// La modération d'une assertion proposée ici suit exactement le même circuit
// qu'en vote/prévote — SubmitAssertionModal est réutilisé tel quel, sans
// branche postvote.
//
// Revoter ne perd pas l'ancien vote : cast_vote fait bien un UPSERT sur
// (assertion_id, member_id) — `assertion_votes` ne garde que le vote COURANT —
// mais copie d'abord l'ancienne valeur dans `assertion_vote_history`, avec la
// phase et l'heure du changement (chantier 70). Le vote d'avant-débat est la
// valeur du plus ancien écrasement fait en 'post_voting' ou 'closed' ; un vote
// posé pour la première fois ici n'a pas d'« avant » (`first_cast_phase`).
// Côté superadmin, `get_vote_changes_admin` (chantier 167) en tire le nombre de
// personnes qui ont changé d'avis, et l'écran « Comparaison avant / après
// débat » compare deux analyses par camps.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { privateChannel } from '../lib/realtime'
import { castVote, getMyAssertionIds, canProposeAssertion } from '../lib/voting'
import { extractErr } from '../lib/utils'
import type { Assertion, AssertionVote, Session } from '../lib/types'
import AssertionCard from '../components/voting/AssertionCard'
import SubmitAssertionModal from '../components/voting/SubmitAssertionModal'
import VoteProgress from '../components/voting/VoteProgress'
import PageParcours, { BOUTON_VERRE_PARCOURS, CARTE_PARCOURS, ChargementParcours, ErreurParcours } from '../components/PageParcours'
import EnTeteFenetre from '../components/EnTeteFenetre'

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
    const channel = privateChannel(`postvote:${session.id}:${memberId}`)
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
  // Chantier 153 — verrou, « voter d'abord » et plafond par personne (lib/voting.ts).
  const canPropose = canProposeAssertion(session, {
    unvotedCount: unvotedAssertions.length,
    proposedCount: myAssertionIds.length,
  })

  return (
    <PageParcours
      session={session}
      sousTitre="Revoter : le débat a peut-être fait bouger tes positions."
      sansMenu
      actions={<button onClick={onBack} className={BOUTON_VERRE_PARCOURS}>Retour aux résultats</button>}
    >
      <div className="space-y-5">
        {loading && <ChargementParcours />}

        {error && <ErreurParcours>{error}</ErreurParcours>}

        {!loading && !error && (
          <>
            {/* ── 1. Revoter sur ses propres assertions ─────────── */}
            <section className={CARTE_PARCOURS}>
              <h2 className="font-sans text-[11px] font-bold text-bleu-fonce/70 uppercase tracking-[0.16em] mb-1">
                1 · Tes assertions
              </h2>
              <p className="text-xs text-gray-600 mb-3">
                Ton avis a-t-il changé sur ce que tu as toi-même proposé&nbsp;?
              </p>
              {myOwnAssertions.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Aucune de tes assertions n'a été approuvée dans cette séance.
                </p>
              ) : (
                <ul className="divide-y divide-bleu-fonce/10">
                  {myOwnAssertions.map(a => {
                    const v = myVotes.get(a.id)
                    const icon = v?.vote === 'agree' ? '✅' : v?.vote === 'disagree' ? '❌' : v ? '⏭️' : null
                    return (
                      <li key={a.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                        <p className="text-sm text-gray-800 leading-snug flex-1">{a.content}</p>
                        <button
                          onClick={() => setRevoteAssertion(a)}
                          className="rounded-[8px] shrink-0 inline-flex h-8 items-center gap-1.5 border border-bleu-fonce/20 px-2.5 text-xs font-semibold text-bleu-fonce hover:border-bleu-fonce/40 hover:bg-bleu-fonce/[0.04] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
                        >
                          {icon && <span className="text-sm leading-none" aria-hidden="true">{icon}</span>}
                          <span>{icon ? 'Changer' : 'Voter'}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {/* ── 2. Proposer une nouvelle assertion ─────────────── */}
            {canPropose && (
            <section className={CARTE_PARCOURS}>
              <h2 className="font-sans text-[11px] font-bold text-bleu-fonce/70 uppercase tracking-[0.16em] mb-1">
                2 · Proposer une nouvelle assertion
              </h2>
              <p className="text-xs text-gray-600 mb-3">
                Une idée t'est venue pendant le débat ? Elle suit le même circuit de modération
                que pendant le vote.
              </p>
              <button
                onClick={() => setShowSubmitModal(true)}
                className="w-full rounded-[8px] py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2"
              >
                ✏️ Proposer une assertion
              </button>
              {proposedJustNow > 0 && (
                <p className="text-xs text-gray-500 mt-2">
                  {proposedJustNow} assertion{proposedJustNow > 1 ? 's' : ''} proposée
                  {proposedJustNow > 1 ? 's' : ''} depuis cet écran.
                </p>
              )}
            </section>
            )}

            {/* ── 3. Voter sur les assertions non vues ───────────── */}
            <section className="space-y-3">
              <div className={CARTE_PARCOURS}>
                <h2 className="font-sans text-[11px] font-bold text-bleu-fonce/70 uppercase tracking-[0.16em] mb-1">
                  {canPropose ? '3' : '2'} · Assertions non vues
                </h2>
                <p className="text-xs text-gray-600">
                  D'autres participants ont peut-être proposé de nouvelles idées depuis ton dernier vote.
                </p>
                {unvotedAssertions.length === 0 && (
                  <p className="text-sm font-semibold text-bleu-fonce mt-3">
                    Tu as déjà voté sur toutes les assertions disponibles.
                  </p>
                )}
              </div>
              {unvotedAssertions.length > 0 && currentUnvoted && (
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
              )}
            </section>
          </>
        )}
      </div>

      {/* Modal "Changer mon vote" — même pattern que VoteScreen (D16) */}
      {revoteAssertion && (
        <div
          className="fixed inset-0 bg-bleu-fonce/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center z-50 p-4"
          onClick={() => setRevoteAssertion(null)}
        >
          <div
            className="bg-creme w-full max-w-sm max-h-[90vh] shadow-2xl flex flex-col overflow-hidden rounded-[12px] ring-1 ring-white/10 animate-entree"
            onClick={e => e.stopPropagation()}
          >
            <EnTeteFenetre titre="Changer mon vote" onClose={() => setRevoteAssertion(null)} />
            <div className="overflow-y-auto bg-creme px-4 pb-4">
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
        </div>
      )}

      {showSubmitModal && (
        <SubmitAssertionModal
          session={session}
          onClose={() => { setShowSubmitModal(false); load() }}
          onSubmitted={() => setProposedJustNow(c => c + 1)}
        />
      )}
    </PageParcours>
  )
}
