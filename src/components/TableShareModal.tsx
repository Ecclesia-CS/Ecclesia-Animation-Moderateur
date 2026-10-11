import { useCallback, useEffect, useRef, useState } from 'react'
import { useTable } from '../context/TableContext'
import { useSessionOrganizationName } from '../lib/organizations'
import { getCollabIdentity, listSessionSources } from '../lib/sessions'
import { SHARE_TITLE_MAX, withHttps } from '../lib/tableShare'
import { checkImageFile, compressShareImage } from '../lib/shareImage'
import { extractErr, isSafeUrl } from '../lib/utils'
import type { CollabSource } from '../lib/types'

// Chantier 162a — fenêtre « Partager une source » : un lien collé avec un titre
// court, ou une de SES sources du document collaboratif. Pas de texte libre
// au-delà du titre (ce n'est pas un chat). Le modérateur voit la demande avant la
// table ; s'il partage lui-même, la source est affichée directement.
//
// Chantier 162b — « Une image » : capture choisie dans l'appareil (galerie
// comprise), glissée ou collée depuis le presse-papiers (Ctrl+V). Elle est réduite
// dans le navigateur avant l'envoi ; le modérateur la voit avant la table.
//
// Le choix « une de mes sources » n'apparaît que si la personne en a au moins
// une dans le document de cette séance, et jamais en séance d'association (pas
// de document collaboratif chez elles).

interface Props {
  onClose: () => void
}

type Mode = 'link' | 'image' | 'source'

