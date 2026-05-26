import { useState } from 'react'

type SessionDocs = {
  doc_info_url: string | null
  doc_summary_url: string | null
  doc_collab_url: string | null
}

interface Props {
  session: SessionDocs | null
  className?: string
  dropdownClass?: string
}

export default function DocumentationButton({ session, className, dropdownClass }: Props) {
  const [open, setOpen] = useState(false)

  if (!session) return null
  const { doc_info_url, doc_summary_url, doc_collab_url } = session
  if (!doc_info_url && !doc_summary_url && !doc_collab_url) return null

  const linkClass = `block px-4 py-2 text-sm hover:bg-gray-50 text-gray-700 whitespace-nowrap`

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={className}
        aria-expanded={open}
      >
        Documentation
      </button>

      {open && (
        <>
          {/* Overlay transparent pour fermer au clic extérieur */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={`absolute right-0 top-full mt-1 bg-white rounded-xl border border-gray-200
              shadow-lg py-1 z-50 min-w-[200px] ${dropdownClass ?? ''}`}
          >
            {doc_info_url && (
              <a
                href={doc_info_url}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
                onClick={() => setOpen(false)}
              >
                Fiche information
              </a>
            )}
            {doc_summary_url && (
              <a
                href={doc_summary_url}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
                onClick={() => setOpen(false)}
              >
                Résumé
              </a>
            )}
            {doc_collab_url && (
              <>
                {(doc_info_url || doc_summary_url) && (
                  <div className="my-1 border-t border-gray-100" />
                )}
                <a
                  href={doc_collab_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                  onClick={() => setOpen(false)}
                >
                  Document collaboratif
                </a>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
