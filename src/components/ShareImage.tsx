import { useEffect, useState } from 'react'
import { signShareImageUrl } from '../lib/tableShare'

// Chantier 162b — affiche une capture partagée à la table. L'URL est signée à la
// demande (bucket privé : seuls ceux que la politique de stockage autorise
// obtiennent une URL) ; un clic ouvre l'image en grand. Si l'image n'existe plus
// (effacée à la clôture de la séance) ou n'est pas lisible, on le dit sobrement.

interface Props {
  path: string | null
  purged: boolean
  alt: string
  /** Vignette (fil des sources déjà montrées) plutôt que grande carte. */
  compact?: boolean
  dark?: boolean
}

export default function ShareImage({ path, purged, alt, compact = false, dark = false }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [zoom, setZoom] = useState(false)

  useEffect(() => {
    setUrl(null)
    setFailed(false)
    if (!path) return
    let cancelled = false
    signShareImageUrl(path).then(u => {
      if (cancelled) return
      if (u) setUrl(u); else setFailed(true)
    })
    return () => { cancelled = true }
  }, [path])

  const muted = dark ? 'text-slate-300' : 'text-gray-600'

  if (purged || !path) {
    return <p className={`text-xs ${muted}`}>Capture d'écran non conservée.</p>
  }
  if (failed) {
    return <p className={`text-xs ${muted}`}>Capture d'écran indisponible.</p>
  }
  if (!url) {
    return <div className={`rounded-[8px] animate-pulse ${dark ? 'bg-white/10' : 'bg-gray-100'} ${compact ? 'h-20 w-32' : 'h-48 w-full'}`} />
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setZoom(true)}
        className="block rounded-[8px] focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
        aria-label={`Agrandir la capture : ${alt}`}
      >
        <img
          src={url}
          alt={alt}
          onError={() => setFailed(true)}
          className={`rounded-[8px] border object-contain ${dark ? 'border-white/15 bg-bleu-fonce' : 'border-bleu-fonce/10 bg-gray-100'} ${
            compact ? 'max-h-24 w-auto' : 'max-h-80 w-full'
          }`}
        />
      </button>
      {zoom && (
        <div
          className="fixed inset-0 z-[60] bg-bleu-fonce/90 backdrop-blur-[2px] flex items-center justify-center p-3"
          onClick={() => setZoom(false)}
          role="dialog"
          aria-label="Capture d'écran en grand"
        >
          <img src={url} alt={alt} className="max-h-full max-w-full object-contain rounded-[8px]" />
          <button
            type="button"
            onClick={() => setZoom(false)}
            className="btn-verre absolute top-3 right-3 rounded-[8px] inline-flex h-9 items-center px-3 text-sm font-semibold text-creme
              focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
          >
            Fermer
          </button>
        </div>
      )}
    </>
  )
}
