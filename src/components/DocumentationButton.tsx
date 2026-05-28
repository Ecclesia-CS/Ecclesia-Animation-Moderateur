import { useState } from 'react'
import DocViewerModal from './DocViewerModal'

type SessionDocs = {
  doc_info_url: string | null
  doc_summary_url: string | null
  doc_collab_url: string | null
  session_join_code?: string | null
}

interface Props {
  session: SessionDocs | null
  className?: string
  dropdownClass?: string
  userPseudo?: string
  currentTableJoinCode?: string
}

export default function DocumentationButton({ session, className, dropdownClass, userPseudo, currentTableJoinCode }: Props) {
  const [open, setOpen] = useState(false)
  const [viewer, setViewer] = useState<{ url: string; title: string } | null>(null)

  function openDoc(url: string, title: string) {
    setOpen(false)
    setViewer({ url, title })
  }

  if (!session) return null
  const { doc_info_url, doc_summary_url, doc_collab_url, session_join_code } = session

  const hasCollab = !!session_join_code || !!doc_collab_url
  if (!doc_info_url && !doc_summary_url && !hasCollab) return null

  const linkClass = `block px-4 py-2 text-sm hover:bg-gray-50 text-gray-700 whitespace-nowrap`

  function handleCollabClick() {
    setOpen(false)
    if (session_join_code) {
      if (userPseudo) {
        sessionStorage.setItem(`ecclesia_collab_pseudo_${session_join_code}`, userPseudo)
      }
      if (currentTableJoinCode) {
        sessionStorage.setItem(`ecclesia_collab_table_${session_join_code}`, currentTableJoinCode)
      }
      window.location.hash = `#collab/${session_join_code}`
    }
  }

  return (
    <>
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
              <button
                className={`${linkClass} w-full text-left`}
                onClick={() => openDoc(doc_info_url, 'Fiche information')}
              >
                Fiche information
              </button>
            )}
            {doc_summary_url && (
              <button
                className={`${linkClass} w-full text-left`}
                onClick={() => openDoc(doc_summary_url, 'Résumé fiche information')}
              >
                Résumé fiche information
              </button>
            )}
            {hasCollab && (
              <>
                {(doc_info_url || doc_summary_url) && (
                  <div className="my-1 border-t border-gray-100" />
                )}
                {session_join_code ? (
                  <button
                    onClick={handleCollabClick}
                    className={`${linkClass} w-full text-left`}
                  >
                    Sources collaboratives
                  </button>
                ) : (
                  <a
                    href={doc_collab_url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClass}
                    onClick={() => setOpen(false)}
                  >
                    Document collaboratif
                  </a>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>

    {viewer && (
      <DocViewerModal url={viewer.url} title={viewer.title} onClose={() => setViewer(null)} />
    )}
    </>
  )
}
