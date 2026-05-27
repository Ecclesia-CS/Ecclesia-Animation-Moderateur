import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { extractErr } from '../lib/utils'

interface Props {
  tableId: string
  onClose: () => void
}

const FONT_SIZES = [
  { label: 'Petit', value: '1' },
  { label: 'Normal', value: '3' },
  { label: 'Grand', value: '5' },
] as const

export default function NotesModal({ tableId, onClose }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const userIdRef = useRef<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  // Load existing note on mount
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      userIdRef.current = user.id

      const { data } = await supabase
        .from('private_notes')
        .select('content')
        .eq('table_id', tableId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (data && editorRef.current) {
        editorRef.current.innerHTML = data.content
      }
      setLoading(false)
      editorRef.current?.focus()
    }
    load()
  }, [tableId])

  // Escape to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const saveNote = useCallback(async (html: string) => {
    const userId = userIdRef.current
    if (!userId) return
    setSaving(true)
    setSaveErr(null)
    const { error: dbErr } = await supabase.from('private_notes').upsert(
      { table_id: tableId, user_id: userId, content: html, updated_at: new Date().toISOString() },
      { onConflict: 'table_id,user_id' }
    )
    if (dbErr) setSaveErr(extractErr(dbErr))
    setSaving(false)
  }, [tableId])

  function handleInput(e: React.FormEvent<HTMLDivElement>) {
    const html = (e.target as HTMLDivElement).innerHTML
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => saveNote(html), 800)
  }

  function execCmd(cmd: string, value?: string) {
    document.execCommand(cmd, false, value)
    editorRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') { e.preventDefault(); execCmd('bold') }
      if (e.key === 'i') { e.preventDefault(); execCmd('italic') }
      if (e.key === 'u') { e.preventDefault(); execCmd('underline') }
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900">Mes notes</h2>
            {saving && <span className="text-xs text-gray-400">Enregistrement…</span>}
            {saveErr && <span className="text-xs text-red-500">Erreur : {saveErr}</span>}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors focus:outline-none
              focus:ring-2 focus:ring-gray-300 rounded-lg p-1"
            aria-label="Fermer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-100 flex-shrink-0 flex-wrap">
          <button
            onMouseDown={(e) => { e.preventDefault(); execCmd('bold') }}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold
              text-gray-600 hover:bg-gray-100 transition-colors"
            title="Gras (Ctrl+B)"
          >B</button>
          <button
            onMouseDown={(e) => { e.preventDefault(); execCmd('italic') }}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-sm italic
              text-gray-600 hover:bg-gray-100 transition-colors"
            title="Italique (Ctrl+I)"
          >I</button>
          <button
            onMouseDown={(e) => { e.preventDefault(); execCmd('underline') }}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-sm underline
              text-gray-600 hover:bg-gray-100 transition-colors"
            title="Souligné (Ctrl+U)"
          >S</button>
          <button
            onMouseDown={(e) => { e.preventDefault(); execCmd('strikeThrough') }}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-sm line-through
              text-gray-600 hover:bg-gray-100 transition-colors"
            title="Barré"
          >S</button>
          <div className="w-px h-5 bg-gray-200 mx-1" />
          {FONT_SIZES.map(({ label, value }) => (
            <button
              key={value}
              onMouseDown={(e) => { e.preventDefault(); execCmd('fontSize', value) }}
              className="px-2 h-8 flex items-center justify-center rounded-lg
                text-gray-600 hover:bg-gray-100 transition-colors whitespace-nowrap"
              title={`Taille ${label}`}
              style={{ fontSize: value === '1' ? '11px' : value === '3' ? '13px' : '16px' }}
            >{label}</button>
          ))}
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
              Chargement…
            </div>
          ) : (
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              className="min-h-[200px] text-sm text-gray-800 focus:outline-none"
              style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              data-placeholder="Commencez à écrire vos notes…"
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 flex-shrink-0">
          <p className="text-xs text-gray-400">
            Notes privées — visibles uniquement par vous. Sauvegarde automatique.
          </p>
        </div>
      </div>

      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
      `}</style>
    </div>
  )
}
