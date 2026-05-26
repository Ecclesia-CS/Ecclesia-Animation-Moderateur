import { useEffect, useState } from 'react'
import { useTable } from '../context/TableContext'
import { supabase } from '../lib/supabase'
import { extractErr } from '../lib/utils'
import ParticipantsSidebar from '../components/ParticipantsSidebar'
import ReadOnlyQueuePanel from '../components/ReadOnlyQueuePanel'
import QuestionnaireBtn from '../components/QuestionnaireFab'
import DocumentationButton from '../components/DocumentationButton'

export default function ParticipantView() {
  const {
    table,
    participants,
    queueLong,
    queueInteractive,
    myParticipant,
    addToQueue,
    removeFromQueue,
    leaveTable,
  } = useTable()

  const [err,                setErr]                = useState<string | null>(null)
  const [pendingLong,        setPendingLong]        = useState(false)
  const [pendingInteractive, setPendingInteractive] = useState(false)
  const [sessionTitle,       setSessionTitle]       = useState<string | null>(null)
  const [sessionDocs,        setSessionDocs]        = useState<{
    doc_info_url: string | null
    doc_summary_url: string | null
    doc_collab_url: string | null
  } | null>(null)

  useEffect(() => {
    if (!table.session_id) return
    supabase
      .from('sessions')
      .select('title, doc_info_url, doc_summary_url, doc_collab_url')
      .eq('id', table.session_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSessionTitle(data.title)
          setSessionDocs({
            doc_info_url:    data.doc_info_url,
            doc_summary_url: data.doc_summary_url,
            doc_collab_url:  data.doc_collab_url,
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
          <DocumentationButton
            session={sessionDocs}
            className="text-xs px-3 py-1.5 border border-gray-300 text-gray-500 rounded-lg
              hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
          <QuestionnaireBtn className="text-xs px-3 py-1.5 border border-gray-300 text-gray-500
            rounded-lg hover:bg-gray-100 transition-colors focus:outline-none
            focus:ring-2 focus:ring-gray-300" />
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
