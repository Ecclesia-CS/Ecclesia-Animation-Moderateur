import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { extractErr } from '../lib/utils'
import { listPublicClosedSessions } from '../lib/sessions'
import type { Session } from '../lib/types'

// ── Lien externe vers le site public Ecclesia (chantier 46) ────
const ALL_DEBATES_URL = 'https://ecclesia-centralesupelec.vercel.app/#debats'

// ── Séances en cours ────────────────────────────────────────────
const PHASE_BADGE: Record<string, string> = {
  pre_voting:    'bg-amber-100 text-amber-700',
  voting:        'bg-indigo-100 text-indigo-700',
  allocating:    'bg-amber-100 text-amber-700',
  debating:      'bg-green-100 text-green-700',
}
const PHASE_LABEL: Record<string, string> = {
  pre_voting:    'Vote à distance ouvert',
  voting:        'Vote présentiel en cours',
  allocating:    'Formation des groupes',
  debating:      'Débat en cours',
}
const PHASE_ACTION: Record<string, string> = {
  pre_voting:    'Voter →',
  voting:        'Participer →',
  allocating:    'Mon affectation →',
  debating:      'Rejoindre →',
}

type ActiveSession = Pick<Session, 'id' | 'title' | 'phase' | 'join_code'>

/**
 * Chantier 95 — les trois onglets « Modérateur », « Rejoindre ou reprendre une
 * table » et « Créer » ont été supprimés. Tout passe par la liste des séances
 * en cours ci-dessous, qui mène au parcours normal (`#session/<code>`) :
 *
 * - **Créer** fabriquait une table hors séance, à rattacher ensuite à la main
 *   dans le superadmin. C'était la seule source de ces tables orphelines, et
 *   les deux accordéons qui servaient à les rattacher sont supprimés avec.
 *   Les tables viennent maintenant de l'algorithme d'allocation ou du bouton
 *   de création de la vue Groupes.
 * - **Rejoindre** doublonnait le formulaire de rattrapage déjà proposé en
 *   phase débat par `SessionRouterScreen` et `VoteScreen`.
 * - **Modérateur** doublonnait la déclaration déjà possible à l'inscription
 *   (`ModeratorDeclareField`), pendant le vote et pendant le débat
 *   (`ModeratorClaimModal`).
 */
export default function EntryScreen() {
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([])

  // ── Anciennes séances aux résultats publics (chantier 46) ───────
  const [showPastSessions, setShowPastSessions] = useState(false)

  useEffect(() => {
    function fetchActiveSessions() {
      supabase
        .from('sessions')
        .select('id, title, phase, join_code')
        .in('phase', ['pre_voting', 'voting', 'allocating', 'debating'])
        .order('created_at', { ascending: false })
        .then(({ data }) => { if (data) setActiveSessions(data as ActiveSession[]) })
    }
    fetchActiveSessions()
    const interval = setInterval(fetchActiveSessions, 30_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">

        {/* Brand header */}
        <div className="px-6 pt-7 pb-2 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 leading-tight">Ecclesia</h1>
            <p className="text-xs text-gray-400 leading-tight">Modération de débat</p>
          </div>
        </div>

        {/* Message d'accueil — première chose vue en arrivant ou en quittant une séance (chantier 46) */}
        <div className="px-6 pt-3 pb-1">
          <p className="text-sm text-gray-600">
            Bienvenue sur l'application d'Ecclesia !
          </p>
        </div>

        {/* Séances en cours */}
        <section className="px-6 pt-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Séances en cours
          </p>
          {activeSessions.filter(s => s.join_code).length === 0 ? (
            <p className="text-sm text-gray-400 py-3">
              Aucune séance en cours pour l'instant.
            </p>
          ) : (
            <div className="space-y-2">
              {activeSessions.filter(s => s.join_code).map(s => (
                <div key={s.id}
                  className="bg-gray-50 rounded-xl border border-gray-200 p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 break-words">{s.title}</p>
                    <span className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${PHASE_BADGE[s.phase] ?? 'bg-gray-100 text-gray-600'}`}>
                      {PHASE_LABEL[s.phase] ?? s.phase}
                    </span>
                  </div>
                  <button
                    onClick={() => { window.location.hash = '#session/' + s.join_code! }}
                    className="shrink-0 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-colors"
                  >
                    {PHASE_ACTION[s.phase] ?? 'Accéder →'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="pt-5 pb-5 px-6 flex flex-col items-center gap-2">
          <a
            href={ALL_DEBATES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full text-center py-2.5 px-4 border border-gray-200 rounded-xl
              text-sm font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
          >
            Voir tous les débats ↗
          </a>
          <button
            onClick={() => setShowPastSessions(true)}
            className="w-full text-center py-2.5 px-4 border border-gray-200 rounded-xl
              text-sm font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
          >
            Voir les votes des anciennes séances
          </button>
        </div>

        <div className="pb-4 text-center">
          <a
            href="#superadmin"
            className="text-xs text-gray-300 hover:text-gray-400 transition-colors"
          >
            Administration
          </a>
        </div>
      </div>

      {showPastSessions && (
        <PastSessionsModal onClose={() => setShowPastSessions(false)} />
      )}
    </div>
  )
}

// ── PastSessionsModal — anciennes séances aux résultats publics ────
function PastSessionsModal({ onClose }: { onClose(): void }) {
  const [sessions, setSessions] = useState<Pick<Session, 'id' | 'title' | 'description' | 'scheduled_at'>[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listPublicClosedSessions()
      .then(data => setSessions(data))
      .catch(err => setError(extractErr(err)))
  }, [])

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">Anciennes séances</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>
        <div className="overflow-y-auto px-5 py-4 space-y-2">
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          {!error && sessions === null && (
            <p className="text-sm text-gray-400 text-center py-6">Chargement…</p>
          )}
          {!error && sessions !== null && sessions.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">
              Aucune séance aux résultats publics pour l'instant.
            </p>
          )}
          {!error && sessions?.map(s => (
            <button
              key={s.id}
              onClick={() => { window.location.hash = '#results/' + s.id }}
              className="w-full text-left bg-gray-50 hover:bg-indigo-50 rounded-xl border border-gray-200
                hover:border-indigo-200 px-4 py-3 transition-colors"
            >
              <p className="text-sm font-semibold text-gray-900">{s.title}</p>
              {s.scheduled_at && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(s.scheduled_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              )}
              {s.description && (
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{s.description}</p>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
