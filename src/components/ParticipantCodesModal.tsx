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
        className="fixed inset-0 bg-bleu-fonce/50 flex items-end sm:items-center justify-center z-50 p-4"
        onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="bg-white w-full max-w-sm shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-bleu-fonce/10 shrink-0">
            <h2 className="font-serif text-lg font-semibold text-bleu-fonce">Code participant</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-bleu-fonce transition-colors -m-1.5 p-2
                focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
              aria-label="Fermer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p className="px-5 pt-3 text-xs text-gray-500 leading-relaxed">
            Une personne a perdu son code de rappel ? Génère-lui-en un nouveau à lui lire.
            L'ancien cessera aussitôt de fonctionner.
          </p>

          <div className="overflow-y-auto px-2 py-2">
            {participants.length === 0 ? (
              <p className="text-xs text-center text-gray-500 py-4">Aucun participant</p>
            ) : (
              <ul className="flex flex-col">
                {participants.map(p => (
                  <li key={p.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
                    <span className="text-sm text-gray-800 truncate flex-1">{p.pseudo}</span>
                    <button
                      onClick={() => setTarget(p)}
                      title="Cette personne a perdu son code de rappel : en générer un nouveau, à lui lire (l'ancien cesse de fonctionner)"
                      className="p-1.5 border border-amber-300 text-amber-600
                        hover:bg-amber-50 transition-colors focus:outline-none
                        focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
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
          title={`Réinitialiser le code de ${target.pseudo} ?`}
          body="Attention : cela réinitialise le code de rappel de cette personne. Son ancien code sera supprimé et ne fonctionnera plus ; elle ne pourra se reconnecter qu'avec le nouveau code, que vous devrez lui lire."
          confirmLabel="Réinitialiser le code"
          onConfirm={doRegenerate}
          onCancel={() => setTarget(null)}
        />
      )}

      {newCode && (
        <div
          className="fixed inset-0 bg-bleu-fonce/60 flex items-center justify-center z-50 px-4"
          onMouseDown={e => { if (e.target === e.currentTarget) setNewCode(null) }}
        >
          <div className="bg-slate-900 border border-white/15 shadow-2xl w-full max-w-sm p-6 space-y-4 text-center text-creme animate-entree">
            <h2 className="font-serif text-xl font-semibold text-creme">Nouveau code de rappel</h2>
            <p className="text-sm text-slate-300">
              À lire à <strong className="text-creme">{newCode.pseudo}</strong>.
              L'ancien code ne fonctionne plus, et celui-ci ne sera plus affiché.
            </p>
            <p className="text-5xl font-mono font-bold tracking-[0.25em] tabular-nums text-amber-300">{newCode.code}</p>
            <button
              onClick={() => setNewCode(null)}
              className="btn-verre w-full py-2.5 text-creme text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair/60"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  )
}
