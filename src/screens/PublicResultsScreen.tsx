// =============================================================
// PublicResultsScreen — Résultats publics post-séance
// Affiché aux visiteurs d'une session closed qui ne sont pas
// identifiés comme membres inscrits (pas de scatter PCA).
// Données : groupes + top assertions clivantes + consensus.
// =============================================================

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { loadPublicResults } from '../lib/analysis'
import type { PublicResultsData } from '../lib/analysis'
import type { Session } from '../lib/types'

// ── Constantes ────────────────────────────────────────────────
const GROUP_COLORS = ['#2563EB', '#DC2626', '#059669', '#D97706', '#7C3AED']

function groupColor(groupId: number): string {
  return GROUP_COLORS[groupId % GROUP_COLORS.length] ?? '#6B7280'
}

// ── Props ─────────────────────────────────────────────────────
interface PublicResultsScreenProps {
  session: Session
}

// ── Composant principal ───────────────────────────────────────
export default function PublicResultsScreen({ session }: PublicResultsScreenProps) {
  const [data,    setData]    = useState<PublicResultsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    loadPublicResults(supabase, session.id)
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [session.id])

  const consensus = data?.consensus ?? []
  const groups    = data?.groups    ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-gray-900">Résultats de la séance</h1>
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

        {!loading && !error && !data && (
          <div className="bg-white rounded-2xl border border-gray-200 px-5 py-8 text-center">
            <p className="text-sm text-gray-500">
              Les résultats de cette séance ne sont pas encore disponibles.
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Revenez plus tard — l'organisateur publie les résultats après analyse.
            </p>
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* Camps d'opinion */}
            <section className="bg-white rounded-2xl border border-gray-200 px-5 py-5">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Camps d'opinion détectés
              </h2>
              <p className="text-xs text-gray-400 mb-4">
                {data.k_chosen} camp{data.k_chosen > 1 ? 's' : ''} identifié{data.k_chosen > 1 ? 's' : ''} parmi les participants.
                Voici les assertions qui caractérisent chaque camp.
              </p>

              <div className="space-y-5">
                {groups.map(group => (
                  <div key={group.group_id}>
                    <p
                      className="text-xs font-semibold mb-2"
                      style={{ color: groupColor(group.group_id) }}
                    >
                      Camp {group.group_id + 1}
                    </p>
                    {!group.top_assertions || group.top_assertions.length === 0 ? (
                      <p className="text-xs text-gray-400">Aucune assertion caractéristique.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {group.top_assertions.map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                            <span
                              className="flex-shrink-0 mt-0.5 text-xs font-mono px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: groupColor(group.group_id) + '20',
                                color: groupColor(group.group_id),
                              }}
                            >
                              {item.score.toFixed(1)}
                            </span>
                            <span>{item.content}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
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
