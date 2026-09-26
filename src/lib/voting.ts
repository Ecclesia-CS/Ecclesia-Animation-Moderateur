import { supabase } from './supabase'
import type { TableResult } from './supabase'
import { extractErr } from './utils'
import type {
  Session,
  SessionMember,
  EntryResponse,
  Assertion,
  AssertionVote,
  VoteResult,
  TableAssignment,
  ModerationPolicy,
  TableOpinionSummary,
  TableCampSpeakingTimes,
  TableMemberForModerator,
} from './types'
import type { AllocationMember, AllocationResult } from './allocation'

/**
 * Chantier 93 — message unique, demandé mot pour mot par Jules : le même texte
 * doit apparaître quand on saisit un pseudo déjà pris et quand on échoue à se
 * reconnecter. Il dit les deux issues possibles (c'est toi → ton code ; ce
 * n'est pas toi → un autre nom).
 */
export const PSEUDO_TAKEN_MESSAGE =
  "Ce nom est déjà utilisé dans cette séance. Si c'est bien toi, reconnecte-toi avec ton code de rappel à 4 chiffres. Sinon, choisis un autre nom."

/**
 * Chantier 93 — affiché sous le champ du nom, à l'inscription : le pseudo est
 * lu à voix haute par le modérateur pendant le débat, il faut le savoir avant
 * de le choisir.
 */
export const PSEUDO_PUBLIC_NOTICE =
  "Ce nom sera utilisé par le modérateur pour te donner la parole pendant le débat."

/**
 * Chantier 93 — les RPC d'identité ne lèvent PAS sur un refus d'identification
 * (mauvais code, blocage après 10 essais) : elles renvoient `{ error }`. Un
 * RAISE annulerait la transaction, donc le compteur de tentatives avec.
 * Ce helper rétablit la sémantique attendue côté React.
 */
function unwrapIdentity<T>(data: unknown): T {
  const err = (data as { error?: string } | null)?.error
  if (err) throw new Error(err)
  return data as T
}

export async function registerSessionMember(
  sessionId: string,
  pseudo: string
): Promise<SessionMember> {
  const { data, error } = await supabase.rpc('register_session_member', {
    p_session_id: sessionId,
    p_pseudo: pseudo,
  })
  if (error) throw new Error(extractErr(error))
  return unwrapIdentity<SessionMember>(data)
}

/**
 * Chantier 93 — reconnexion depuis un nouvel appareil : pseudo ET code, les
 * deux ensemble, toujours. Le pseudo seul ne prouve plus rien (c'est le nom et
 * prénom réels, connus de toute la séance). Refusée après la clôture, où plus
 * personne n'a besoin de se reconnecter.
 * Sur le même appareil (ligne déjà rattachée à `auth.uid()`), aucun code n'est
 * demandé : appeler sans argument suffit à confirmer la présence.
 */
export async function confirmAttendance(
  sessionId: string,
  pseudo?: string,
  code?: string
): Promise<SessionMember> {
  const { data, error } = await supabase.rpc('confirm_attendance', {
    p_session_id: sessionId,
    p_pseudo:     pseudo ?? null,
    p_code:       code   ?? null,
  })
  if (error) throw new Error(extractErr(error))
  return unwrapIdentity<SessionMember>(data)
}

/**
 * Chantier B3 — reconquête d'un profil pré-vote déjà inscrit, chantier 93 :
 * pseudo ET code obligatoires. Contrairement à `confirmAttendance`, ne touche
 * jamais `attending_in_person` : le vote reste à distance. Phase-safe côté
 * serveur — n'agit que si la séance est encore en `pre_voting`.
 */
export async function reclaimPrevotingMember(
  sessionId: string,
  pseudo?: string,
  code?: string
): Promise<SessionMember> {
  const { data, error } = await supabase.rpc('reclaim_prevoting_member', {
    p_session_id: sessionId,
    p_pseudo:     pseudo ?? null,
    p_code:       code   ?? null,
  })
  if (error) throw new Error(extractErr(error))
  return unwrapIdentity<SessionMember>(data)
}

/**
 * Chantier 93 — renommage libre, propagé dans la même transaction aux deux
 * copies du pseudo (`participants.pseudo`, `session_sources.pseudo`). Refusé
 * si le nom est déjà pris dans la séance, ou si la personne a la parole /
 * figure dans une file d'attente (le nom changerait sous les yeux du
 * modérateur en plein tour).
 */
export async function renameSessionMember(
  sessionId: string,
  newPseudo: string
): Promise<SessionMember> {
  const { data, error } = await supabase.rpc('rename_session_member', {
    p_session_id: sessionId,
    p_new_pseudo: newPseudo,
  })
  if (error) throw new Error(extractErr(error))
  return unwrapIdentity<SessionMember>(data)
}

/**
 * Chantier 93 — capture d'écran perdue. Le code étant haché, il est
 * IMPOSSIBLE de le relire : on en tire un nouveau, à lire à la personne.
 * L'ancien cesse alors de fonctionner.
 */
