import { DEBATE_RULES_TEXT } from '../lib/debateRules'

interface Props {
  onConfirm(): void
}

/** Lecture rapide des règles du débat — confirmation individuelle, sans attente des autres (D1). */
export default function DebateRulesModal({ onConfirm }: Props) {
  return (
    <div className="fixed inset-0 bg-bleu-fonce/60 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-sm shadow-2xl flex flex-col overflow-hidden animate-entree">
        <div className="bg-bleu-fonce px-6 py-5 text-center">
          <p className="text-2xl mb-1">📜</p>
          <h2 className="font-serif text-xl font-semibold text-creme">Règles d'Ecclesia lors des débats</h2>
          <span aria-hidden="true" className="filet-spectre mx-auto mt-3 block w-12" />
        </div>
        <div className="px-6 py-5 text-sm text-anthracite/80 whitespace-pre-line leading-relaxed">
          {DEBATE_RULES_TEXT}
        </div>
        <div className="px-6 pb-6">
          <button
            onClick={onConfirm}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors
              focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2"
          >
            J'ai lu
          </button>
        </div>
      </div>
    </div>
  )
}
