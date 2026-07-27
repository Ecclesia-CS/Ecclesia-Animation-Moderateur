// =============================================================
// Chantier 19 — Tableau de bord des tables (§7 de la spec + amendements)
//
// Pour chaque table : composition par camp d'opinion, nombre d'actifs,
// caractère enregistrable, et statut de chacun des 4 seuils.
// Composant purement présentationnel : le parent passe des diagnostics
// recalculés (à l'issue de l'algorithme, ou après une retouche manuelle
// via `diagnoseAllocation`) — la mise à jour est donc « en direct ».
// =============================================================

import type { TableDiagnostics } from '../../lib/allocation'

/** Palette des camps d'opinion — alignée sur AnalysisPanel / ResultsMapScreen. */
const CAMP_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6']

export function campColor(groupId: number): string {
  return CAMP_COLORS[groupId % CAMP_COLORS.length]
}

interface Props {
  diagnostics: TableDiagnostics[]
  /** table_number → pseudos, optionnel (affiché replié sous la table). */
  membersByTable?: Record<number, string[]>
  /** table_number → nom du camp dominant (Gemini), optionnel. */
  groupNames?: Record<number, string>
  compact?: boolean
}

/**
 * Barre de composition par camp d'opinion — extraite pour être réutilisable
 * directement sur une carte de groupe (superadmin, §7 « d'un coup d'œil »)
 * sans dupliquer l'en-tête complet de `TableDiagnosticsList`.
 */
export function CampCompositionBar({ d }: { d: TableDiagnostics }) {
  if (Object.keys(d.camp_counts).length === 0) return null
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <div className="flex h-2 rounded-full overflow-hidden flex-1 min-w-[80px] bg-gray-200">
        {Object.entries(d.camp_counts)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([gid, count]) => (
            <div
              key={gid}
              style={{ width: `${(count / d.size) * 100}%`, background: campColor(Number(gid)) }}
              title={`Camp ${Number(gid) + 1} : ${count}`}
            />
          ))}
        {d.neutral_count > 0 && (
          <div
            style={{ width: `${(d.neutral_count / d.size) * 100}%`, background: '#d1d5db' }}
            title={`${d.neutral_count} sans vote`}
          />
        )}
      </div>
      <span className="text-xs text-gray-400 shrink-0">
        {Object.entries(d.camp_counts)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([gid, c]) => `C${Number(gid) + 1}:${c}`)
          .join(' · ')}
        {d.neutral_count > 0 ? ` · ?:${d.neutral_count}` : ''}
      </span>
    </div>
  )
}

export default function TableDiagnosticsList({ diagnostics, membersByTable, compact }: Props) {
  if (diagnostics.length === 0) return null

  return (
    <div className="space-y-2">
      {diagnostics.map(d => (
        <div
          key={d.table_number}
          className={`rounded-xl border px-3 py-2.5 ${
            d.rule1_ok ? 'border-gray-200 bg-gray-50' : 'border-amber-200 bg-amber-50/60'
          }`}
        >
          {/* En-tête */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-sm font-bold text-indigo-700">Table N°{d.table_number}</span>
            <span className="text-xs text-gray-400">{d.size} pers.</span>
            {d.moderated ? (
              <span className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">🎙️ animée</span>
            ) : (
              <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">sans animateur</span>
            )}
            {d.recordable ? (
              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded" title="Aucun non-consentant et table non homogène">
                🎙️ enregistrable
              </span>
            ) : (
              <span
                className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded"
                title={d.non_consenting > 0
                  ? `${d.non_consenting} personne(s) non consentante(s)`
                  : "Table homogène en opinion — un enregistrement n'y apporterait rien"}
              >
                non enregistrable
              </span>
            )}
          </div>

          {/* Composition par camp d'opinion */}
          <div className="mb-2">
            <CampCompositionBar d={d} />
          </div>

          {/* Statut des 4 seuils */}
          <div className="flex flex-wrap gap-1.5">
            <Threshold
              ok={d.rule1_ok}
              label={`actifs ${d.actives}/${d.actives_threshold}`}
              title="Règle 1 — assez de participants qui prennent la parole"
            />
            <Threshold
              ok={d.recordable}
              label="enregistrable"
              title="Règle 2 — table sans non-consentant et non homogène"
            />
            <Threshold
              ok={d.rule3_ok}
              label={d.majority_share === null
                ? 'hétérogénéité n/a'
                : `hétérogénéité ${Math.round((1 - d.majority_share) * 100)} %`}
              title="Règle 3 — camp majoritaire ≤ 70 % et 2e camp ≥ 2 personnes"
            />
            <Threshold
              ok={d.rule4_ok}
              label={`anciens ${d.veterans}/${d.veterans_threshold}`}
              title="Règle 4 — assez de personnes ayant déjà fait un débat"
            />
            {d.newcomers > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-500">
                {d.newcomers} nouveau{d.newcomers > 1 ? 'x' : ''}
              </span>
            )}
          </div>

          {/* Composition nominative */}
          {!compact && membersByTable?.[d.table_number]?.length ? (
            <p className="text-xs text-gray-400 mt-2 leading-snug">
              {membersByTable[d.table_number].join(', ')}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function Threshold({ ok, label, title }: { ok: boolean; label: string; title: string }) {
  return (
    <span
      title={title}
      className={`text-xs px-1.5 py-0.5 rounded border ${
        ok ? 'bg-green-50 border-green-200 text-green-700'
           : 'bg-amber-50 border-amber-200 text-amber-700'
      }`}
    >
      {ok ? '✓' : '✗'} {label}
    </span>
  )
}
