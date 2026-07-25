// =============================================================
// Chantier 19 — Panneau d'allocation v2 (superadmin)
//
// Flow §7 de la spec :
//   1. la séance passe en phase `allocating`
//   2. le superadmin DÉCLENCHE l'allocation ici (pas d'automatisme à
//      l'entrée en phase — amendement à F13)
//   3. l'algorithme crée les tables et affiche le résultat
//   4. retouches (drag & drop des membres, cf. onglet Tables)
//   5. le superadmin déclenche lui-même la phase `debating`
// =============================================================

import { useCallback, useEffect, useState } from 'react'
import { runAllocation, type AllocationResult } from '../../lib/allocation'
import {
  loadAllocationInputs,
  applyAllocation,
  type AllocationInputs,
} from '../../lib/voting'
import { extractErr } from '../../lib/utils'
import TableDiagnosticsList from './TableDiagnosticsList'

interface Props {
  sessionId: string
  password: string
  /** Appelé après persistance réussie — le parent recharge les groupes. */
  onApplied(): void
  onAuthError(): void
}

export default function AllocationPanel({ sessionId, password, onApplied, onAuthError }: Props) {
  const [inputs, setInputs]   = useState<AllocationInputs | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // Saisies superadmin, toutes optionnelles (§3)
  const [extraModerators, setExtraModerators] = useState(0)
  const [recorderCount,   setRecorderCount]   = useState<number | ''>('')

  const [preview, setPreview] = useState<AllocationResult | null>(null)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setInputs(await loadAllocationInputs(password, sessionId))
    } catch (e) {
      const msg = extractErr(e)
      if (/mot de passe|password/i.test(msg)) { onAuthError(); return }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [password, sessionId, onAuthError])

  useEffect(() => { load() }, [load])

  function handleCompute() {
    if (!inputs) return
    setError(null)
    setApplied(null)
    try {
      setPreview(runAllocation({
        members:           inputs.members,
        moderatorIds:      inputs.moderatorIds,
        extraModerators,
        recorderCount:     recorderCount === '' ? null : recorderCount,
        opinionsAvailable: inputs.opinionsAvailable,
      }))
    } catch (e) {
      // L'algorithme ne doit jamais échouer — filet de sécurité malgré tout.
      setError(`Échec du calcul : ${extractErr(e)}`)
    }
  }

  async function handleApply() {
    if (!preview) return
    setApplying(true)
    setError(null)
    try {
      const res = await applyAllocation(password, sessionId, preview)
      setApplied(
        `${res.table_count} table(s) · ${res.member_count} personne(s) placée(s) · ` +
        `${res.tables_created} table(s) créée(s), ${res.tables_reused} réutilisée(s)`,
      )
      onApplied()
    } catch (e) {
      const msg = extractErr(e)
      if (/mot de passe|password/i.test(msg)) { onAuthError(); return }
      setError(msg)
    } finally {
      setApplying(false)
    }
  }

  const memberCount = inputs?.members.length ?? 0
  const capacity    = (inputs?.moderatorIds.length ?? 0) + extraModerators

  return (
    <section className="bg-white rounded-2xl border border-gray-200 px-5 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Allocation des tables
        </p>
        <button
          onClick={load}
          className="text-xs text-gray-400 hover:text-indigo-600 transition-colors"
          title="Recharger les participants"
        >
          ↻
        </button>
      </div>

      {loading && !inputs ? (
        <p className="text-sm text-gray-400 py-2">Chargement des participants…</p>
      ) : !inputs ? (
        <p className="text-sm text-gray-400 py-2">Données indisponibles.</p>
      ) : (
        <>
          {/* Récapitulatif des entrées */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat value={memberCount} label="👥 Présentiels à placer" />
            <Stat value={inputs.moderatorIds.length} label="🎙️ Modérateurs inscrits" />
            <Stat
              value={inputs.opinionsAvailable ? '✓' : '✗'}
              label="📊 Camps d'opinion"
              tone={inputs.opinionsAvailable ? 'ok' : 'warn'}
            />
          </div>

          {!inputs.opinionsAvailable && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 leading-snug">
              ⚠️ Aucune analyse des camps d'opinion : la règle 3 (hétérogénéité) sera
              désactivée. L'allocation se fera sur les règles 1, 2, 4 et 5. Lance
              l'analyse des camps d'abord si tu veux en tenir compte.
            </p>
          )}

          {/* Saisies optionnelles */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-medium text-gray-700 mb-1">
                Modérateurs à ajouter
              </span>
              <input
                type="number" min={0} max={40}
                value={extraModerators}
                onChange={e => setExtraModerators(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <span className="block text-xs text-gray-400 mt-1 leading-snug">
                Ceux qui arrivent sous peu. Capacité retenue : <b>{capacity}</b>
              </span>
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-700 mb-1">
                Enregistreurs disponibles
              </span>
              <input
                type="number" min={0} max={40}
                value={recorderCount}
                placeholder="—"
                onChange={e => setRecorderCount(e.target.value === '' ? '' : Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <span className="block text-xs text-gray-400 mt-1 leading-snug">
                Optionnel — nombre de tables enregistrables visées (défaut : 1)
              </span>
            </label>
          </div>

          <button
            onClick={handleCompute}
            disabled={memberCount === 0}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300
              text-white text-sm font-medium rounded-xl transition-colors"
          >
            🎯 Calculer la répartition
          </button>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          {applied && (
            <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700">
              ✅ Répartition appliquée — {applied}
            </div>
          )}

          {preview && (
            <div className="space-y-3 pt-1">
              <div className="flex items-baseline justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Proposition
                </p>
                <p className="text-xs text-gray-400">
                  {preview.tables.length} table(s) ·{' '}
                  {preview.tables.filter(t => t.moderated).length} animée(s)
                </p>
              </div>

              {preview.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 leading-snug">
                  ⚠️ {w}
                </p>
              ))}

              <TableDiagnosticsList
                diagnostics={preview.diagnostics}
                membersByTable={Object.fromEntries(
                  preview.tables.map(t => [
                    t.table_number,
                    t.member_ids.map(id => inputs.members.find(m => m.member_id === id)?.pseudo ?? '?'),
                  ]),
                )}
              />

              <p className="text-xs text-gray-400 leading-snug">
                Résultat reproductible (graine {preview.seed}) : relancer le calcul sur
                les mêmes participants donne exactement la même répartition.
              </p>

              <button
                onClick={handleApply}
                disabled={applying}
                className="w-full py-2.5 px-4 bg-green-600 hover:bg-green-700 disabled:bg-green-300
                  text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {applying ? 'Application…' : 'Appliquer — créer les tables →'}
              </button>
              <p className="text-xs text-gray-400 text-center leading-snug">
                Les retouches à la main se font ensuite dans l'onglet 🪑 Tables
                (glisser-déposer), puis « Ouvrir le débat ».
              </p>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function Stat({ value, label, tone = 'neutral' }: {
  value: number | string
  label: string
  tone?: 'neutral' | 'ok' | 'warn'
}) {
  const cls = tone === 'ok'   ? 'bg-green-50 text-green-700'
            : tone === 'warn' ? 'bg-amber-50 text-amber-700'
            : 'bg-gray-50 text-gray-700'
  return (
    <div className={`rounded-xl px-2 py-3 ${cls}`}>
      <p className="text-lg font-bold leading-none">{value}</p>
      <p className="text-xs opacity-70 leading-tight mt-1">{label}</p>
    </div>
  )
}
