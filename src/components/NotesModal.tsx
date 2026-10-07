import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { extractErr } from '../lib/utils'
import FondQuadrille from './FondQuadrille'

interface Props {
  tableId?: string
  sessionId?: string
  onClose: () => void
}

const FONT_SIZES = [
  { label: 'Petit', value: '1' },
  { label: 'Normal', value: '3' },
  { label: 'Grand', value: '5' },
] as const

export default function NotesModal({ tableId, sessionId, onClose }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const userIdRef = useRef<string | null>(null)
  const noteIdRef = useRef<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [initialHtml, setInitialHtml] = useState<string | null>(null)

  // Load existing note on mount
  useEffect(() => {
    async function load() {
      // getSession() lit depuis le localStorage (pas de round-trip réseau)
      // → fiable dès le montage, contrairement à getUser() qui fait un appel serveur
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { setLoading(false); setSaveErr('Non connecté'); return }
      userIdRef.current = session.user.id

      const query = supabase
        .from('private_notes')
        .select('id, content')
        .eq('user_id', session.user.id)

      const { data } = sessionId
        ? await query.eq('session_id', sessionId).maybeSingle()
        : await query.eq('table_id', tableId!).maybeSingle()

      if (data) {
        noteIdRef.current = data.id
        setInitialHtml(data.content)
      }
      setLoading(false)
    }
    load()
  }, [tableId, sessionId])

  // Applique le contenu initial après que l'éditeur est dans le DOM
  // (editorRef.current est null pendant loading=true car le div est conditionnellement rendu)
  useEffect(() => {
    if (!loading && initialHtml !== null && editorRef.current) {
      editorRef.current.innerHTML = initialHtml
      editorRef.current.focus()
    }
  }, [loading, initialHtml])

  // Escape to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose])

  const saveNote = useCallback(async (html: string) => {
    const userId = userIdRef.current
    if (!userId) { setSaveErr('Session expirée : rechargez la page'); return }
    setSaving(true)
    setSaveErr(null)
    // INSERT/UPDATE explicites pour éviter les complications RLS du upsert ON CONFLICT
    let dbErr: unknown = null
    if (noteIdRef.current) {
      // Note existante → UPDATE par PK
      const { error } = await supabase
        .from('private_notes')
        .update({ content: html, updated_at: new Date().toISOString() })
        .eq('id', noteIdRef.current)
      dbErr = error
    } else {
      // Première sauvegarde → INSERT
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row: any = {
        user_id:    userId,
        content:    html,
        updated_at: new Date().toISOString(),
        session_id: sessionId ?? null,
        table_id:   sessionId ? null : (tableId ?? null),
      }
      const { data: newNote, error } = await supabase
        .from('private_notes')
        .insert(row)
        .select('id')
        .single()
      dbErr = error
      if (!error && newNote) noteIdRef.current = newNote.id
    }
    if (dbErr) setSaveErr(extractErr(dbErr))
    setSaving(false)
  }, [tableId, sessionId])

  function handleInput(e: React.FormEvent<HTMLDivElement>) {
    const html = (e.target as HTMLDivElement).innerHTML
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = undefined
      saveNote(html)
    }, 800)
  }

  // Vide le debounce en attente (sauvegarde immédiate) avant de fermer — sans ça, fermer puis
  // rouvrir juste après une frappe recharge la base avant que l'écriture différée n'ait abouti
  // et la note paraît perdue (course entre le debounce de saveNote et le rechargement au montage).
  async function handleClose() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = undefined
      const html = editorRef.current?.innerHTML
      if (html !== undefined) await saveNote(html)
    }
    onClose()
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
      className="fixed inset-0 bg-bleu-fonce/60 flex items-end sm:items-center justify-center z-50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div className="bg-white w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden rounded-[12px] animate-entree">

        {/* Header */}
        <div className="relative flex items-center justify-between overflow-hidden bg-bleu-fonce px-6 py-4 flex-shrink-0">
          <FondQuadrille cases={2} />
          <div className="relative flex items-baseline gap-3">
            <h2 className="font-serif text-xl font-semibold text-creme">Mes notes</h2>
            {saving && <span className="text-xs text-creme/70">Enregistrement…</span>}
            {saveErr && <span className="text-xs text-red-200">Erreur : {saveErr}</span>}
          </div>
          <button
            onClick={handleClose}
            className="relative text-creme/70 hover:text-creme transition-colors focus:outline-none
              focus-visible:ring-2 focus-visible:ring-bleu-clair -m-1.5 p-2"
            aria-label="Fermer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-bleu-fonce/10 bg-gray-50 flex-shrink-0 flex-wrap">
          <button
            onMouseDown={(e) => { e.preventDefault(); execCmd('bold') }}
            className="w-8 h-8 flex items-center justify-center text-sm font-bold
              text-gray-700 hover:bg-indigo-50 hover:text-bleu-fonce transition-colors"
            title="Gras (Ctrl+B)"
          >B</button>
          <button
            onMouseDown={(e) => { e.preventDefault(); execCmd('italic') }}
            className="w-8 h-8 flex items-center justify-center text-sm italic
              text-gray-700 hover:bg-indigo-50 hover:text-bleu-fonce transition-colors"
            title="Italique (Ctrl+I)"
          >I</button>
          <button
            onMouseDown={(e) => { e.preventDefault(); execCmd('underline') }}
            className="w-8 h-8 flex items-center justify-center text-sm underline
              text-gray-700 hover:bg-indigo-50 hover:text-bleu-fonce transition-colors"
            title="Souligné (Ctrl+U)"
          >S</button>
          <button
            onMouseDown={(e) => { e.preventDefault(); execCmd('strikeThrough') }}
            className="w-8 h-8 flex items-center justify-center text-sm line-through
              text-gray-700 hover:bg-indigo-50 hover:text-bleu-fonce transition-colors"
            title="Barré"
          >S</button>
          <div className="w-px h-5 bg-bleu-fonce/15 mx-1" />
          {FONT_SIZES.map(({ label, value }) => (
            <button
              key={value}
              onMouseDown={(e) => { e.preventDefault(); execCmd('fontSize', value) }}
              className="px-2 h-8 flex items-center justify-center
                text-gray-700 hover:bg-indigo-50 hover:text-bleu-fonce transition-colors whitespace-nowrap"
              title={`Taille ${label}`}
              style={{ fontSize: value === '1' ? '11px' : value === '3' ? '13px' : '16px' }}
            >{label}</button>
          ))}
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
              Chargement…
            </div>
          ) : (
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              className="min-h-[200px] text-sm leading-relaxed text-anthracite focus:outline-none"
              style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              data-placeholder="Commencez à écrire vos notes…"
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-bleu-fonce/10 flex-shrink-0">
          <p className="text-xs text-gray-500">
            Notes privées, visibles uniquement par vous. Sauvegarde automatique.
          </p>
        </div>
      </div>

      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #898a8c;
          pointer-events: none;
        }
      `}</style>
    </div>
  )
}
