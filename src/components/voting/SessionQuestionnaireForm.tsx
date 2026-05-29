import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { extractErr, QUESTIONNAIRE_THEMES } from '../../lib/utils'

const THEMES_INITIAL = 5

interface Props {
  sessionId: string
  onDone: () => void
}

export default function SessionQuestionnaireForm({ sessionId, onDone }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess,  setShowSuccess]  = useState(false)
  const [err,          setErr]          = useState<string | null>(null)

  const [showAllThemes,  setShowAllThemes]  = useState(false)
  const [themeIdeas,     setThemeIdeas]     = useState('')
  const [themeRatings,   setThemeRatings]   = useState<Record<string, number>>({})
  const [staffInterest,  setStaffInterest]  = useState('')
  const [debateAttended, setDebateAttended] = useState('')
  const [debateRating,   setDebateRating]   = useState<number | null>(null)
  const [feedback,       setFeedback]       = useState('')

  const shuffledThemes = useMemo(
    () => [...QUESTIONNAIRE_THEMES].sort(() => Math.random() - 0.5),
    []
  )
  const visibleThemes = showAllThemes ? shuffledThemes : shuffledThemes.slice(0, THEMES_INITIAL)

  async function handleSubmit() {
    setErr(null)
    setIsSubmitting(true)
    try {
      const { error } = await supabase.rpc('submit_questionnaire', {
        p_table_id:        null,
        p_session_id:      sessionId,
        p_theme_ideas:     themeIdeas.trim()     || null,
        p_theme_ratings:   themeRatings,
        p_debate_attended: debateAttended.trim() || null,
        p_debate_rating:   debateRating,
        p_staff_interest:  staffInterest.trim()  || null,
        p_feedback:        feedback.trim()        || null,
      })
      if (error) throw error
      setShowSuccess(true)
      setTimeout(onDone, 2000)
    } catch (e) {
      setErr(extractErr(e))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900">Questionnaire post-débat</h2>
          <p className="text-sm text-gray-500 mt-0.5 leading-snug">
            Quelques questions pour améliorer les prochaines séances.&nbsp;Anonyme,&nbsp;~2&nbsp;min.
          </p>
        </div>

        {/* Body */}
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
              <QBlock label="Quelle(s) idée(s) de thème pour un débat aimerais-tu aborder ?">
                <textarea
                  value={themeIdeas}
                  onChange={e => setThemeIdeas(e.target.value)}
                  rows={3}
                  placeholder="Ex. : l'intelligence artificielle, la démocratie directe…"
                  className={taClass}
                />
              </QBlock>

              {/* Q2 — Notes par thème */}
              <QBlock label="Quels thèmes t'attireraient le plus (5) au moins (0) ?">
                <div className="space-y-3">
                  {visibleThemes.map(theme => (
                    <ThemeRow
                      key={theme}
                      theme={theme}
                      value={themeRatings[theme] ?? null}
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
                    className="mt-2 text-xs text-indigo-600 hover:text-indigo-800 hover:underline focus:outline-none"
                  >
                    Voir plus ({shuffledThemes.length - THEMES_INITIAL} autres)
                  </button>
                )}
              </QBlock>

              {/* Q3 — Staffer */}
              <QBlock label="Est-ce que tu voudrais staffer chez Ecclesia ?">
                <p className="text-xs text-gray-500 mb-2 leading-relaxed">
                  Modérer un débat, aider à la préparation des fiches d'informations ou à la
                  communication, etc. Si oui, ajoute ton Prénom Nom et un contact (num ou mail).
                </p>
                <textarea
                  value={staffInterest}
                  onChange={e => setStaffInterest(e.target.value)}
                  rows={2}
                  placeholder="Prénom Nom, 06… ou email@…"
                  className={taClass}
                />
              </QBlock>

              {/* Q4 — Quel débat */}
              <QBlock label="À quel débat viens-tu de participer ?">
                <input
                  type="text"
                  value={debateAttended}
                  onChange={e => setDebateAttended(e.target.value)}
                  placeholder="Ex. : La religion, Le 12 mai 2026…"
                  className={inputClass}
                />
              </QBlock>

              {/* Q5 — Note globale */}
              <QBlock label="De 0 (horrible) à 5 (super), as-tu apprécié le débat ?">
                <div className="flex gap-2">
                  {[0, 1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setDebateRating(debateRating === n ? null : n)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors
                        focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 ${
                        debateRating === n
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'bg-gray-100 text-gray-600 hover:bg-indigo-100 hover:text-indigo-700'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </QBlock>

              {/* Q6 — Retour libre */}
              <QBlock label="As-tu un retour à nous faire ? Négatif comme positif !">
                <textarea
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  rows={3}
                  placeholder="Tout commentaire est le bienvenu…"
                  className={taClass}
                />
              </QBlock>

              {err && (
                <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-xl border border-red-200">
                  {err}
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
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

function QBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-gray-800 leading-snug">{label}</p>
      {children}
    </div>
  )
}

function ThemeRow({ theme, value, onChange }: {
  theme: string
  value: number | null
  onChange: (v: number | null) => void
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex-1 text-sm text-gray-700 leading-snug pt-1">{theme}</span>
      <div className="flex gap-1 flex-shrink-0">
        {[0, 1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            onClick={() => onChange(value === n ? null : n)}
            className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors
              focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 ${
              value === n
                ? 'bg-indigo-600 text-white'
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

const taClass = `w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm
  text-gray-900 placeholder:text-gray-400 resize-none leading-relaxed
  focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent`

const inputClass = `w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm
  text-gray-900 placeholder:text-gray-400
  focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent`
