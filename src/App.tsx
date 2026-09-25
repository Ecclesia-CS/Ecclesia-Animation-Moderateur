import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { tableStore } from './lib/storage'
import type { TableResult } from './lib/supabase'
import { TableProvider } from './context/TableContext'
import { useToast } from './context/ToastContext'
import EntryScreen from './screens/EntryScreen'
import TableView from './screens/TableView'
import SuperadminScreen from './screens/SuperadminScreen'
import CollabDocScreen from './screens/CollabDocScreen'
import VoteScreen from './screens/VoteScreen'
import SessionRouterScreen from './screens/SessionRouterScreen'
import JoinTableScreen from './screens/JoinTableScreen'
import PublicResultsScreen from './screens/PublicResultsScreen'
import NotFoundScreen from './screens/NotFoundScreen'
import ReconnectPrompt from './components/ReconnectPrompt'

type AppPhase =
  | { type: 'loading' }
  | { type: 'entry'; userId: string }
  | { type: 'table'; tableId: string; participantId: string; userId: string; isModerator: boolean }
  /**
   * Chantier 120 — jeton anonyme renouvelé sur un pseudo déjà inscrit à la
   * séance : `sync_table_assignment` a répondu `reconnect_required` plutôt
   * que de réassigner l'identité par simple pseudo. Il faut le code de
   * rappel avant de pouvoir rappeler `join_table`.
   */
  | { type: 'reconnect'; sessionId: string; pseudo: string; joinCode: string; userId: string }

// Chantier 129 — préfixes de hash qui expriment une intention de navigation
// explicite (lien/QR code fraîchement scanné). Partagé entre `init()` (pour
// ne pas la court-circuiter en restaurant une ancienne table) et le rendu
// (détection de hash inconnu, chantier 88).
const KNOWN_HASH_PREFIXES = ['#superadmin', '#collab/', '#session/', '#vote/', '#results/', '#table/']

