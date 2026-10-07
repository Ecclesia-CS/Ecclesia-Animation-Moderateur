import { useEffect, useRef, useState } from 'react'
import type { Participant, ParticipationStyle, QueueEntry, TableMemberForModerator } from '../lib/types'
import { loadTableMembersForModerator } from '../lib/voting'
import { initiales } from '../lib/utils'

const ROSTER_POLL_MS = 10_000

interface Props {
  participants: Participant[]
  currentSpeakerId: string | null
  queueLong: QueueEntry[]
  queueInteractive: QueueEntry[]
  variant?: 'dark' | 'light'
  /**
   * Chantier 97 — quand renseignés (vue modérateur uniquement), la sidebar
   * charge en plus le roster complet de la table (`table_assignments`,
   * connectés ou non) pour afficher le badge actif/passif et les membres
   * pas encore connectés en grisé/italique. Sans ces deux props, la sidebar
   * garde son comportement d'origine (liste des seuls participants connectés,
   * sans badge) — c'est le cas de ParticipantView (table leaderless).
   */
  tableId?: string
  isModerator?: boolean
  /** Classes ajoutées à la version claire (animation d'arrivée). */
  className?: string
}

const STYLE_LABEL: Record<ParticipationStyle, string> = {
  active:       'Actif',
  intermediate: 'Intermédiaire',
  listener: 'Passif',
}

