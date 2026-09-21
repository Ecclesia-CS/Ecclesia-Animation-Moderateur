import { useState } from 'react'
import { useTable } from '../context/TableContext'
import { useToast } from '../context/ToastContext'
import { extractErr } from '../lib/utils'
import { regenerateReclaimCodeModerator } from '../lib/voting'
import ConfirmModal from './ConfirmModal'
import type { Participant } from '../lib/types'

interface Props {
  onClose(): void
}

// Chantier — regroupe dans "Outils Modo" la régénération de code de rappel,
// auparavant un bouton clef par ligne dans ParticipantsTable. Ajout d'une
// confirmation explicite avant de couper l'ancien code (chantier 93 : la
// régénération est irréversible, l'ancien code cesse immédiatement de
// fonctionner).
export default function ParticipantCodesModal({ onClose }: Props) {
  const { participants, table } = useTable()
  const { showToast } = useToast()
  const [target, setTarget]   = useState<Participant | null>(null)
  const [newCode, setNewCode] = useState<{ pseudo: string; code: string } | null>(null)

  async function doRegenerate() {
    if (!target) return
    try {
      const res = await regenerateReclaimCodeModerator(table.id, target.pseudo)
      setTarget(null)
      setNewCode({ pseudo: res.pseudo, code: res.new_reclaim_code })
    } catch (e) {
      setTarget(null)
      showToast(extractErr(e), 'error')
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4"
        onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
            <h2 className="text-sm font-semibold text-gray-900">Code participant</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg
                focus:outline-none focus:ring-2 focus:ring-gray-300"
              aria-label="Fermer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p className="px-5 pt-3 text-xs text-gray-500 leading-relaxed">
            Une personne a perdu son code de rappel ? Génère-lui-en un nouveau à lui lire —
            l'ancien cessera aussitôt de fonctionner.
          </p>

          <div className="overflow-y-auto px-2 py-2">
            {participants.length === 0 ? (
              <p className="text-xs text-center text-gray-400 py-4">Aucun participant</p>
            ) : (
              <ul className="flex flex-col">
                {participants.map(p => (
                  <li key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-50">
                    <span className="text-sm text-gray-800 truncate flex-1">{p.pseudo}</span>
                    <button
                      onClick={() => setTarget(p)}
                      title="Cette personne a perdu son code de rappel : en générer un nouveau, à lui lire (l'ancien cesse de fonctionner)"
                      className="p-1.5 rounded-lg border border-amber-300 text-amber-600
                        hover:bg-amber-50 transition-colors focus:outline-none
                        focus:ring-2 focus:ring-amber-400 focus:ring-offset-1"
                    >
                      🔑
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="pb-2" />
        </div>
      </div>

      {target && (
        <ConfirmModal
          title={`Remplacer le code de ${target.pseudo} ?`}
          body="L'ancien code de rappel sera immédiatement supprimé et ne fonctionnera plus. Un nouveau code sera généré, à lire à cette personne."
          confirmLabel="Remplacer"
          onConfirm={doRegenerate}
          onCancel={() => setTarget(null)}
        />
      )}

      {newCode && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4"
          onMouseDown={e => { if (e.target === e.currentTarget) setNewCode(null) }}
        >
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-sm p-5 space-y-4 text-center">
            <h2 className="text-sm font-semibold text-slate-100">Nouveau code de rappel</h2>
            <p className="text-sm text-slate-400">
              À lire à <strong className="text-slate-200">{newCode.pseudo}</strong>.
              L'ancien code ne fonctionne plus, et celui-ci ne sera plus affiché.
            </p>
            <p className="text-4xl font-mono font-bold tracking-widest text-amber-400">{newCode.code}</p>
            <button
              onClick={() => setNewCode(null)}
              className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-medium rounded-xl transition-colors"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  )
}
