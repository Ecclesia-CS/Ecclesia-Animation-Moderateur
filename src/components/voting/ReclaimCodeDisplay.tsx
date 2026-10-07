import { useState } from 'react'

interface ReclaimCodeDisplayProps {
  pseudo: string
  code: string
  onContinue: () => void
  /** Chantier 119 — texte du bouton, contextuel selon l'appelant (vote, table…). */
  continueLabel?: string
}

export default function ReclaimCodeDisplay({ pseudo, code, onContinue, continueLabel = 'Continuer vers le vote' }: ReclaimCodeDisplayProps) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard?.writeText(`Pseudo : ${pseudo} | Code : ${code}`).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col items-center">
      <div className="w-full rounded-[12px] border border-bleu-fonce/10 bg-white p-6 shadow-sm animate-montee space-y-6 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-50 border border-amber-200">
          <span className="text-2xl">🔑</span>
        </div>
        <div className="rounded-[8px] bg-amber-50 border border-amber-300 border-l-4 border-l-amber-500 px-4 py-3">
          <p className="text-base font-bold text-amber-800">📸 Fais un screen de cet écran !</p>
        </div>
        <div>
          <h1 className="font-sans text-2xl font-bold tracking-tight text-bleu-fonce">Note ton code de rappel</h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            Ce code évite qu'une autre personne prenne ton identité : il est demandé
            <strong> avec ton nom</strong> à chaque reconnexion, sur un autre appareil ou un autre navigateur.
          </p>
        </div>

        <div className="rounded-[12px] bg-white border border-bleu-fonce/10 shadow-lg p-6 space-y-5">
          <div>
            <p className="text-[11px] font-bold text-bleu-fonce/70 uppercase tracking-[0.2em] mb-1.5">Prénom Nom</p>
            <p className="font-sans text-2xl font-bold text-bleu-fonce tracking-[-0.01em]">{pseudo}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-bleu-fonce/70 uppercase tracking-[0.2em] mb-1.5">Code de rappel</p>
            <p className="text-5xl font-bold tracking-[0.25em] tabular-nums text-amber-700">{code}</p>
          </div>
          <button
            onClick={handleCopy}
            className="rounded-[8px] w-full py-2.5 text-sm font-semibold text-bleu-fonce bg-white border border-bleu-fonce/20 hover:border-bleu-fonce/40 hover:bg-bleu-fonce/[0.04] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
          >
            {copied ? '✓ Copié !' : 'Copier pseudo + code'}
          </button>
        </div>

        <p className="text-xs leading-relaxed text-gray-500">
          Il n'est affiché qu'une fois. Perdu ? L'organisateur, ou le modérateur de
          ta table, peut t'en redonner un nouveau.
        </p>

        <button
          onClick={onContinue}
          className="rounded-[8px] w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2 focus-visible:ring-offset-creme"
        >
          {continueLabel}
        </button>
      </div>
    </div>
  )
}
