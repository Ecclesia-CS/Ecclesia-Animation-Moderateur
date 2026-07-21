// =============================================================
// aiUsage — Suivi centralisé de la consommation des appels LLM (Gemini)
//
// Source unique de vérité pour :
//   - le journal des appels par séance   (ai_log_<id>, FIFO 50)
//   - les compteurs journaliers            (ai_tokens_day_<YYYY-MM-DD>)
//   - l'estimation de l'impact énergétique (C6)
//
// Tous les appels Gemini (modération, fusion, nommage des camps) doivent
// passer par `recordAiUsage` afin que le rapport de consommation soit
// exhaustif — auparavant les tokens du nommage étaient silencieusement
// jetés et n'apparaissaient ni dans l'historique ni dans les compteurs.
// =============================================================

// ── Types ─────────────────────────────────────────────────────

export interface AiLogEntry {
  timestamp:   string
  action:      string
  summary:     string
  tokens_used: number
}

export interface DayTokens {
  total_tokens:  number
  request_count: number
}

// ── Estimation énergétique (C6) ───────────────────────────────
//
// DÉCISION À VALIDER PAR JULES — facteur énergétique par token.
// Il n'existe pas de chiffre officiel publié pour Gemini 2.5 Flash Lite.
// Ordres de grandeur publics (2024-2025) pour l'inférence LLM :
//   - modèles moyens/gros : ~0.0003 à 0.001 Wh par token
//   - Flash Lite est un très petit modèle → borne basse de la fourchette
// On retient une valeur indicative et volontairement prudente ; elle est
// isolée ici pour être ajustée d'un seul endroit. L'affichage la présente
// explicitement comme un ordre de grandeur, pas une mesure.
export const WH_PER_TOKEN = 0.0003

/** Libellé lisible du facteur retenu, pour l'affichage. */
export const WH_PER_TOKEN_LABEL = `${WH_PER_TOKEN * 1000} mWh/token`

// Équivalence grand public : une charge complète de smartphone ≈ 12 Wh.
const WH_PER_PHONE_CHARGE = 12

/** Énergie estimée (Wh) pour un nombre de tokens donné. Indicatif. */
export function estimateEnergyWh(tokens: number): number {
  return tokens * WH_PER_TOKEN
}

/** Nombre de charges de smartphone équivalentes à une quantité d'énergie (Wh). */
export function phoneChargeEquivalent(wh: number): number {
  return wh / WH_PER_PHONE_CHARGE
}

/** Formate une énergie en Wh de façon lisible (mWh en dessous de 1 Wh). */
export function formatEnergy(wh: number): string {
  if (wh <= 0) return '0 Wh'
  if (wh < 1) return `${(wh * 1000).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} mWh`
  return `${wh.toLocaleString('fr-FR', { maximumFractionDigits: wh < 10 ? 2 : 1 })} Wh`
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
  sessionId:  string,
  action:     string,
  summary:    string,
  tokensUsed: number,
): void {
  try {
    const entry: AiLogEntry = {
      timestamp:   new Date().toISOString(),
      action,
      summary,
      tokens_used: tokensUsed,
    }
    const updated = [entry, ...readAiLog(sessionId)].slice(0, 50)
    localStorage.setItem(`ai_log_${sessionId}`, JSON.stringify(updated))

    const key = `ai_tokens_day_${todayKey()}`
    const day = readDayTokens()
    day.total_tokens  += tokensUsed
    day.request_count += 1
    localStorage.setItem(key, JSON.stringify(day))
  } catch {
    // quota localStorage plein — on ignore, le suivi n'est pas critique
  }
}
