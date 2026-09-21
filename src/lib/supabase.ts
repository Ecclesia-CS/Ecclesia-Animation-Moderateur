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
  /**
   * Chantier 119 — présent uniquement quand cet appel a créé la ligne
   * `session_members` (première inscription à la séance, quelle que soit la
   * phase) : `join_table`/`switch_table`/`create_table`/`claim_table_as_moderator`
   * le retournent via `sync_table_assignment`. Absent/`null` si le membre
   * existait déjà (ex. changer de table en cours de séance).
   */
  new_reclaim_code?: string | null
  /**
   * Chantier 120 — présent (`true`) quand `sync_table_assignment` a trouvé un
   * membre déjà inscrit sous ce pseudo, pour un `user_id` différent (jeton
   * anonyme renouvelé). Rien n'a été créé ni modifié côté `session_members`/
   * `table_assignments` : le client doit passer par `confirmAttendance`
   * (pseudo + code) avant de rappeler `join_table`. Absent/`null` sinon.
   */
  reconnect_required?: boolean
}
