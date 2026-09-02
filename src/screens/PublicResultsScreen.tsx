// =============================================================
// PublicResultsScreen — Résultats publics post-séance
// Affiché aux visiteurs d'une session closed ET explicitement marquée
// "résultats publics" par le superadmin (sessions.results_public).
// Données : nuage de points anonyme (comme l'onglet Analyse du superadmin,
// sans aucun identifiant) + toutes les assertions avec leurs compteurs
// pour/contre/passe. Jamais de pseudo, de table, ni de découpage par table.
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

// ── Nuage de points anonyme (même représentation que l'onglet Analyse) ──
const PAD = 24
const W   = 320
const H   = 220

function PublicScatterPlot({
  points, kChosen, session,
}: {
  points: PublicResultsData['points']
  kChosen: number
  session: Session
}) {
  if (points.length === 0) return null

  const xs = points.map(p => p.pca_x)
  const ys = points.map(p => p.pca_y)
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  const xRange = xMax - xMin || 1
  const yRange = yMax - yMin || 1

  const cx = (x: number) => PAD + ((x - xMin) / xRange) * (W - 2 * PAD)
  const cy = (y: number) => H - PAD - ((y - yMin) / yRange) * (H - 2 * PAD)

  const groupCounts: Record<number, number> = {}
  for (const p of points) {
    groupCounts[p.group_id] = (groupCounts[p.group_id] ?? 0) + 1
  }
  const groups = Array.from({ length: kChosen }, (_, i) => i)

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-sm mx-auto block"
        aria-label="Placement idéologique des participants (anonyme)"
      >
        {points.map((p, i) => (
          <circle
            key={i}
            cx={cx(p.pca_x)}
            cy={cy(p.pca_y)}
            r={5}
            fill={groupColor(p.group_id)}
            opacity={0.8}
          />
        ))}
      </svg>
      <div className="flex flex-wrap gap-3 mt-2 justify-center">
        {groups.map(g => {
          const gn = session.group_names?.find(n => n.table_number === g + 1)
          return (
            <div key={g} className="flex items-start gap-1.5 text-xs text-gray-600">
              <span
                className="inline-block w-3 h-3 rounded-sm flex-shrink-0 mt-0.5"
                style={{ backgroundColor: groupColor(g) }}
              />
              <div>
                <span className={gn?.name ? 'font-medium' : ''}>
                  {gn?.name ?? `Camp ${g + 1}`}
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
    </div>
  )
}

// ── Liste des assertions avec compteurs pour/contre/passe ────────
function PublicAssertionRow({ assertion }: { assertion: PublicResultsData['assertions'][number] }) {
  const total = assertion.agree_count + assertion.disagree_count + assertion.pass_count
  const agreePct    = total > 0 ? (assertion.agree_count    / total) * 100 : 0
  const disagreePct = total > 0 ? (assertion.disagree_count / total) * 100 : 0
  const passPct     = total > 0 ? (assertion.pass_count     / total) * 100 : 0

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-800 leading-snug">{assertion.content}</p>
      <div className="flex rounded-full h-1.5 overflow-hidden bg-gray-100">
        {agreePct > 0 && <div className="bg-green-400 h-full" style={{ width: `${agreePct}%` }} />}
        {disagreePct > 0 && <div className="bg-red-400 h-full" style={{ width: `${disagreePct}%` }} />}
        {passPct > 0 && <div className="bg-gray-300 h-full" style={{ width: `${passPct}%` }} />}
      </div>
      <div className="flex gap-3 text-xs text-gray-400">
        <span className="text-green-600">✓ {assertion.agree_count}</span>
        <span className="text-red-500">✗ {assertion.disagree_count}</span>
        <span>⏭ {assertion.pass_count}</span>
      </div>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────
// `session` : déjà chargée par l'appelant (SessionRouterScreen, via join_code).
// `sessionId` : route directe #results/<id> (liste "Anciennes séances" de
// l'accueil) — le composant charge lui-même le titre de la séance.
interface PublicResultsScreenProps {
  session?: Session
  sessionId?: string
}

// ── Composant principal ───────────────────────────────────────
export default function PublicResultsScreen({ session: sessionProp, sessionId }: PublicResultsScreenProps) {
  const [session, setSession]         = useState<Session | null>(sessionProp ?? null)
  const [sessionErr, setSessionErr]   = useState<string | null>(null)
  const [data,    setData]    = useState<PublicResultsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  // Résolution de la séance quand seul l'id est fourni (route #results/<id>)
  useEffect(() => {
    if (sessionProp || !sessionId) return
    supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err || !data) {
          setSessionErr('Séance introuvable.')
          setLoading(false)
          return
        }
        setSession(data as Session)
      })
  }, [sessionProp, sessionId])

  useEffect(() => {
    if (!session) return
    loadPublicResults(supabase, session.id)
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [session?.id])

  const isLoading = loading || (!session && !sessionErr)
  const points     = data?.points     ?? []
  const assertions = data?.assertions ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-gray-900">Résultats de la séance</h1>
          {session && <p className="text-sm text-gray-500 mt-1">{session.title}</p>}
        </div>

        {isLoading && (
          <div className="flex justify-center py-12">
            <svg className="w-6 h-6 animate-spin text-indigo-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>
        )}

        {sessionErr && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700">
            {sessionErr}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!isLoading && !error && !sessionErr && !data && (
          <div className="bg-white rounded-2xl border border-gray-200 px-5 py-8 text-center">
            <p className="text-sm text-gray-500">
              Les résultats de cette séance ne sont pas disponibles publiquement.
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Revenez plus tard — l'organisateur publie les résultats après analyse.
            </p>
          </div>
        )}

        {!isLoading && !error && !sessionErr && data && session && (
          <>
            {/* Placement idéologique */}
            {points.length > 0 && (
              <section className="bg-white rounded-2xl border border-gray-200 px-5 py-5">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Placement idéologique des participants
                </h2>
                <p className="text-xs text-gray-400 mb-4">
                  Un point par participant, anonyme — aucune identité associée.
                </p>
                <PublicScatterPlot points={points} kChosen={data.k_chosen ?? 1} session={session} />
              </section>
            )}

            {/* Assertions et votes */}
            <section className="bg-white rounded-2xl border border-gray-200 px-5 py-5">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
                Assertions et votes
              </h2>
              {assertions.length === 0 ? (
                <p className="text-sm text-gray-400">Aucune assertion approuvée pour cette séance.</p>
              ) : (
                <div className="space-y-4">
                  {assertions.map((a, i) => (
                    <PublicAssertionRow key={i} assertion={a} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {/* Footer */}
        <div className="flex justify-center pb-2">
          <button
            onClick={() => { window.location.hash = '' }}
            className="inline-flex items-center gap-2 px-5 py-3 bg-gray-100 hover:bg-gray-200
              text-gray-700 text-sm font-semibold rounded-xl transition-colors"
          >
            ← Retour au menu
          </button>
        </div>
        <p className="text-center text-sm text-gray-400 pb-4">
          Merci pour votre participation à cette séance Ecclesia.
        </p>
      </div>
    </div>
  )
}