export async function regenerateReclaimCodeAdmin(
  password: string,
  memberId: string
): Promise<{ pseudo: string; new_reclaim_code: string }> {
  const { data, error } = await supabase.rpc('regenerate_reclaim_code_admin', {
    p_password:  password,
    p_member_id: memberId,
  })
  if (error) throw new Error(extractErr(error))
  return data as { pseudo: string; new_reclaim_code: string }
}

/**
 * Chantier 116 — self-service : le participant fait réapparaître SON code.
 * Le code étant haché (bcrypt, `reclaim_code_hash`, depuis le chantier 93),
 * il est impossible de le relire : cette fonction en émet un nouveau, qui
 * invalide l'ancien (même mécanique que les deux régénérations admin/
 * modérateur ci-dessous, ciblée sur l'appelant via `auth.uid()`).
 */
export async function regenerateReclaimCodeSelf(
  sessionId: string
): Promise<{ pseudo: string; new_reclaim_code: string }> {
  const { data, error } = await supabase.rpc('regenerate_reclaim_code_self', {
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))
  return data as { pseudo: string; new_reclaim_code: string }
}

/**
 * Idem, par le modérateur — restreint aux participants assis à SA table, et
 * ciblé par pseudo : `session_members` est en self-only (chantier 50), un
 * modérateur n'a aucun `member_id` sous la main.
 */
export async function regenerateReclaimCodeModerator(
  tableId: string,
  pseudo: string
): Promise<{ pseudo: string; new_reclaim_code: string }> {
  const { data, error } = await supabase.rpc('regenerate_reclaim_code_moderator', {
    p_table_id: tableId,
    p_pseudo:   pseudo,
  })
  if (error) throw new Error(extractErr(error))
  return data as { pseudo: string; new_reclaim_code: string }
}

/**
 * Chantier 19 (G3) — onboarding à 3 questions.
 * Nécessite la migration 20260725_1_onboarding_3_questions.sql (l'ancienne
 * signature à 7 paramètres est supprimée en base).
 */
export async function submitEntryResponse(
  sessionId: string,
  consentTranscript: boolean,
  participationStyle: 'listener' | 'active',
  ecclesiaExperience: boolean
): Promise<EntryResponse> {
  const { data, error } = await supabase.rpc('submit_entry_response', {
    p_session_id: sessionId,
    p_consent_transcript: consentTranscript,
    p_participation_style: participationStyle,
    p_ecclesia_experience: ecclesiaExperience,
  })
  if (error) throw new Error(extractErr(error))
  return data as EntryResponse
}

export async function submitAssertion(
  sessionId: string,
  content: string
): Promise<Assertion> {
  const { data, error } = await supabase.rpc('submit_assertion', {
    p_session_id: sessionId,
    p_content: content,
  })
  if (error) throw new Error(extractErr(error))
  return data as Assertion
}

/**
 * Chantier 51 — remplace la lecture directe de `assertions` filtrée sur
 * `member_id` (désanonymisante côté REST, cf. migration
 * 20260902_chantier51_hide_assertion_author.sql : la colonne member_id
 * n'est plus accordée en lecture directe). Retourne les ids des assertions
 * proposées par l'appelant sur cette séance.
 */
export async function getMyAssertionIds(sessionId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_my_assertion_ids', {
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))
  return (data as string[]) ?? []
}

export async function mergeAssertionVotes(
  password: string,
  keepId: string,
  rejectId: string
): Promise<void> {
  const { error } = await supabase.rpc('merge_assertion_votes', {
    p_password:  password,
    p_keep_id:   keepId,
    p_reject_id: rejectId,
  })
  if (error) throw new Error(extractErr(error))
}

export async function castVote(
  assertionId: string,
  vote: 'agree' | 'disagree' | 'pass'
): Promise<AssertionVote> {
  const { data, error } = await supabase.rpc('cast_vote', {
    p_assertion_id: assertionId,
    p_vote: vote,
  })
  if (error) throw new Error(extractErr(error))
  return data as AssertionVote
}

export async function getVoteResults(sessionId: string): Promise<VoteResult[]> {
  const { data, error } = await supabase.rpc('get_vote_results', {
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))
  return (data as VoteResult[]) ?? []
}

/**
 * Chantier 39 — remplace le gate sur `session.phase === 'questionnaire'`
 * (phase supprimée) : un membre inscrit a déjà répondu au questionnaire
 * post-débat de cette séance ? RLS restreint déjà la lecture à ses propres
 * réponses (`user_id = auth.uid()`), inutile de filtrer dessus ici.
 */
export async function hasQuestionnaireResponse(sessionId: string): Promise<boolean> {
  // .limit(1) plutôt que .maybeSingle() : un participant qui a changé de table
  // et rempli deux fois le questionnaire forcé (une ligne par `table_id`, cf.
  // index unique `(user_id, table_id) WHERE table_id IS NOT NULL`) a deux lignes
  // pour cette séance. .maybeSingle() lève alors une erreur sur "plusieurs lignes",
  // error est ignorée ici, data devient null → on lui redemande le questionnaire.
  const { data } = await supabase
    .from('questionnaire_responses')
    .select('id')
    .eq('session_id', sessionId)
    .limit(1)
  return (data?.length ?? 0) > 0
}

