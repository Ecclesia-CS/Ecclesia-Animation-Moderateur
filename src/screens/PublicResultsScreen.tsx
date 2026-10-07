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
import { getSessionById } from '../lib/sessions'
import type { PublicResultsData } from '../lib/analysis'
import type { Session } from '../lib/types'
import PageParcours, { CARTE_PARCOURS, ChargementParcours, ErreurParcours } from '../components/PageParcours'

// ── Constantes ────────────────────────────────────────────────
const GROUP_COLORS = ['#2b4a86', '#b04a3c', '#3f8462', '#c8742a', '#6b4c8a']

function groupColor(groupId: number): string {
  return GROUP_COLORS[groupId % GROUP_COLORS.length] ?? '#6d6f71'
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
      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3 justify-center">
        {groups.map(g => {
          const gn = session.group_names?.find(n => n.table_number === g + 1)
          return (
            <div key={g} className="flex items-start gap-1.5 text-xs text-gray-600">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 mt-[3px]"
                style={{ backgroundColor: groupColor(g) }}
              />
              <div>
                <span className={gn?.name ? 'font-medium' : ''}>
                  {gn?.name ?? `Camp ${g + 1}`}
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
    <div className="space-y-2 py-4 first:pt-0 last:pb-0">
      <p className="text-sm text-gray-800 leading-snug">{assertion.content}</p>
      <div className="flex h-2 overflow-hidden bg-gray-100">
        {agreePct > 0 && <div className="bg-green-400 h-full" style={{ width: `${agreePct}%` }} />}
        {disagreePct > 0 && <div className="bg-red-400 h-full" style={{ width: `${disagreePct}%` }} />}
        {passPct > 0 && <div className="bg-gray-300 h-full" style={{ width: `${passPct}%` }} />}
      </div>
      <div className="flex gap-4 text-xs font-semibold tabular-nums text-gray-600">
        <span className="text-green-700">✓ {assertion.agree_count} d'accord</span>
        <span className="text-red-700">✗ {assertion.disagree_count} pas d'accord</span>
        <span>{assertion.pass_count} passe</span>
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
    getSessionById(sessionId)
      .then(data => {
        if (!data) {
          setSessionErr('Séance introuvable.')
          setLoading(false)
          return
        }
        setSession(data)
      })
      .catch(() => {
        setSessionErr('Séance introuvable.')
        setLoading(false)
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

  // Volontairement sans étape (visiteur hors parcours) : le titre de la séance,
  // « Résultats de la séance » dessous ; tant qu'elle charge, le titre générique.
  const enTete = session
    ? { title: session.title, phase: session.phase, organization_id: session.organization_id }
    : { title: 'Résultats de la séance', phase: 'closed' as const, organization_id: null }

  return (
    <PageParcours session={enTete} sansEtape sousTitre={session ? 'Résultats de la séance' : undefined}>
      <div className="space-y-5">
        {isLoading && <ChargementParcours texte="Chargement des résultats…" />}

        {sessionErr && <ErreurParcours>{sessionErr}</ErreurParcours>}

        {error && <ErreurParcours>{error}</ErreurParcours>}

        {!isLoading && !error && !sessionErr && !data && (
          <div className="rounded-[12px] border border-bleu-fonce/10 bg-white px-5 py-8 text-center shadow-sm animate-montee">
            <p className="text-sm font-semibold text-bleu-fonce">
              Les résultats de cette séance ne sont pas disponibles publiquement.
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Revenez plus tard : l'organisateur publie les résultats après analyse.
            </p>
          </div>
        )}

        {!isLoading && !error && !sessionErr && data && session && (
          <>
            {/* Placement idéologique */}
            {points.length > 0 && (
              <section className={CARTE_PARCOURS}>
                <h2 className="font-sans text-[11px] font-bold text-bleu-fonce/70 uppercase tracking-[0.16em] mb-1">
                  Placement idéologique des participants
                </h2>
                <p className="text-xs text-gray-600 mb-4">
                  Un point par participant, anonyme : aucune identité associée.
                </p>
                <PublicScatterPlot points={points} kChosen={data.k_chosen ?? 1} session={session} />
              </section>
            )}

            {/* Assertions et votes */}
            <section className={CARTE_PARCOURS}>
              <h2 className="font-sans text-[11px] font-bold text-bleu-fonce/70 uppercase tracking-[0.16em] mb-4">
                Assertions et votes
              </h2>
              {assertions.length === 0 ? (
                <p className="text-sm text-gray-500">Aucune assertion approuvée pour cette séance.</p>
              ) : (
                <div className="divide-y divide-bleu-fonce/10">
                  {assertions.map((a, i) => (
                    <PublicAssertionRow key={i} assertion={a} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        <p className="text-center text-sm text-gray-600 pt-2">
          Merci pour votre participation à cette séance Ecclesia.
        </p>
      </div>
    </PageParcours>
  )
}
