// =============================================================
// LLMModerationPanel — Panneau de modération IA (Gemini)
// Accessible en phases draft, voting, allocating.
// Ne pas importer useLiveMs — pas de timer d'affichage.
// =============================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { listAssertionsAdmin, approveAssertion, rejectAssertion, mergeAssertionVotes, updateAssertionContent } from '../../lib/voting'
import { moderateAssertions, mergeAssertions } from '../../lib/gemini'
import {
  recordAiUsage,
  readAiLog,
  readDayTokens,
  estimateEnergyWh,
  formatEnergy,
  phoneChargeEquivalent,
  WH_PER_TOKEN_LABEL,
  type DayTokens,
} from '../../lib/aiUsage'
import type { AssertionAdmin } from '../../lib/voting'
import type { Session } from '../../lib/types'

// ── Types localStorage ────────────────────────────────────────

interface MergeLogEntry {
  keep_id: string
  keep_content: string
  reject_ids: string[]
  reject_contents: string[]
  reason: string
  timestamp: string
}

// Fusion PROPOSÉE par Gemini mais PAS encore appliquée — en attente de
// validation humaine (chantier 7 / B4). Snapshot auto-suffisant du contenu
// pour survivre à un rechargement même si la liste d'assertions n'est plus
// en mémoire. Persisté dans localStorage (`merge_proposals_<id>`).
interface ProposedMerge {
  keep_id: string
  keep_content: string
  reject_ids: string[]
  reject_contents: string[]
  reason: string
  // Formulation combinée suggérée par Gemini : réunit les deux assertions
  // en une seule. Optionnelle. Éditable par le modérateur avant application
  // via le bouton « Fusionner en formulation combinée » (chantier 7 / B4).
  merged_content?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── Helpers localStorage ──────────────────────────────────────

function readMergeLog(sessionId: string): MergeLogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(`merge_log_${sessionId}`) ?? '[]') as MergeLogEntry[]
  } catch {
    return []
  }
}

function readMergeProposals(sessionId: string): ProposedMerge[] {
  try {
    return JSON.parse(localStorage.getItem(`merge_proposals_${sessionId}`) ?? '[]') as ProposedMerge[]
  } catch {
    return []
  }
}

function writeMergeProposals(sessionId: string, proposals: ProposedMerge[]) {
  localStorage.setItem(`merge_proposals_${sessionId}`, JSON.stringify(proposals))
}

// Clé d'identité d'une proposition (keep + ensemble des reject), pour dédupliquer.
function proposalKey(p: { keep_id: string; reject_ids: string[] }): string {
  return `${p.keep_id}|${[...p.reject_ids].sort().join(',')}`
}

// Transforme la sortie Gemini en propositions self-contained (snapshot du
// contenu), en ignorant tout id inconnu / non approuvé. `byId` = id → contenu
// des assertions approuvées au moment de l'appel.
function buildFreshProposals(
  results: { keep_id: string; reject_ids?: string[]; merged_content?: string; reason?: string }[],
  byId: Map<string, string>,
): ProposedMerge[] {
  return results
    .map(m => {
      const rejectIds = (Array.isArray(m.reject_ids) ? m.reject_ids : [])
        .filter(id => UUID_RE.test(id) && byId.has(id) && id !== m.keep_id)
      const merged = typeof m.merged_content === 'string' && m.merged_content.trim().length > 0
        ? m.merged_content.trim()
        : undefined
      return {
        keep_id:         m.keep_id,
        keep_content:    byId.get(m.keep_id) ?? m.keep_id,
        reject_ids:      rejectIds,
        reject_contents: rejectIds.map(id => byId.get(id) ?? id),
        reason:          m.reason ?? '',
        merged_content:  merged,
      }
    })
    .filter(m => byId.has(m.keep_id) && m.reject_ids.length > 0)
}

// Ajoute `fresh` à `existing` sans réintroduire de doublon (même keep + rejects).
function mergeProposalLists(existing: ProposedMerge[], fresh: ProposedMerge[]): ProposedMerge[] {
  const seen = new Set(existing.map(proposalKey))
  const out = [...existing]
  for (const p of fresh) {
    const key = proposalKey(p)
    if (!seen.has(key)) { out.push(p); seen.add(key) }
  }
  return out
}

