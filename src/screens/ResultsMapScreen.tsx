// =============================================================
// ResultsMapScreen — Carte d'opinion post-séance (vue participant)
// Affichée uniquement quand la session est 'closed' et qu'une
// analyse PCA+k-means existe. Données 100 % anonymisées.
// =============================================================

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { loadResultsMap } from '../lib/analysis'
import type { ResultsMapData } from '../lib/analysis'
import type { Session } from '../lib/types'

// ── Constantes ────────────────────────────────────────────────
const GROUP_COLORS = ['#2563EB', '#DC2626', '#059669', '#D97706', '#7C3AED']
const PAD = 24
const W   = 300
const H   = 220

function groupColor(groupId: number): string {
  return GROUP_COLORS[groupId % GROUP_COLORS.length] ?? '#6B7280'
}

// ── Props ─────────────────────────────────────────────────────
interface ResultsMapScreenProps {
  session:  Session
  memberId: string
}

// ── Scatter SVG ───────────────────────────────────────────────
function ScatterSVG({ data }: { data: ResultsMapData }) {
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

  // Compte par groupe pour la légende
  const groupCounts: Record<number, number> = {}
  for (const p of points) {
    groupCounts[p.group_id] = (groupCounts[p.group_id] ?? 0) + 1
  }
  const groups = Array.from({ length: k_chosen }, (_, i) => i)

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-sm mx-auto block"
        aria-label="Carte des opinions"
      >
        {/* Autres participants */}
        {others.map((p, i) => (
          <circle
            key={i}
            cx={cx(p.pca_x)}
            cy={cy(p.pca_y)}
            r={5}
            fill={groupColor(p.group_id)}
            opacity={0.6}
          />
        ))}
        {/* Mon point — rendu en dernier pour être au-dessus */}
        {self && (
          <circle
            cx={cx(self.pca_x)}
            cy={cy(self.pca_y)}
            r={9}
            fill={groupColor(self.group_id)}
            stroke="white"
            strokeWidth={2.5}
            opacity={1}
          />
        )}
      </svg>

      {/* Légende */}
      <div className="flex flex-wrap gap-3 mt-3 justify-center">
        {groups.map(g => (
          <div key={g} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span
              className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
              style={{ backgroundColor: groupColor(g) }}
            />
            Groupe {g + 1}
            <span className="text-gray-400">({groupCounts[g] ?? 0})</span>
          </div>
        ))}
      </div>

      {self && (
        <p className="text-center text-xs text-gray-400 mt-2">
          ● Grand point = votre position
        </p>
      )}
    </div>
  )
}

// ── Composant principal ───────────────────────────────────────
export default function ResultsMapScreen({ session, memberId }: ResultsMapScreenProps) {
  const [data,    setData]    = useState<ResultsMapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    loadResultsMap(supabase, session.id, memberId)
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [session.id, memberId])

  const consensus = data?.consensus ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-gray-900">Votre position dans le débat</h1>
          <p className="text-sm text-gray-500 mt-1">{session.title}</p>
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

        {!loading && !error && data && (
          <>
            {/* Scatter */}
            <section className="bg-white rounded-2xl border border-gray-200 px-5 py-5">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Carte des opinions
              </h2>
              <p className="text-xs text-gray-400 mb-4">
                Chaque point représente un participant. Les couleurs indiquent les camps d'opinion détectés.
              </p>
              <ScatterSVG data={data} />
            </section>

            {/* Consensus */}
            <section className="bg-white rounded-2xl border border-gray-200 px-5 py-5">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Points de consensus
              </h2>
              {consensus.length === 0 ? (
                <p className="text-sm text-gray-400">Aucun point de consensus identifié.</p>
              ) : (
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
              )}
            </section>
          </>
        )}

        {/* Footer */}
        <p className="text-center text-sm text-gray-400 pb-4">
          Merci pour votre participation à cette séance Ecclesia.
        </p>
      </div>
    </div>
  )
}
