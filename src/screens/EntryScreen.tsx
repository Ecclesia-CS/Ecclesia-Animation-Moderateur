import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { extractErr } from '../lib/utils'
import { listPublicClosedSessions } from '../lib/sessions'
import type { Session } from '../lib/types'
import ecclesiaLogo from '../assets/ecclesia-logo.webp'

// ── Lien externe vers le site public Ecclesia (chantier 46) ────
const ALL_DEBATES_URL = 'https://ecclesia-centralesupelec.vercel.app/#debats'

// ── Séances en cours ────────────────────────────────────────────
const PHASE_BADGE: Record<string, string> = {
  pre_voting:    'border-amber-200 bg-amber-50 text-amber-800',
  voting:        'border-indigo-200 bg-indigo-50 text-bleu-fonce',
  allocating:    'border-amber-200 bg-amber-50 text-amber-800',
  debating:      'border-emerald-200 bg-emerald-50 text-emerald-800',
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
        // Chantier 135 — une séance d'association ne se rejoint que par son
        // QR code / lien, jamais depuis l'accueil d'Ecclesia.
        .is('organization_id', null)
        // Chantier 154 — le superadmin peut masquer une séance de l'accueil
        // (elle reste accessible par son lien / QR code).
        .eq('visible_on_home', true)
        .order('created_at', { ascending: false })
        .then(({ data }) => { if (data) setActiveSessions(data as ActiveSession[]) })
    }
    fetchActiveSessions()
    const interval = setInterval(fetchActiveSessions, 30_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-b from-creme to-sable flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white shadow-xl border border-bleu-fonce/10 overflow-hidden animate-entree">

        {/* Brand header */}
        <div className="bg-grain bg-bleu-fonce px-6 pt-7 pb-6 flex items-center gap-4">
          <div className="relative w-14 h-14 bg-indigo-600 flex items-center justify-center shrink-0 overflow-hidden">
            <img src={ecclesiaLogo} alt="Ecclesia" className="w-full h-full object-cover" />
          </div>
          <div className="relative">
            <h1 className="font-serif text-3xl font-semibold tracking-tight text-creme leading-none">Ecclesia</h1>
            <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.2em] text-bleu-clair leading-tight">Modération de débat</p>
          </div>
        </div>

        {/* Message d'accueil — première chose vue en arrivant ou en quittant une séance (chantier 46) */}
        <div className="px-6 pt-6 pb-1">
          <p className="font-serif text-lg leading-snug text-bleu-fonce">
            Bienvenue sur l'application d'Ecclesia !
          </p>
        </div>

        {/* Séances en cours */}
        <section className="px-6 pt-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-bleu-fonce/70 mb-3">
            Séances en cours
          </p>
          {activeSessions.filter(s => s.join_code).length === 0 ? (
            <p className="text-sm text-gray-500 py-3">
              Aucune séance en cours pour l'instant.
            </p>
          ) : (
            <div className="space-y-2">
              {activeSessions.filter(s => s.join_code).map(s => (
                <div key={s.id}
                  className="bg-white border border-bleu-fonce/10 border-l-4 border-l-bleu-fonce px-4 py-3.5 flex items-center justify-between gap-3 shadow-sm">
                  <div className="min-w-0">
                    <p className="font-serif text-lg font-semibold leading-snug text-bleu-fonce break-words">{s.title}</p>
                    <span className={`inline-flex items-center mt-1.5 border px-2 py-0.5 text-[10px] font-bold uppercase leading-snug tracking-[0.08em] ${PHASE_BADGE[s.phase] ?? 'border-bleu-fonce/10 bg-gray-100 text-gray-600'}`}>
                      {PHASE_LABEL[s.phase] ?? s.phase}
                    </span>
                  </div>
                  <button
                    onClick={() => { window.location.hash = '#session/' + s.join_code! }}
                    className="shrink-0 py-2.5 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors
                      focus:outline-none focus:ring-2 focus:ring-bleu-clair focus:ring-offset-2"
                  >
                    {PHASE_ACTION[s.phase] ?? 'Accéder →'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="pt-6 pb-5 px-6 flex flex-col items-center gap-2">
          <a
            href={ALL_DEBATES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full text-center py-2.5 px-4 bg-white border border-bleu-fonce/20
              text-sm font-semibold text-bleu-fonce hover:border-bleu-fonce/40 hover:bg-bleu-fonce/[0.04] transition-colors"
          >
            Voir tous les débats ↗
          </a>
          <button
            onClick={() => setShowPastSessions(true)}
            className="w-full text-center py-2.5 px-4 bg-white border border-bleu-fonce/20
              text-sm font-semibold text-bleu-fonce hover:border-bleu-fonce/40 hover:bg-bleu-fonce/[0.04] transition-colors"
          >
            Voir les votes des anciennes séances
          </button>
        </div>

        <div className="pb-5 pt-1 text-center border-t border-bleu-fonce/[0.06] mx-6">
          <a
            href="#superadmin"
            className="inline-block mt-4 text-xs text-gray-500 hover:text-bleu-fonce transition-colors"
          >
            Administration
          </a>
          <a
            href="#asso"
            className="block mt-1 text-xs text-gray-500 hover:text-bleu-fonce transition-colors"
          >
            Asso
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
      className="fixed inset-0 bg-bleu-fonce/50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white shadow-2xl border border-bleu-fonce/10 overflow-hidden max-h-[80vh] flex flex-col animate-entree"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-bleu-fonce/10 flex items-center justify-between shrink-0">
          <h2 className="font-serif text-xl font-semibold text-bleu-fonce">Anciennes séances</h2>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-bleu-fonce text-lg leading-none transition-colors focus:outline-none focus:ring-2 focus:ring-bleu-clair">✕</button>
        </div>
        <div className="overflow-y-auto px-5 py-4 space-y-2">
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          {!error && sessions === null && (
            <p className="text-sm text-gray-500 text-center py-6">Chargement…</p>
          )}
          {!error && sessions !== null && sessions.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-6">
              Aucune séance aux résultats publics pour l'instant.
            </p>
          )}
          {!error && sessions?.map(s => (
            <button
              key={s.id}
              onClick={() => { window.location.hash = '#results/' + s.id }}
              className="w-full text-left bg-white hover:bg-indigo-50/60 border border-bleu-fonce/10
                hover:border-indigo-200 px-4 py-3 transition-colors focus:outline-none focus:ring-2 focus:ring-bleu-clair"
            >
              <p className="font-serif text-base font-semibold text-bleu-fonce">{s.title}</p>
              {s.scheduled_at && (
                <p className="text-xs text-gray-500 mt-0.5">
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
