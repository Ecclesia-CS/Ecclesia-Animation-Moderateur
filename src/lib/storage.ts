const KEY = 'ecclesia_table'
const LEGACY_KEY = 'ecclesia_session'

export interface StoredTable {
  tableId: string
  participantId: string
  joinCode: string
  isModerator: boolean
  pseudo?: string
}

const NAME_KEY = 'ecclesia_last_name'

/** Dernier nom/prénom saisi par le participant — préremplit les formulaires d'identité suivants (D7). */
export const lastNameStore = {
  get(): string {
    try {
      return localStorage.getItem(NAME_KEY) ?? ''
    } catch {
      return ''
    }
  },
  set(name: string): void {
    try {
      if (name.trim()) localStorage.setItem(NAME_KEY, name.trim())
    } catch {
      // ignore
    }
  },
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
