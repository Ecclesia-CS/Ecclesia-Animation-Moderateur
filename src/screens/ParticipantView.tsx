import { useEffect, useRef, useState, useCallback } from 'react'
import { useTable } from '../context/TableContext'
import { supabase } from '../lib/supabase'
import { getSessionById } from '../lib/sessions'
import { extractErr } from '../lib/utils'
import type { QuestionnaireResponse, Session } from '../lib/types'
import ParticipantsSidebar from '../components/ParticipantsSidebar'
import ReadOnlyQueuePanel from '../components/ReadOnlyQueuePanel'
import ParticipantToolsButton from '../components/ParticipantToolsButton'
import QuestionnaireModal from '../components/QuestionnaireModal'
import DebateRulesModal from '../components/DebateRulesModal'
import ConfirmModal from '../components/ConfirmModal'
import PhaseIndicator from '../components/PhaseIndicator'
import { sessionTypeOf } from '../lib/phaseLabels'
import TableChangeModal from '../components/TableChangeModal'
import TableVoteModal from '../components/TableVoteModal'

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
    setNextTopicVote,
  } = useTable()

  const [showRules,          setShowRules]          = useState(() => !localStorage.getItem('debate_rules_read_' + table.id))
  const [showWelcome,        setShowWelcome]        = useState(() => !localStorage.getItem('debate_welcome_' + table.id))
  const [err,                setErr]                = useState<string | null>(null)
  const [showAskAdminModal,  setShowAskAdminModal]  = useState(false)
  const [pendingLong,        setPendingLong]        = useState(false)
  const [pendingInteractive, setPendingInteractive] = useState(false)
  const [topicTag,           setTopicTag]           = useState('')
  const [pendingNextTopic,   setPendingNextTopic]   = useState(false)
  const [sessionTitle,       setSessionTitle]       = useState<string | null>(null)
  const [sessionDocs,        setSessionDocs]        = useState<{
    doc_info_url: string | null
    doc_summary_url: string | null
    doc_collab_url: string | null
    session_join_code: string | null
    session_type: Session['session_type']
  } | null>(null)

  // Forçage du questionnaire par le modérateur
  const [forcedQOpen,     setForcedQOpen]     = useState(false)
  const [forcedExpired,   setForcedExpired]   = useState(false)
  const [forcedQResponse, setForcedQResponse] = useState<QuestionnaireResponse | null>(null)
  const lastForcedRef  = useRef<string | null>(null)
  const forcedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Chantier 132 — outil "proposer un vote" du modérateur. Contrairement au
  // questionnaire forcé, ce popup est dismissible : on retient le dernier
  // active_vote_id vu pour ne le rouvrir automatiquement que sur un NOUVEAU
  // vote (un vote fermé/dismiss reste accessible via la bannière ci-dessous).
  // Chantier 137-F : la référence est amorcée avec le vote déjà présent au
  // montage — un reload (ou un changement d'écran participant/modérateur) ne
  // rouvre donc jamais la fenêtre ; seule l'arrivée EN DIRECT d'un nouveau vote
  // l'ouvre. `active_vote_id` n'est jamais remis à NULL à la clôture (132) :
  // sa seule présence ne dit pas qu'un vote est ouvert. `table` est déjà chargé
  // ici (TableContext ne rend ses enfants qu'une fois `ready`).
  const [voteModalOpen, setVoteModalOpen] = useState(false)
  const lastVoteIdRef = useRef<string | null>(table.active_vote_id)

  useEffect(() => {
    const voteId = table.active_vote_id
    if (!voteId || voteId === lastVoteIdRef.current) return
    lastVoteIdRef.current = voteId
    setVoteModalOpen(true)
  }, [table.active_vote_id])

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
    getSessionById(table.session_id)
      .then(data => {
        if (data) {
          setSessionTitle(data.title)
          setSessionDocs({
            doc_info_url:      data.doc_info_url,
            doc_summary_url:   data.doc_summary_url,
            doc_collab_url:    data.doc_collab_url,
            session_join_code: data.join_code,
            session_type:      data.session_type,
          })
        }
      })
      .catch(() => {})
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
      if (existing) {
        await removeFromQueue(existing.id)
        if (type === 'long') setTopicTag('')
      } else {
        await addToQueue(myParticipant.id, type, undefined, type === 'long' ? topicTag : undefined)
      }
    } catch (e) {
      setErr(extractErr(e))
      if (type === 'long')        setPendingLong(false)
      else                        setPendingInteractive(false)
    }
  }

  // Chantier 131 — "d'accord pour passer au sujet suivant"
  async function handleToggleNextTopic() {
    setErr(null)
    setPendingNextTopic(true)
    try {
      await setNextTopicVote(!myParticipant.wants_next_topic)
    } catch (e) {
      setErr(extractErr(e))
    } finally {
      setPendingNextTopic(false)
    }
  }

  return (
    <div className="min-h-screen bg-creme flex flex-col">

      {/* ── Header ───────────────────────────────────────────── */}
      <header className="bg-white border-b border-bleu-clair/60 px-4 py-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-2.5">
        <div className="flex flex-col min-w-0">
          <span className="font-mono font-bold text-bleu-fonce text-lg tracking-[0.2em] leading-tight">
            {table.join_code}
          </span>
          {sessionTitle && (
            <span className="text-xs text-gray-500 truncate max-w-[140px]">{sessionTitle}</span>
          )}
          {session && (
            <div className="mt-1.5"><PhaseIndicator phase={session.phase} sessionType={sessionTypeOf(session)} /></div>
          )}
        </div>
        <span className="text-sm text-gray-600 truncate max-w-[120px]">{myParticipant.pseudo}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {table.leaderless && (
            <button
              onClick={() => setShowAskAdminModal(true)}
              className="text-xs px-2.5 py-1.5 border border-amber-300 text-amber-800 bg-amber-50
                hover:bg-amber-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            >
              🎙️ Devenir modérateur
            </button>
          )}
          <ParticipantToolsButton
            session={sessionDocs}
            userPseudo={myParticipant.pseudo}
            className="text-xs px-2.5 py-1.5 border border-bleu-fonce/20 text-bleu-fonce/80
              hover:bg-bleu-fonce/[0.04] hover:text-bleu-fonce transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
          />
          <button
            onClick={leaveTable}
            className="text-xs px-2.5 py-1.5 border border-bleu-fonce/20 text-bleu-fonce/80
              hover:bg-bleu-fonce/[0.04] hover:text-bleu-fonce transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
          >
            Quitter
          </button>
        </div>
      </header>

      {/* ── Speaking banner (self) ────────────────────────────── */}
      {iAmSpeaking && (
        <div className="bg-amber-50 border-b-2 border-amber-400 px-4 py-5 text-center animate-entree">
          <p className="font-serif text-2xl font-semibold text-amber-800">Vous avez la parole !</p>
          {table.leaderless && (
            <button
              onClick={() => endTurnAndAdvance().catch(() => {})}
              className="mt-3 py-2.5 px-5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold transition-colors
                focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-50"
            >
              J'ai fini de parler
            </button>
          )}
        </div>
      )}

      {/* ── Body (main + sidebar sur md+) ────────────────────── */}
      <div className="flex-1 flex gap-4 p-4 pt-6 max-w-2xl mx-auto w-full items-start">

      <div className="flex-1 flex flex-col items-center gap-5 min-w-0">

        {/* Chantier 132 — bannière de réouverture du vote en cours, après un dismiss */}
        {table.active_vote_id && !voteModalOpen && (
          <button
            onClick={() => setVoteModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3
              border border-indigo-200 bg-indigo-50 text-bleu-fonce text-sm font-semibold
              hover:bg-indigo-100 hover:border-indigo-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
          >
            🗳️ Voir le vote en cours
          </button>
        )}

        {/* ── Queue buttons ────────────────────────────────────── */}
        <div className="w-full space-y-3">
          <QueueToggle
            label="Prendre la parole sur un autre sujet"
            sub="Introduire un nouveau point ou des informations complémentaires"
            color="indigo"
            active={pendingLong || !!myLong}
            position={myLong ? queueLong.findIndex(e => e.id === myLong!.id) + 1 : null}
            total={queueLong.length}
            pending={pendingLong}
            disabled={iAmSpeaking}
            onClick={() => toggle('long', myLong)}
          />
          {/* Chantier 131 — tag de sujet optionnel, saisi avant de rejoindre la file */}
          {!myLong && !pendingLong ? (
            <input
              type="text"
              value={topicTag}
              onChange={e => setTopicTag(e.target.value.slice(0, 60))}
              placeholder="Sujet ou thème dont tu veux parler (optionnel)"
              className="w-full text-sm px-3.5 py-2.5 bg-white border border-bleu-fonce/20 text-anthracite
                placeholder:text-anthracite/45 focus:outline-none focus:border-bleu-fonce focus:ring-2 focus:ring-bleu-clair/40"
            />
          ) : myLong?.topic_tag ? (
            <p className="text-xs text-gray-500 px-1">
              Sujet indiqué : <span className="font-semibold text-anthracite">{myLong.topic_tag}</span>
            </p>
          ) : null}
          <QueueToggle
            label="Demander la parole sur le sujet actuel"
            sub="Pour répondre à ce qui est dit actuellement uniquement"
            color="teal"
            active={pendingInteractive || !!myInteractive}
            position={myInteractive ? queueInteractive.findIndex(e => e.id === myInteractive!.id) + 1 : null}
            total={queueInteractive.length}
            pending={pendingInteractive}
            disabled={iAmSpeaking}
            onClick={() => toggle('interactive', myInteractive)}
          />

          {/* Chantier 131 — "d'accord pour passer au sujet suivant" */}
          <button
            onClick={handleToggleNextTopic}
            disabled={pendingNextTopic}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 border
              text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed
              focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-creme focus-visible:ring-emerald-400 ${
              myParticipant.wants_next_topic
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : 'bg-white border-bleu-fonce/15 text-anthracite/80 hover:border-emerald-300 hover:bg-emerald-50/60 hover:text-emerald-800'
            }`}
          >
            {pendingNextTopic ? (
              <span className="w-4 h-4 rounded-full border-2 border-current/60 border-t-transparent animate-spin" />
            ) : (
              <span>👍</span>
            )}
            {myParticipant.wants_next_topic
              ? "D'accord pour le sujet suivant (appuyer pour annuler)"
              : 'Je suis d’accord pour passer au sujet suivant'}
          </button>
        </div>

        {err && (
          <p className="text-sm text-red-700 text-center bg-red-50 w-full px-4 py-2.5
            border border-red-200">
            {err}
          </p>
        )}

        {/* ── Files en lecture seule ────────────────────────────── */}
        <div className="w-full space-y-3">
          <ReadOnlyQueuePanel
            title="File d'attente : prendre la parole sur un autre sujet"
            entries={queueLong}
            participants={participants}
            accent="indigo"
          />
          <ReadOnlyQueuePanel
            title="Demander la parole sur le sujet actuel"
            subtitle="Pour répondre à ce qui est dit actuellement uniquement"
            entries={queueInteractive}
            participants={participants}
            accent="teal"
          />
        </div>

        <p className="text-xs text-gray-500 tabular-nums pb-2">
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

      {/* ── Règles du débat — lecture individuelle, sans attente des autres (D1) ── */}
      {/* Chantier 40 : affichée après le panorama d'accueil (voir plus bas), jamais avant */}
      {!showWelcome && showRules && (
        <DebateRulesModal
          onConfirm={() => {
            localStorage.setItem('debate_rules_read_' + table.id, '1')
            setShowRules(false)
          }}
        />
      )}

      {showAskAdminModal && (
        <ConfirmModal
          title="Va voir le superadmin"
          body="Pour éviter qu'une table sans animateur puisse être détournée, ce n'est plus un participant qui se désigne lui-même modérateur : va voir la personne qui gère la séance (le superadmin), elle pourra t'accorder ce rôle depuis son écran."
          confirmLabel="Compris"
          onConfirm={() => setShowAskAdminModal(false)}
          onCancel={() => setShowAskAdminModal(false)}
        />
      )}

      {/* Questionnaire forcé par le modérateur — modal verrouillé */}
      {/* ── Panorama d'accueil — affiché une seule fois par table, avant les règles (chantier 40) ── */}
      {showWelcome && (
        <div className="fixed inset-0 bg-bleu-fonce/60 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-sm shadow-2xl flex flex-col overflow-hidden animate-entree">
            <div className="bg-bleu-fonce px-6 py-5 text-center">
              <p className="text-2xl mb-1">👋</p>
              <h2 className="font-serif text-xl font-semibold text-creme">Bienvenue dans le débat</h2>
              <span aria-hidden="true" className="filet-spectre mx-auto mt-3 block w-12" />
            </div>
            <div className="px-6 py-5 space-y-4 text-sm text-anthracite/80">
              <div className="flex items-start gap-3">
                <span className="w-7 shrink-0 text-center text-xl">🙋</span>
                <div>
                  <p className="font-semibold text-anthracite">Prendre la parole sur un autre sujet</p>
                  <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">Pour introduire un nouveau point ou des informations complémentaires.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-7 shrink-0 text-center text-xl">⚡</span>
                <div>
                  <p className="font-semibold text-anthracite">Demander la parole sur le sujet actuel</p>
                  <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">Uniquement pour répondre directement à ce qui vient d'être dit.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-7 shrink-0 text-center text-xl">🔧</span>
                <div>
                  <p className="font-semibold text-anthracite">Bouton Outils</p>
                  <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">Accédez aux fiches d'information et au document collaboratif via le bouton en haut à droite.</p>
                </div>
              </div>
              {table.leaderless ? (
                <div className="flex items-start gap-3">
                  <span className="w-7 shrink-0 text-center text-xl">🤝</span>
                  <div>
                    <p className="font-semibold text-anthracite">Groupe auto-géré</p>
                    <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">Pas de modérateur. Quand vous avez la parole, appuyez sur "J'ai fini de parler" pour passer au suivant. Pour qu'un modérateur soit désigné, voyez avec le superadmin de la séance ("🎙️ Devenir modérateur" en haut).</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <span className="w-7 shrink-0 text-center text-xl">🧑‍⚖️</span>
                  <div>
                    <p className="font-semibold text-anthracite">Rôle du modérateur</p>
                    <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">Le modérateur gère l'ordre de parole et peut accorder ou retirer la parole à tout moment.</p>
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
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2"
              >
                Lire les règles de débat Ecclesia
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chantier 95 — déplacement décidé par le superadmin pendant le débat.
          Masqué tant qu'un autre overlay z-50 est ouvert (règles, accueil,
          questionnaire forcé), sinon ils se superposent. */}
      {session?.phase === 'debating' && table.session_id && !showRules && !showWelcome && !forcedQOpen && (
        <TableChangeModal
          sessionId={table.session_id}
          currentTableId={table.id}
          pseudo={myParticipant.pseudo}
        />
      )}

      {forcedQOpen && (
        <QuestionnaireModal
          savedResponse={forcedQResponse}
          forced={!forcedExpired}
          onClose={() => setForcedQOpen(false)}
        />
      )}

      {voteModalOpen && table.active_vote_id && (
        <TableVoteModal
          voteId={table.active_vote_id}
          onClose={() => setVoteModalOpen(false)}
        />
      )}

      {/* Séance terminée — masqué tant que le questionnaire forcé est ouvert (chantier 63) :
          debating → post_voting force le questionnaire au même instant où cette condition
          devient vraie (chantier 39, déplacée en post_voting au chantier 89), et les
          deux overlays sont en z-50 superposés. 'post_voting' redirige déjà vers les
          résultats (avec revote possible) ; 'closed' n'en est que la suite définitive. */}
      {(session?.phase === 'closed' || session?.phase === 'post_voting') && !forcedQOpen && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-creme gap-4 px-6 text-center">
          <PhaseIndicator phase={session.phase} sessionType={sessionTypeOf(session)} />
          <p className="font-serif text-3xl font-semibold tracking-tight text-bleu-fonce">La séance est terminée</p>
          <span aria-hidden="true" className="filet-spectre block w-14" />
          <p className="text-gray-600">Merci pour votre participation.</p>
          {session.join_code && (
            <button
              onClick={() => {
                window.location.hash = `#session/${session.join_code}`
                leaveTable()
              }}
              className="inline-flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700
                text-white text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2 focus-visible:ring-offset-creme"
            >
              Voir vos résultats
            </button>
          )}
          <button
            onClick={leaveTable}
            className="inline-flex items-center gap-2 px-5 py-3 bg-white border border-bleu-fonce/20 hover:border-bleu-fonce/40
              hover:bg-bleu-fonce/[0.04] text-bleu-fonce text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
          >
            Retour au menu
          </button>
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
    indigo: 'bg-indigo-600 border-indigo-600 text-white shadow-lg',
    teal:   'bg-teal-600 border-teal-600 text-white shadow-lg',
  }
  const outline = {
    indigo: 'bg-white border-bleu-fonce/15 border-l-indigo-600 text-anthracite shadow-sm hover:border-bleu-fonce/30 hover:border-l-indigo-600 hover:shadow-md',
    teal:   'bg-white border-bleu-fonce/15 border-l-teal-600 text-anthracite shadow-sm hover:border-teal-300 hover:border-l-teal-600 hover:shadow-md',
  }
  const badgeBg = {
    indigo: 'bg-bleu-clair text-bleu-fonce',
    teal:   'bg-white/90 text-teal-800',
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative w-full min-h-[88px] px-4 py-4 border border-l-4 text-left
        transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-creme
        disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? `${filled[color]} ${color === 'teal' ? 'focus-visible:ring-teal-400' : 'focus-visible:ring-bleu-clair'}`
          : `${outline[color]} focus-visible:ring-bleu-clair`
      }`}
    >
      {/* Position badge — seulement quand confirmé par le serveur */}
      {active && position !== null && !pending && (
        <span className={`absolute top-3 right-3 text-sm font-bold tabular-nums px-2.5 py-1
          ${badgeBg[color]}`}>
          {position} / {total}
        </span>
      )}
      {/* Indicateur pending : ordre envoyé, en attente de confirmation */}
      {pending && (
        <span className={`absolute top-3 right-3 w-5 h-5 rounded-full border-2
          border-white/60 border-t-transparent animate-spin`} />
      )}

      <p className={`font-serif text-xl font-semibold leading-snug pr-20 ${
        active ? 'text-white' : color === 'teal' ? 'text-teal-800' : 'text-bleu-fonce'
      }`}>
        {label}
      </p>
      <p className={`text-sm mt-1 ${active ? 'text-white/80' : 'text-gray-500'}`}>
        {active
          ? 'Appuyer pour se retirer de la file'
          : sub}
      </p>
    </button>
  )
}
