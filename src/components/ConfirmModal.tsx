import type { ReactNode } from 'react'
import EnTeteFenetre from './EnTeteFenetre'

interface Props {
  title: string
  body: ReactNode
  confirmLabel: string
  onConfirm(): void
  onCancel(): void
  /**
   * Chantier 158 : `info` pour un simple message (un seul bouton). `danger`
   * (défaut) pour une action irréversible à confirmer : même bandeau marine
   * quadrillé que les autres fenêtres, le rouge est réservé à l'avertissement
   * et au bouton de confirmation.
   */
  tone?: 'danger' | 'info'
}

export default function ConfirmModal({ title, body, confirmLabel, onConfirm, onCancel, tone = 'danger' }: Props) {
  const danger = tone === 'danger'

  return (
    <div className="fixed inset-0 bg-bleu-fonce/60 backdrop-blur-[2px] flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div
        className="bg-white w-full max-w-sm shadow-2xl overflow-hidden rounded-[12px] ring-1 ring-white/10 animate-entree"
        onClick={e => e.stopPropagation()}
      >
        <EnTeteFenetre titre={title} onClose={danger ? onCancel : undefined} />
        <div className="p-6">
          {danger ? (
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-red-200 bg-red-50">
                <svg className="h-4 w-4 text-red-600" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </span>
              <div className="min-w-0 flex-1 pt-1 text-sm text-gray-600 leading-relaxed">{body}</div>
            </div>
          ) : (
            <div className="text-sm text-gray-600 leading-relaxed">{body}</div>
          )}

          {danger ? (
            <div className="mt-6 flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 rounded-[8px] py-2.5 text-sm font-semibold bg-white border border-bleu-fonce/20
                  text-bleu-fonce hover:border-bleu-fonce/40 hover:bg-bleu-fonce/[0.04] transition-colors focus:outline-none
                  focus-visible:ring-2 focus-visible:ring-bleu-clair"
              >
                Annuler
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 rounded-[8px] py-2.5 text-sm font-semibold bg-red-600 text-white
                  hover:bg-red-700 transition-colors focus:outline-none focus-visible:ring-2
                  focus-visible:ring-red-400 focus-visible:ring-offset-2"
              >
                {confirmLabel}
              </button>
            </div>
          ) : (
            <button
              onClick={onConfirm}
              className="mt-6 w-full rounded-[8px] py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors
                focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2"
            >
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