function readAiRejectedIds(sessionId: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(`ai_rejected_ids_${sessionId}`) ?? '[]') as string[]) }
  catch { return new Set() }
}
function addAiRejectedIds(sessionId: string, ids: string[]) {
  const existing = readAiRejectedIds(sessionId)
  ids.forEach(id => existing.add(id))
  localStorage.setItem(`ai_rejected_ids_${sessionId}`, JSON.stringify([...existing]))
}
function removeAiRejectedId(sessionId: string, id: string) {
  const existing = readAiRejectedIds(sessionId)
  existing.delete(id)
  localStorage.setItem(`ai_rejected_ids_${sessionId}`, JSON.stringify([...existing]))
}

function readAiApprovedIds(sessionId: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(`ai_approved_ids_${sessionId}`) ?? '[]') as string[]) }
  catch { return new Set() }
}
function addAiApprovedIds(sessionId: string, ids: string[]) {
  const existing = readAiApprovedIds(sessionId)
  ids.forEach(id => existing.add(id))
  localStorage.setItem(`ai_approved_ids_${sessionId}`, JSON.stringify([...existing]))
}

// Le journal + les compteurs journaliers sont centralisés dans lib/aiUsage
// (recordAiUsage) afin que le nommage des camps soit aussi comptabilisé.

// ── Composant principal ───────────────────────────────────────

interface LLMModerationPanelProps {
  session: Session
  password: string
}

