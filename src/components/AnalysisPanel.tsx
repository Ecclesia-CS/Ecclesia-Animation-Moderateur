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
} from '../lib/analysis'
import type { LoadedAnalysis } from '../lib/analysis'
import type { AssertionWithPseudo } from '../lib/voting'
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
  assertions:   AssertionWithPseudo[]
  onAuthError(): void
  onAnalysisStatusChange?(hasDone: boolean): void
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
  groupNames,
  totalMembers,
  sessionPhase,
}: AnalysisPanelProps) {
  const [open,          setOpen]          = useState(false)
  const [analysis,      setAnalysis]      = useState<LoadedAnalysis | null>(null)
  const [loadStatus,    setLoadStatus]    = useState<'loading' | 'loaded' | 'error'>('loading')
  const [analyzeStatus, setAnalyzeStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg,      setErrorMsg]      = useState<string | null>(null)

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
    if (!autoAnalyze || sessionPhase !== 'voting') return
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
      setAnalyzeStatus('done')
      await loadExisting()
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

  // ── Badge titre ───────────────────────────────────────────
  function badge() {
    if (loadStatus === 'loading') return '…'
    if (analysis)                 return `k = ${analysis.k_chosen}`
    return 'Aucune'
  }

  // ── Assertions clivantes (top 3 par groupe) ────────────────
  function topClivantes(groupId: number): { aid: string; score: number; content: string }[] {
    if (!analysis) return []
    return Object.entries(analysis.repness)
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
    if (!analysis) return []
    return Object.entries(analysis.group_consensus)
      .filter(([, score]) => score > CONSENSUS_THRESHOLD)
      .sort(([, a], [, b]) => b - a)
      .map(([aid, score]) => ({
        aid,
        score,
        content: assertionMap.get(aid) ?? '',
      }))
      .filter(x => x.content !== '')
  }

  const isAnalyzing = analyzeStatus === 'loading'

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
          {autoAnalyze && sessionPhase === 'voting' && (
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
              {isAnalyzing ? 'Calcul…' : 'Analyser les camps'}
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

          {analysis ? (
            <>
              {/* Métadonnées */}
              <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                <span>
                  <span className="font-medium text-gray-700">Groupes :</span>{' '}
                  {analysis.k_chosen}
                </span>
                <span>
                  <span className="font-medium text-gray-700">Silhouette :</span>{' '}
                  {analysis.silhouette_score.toFixed(3)}
                </span>
                <span>
                  <span className="font-medium text-gray-700">Variance PCA :</span>{' '}
                  {(analysis.pca_variance_explained[0] * 100).toFixed(1)} % +{' '}
                  {(analysis.pca_variance_explained[1] * 100).toFixed(1)} %
                </span>
                <span className="text-gray-400">
                  {new Date(analysis.created_at).toLocaleString('fr-FR', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>

              {/* Scatter plot */}
              <ScatterPlot members={analysis.members} kChosen={analysis.k_chosen} groupNames={groupNames} />
              {totalMembers != null && totalMembers > analysis.members.length && (
                <p className="text-xs text-amber-600 mt-1 text-center">
                  ⚠ {totalMembers - analysis.members.length} participant(s) exclus de l&apos;analyse (aucun vote sur assertions approuvées)
                </p>
              )}

              {/* Assertions clivantes */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Assertions clivantes
                </h4>
                <div className="space-y-4">
                  {Array.from({ length: analysis.k_chosen }, (_, g) => {
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

              {/* Assertions consensuelles */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Assertions consensuelles
                  <span className="ml-1.5 font-normal normal-case text-gray-400">
                    (score &gt; {CONSENSUS_THRESHOLD})
                  </span>
                </h4>
                {(() => {
                  const items = consensuelles()
                  if (items.length === 0) {
                    return (
                      <p className="text-xs text-gray-400">Aucune assertion consensuelle</p>
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

            {sessionPhase !== 'voting' && autoAnalyze && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                L'auto-analyse est active mais la séance n'est pas en phase "vote".
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
