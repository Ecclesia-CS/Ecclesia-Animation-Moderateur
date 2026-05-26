const KEY = 'ecclesia_table'
const LEGACY_KEY = 'ecclesia_session'

export interface StoredTable {
  tableId: string
  participantId: string
  joinCode: string
  isModerator: boolean
  pseudo?: string
}

export const tableStore = {
  get(): StoredTable | null {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) return JSON.parse(raw) as StoredTable
      // Migration depuis l'ancienne clé (refactor B0) — évite de déconnecter les utilisateurs existants
      const legacyRaw = localStorage.getItem(LEGACY_KEY)
      if (!legacyRaw) return null
      const legacy = JSON.parse(legacyRaw) as {
        sessionId: string
        participantId: string
        joinCode: string
        isModerator: boolean
        pseudo?: string
      }
      const migrated: StoredTable = {
        tableId:       legacy.sessionId,
        participantId: legacy.participantId,
        joinCode:      legacy.joinCode,
        isModerator:   legacy.isModerator,
        pseudo:        legacy.pseudo,
      }
      localStorage.setItem(KEY, JSON.stringify(migrated))
      localStorage.removeItem(LEGACY_KEY)
      return migrated
    } catch {
      return null
    }
  },
  set(data: StoredTable): void {
    localStorage.setItem(KEY, JSON.stringify(data))
  },
  clear(): void {
    localStorage.removeItem(KEY)
    localStorage.removeItem(LEGACY_KEY)
  },
}
