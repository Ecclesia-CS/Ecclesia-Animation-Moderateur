import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTable } from '../context/TableContext'
import { QUESTIONNAIRE_THEMES } from '../lib/utils'
import type { QuestionnaireResponse } from '../lib/types'
import NotesModal from './NotesModal'
import QuestionnaireModal from './QuestionnaireModal'

type SessionDocs = {
  doc_info_url: string | null
  doc_summary_url: string | null
  doc_collab_url: string | null
  session_join_code?: string | null
}

interface Props {
  session: SessionDocs | null
  userPseudo: string
  className?: string
}

function isComplete(r: QuestionnaireResponse | null): boolean {
  if (!r) return false
  return (
    r.theme_ideas     !== null &&
    r.debate_attended !== null &&
    r.debate_rating   !== null &&
    r.staff_interest  !== null &&
    r.feedback        !== null &&
    QUESTIONNAIRE_THEMES.every(t => r.theme_ratings[t] !== undefined)
  )
}

export default function ParticipantToolsButton({ session, userPseudo, className = '' }: Props) {
  const { table } = useTable()
  const [panelOpen,          setPanelOpen]          = useState(false)
  const [notesOpen,          setNotesOpen]          = useState(false)
  const [questionnaireOpen,  setQuestionnaireOpen]  = useState(false)
  const [savedResponse,      setSavedResponse]      = useState<QuestionnaireResponse | null>(null)
  const [checkDone,          setCheckDone]          = useState(false)

  useEffect(() => {
    supabase
      .from('questionnaire_responses')
      .select('*')
      .eq('table_id', table.id)
      .maybeSingle()
      .then(({ data }) => {
        setSavedResponse(data as QuestionnaireResponse | null)
        setCheckDone(true)
      })
  }, [table.id])

  function refetchQuestionnaire() {
    supabase
      .from('questionnaire_responses')
      .select('*')
      .eq('table_id', table.id)
      .maybeSingle()
      .then(({ data }) => setSavedResponse(data as QuestionnaireResponse | null))
  }

  const done = checkDone && isComplete(savedResponse)

  const DOCS_PATH = `${import.meta.env.BASE_URL}docs/`
  const BASE_DOCS = `https://ecclesia-cs.github.io${DOCS_PATH}`
  function normalizeUrl(url: string | null | undefined): string | null {
    if (!url) return null
    if (url.includes(DOCS_PATH)) {
      const filename = url.split(DOCS_PATH)[1] ?? ''
      return filename ? BASE_DOCS + filename : null
    }
    return url
  }

  const { doc_info_url, doc_summary_url, doc_collab_url, session_join_code } = session ?? {}
  const infoUrl    = normalizeUrl(doc_info_url)
  const summaryUrl = normalizeUrl(doc_summary_url)
  const hasCollab  = !!session_join_code || !!doc_collab_url
  const hasDocs    = !!(infoUrl || summaryUrl || hasCollab)

  function handleCollabClick() {
    setPanelOpen(false)
    if (session_join_code) {
      if (userPseudo) {
        sessionStorage.setItem(`ecclesia_collab_pseudo_${session_join_code}`, userPseudo)
      }
      sessionStorage.setItem(`ecclesia_collab_table_${session_join_code}`, table.join_code)
      window.location.hash = `#collab/${session_join_code}`
    }
  }

  const linkClass = 'flex items-center gap-3 px-5 py-3 w-full text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors'
  const subLinkClass = 'flex items-center gap-3 px-5 py-2.5 w-full text-left text-sm text-gray-600 hover:bg-gray-50 transition-colors'

  return (
    <>
      <button onClick={() => setPanelOpen(true)} className={className}>
        Outils
      </button>

      {panelOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setPanelOpen(false) }}
        >
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xs shadow-2xl overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Outils</h2>
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

            {/* Documentation (si disponible) */}
            {hasDocs && (
              <>
                <div className="pt-3 pb-1 px-5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Documentation</p>
                </div>
                {infoUrl && (
                  <a
                    href={infoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={subLinkClass}
                    onClick={() => setPanelOpen(false)}
                  >
                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24"
                      stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline strokeLinecap="round" strokeLinejoin="round" points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" strokeLinecap="round" />
                    </svg>
                    Fiche information
                  </a>
                )}
                {summaryUrl && (
                  <a
                    href={summaryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={subLinkClass}
                    onClick={() => setPanelOpen(false)}
                  >
                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24"
                      stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline strokeLinecap="round" strokeLinejoin="round" points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" strokeLinecap="round" />
                    </svg>
                    Résumé fiche information
                  </a>
                )}
                {hasCollab && (
                  session_join_code ? (
                    <button onClick={handleCollabClick} className={subLinkClass}>
                      <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24"
                        stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round"
                          d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline strokeLinecap="round" strokeLinejoin="round" points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" strokeLinecap="round" />
                      </svg>
                      Sources collaboratives
                    </button>
                  ) : (
                    <a
                      href={doc_collab_url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={subLinkClass}
                      onClick={() => setPanelOpen(false)}
                    >
                      <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24"
                        stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round"
                          d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline strokeLinecap="round" strokeLinejoin="round" points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" strokeLinecap="round" />
                      </svg>
                      Document collaboratif
                    </a>
                  )
                )}
                <div className="mt-2 border-t border-gray-100" />
              </>
            )}

            {/* Notes */}
            <button
              onClick={() => { setPanelOpen(false); setNotesOpen(true) }}
              className={linkClass}
            >
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24"
                stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Mes notes
            </button>

            {/* Questionnaire */}
            <button
              onClick={() => { if (!done) { setPanelOpen(false); setQuestionnaireOpen(true) } }}
              disabled={done}
              title={done ? 'Questionnaire déjà rempli' : undefined}
              className={`${linkClass}${done ? ' opacity-40 cursor-not-allowed' : ''}`}
            >
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24"
                stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Questionnaire post-débat
              {done && <span className="ml-auto text-xs text-gray-400">✓ rempli</span>}
            </button>

            <div className="pb-2" />
          </div>
        </div>
      )}

      {notesOpen && (
        <NotesModal
          sessionId={table.session_id ?? undefined}
          tableId={table.session_id ? undefined : table.id}
          onClose={() => setNotesOpen(false)}
        />
      )}

      {questionnaireOpen && (
        <QuestionnaireModal
          savedResponse={savedResponse}
          onClose={() => { setQuestionnaireOpen(false); refetchQuestionnaire() }}
        />
      )}
    </>
  )
}
