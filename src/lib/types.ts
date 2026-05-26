export interface Session {
  id: string
  title: string
  description: string | null
  scheduled_at: string | null
  join_code: string | null
  phase: 'draft' | 'voting' | 'allocating' | 'debating' | 'questionnaire' | 'closed'
  created_at: string
}

export interface Table {
  id: string
  join_code: string
  created_by: string
  current_speaker_id: string | null
  current_turn_started_at: string | null
  created_at: string
  session_id: string | null
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