export default function LLMModerationPanel({ session, password }: LLMModerationPanelProps) {
  const [open, setOpen]           = useState(() => readAiLog(session.id).length > 0)
  const [isLoading, setIsLoading] = useState(false)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [isError, setIsError]     = useState(false)
  const [showReport, setShowReport] = useState(false)

  // Fusions proposées par Gemini, en attente de validation humaine (B4)
  const [proposals, setProposals] = useState<ProposedMerge[]>(() => readMergeProposals(session.id))

  // Assertions rejetées
  const [rejectedAssertions, setRejectedAssertions] = useState<AssertionAdmin[]>([])

  // Toggles auto-modération (initialisés depuis localStorage)
  const [autoModerate, setAutoModerateState] = useState(
    () => localStorage.getItem(`ai_auto_moderate_${session.id}`) === 'true'
  )
  const [intervalMinutes, setIntervalMinutesState] = useState(
    () => parseInt(localStorage.getItem(`ai_auto_interval_${session.id}`) ?? '3', 10)
  )
  const [autoMerge, setAutoMergeState] = useState(
    () => localStorage.getItem(`ai_auto_merge_${session.id}`) === 'true'
  )

  const isAutoModeratingRef = useRef<boolean>(false)

  // Toggles auto-fusion périodique (initialisés depuis localStorage)
  const [autoMergePeriodic, setAutoMergePeriodicState] = useState(
    () => localStorage.getItem(`ai_auto_merge_periodic_${session.id}`) === 'true'
  )
  const [mergeIntervalMinutes, setMergeIntervalMinutesState] = useState(
    () => parseInt(localStorage.getItem(`ai_auto_merge_interval_${session.id}`) ?? '10', 10)
  )
  const isAutoMergingRef = useRef<boolean>(false)

  // ── Persistance toggles ─────────────────────────────────────

  function setAutoModerate(v: boolean) {
    setAutoModerateState(v)
    localStorage.setItem(`ai_auto_moderate_${session.id}`, String(v))
  }
  function setIntervalMinutes(v: number) {
    setIntervalMinutesState(v)
    localStorage.setItem(`ai_auto_interval_${session.id}`, String(v))
  }
  function setAutoMerge(v: boolean) {
    setAutoMergeState(v)
    localStorage.setItem(`ai_auto_merge_${session.id}`, String(v))
  }
  function setAutoMergePeriodic(v: boolean) {
    setAutoMergePeriodicState(v)
    localStorage.setItem(`ai_auto_merge_periodic_${session.id}`, String(v))
  }
  function setMergeIntervalMinutes(v: number) {
    setMergeIntervalMinutesState(v)
    localStorage.setItem(`ai_auto_merge_interval_${session.id}`, String(v))
  }

  // ── Chargement assertions rejetées ──────────────────────────

  const loadRejected = useCallback(async () => {
    try {
      const all = await listAssertionsAdmin(password, session.id)
      const aiIds = readAiRejectedIds(session.id)
      setRejectedAssertions(all.filter(a => a.status === 'rejected' && aiIds.has(a.id)))
    } catch {
      // silencieux — la section s'affichera vide
    }
  }, [password, session.id])

  useEffect(() => {
    loadRejected()
  }, [loadRejected])

  // ── Utilitaire affichage message ────────────────────────────

  function showMsg(msg: string, error = false) {
    setActionMsg(msg)
    setIsError(error)
  }

  // ── Action : Modérer les assertions ────────────────────────

  async function handleModerate() {
    setIsLoading(true)
    setActionMsg(null)
    try {
      const all = await listAssertionsAdmin(password, session.id)
      const pending = all.filter(a => a.status === 'pending')
      if (!pending.length) {
        showMsg('Aucune assertion en attente')
        return
      }
      const { results, tokens_used } = await moderateAssertions({
        session_id: session.id,
        session_title: session.title,
        session_description: session.description,
        assertions: pending.map(a => ({ id: a.id, content: a.content })),
      })
      let approved = 0, rejected = 0
      for (const r of results) {
        if (r.action === 'approve') { await approveAssertion(password, r.id); approved++ }
        else                        { await rejectAssertion(password, r.id); rejected++ }
      }
      addAiRejectedIds(session.id, results.filter(r => r.action === 'reject').map(r => r.id))
      addAiApprovedIds(session.id, results.filter(r => r.action === 'approve').map(r => r.id))
      recordAiUsage(session.id, 'moderate', `${approved} approuvées, ${rejected} rejetées`, tokens_used)
      showMsg(`✅ ${approved} approuvées, ${rejected} rejetées`)
      await loadRejected()
    } catch (e) {
      showMsg(e instanceof Error ? e.message : String(e), true)
    } finally {
      setIsLoading(false)
    }
  }

  // ── Persistance proposals ───────────────────────────────────

  function updateProposals(next: ProposedMerge[]) {
    setProposals(next)
    writeMergeProposals(session.id, next)
  }

  // ── Action : Analyser les doublons (proposer, sans appliquer) ─
  // Chantier 7 / B4 : la fusion est désormais un flux en deux temps.
  // 1) Gemini PROPOSE des fusions (cette fonction). 2) Le modérateur les
  // valide/ignore une par une avant toute écriture en base (handleApplyProposal).
  // La fusion n'altère plus jamais les assertions sans validation humaine.

  async function handleAnalyzeMerges() {
    setIsLoading(true)
    setActionMsg(null)
    try {
      const all = await listAssertionsAdmin(password, session.id)
      const approved = all.filter(a => a.status === 'approved')
      if (approved.length < 2) {
        showMsg('Pas assez d\'assertions approuvées (minimum 2)')
        return
      }
      const { results, tokens_used } = await mergeAssertions({
        session_id: session.id,
        session_title: session.title,
        session_description: session.description,
        assertions: approved.map(a => ({ id: a.id, content: a.content })),
      })
      recordAiUsage(session.id, 'analyse-fusion', `${results.length} fusion(s) proposée(s)`, tokens_used)

      // Construire les propositions self-contained (snapshot du contenu) et les
      // ajouter à celles déjà en attente, sans doublon.
      const byId = new Map(approved.map(a => [a.id, a.content]))
      const fresh = buildFreshProposals(results, byId)
      updateProposals(mergeProposalLists(readMergeProposals(session.id), fresh))

      if (fresh.length === 0) {
        showMsg('Aucun doublon détecté — rien à fusionner')
      } else {
        showMsg(`🔎 ${fresh.length} fusion(s) proposée(s) — à valider ci-dessous`)
      }
    } catch (e) {
      showMsg(e instanceof Error ? e.message : String(e), true)
    } finally {
      setIsLoading(false)
    }
  }

  // ── Choisir quelle assertion conserver dans une proposition ──
  // Utile car pour deux quasi-doublons, laquelle est « canonique » (mieux
  // formulée) relève du jugement humain, pas de l'ordre renvoyé par Gemini.

  function swapKeep(index: number, newKeepId: string) {
    const p = proposals[index]
    if (!p || p.keep_id === newKeepId) return
    const all = [
      { id: p.keep_id, content: p.keep_content },
      ...p.reject_ids.map((id, i) => ({ id, content: p.reject_contents[i] ?? id })),
    ]
    const keep = all.find(a => a.id === newKeepId)
    if (!keep) return
    const rejects = all.filter(a => a.id !== newKeepId)
    const next = proposals.map((pp, i) => i === index ? {
      ...pp,
      keep_id:         keep.id,
      keep_content:    keep.content,
      reject_ids:      rejects.map(r => r.id),
      reject_contents: rejects.map(r => r.content),
    } : pp)
    updateProposals(next)
  }

  // ── Ignorer une proposition (sans l'appliquer) ───────────────

  function ignoreProposal(index: number) {
    updateProposals(proposals.filter((_, i) => i !== index))
  }

  // ── Éditer la formulation combinée d'une proposition ─────────

  function editMergedContent(index: number, value: string) {
    updateProposals(proposals.map((pp, i) => i === index ? { ...pp, merged_content: value } : pp))
  }

  // ── Appliquer UNE proposition validée par le modérateur ──────
  // mode 'keep'    : on conserve l'assertion « ✅ » telle quelle, on rejette les
  //                  autres et on leur transfère les votes.
  // mode 'combine' : on réécrit d'abord l'assertion conservée avec la
  //                  formulation combinée (réunit les deux), puis idem.
  //                  Nécessite la migration update_assertion_content.

  async function handleApplyProposal(index: number, mode: 'keep' | 'combine' = 'keep') {
    const p = proposals[index]
    if (!p) return
    const combined = p.merged_content?.trim()
    if (mode === 'combine' && !combined) {
      showMsg('Aucune formulation combinée à appliquer', true)
      return
    }
    setIsLoading(true)
    setActionMsg(null)
    try {
      if (mode === 'combine' && combined) {
        await updateAssertionContent(password, p.keep_id, combined)
      }
      for (const rid of p.reject_ids) {
        if (!UUID_RE.test(rid)) continue
        await mergeAssertionVotes(password, p.keep_id, rid)
        await rejectAssertion(password, rid)
      }
      // Journaliser la fusion effectuée (réutilise le merge_log existant + undo)
      const existing = readMergeLog(session.id)
      const entry: MergeLogEntry = {
        keep_id:         p.keep_id,
        keep_content:    mode === 'combine' && combined ? combined : p.keep_content,
        reject_ids:      p.reject_ids,
        reject_contents: p.reject_contents,
        reason:          p.reason,
        timestamp:       new Date().toISOString(),
      }
      localStorage.setItem(`merge_log_${session.id}`, JSON.stringify([entry, ...existing].slice(0, 100)))
      updateProposals(proposals.filter((_, i) => i !== index))
      showMsg(mode === 'combine' ? '✅ Fusion en formulation combinée appliquée' : '✅ Fusion appliquée')
    } catch (e) {
      showMsg(e instanceof Error ? e.message : String(e), true)
    } finally {
      setIsLoading(false)
    }
  }

  // ── Appliquer TOUTES les propositions restantes ──────────────

  async function handleApplyAllProposals() {
    if (proposals.length === 0) return
    setIsLoading(true)
    setActionMsg(null)
    try {
      const snapshot = [...proposals]
      const logEntries: MergeLogEntry[] = []
      let done = 0
      for (const p of snapshot) {
        try {
          for (const rid of p.reject_ids) {
            if (!UUID_RE.test(rid)) continue
            await mergeAssertionVotes(password, p.keep_id, rid)
            await rejectAssertion(password, rid)
          }
          logEntries.push({
            keep_id:         p.keep_id,
            keep_content:    p.keep_content,
            reject_ids:      p.reject_ids,
            reject_contents: p.reject_contents,
            reason:          p.reason,
            timestamp:       new Date().toISOString(),
          })
          done++
        } catch {
          // On garde les propositions non appliquées (voir plus bas)
        }
      }
      const existing = readMergeLog(session.id)
      localStorage.setItem(`merge_log_${session.id}`, JSON.stringify([...logEntries, ...existing].slice(0, 100)))
      // Retirer uniquement celles réellement appliquées
      const appliedKeys = new Set(logEntries.map(e => `${e.keep_id}|${[...e.reject_ids].sort().join(',')}`))
      updateProposals(proposals.filter(p => !appliedKeys.has(`${p.keep_id}|${[...p.reject_ids].sort().join(',')}`)))
      showMsg(`✅ ${done} fusion(s) appliquée(s)${done < snapshot.length ? ` — ${snapshot.length - done} en échec (conservées)` : ''}`, done < snapshot.length)
    } catch (e) {
      showMsg(e instanceof Error ? e.message : String(e), true)
    } finally {
      setIsLoading(false)
    }
  }

  function ignoreAllProposals() {
    updateProposals([])
    showMsg('Propositions de fusion ignorées')
  }

  // ── setInterval auto-modération ────────────────────────────

  useEffect(() => {
    if (!autoModerate || !['voting', 'pre_voting'].includes(session.phase)) return
    const intervalMs = intervalMinutes * 60 * 1000
    const id = setInterval(async () => {
      if (isAutoModeratingRef.current) return
      isAutoModeratingRef.current = true
      try {
        const all = await listAssertionsAdmin(password, session.id)
        const pending = all.filter(a => a.status === 'pending')
        if (!pending.length) return
        const { results, tokens_used } = await moderateAssertions({
          session_id: session.id,
          session_title: session.title,
          session_description: session.description,
          assertions: pending.map(a => ({ id: a.id, content: a.content })),
        })
        let approved = 0, rejected = 0
        for (const r of results) {
          if (r.action === 'approve') { await approveAssertion(password, r.id); approved++ }
          else                        { await rejectAssertion(password, r.id); rejected++ }
        }
        addAiRejectedIds(session.id, results.filter(r => r.action === 'reject').map(r => r.id))
        addAiApprovedIds(session.id, results.filter(r => r.action === 'approve').map(r => r.id))
        recordAiUsage(session.id, 'auto-moderate', `${approved} approuvées, ${rejected} rejetées`, tokens_used)
      } catch {
        // Silencieux en mode auto — erreurs loggées dans la console uniquement
      } finally {
        isAutoModeratingRef.current = false
      }
    }, intervalMs)
    return () => clearInterval(id)
  }, [autoModerate, intervalMinutes, session.phase, session.id, session.title, session.description, password])

  // ── setInterval auto-fusion périodique ────────────────────
  // Chantier 7 / B4 : l'auto-fusion ne fusionne plus jamais toute seule. Elle
  // se contente d'ANALYSER périodiquement et d'empiler des PROPOSITIONS, que le
  // modérateur valide manuellement. Aucune écriture en base sans validation.

  useEffect(() => {
    if (!autoMergePeriodic || !['voting', 'pre_voting'].includes(session.phase)) return
    const intervalMs = mergeIntervalMinutes * 60 * 1000
    const id = setInterval(async () => {
      if (isAutoMergingRef.current) return
      isAutoMergingRef.current = true
      try {
        const all = await listAssertionsAdmin(password, session.id)
        const approved = all.filter(a => a.status === 'approved')
        if (approved.length < 2) return
        const { results, tokens_used } = await mergeAssertions({
          session_id: session.id,
          session_title: session.title,
          session_description: session.description,
          assertions: approved.map(a => ({ id: a.id, content: a.content })),
        })
        const byId = new Map(approved.map(a => [a.id, a.content]))
        const fresh = buildFreshProposals(results, byId)
        if (fresh.length > 0) {
          updateProposals(mergeProposalLists(readMergeProposals(session.id), fresh))
        }
        recordAiUsage(session.id, 'auto-analyse-fusion', `${fresh.length} fusion(s) proposée(s)`, tokens_used)
      } catch {
        // Silencieux en mode auto
      } finally {
        isAutoMergingRef.current = false
      }
    }, intervalMs)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMergePeriodic, mergeIntervalMinutes, session.phase, session.id, session.title, session.description, password])

  // ── Données rapport (calculées au render) ───────────────────

  const log = readAiLog(session.id)
  const mergeLog = readMergeLog(session.id)

  const sessionTokens = log.reduce((s, e) => s + e.tokens_used, 0)
  const dayTokens: DayTokens = readDayTokens()

  // Impact énergétique estimé (C6) — indicatif, cf. lib/aiUsage
  const sessionEnergyWh = estimateEnergyWh(sessionTokens)
  const dayEnergyWh     = estimateEnergyWh(dayTokens.total_tokens)

  const showRejectSection = session.moderation_policy === 'ai' || session.moderation_policy === 'closed'

  // ── Rendu ───────────────────────────────────────────────────

  return (
    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">

      {/* En-tête accordéon */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          🤖 Modération IA
          {(autoModerate || autoMergePeriodic) && ['voting', 'pre_voting'].includes(session.phase) && (
            <span className="ml-2 font-normal normal-case text-emerald-600">● auto</span>
          )}
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

          {/* Message succès / erreur */}
          {actionMsg && (
            <div className={`rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-2 ${
              isError
                ? 'bg-red-50 border border-red-200 text-red-700'
                : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
            }`}>
              <span>{actionMsg}</span>
              <button onClick={() => setActionMsg(null)} className="shrink-0 opacity-50 hover:opacity-100">✕</button>
            </div>
          )}

          {/* ── Section Actions manuelles ─── */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Actions manuelles
            </h4>
            <div className="flex flex-wrap gap-2">

              <button
                onClick={handleModerate}
                disabled={isLoading}
                className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading && (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                Modérer les assertions
              </button>

              <button
                onClick={handleAnalyzeMerges}
                disabled={isLoading}
                className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading && (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                Analyser les doublons
                {proposals.length > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-white/25 text-xs font-semibold">
                    {proposals.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setShowReport(r => !r)}
                className="text-sm px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                {showReport ? 'Masquer le rapport' : 'Rapport'}
              </button>
            </div>
          </div>

          {/* ── Section Fusions proposées (validation humaine — B4) ─── */}
          {proposals.length > 0 && (
            <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold text-purple-700 uppercase tracking-wide">
                  Fusions proposées — à valider
                  <span className="ml-2 font-normal normal-case text-purple-400">({proposals.length})</span>
                </h4>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={handleApplyAllProposals}
                    disabled={isLoading}
                    className="text-xs px-2.5 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
                  >
                    Tout fusionner
                  </button>
                  <button
                    onClick={ignoreAllProposals}
                    disabled={isLoading}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-white disabled:opacity-50 transition-colors"
                  >
                    Tout ignorer
                  </button>
                </div>
              </div>

              <p className="text-xs text-gray-500">
                Chaque fusion supprime les assertions « ❌ » et transfère leurs votes vers l'assertion « ✅ » conservée.
                Rien n'est modifié tant que tu n'as pas validé. Tu peux choisir laquelle conserver.
              </p>

              <div className="space-y-3">
                {proposals.map((p, i) => {
                  const all = [
                    { id: p.keep_id, content: p.keep_content, keep: true },
                    ...p.reject_ids.map((id, ri) => ({ id, content: p.reject_contents[ri] ?? id, keep: false })),
                  ]
                  return (
                    <div key={`${p.keep_id}-${i}`} className="bg-white rounded-xl border border-purple-100 p-3 space-y-2">
                      <div className="space-y-1.5">
                        {all.map(a => (
                          <div
                            key={a.id}
                            className={`flex items-start gap-2 rounded-lg px-2 py-1.5 ${
                              a.keep ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50/60 border border-red-100'
                            }`}
                          >
                            <span className="shrink-0 text-sm leading-5">{a.keep ? '✅' : '❌'}</span>
                            <p className={`flex-1 text-sm ${a.keep ? 'text-gray-800 font-medium' : 'text-gray-500 line-through'}`}>
                              {a.content}
                            </p>
                            {!a.keep && (
                              <button
                                onClick={() => swapKeep(i, a.id)}
                                disabled={isLoading}
                                title="Conserver celle-ci à la place"
                                className="shrink-0 text-xs px-2 py-0.5 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 transition-colors"
                              >
                                Garder celle-ci
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      {p.reason && (
                        <p className="text-xs text-gray-500 italic border-l-2 border-purple-200 pl-2">
                          💬 {p.reason}
                        </p>
                      )}

                      {/* Formulation combinée (chantier 7) — éditable avant application */}
                      {p.merged_content !== undefined && (
                        <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 space-y-1">
                          <label className="block text-[11px] font-semibold text-amber-700 uppercase tracking-wide">
                            ✨ Formulation combinée (réunit les deux)
                          </label>
                          <textarea
                            value={p.merged_content}
                            onChange={e => editMergedContent(i, e.target.value)}
                            disabled={isLoading}
                            rows={2}
                            className="w-full text-sm text-gray-800 bg-white rounded border border-amber-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-400 resize-y disabled:opacity-50"
                          />
                          <p className="text-[11px] text-amber-600">
                            Remplace le texte de l'assertion « ✅ » par cette version, puis rejette l'autre et transfère ses votes.
                          </p>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 pt-0.5">
                        {p.merged_content !== undefined && p.merged_content.trim().length > 0 && (
                          <button
                            onClick={() => handleApplyProposal(i, 'combine')}
                            disabled={isLoading}
                            className="flex-1 min-w-[8rem] text-xs px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
                          >
                            ✨ Fusionner (formulation combinée)
                          </button>
                        )}
                        <button
                          onClick={() => handleApplyProposal(i, 'keep')}
                          disabled={isLoading}
                          className="flex-1 min-w-[8rem] text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                        >
                          ✓ Garder « ✅ » telle quelle
                        </button>
                        <button
                          onClick={() => ignoreProposal(i)}
                          disabled={isLoading}
                          className="flex-1 min-w-[6rem] text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                        >
                          ✗ Ignorer
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Section Rapport ─── */}
          {showReport && (
            <div className="space-y-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Consommation API
              </h4>

              {/* Requêtes aujourd'hui */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-600">
                  <span>Requêtes aujourd'hui</span>
                  <span className="font-mono">{dayTokens.request_count} / 1 500</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-indigo-400 rounded-full transition-all"
                    style={{ width: `${Math.min(dayTokens.request_count / 1500 * 100, 100)}%` }}
                  />
                </div>
              </div>

              {/* Tokens cette séance */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-600">
                  <span>Tokens cette séance</span>
                  <span className="font-mono">{sessionTokens.toLocaleString('fr-FR')}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-purple-400 rounded-full transition-all"
                    style={{ width: `${Math.min(sessionTokens / 1_000_000 * 100, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400">Référence : 1M tokens/min (limite burst, indicatif)</p>
              </div>

              {/* Impact énergétique estimé (C6) */}
              <div className="space-y-1 bg-emerald-50/60 border border-emerald-100 rounded-xl px-3 py-2.5">
                <div className="flex justify-between text-xs text-gray-600">
                  <span className="flex items-center gap-1">🌱 Énergie estimée — cette séance</span>
                  <span className="font-mono text-emerald-700">{formatEnergy(sessionEnergyWh)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Aujourd'hui (toutes séances)</span>
                  <span className="font-mono">{formatEnergy(dayEnergyWh)}</span>
                </div>
                {sessionEnergyWh > 0 && (
                  <p className="text-xs text-gray-400">
                    ≈ {phoneChargeEquivalent(sessionEnergyWh).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} charge(s) de smartphone.
                    {' '}Ordre de grandeur indicatif ({WH_PER_TOKEN_LABEL}), pas une mesure.
                  </p>
                )}
              </div>

              {/* Historique log */}
              {log.length > 0 ? (
                <div className="space-y-1">
                  <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Historique</h5>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {log.map((e, i) => (
                      <div key={i} className="text-xs text-gray-600 flex justify-between gap-2">
                        <span className="text-gray-400 shrink-0">
                          {new Date(e.timestamp).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                        </span>
                        <span className="flex-1">{e.action} — {e.summary}</span>
                        <span className="font-mono text-gray-400 shrink-0">{e.tokens_used} tok</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400">Aucun appel Gemini enregistré pour cette séance.</p>
              )}
            </div>
          )}

          {/* ── Section Assertions rejetées par l'IA ─── */}
          {showRejectSection && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Assertions rejetées par l'IA
                {rejectedAssertions.length > 0 && (
                  <span className="ml-2 font-normal normal-case text-gray-400">
                    ({rejectedAssertions.length})
                  </span>
                )}
              </h4>
              {rejectedAssertions.length === 0 ? (
                <p className="text-xs text-gray-400">Aucune assertion rejetée.</p>
              ) : (
                <div className="space-y-2">
                  {rejectedAssertions.map(a => (
                    <div key={a.id} className="flex items-start gap-3 bg-gray-50 rounded-xl px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800">{a.content}</p>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            await approveAssertion(password, a.id)
                            removeAiRejectedId(session.id, a.id)
                            await loadRejected()
                          } catch (e) {
                            showMsg(e instanceof Error ? e.message : String(e), true)
                          }
                        }}
                        disabled={isLoading}
                        className="shrink-0 text-xs px-2 py-1 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 transition-colors"
                      >
                        Accepter quand même
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Section Fusions effectuées ─── */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Fusions effectuées
              {mergeLog.length > 0 && (
                <span className="ml-2 font-normal normal-case text-gray-400">
                  ({mergeLog.length})
                </span>
              )}
            </h4>
            {mergeLog.length === 0 ? (
              <p className="text-xs text-gray-400">Aucune fusion enregistrée.</p>
            ) : (
              <div className="space-y-2">
                {mergeLog.map((m, i) => (
                  <div key={i} className="flex items-start gap-3 bg-gray-50 rounded-xl px-3 py-2">
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-xs text-gray-700">
                        <span className="font-medium text-green-700">✅ Conservée :</span>{' '}
                        {m.keep_content || <span className="font-mono text-gray-400">{m.keep_id.slice(0, 8)}…</span>}
                      </p>
                      {m.reject_contents?.length > 0 ? (
                        <div className="space-y-0.5">
                          <span className="font-medium text-red-600 text-xs">❌ Supprimées :</span>
                          {m.reject_contents.map((content, ci) => (
                            <p key={ci} className="text-xs text-gray-500 pl-3 border-l-2 border-red-100">{content}</p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">
                          <span className="font-medium">Supprimées :</span>{' '}
                          {m.reject_ids.map(id => id.slice(0, 8) + '…').join(', ')}
                        </p>
                      )}
                      {m.reason && (
                        <p className="text-xs text-gray-500 italic mt-1 border-l-2 border-gray-200 pl-2">{m.reason}</p>
                      )}
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          for (const rid of m.reject_ids) {
                            await approveAssertion(password, rid)
                          }
                          // Retirer du merge_log localStorage
                          const updated = readMergeLog(session.id).filter((_, idx) => idx !== i)
                          localStorage.setItem(`merge_log_${session.id}`, JSON.stringify(updated))
                          // Forcer re-render en touchant un state (mergeLog est recalculé au render)
                          setActionMsg('Fusion annulée')
                          setIsError(false)
                        } catch (e) {
                          showMsg(e instanceof Error ? e.message : String(e), true)
                        }
                      }}
                      disabled={isLoading}
                      className="shrink-0 text-xs px-2 py-1 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50 transition-colors"
                    >
                      Annuler
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Section Automatisation (uniquement si policy = 'ai') ─── */}
          {session.moderation_policy === 'ai' && (
            <div className="border-t border-gray-100 pt-4 space-y-3">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Automatisation
              </h4>

              {/* Toggle Auto-modérer */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Auto-modérer</span>
                <button
                  onClick={() => setAutoModerate(!autoModerate)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    autoModerate ? 'bg-indigo-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      autoModerate ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Slider intervalle */}
              <div className={autoModerate ? '' : 'opacity-40 pointer-events-none'}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700">Intervalle</span>
                  <span className="text-sm font-medium text-gray-700">{intervalMinutes} min</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={intervalMinutes}
                  onChange={e => setIntervalMinutes(Number(e.target.value))}
                  disabled={!autoModerate}
                  className="w-full accent-indigo-600"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>1 min</span>
                  <span>10 min</span>
                </div>
              </div>

              {/* Toggle Fusionner en fin de vote */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Fusionner auto en fin de vote</span>
                <button
                  onClick={() => setAutoMerge(!autoMerge)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    autoMerge ? 'bg-purple-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      autoMerge ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Toggle Fusionner périodiquement */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Fusionner périodiquement</span>
                <button
                  onClick={() => setAutoMergePeriodic(!autoMergePeriodic)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    autoMergePeriodic ? 'bg-purple-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      autoMergePeriodic ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Slider intervalle fusion */}
              <div className={autoMergePeriodic ? '' : 'opacity-40 pointer-events-none'}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700">Intervalle fusion</span>
                  <span className="text-sm font-medium text-gray-700">{mergeIntervalMinutes} min</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={30}
                  step={1}
                  value={mergeIntervalMinutes}
                  onChange={e => setMergeIntervalMinutes(Number(e.target.value))}
                  disabled={!autoMergePeriodic}
                  className="w-full accent-purple-600"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>1 min</span>
                  <span>30 min</span>
                </div>
              </div>

              {!['voting', 'pre_voting'].includes(session.phase) && (autoModerate || autoMergePeriodic) && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  L'automatisation est active mais la séance n'est pas en phase "vote" ou "pré-vote".
                </p>
              )}
            </div>
          )}

        </div>
      )}
    </section>
  )
}
