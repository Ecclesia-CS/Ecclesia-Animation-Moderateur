import { useCallback, useEffect, useState } from 'react'
import {
  getMyPairings, getPairingRequests, setMyPairings,
  type PairingRequest,
} from '../../lib/voting'
import { pairingChoicesWith } from '../../lib/pairings'
import { extractErr } from '../../lib/utils'
import EnTeteFenetre from '../EnTeteFenetre'

/**
 * Chantier 165 — « cette personne t'a choisi·e : déclare-la en retour ».
 *
 * Un binôme n'existe que si les deux se citent. Celui qui a cité en premier
 * attend, et l'autre ne le sait pas : cette notice le lui dit, en deux temps —
 * une fenêtre à la première apparition d'une demande, puis un encadré qui reste
 * tant qu'il y a une demande à laquelle répondre. Elle couvre aussi la personne
 * qui s'inscrit après avoir été citée par son nom (nom « à venir »).
 *
 * Monté pendant la phase de vote présentiel seulement (les binômes ne se
 * déclarent pas ailleurs). Rafraîchi toutes les 10 s : le Realtime peut être
 * coupé (navigateurs in-app).
 */

const POLL_MS = 10_000

function seenKey(sessionId: string): string {
  return `pairing_requests_seen_${sessionId}`
}

/** Identifiants de demandes déjà montrées en fenêtre. Forme relue validée (blob d'une version antérieure possible). */
function readSeen(sessionId: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(seenKey(sessionId)) ?? '[]') as unknown
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeSeen(sessionId: string, seen: Set<string>): void {
  try {
    localStorage.setItem(seenKey(sessionId), JSON.stringify([...seen]))
  } catch { /* stockage indisponible : la fenêtre pourra se rouvrir, sans gravité */ }
}

const REFUSAL_TEXT = {
  self: "C'est ton propre nom.",
  target_full: 'Cette personne fait déjà partie d\'un trio complet.',
  too_big: 'Vous seriez plus de 3 en vous liant.',
} as const