// Chantier 20 (G7) — vue modérateur : composition idéologique de sa table +
// assertions représentatives par camp + clivantes/consensuelles au sein de
// la table. Aucun mot de passe : auth par participation à la table (RPC
// vérifie is_table_participant côté serveur). Retourne null si l'appelant
// n'est pas participant de cette table.
export async function loadTableOpinionSummary(tableId: string): Promise<TableOpinionSummary | null> {
  const { data, error } = await supabase.rpc('get_table_opinion_summary', {
    p_table_id: tableId,
  })
  if (error) throw new Error(extractErr(error))
  return (data as TableOpinionSummary) ?? null
}

// Chantier 94 — temps de parole cumulé par camp, réservé au modérateur de la
// table (RPC vérifie is_table_moderator côté serveur — plus restrictif que
// get_table_opinion_summary). Ne rappeler cette RPC qu'au rythme du
// floutage 5 min voulu par Jules, jamais en continu.
export async function loadTableCampSpeakingTimes(tableId: string): Promise<TableCampSpeakingTimes | null> {
  const { data, error } = await supabase.rpc('get_table_camp_speaking_times', {
    p_table_id: tableId,
  })
  if (error) throw new Error(extractErr(error))
  return (data as TableCampSpeakingTimes) ?? null
}

// Chantier 97 — vue modérateur : roster complet de la table (`table_assignments`),
// connectés ou non, avec actif/passif. Réservé au modérateur de la table
// (RPC vérifie is_table_moderator côté serveur — table_assignments est
// self-only depuis le chantier 50, une lecture directe ne verrait que la
// ligne de l'appelant).
export async function loadTableMembersForModerator(tableId: string): Promise<TableMemberForModerator[]> {
  const { data, error } = await supabase.rpc('list_table_members_for_moderator', {
    p_table_id: tableId,
  })
  if (error) throw new Error(extractErr(error))
  return (data ?? []) as TableMemberForModerator[]
}

export async function getVoteCountsAdmin(password: string, sessionId: string): Promise<VoteResult[]> {
  const { data, error } = await supabase.rpc('get_vote_counts_admin', {
    p_password: password,
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))
  return (data as VoteResult[]) ?? []
}

export type AllSessionVoteResult = VoteResult & {
  session_id: string
  session_title: string
}

export async function getAllVoteResults(password: string): Promise<AllSessionVoteResult[]> {
  const { data, error } = await supabase.rpc('get_vote_results_all', {
    p_password: password,
  })
  if (error) throw new Error(extractErr(error))
  return (data as AllSessionVoteResult[]) ?? []
}

export type ThemeStat = { theme: string; avg: number; count: number }

export async function getThemeStatsAll(password: string): Promise<ThemeStat[]> {
  const { data, error } = await supabase.rpc('get_theme_stats_all', {
    p_password: password,
  })
  if (error) throw new Error(extractErr(error))
  return (data as ThemeStat[]) ?? []
}

export async function approveAssertion(
  password: string,
  assertionId: string
): Promise<Assertion> {
  const { data, error } = await supabase.rpc('approve_assertion', {
    p_password: password,
    p_assertion_id: assertionId,
  })
  if (error) throw new Error(extractErr(error))
  return data as Assertion
}

export async function rejectAssertion(
  password: string,
  assertionId: string
): Promise<Assertion> {
  const { data, error } = await supabase.rpc('reject_assertion', {
    p_password: password,
    p_assertion_id: assertionId,
  })
  if (error) throw new Error(extractErr(error))
  return data as Assertion
}

export async function setSessionPhase(
  password: string,
  sessionId: string,
  phase: Session['phase']
): Promise<Session> {
  const { data, error } = await supabase.rpc('set_session_phase', {
    p_password: password,
    p_session_id: sessionId,
    p_phase: phase,
  })
  if (error) throw new Error(extractErr(error))
  return data as Session
}

// Chantier 19 (G5) — `runClusteringV3` (« allocation avancée ») et
// `getModeratorResponses` supprimés : remplacés par l'allocation v2
// ci-dessous. Chantier 37 : `runClusteringV1`/`V2` (répartition héritée,
// modale « Répartir en tables ») supprimées à leur tour — l'algorithme v2
// est en production sans incident depuis plusieurs chantiers, la double
// entrée en phase allocating (RPC run_clustering_v1/v2 encore en base,
// désormais inutilisées côté frontend) n'a plus de raison d'être.

// ── Chantier 19 — Allocation v2 ───────────────────────────────

/** Ligne retournée par get_allocation_inputs. */
interface AllocationInputRow {
  member_id: string
  pseudo: string
  is_moderator: boolean
  is_active: boolean
  consents: boolean
  is_veteran: boolean
  group_id: number | null
}

