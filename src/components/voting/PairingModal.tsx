import { useEffect, useState } from 'react'
import { getMyPairings, setMyPairings, type PairingResult } from '../../lib/voting'
import { extractErr } from '../../lib/utils'

// Chantier 92 — appairage entre participants. Saisie partagée entre la
// question d'onboarding et la modale « Être avec un ami » des Outils du vote
// (chantier 113 — restreinte à la phase voting, plus d'usage en débat).

export const PAIRING_EXPLANATION =
  "Écris le prénom et le nom exacts, tels que la personne les a saisis."

/** Chantier 92 — la réciprocité doit sauter aux yeux, à la proposition comme après l'enregistrement. */
export function ReciprocityNotice() {
  return (
    <div className="text-sm text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2.5 leading-snug">
      <p className="font-semibold">⚠️ Ça ne marche que dans les deux sens</p>
      <p className="mt-0.5">
        Vous ne serez à la même table que si <strong>cette personne te cite aussi</strong> de son côté.
        Pense à la prévenir !
      </p>
    </div>
  )
}

export function PairingFields({
  values,
  onChange,
}: {
  values: [string, string]
  onChange: (v: [string, string]) => void
}) {
  return (
    <div className="space-y-3">
      {[0, 1].map(i => (
        <input
          key={i}
          type="text"
          value={values[i]}
          onChange={e => {
            const next: [string, string] = [...values]
            next[i] = e.target.value
            onChange(next)
          }}
          placeholder={i === 0 ? 'Prénom Nom (facultatif)' : 'Une deuxième personne (facultatif)'}
          className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          maxLength={80}
        />
      ))}
    </div>
  )
}

export function PairingResultsList({ results }: { results: PairingResult[] }) {
  if (results.length === 0) return null
  const waiting = results.some(r => r.found && !r.reciprocal)
  return (
    <div className="space-y-2">
    {waiting && (
      <p className="text-sm font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 leading-snug">
        ⏳ Enregistré, mais pas encore actif : tant que la personne ne t'a pas cité·e en retour,
        l'algorithme ne vous mettra pas forcément ensemble. Préviens-la !
      </p>
    )}
    <ul className="space-y-1.5">
      {results.map(r => (
        <li key={r.pseudo} className="text-sm leading-snug">
          {!r.found
            ? <span className="text-red-700">❌ « {r.pseudo} » : personne introuvable dans la séance.</span>
            : r.reciprocal
              ? <span className="text-green-700">🔗 {r.pseudo} : vous vous êtes cités tous les deux, vous serez ensemble.</span>
              : <span className="text-amber-700">⏳ {r.pseudo} : en attente que cette personne te cite aussi.</span>}
        </li>
      ))}
    </ul>
    </div>
  )
}

export default function PairingModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [values, setValues] = useState<[string, string]>(['', ''])
  const [results, setResults] = useState<PairingResult[]>([])
  const [placed, setPlaced] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getMyPairings(sessionId)
      .then(list => {
        if (cancelled) return
        setValues([list[0]?.pseudo ?? '', list[1]?.pseudo ?? ''])
        setResults(list.map(p => ({ pseudo: p.pseudo, found: true, reciprocal: p.reciprocal })))
      })
      .catch(e => { if (!cancelled) setError(extractErr(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sessionId])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await setMyPairings(sessionId, values.filter(v => v.trim() !== ''))
      setResults(res.results)
      setPlaced(res.placedTableNumber)
    } catch (e) {
      setError(extractErr(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div>
          <h2 className="text-lg font-bold text-gray-900">🔗 Être avec un ami (facultatif)</h2>
          <p className="text-sm text-gray-600 mt-1">Avec qui aimerais-tu être à table ? (2 personnes au plus)</p>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">{PAIRING_EXPLANATION}</p>
        </div>
        <ReciprocityNotice />
        {loading ? (
          <p className="text-sm text-gray-400">Chargement…</p>
        ) : (
          <PairingFields values={values} onChange={setValues} />
        )}
        <PairingResultsList results={results} />
        {placed !== null && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
            ✅ Tu as été placé·e au groupe {placed}, avec la personne que tu as citée.
          </p>
        )}
        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
        )}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 border border-gray-300 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50"
          >
            Fermer
          </button>
          <button
            onClick={handleSave}
            disabled={loading || saving}
            className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium rounded-xl"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
