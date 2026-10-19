// =============================================================
// ResultsMapScreen — Carte d'opinion post-séance (vue participant)
// =============================================================

import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { loadResultsMap } from '../lib/analysis'
import { getMyTableAssignment, getVoteResults, proposalsMentionable } from '../lib/voting'
import type { ResultsMapData } from '../lib/analysis'
import type { Session, GroupNameResult, VoteResult } from '../lib/types'
import type { AssignmentWithJoinCode } from '../lib/voting'
import PostVoteScreen from './PostVoteScreen'
import VoteResultsSummary from '../components/voting/VoteResultsSummary'
import { effectiveTablePhase, isConsentPoll, sessionTypeOf, tableDebateEnded } from '../lib/phaseLabels'
import TableDebateEndedPanel from '../components/voting/TableDebateEndedPanel'
import ConsentResultsScreen from './ConsentResultsScreen'
import PageParcours, { BOUTON_VERRE_PARCOURS, CARTE_PARCOURS, ChargementParcours, ErreurParcours } from '../components/PageParcours'
import FondQuadrille from '../components/FondQuadrille'

// ── Constantes ────────────────────────────────────────────────
const GROUP_COLORS = ['#2b4a86', '#b04a3c', '#3f8462', '#c8742a', '#6b4c8a']

function groupColor(groupId: number): string {
  return GROUP_COLORS[groupId % GROUP_COLORS.length] ?? '#6d6f71'
}

const PAD = 24
const W   = 300
const H   = 220

// ── Props ─────────────────────────────────────────────────────
interface ResultsMapScreenProps {
  session:  Session
  memberId: string
  /** Chantier 134 — ouvert depuis le vote d'un sondage : « Retour au vote » au lieu du menu. */
  onBack?: () => void
}

