import type { ReactNode } from 'react'
import FondQuadrille from './FondQuadrille'

interface Props {
  title: string
  body: ReactNode
  confirmLabel: string
  onConfirm(): void
  onCancel(): void
  /**
   * Chantier 158 : `info` pour un simple message (bandeau marine quadrillé,
   * un seul bouton, pas d'alerte rouge). `danger` (défaut) pour une action
   * irréversible à confirmer.
   */
  tone?: 'danger' | 'info'
}

export default function ConfirmModal({ title, body, confirmLabel, onConfirm, onCancel, tone = 'danger' }: Props) {
  if (tone === 'info') {
    return (
      <div className="fixed inset-0 bg-bleu-fonce/60 flex items-center justify-center z-50 p-4" onClick={onCancel}>
        <div
          className="bg-white w-full max-w-sm shadow-2xl overflow-hidden rounded-[12px] animate-entree"
          onClick={e => e.stopPropagation()}
        >
          <div className="relative overflow-hidden bg-bleu-fonce px-6 py-4">
            <FondQuadrille cases={2} />
            <h2 className="relative font-sans text-lg font-bold tracking-[-0.01em] leading-snug text-creme">{title}</h2>
          </div>
          <div className="p-6">
            <div className="text-sm text-gray-600 leading-relaxed">{body}</div>
            <button
              onClick={onConfirm}
              className="mt-6 w-full rounded-[8px] py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors
                focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 bg-bleu-fonce/60 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white w-full max-w-sm shadow-2xl animate-entree"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-10 h-10 rounded-full bg-red-50 border border-red-200 flex items-center justify-center">
              <svg className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-sans text-lg font-bold tracking-[-0.01em] leading-snug text-bleu-fonce">{title}</h2>
              <div className="mt-1.5 text-sm text-gray-600 leading-relaxed">{body}</div>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 text-sm font-semibold bg-white border border-bleu-fonce/20
                text-bleu-fonce hover:border-bleu-fonce/40 hover:bg-bleu-fonce/[0.04] transition-colors focus:outline-none
                focus-visible:ring-2 focus-visible:ring-bleu-clair"
            >
              Annuler
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-2.5 text-sm font-semibold bg-red-600 text-white
                hover:bg-red-700 transition-colors focus:outline-none focus-visible:ring-2
                focus-visible:ring-red-400 focus-visible:ring-offset-2"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
