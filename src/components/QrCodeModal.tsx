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
      className="fixed inset-0 bg-bleu-fonce/60 flex items-center justify-center z-50 p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white shadow-2xl p-6 flex flex-col items-center gap-4 max-w-xs w-full animate-entree">
        <h2 className="font-serif text-xl font-semibold text-bleu-fonce text-center">{title}</h2>
        {svg ? (
          <div className="w-56 h-56 p-2 border border-bleu-fonce/10 [&_svg]:w-full [&_svg]:h-full" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <div className="w-56 h-56 flex items-center justify-center border border-bleu-fonce/10 text-xs text-gray-500">Génération…</div>
        )}
        <p className="text-xs text-gray-600 text-center leading-relaxed">
          Les autres participants peuvent scanner ce QR code avec leur téléphone pour rejoindre directement cette table.
        </p>
        <p className="text-[11px] font-mono text-gray-500 text-center break-all">{value}</p>
        <button
          onClick={onClose}
          className="pb-0.5 text-xs font-semibold text-bleu-fonce border-b border-bleu-fonce/40 hover:border-bleu-clair transition-colors
            focus:outline-none focus:ring-2 focus:ring-bleu-clair"
        >
          Fermer
        </button>
      </div>
    </div>
  )
}
