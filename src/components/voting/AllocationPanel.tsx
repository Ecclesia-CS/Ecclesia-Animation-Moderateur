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
//
// Chantier 25 — retours du test manuel de Jules :
//   · H14 — la proposition survit à un changement d'onglet et à un reload
//           (persistée en sessionStorage, jamais en base).
//   · H16/H12 — sélection des modérateurs réellement présents : les
//           décochés redeviennent des participants ordinaires.
//   · H13 — horodatage du calcul + capacité effective affichée, pour que
//           « relancer » soit visible même quand le résultat est identique.
//   · H15 — objectif d'enregistrement effectif affiché et expliqué.
//
// Chantier 25b — un modérateur en surplus est réinjecté dans la population
//   soumise à `runAllocation` (cf. src/lib/allocation.ts), plus placé après coup.
//
// Chantier 25c — flow de sélection arrêté avec Jules :
//   1. « Calculer » → l'algo détecte un surplus, la liste s'ouvre
//   2. le superadmin décoche ceux qui n'animeront pas
//      → sélection **purement locale** : rien en base, aucun recalcul auto
//   3. « Appliquer » → recalcule avec la sélection, crée les tables, PUIS
//      SEULEMENT en cas de succès retire `is_moderator` aux décochés.
//   Si la création échoue, aucun flag n'est touché : jamais quelqu'un qui
//   perd son statut de modérateur sans que les tables existent.
// =============================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { runAllocation, type AllocationResult } from '../../lib/allocation'
import {
  loadAllocationInputs,
  applyAllocation,
  setMemberModerator,
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

/** H14 — état du panneau conservé hors React (onglets, reload). */
interface PersistedState {
  extraModerators: number
  recorderCount: number | ''
  /**
   * Chantier 25c — modérateurs décochés, en attente d'application. Sélection
   * locale uniquement : leur `is_moderator` est encore `true` en base tant que
   * « Appliquer » n'a pas réussi. Persistée pour survivre à un changement
   * d'onglet, comme le reste de l'état de travail.
   */
  excluded: string[]
  preview: AllocationResult | null
  computedAt: string | null
  /** Signature des entrées au moment du calcul — détecte une proposition périmée. */
  signature: string | null
}

const storageKey = (sessionId: string) => `ecclesia_alloc_preview_${sessionId}`

function readPersisted(sessionId: string): PersistedState | null {
  try {
    const raw = sessionStorage.getItem(storageKey(sessionId))
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<PersistedState>
    return {
      extraModerators: typeof p.extraModerators === 'number' ? p.extraModerators : 0,
      recorderCount:   typeof p.recorderCount === 'number' ? p.recorderCount : '',
      excluded:        Array.isArray(p.excluded) ? p.excluded : [],
      preview:         (p.preview as AllocationResult | undefined) ?? null,
      computedAt:      typeof p.computedAt === 'string' ? p.computedAt : null,
      signature:       typeof p.signature === 'string' ? p.signature : null,
    }
  } catch {
    return null
  }
}

export default function AllocationPanel({ sessionId, password, onApplied, onAuthError }: Props) {
  const restored = useMemo(() => readPersisted(sessionId), [sessionId])

  const [inputs, setInputs]   = useState<AllocationInputs | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // Saisies superadmin, toutes optionnelles (§3)
  const [extraModerators, setExtraModerators] = useState(restored?.extraModerators ?? 0)
  const [recorderCount,   setRecorderCount]   = useState<number | ''>(restored?.recorderCount ?? '')
  /** H16 — modérateurs décochés, gardés visibles pour pouvoir les recocher. */
  const [excluded, setExcluded] = useState<string[]>(restored?.excluded ?? [])

  const [preview, setPreview]     = useState<AllocationResult | null>(restored?.preview ?? null)
  const [computedAt, setComputedAt] = useState<string | null>(restored?.computedAt ?? null)
  const [signature, setSignature] = useState<string | null>(restored?.signature ?? null)
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

  // H14 — toute modification de l'état de travail est persistée immédiatement.
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey(sessionId), JSON.stringify({
        extraModerators, recorderCount, excluded, preview, computedAt, signature,
      } satisfies PersistedState))
    } catch { /* quota / mode privé : la persistance est un confort, pas un prérequis */ }
  }, [sessionId, extraModerators, recorderCount, excluded, preview, computedAt, signature])

  /**
   * Chantier 25c — la liste affiche les modérateurs **de la base**. Décocher ne
   * touche plus à rien : c'est une sélection en mémoire, appliquée seulement au
   * clic sur « Appliquer ».
   */
  const moderatorChoices = useMemo(
    () => [...(inputs?.moderators ?? [])].sort((a, b) => a.pseudo.localeCompare(b.pseudo, 'fr')),
    [inputs],
  )

  /** Modérateurs retenus pour animer (cochés) et ceux repassés en participants. */
  const keptModerators = useMemo(
    () => moderatorChoices.filter(m => !excluded.includes(m.member_id)),
    [moderatorChoices, excluded],
  )
  const droppedModerators = useMemo(
    () => moderatorChoices.filter(m => excluded.includes(m.member_id)),
    [moderatorChoices, excluded],
  )

  /**
   * Signature des entrées — une proposition calculée avant un changement est
   * périmée. Le décochage en fait partie : il change la population soumise à
   * l'algorithme, donc la proposition affichée. En revanche il ne bloque plus
   * « Appliquer », qui relance lui-même le calcul (voir `handleApply`).
   */
  const currentSignature = useMemo(() => {
    if (!inputs) return ''
    return JSON.stringify({
      extraModerators,
      recorderCount,
      excluded: [...excluded].sort(),
      moderators: [...inputs.moderatorIds].sort(),
      members: inputs.members.length,
      opinions: inputs.opinionsAvailable,
    })
  }, [inputs, extraModerators, recorderCount, excluded])

  const isStale = preview !== null && signature !== null && signature !== currentSignature

  /**
   * Chantier 25c — sélection purement locale : aucun appel réseau, aucun
   * recalcul automatique. Le flag `is_moderator` n'est retiré en base qu'au
   * clic sur « Appliquer », et seulement après la création des tables.
   */
  function toggleModerator(memberId: string, next: boolean) {
    setExcluded(prev => next
      ? prev.filter(id => id !== memberId)
      : (prev.includes(memberId) ? prev : [...prev, memberId]))
  }

  /**
   * Construit les entrées de l'algorithme à partir de la sélection courante :
   * un modérateur décoché est un participant comme un autre (avec ses vraies
   * réponses d'onboarding), et n'est plus candidat à l'animation.
   */
  const buildInput = useCallback(() => {
    if (!inputs) return null
    const kept    = inputs.moderators.filter(m => !excluded.includes(m.member_id))
    const dropped = inputs.moderators.filter(m => excluded.includes(m.member_id))
    return {
      members:           [...inputs.members, ...dropped],
      moderatorIds:      kept.map(m => m.member_id),
      moderatorProfiles: kept,
      extraModerators,
      recorderCount:     recorderCount === '' ? null : recorderCount,
      opinionsAvailable: inputs.opinionsAvailable,
    }
  }, [inputs, excluded, extraModerators, recorderCount])

  function handleCompute() {
    const payload = buildInput()
    if (!payload) return
    setError(null)
    setApplied(null)
    try {
      setPreview(runAllocation(payload))
      // H13 — l'horodatage rend le recalcul visible même à résultat identique.
      setComputedAt(new Date().toISOString())
      setSignature(currentSignature)
    } catch (e) {
      // L'algorithme ne doit jamais échouer — filet de sécurité malgré tout.
      setError(`Échec du calcul : ${extractErr(e)}`)
    }
  }

  /**
   * Chantier 25c — ordre des opérations arrêté avec Jules :
   *   1. recalculer avec la sélection courante (la proposition affichée peut
   *      dater d'avant les décochages) ;
   *   2. créer les tables ;
   *   3. **seulement en cas de succès**, retirer `is_moderator` aux décochés.
   * Si la création échoue, aucun flag n'est touché : on ne veut jamais de gens
   * qui perdent leur statut de modérateur sans que les tables existent.
   */
  async function handleApply() {
    const payload = buildInput()
    if (!payload) return
    setApplying(true)
    setError(null)
    try {
      // 1. Recalcul — garantit que ce qu'on persiste correspond à la sélection.
      const final = runAllocation(payload)
      setPreview(final)
      setComputedAt(new Date().toISOString())
      setSignature(currentSignature)

      // 2. Création des tables.
      const res = await applyAllocation(password, sessionId, final)

      // 3. Retrait des statuts, une fois les tables en base.
      const failed: string[] = []
      for (const m of droppedModerators) {
        try {
          await setMemberModerator(password, sessionId, m.member_id, false)
        } catch {
          failed.push(m.pseudo)
        }
      }
      setExcluded([])

      setApplied(
        `${res.table_count} table(s) · ${res.member_count} personne(s) placée(s) · ` +
        `${res.tables_created} table(s) créée(s), ${res.tables_reused} réutilisée(s)` +
        (res.tables_detached ? ` · ${res.tables_detached} table(s) en trop détachée(s)` : '') +
        (res.tables_orphaned
          ? ` · ⚠️ ${res.tables_orphaned} table(s) en trop conservée(s) (des participants les ont déjà rejointes)`
          : '') +
        (droppedModerators.length - failed.length > 0
          ? ` · ${droppedModerators.length - failed.length} modérateur(s) repassé(s) en participant`
          : '') +
        (failed.length > 0
          ? ` · ⚠️ statut non retiré pour ${failed.join(', ')} — à corriger dans l'onglet Participants`
          : ''),
      )
      await load()
      onApplied()
    } catch (e) {
      const msg = extractErr(e)
      if (/mot de passe|password/i.test(msg)) { onAuthError(); return }
      // Aucun flag n'a été touché : la sélection reste telle quelle, réessayable.
      setError(
        `${msg} — aucune table créée et aucun statut de modérateur modifié. ` +
        `Ta sélection est conservée : tu peux réessayer.`,
      )
    } finally {
      setApplying(false)
    }
  }

  // Les décochés sont encore `is_moderator` en base : ils ne comptent pas
  // dans `inputs.members`, on les ajoute pour afficher le nombre réel de sièges.
  const seatCount  = (inputs?.members.length ?? 0) + droppedModerators.length
  const capacity   = keptModerators.length + extraModerators
  const recorderGoal = recorderCount === '' ? 1 : Math.max(1, recorderCount)
  const surplus    = preview?.seatedModeratorIds.length ?? 0

  /**
   * J3 (chantier 30) — le bloc s'ouvre automatiquement dès qu'un surplus ou
   * une exclusion apparaît, mais ne doit JAMAIS se refermer tout seul quand
   * ce surplus retombe à 0 (ex : on recoche le dernier modérateur décoché).
   * Seul le clic explicite sur la flèche de repli (`onToggle`) referme le bloc.
   */
  const detailsShouldAutoOpen = surplus > 0 || excluded.length > 0
  const [detailsOpen, setDetailsOpen] = useState(detailsShouldAutoOpen)
  useEffect(() => {
    if (detailsShouldAutoOpen) setDetailsOpen(true)
  }, [detailsShouldAutoOpen])

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
            <Stat value={seatCount} label="👥 Présentiels à placer" />
            <Stat value={keptModerators.length} label="🎙️ Modérateurs retenus" />
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

          {/* H16 / H12 — qui anime réellement ? */}
          {moderatorChoices.length > 0 && (
            <details
              open={detailsOpen}
              onToggle={e => setDetailsOpen(e.currentTarget.open)}
              className={`rounded-xl border ${
                surplus > 0 ? 'border-amber-300 bg-amber-50/60' : 'border-gray-200 bg-gray-50/60'
              }`}
            >
              <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-gray-700">
                🎙️ Modérateurs présents ({keptModerators.length}/{moderatorChoices.length})
                {excluded.length > 0 && (
                  <span className="text-gray-400 font-normal"> — {excluded.length} à repasser en participant</span>
                )}
              </summary>
              <div className="px-3 pb-3 space-y-1.5">
                {surplus > 0 && (
                  <p className="text-xs text-amber-800 leading-snug">
                    Il y a <b>{surplus} modérateur(s) de plus que de tables animées</b>.
                    Décoche ceux qui n'animeront pas pour choisir toi-même lesquels ;
                    sinon l'algorithme en désigne d'office (les derniers inscrits).
                  </p>
                )}
                <p className="text-xs text-gray-500 leading-snug">
                  Un décoché redevient un participant ordinaire, réparti par l'algorithme
                  comme les autres. <b>Rien n'est enregistré avant « Appliquer »</b> : le
                  statut de modérateur n'est retiré en base qu'une fois les tables créées.
                </p>
                {moderatorChoices.map(m => {
                  const on = !excluded.includes(m.member_id)
                  return (
                    <label key={m.member_id} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleModerator(m.member_id, !on)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
                      />
                      <span className={on ? '' : 'text-gray-400 line-through'}>{m.pseudo}</span>
                      {!on && <span className="text-xs text-gray-400">→ participant</span>}
                    </label>
                  )
                })}
              </div>
            </details>
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
                Objectif visé : <b>{recorderGoal}</b> table(s) enregistrable(s).
                Plus ce nombre est élevé, plus l'algorithme découpe en petites tables.
              </span>
            </label>
          </div>

          <button
            onClick={handleCompute}
            disabled={seatCount === 0}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300
              text-white text-sm font-medium rounded-xl transition-colors"
          >
            🎯 {preview ? 'Recalculer la répartition' : 'Calculer la répartition'}
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
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Proposition
                </p>
                <p className="text-xs text-gray-400">
                  {preview.tables.length} table(s) ·{' '}
                  {preview.tables.filter(t => t.moderated).length} animée(s)
                  {computedAt && (
                    <> · calculé à {new Date(computedAt).toLocaleTimeString('fr-FR')}</>
                  )}
                </p>
              </div>

              {isStale && (
                <p className="text-xs text-amber-800 bg-amber-100 border border-amber-300 rounded-xl px-3 py-2 leading-snug">
                  ⏳ Les réglages ont changé depuis ce calcul (modérateurs décochés,
                  enregistreurs ou participants). « Appliquer » recalculera d'abord la
                  répartition — clique « Recalculer » si tu veux la voir avant.
                </p>
              )}

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
                    t.member_ids.map(id =>
                      inputs.members.find(m => m.member_id === id)?.pseudo ??
                      inputs.moderators.find(m => m.member_id === id)?.pseudo ?? '?'),
                  ]),
                )}
              />

              <p className="text-xs text-gray-400 leading-snug">
                Résultat reproductible (graine {preview.seed}) : relancer le calcul sur
                les mêmes participants et les mêmes réglages donne exactement la même
                répartition. Cette proposition n'est pas encore en base — elle est
                conservée si tu changes d'onglet ou recharges la page. « Appliquer » relance le calcul avec la sélection courante avant de créer les tables.
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
