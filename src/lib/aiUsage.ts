// =============================================================
// aiUsage — Suivi centralisé de la consommation des appels LLM (Gemini)
//
// Source unique de vérité pour :
//   - le journal des appels par séance   (ai_log_<id>, FIFO 50)
//   - les compteurs journaliers            (ai_tokens_day_<YYYY-MM-DD>)
//
// Tous les appels Gemini (modération, fusion, nommage des camps) doivent
// passer par `recordAiUsage` afin que le rapport de consommation soit
// exhaustif — y compris les tentatives rejetées côté client (F21) dont
// les tokens ont bien été consommés côté API malgré le rejet.
// =============================================================

// ── Types ─────────────────────────────────────────────────────

// Détail brut de consommation d'un appel Gemini (F19-F22). prompt_tokens/
// completion_tokens/total_tokens sont les valeurs telles que retournées par
// Google — jamais recalculées ici (total_tokens peut inclure thoughts_tokens).
export interface AiUsageDetail {
  prompt_tokens:     number
  completion_tokens: number
  total_tokens:      number
  thoughts_tokens:   number
  model:             string
}

export interface AiLogEntry {
  timestamp: string
  action:    string
  summary:   string
  usage:     AiUsageDetail
}

export interface DayTokens {
  total_tokens:  number
  request_count: number
}

// ── Helpers localStorage ──────────────────────────────────────

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

export function readAiLog(sessionId: string): AiLogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(`ai_log_${sessionId}`) ?? '[]') as AiLogEntry[]
  } catch {
    return []
  }
}

export function readDayTokens(date: string = todayKey()): DayTokens {
  try {
    return JSON.parse(
      localStorage.getItem(`ai_tokens_day_${date}`) ?? '{"total_tokens":0,"request_count":0}',
    ) as DayTokens
  } catch {
    return { total_tokens: 0, request_count: 0 }
  }
}

/**
 * Enregistre un appel LLM : ajoute une entrée au journal de la séance
 * (FIFO 50) et incrémente les compteurs journaliers (tokens + requêtes).
 * Robuste aux quotas localStorage saturés (échec silencieux).
 */
export function recordAiUsage(
  sessionId: string,
  action:    string,
  summary:   string,
  usage:     AiUsageDetail,
): void {
  try {
    const entry: AiLogEntry = {
      timestamp: new Date().toISOString(),
      action,
      summary,
      usage,
    }
    const updated = [entry, ...readAiLog(sessionId)].slice(0, 50)
    localStorage.setItem(`ai_log_${sessionId}`, JSON.stringify(updated))

    const key = `ai_tokens_day_${todayKey()}`
    const day = readDayTokens()
    day.total_tokens  += usage.total_tokens
    day.request_count += 1
    localStorage.setItem(key, JSON.stringify(day))
  } catch {
    // quota localStorage plein — on ignore, le suivi n'est pas critique
  }
}
