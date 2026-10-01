import { useState } from 'react'

function Eye() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

function EyeOff() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

/** Champ mot de passe avec bouton "œil" pour afficher/masquer la saisie. */
export default function PasswordInput({
  value, onChange, placeholder, required = true, className, autoFocus,
}: {
  value: string
  onChange(v: string): void
  placeholder?: string
  required?: boolean
  className?: string
  autoFocus?: boolean
}) {
  const [showPwd, setShowPwd] = useState(false)

  return (
    <div className="relative">
      <input
        type={showPwd ? 'text' : 'password'}
        required={required}
        autoFocus={autoFocus}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={className ?? `w-full px-3 py-3 pr-10 text-sm border border-gray-300 rounded-xl
          focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
          placeholder:text-gray-300 transition-shadow`}
      />
      <button
        type="button"
        onClick={() => setShowPwd(v => !v)}
        tabIndex={-1}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
      >
        {showPwd ? <EyeOff /> : <Eye />}
      </button>
    </div>
  )
}
