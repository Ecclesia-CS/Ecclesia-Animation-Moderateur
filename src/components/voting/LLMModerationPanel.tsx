// =============================================================
// LLMModerationPanel — Panneau de modération IA (Gemini)
// Accessible en phases draft, voting, allocating.
// Ne pas importer useLiveMs — pas de timer d'affichage.
// =============================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { listAssertionsAdmin, approveAssertion, rejectAssertion, mergeAssertionVotes } from '../../lib/voting'
import { moderateAssertions, mergeAssertions } from '../../lib/gemini'
import type { AssertionWithPseudo } from '../../lib/voting'
import type { Session } from '../../lib/types'

// ── Types localStorage ────────────────────────────────────────

interface LogEntry {
  timestamp: string
  action: string
  summary: string
  tokens_used: number
}

interface MergeLogEntry {
  keep_id: string
  keep_content: string
  reject_ids: string[]
  reject_contents: string[]
  reason: string
  timestamp: string
}

interface DayTokens {
  total_tokens: number
  request_count: number
}

// ── Helpers localStorage ──────────────────────────────────────

function readLog(sessionId: string): LogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(`ai_log_${sessionId}`) ?? '[]') as LogEntry[]
  } catch {
    return []
  }
}

function readMergeLog(sessionId: string): MergeLogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(`merge_log_${sessionId}`) ?? '[]') as MergeLogEntry[]
  } catch {
    return []
  }
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

function addLogEntry(sessionId: string, action: string, summary: string, tokensUsed: number) {
  const entry: LogEntry = { timestamp: new Date().toISOString(), action, summary, tokens_used: tokensUsed }
  const existing = readLog(sessionId)
  const updated = [entry, ...existing].slice(0, 50)
  localStorage.setItem(`ai_log_${sessionId}`, JSON.stringify(updated))

  // Mise à jour compteurs journaliers
  const today = new Date().toISOString().slice(0, 10)
  const key = `ai_tokens_day_${today}`
  const day: DayTokens = (() => {
    try { return JSON.parse(localStorage.getItem(key) ?? '{"total_tokens":0,"request_count":0}') }
    catch { return { total_tokens: 0, request_count: 0 } }
  })()
  day.total_tokens += tokensUsed
  day.request_count += 1
  localStorage.setItem(key, JSON.stringify(day))
}


// ── Composant principal ───────────────────────────────────────

interface LLMModerationPanelProps {
  session: Session
  password: string
}

