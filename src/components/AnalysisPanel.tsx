// =============================================================
// AnalysisPanel — Analyse des camps d'opinion
// Affiche scatter PCA, assertions clivantes, assertions consensuelles.
// =============================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import {
  loadVotesForAnalysis,
  loadLatestAnalysis,
  saveAnalysisResult,
  runOpinionAnalysis,
  AnalysisError,
  listSessionAnalyses,
  loadAnalysisById,
  pairGroups,
  computeMemberMovements,
  computeConsensusMovements,
} from '../lib/analysis'
import type { LoadedAnalysis, AnalysisResult, SessionAnalysisSummary } from '../lib/analysis'
import type { AssertionAdmin } from '../lib/voting'
import type { GroupNameResult } from '../lib/types'


// ── Constantes ────────────────────────────────────────────────
const CONSENSUS_THRESHOLD = 0.5
const GROUP_COLORS = ['#2563EB', '#DC2626', '#059669', '#D97706', '#7C3AED']

function groupColor(groupId: number): string {
  return GROUP_COLORS[groupId % GROUP_COLORS.length] ?? '#6B7280'
}

// ── Props ─────────────────────────────────────────────────────
interface AnalysisPanelProps {
  sessionId:    string
  password:     string
  assertions:   AssertionAdmin[]
  onAuthError(): void
  onAnalysisStatusChange?(hasDone: boolean): void
  /** E3 — appelé après un calcul d'analyse manuel réussi, avec l'analyse fraîche.
   *  Permet au parent de déclencher le nommage systématique des camps. */
  /** Nommage des camps. Peut retourner une promesse — `handleAnalyze` l'attend
   *  pour garder le bouton verrouillé pendant les appels Gemini (chantier 28). */
  onAnalysisComplete?(analysis: LoadedAnalysis): void | Promise<void>
  groupNames?:  GroupNameResult[]
  totalMembers?: number
  sessionPhase?: string
}

// ── ScatterPlot ───────────────────────────────────────────────
const PAD = 24
const W   = 280
const H   = 210

interface ScatterProps {
  members:    LoadedAnalysis['members']
  kChosen:    number
  groupNames?: GroupNameResult[]
}

