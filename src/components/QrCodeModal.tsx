import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

interface Props {
  value: string
  title: string
  onClose: () => void
}

// QR code du lien de la table — modal réutilisée depuis les menus Outils
// participant (ParticipantToolsButton) et modérateur (ModeratorToolsButton).
export default function QrCodeModal({ value, title, onClose }: Props) {
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    QRCode.toString(value, { type: 'svg', margin: 1, width: 240 })
      .then(s => { if (!cancelled) setSvg(s) })
      .catch(() => { if (!cancelled) setSvg(null) })
    return () => { cancelled = true }
  }, [value])

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl p-6 flex flex-col items-center gap-4 max-w-xs w-full">
        <h2 className="text-sm font-semibold text-gray-900 text-center">{title}</h2>
        {svg ? (
          <div className="w-56 h-56 [&_svg]:w-full [&_svg]:h-full" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <div className="w-56 h-56 flex items-center justify-center text-xs text-gray-400">Génération…</div>
        )}
        <p className="text-xs text-gray-400 text-center">
          Les autres participants peuvent scanner ce QR code avec leur téléphone pour rejoindre directement cette table.
        </p>
        <p className="text-xs text-gray-500 text-center break-all">{value}</p>
        <button
          onClick={onClose}
          className="text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2"
        >
          Fermer
        </button>
      </div>
    </div>
  )
}