export default function TableShareModal({ onClose }: Props) {
  const { table, isModerator, requestShare } = useTable()
  const orgName = useSessionOrganizationName(table.session_id)
  const [mode, setMode] = useState<Mode>('link')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [mySources, setMySources] = useState<CollabSource[]>([])
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  // Image préparée (déjà réduite) et son aperçu local.
  const [imageBlob, setImageBlob] = useState<Blob | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const sessionId = table.session_id
  const canUseSources = !!sessionId && !orgName && mySources.length > 0

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    ;(async () => {
      try {
        const identity = await getCollabIdentity(sessionId)
        if (!identity) return
        const all = await listSessionSources(sessionId)
        if (!cancelled) setMySources(all.filter(s => s.member_id === identity.member_id))
      } catch { /* sans source, il reste le lien collé */ }
    })()
    return () => { cancelled = true }
  }, [sessionId])

  // Séance d'association : les sources collaboratives n'existent pas, on reste sur le lien.
  const activeMode: Mode = mode === 'source' && !canUseSources ? 'link' : mode

  const prepareImage = useCallback(async (file: File | Blob) => {
    setErr(null)
    const problem = checkImageFile({ type: file.type, size: file.size })
    if (problem) { setErr(problem); return }
    setMode('image')
    setPreparing(true)
    try {
      const blob = await compressShareImage(file)
      setImageBlob(blob)
      setImagePreview(prev => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(blob)
      })
    } catch (e) {
      setImageBlob(null)
      setErr(e instanceof Error ? e.message : 'Cette image n’a pas pu être lue.')
    } finally {
      setPreparing(false)
    }
  }, [])

  // Ctrl+V d'une capture n'importe où dans la fenêtre (le collage de texte dans
  // les champs n'est pas touché : on n'agit que s'il y a une image).
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const item = Array.from(e.clipboardData?.items ?? []).find(i => i.kind === 'file' && i.type.startsWith('image/'))
      const file = item?.getAsFile()
      if (file) { e.preventDefault(); void prepareImage(file) }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [prepareImage])

  // Libère l'aperçu à la fermeture.
  useEffect(() => () => { if (imagePreview) URL.revokeObjectURL(imagePreview) }, [imagePreview])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    try {
      if (activeMode === 'link') {
        const cleanUrl = withHttps(url)
        if (!title.trim()) { setErr('Donne un titre à ce lien.'); return }
        if (!isSafeUrl(cleanUrl)) { setErr('Le lien doit commencer par http:// ou https://'); return }
        setBusy(true)
        await requestShare({ kind: 'link', title: title.trim(), url: cleanUrl })
      } else if (activeMode === 'image') {
        if (!imageBlob) { setErr('Choisis, glisse ou colle une image.'); return }
        if (!title.trim()) { setErr('Donne un titre à cette image.'); return }
        setBusy(true)
        await requestShare({ kind: 'image', title: title.trim(), blob: imageBlob })
      } else {
        if (!sourceId) { setErr('Choisis une source.'); return }
        setBusy(true)
        await requestShare({ kind: 'collab_source', sourceId })
      }
      setDone(true)
    } catch (e2) {
      setErr(extractErr(e2))
    } finally {
      setBusy(false)
    }
  }

  const tabClass = (m: Mode) =>
    `flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
      activeMode === m ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
    }`

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">Partager une source</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-gray-300"
            aria-label="Fermer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {done ? (
          <div className="px-5 py-6 space-y-4 text-center">
            <p className="text-sm text-gray-700">
              {isModerator
                ? 'La source est affichée à la table.'
                : 'Envoyé au modérateur : il décidera de la montrer à la table.'}
            </p>
            <button
              onClick={onClose}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
            >
              Fermer
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4 overflow-y-auto">
            <p className="text-xs text-gray-500 leading-relaxed">
              {isModerator
                ? 'Affiche une source à toute ta table.'
                : 'Le modérateur voit ta source avant tout le monde, puis choisit de la montrer à la table.'}
            </p>

            <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
              <button type="button" className={tabClass('link')} onClick={() => setMode('link')}>Un lien</button>
              <button type="button" className={tabClass('image')} onClick={() => setMode('image')}>Une image</button>
              {canUseSources && (
                <button type="button" className={tabClass('source')} onClick={() => setMode('source')}>Une source</button>
              )}
            </div>

            {activeMode === 'image' ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Titre</label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value.slice(0, SHARE_TITLE_MAX))}
                    maxLength={SHARE_TITLE_MAX}
                    placeholder="Ce que montre cette image"
                    className="w-full px-3 py-3 text-sm text-gray-900 bg-white border border-gray-300 rounded-xl
                      focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                      placeholder:text-gray-300"
                  />
                  <p className="mt-1 text-[11px] text-gray-400 text-right">{title.length}/{SHARE_TITLE_MAX}</p>
                </div>
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => {
                    e.preventDefault()
                    setDragOver(false)
                    const f = e.dataTransfer.files?.[0]
                    if (f) void prepareImage(f)
                  }}
                  className={`rounded-xl border-2 border-dashed p-4 text-center space-y-3 transition-colors ${
                    dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300'
                  }`}
                >
                  {preparing ? (
                    <p className="text-sm text-gray-500">Préparation de l'image…</p>
                  ) : imagePreview ? (
                    <img src={imagePreview} alt="Aperçu de la capture" className="mx-auto max-h-48 w-auto rounded-lg border border-gray-200" />
                  ) : (
                    <p className="text-xs text-gray-500 leading-relaxed">
                      Colle une capture (Ctrl+V), glisse une image ici, ou choisis-la dans ton appareil.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                  >
                    {imagePreview ? 'Choisir une autre image' : 'Choisir une image'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) void prepareImage(f)
                      e.target.value = ''
                    }}
                  />
                </div>
              </>
            ) : activeMode === 'link' ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Titre</label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value.slice(0, SHARE_TITLE_MAX))}
                    maxLength={SHARE_TITLE_MAX}
                    placeholder="Ce que montre ce lien"
                    className="w-full px-3 py-3 text-sm text-gray-900 bg-white border border-gray-300 rounded-xl
                      focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                      placeholder:text-gray-300"
                  />
                  <p className="mt-1 text-[11px] text-gray-400 text-right">{title.length}/{SHARE_TITLE_MAX}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Lien</label>
                  <input
                    type="text"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="https://…"
                    className="w-full px-3 py-3 text-sm text-gray-900 bg-white border border-gray-300 rounded-xl
                      focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                      placeholder:text-gray-300"
                  />
                </div>
              </>
            ) : (
              <ul className="space-y-2 max-h-64 overflow-y-auto">
                {mySources.map(s => (
                  <li key={s.id}>
                    <label className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
                      sourceId === s.id ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}>
                      <input
                        type="radio"
                        name="share-source"
                        checked={sourceId === s.id}
                        onChange={() => setSourceId(s.id)}
                        className="mt-1"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-900 break-words">{s.title}</span>
                        {s.url && <span className="block text-xs text-gray-400 truncate">{s.url}</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}

            {err && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{err}</div>
            )}

            <button
              type="submit"
              disabled={busy || preparing}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white
                text-sm font-medium rounded-xl transition-colors focus:outline-none focus:ring-2
                focus:ring-indigo-500 focus:ring-offset-2"
            >
              {busy ? 'Envoi…' : isModerator ? 'Montrer à la table' : 'Envoyer au modérateur'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
