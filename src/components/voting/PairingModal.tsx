import { useEffect, useRef, useState } from 'react'
import { getMyPairings, setMyPairings, suggestPairingPseudos, type PairingResult } from '../../lib/voting'
import { extractErr } from '../../lib/utils'
import EnTeteFenetre from '../EnTeteFenetre'

// Chantier 92 — appairage entre participants. Saisie partagée entre la
// question d'onboarding et la modale « Être avec un ami » des Outils du vote
// (chantier 115 — restreinte à la phase voting, plus d'usage en débat).

export const PAIRING_EXPLANATION =
  "Écris le prénom et le nom exacts, tels que la personne les a saisis. " +
  "Cette personne n'est pas encore inscrite ? Écris quand même son nom : on le garde, et vous serez liés dès qu'une personne s'inscrira avec ce nom et te citera à son tour."

/** Chantier 165 — rappel affiché à la saisie : on peut tout faire plus tard. */
export const PAIRING_LATER_NOTE =
  "Tu peux le faire plus tard : « Outils », puis « Être avec un ami ». Si le nom de la personne n'existe pas encore, " +
  "ou si tu ne sais pas comment elle s'est inscrite, reviens simplement plus tard."

/** Chantier 92 — la réciprocité doit sauter aux yeux, à la proposition comme après l'enregistrement. */
export function ReciprocityNotice() {
  return (
    <div className="rounded-[8px] text-sm text-indigo-900 bg-indigo-50 border border-indigo-200 px-3 py-2.5 leading-snug">
      <p className="font-semibold">⚠️ Ça ne marche que dans les deux sens</p>
      <p className="mt-0.5">
        Vous ne serez à la même table que si <strong>cette personne te cite aussi</strong> de son côté.
        Pense à la prévenir !
      </p>
      {/* Chantier 165 — la règle du trio, dite d'avance pour ne pas surprendre. */}
      <p className="mt-1.5 text-xs text-indigo-800">
        Un groupe compte au plus <strong>3 personnes</strong> : si tu es lié·e à deux personnes, vous formez un trio,
        et plus personne ne peut s'y ajouter.
      </p>
    </div>
  )
}

