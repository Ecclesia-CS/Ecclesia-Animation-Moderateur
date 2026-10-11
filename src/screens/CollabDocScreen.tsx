import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { privateChannel } from '../lib/realtime'
import { extractErr, isSafeUrl } from '../lib/utils'
import {
  getCollabIdentity,
  claimCollabIdentity,
  addCollabSource,
  updateCollabSource,
  deleteCollabSource,
  listSessionSources,
} from '../lib/sessions'
import { listSessionShares } from '../lib/tableShare'
import type { CollabSource, Session, SessionShare } from '../lib/types'
import type { CollabIdentity } from '../lib/sessions'
import ConfirmModal from '../components/ConfirmModal'
import ReclaimCodeAccordion from '../components/ReclaimCodeAccordion'
import PageParcours, { BOUTON_VERRE_PARCOURS, CARTE_PARCOURS } from '../components/PageParcours'
import EcranChargement from '../components/EcranChargement'
import FondQuadrille from '../components/FondQuadrille'
import EnTeteFenetre from '../components/EnTeteFenetre'

interface Props {
  sessionJoinCode: string
}

type SessionInfo = {
  id: string
  title: string
  phase: string
}

export default function CollabDocScreen({ sessionJoinCode }: Props) {
  const [session,          setSession]          = useState<SessionInfo | null>(null)
  const [notFound,         setNotFound]         = useState(false)
  // Chantier 142 — identité = membre de la séance (session_members), jamais un pseudo libre.
  const [myIdentity,       setMyIdentity]       = useState<CollabIdentity | null>(null)
  const [myTableJoinCode,  setMyTableJoinCode]  = useState<string | null>(null)
  const [sources,          setSources]          = useState<CollabSource[]>([])
  // Chantier 162a — liens et sources montrés aux tables pendant les débats.
  const [shown,            setShown]            = useState<SessionShare[]>([])
  const [loading,         setLoading]          = useState(true)
  const [error,            setError]            = useState<string | null>(null)

  // ── Registration state ─────────────────────────────────────────
  const [registerPseudo,  setRegisterPseudo]  = useState('')
  const [registerCode,    setRegisterCode]    = useState('')
  const [codeOpen,        setCodeOpen]        = useState(false)
  const [registering,     setRegistering]     = useState(false)
  const [registerErr,     setRegisterErr]     = useState<string | null>(null)
  const codeInputRef = useRef<HTMLInputElement>(null)

  // ── Add / Edit source state ────────────────────────────────────
  const [showAddForm,   setShowAddForm]   = useState(false)
  const [editingSource, setEditingSource] = useState<CollabSource | null>(null)
  const [formTitle,     setFormTitle]     = useState('')
  const [formUrl,       setFormUrl]       = useState('')
  const [formContent,   setFormContent]   = useState('')
  const [formLoading,   setFormLoading]   = useState(false)
  const [formErr,       setFormErr]       = useState<string | null>(null)

  // ── Delete confirm state ───────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState<CollabSource | null>(null)
  const [deleting,      setDeleting]      = useState<string | null>(null)
  const [returnHash,    setReturnHash]    = useState('')

  // ── Init : load session + user + sources ───────────────────────
  useEffect(() => {
    async function init() {
      setLoading(true)
      setError(null)

      // Ensure anonymous auth
      let session = (await supabase.auth.getSession()).data.session
      if (!session) {
        const { data } = await supabase.auth.signInAnonymously()
        session = data.session
      }
      const uid = session?.user.id ?? null

      // Fetch session by join_code
      const { data: sessData, error: sessErr } = await supabase
        .from('sessions')
        .select('id, title, phase')
        .eq('join_code', sessionJoinCode)
        .maybeSingle()

      if (sessErr) { setError(extractErr(sessErr)); setLoading(false); return }
      if (!sessData) { setNotFound(true); setLoading(false); return }
      setSession(sessData as SessionInfo)

      // Identité : l'appareil est-il inscrit à la séance ? (chantier 142)
      if (uid) {
        try {
          setMyIdentity(await getCollabIdentity(sessData.id))
        } catch { /* non-bloquant : lecture seule, l'identification reste possible */ }
      }

      // Destination de retour transmise par l'écran appelant
      const storedReturn = sessionStorage.getItem('ecclesia_collab_return')
      if (storedReturn) {
        sessionStorage.removeItem('ecclesia_collab_return')
        setReturnHash(storedReturn)
      }

      // Lire le table_join_code transmis via sessionStorage (si navigation depuis une vue table)
      const storedTable = sessionStorage.getItem(`ecclesia_collab_table_${sessionJoinCode}`)
      if (storedTable) {
        sessionStorage.removeItem(`ecclesia_collab_table_${sessionJoinCode}`)
        setMyTableJoinCode(storedTable)
      }

      // Load sources
      try {
        const rows = await listSessionSources(sessData.id)
        setSources(rows)
      } catch (e) {
        setError(extractErr(e))
      }

      // Restitution du fil de partage des tables (vide avant la fin du débat,
      // et pour une association) — non bloquant.
      listSessionShares(sessData.id).then(setShown).catch(() => {})

      setLoading(false)
    }
    init()
  }, [sessionJoinCode])

  // ── Realtime : session_sources ─────────────────────────────────
  useEffect(() => {
    if (!session) return
    const ch = privateChannel(`collab:${session.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'session_sources', filter: `session_id=eq.${session.id}` },
        async () => {
          try {
            const rows = await listSessionSources(session.id)
            setSources(rows)
          } catch { /* non-bloquant */ }
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [session])

  // ── Identification : nom + code de rappel (chantier 142) ───────
  // Même règle que les portes d'entrée du chantier 140 : un nom inscrit ne
  // donne jamais accès à ses sources sans son code.
  const handleRegister = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session) return
    setRegistering(true)
    setRegisterErr(null)
    try {
      const code = registerCode.trim() || null
      const res = await claimCollabIdentity(session.id, registerPseudo.trim(), code)
      if (res.kind === 'ok') {
        setMyIdentity(res.identity)
        setRegisterCode('')
      } else if (res.kind === 'code_required') {
        setCodeOpen(true)
        setRegisterErr('Ce nom est inscrit à la séance : entre ton code de rappel pour le reprendre.')
        setTimeout(() => codeInputRef.current?.focus(), 0)
      } else {
        setRegisterErr(res.message)
      }
    } catch (e) {
      setRegisterErr(extractErr(e))
    } finally {
      setRegistering(false)
    }
  }, [session, registerPseudo, registerCode])

  // ── Open add form ──────────────────────────────────────────────
  // Les champs formTitle/formUrl/formContent sont intentionnellement préservés
  // pour que l'utilisateur retrouve son brouillon s'il a fermé sans soumettre.
  function openAdd() {
    setEditingSource(null)
    setFormErr(null)
    setShowAddForm(true)
  }

  // ── Open edit form ─────────────────────────────────────────────
  function openEdit(src: CollabSource) {
    setEditingSource(src)
    setFormTitle(src.title)
    setFormUrl(src.url ?? '')
    setFormContent(src.content ?? '')
    setFormErr(null)
    setShowAddForm(true)
  }

  // ── Submit source form ─────────────────────────────────────────
  const handleFormSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session) return
    setFormErr(null)
    const title   = formTitle.trim()
    const url     = formUrl.trim() || null
    const content = formContent.trim() || null
    if (url && !isSafeUrl(url)) {
      setFormErr('Lien invalide : seuls les liens http:// ou https:// sont acceptés.')
      return
    }
    setFormLoading(true)
    try {
      if (editingSource) {
        const updated = await updateCollabSource(editingSource.id, title, url, content)
        setSources(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s))
        // Les champs viennent de la source éditée, pas d'un brouillon d'ajout :
        // sans ce vidage, « + Ajouter » repartait pré-rempli avec elle.
        setFormTitle('')
        setFormUrl('')
        setFormContent('')
      } else {
        const created = await addCollabSource(session.id, title, url, content, myTableJoinCode)
        setSources(prev => [...prev, { ...created, table_join_code: myTableJoinCode }])
        // Vide le brouillon après soumission réussie
        setFormTitle('')
        setFormUrl('')
        setFormContent('')
      }
      setShowAddForm(false)
    } catch (e) {
      setFormErr(extractErr(e))
    } finally {
      setFormLoading(false)
    }
  }, [session, editingSource, formTitle, formUrl, formContent])

  // ── Delete source ──────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) return
    const target = deleteConfirm
    setDeleteConfirm(null)
    setDeleting(target.id)
    try {
      await deleteCollabSource(target.id)
      setSources(prev => prev.filter(s => s.id !== target.id))
    } catch (e) {
      setError(extractErr(e))
    } finally {
      setDeleting(null)
    }
  }, [deleteConfirm])

  // ── Render ─────────────────────────────────────────────────────

  if (loading) {
    return <EcranChargement texte="Chargement des sources…" />
  }

  if (notFound || !session) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-bleu-fonce text-creme flex flex-col items-center justify-center px-6 text-center">
        <FondQuadrille cases={10} />
        <div className="relative flex max-w-sm flex-col items-center gap-4 animate-montee">
          <div className="text-5xl" aria-hidden="true">😕</div>
          <h1 className="font-sans text-3xl font-bold tracking-[-0.02em]">Séance introuvable</h1>
          <p className="text-sm text-creme/75">{error ?? 'Séance introuvable ou lien invalide.'}</p>
          <button onClick={() => { window.location.hash = '' }} className={`mt-2 ${BOUTON_VERRE_PARCOURS}`}>
            Retour à l'accueil
          </button>
        </div>
      </div>
    )
  }

  // Group sources by table_join_code
  const grouped = groupByTable(sources)

  return (
    <PageParcours
      session={{ title: session.title, phase: session.phase as Session['phase'], organization_id: null }}
      sansEtape
      sansMenu
      largeur="large"
      sousTitre={myIdentity
        ? <>Sources collaboratives · <span className="font-semibold text-creme">{myIdentity.pseudo}</span></>
        : 'Sources collaboratives'}
      actions={<>
        <button onClick={() => { window.location.hash = returnHash || '' }} className={BOUTON_VERRE_PARCOURS}>
          Retour
        </button>
        {myIdentity && (
          <button onClick={openAdd} className={`${BOUTON_VERRE_PARCOURS} btn-verre-primaire`}>
            <span className="sm:hidden">Ajouter</span><span className="hidden sm:inline">Ajouter une source</span>
          </button>
        )}
      </>}
    >
      <div className="space-y-5">
        {error && (
          <div role="alert" className="rounded-[12px] p-3 bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between gap-2">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              aria-label="Fermer"
              className="rounded-[8px] shrink-0 p-1.5 text-red-500 hover:text-red-700 hover:bg-red-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
            >
              <IconeFermer />
            </button>
          </div>
        )}

        {/* ── Registration panel ────────────────────────────── */}
        {!myIdentity && (
          <section className={`${CARTE_PARCOURS} space-y-4`}>
            <div>
              <h2 className="font-sans text-lg font-bold tracking-[-0.01em] text-bleu-fonce mb-1">
                Ajouter vos sources
              </h2>
              <p className="text-sm text-gray-600 leading-relaxed">
                Pour contribuer, identifiez-vous avec le nom et le code de rappel de votre
                inscription à cette séance. Vous pourrez ensuite ajouter, modifier et
                supprimer vos propres sources.
              </p>
            </div>
            <form onSubmit={handleRegister} className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={registerPseudo}
                  onChange={e => setRegisterPseudo(e.target.value)}
                  placeholder="Nom prénom"
                  className={`flex-1 min-w-0 ${CHAMP}`}
                />
                <button
                  type="submit"
                  disabled={registering || !registerPseudo.trim()}
                  className="rounded-[8px] px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40
                    text-white text-sm font-semibold transition-colors focus:outline-none
                    focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2 flex items-center gap-2 shrink-0"
                >
                  {registering && <SmallSpinner />}
                  {registering ? 'Connexion…' : 'Me connecter'}
                </button>
              </div>
              <ReclaimCodeAccordion
                ref={codeInputRef}
                open={codeOpen}
                onToggle={() => setCodeOpen(o => !o)}
                code={registerCode}
                onCodeChange={setRegisterCode}
              />
            </form>
            {registerErr && (
              <p className="text-xs text-red-600">{registerErr}</p>
            )}
            <p className="text-xs text-gray-600">
              Vous pouvez parcourir les sources sans vous identifier.
              {' '}Pas encore inscrit ?{' '}
              <a href={`#session/${sessionJoinCode}`} className="font-semibold text-bleu-fonce underline decoration-bleu-fonce/40 underline-offset-4 hover:decoration-bleu-clair transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair">
                Rejoindre la séance
              </a>
            </p>
          </section>
        )}

        {/* ── Source list ───────────────────────────────────── */}
        {sources.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[12px] border border-bleu-fonce/10 bg-white px-6 py-10 text-center shadow-sm animate-montee">
            <div className="text-4xl" aria-hidden="true">📚</div>
            <p className="text-sm font-semibold text-bleu-fonce">Aucune source partagée pour l'instant.</p>
            {myIdentity && (
              <button
                onClick={openAdd}
                className="rounded-[8px] mt-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2"
              >
                Ajouter la première source
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(group => (
              <section key={group.tableJoinCode ?? '__none__'} className="animate-montee">
                {/* Group header */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-[11px] font-bold text-bleu-fonce/70 uppercase tracking-[0.16em]">
                    {group.tableJoinCode ? 'Table' : 'Non assigné à une table'}
                  </span>
                  {group.tableJoinCode && (
                    <span className="rounded-[6px] bg-indigo-50 px-2 py-0.5 text-xs font-bold tabular-nums tracking-[0.12em] text-bleu-fonce">
                      {group.tableJoinCode}
                    </span>
                  )}
                  <span className="h-px flex-1 bg-bleu-fonce/10" />
                  <span className="text-xs font-semibold tabular-nums text-gray-600">
                    {group.sources.length} source{group.sources.length > 1 ? 's' : ''}
                  </span>
                </div>

                {/* Sources in this group */}
                <div className="space-y-3">
                  {group.sources.map(src => (
                    <SourceCard
                      key={src.id}
                      source={src}
                      isOwn={!!myIdentity && src.member_id === myIdentity.member_id}
                      deleting={deleting === src.id}
                      onEdit={() => openEdit(src)}
                      onDelete={() => setDeleteConfirm(src)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* ── Chantier 162a : montrées pendant les débats ──────── */}
        {shown.length > 0 && (
          <section className="space-y-4 animate-montee">
            <div>
              <h2 className="font-sans text-lg font-bold tracking-[-0.01em] text-bleu-fonce">Montrées pendant les débats</h2>
              <p className="text-xs text-gray-600">Les liens, sources et captures partagés avec leur table.</p>
            </div>
            {groupShownByTable(shown).map(group => (
              <div key={group.joinCode} className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-bleu-fonce/70">Table</span>
                  <span className="rounded-[6px] bg-indigo-50 px-2 py-0.5 text-xs font-bold tabular-nums tracking-[0.12em] text-bleu-fonce">{group.joinCode}</span>
                  <span className="h-px flex-1 bg-bleu-fonce/10" />
                </div>
                <ul className="space-y-2">
                  {group.items.map(s => (
                    <li key={s.id} className="rounded-[12px] bg-white border border-bleu-fonce/10 px-4 py-3 shadow-sm space-y-1">
                      <p className="text-[15px] font-semibold text-gray-900 break-words">{s.title}</p>
                      <p className="text-xs font-semibold text-bleu-fonce">{s.author_pseudo}</p>
                      {s.url && isSafeUrl(s.url) && (
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-xs font-medium text-bleu-fonce underline decoration-bleu-fonce/30 underline-offset-2 hover:decoration-bleu-clair truncate focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
                        >
                          {s.url}
                        </a>
                      )}
                      {/* Chantier 162b : une capture n'est pas conservée après la séance */}
                      {s.kind === 'image' && (
                        <p className="text-xs text-gray-600">Capture d'écran, non conservée</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}
      </div>

      {/* ── Add / Edit modal ──────────────────────────────────── */}
      {showAddForm && (
        <div
          className="fixed inset-0 bg-bleu-fonce/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center z-50 p-4"
          onClick={() => setShowAddForm(false)}
        >
          <div
            className="bg-white w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl overflow-hidden rounded-[12px] ring-1 ring-white/10 animate-entree"
            onClick={e => e.stopPropagation()}
          >
            <EnTeteFenetre
              titre={editingSource ? 'Modifier la source' : 'Ajouter une source'}
              sousTitre="Visible par tous les participants de la séance."
              onClose={() => setShowAddForm(false)}
            />
            <form onSubmit={handleFormSubmit} className="overflow-y-auto p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-anthracite/80 mb-1.5">
                  Titre <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="Ex : Rapport sur le thème X"
                  className={CHAMP}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-anthracite/80 mb-1.5">
                  Lien <span className="text-gray-600 font-normal">(optionnel)</span>
                </label>
                <input
                  type="url"
                  value={formUrl}
                  onChange={e => setFormUrl(e.target.value)}
                  placeholder="https://…"
                  className={CHAMP}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-anthracite/80 mb-1.5">
                  Notes <span className="text-gray-600 font-normal">(optionnel)</span>
                </label>
                <textarea
                  value={formContent}
                  onChange={e => setFormContent(e.target.value)}
                  rows={3}
                  placeholder="Résumé, extraits pertinents, commentaire…"
                  className={`${CHAMP} resize-none`}
                />
              </div>
              {formErr && (
                <p className="text-xs text-red-600">{formErr}</p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="rounded-[8px] flex-1 py-2.5 text-sm font-semibold border border-bleu-fonce/20
                    text-bleu-fonce hover:border-bleu-fonce/40 hover:bg-bleu-fonce/[0.04] transition-colors
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="rounded-[8px] flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40
                    text-white text-sm font-semibold transition-colors
                    flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair focus-visible:ring-offset-2"
                >
                  {formLoading && <SmallSpinner />}
                  {formLoading ? 'Enregistrement…' : (editingSource ? 'Modifier' : 'Ajouter')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete confirm ────────────────────────────────────── */}
      {deleteConfirm && (
        <ConfirmModal
          title="Supprimer la source"
          body={`Supprimer définitivement « ${deleteConfirm.title} » ? Cette action est irréversible.`}
          confirmLabel="Supprimer"
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </PageParcours>
  )
}

const CHAMP = `rounded-[8px] w-full px-3 py-2.5 text-sm border border-bleu-fonce/20
  focus:outline-none focus:ring-2 focus:ring-bleu-clair/40 focus:border-bleu-fonce
  placeholder:text-anthracite/40 transition-shadow`

function IconeFermer() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}

// ── SourceCard ─────────────────────────────────────────────────────

function SourceCard({
  source, isOwn, deleting, onEdit, onDelete,
}: {
  source: CollabSource
  isOwn: boolean
  deleting: boolean
  onEdit(): void
  onDelete(): void
}) {
  const date = new Date(source.created_at).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <div className={`rounded-[12px] bg-white border px-4 py-3.5 space-y-2 shadow-sm transition-colors ${
      isOwn ? 'border-indigo-300 ring-1 ring-indigo-100' : 'border-bleu-fonce/10'
    }`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-bleu-fonce">{source.pseudo}</span>
            <span className="whitespace-nowrap text-xs text-gray-600">· {date}</span>
            {isOwn && <span className="rounded-[6px] bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-bleu-fonce">Ta source</span>}
          </div>
          <p className="text-[15px] font-semibold text-gray-900 mt-1 leading-snug">{source.title}</p>
        </div>
        {isOwn && (
          <div className="shrink-0 flex items-center gap-1">
            <button
              onClick={onEdit}
              title="Modifier"
              aria-label="Modifier"
              className="rounded-[8px] p-2 text-gray-500 hover:text-bleu-fonce hover:bg-indigo-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button
              onClick={onDelete}
              disabled={deleting}
              title="Supprimer"
              aria-label="Supprimer"
              className="rounded-[8px] p-2 text-gray-500 hover:text-red-600 hover:bg-red-50
                transition-colors disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
            >
              {deleting ? (
                <SmallSpinner className="text-red-400" />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              )}
            </button>
          </div>
        )}
      </div>

      {/* URL */}
      {source.url && (
        isSafeUrl(source.url) ? (
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-bleu-fonce underline decoration-bleu-fonce/30 underline-offset-2 hover:decoration-bleu-clair focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="shrink-0" aria-hidden="true"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            <span className="truncate">{source.url}</span>
          </a>
        ) : (
          <p className="text-xs text-red-600 truncate" title={source.url}>
            ⚠ Lien non affiché (schéma non autorisé)
          </p>
        )
      )}

      {/* Content */}
      {source.content && (
        <p className="rounded-[8px] bg-gray-100 px-3 py-2 text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
          {source.content}
        </p>
      )}
    </div>
  )
}

// ── groupByTable ───────────────────────────────────────────────────

type SourceGroup = { tableJoinCode: string | null; sources: CollabSource[] }

function groupByTable(sources: CollabSource[]): SourceGroup[] {
  const map = new Map<string, CollabSource[]>()
  const order: (string | null)[] = []

  for (const src of sources) {
    const key = src.table_join_code ?? '__none__'
    if (!map.has(key)) {
      map.set(key, [])
      order.push(src.table_join_code)
    }
    map.get(key)!.push(src)
  }

  // Sort: tables first (alphabetically), then "non assigné"
  const withTable   = order.filter((k): k is string => k !== null).sort()
  const withoutTable = order.includes(null) ? [null] : []

  return [...withTable, ...withoutTable].map(key => ({
    tableJoinCode: key,
    sources: map.get(key ?? '__none__') ?? [],
  }))
}

// ── groupShownByTable (chantier 162a) ──────────────────────────────

function groupShownByTable(rows: SessionShare[]): { joinCode: string; items: SessionShare[] }[] {
  const map = new Map<string, SessionShare[]>()
  for (const r of rows) {
    const list = map.get(r.join_code) ?? []
    list.push(r)
    map.set(r.join_code, list)
  }
  return Array.from(map, ([joinCode, items]) => ({ joinCode, items }))
}

// ── SmallSpinner ───────────────────────────────────────────────────

function SmallSpinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`w-3.5 h-3.5 animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  )
}
