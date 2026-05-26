import { useEffect, useMemo, useState } from 'react'
import { useTable } from '../context/TableContext'
import { supabase } from '../lib/supabase'
import { extractErr } from '../lib/utils'
import type { QuestionnaireResponse } from '../lib/types'

const PROPOSED_THEMES = [
  "L'IA : encadrer ou accélérer ?",
  "Faut-il envoyer plus de satellites dans l'espace ?",
  "Faut-il privatiser des services publics essentiels ?",
  "La publicité : quel rôle devrait-elle avoir dans notre société ?",
  "IA : un salaire universel pour compenser l'augmentation de la productivité et la destruction des emplois ?",
  "Quels sont les indicateurs pertinents pour les politiques publiques ? (PIB ?)",
  "Comment allier la production/exportation des produits qui participent au réchauffement climatique ?",
  "Quelles politiques par rapport aux substances addictives ?",
  "Avion : quel futur pour l'industrie du voyage ?",
  "Algorithme de recommandation : comment les réglementer pour lutter contre la polarisation et l'ingérence de puissances étrangères dans notre vie politique ?",
  "Médias traditionnels : quels financements pour assurer leur indépendance (états et milliardaires) ?",
  "Taxe carbone : quelles propriétés pour aider à la transition écologique et sociale ?",
  "Faut-il réquisitionner les logements inoccupés pour loger tout le monde ?",
  "Quelle responsabilité individuelle pour travailler dans l'armement ?",
  "Quel système de financement pour quel type de retraite ?",
  "Comment peut-on réformer le système éducatif ?",
  "Grande distribution : faut-il réglementer l'oligopole ?",
  "Agriculteurs : comment protéger une profession si vitale ?",
  "Comment réformer l'hôpital public ?",
  "Quelle place pour la laïcité ?",
  "Faut-il que la France mette en place une réparation historique ?",
  "Quelle place pour la souffrance animale dans notre relation au vivant ?",
  "Doit-on s'écarter de l'Europe ou au contraire s'en rapprocher ?",
  "Le nationalisme est-il une bonne chose ?",
  "Dépenses publiques / retraite : comment gérer leur évolution ?",
  "Quel multiculturalisme voulons-nous ?",
]

const THEMES_INITIAL = 5

interface Props {
  onClose: () => void
}

export default function QuestionnaireModal({ onClose }: Props) {
  const { table } = useTable()

  const [isLoading,    setIsLoading]    = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess,  setShowSuccess]  = useState(false)
  const [err,          setErr]          = useState<string | null>(null)
  const [showAllThemes, setShowAllThemes] = useState(false)

  const [themeIdeas,     setThemeIdeas]     = useState('')
  const [themeRatings,   setThemeRatings]   = useState<Record<string, number>>({})
  const [staffInterest,  setStaffInterest]  = useState('')
  const [debateAttended, setDebateAttended] = useState('')
  const [debateRating,   setDebateRating]   = useState<number | null>(null)
  const [feedback,       setFeedback]       = useState('')

  // Ordre aléatoire fixé au montage du composant, re-mélangé à chaque ouverture
  const shuffledThemes = useMemo(
    () => [...PROPOSED_THEMES].sort(() => Math.random() - 0.5),
    []
  )
  const visibleThemes = showAllThemes ? shuffledThemes : shuffledThemes.slice(0, THEMES_INITIAL)

  // Fermeture via Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Pré-remplissage si l'utilisateur a déjà répondu
  useEffect(() => {
    supabase
      .from('questionnaire_responses')
      .select('*')
      .eq('table_id', table.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const r = data as QuestionnaireResponse
          setThemeIdeas(r.theme_ideas ?? '')
          setThemeRatings(r.theme_ratings ?? {})
          setStaffInterest(r.staff_interest ?? '')
          setDebateAttended(r.debate_attended ?? '')
          setDebateRating(r.debate_rating)
          setFeedback(r.feedback ?? '')
        }
        setIsLoading(false)
      })
  }, [table.id])

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
      onClick={onClose}
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
          </div>
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
        </div>

        {/* ── Body ── */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

          {isLoading ? (
            <div className="flex justify-center py-8">
              <span className="w-6 h-6 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
            </div>
          ) : showSuccess ? (
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
              <QuestionBlock label="Quelle(s) idée(s) de thème pour un débat aimerais-tu aborder ?">
                <textarea
                  value={themeIdeas}
                  onChange={e => setThemeIdeas(e.target.value)}
                  rows={3}
                  placeholder="Ex. : l'intelligence artificielle, la démocratie directe…"
                  className={textareaClass}
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
                      onChange={v => setThemeRatings(prev => ({ ...prev, [theme]: v }))}
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
              <QuestionBlock label="Est-ce que tu voudrais staffer chez Ecclesia ?">
                <p className="text-xs text-gray-500 mb-2 leading-relaxed">
                  Modérer un débat, aider à la préparation des fiches d'informations ou à la
                  communication, etc. Si oui, ajoute ton Prénom Nom et un contact (num ou mail).
                </p>
                <textarea
                  value={staffInterest}
                  onChange={e => setStaffInterest(e.target.value)}
                  rows={2}
                  placeholder="Prénom Nom, 06… ou email@…"
                  className={textareaClass}
                />
              </QuestionBlock>

              {/* Q4 — Quel débat */}
              <QuestionBlock label="À quel débat viens-tu de participer ?">
                <input
                  type="text"
                  value={debateAttended}
                  onChange={e => setDebateAttended(e.target.value)}
                  placeholder="Ex. : La religion, Le 12 mai 2026…"
                  className={inputClass}
                />
              </QuestionBlock>

              {/* Q5 — Note globale */}
              <QuestionBlock label="De 0 (horrible) à 5 (super), as-tu apprécié le débat ?">
                <RatingRow value={debateRating} onChange={setDebateRating} />
              </QuestionBlock>

              {/* Q6 — Retour libre */}
              <QuestionBlock label="As-tu un retour à nous faire ? Négatif comme positif !">
                <textarea
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  rows={3}
                  placeholder="Tout commentaire est le bienvenu…"
                  className={textareaClass}
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
        {!isLoading && !showSuccess && (
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

function QuestionBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-gray-800 leading-snug">{label}</p>
      {children}
    </div>
  )
}

function ThemeRatingRow({
  theme, value, onChange,
}: {
  theme: string
  value: number | null
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex-1 text-sm text-gray-700 leading-snug pt-1">{theme}</span>
      <div className="flex gap-1 flex-shrink-0">
        {[0, 1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            onClick={() => onChange(n)}
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

function RatingRow({
  value, onChange,
}: {
  value: number | null
  onChange: (v: number) => void
}) {
  return (
    <div className="flex gap-2">
      {[0, 1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors
            focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 ${
            value === n
              ? 'bg-indigo-600 text-white shadow-md'
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

const inputClass = `w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm
  text-gray-900 placeholder:text-gray-400
  focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent`