export interface AllocationInputs {
  /** Membres présentiels **hors modérateurs** — les sièges à pourvoir. */
  members: AllocationMember[]
  /** `member_id` des modérateurs de cette séance (n'occupent pas de siège). */
  moderatorIds: string[]
  /**
   * Chantier 25 — profils complets des modérateurs (mêmes ids que
   * `moderatorIds`). Nécessaires pour qu'un modérateur en surplus, replacé
   * comme participant ordinaire, compte correctement dans les seuils de sa
   * table, et pour l'afficher par son pseudo dans la sélection du superadmin.
   */
  moderators: AllocationMember[]
  /** false → règle 2 désactivée (aucune analyse des camps status='done'). */
  opinionsAvailable: boolean
  /** Chantier 92 — liens d'appairage réciproques, du plus ancien au plus récent. */
  pairs: [string, string][]
}

/**
 * Charge les entrées de l'algorithme d'allocation (G1).
 * Bypass de la RLS owner-only d'`entry_responses` via le mot de passe
 * superadmin. Ne retourne que les membres présentiels (§2 de la spec).
 */
export async function loadAllocationInputs(
  password: string,
  sessionId: string
): Promise<AllocationInputs> {
  const { data, error } = await supabase.rpc('get_allocation_inputs', {
    p_password: password,
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))

  const raw = (data ?? {}) as { members?: AllocationInputRow[]; opinions_available?: boolean }
  const rows = raw.members ?? []

  const toMember = (r: AllocationInputRow): AllocationMember => ({
    member_id:  r.member_id,
    pseudo:     r.pseudo,
    is_active:  r.is_active,
    consents:   r.consents,
    is_veteran: r.is_veteran,
    group_id:   r.group_id,
  })
  const moderators = rows.filter(r => r.is_moderator).map(toMember)

  return {
    members:           rows.filter(r => !r.is_moderator).map(toMember),
    moderatorIds:      moderators.map(m => m.member_id),
    moderators,
    opinionsAvailable: raw.opinions_available === true,
    pairs:             await getSessionPairingsAdmin(password, sessionId),
  }
}

// ── Chantier 92 — appairage entre participants ──────────────

export interface PairingResult {
  pseudo: string
  /** Un membre de la séance porte ce pseudo. */
  found: boolean
  /** La personne citée m'a cité aussi — seul un lien réciproque compte pour l'allocation. */
  reciprocal: boolean
}

/**
 * Remplace mes binômes (0 à 2 pseudos). Si l'allocation est déjà faite et que
 * je n'ai pas de table, je suis rattaché à celle d'une personne citée
 * réciproquement (`placedTableNumber`).
 */
export async function setMyPairings(
  sessionId: string,
  pseudos: string[],
): Promise<{ results: PairingResult[]; placedTableNumber: number | null }> {
  const { data, error } = await supabase.rpc('set_my_pairings', {
    p_session_id: sessionId,
    p_pseudos:    pseudos,
  })
  if (error) throw new Error(extractErr(error))
  const raw = (data ?? {}) as { results?: PairingResult[]; placed_table_number?: number | null }
  return { results: raw.results ?? [], placedTableNumber: raw.placed_table_number ?? null }
}

export async function getMyPairings(sessionId: string): Promise<{ pseudo: string; reciprocal: boolean }[]> {
  const { data, error } = await supabase.rpc('get_my_pairings', { p_session_id: sessionId })
  if (error) throw new Error(extractErr(error))
  return (data ?? []) as { pseudo: string; reciprocal: boolean }[]
}

export async function getSessionPairingsAdmin(password: string, sessionId: string): Promise<[string, string][]> {
  const { data, error } = await supabase.rpc('get_session_pairings_admin', {
    p_password:   password,
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))
  return ((data ?? []) as { a: string; b: string }[]).map(r => [r.a, r.b])
}

export interface ApplyAllocationResult {
  table_count: number
  member_count: number
  tables_created: number
  tables_reused: number
  /** Chantier 25 (H18) — tables reliquats détachées de la séance. */
  tables_detached?: number
  /** Reliquats conservés car des participants les ont déjà rejointes. */
  tables_orphaned?: number
}

/**
 * Persiste le résultat de l'allocation : crée/réutilise les tables physiques,
 * remplace `table_assignments`, passe la séance en phase `allocating`.
 */
export async function applyAllocation(
  password: string,
  sessionId: string,
  result: Pick<AllocationResult, 'tables'>
): Promise<ApplyAllocationResult> {
  const { data, error } = await supabase.rpc('apply_allocation', {
    p_password: password,
    p_session_id: sessionId,
    p_tables: result.tables,
  })
  if (error) throw new Error(extractErr(error))
  return data as ApplyAllocationResult
}

/**
 * G2 — crée N tables vides rattachées à la séance. Un booléen `leaderless`
 * par table. Utilisée hors allocation (pré-création manuelle) ; l'allocation
 * elle-même passe par `applyAllocation`, qui crée ce qui manque.
 */
