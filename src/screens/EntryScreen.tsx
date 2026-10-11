import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { extractErr, titreSeance } from '../lib/utils'
import { listPublicClosedSessions } from '../lib/sessions'
import type { Session } from '../lib/types'
import ecclesiaLogo from '../assets/ecclesia-logo.webp'
import FondQuadrille from '../components/FondQuadrille'
import EnTeteFenetre from '../components/EnTeteFenetre'

// ── Lien externe vers le site public Ecclesia (chantier 46) ────
const ALL_DEBATES_URL = 'https://ecclesia-centralesupelec.vercel.app/#debats'

// ── Séances en cours ────────────────────────────────────────────
const PHASE_LABEL: Record<string, string> = {
  pre_voting:    'Vote à distance ouvert',
  voting:        'Vote présentiel en cours',
  allocating:    'Formation des groupes',
  debating:      'Débat en cours',
}
const PHASE_ACTION: Record<string, string> = {
  pre_voting:    'Voter',
  voting:        'Participer',
  allocating:    'Mon affectation',
  debating:      'Rejoindre',
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

  const enCours = activeSessions.filter(s => s.join_code)

  return (
    <div className="min-h-screen bg-creme flex flex-col">

      {/* ── En-tête : bandeau marine quadrillé du site, bord inférieur en vague ── */}
      <header className="relative overflow-hidden bg-bleu-fonce text-creme">
        <FondQuadrille
          cases={8}
          bande={40}
          fondu="linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.45) 55%, #000 88%)"
        />
        <svg
          data-fond-libre
          aria-hidden="true"
          viewBox="0 0 800 40"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-3 w-full sm:h-4"
        >
          <path d="M0 0 Q400 80 800 0 V40 H0 Z" className="fill-creme" />
        </svg>

        <div className="relative mx-auto w-full max-w-xl px-4 pb-12 pt-6 sm:px-6 sm:pt-8 md:pb-14">
          <div className="flex items-center gap-3 animate-montee">
            <img
              src={ecclesiaLogo}
              alt=""
              aria-hidden="true"
              className="-ml-1 h-14 w-14 drop-shadow-[0_8px_22px_rgba(155,187,226,0.35)]"
            />
            <div>
              <h1 className="font-sans text-3xl font-bold leading-none tracking-[-0.02em] text-creme">Ecclesia</h1>
              <p className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-bleu-clair leading-tight">Modération de débat</p>
            </div>
          </div>
          {/* Message d'accueil — première chose vue en arrivant ou en quittant une séance (chantier 46) */}
          <p className="mt-6 text-[1.375rem] font-semibold leading-snug tracking-[-0.01em] text-creme animate-montee [animation-delay:80ms] sm:text-2xl">
            Bienvenue sur l'application d'Ecclesia !
          </p>
        </div>
      </header>

      {/* ── Corps ── */}
      <main className="flex-1 bg-gradient-to-b from-creme to-sable">
        <div className="mx-auto w-full max-w-xl px-4 pb-10 pt-5 sm:px-6">

          {/* Séances en cours */}
          <section className="animate-montee [animation-delay:140ms]">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-bleu-fonce/70">
              Séances en cours
            </p>
            {enCours.length === 0 ? (
              <p className="rounded-[12px] border border-dashed border-bleu-fonce/20 bg-white/60 px-4 py-5 text-sm text-gray-600">
                Aucune séance en cours pour l'instant.
              </p>
            ) : (
              <div className="space-y-3">
                {enCours.map(s => {
                  const ton = TON_PHASE[s.phase] ?? TON_PHASE.voting
                  return (
                    <button
                      key={s.id}
                      onClick={() => { window.location.hash = '#session/' + s.join_code! }}
                      className="group flex w-full items-stretch overflow-hidden rounded-[12px] border border-bleu-fonce/10 bg-white text-left shadow-sm
                        transition-[border-color,box-shadow] duration-300 hover:border-bleu-fonce/25 hover:shadow-md
                        focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2 focus-visible:ring-offset-creme"
                    >
                      <span aria-hidden="true" className={`flex w-14 shrink-0 items-center justify-center ${ton.bloc}`}>
                        {ton.icone}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        <span className="min-w-0">
                          <span className={`flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.16em] ${ton.surtitre}`}>
                            <span className="relative flex h-1.5 w-1.5 shrink-0">
                              <span className={`absolute inset-0 rounded-full animate-pouls ${ton.point}`} />
                              <span className={`relative h-1.5 w-1.5 rounded-full ${ton.point}`} />
                            </span>
                            {PHASE_LABEL[s.phase] ?? s.phase}
                          </span>
                          <span className="mt-1 block break-words font-sans text-lg font-bold leading-snug tracking-[-0.01em] text-bleu-fonce">
                            {titreSeance(s.title)}
                          </span>
                        </span>
                        <span className={`inline-flex h-10 shrink-0 items-center justify-center self-start rounded-[8px] px-4 text-sm font-semibold transition-colors sm:w-36 sm:self-auto ${ton.action}`}>
                          {PHASE_ACTION[s.phase] ?? 'Accéder'}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {/* Liens vers les autres débats et les résultats passés */}
          <div className="mt-6 grid gap-2 animate-montee [animation-delay:200ms]">
            <a
              href={ALL_DEBATES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={BOUTON_SECONDAIRE}
            >
              Voir tous les débats
            </a>
            <button onClick={() => setShowPastSessions(true)} className={BOUTON_SECONDAIRE}>
              Voir les votes des anciennes séances
            </button>
          </div>

          <div className="mt-8 flex items-center justify-center gap-6 border-t border-bleu-fonce/[0.08] pt-4">
            <a
              href="#superadmin"
              className="rounded-[6px] px-1 py-1.5 text-xs text-gray-600 hover:text-bleu-fonce transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
            >
              Administration
            </a>
            <a
              href="#asso"
              className="rounded-[6px] px-1 py-1.5 text-xs text-gray-600 hover:text-bleu-fonce transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
            >
              Asso
            </a>
          </div>
        </div>
      </main>

      {showPastSessions && (
        <PastSessionsModal onClose={() => setShowPastSessions(false)} />
      )}
    </div>
  )
}

const BOUTON_SECONDAIRE = `flex min-h-11 items-center justify-center rounded-[8px] border border-bleu-fonce/15 bg-white px-4 py-2.5 text-center
  text-sm font-semibold text-bleu-fonce shadow-sm transition-colors hover:border-bleu-fonce/35 hover:bg-indigo-50/50
  focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2 focus-visible:ring-offset-creme`

// ── Couleur et icône de chaque moment de la séance (chantier 168) ──
// Vote : marine ; formation des groupes : ocre ; débat : sarcelle, comme les
// colonnes de couleur des vues participant, modérateur et superadmin.

const ICONE = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

const TON_VOTE = {
  bloc: 'bg-bleu-fonce text-bleu-clair',
  surtitre: 'text-bleu-fonce/80',
  point: 'bg-bleu-fonce',
  action: 'bg-bleu-fonce text-creme group-hover:bg-indigo-700',
  icone: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" {...ICONE}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  ),
}

const TON_PHASE: Record<string, typeof TON_VOTE> = {
  pre_voting: TON_VOTE,
  voting: TON_VOTE,
  allocating: {
    bloc: 'bg-amber-600 text-creme',
    surtitre: 'text-amber-800',
    point: 'bg-amber-600',
    action: 'bg-amber-600 text-creme group-hover:bg-amber-700',
    icone: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" {...ICONE}>
        <circle cx="12" cy="12" r="5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </svg>
    ),
  },
  debating: {
    bloc: 'bg-teal-600 text-white',
    surtitre: 'text-teal-800',
    point: 'bg-teal-600',
    action: 'bg-teal-600 text-white group-hover:bg-teal-700',
    icone: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" {...ICONE}>
        <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z" />
      </svg>
    ),
  },
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
      className="fixed inset-0 bg-bleu-fonce/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white shadow-2xl overflow-hidden rounded-[12px] ring-1 ring-white/10 max-h-[80vh] flex flex-col animate-entree"
        onClick={e => e.stopPropagation()}
      >
        <EnTeteFenetre titre="Anciennes séances" sousTitre="Résultats des votes, ouverts à tous" onClose={onClose} />
        <div className="overflow-y-auto px-5 py-4 space-y-2">
          {error && (
            <p className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
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
              className="w-full rounded-[8px] text-left bg-white hover:bg-indigo-50/60 border border-bleu-fonce/10
                hover:border-indigo-200 px-4 py-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
            >
              <p className="font-sans text-base font-bold tracking-[-0.01em] text-bleu-fonce">{titreSeance(s.title)}</p>
              {s.scheduled_at && (
                <p className="text-xs text-gray-600 mt-0.5">
                  {new Date(s.scheduled_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              )}
              {s.description && (
                <p className="text-xs text-gray-600 mt-1 line-clamp-2">{s.description}</p>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
