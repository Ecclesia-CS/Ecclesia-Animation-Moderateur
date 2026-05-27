import { useState } from 'react'
import { useTable } from '../context/TableContext'
import NotesModal from './NotesModal'

interface Props { className?: string }

export default function NotesButton({ className = '' }: Props) {
  const { table } = useTable()
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button onClick={() => setIsOpen(true)} className={className}>
        Mes notes
      </button>
      {isOpen && (
        <NotesModal tableId={table.id} onClose={() => setIsOpen(false)} />
      )}
    </>
  )
}
