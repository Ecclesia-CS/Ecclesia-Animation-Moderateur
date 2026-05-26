import { useState } from 'react'
import QuestionnaireModal from './QuestionnaireModal'

interface Props {
  className?: string
}

export default function QuestionnaireBtn({ className = '' }: Props) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button onClick={() => setIsOpen(true)} className={className}>
        Questionnaire post-débat
      </button>
      {isOpen && <QuestionnaireModal onClose={() => setIsOpen(false)} />}
    </>
  )
}
