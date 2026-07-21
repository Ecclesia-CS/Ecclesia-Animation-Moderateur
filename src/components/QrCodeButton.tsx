import { useState, type ReactNode } from 'react'
import QRCode from 'qrcode'

interface Props {
  value: string
  title: string
  label?: ReactNode
  className?: string
}

// D15 — QR code du lien de la table, pour accueillir les retardataires
// sans devoir leur dicter le code ou un lien.
export default function QrCodeButton({ value, title, label = 'QR code', className = '' }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [svg, setSvg] = useState<string | null>(null)

  function open() {
    setIsOpen(true)
    if (svg) return
    QRCode.toString(value, { type: 'svg', margin: 1, width: 240 })
      .then(setSvg)
      .catch(() => setSvg(null))
  }

  return (
    <>
      <button onClick={open} className={className} title="Afficher le QR code pour rejoindre cette table">
        {label}
      </button>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onMouseDown={e => { if (e.target === e.currentTarget) setIsOpen(false) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-6 flex flex-col items-center gap-4 max-w-xs w-full">
            <h2 className="text-sm font-semibold text-gray-900 text-center">{title}</h2>
            {svg ? (
              <div className="w-56 h-56 [&_svg]:w-full [&_svg]:h-full" dangerouslySetInnerHTML={{ __html: svg }} />
            ) : (
              <div className="w-56 h-56 flex items-center justify-center text-xs text-gray-400">Génération…</div>
            )}
            <p className="text-xs text-gray-500 text-center break-all">{value}</p>
            <button
              onClick={() => setIsOpen(false)}
              className="text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  )
}
