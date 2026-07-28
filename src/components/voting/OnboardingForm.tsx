import { useState } from 'react'
import { submitEntryResponse } from '../../lib/voting'
import type { EntryResponse, SessionMember } from '../../lib/types'

interface OnboardingFormProps {
  sessionId: string
  member: SessionMember
  onSuccess: (response: EntryResponse) => void
}

// Chantier 19 (G3) — onboarding réduit de 6 à 3 questions (spec §8).
// Chaque question alimente une règle de l'allocation v2 ; les trois
// anciennes questions (taille de groupe, préférence modérateur, ouverture
// aux avis différents) n'alimentaient plus rien et ont été supprimées.
interface Answers {
  /** Règle 2 — table enregistrable. */
  consentTranscript: boolean | null
  /** Règles 4 et 5 — ancien / nouveau. */
  ecclesiaExperience: boolean | null
  /** Règle 1 — assez de participants actifs. */
  participationStyle: 'listener' | 'active' | null
}

const TOTAL_QUESTIONS = 3

export default function OnboardingForm({ sessionId, member, onSuccess }: OnboardingFormProps) {
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<Answers>({
    consentTranscript: null,
    ecclesiaExperience: null,
    participationStyle: null,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof Answers>(key: K, value: Answers[K]) {
    setAnswers(prev => ({ ...prev, [key]: value }))
  }

  function isCurrentAnswered(): boolean {
    switch (currentQ) {
      case 0: return answers.consentTranscript !== null
      case 1: return answers.ecclesiaExperience !== null
      case 2: return answers.participationStyle !== null
      default: return true
    }
  }

  async function handleValidate() {
    if (!isCurrentAnswered()) return
    setError(null)
    setLoading(true)
    try {
      const response = await submitEntryResponse(
        sessionId,
        answers.consentTranscript!,
        answers.participationStyle!,
        answers.ecclesiaExperience!,
      )
      onSuccess(response)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue')
    } finally {
      setLoading(false)
    }
  }

  const pct = Math.round(((currentQ + 1) / TOTAL_QUESTIONS) * 100)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Progress bar */}
      <div className="px-4 pt-14 pb-4 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500">Question {currentQ + 1}/{TOTAL_QUESTIONS}</span>
          <span className="text-xs text-indigo-600 font-medium">{member.pseudo}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-1.5">
          <div
            className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="flex-1 flex flex-col justify-center px-4 py-8">
        {currentQ === 0 && (
          <QuestionConsent
            value={answers.consentTranscript}
            onChange={v => update('consentTranscript', v)}
          />
        )}
        {currentQ === 1 && (
          <QuestionEcclesia
            value={answers.ecclesiaExperience}
            onChange={v => update('ecclesiaExperience', v)}
          />
        )}
        {currentQ === 2 && (
          <QuestionStyle
            value={answers.participationStyle}
            onChange={v => update('participationStyle', v)}
          />
        )}
      </div>

      {/* Navigation */}
      <div className="px-4 pb-8 space-y-3">
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="flex gap-3">
          {currentQ > 0 && (
            <button
              onClick={() => setCurrentQ(q => q - 1)}
              className="flex-1 py-3 px-4 border border-gray-300 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              ← Précédent
            </button>
          )}
          {currentQ < TOTAL_QUESTIONS - 1 ? (
            <button
              onClick={() => setCurrentQ(q => q + 1)}
              disabled={!isCurrentAnswered()}
              className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
            >
              Suivant →
            </button>
          ) : (
            <button
              onClick={handleValidate}
              disabled={loading || !isCurrentAnswered()}
              className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
            >
              {loading ? 'Enregistrement…' : 'Valider et voter ✓'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Question sub-components ---

function QuestionConsent({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2">Consentement</p>
        <h2 className="text-xl font-bold text-gray-900 leading-snug">
          Acceptes-tu que les conversations à ta table soient transcrites de manière anonyme pour produire un résumé ?
        </h2>
        <p className="text-xs text-gray-400 mt-2 leading-relaxed">
          Seul le texte transcrit et anonymisé est conservé. L'enregistrement audio n'est utilisé qu'en direct pour produire cette transcription et n'est jamais sauvegardé.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <ChoiceButton selected={value === true} onClick={() => onChange(true)} emoji="✅" label="Oui" />
        <ChoiceButton selected={value === false} onClick={() => onChange(false)} emoji="🚫" label="Non" />
      </div>
    </div>
  )
}

// Reformulée en binaire (G3) : l'algorithme n'a besoin que de ancien / nouveau.
function QuestionEcclesia({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2">Expérience</p>
        <h2 className="text-xl font-bold text-gray-900 leading-snug">
          As-tu déjà fait un débat Ecclesia ?
        </h2>
        <p className="text-xs text-gray-400 mt-2 leading-relaxed">
          Cela nous aide à répartir les tables pour qu'il y ait partout des personnes qui connaissent le déroulé.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <ChoiceButton selected={value === true}  onClick={() => onChange(true)}  emoji="🌳" label="Oui" sub="Déjà participé" />
        <ChoiceButton selected={value === false} onClick={() => onChange(false)} emoji="🌱" label="Non" sub="Première fois" />
      </div>
    </div>
  )
}

function QuestionStyle({
  value,
  onChange,
}: {
  value: 'listener' | 'active' | null
  onChange: (v: 'listener' | 'active') => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2">Style de participation</p>
        <h2 className="text-xl font-bold text-gray-900 leading-snug">
          Comment comptes-tu participer ?
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <ChoiceButton selected={value === 'listener'} onClick={() => onChange('listener')} emoji="👂" label="Plutôt écouter" />
        <ChoiceButton selected={value === 'active'} onClick={() => onChange('active')} emoji="✋" label="Participer activement" />
      </div>
    </div>
  )
}

function ChoiceButton({
  selected,
  onClick,
  emoji,
  label,
  sub,
}: {
  selected: boolean
  onClick: () => void
  emoji: string
  label: string
  sub?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1 py-4 px-3 rounded-2xl border-2 transition-all ${
        selected
          ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
          : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-200 hover:bg-indigo-50/50'
      }`}
    >
      <span className="text-2xl">{emoji}</span>
      <span className="text-sm font-semibold leading-tight text-center">{label}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </button>
  )
}