export default function ParticipantsSidebar({
  participants,
  currentSpeakerId,
  queueLong,
  queueInteractive,
  variant = 'dark',
  tableId,
  isModerator = false,
  className = '',
}: Props) {
  const dark = variant === 'dark'
  const longIds        = new Set(queueLong.map(e => e.participant_id))
  const interactiveIds = new Set(queueInteractive.map(e => e.participant_id))

  // ── Chantier 97 — roster complet, réservé au modérateur ──────────
  const [roster, setRoster] = useState<TableMemberForModerator[] | null>(null)
  const fetchingRef = useRef(false)

  useEffect(() => {
    if (!isModerator || !tableId) { setRoster(null); return }

    let cancelled = false

    function fetchRoster() {
      if (fetchingRef.current) return
      fetchingRef.current = true
      loadTableMembersForModerator(tableId!)
        .then(rows => { if (!cancelled) setRoster(rows) })
        .catch(e => {
          // Un échec silencieux ici serait exactement le genre de bug relevé
          // au chantier 94 : invisible tant que personne ne compare à la base.
          console.error('[ParticipantsSidebar] list_table_members_for_moderator a échoué :', e)
        })
        .finally(() => { fetchingRef.current = false })
    }

    fetchRoster()
    const interval = setInterval(fetchRoster, ROSTER_POLL_MS)
    return () => { cancelled = true; clearInterval(interval) }
  }, [tableId, isModerator])

  // Connectés : mêmes données qu'avant (Realtime, via `participants`), avec
  // le badge actif/passif ajouté si le roster est disponible. Le pseudo est
  // la clé de correspondance : c'est celui saisi à `join_table`, identique
  // à `session_members.pseudo` (chantier 93 — même pseudo affiché partout).
  const rosterByPseudo = new Map((roster ?? []).map(r => [r.pseudo, r]))

  const sortedConnected = [...participants].sort((a, b) => {
    if (a.id === currentSpeakerId) return -1
    if (b.id === currentSpeakerId) return  1
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })

  // Membres du roster affectés à la table mais sans ligne `participants`
  // correspondante — « pas encore là », affichés en grisé/italique.
  const connectedPseudos = new Set(participants.map(p => p.pseudo))
  const notYetConnected = (roster ?? [])
    .filter(r => !r.connected && !connectedPseudos.has(r.pseudo))
    .sort((a, b) => a.pseudo.localeCompare(b.pseudo))

  function StyleBadge({ style }: { style: ParticipationStyle | null }) {
    if (!style) return null
    const tone = {
      active:       'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      intermediate: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      listener:     'bg-slate-600/40 text-slate-300 border-slate-500/40',
    }[style]
    const hint = {
      active:       'Actif : censé prendre la parole',
      intermediate: 'Intermédiaire : pourrait prendre la parole',
      listener:     'Passif : ne doit pas prendre la parole spontanément, mais peut la recevoir',
    }[style]
    return (
      <span
        className={`text-[10px] font-medium px-1.5 py-0.5 border shrink-0 whitespace-nowrap ${tone}`}
        title={hint}
      >
        {STYLE_LABEL[style]}
      </span>
    )
  }

  // Chantier 158 : version claire (vue participant), pastilles d'initiales
  // et orateur en ocre. Même colonne de gauche (w-14) que les files et les
  // boutons de ParticipantView : pastilles et textes tombent sur leurs axes.
  // La version sombre (vue modérateur) est inchangée.
  if (!dark) {
    return (
      <aside className={`w-full self-start overflow-hidden rounded-[12px] border border-bleu-fonce/10 bg-white shadow-sm md:sticky md:top-4 ${className}`}>
        <div className="flex items-stretch border-b border-bleu-fonce/10 bg-sable/70">
          <span aria-hidden="true" className="flex w-14 shrink-0 items-center justify-center text-bleu-fonce/55">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </span>
          <div className="flex flex-1 items-center justify-between gap-3 py-3 pr-4">
            <span className="text-sm font-semibold text-anthracite">Présents</span>
            <span className="rounded-[6px] bg-white px-2 py-1 text-xs font-semibold tabular-nums text-bleu-fonce">
              {roster ? roster.length : participants.length}
            </span>
          </div>
        </div>

        <ul className="flex flex-col py-1.5">
          {sortedConnected.map(p => {
            const isSpeaking    = p.id === currentSpeakerId
            const inInteractive = interactiveIds.has(p.id)
            const inLong        = longIds.has(p.id)
            return (
              <li
                key={p.id}
                className={`flex items-center transition-colors duration-300 ${isSpeaking ? 'bg-amber-50' : ''}`}
              >
                <span aria-hidden="true" className="flex w-14 shrink-0 justify-center py-1.5">
                  <span className="relative flex h-7 w-7">
                    {isSpeaking && <span className="absolute -inset-1 rounded-full bg-amber-400/40 animate-speaking" />}
                    <span className={`relative flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${
                      isSpeaking ? 'bg-amber-600 text-creme' : 'bg-indigo-50 text-bleu-fonce'
                    }`}>
                      {initiales(p.pseudo)}
                    </span>
                  </span>
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-4">
                  <span className={`min-w-0 flex-1 truncate text-sm ${isSpeaking ? 'font-semibold text-amber-800' : 'text-anthracite'}`}>
                    {p.pseudo}
                  </span>
                  {inInteractive && !isSpeaking && (
                    <span className="h-2 w-2 shrink-0 bg-teal-600" title="Demander la parole sur le sujet actuel" />
                  )}
                  {inLong && !isSpeaking && (
                    <span className="h-2 w-2 shrink-0 bg-bleu-fonce" title="File d'attente" />
                  )}
                </span>
              </li>
            )
          })}

          {notYetConnected.map(r => (
            <li key={r.member_id} className="flex items-center">
              <span aria-hidden="true" className="flex w-14 shrink-0 justify-center py-1.5">
                <span className="h-7 w-7 rounded-full border border-dashed border-gray-400" />
              </span>
              <span className="min-w-0 flex-1 truncate py-1.5 pr-4 text-sm italic text-gray-500">{r.pseudo}</span>
            </li>
          ))}
        </ul>

        {participants.length === 0 && notYetConnected.length === 0 && (
          <p className="pb-4 pl-14 pr-4 text-xs italic text-gray-500">Aucun participant</p>
        )}
      </aside>
    )
  }

  return (
    <aside className={`w-full lg:w-52 shrink-0 border p-3 flex flex-col gap-2 self-start lg:sticky lg:top-20 ${
      dark
        ? 'bg-slate-800/60 border-white/10'
        : 'bg-white border-bleu-fonce/10 shadow-sm'
    }`}>

      <div className="flex items-center justify-between px-1">
        <span className={`text-[11px] font-bold uppercase tracking-[0.16em] ${
          dark ? 'text-bleu-clair' : 'text-bleu-fonce/70'
        }`}>
          Présents
        </span>
        <span className={`text-xs font-mono tabular-nums px-1.5 py-0.5 ${
          dark ? 'text-slate-200 bg-white/10' : 'text-gray-600 bg-gray-100'
        }`}>
          {roster ? roster.length : participants.length}
        </span>
      </div>

      <ul className="flex flex-col gap-1">
        {sortedConnected.map(p => {
          const isSpeaking    = p.id === currentSpeakerId
          const inInteractive = interactiveIds.has(p.id)
          const inLong        = longIds.has(p.id)
          const style         = rosterByPseudo.get(p.pseudo)?.participation_style ?? null

          return (
            <li
              key={p.id}
              className={`flex items-center gap-2 px-2 py-1.5 border transition-colors ${
                isSpeaking
                  ? 'bg-amber-500/15 border-amber-500/30'
                  : dark ? 'border-transparent hover:bg-white/5' : 'border-transparent hover:bg-gray-50'
              }`}
            >
              {isSpeaking ? (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
              ) : (
                <span className={`w-2 h-2 rounded-full shrink-0 ${dark ? 'bg-slate-500' : 'bg-gray-300'}`} />
              )}

              <span className={`text-sm truncate flex-1 ${
                isSpeaking
                  ? dark ? 'text-amber-200 font-semibold' : 'text-amber-800 font-semibold'
                  : dark ? 'text-slate-200' : 'text-gray-700'
              }`}>
                {p.pseudo}
              </span>

              <StyleBadge style={style} />

              {inInteractive && !isSpeaking && (
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" title="Demander la parole sur le sujet actuel" />
              )}
              {inLong && !isSpeaking && (
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" title="File d'attente" />
              )}
            </li>
          )
        })}

        {/* Chantier 97 — affectés à la table, pas encore connectés */}
        {notYetConnected.map(r => (
          <li
            key={r.member_id}
            className="flex items-center gap-2 px-2 py-1.5 border border-transparent opacity-70"
          >
            <span className={`w-2 h-2 rounded-full shrink-0 border ${
              dark ? 'border-slate-500' : 'border-gray-400'
            }`} />
            <span className={`text-sm truncate flex-1 italic ${
              dark ? 'text-slate-400' : 'text-gray-500'
            }`}>
              {r.pseudo}
            </span>
            <StyleBadge style={r.participation_style} />
          </li>
        ))}
      </ul>

      {participants.length === 0 && notYetConnected.length === 0 && (
        <p className={`text-xs text-center py-2 italic ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
          Aucun participant
        </p>
      )}
    </aside>
  )
}