export async function createTablesBatch(
  password: string,
  sessionId: string,
  leaderless: boolean[]
): Promise<{ table_id: string; join_code: string; leaderless: boolean }[]> {
  const { data, error } = await supabase.rpc('create_tables_batch', {
    p_password: password,
    p_session_id: sessionId,
    p_leaderless: leaderless,
  })
  if (error) throw new Error(extractErr(error))
  return (data as { table_id: string; join_code: string; leaderless: boolean }[]) ?? []
}

/**
 * Chantier 33 — assigne manuellement un membre comme modérateur d'une table
 * précise (superadmin) : pose `is_moderator = true` et (dé)place sa ligne
 * `table_assignments` sur cette table. Pour retirer un modérateur d'une
 * table, réutiliser `setMemberModerator(..., false)` — il redevient un
 * participant ordinaire, toujours assis à la même table.
 */
export async function assignModeratorToTable(
  password: string,
  sessionId: string,
  tableNumber: number,
  memberId: string,
): Promise<void> {
  const { error } = await supabase.rpc('assign_moderator_to_table', {
    p_password: password,
    p_session_id: sessionId,
    p_table_number: tableNumber,
    p_member_id: memberId,
  })
  if (error) throw new Error(extractErr(error))
}

export interface PendingModeratorPlacement {
  member_id: string
  pseudo: string
  table_number: number
  table_id: string
}

export interface AssignPendingModeratorsResult {
  placements: PendingModeratorPlacement[]
  unplaced_moderators: { member_id: string; pseudo: string }[]
  tables_without_moderator: { table_number: number }[]
}

/**
 * Chantier 109 — contrepartie du 107 : place chaque modérateur « en attente »
 * (drapeau `is_moderator=true`, pas en exercice — `active_moderator_member_id`
 * du chantier 106) sur une table animée sans modérateur en exercice, par
 * numéro de table croissant. `apply = false` (défaut) calcule le placement
 * SANS écrire — récapitulatif de confirmation avant le geste réel,
 * `apply = true` rejoue le même calcul et l'applique. Les deux appels
 * renvoient la même forme tant que rien n'a changé entre-temps.
 */
export async function assignPendingModerators(
  password: string,
  sessionId: string,
  apply: boolean = false,
): Promise<AssignPendingModeratorsResult> {
  const { data, error } = await supabase.rpc('assign_pending_moderators', {
    p_password: password,
    p_session_id: sessionId,
    p_apply: apply,
  })
  if (error) throw new Error(extractErr(error))
  return data as AssignPendingModeratorsResult
}

/** G4 — marque/démarque un membre comme modérateur de cette séance. */
export async function setMemberModerator(
  password: string,
  sessionId: string,
  memberId: string,
  isModerator: boolean
): Promise<SessionMember> {
  const { data, error } = await supabase.rpc('set_member_moderator', {
    p_password: password,
    p_session_id: sessionId,
    p_member_id: memberId,
    p_is_moderator: isModerator,
  })
  if (error) throw new Error(extractErr(error))
  return data as SessionMember
}

/**
 * G4/H4 — auto-déclaration de statut modérateur via le mot de passe Ecclesia.
 * Si l'appareil n'a pas encore de profil pour cette séance (n'a jamais voté/
 * inscrit), `pseudo` sert à en créer un à la volée ; sinon le profil existant
 * est simplement marqué is_moderator=true et `pseudo` est ignoré côté serveur.
 * Chantier 67 : `attending_in_person` suit la même règle que
 * `register_session_member` (false uniquement en `pre_voting`).
 * Chantier 93 : le code de rappel est tiré EN BASE quand cette RPC crée le
 * profil, et revient dans `new_reclaim_code` — plus rien n'est généré côté
 * client.
 */
export async function claimModeratorStatus(
  sessionId: string,
  creationCode: string,
  pseudo?: string
): Promise<SessionMember> {
  const { data, error } = await supabase.rpc('claim_moderator_status', {
    p_session_id: sessionId,
    p_creation_code: creationCode,
    p_pseudo: pseudo ?? null,
  })
  if (error) throw new Error(extractErr(error))
  return data as SessionMember
}

/**
 * Chantier 73 — variante non-levante de `claimModeratorStatus`, pour les
 * formulaires d'inscription (PseudoForm, VotingEntryForm, AttendanceConfirmScreen) :
 * un mot de passe invalide ne doit jamais faire échouer l'inscription elle-même,
 * seulement la déclaration modérateur qui la suit.
 */
export async function tryClaimModeratorStatus(
  sessionId: string,
  creationCode: string,
  pseudo: string
): Promise<{ member: SessionMember | null; error: string | null }> {
  try {
    const member = await claimModeratorStatus(sessionId, creationCode, pseudo)
    return { member, error: null }
  } catch (err) {
    return { member: null, error: err instanceof Error ? err.message : 'Erreur inattendue' }
  }
}

