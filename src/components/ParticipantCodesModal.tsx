import { useState } from 'react'
import { useTable } from '../context/TableContext'
import { useToast } from '../context/ToastContext'
import { extractErr } from '../lib/utils'
import { regenerateReclaimCodeModerator } from '../lib/voting'
import ConfirmModal from './ConfirmModal'
import type { Participant } from '../lib/types'
import EnTeteFenetre from './EnTeteFenetre'

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
        className="fixed inset-0 bg-bleu-fonce/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center z-50 p-4"
        onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="bg-white w-full max-w-sm shadow-2xl overflow-hidden rounded-[12px] flex flex-col max-h-[85vh] ring-1 ring-white/10 animate-entree">
          <EnTeteFenetre titre="Code participant" onClose={onClose} />

          <p className="px-5 pt-4 text-xs text-gray-600 leading-relaxed">
            Une personne a perdu son code de rappel ? Génère-lui-en un nouveau à lui lire.
            L'ancien cessera aussitôt de fonctionner.
          </p>

          <div className="overflow-y-auto px-2 py-2">
            {participants.length === 0 ? (
              <p className="text-xs text-center text-gray-500 py-4">Aucun participant</p>
            ) : (
              <ul className="flex flex-col">
                {participants.map(p => (
                  <li key={p.id} className="flex items-center gap-2 rounded-[8px] px-3 py-1.5 hover:bg-indigo-50/60">
                    <span className="text-sm text-gray-800 truncate flex-1">{p.pseudo}</span>
                    <button
                      onClick={() => setTarget(p)}
                      title="Cette personne a perdu son code de rappel : en générer un nouveau, à lui lire (l'ancien cesse de fonctionner)"
                      className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-amber-300 text-amber-600
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
          className="fixed inset-0 bg-bleu-fonce/60 backdrop-blur-[2px] flex items-center justify-center z-50 px-4"
          onMouseDown={e => { if (e.target === e.currentTarget) setNewCode(null) }}
        >
          <div className="bg-white shadow-2xl w-full max-w-sm overflow-hidden rounded-[12px] ring-1 ring-white/10 animate-entree">
            <EnTeteFenetre titre="Nouveau code de rappel" />
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600 leading-relaxed">
                À lire à <strong className="text-anthracite">{newCode.pseudo}</strong>.
                L'ancien code ne fonctionne plus, et celui-ci ne sera plus affiché.
              </p>
              <div className="rounded-[12px] bg-amber-50 border border-amber-200 p-4 text-center">
                <p className="text-[11px] font-bold text-amber-800 uppercase tracking-[0.16em] mb-1.5">Code de rappel</p>
                <p className="text-4xl font-bold tabular-nums tracking-[0.2em] text-amber-700">{newCode.code}</p>
              </div>
              <button
                onClick={() => setNewCode(null)}
                className="w-full rounded-[8px] py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2"
              >
                C'est noté
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
