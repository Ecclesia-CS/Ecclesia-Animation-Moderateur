import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

type ToastVariant = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
}

interface ToastContextValue {
  showToast(message: string, variant?: ToastVariant): void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'bg-emerald-600 text-white',
  error:   'bg-red-600 text-white',
  info:    'bg-gray-900 text-white',
}

const VARIANT_ICON: Record<ToastVariant, string> = {
  success: '✓',
  error:   '⚠️',
  info:    'ℹ️',
}

const DURATION_MS = 3000

/** Toasts globaux — chantier 88. Empilés en bas de l'écran, auto-dismiss après 3s. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const showToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = nextId.current++
    setToasts(prev => [...prev, { id, message, variant }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, DURATION_MS)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 inset-x-0 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto max-w-sm w-full sm:w-auto flex items-center gap-2 px-4 py-2.5
              rounded-xl shadow-lg text-sm font-medium animate-toast-in ${VARIANT_STYLES[t.variant]}`}
          >
            <span aria-hidden="true">{VARIANT_ICON[t.variant]}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/** À utiliser dans un composant descendant de ToastProvider (monté à la racine dans main.tsx). */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast doit être utilisé dans un ToastProvider')
  return ctx
}
