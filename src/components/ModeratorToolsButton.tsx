import { useEffect, useState } from 'react'
import { useTable } from '../context/TableContext'
import { supabase } from '../lib/supabase'
import { extractErr, QUESTIONNAIRE_THEMES } from '../lib/utils'
import { getVoteResults } from '../lib/voting'
import type { QuestionnaireResponse, VoteResult } from '../lib/types'
import QrCodeModal from './QrCodeModal'
import CorrectTurnModal from './CorrectTurnModal'
import NotesModal from './NotesModal'
import QuestionnaireModal from './QuestionnaireModal'
import VoteResultsList from './voting/VoteResultsList'
import TableOpinionModal from './voting/TableOpinionModal'

interface Props {
  className?: string
  onError?: (message: string) => void
}

function isQuestionnaireComplete(r: QuestionnaireResponse | null): boolean {
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

// "Outils Modo" — menu unique regroupant tous les outils réservés au modérateur.
// Chantier 27 / H22 : fusion de l'ancien bouton "Outils Modo" (QR code, chantier
// 21/F7) et du dropdown "Outils Modo" du header (transcription, historique,
// forçage questionnaire) + bouton "Camps" (chantier 20/G7).
// Chantier 43 : fusion du reste de la barre du header modérateur (Notes,
// Assertions, Questionnaire post-débat — la Documentation reste à part), et
// suppression de la transcription (backend live abandonné, cf. CLAUDE.md).
// Sections séparées par des lignes : Camps + Assertions groupés en premier
// pour donner au modérateur un point de vue sur l'idéologie de sa table.
export default function ModeratorToolsButton({ className = '', onError }: Props) {
  const { table, forceQuestionnaire, cancelForceQuestionnaire } = useTable()
  const [panelOpen,     setPanelOpen]     = useState(false)
  const [campsOpen,     setCampsOpen]     = useState(false)
  const [assertionsOpen, setAssertionsOpen] = useState(false)
  const [qrOpen,        setQrOpen]        = useState(false)
  const [correctOpen,   setCorrectOpen]   = useState(false)
  const [notesOpen,     setNotesOpen]     = useState(false)
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false)

  const [voteResults,        setVoteResults]        = useState<VoteResult[]>([])
  const [voteResultsLoading, setVoteResultsLoading] = useState(false)

  const [savedResponse, setSavedResponse] = useState<QuestionnaireResponse | null>(null)
  const [checkDone,     setCheckDone]     = useState(false)

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

  function handleError(e: unknown) {
    onError?.(extractErr(e))
  }

  function openAssertions() {
    setPanelOpen(false)
    setAssertionsOpen(true)
    if (voteResults.length > 0 || voteResultsLoading || !table.session_id) return
    setVoteResultsLoading(true)
    getVoteResults(table.session_id)
      .then(setVoteResults)
      .catch(() => {})
      .finally(() => setVoteResultsLoading(false))
  }

  const questionnaireDone = checkDone && isQuestionnaireComplete(savedResponse)

  const linkClass = 'flex items-center gap-3 px-5 py-3 w-full text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors'
  const sectionLabelClass = 'pt-3 pb-1 px-5 text-xs font-semibold text-gray-400 uppercase tracking-wide'
  const dividerClass = 'mt-2 border-t border-gray-100'

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

            {/* ── Camps & assertions — vue d'ensemble de l'idéologie de la table, en premier ── */}
            {table.session_id && (
              <>
                <p className={sectionLabelClass}>Camps &amp; assertions</p>

                <button onClick={() => { setPanelOpen(false); setCampsOpen(true) }} className={linkClass}>
                  <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M3 12h18" />
                    <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Camps
                </button>

                <button onClick={openAssertions} className={linkClass}>
                  <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Assertions votées
                </button>

                <div className={dividerClass} />
              </>
            )}

            {/* ── Table ── */}
            <p className={sectionLabelClass}>Table</p>

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

            <button onClick={() => { setPanelOpen(false); setCorrectOpen(true) }} className={linkClass}>
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" />
              </svg>
              Historique
            </button>

            <button
              onClick={() => {
                setPanelOpen(false)
                if (table.questionnaire_forced_at) {
                  cancelForceQuestionnaire().catch(handleError)
                } else {
                  forceQuestionnaire().catch(handleError)
                }
              }}
              className={linkClass}
            >
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l4.414 4.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z" />
              </svg>
              {table.questionnaire_forced_at
                ? 'Annuler forçage questionnaire'
                : 'Forcer questionnaire'}
            </button>

            <div className={dividerClass} />

            {/* ── Personnel ── */}
            <p className={sectionLabelClass}>Personnel</p>

            <button onClick={() => { setPanelOpen(false); setNotesOpen(true) }} className={linkClass}>
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M16.862 4.487a2.1 2.1 0 1 1 2.97 2.97L7.5 19.79l-4 1 1-4 12.362-12.303z" />
              </svg>
              Mes notes
            </button>

            <button
              onClick={() => { if (!questionnaireDone) { setPanelOpen(false); setQuestionnaireOpen(true) } }}
              disabled={questionnaireDone}
              title={questionnaireDone ? 'Questionnaire déjà rempli' : undefined}
              className={`${linkClass}${questionnaireDone ? ' opacity-40 cursor-not-allowed' : ''}`}
            >
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Questionnaire post-débat
              {questionnaireDone && <span className="ml-auto text-xs text-gray-400">✓ rempli</span>}
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

      <TableOpinionModal isOpen={campsOpen} onClose={() => setCampsOpen(false)} />

      {correctOpen && <CorrectTurnModal onClose={() => setCorrectOpen(false)} />}

      {notesOpen && (
        <NotesModal tableId={table.id} onClose={() => setNotesOpen(false)} />
      )}

      {questionnaireOpen && (
        <QuestionnaireModal
          savedResponse={savedResponse}
          onClose={() => { setQuestionnaireOpen(false); refetchQuestionnaire() }}
        />
      )}

      {assertionsOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50"
          onMouseDown={e => { if (e.target === e.currentTarget) setAssertionsOpen(false) }}
        >
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <h2 className="text-sm font-semibold text-gray-900">Assertions votées</h2>
              <button
                onClick={() => setAssertionsOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-gray-300"
                aria-label="Fermer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4">
              <VoteResultsList results={voteResults} loading={voteResultsLoading} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
