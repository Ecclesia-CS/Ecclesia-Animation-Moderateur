import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getSessionByJoinCode } from '../lib/sessions'
import type { Session } from '../lib/types'
import ResultsMapScreen from './ResultsMapScreen'
import PublicResultsScreen from './PublicResultsScreen'
import JoinTableForm from '../components/JoinTableForm'
import SessionQuestionnaireForm from '../components/voting/SessionQuestionnaireForm'
import { getMyTableAssignment, hasQuestionnaireResponse, joinSimpleDebate } from '../lib/voting'
import { effectiveTablePhase, sessionTypeOf } from '../lib/phaseLabels'
import TableDebateEndedPanel from '../components/voting/TableDebateEndedPanel'
import DebateEntryForm from '../components/DebateEntryForm'
import { tableStore } from '../lib/storage'
import PageParcours, { BOUTON_VERRE_PARCOURS, CarteMessage } from '../components/PageParcours'
import EcranChargement from '../components/EcranChargement'
import FondQuadrille from '../components/FondQuadrille'

interface SessionRouterScreenProps {
  sessionJoinCode: string
  onTableJoined?: (tableId: string, participantId: string, isModerator: boolean) => void
}

type Status =
  | 'loading'
  | 'redirecting'
  | 'not_found'
  | 'not_open'
  | 'debating_no_member'
  | 'debate_entry'
  | 'post_voting_no_member'
  | 'questionnaire'
  | 'closed'
  | 'results_map'
  | 'public_results'

