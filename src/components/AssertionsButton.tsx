import { useState, type ReactNode } from 'react'
import { useTable } from '../context/TableContext'
import { getVoteResults } from '../lib/voting'
import type { VoteResult } from '../lib/types'
import VoteResultsList from './voting/VoteResultsList'

interface Props {
  className?: string
  label?: ReactNode
}

// D11 — les assertions votées doivent rester consultables pendant le débat,
// pour le modérateur comme pour les participants (voir ParticipantToolsButton
// côté ParticipantView, qui couvre déjà ce besoin pour les tables sans admin).
export default function AssertionsButton({ className = '', label = 'Assertions' }: Props) {
  const { table } = useTable()
  const [isOpen, setIsOpen] = useState(false)
  const [results, setResults] = useState<VoteResult[]>([])
  const [loading, setLoading] = useState(false)

  if (!table.session_id) return null

  function open() {
    setIsOpen(true)
    if (results.length > 0 || loading) return
    setLoading(true)
    getVoteResults(table.session_id!)
      .then(setResults)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  return (
    <>
      <button onClick={open} className={className} title="Voir les assertions votées">
        {label}
      </button>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50"
          onMouseDown={e => { if (e.target === e.currentTarget) setIsOpen(false) }}
        >
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <h2 className="text-sm font-semibold text-gray-900">Assertions votées</h2>
              <button
                onClick={() => setIsOpen(false)}
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
              <VoteResultsList results={results} loading={loading} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