export default function PairingRequestsNotice({ sessionId }: { sessionId: string }) {
  const [requests, setRequests] = useState<PairingRequest[]>([])
  const [seen, setSeen] = useState<Set<string>>(() => readSeen(sessionId))
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setRequests(await getPairingRequests(sessionId))
    } catch { /* non bloquant : on réessaie au prochain passage */ }
  }, [sessionId])

  useEffect(() => {
    void refresh()
    const interval = setInterval(() => { void refresh() }, POLL_MS)
    return () => clearInterval(interval)
  }, [refresh])

  const unseen = requests.filter(r => !seen.has(r.member_id))

  function markSeen() {
    const next = new Set([...seen, ...requests.map(r => r.member_id)])
    setSeen(next)
    writeSeen(sessionId, next)
  }

  async function accept(req: PairingRequest) {
    setBusyId(req.member_id)
    setError(null)
    setNotice(null)
    try {
      const current = await getMyPairings(sessionId)
      const choices = pairingChoicesWith(current, req.pseudo)
      if (!choices) {
        setError('Tu as déjà deux binômes confirmés. Modifie-les dans « Outils », puis « Être avec un ami ».')
        return
      }
      const replaced = current.find(p =>
        !choices.some(c => c.trim().toLowerCase() === p.pseudo.trim().toLowerCase()))
      const res = await setMyPairings(sessionId, choices)
      const mine = res.results.find(r => r.pseudo.trim().toLowerCase() === req.pseudo.trim().toLowerCase())
      if (mine?.refused) {
        setError(`${req.pseudo} : ${REFUSAL_TEXT[mine.refused]}`)
      } else {
        setNotice(
          `🔗 C'est fait : tu as cité ${req.pseudo}, vous serez ensemble.` +
          (replaced ? ` (Ton choix « ${replaced.pseudo} », sans retour, a été remplacé.)` : ''),
        )
      }
      markSeen()
      await refresh()
    } catch (e) {
      setError(extractErr(e))
    } finally {
      setBusyId(null)
    }
  }

  if (requests.length === 0 && !notice && !error) return null

  const names = requests.map(r => r.pseudo)

  return (
    <>
      {/* Fenêtre : première apparition d'une demande */}
      {unseen.length > 0 && (
        <div
          className="fixed inset-0 z-50 bg-bleu-fonce/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-4"
          onClick={markSeen}
        >
          <div
            className="w-full max-w-md bg-white shadow-2xl max-h-[90vh] flex flex-col overflow-hidden rounded-[12px] ring-1 ring-white/10 animate-entree"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-label="Demande de binôme"
          >
            <EnTeteFenetre titre="🔗 On t'a choisi·e" />
            <div className="overflow-y-auto p-5 space-y-4">
            <div>
              <p className="text-sm text-gray-700 leading-relaxed">
                <strong>{names.join(', ')}</strong>{' '}
                {names.length > 1 ? "t'ont choisi·e" : "t'a choisi·e"} pour être à {names.length > 1 ? 'leur' : 'sa'} table de
                débat. Ce choix est en attente de ta validation : pour que vous soyez ensemble, il faut que tu{' '}
                {names.length > 1 ? 'les' : 'le/la'} choisisses aussi.
              </p>
            </div>
            <ul className="space-y-2">
              {requests.map(r => (
                <li key={r.member_id} className="flex items-center justify-between gap-3 border border-bleu-fonce/10 rounded-[8px] px-3 py-2.5">
                  <span className="text-sm font-semibold text-bleu-fonce truncate">{r.pseudo}</span>
                  <button
                    onClick={() => void accept(r)}
                    disabled={busyId !== null}
                    className="shrink-0 rounded-[8px] h-9 px-3 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 transition-colors
                      focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2"
                  >
                    {busyId === r.member_id ? '…' : 'Le/la choisir en retour'}
                  </button>
                </li>
              ))}
            </ul>
            {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-[8px] px-3 py-2">{error}</p>}
            <button
              onClick={markSeen}
              className="w-full rounded-[8px] py-3 border border-bleu-fonce/20 text-bleu-fonce text-sm font-semibold transition-colors hover:border-bleu-fonce/40 hover:bg-bleu-fonce/[0.04]
                focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
            >
              Plus tard
            </button>
            </div>
          </div>
        </div>
      )}

      {/* Encadré : tant qu'il reste une demande à laquelle répondre */}
      {(requests.length > 0 || notice || error) && unseen.length === 0 && (
        <div className="mt-3 flex items-stretch overflow-hidden rounded-[12px] border border-bleu-fonce/10 bg-white shadow-sm animate-montee" data-testid="pairing-requests-banner">
          <span aria-hidden="true" className="flex w-14 shrink-0 items-start justify-center bg-amber-600 pt-4 text-lg text-creme">🔗</span>
          <div className="min-w-0 flex-1 px-4 py-3 text-sm text-anthracite space-y-2.5">
            {requests.length > 0 && (
              <>
                <p className="font-semibold text-bleu-fonce">
                  {names.join(', ')} {names.length > 1 ? "t'ont choisi·e" : "t'a choisi·e"} pour {names.length > 1 ? 'leur' : 'sa'} table
                </p>
                <ul className="space-y-2">
                  {requests.map(r => (
                    <li key={r.member_id} className="flex items-center justify-between gap-3">
                      <span className="truncate font-semibold">{r.pseudo}</span>
                      <button
                        onClick={() => void accept(r)}
                        disabled={busyId !== null}
                        className="shrink-0 rounded-[8px] h-9 px-3 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 transition-colors
                          focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2"
                      >
                        {busyId === r.member_id ? '…' : 'Le/la choisir en retour'}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {notice && <p className="text-green-800 font-medium">{notice}</p>}
            {error && <p role="alert" className="text-red-700">{error}</p>}
          </div>
        </div>
      )}
    </>
  )
}
