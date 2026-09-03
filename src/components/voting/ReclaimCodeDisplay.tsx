import { useState } from 'react'

interface ReclaimCodeDisplayProps {
  pseudo: string
  code: string
  onContinue: () => void
}

export default function ReclaimCodeDisplay({ pseudo, code, onContinue }: ReclaimCodeDisplayProps) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard?.writeText(`Pseudo : ${pseudo} | Code : ${code}`).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-100">
          <span className="text-2xl">🔑</span>
        </div>
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl px-4 py-3">
          <p className="text-base font-bold text-amber-700">📸 Fais un screen de cet écran !</p>
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Note ton code de rappel</h1>
          <p className="mt-2 text-sm text-gray-500">
            Si tu viens au débat et changes d'appareil, entre ton nom et prénom <strong>ou</strong> ce code pour retrouver tes votes.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Prénom Nom</p>
            <p className="text-lg font-bold text-gray-900">{pseudo}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Code de rappel</p>
            <p className="text-4xl font-mono font-bold tracking-widest text-amber-600">{code}</p>
          </div>
          <button
            onClick={handleCopy}
            className="w-full py-2 text-sm text-indigo-600 border border-indigo-200 rounded-xl hover:bg-indigo-50 transition-colors"
          >
            {copied ? '✓ Copié !' : 'Copier pseudo + code'}
          </button>
        </div>

        <p className="text-xs text-gray-400">
          Il suffit de l'un ou de l'autre pour retrouver tes votes.
        </p>

        <button
          onClick={onContinue}
          className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
        >
          Continuer vers le vote →
        </button>
      </div>
    </div>
  )
}