export default function SessionRouterScreen({ sessionJoinCode, onTableJoined }: SessionRouterScreenProps) {
  const [status,       setStatus]       = useState<Status>('loading')
  const [sessionId,    setSessionId]    = useState<string | null>(null)
  const [fullSession,  setFullSession]  = useState<Session | null>(null)
  const [selfMemberId, setSelfMemberId] = useState<string | null>(null)
  // Chantier 161 — table du membre dont le débat est terminé alors que la
  // séance débat encore (null sinon) : écran de fin du débat simple.
  const [endedTableId, setEndedTableId] = useState<string | null>(null)
  useEffect(() => {
    async function route() {
      // 1. Ensure anonymous auth
      let authSession = (await supabase.auth.getSession()).data.session
      if (!authSession) {
        const { data } = await supabase.auth.signInAnonymously()
        authSession = data.session
      }
      const userId = authSession?.user.id ?? null

      // 2. Fetch session by join_code
      const session = await getSessionByJoinCode(sessionJoinCode).catch(() => null)

      if (!session) {
        setStatus('not_found')
        return
      }

      const s = session
      setSessionId(s.id)
      setFullSession(s)
      const isSimpleDebate = sessionTypeOf(s) === 'debate'

      // Chantier 161 — un membre dont la table a terminé son débat suit la
      // phase de SA table (post-vote ou fin), pas celle de la séance.
      let phase: Session['phase'] = s.phase
      if (s.phase === 'debating' && userId) {
        const a = await getMyTableAssignment(s.id).catch(() => null)
        if (a?.debate_ended_at) {
          phase = effectiveTablePhase(s, a) ?? s.phase
          setEndedTableId(a.table_id)
        }
      }

      // 3. Branch per phase
      switch (phase) {
        case 'draft':
          // Chantier 65 — une séance en brouillon n'est pas encore ouverte :
          // pas de redirection vers #vote/, qui ne peut de toute façon aboutir
          // (register_session_member la refuse côté serveur).
          setStatus('not_open')
          return

        case 'pre_voting':
        case 'voting':
        case 'allocating':
          setStatus('redirecting')
          window.location.hash = '#vote/' + sessionJoinCode
          return

        case 'debating': {
          // Chantier 134 — débat simple : ni vote ni VoteScreen. Un membre
          // déjà inscrit (même appareil) retourne directement à sa table ;
          // sinon, formulaire d'entrée dédié (nom, modérateur, code de rappel).
          if (isSimpleDebate) {
            if (userId) {
              const { data: member } = await supabase
                .from('session_members')
                .select('id')
                .eq('session_id', s.id)
                .eq('user_id', userId)
                .maybeSingle()
              if (member) {
                try {
                  const r = await joinSimpleDebate(s.id, '')
                  tableStore.set({
                    tableId:       r.id,
                    participantId: r.participant_id,
                    joinCode:      r.join_code,
                    isModerator:   r.is_moderator,
                    pseudo:        r.pseudo,
                  })
                  if (onTableJoined) onTableJoined(r.id, r.participant_id, r.is_moderator)
                  setStatus('redirecting')
                  return
                } catch {
                  // Retombe sur le formulaire, qui affichera l'erreur au besoin.
                }
              }
            }
            setStatus('debate_entry')
            return
          }
          if (!userId) {
            setStatus('debating_no_member')
            return
          }
          const { data: member } = await supabase
            .from('session_members')
            .select('id')
            .eq('session_id', s.id)
            .eq('user_id', userId)
            .maybeSingle()

          if (member) {
            setStatus('redirecting')
            window.location.hash = '#vote/' + sessionJoinCode
          } else {
            setStatus('debating_no_member')
          }
          return
        }

        // Chantier 89 — 'post_voting' : le débat est fini, un membre inscrit
        // voit ses résultats et peut revoter (ResultsMapScreen). Un visiteur
        // non inscrit n'a en revanche pas droit au résumé public : celui-ci
        // reste gated en base sur phase='closed' (get_public_results) —
        // les votes peuvent encore bouger tant que le revote est ouvert.
        case 'post_voting':
        case 'closed': {
          if (userId) {
            const { data: member } = await supabase
              .from('session_members')
              .select('id')
              .eq('session_id', s.id)
              .eq('user_id', userId)
              .maybeSingle()

            if (member) {
              setFullSession(s)
              setSelfMemberId(member.id)
              // Chantier 39 — plus de phase 'questionnaire' dédiée : un membre
              // inscrit qui n'a pas encore répondu au questionnaire post-débat
              // le voit avant sa carte de résultats (scatter + point self).
              // Chantier 134 — un sondage n'a pas de débat, donc pas de
              // questionnaire post-débat : directement les résultats.
              if (sessionTypeOf(s) === 'poll') {
                setStatus('results_map')
                return
              }
              // Chantier 135 — débat d'une association : pas de questionnaire
              // de fin (consigne de Jules), directement l'écran de fin.
              if (isSimpleDebate && s.organization_id) {
                setStatus('closed')
                return
              }
              const answered = await hasQuestionnaireResponse(s.id)
              // Chantier 134 — un débat simple n'a pas de carte de résultats :
              // questionnaire de fin (demandé par Jules), puis écran de fin.
              const after = isSimpleDebate ? 'closed' : 'results_map'
              setStatus(answered ? after : 'questionnaire')
              return
            }
          }
          if (isSimpleDebate) {
            setStatus('closed')
            return
          }
          if (s.phase === 'post_voting') {
            setStatus('post_voting_no_member')
            return
          }
          // Visiteur non inscrit, séance clôturée → résumé public (groupes + assertions, sans scatter)
          setFullSession(s)
          setStatus('public_results')
          return
        }

        default:
          setStatus('not_found')
      }
    }

    route()
  }, [sessionJoinCode])

  // ── Render ────────────────────────────────────────────────────
  if (status === 'questionnaire' && fullSession) {
    return (
      <PageParcours session={fullSession}>
        <SessionQuestionnaireForm
          sessionId={fullSession.id}
          sessionType={sessionTypeOf(fullSession)}
          onDone={() => setStatus(sessionTypeOf(fullSession) === 'debate' ? 'closed' : 'results_map')}
        />
      </PageParcours>
    )
  }

  if (status === 'debate_entry' && sessionId && fullSession) {
    return (
      <DebateEntryForm
        sessionId={sessionId}
        session={fullSession}
        onJoined={(tableId, participantId, isModerator) => {
          if (onTableJoined) onTableJoined(tableId, participantId, isModerator)
        }}
      />
    )
  }

  if (status === 'results_map' && fullSession && selfMemberId) {
    return <ResultsMapScreen session={fullSession} memberId={selfMemberId} />
  }

  if (status === 'public_results' && fullSession) {
    return <PublicResultsScreen session={fullSession} />
  }

  if (status === 'loading' || status === 'redirecting') {
    return <EcranChargement texte="Chargement…" />
  }

  // Séance introuvable : plein écran marine, comme dans le vote.
  if (status === 'not_found' || !fullSession) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-bleu-fonce text-creme flex flex-col items-center justify-center px-6 text-center">
        <FondQuadrille cases={10} />
        <div className="relative flex max-w-sm flex-col items-center gap-4 animate-montee">
          <div className="text-5xl" aria-hidden="true">😕</div>
          <h1 className="font-sans text-3xl font-bold tracking-[-0.02em]">Séance introuvable</h1>
          <p className="text-sm text-creme/75">Vérifie le lien ou scanne à nouveau le QR code.</p>
          <a href="#" onClick={() => (window.location.hash = '')} className={`mt-2 ${BOUTON_VERRE_PARCOURS}`}>
            Retour à l'accueil
          </a>
        </div>
      </div>
    )
  }

  // Arrivé en retard, séance déjà en débat, jamais inscrit au vote (D14) —
  // formulaire de rattrapage : rejoindre directement la table avec le code affiché en salle.
  if (status === 'debating_no_member') {
    return (
      <PageParcours session={fullSession}>
        <div className="w-full rounded-[12px] border border-bleu-fonce/10 bg-white shadow-sm p-6 animate-montee">
          <div className="text-center mb-4">
            <div className="text-5xl mb-4" aria-hidden="true">🗣️</div>
            <h2 className="font-sans text-2xl font-bold tracking-[-0.01em] text-bleu-fonce">Débat en cours</h2>
            <p className="text-sm text-gray-600 mt-3 leading-relaxed">
              Le vote est terminé, mais tu peux rejoindre une table directement avec le code affiché à la table que l'administrateur t'assignera, ou que tu choisiras. Si ce n'est pas évident, le modérateur te fournira le code.
            </p>
          </div>
          {/* Chantier 143 — un seul champ « Prénom Nom » (et une seule ligne de
              code de rappel) pour « Assignez-moi une table » (chantier 111 :
              table animée la moins remplie) et pour l'entrée par code de table. */}
          <JoinTableForm
            sessionId={sessionId ?? undefined}
            offerAutoAssign
            onJoined={(tableId, participantId, isModerator) => {
              if (onTableJoined) onTableJoined(tableId, participantId, isModerator)
            }}
          />
        </div>
      </PageParcours>
    )
  }

  // Visiteur non inscrit pendant 'post_voting' : pas de compte à créer a posteriori,
  // et le résumé public n'existe qu'à partir de 'closed' (votes encore mouvants).
  if (status === 'post_voting_no_member') {
    return (
      <PageParcours session={fullSession}>
        <CarteMessage icone="🗳️" titre="Le débat vient de se terminer">
          Les résultats publics seront disponibles une fois la séance clôturée par l'organisateur.
        </CarteMessage>
      </PageParcours>
    )
  }

  if (status === 'not_open') {
    return (
      <PageParcours session={fullSession}>
        <CarteMessage icone="🔒" titre="Séance pas encore ouverte">
          Cette séance est encore en préparation. Reviens un peu plus tard, ou contacte l'organisateur si tu penses que c'est une erreur.
        </CarteMessage>
      </PageParcours>
    )
  }

  // Chantier 161 — débat simple : c'est la table, pas la séance, qui a fini.
  const tableEnded = status === 'closed' && !!endedTableId
  const title = tableEnded ? 'Le débat de votre table est terminé' : 'Séance terminée'

  return (
    <PageParcours session={fullSession}>
      <div className="space-y-4">
        <CarteMessage icone="✅" titre={title}>
          Merci pour ta participation.
        </CarteMessage>
        {tableEnded && (
          <TableDebateEndedPanel session={fullSession} tableId={endedTableId} initiallyEnded />
        )}
      </div>
    </PageParcours>
  )
}
