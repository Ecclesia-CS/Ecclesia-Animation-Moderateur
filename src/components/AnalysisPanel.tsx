// =============================================================
// AnalysisPanel — Analyse des camps d'opinion
// Affiche scatter PCA, assertions clivantes, assertions consensuelles.
// =============================================================

import { useState, useEffect, useCallback } from 'react'
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


// ── Constantes ────────────────────────────────────────────────
const CONSENSUS_THRESHOLD = 0.5
const GROUP_COLORS = ['#2563EB', '#DC2626', '#059669', '#D97706', '#7C3AED']

function groupColor(groupId: number): string {
  return GROUP_COLORS[groupId % GROUP_COLORS.length] ?? '#6B7280'
}

// ── Props ─────────────────────────────────────────────────────
interface AnalysisPanelProps {
  sessionId:   string
  password:    string
  assertions:  AssertionWithPseudo[]
  onAuthError(): void
  onAnalysisStatusChange?(hasDone: boolean): void
}

// ── ScatterPlot ───────────────────────────────────────────────
const PAD = 24
const W   = 280
const H   = 210

interface ScatterProps {
  members:  LoadedAnalysis['members']
  kChosen:  number
}

function ScatterPlot({ members, kChosen }: ScatterProps) {
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
}: AnalysisPanelProps) {
  const [open,          setOpen]          = useState(false)
  const [analysis,      setAnalysis]      = useState<LoadedAnalysis | null>(null)
  const [loadStatus,    setLoadStatus]    = useState<'loading' | 'loaded' | 'error'>('loading')
  const [analyzeStatus, setAnalyzeStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg,      setErrorMsg]      = useState<string | null>(null)

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
              <ScatterPlot members={analysis.members} kChosen={analysis.k_chosen} />

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
                        <p
                          className="text-xs font-semibold mb-1.5"
                          style={{ color: groupColor(g) }}
                        >
                          Groupe {g + 1}
                        </p>
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
        </div>
      )}
    </section>
  )
}
