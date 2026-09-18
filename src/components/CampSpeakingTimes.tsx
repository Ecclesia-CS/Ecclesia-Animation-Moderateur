import { useEffect, useRef, useState } from 'react'
import { loadTableCampSpeakingTimes } from '../lib/voting'
import { formatDuration } from '../lib/utils'
import { campColor } from './voting/TableDiagnosticsList'

const POLL_INTERVAL_MS = 5 * 60 * 1000

interface Props {
  tableId: string
  isModerator: boolean
}

// Chantier 94 — vue modérateur : temps de parole cumulé par camp idéologique.
// Isolé dans son propre composant (comme SessionTimerDisplay dans
// ModeratorView) pour que le polling ne re-rende pas tout l'écran.
//
// Le floutage 5 minutes voulu par Jules tient entièrement à ce
// setInterval : on ne rappelle jamais la RPC plus souvent, donc le
// modérateur ne voit jamais un compteur bouger en direct pendant qu'une
// seule personne parle. Les deux autres garde-fous (2 personnes mini par
// camp, seuil de temps cumulé) sont appliqués côté RPC — un camp absent de
// la réponse ne doit jamais être traité comme "0 min" côté client, juste
// comme "pas encore affichable".
export default function CampSpeakingTimes({ tableId, isModerator }: Props) {
  const [camps, setCamps] = useState<{ group_id: number; name: string | null; seconds: number }[] | null>(null)
  const fetchingRef = useRef(false)

  useEffect(() => {
    if (!isModerator) return

    let cancelled = false

    function fetchTimes() {
      if (fetchingRef.current) return
      fetchingRef.current = true
      loadTableCampSpeakingTimes(tableId)
        .then(summary => {
          if (!cancelled) setCamps(summary?.camps ?? null)
        })
        .catch(e => {
          // Chantier 94 — un échec silencieux ici (permission refusée, RPC
          // en erreur) ne devait jamais rester invisible : c'est exactement
          // ce qui a rendu ce bug difficile à diagnostiquer le 18/09.
          console.error('[CampSpeakingTimes] get_table_camp_speaking_times a échoué :', e)
        })
        .finally(() => { fetchingRef.current = false })
    }

    fetchTimes()
    const interval = setInterval(fetchTimes, POLL_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(interval) }
  }, [tableId, isModerator])

  if (!isModerator || !camps || camps.length === 0) return null

  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
        Temps de parole par camp
      </p>
      <p className="text-[11px] text-slate-500 mb-2">
        Mis à jour toutes les 5 minutes — camps affichés seulement à partir de 2 personnes à la table et d'un temps cumulé suffisant.
      </p>
      <ul className="space-y-1.5">
        {camps.map(c => (
          <li key={c.group_id} className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: campColor(c.group_id) }} />
            <span className="text-slate-200">{c.name ?? `Camp ${c.group_id + 1}`}</span>
            <span className="ml-auto font-mono tabular-nums text-slate-300">
              {formatDuration(c.seconds * 1000)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