export default function LLMModerationPanel({ session, password }: LLMModerationPanelProps) {
  const [open, setOpen]           = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [isError, setIsError]     = useState(false)
  const [showReport, setShowReport] = useState(false)

  // Assertions rejetées
  const [rejectedAssertions, setRejectedAssertions] = useState<AssertionWithPseudo[]>([])

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
      // Tracer les assertions rejetées par l'IA (pour filtrer la section "Rejetées par l'IA")
      addAiRejectedIds(session.id, results.filter(r => r.action === 'reject').map(r => r.id))
      addLogEntry(session.id, 'moderate', `${approved} approuvées, ${rejected} rejetées`, tokens_used)
      showMsg(`✅ ${approved} approuvées, ${rejected} rejetées`)
      await loadRejected()
    } catch (e) {
      showMsg(e instanceof Error ? e.message : String(e), true)
    } finally {
      setIsLoading(false)
    }
  }

  // ── Action : Fusionner les doublons ────────────────────────

  async function handleMerge() {
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
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      for (const m of results) {
        for (const rid of (Array.isArray(m.reject_ids) ? m.reject_ids : [])) {
          if (!UUID_RE.test(rid)) continue
          await mergeAssertionVotes(password, m.keep_id, rid)
          await rejectAssertion(password, rid)
        }
      }
      // Stocker dans merge_log
      const existing = readMergeLog(session.id)
      const newEntries: MergeLogEntry[] = results.map(m => ({
        keep_id:         m.keep_id,
        keep_content:    approved.find(a => a.id === m.keep_id)?.content ?? m.keep_id,
        reject_ids:      m.reject_ids,
        reject_contents: m.reject_ids.map(id => approved.find(a => a.id === id)?.content ?? id),
        reason:          m.reason ?? '',
        timestamp:       new Date().toISOString(),
      }))
      localStorage.setItem(`merge_log_${session.id}`, JSON.stringify([...newEntries, ...existing].slice(0, 100)))
      addLogEntry(session.id, 'merge', `${results.length} fusion(s) effectuée(s)`, tokens_used)
      showMsg(`✅ ${results.length} fusion(s) effectuée(s)`)
    } catch (e) {
      showMsg(e instanceof Error ? e.message : String(e), true)
    } finally {
      setIsLoading(false)
    }
  }

  // ── setInterval auto-modération ────────────────────────────

  useEffect(() => {
    if (!autoModerate || session.phase !== 'voting') return
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
        addLogEntry(session.id, 'auto-moderate', `${approved} approuvées, ${rejected} rejetées`, tokens_used)
      } catch {
        // Silencieux en mode auto — erreurs loggées dans la console uniquement
      } finally {
        isAutoModeratingRef.current = false
      }
    }, intervalMs)
    return () => clearInterval(id)
  }, [autoModerate, intervalMinutes, session.phase, session.id, session.title, session.description, password])

  // ── setInterval auto-fusion périodique ────────────────────

  useEffect(() => {
    if (!autoMergePeriodic || session.phase !== 'voting') return
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
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        for (const m of results) {
          for (const rid of (Array.isArray(m.reject_ids) ? m.reject_ids : [])) {
            if (!UUID_RE.test(rid)) continue
            await mergeAssertionVotes(password, m.keep_id, rid)
            await rejectAssertion(password, rid)
          }
        }
        const existing = readMergeLog(session.id)
        const newEntries: MergeLogEntry[] = results.map(m => ({
          keep_id:         m.keep_id,
          keep_content:    approved.find(a => a.id === m.keep_id)?.content ?? m.keep_id,
          reject_ids:      m.reject_ids,
          reject_contents: m.reject_ids.map(id => approved.find(a => a.id === id)?.content ?? id),
          reason:          m.reason ?? '',
          timestamp:       new Date().toISOString(),
        }))
        localStorage.setItem(`merge_log_${session.id}`, JSON.stringify([...newEntries, ...existing].slice(0, 100)))
        addLogEntry(session.id, 'auto-merge', `${results.length} fusion(s) effectuée(s)`, tokens_used)
      } catch {
        // Silencieux en mode auto
      } finally {
        isAutoMergingRef.current = false
      }
    }, intervalMs)
    return () => clearInterval(id)
  }, [autoMergePeriodic, mergeIntervalMinutes, session.phase, session.id, session.title, session.description, password])

  // ── Données rapport (calculées au render) ───────────────────

  const log = readLog(session.id)
  const mergeLog = readMergeLog(session.id)

  const sessionTokens = log.reduce((s, e) => s + e.tokens_used, 0)
  const today = new Date().toISOString().slice(0, 10)
  const dayTokens: DayTokens = (() => {
    try { return JSON.parse(localStorage.getItem(`ai_tokens_day_${today}`) ?? '{"total_tokens":0,"request_count":0}') }
    catch { return { total_tokens: 0, request_count: 0 } }
  })()

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
          {(autoModerate || autoMergePeriodic) && session.phase === 'voting' && (
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
                onClick={handleMerge}
                disabled={isLoading}
                className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading && (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                Fusionner les doublons
              </button>

              <button
                onClick={() => setShowReport(r => !r)}
                className="text-sm px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                {showReport ? 'Masquer le rapport' : 'Rapport'}
              </button>
            </div>
          </div>

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

              {session.phase !== 'voting' && (autoModerate || autoMergePeriodic) && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  L'automatisation est active mais la séance n'est pas en phase "vote".
                </p>
              )}
            </div>
          )}

        </div>
      )}
    </section>
  )
}
