import { useEffect, useMemo, useState } from 'react'
import { useTable } from '../context/TableContext'
import { supabase } from '../lib/supabase'
import { extractErr, QUESTIONNAIRE_THEMES } from '../lib/utils'
import type { QuestionnaireResponse } from '../lib/types'

const THEMES_INITIAL = 5

interface Props {
  onClose: () => void
  /** Réponse déjà enregistrée, chargée par QuestionnaireFab avant l'ouverture. */
  savedResponse: QuestionnaireResponse | null
  /** Quand true : modal verrouillé (forçage admin) — pas de croix, Echap ni clic overlay. */
  forced?: boolean
}

export default function QuestionnaireModal({ onClose, savedResponse, forced = false }: Props) {
  const { table } = useTable()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess,  setShowSuccess]  = useState(false)
  const [err,          setErr]          = useState<string | null>(null)

  // Afficher tous les thèmes d'emblée s'il y en a déjà des notés
  const hasAnyThemeRated = savedResponse !== null &&
    Object.keys(savedResponse.theme_ratings ?? {}).length > 0
  const [showAllThemes, setShowAllThemes] = useState(hasAnyThemeRated)

  // État initialisé depuis savedResponse (pas de fetch : déjà chargé par le parent)
  const [themeIdeas,     setThemeIdeas]     = useState(savedResponse?.theme_ideas     ?? '')
  const [themeRatings,   setThemeRatings]   = useState<Record<string, number>>(savedResponse?.theme_ratings ?? {})
  const [staffInterest,  setStaffInterest]  = useState(savedResponse?.staff_interest  ?? '')
  const [debateAttended, setDebateAttended] = useState(savedResponse?.debate_attended ?? '')
  const [debateRating,   setDebateRating]   = useState<number | null>(savedResponse?.debate_rating ?? null)
  const [feedback,       setFeedback]       = useState(savedResponse?.feedback        ?? '')

  // Helpers de verrouillage : un champ est verrouillé s'il a une valeur enregistrée non nulle
  const locked = {
    themeIdeas:     savedResponse?.theme_ideas     != null,
    debateAttended: savedResponse?.debate_attended != null,
    debateRating:   savedResponse?.debate_rating   != null,
    staffInterest:  savedResponse?.staff_interest  != null,
    feedback:       savedResponse?.feedback        != null,
    theme: (t: string) => savedResponse?.theme_ratings[t] !== undefined,
  }

  // Ordre aléatoire fixé au montage, re-mélangé à chaque ouverture
  const shuffledThemes = useMemo(
    () => [...QUESTIONNAIRE_THEMES].sort(() => Math.random() - 0.5),
    []
  )
  const visibleThemes = showAllThemes ? shuffledThemes : shuffledThemes.slice(0, THEMES_INITIAL)

  // Fermeture via Escape (désactivée si modal forcé)
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (!forced && e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, forced])

  async function handleSubmit() {
    setErr(null)
    setIsSubmitting(true)
    try {
      const { error } = await supabase.rpc('submit_questionnaire', {
        p_table_id:        table.id,
        p_session_id:      table.session_id ?? null,
        p_theme_ideas:     themeIdeas.trim()     || null,
        p_theme_ratings:   themeRatings,
        p_debate_attended: debateAttended.trim() || null,
        p_debate_rating:   debateRating,
        p_staff_interest:  staffInterest.trim()  || null,
        p_feedback:        feedback.trim()        || null,
      })
      if (error) throw error
      setShowSuccess(true)
      setTimeout(onClose, 2000)
    } catch (e) {
      setErr(extractErr(e))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4"
      onClick={!forced ? onClose : undefined}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Questionnaire post-débat</h2>
            <p className="text-sm text-gray-500 mt-0.5 leading-snug">
              Quelques questions pour améliorer les prochaines séances.&nbsp;Anonyme,&nbsp;~2&nbsp;min.
            </p>
            {savedResponse && (
              <p className="text-xs text-amber-600 mt-1">
                Certaines réponses sont déjà enregistrées et ne peuvent plus être modifiées.
              </p>
            )}
          </div>
          {!forced && (
            <button
              onClick={onClose}
              className="ml-4 flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors
                focus:outline-none focus:ring-2 focus:ring-gray-300 rounded-lg p-1"
              aria-label="Fermer"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        {/* ── Body ── */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          {showSuccess ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-7 h-7 text-green-600" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <p className="text-lg font-semibold text-gray-900">Merci pour ton retour !</p>
              <p className="text-sm text-gray-500">Fermeture automatique…</p>
            </div>
          ) : (
            <>
              {/* Q1 — Idées de thèmes */}
              <QuestionBlock
                label="Quelle(s) idée(s) de thème pour un débat aimerais-tu aborder ?"
                locked={locked.themeIdeas}
              >
                <textarea
                  value={themeIdeas}
                  onChange={e => setThemeIdeas(e.target.value)}
                  disabled={locked.themeIdeas}
                  rows={3}
                  placeholder="Ex. : l'intelligence artificielle, la démocratie directe…"
                  className={locked.themeIdeas ? textareaLockedClass : textareaClass}
                />
              </QuestionBlock>

              {/* Q2 — Notes par thème */}
              <QuestionBlock label="Quels thèmes t'attireraient le plus (5) au moins (0) ?">
                <div className="space-y-3">
                  {visibleThemes.map(theme => (
                    <ThemeRatingRow
                      key={theme}
                      theme={theme}
                      value={themeRatings[theme] ?? null}
                      locked={locked.theme(theme)}
                      onChange={v => setThemeRatings(prev => {
                        if (v === null) { const next = { ...prev }; delete next[theme]; return next }
                        return { ...prev, [theme]: v }
                      })}
                    />
                  ))}
                </div>
                {!showAllThemes && (
                  <button
                    onClick={() => setShowAllThemes(true)}
                    className="mt-2 text-xs text-indigo-600 hover:text-indigo-800 hover:underline
                      focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded"
                  >
                    Voir plus ({shuffledThemes.length - THEMES_INITIAL} autres)
                  </button>
                )}
              </QuestionBlock>

              {/* Q3 — Staffer */}
              <QuestionBlock
                label="Est-ce que tu voudrais staffer chez Ecclesia ?"
                locked={locked.staffInterest}
              >
                <p className="text-xs text-gray-500 mb-2 leading-relaxed">
                  Modérer un débat, aider à la préparation des fiches d'informations ou à la
                  communication, etc. Si oui, ajoute ton Prénom Nom et un contact (num ou mail).
                </p>
                <textarea
                  value={staffInterest}
                  onChange={e => setStaffInterest(e.target.value)}
                  disabled={locked.staffInterest}
                  rows={2}
                  placeholder="Prénom Nom, 06… ou email@…"
                  className={locked.staffInterest ? textareaLockedClass : textareaClass}
                />
              </QuestionBlock>

              {/* Q4 — Quel débat */}
              <QuestionBlock
                label="À quel débat viens-tu de participer ?"
                locked={locked.debateAttended}
              >
                <input
                  type="text"
                  value={debateAttended}
                  onChange={e => setDebateAttended(e.target.value)}
                  disabled={locked.debateAttended}
                  placeholder="Ex. : La religion, Le 12 mai 2026…"
                  className={locked.debateAttended ? inputLockedClass : inputClass}
                />
              </QuestionBlock>

              {/* Q5 — Note globale */}
              <QuestionBlock
                label="De 0 (horrible) à 5 (super), as-tu apprécié le débat ?"
                locked={locked.debateRating}
              >
                <RatingRow
                  value={debateRating}
                  locked={locked.debateRating}
                  onChange={setDebateRating}
                />
              </QuestionBlock>

              {/* Q6 — Retour libre */}
              <QuestionBlock
                label="As-tu un retour à nous faire ? Négatif comme positif !"
                locked={locked.feedback}
              >
                <textarea
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  disabled={locked.feedback}
                  rows={3}
                  placeholder="Tout commentaire est le bienvenu…"
                  className={locked.feedback ? textareaLockedClass : textareaClass}
                />
              </QuestionBlock>

              {err && (
                <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-xl border border-red-200">
                  {err}
                </p>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        {!showSuccess && (
          <div className="px-6 pb-6 pt-4 border-t border-gray-100 flex-shrink-0">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full py-3 text-sm font-semibold bg-indigo-600 text-white rounded-xl
                hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2
                focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Envoi…' : 'Envoyer'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sous-composants ───────────────────────────────────────────────

function QuestionBlock({
  label, locked, children,
}: {
  label: string
  locked?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`space-y-2 ${locked ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-semibold text-gray-800 leading-snug">{label}</p>
        {locked && (
          <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        )}
      </div>
      {children}
    </div>
  )
}

function ThemeRatingRow({
  theme, value, locked, onChange,
}: {
  theme: string
  value: number | null
  locked: boolean
  onChange: (v: number | null) => void
}) {
  return (
    <div className={`flex items-start gap-3 ${locked ? 'opacity-60' : ''}`}>
      <span className="flex-1 text-sm text-gray-700 leading-snug pt-1">{theme}</span>
      <div className="flex gap-1 flex-shrink-0">
        {[0, 1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            onClick={() => !locked && onChange(value === n ? null : n)}
            disabled={locked}
            className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors
              focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1
              disabled:cursor-not-allowed ${
              value === n
                ? 'bg-indigo-600 text-white'
                : locked
                  ? 'bg-gray-100 text-gray-400'
                  : 'bg-gray-100 text-gray-600 hover:bg-indigo-100 hover:text-indigo-700'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

function RatingRow({
  value, locked, onChange,
}: {
  value: number | null
  locked: boolean
  onChange: (v: number | null) => void
}) {
  return (
    <div className="flex gap-2">
      {[0, 1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          onClick={() => !locked && onChange(value === n ? null : n)}
          disabled={locked}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors
            focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1
            disabled:cursor-not-allowed ${
            value === n
              ? 'bg-indigo-600 text-white shadow-md'
              : locked
                ? 'bg-gray-100 text-gray-400'
                : 'bg-gray-100 text-gray-600 hover:bg-indigo-100 hover:text-indigo-700'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

const textareaClass = `w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm
  text-gray-900 placeholder:text-gray-400 resize-none leading-relaxed
  focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent`

const textareaLockedClass = `w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm
  text-gray-700 bg-gray-50 resize-none leading-relaxed cursor-not-allowed`

const inputClass = `w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm
  text-gray-900 placeholder:text-gray-400
  focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent`

const inputLockedClass = `w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm
  text-gray-700 bg-gray-50 cursor-not-allowed`
