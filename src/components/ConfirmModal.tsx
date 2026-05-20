interface Props {
  title: string
  body: string
  confirmLabel: string
  onConfirm(): void
  onCancel(): void
}

export default function ConfirmModal({ title, body, confirmLabel, onConfirm, onCancel }: Props) {
  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-gray-900">{title}</h2>
              <p className="mt-1 text-sm text-gray-500 leading-relaxed">{body}</p>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 text-sm font-medium border border-gray-200 rounded-xl
                text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none
                focus:ring-2 focus:ring-gray-300"
            >
              Annuler
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-2.5 text-sm font-medium bg-red-600 text-white rounded-xl
                hover:bg-red-700 transition-colors focus:outline-none focus:ring-2
                focus:ring-red-500 focus:ring-offset-2"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
