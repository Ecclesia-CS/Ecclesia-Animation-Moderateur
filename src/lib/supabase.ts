import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    heartbeatIntervalMs: 15000,
    reconnectAfterMs: (tries: number) =>
      ([500, 1000, 2000, 5000] as const)[Math.min(tries - 1, 3)],
  },
})

export async function signInAnonymously() {
  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  return data
}

// Shape returned by create_table and join_table (no hashes)
export type TableResult = {
  id: string
  join_code: string
  created_by: string
  current_speaker_id: string | null
  current_turn_started_at: string | null
  created_at: string
  session_id: string | null
  questionnaire_forced_at: string | null
  participant_id: string
}
