const KEY = 'ecclesia_session'

export interface StoredSession {
  sessionId: string
  participantId: string
  joinCode: string
  isModerator: boolean
  pseudo?: string
}

export const sessionStore = {
  get(): StoredSession | null {
    try {
      const raw = localStorage.getItem(KEY)
      return raw ? (JSON.parse(raw) as StoredSession) : null
    } catch {
      return null
    }
  },
  set(data: StoredSession): void {
    localStorage.setItem(KEY, JSON.stringify(data))
  },
  clear(): void {
    localStorage.removeItem(KEY)
  },
}
