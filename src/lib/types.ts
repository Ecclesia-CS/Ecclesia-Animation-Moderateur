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
  phase: 'draft' | 'pre_voting' | 'voting' | 'allocating' | 'debating' | 'questionnaire' | 'closed'
  created_at: string
  doc_info_url: string | null
  doc_summary_url: string | null
  doc_collab_url: string | null
  moderation_policy: ModerationPolicy
  vote_timer_minutes: number | null
  vote_threshold_percent: number | null
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
}

export interface EntryResponse {
  id: string
  session_id: string
  member_id: string
  consent_transcript: boolean
  group_size_pref: 'small' | 'medium' | 'large'
  moderator_pref: boolean
  openness_to_diff: number
  participation_style: 'listener' | 'active'
  ecclesia_experience: 'never' | 'once_twice' | 'several_times' | null
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

/** Retour de get_moderator_responses (E4 — chantier 5) */
export interface ModeratorResponses {
  aggregate: {
    want_count: number
    dont_want_count: number
    onboarded_count: number
    attending_count: number
  }
  per_table: ModeratorTableDemand[]
}

/** Demande de modérateur pour une table allouée (E4 / B2) */
export interface ModeratorTableDemand {
  table_number: number
  member_count: number
  want_count: number
  no_answer_count: number
  table_leaderless: boolean | null
  join_code: string | null
}

/** Ligne retournée par get_questionnaire_responses (export superadmin) */
export interface QuestionnaireExportRow {
  id: string
  created_at: string
  session_id: string | null
  session_title: string | null
  table_id: string | null
  table_join_code: string | null
  debate_attended: string | null
  debate_rating: number | null
  theme_ideas: string | null
  theme_ratings: Record<string, number>
  staff_interest: string | null
  feedback: string | null
}
