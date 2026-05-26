import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTable } from '../context/TableContext'
import QuestionnaireModal from './QuestionnaireModal'

interface Props {
  className?: string
}

export default function QuestionnaireBtn({ className = '' }: Props) {
  const { table } = useTable()
  const [isOpen,       setIsOpen]       = useState(false)
  const [hasResponded, setHasResponded] = useState(false)

  async function checkResponded() {
    const { data } = await supabase
      .from('questionnaire_responses')
      .select('id')
      .eq('table_id', table.id)
      .maybeSingle()
    if (data) setHasResponded(true)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { checkResponded() }, [table.id])

  function handleClose() {
    setIsOpen(false)
    checkResponded()
  }

  const disabledClass = hasResponded ? ' opacity-50 cursor-not-allowed pointer-events-none' : ''

  return (
    <>
      <button
        onClick={() => !hasResponded && setIsOpen(true)}
        disabled={hasResponded}
        title={hasResponded ? 'Questionnaire déjà rempli' : undefined}
        className={className + disabledClass}
      >
        Questionnaire post-débat
      </button>
      {isOpen && <QuestionnaireModal onClose={handleClose} />}
    </>
  )
}
