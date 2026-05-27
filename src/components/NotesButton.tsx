import { useState, type ReactNode } from 'react'
import { useTable } from '../context/TableContext'
import NotesModal from './NotesModal'

interface Props {
  className?: string
  label?: ReactNode
}

export default function NotesButton({ className = '', label = 'Mes notes' }: Props) {
  const { table } = useTable()
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button onClick={() => setIsOpen(true)} className={className} title="Mes notes">
        {label}
      </button>
      {isOpen && (
        <NotesModal tableId={table.id} onClose={() => setIsOpen(false)} />
      )}
    </>
  )
}
