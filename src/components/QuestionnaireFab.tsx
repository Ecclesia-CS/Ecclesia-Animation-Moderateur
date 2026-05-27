import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTable } from '../context/TableContext'
import { QUESTIONNAIRE_THEMES } from '../lib/utils'
import type { QuestionnaireResponse } from '../lib/types'
import QuestionnaireModal from './QuestionnaireModal'

interface Props {
  className?: string
}

/** Renvoie true si toutes les questions ET tous les thèmes ont été remplis. */
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

export default function QuestionnaireBtn({ className = '' }: Props) {
  const { table } = useTable()
  const [isOpen,         setIsOpen]         = useState(false)
  const [savedResponse,  setSavedResponse]  = useState<QuestionnaireResponse | null>(null)
  const [checkDone,      setCheckDone]      = useState(false)

  async function fetchResponse() {
    const { data } = await supabase
      .from('questionnaire_responses')
      .select('*')
      .eq('table_id', table.id)
      .maybeSingle()
    setSavedResponse(data as QuestionnaireResponse | null)
    setCheckDone(true)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchResponse() }, [table.id])

  function handleClose() {
    setIsOpen(false)
    fetchResponse()
  }

  const done = checkDone && isComplete(savedResponse)
  const disabledClass = done ? ' opacity-50 cursor-not-allowed pointer-events-none' : ''

  return (
    <>
      <button
        onClick={() => !done && setIsOpen(true)}
        disabled={done}
        title={done ? 'Questionnaire déjà rempli' : undefined}
        className={className + disabledClass}
      >
        Questionnaire post-débat
      </button>
      {isOpen && (
        <QuestionnaireModal
          savedResponse={savedResponse}
          onClose={handleClose}
        />
      )}
    </>
  )
}
