import { DEBATE_RULES_TEXT } from '../lib/debateRules'

interface Props {
  onConfirm(): void
}

/** Lecture rapide des règles du débat — confirmation individuelle, sans attente des autres (D1). */
export default function DebateRulesModal({ onConfirm }: Props) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl flex flex-col overflow-hidden">
        <div className="bg-indigo-600 px-6 py-5 text-center">
          <p className="text-2xl mb-1">📜</p>
          <h2 className="text-lg font-bold text-white">Règles du débat</h2>
        </div>
        <div className="px-6 py-5 text-sm text-gray-700 whitespace-pre-line leading-relaxed">
          {DEBATE_RULES_TEXT}
        </div>
        <div className="px-6 pb-6">
          <button
            onClick={onConfirm}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            J'ai lu →
          </button>
        </div>
      </div>
    </div>
  )
}