/**
 * Chantier 68 — un modérateur en retard prend en charge une table encore
 * sans modérateur, en saisissant son code. Refusé côté serveur si le Code
 * Ecclesia est invalide, si `sessionId` est fourni et ne correspond pas à la
 * séance de cette table, ou si la table a déjà un modérateur (créateur
 * physique assis, ou modérateur Bloc C désigné assis à cette table précise).
 * `sessionId` est optionnel : `SessionRouterScreen` le connaît (état
 * `debating_no_member`) et bénéficie donc aussi du refus "code d'une autre
 * séance" ; `JoinTableScreen`/`EntryScreen` n'ont aucune séance en contexte
 * (rejoindre une table par simple code) et l'omettent.
 * Distinct de `reclaim_moderator`, qui reste le chemin de VRAIE reprise de
 * main par le modérateur déjà en place sur cette table précise.
 */
export async function claimTableAsModerator(
  joinCode: string,
  creationCode: string,
  pseudo: string,
  sessionId?: string
): Promise<TableResult> {
  const { data, error } = await supabase.rpc('claim_table_as_moderator', {
    p_join_code: joinCode,
    p_creation_code: creationCode,
    p_pseudo: pseudo,
    p_session_id: sessionId ?? null,
  })
  if (error) throw new Error(extractErr(error))
  return data as TableResult
}

/**
 * Chantier 111 — « Assignez-moi une table » : un retardataire en phase
 * `debating`, jamais passé par le vote, n'a aucun code de table à taper.
 * Inscrit l'appelant en `session_members` s'il ne l'est pas déjà (avec un
 * vrai code de rappel, retourné une seule fois dans `new_reclaim_code`,
 * comme `registerSessionMember`), puis le place sur la table ANIMÉE la
 * moins remplie de la séance (déterministe — cf. `assign_least_filled_table`
 * en base).
 */
export async function assignLeastFilledTable(
  sessionId: string,
  pseudo: string
): Promise<TableResult & { new_reclaim_code: string | null }> {
  const { data, error } = await supabase.rpc('assign_least_filled_table', {
    p_session_id: sessionId,
    p_pseudo: pseudo,
  })
  if (error) throw new Error(extractErr(error))
  return data as TableResult & { new_reclaim_code: string | null }
}

/**
 * Chantier 134 — entrée d'un participant dans un débat simple
 * (`sessions.session_type = 'debate'`, phase `debating`). Inscription à la
 * séance si besoin (code de rappel renvoyé une seule fois), place à table
 * (celle où il est déjà assis, sinon la moins remplie) et, si le Code
 * Ecclesia est fourni, prise de l'animation d'une table sans modérateur.
 * Atomique côté serveur : une erreur n'inscrit personne à moitié.
 */
export async function joinSimpleDebate(
  sessionId: string,
  pseudo: string,
  creationCode?: string,
): Promise<TableResult & { new_reclaim_code: string | null; is_moderator: boolean; pseudo: string }> {
  const { data, error } = await supabase.rpc('join_simple_debate', {
    p_session_id:    sessionId,
    p_pseudo:        pseudo,
    p_creation_code: creationCode ?? null,
  })
  if (error) throw new Error(extractErr(error))
  const r = data as TableResult & { new_reclaim_code?: string | null; is_moderator?: boolean | null; pseudo?: string | null }
  return {
    ...r,
    new_reclaim_code: r.new_reclaim_code ?? null,
    is_moderator:     r.is_moderator === true,
    pseudo:           r.pseudo ?? pseudo,
  }
}

/**
 * Chantier 110 — depuis l'intérieur d'une table (bouton Outils « Je suis le
 * modérateur de cette table »), reprend l'autorité d'animation, Code
 * Ecclesia requis. Distinct de `claimTableAsModerator` : pas de join_code ni
 * de pseudo à saisir (l'appelant est déjà assis à la table, seule preuve
 * d'identité utile ici), et réussit MÊME si un modérateur est déjà en place
 * — c'est un transfert volontaire assumé, pas une prise d'une table libre.
 */
export async function reclaimTableAsModerator(
  tableId: string,
  creationCode: string
): Promise<{ activeModeratorMemberId: string | null }> {
  const { data, error } = await supabase.rpc('reclaim_table_as_moderator', {
    p_table_id: tableId,
    p_creation_code: creationCode,
  })
  if (error) throw new Error(extractErr(error))
  const result = data as { table_id: string; active_moderator_member_id: string | null }
  return { activeModeratorMemberId: result.active_moderator_member_id }
}

// --- Admin wrappers (C2) ---

