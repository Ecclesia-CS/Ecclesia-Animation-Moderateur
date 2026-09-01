export type ModerationPolicy = 'open' | 'closed' | 'ai'

export interface ModerationResult {
  id: string
  action: 'approve' | 'reject'
}

export interface MergeResult {
  keep_id: string
  reject_ids: string[]
  reason: string
  // Formulation combinée proposée par Gemini (chantier 7 / B4) : une assertion
  // unique qui réunit les deux originales. Optionnelle — absente sur les anciens
  // appels ou si Gemini n'en fournit pas.
  merged_content?: string
}

export interface GroupNameResult {
  table_number: number
  name: string
  description: string
}

export interface Session {
  id: string
  title: string
  description: string | null
  scheduled_at: string | null
  join_code: string | null
  phase: 'draft' | 'pre_voting' | 'voting' | 'allocating' | 'debating' | 'closed'
  created_at: string
  doc_info_url: string | null
  doc_summary_url: string | null
  doc_collab_url: string | null
  moderation_policy: ModerationPolicy
  phase_changed_at: string | null
  group_names?: GroupNameResult[] | null
}

export interface Table {
  id: string
  join_code: string
  created_by: string
  current_speaker_id: string | null
  current_turn_started_at: string | null
  created_at: string
  session_id: string | null
  leaderless: boolean
  questionnaire_forced_at: string | null
}

export interface Participant {
  id: string
  table_id: string
  user_id: string
  pseudo: string
  created_at: string
}

export interface QueueEntry {
  id: string
  table_id: string
  participant_id: string
  queue_type: 'long' | 'interactive'
  position: number
  created_at: string
}

export interface SpeakingTurn {
  id: string
  table_id: string
  participant_id: string
  started_at: string
  ended_at: string | null
  source: 'long' | 'interactive' | 'manual'
}

export interface QuestionnaireResponse {
  id: string
  table_id: string | null
  session_id: string | null
  user_id: string
  theme_ideas: string | null
  theme_ratings: Record<string, number>
  debate_attended: string | null
  debate_rating: number | null
  staff_interest: string | null
  feedback: string | null
  created_at: string
}

export interface CollabSource {
  id: string
  session_id: string
  user_id: string
  pseudo: string
  title: string
  url: string | null
  content: string | null
  created_at: string
  updated_at: string
  table_join_code: string | null
}

export interface PrivateNote {
  id: string
  table_id: string
  user_id: string
  content: string
  updated_at: string
}

// --- Bloc C : phase de vote ---

export interface SessionMember {
  id: string
  session_id: string
  user_id: string
  pseudo: string
  created_at: string
  joined_phase?: string | null
  attending_in_person: boolean
  /**
   * Chantier 19 (G4) — « je suis modérateur POUR CETTE séance ».
   * Critère dur de l'allocation v2 (détermine le nombre de tables animées).
   * À ne pas confondre avec `staff_interest` du questionnaire de fin de
   * séance, qui reste un signal de recrutement pour les séances futures.
   */
  is_moderator?: boolean
}

/** Chantier 19 (G3) — onboarding réduit à 3 questions. */
export interface EntryResponse {
  id: string
  session_id: string
  member_id: string
  /** Règle 2 — table enregistrable. */
  consent_transcript: boolean
  /** Règle 1 — assez de participants actifs. */
  participation_style: 'listener' | 'active'
  /** Règles 4 et 5 — « As-tu déjà fait un débat Ecclesia ? » (binaire). */
  ecclesia_experience: boolean | null
  created_at: string
}

export interface Assertion {
  id: string
  session_id: string
  member_id: string
  content: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

export interface AssertionVote {
  id: string
  assertion_id: string
  session_id: string
  member_id: string
  vote: 'agree' | 'disagree' | 'pass'
  created_at: string
}

export interface VoteResult {
  id: string
  content: string
  status: 'approved'
  agree_count: number
  disagree_count: number
  pass_count: number
  total_votes: number
  consensus_score: number | null
}

export interface TableAssignment {
  id: string
  session_id: string
  member_id: string
  table_number: number
  table_id: string | null
  created_at: string
}

// Chantier 19 (G5) — `ModeratorResponses` / `ModeratorTableDemand` supprimés
// avec get_moderator_responses et le panneau « Réponses modérateur » : le
// besoin d'encadrement est désormais traité par la règle 5 de l'allocation v2.

// Chantier 20 (G7) — vue modérateur : composition idéologique de sa table.
export interface TableOpinionCamp {
  group_id: number
  count: number
  /** Nom Gemini best-effort — voir limite documentée dans la migration
   * 20260727_1 (table_number physique ≠ camp d'opinion pur sous l'allocation v2). */
  name: string | null
  description: string | null
  top_assertions: { content: string; score: number }[]
}

export interface TableOpinionSummary {
  session_id: string
  table_number: number | null
  opinions_available: boolean
  camps: TableOpinionCamp[]
  /** Assertions clivantes/consensuelles calculées sur les votes de CETTE table uniquement. */
  votes: VoteResult[]
}

/** Ligne retournée par get_questionnaire_responses (export superadmin) */
export interface QuestionnaireExportRow {
  id: string
  created_at: string
  session_id: string | null
  session_title: string | null
  table_id: string | null
  table_join_code: string | null
  pseudo: string | null
  debate_attended: string | null
  debate_rating: number | null
  theme_ideas: string | null
  theme_ratings: Record<string, number>
  staff_interest: string | null
  feedback: string | null
}
