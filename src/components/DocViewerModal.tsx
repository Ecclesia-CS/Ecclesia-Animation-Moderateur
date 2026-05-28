import { useEffect, useState } from 'react'

interface Props {
  url: string
  title: string
  onClose: () => void
}

export default function DocViewerModal({ url, title, onClose }: Props) {
  const [srcdoc, setSrcdoc] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    setSrcdoc(null)
    fetch(url)
      .then(r => r.text())
      .then(html => {
        if (!html.includes('name="viewport"')) {
          html = html.replace(
            /<head[^>]*>/i,
            match => match + '<meta name="viewport" content="width=device-width, initial-scale=1">'
          )
        }
        setSrcdoc(html)
      })
      .catch(() => setSrcdoc(''))
  }, [url])

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:bg-black/60" onClick={onClose}>
      <div
        className="relative flex flex-col bg-white sm:rounded-xl sm:shadow-2xl sm:m-4 flex-1 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          <span className="font-semibold text-gray-800 truncate">{title}</span>
          <button
            onClick={onClose}
            className="ml-4 text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {srcdoc === null
          ? <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Chargement…</div>
          : srcdoc === ''
            ? <iframe src={url} className="flex-1 w-full border-0" title={title} scrolling="yes" />
            : <iframe srcDoc={srcdoc} className="flex-1 w-full border-0" title={title} scrolling="yes" />
        }
      </div>
    </div>
  )
}
