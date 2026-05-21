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

// Shape returned by create_session and join_session (no hashes)
export type SessionResult = {
  id: string
  join_code: string
  created_by: string
  current_speaker_id: string | null
  current_turn_started_at: string | null
  created_at: string
  participant_id: string
}
