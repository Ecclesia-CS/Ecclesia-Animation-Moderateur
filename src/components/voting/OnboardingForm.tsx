import { useState } from 'react'
import { submitEntryResponse } from '../../lib/voting'
import type { EntryResponse, SessionMember } from '../../lib/types'

interface OnboardingFormProps {
  sessionId: string
  member: SessionMember
  onSuccess: (response: EntryResponse) => void
}

interface Answers {
  consentTranscript: boolean
  ecclesiaExperience: 'never' | 'once_twice' | 'several_times' | null
  groupSizePref: 'small' | 'medium' | 'large'
  moderatorPref: boolean
  opennessToDiff: number
  participationStyle: 'listener' | 'active'
}

const TOTAL_QUESTIONS = 6

export default function OnboardingForm({ sessionId, member, onSuccess }: OnboardingFormProps) {
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<Answers>({
    consentTranscript: false,
    ecclesiaExperience: null,
    groupSizePref: 'medium',
    moderatorPref: true,
    opennessToDiff: 3,
    participationStyle: 'active',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof Answers>(key: K, value: Answers[K]) {
    setAnswers(prev => ({ ...prev, [key]: value }))
  }

  function handleEcclesiaExperience(v: 'never' | 'once_twice' | 'several_times') {
    setAnswers(prev => ({
      ...prev,
      ecclesiaExperience: v,
      // First-timer → suggest moderated large-group; user can still override
      ...(v === 'never' ? { moderatorPref: true, groupSizePref: 'large' } : {}),
    }))
  }

  async function handleValidate() {
    setError(null)
    setLoading(true)
    try {
      const response = await submitEntryResponse(
        sessionId,
        answers.consentTranscript,
        answers.groupSizePref,
        answers.moderatorPref,
        answers.opennessToDiff,
        answers.participationStyle,
        answers.ecclesiaExperience,
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
      <div className="px-4 pt-5 pb-4 bg-white border-b border-gray-100">
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
            onChange={handleEcclesiaExperience}
          />
        )}
        {currentQ === 2 && (
          <QuestionGroupSize
            value={answers.groupSizePref}
            onChange={v => update('groupSizePref', v)}
          />
        )}
        {currentQ === 3 && (
          <QuestionModerator
            value={answers.moderatorPref}
            onChange={v => update('moderatorPref', v)}
          />
        )}
        {currentQ === 4 && (
          <QuestionOpenness
            value={answers.opennessToDiff}
            onChange={v => update('opennessToDiff', v)}
          />
        )}
        {currentQ === 5 && (
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
              className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
            >
              Suivant →
            </button>
          ) : (
            <button
              onClick={handleValidate}
              disabled={loading}
              className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-xl transition-colors"
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

function QuestionEcclesia({
  value,
  onChange,
}: {
  value: 'never' | 'once_twice' | 'several_times' | null
  onChange: (v: 'never' | 'once_twice' | 'several_times') => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2">Expérience</p>
        <h2 className="text-xl font-bold text-gray-900 leading-snug">
          As-tu déjà participé à un débat Ecclesia ?
        </h2>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <ChoiceButton
          selected={value === 'never'}
          onClick={() => onChange('never')}
          emoji="🌱"
          label="Jamais"
          sub="Première fois"
        />
        <ChoiceButton
          selected={value === 'once_twice'}
          onClick={() => onChange('once_twice')}
          emoji="🌿"
          label="1-2 fois"
          sub="Déjà essayé"
        />
        <ChoiceButton
          selected={value === 'several_times'}
          onClick={() => onChange('several_times')}
          emoji="🌳"
          label="Plusieurs fois"
          sub="Habitué(e)"
        />
      </div>
    </div>
  )
}

function QuestionConsent({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2">Consentement</p>
        <h2 className="text-xl font-bold text-gray-900 leading-snug">
          Acceptes-tu que les conversations à ta table soient transcrites de manière anonyme pour produire un résumé ?
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <ChoiceButton selected={value === true} onClick={() => onChange(true)} emoji="✅" label="Oui" />
        <ChoiceButton selected={value === false} onClick={() => onChange(false)} emoji="🚫" label="Non" />
      </div>
    </div>
  )
}

function QuestionGroupSize({
  value,
  onChange,
}: {
  value: 'small' | 'medium' | 'large'
  onChange: (v: 'small' | 'medium' | 'large') => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2">Taille de groupe</p>
        <h2 className="text-xl font-bold text-gray-900 leading-snug">
          Tu préfères être dans un groupe de quelle taille ?
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <ChoiceButton selected={value === 'small'} onClick={() => onChange('small')} emoji="👥" label="Petit" sub="~5 pers." />
        <ChoiceButton selected={value === 'large'} onClick={() => onChange('large')} emoji="👥👥👥" label="Grand" sub="~10 pers." />
      </div>
    </div>
  )
}

function QuestionModerator({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2">Modération</p>
        <h2 className="text-xl font-bold text-gray-900 leading-snug">
          Préfères-tu une table avec un modérateur ?
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <ChoiceButton selected={value === true} onClick={() => onChange(true)} emoji="🎙️" label="Oui" />
        <ChoiceButton selected={value === false} onClick={() => onChange(false)} emoji="🤝" label="Pas nécessaire" />
      </div>
    </div>
  )
}

function QuestionOpenness({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  // On présente 3 niveaux, mappés sur les valeurs 1, 3, 5
  const levels = [
    { val: 1, emoji: '🤝', label: 'Similaires', sub: 'Des gens qui pensent comme moi' },
    { val: 3, emoji: '⚖️', label: 'Intermédiaires', sub: 'Un peu de tout' },
    { val: 5, emoji: '🌍', label: 'Très différents', sub: 'Maximum de diversité' },
  ]
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2">Diversité des avis</p>
        <h2 className="text-xl font-bold text-gray-900 leading-snug">
          À quel point veux-tu rencontrer des avis différents du tien ?
        </h2>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {levels.map(l => (
          <ChoiceButton
            key={l.val}
            selected={value === l.val}
            onClick={() => onChange(l.val)}
            emoji={l.emoji}
            label={l.label}
            sub={l.sub}
          />
        ))}
      </div>
    </div>
  )
}

function QuestionStyle({
  value,
  onChange,
}: {
  value: 'listener' | 'active'
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
