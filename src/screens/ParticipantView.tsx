import { useEffect, useRef, useState, useCallback } from 'react'
import { useTable } from '../context/TableContext'
import { supabase } from '../lib/supabase'
import { extractErr } from '../lib/utils'
import type { QuestionnaireResponse } from '../lib/types'
import ParticipantsSidebar from '../components/ParticipantsSidebar'
import ReadOnlyQueuePanel from '../components/ReadOnlyQueuePanel'
import ParticipantToolsButton from '../components/ParticipantToolsButton'
import QuestionnaireModal from '../components/QuestionnaireModal'

export default function ParticipantView() {
  const {
    table,
    session,
    participants,
    queueLong,
    queueInteractive,
    myParticipant,
    addToQueue,
    removeFromQueue,
    leaveTable,
    endTurnAndAdvance,
    claimFloor,
  } = useTable()

  const [showWelcome,        setShowWelcome]        = useState(() => !localStorage.getItem('debate_welcome_' + table.id))
  const [err,                setErr]                = useState<string | null>(null)
  const [pendingLong,        setPendingLong]        = useState(false)
  const [pendingInteractive, setPendingInteractive] = useState(false)
  const [sessionTitle,       setSessionTitle]       = useState<string | null>(null)
  const [sessionDocs,        setSessionDocs]        = useState<{
    doc_info_url: string | null
    doc_summary_url: string | null
    doc_collab_url: string | null
    session_join_code: string | null
  } | null>(null)

  // Forçage du questionnaire par le modérateur
  const [forcedQOpen,     setForcedQOpen]     = useState(false)
  const [forcedExpired,   setForcedExpired]   = useState(false)
  const [forcedQResponse, setForcedQResponse] = useState<QuestionnaireResponse | null>(null)
  const lastForcedRef  = useRef<string | null>(null)
  const forcedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Ouvrir le modal quand le forçage est activé
  useEffect(() => {
    const forced = table.questionnaire_forced_at
    if (!forced || forced === lastForcedRef.current) return
    lastForcedRef.current = forced
    supabase
      .from('questionnaire_responses')
      .select('*')
      .eq('table_id', table.id)
      .maybeSingle()
      .then(({ data }) => {
        setForcedQResponse(data as QuestionnaireResponse | null)
        setForcedExpired(false)
        setForcedQOpen(true)
        // Armer le timer d'expiration (1h en prod, 10s pour test)
        if (forcedTimerRef.current) clearTimeout(forcedTimerRef.current)
        const remaining = new Date(forced).getTime() + 3600000 - Date.now()
        if (remaining <= 0) {
          setForcedExpired(true)
        } else {
          forcedTimerRef.current = setTimeout(() => setForcedExpired(true), remaining)
        }
      })
  }, [table.questionnaire_forced_at, table.id])

  // Fermer le modal quand l'admin annule le forçage
  useEffect(() => {
    if (!table.questionnaire_forced_at) {
      setForcedQOpen(false)
      setForcedExpired(false)
      if (forcedTimerRef.current) {
        clearTimeout(forcedTimerRef.current)
        forcedTimerRef.current = null
      }
      lastForcedRef.current = null
    }
  }, [table.questionnaire_forced_at])

  useEffect(() => {
    if (!table.session_id) return
    supabase
      .from('sessions')
      .select('title, join_code, doc_info_url, doc_summary_url, doc_collab_url')
      .eq('id', table.session_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSessionTitle(data.title)
          setSessionDocs({
            doc_info_url:      data.doc_info_url,
            doc_summary_url:   data.doc_summary_url,
            doc_collab_url:    data.doc_collab_url,
            session_join_code: data.join_code,
          })
        }
      })
  }, [table.session_id])

  const iAmSpeaking   = table.current_speaker_id === myParticipant.id
  const myLong        = queueLong.find(e => e.participant_id === myParticipant.id)
  const myInteractive = queueInteractive.find(e => e.participant_id === myParticipant.id)

  // Effacer les pending dès que les données réelles arrivent
  useEffect(() => { if (myLong)        setPendingLong(false)        }, [myLong])
  useEffect(() => { if (myInteractive) setPendingInteractive(false) }, [myInteractive])

  // Auto-claim : table leaderless, personne ne parle, je suis premier en file
  const isClaimingRef = useRef(false)
  const handleClaimFloor = useCallback(async () => {
    if (isClaimingRef.current) return
    isClaimingRef.current = true
    try { await claimFloor() } catch { /* race condition silencieuse */ }
    finally { isClaimingRef.current = false }
  }, [claimFloor])

  useEffect(() => {
    if (!table.leaderless) return
    if (table.current_speaker_id !== null) return
    const next = queueInteractive[0] ?? queueLong[0]
    if (next?.participant_id !== myParticipant.id) return
    handleClaimFloor()
  }, [table.leaderless, table.current_speaker_id, queueInteractive, queueLong, myParticipant.id, handleClaimFloor])

  async function toggle(type: 'long' | 'interactive', existing: typeof myLong) {
    setErr(null)
    if (type === 'long'        && !existing) setPendingLong(true)
    if (type === 'interactive' && !existing) setPendingInteractive(true)
    try {
      if (existing) await removeFromQueue(existing.id)
      else await addToQueue(myParticipant.id, type)
    } catch (e) {
      setErr(extractErr(e))
      if (type === 'long')        setPendingLong(false)
      else                        setPendingInteractive(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── Header ───────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex flex-col min-w-0">
          <span className="font-mono font-bold text-indigo-600 text-lg tracking-widest leading-tight">
            {table.join_code}
          </span>
          {sessionTitle && (
            <span className="text-xs text-gray-400 truncate max-w-[140px]">{sessionTitle}</span>
          )}
        </div>
        <span className="text-sm text-gray-500 truncate max-w-[120px]">{myParticipant.pseudo}</span>
        <div className="flex items-center gap-2">
          <ParticipantToolsButton
            session={sessionDocs}
            userPseudo={myParticipant.pseudo}
            className="text-xs px-3 py-1.5 border border-gray-300 text-gray-500 rounded-lg
              hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
          <button
            onClick={leaveTable}
            className="text-xs px-3 py-1.5 border border-gray-300 text-gray-500 rounded-lg
              hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
          >
            Quitter
          </button>
        </div>
      </header>

      {/* ── Speaking banner (self) ────────────────────────────── */}
      {iAmSpeaking && (
        <div className="bg-amber-50 border-b-2 border-amber-400 px-4 py-5 text-center">
          <p className="text-xl font-bold text-amber-700">Vous avez la parole !</p>
          {table.leaderless && (
            <button
              onClick={() => endTurnAndAdvance().catch(() => {})}
              className="mt-3 py-2 px-5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              J'ai fini de parler
            </button>
          )}
        </div>
      )}

      {/* ── Body (main + sidebar sur md+) ────────────────────── */}
      <div className="flex-1 flex gap-4 p-4 pt-6 max-w-2xl mx-auto w-full items-start">

      <div className="flex-1 flex flex-col items-center gap-5 min-w-0">

        {/* ── Queue buttons ────────────────────────────────────── */}
        <div className="w-full space-y-3">
          <QueueToggle
            label="Demander la parole"
            sub="Introduire un nouveau point ou des informations complémentaires"
            color="indigo"
            active={pendingLong || !!myLong}
            position={myLong ? queueLong.findIndex(e => e.id === myLong!.id) + 1 : null}
            total={queueLong.length}
            pending={pendingLong}
            disabled={iAmSpeaking}
            onClick={() => toggle('long', myLong)}
          />
          <QueueToggle
            label="Coupe file"
            sub="Pour répondre à ce qui est dit actuellement uniquement"
            color="teal"
            active={pendingInteractive || !!myInteractive}
            position={myInteractive ? queueInteractive.findIndex(e => e.id === myInteractive!.id) + 1 : null}
            total={queueInteractive.length}
            pending={pendingInteractive}
            disabled={iAmSpeaking}
            onClick={() => toggle('interactive', myInteractive)}
          />
        </div>

        {err && (
          <p className="text-sm text-red-600 text-center bg-red-50 w-full px-4 py-2 rounded-xl
            border border-red-200">
            {err}
          </p>
        )}

        {/* ── Files en lecture seule ────────────────────────────── */}
        <div className="w-full space-y-3">
          <ReadOnlyQueuePanel
            title="File d'attente : demander la parole"
            entries={queueLong}
            participants={participants}
            accent="indigo"
          />
          <ReadOnlyQueuePanel
            title="Coupe file"
            subtitle="Pour répondre à ce qui est dit actuellement uniquement"
            entries={queueInteractive}
            participants={participants}
            accent="teal"
          />
        </div>

        <p className="text-xs text-gray-400 pb-2">
          {participants.length} participant{participants.length !== 1 ? 's' : ''}
        </p>
      </div>{/* end colonne principale */}

      {/* Sidebar participants — caché sur mobile */}
      <div className="hidden md:block">
        <ParticipantsSidebar
          participants={participants}
          currentSpeakerId={table.current_speaker_id}
          queueLong={queueLong}
          queueInteractive={queueInteractive}
          variant="light"
        />
      </div>

      </div>{/* end body flex */}

      {/* Questionnaire forcé par le modérateur — modal verrouillé */}
      {/* ── Panorama d'accueil — affiché une seule fois par table ── */}
      {showWelcome && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl flex flex-col overflow-hidden">
            <div className="bg-indigo-600 px-6 py-5 text-center">
              <p className="text-2xl mb-1">👋</p>
              <h2 className="text-lg font-bold text-white">Bienvenue dans le débat</h2>
            </div>
            <div className="px-6 py-5 space-y-4 text-sm text-gray-700">
              <div className="flex items-start gap-3">
                <span className="text-xl shrink-0">🙋</span>
                <div>
                  <p className="font-semibold text-gray-900">Demander la parole</p>
                  <p className="text-gray-500 text-xs mt-0.5">Pour introduire un nouveau point ou des informations complémentaires.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-xl shrink-0">⚡</span>
                <div>
                  <p className="font-semibold text-gray-900">Coupe file</p>
                  <p className="text-gray-500 text-xs mt-0.5">Uniquement pour répondre directement à ce qui vient d'être dit.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-xl shrink-0">🔧</span>
                <div>
                  <p className="font-semibold text-gray-900">Bouton Outils</p>
                  <p className="text-gray-500 text-xs mt-0.5">Accédez aux fiches d'information et au document collaboratif via le bouton en haut à droite.</p>
                </div>
              </div>
              {table.leaderless ? (
                <div className="flex items-start gap-3">
                  <span className="text-xl shrink-0">🤝</span>
                  <div>
                    <p className="font-semibold text-gray-900">Groupe auto-géré</p>
                    <p className="text-gray-500 text-xs mt-0.5">Pas de modérateur. Quand vous avez la parole, appuyez sur "J'ai fini de parler" pour passer au suivant.</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <span className="text-xl shrink-0">🧑‍⚖️</span>
                  <div>
                    <p className="font-semibold text-gray-900">Rôle du modérateur</p>
                    <p className="text-gray-500 text-xs mt-0.5">Le modérateur gère l'ordre de parole et peut accorder ou retirer la parole à tout moment.</p>
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 pb-6">
              <button
                onClick={() => {
                  localStorage.setItem('debate_welcome_' + table.id, '1')
                  setShowWelcome(false)
                }}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                C'est parti ! →
              </button>
            </div>
          </div>
        </div>
      )}

      {forcedQOpen && (
        <QuestionnaireModal
          savedResponse={forcedQResponse}
          forced={!forcedExpired}
          onClose={() => setForcedQOpen(false)}
        />
      )}

      {/* Séance terminée */}
      {session?.phase === 'closed' && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white gap-4 px-6 text-center">
          <p className="text-2xl font-bold text-gray-800">La séance est terminée</p>
          <p className="text-gray-500">Merci pour votre participation.</p>
          {session.join_code && (
            <a
              href={`#session/${session.join_code}`}
              className="inline-flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700
                text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Voir vos résultats →
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// ── Queue toggle button ────────────────────────────────────────

function QueueToggle({
  label, sub, color, active, position, total, pending, disabled, onClick,
}: {
  label: string
  sub: string
  color: 'indigo' | 'teal'
  active: boolean
  position: number | null
  total: number
  pending: boolean
  disabled: boolean
  onClick(): void
}) {
  const filled = {
    indigo: 'bg-indigo-600 border-indigo-600 text-white shadow-indigo-200 shadow-md',
    teal:   'bg-teal-600 border-teal-600 text-white shadow-teal-200 shadow-md',
  }
  const outline = {
    indigo: 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50/50',
    teal:   'bg-white border-gray-200 text-gray-700 hover:border-teal-300 hover:bg-teal-50/50',
  }
  const badgeBg = {
    indigo: 'bg-indigo-500 text-white',
    teal:   'bg-teal-500 text-white',
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative w-full min-h-[88px] px-4 py-4 rounded-2xl border-2 text-left
        transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2
        disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? `${filled[color]} ${color === 'teal' ? 'focus:ring-teal-400' : 'focus:ring-indigo-400'}`
          : `${outline[color]} focus:ring-gray-300`
      }`}
    >
      {/* Position badge — seulement quand confirmé par le serveur */}
      {active && position !== null && !pending && (
        <span className={`absolute top-3 right-3 text-sm font-bold px-2.5 py-1 rounded-full
          ${badgeBg[color]}`}>
          {position} / {total}
        </span>
      )}
      {/* Indicateur pending : ordre envoyé, en attente de confirmation */}
      {pending && (
        <span className={`absolute top-3 right-3 w-5 h-5 rounded-full border-2
          border-white/60 border-t-transparent animate-spin`} />
      )}

      <p className={`text-xl font-semibold leading-tight pr-20 ${active ? 'text-white' : 'text-gray-800'}`}>
        {label}
      </p>
      <p className={`text-sm mt-1 ${active ? 'text-white/80' : 'text-gray-400'}`}>
        {active
          ? 'Appuyer pour se retirer de la file'
          : sub}
      </p>
    </button>
  )
}