export default function App() {
  const { showToast } = useToast()
  const [phase, setPhase] = useState<AppPhase>({ type: 'loading' })
  const [hash, setHash] = useState(window.location.hash)

  useEffect(() => {
    const handler = () => setHash(window.location.hash)
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  /**
   * Chantier 120 — rejoint la table, et bascule vers l'écran de reconnexion
   * (code de rappel) plutôt que de réassigner silencieusement l'identité de
   * séance quand `join_table` répond `reconnect_required` (jeton anonyme
   * renouvelé sur un pseudo déjà inscrit). Lève si la réponse est vide ou
   * incohérente (`reconnect_required` sans `session_id`) — l'appelant décide
   * alors du repli (écran d'entrée).
   */
  async function joinAndHandleReconnect(pseudo: string, joinCode: string, userId: string) {
    const { data: rpcData } = await supabase.rpc('join_table', {
      p_join_code: joinCode,
      p_pseudo: pseudo,
    })
    if (!rpcData) throw new Error('join_table: réponse vide')
    const r = rpcData as TableResult

    if (r.reconnect_required) {
      if (!r.session_id) throw new Error('reconnect_required sans session_id')
      setPhase({ type: 'reconnect', sessionId: r.session_id, pseudo, joinCode, userId })
      return
    }

    // Chantier 110 — `r.created_by === userId` était toujours faux ici :
    // `created_by` vient de LA TABLE AVANT ce join_table (dont l'appelant
    // renouvelé n'était par définition pas encore le créateur), et sur une
    // table issue de l'allocation c'est de toute façon l'uid du superadmin
    // (anti-pattern « Ne jamais faire » de CLAUDE.md). Un ex-modérateur
    // dont le jeton a été renouvelé redémarre donc toujours en
    // ParticipantView — TableContext.load() recalcule ensuite en direct le
    // statut modérateur de séance (session_members), mais pas l'autorité
    // physique (tables.created_by), qui n'a aucun chemin de reprise
    // automatique après renouvellement : voir le bouton « Je suis le
    // modérateur de cette table » (ParticipantToolsButton), seul filet.
    tableStore.set({ tableId: r.id, participantId: r.participant_id, joinCode: r.join_code, isModerator: false, pseudo })
    setPhase({ type: 'table', tableId: r.id, participantId: r.participant_id, userId, isModerator: false })
  }

  useEffect(() => {
    async function init() {
      // Ensure anonymous auth session
      let session = (await supabase.auth.getSession()).data.session
      if (!session) {
        const { data } = await supabase.auth.signInAnonymously()
        session = data.session
      }
      if (!session) {
        setPhase({ type: 'entry', userId: '' })
        return
      }
      const userId = session.user.id

      // Chantier 129 — `tableStore` (localStorage `ecclesia_table`) est une
      // clé globale, non scopée par séance : elle garde la dernière table
      // rejointe, toutes séances confondues sur cet appareil. La restaurer
      // sans condition ici court-circuitait un lien/QR code fraîchement
      // scanné vers une NOUVELLE séance (#session/, #vote/, #table/…) —
      // le participant retombait sur son ancienne table (et son éventuel
      // questionnaire forcé resté ouvert) au lieu de l'écran d'identification
      // de la nouvelle séance. Un hash de navigation explicite au chargement
      // exprime une intention plus récente que l'état restauré : on ne
      // restaure la table précédente que si aucun lien de ce type n'a amené
      // l'utilisateur ici (rechargement en cours de débat, hash déjà vidé par
      // `handleTableJoined`).
      const cameFromExplicitLink = KNOWN_HASH_PREFIXES.some(p => window.location.hash.startsWith(p))

      // Try to restore a previous table from localStorage
      const stored = cameFromExplicitLink ? null : tableStore.get()
      if (stored) {
        const { data: pRow } = await supabase
          .from('participants')
          .select('id, user_id')
          .eq('id', stored.participantId)
          .maybeSingle()

        if (pRow && (pRow as { id: string; user_id: string }).user_id === userId) {
          // Même auth.uid → restauration directe sans RPC
          setPhase({ type: 'table', tableId: stored.tableId, participantId: stored.participantId, userId, isModerator: stored.isModerator ?? false })
          return
        }
        // Participant trouvé mais user_id différent (auth anonyme renouvelé), ou non trouvé →
        // joinAndHandleReconnect relie l'auth.uid() courant (ou bascule vers
        // l'écran de reconnexion si un autre user_id porte déjà ce pseudo).
        if (stored.pseudo && stored.joinCode) {
          try {
            await joinAndHandleReconnect(stored.pseudo, stored.joinCode, userId)
            return
          } catch { /* table supprimée, réseau mort, ou réponse incohérente → écran d'entrée */ }
        }

        tableStore.clear()
        showToast("La table que tu avais rejointe n'est plus disponible.", 'info')
      }

      setPhase({ type: 'entry', userId })
    }
    init()
  }, [])

  function handleTableJoined(tableId: string, participantId: string, isModerator: boolean) {
    const userId = phase.type !== 'loading' ? (phase as { userId: string }).userId : ''
    setPhase({ type: 'table', tableId, participantId, userId, isModerator })
    // Nettoyer le hash sans déclencher hashchange (history.replaceState n'émet pas d'événement)
    history.replaceState(null, '', window.location.pathname + window.location.search)
  }

  function handleTableEnd() {
    tableStore.clear()
    const userId = phase.type === 'table' ? phase.userId : ''
    setPhase({ type: 'entry', userId })
  }

  // Route /superadmin via hash — indépendant du flow principal
  if (hash === '#superadmin') {
    return <SuperadminScreen />
  }

  // Route #collab/<join_code> — document collaboratif de sources
  if (hash.startsWith('#collab/')) {
    const joinCode = hash.slice('#collab/'.length)
    return <CollabDocScreen sessionJoinCode={joinCode} />
  }

  // Route #session/<join_code> — routeur intelligent (QR code / lien WhatsApp)
  // Guard: si l'utilisateur vient de rejoindre une table en retard (phase 'table'), on passe en TableView
  if (hash.startsWith('#session/') && phase.type !== 'table') {
    const joinCode = hash.slice('#session/'.length)
    return <SessionRouterScreen sessionJoinCode={joinCode} onTableJoined={handleTableJoined} />
  }

  // Route #vote/<join_code> — interface de vote participant
  // Guard: si l'utilisateur vient de rejoindre une table (phase 'table'), on passe en TableView
  if (hash.startsWith('#vote/') && phase.type !== 'table') {
    const joinCode = hash.slice('#vote/'.length)
    return <VoteScreen sessionJoinCode={joinCode} onTableJoined={handleTableJoined} />
  }

  // Route #results/<session_id> — résultats publics d'une ancienne séance,
  // accédée depuis la modale "Anciennes séances" de l'accueil (chantier 46) —
  // pas de join_code nécessaire, direct par id. Gate réel côté RPC
  // (get_public_results exige phase='closed' ET results_public=true).
  if (hash.startsWith('#results/') && phase.type !== 'table') {
    const resultsSessionId = hash.slice('#results/'.length)
    return <PublicResultsScreen sessionId={resultsSessionId} />
  }

  // Route #table/<join_code> — rejoindre directement une table de débat via un code distribué (D8/D14)
  if (hash.startsWith('#table/') && phase.type !== 'table') {
    const joinCode = hash.slice('#table/'.length)
    return <JoinTableScreen tableJoinCode={joinCode} onTableJoined={handleTableJoined} />
  }

  // Hash non vide mais ne correspondant à aucune route connue — lien cassé ou
  // mal copié plutôt qu'un retour silencieux à l'accueil (chantier 88).
  if (hash.length > 1 && phase.type !== 'table' && !KNOWN_HASH_PREFIXES.some(p => hash === p || hash.startsWith(p))) {
    return <NotFoundScreen />
  }

  if (phase.type === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-500">Connexion…</p>
      </div>
    )
  }

  if (phase.type === 'entry') {
    return <EntryScreen />
  }

  if (phase.type === 'reconnect') {
    const { sessionId, pseudo, joinCode, userId } = phase
    return (
      <ReconnectPrompt
        sessionId={sessionId}
        pseudo={pseudo}
        onConfirmed={() => {
          setPhase({ type: 'loading' })
          joinAndHandleReconnect(pseudo, joinCode, userId).catch(() => {
            tableStore.clear()
            showToast("La reconnexion a échoué. Réessaie depuis l'écran d'entrée.", 'info')
            setPhase({ type: 'entry', userId })
          })
        }}
        onGiveUp={() => {
          tableStore.clear()
          setPhase({ type: 'entry', userId })
        }}
      />
    )
  }

  return (
    <TableProvider
      tableId={phase.tableId}
      participantId={phase.participantId}
      userId={phase.userId}
      initialIsModerator={phase.isModerator}
      onTableEnd={handleTableEnd}
    >
      <TableView />
    </TableProvider>
  )
}