// Note (E2) : pas de member_pseudo / member_id — l'identité de l'auteur
// n'est jamais exposée au superadmin, cf. list_assertions_admin.
export interface AssertionAdmin {
  id: string
  session_id: string
  content: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

export interface SessionVotingStats {
  member_count: number
  attending_count: number
  remote_count: number
  onboarded_count: number
  voter_count: number
  approved_assertion_count: number
  total_votes: number
}

export async function listAssertionsAdmin(
  password: string,
  sessionId: string
): Promise<AssertionAdmin[]> {
  const { data, error } = await supabase.rpc('list_assertions_admin', {
    p_password: password,
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))
  return (data as AssertionAdmin[]) ?? []
}

export async function deleteAssertionsAdmin(
  password: string,
  sessionId: string,
  assertionIds: string[]
): Promise<number> {
  const { data, error } = await supabase.rpc('delete_assertions_admin', {
    p_password: password,
    p_session_id: sessionId,
    p_assertion_ids: assertionIds,
  })
  if (error) throw new Error(extractErr(error))
  return data as number
}

export async function getSessionVotingStats(
  password: string,
  sessionId: string
): Promise<SessionVotingStats> {
  const { data, error } = await supabase.rpc('get_session_voting_stats', {
    p_password: password,
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))
  return data as SessionVotingStats
}

export async function updateSessionConfig(
  password: string,
  sessionId: string,
  moderationPolicy: ModerationPolicy
): Promise<Session> {
  const { data, error } = await supabase.rpc('update_session_config', {
    p_password: password,
    p_session_id: sessionId,
    p_moderation_policy: moderationPolicy,
  })
  if (error) throw new Error(extractErr(error))
  return data as Session
}

export async function assignTableToGroup(
  password: string,
  sessionId: string,
  tableNumber: number,
  tableId: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('assign_table_to_group', {
    p_password:     password,
    p_session_id:   sessionId,
    p_table_number: tableNumber,
    p_table_id:     tableId,
  })
  if (error) throw new Error(extractErr(error))
}

export interface SessionMemberAdmin {
  id: string
  pseudo: string
  created_at: string
  joined_phase: string | null
  has_entry_response: boolean
  has_voted: boolean
  /** Chantier 19 (G4) — nécessite la migration 20260725_2_allocation_v2.sql. */
  attending_in_person?: boolean
  is_moderator?: boolean
}

export async function listSessionMembersAdmin(
  password: string,
  sessionId: string
): Promise<SessionMemberAdmin[]> {
  const { data, error } = await supabase.rpc('list_session_members_admin', {
    p_password: password,
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))
  return (data as SessionMemberAdmin[]) ?? []
}

export async function adminSubmitAssertion(
  password: string,
  sessionId: string,
  content: string
): Promise<Assertion> {
  const { data, error } = await supabase.rpc('admin_submit_assertion', {
    p_password: password,
    p_session_id: sessionId,
    p_content: content,
  })
  if (error) throw new Error(extractErr(error))
  return data as Assertion
}

// Chantier 7 / B4 — réécrit le contenu d'une assertion (formulation combinée).
// Nécessite la migration 20260722_update_assertion_content.sql déployée en base.
export async function updateAssertionContent(
  password: string,
  assertionId: string,
  content: string
): Promise<void> {
  const { error } = await supabase.rpc('update_assertion_content', {
    p_password: password,
    p_assertion_id: assertionId,
    p_content: content,
  })
  if (error) throw new Error(extractErr(error))
}

// ── Chantier 18 / F24 — fusion annulable ──────────────────────
// Remplace la séquence updateAssertionContent → mergeAssertionVotes →
// rejectAssertion : une seule RPC atomique qui enregistre au passage de
// quoi revenir en arrière (voir 20260728_chantier18_merge_undo.sql).

export interface AssertionMergeRecord {
  id:                  string
  keep_id:             string
  reject_id:           string
  keep_content_before: string
  keep_content_after:  string
  reject_content:      string
  reason:              string | null
  created_at:          string
  reverted_at:         string | null
}

export interface RevertMergeResult {
  content_restored: boolean
  votes_removed:    number
  votes_restored:   number
}

export async function applyAssertionMerge(
  password: string,
  keepId: string,
  rejectId: string,
  newContent?: string | null,
  reason?: string | null
): Promise<string> {
  const { data, error } = await supabase.rpc('apply_assertion_merge', {
    p_password:    password,
    p_keep_id:     keepId,
    p_reject_id:   rejectId,
    p_new_content: newContent ?? null,
    p_reason:      reason ?? null,
  })
  if (error) throw new Error(extractErr(error))
  return data as string
}

export async function revertAssertionMerge(
  password: string,
  mergeId: string
): Promise<RevertMergeResult> {
  const { data, error } = await supabase.rpc('revert_assertion_merge', {
    p_password: password,
    p_merge_id: mergeId,
  })
  if (error) throw new Error(extractErr(error))
  return data as RevertMergeResult
}

export async function listAssertionMerges(
  password: string,
  sessionId: string
): Promise<AssertionMergeRecord[]> {
  const { data, error } = await supabase.rpc('list_assertion_merges', {
    p_password:   password,
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))
  return (data ?? []) as AssertionMergeRecord[]
}

export async function getMyTableAssignment(
  sessionId: string
): Promise<AssignmentWithJoinCode | null> {
  const { data, error } = await supabase.rpc('get_my_table_assignment', {
    p_session_id: sessionId,
  })
  if (error) throw new Error(extractErr(error))
  if (!data) return null
  const raw = data as {
    id: string
    session_id: string
    member_id: string
    table_number: number
    table_id: string | null
    join_code: string | null
    created_at: string
  }
  return {
    id:           raw.id,
    session_id:   raw.session_id,
    member_id:    raw.member_id,
    table_number: raw.table_number,
    table_id:     raw.table_id,
    created_at:   raw.created_at,
    tables:       raw.join_code ? { join_code: raw.join_code } : null,
  }
}

export interface AssignmentWithJoinCode {
  id: string
  session_id: string
  member_id: string
  table_number: number
  table_id: string | null
  created_at: string
  tables: { join_code: string } | null
}

export async function moveMemberToGroup(
  password: string,
  sessionId: string,
  memberId: string,
  targetTableNumber: number,
): Promise<void> {
  const { error } = await supabase.rpc('move_member_to_group', {
    p_password:            password,
    p_session_id:          sessionId,
    p_member_id:           memberId,
    p_target_table_number: targetTableNumber,
  })
  if (error) throw new Error(extractErr(error))
}

/** Chantier 92 — déplace plusieurs membres (une grappe) vers la même table. */
export async function moveMembersToGroup(
  password: string,
  sessionId: string,
  memberIds: string[],
  targetTableNumber: number,
): Promise<void> {
  for (const id of memberIds) {
    await moveMemberToGroup(password, sessionId, id, targetTableNumber)
  }
}

// Re-export types for convenience
export type { SessionMember, EntryResponse, Assertion, AssertionVote, VoteResult, TableAssignment }

/**
 * Chantier 72, revue au chantier 118 — compte rendu de
 * `release_table_moderation`. Depuis le 118, la fonction ne retire plus
 * `session_members.is_moderator` (un modérateur retiré reste flagué, cf.
 * `released_active` ci-dessous) — `released_members` (nombre de démotions
 * is_moderator=false) a donc disparu du retour.
 */
export interface ReleaseTableModerationResult {
  /** `tables.created_by` pointait sur un modérateur physique, il a été libéré. */
  released_physical: boolean
  /** `tables.active_moderator_member_id` a été démis (le titulaire garde son drapeau, perd l'écran). */
  released_active: boolean
  /**
   * Le modérateur physique évincé a désormais une ligne `session_members`
   * flaguée `is_moderator = true` — soit déjà posée par
   * `claim_table_as_moderator` (chantier 119/118), soit créée à la volée ici
   * (rattrapage des lignes antérieures au chantier 119). `false` seulement
   * en cas de collision de pseudo (nom déjà pris par un autre membre).
   */
  physical_member_ensured: boolean
  /** Code de rappel émis si une ligne `session_members` a été créée à la volée. */
  new_reclaim_code: string | null
  /** État de `table_has_moderator` APRÈS libération — doit valoir `false`. */
  has_moderator: boolean
}

/**
 * Chantier 72, revue au chantier 118 — le superadmin libère la modération
 * d'une TABLE.
 *
 * `setMemberModerator(..., false)` part d'un membre et ne peut donc pas
 * atteindre un modérateur « physique » (table prise via
 * `designate_moderator` ou `claim_table_as_moderator`) : celui-ci n'apparaît
 * nulle part dans la carte de groupe tant qu'il n'anime aucune table Bloc C.
 * Tant que `tables.created_by` pointe sur lui et qu'il reste assis, la table
 * répond « déjà un modérateur » à toute tentative de reprise.
 *
 * Cette RPC coupe les deux branches de `table_has_moderator` d'un coup, et
 * garde le modérateur retiré flagué `is_moderator = true` (chantier 118 :
 * « modérateur en surplus » au sens du chantier 106, visible du superadmin)
 * plutôt que de le faire disparaître. Migration
 * `20260921_chantier118_physical_moderator_becomes_member.sql`.
 */
export async function releaseTableModeration(
  password: string,
  tableId: string,
): Promise<ReleaseTableModerationResult> {
  const { data, error } = await supabase.rpc('release_table_moderation', {
    p_password: password,
    p_table_id: tableId,
  })
  if (error) throw new Error(extractErr(error))
  return data as ReleaseTableModerationResult
}

/**
 * Chantier 123 — refait d'une table modérée une table SANS ANIMATEUR
 * (`tables.leaderless = true`), chemin symétrique des quatre chemins d'entrée
 * décrits dans `docs/reference-tables-leaderless.md`.
 *
 * Ne touche PAS à `session_members.is_moderator` : ce drapeau est un titre de
 * « modérateur potentiel » qui sert d'entrée à l'algorithme d'allocation. Le
 * retirer est un geste distinct (bouton « Retirer »), pour que le superadmin
 * voie ce qu'il change — sinon la capacité de modération baisse en silence et
 * le recalcul suivant produit une table animée en moins.
 */
export async function setTableLeaderless(
  password: string,
  tableId: string,
): Promise<{ table_id: string; leaderless: boolean; has_moderator: boolean }> {
  const { data, error } = await supabase.rpc('set_table_leaderless', {
    p_password: password,
    p_table_id: tableId,
  })
  if (error) throw new Error(extractErr(error))
  return data as { table_id: string; leaderless: boolean; has_moderator: boolean }
}
