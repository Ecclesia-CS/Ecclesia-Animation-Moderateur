import { useState } from 'react'
import { useTable } from '../context/TableContext'
import QrCodeModal from './QrCodeModal'

interface Props {
  className?: string
}

// "Outils Modo" — regroupe les outils réservés au modérateur, en dehors du header
// principal (F7 : sort le QR code, qui encombrait le header avec InviteFriendButton — F6).
export default function ModeratorToolsButton({ className = '' }: Props) {
  const { table } = useTable()
  const [panelOpen, setPanelOpen] = useState(false)
  const [qrOpen,    setQrOpen]    = useState(false)

  const linkClass = 'flex items-center gap-3 px-5 py-3 w-full text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors'

  return (
    <>
      <button onClick={() => setPanelOpen(true)} className={className}>
        Outils Modo
      </button>

      {panelOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50"
          onMouseDown={e => { if (e.target === e.currentTarget) setPanelOpen(false) }}
        >
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xs shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Outils Modo</h2>
              <button
                onClick={() => setPanelOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-gray-300"
                aria-label="Fermer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <button onClick={() => { setPanelOpen(false); setQrOpen(true) }} className={linkClass}>
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="3" width="7" height="7" rx="1" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="14" y="3" width="7" height="7" rx="1" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="3" y="14" width="7" height="7" rx="1" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="14" y1="17.5" x2="21" y2="17.5" strokeLinecap="round" />
                <line x1="17.5" y1="14" x2="17.5" y2="21" strokeLinecap="round" />
              </svg>
              QR code de la table
            </button>

            <div className="pb-2" />
          </div>
        </div>
      )}

      {qrOpen && (
        <QrCodeModal
          value={`${window.location.origin}${window.location.pathname}#table/${table.join_code}`}
          title={`Rejoindre la table ${table.join_code}`}
          onClose={() => setQrOpen(false)}
        />
      )}
    </>
  )
}