/** Chantier 171 — un champ de nom avec suggestions des pseudos de la séance (5 au plus). */
function PairingInput({
  sessionId, value, onChange, placeholder, listId,
}: {
  sessionId: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  listId: string
}) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [active, setActive] = useState(-1)
  const [open, setOpen] = useState(false)
  const lastTyped = useRef(0)

  function handleChange(v: string) {
    onChange(v)
    const stamp = ++lastTyped.current
    setActive(-1)
    if (v.trim() === '') { setSuggestions([]); return }
    suggestPairingPseudos(sessionId, v)
      .then(list => { if (stamp === lastTyped.current) { setSuggestions(list); setOpen(true) } })
      .catch(() => { if (stamp === lastTyped.current) setSuggestions([]) })
  }

  function choose(p: string) {
    lastTyped.current++
    onChange(p)
    setSuggestions([])
    setOpen(false)
    setActive(-1)
  }

  const shown = open && suggestions.length > 0

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={e => handleChange(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (!shown) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % suggestions.length) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a <= 0 ? suggestions.length - 1 : a - 1)) }
          else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(suggestions[active]) }
          else if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) }
        }}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        className="rounded-[8px] w-full px-4 py-3 bg-white border border-bleu-fonce/20 text-sm text-anthracite placeholder:text-anthracite/40 focus:outline-none focus:border-bleu-fonce focus:ring-2 focus:ring-bleu-clair/40"
        maxLength={80}
      />
      {shown && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 left-0 right-0 mt-1 bg-white border border-bleu-fonce/20 rounded-[8px] shadow-lg overflow-hidden"
        >
          {suggestions.map((p, i) => (
            <li
              key={p}
              role="option"
              aria-selected={i === active}
              onMouseDown={e => { e.preventDefault(); choose(p) }}
              className={`px-4 py-2.5 text-sm text-anthracite cursor-pointer ${i === active ? 'bg-bleu-clair/30' : 'hover:bg-bleu-fonce/[0.04]'}`}
            >
              {p}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function PairingFields({
  sessionId,
  values,
  onChange,
}: {
  sessionId: string
  values: [string, string]
  onChange: (v: [string, string]) => void
}) {
  return (
    <div className="space-y-3">
      {[0, 1].map(i => (
        <PairingInput
          key={i}
          sessionId={sessionId}
          listId={`pairing-suggestions-${i}`}
          value={values[i]}
          onChange={v => {
            const next: [string, string] = [...values]
            next[i] = v
            onChange(next)
          }}
          placeholder={i === 0 ? 'Prénom Nom (facultatif)' : 'Une deuxième personne (facultatif)'}
        />
      ))}
    </div>
  )
}

/** Chantier 165 — une ligne de résultat par choix : introuvable (gardé), refusé, en attente, lié. */
function PairingResultLine({ r }: { r: PairingResult }) {
  if (r.refused === 'self') {
    return <span className="text-red-700">❌ « {r.pseudo} » : c'est ton propre nom.</span>
  }
  if (r.refused === 'target_full') {
    return (
      <span className="text-red-700">
        ❌ {r.pseudo} fait déjà partie d'un trio complet : on ne peut pas s'y ajouter. Choisis quelqu'un d'autre.
      </span>
    )
  }
  if (r.refused === 'too_big') {
    return (
      <span className="text-red-700">
        ❌ {r.pseudo} : vous seriez plus de 3 en vous liant (l'un de vous deux a déjà un binôme). Un groupe compte au plus 3 personnes.
      </span>
    )
  }
  if (!r.found) {
    return (
      <span className="text-amber-700">
        ⚠️ « {r.pseudo} » : personne ne porte ce nom dans la séance pour l'instant. On le garde : si quelqu'un s'inscrit avec
        exactement ce nom et te cite aussi, vous serez liés. Sinon, ça ne te lie à personne.
      </span>
    )
  }
  if (r.blocked) {
    return (
      <span className="text-red-700">
        ❌ {r.pseudo} : ce lien n'est plus possible (un groupe compte au plus 3 personnes). Choisis quelqu'un d'autre.
      </span>
    )
  }
  return r.reciprocal
    ? <span className="text-green-700">🔗 {r.pseudo} : vous vous êtes cités tous les deux, vous serez ensemble.</span>
    : <span className="text-amber-700">⏳ {r.pseudo} : en attente que cette personne te cite aussi.</span>
}

export function PairingResultsList({ results }: { results: PairingResult[] }) {
  if (results.length === 0) return null
  const waiting = results.some(r => r.found && !r.reciprocal && !r.refused && !r.blocked)
  return (
    <div className="space-y-2">
    {waiting && (
      <p className="rounded-[8px] text-sm font-medium text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 leading-snug">
        ⏳ Enregistré, mais pas encore actif : tant que la personne ne t'a pas cité·e en retour,
        l'algorithme ne vous mettra pas forcément ensemble. Préviens-la !
      </p>
    )}
    <ul className="space-y-1.5">
      {results.map(r => (
        <li key={r.pseudo} className="text-sm leading-snug">
          <PairingResultLine r={r} />
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
        setResults(list)
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
    <div className="fixed inset-0 z-50 bg-bleu-fonce/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white shadow-2xl max-h-[90vh] flex flex-col overflow-hidden rounded-[12px] ring-1 ring-white/10 animate-entree" onClick={e => e.stopPropagation()}>
        <EnTeteFenetre titre="🔗 Être avec un ami" sousTitre="Avec qui aimerais-tu être à table ? (2 personnes au plus)" onClose={onClose} />
        <div className="overflow-y-auto p-5 space-y-4">
        <div>
          {/* Chantier 150 — « facultatif » en première ligne, comme à l'onboarding. */}
          <p className="rounded-[8px] text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1.5 leading-snug">
            Facultatif : tu peux le remplir ou le modifier à tout moment pendant le vote.
          </p>
          <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">{PAIRING_EXPLANATION}</p>
        </div>
        <ReciprocityNotice />
        {loading ? (
          <p className="text-sm text-gray-600" role="status">Chargement…</p>
        ) : (
          <PairingFields sessionId={sessionId} values={values} onChange={setValues} />
        )}
        <PairingResultsList results={results} />
        {placed !== null && (
          <p className="rounded-[8px] text-sm text-green-800 bg-green-50 border border-green-200 px-3 py-2">
            ✅ Tu as été placé·e au groupe {placed}, avec la personne que tu as citée.
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-[8px] text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2">{error}</p>
        )}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="rounded-[8px] flex-1 py-3 border border-bleu-fonce/20 text-bleu-fonce text-sm font-semibold hover:border-bleu-fonce/40 hover:bg-bleu-fonce/[0.04]"
          >
            Fermer
          </button>
          <button
            onClick={handleSave}
            disabled={loading || saving}
            className="rounded-[8px] flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
        </div>
      </div>
    </div>
  )
}
