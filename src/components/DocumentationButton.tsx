import { useState } from 'react'
import { useSessionOrganizationName } from '../lib/organizations'
import { sessionTypeOf } from '../lib/phaseLabels'
import { DOC_BIAIS_URL, DOC_FALLACIES_URL, DOC_INFO_LABEL, DOC_SUMMARY_LABEL, showPedagogyDocs } from '../lib/docLinks'
import type { SessionType } from '../lib/types'
import EnTeteFenetre from './EnTeteFenetre'

type SessionDocs = {
  doc_info_url: string | null
  doc_summary_url: string | null
  doc_collab_url: string | null
  session_join_code?: string | null
  /** Chantier 155 — pas de fiches pédagogiques dans un sondage. */
  session_type?: SessionType | null
}

interface Props {
  session: SessionDocs | null
  className?: string
  currentTableJoinCode?: string
  /** Chantier 135 — séance de rattachement : pas de document collaboratif si elle appartient à une association. */
  sessionId?: string | null
}

// Chantier 158 : petite fenêtre (bandeau marine quadrillé), comme « Outils Modo »,
// et non plus un menu déroulant : l'en-tête quadrillé de la vue modérateur est en
// `overflow-hidden`, qui couperait un menu accroché sous le bouton.
export default function DocumentationButton({ session, className, currentTableJoinCode, sessionId }: Props) {
  const [open, setOpen] = useState(false)
  const orgName = useSessionOrganizationName(sessionId)

  if (!session) return null

  const { doc_info_url, doc_summary_url, doc_collab_url, session_join_code } = session

  const hasCollab = !orgName && (!!session_join_code || !!doc_collab_url)
  const showPedagogy = showPedagogyDocs(sessionTypeOf(session))

  const linkClass = 'flex items-center gap-3 px-5 py-3 w-full text-left text-sm text-anthracite hover:bg-indigo-50/70 hover:text-bleu-fonce transition-colors focus:outline-none focus:bg-indigo-50/70'
  const sectionLabelClass = 'pt-3 pb-1 px-5 text-[11px] font-bold text-bleu-fonce/70 uppercase tracking-[0.16em]'
  const icone = (
    <svg className="w-4 h-4 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline strokeLinecap="round" strokeLinejoin="round" points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" strokeLinecap="round" />
    </svg>
  )
  const lien = (href: string, label: string) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass} onClick={() => setOpen(false)}>
      {icone}
      {label}
    </a>
  )

  function handleCollabClick() {
    setOpen(false)
    if (session_join_code) {
      if (currentTableJoinCode) {
        sessionStorage.setItem(`ecclesia_collab_table_${session_join_code}`, currentTableJoinCode)
      }
      window.location.hash = `#collab/${session_join_code}`
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={className}>
        Documentation
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-bleu-fonce/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center z-50"
          onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="bg-white w-full sm:max-w-xs shadow-2xl overflow-hidden rounded-t-[12px] sm:rounded-[12px] ring-1 ring-white/10 animate-entree">
            <EnTeteFenetre titre="Documentation" onClose={() => setOpen(false)} />

            {(doc_info_url || doc_summary_url || hasCollab) && (
              <>
                <p className={sectionLabelClass}>Séance</p>
                {doc_info_url && lien(doc_info_url, DOC_INFO_LABEL)}
                {doc_summary_url && lien(doc_summary_url, DOC_SUMMARY_LABEL)}
                {hasCollab && (
                  session_join_code ? (
                    <button onClick={handleCollabClick} className={linkClass}>
                      {icone}
                      Sources collaboratives
                    </button>
                  ) : lien(doc_collab_url!, 'Document collaboratif')
                )}
              </>
            )}

            {showPedagogy && (
              <>
                {(doc_info_url || doc_summary_url || hasCollab) && <div className="mt-2 border-t border-bleu-fonce/10" />}
                <p className={sectionLabelClass}>Pour débattre</p>
                {lien(DOC_BIAIS_URL, 'Biais cognitifs')}
                {lien(DOC_FALLACIES_URL, 'Arguments fallacieux')}
              </>
            )}

            {!doc_info_url && !doc_summary_url && !hasCollab && !showPedagogy && (
              <p className="px-5 py-4 text-sm text-gray-500">Aucun document pour cette séance.</p>
            )}

            <div className="pb-2" />
          </div>
        </div>
      )}
    </>
  )
}
