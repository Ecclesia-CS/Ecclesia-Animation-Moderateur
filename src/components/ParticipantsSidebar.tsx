import { useEffect, useRef, useState } from 'react'
import type { Participant, QueueEntry, TableMemberForModerator } from '../lib/types'
import { loadTableMembersForModerator } from '../lib/voting'

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
}

const STYLE_LABEL: Record<'listener' | 'active', string> = {
  active:   'Actif',
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

  function StyleBadge({ style }: { style: 'listener' | 'active' | null }) {
    if (!style) return null
    const isActive = style === 'active'
    return (
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 whitespace-nowrap ${
          isActive
            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
            : 'bg-slate-600/40 text-slate-300 border-slate-500/40'
        }`}
        title={isActive
          ? 'Actif — censé prendre la parole'
          : 'Passif — ne doit pas prendre la parole spontanément, mais peut la recevoir'}
      >
        {STYLE_LABEL[style]}
      </span>
    )
  }

  return (
    <aside className={`w-full lg:w-52 shrink-0 border rounded-2xl p-3 flex flex-col gap-2 self-start sticky top-20 ${
      dark
        ? 'bg-slate-800/50 border-slate-700'
        : 'bg-white border-gray-200 shadow-sm'
    }`}>

      <div className="flex items-center justify-between px-1">
        <span className={`text-xs font-semibold uppercase tracking-wider ${
          dark ? 'text-slate-400' : 'text-gray-500'
        }`}>
          Présents
        </span>
        <span className={`text-xs font-mono px-1.5 py-0.5 rounded-full ${
          dark ? 'text-slate-500 bg-slate-700' : 'text-gray-400 bg-gray-100'
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
              className={`flex items-center gap-2 px-2 py-1.5 rounded-xl transition-colors ${
                isSpeaking
                  ? 'bg-amber-500/15 border border-amber-500/30'
                  : dark ? 'hover:bg-slate-700/40' : 'hover:bg-gray-50'
              }`}
            >
              {isSpeaking ? (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
              ) : (
                <span className={`w-2 h-2 rounded-full shrink-0 ${dark ? 'bg-slate-600' : 'bg-gray-300'}`} />
              )}

              <span className={`text-sm truncate flex-1 ${
                isSpeaking
                  ? 'text-amber-200 font-semibold'
                  : dark ? 'text-slate-300' : 'text-gray-700'
              }`}>
                {p.pseudo}
              </span>

              <StyleBadge style={style} />

              {inInteractive && !isSpeaking && (
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" title="Coupe file" />
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
            className="flex items-center gap-2 px-2 py-1.5 rounded-xl opacity-60"
          >
            <span className={`w-2 h-2 rounded-full shrink-0 border ${
              dark ? 'border-slate-600' : 'border-gray-300'
            }`} />
            <span className={`text-sm truncate flex-1 italic ${
              dark ? 'text-slate-500' : 'text-gray-400'
            }`}>
              {r.pseudo}
            </span>
            <StyleBadge style={r.participation_style} />
          </li>
        ))}
      </ul>

      {participants.length === 0 && notYetConnected.length === 0 && (
        <p className={`text-xs text-center py-2 ${dark ? 'text-slate-600' : 'text-gray-400'}`}>
          Aucun participant
        </p>
      )}
    </aside>
  )
}
