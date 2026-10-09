import { useState } from 'react'
import { submitEntryResponse, setMyPairings } from '../../lib/voting'
import { PairingFields, PairingResultsList, ReciprocityNotice, PAIRING_EXPLANATION, PAIRING_LATER_NOTE } from './PairingModal'
import type { PairingResult } from '../../lib/voting'
import type { EntryResponse, ParticipationStyle, SessionMember } from '../../lib/types'

interface OnboardingFormProps {
  sessionId: string
  member: SessionMember
  onSuccess: (response: EntryResponse) => void
  /**
   * Chantier 150 — mode modification : réponses actuelles à pré-remplir. Le
   * formulaire se limite alors aux trois questions d'allocation (les
   * partenaires ont leur propre fenêtre dans « Outils ») et `onCancel` ferme
   * sans rien enregistrer.
   */
  initial?: EntryResponse | null
  onCancel?: () => void
}

// Chantier 19 (G3) — onboarding réduit de 6 à 3 questions (spec §8).
// Chaque question alimente une règle de l'allocation v2 ; les trois
// anciennes questions (taille de groupe, préférence modérateur, ouverture
// aux avis différents) n'alimentaient plus rien et ont été supprimées.
interface Answers {
  /** Règle 1 — table enregistrable. */
  consentTranscript: boolean | null
  /** Règles 4 et 5 — ancien / nouveau. */
  ecclesiaExperience: boolean | null
  /** Chantier 91/151 — actif et intermédiaire : forment les tables ; passif : placé en public. */
  participationStyle: ParticipationStyle | null
  /** Chantier 92 — règle 1 de l'allocation : binômes (facultatif). */
  pairings: [string, string]
}

const TOTAL_QUESTIONS = 4
/** Chantier 150 — en modification, la question des partenaires n'est pas reposée. */
const TOTAL_QUESTIONS_EDIT = 3

export default function OnboardingForm({ sessionId, member, onSuccess, initial = null, onCancel }: OnboardingFormProps) {
  const editing = initial !== null
  const totalQuestions = editing ? TOTAL_QUESTIONS_EDIT : TOTAL_QUESTIONS
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<Answers>({
    consentTranscript: initial ? initial.consent_transcript : null,
    ecclesiaExperience: initial ? initial.ecclesia_experience ?? false : null,
    participationStyle: initial ? initial.participation_style : null,
    pairings: ['', ''],
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Chantier 92 — après validation, on montre l'état de chaque binôme
  // (réciproque ou en attente) avant de passer au vote.
  const [pairingDone, setPairingDone] = useState<{ response: EntryResponse; results: PairingResult[] } | null>(null)

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
      // Chantier 92 — facultatif : un échec (pseudo introuvable, réseau) ne
      // bloque pas l'accès au vote, la personne peut corriger depuis « Outils ».
      const pseudos = answers.pairings.filter(p => p.trim() !== '')
      if (!editing && pseudos.length > 0) {
        try {
          const res = await setMyPairings(sessionId, pseudos)
          setPairingDone({ response, results: res.results })
          return
        } catch { /* rattrapable via Outils */ }
      }
      onSuccess(response)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue')
    } finally {
      setLoading(false)
    }
  }

  const pct = Math.round(((currentQ + 1) / totalQuestions) * 100)

  if (pairingDone) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center px-4 py-8">
        <div className="max-w-md mx-auto w-full space-y-4">
          <h2 className="text-xl font-bold text-gray-900">🔗 Être avec un ami (facultatif)</h2>
          <PairingResultsList results={pairingDone.results} />
          <ReciprocityNotice />
          <p className="text-xs text-gray-400">Tu peux les modifier à tout moment dans « Outils » → « Être avec un ami ».</p>
          <button
            onClick={() => onSuccess(pairingDone.response)}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl"
          >
            Continuer vers le vote →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Progress bar */}
      <div className="px-4 pt-14 pb-4 bg-white border-b border-gray-100">
        {/* Chantier 150 — « facultatif » en toute première ligne de l'écran. */}
        {currentQ === 3 && !editing && (
          <p className="text-sm font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3 leading-snug">
            Facultatif — tu peux passer cette question et la remplir plus tard, à tout moment pendant le vote, dans « Outils » → « Être avec un ami ».
          </p>
        )}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500">
            {editing ? "Modifier mon questionnaire d'entrée · " : ''}Question {currentQ + 1}/{totalQuestions}
          </span>
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
        {currentQ === 3 && !editing && (
          <div className="space-y-6">
            <div>
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2">Être avec un ami</p>
              <h2 className="text-xl font-bold text-gray-900 leading-snug">
                Avec qui aimerais-tu être à table ?
              </h2>
              <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                Une ou deux personnes au plus. {PAIRING_EXPLANATION}
              </p>
            </div>
            <ReciprocityNotice />
            <PairingFields values={answers.pairings} onChange={v => update('pairings', v)} />
            {/* Chantier 165 — le cas fréquent : le nom de l'autre n'est pas encore inscrit. */}
            <p className="text-xs text-gray-600 bg-white border border-gray-200 rounded-xl px-3 py-2 leading-snug">
              💡 {PAIRING_LATER_NOTE}
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="px-4 pb-8 space-y-3">
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}
        {editing && onCancel && (
          <button
            onClick={onCancel}
            className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Annuler, ne rien changer
          </button>
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
          {currentQ < totalQuestions - 1 ? (
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
              {loading ? 'Enregistrement…' : editing ? 'Enregistrer mes réponses ✓' : 'Valider et voter ✓'}
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
  value: ParticipationStyle | null
  onChange: (v: ParticipationStyle) => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2">Style de participation</p>
        <h2 className="text-xl font-bold text-gray-900 leading-snug">
          Comment comptes-tu participer ?
        </h2>
        <p className="text-xs text-gray-400 mt-2 leading-relaxed">
          Ce n'est pas définitif : tu pourras toujours prendre la parole en cours de débat, même si tu choisis « Passif ».
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ChoiceButton selected={value === 'listener'} onClick={() => onChange('listener')} emoji="👂" label="Passif" sub="Je ne compte pas parler du tout" />
        <ChoiceButton selected={value === 'intermediate'} onClick={() => onChange('intermediate')} emoji="🤔" label="Intermédiaire" sub="Je compte éventuellement prendre la parole" />
        <ChoiceButton selected={value === 'active'} onClick={() => onChange('active')} emoji="✋" label="Actif" sub="Je compte prendre la parole" />
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