function ScatterPlot({ members, kChosen, groupNames }: ScatterProps) {
  if (members.length === 0) return null

  const xs = members.map(m => m.pca_x)
  const ys = members.map(m => m.pca_y)

  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)

  const xRange = xMax - xMin || 1
  const yRange = yMax - yMin || 1

  const cx = (x: number) => PAD + ((x - xMin) / xRange) * (W - 2 * PAD)
  const cy = (y: number) => H - PAD - ((y - yMin) / yRange) * (H - 2 * PAD)

  // Compte par groupe pour la légende
  const groupCounts: Record<number, number> = {}
  for (const m of members) {
    groupCounts[m.group_id] = (groupCounts[m.group_id] ?? 0) + 1
  }

  const groups = Array.from({ length: kChosen }, (_, i) => i)

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-sm mx-auto block"
        aria-label="Nuage de points PCA"
      >
        {members.map((m, i) => (
          <circle
            key={i}
            cx={cx(m.pca_x)}
            cy={cy(m.pca_y)}
            r={5}
            fill={groupColor(m.group_id)}
            opacity={0.8}
          />
        ))}
      </svg>
      {/* Légende */}
      <div className="flex flex-wrap gap-3 mt-2 justify-center">
        {groups.map(g => {
          const gn = groupNames?.find(n => n.table_number === g + 1)
          return (
            <div key={g} className="flex items-start gap-1.5 text-xs text-gray-600">
              <span
                className="inline-block w-3 h-3 rounded-sm flex-shrink-0 mt-0.5"
                style={{ backgroundColor: groupColor(g) }}
              />
              <div>
                <span className={gn?.name ? 'font-medium' : ''}>
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
    </div>
  )
}

// ── AnalysisPanel principal ───────────────────────────────────
export default function AnalysisPanel({
  sessionId,
  password,
  assertions,
  onAuthError,
  onAnalysisStatusChange,
  onAnalysisComplete,
  groupNames,
  totalMembers,
  sessionPhase,
}: AnalysisPanelProps) {
  const [open,          setOpen]          = useState(false)
  const [analysis,      setAnalysis]      = useState<LoadedAnalysis | null>(null)
  const [loadStatus,    setLoadStatus]    = useState<'loading' | 'loaded' | 'error'>('loading')
  const [analyzeStatus, setAnalyzeStatus] = useState<'idle' | 'loading' | 'naming' | 'done' | 'error'>('idle')
  const [errorMsg,      setErrorMsg]      = useState<string | null>(null)

  // Toggle présentiels uniquement
  const [attendingOnly,         setAttendingOnly]         = useState(false)
  const [attendingOnlyAnalysis, setAttendingOnlyAnalysis] = useState<LoadedAnalysis | null>(null)
  const [attendingOnlyLoading,  setAttendingOnlyLoading]  = useState(false)

  // Auto-analyse périodique
  const [autoAnalyze, setAutoAnalyzeState] = useState(
    () => localStorage.getItem(`analysis_auto_${sessionId}`) === 'true'
  )
  const [autoAnalyzeInterval, setAutoAnalyzeIntervalState] = useState(
    () => parseInt(localStorage.getItem(`analysis_auto_interval_${sessionId}`) ?? '5', 10)
  )
  const isAutoAnalyzingRef = useRef<boolean>(false)

  function setAutoAnalyze(v: boolean) {
    setAutoAnalyzeState(v)
    localStorage.setItem(`analysis_auto_${sessionId}`, String(v))
  }
  function setAutoAnalyzeInterval(v: number) {
    setAutoAnalyzeIntervalState(v)
    localStorage.setItem(`analysis_auto_interval_${sessionId}`, String(v))
  }

  // Map assertion_id → content pour les affichages
  const assertionMap = new Map<string, string>(
    assertions.filter(a => a.status === 'approved').map(a => [a.id, a.content]),
  )

  // ── Chargement de l'analyse existante ─────────────────────
  const loadExisting = useCallback(async () => {
    try {
      const data = await loadLatestAnalysis(supabase, password, sessionId)
      setAnalysis(data)
      if (data) setOpen(true)
      setLoadStatus('loaded')
      onAnalysisStatusChange?.(data !== null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) {
        onAuthError()
      } else {
        setLoadStatus('error')
        setErrorMsg(msg)
      }
    }
  }, [password, sessionId, onAuthError])

  useEffect(() => {
    loadExisting()
  }, [loadExisting])

  // ── setInterval auto-analyse ──────────────────────────────
  useEffect(() => {
    if (!autoAnalyze || !['voting', 'pre_voting'].includes(sessionPhase ?? '')) return
    const intervalMs = autoAnalyzeInterval * 60 * 1000
    const id = setInterval(async () => {
      if (isAutoAnalyzingRef.current) return
      isAutoAnalyzingRef.current = true
      try {
        const votes = await loadVotesForAnalysis(supabase, password, sessionId)
        const memberIds    = [...new Set(votes.map(v => v.member_id))]
        const assertionIds = [...new Set(votes.map(v => v.assertion_id))]
        const result = runOpinionAnalysis(votes, memberIds, assertionIds)
        await saveAnalysisResult(supabase, password, sessionId, result)
        await loadExisting()
      } catch (e) {
        if (e instanceof AnalysisError) return // données insuffisantes — normal en début de vote
        console.error('[auto-analyse]', e)
      } finally {
        isAutoAnalyzingRef.current = false
      }
    }, intervalMs)
    return () => clearInterval(id)
  }, [autoAnalyze, autoAnalyzeInterval, sessionPhase, sessionId, password, loadExisting])

  // ── Lancer une nouvelle analyse ───────────────────────────
  async function handleAnalyze() {
    setAnalyzeStatus('loading')
    setErrorMsg(null)
    try {
      // 1. Récupérer les votes
      const votes = await loadVotesForAnalysis(supabase, password, sessionId)

      // 2. Dériver les listes uniques
      const memberIds    = [...new Set(votes.map(v => v.member_id))]
      const assertionIds = [...new Set(votes.map(v => v.assertion_id))]

      // 3. Calcul PCA + k-means (côté navigateur)
      const result = runOpinionAnalysis(votes, memberIds, assertionIds)

      // 4. Sauvegarder
      await saveAnalysisResult(supabase, password, sessionId, result)

      // 5. Recharger et afficher
      await loadExisting()

      // 6. E3 — nommage systématique des camps sur l'analyse fraîche.
      //
      // Chantier 28 — ON ATTEND le nommage, bouton toujours désactivé.
      // Avant, `setAnalyzeStatus('done')` était posé AVANT cet appel et le
      // nommage partait en fire-and-forget : le bouton redevenait cliquable et
      // reprenait son libellé normal pendant les k appels Gemini séquentiels
      // (15-40 s pour 5 camps, sans le moindre retour visuel). D'où des
      // re-clics légitimes du superadmin → analyses redondantes (les 3 lignes
      // `session_analysis` de VERIF7 en 45 s), et surtout un nommage suivant
      // silencieusement ignoré par le garde-fou de `runNaming`.
      setAnalyzeStatus('naming')
      await onAnalysisComplete?.(resultToLoaded(result))
      setAnalyzeStatus('done')
    } catch (e) {
      if (e instanceof AnalysisError) {
        setErrorMsg(e.message)
        setAnalyzeStatus('error')
      } else {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) {
          onAuthError()
        } else {
          setErrorMsg(msg)
          setAnalyzeStatus('error')
        }
      }
    }
  }

  // ── Conversion AnalysisResult → LoadedAnalysis (pour vue locale) ─
  // Chantier 70 — vote_scope figé à 'current' : ce chemin ne calcule jamais
  // depuis les votes reconstitués pré-clôture (aucun appelant ne le fait ici).
  function resultToLoaded(r: AnalysisResult): LoadedAnalysis {
    return {
      id: 'local',
      k_chosen: r.kChosen,
      silhouette_score: r.silhouette,
      pca_variance_explained: r.pcaVariance,
      repness: r.repness,
      group_consensus: r.groupConsensus,
      created_at: new Date().toISOString(),
      vote_scope: 'current',
      members: r.members,
    }
  }

  // ── Toggle présentiels uniquement ─────────────────────────
  async function handleAttendingToggle(val: boolean) {
    setAttendingOnly(val)
    if (!val) return
    if (attendingOnlyAnalysis !== null) return
    setAttendingOnlyLoading(true)
    setErrorMsg(null)
    try {
      const votes = await loadVotesForAnalysis(supabase, password, sessionId, true)
      const memberIds    = [...new Set(votes.map(v => v.member_id))]
      const assertionIds = [...new Set(votes.map(v => v.assertion_id))]
      const result = runOpinionAnalysis(votes, memberIds, assertionIds)
      setAttendingOnlyAnalysis(resultToLoaded(result))
    } catch (e) {
      if (e instanceof AnalysisError) {
        setErrorMsg('Données insuffisantes pour analyser uniquement les participants présentiels.')
      } else {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) {
          onAuthError()
        } else {
          setErrorMsg(msg)
        }
      }
      setAttendingOnly(false)
    } finally {
      setAttendingOnlyLoading(false)
    }
  }

  // ── Badge titre ───────────────────────────────────────────
  function badge() {
    if (loadStatus === 'loading') return '…'
    if (displayAnalysis)         return `k = ${displayAnalysis.k_chosen}${attendingOnly ? ' (présentiels)' : ''}`
    if (analysis)                return `k = ${analysis.k_chosen}`
    return 'Aucune'
  }

  const displayAnalysis = attendingOnly ? attendingOnlyAnalysis : analysis

  // ── Assertions clivantes (top 3 par groupe) ────────────────
  function topClivantes(groupId: number): { aid: string; score: number; content: string }[] {
    if (!displayAnalysis) return []
    return Object.entries(displayAnalysis.repness)
      .map(([aid, scores]) => ({
        aid,
        score:   scores[String(groupId)] ?? 0,
        content: assertionMap.get(aid) ?? '',
      }))
      .filter(x => x.content !== '')
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
  }

  // ── Assertions consensuelles ──────────────────────────────
  function consensuelles(): { aid: string; score: number; content: string }[] {
    if (!displayAnalysis) return []
    return Object.entries(displayAnalysis.group_consensus)
      .filter(([, score]) => score > CONSENSUS_THRESHOLD)
      .sort(([, a], [, b]) => b - a)
      .map(([aid, score]) => ({
        aid,
        score,
        content: assertionMap.get(aid) ?? '',
      }))
      .filter(x => x.content !== '')
  }

  // Le bouton reste verrouillé pendant le calcul ET pendant le nommage Gemini
  // qui le suit — c'est la phase longue, cf. `handleAnalyze` (chantier 28).
  const isAnalyzing = analyzeStatus === 'loading' || analyzeStatus === 'naming'

  // ── Rendu ─────────────────────────────────────────────────
  return (
    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* En-tête cliquable */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Analyse des camps
          <span className="ml-2 font-normal normal-case text-gray-400">
            ({badge()})
          </span>
          {autoAnalyze && ['voting', 'pre_voting'].includes(sessionPhase ?? '') && (
            <span className="ml-2 font-normal normal-case text-emerald-600">● auto</span>
          )}
        </span>

        <div className="flex items-center gap-3">
          {/* Bouton analyser — stopPropagation pour ne pas toggle open */}
          <div
            onClick={e => e.stopPropagation()}
            className="flex-shrink-0"
          >
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {analyzeStatus === 'loading' ? 'Calcul…'
                : analyzeStatus === 'naming' ? 'Nommage des camps…'
                : 'Analyser les camps'}
            </button>
          </div>

          {/* Chevron */}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Corps déroulant */}
      {open && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-5">
          {/* Erreur */}
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          {/* Toggle présentiels / tous (visible si une analyse existe) */}
          {analysis && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500">Vue :</span>
              <button
                onClick={() => handleAttendingToggle(false)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  !attendingOnly
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                }`}
              >
                Tous les votants
              </button>
              <button
                onClick={() => handleAttendingToggle(true)}
                disabled={attendingOnlyLoading}
                className={`text-xs px-3 py-1 rounded-full border transition-colors disabled:opacity-50 ${
                  attendingOnly
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                }`}
              >
                {attendingOnlyLoading ? 'Calcul…' : 'Présentiels uniquement'}
              </button>
            </div>
          )}

          {displayAnalysis ? (
            <>
              {/* Métadonnées */}
              <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                <span>
                  <span className="font-medium text-gray-700">Groupes :</span>{' '}
                  {displayAnalysis.k_chosen}
                </span>
                <span>
                  <span className="font-medium text-gray-700">Silhouette :</span>{' '}
                  {displayAnalysis.silhouette_score.toFixed(3)}
                </span>
                <span>
                  <span className="font-medium text-gray-700">Variance PCA :</span>{' '}
                  {(displayAnalysis.pca_variance_explained[0] * 100).toFixed(1)} % +{' '}
                  {(displayAnalysis.pca_variance_explained[1] * 100).toFixed(1)} %
                </span>
                {!attendingOnly && (
                  <span className="text-gray-400">
                    {new Date(displayAnalysis.created_at).toLocaleString('fr-FR', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                )}
                {attendingOnly && (
                  <span className="text-indigo-500 font-medium">Présentiels uniquement</span>
                )}
              </div>

              {/* Scatter plot */}
              <ScatterPlot members={displayAnalysis.members} kChosen={displayAnalysis.k_chosen} groupNames={groupNames} />
              {totalMembers != null && totalMembers > displayAnalysis.members.length && (
                <p className="text-xs text-amber-600 mt-1 text-center">
                  ⚠ {totalMembers - displayAnalysis.members.length} participant(s) exclus de l&apos;analyse (aucun vote sur assertions approuvées)
                </p>
              )}

              {/* Assertions clivantes */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Assertions clivantes
                </h4>
                <div className="space-y-4">
                  {Array.from({ length: displayAnalysis.k_chosen }, (_, g) => {
                    const items = topClivantes(g)
                    return (
                      <div key={g}>
                        {(() => {
                          const gn = groupNames?.find(n => n.table_number === g + 1)
                          return (
                            <>
                              <p
                                className="text-xs font-semibold mb-0.5"
                                style={{ color: groupColor(g) }}
                              >
                                {gn?.name ? `${gn.name} (Groupe ${g + 1})` : `Groupe ${g + 1}`}
                              </p>
                              {gn?.description && (
                                <p className="text-xs text-gray-400 mb-1.5">{gn.description}</p>
                              )}
                              {!gn?.description && <div className="mb-1.5" />}
                            </>
                          )
                        })()}
                        {items.length === 0 ? (
                          <p className="text-xs text-gray-400">Aucune assertion disponible</p>
                        ) : (
                          <ul className="space-y-1">
                            {items.map(item => (
                              <li key={item.aid} className="flex items-start gap-2 text-sm text-gray-700">
                                <span
                                  className="flex-shrink-0 mt-0.5 text-xs font-mono px-1.5 py-0.5 rounded"
                                  style={{ backgroundColor: groupColor(g) + '20', color: groupColor(g) }}
                                >
                                  {item.score.toFixed(1)}
                                </span>
                                <span>{item.content}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Assertions consensuelles inter-groupes (D10) */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Assertions consensuelles
                  <span className="ml-1.5 font-normal normal-case text-gray-400">
                    (tous les camps · score &gt; {CONSENSUS_THRESHOLD})
                  </span>
                </h4>
                <p className="text-xs text-gray-400 mb-3">
                  Points de convergence : assertions que <strong>tous les camps approuvent en moyenne</strong>,
                  malgré leurs désaccords. Le score est la moyenne du camp le moins favorable (0 = neutre, 1 = adhésion totale).
                </p>
                {(() => {
                  const items = consensuelles()
                  if (items.length === 0) {
                    return (
                      <p className="text-xs text-gray-400">
                        Aucune assertion ne fait consensus entre tous les camps pour l'instant.
                      </p>
                    )
                  }
                  return (
                    <ul className="space-y-1">
                      {items.map(item => (
                        <li key={item.aid} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="flex-shrink-0 mt-0.5 text-xs font-mono px-1.5 py-0.5 rounded bg-green-50 text-green-700">
                            {item.score.toFixed(2)}
                          </span>
                          <span>{item.content}</span>
                        </li>
                      ))}
                    </ul>
                  )
                })()}
              </div>
            </>
          ) : attendingOnly && attendingOnlyLoading ? (
            <p className="text-sm text-gray-400">Calcul de l'analyse présentiels…</p>
          ) : loadStatus === 'loading' ? (
            <p className="text-sm text-gray-400">Chargement…</p>
          ) : loadStatus === 'error' && !errorMsg ? (
            <p className="text-sm text-red-500">Erreur lors du chargement de l'analyse.</p>
          ) : (
            <p className="text-sm text-gray-400">
              Aucune analyse disponible. Cliquez sur "Analyser les camps" pour lancer le calcul.
            </p>
          )}

          {/* ── Section Automatisation ─── */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Automatisation
            </h4>

            {/* Toggle Auto-analyser */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Auto-analyser</span>
              <button
                onClick={() => setAutoAnalyze(!autoAnalyze)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  autoAnalyze ? 'bg-indigo-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    autoAnalyze ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Slider intervalle */}
            <div className={autoAnalyze ? '' : 'opacity-40 pointer-events-none'}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-700">Intervalle</span>
                <span className="text-sm font-medium text-gray-700">{autoAnalyzeInterval} min</span>
              </div>
              <input
                type="range"
                min={1}
                max={15}
                step={1}
                value={autoAnalyzeInterval}
                onChange={e => setAutoAnalyzeInterval(Number(e.target.value))}
                disabled={!autoAnalyze}
                className="w-full accent-indigo-600"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                <span>1 min</span>
                <span>15 min</span>
              </div>
            </div>

            {!['voting', 'pre_voting'].includes(sessionPhase ?? '') && autoAnalyze && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                L'auto-analyse est active mais la séance n'est pas en phase "vote" ou "pré-vote".
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

// =============================================================
// AnalysisComparisonPanel — chantier 79
// Compare deux analyses d'une même séance (typiquement une 'pre_closure'
// et une 'current') pour voir comment les positions ont bougé après le
// débat. Infrastructure posée par le chantier 70 (assertion_vote_history,
// vote_scope, list_session_analyses, get_analysis_by_id) — cet écran est
// la première consommation de ces données.
//
// ⚠️ Piège central (voir pairGroups dans lib/analysis.ts) : deux analyses
// ne numérotent pas leurs camps pareil. Tout ce qui est affiché ici passe
// par l'appariement sur composition réelle, jamais par le group_id brut.
// =============================================================

interface AnalysisComparisonPanelProps {
  sessionId: string
  password:  string
  assertions: AssertionAdmin[]
  onAuthError(): void
}

const CONSENSUS_MOVE_MIN_DELTA = 0.15

export function AnalysisComparisonPanel({
  sessionId,
  password,
  assertions,
  onAuthError,
}: AnalysisComparisonPanelProps) {
  const [open, setOpen] = useState(false)
  const [summaries, setSummaries] = useState<SessionAnalysisSummary[]>([])
  const [loadStatus, setLoadStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [beforeId, setBeforeId] = useState<string>('')
  const [afterId, setAfterId]   = useState<string>('')
  const [before, setBefore]     = useState<LoadedAnalysis | null>(null)
  const [after, setAfter]       = useState<LoadedAnalysis | null>(null)
  const [compareStatus, setCompareStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  const assertionMap = new Map<string, string>(assertions.map(a => [a.id, a.content]))

  function handleAuthOrError(e: unknown, fallback: (msg: string) => void) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) {
      onAuthError()
    } else {
      fallback(msg)
    }
  }

  // ── Chargement de la liste des analyses (à l'ouverture) ────
  const loadSummaries = useCallback(async () => {
    setLoadStatus('loading')
    setErrorMsg(null)
    try {
      const data = await listSessionAnalyses(supabase, password, sessionId)
      setSummaries(data)
      setLoadStatus('loaded')

      // Sélection par défaut : la plus récente 'pre_closure' comme "avant",
      // la plus récente 'current' comme "après" — c'est le cas d'usage visé
      // par le chantier 70 (« voir comment les positions ont bougé après le
      // débat »). Laissé vide si l'une des deux n'existe pas encore, plutôt
      // que de deviner une paire non pertinente.
      const latestPreClosure = data.find(s => s.vote_scope === 'pre_closure' && s.status === 'done')
      const latestCurrent    = data.find(s => s.vote_scope === 'current' && s.status === 'done')
      if (latestPreClosure) setBeforeId(prev => prev || latestPreClosure.id)
      if (latestCurrent)    setAfterId(prev => prev || latestCurrent.id)
    } catch (e) {
      handleAuthOrError(e, msg => { setErrorMsg(msg); setLoadStatus('error') })
    }
  }, [password, sessionId])

  useEffect(() => {
    if (open && loadStatus === 'idle') loadSummaries()
  }, [open, loadStatus, loadSummaries])

  // ── Chargement des deux analyses sélectionnées ─────────────
  useEffect(() => {
    if (!beforeId || !afterId) {
      setBefore(null)
      setAfter(null)
      setCompareStatus('idle')
      return
    }
    if (beforeId === afterId) {
      setCompareStatus('error')
      setErrorMsg('Choisissez deux analyses différentes.')
      return
    }
    let cancelled = false
    setCompareStatus('loading')
    setErrorMsg(null)
    ;(async () => {
      try {
        const [b, a] = await Promise.all([
          loadAnalysisById(supabase, password, beforeId),
          loadAnalysisById(supabase, password, afterId),
        ])
        if (cancelled) return
        if (!b || !a) {
          setCompareStatus('error')
          setErrorMsg('Une des deux analyses est introuvable.')
          return
        }
        setBefore(b)
        setAfter(a)
        setCompareStatus('done')
      } catch (e) {
        if (cancelled) return
        handleAuthOrError(e, msg => { setErrorMsg(msg); setCompareStatus('error') })
      }
    })()
    return () => { cancelled = true }
  }, [beforeId, afterId, password])

  const pairings = before && after ? pairGroups(before, after) : []
  const movements = before && after ? computeMemberMovements(before, after, pairings) : []
  const consensusMovements = before && after ? computeConsensusMovements(before, after) : []

  const votedInAfter   = movements.filter(m => m.bGroupId !== null)
  const stayedCount    = votedInAfter.filter(m => m.stayed).length
  const movedCount     = votedInAfter.filter(m => !m.stayed).length
  const notRevotedCount = movements.length - votedInAfter.length

  const topMoved = [...consensusMovements]
    .filter(m => Math.abs(m.delta) >= CONSENSUS_MOVE_MIN_DELTA)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
    .slice(0, 8)

  function analysisLabel(s: SessionAnalysisSummary): string {
    const scopeLabel = s.vote_scope === 'pre_closure' ? 'avant débat' : 'courant'
    const date = new Date(s.created_at).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    })
    return `${date} · ${scopeLabel} · k=${s.k_chosen ?? '?'} · ${s.member_count} membre(s)`
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Comparaison avant / après débat
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-5">
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          {loadStatus === 'loading' && (
            <p className="text-sm text-gray-400">Chargement des analyses disponibles…</p>
          )}

          {loadStatus === 'loaded' && summaries.filter(s => s.status === 'done').length < 2 && (
            <p className="text-sm text-gray-400">
              Il faut au moins deux analyses terminées (une "avant débat" reconstituée depuis
              l'historique des votes, une "courante") pour comparer. Relancez l'analyse depuis
              "Analyse des camps" pour en obtenir une nouvelle si besoin.
            </p>
          )}

          {loadStatus === 'loaded' && summaries.filter(s => s.status === 'done').length >= 2 && (
            <>
              <div className="flex flex-col sm:flex-row gap-3">
                <label className="flex-1 text-xs text-gray-500">
                  Avant
                  <select
                    value={beforeId}
                    onChange={e => setBeforeId(e.target.value)}
                    className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5"
                  >
                    <option value="">— choisir —</option>
                    {summaries.filter(s => s.status === 'done').map(s => (
                      <option key={s.id} value={s.id}>{analysisLabel(s)}</option>
                    ))}
                  </select>
                </label>
                <label className="flex-1 text-xs text-gray-500">
                  Après
                  <select
                    value={afterId}
                    onChange={e => setAfterId(e.target.value)}
                    className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5"
                  >
                    <option value="">— choisir —</option>
                    {summaries.filter(s => s.status === 'done').map(s => (
                      <option key={s.id} value={s.id}>{analysisLabel(s)}</option>
                    ))}
                  </select>
                </label>
              </div>

              {compareStatus === 'loading' && (
                <p className="text-sm text-gray-400">Calcul de la comparaison…</p>
              )}

              {compareStatus === 'done' && before && after && (
                <div className="space-y-5">
                  {/* Mouvement des membres */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Mouvement entre camps
                    </h4>
                    <div className="flex flex-wrap gap-4 text-sm text-gray-700">
                      <span><strong>{stayedCount}</strong> resté(s) dans leur camp</span>
                      <span><strong>{movedCount}</strong> changé(s) de camp</span>
                      {notRevotedCount > 0 && (
                        <span className="text-gray-400">{notRevotedCount} sans vote correspondant après</span>
                      )}
                    </div>
                  </div>

                  {/* Appariement des groupes */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Camps appariés
                      <span className="ml-1.5 font-normal normal-case text-gray-400">
                        (par composition réelle, pas par numéro)
                      </span>
                    </h4>
                    <ul className="space-y-1 text-sm text-gray-700">
                      {pairings.map(p => (
                        <li key={p.aGroupId} className="flex items-center gap-2">
                          <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-gray-100">
                            Avant #{p.aGroupId + 1} ({p.aSize})
                          </span>
                          <span className="text-gray-400">→</span>
                          {p.bGroupId !== null ? (
                            <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-gray-100">
                              Après #{p.bGroupId + 1} ({p.bSize})
                            </span>
                          ) : (
                            <span className="text-xs text-amber-600">aucun camp correspondant après</span>
                          )}
                          <span className="text-xs text-gray-400">{p.overlapCount} membre(s) en commun</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Assertions dont le consensus a le plus bougé */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                      Assertions dont le consensus a le plus bougé
                    </h4>
                    <p className="text-xs text-gray-400 mb-3">
                      Comparaison directe du score de consensus (indépendante du numéro de camp) —
                      seuil d'affichage : écart ≥ {CONSENSUS_MOVE_MIN_DELTA}.
                    </p>
                    {topMoved.length === 0 ? (
                      <p className="text-xs text-gray-400">Aucun mouvement de consensus notable.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {topMoved.map(m => (
                          <li key={m.assertionId} className="flex items-start gap-2 text-sm text-gray-700">
                            <span
                              className={`flex-shrink-0 mt-0.5 text-xs font-mono px-1.5 py-0.5 rounded ${
                                m.delta > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                              }`}
                            >
                              {m.delta > 0 ? '+' : ''}{m.delta.toFixed(2)}
                            </span>
                            <span>
                              {assertionMap.get(m.assertionId) ?? '(assertion supprimée)'}
                              <span className="text-gray-400 ml-1">
                                ({m.scoreA.toFixed(2)} → {m.scoreB.toFixed(2)})
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
