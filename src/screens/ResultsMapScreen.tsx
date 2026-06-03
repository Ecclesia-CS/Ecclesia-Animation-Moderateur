// =============================================================
// ResultsMapScreen — Carte d'opinion post-séance (vue participant)
// =============================================================

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { loadResultsMap } from '../lib/analysis'
import { getMyTableAssignment, getVoteResults } from '../lib/voting'
import type { ResultsMapData } from '../lib/analysis'
import type { Session, GroupNameResult, VoteResult } from '../lib/types'
import type { AssignmentWithJoinCode } from '../lib/voting'

// ── Constantes ────────────────────────────────────────────────
const GROUP_COLORS = ['#2563EB', '#DC2626', '#059669', '#D97706', '#7C3AED']

function groupColor(groupId: number): string {
  return GROUP_COLORS[groupId % GROUP_COLORS.length] ?? '#6B7280'
}

const PAD = 24
const W   = 300
const H   = 220

// ── Props ─────────────────────────────────────────────────────
interface ResultsMapScreenProps {
  session:  Session
  memberId: string
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
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-sm mx-auto block" aria-label="Carte des opinions">
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

      {/* Légende — couleur du groupe réelle, mise en évidence pour le groupe du participant */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3 justify-center">
        {groups.map(g => {
          const gn     = groupNames.find(n => n.table_number === g + 1)
          const isSelf = g === selfGroupId
          const color  = groupColor(g)
          return (
            <div
              key={g}
              className="flex items-start gap-1.5 text-xs rounded-lg px-2 py-1"
              style={isSelf ? { backgroundColor: color + '18', outline: `1px solid ${color}60` } : {}}
            >
              <span
                className="inline-block w-3 h-3 rounded-sm flex-shrink-0 mt-0.5"
                style={{ backgroundColor: color }}
              />
              <div>
                <span
                  className={isSelf ? 'font-semibold' : 'font-medium text-gray-700'}
                  style={isSelf ? { color } : {}}
                >
                  {gn?.name ?? `Groupe ${g + 1}`}
                </span>
                <span className="text-gray-400 ml-1">({groupCounts[g] ?? 0})</span>
                {gn?.description && (
                  <p className="text-gray-400 italic leading-tight mt-0.5">{gn.description}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {self && (
        <p className="text-center text-xs text-gray-400 mt-2">● Grand point = votre position</p>
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
      className="flex-shrink-0 mt-0.5 text-xs font-mono px-1.5 py-0.5 rounded"
      style={{ backgroundColor: color + '20', color }}
    >
      {score.toFixed(1)}
    </span>
  )
}

// ── Légende score repness ─────────────────────────────────────
function RepnessLegend() {
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2.5 mb-3">
      <p className="text-xs font-semibold text-gray-500 mb-0.5">Explication du score</p>
      <p className="text-xs text-gray-400">
        Le score sur 5 mesure à quel point votre groupe se distingue des autres sur cette affirmation :
        différence d'accord moyen × nombre de votants dans le groupe. Plus il est élevé, plus l'assertion est caractéristique.
      </p>
    </div>
  )
}

// ── Composant principal ───────────────────────────────────────
export default function ResultsMapScreen({ session, memberId }: ResultsMapScreenProps) {
  const [data,        setData]        = useState<ResultsMapData | null>(null)
  const [assignment,  setAssignment]  = useState<AssignmentWithJoinCode | null | undefined>(undefined)
  const [voteResults, setVoteResults] = useState<VoteResult[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)

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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">

        <div>
          <h1 className="text-xl font-bold text-gray-900">Votre position dans le débat</h1>
          <p className="text-sm text-gray-500 mt-1">{session.title}</p>
          <button
            onClick={() => { window.location.hash = '' }}
            className="mt-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            ← Retour au menu
          </button>
        </div>

        {loading && (
          <div className="flex justify-center py-12">
            <svg className="w-6 h-6 animate-spin text-indigo-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && (
          <>
            {/* ── Carte de groupe personnelle ───────────────────── */}
            {assignment != null && (
              <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div
                  className="px-6 py-5 text-center"
                  style={{ backgroundColor: selfGroupId !== null ? groupColor(selfGroupId) : '#4338ca' }}
                >
                  <p className="text-sm font-medium mb-1 opacity-80" style={{ color: 'white' }}>Votre groupe</p>
                  <p className="text-white text-5xl font-black tracking-tight">
                    Table {assignment.table_number}
                  </p>
                </div>
                {groupName ? (
                  <div className="px-6 py-4 text-center space-y-0.5">
                    <p
                      className="text-sm font-semibold"
                      style={{ color: selfGroupId !== null ? groupColor(selfGroupId) : '#4338ca' }}
                    >
                      {groupName.name}
                    </p>
                    <p className="text-xs text-gray-500">{groupName.description}</p>
                  </div>
                ) : (
                  <div className="px-6 py-4 text-center">
                    <p className="text-xs text-gray-400">L'organisateur n'a pas encore nommé les groupes.</p>
                  </div>
                )}
              </section>
            )}

            {/* ── Ce qui caractérise votre groupe ──────────────── */}
            {myGroupTop.length > 0 && selfGroupId !== null && (
              <section className="bg-white rounded-2xl border border-gray-200 px-5 py-5">
                <h2 className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: groupColor(selfGroupId) }}>
                  Ce qui vous caractérise
                </h2>
                <p className="text-xs text-gray-400 mb-3">
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

            {/* ── Pas d'analyse PCA ────────────────────────────── */}
            {!error && !data && (
              <div className="bg-white rounded-2xl border border-gray-200 px-5 py-8 text-center">
                <p className="text-sm text-gray-500">La carte des opinions n'est pas encore disponible.</p>
                <p className="text-xs text-gray-400 mt-1">Revenez plus tard — l'organisateur publie les résultats après analyse.</p>
              </div>
            )}

            {!error && data && (
              <>
                {/* ── Scatter avec légende nommée ──────────────── */}
                <section className="bg-white rounded-2xl border border-gray-200 px-5 py-5">
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Carte des opinions</h2>
                  <p className="text-xs text-gray-400 mb-4">
                    Chaque point représente un participant. Les couleurs indiquent les camps d'opinion détectés.
                  </p>
                  <ScatterSVG data={data} selfGroupId={selfGroupId} groupNames={allGroupNames} />
                </section>

                {/* ── Les autres camps ─────────────────────────── */}
                {otherGroupTops.length > 0 && (
                  <section className="bg-white rounded-2xl border border-gray-200 px-5 py-5">
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                      Les autres camps
                    </h2>
                    <p className="text-xs text-gray-400 mb-3">
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
                              <p className="text-xs text-gray-400 mb-1.5">{gn.description}</p>
                            )}
                            {items.length === 0 ? (
                              <p className="text-xs text-gray-400">Aucune assertion disponible.</p>
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
                  <section className="bg-white rounded-2xl border border-gray-200 px-5 py-5">
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Points de consensus</h2>
                    <p className="text-xs text-gray-400 mb-3">
                      Ces affirmations ont recueilli un large accord parmi tous les participants.
                    </p>
                    <ul className="space-y-2">
                      {consensus.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="flex-shrink-0 mt-0.5 text-xs font-mono px-1.5 py-0.5 rounded bg-green-50 text-green-700">
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
                  <section className="bg-white rounded-2xl border border-gray-200 px-5 py-5">
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Points de clivage</h2>
                    <p className="text-xs text-gray-400 mb-4">
                      Ces affirmations ont divisé les camps — les groupes ne s'accordaient pas.
                    </p>
                    <ul className="space-y-4">
                      {clivantes.map((item, i) => (
                        <li key={i}>
                          <p className="text-sm text-gray-700 mb-1.5">{item.content}</p>
                          <div className="flex flex-wrap gap-2">
                            {item.scores.map(s => {
                              const gn = allGroupNames.find(n => n.table_number === s.groupId + 1)
                              return (
                                <div key={s.groupId} className="flex items-center gap-1.5 text-xs">
                                  <span className="inline-block w-2 h-2 rounded-sm flex-shrink-0"
                                    style={{ backgroundColor: groupColor(s.groupId) }} />
                                  <span className="text-gray-500">
                                    {gn?.name ?? `Gr. ${s.groupId + 1}`}
                                  </span>
                                  <div className="flex items-center gap-0.5">
                                    <div className="h-2 rounded-sm min-w-[4px]"
                                      style={{
                                        backgroundColor: groupColor(s.groupId),
                                        width:           `${Math.round(Math.max(s.score, 0) * 32)}px`,
                                        opacity:         0.75,
                                      }} />
                                    <span className="text-gray-400 font-mono">{s.score.toFixed(1)}</span>
                                  </div>
                                </div>
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
              <section className="bg-white rounded-2xl border border-gray-200 px-5 py-5">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Points de dissensus</h2>
                <p className="text-xs text-gray-400 mb-3">Ces affirmations ont divisé les participants.</p>
                <ul className="space-y-2">
                  {dissensusFromVotes.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="flex-shrink-0 mt-0.5 text-xs font-mono px-1.5 py-0.5 rounded bg-red-50 text-red-700">
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

        <p className="text-center text-sm text-gray-400 pb-4">
          Merci pour votre participation à cette séance Ecclesia.
        </p>
      </div>
    </div>
  )
}
