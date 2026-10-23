import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  loadLatestAnalysis,
  loadVotesForAnalysis,
  runOpinionAnalysis,
  saveAnalysisResult,
  AnalysisError,
} from '../../lib/analysis'
import type { LoadedAnalysis } from '../../lib/analysis'
import type { GroupNameResult } from '../../lib/types'
import { extractErr } from '../../lib/utils'
import { ScatterPlot } from '../AnalysisPanel'
import EnTeteFenetre from '../EnTeteFenetre'

// Chantier 171b : fenêtre bloquante ouverte à chaque clic sur « Calculer la
// répartition ». L'allocation lit la dernière analyse (camps d'opinion) : autant
// proposer de la (re)faire avant, et montrer la carte des points et des camps.

interface Props {
  sessionId: string
  password: string
  groupNames?: GroupNameResult[]
  onAuthError(): void
  /** « Calculer sans analyser ». */
  onSkip(): void
  /** Analyse enregistrée : le parent recharge les entrées puis calcule. `analysis` sert au nommage des camps. */
  onAnalysed(analysis: LoadedAnalysis): void
  /** Fermeture sans rien calculer. */
  onCancel(): void
}

export default function AnalysisBeforeAllocationModal({
  sessionId, password, groupNames, onAuthError, onSkip, onAnalysed, onCancel,
}: Props) {
  const [analysis, setAnalysis] = useState<LoadedAnalysis | null>(null)
  const [loading, setLoading]   = useState(true)
  const [running, setRunning]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadLatestAnalysis(supabase, password, sessionId)
      .then(a => { if (!cancelled) setAnalysis(a) })
      .catch(e => {
        if (cancelled) return
        const msg = extractErr(e)
        if (/mot de passe|password/i.test(msg)) onAuthError()
        else setError(msg)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sessionId, password, onAuthError])

  async function handleAnalyse() {
    setRunning(true)
    setError(null)
    try {
      const votes = await loadVotesForAnalysis(supabase, password, sessionId)
      const memberIds    = [...new Set(votes.map(v => v.member_id))]
      const assertionIds = [...new Set(votes.map(v => v.assertion_id))]
      const result = runOpinionAnalysis(votes, memberIds, assertionIds)
      await saveAnalysisResult(supabase, password, sessionId, result)
      const fresh = await loadLatestAnalysis(supabase, password, sessionId)
      if (fresh) onAnalysed(fresh)
      else setError("L'analyse n'a pas pu être relue après l'enregistrement.")
    } catch (e) {
      if (e instanceof AnalysisError) {
        setError(e.message)
      } else {
        const msg = extractErr(e)
        if (/mot de passe|password/i.test(msg)) onAuthError()
        else setError(msg)
      }
    } finally {
      setRunning(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-bleu-fonce/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="analyse-avant-repartition"
    >
      <div className="w-full max-w-lg bg-white shadow-2xl max-h-[90vh] flex flex-col overflow-hidden rounded-[12px] ring-1 ring-white/10 animate-entree">
        <EnTeteFenetre
          titre={<span id="analyse-avant-repartition">Analyser les camps d'opinion ?</span>}
          sousTitre="La répartition s'appuie sur la dernière analyse des assertions et des camps."
        />
        <div className="overflow-y-auto p-5 space-y-4">
          {loading ? (
            <p className="text-sm text-gray-600" role="status">Chargement de l'analyse…</p>
          ) : analysis && analysis.members.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-600">
                Dernière analyse : {analysis.k_chosen} camp{analysis.k_chosen > 1 ? 's' : ''},{' '}
                {analysis.members.length} personne{analysis.members.length > 1 ? 's' : ''},{' '}
                le {new Date(analysis.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}.
              </p>
              <ScatterPlot members={analysis.members} kChosen={analysis.k_chosen} groupNames={groupNames} />
            </div>
          ) : (
            <p className="rounded-[8px] text-sm text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2">
              Aucune analyse n'existe pour cette séance : sans elle, la règle d'hétérogénéité des camps est désactivée.
            </p>
          )}

          {error && (
            <p role="alert" className="rounded-[8px] text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2">{error}</p>
          )}
        </div>
        <div className="shrink-0 border-t border-bleu-fonce/10 p-4 space-y-2">
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onSkip}
            disabled={running}
            className="rounded-[8px] flex-1 py-3 border border-bleu-fonce/20 text-bleu-fonce text-sm font-semibold hover:border-bleu-fonce/40 hover:bg-bleu-fonce/[0.04] disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2"
          >
            Calculer sans analyser
          </button>
          <button
            onClick={handleAnalyse}
            disabled={running || loading}
            className="rounded-[8px] flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2"
          >
            {running ? 'Analyse en cours…' : 'Analyser puis calculer'}
          </button>
        </div>
        <button
          onClick={onCancel}
          disabled={running}
          className="w-full text-xs text-gray-600 underline disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
        >
          Annuler
        </button>
        </div>
      </div>
    </div>
  )
}