// ── Scatter SVG ───────────────────────────────────────────────
function ScatterSVG({
  data,
  selfGroupId,
  groupNames,
}: {
  data: ResultsMapData
  selfGroupId: number | null
  groupNames: GroupNameResult[]
}) {
  const { points, k_chosen } = data
  if (points.length === 0) return null

  const xs = points.map(p => p.pca_x)
  const ys = points.map(p => p.pca_y)
  const xMin = Math.min(...xs); const xMax = Math.max(...xs)
  const yMin = Math.min(...ys); const yMax = Math.max(...ys)
  const xRange = xMax - xMin || 1
  const yRange = yMax - yMin || 1
  const cx = (x: number) => PAD + ((x - xMin) / xRange) * (W - 2 * PAD)
  const cy = (y: number) => H - PAD - ((y - yMin) / yRange) * (H - 2 * PAD)

  const others = points.filter(p => !p.is_self)
  const self   = points.find(p => p.is_self)

  const groupCounts: Record<number, number> = {}
  for (const p of points) {
    groupCounts[p.group_id] = (groupCounts[p.group_id] ?? 0) + 1
  }
  const groups = Array.from({ length: k_chosen }, (_, i) => i)

  return (
    <div>
      <div className="relative overflow-hidden rounded-[8px] bg-creme ring-1 ring-bleu-fonce/10">
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full text-bleu-fonce/[0.07]">
        <defs>
          <pattern id="quadrillage-carte" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M28 0H0V28" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#quadrillage-carte)" />
      </svg>
      <svg viewBox={`0 0 ${W} ${H}`} className="relative w-full max-w-sm mx-auto block" aria-label="Carte des opinions">
        {others.map((p, i) => (
          <circle key={i} cx={cx(p.pca_x)} cy={cy(p.pca_y)} r={5}
            fill={groupColor(p.group_id)} opacity={0.6} />
        ))}
        {self && (
          <>
            <circle cx={cx(self.pca_x)} cy={cy(self.pca_y)} r={9}
              fill={groupColor(self.group_id)} stroke="white" strokeWidth={2.5} opacity={1} />
            <text
              x={cx(self.pca_x) + 13}
              y={cy(self.pca_y) + 4}
              fontSize={11}
              fontWeight="700"
              fill={groupColor(self.group_id)}
            >
              Vous
            </text>
          </>
        )}
      </svg>
      </div>

      {/* Légende — couleur du groupe réelle, mise en évidence pour le groupe du participant */}
      <div className="mt-4 grid gap-1">
        {groups.map(g => {
          const gn     = groupNames.find(n => n.table_number === g + 1)
          const isSelf = g === selfGroupId
          const color  = groupColor(g)
          return (
            <div
              key={g}
              className="rounded-[6px] flex items-start gap-2 text-xs px-2.5 py-1.5"
              style={isSelf ? { backgroundColor: color + '18', outline: `1px solid ${color}60` } : {}}
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 mt-[3px]"
                style={{ backgroundColor: color }}
              />
              <div>
                <span
                  className={isSelf ? 'font-semibold' : 'font-medium text-gray-700'}
                  style={isSelf ? { color } : {}}
                >
                  {gn?.name ?? `Groupe ${g + 1}`}
                </span>
                <span className="text-gray-500 ml-1">({groupCounts[g] ?? 0})</span>
                {gn?.description && (
                  <p className="text-gray-500 italic leading-tight mt-0.5">{gn.description}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {self && (
        <p className="text-center text-xs text-gray-600 mt-3">Le grand point cerclé de blanc, c'est vous.</p>
      )}
    </div>
  )
}

// ── Helpers repness ───────────────────────────────────────────

function topForGroup(
  repness: Record<string, Record<string, number>>,
  allAssertions: Record<string, string>,
  groupId: number,
  n = 3,
): { content: string; score: number }[] {
  return Object.entries(repness)
    .map(([aid, scores]) => ({
      content: allAssertions[aid] ?? '',
      score:   scores[String(groupId)] ?? 0,
    }))
    .filter(x => x.content !== '' && x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
}

function topClivantes(
  repness: Record<string, Record<string, number>>,
  allAssertions: Record<string, string>,
  kChosen: number,
  n = 5,
): { content: string; spread: number; scores: { groupId: number; score: number }[] }[] {
  return Object.entries(repness)
    .map(([aid, scores]) => {
      const groupScores = Array.from({ length: kChosen }, (_, g) => ({
        groupId: g,
        score:   scores[String(g)] ?? 0,
      }))
      const vals   = groupScores.map(s => s.score)
      const spread = Math.max(...vals) - Math.min(...vals)
      return { content: allAssertions[aid] ?? '', spread, scores: groupScores }
    })
    .filter(x => x.content !== '' && x.spread > 0)
    .sort((a, b) => b.spread - a.spread)
    .slice(0, n)
}

// ── Badge de score repness ────────────────────────────────────
function RepnessBadge({ score, color }: { score: number; color: string }) {
  return (
    <span
      className="rounded-[6px] flex-shrink-0 mt-0.5 text-xs font-bold tabular-nums px-1.5 py-0.5"
      style={{ backgroundColor: color + '1f', color }}
    >
      {score.toFixed(1)}
    </span>
  )
}

// ── Légende score repness ─────────────────────────────────────
function RepnessLegend() {
  return (
    <div className="rounded-[8px] bg-gray-100 px-3 py-2.5 mb-3">
      <p className="text-xs font-semibold text-gray-700 mb-0.5">Explication du score</p>
      <p className="text-xs text-gray-600">
        Le score dit combien de fois plus souvent ce groupe est d'accord avec l'affirmation que le reste des participants.
        Seuls les écarts trop nets pour être dus au hasard sont retenus. Plus il est élevé, plus l'affirmation est caractéristique.
      </p>
    </div>
  )
}

// ── Composant principal ───────────────────────────────────────
// Chantier 160 — un sondage en vote par consentement n'a ni analyse ni camps :
// il a son propre écran de décomptes. Le reste (séance complète, sondage à camps)
// garde la carte d'opinion historique.
export default function ResultsMapScreen(props: ResultsMapScreenProps) {
  if (isConsentPoll(props.session)) {
    return <ConsentResultsScreen session={props.session} onBack={props.onBack} />
  }
  return <OpinionMapScreen {...props} />
}

function OpinionMapScreen({ session, memberId, onBack }: ResultsMapScreenProps) {
  const [data,        setData]        = useState<ResultsMapData | null>(null)
  const [assignment,  setAssignment]  = useState<AssignmentWithJoinCode | null | undefined>(undefined)
  const [voteResults, setVoteResults] = useState<VoteResult[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  // Chantier 69 — écran de revote, atteint depuis cette page uniquement.
  const [showPostVote, setShowPostVote] = useState(false)
  // Chantier 161 — débat de la table rouvert depuis l'ouverture de l'écran.
  const [tableReopened, setTableReopened] = useState(false)
  // Chantier 134 — sondage : aucune table, le camp se montre sans affectation.
  const isPoll = sessionTypeOf(session) === 'poll'

  useEffect(() => {
    async function load() {
      const [mapRes, assignRes, votesRes] = await Promise.allSettled([
        loadResultsMap(supabase, session.id, memberId),
        getMyTableAssignment(session.id),
        getVoteResults(session.id),
      ])
      if (mapRes.status === 'fulfilled') setData(mapRes.value)
      else setError(mapRes.reason instanceof Error ? mapRes.reason.message : String(mapRes.reason))
      if (assignRes.status === 'fulfilled') setAssignment(assignRes.value)
      else setAssignment(null)
      if (votesRes.status === 'fulfilled') setVoteResults(votesRes.value)
      setLoading(false)
    }
    load()
  }, [session.id, memberId])

  // Groupe du participant dans le scatter (0-indexé)
  const selfGroupId = data?.points?.find(p => p.is_self)?.group_id ?? null

  // Noms de tous les groupes (DB en priorité, localStorage fallback)
  const allGroupNames = useMemo((): GroupNameResult[] => {
    if (session.group_names && session.group_names.length > 0) return session.group_names
    try {
      return JSON.parse(localStorage.getItem(`group_names_${session.id}`) ?? '[]') as GroupNameResult[]
    } catch { return [] }
  }, [session.group_names, session.id])

  // Nom du groupe du participant — indexé par cluster k-means (selfGroupId + 1),
  // pas par table physique de débat (assignment.table_number)
  const groupName = useMemo((): GroupNameResult | null => {
    if (selfGroupId === null) return null
    return allGroupNames.find(g => g.table_number === selfGroupId + 1) ?? null
  }, [selfGroupId, allGroupNames])

  // Assertions caractéristiques du groupe du participant
  const myGroupTop = useMemo(() => {
    if (!data?.repness || !data.all_assertions || selfGroupId === null) return []
    return topForGroup(data.repness, data.all_assertions, selfGroupId, 3)
  }, [data, selfGroupId])

  // Assertions caractéristiques des autres groupes
  const otherGroupTops = useMemo(() => {
    if (!data?.repness || !data.all_assertions) return []
    const k = data.k_chosen
    return Array.from({ length: k }, (_, g) => ({
      groupId: g,
      items:   topForGroup(data.repness!, data.all_assertions!, g, 3),
    })).filter(g => g.groupId !== selfGroupId)
  }, [data, selfGroupId])

  // Points de clivage (repness-based si dispo, sinon fallback consensus_score)
  const clivantes = useMemo(() => {
    if (data?.repness && data.all_assertions) {
      return topClivantes(data.repness, data.all_assertions, data.k_chosen, 5)
    }
    return null
  }, [data])

  const dissensusFromVotes = useMemo(() => {
    if (clivantes !== null) return []
    return voteResults
      .filter(v => v.consensus_score !== null && v.consensus_score < 0.4)
      .sort((a, b) => (a.consensus_score ?? 0) - (b.consensus_score ?? 0))
      .slice(0, 5)
  }, [clivantes, voteResults])

  const consensus = data?.consensus ?? []

  // Chantier 161 — phase de la table du membre : post-vote dès que son
  // modérateur a terminé le débat, même si la séance débat encore.
  const ownTableEnded = tableDebateEnded(session, assignment ?? null)
  // Le débat de la table a repris pendant que cet écran était ouvert (polling
  // de TableDebateEndedPanel) : plus de revote, que le serveur refuserait.
  const phase = ownTableEnded && tableReopened
    ? 'debating'
    : effectiveTablePhase(session, assignment ?? null) ?? session.phase

  if (showPostVote) {
    return (
      <PostVoteScreen
        session={session}
        memberId={memberId}
        onBack={() => setShowPostVote(false)}
      />
    )
  }

  return (
    <PageParcours
      session={{ ...session, phase }}
      sousTitre={isPoll ? 'Votre position dans le sondage' : 'Votre position dans le débat'}
      sansMenu={!!onBack}
      actions={onBack && <button onClick={onBack} className={BOUTON_VERRE_PARCOURS}>Retour au vote</button>}
    >
      <div className="space-y-5">

        {/* Chantier 69 — le débat a peut-être fait bouger les positions : proposer de revoter.
            Chantier 89 — n'a de sens que pendant la phase 'post_voting' : une fois la séance
            passée en 'closed', le superadmin a fermé la fenêtre de revote.
            Chantier 161 — phase effective : aussi à une table qui a terminé avant les autres. */}
        {ownTableEnded && (
          <TableDebateEndedPanel session={session} tableId={assignment?.table_id ?? null} initiallyEnded onEndedChange={ended => setTableReopened(!ended)} />
        )}

        {phase === 'post_voting' && (
          <section className="relative overflow-hidden rounded-[12px] bg-bleu-fonce px-5 py-6 text-center shadow-[0_26px_54px_-26px_rgba(21,35,63,0.75)] animate-montee">
            <FondQuadrille cases={4} />
            <div className="relative space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-bleu-clair">Revote ouvert</p>
            <p className="font-sans text-xl font-bold leading-snug tracking-[-0.01em] text-creme">Le débat a peut-être changé ton avis.</p>
            <p className="text-creme/75 text-sm leading-relaxed">
              {proposalsMentionable(session)
                ? "Revote sur tes propres assertions, propose-en une nouvelle, ou découvre celles que tu n'as pas encore vues."
                : "Revote sur tes propres assertions, ou découvre celles que tu n'as pas encore vues."}
            </p>
            <button
              onClick={() => setShowPostVote(true)}
              className="mt-2 w-full rounded-[8px] py-3 px-4 bg-creme hover:bg-white text-bleu-fonce text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2 focus-visible:ring-offset-bleu-fonce"
            >
              Revoter
            </button>
            </div>
          </section>
        )}

        {loading && <ChargementParcours texte="Chargement des résultats…" />}

        {error && <ErreurParcours>{error}</ErreurParcours>}

        {!loading && (
          <>
            {/* Chantier 161 — analyse figée tant que d'autres tables débattent :
                ces camps sont ceux d'avant le débat. */}
            {ownTableEnded && selfGroupId !== null && (
              <p className="rounded-[8px] bg-gray-100 px-3 py-2 text-xs text-gray-700 text-center">
                Camps calculés avant le débat : ils pourront être recalculés à la fin de la séance.
              </p>
            )}
            {/* ── Carte de groupe personnelle ─────────────────────
                N'affiche la carte que si le participant appartient réellement à un camp
                d'opinion (selfGroupId !== null, càd ≥1 vote pris en compte par l'analyse PCA).
                Un membre présent mais n'ayant pas voté a bien un table_assignments (assignment
                != null, table physique de débat) mais aucun camp — ne pas afficher "pas encore
                nommé" dans ce cas, réservé à un camp qui existe mais n'a pas encore de nom. */}
            {(assignment != null || isPoll) && selfGroupId !== null && (
              <section className="overflow-hidden rounded-[12px] bg-white shadow-[0_26px_54px_-26px_rgba(21,35,63,0.6)] animate-montee">
                <div
                  className="relative overflow-hidden px-6 pt-6 pb-7 text-center"
                  style={{ backgroundColor: groupColor(selfGroupId) }}
                >
                  <FondQuadrille cases={4} />
                  <p className="relative text-[11px] font-bold uppercase tracking-[0.2em] text-white/80 mb-2">Votre groupe</p>
                  <p className="relative break-words font-sans text-white text-3xl font-bold leading-tight tracking-[-0.02em] sm:text-4xl">
                    {groupName ? groupName.name : 'Camp pas encore nommé'}
                  </p>
                </div>
                <div className="px-6 py-4 text-center">
                  <p className="text-sm leading-relaxed text-gray-600">
                    {groupName ? groupName.description : "L'organisateur n'a pas encore nommé les groupes."}
                  </p>
                </div>
              </section>
            )}

            {/* ── Ce qui caractérise votre groupe ──────────────── */}
            {myGroupTop.length > 0 && selfGroupId !== null && (
              <section className={CARTE_PARCOURS}>
                <h2 className="font-sans text-[11px] font-bold uppercase tracking-[0.16em] mb-1" style={{ color: groupColor(selfGroupId) }}>
                  Ce qui vous caractérise
                </h2>
                <p className="text-xs text-gray-500 mb-3">
                  Affirmations sur lesquelles votre groupe se distingue le plus des autres camps.
                </p>
                <RepnessLegend />
                <ul className="space-y-2">
                  {myGroupTop.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <RepnessBadge score={item.score} color={groupColor(selfGroupId)} />
                      <span>{item.content}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Chantier 134 — sondage : décompte des votes par assertion, à jour à
                chaque ouverture, indépendant de l'analyse (qui, elle, n'avance que
                quand l'organisateur la relance). */}
            {isPoll && <VoteResultsSummary results={voteResults} loading={false} />}

            {/* ── Pas d'analyse PCA ────────────────────────────── */}
            {!error && !data && (
              <div className="rounded-[12px] border border-bleu-fonce/10 bg-white px-5 py-8 text-center shadow-sm animate-montee">
                <p className="text-sm font-semibold text-bleu-fonce">La carte des opinions n'est pas encore disponible.</p>
                <p className="text-xs text-gray-600 mt-1">
                  {isPoll
                    ? "Les camps apparaissent dès que l'organisateur lance l'analyse des votes, et se mettent à jour à chaque nouvelle analyse."
                    : "Revenez plus tard : l'organisateur publie les résultats après analyse."}
                </p>
              </div>
            )}

            {!error && data && (
              <>
                {/* ── Scatter avec légende nommée ──────────────── */}
                <section className={CARTE_PARCOURS}>
                  <h2 className="font-sans text-[11px] font-bold text-bleu-fonce/70 uppercase tracking-[0.16em] mb-1">Carte des opinions</h2>
                  <p className="text-xs text-gray-500 mb-4">
                    Chaque point représente un participant. Les couleurs indiquent les camps d'opinion détectés.
                  </p>
                  <ScatterSVG data={data} selfGroupId={selfGroupId} groupNames={allGroupNames} />
                </section>

                {/* ── Les autres camps ─────────────────────────── */}
                {otherGroupTops.length > 0 && (
                  <section className={CARTE_PARCOURS}>
                    <h2 className="font-sans text-[11px] font-bold text-bleu-fonce/70 uppercase tracking-[0.16em] mb-1">
                      Les autres camps
                    </h2>
                    <p className="text-xs text-gray-500 mb-3">
                      Ce qui caractérise chacun des autres groupes de participants.
                    </p>
                    <RepnessLegend />
                    <div className="space-y-5">
                      {otherGroupTops.map(({ groupId, items }) => {
                        const gn    = allGroupNames.find(n => n.table_number === groupId + 1)
                        const color = groupColor(groupId)
                        return (
                          <div key={groupId}>
                            <p className="text-xs font-semibold mb-0.5" style={{ color }}>
                              {gn?.name ? `${gn.name} (Groupe ${groupId + 1})` : `Groupe ${groupId + 1}`}
                            </p>
                            {gn?.description && (
                              <p className="text-xs text-gray-500 mb-1.5">{gn.description}</p>
                            )}
                            {items.length === 0 ? (
                              <p className="text-xs text-gray-500">Aucune assertion disponible.</p>
                            ) : (
                              <ul className="space-y-1.5">
                                {items.map((item, i) => (
                                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                                    <RepnessBadge score={item.score} color={color} />
                                    <span>{item.content}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )}

                {/* ── Points de consensus global ────────────────── */}
                {consensus.length > 0 && (
                  <section className={CARTE_PARCOURS}>
                    <h2 className="font-sans text-[11px] font-bold text-bleu-fonce/70 uppercase tracking-[0.16em] mb-3">Points de consensus</h2>
                    <p className="text-xs text-gray-500 mb-3">
                      Ces affirmations ont recueilli un large accord parmi tous les participants.
                    </p>
                    <ul className="space-y-2">
                      {consensus.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="rounded-[6px] flex-shrink-0 mt-0.5 text-xs font-bold tabular-nums px-1.5 py-0.5 bg-green-50 text-green-700">
                            {item.score.toFixed(2)}
                          </span>
                          <span>{item.content}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* ── Points de clivage (repness spread) ───────── */}
                {clivantes !== null && clivantes.length > 0 && (
                  <section className={CARTE_PARCOURS}>
                    <h2 className="font-sans text-[11px] font-bold text-bleu-fonce/70 uppercase tracking-[0.16em] mb-3">Points de clivage</h2>
                    <p className="text-xs text-gray-500 mb-4">
                      Ces affirmations ont divisé les camps : les groupes ne s'accordaient pas.
                    </p>
                    <ul className="divide-y divide-bleu-fonce/10">
                      {clivantes.map((item, i) => (
                        <li key={i} className="py-3.5 first:pt-0 last:pb-0">
                          <p className="text-sm text-gray-800 mb-2">{item.content}</p>
                          <div className="grid grid-cols-[minmax(0,8rem)_1fr_2rem] items-center gap-x-2.5 gap-y-1.5 text-xs">
                            {item.scores.map(s => {
                              const gn = allGroupNames.find(n => n.table_number === s.groupId + 1)
                              return (
                                <Fragment key={s.groupId}>
                                  <span className="flex min-w-0 items-center gap-1.5 text-gray-600">
                                    <span className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: groupColor(s.groupId) }} />
                                    <span className="truncate">{gn?.name ?? `Groupe ${s.groupId + 1}`}</span>
                                  </span>
                                  <span className="h-2 bg-gray-100">
                                    <span className="block h-full"
                                      style={{
                                        backgroundColor: groupColor(s.groupId),
                                        width:           `${Math.min(100, Math.max(s.score, 0) / 5 * 100)}%`,
                                      }} />
                                  </span>
                                  <span className="text-right font-semibold tabular-nums text-gray-700">{s.score.toFixed(1)}</span>
                                </Fragment>
                              )
                            })}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}

            {/* ── Fallback dissensus sans PCA ──────────────────── */}
            {dissensusFromVotes.length > 0 && (
              <section className={CARTE_PARCOURS}>
                <h2 className="font-sans text-[11px] font-bold text-bleu-fonce/70 uppercase tracking-[0.16em] mb-3">Points de dissensus</h2>
                <p className="text-xs text-gray-500 mb-3">Ces affirmations ont divisé les participants.</p>
                <ul className="space-y-2">
                  {dissensusFromVotes.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="rounded-[6px] flex-shrink-0 mt-0.5 text-xs font-bold tabular-nums px-1.5 py-0.5 bg-red-50 text-red-700">
                        {item.consensus_score?.toFixed(2)}
                      </span>
                      <span>{item.content}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <p className="text-center text-sm text-gray-600 pt-2">
          Merci pour votre participation à cette séance Ecclesia.
        </p>
      </div>
    </PageParcours>
  )
}
