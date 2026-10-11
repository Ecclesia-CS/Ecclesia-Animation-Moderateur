import { useEffect, useLayoutEffect, useRef, useState, useCallback, type CSSProperties, type ReactNode } from 'react'
import { useTable } from '../context/TableContext'
import { supabase } from '../lib/supabase'
import { getSessionById } from '../lib/sessions'
import { extractErr, titreSeance } from '../lib/utils'
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
import FondQuadrille from '../components/FondQuadrille'
import ecclesiaLogo from '../assets/ecclesia-logo.webp'
import { IconeAutreSujet, IconeSujetActuel } from '../components/IconesFiles'
import TableShareCard from '../components/TableShareCard'
import MyShareRequests from '../components/MyShareRequests'

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
    effectivePhase,
  } = useTable()

  // Chantier 168 : hauteur de l'en-tête, pour caler la zone des boutons et des files sur l'écran.
  const enteteRef = useRef<HTMLElement>(null)
  const [hauteurEntete, setHauteurEntete] = useState(0)
  useLayoutEffect(() => {
    const el = enteteRef.current
    if (!el) return
    const mesure = () => setHauteurEntete(el.offsetHeight)
    mesure()
    const obs = new ResizeObserver(mesure)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

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

  // Chantier 168 : le titre vient du contexte (chargé avant le premier rendu),
  // à défaut de la lecture propre à cet écran, pour ne pas voir le code de
  // table s'afficher en grand puis céder la place au titre.
  const titre = session?.title ?? sessionTitle
  const boutonVerre = `btn-verre rounded-[8px] inline-flex h-9 items-center px-3 text-xs font-semibold text-creme sm:px-4
    focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2 focus-visible:ring-offset-bleu-fonce`
  // Libellés des deux colonnes de l'en-tête (surtitre du site, sur marine).
  const libelleEnTete = 'text-[10.5px] font-bold uppercase tracking-[0.2em] text-bleu-clair/80'

  return (
    <div className="min-h-[100dvh] bg-creme flex flex-col">

      {/* ── En-tête : bandeau marine quadrillé du site, bord inférieur en vague ── */}
      {/* Ni z-index ni isolation ici (voir FondQuadrille) : Outils et l'indicateur
          d'étape y ouvrent des fenêtres fixed qui doivent couvrir toute la page.
          Chantier 168 : en-tête resserré (demande d'Antoine) pour que les deux
          boutons de parole et leurs deux files tiennent sur un écran sans défiler :
          barre du haut, puce d'étape, titre, puis une seule ligne « Vous / Table ».
          Rien n'est retiré : seuls les espaces et la taille du titre changent. */}
      <header ref={enteteRef} className="relative overflow-hidden bg-bleu-fonce text-creme">
        <FondQuadrille
          cases={7}
          bande={36}
          fondu="linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.45) 55%, #000 88%)"
        />
        <svg
          data-fond-libre
          aria-hidden="true"
          viewBox="0 0 800 40"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-3 w-full sm:h-4"
        >
          <path d="M0 0 Q400 80 800 0 V40 H0 Z" className="fill-creme" />
        </svg>

        <div className="relative mx-auto w-full max-w-5xl px-4 pb-6 pt-2.5 sm:px-6 sm:pt-3">
          <div className="flex items-center gap-2">
            {/* Emblème d'Ecclesia, sauf dans une séance d'association (chantier 135). */}
            {!session?.organization_id && (
              <img
                src={ecclesiaLogo}
                alt=""
                aria-hidden="true"
                // -ml-1 : le disque de l'emblème (marge transparente de 4 px) s'aligne sur les textes
                className="-ml-1 h-9 w-9 drop-shadow-[0_8px_22px_rgba(155,187,226,0.35)]"
              />
            )}
            {session && (
              <div className="hidden min-w-0 sm:block">
                <PhaseIndicator phase={session.phase} sessionType={sessionTypeOf(session)} tone="marine" />
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              <ParticipantToolsButton
                session={sessionDocs}
                userPseudo={myParticipant.pseudo}
                className={boutonVerre}
              />
              <button onClick={leaveTable} className={boutonVerre}>
                Quitter
              </button>
            </div>
          </div>

          <div className="mt-2.5 animate-montee">
            {/* Téléphone : la puce passe sous la barre du haut, faute de place à côté des boutons. */}
            {session && (
              <div className="mb-2 sm:hidden">
                <PhaseIndicator phase={session.phase} sessionType={sessionTypeOf(session)} tone="marine" />
              </div>
            )}
            <h1 className={`break-words text-creme ${
              // Archivo, comme tout l'en-tête (demande d'Antoine : pas de serif ici).
              titre
                ? 'font-sans text-xl font-bold leading-[1.15] tracking-[-0.02em] sm:text-2xl md:text-3xl'
                : 'font-sans text-xl font-bold tracking-[0.16em] sm:text-2xl'
            }`}>
              {titre ? titreSeance(titre) : table.join_code}
            </h1>
            <p className="mt-1.5 flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-0.5 text-[13px] text-creme/75">
              <span className="min-w-0">
                <span className={libelleEnTete}>Vous</span>{' '}
                <span className="font-semibold text-creme">{myParticipant.pseudo}</span>
              </span>
              {titre && (
                <span>
                  <span className={libelleEnTete}>Table</span>{' '}
                  <span className="font-semibold tracking-[0.08em] text-creme">{table.join_code}</span>
                </span>
              )}
            </p>
          </div>

          {table.leaderless && (
            <button
              onClick={() => setShowAskAdminModal(true)}
              className="mt-3 inline-flex h-9 items-center gap-2 rounded-[8px] border border-amber-300/50 bg-amber-300/10 px-3
                text-sm font-semibold text-amber-100 transition-colors hover:border-amber-300/80 hover:bg-amber-300/20
                focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-bleu-fonce"
            >
              🎙️ Devenir modérateur
            </button>
          )}
        </div>
      </header>

      {/* ── Corps : actions, files, présents (colonne de droite sur md+) ── */}
      {/* La zone de gauche a la hauteur de l'écran moins l'en-tête : les deux boutons
          et les deux files y sont toujours visibles ; une file longue défile dans sa
          propre carte, pas dans la page. Sous le seuil de 26 rem (téléphone couché),
          la page défile normalement. Présents vient dessous sur téléphone. */}
      <div className="flex-1 bg-gradient-to-b from-creme to-sable">
        <div
          style={{ '--zone': `max(26rem, calc(100dvh - ${hauteurEntete}px - 2.5rem))` } as CSSProperties}
          className="mx-auto grid w-full max-w-5xl items-start gap-4 px-4 pb-6 pt-4 sm:px-6
            md:grid-cols-[minmax(0,1fr)_16.5rem] md:gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]"
        >

          <div className="flex h-[var(--zone)] min-w-0 flex-col gap-2.5">

            {/* ── « Vous avez la parole ! » ─────────────────────────── */}
            {iAmSpeaking && (
              <div className="relative flex shrink-0 items-stretch overflow-hidden rounded-[12px] bg-amber-600 text-creme shadow-[0_26px_54px_-22px_rgba(154,99,18,0.95)] animate-montee">
                <FondQuadrille cases={3} grain={false} traits={0.12} />
                <span aria-hidden="true" className="relative flex w-10 shrink-0 items-center justify-center bg-amber-700/70 sm:w-14">
                  <span className="flex h-6 items-end gap-[3px]">
                    {[14, 22, 17, 24].map((h, i) => (
                      <span
                        key={i}
                        className="block w-[3px] origin-bottom bg-creme animate-onde"
                        style={{ height: h, animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </span>
                </span>
                <div className="relative flex flex-1 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <p className="font-sans text-xl font-bold tracking-[-0.01em] leading-tight text-creme">Vous avez la parole !</p>
                  {table.leaderless && (
                    <button
                      onClick={() => endTurnAndAdvance().catch(() => {})}
                      className="inline-flex h-9 items-center rounded-[8px] bg-creme px-4 text-sm font-semibold text-amber-800 transition-colors hover:bg-white
                        focus:outline-none focus-visible:ring-2 focus-visible:ring-creme focus-visible:ring-offset-2 focus-visible:ring-offset-amber-600"
                    >
                      J'ai fini de parler
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Chantier 132 — bannière de réouverture du vote en cours, après un dismiss */}
            {table.active_vote_id && !voteModalOpen && (
              <button
                onClick={() => setVoteModalOpen(true)}
                className="relative flex w-full shrink-0 items-stretch overflow-hidden rounded-[12px] bg-bleu-fonce text-left text-creme
                  shadow-[0_20px_44px_-24px_rgba(21,35,63,0.9)] transition-shadow hover:shadow-[0_26px_52px_-22px_rgba(21,35,63,0.95)] animate-montee
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2 focus-visible:ring-offset-creme"
              >
                <FondQuadrille cases={2} />
                <span aria-hidden="true" className="relative flex w-10 shrink-0 items-center justify-center bg-bleu-clair/15 text-lg sm:w-14 sm:text-xl">🗳️</span>
                <span className="relative flex flex-1 items-center gap-3 px-4 py-2.5">
                  <span className="flex-1 text-sm font-semibold">Voir le vote en cours</span>
                  <span aria-hidden="true" className="relative flex h-2 w-2 shrink-0">
                    <span className="absolute inset-0 rounded-full bg-bleu-clair animate-pouls" />
                    <span className="relative h-2 w-2 rounded-full bg-bleu-clair" />
                  </span>
                </span>
              </button>
            )}

            {/* Chantier 162a — source montrée par un participant (acceptée par le
                modérateur), fil des sources déjà montrées, et l'état de mes demandes */}
            <div className="shrink-0 space-y-2.5 empty:hidden">
              <TableShareCard />
              <MyShareRequests />
            </div>

            {/* ── Deux colonnes : chaque bouton de parole au-dessus de sa file ── */}
            {/* Une seule grille à deux rangées : les deux boutons sont dans la même rangée,
                donc toujours de la même hauteur (celle du plus haut), au repos comme une
                fois dans la file ; les deux files partagent la rangée du dessous. */}
            <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-2.5 lg:gap-x-4">

              <QueueToggle
                label="Prendre la parole sur un autre sujet"
                sub="Introduire un nouveau point ou des informations complémentaires"
                color="indigo"
                icone={<IconeAutreSujet className="h-5 w-5 lg:h-6 lg:w-6" />}
                active={pendingLong || !!myLong}
                position={myLong ? queueLong.findIndex(e => e.id === myLong!.id) + 1 : null}
                total={queueLong.length}
                pending={pendingLong}
                disabled={iAmSpeaking}
                onClick={() => toggle('long', myLong)}
                className="animate-montee [animation-delay:60ms]"
              >
                {/* Chantier 131 — tag de sujet optionnel, saisi avant de rejoindre la file */}
                {!myLong && !pendingLong ? (
                  <label className="flex items-stretch border-t border-bleu-fonce/10 transition-colors
                    focus-within:bg-indigo-50/50 focus-within:ring-2 focus-within:ring-inset focus-within:ring-bleu-clair/60">
                    <span aria-hidden="true" className="flex w-9 shrink-0 items-center justify-center text-bleu-fonce/45 lg:w-14">
                      <IconeSujet className="h-4 w-4" />
                    </span>
                    <input
                      type="text"
                      value={topicTag}
                      onChange={e => setTopicTag(e.target.value.slice(0, 60))}
                      placeholder="Sujet (optionnel)"
                      className="min-w-0 flex-1 bg-transparent py-2.5 pr-2.5 text-xs text-anthracite placeholder:text-anthracite/45 focus:outline-none lg:py-3 lg:pr-4 lg:text-sm"
                    />
                  </label>
                ) : myLong?.topic_tag ? (
                  <p className="flex items-stretch border-t border-white/10">
                    <span aria-hidden="true" className="flex w-9 shrink-0 items-center justify-center text-bleu-clair lg:w-14">
                      <IconeSujet className="h-4 w-4" />
                    </span>
                    <span className="py-2 pr-2.5 text-xs text-white/75 lg:py-2.5 lg:pr-4">
                      Sujet indiqué : <span className="font-semibold text-white">{myLong.topic_tag}</span>
                    </span>
                  </p>
                ) : null}
              </QueueToggle>

              <QueueToggle
                label="Demander la parole sur le sujet actuel"
                sub="Pour répondre à ce qui est dit actuellement uniquement"
                color="teal"
                icone={<IconeSujetActuel className="h-5 w-5 lg:h-6 lg:w-6" />}
                active={pendingInteractive || !!myInteractive}
                position={myInteractive ? queueInteractive.findIndex(e => e.id === myInteractive!.id) + 1 : null}
                total={queueInteractive.length}
                pending={pendingInteractive}
                disabled={iAmSpeaking}
                onClick={() => toggle('interactive', myInteractive)}
                className="animate-montee [animation-delay:120ms]"
              />

              <ReadOnlyQueuePanel
                title="File d'attente : prendre la parole sur un autre sujet"
                entries={queueLong}
                participants={participants}
                accent="indigo"
                selfId={myParticipant.id}
                className="min-h-0 animate-montee [animation-delay:90ms]"
              />

              <ReadOnlyQueuePanel
                title="Demander la parole sur le sujet actuel"
                subtitle="Pour répondre à ce qui est dit actuellement uniquement"
                entries={queueInteractive}
                participants={participants}
                accent="teal"
                selfId={myParticipant.id}
                className="min-h-0 animate-montee [animation-delay:150ms]"
              />
            </div>

            {/* Chantier 131 — "sujet suivant", détaché des deux boutons de parole */}
            <button
              onClick={handleToggleNextTopic}
              disabled={pendingNextTopic}
              className={`group flex w-full shrink-0 items-stretch overflow-hidden rounded-[12px] border text-left transition-colors duration-300 animate-montee [animation-delay:180ms]
                disabled:cursor-not-allowed disabled:opacity-60
                focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400 ${
                myParticipant.wants_next_topic
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-emerald-600/25 bg-white text-emerald-800 hover:border-emerald-600/50 hover:bg-emerald-50/70'
              }`}
            >
              <span aria-hidden="true" className={`flex w-10 shrink-0 items-center justify-center text-lg transition-colors duration-300 sm:w-14 ${
                myParticipant.wants_next_topic ? 'bg-white/15' : 'bg-emerald-50'
              }`}>
                {pendingNextTopic ? (
                  <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : (
                  <span className="transition-transform duration-300 group-hover:scale-110">👍</span>
                )}
              </span>
              <span className="flex flex-1 items-center px-3 py-2.5 text-[13px] font-semibold leading-snug sm:px-4 sm:text-sm">
                {myParticipant.wants_next_topic
                  ? 'Vous souhaitez passer au sujet suivant (appuyer pour annuler)'
                  : 'Je souhaite passer au sujet suivant'}
              </span>
            </button>

            {err && (
              <p className="shrink-0 rounded-[8px] border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                {err}
              </p>
            )}
          </div>{/* end colonne principale */}

          {/* Présents : sous la zone sur téléphone, en colonne de droite (même hauteur, défilante) sur md+ */}
          <ParticipantsSidebar
            participants={participants}
            currentSpeakerId={table.current_speaker_id}
            queueLong={queueLong}
            queueInteractive={queueInteractive}
            variant="light"
            className="animate-montee [animation-delay:300ms] md:h-[var(--zone)] md:overflow-y-auto"
          />
        </div>
      </div>

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
          tone="info"
          onConfirm={() => setShowAskAdminModal(false)}
          onCancel={() => setShowAskAdminModal(false)}
        />
      )}

      {/* Questionnaire forcé par le modérateur — modal verrouillé */}
      {/* ── Panorama d'accueil — affiché une seule fois par table, avant les règles (chantier 40) ── */}
      {showWelcome && (
        <div className="fixed inset-0 bg-bleu-fonce/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-sm shadow-2xl flex flex-col overflow-hidden rounded-[12px] ring-1 ring-white/10 animate-entree">
            <div className="relative overflow-hidden bg-bleu-fonce px-6 py-5 text-center">
              <FondQuadrille cases={3} />
              <div className="relative">
                <p className="text-2xl mb-1">👋</p>
                <h2 className="font-sans text-xl font-bold tracking-[-0.01em] text-creme">Bienvenue dans le débat</h2>
                <span aria-hidden="true" className="filet-spectre mx-auto mt-3 block w-12" />
              </div>
            </div>
            <div className="px-6 py-5 space-y-4 text-sm text-anthracite/80">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-indigo-50 text-lg">🙋</span>
                <div>
                  <p className="font-semibold text-anthracite">Prendre la parole sur un autre sujet</p>
                  <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">Pour introduire un nouveau point ou des informations complémentaires.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-teal-50 text-lg">⚡</span>
                <div>
                  <p className="font-semibold text-anthracite">Demander la parole sur le sujet actuel</p>
                  <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">Uniquement pour répondre directement à ce qui vient d'être dit.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-sable text-lg">🔧</span>
                <div>
                  <p className="font-semibold text-anthracite">Bouton Outils</p>
                  <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">Accédez aux fiches d'information et au document collaboratif via le bouton en haut à droite.</p>
                </div>
              </div>
              {table.leaderless ? (
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-amber-50 text-lg">🤝</span>
                  <div>
                    <p className="font-semibold text-anthracite">Groupe auto-géré</p>
                    <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">Pas de modérateur. Quand vous avez la parole, appuyez sur « J'ai fini de parler » pour passer au suivant. Pour qu'un modérateur soit désigné, voyez avec le superadmin de la séance (« 🎙️ Devenir modérateur » en haut).</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-amber-50 text-lg">🧑‍⚖️</span>
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
                className="w-full rounded-[8px] py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors
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
          résultats (avec revote possible) ; 'closed' n'en est que la suite définitive.
          Chantier 168 : plein écran marine quadrillé, comme le bandeau d'accueil du site. */}
      {/* Chantier 161 — phase effective : la fin peut venir de la table seule
          (le modérateur a terminé son débat) pendant que la séance débat encore. */}
      {session && (effectivePhase === 'closed' || effectivePhase === 'post_voting') && !forcedQOpen && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-bleu-fonce px-6 text-center text-creme">
          <FondQuadrille cases={14} />
          <div className="relative flex flex-col items-center gap-5 animate-montee">
            <PhaseIndicator phase={effectivePhase} sessionType={sessionTypeOf(session)} tone="marine" />
            <p className="font-sans text-4xl font-bold tracking-[-0.02em] leading-[1.05] sm:text-5xl">{session.phase === 'debating' ? 'Le débat de votre table est terminé' : 'La séance est terminée'}</p>
            <span aria-hidden="true" className="filet-spectre block w-16" />
            <p className="text-base text-creme/75">Merci pour votre participation.</p>
            <div className="mt-3 flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
              {session.join_code && (
                <button
                  onClick={() => {
                    window.location.hash = `#session/${session.join_code}`
                    leaveTable()
                  }}
                  className="btn-verre btn-verre-primaire rounded-[8px] inline-flex items-center justify-center px-7 py-3.5 text-sm font-bold tracking-tight text-creme
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2 focus-visible:ring-offset-bleu-fonce"
                >
                  {/* Débat simple : pas de résultats, le routeur mène au questionnaire puis à l'écran de fin. */}
                  {sessionTypeOf(session) === 'debate' ? 'Continuer' : 'Voir vos résultats'}
                </button>
              )}
              <button
                onClick={leaveTable}
                className="btn-verre rounded-[8px] inline-flex items-center justify-center px-7 py-3.5 text-sm font-bold tracking-tight text-creme
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2 focus-visible:ring-offset-bleu-fonce"
              >
                Retour au menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Icône du sujet de la prise de parole ──

function IconeSujet({ className = '' }: { className?: string }) {
  // Étiquette : le sujet dont on veut parler.
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z" />
      <path d="M7 7h.01" />
    </svg>
  )
}

// ── Queue toggle button ────────────────────────────────────────
// Chantier 168 : bloc de couleur à gauche (w-14, même colonne que les files
// et le bouton « sujet suivant »), titre en sans-serif (c'est un bouton), et
// position en grand une fois dans la file. Au repos, le bloc donne déjà la
// couleur de la file ; dans la file, tout le bouton prend cette couleur.

const TONS = {
  indigo: {
    repos:     'border-bleu-fonce/15 bg-white shadow-sm hover:border-bleu-fonce/30 hover:shadow-md',
    actif:     'border-bleu-fonce bg-bleu-fonce shadow-[0_22px_46px_-24px_rgba(21,35,63,0.9)]',
    survol:    'hover:bg-indigo-50/50',
    blocRepos: 'bg-bleu-fonce text-bleu-clair',
    blocActif: 'bg-bleu-clair text-bleu-fonce',
    titre:     'text-bleu-fonce',
    anneau:    'focus-visible:ring-bleu-clair',
  },
  teal: {
    repos:     'border-teal-600/25 bg-white shadow-sm hover:border-teal-600/45 hover:shadow-md',
    actif:     'border-teal-600 bg-teal-600 shadow-[0_22px_46px_-24px_rgba(30,107,109,0.9)]',
    survol:    'hover:bg-teal-50/60',
    blocRepos: 'bg-teal-600 text-white',
    blocActif: 'bg-white text-teal-700',
    titre:     'text-teal-800',
    anneau:    'focus-visible:ring-teal-400',
  },
} as const

function QueueToggle({
  label, sub, color, icone, active, position, total, pending, disabled, onClick, className = '', children,
}: {
  label: string
  sub: string
  color: 'indigo' | 'teal'
  icone: ReactNode
  active: boolean
  position: number | null
  total: number
  pending: boolean
  disabled: boolean
  onClick(): void
  className?: string
  /** Rangée attachée sous le bouton (sujet de la prise de parole). */
  children?: ReactNode
}) {
  const t = TONS[color]

  return (
    <div className={`flex h-full flex-col overflow-hidden rounded-[12px] border transition-[background-color,border-color,box-shadow] duration-300 ${
      active ? t.actif : t.repos
    } ${className}`}>
      <button
        onClick={onClick}
        disabled={disabled}
        className={`group relative flex min-h-[64px] w-full flex-1 items-stretch text-left transition-colors duration-200 lg:min-h-[88px]
          focus:outline-none focus-visible:ring-2 focus-visible:ring-inset ${t.anneau}
          disabled:cursor-not-allowed disabled:opacity-50 ${active ? '' : t.survol}`}
      >
        {active && <FondQuadrille cases={0} grain={false} traits={0.07} />}
        <span aria-hidden="true" className={`relative flex w-9 shrink-0 items-center justify-center transition-colors duration-300 lg:w-14 ${
          active ? t.blocActif : t.blocRepos
        }`}>
          <span className="transition-transform duration-300 group-hover:scale-110 group-active:scale-95">{icone}</span>
        </span>
        <span className="relative flex min-w-0 flex-1 flex-col items-start gap-1.5 px-2.5 py-2.5 lg:flex-row lg:items-center lg:gap-3 lg:px-4 lg:py-4">
          <span className="min-w-0 flex-1">
            <span className={`block text-[13px] font-semibold leading-tight lg:text-[17px] lg:leading-snug ${active ? 'text-white' : t.titre}`}>
              {label}
            </span>
            <span className={`mt-1 block text-[11px] leading-snug lg:text-sm ${active ? 'text-white/80' : 'text-gray-600'}`}>
              {active
                ? 'Appuyer pour se retirer de la file'
                : sub}
            </span>
          </span>
          {/* Indicateur pending : ordre envoyé, en attente de confirmation */}
          {pending && (
            <span className="h-6 w-6 shrink-0 rounded-full border-2 border-white/60 border-t-transparent animate-spin" />
          )}
          {/* Position — seulement quand confirmée par le serveur */}
          {active && position !== null && !pending && (
            <span className="shrink-0 whitespace-nowrap text-right tabular-nums text-white animate-pop">
              <span className="text-2xl font-bold leading-none lg:text-3xl">{position}</span>
              <span className="text-sm font-semibold text-white/70"> / {total}</span>
            </span>
          )}
        </span>
      </button>
      {children}
    </div>
  )
}
